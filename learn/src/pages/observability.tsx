import { useMemo, useState } from "react";
import {
  Callout, Code, PageHeader, Quiz, Recap, Section, Seg, Slider, Svg, Viz,
} from "../components/ui";

/* ---------- seeded random (so charts are stable) ---------- */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}
function gauss(r: () => number) {
  const u = Math.max(r(), 1e-9), v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function pct(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

/* ---------- Visual 1: live Prometheus exporter ---------- */

const BUCKETS = [0.25, 0.5, 1, 2.5, 5];

function Exporter() {
  const [st, setSt] = useState({ ok: 0, err429: 0, inflight: 0, hist: BUCKETS.map(() => 0), count: 0, sum: 0, seed: 7 });

  const request = (kind: "ok" | "429") => setSt((s) => {
    const r = rng(s.seed);
    const ttft = Math.exp(Math.log(0.4) + 0.7 * gauss(r));
    const hist = s.hist.map((c, i) => (ttft <= BUCKETS[i] ? c + 1 : c));
    return kind === "ok"
      ? { ...s, ok: s.ok + 1, hist, count: s.count + 1, sum: s.sum + ttft, seed: s.seed + 1 }
      : { ...s, err429: s.err429 + 1, seed: s.seed + 1 };
  });

  const text = [
    "# HELP gateway_requests_total Requests handled by the gateway.",
    "# TYPE gateway_requests_total counter",
    `gateway_requests_total{model="qwen3-4b",status_code="200"} ${st.ok}`,
    `gateway_requests_total{model="qwen3-4b",status_code="429"} ${st.err429}`,
    "# HELP gateway_inflight_requests Requests currently streaming.",
    "# TYPE gateway_inflight_requests gauge",
    `gateway_inflight_requests{model="qwen3-4b"} ${st.inflight}`,
    "# HELP gateway_ttft_seconds Time to first token.",
    "# TYPE gateway_ttft_seconds histogram",
    ...BUCKETS.map((b, i) => `gateway_ttft_seconds_bucket{model="qwen3-4b",le="${b}"} ${st.hist[i]}`),
    `gateway_ttft_seconds_bucket{model="qwen3-4b",le="+Inf"} ${st.count}`,
    `gateway_ttft_seconds_sum{model="qwen3-4b"} ${st.sum.toFixed(3)}`,
    `gateway_ttft_seconds_count{model="qwen3-4b"} ${st.count}`,
  ].join("\n");

  return (
    <Viz title="Be the exporter: what Prometheus sees at GET /metrics"
      hint="Click to simulate traffic. The text on the right is exactly what our exporter must print. Prometheus downloads it every 15 s ('scrape')."
      caption="Counters only go up. Gauges go up and down. Histogram buckets are cumulative: le='1' counts every request with TTFT ≤ 1 s (including those ≤ 0.5).">
      <div className="controls">
        <button className="btn primary" onClick={() => request("ok")}>200 request</button>
        <button className="btn" onClick={() => request("429")}>429 rejected</button>
        <button className="btn" onClick={() => setSt((s) => ({ ...s, inflight: s.inflight + 1 }))}>stream starts (+1 inflight)</button>
        <button className="btn" disabled={st.inflight === 0} onClick={() => setSt((s) => ({ ...s, inflight: s.inflight - 1 }))}>stream ends (−1)</button>
        <button className="btn" onClick={() => { for (let i = 0; i < 20; i++) request("ok"); }}>+20 requests</button>
      </div>
      <Code lang="text" title="GET /metrics  (text/plain; version=0.0.4)">{text}</Code>
    </Viz>
  );
}

/* ---------- Visual 2: latency histogram + percentiles ---------- */

function LatencyHistogram() {
  const [median, setMedian] = useState(400);    // ms
  const [spread, setSpread] = useState(0.5);
  const [slowPct, setSlowPct] = useState(3);    // % of requests that hit a slow path (cold prefix, queue)
  const [n, setN] = useState(2000);

  const data = useMemo(() => {
    const r = rng(42);
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      let v = Math.exp(Math.log(median) + spread * gauss(r));
      if (r() * 100 < slowPct) v += 2000 + r() * 4000;     // queueing / long prompt outliers
      out.push(v);
    }
    return out.sort((a, b) => a - b);
  }, [median, spread, slowPct, n]);

  const p50 = pct(data, 50), p95 = pct(data, 95), p99 = pct(data, 99);
  const mean = data.reduce((a, b) => a + b, 0) / data.length;
  const maxX = Math.max(p99 * 1.25, 1500);
  const BINS = 50;
  const counts = new Array(BINS).fill(0);
  for (const v of data) counts[Math.min(BINS - 1, Math.floor((v / maxX) * BINS))]++;
  const maxC = Math.max(...counts, 1);
  const X = (v: number) => 40 + (Math.min(v, maxX) / maxX) * 660;

  const line = (v: number, label: string, color: string, row: number) => (
    <g>
      <line x1={X(v)} y1={20} x2={X(v)} y2={170} stroke={color} strokeWidth={2} strokeDasharray={label === "mean" ? "4 3" : undefined} />
      <text x={X(v) + 4} y={30 + row * 14} fontSize={11} fill={color} fontWeight={600}>{label} {v.toFixed(0)}ms</text>
    </g>
  );

  return (
    <Viz title="Latency is a distribution, not a number"
      hint="Simulated TTFT for many requests. Add a few slow outliers (queueing, long prompts) and watch the average and p99 move very differently."
      caption={`p50 = half the users wait less than ${p50.toFixed(0)} ms. p99 = 1 in 100 waits more than ${p99.toFixed(0)} ms. The mean (${mean.toFixed(0)} ms) describes almost nobody.`}>
      <div className="controls">
        <Slider label="typical TTFT (median, ms)" value={median} min={100} max={1500} step={50} onChange={setMedian} />
        <Slider label="spread" value={spread} min={0.1} max={1} step={0.05} onChange={setSpread} />
        <Slider label="slow outliers (%)" value={slowPct} min={0} max={20} step={0.5} onChange={setSlowPct} />
        <Slider label="requests" value={n} min={100} max={5000} step={100} onChange={setN} />
      </div>
      <Svg w={720} h={200} label="latency histogram">
        {counts.map((c, i) => (
          <rect key={i} x={40 + (i / BINS) * 660} y={170 - (c / maxC) * 140} width={660 / BINS - 1} height={(c / maxC) * 140} fill="var(--c1)" opacity={0.6} />
        ))}
        <line x1={40} y1={170} x2={700} y2={170} stroke="var(--border)" />
        <text x={40} y={188} fontSize={11} fill="var(--muted)">0 ms</text>
        <text x={700} y={188} textAnchor="end" fontSize={11} fill="var(--muted)">{maxX.toFixed(0)} ms (later values piled in last bar)</text>
        {line(p50, "p50", "var(--c3)", 0)}
        {line(mean, "mean", "var(--c4)", 1)}
        {line(p95, "p95", "var(--c2)", 2)}
        {line(p99, "p99", "var(--c5)", 3)}
      </Svg>
    </Viz>
  );
}

/* ---------- Visual 3: trace waterfall ---------- */

type Span = { name: string; svc: "gateway" | "scheduler" | "worker"; start: number; dur: number; depth: number; note: string };

function TraceWaterfall() {
  const [queue, setQueue] = useState(120);
  const [prompt, setPrompt] = useState(1240);
  const [cached, setCached] = useState(1024);
  const [out, setOut] = useState(312);
  const [cacheHit, setCacheHit] = useState<"hit" | "miss">("hit");
  const [sel, setSel] = useState(0);

  const spans = useMemo(() => {
    const c = Math.min(cached, prompt);
    const auth = cacheHit === "hit" ? 0.3 : 2.1;
    const tok = 0.6 + prompt / 1200;
    const rl = 0.2, quota = 0.2;
    const prefill = 8 + (prompt - c) * 0.22;           // ~4.5k tok/s uncached prefill
    const decode = out * 23;                           // ~43 tok/s
    const t0 = 0;
    const tAuth = t0 + 0.1;
    const tTok = tAuth + auth;
    const tRl = tTok + tok;
    const tQ = tRl + rl;
    const tSub = tQ + quota;
    const tGen = tSub + queue;
    const end = tGen + prefill + decode;
    const s: Span[] = [
      { name: "POST /v1/chat/completions", svc: "gateway", start: t0, dur: end + 0.5, depth: 0, note: "whole request as the client sees it" },
      { name: `auth (cache ${cacheHit})`, svc: "gateway", start: tAuth, dur: auth, depth: 1, note: cacheHit === "hit" ? "hash + in-process cache" : "cache miss → Postgres lookup" },
      { name: "tokenize", svc: "gateway", start: tTok, dur: tok, depth: 1, note: `${prompt} input tokens counted` },
      { name: "ratelimit.check", svc: "gateway", start: tRl, dur: rl, depth: 1, note: "in-process buckets (proposed)" },
      { name: "quota.check", svc: "gateway", start: tQ, dur: quota, depth: 1, note: "balance + spend cap" },
      { name: "scheduler.submit", svc: "scheduler", start: tSub, dur: queue + prefill + decode, depth: 1, note: "kiln-wire stream" },
      { name: "queue.wait", svc: "scheduler", start: tSub, dur: queue, depth: 2, note: "waiting for a free GPU slot" },
      { name: "worker.generate", svc: "worker", start: tGen, dur: prefill + decode, depth: 2, note: "worker-gpu-0" },
      { name: `prefill (${prompt - c} new, ${c} cached)`, svc: "worker", start: tGen, dur: prefill, depth: 3, note: "one parallel pass over the prompt" },
      { name: `decode (${out} tokens)`, svc: "worker", start: tGen + prefill, dur: decode, depth: 3, note: `${(1000 / 23).toFixed(0)} tok/s` },
      { name: "usage.emit", svc: "gateway", start: end, dur: 0.4, depth: 1, note: "append to kiln-log" },
    ];
    return { s, ttft: tGen + prefill, total: end + 0.5, tpot: 23 };
  }, [queue, prompt, cached, out, cacheHit]);

  const scale = 520 / spans.total;
  const svcColor = { gateway: 1, scheduler: 4, worker: 2 } as const;

  return (
    <Viz title="A trace: where did 7 seconds go?"
      hint="One trace = a tree of timed spans across services, joined by the same trace id. Change the inputs, click a span for details."
      caption={<>TTFT = <b>{spans.ttft.toFixed(0)} ms</b> (everything before the first token) · TPOT ≈ <b>{spans.tpot} ms</b>/token · total <b>{(spans.total / 1000).toFixed(2)} s</b>. Selected: <b>{spans.s[sel].name}</b> — {spans.s[sel].dur.toFixed(1)} ms, {spans.s[sel].note}.</>}>
      <div className="controls">
        <Seg options={["hit", "miss"] as const} value={cacheHit} onChange={setCacheHit} labels={{ hit: "auth cache hit", miss: "auth cache miss" }} />
        <Slider label="queue wait (ms)" value={queue} min={0} max={3000} step={10} onChange={setQueue} />
        <Slider label="prompt tokens" value={prompt} min={50} max={6000} step={10} onChange={setPrompt} />
        <Slider label="cached prefix tokens" value={Math.min(cached, prompt)} min={0} max={prompt} step={16} onChange={setCached} />
        <Slider label="output tokens" value={out} min={1} max={1000} onChange={setOut} />
      </div>
      <Svg w={720} h={spans.s.length * 24 + 20} label="trace waterfall">
        {spans.s.map((sp, i) => {
          const y = 8 + i * 24;
          return (
            <g key={i} onClick={() => setSel(i)} style={{ cursor: "pointer" }}>
              {i === sel && <rect x={0} y={y - 3} width={720} height={22} fill="var(--accent-soft)" />}
              <text x={4 + sp.depth * 10} y={y + 12} fontSize={11} fill="var(--text)">{sp.name.length > 26 ? sp.name.slice(0, 25) + "…" : sp.name}</text>
              <rect x={190 + sp.start * scale} y={y} width={Math.max(2, sp.dur * scale)} height={16} rx={3} fill={`var(--c${svcColor[sp.svc]})`} opacity={0.8} />
              <text x={Math.min(190 + (sp.start + sp.dur) * scale + 4, 680)} y={y + 12} fontSize={10} fill="var(--muted)">{sp.dur >= 1000 ? `${(sp.dur / 1000).toFixed(2)}s` : `${sp.dur.toFixed(1)}ms`}</text>
            </g>
          );
        })}
        <line x1={190 + spans.ttft * scale} y1={0} x2={190 + spans.ttft * scale} y2={spans.s.length * 24 + 10} stroke="var(--c5)" strokeDasharray="4 3" />
      </Svg>
      <div className="small"><span style={{ color: "var(--c1)" }}>■ gateway</span> · <span style={{ color: "var(--c4)" }}>■ scheduler</span> · <span style={{ color: "var(--c2)" }}>■ worker</span> · <span style={{ color: "var(--c5)" }}>┆ first token</span></div>
    </Viz>
  );
}

/* ---------- Visual 4: SLO error budget ---------- */

function ErrorBudget() {
  const [target, setTarget] = useState(99.5);
  const [reqs, setReqs] = useState(300000);
  const [failed, setFailed] = useState(600);
  const [day, setDay] = useState(10);
  const budget = Math.round(reqs * (1 - target / 100));
  const used = failed / Math.max(budget, 1);
  const expectedUse = day / 30;
  const burn = used / Math.max(expectedUse, 1e-9);
  return (
    <Viz title="SLO error budget"
      hint="An SLO of 99.5% over 30 days allows 0.5% of requests to fail. That allowance is the 'error budget'. Burn rate = how fast you spend it compared to plan."
      caption={`Budget = ${budget.toLocaleString()} failed requests per month. Used ${(used * 100).toFixed(0)}% after ${day} days (plan: ${(expectedUse * 100).toFixed(0)}%). Burn rate ${burn.toFixed(1)}× ${burn > 2 ? "→ alert! At this pace the budget runs out early." : "→ OK."}`}>
      <div className="controls">
        <Slider label="SLO target (%)" value={target} min={95} max={99.99} step={0.01} onChange={setTarget} format={(v) => v.toFixed(2)} />
        <Slider label="requests per month" value={reqs} min={10000} max={1000000} step={10000} onChange={setReqs} format={(v) => v.toLocaleString()} />
        <Slider label="failed (5xx) so far" value={failed} min={0} max={5000} step={10} onChange={setFailed} />
        <Slider label="day of month" value={day} min={1} max={30} onChange={setDay} />
      </div>
      <div style={{ position: "relative", height: 24, background: "var(--panel-2)", borderRadius: 6, border: "1px solid var(--border)", overflow: "hidden" }}>
        <div style={{ width: `${Math.min(100, used * 100)}%`, height: "100%", background: used > 1 ? "var(--c5)" : burn > 2 ? "var(--c2)" : "var(--c3)", transition: "width .2s" }} />
        <div style={{ position: "absolute", left: `${expectedUse * 100}%`, top: 0, bottom: 0, borderLeft: "2px dashed var(--text)" }} />
      </div>
      <div className="small muted">bar = budget used · dashed line = where you "should" be on day {day}</div>
    </Viz>
  );
}

/* ---------- Page ---------- */

export default function Page() {
  return (
    <>
      <PageHeader
        kicker="Platform · Lesson 7"
        title="Observability"
        subtitle="You cannot run a service you cannot see. Metrics tell you something is wrong, traces tell you where, logs tell you exactly what."
        learn={[
          "The three signals: metrics, traces, logs — and which question each answers",
          "Counters, gauges and histograms, and the Prometheus text format our exporter writes",
          "Why we report p50/p95/p99 and never trust the average",
          "TTFT and TPOT, and reading a trace waterfall across gateway → scheduler → worker",
          "SLOs, error budgets and burn-rate alerts; GPU metrics on a laptop",
        ]}
      />

      <Section title="Three signals, three questions">
        <div className="grid3">
          <div className="card"><h4 style={{ color: "var(--c1)" }}>📈 Metrics</h4><p className="small">Numbers aggregated over time. <b>"How much, how fast, how often?"</b> Cheap: a counter costs the same at 1 or 1 million requests.</p><p className="small muted">→ Prometheus + Grafana</p></div>
          <div className="card"><h4 style={{ color: "var(--c4)" }}>🧵 Traces</h4><p className="small">The timeline of <b>one</b> request across services. <b>"Where did this slow request spend its time?"</b></p><p className="small muted">→ OpenTelemetry → Jaeger</p></div>
          <div className="card"><h4 style={{ color: "var(--c2)" }}>📜 Logs</h4><p className="small">Individual events with details. <b>"What exactly happened?"</b> Most detailed, most expensive.</p><p className="small muted">→ JSON lines to files</p></div>
        </div>
        <Callout kind="analogy">
          A car: the dashboard (speed, fuel, temperature) is <b>metrics</b>. A GPS replay of one trip with every stop is a
          <b> trace</b>. The mechanic's notebook ("10:42 — oil pressure warning, code P0520") is <b>logs</b>.
        </Callout>
        <Callout kind="kiln">
          Every log line and span carries <code>request_id</code>, <code>org_id</code>, <code>model_id</code>. A customer quoting
          <code>x-request-id</code> in a support ticket leads straight to the trace and the logs.
        </Callout>
      </Section>

      <Section title="Step 1 — Metrics and the Prometheus format">
        <p>Three metric types cover almost everything:</p>
        <table>
          <thead><tr><th>Type</th><th>Behaviour</th><th>Kiln example</th></tr></thead>
          <tbody>
            <tr><td><b>Counter</b></td><td>only increases (reset on restart)</td><td><code>gateway_requests_total</code>, <code>gateway_tokens_total</code></td></tr>
            <tr><td><b>Gauge</b></td><td>current value, up or down</td><td><code>gateway_inflight_requests</code>, <code>worker_kv_blocks_free</code></td></tr>
            <tr><td><b>Histogram</b></td><td>counts observations into buckets</td><td><code>gateway_ttft_seconds</code>, <code>worker_batch_size</code></td></tr>
          </tbody>
        </table>
        <p>
          Prometheus <b>pulls</b>: every 15 s it calls <code>GET /metrics</code> on each service and stores the numbers with a
          timestamp. Rates are computed later: <code>rate(gateway_requests_total[5m])</code> = requests per second over 5 minutes.
        </p>
        <Exporter />
        <Callout kind="warn">
          <b>Labels multiply.</b> Each unique label combination is a separate time series stored forever. <code>model</code> has 2
          values — fine. <code>org_id</code> could have 10,000 — that kills Prometheus ("cardinality explosion"). Per-org numbers
          come from <code>usage_daily</code> in Postgres instead.
        </Callout>
        <h3>Our own exporter (proposed)</h3>
        <p>The format is plain text, so the exporter is small. The hot path only does atomic adds — no locks, no allocation:</p>
        <Code title="crates/common/src/metrics.rs (sketch)">{`
use std::fmt::Write;
use std::sync::atomic::{AtomicU64, Ordering::Relaxed};

pub struct Counter(AtomicU64);
impl Counter {
    pub fn inc(&self) { self.0.fetch_add(1, Relaxed); }
    pub fn get(&self) -> u64 { self.0.load(Relaxed) }
}

pub struct Histogram {
    bounds: &'static [f64],          // e.g. [0.25, 0.5, 1.0, 2.5, 5.0]
    counts: Vec<AtomicU64>,          // one per bound (non-cumulative here)
    count: AtomicU64,
    sum_micros: AtomicU64,           // f64 is not atomic; store the sum in integer µs
}

impl Histogram {
    pub fn observe(&self, secs: f64) {
        if let Some(i) = self.bounds.iter().position(|b| secs <= *b) {
            self.counts[i].fetch_add(1, Relaxed);
        }
        self.count.fetch_add(1, Relaxed);
        self.sum_micros.fetch_add((secs * 1e6) as u64, Relaxed);
    }

    pub fn render(&self, name: &str, labels: &str, out: &mut String) {
        let mut cumulative = 0;
        for (b, c) in self.bounds.iter().zip(&self.counts) {
            cumulative += c.load(Relaxed);                    // buckets are cumulative on output
            writeln!(out, "{name}_bucket{{{labels},le=\\"{b}\\"}} {cumulative}").unwrap();
        }
        let n = self.count.load(Relaxed);
        writeln!(out, "{name}_bucket{{{labels},le=\\"+Inf\\"}} {n}").unwrap();
        writeln!(out, "{name}_sum{{{labels}}} {}", self.sum_micros.load(Relaxed) as f64 / 1e6).unwrap();
        writeln!(out, "{name}_count{{{labels}}} {n}").unwrap();
    }
}
`}</Code>
        <Callout kind="rust">
          <ul style={{ margin: 0 }}>
            <li><code>AtomicU64::fetch_add</code> is a single CPU instruction (<code>lock xadd</code>) — many threads can add at once without a mutex.</li>
            <li><code>Ordering::Relaxed</code>: we only need the final count to be right, not ordering with other memory. Fastest option.</li>
            <li>In <code>format!</code>/<code>writeln!</code>, <code>{"{{"}</code> prints a literal <code>{"{"}</code>. So <code>{"{name}_bucket{{{labels}}}"}</code> prints <code>gateway_ttft_seconds_bucket{"{model=\"qwen3-4b\"}"}</code>.</li>
          </ul>
        </Callout>
      </Section>

      <Section title="Step 2 — Percentiles, not averages">
        <p>
          Latency is never one number. Most requests are fast; a few are very slow (long prompts, queueing, a cold cache). The
          <b> average</b> mixes them and describes nobody. Percentiles answer real questions:
        </p>
        <ul>
          <li><b>p50</b> (median): the typical user.</li>
          <li><b>p95</b>: the unlucky 1 in 20.</li>
          <li><b>p99</b>: the 1 in 100 — and an agent making 100 calls per task hits it <i>every task</i>.</li>
        </ul>
        <LatencyHistogram />
        <Callout kind="deep">
          Prometheus computes percentiles from histogram buckets with <code>histogram_quantile(0.95, …)</code>, interpolating
          inside a bucket. So bucket boundaries must be chosen around the values you care about (e.g. around the 1.5 s TTFT SLO).
          You cannot average percentiles across servers — but you can add bucket counts and then compute the percentile.
        </Callout>
        <Quiz
          q="p50 TTFT is 300 ms, p99 is 6 s, the average is 480 ms. What should the on-call engineer look at first?"
          options={[
            "Nothing, 480 ms average is good",
            "The p99: 1% of users wait 20× longer — find out why (queueing? long prompts?)",
            "The p50, because it is the most common",
            "Restart the GPU",
          ]}
          answer={1}
          explain="The average hides the tail. A huge gap between p50 and p99 usually means queueing or a slow path. Traces of p99 requests show exactly which span is slow."
        />
      </Section>

      <Section title="Step 3 — TTFT, TPOT and traces">
        <p>Two LLM-specific numbers matter most to users:</p>
        <ul>
          <li><b>TTFT</b> (time to first token) = everything before the first token: auth, limits, queue wait, prefill. The number users <i>feel</i>.</li>
          <li><b>TPOT</b> (time per output token) = streaming speed during decode. 23 ms/token ≈ 43 tokens/s — faster than anyone reads.</li>
        </ul>
        <TraceWaterfall />
        <p>
          The gateway creates the root span and passes the trace context (W3C <code>traceparent</code>: trace id + parent span id)
          inside the kiln-wire <code>Generate</code> payload. The scheduler and worker create child spans with the same trace id,
          so Jaeger can draw one tree across three processes.
        </p>
        <Code lang="rust" title="a span with tracing (the crate we keep)">{`
#[tracing::instrument(skip(state, body), fields(request_id = %req_id, org_id, model))]
async fn chat_completions(state: &State, req_id: Uuid, body: ChatRequest) -> Result<Response, ApiError> {
    let auth = state.auth.check(&body.key).await?;          // child span "auth" (instrumented inside)
    tracing::Span::current().record("org_id", tracing::field::display(auth.org_id));
    let input_tokens = tracing::info_span!("tokenize").in_scope(|| state.tok.count(&body))?;
    // ...
}
`}</Code>
      </Section>

      <Section title="Step 4 — SLOs, alerts and GPU health">
        <p>
          An <b>SLO</b> (service level objective) is a promise you make to yourself: "99.5% of requests in 30 days do not fail
          with 5xx", "p95 TTFT &lt; 1.5 s". Alerts fire on <b>symptoms users feel</b> (SLO burn), not on every CPU spike.
        </p>
        <ErrorBudget />
        <table>
          <thead><tr><th>SLO / signal</th><th>Target</th><th>Alert when</th></tr></thead>
          <tbody>
            <tr><td>Availability (non-5xx)</td><td>99.5% / 30 days</td><td>burn rate &gt; 10× over 1 h</td></tr>
            <tr><td>TTFT p95 (≤ 2k input tokens)</td><td>&lt; 1.5 s</td><td>&gt; 3 s for 10 min</td></tr>
            <tr><td>Usage pipeline lag</td><td>&lt; 60 s</td><td>&gt; 5 min (billing at risk)</td></tr>
            <tr><td>Spill file non-empty</td><td>—</td><td>any (event log degraded)</td></tr>
            <tr><td>GPU temperature</td><td>—</td><td>&gt; 85 °C for 5 min</td></tr>
            <tr><td>Worker heartbeat</td><td>—</td><td>any worker down &gt; 1 min</td></tr>
          </tbody>
        </table>
        <Callout kind="kiln">
          GPU metrics: a small exporter wraps <code>nvidia-smi</code> (works on Windows laptops; DCGM needs datacenter GPUs):
          utilisation %, memory used, temperature, power, clock throttling. A laptop RTX 3050 <b>throttles around 87 °C</b> — you
          will see tokens/s drop exactly when temperature hits the limit. Plotting both on one Grafana panel makes it obvious.
          Worker metrics add <code>worker_kv_blocks_free</code>, <code>worker_running_seqs</code>, <code>worker_prefix_cache_hit_ratio</code>.
        </Callout>
        <Quiz
          q="Why is org_id NOT a Prometheus label on gateway_requests_total?"
          options={[
            "It is secret",
            "Each distinct label value creates a new time series; thousands of orgs would explode memory and storage",
            "Prometheus labels must be numbers",
            "Orgs do not make requests",
          ]}
          answer={1}
          explain="High-cardinality labels are the #1 way to break Prometheus. Keep labels to small fixed sets (model, status, error type). Per-org analytics live in Postgres (usage_daily)."
        />
      </Section>

      <Recap items={[
        "Metrics = aggregates (how much), traces = one request's timeline (where), logs = details (what).",
        "Counter only goes up, gauge goes up and down, histogram counts into cumulative buckets.",
        "Our exporter prints Prometheus text; hot path = atomic adds only. Never use high-cardinality labels.",
        "Report p50/p95/p99; the mean hides the tail that users actually complain about.",
        "TTFT = before first token (queue + prefill dominate); TPOT = decode speed.",
        "Alert on SLO burn rate, not on noise. Watch GPU temperature — laptops throttle.",
      ]} />
    </>
  );
}
