# 10 — Console (dashboard)

Real providers have **two** UIs that are easy to confuse:

- the **customer console** (platform.openai.com, console.anthropic.com) where
  customers manage their own keys, usage and billing, and
- an **internal operator/admin tool** where staff see all customers, capacity and
  abuse, and override limits.

We build both in one Leptos app, gated by role (`users.is_platform_admin` and
`org_members.role`).

## Stack

- **Leptos** with server-side rendering + hydration (`leptos_axum`), built with
  `cargo-leptos` (server binary + WASM bundle). All Rust, including the browser code.
- The console server talks **only** to admin-api over HTTP (it holds no DB
  credentials) — the same boundary a real console has to its backend.
- Charts: SVG rendered by Leptos components (bar/line/area are simple enough to
  draw ourselves); styling with plain CSS.
- Live views (request log, worker status): server-sent events from admin-api.
- Auth: email + password (argon2id), TOTP MFA, `HttpOnly; Secure; SameSite=Lax`
  session cookie, CSRF token on mutating forms, login rate limiting.

## Customer console pages

| Page | Contents |
|---|---|
| **Overview** | Month-to-date spend vs cap, balance, requests today, error rate, quick links |
| **Usage** | Tokens and cost over time, stacked by model / project / key; date range; CSV export |
| **API keys** | List (masked `sk-live-a1b2…wxyz`, project, created by, last used); create (secret shown once with copy button), revoke, set allowed models / IPs / per-key limits |
| **Projects** | Create/archive; per-project budget |
| **Limits** | Current tier, RPM/ITPM/OTPM/concurrency per model, how to reach the next tier |
| **Billing** | Balance, add credits (Stripe), auto-recharge, ledger history, spend alerts (50/80/100%) |
| **Members** | Invite by email, roles (owner/admin/developer/billing/viewer) |
| **Playground** | Chat with any model using a selected key; shows tokens, TTFT and cost per message; "view code" shows the equivalent `curl` / Python |
| **Audit log** | Who did what in the org |
| **Docs** | API reference + quickstart (rendered from Markdown) |

## Operator (platform admin) pages

| Page | Contents |
|---|---|
| **Live** | Real-time request stream (model, org, tokens, TTFT, status), RPS, tokens/s, error rate |
| **Capacity** | Per worker: model, running/waiting seqs, KV cache usage bar, tok/s, GPU util/memory/temperature; queue depth; rejections |
| **Organizations** | Search; per org: tier, balance, MTD spend, limits, usage chart; actions: suspend, change tier, set overrides, grant credits (writes ledger + audit) |
| **Keys** | Global key search by prefix; force revoke |
| **Models** | Registry, aliases, status (preview/active/deprecated), prices (versioned), canary % |
| **Anomalies** | Keys flagged by leak/abuse detection; one-click pause |
| **Revenue** | Revenue by model/day, top orgs, cost-to-serve estimate (GPU hours × power) |
| **Status & incidents** | Post incident notes shown on the public status page |

## Data flow

```
 browser ⇄ console (Leptos SSR, :3000) ⇄ admin-api (:8081) ⇄ Postgres / Redis / scheduler
                                                     │
                     live views: admin-api subscribes to Redis pub/sub "requests.live"
                     (gateway publishes a small summary per finished request)
```

Usage charts read `usage_daily` (pre-aggregated), never scan `usage_events`, so the
console stays fast as data grows.
