# 07 — Inference & scheduling

## How LLM inference works (what the worker does)

A chat request becomes one long token sequence (chat template applied: system,
user, assistant turns with special tokens). Generation has two phases:

```
 PREFILL  — all prompt tokens go through the model in one big parallel pass.
            Fills the KV cache for every prompt token. Compute-bound.
            Its duration ≈ TTFT.

 DECODE   — one new token per step. Each step reads ALL weights from VRAM once and
            appends one K/V entry per layer. Memory-bandwidth-bound.
            Repeats until EOS, a stop sequence, or max_tokens.
```

Because decode is limited by reading weights, generating for **8 sequences in one
step costs almost the same as for 1** — the weights are read once and applied to
all of them. That is why batching is the single most important serving trick.

### Continuous batching

Static batching waits for all sequences in a batch to finish, wasting the slots of
short answers. **Continuous batching** re-forms the batch every decode step: finished
sequences leave, waiting ones join immediately (their prefill is interleaved).
mistral.rs implements this; our worker feeds it requests and drains token streams.

### Paged KV cache

KV memory is split into fixed blocks (e.g. 16 tokens each), allocated on demand
like OS virtual-memory pages instead of reserving `context_window` up front per
request. Result: no fragmentation, and memory is only used by tokens that exist.
The number of **free blocks** is the worker's true capacity signal, and it is what
the scheduler uses to decide whether another request fits.

On our GPU: ~900 MiB / 144 KiB per token ≈ 6,200 tokens (FP16 KV) ≈ ~390 blocks of 16.

### Prefix caching

If a new request starts with the same tokens as a recent one (same long system
prompt, multi-turn chat resending history), the KV blocks for that prefix are
reused instead of recomputed. This cuts TTFT and is why providers bill
**cached input tokens** cheaper. The worker reports `cached_input_tokens` in usage.

## inference-worker

One process per model. Embeds mistral.rs as a library.

```
 inference-worker (worker-gpu)
 ├─ load model:  GGUF Q4_K_M  or  safetensors + ISQ Q4K  (→ save UQFF for fast restarts)
 ├─ engine:      mistral.rs runner, paged attention, KV cache dtype f16 | q8
 ├─ gRPC server (tonic):
 │    Generate(GenerateRequest) → stream GenerateEvent      server-streaming
 │    Health() → WorkerStatus
 ├─ heartbeat loop → scheduler.Register / Heartbeat every 1 s
 │    {worker_id, model_id, max_seqs, running_seqs, waiting_seqs,
 │     kv_blocks_total, kv_blocks_free, tokens_per_sec_ewma}
 └─ /metrics
```

```protobuf
// crates/proto/worker.proto (abridged)
service Worker {
  rpc Generate(GenerateRequest) returns (stream GenerateEvent);
  rpc Health(HealthRequest) returns (WorkerStatus);
}
message GenerateRequest {
  string request_id = 1;
  repeated ChatMessage messages = 2;   // worker applies the chat template
  uint32 max_tokens = 3;
  float temperature = 4;  float top_p = 5;
  repeated string stop = 6;
  optional uint64 seed = 7;
}
message GenerateEvent {
  oneof event {
    TokenDelta delta = 1;    // text fragment
    Finished finished = 2;   // finish_reason + Usage{input, cached_input, output}
    WorkerError error = 3;
  }
}
```

Cancellation: when the gRPC stream is dropped by the caller, tonic cancels the
handler future; the worker's drop guard tells the engine to abort that sequence and
free its KV blocks. Without this, disconnected clients keep burning GPU — a classic
production bug.

Timeouts: a server-side max generation time (e.g. 10 min) and a stall detector (no
token for 30 s → abort + error).

## Scheduler

The gateway never talks to workers directly. The scheduler sits between them, like
the routing/queueing tier at real providers.

```
            Submit(request, org, priority)
                        │
         ┌──────────────▼─────────────────┐
         │ per-model queues               │
         │  interactive ▸ [org A: r1 r4]  │  ← one sub-queue per org
         │               [org B: r2]      │     (fair share across orgs)
         │  batch       ▸ [org C: r3 …]   │  ← only when interactive is empty
         └──────────────┬─────────────────┘
                        │ dispatch when a worker has capacity
                        ▼
              pick worker for model: most free KV blocks
              (later: prefix-cache affinity — same system prompt → same worker)
```

### Admission control & load shedding

Every queued request has a cost (its tokens) and a deadline. On `Submit`:

```
estimated_wait = queued_tokens_ahead / pool_throughput_tokens_per_sec
if queue_len ≥ max_queue_len  or  estimated_wait > max_wait (e.g. 30 s interactive):
    reject → gateway returns 503 overloaded_error (retry-after = estimated_wait)
```

Rejecting fast is kinder than accepting and timing out after 60 s. An unbounded
queue under overload means *every* request becomes slow, not just the excess.

### Fairness

Without it, one org sending 100 requests starves everyone else. **Deficit round
robin** over org sub-queues: each org gets a quantum of tokens per round
(optionally weighted by tier); the scheduler cycles orgs and dispatches from the
next org with enough deficit. A heavy user then only slows themselves down.

### Priority classes

| Class | Source | Behaviour |
|---|---|---|
| `interactive` | normal API calls | Always served first, strict wait budget |
| `batch` | Batch API (phase 6) | Fills idle capacity; may wait hours; 50% price because it uses GPU time that would otherwise be idle |

### Capacity check before dispatch

A request fits a worker if
`kv_blocks_free ≥ ceil((input_tokens + max_tokens) / block_size)` (conservative) and
`running_seqs < max_seqs`. Requests that cannot fit anywhere wait in the queue; ones
that can **never** fit (bigger than a whole worker) are rejected at the gateway with
`context_length_exceeded`.

### Worker health & failover

- Heartbeat missed for 3 s → worker marked unhealthy, no new dispatches.
- In-flight streams on a dead worker fail; the gateway reports an SSE error. We do
  **not** auto-retry mid-stream (the client already received partial output).
- Requests not yet started can be re-dispatched to another worker for the same model.
- Overflow routing (optional): if `qwen3-4b` is overloaded and the caller set
  `"fallback": "qwen3-1.7b"` (our extension), route to the CPU worker.

## Model lifecycle (how providers ship model versions)

1. Add model to registry with status `preview`; only allow-listed orgs may call it.
2. Run evals (a fixed prompt set with expected properties) against the new
   weights/quantization; compare to the current model.
3. **Canary**: route a small % of `default`-alias traffic to it; watch error rate,
   latency and eval scores.
4. Promote: move the alias. Pinned ids keep working unchanged.
5. Deprecate old id with an announced `retires_at`; emit a `deprecation` response
   header; retire after the date (404 `model_not_found` with a helpful message).
