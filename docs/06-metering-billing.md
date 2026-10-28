# 06 — Metering & billing

Metering is where an API business makes or loses money. The two rules:

1. **Never lose a usage event** (lost event = free compute given away).
2. **Never count one twice** (double charge = angry customer, refunds).

Together that is *exactly-once effect*, built from *at-least-once delivery* +
*idempotent processing*.

## Usage event

Emitted by the gateway exactly when a request finishes (success, error after tokens
were produced, or client cancel):

```json
{
  "schema": "usage.v1",
  "request_id": "0192f3a4-7c1e-7b55-9a0e-3c8a6f0e1d22",
  "org_id": "…", "project_id": "…", "api_key_id": "…",
  "model_id": "qwen3-4b",
  "endpoint": "chat.completions",
  "status": "ok",
  "input_tokens": 1240,
  "cached_input_tokens": 1024,
  "output_tokens": 312,
  "ttft_ms": 180,
  "duration_ms": 7420,
  "worker_id": "worker-gpu-0",
  "session_id": "agent-run-0192f3a1",
  "client_ip": "203.0.113.7",
  "started_at": "2026-10-27T10:15:02.113Z"
}
```

Token counts come from the **worker** (the engine knows exactly what it processed
and generated), not from re-tokenizing on the gateway. `request_id` is the
idempotency key end to end.

## Pipeline

```
 gateway ──publish──► Iggy stream "usage" (partitioned by org_id)
    │                      │
    │ publish failed?      │ consumer group "billing"
    ▼                      ▼
 local spill file     usage-worker
 (replayed later)       1. price event (model_prices at started_at)
                        2. BEGIN
                           INSERT usage_events … ON CONFLICT DO NOTHING
                           if inserted: INSERT credit_ledger(kind='usage', ref=request_id, −cost)
                                        UPDATE org_balances
                                        UPSERT usage_daily (+= counts)
                           COMMIT
                        3. ack/commit offset  (only after COMMIT)
                        4. refresh quota:{org} mirror in Redis; check alert thresholds
```

Why it is exactly-once in effect:

- If the worker crashes after COMMIT but before acking, the event is redelivered;
  `ON CONFLICT DO NOTHING` makes the second attempt a no-op, and the ledger insert
  is skipped because `inserted == false` (and `UNIQUE(kind, ref)` is a second guard).
- If the gateway cannot reach Iggy, it appends to a local spill file and a background
  task replays it. Since processing is idempotent, replaying more than needed is safe.

**Phases 1–2** (before Iggy): the gateway inserts into `usage_outbox` via a batching
background task (bounded channel, flush every 200 ms or 500 events), and the
usage-worker polls the outbox with `SELECT … FOR UPDATE SKIP LOCKED`. Same idempotency
logic; swapping to Iggy later changes only the transport.

Partitioning the stream by `org_id` keeps one org's events in order and lets several
usage-worker instances share load without fighting over the same org's balance row.

## Pricing

```
cost_nanos =  (input_tokens − cached_input_tokens) × input_nanos_per_token
            +  cached_input_tokens                  × cached_input_nanos_per_token
            +  output_tokens                        × output_nanos_per_token
batch requests: × (100 − batch_discount_pct) / 100
```

Integer math only. Example prices for our models (illustrative — you choose):

| Model | Input $/MTok | Cached input $/MTok | Output $/MTok |
|---|---|---|---|
| qwen3-4b | 0.20 (200 nanos/token) | 0.05 (50) | 0.80 (800) |
| qwen3-1.7b | 0.05 (50) | 0.01 (10) | 0.20 (200) |

Why output costs more: input tokens are processed in parallel during prefill (cheap
per token); output tokens are generated one at a time, each step occupying the GPU
batch slot and KV memory (expensive per token). Cached input is cheaper because the
prefill work was skipped.

## Credit ledger (prepaid model)

Like Anthropic/OpenAI prepaid credits:

```
 +5,000,000,000  purchase   stripe:pi_3Q…        ($5.00 top-up)
 +1,000,000,000  grant      signup-bonus         ($1.00 free credit)
        −310,400  usage      0192f3a4-…           (one request)
        −298,000  usage      0192f3a5-…
 ...
```

- **Append-only.** Corrections are new `adjustment`/`refund` rows, never edits. This
  gives a complete, auditable history — required for any real money system.
- Balance = sum of rows. `org_balances` caches it, updated in the same transaction.
- **Nightly reconciliation job**: recompute balances from the ledger and
  `usage_daily` from `usage_events`; any mismatch raises an alert.
- Writing one ledger row per request is fine at our scale. At large scale providers
  debit in aggregated batches (e.g. per org per minute) — the same design, with
  `ref = batch id`.

## Payments (phase 6)

Stripe in **test mode** via `async-stripe`:

1. Console → "Add credits" → Stripe Checkout session.
2. Stripe calls our webhook `POST /webhooks/stripe` (signature verified).
3. On `checkout.session.completed` → ledger `purchase` row with `ref = payment_intent id`
   (`UNIQUE(kind, ref)` makes duplicate webhook deliveries harmless).
4. Optional **auto-recharge**: when balance < threshold, charge the saved card.

Monthly invoices for postpaid customers would be generated from `usage_daily`; we keep
prepaid only, which is how both big providers onboard self-serve customers.

## What the customer sees

From `usage_daily` (fast) and `usage_events` (drill-down):

- Cost and tokens per day, stacked by model / project / key.
- Requests, error rate, cached-token ratio.
- Current balance, month-to-date spend vs. cap, projected month-end spend.
- CSV export, and the same data via `GET /admin/v1/orgs/{org}/usage`.
