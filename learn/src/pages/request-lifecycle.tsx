import { ReactNode, useState } from "react";
import { Link } from "react-router-dom";
import { ArchDiagram, EdgeId, NodeId } from "../components/arch";
import { Callout, Code, PageHeader, Quiz, Recap, Section, Seg, Slider, Stepper, Svg, Viz } from "../components/ui";

type Step = { title: string; nodes: NodeId[]; edges: EdgeId[]; text: ReactNode; code?: { lang: "rust" | "http" | "text"; src: string } };

const STEPS: Step[] = [
  {
    title: "The client sends an HTTPS request",
    nodes: ["client", "edge"], edges: ["client-edge"],
    text: <p>A Python program using the OpenAI SDK sends a chat request. Only the base URL points to us. The request is encrypted with TLS on the way to Cloudflare.</p>,
    code: { lang: "http", src: `POST /v1/chat/completions HTTP/1.1
Host: api.kiln.example
Authorization: Bearer sk-live-7Hq2…k9
Content-Type: application/json

{"model":"qwen3-4b","stream":true,"max_tokens":200,
 "messages":[{"role":"user","content":"Explain a KV cache"}]}` },
  },
  {
    title: "The edge forwards it to the gateway",
    nodes: ["edge", "gateway"], edges: ["edge-gateway"],
    text: <p>Cloudflare removes the TLS encryption and forwards the plain HTTP bytes through its tunnel to our <b>gateway</b> on port 8080. From here on, everything is our code.</p>,
  },
  {
    title: "Gateway: parse and validate",
    nodes: ["gateway"], edges: [],
    text: <><p>The gateway gives the request a unique <b>request id</b> (a time-ordered UUIDv7) and starts a trace. It parses the HTTP bytes and the JSON body, then checks the rules: does the model exist? Is <code>max_tokens</code> within the limit? Is the body under 1 MB?</p><p>If anything is wrong, it returns <b>400</b> immediately. Cheap checks first, expensive work later.</p></>,
    code: { lang: "rust", src: `let req: ChatRequest = serde_json::from_slice(&body)
    .map_err(|e| ApiError::invalid_request(e.to_string()))?; // 400 on bad JSON
if req.max_tokens > model.max_output { return Err(ApiError::invalid_request("max_tokens too large")); }` },
  },
  {
    title: "Gateway: who are you? (authentication)",
    nodes: ["gateway", "pg"], edges: [],
    text: <><p>The gateway computes an <b>HMAC-SHA256</b> hash of the API key (SHA-256 mixed with a server-side secret "pepper") and looks the hash up, first in its in-memory cache, and only on a cache miss in Postgres. We never store real keys, only hashes. The result tells us the <b>key → project → organisation</b>, and whether all three are active.</p><p>Unknown or revoked key → <b>401</b>.</p></>,
    code: { lang: "rust", src: `let hash = hmac_sha256(&pepper, key.as_bytes()); // audited crate, never hand-written
let auth = match key_cache.get(&hash) {
    Some(a) => a,                                  // ~100 ns, the common case
    None => db.lookup_key(&hash).await?,           // ~1 ms, then cached
};` },
  },
  {
    title: "Gateway: count the input tokens",
    nodes: ["gateway"], edges: [],
    text: <p>The gateway applies the model's chat template and runs our <b>BPE tokenizer</b> to count input tokens. Everything (limits, prices, capacity) is measured in tokens, so we need this number before we decide anything. See <Link to="/tokenization">Tokenization</Link>.</p>,
  },
  {
    title: "Gateway: are you allowed right now? (limits and credit)",
    nodes: ["gateway"], edges: [],
    text: <><p>Rate limits: requests per minute, input tokens per minute, output tokens per minute. We don't know the output length yet, so we <b>reserve</b> <code>max_tokens</code> now and <b>refund</b> the unused part at the end. Then: does the organisation have credit, and is it under its monthly spend cap?</p><p>Over limit → <b>429</b> with a <code>retry-after</code> header. Out of money → <b>429 insufficient_quota</b>. See <Link to="/rate-limiting">Rate limiting</Link>.</p></>,
  },
  {
    title: "Submit to the scheduler",
    nodes: ["gateway", "scheduler"], edges: ["gateway-scheduler"],
    text: <><p>The gateway sends the request to the scheduler as a <b>kiln-wire</b> frame (our own binary protocol). The scheduler puts it in the queue for <code>qwen3-4b</code>, inside its organisation's sub-queue.</p><p>If the estimated waiting time is too long, it rejects immediately: <b>503 overloaded</b>. A fast "no" is better than a slow timeout. See <Link to="/scheduler">Scheduler</Link>.</p></>,
  },
  {
    title: "Scheduler picks a worker",
    nodes: ["scheduler", "gpu"], edges: ["scheduler-gpu"],
    text: <p>Every worker sends a heartbeat each second with how much <b>KV-cache memory</b> it has free. The scheduler sends the request to a worker that has enough free blocks for <code>input + max_tokens</code>, using deficit round robin so every organisation gets its fair share.</p>,
  },
  {
    title: "Worker: prefill (read the whole prompt)",
    nodes: ["gpu"], edges: [],
    text: <><p>The worker runs all prompt tokens through the 36 transformer layers in one big parallel pass and stores their keys and values in the <b>KV cache</b>. This is compute-heavy and decides the <b>time to first token (TTFT)</b>.</p><p>See <Link to="/transformer">The transformer</Link> and <Link to="/kv-cache">KV cache</Link>.</p></>,
  },
  {
    title: "Worker: decode, one token at a time, streamed",
    nodes: ["gpu", "scheduler", "gateway", "edge", "client"], edges: ["scheduler-gpu", "gateway-scheduler", "edge-gateway", "client-edge"],
    text: <><p>Each step produces one new token per request. The worker batches many users' requests into the same step (<Link to="/batching">continuous batching</Link>). Each token goes back worker → scheduler → gateway, and the gateway writes it to the client as a <b>Server-Sent Event</b>:</p></>,
    code: { lang: "text", src: `data: {"choices":[{"delta":{"content":"A"}}]}

data: {"choices":[{"delta":{"content":" KV"}}]}

data: {"choices":[{"delta":{"content":" cache"}}]}
` },
  },
  {
    title: "Finished: usage and refund",
    nodes: ["gpu", "gateway"], edges: ["gateway-scheduler"],
    text: <><p>The worker sends a final event: why it stopped (end of answer, or <code>max_tokens</code> reached) and the exact counts: input, cached input, output tokens. The gateway sends <code>data: [DONE]</code>, closes the stream, and <b>refunds</b> <code>max_tokens − output</code> to the rate limiter.</p></>,
  },
  {
    title: "Emit the usage event",
    nodes: ["gateway", "log"], edges: ["gateway-log"],
    text: <p>The gateway appends one <b>usage event</b> (request id, key, model, token counts, timings) to <b>kiln-log</b>. This is fast (an append to a file) and the request is now complete from the client's point of view.</p>,
    code: { lang: "rust", src: `log.append(&UsageEvent {
    request_id, org_id, project_id, key_id, model: "qwen3-4b".into(),
    input_tokens: 412, cached_input_tokens: 0, output_tokens: 187,
    ttft_ms: 380, total_ms: 5_120,
}).await?;` },
  },
  {
    title: "Billing happens in the background",
    nodes: ["log", "usage", "pg"], edges: ["log-usage", "usage-pg"],
    text: <p>The <b>usage-worker</b> reads the event, multiplies tokens by the model's price, and in one database transaction: inserts the usage row (ignored if the request id already exists — this is <b>idempotency</b>), debits the credit ledger, and updates daily totals.</p>,
  },
  {
    title: "The console shows it",
    nodes: ["console", "admin", "pg"], edges: ["console-admin", "admin-pg"],
    text: <p>An operator opens the console and sees the request, its tokens, its cost and its latency. If this key is abusing the system, they can lower its limit or revoke it, and the gateway's cache is updated within a second.</p>,
  },
];

function LatencyBudget() {
  const [prompt, setPrompt] = useState(1000);
  const [output, setOutput] = useState(200);
  // Rough planning estimates for Qwen3-4B Q4 on an RTX 3050 Laptop (to be measured in phase 0).
  const PREFILL_TPS = 1000;  // prompt tokens per second
  const DECODE_TPS = 35;     // output tokens per second, single stream
  const parts = [
    { name: "gateway work (parse, auth, limits, tokenize)", ms: 1.5, color: "var(--c2)" },
    { name: "network hops (3 local)", ms: 0.6, color: "var(--c6)" },
    { name: "prefill (→ TTFT)", ms: (prompt / PREFILL_TPS) * 1000, color: "var(--c4)" },
    { name: "decode", ms: (output / DECODE_TPS) * 1000, color: "var(--c1)" },
  ];
  const total = parts.reduce((s, p) => s + p.ms, 0);
  const ttft = parts[0].ms + parts[1].ms + parts[2].ms;
  let x = 0;
  return (
    <Viz title="Where does the time go?" hint="Move the sliders. Numbers are planning estimates for our GPU, to be replaced by real measurements in phase 0."
      caption={<>Time to first token ≈ <b>{(ttft / 1000).toFixed(2)} s</b>, total ≈ <b>{(total / 1000).toFixed(1)} s</b>. Our own code (orange + teal) is about <b>{((parts[0].ms + parts[1].ms) / total * 100).toFixed(2)}%</b> of the total.</>}>
      <div className="controls">
        <Slider label="Prompt tokens" value={prompt} min={50} max={6000} step={50} onChange={setPrompt} />
        <Slider label="Output tokens" value={output} min={10} max={1000} step={10} onChange={setOutput} />
      </div>
      <Svg w={720} h={120} label="latency bar">
        {parts.map((p, i) => {
          const w = Math.max(2, (p.ms / total) * 700);
          const r = <rect key={i} x={10 + x} y={20} width={w} height={34} fill={p.color} rx={3} />;
          x += w;
          return r;
        })}
        {parts.map((p, i) => (
          <g key={"l" + i}>
            <rect x={10 + (i % 2) * 360} y={70 + Math.floor(i / 2) * 22} width={12} height={12} fill={p.color} rx={2} />
            <text x={28 + (i % 2) * 360} y={80 + Math.floor(i / 2) * 22} fontSize={12} fill="var(--text)">{p.name}: {p.ms < 10 ? p.ms.toFixed(1) : Math.round(p.ms)} ms</text>
          </g>
        ))}
      </Svg>
    </Viz>
  );
}

const FAILURES = {
  badkey: { at: "Step 4 (auth)", status: "401 authentication_error", what: "Nothing is queued, no GPU is used, nothing is billed." },
  ratelimit: { at: "Step 6 (limits)", status: "429 rate_limit_error + retry-after", what: "The client should wait retry-after seconds. Official SDKs retry automatically." },
  overloaded: { at: "Step 7 (scheduler admission)", status: "503 overloaded_error + retry-after", what: "The rate-limit reservation is refunded. Load shedding protects the people already being served." },
  disconnect: { at: "Step 10 (during decode)", status: "(client is gone, nothing to send)", what: "Dropping the connection cancels the request in the gateway, scheduler and worker; the worker frees its KV memory at once. Tokens already generated ARE billed." },
  crash: { at: "Step 10 (worker dies)", status: "SSE error event, then stream closes", what: "Scheduler notices missing heartbeats and stops sending work to that worker. Tokens already delivered are billed; we do not silently retry a half-finished answer." },
} as const;

export default function Page() {
  const [fail, setFail] = useState<keyof typeof FAILURES>("disconnect");
  const f = FAILURES[fail];
  return (
    <>
      <PageHeader
        kicker="Start here"
        title="Life of one request"
        subtitle="Follow a single chat request from the user's laptop, through every Kiln component, to the bill."
        learn={[
          "The 14 steps of a streaming chat request",
          "Which component does what, and in which order",
          "Where the time is really spent",
          "What happens when things go wrong",
        ]}
      />

      <Section title="Step by step">
        <p>Press <b>Next</b> to move the request through the system. The highlighted boxes are the ones working in that step.</p>
        <Stepper
          title="POST /v1/chat/completions (stream: true)"
          steps={STEPS.map((s) => ({
            title: s.title,
            body: (
              <>
                <ArchDiagram active={s.nodes} activeEdges={s.edges} />
                {s.text}
                {s.code && <Code lang={s.code.lang}>{s.code.src}</Code>}
              </>
            ),
          }))}
        />
        <Callout kind="idea">
          <p>
            The order is deliberate: <b>cheapest checks first</b>. Parsing costs microseconds, a cache lookup
            nanoseconds, a GPU second costs real money. Every request we reject early is GPU time saved for a request
            that will succeed.
          </p>
        </Callout>
      </Section>

      <Section title="Where does the time go?">
        <LatencyBudget />
        <p>
          The lesson here: our gateway, scheduler and network add about two milliseconds. The model takes seconds. So
          for <b>speed</b>, the engine is what matters. But for <b>correctness</b> (who pays, who waits, who is blocked),
          the platform is what matters. That's why we treat both seriously.
        </p>
        <Callout kind="deep">
          <p>
            Users feel two numbers: <b>TTFT</b> (time to first token — how long until text starts appearing) and{" "}
            <b>tokens per second</b> (how fast the text then flows). Streaming exists because a 6-second answer that
            starts after 0.4 s feels fast, while the same answer delivered all at once after 6 s feels broken.
          </p>
        </Callout>
        <Quiz
          q="A user complains that answers start slowly, but stream fast after that. Which part should you investigate first?"
          options={["Decode speed", "Prefill / TTFT (long prompts, queueing)", "The usage-worker"]}
          answer={1}
          explain="Slow start = high TTFT. Causes: long prompts (prefill work), waiting in the scheduler queue, or no prefix cache reuse. Decode speed only affects how fast text flows after it starts."
        />
      </Section>

      <Section title="When things go wrong">
        <p>A production system is defined by its failure paths. Pick a failure:</p>
        <div className="viz">
          <div className="controls">
            <Seg options={Object.keys(FAILURES) as (keyof typeof FAILURES)[]} value={fail} onChange={setFail}
              labels={{ badkey: "bad key", ratelimit: "rate limited", overloaded: "overloaded", disconnect: "client leaves", crash: "worker crash" }} />
          </div>
          <div className="card fade-in" key={fail}>
            <p><b>Stops at:</b> {f.at}</p>
            <p><b>Client sees:</b> <code>{f.status}</code></p>
            <p><b>What else happens:</b> {f.what}</p>
          </div>
        </div>
        <Callout kind="warn">
          <p>
            The "client leaves" case is a classic production bug. If the worker does not notice that the client has
            disconnected, it keeps generating tokens for nobody, wasting GPU time and memory. In Rust we get
            cancellation almost for free: dropping a future cancels it (see <Link to="/rust-concurrency">Threads, async & channels</Link>).
          </p>
        </Callout>
        <Quiz
          q="Why does the gateway refund part of the output-token reservation at the end?"
          options={[
            "Because it reserved max_tokens before knowing the real output length",
            "Because the client asked for a refund",
            "To make the bill smaller",
          ]}
          answer={0}
          explain="Before generation we don't know how long the answer will be, so we reserve the worst case (max_tokens) in the rate limiter. At the end we know the real number and give back the rest. This only affects rate limits; billing always uses the real counts."
        />
      </Section>

      <Recap items={[
        "Gateway: parse → authenticate → count tokens → check limits and credit. Cheapest checks first.",
        "Scheduler: fair queue per model, reject early when full, pick the worker with free KV memory.",
        "Worker: prefill (sets TTFT) then decode (one token per step, batched), streamed back as SSE.",
        "Usage event → kiln-log → usage-worker → Postgres; billing is idempotent and off the hot path.",
        "Every failure has a defined, fast answer; disconnects free GPU memory immediately.",
      ]} />
    </>
  );
}
