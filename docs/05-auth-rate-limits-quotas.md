# 05 — Auth, rate limits & quotas

These three checks run on **every** request before any GPU work happens. They must
be fast (target < 2 ms total at p99) and must never let an over-limit request reach
the GPU, because GPU time is the scarce, expensive resource.

## 1. API keys

### Format

```
sk-live-2Xk9QmR7vT4pLw8NcB3yZf6HjD1sGa5E_1a2b3c4d
└┬┘└─┬┘ └──────────────┬─────────────────┘ └──┬───┘
 │   │       32 random bytes, base62        CRC32 checksum (hex) of everything before
 │   └ environment: live | test | admin
 └ "secret key"
```

- **Random part**: 32 bytes from the OS CSPRNG (`rand::rngs::OsRng`) → 256 bits of
  entropy. Unguessable; no rate of guessing could ever hit one.
- **Prefix** (`sk-live-`, `sk-admin-`): tells humans and secret scanners what it is;
  admin keys are rejected by the gateway, inference keys by admin-api.
- **Checksum**: lets the gateway reject typos/garbage *without a DB lookup*, and lets
  secret scanners (GitHub, our own) recognise a real-looking key with near-zero false
  positives. GitHub tokens use the same trick.

### Storage: why HMAC-SHA256, not argon2/bcrypt

Passwords are low-entropy, so they need a slow hash (argon2) to resist brute force.
API keys have 256 bits of entropy — brute force is impossible regardless of hash
speed — and the hash runs on every request, so it must be fast. We store
`HMAC-SHA256(pepper, key)`, where `pepper` is a server secret kept out of the DB:
a leaked database alone cannot even be used to test candidate keys.

### Lookup path

```
Authorization: Bearer <key>
  → format + checksum check                 (no I/O; rejects junk)
  → h = HMAC-SHA256(pepper, key)
  → moka cache get(h)                       (in-process, TTL 60 s, ~10k entries)
      miss → SELECT … FROM api_keys JOIN projects JOIN organizations WHERE key_hash = h
             → cache AuthContext {key_id, project_id, org_id, tier, allowed_models,
                                  limits, statuses, expires_at}
  → reject if revoked / expired / project archived / org suspended / IP not allowed
```

Revocation must be instant, not "within 60 s": admin-api publishes the key hash on
the Redis channel `apikey:revoked`; every gateway subscribes and evicts it from its
cache. The 60 s TTL is only the backstop if a message is missed.

`last_used_at` is updated asynchronously and at most once per minute per key, so
auth never writes to Postgres on the hot path.

Unknown keys are cached as negative entries for a few seconds to blunt
key-spraying floods.

## 2. Rate limits

### Dimensions and scopes

| Dimension | Counts | Why it exists |
|---|---|---|
| RPM | requests | Protects per-request overhead, stops tight loops |
| ITPM | input tokens | Prefill compute + KV memory |
| OTPM | output tokens | Decode time — the most expensive part |
| Concurrency | in-flight requests | Directly bounds KV cache a customer can hold |

Applied per **org × model** (the main business limit, set by tier), optionally
narrowed per **key** (customer-set, e.g. limit a test key). A request must pass all
applicable buckets.

### Algorithm: token bucket in Redis (Lua, atomic)

Each bucket has `capacity = limit` and refills continuously at `limit / 60` per
second. This allows short bursts while enforcing the per-minute average — smoother
than fixed windows, which allow 2× bursts at window edges.

All buckets for a request are checked and debited in **one** Lua script call, so
either all are debited or none (no partial debits, one network round-trip):

```lua
-- KEYS: bucket keys;  ARGV: now_ms, then per bucket: limit, cost
-- returns {1} on allow, or {0, retry_after_ms, failing_bucket_index}
local now = tonumber(ARGV[1])
local n = #KEYS
local state = {}
for i = 1, n do
  local limit = tonumber(ARGV[2*i]); local cost = tonumber(ARGV[2*i+1])
  local b = redis.call('HMGET', KEYS[i], 'tokens', 'ts')
  local tokens = tonumber(b[1]) or limit
  local ts = tonumber(b[2]) or now
  local rate = limit / 60000.0                       -- tokens per ms
  tokens = math.min(limit, tokens + (now - ts) * rate)
  if tokens < cost then
    return {0, math.ceil((cost - tokens) / rate), i}
  end
  state[i] = tokens - cost
end
for i = 1, n do
  redis.call('HSET', KEYS[i], 'tokens', state[i], 'ts', now)
  redis.call('PEXPIRE', KEYS[i], 120000)
end
return {1}
```

The gateway loads the script once (`SCRIPT LOAD`) and calls it by SHA (`EVALSHA`).

### Reserve, then reconcile (output tokens)

Output length is unknown when the request arrives. The approach real providers use:

1. **Reserve** `max_tokens` against OTPM at admission.
2. Stream the response.
3. **Refund** `max_tokens − actual_output_tokens` to the bucket when done.

Consequence (documented to users, same as commercial APIs): setting a huge
`max_tokens` you never use temporarily eats your OTPM headroom.

Input tokens are counted exactly before admission with the model's own tokenizer
(the `tokenizers` crate + chat template), so ITPM needs no reconciliation.

### Concurrency limit (crash-safe)

A plain counter leaks if a gateway crashes between `+1` and `−1`. Instead, use a
sorted set of leases:

```
ZREMRANGEBYSCORE cc:{key}:{model} -inf now      -- drop expired leases
ZCARD  …  < max_concurrent ?  ZADD … now+lease_ms request_id  :  reject
… while streaming, extend the lease every 30 s (ZADD XX)
ZREM … request_id                               -- on completion
```

### When Redis is down

Policy is a deliberate choice: **fail open with local limits**. Each gateway falls
back to an in-process limiter (`governor` crate) at a conservative fraction of the
limit, and raises an alert. Failing closed would turn a Redis blip into a full
outage; failing fully open would let one customer flood the GPU.

## 3. Quotas & spend

Rate limits bound *speed*; quotas bound *money*.

| Check | Source | Result on failure |
|---|---|---|
| Prepaid balance > 0 | `quota:{org}` in Redis (mirror of `org_balances`) | 429 `insufficient_quota` |
| Month spend < tier/override hard cap | same | 429 `insufficient_quota` |
| Project month spend < project budget (if set) | same, per project | 429 `insufficient_quota` |
| Soft limit / alert thresholds (50/80/100%) | usage-worker | Email/console notice, no blocking |

The hot path only *reads* the mirror. The usage-worker updates it after each priced
event. This means an org can overshoot by the cost of requests already in flight —
the same small, bounded overshoot commercial providers accept. To bound it further,
the gateway rejects when `balance < estimated_max_cost(request)`.

## 4. Usage tiers (automatic limit increases)

Like OpenAI's Tier 1–5: new orgs start low; limits rise automatically with paid
history. A daily job promotes orgs that meet `qualify_spend_nanos` and
`qualify_days`. Example (scaled to one laptop GPU):

| Tier | Qualifies at | qwen3-4b RPM / ITPM / OTPM / concurrent | Monthly cap |
|---|---|---|---|
| Free | sign-up | 3 / 2,000 / 1,000 / 1 | $0 (free grant only) |
| 1 | $5 paid | 20 / 10,000 / 4,000 / 2 | $50 |
| 2 | $50 paid + 7 days | 60 / 30,000 / 10,000 / 3 | $250 |
| 3 | $200 paid + 14 days | 120 / 60,000 / 20,000 / 4 | $1,000 |

The real ceiling is the GPU (~3–5 concurrent conversations, see doc 01), so
the scheduler's admission control (doc 07) is what protects the hardware; tier
limits are about fairness between customers and about money.
