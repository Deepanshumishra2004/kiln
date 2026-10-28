# 03 — Data model

Postgres is the source of truth for identity, configuration and money. Redis only
holds derived, rebuildable state (counters, caches). If Redis is wiped, the system
keeps working after a brief warm-up; if Postgres is lost, the business is lost.

Conventions: all ids are UUIDv7 (time-ordered, index-friendly). All money is
`BIGINT` **nano-USD** (1 USD = 1,000,000,000) — integers never have rounding drift,
and nano precision is needed because a single token costs fractions of a micro-dollar.
All timestamps are `timestamptz`.

## Entity relationships

```
 users ──< org_members >── organizations ──< projects ──< api_keys
                               │                │
                               │                └──< usage_events >── models
                               ├──< credit_ledger
                               ├── org_limits (tier + overrides)
                               └──< audit_logs
 models ──< model_prices
 rate_limit_tiers ──< tier_model_limits
```

## Tables

### Identity & tenancy

```sql
CREATE TABLE users (
    id              uuid PRIMARY KEY,
    email           citext UNIQUE NOT NULL,
    password_hash   text NOT NULL,              -- argon2id PHC string
    totp_secret     bytea,                      -- MFA (encrypted), nullable
    is_platform_admin boolean NOT NULL DEFAULT false,   -- operator (you)
    created_at      timestamptz NOT NULL DEFAULT now(),
    disabled_at     timestamptz
);

CREATE TABLE organizations (
    id              uuid PRIMARY KEY,
    name            text NOT NULL,
    tier            smallint NOT NULL DEFAULT 1 REFERENCES rate_limit_tiers(tier),
    status          text NOT NULL DEFAULT 'active',     -- active | suspended
    zero_data_retention boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE org_members (
    org_id   uuid REFERENCES organizations(id),
    user_id  uuid REFERENCES users(id),
    role     text NOT NULL,          -- owner | admin | developer | billing | viewer
    PRIMARY KEY (org_id, user_id)
);

CREATE TABLE projects (
    id          uuid PRIMARY KEY,
    org_id      uuid NOT NULL REFERENCES organizations(id),
    name        text NOT NULL,
    status      text NOT NULL DEFAULT 'active',   -- active | archived
    monthly_budget_nanos bigint,                  -- optional project-level cap
    created_at  timestamptz NOT NULL DEFAULT now()
);
```

### API keys

```sql
CREATE TABLE api_keys (
    id              uuid PRIMARY KEY,
    project_id      uuid NOT NULL REFERENCES projects(id),
    org_id          uuid NOT NULL REFERENCES organizations(id),   -- denormalized for fast auth
    kind            text NOT NULL,          -- 'inference' | 'admin'
    name            text NOT NULL,
    key_hash        bytea UNIQUE NOT NULL,  -- HMAC-SHA256(pepper, full_key)
    display_prefix  text NOT NULL,          -- 'sk-live-a1b2' (shown as sk-live-a1b2…wxyz)
    display_suffix  text NOT NULL,          -- last 4 chars
    allowed_models  text[],                 -- NULL = all models
    allowed_cidrs   cidr[],                 -- NULL = any IP
    rpm_override    integer,                -- per-key limits (NULL = inherit project/org)
    tpm_override    integer,
    created_by      uuid REFERENCES users(id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    expires_at      timestamptz,
    last_used_at    timestamptz,            -- updated lazily (at most once/minute)
    revoked_at      timestamptz,
    revoked_reason  text                    -- 'user' | 'leaked' | 'abuse' | 'expired'
);
```

The full key is **never stored**. See doc 05 for the key format and why HMAC.

### Models & pricing

```sql
CREATE TABLE models (
    id              text PRIMARY KEY,       -- public id: 'qwen3-4b'
    display_name    text NOT NULL,
    weights_ref     text NOT NULL,          -- 'Qwen/Qwen3-4B-Instruct-2507' + quant spec
    context_window  integer NOT NULL,       -- max input+output tokens per request
    max_output_tokens integer NOT NULL,
    worker_pool     text NOT NULL,          -- 'gpu' | 'cpu'
    status          text NOT NULL,          -- preview | active | deprecated | retired
    deprecated_at   timestamptz,
    retires_at      timestamptz
);

CREATE TABLE model_aliases (               -- 'default' → 'qwen3-4b', 'qwen3-latest' → ...
    alias     text PRIMARY KEY,
    model_id  text NOT NULL REFERENCES models(id)
);

CREATE TABLE model_prices (                -- versioned: never UPDATE a price, insert a new row
    model_id        text REFERENCES models(id),
    effective_from  timestamptz NOT NULL,
    input_nanos_per_token        bigint NOT NULL,   -- $0.20 / MTok = 200
    cached_input_nanos_per_token bigint NOT NULL,   -- typically 10–50% of input
    output_nanos_per_token       bigint NOT NULL,   -- $0.80 / MTok = 800
    batch_discount_pct           smallint NOT NULL DEFAULT 50,
    PRIMARY KEY (model_id, effective_from)
);
```

Price versioning matters: a usage event is priced with the row whose
`effective_from` ≤ the event's start time, so changing prices never rewrites history.

### Rate-limit tiers

```sql
CREATE TABLE rate_limit_tiers (
    tier                  smallint PRIMARY KEY,    -- 1..5
    name                  text NOT NULL,
    qualify_spend_nanos   bigint NOT NULL,         -- lifetime paid spend to auto-qualify
    qualify_days          integer NOT NULL,        -- days since first payment
    monthly_spend_limit_nanos bigint NOT NULL      -- hard cap for the tier
);

CREATE TABLE tier_model_limits (
    tier      smallint REFERENCES rate_limit_tiers(tier),
    model_id  text REFERENCES models(id),
    rpm       integer NOT NULL,
    itpm      integer NOT NULL,
    otpm      integer NOT NULL,
    max_concurrent integer NOT NULL,
    PRIMARY KEY (tier, model_id)
);

CREATE TABLE org_limit_overrides (         -- operator-granted exceptions
    org_id    uuid REFERENCES organizations(id),
    model_id  text REFERENCES models(id),
    rpm integer, itpm integer, otpm integer, max_concurrent integer,
    monthly_spend_limit_nanos bigint,
    PRIMARY KEY (org_id, model_id)
);
```

Effective limit for a request = most specific non-null of: key override → org
override → tier default. Projects may set a *lower* budget, never a higher one.

### Usage

```sql
CREATE TABLE usage_events (
    request_id          uuid NOT NULL,          -- idempotency key, = x-request-id
    org_id              uuid NOT NULL,
    project_id          uuid NOT NULL,
    api_key_id          uuid NOT NULL,
    model_id            text NOT NULL,
    endpoint            text NOT NULL,          -- 'chat.completions' | 'embeddings' | 'batch'
    status              text NOT NULL,          -- ok | client_cancelled | error
    input_tokens        integer NOT NULL,
    cached_input_tokens integer NOT NULL DEFAULT 0,
    output_tokens       integer NOT NULL,
    cost_nanos          bigint NOT NULL,
    ttft_ms             integer,
    duration_ms         integer NOT NULL,
    worker_id           text,
    session_id          text,                   -- from x-session-id (agent runs), nullable
    client_ip           inet,
    started_at          timestamptz NOT NULL,
    PRIMARY KEY (request_id, started_at)
) PARTITION BY RANGE (started_at);              -- one partition per month

CREATE TABLE usage_daily (                      -- rollup the console reads
    day           date,
    org_id        uuid,
    project_id    uuid,
    api_key_id    uuid,
    model_id      text,
    requests      bigint NOT NULL,
    input_tokens  bigint NOT NULL,
    cached_input_tokens bigint NOT NULL,
    output_tokens bigint NOT NULL,
    cost_nanos    bigint NOT NULL,
    errors        bigint NOT NULL,
    PRIMARY KEY (day, org_id, project_id, api_key_id, model_id)
);
```

Prompts and completions are **not** stored in `usage_events` — only counts. Request
bodies, if stored at all for debugging/abuse review, go to a separate table with a
short retention (30 days) and are skipped for zero-data-retention orgs (doc 09).

### Money

```sql
CREATE TABLE credit_ledger (                    -- append-only, never UPDATE/DELETE
    id            uuid PRIMARY KEY,
    org_id        uuid NOT NULL REFERENCES organizations(id),
    amount_nanos  bigint NOT NULL,              -- +credit, −debit
    kind          text NOT NULL,                -- purchase | grant | usage | refund | adjustment
    ref           text NOT NULL,                -- stripe payment id / usage batch id / ticket
    note          text,
    created_by    uuid,                         -- user for manual entries
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (kind, ref)                          -- idempotency
);

CREATE TABLE org_balances (                     -- materialized for fast reads
    org_id         uuid PRIMARY KEY REFERENCES organizations(id),
    balance_nanos  bigint NOT NULL,
    month_spend_nanos bigint NOT NULL,
    month          date NOT NULL,
    updated_at     timestamptz NOT NULL
);
```

Balance = `SUM(amount_nanos)` over the ledger. `org_balances` is a cache updated in the
same transaction as each ledger insert, and a nightly job re-derives it from the
ledger to prove they agree (reconciliation).

### Audit

```sql
CREATE TABLE audit_logs (
    id          uuid PRIMARY KEY,
    org_id      uuid,                 -- NULL for platform-level actions
    actor_user  uuid,
    actor_key   uuid,                 -- when an admin key did it
    action      text NOT NULL,        -- 'api_key.create', 'org.limits.update', ...
    target_type text NOT NULL,
    target_id   text NOT NULL,
    before      jsonb,
    after       jsonb,
    ip          inet,
    created_at  timestamptz NOT NULL DEFAULT now()
);
```

### Outbox (phase 1–2, before Iggy)

```sql
CREATE TABLE usage_outbox (
    request_id  uuid PRIMARY KEY,
    payload     jsonb NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    processed_at timestamptz
);
```

## What lives in Redis (all rebuildable)

| Key pattern | Type | Purpose |
|---|---|---|
| `rl:{scope}:{id}:{model}:{dim}` | hash (tokens, ts) | Token buckets for rpm / itpm / otpm |
| `cc:{key_id}:{model}` | sorted set (request_id → lease expiry) | Concurrency limit with crash-safe leases |
| `quota:{org_id}` | hash | Mirror of balance + month spend for the hot path |
| `apikey:revoked` | pub/sub channel | Instant revocation across gateway instances |
| `worker:{id}` | hash, TTL | Last heartbeat snapshot (for console) |
