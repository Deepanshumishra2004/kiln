# 04 — API specification

The public API is **OpenAI-compatible**, so any OpenAI SDK, LangChain, or tool that
accepts a custom `base_url` works unchanged. This is what most self-hosted and
third-party providers do.

```python
from openai import OpenAI
client = OpenAI(base_url="https://api.example.com/v1", api_key="sk-live-...")
for chunk in client.chat.completions.create(
        model="qwen3-4b", stream=True,
        messages=[{"role": "user", "content": "hello"}]):
    print(chunk.choices[0].delta.content or "", end="")
```

## Public endpoints (gateway, `:8080`)

| Method | Path | Phase | Notes |
|---|---|---|---|
| POST | `/v1/chat/completions` | 1 | Streaming and non-streaming |
| GET | `/v1/models` | 1 | Models this key may use |
| GET | `/v1/models/{id}` | 1 | |
| POST | `/v1/embeddings` | 6 | CPU embedding model |
| POST | `/v1/files`, GET `/v1/files/{id}` | 6 | For Batch input/output |
| POST | `/v1/batches`, GET `/v1/batches/{id}`, POST `/v1/batches/{id}/cancel` | 6 | Async, 50% price, done within 24 h |
| GET | `/healthz`, `/readyz` | 1 | Unauthenticated, liveness/readiness |

### `POST /v1/chat/completions` — request

```json
{
  "model": "qwen3-4b",
  "messages": [
    {"role": "system", "content": "You are helpful."},
    {"role": "user", "content": "Explain KV cache in one line."}
  ],
  "max_tokens": 512,
  "temperature": 0.7,
  "top_p": 0.9,
  "stop": ["\n\n"],
  "seed": 42,
  "stream": true,
  "stream_options": {"include_usage": true},
  "tools": [ ... ],                 // phase 6
  "tool_choice": "auto",            // phase 6
  "response_format": {"type": "json_object"},  // phase 6
  "user": "end-user-123"            // optional end-user id for abuse attribution
}
```

Validation (400 `invalid_request_error` with `param` set):
- `model` exists, is not retired, and is allowed for the key.
- `messages` non-empty; roles valid.
- `max_tokens` ≤ model `max_output_tokens`; defaults to a model-specific value.
- `input_tokens + max_tokens` ≤ `context_window`.
- Body size ≤ 1 MiB (tower-http `RequestBodyLimit`).

### Non-streaming response

```json
{
  "id": "chatcmpl-0192f3a4-...",
  "object": "chat.completion",
  "created": 1793091600,
  "model": "qwen3-4b",
  "choices": [{
    "index": 0,
    "message": {"role": "assistant", "content": "It stores past keys/values so ..."},
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 24,
    "completion_tokens": 31,
    "total_tokens": 55,
    "prompt_tokens_details": {"cached_tokens": 0}
  }
}
```

### Streaming response (SSE)

`Content-Type: text/event-stream`. One JSON chunk per `data:` line, blank line
between events, terminated by `data: [DONE]`.

```
data: {"id":"chatcmpl-…","object":"chat.completion.chunk","model":"qwen3-4b","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}

data: {"id":"chatcmpl-…","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"It"},"finish_reason":null}]}

data: {"id":"chatcmpl-…","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: {"id":"chatcmpl-…","object":"chat.completion.chunk","choices":[],"usage":{"prompt_tokens":24,"completion_tokens":31,"total_tokens":55}}

data: [DONE]
```

The gateway also sends an SSE comment (`: ping`) every 15 s while queued, so proxies
(Cloudflare has a ~100 s idle timeout) do not close the connection.

## Response headers (every response)

| Header | Example | Meaning |
|---|---|---|
| `x-request-id` | `0192f3a4-7c1e-7...` | Unique id; quote it in support requests. Also the usage-event id. |
| `openai-processing-ms` | `812` | Server-side time |
| `x-ratelimit-limit-requests` | `60` | RPM limit for this key/model |
| `x-ratelimit-remaining-requests` | `59` | |
| `x-ratelimit-reset-requests` | `1s` | Time until fully replenished |
| `x-ratelimit-limit-tokens` | `40000` | Token-per-minute limit (input) |
| `x-ratelimit-remaining-tokens` | `39476` | |
| `x-ratelimit-reset-tokens` | `780ms` | |
| `retry-after` | `2` | Only on 429/503: seconds to wait |

## Errors

Shape (OpenAI-compatible):

```json
{"error": {"type": "rate_limit_error", "code": "rate_limit_exceeded",
           "message": "Rate limit reached for qwen3-4b: 60 requests per minute. Retry after 2s.",
           "param": null}}
```

| HTTP | `type` | `code` | When |
|---|---|---|---|
| 400 | `invalid_request_error` | `invalid_value`, `context_length_exceeded`, ... | Bad input |
| 401 | `authentication_error` | `invalid_api_key` | Missing/unknown/revoked/expired key |
| 403 | `permission_error` | `model_not_allowed`, `ip_not_allowed`, `org_suspended` | Key valid but not allowed |
| 404 | `not_found_error` | `model_not_found` | |
| 413 | `invalid_request_error` | `request_too_large` | Body > 1 MiB |
| 429 | `rate_limit_error` | `rate_limit_exceeded` | RPM/TPM/concurrency |
| 429 | `insufficient_quota` | `insufficient_quota` | No credit / spend cap reached |
| 500 | `api_error` | `internal_error` | Bug; never leaks internals |
| 503 | `overloaded_error` | `server_overloaded` | Load shedding (Anthropic uses 529 for this) |
| 504 | `api_error` | `timeout` | Generation exceeded server timeout |

Errors that happen **after** streaming started cannot change the HTTP status (200 was
already sent), so they are delivered as an SSE event:
`data: {"error": {"type": "api_error", ...}}` followed by closing the stream.

Retry guidance (documented for users, matches SDK behaviour): retry 429/500/503/504
with exponential backoff + jitter, honouring `retry-after`; never retry 400/401/403.

## Admin API (admin-api, `:8081`)

Used by the console (session cookie) and programmatically with **admin keys**
(`sk-admin-...`), which can manage the org but cannot call models — same split as
OpenAI/Anthropic. All mutating calls write an audit log entry.

| Method | Path | Who |
|---|---|---|
| GET/POST | `/admin/v1/orgs` | platform admin |
| PATCH | `/admin/v1/orgs/{org}` (status, tier) | platform admin |
| GET/POST | `/admin/v1/orgs/{org}/projects` | org admin |
| GET/POST/DELETE | `/admin/v1/orgs/{org}/members` | org admin |
| GET/POST | `/admin/v1/projects/{p}/api_keys` | org admin / developer |
| POST | `/admin/v1/api_keys/{k}/revoke` | org admin / developer |
| GET/PUT | `/admin/v1/orgs/{org}/limits` | platform admin (overrides) |
| GET | `/admin/v1/orgs/{org}/usage?start&end&group_by=model,project,api_key&bucket=1d` | org admin |
| GET | `/admin/v1/orgs/{org}/costs?...` | org admin / billing |
| GET | `/admin/v1/orgs/{org}/balance`, POST `/admin/v1/orgs/{org}/credits` | billing / platform admin |
| GET | `/admin/v1/orgs/{org}/audit_logs` | org admin |
| GET/POST | `/admin/v1/models`, PUT `/admin/v1/models/{id}/prices` | platform admin |
| GET | `/admin/v1/platform/workers`, `/admin/v1/platform/overview` | platform admin |
| GET | `/admin/v1/platform/requests?status=error&limit=100` | platform admin (live request log) |

Creating a key returns the full secret **once**:

```json
POST /admin/v1/projects/{p}/api_keys  {"name": "prod backend", "allowed_models": ["qwen3-4b"]}
→ 201 {"id": "…", "key": "sk-live-…full…", "display": "sk-live-a1b2…wxyz"}
```
