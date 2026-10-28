# 09 — Security & trust

Once a key is handed to someone, your GPU, your money and your reputation are
exposed to them and to anyone they leak the key to. Real providers invest heavily
here; this is the scaled-down version.

## Threat model

| Threat | Mitigation |
|---|---|
| Stolen/leaked API key | Checksummed key format, instant revocation, leak scanning, anomaly alerts, per-key IP allowlist, per-key limits |
| Database leak | Keys stored only as HMAC with an out-of-DB pepper; passwords argon2id; TOTP secrets encrypted |
| Direct access to the engine | Workers, scheduler, Postgres, Redis bind to `127.0.0.1`; only gateway + console go through the tunnel |
| Resource exhaustion (one user hogs GPU) | Rate limits, concurrency limits, fair scheduling, admission control, max body / max tokens |
| Abusive content generation | Usage policy, optional moderation, per-org flags, suspension |
| Console account takeover | argon2id, TOTP MFA, rate-limited login, secure session cookies, CSRF protection |
| Insider/operator mistakes | Audit log on every admin action, append-only ledger |
| Prompt data exposure | Prompts not stored by default; retention limits; zero-data-retention orgs |

## Network exposure

```
 Internet ─► Cloudflare ─► cloudflared (outbound-only tunnel from the PC)
                               ├─► 127.0.0.1:8080  gateway
                               └─► 127.0.0.1:3000  console
 Everything else: 127.0.0.1 only. Windows firewall: no inbound rules needed.
```

No router port-forwarding, the home IP is never exposed, TLS is handled by Cloudflare.
Cloudflare's WAF rules can add a coarse per-IP limit in front of the gateway.
The gateway trusts `CF-Connecting-IP` for the client IP **only** when the request
came from the local cloudflared.

## Secrets

- `KEY_PEPPER`, DB password, session secret, Stripe keys: environment variables
  loaded from a git-ignored `.env`, never committed, never logged.
- `tracing` fields that could hold secrets (`authorization` header) are redacted by
  a log layer.
- Error responses never include stack traces, SQL, or internal hostnames.

## Leaked-key detection

1. **Format** (doc 05): prefix + checksum makes our keys machine-recognisable.
2. **Self-service revoke + rotate** in the console, effective in under a second.
3. **Anomaly detection** (usage-worker, per key, rolling baselines):
   - spend in the last hour > 10× the key's 7-day hourly average,
   - requests from a new country/ASN for a key with an established pattern,
   - sudden many distinct client IPs.
   Action: alert the org; for extreme cases auto-pause the key (`revoked_reason='leaked'`).
4. **Public scanning** (stretch): real providers are partners in GitHub Secret
   Scanning, which reports any pushed string matching their key pattern to a
   provider endpoint that verifies and auto-revokes. We implement the receiving
   endpoint shape (`POST /internal/secret-scanning`) to understand the flow.

## Abuse & content safety

- **Usage policy** document shown at sign-up; orgs that violate it are suspended
  (`organizations.status='suspended'` → 403 on every request, effective via cache
  invalidation).
- **Moderation (phase 6)**: an optional input check with a small classifier model on
  the CPU worker for flagged orgs or free tier; flagged requests are logged for
  review and optionally blocked. Real providers run classifiers on input and output
  at scale; we keep it optional to save compute.
- `user` field (end-user id from the customer) is stored with usage so abuse can be
  traced to the customer's end user without us knowing who that is.
- Free tier signup protections: email verification, one free grant per verified
  email, low limits.

## Audit logs

Every mutating admin action writes `audit_logs` with actor, target, before/after
JSON, IP and time: key create/revoke, member add/remove/role change, limit changes,
tier changes, credit grants, model/price changes, org suspension. Visible to org
admins for their org and to the platform admin for everything. Never deletable via
the API.

## Data retention & privacy

| Data | Default retention |
|---|---|
| Usage events (counts, no content) | 13 months (billing disputes, year-over-year) |
| Request/response bodies | Not stored. Opt-in debug logging per org: 30 days |
| Abuse review samples | 30 days, only for flagged requests |
| Audit logs | 2 years |
| Zero-data-retention orgs | No bodies stored anywhere, ever; usage counts only |

Request bodies never appear in application logs at `info` level.
