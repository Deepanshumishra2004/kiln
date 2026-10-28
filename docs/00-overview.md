# 00 — Overview

## Goal

Build a working LLM API business in miniature:

1. Run a quantized open-weights model on this PC's GPU.
2. Put a production-style **API gateway** in front of it.
3. Hand **API keys** to other people; they use the model with the normal OpenAI SDK.
4. See **every request, token and cost**, and **limit** each key/project/org.
5. Do it the way OpenAI/Anthropic do it, in **Rust**, end to end.

Non-goals (things real providers have that a laptop cannot): multi-region GPU fleets,
24/7 on-call, SOC 2 / GDPR certification, training models. The design leaves room
for them, but we do not build them.

## How a commercial LLM provider is structured

Every major provider has the same five layers. Names differ; the jobs do not.

```
 ┌──────────────┐   Customers call an HTTPS API with an API key
 │   Clients    │
 └──────┬───────┘
        ▼
 ┌──────────────┐   TLS termination, DDoS protection, global load balancing
 │     Edge     │   (Cloudflare / cloud LB)
 └──────┬───────┘
        ▼
 ┌──────────────┐   Authentication, rate limits, quotas, request validation,
 │   Gateway    │   routing, streaming, usage metering.  Stateless, horizontally scaled.
 └──────┬───────┘
        ▼
 ┌──────────────┐   Queues per model, priority + fairness between customers,
 │  Scheduler   │   admission control (reject when overloaded), worker selection
 └──────┬───────┘
        ▼
 ┌──────────────┐   GPUs running an inference engine (vLLM, TensorRT-LLM, SGLang,
 │  Inference   │   custom). Continuous batching, paged KV cache, prefix caching.
 └──────────────┘

 Side systems:  Postgres (accounts, keys, billing)   Redis (rate-limit counters, caches)
                Event stream (usage events)          Analytics DB (usage at scale)
                Console (web UI)                     Observability (metrics, traces, logs)
                Trust & safety (moderation, abuse)   Billing (Stripe, invoices)
```

The key insight: **the model is only one box.** Most of the engineering in an API
business is everything around it — identity, limits, money, fairness, reliability
and visibility. That is what this project is mostly about.

## What we build (mapping)

| Real provider | This project |
|---|---|
| Global edge | Cloudflare Tunnel (free TLS, no open ports on the PC) |
| Gateway fleet | `gateway` crate (axum), 1 instance, stateless so it *could* scale |
| Scheduler | `scheduler` crate (tonic gRPC) |
| GPU fleet | `inference-worker` crate (mistral.rs) — 1 GPU worker + 1 CPU worker |
| Accounts / billing DB | Postgres |
| Rate-limit store | Redis |
| Usage event bus | Apache Iggy (Rust message streaming) — Postgres outbox before that |
| Analytics DB | Postgres rollups (ClickHouse optional later) |
| Console | `console` crate (Leptos, Rust full-stack web) |
| Observability | Prometheus + Grafana + Jaeger, fed by `tracing`/OpenTelemetry |

"All Rust" means **all code we write is Rust**: gateway, scheduler, workers, the
inference engine itself (`mistral.rs` / `candle` are Rust), and the web console
(Leptos). Databases (Postgres, Redis) are off-the-shelf infrastructure — real
providers also do not write their own databases.

## Glossary

| Term | Meaning |
|---|---|
| **Token** | Unit of text the model reads/writes (~¾ of an English word). Everything is billed and limited in tokens. |
| **Input / prompt tokens** | Tokens sent to the model (system prompt + conversation). |
| **Output / completion tokens** | Tokens the model generates. Usually priced 3–5× higher than input. |
| **Cached input tokens** | Input tokens whose KV cache was reused from an earlier request with the same prefix. Cheaper to serve, so cheaper to bill. |
| **Quantization** | Storing model weights in fewer bits (e.g. 4 instead of 16) to fit in less VRAM. See doc 01. |
| **KV cache** | Per-request GPU memory holding attention keys/values for every token so far. Grows with context length; often the real limit on concurrency. |
| **Prefill** | Processing the whole prompt at once (compute-bound, fast per token). |
| **Decode** | Generating output one token at a time (memory-bandwidth-bound). |
| **TTFT** | Time To First Token — latency until streaming starts. The number users feel. |
| **TPOT / ITL** | Time Per Output Token / Inter-Token Latency — streaming speed. |
| **Continuous batching** | Engine adds/removes requests from the running GPU batch every step instead of waiting for a whole batch to finish. Main reason serving is cheap. |
| **RPM / TPM** | Requests / Tokens Per Minute — rate-limit dimensions. |
| **ITPM / OTPM** | Input / Output Tokens Per Minute — limited separately (Anthropic style). |
| **Org → Project → Key** | Tenancy hierarchy. Billing at org, isolation at project, auth at key. |
| **Admission control / load shedding** | Rejecting requests early (503) when the system is full instead of letting queues grow forever. |
| **Idempotency** | Processing the same event/request twice has the same effect as once. Essential for billing. |
| **SSE** | Server-Sent Events — the `text/event-stream` format used to stream tokens. |
