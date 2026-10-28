# 08 — Observability

You cannot run a service you cannot see. Three signals, all emitted from Rust via
`tracing` + `metrics`:

| Signal | Tool | Answers |
|---|---|---|
| **Metrics** | `metrics` crate → Prometheus → Grafana | *How much / how fast / how often?* (aggregates) |
| **Traces** | `tracing` + OpenTelemetry → Jaeger | *Where did this one slow request spend its time?* |
| **Logs** | `tracing-subscriber` JSON → files (Loki optional) | *What exactly happened?* (events with context) |

Every log line and span carries `request_id`, `org_id`, `model_id`, so a support
ticket quoting `x-request-id` leads straight to the trace and logs.

## Key metrics

### Gateway
| Metric | Type | Labels |
|---|---|---|
| `gateway_requests_total` | counter | model, status_code, error_type |
| `gateway_request_duration_seconds` | histogram | model, stream |
| `gateway_ttft_seconds` | histogram | model |
| `gateway_output_tokens_per_second` | histogram | model |
| `gateway_tokens_total` | counter | model, kind (input/cached/output) |
| `gateway_ratelimit_rejections_total` | counter | dimension (rpm/itpm/otpm/concurrency) |
| `gateway_auth_failures_total` | counter | reason |
| `gateway_inflight_requests` | gauge | model |

Org id is **not** a Prometheus label (unbounded cardinality kills Prometheus).
Per-org numbers come from `usage_daily` in Postgres instead.

### Scheduler
`scheduler_queue_depth{model,priority}`, `scheduler_queue_wait_seconds`,
`scheduler_rejections_total{reason}`, `scheduler_workers_healthy{model}`.

### Worker
`worker_running_seqs`, `worker_waiting_seqs`, `worker_kv_blocks_free`,
`worker_kv_cache_usage_ratio`, `worker_prefix_cache_hit_ratio`,
`worker_prefill_tokens_total`, `worker_decode_tokens_total`,
`worker_batch_size` (histogram).

### GPU
`nvidia_gpu_exporter` (a small exporter that wraps `nvidia-smi`, works on Windows
laptops; DCGM needs datacenter GPUs): utilization %, memory used, temperature,
power draw, clock throttling. A laptop GPU **throttles when hot** — this is where
you will see it.

## Dashboards (provisioned Grafana JSON in `deploy/grafana/`)

1. **API overview** — RPS, error rate by type, p50/p95/p99 latency and TTFT, tokens/s.
2. **Capacity** — queue depth, wait time, rejections, KV cache usage, running seqs,
   GPU util/memory/temperature.
3. **Business** — tokens and revenue per model per hour (from Postgres datasource).

The console's operator panel shows a subset of this live (doc 10), so day-to-day
you do not need to open Grafana.

## SLOs and alerts

| SLO | Target | Alert when |
|---|---|---|
| Availability (share of requests not failing with 5xx) | 99.5% / 30 days | Burn rate > 10× over 1 h |
| TTFT p95 (interactive, ≤2k input tokens) | < 1.5 s | > 3 s for 10 min |
| Usage pipeline lag | < 60 s | > 5 min (billing at risk) |
| Spill file non-empty | — | any (event bus degraded) |
| GPU temperature | — | > 85 °C for 5 min |
| Worker heartbeat | — | any worker down > 1 min |

Alerts go to Grafana alerting → a webhook (Telegram/Discord/email).

## Status page

A public, unauthenticated page in the console (`/status`) fed by a **synthetic
prober**: every 60 s it sends a tiny real request per model using an internal key
and records success + latency. Shows per-model status (operational / degraded /
outage), 90-day uptime bars, and incident notes written by the operator. Synthetic
traffic is excluded from customer usage.

## Tracing a request

```
gateway: POST /v1/chat/completions                       7.42 s
├─ auth                                                   0.3 ms   (cache hit)
├─ tokenize                                               1.1 ms
├─ ratelimit.check (redis)                                0.6 ms
├─ quota.check                                            0.2 ms
├─ scheduler.submit                                       7.41 s
│  ├─ queue.wait                                          0.12 s
│  └─ worker.generate (worker-gpu-0)                      7.29 s
│     ├─ prefill (1240 tokens, 1024 cached)               0.06 s
│     └─ decode (312 tokens)                              7.23 s   (43 tok/s)
└─ usage.emit                                             0.4 ms
```

Trace context propagates over gRPC metadata (W3C `traceparent`), so gateway,
scheduler and worker spans join into one trace.
