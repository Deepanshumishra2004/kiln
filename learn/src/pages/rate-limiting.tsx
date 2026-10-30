import { useEffect, useMemo, useState } from "react";
import {
  Callout, Code, PageHeader, Quiz, Recap, Section, Seg, Slider, Stepper, Svg, Viz,
} from "../components/ui";

/* ---------- Visual 1: live token bucket ---------- */

type Mark = { t: number; ok: boolean };

function TokenBucketSim() {
  const [cap, setCap] = useState(10);
  const [rate, setRate] = useState(2);          // tokens per second
  const [auto, setAuto] = useState(0);          // auto requests per second
  const [cost, setCost] = useState(1);
  const [st, setSt] = useState({ tokens: 10, t: 0, marks: [] as Mark[], last: "" });
  const [running, setRunning] = useState(true);

  // simulation clock: 10 ticks per second
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setSt((s) => {
        const t = s.t + 0.1;
        let tokens = Math.min(cap, s.tokens + rate * 0.1);
        let marks = s.marks;
        let last = s.last;
        // auto traffic: evenly spaced requests at `auto` per second
        const n = Math.floor(t * auto + 1e-9) - Math.floor((t - 0.1) * auto + 1e-9);
        for (let i = 0; i < n; i++) {
          if (tokens >= cost) { tokens -= cost; marks = [...marks, { t, ok: true }]; }
          else { marks = [...marks, { t, ok: false }]; last = `429 — retry-after ${((cost - tokens) / rate).toFixed(2)} s`; }
        }
        return { tokens, t, marks: marks.filter((m) => m.t > t - 20), last };
      });
    }, 100);
    return () => clearInterval(id);
  }, [running, cap, rate, auto, cost]);

  const send = () => setSt((s) => {
    if (s.tokens >= cost) return { ...s, tokens: s.tokens - cost, marks: [...s.marks, { t: s.t, ok: true }], last: `200 — ${(s.tokens - cost).toFixed(1)} tokens left` };
    const wait = (cost - s.tokens) / rate;
    return { ...s, marks: [...s.marks, { t: s.t, ok: false }], last: `429 rate_limit_exceeded — retry-after ${wait.toFixed(2)} s` };
  });
  const burst = () => { for (let i = 0; i < 8; i++) send(); };

  const okCount = st.marks.filter((m) => m.ok).length;
  const noCount = st.marks.length - okCount;
  const fillH = (st.tokens / cap) * 150;

  return (
    <Viz title="Token bucket — try to break it"
      hint="Each request costs tokens. The bucket refills at a steady rate and never holds more than its capacity. Click fast, burst, or turn on automatic traffic."
      caption={`Long-run limit = refill rate = ${rate}/s = ${rate * 60}/min. Short bursts up to ${cap} are allowed. Last 20 s: ${okCount} allowed, ${noCount} rejected.`}>
      <div className="controls">
        <Slider label="capacity (burst size)" value={cap} min={1} max={30} onChange={(v) => { setCap(v); setSt((s) => ({ ...s, tokens: Math.min(s.tokens, v) })); }} />
        <Slider label="refill rate (tokens/s)" value={rate} min={0.5} max={10} step={0.5} onChange={setRate} />
        <Slider label="cost per request" value={cost} min={1} max={5} onChange={setCost} />
        <Slider label="auto traffic (req/s)" value={auto} min={0} max={10} onChange={setAuto} />
      </div>
      <div className="controls">
        <button className="btn primary" onClick={send}>send 1 request</button>
        <button className="btn" onClick={burst}>burst of 8</button>
        <button className="btn" onClick={() => setRunning(!running)}>{running ? "pause clock" : "resume clock"}</button>
        <button className="btn" onClick={() => setSt({ tokens: cap, t: 0, marks: [], last: "" })}>reset</button>
      </div>
      <Svg w={720} h={200} label="bucket and timeline">
        {/* bucket */}
        <text x={70} y={18} textAnchor="middle" fontSize={12} fill="var(--muted)">+{rate}/s ↓</text>
        <rect x={20} y={30} width={100} height={150} rx={6} fill="var(--panel-2)" stroke="var(--border)" strokeWidth={2} />
        <rect x={22} y={180 - fillH} width={96} height={Math.max(0, fillH - 2)} rx={4} fill="var(--c1)" opacity={0.75} style={{ transition: "all .1s" }} />
        <text x={70} y={110} textAnchor="middle" fontSize={16} fontWeight={700} fill="var(--text)">{st.tokens.toFixed(1)}</text>
        <text x={70} y={196} textAnchor="middle" fontSize={11} fill="var(--muted)">of {cap}</text>
        {/* timeline */}
        <text x={150} y={22} fontSize={12} fill="var(--muted)">last 20 seconds (green = allowed, red = 429)</text>
        <line x1={150} y1={150} x2={710} y2={150} stroke="var(--border)" />
        {st.marks.map((m, i) => {
          const x = 150 + ((m.t - (st.t - 20)) / 20) * 560;
          return <rect key={i} x={x} y={m.ok ? 60 : 105} width={3} height={40} fill={m.ok ? "var(--c3)" : "var(--c5)"} />;
        })}
        <text x={150} y={170} fontSize={11} fill="var(--muted)">-20 s</text>
        <text x={710} y={170} textAnchor="end" fontSize={11} fill="var(--muted)">now</text>
      </Svg>
      {st.last && <div className="card small mono">{st.last}</div>}
    </Viz>
  );
}

/* ---------- Visual 2: fixed window vs token bucket at a boundary ---------- */

function WindowCompare() {
  const [algo, setAlgo] = useState<"fixed" | "bucket">("fixed");
  const LIMIT = 60; // per minute
  // attacker sends 60 requests at t=59.5s and 60 more at t=60.5s
  const result = useMemo(() => {
    const reqs = [...Array(60).fill(59.5), ...Array(60).fill(60.5)];
    let allowed = 0;
    if (algo === "fixed") {
      const counts: Record<number, number> = {};
      for (const t of reqs) {
        const w = Math.floor(t / 60);
        counts[w] = (counts[w] ?? 0) + 1;
        if (counts[w] <= LIMIT) allowed++;
      }
    } else {
      let tokens = LIMIT, last = 0;
      for (const t of reqs) {
        tokens = Math.min(LIMIT, tokens + (t - last) * (LIMIT / 60));
        last = t;
        if (tokens >= 1) { tokens -= 1; allowed++; }
      }
    }
    return allowed;
  }, [algo]);

  return (
    <Viz title="Why not a simple 'per-minute counter'?"
      hint="Limit: 60 requests/minute. An attacker sends 60 requests at 0:59.5 and 60 more at 1:00.5 — one second apart, across a window boundary.">
      <div className="controls"><Seg options={["fixed", "bucket"] as const} value={algo} onChange={setAlgo} labels={{ fixed: "fixed window counter", bucket: "token bucket" }} /></div>
      <Svg w={720} h={130} label="timeline across a minute boundary">
        <line x1={20} y1={80} x2={700} y2={80} stroke="var(--border)" strokeWidth={2} />
        <line x1={360} y1={30} x2={360} y2={100} stroke="var(--muted)" strokeDasharray="4 4" />
        <text x={360} y={118} textAnchor="middle" fontSize={11} fill="var(--muted)">1:00 window boundary</text>
        <text x={180} y={24} textAnchor="middle" fontSize={12} fill="var(--muted)">window 0:00–1:00</text>
        <text x={540} y={24} textAnchor="middle" fontSize={12} fill="var(--muted)">window 1:00–2:00</text>
        <rect x={330} y={40} width={22} height={40} fill="var(--c1)" />
        <text x={341} y={36} textAnchor="middle" fontSize={11} fill="var(--text)">60</text>
        <rect x={368} y={40} width={22} height={40} fill="var(--c2)" />
        <text x={379} y={36} textAnchor="middle" fontSize={11} fill="var(--text)">60</text>
      </Svg>
      <div className="card">
        Allowed: <b style={{ color: result > LIMIT + 1 ? "var(--c5)" : "var(--c3)" }}>{result}</b> of 120 requests within ~1 second.{" "}
        {algo === "fixed"
          ? "❌ Each window sees only 60, so all 120 pass. The real burst is 2× the limit."
          : "✅ The bucket was empty after the first 60; in 1 s it refilled only 1 token. The burst is capped at capacity."}
      </div>
    </Viz>
  );
}

/* ---------- Visual 3: reserve & refund ---------- */

function ReserveRefund() {
  const OTPM = 10000;
  const [maxTokens, setMaxTokens] = useState(4000);
  const [actual, setActual] = useState(300);
  const [phase, setPhase] = useState<"before" | "reserved" | "refunded">("before");
  const used = Math.min(actual, maxTokens);
  const remaining = phase === "before" ? OTPM : phase === "reserved" ? OTPM - maxTokens : OTPM - used;
  const seg = (v: number) => `${(v / OTPM) * 100}%`;

  return (
    <Viz title="Output tokens: reserve first, refund later"
      hint="We do not know how long the answer will be. So we reserve max_tokens when the request arrives, then give back what was not used."
      caption={phase === "reserved"
        ? `While this request runs, ${maxTokens.toLocaleString()} OTPM tokens are locked. Another request now sees only ${remaining.toLocaleString()} left.`
        : phase === "refunded" ? `Refunded ${(maxTokens - used).toLocaleString()}. Net cost = the ${used.toLocaleString()} tokens actually generated.` : "Press 'request arrives'."}>
      <div className="controls">
        <Slider label="max_tokens in the request" value={maxTokens} min={100} max={8000} step={100} onChange={(v) => { setMaxTokens(v); setPhase("before"); }} />
        <Slider label="tokens the model really produced" value={actual} min={10} max={8000} step={10} onChange={(v) => { setActual(v); setPhase("before"); }} />
      </div>
      <div className="controls">
        <button className="btn primary" disabled={phase !== "before"} onClick={() => setPhase("reserved")}>1. request arrives → reserve</button>
        <button className="btn primary" disabled={phase !== "reserved"} onClick={() => setPhase("refunded")}>2. stream ends → refund</button>
        <button className="btn" onClick={() => setPhase("before")}>reset</button>
      </div>
      <div className="small muted">OTPM bucket for this org (10,000 / minute)</div>
      <div style={{ display: "flex", height: 30, borderRadius: 6, overflow: "hidden", border: "1px solid var(--border)", background: "var(--panel-2)" }}>
        {phase !== "before" && <div style={{ width: seg(phase === "reserved" ? maxTokens : used), background: phase === "reserved" ? "var(--c2)" : "var(--c5)", transition: "width .4s" }} />}
        <div style={{ width: seg(remaining), background: "var(--c3)", opacity: 0.6, transition: "width .4s" }} />
      </div>
      <div className="small" style={{ marginTop: 6 }}>remaining: <b>{remaining.toLocaleString()}</b></div>
    </Viz>
  );
}

/* ---------- Page ---------- */

export default function Page() {
  return (
    <>
      <PageHeader
        kicker="Platform · Lesson 4"
        title="Rate limiting"
        subtitle="The GPU is small and shared. Rate limits make sure no single customer can take all of it, and that a bug in someone's loop cannot drain their wallet."
        learn={[
          "Why limits exist and the four dimensions: RPM, ITPM, OTPM, concurrency",
          "The token bucket algorithm — with a live simulator",
          "Why fixed-window counters are wrong at the edges",
          "GCRA: the same idea stored as a single timestamp",
          "Reserve-then-refund for output tokens, concurrency leases, and the response headers",
          "A Rust token bucket behind a LimitStore trait",
        ]}
      />

      <Section title="Why limit at all?">
        <p>Our GPU can serve maybe 3–5 conversations at the same time. Without limits:</p>
        <ul>
          <li>One customer's buggy <code>while(true)</code> loop fills every slot. Everyone else gets errors.</li>
          <li>A leaked key is used by strangers until the owner's credit is gone.</li>
          <li>A sudden spike makes every request slow, instead of a few being rejected quickly.</li>
        </ul>
        <Callout kind="analogy">
          A rate limit is like a metro turnstile. It does not stop people from travelling. It stops 500 people from pushing
          through the same gate in one second, so the platform does not overflow.
        </Callout>
        <p>We measure four things (doc 05), per <b>org × model</b>, optionally narrowed per key:</p>
        <table>
          <thead><tr><th>Dimension</th><th>Counts</th><th>Protects</th></tr></thead>
          <tbody>
            <tr><td><b>RPM</b></td><td>requests per minute</td><td>per-request overhead; stops tight loops</td></tr>
            <tr><td><b>ITPM</b></td><td>input tokens per minute</td><td>prefill compute + KV memory</td></tr>
            <tr><td><b>OTPM</b></td><td>output tokens per minute</td><td>decode time — the most expensive part</td></tr>
            <tr><td><b>Concurrency</b></td><td>requests in flight right now</td><td>KV cache one customer can hold</td></tr>
          </tbody>
        </table>
        <p>A request must pass <b>all</b> buckets that apply to it. If any one says no, nothing is debited from the others.</p>
      </Section>

      <Section title="Step 1 — The token bucket">
        <p>
          Imagine a bucket holding up to <b>C</b> tokens. Tokens drip in at a steady rate <b>R</b> per second. Each request
          takes tokens out. If there are not enough tokens, the request is rejected with <code>429</code> and told how long to
          wait.
        </p>
        <ul>
          <li><b>R</b> (refill rate) sets the <b>long-run average</b>: 60 RPM → R = 1 token/s.</li>
          <li><b>C</b> (capacity) sets the <b>allowed burst</b>: a quiet client can send C requests at once.</li>
          <li><b>retry-after</b> = (tokens needed − tokens available) / R. Exact, not a guess.</li>
        </ul>
        <TokenBucketSim />
        <Callout kind="idea">
          We never run a timer to "add tokens". We store only <code>tokens</code> and <code>last_update_time</code>. When a request
          arrives, we compute how many tokens <i>would have</i> dripped in since then: <code>tokens = min(C, tokens + (now − last) × R)</code>.
          Lazy math, zero background work, works for millions of buckets.
        </Callout>
        <WindowCompare />
        <Quiz
          q="RPM limit is 60 (capacity 60, refill 1/s). A client was idle for 10 minutes, then sends 100 requests instantly. How many are allowed?"
          options={["100 — they were idle for a long time", "60 — the bucket cannot hold more than its capacity", "10", "1"]}
          answer={1}
          explain="Idle time refills the bucket only up to capacity. 60 pass immediately, the other 40 get 429 with retry-after of 1–40 seconds."
        />
      </Section>

      <Section title="Step 2 — GCRA: a token bucket in one number">
        <p>
          The <b>Generic Cell Rate Algorithm</b> (from old telephone networks) is mathematically the same as a token bucket,
          but stores a single value: the <b>TAT</b> (theoretical arrival time) — "when would this client be fully caught up?"
        </p>
        <Code lang="text" title="GCRA in 4 lines">{`
T   = 1 / rate               (time "cost" of one request, e.g. 1 s for 60 RPM)
tau = T × (capacity − 1)     (how far ahead of schedule a client may be = burst)

on request at time now:
    tat = max(stored_tat, now)
    if tat − now > tau:  reject, retry_after = tat − now − tau
    else:                stored_tat = tat + T × cost ; allow
`}</Code>
        <p>
          One number per bucket instead of two, and no floating-point "tokens". This is what the <code>governor</code> crate and
          many CDNs use. Both work; we implement the token bucket first because it is easier to visualise, and the GCRA as an
          exercise.
        </p>
      </Section>

      <Section title="Step 3 — Output tokens: reserve, then refund">
        <p>
          ITPM is easy: we tokenize the prompt before admission, so we know the exact input count. OTPM is hard: the answer
          does not exist yet. The trick used by real providers:
        </p>
        <ReserveRefund />
        <Callout kind="warn">
          Side effect (documented for users, same as OpenAI): setting a huge <code>max_tokens</code> that you never use
          temporarily eats your OTPM headroom. Clients should set <code>max_tokens</code> realistically.
        </Callout>
        <h3>Concurrency: leases, not counters</h3>
        <p>
          "Requests in flight" sounds like a counter: +1 at start, −1 at end. But if the gateway crashes between +1 and −1, the
          slot leaks forever. Instead, each in-flight request holds a <b>lease</b> with an expiry time. The streaming task
          extends its lease every 30 s. Crash → lease expires → slot freed automatically.
        </p>
        <Stepper title="Concurrency lease lifecycle" steps={[
          { title: "Acquire", body: <p>Drop expired leases. If live leases &lt; limit → add <code>(request_id, expires = now + 60 s)</code>. Else 429.</p> },
          { title: "Renew", body: <p>Every 30 s while streaming: <code>expires = now + 60 s</code>.</p> },
          { title: "Release", body: <p>On finish/cancel: remove the lease. Slot is free immediately.</p> },
          { title: "Crash case", body: <p>Gateway dies, no release. After at most 60 s the lease expires and the slot comes back by itself.</p> },
        ]} />
      </Section>

      <Section title="Step 4 — Telling the client">
        <p>Clients behave well only if we tell them where they stand. Every response carries (doc 04):</p>
        <Code lang="http" title="response headers">{`
x-ratelimit-limit-requests: 60
x-ratelimit-remaining-requests: 59
x-ratelimit-reset-requests: 1s
x-ratelimit-limit-tokens: 40000
x-ratelimit-remaining-tokens: 39476
x-ratelimit-reset-tokens: 780ms
retry-after: 2                      (only on 429 / 503)
`}</Code>
        <Code lang="text" title="429 body (OpenAI-compatible)">{`
{"error": {"type": "rate_limit_error", "code": "rate_limit_exceeded",
           "message": "Rate limit reached for qwen3-4b: 60 requests per minute. Retry after 2s."}}
`}</Code>
        <p>Official SDKs read <code>retry-after</code> and retry with exponential backoff + jitter automatically.</p>
      </Section>

      <Section title="Step 5 — Rust: a token bucket behind a trait">
        <p>
          The original design kept buckets in Redis (shared by many gateways) with a Lua script. We have one gateway, so the
          <b>proposed</b> design keeps them in memory. To keep the door open for Redis (or our own KV server) later, all code
          talks to a <b>trait</b>, not to a concrete store.
        </p>
        <Code title="crates/gateway/src/ratelimit.rs">{`
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Instant;

#[derive(Clone, Copy)]
pub struct Bucket {
    tokens: f64,
    last: Instant,
}

pub struct Spec { pub key: String, pub capacity: f64, pub per_sec: f64, pub cost: f64 }

pub enum Decision {
    Allow,
    Deny { retry_after_s: f64, failed: usize },   // index of the bucket that said no
}

/// Anything that can check-and-debit several buckets atomically.
pub trait LimitStore: Send + Sync {
    fn check_and_debit(&self, specs: &[Spec]) -> Decision;
    fn refund(&self, key: &str, amount: f64, capacity: f64);
}

pub struct InMemoryStore {
    buckets: Mutex<HashMap<String, Bucket>>,
}

impl LimitStore for InMemoryStore {
    fn check_and_debit(&self, specs: &[Spec]) -> Decision {
        let now = Instant::now();
        let mut map = self.buckets.lock().unwrap();     // one lock = all-or-nothing

        // pass 1: refill and check every bucket, change nothing yet
        let mut new_values = Vec::with_capacity(specs.len());
        for (i, s) in specs.iter().enumerate() {
            let b = map.get(&s.key).copied()
                .unwrap_or(Bucket { tokens: s.capacity, last: now });
            let elapsed = now.duration_since(b.last).as_secs_f64();
            let tokens = (b.tokens + elapsed * s.per_sec).min(s.capacity);
            if tokens < s.cost {
                return Decision::Deny { retry_after_s: (s.cost - tokens) / s.per_sec, failed: i };
            }
            new_values.push(tokens - s.cost);
        }
        // pass 2: everything passed -> debit all
        for (s, t) in specs.iter().zip(new_values) {
            map.insert(s.key.clone(), Bucket { tokens: t, last: now });
        }
        Decision::Allow
    }

    fn refund(&self, key: &str, amount: f64, capacity: f64) {
        if let Some(b) = self.buckets.lock().unwrap().get_mut(key) {
            b.tokens = (b.tokens + amount).min(capacity);
        }
    }
}
`}</Code>
        <Callout kind="rust">
          <ul style={{ margin: 0 }}>
            <li><code>trait LimitStore</code> is an interface. The gateway holds <code>Arc&lt;dyn LimitStore&gt;</code>, so we can swap <code>InMemoryStore</code> for a <code>RedisStore</code> without touching callers.</li>
            <li><code>Send + Sync</code> = "safe to share between threads". The compiler checks this for us.</li>
            <li><code>Mutex</code> makes the two passes atomic: no other request can see a half-debited state. The lock is held for microseconds, so it is fine at our scale. (Bigger systems shard the map to reduce contention.)</li>
          </ul>
        </Callout>
        <Callout kind="kiln">
          Usage in the gateway, per request: <code>[rpm:org:model cost 1, itpm:org:model cost input_tokens, otpm:org:model cost max_tokens]</code>,
          plus key-level buckets if the key has overrides. After the stream: <code>refund(otpm, max_tokens − output_tokens)</code>.
          The 4B model's tier table (Free: 3 RPM / 2,000 ITPM / 1,000 OTPM / 1 concurrent …) lives in Postgres.
        </Callout>
        <Quiz
          q="Why do we check ALL buckets before debiting ANY of them?"
          options={[
            "It is faster",
            "So a request rejected by OTPM does not still consume an RPM token",
            "Rust requires it",
            "To allow bursts",
          ]}
          answer={1}
          explain="If we debited RPM and then OTPM said no, the client would lose an RPM token for a request that never ran. Check-all-then-debit-all keeps the buckets honest."
        />
      </Section>

      <Recap items={[
        "Limits protect the shared GPU and the customer's wallet; we limit RPM, ITPM, OTPM and concurrency.",
        "Token bucket: refill rate = average limit, capacity = burst. Lazy refill math, no timers.",
        "Fixed-window counters allow 2× bursts at window edges; buckets do not.",
        "GCRA stores one timestamp (TAT) and is equivalent to a token bucket.",
        "Output tokens: reserve max_tokens, refund the unused part when the stream ends.",
        "Concurrency uses expiring leases so crashes cannot leak slots.",
        "Proposed: in-memory buckets behind trait LimitStore; Redis stays optional.",
      ]} />
    </>
  );
}
