# 13 — Our own AI agent

An **agent** is a program that lets the model act: it sends the conversation to the
model, the model either answers or asks to call a **tool** (read a file, run a
command, search), the program runs the tool and sends the result back, and this
repeats until the task is done. Claude Code, ChatGPT agents and Cursor all work this
way.

From the platform's point of view, **an agent is just another API customer**: it
holds an `sk-live-...` key, calls `/v1/chat/completions`, and every step is
authenticated, rate limited, metered and visible in the console like any other
request. Building our own agent is therefore also the best end-to-end test of the
platform.

## The agent loop

```
 user task
    │
    ▼
 ┌──────────────────────────────────────────────────────────────┐
 │ messages = [system, user task]                               │
 │ loop (max_steps):                                            │
 │   resp = POST /v1/chat/completions {messages, tools}  ───────┼──► gateway (key, limits, usage)
 │   if resp has tool_calls:                                    │
 │       for each call: check permission → run tool → result   │
 │       messages += [assistant tool_calls, tool results]       │
 │   else:                                                      │
 │       print final answer; break                              │
 │   compact messages if near context limit                     │
 └──────────────────────────────────────────────────────────────┘
```

On the wire this is the standard OpenAI tool-calling format:

```json
// request (excerpt)
{"model": "qwen3-4b",
 "messages": [...],
 "tools": [{"type": "function", "function": {
     "name": "read_file",
     "description": "Read a UTF-8 text file from the workspace",
     "parameters": {"type": "object",
                    "properties": {"path": {"type": "string"}},
                    "required": ["path"]}}}]}

// response: model asks for a tool
{"choices": [{"finish_reason": "tool_calls", "message": {"role": "assistant", "tool_calls": [
   {"id": "call_1", "type": "function",
    "function": {"name": "read_file", "arguments": "{\"path\":\"src/main.rs\"}"}}]}]}

// next request appends the result
{"role": "tool", "tool_call_id": "call_1", "content": "fn main() { ... }"}
```

## What the platform must add for agents

| Requirement | Where | Notes |
|---|---|---|
| **Tool calling** (`tools`, `tool_choice`, `tool_calls`) | gateway + worker | Qwen3 emits tool calls as `<tool_call>{json}</tool_call>` text per its chat template. The worker renders tools into the template; a parser turns the model output into OpenAI `tool_calls` (also incrementally while streaming). Use the engine's constrained/grammar decoding where available so arguments are always valid JSON; otherwise validate against the schema and return a parse error the agent can retry on. |
| **Prefix caching** | worker | Every agent step resends the whole growing conversation. With prefix caching only the new tail is prefilled — a big TTFT and cost win. Billed as `cached_tokens`. |
| **Session grouping** | gateway + `usage_events.session_id` | Agent sends `x-session-id: <run id>`; usage is grouped per agent run in the console ("this task cost 41 requests, 180k tokens, $0.02"). |
| **Per-key budget** | api_keys / projects | Give the agent its own key in an `agents` project with a low budget and RPM, so a runaway loop cannot drain the org. |

## Agent design (`crates/agent`, Rust CLI)

```
 crates/agent/
 ├─ main.rs          CLI: `agent "fix the failing test"` or interactive REPL
 ├─ client.rs        OpenAI-compatible client (reqwest + SSE), base_url + key from env
 ├─ loop.rs          agent loop, max_steps, stop conditions
 ├─ tools/
 │   ├─ mod.rs       trait Tool { name(), schema() -> JSON Schema, run(args) -> Result<String> }
 │   ├─ fs.rs        list_dir, read_file, write_file, edit_file (exact string replace)
 │   ├─ shell.rs     run_command (timeout, output truncated)
 │   ├─ search.rs    grep over workspace
 │   └─ web.rs       http_get (optional)
 ├─ permissions.rs   allow / ask / deny per tool; writes and shell ask by default
 ├─ context.rs       token budget, truncation, compaction (summarize old steps)
 └─ transcript.rs    save runs as JSONL for replay/debugging
```

Configuration:

```powershell
$env:AGENT_BASE_URL = "http://localhost:8080/v1"     # or https://api.<domain>/v1
$env:AGENT_API_KEY  = "sk-live-..."                   # key issued from our console
$env:AGENT_MODEL    = "qwen3-4b"
```

Because it only speaks the OpenAI-compatible API, the same agent also works against
any other compatible provider by changing these three variables — useful for
comparing our small model with a large hosted one on the same task.

### Safety rules (non-negotiable)

- Tools run only inside a chosen **workspace directory**; paths are canonicalized
  and anything outside is refused.
- `write_file`, `edit_file` and `run_command` **ask the user** before running,
  unless explicitly allowed for the session.
- Shell commands get a timeout and an output cap; no interactive commands.
- Hard `max_steps` (e.g. 25) and a per-run token budget; the agent stops and reports
  instead of looping forever.

## Living with a 4B model and a small context

This is the honest constraint: our GPU holds ~6k–12k tokens of KV cache in total
(doc 01), and a 4B model is far weaker at multi-step planning than frontier models.
Design for it:

- **Short system prompt** and few, simple tools with clear descriptions.
- **Truncate tool output** (e.g. first/last 100 lines, max ~1,500 tokens) and tell
  the model it was truncated.
- **Compaction**: when the conversation passes ~70% of the context limit, replace
  old steps with a short summary (one extra model call).
- Prefer **narrow, concrete tasks** ("add a `--verbose` flag to main.rs") over
  open-ended ones.
- Use `temperature` 0–0.3 for tool use; validate arguments and feed errors back so
  the model can self-correct.
- One agent run at a time per GPU in practice; other users still get served because
  of fair scheduling (doc 07).

## Later: server-side agents

Providers also offer agents **as a service** (OpenAI Responses/Assistants API,
Anthropic's managed agents): the platform runs the loop and the tools in a sandbox,
and the customer only sends the task. The equivalent here would be an
`agent-runner` service with `POST /v1/agent_runs`, tools executed in a container
per run, and runs/steps stored in Postgres. It reuses everything above; it is a
stretch goal after the CLI agent works.
