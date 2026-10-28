# 02 — Architecture

## Component diagram

```
                       Internet
                          │  HTTPS
                ┌─────────▼──────────┐
                │ Cloudflare Tunnel  │  TLS, DDoS, no open ports on the PC
                └─────────┬──────────┘
          api.example.com │                    console.example.com
                ┌─────────▼──────────┐         ┌───────────────────┐
                │      gateway       │         │      console      │  Leptos SSR
                │  axum · :8080      │         │   :3000           │
                └──┬─────┬────────┬──┘         └─────────┬─────────┘
                   │     │        │                      │ HTTP/JSON
      key cache,   │     │ gRPC   │ usage events ┌───────▼─────────┐
      rate limits  │     │        │              │    admin-api    │  axum · :8081
            ┌──────▼─┐   │        │              └───┬─────────┬───┘
            │ Redis  │◄──┼────────┼──────────────────┘         │
            └────────┘   │        │                            │
                ┌────────▼─────┐  │   ┌──────────────┐   ┌─────▼──────┐
                │  scheduler   │  └──►│ Iggy stream  │──►│ usage-     │
                │ tonic :50051 │      │ (usage.v1)   │   │ worker     │
                └──┬────────┬──┘      └──────────────┘   └─────┬──────┘
           gRPC    │        │ gRPC                             │
      ┌────────────▼──┐  ┌──▼────────────┐              ┌──────▼──────┐
      │ worker-gpu    │  │ worker-cpu    │              │  Postgres   │
      │ qwen3-4b      │  │ qwen3-1.7b    │              │  :5432      │
      │ mistral.rs    │  │ mistral.rs    │              └─────────────┘
      │ CUDA · :50061 │  │ CPU · :50062  │
      └───────────────┘  └───────────────┘

  Every Rust service → /metrics (Prometheus) and OTLP traces (Jaeger) → Grafana
```

## Components and responsibilities

| Component | Crate | Responsibilities | State |
|---|---|---|---|
| **gateway** | `crates/gateway` | Public `/v1` API. Parse & validate, authenticate key, rate limit, quota check, tokenize input, call scheduler, stream SSE, emit usage event, set response headers. | Stateless (caches only) |
| **scheduler** | `crates/scheduler` | Worker registry (heartbeats), per-model priority queues, fair share across orgs, admission control, dispatch, cancellation propagation. | In-memory (rebuilt from heartbeats) |
| **inference-worker** | `crates/inference-worker` | Embeds mistral.rs, loads one model, runs continuous batching, streams tokens over gRPC, reports capacity (free KV blocks, running seqs). | Model in VRAM/RAM |
| **usage-worker** | `crates/usage-worker` | Consumes usage events, prices them, writes `usage_events`, debits `credit_ledger`, updates daily rollups, triggers spend alerts. Idempotent. | Stateless |
| **admin-api** | `crates/admin-api` | Backend for the console: orgs, projects, members, keys, limits, pricing, usage queries, audit log. Also exposes the programmatic Admin API (admin keys). | Stateless |
| **console** | `crates/console` | Leptos web app: operator panel + customer console. Talks only to admin-api. | Stateless |
| **common** | `crates/common` | Shared types, error enums, config loading, key format/hashing, telemetry setup. | — |
| **proto** | `crates/proto` | `.proto` definitions + tonic codegen for scheduler/worker RPC. | — |

Why separate services instead of one binary: each can be restarted, scaled and
reasoned about independently — the gateway can be redeployed without unloading the
model; a slow analytics query cannot stall the API. On this one PC they all run side
by side; in a real deployment each would be its own fleet.

## End-to-end request lifecycle

`POST /v1/chat/completions`, `stream: true`, key `sk-live-...`:

```
 client        gateway                   redis    scheduler      worker-gpu     iggy → usage-worker → pg
   │  request     │                        │          │               │                │
   │─────────────►│ 1 assign request_id (UUIDv7), start trace span
   │              │ 2 parse + validate body (model, messages, max_tokens ≤ limit)
   │              │ 3 auth: sha256(key) → moka cache → miss? → Postgres
   │              │      key active? project/org active? model allowed?
   │              │ 4 resolve model alias → model id → worker pool
   │              │ 5 tokenize input (tokenizers crate) → input_tokens
   │              │ 6 rate limit (one Lua call, atomic):
   │              │──────────────────────►│ RPM −1, ITPM −input, OTPM −max_tokens (reserve),
   │              │◄──────────────────────│ concurrency +1   → allow / deny(+retry_after)
   │              │ 7 quota: org balance > 0 and month spend < hard cap (Redis mirror)
   │              │ 8 Submit(request) ─────────────────►│
   │              │                        │          │ 9 enqueue (model, priority, org)
   │              │                        │          │   admission: est. wait > budget → reject
   │              │                        │          │10 pick worker with free KV ───►│
   │              │                        │          │               │11 prefill, then decode
   │◄─ SSE chunk ─│◄──────── token stream (gRPC server-streaming) ────│   (continuous batch)
   │◄─ SSE chunk ─│ ...                    │          │               │
   │◄─ [DONE] ────│◄── final: usage{in, cached, out}, finish_reason ──│
   │              │12 reconcile rate limit: refund (max_tokens − out) to OTPM, concurrency −1
   │              │13 emit UsageEvent{request_id, ...} ──────────────────────────────────►│
   │              │14 record metrics (TTFT, tok/s, status), end span     15 price → insert
   │              │                                                         (ON CONFLICT DO
   │              │                                                          NOTHING) → debit
   │              │                                                          ledger → rollup
```

Failure paths that real systems handle and we must too:

| Situation | Behaviour |
|---|---|
| Client disconnects mid-stream | Gateway drops the gRPC stream → scheduler cancels → worker frees the sequence's KV cache. Tokens generated so far **are billed**. |
| Rate limit exceeded | 429 `rate_limit_error`, `retry-after` header, nothing queued. |
| Out of credit / hard cap hit | 429 `insufficient_quota` (OpenAI-compatible code). |
| Queue too long | 503 `overloaded_error` immediately (load shedding). Never queue unboundedly. |
| Worker crashes mid-request | Scheduler sees stream error → gateway sends an SSE `error` event; usage billed for tokens already delivered. Worker heartbeat lost → removed from pool. |
| Usage event bus down | Gateway writes the event to a local append-only spill file; replayed on recovery. Billing data is never dropped. |

## Tech stack

| Concern | Choice |
|---|---|
| Async runtime | `tokio` |
| HTTP server | `axum` + `tower` / `tower-http` (timeouts, body limits, tracing, CORS) |
| Internal RPC | `tonic` (gRPC) + `prost` |
| Inference | `mistralrs` (built on `candle`), CUDA feature for the GPU worker |
| Tokenizer | `tokenizers` (Hugging Face, Rust) — same tokenizer file as the model |
| Postgres | `sqlx` (compile-time checked queries, migrations) |
| Redis | `redis` crate with `deadpool-redis` (or `fred`) + Lua scripts |
| In-process cache | `moka` |
| Event stream | Apache Iggy (Rust) via `iggy` client crate |
| Serialization | `serde`, `serde_json` |
| IDs | `uuid` v7 (time-ordered) |
| Crypto | `sha2`, `hmac`, `argon2` (passwords), `rand`, `crc32fast` (key checksum) |
| Config | `figment` (TOML + env vars) |
| Errors | `thiserror` (libs), `anyhow` (binaries) |
| Telemetry | `tracing`, `tracing-subscriber`, `opentelemetry-otlp`, `metrics` + `metrics-exporter-prometheus` |
| Web console | `leptos` (SSR + hydration) with `leptos_axum`, built with `cargo-leptos` |
| Payments (later) | `async-stripe` (Stripe test mode) |
| Infra (not our code) | Postgres 16, Redis 7, Apache Iggy, Prometheus, Grafana, Jaeger, cloudflared |

## Repository layout

```
infra/
├─ Cargo.toml                 # [workspace]
├─ README.md
├─ docs/                      # this documentation
├─ config/
│  ├─ default.toml            # shared defaults
│  ├─ gateway.toml  scheduler.toml  worker-gpu.toml  worker-cpu.toml ...
├─ crates/
│  ├─ common/
│  ├─ proto/                  # scheduler.proto, worker.proto
│  ├─ gateway/
│  ├─ scheduler/
│  ├─ inference-worker/
│  ├─ usage-worker/
│  ├─ admin-api/
│  └─ console/
├─ migrations/                # sqlx migrations (0001_init.sql, ...)
├─ deploy/
│  ├─ docker-compose.yml      # postgres, redis, iggy, prometheus, grafana, jaeger
│  ├─ prometheus.yml
│  ├─ grafana/                # provisioned dashboards
│  └─ cloudflared/config.yml
├─ scripts/                   # dev helpers (seed data, load test)
└─ models/                    # downloaded / quantized weights (git-ignored)
```

## Ports

| Service | Port |
|---|---|
| gateway (public API) | 8080 |
| admin-api | 8081 |
| console | 3000 |
| scheduler gRPC | 50051 |
| worker-gpu / worker-cpu gRPC | 50061 / 50062 |
| Each Rust service `/metrics` | 9100–9106 |
| Postgres / Redis | 5432 / 6379 |
| Iggy | 8090 (TCP) |
| Prometheus / Grafana / Jaeger UI | 9090 / 3001 / 16686 |

Only the gateway and console are exposed through the Cloudflare Tunnel. Workers,
databases and the scheduler bind to `127.0.0.1` only.
