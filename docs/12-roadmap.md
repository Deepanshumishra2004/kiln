# 12 — Roadmap

Each phase ends with something that runs and can be demonstrated. Later phases
change transports and add features, but do not rewrite earlier layers.

## Phase 0 — Environment & engine spike

Prove the riskiest assumption first: a quantized model serving on this GPU, in Rust,
on Windows.

- Install everything in doc 11 (steps 1–4).
- Tiny binary using `mistralrs`: load Qwen3-4B-Instruct-2507 at Q4 (try GGUF Q4_K_M
  and ISQ Q4K), generate a streamed answer.
- Measure: VRAM used, TTFT for a 1k-token prompt, single-stream tok/s, aggregate
  tok/s with 4 concurrent requests, max total context before OOM, FP16 vs Q8 KV cache.
- Same for Qwen3-1.7B on CPU.
- Check for newer small models with better quality at the same size.

**Done when:** numbers are recorded in `docs/benchmarks.md` and the model choice is
confirmed or changed.

## Phase 1 — Core API (MVP)

- Cargo workspace, `common`, `proto`, config, telemetry setup.
- `docker-compose.yml` with Postgres + Redis; migration `0001_init.sql` (doc 03).
- `inference-worker` with gRPC `Generate` + heartbeat.
- `scheduler`: registry, one FIFO queue per model, dispatch, cancellation.
- `gateway`: `/v1/chat/completions` (stream + non-stream), `/v1/models`, key auth
  with cache, RPM/ITPM/OTPM token buckets with reserve/refund, OpenAI error format
  and rate-limit headers, `x-request-id`.
- Usage via `usage_outbox` + `usage-worker` → `usage_events`, `usage_daily`.
- CLI seed script: create org, project, key.

**Done when:** the official OpenAI Python SDK streams from `qwen3-4b` with a key;
a second key is rate limited with correct 429 + `retry-after`; killing the client
mid-stream frees the GPU sequence and still records usage.

## Phase 2 — Console & admin API

- `admin-api`: orgs, projects, members, keys (create/revoke with pub/sub
  invalidation), limits, usage queries, audit log.
- `console` (Leptos): login + MFA, keys, usage charts, limits, members, playground;
  operator pages: organizations, live requests, capacity.

**Done when:** you can create an org and key in the UI, give the key to someone,
watch their requests live, lower their limit and see it take effect immediately,
and revoke the key in under a second.

## Phase 2b — Tool calling & our own agent

- Tool calling in worker + gateway (`tools`, `tool_choice`, streamed `tool_calls`),
  JSON argument validation / constrained decoding.
- Prefix caching enabled and reported as `cached_tokens`.
- `x-session-id` header → `usage_events.session_id`; per-session view in the console.
- `crates/agent`: Rust CLI agent with fs/search/shell tools, permissions,
  context compaction (doc 13).

**Done when:** the agent, using a key issued from the console, completes a small
coding task in a sample repo, and the console shows that run's requests, tokens and
cost grouped under one session.

## Phase 3 — Real metering & billing

- Model price table (versioned), cost calculation, append-only `credit_ledger`,
  `org_balances`, quota mirror in Redis, spend caps, alerts at 50/80/100%.
- Replace outbox with Apache Iggy stream + consumer group; local spill file.
- Nightly reconciliation job.
- Usage tiers + daily auto-promotion.

**Done when:** an org with $0.01 credit gets `insufficient_quota` at the right
moment; killing the usage-worker mid-batch and restarting yields no lost and no
duplicated charges (verified by reconciliation).

## Phase 4 — Production-grade scheduling

- Priority classes, per-org deficit round robin, admission control with 503 +
  `retry-after`, KV-capacity-aware dispatch, worker health/failover, CPU overflow
  routing, concurrency limits with leases.
- Load-test tool (`scripts/loadtest`, Rust, using `reqwest`): many orgs, mixed
  prompt lengths.

**Done when:** under a load test where one org floods requests, other orgs' p95 TTFT
stays within SLO, and excess load is shed with 503 instead of timing out.

## Phase 5 — Observability & public access

- Prometheus metrics in every service, OpenTelemetry traces across gRPC, Grafana
  dashboards and alerts, GPU exporter.
- Synthetic prober + public status page.
- Cloudflare Tunnel for `api.` and `console.` hostnames.

**Done when:** a friend uses the API over the internet with a key you issued, and you
can follow one of their requests from the console to its trace in Jaeger.

## Phase 6 — Advanced provider features

Pick in any order:

- **Cached-token pricing** (prefix caching itself lands in phase 2b).
- **JSON / structured output** mode (`response_format`).
- **Server-side agents** (`/v1/agent_runs`, sandboxed tools) — doc 13.
- **Batch API** (`/v1/files`, `/v1/batches`): async jobs in the `batch` priority class, 50% price.
- **Embeddings** endpoint (candle, CPU).
- **Stripe** test-mode top-ups, webhooks, auto-recharge.
- **Leak/abuse anomaly detection**, moderation classifier, secret-scanning endpoint.
- **Model lifecycle**: preview models, canary routing via alias weights, deprecation headers.
- Optional: ClickHouse for usage analytics at scale; Anthropic-style `/v1/messages` endpoint.

## Still out of scope (and why)

| Real-provider capability | Why not here |
|---|---|
| Multi-GPU tensor parallelism, large models | One 4 GB GPU |
| Multi-region, global load balancing | One machine |
| Training / fine-tuning service | Different problem; needs far more compute |
| Compliance certifications (SOC 2, ISO 27001, GDPR DPA) | Process and legal work, not code |
| 24/7 on-call | It's a laptop |
