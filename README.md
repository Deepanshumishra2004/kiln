# Kiln — a self-hosted LLM API platform

A from-scratch, all-Rust replica of how commercial LLM providers (OpenAI, Anthropic)
serve models: an inference engine on a GPU, an API gateway that issues and enforces
API keys, rate limits, quotas and billing, and an admin console to watch and control
everything.

It runs on one laptop, but every component is designed the way it would be in
production, so that each piece can be understood (and later scaled) on its own.

## Learn site (start here)

`learn/` is an interactive, multi-page course that teaches the whole project from
first principles — Rust, how computers and GPUs work, how LLMs work inside, and every
platform component — with visual simulations on every page.

```powershell
cd learn
npm install
npm run dev     # open http://localhost:5173
```

## Documentation

Read in order — each document builds on the previous one.

| # | Document | What you learn |
|---|----------|----------------|
| 00 | [Overview](docs/00-overview.md) | Goals, how big providers work, glossary |
| 01 | [Hardware, models & quantization](docs/01-hardware-models-quantization.md) | What this PC can run, VRAM math, quantization, chosen models |
| 02 | [Architecture](docs/02-architecture.md) | Components, end-to-end request lifecycle, tech stack, repo layout |
| 03 | [Data model](docs/03-data-model.md) | Postgres schema: orgs, projects, keys, pricing, usage, ledger, audit |
| 04 | [API specification](docs/04-api.md) | Public `/v1` API, streaming, errors, headers, admin API |
| 05 | [Auth, rate limits & quotas](docs/05-auth-rate-limits-quotas.md) | API keys, token buckets, reservations, tiers, spend caps |
| 06 | [Metering & billing](docs/06-metering-billing.md) | Usage events, idempotency, pricing, credit ledger |
| 07 | [Inference & scheduling](docs/07-inference-scheduling.md) | Engine, KV cache, batching, queues, fairness, load shedding |
| 08 | [Observability](docs/08-observability.md) | Metrics, tracing, logs, SLOs, status page |
| 09 | [Security & trust](docs/09-security-trust.md) | Key safety, leak detection, abuse, audit logs, data retention |
| 10 | [Console (dashboard)](docs/10-console.md) | Operator admin panel and customer console |
| 11 | [Dev setup](docs/11-dev-setup.md) | Installing everything on this machine |
| 12 | [Roadmap](docs/12-roadmap.md) | Build phases with acceptance criteria |
| 13 | [Our own AI agent](docs/13-agent.md) | Agent loop, tool calling, Rust CLI agent using platform keys |

## One-paragraph summary

A client sends `POST /v1/chat/completions` with `Authorization: Bearer sk-live-...`.
The **gateway** (axum) hashes the key and resolves it to an org/project, checks
**rate limits** in Redis, checks the **credit balance / spend cap**, and hands the
request to the **scheduler**, which queues it fairly and dispatches it over gRPC to an
**inference worker** running a quantized model with `mistral.rs` on the GPU. Tokens
stream back to the client as Server-Sent Events. When the stream ends, the gateway
emits a **usage event** that is turned into cost, debited from the org's **credit
ledger**, and aggregated for the **console**, where the operator sees usage, latency
and GPU health, and can change limits or revoke keys instantly.
