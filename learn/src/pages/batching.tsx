import { useEffect, useMemo, useState } from "react";
import {
  PageHeader, Section, Callout, Code, Viz, Slider, Seg, Stepper, Quiz, Recap, Svg, Box, Arrow,
} from "../components/ui";

/* ---------------- 1. Batch size vs throughput (roofline-style) ---------------- */

function ThroughputModel() {
  const [batch, setBatch] = useState(1);
  const [ctx, setCtx] = useState(1024);
  // RTX 3050 Laptop (rough): 192 GB/s memory, ~8 TFLOPS usable fp16
  const BW = 192e9, FLOPS = 8e12;
  const weightBytes = 2.5e9;              // Qwen3-4B Q4
  const kvPerTok = 147456;                // bytes
  const flopsPerTok = 8e9;                // ~2 × params
  const stepTime = (b: number) => {
    const mem = (weightBytes + b * ctx * kvPerTok) / BW;   // read weights once + each seq's KV
    const comp = (b * flopsPerTok) / FLOPS;
    return Math.max(mem, comp);
  };
  const tps = (b: number) => b / stepTime(b);
  const maxB = 32;
  const pts = Array.from({ length: maxB }, (_, i) => i + 1);
  const ymax = Math.max(...pts.map(tps)) * 1.1;
  const X = (b: number) => 50 + ((b - 1) / (maxB - 1)) * 640;
  const Y = (v: number) => 200 - (v / ymax) * 180;
  const kvFitB = Math.floor((900 * 1024 * 1024) / (ctx * kvPerTok));
  const t = stepTime(batch);
  const memBound = (weightBytes + batch * ctx * kvPerTok) / BW >= (batch * flopsPerTok) / FLOPS;
  return (
    <Viz title="Why batching is (almost) free during decode"
      hint="Estimated with our GPU's numbers. One decode step must read all weights once, no matter how many sequences are in the batch.">
      <div className="controls">
        <Slider label="batch size (sequences decoding together)" value={batch} min={1} max={maxB} onChange={setBatch} />
        <Slider label="context length per sequence" value={ctx} min={128} max={4096} step={128} onChange={setCtx} />
      </div>
      <Svg w={740} h={240} label="throughput curve">
        <line x1={50} y1={200} x2={700} y2={200} stroke="var(--border)" />
        <line x1={50} y1={20} x2={50} y2={200} stroke="var(--border)" />
        {kvFitB < maxB && (
          <g>
            <rect x={X(Math.max(kvFitB, 1) + 0.5)} y={20} width={700 - X(Math.max(kvFitB, 1) + 0.5)} height={180} fill="var(--c5)" fillOpacity={0.08} />
            <text x={X(Math.max(kvFitB, 1) + 0.5) + 6} y={36} fontSize={11} fill="var(--c5)">KV cache does not fit here ({ctx} tok × batch &gt; 900 MiB)</text>
          </g>
        )}
        <polyline fill="none" stroke="var(--c1)" strokeWidth={2.5} points={pts.map((b) => `${X(b)},${Y(tps(b))}`).join(" ")} />
        <circle cx={X(batch)} cy={Y(tps(batch))} r={6} fill="var(--accent)" />
        <text x={10} y={24} fontSize={11} fill="var(--muted)">tok/s</text>
        <text x={640} y={222} fontSize={11} fill="var(--muted)">batch size</text>
        {[1, 8, 16, 24, 32].map((b) => <text key={b} x={X(b)} y={215} fontSize={10} textAnchor="middle" fill="var(--muted)">{b}</text>)}
      </Svg>
      <div className="grid3">
        <div className="card small"><div className="muted">time per step</div><b className="mono">{(t * 1000).toFixed(1)} ms</b></div>
        <div className="card small"><div className="muted">total tokens / s</div><b className="mono">{tps(batch).toFixed(0)}</b></div>
        <div className="card small"><div className="muted">each user sees</div><b className="mono">{(1 / t).toFixed(1)} tok/s</b> <span className="muted">({memBound ? "memory-bound" : "compute-bound"})</span></div>
      </div>
      <div className="caption">
        From batch 1 to 8, total throughput grows ~8× while each user's speed barely drops. But on our 4 GB GPU the KV cache (red zone) limits the batch long before compute does.
        These are rough model estimates; phase 0 measures the real numbers.
      </div>
    </Viz>
  );
}

/* ---------------- 2. Static vs continuous batching simulation ---------------- */

type Job = { id: number; arrive: number; len: number };
type Cell = { job: number; prefill: boolean } | null;
type Schedule = { grid: Cell[][]; finish: Map<number, number>; start: Map<number, number> };

function makeJobs(seed: number): Job[] {
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  return Array.from({ length: 14 }, (_, i) => ({
    id: i, arrive: Math.floor(i * 1.6 + rnd() * 2), len: 2 + Math.floor(rnd() < 0.3 ? 9 + rnd() * 6 : rnd() * 5),
  }));
}

function simulate(jobs: Job[], slots: number, mode: "static" | "continuous", T: number): Schedule {
  const grid: Cell[][] = Array.from({ length: slots }, () => Array(T).fill(null));
  const finish = new Map<number, number>(), start = new Map<number, number>();
  const queue: Job[] = [];
  const pending = [...jobs];
  const running: ({ job: Job; done: number } | null)[] = Array(slots).fill(null);
  for (let t = 0; t < T; t++) {
    while (pending.length && pending[0].arrive <= t) queue.push(pending.shift()!);
    const anyRunning = running.some((r) => r);
    // static: only admit when the whole batch is empty. continuous: admit into any free slot.
    if (mode === "continuous" || !anyRunning) {
      for (let s = 0; s < slots; s++) {
        if (!running[s] && queue.length) {
          const job = queue.shift()!;
          running[s] = { job, done: 0 };
          start.set(job.id, t);
        }
      }
    }
    for (let s = 0; s < slots; s++) {
      const r = running[s];
      if (!r) continue;
      grid[s][t] = { job: r.job.id, prefill: r.done === 0 };
      r.done++;
      if (r.done >= r.job.len) { finish.set(r.job.id, t + 1); running[s] = null; }
    }
  }
  return { grid, finish, start };
}

function BatchingSim() {
  const [mode, setMode] = useState<"static" | "continuous">("continuous");
  const [slots, setSlots] = useState(4);
  const [seed, setSeed] = useState(3);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const T = 40;
  const jobs = useMemo(() => makeJobs(seed), [seed]);
  const sched = useMemo(() => simulate(jobs, slots, mode, T), [jobs, slots, mode]);
  const other = useMemo(() => simulate(jobs, slots, mode === "static" ? "continuous" : "static", T), [jobs, slots, mode]);

  useEffect(() => {
    if (!playing) return;
    const h = setInterval(() => setT((x) => { if (x >= T) { setPlaying(false); return x; } return x + 1; }), 220);
    return () => clearInterval(h);
  }, [playing]);

  const stats = (s: Schedule, upTo: number) => {
    let busy = 0;
    s.grid.forEach((row) => row.slice(0, upTo).forEach((c) => { if (c) busy++; }));
    const done = jobs.filter((j) => (s.finish.get(j.id) ?? Infinity) <= upTo);
    const lat = done.map((j) => s.finish.get(j.id)! - j.arrive);
    return {
      util: upTo ? busy / (slots * upTo) : 0, done: done.length,
      avgLat: lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : 0,
    };
  };
  const me = stats(sched, t), them = stats(other, t);
  const cw = 17, ox = 60;
  const waiting = jobs.filter((j) => j.arrive < t && (sched.start.get(j.id) ?? Infinity) >= t);
  return (
    <Viz title="GPU timeline: static vs continuous batching"
      hint="Each row is one batch slot on the GPU, each column one decode step. Colored = a request is using the slot (darker first cell = prefill). Empty = wasted GPU.">
      <div className="controls">
        <Seg options={["static", "continuous"] as const} value={mode} onChange={setMode} labels={{ static: "Static batching", continuous: "Continuous batching" }} />
        <Slider label="batch slots" value={slots} min={2} max={6} onChange={setSlots} />
        <button className="btn primary" onClick={() => { if (t >= T) setT(0); setPlaying(!playing); }}>{playing ? "⏸ Pause" : "▶ Play"}</button>
        <button className="btn" onClick={() => setT(Math.min(T, t + 1))}>Step</button>
        <button className="btn" onClick={() => { setT(T); setPlaying(false); }}>Jump to end</button>
        <button className="btn" onClick={() => { setSeed(seed + 1); setT(0); setPlaying(false); }}>🎲 New requests</button>
      </div>
      <div style={{ overflowX: "auto" }}>
        <Svg w={ox + T * cw + 10} h={slots * 26 + 70} label="timeline">
          {/* arrivals */}
          {jobs.map((j) => (
            <g key={"a" + j.id}>
              <line x1={ox + j.arrive * cw + 2} x2={ox + j.arrive * cw + 2} y1={6} y2={18} stroke={`var(--c${(j.id % 6) + 1})`} strokeWidth={3} opacity={j.arrive <= t ? 1 : 0.25} />
            </g>
          ))}
          <text x={0} y={16} fontSize={10} fill="var(--muted)">arrivals</text>
          {sched.grid.map((row, s) => (
            <g key={s}>
              <text x={0} y={42 + s * 26} fontSize={11} fill="var(--muted)">slot {s}</text>
              {row.map((c, k) => (
                <rect key={k} x={ox + k * cw} y={28 + s * 26} width={cw - 2} height={22} rx={3}
                  fill={k >= t ? "var(--panel)" : c ? `var(--c${(c.job % 6) + 1})` : "var(--panel-2)"}
                  fillOpacity={k >= t ? 1 : c ? (c.prefill ? 1 : 0.45) : 1}
                  stroke={k < t && !c ? "var(--c5)" : "var(--border)"} strokeOpacity={k < t && !c ? 0.5 : 1} />
              ))}
            </g>
          ))}
          <line x1={ox + t * cw - 1} x2={ox + t * cw - 1} y1={22} y2={30 + slots * 26} stroke="var(--accent)" strokeWidth={2} />
          <text x={ox} y={slots * 26 + 50} fontSize={11} fill="var(--muted)">step {t} / {T}  ·  queue waiting now: {Math.max(0, waiting.length)}</text>
        </Svg>
      </div>
      <table>
        <thead><tr><th></th><th>GPU slot utilization</th><th>requests finished</th><th>avg latency (steps)</th></tr></thead>
        <tbody>
          <tr style={{ background: "var(--accent-soft)" }}><td><b>{mode}</b></td><td className="mono">{(me.util * 100).toFixed(0)}%</td><td className="mono">{me.done} / {jobs.length}</td><td className="mono">{me.avgLat.toFixed(1)}</td></tr>
          <tr><td>{mode === "static" ? "continuous" : "static"} (same requests)</td><td className="mono">{(them.util * 100).toFixed(0)}%</td><td className="mono">{them.done} / {jobs.length}</td><td className="mono">{them.avgLat.toFixed(1)}</td></tr>
        </tbody>
      </table>
      <div className="caption">Static: a batch starts only when the previous batch is completely done, so short requests leave slots idle (red outlines) while long ones finish, and new arrivals wait. Continuous: a freed slot is refilled at the very next step.</div>
    </Viz>
  );
}

/* ---------------- 3. Prefill vs decode diagram ---------------- */

function PhaseDiagram() {
  return (
    <Svg w={740} h={150} label="prefill vs decode">
      <Box x={10} y={20} w={330} h={110} label="PREFILL" sub="" color={2} />
      <text x={175} y={85} fontSize={12} textAnchor="middle" fill="var(--text)">all prompt tokens at once: [1000 × 2560]</text>
      <text x={175} y={103} fontSize={12} textAnchor="middle" fill="var(--text)">each weight loaded once, used 1000×</text>
      <text x={175} y={121} fontSize={12} textAnchor="middle" fill="var(--c2)" fontWeight={700}>compute-bound · sets TTFT</text>
      <Arrow x1={345} y1={75} x2={395} y2={75} label="1st token" />
      <Box x={400} y={20} w={330} h={110} label="DECODE (repeat)" sub="" color={1} />
      <text x={565} y={85} fontSize={12} textAnchor="middle" fill="var(--text)">one new token per sequence: [1 × 2560]</text>
      <text x={565} y={103} fontSize={12} textAnchor="middle" fill="var(--text)">each weight loaded once, used 1× (per seq)</text>
      <text x={565} y={121} fontSize={12} textAnchor="middle" fill="var(--c1)" fontWeight={700}>memory-bound · sets tokens/s</text>
    </Svg>
  );
}

const CHUNK_STEPS = [
  { title: "The problem", body: <p>Three users are streaming answers (decode). A new user sends a 4,000-token prompt. If we prefill all 4,000 tokens in one step, that step takes maybe 1–2 seconds — and the three streaming users <b>freeze</b> during it.</p> },
  { title: "Chunked prefill", body: <p>Split the long prompt into chunks of, say, 512 tokens. Each engine step = the 3 decode tokens + one 512-token chunk. The step is longer than a pure decode step, but bounded.</p> },
  { title: "Result", body: <p>Streaming users see a small slowdown instead of a freeze. The new user's TTFT is a bit higher than with one big prefill. The chunk size is a knob: bigger = faster TTFT for the newcomer, smaller = smoother streams for everyone else.</p> },
  { title: "Token budget per step", body: <p>The engine sets a <b>max tokens per step</b> (e.g. 512). Each step: first take all decode sequences (1 token each), then fill the remaining budget with prefill chunks. This single rule gives both continuous batching and chunked prefill.</p> },
];

/* ---------------- Page ---------------- */

export default function Page() {
  return (
    <>
      <PageHeader
        kicker="LLMs · Lesson 6"
        title="Continuous batching"
        subtitle="The single most important trick that makes serving LLMs cheap — and the heart of our engine loop."
        learn={[
          "Prefill vs decode: compute-bound vs memory-bound",
          "Why decoding 8 sequences costs almost the same as 1",
          "Static vs continuous batching, in a live simulation",
          "Chunked prefill, preemption and cancellation",
          "The engine step loop in Rust",
        ]}
      />

      <Section title="1. Two phases with very different costs">
        <PhaseDiagram />
        <p>
          A GPU can do math much faster than it can read memory. On our RTX 3050 Laptop: about <b>8 trillion</b> operations per second, but only
          <b> 192 GB/s</b> of memory bandwidth. To use each loaded byte well, we need to do many operations per byte (high "arithmetic intensity").
        </p>
        <ul>
          <li><b>Prefill</b> processes the whole prompt as a matrix. Each weight is loaded once and used for every prompt token: lots of math per byte. Compute-bound.</li>
          <li><b>Decode</b> processes one token. Each weight is loaded and used once: very little math per byte. The GPU mostly waits. Memory-bound.</li>
        </ul>
        <Callout kind="idea">
          <p>If decode is limited by reading weights, then reading them once and applying them to <b>many</b> sequences in the same step is nearly free.
            That is batching: put the next token of 8 different requests into one matrix, so one weight read serves 8 users.</p>
        </Callout>
        <ThroughputModel />
        <Quiz
          q="On our GPU one decode step for 1 sequence takes ~13 ms. Roughly how long for 4 sequences (short contexts)?"
          options={["~52 ms (4×)", "~14 ms (almost the same)", "~3 ms (faster)"]}
          answer={1}
          explain="The time is dominated by reading 2.5 GB of weights, which happens once per step regardless of batch size. Extra sequences add a little KV reading and math."
        />
      </Section>

      <Section title="2. Static vs continuous batching">
        <p>
          <b>Static batching</b> (the old way): collect N requests, run them together until <b>all</b> are done, then start the next batch. Problem: answers have
          very different lengths. One 500-token answer keeps the batch alive while slots of finished 20-token answers sit idle, and new requests wait outside.
        </p>
        <p>
          <b>Continuous batching</b> (Orca, 2022; vLLM): the batch is re-formed <b>every step</b>. Finished sequences leave immediately, waiting ones join immediately.
          The GPU is always as full as memory allows.
        </p>
        <Callout kind="analogy">
          <p>Static = a bus that leaves only when full and returns only when every passenger has reached their stop. Continuous = a train where people get
            on and off at every station.</p>
        </Callout>
        <BatchingSim />
      </Section>

      <Section title="3. Chunked prefill">
        <Stepper title="Long prompts without freezing everyone" steps={CHUNK_STEPS} />
      </Section>

      <Section title="4. Preemption and cancellation">
        <div className="grid2">
          <div className="card">
            <h4>Preemption (out of KV blocks)</h4>
            <p className="small">Running sequences grow by one token per step. Eventually a sequence needs a new KV block and none is free. The engine picks a victim
              (the newest request — it has done the least work), frees all its blocks and puts it back at the front of the waiting queue. Later it is resumed by
              re-prefilling prompt + tokens generated so far. The user only sees a pause.</p>
          </div>
          <div className="card">
            <h4>Cancellation (client disconnects)</h4>
            <p className="small">The user closes the browser mid-answer. The gateway notices the dropped connection, sends <code>Cancel</code> to the worker, and the
              engine removes the sequence at the next step and releases its blocks. Without this, the GPU keeps generating text nobody will read — a classic production bug.
              Tokens generated so far are still billed.</p>
          </div>
        </div>
        <Quiz
          q="Why does the engine preempt the NEWEST request rather than the oldest?"
          options={[
            "Newest requests are less important customers",
            "The newest has the least generated work to recompute, and older requests are closer to finishing (and freeing memory)",
            "It is random",
          ]}
          answer={1}
          explain="Preempting the newest wastes the least work (cheap to recompute) and lets old requests finish and free their blocks — the same idea as FCFS fairness."
        />
      </Section>

      <Section title="5. The engine step loop in Rust">
        <p>This is the heart of <code>kiln-engine</code>. One thread owns the GPU and runs this loop forever. Requests arrive through a channel; tokens leave through per-request channels.</p>
        <Code title="kiln-engine/src/engine/mod.rs">{`
pub struct Engine {
    model: Qwen3,
    blocks: BlockAllocator,
    waiting: VecDeque<Sequence>,      // admitted but not yet running
    running: Vec<Sequence>,           // currently in the batch
    inbox: Receiver<EngineMsg>,       // New(request) | Cancel(id) from the gRPC/wire layer
    max_tokens_per_step: usize,       // e.g. 512 (chunked prefill budget)
    max_seqs: usize,                  // e.g. 8
}

impl Engine {
    pub fn run(mut self) {
        loop {
            // 1. take new requests and cancellations (never block if we have work)
            self.drain_inbox();
            self.running.retain(|s| {
                if s.cancelled { self.blocks.release_all(&s.block_table); false } else { true }
            });

            // 2. build this step's batch under a token budget
            let mut budget = self.max_tokens_per_step;
            let mut batch = Batch::new();
            for seq in self.running.iter_mut() {
                if seq.is_decoding() {
                    if !seq.ensure_block(&mut self.blocks) { /* out of blocks */ seq.preempt_me = true; continue; }
                    batch.push_decode(seq);          // 1 token
                    budget -= 1;
                }
            }
            self.preempt_marked();                    // newest-first, back to \`waiting\`
            while budget > 0 && self.running.len() < self.max_seqs {
                let Some(mut seq) = self.waiting.pop_front() else { break };
                if !seq.reserve_prompt_blocks(&mut self.blocks) { self.waiting.push_front(seq); break; }
                let chunk = seq.next_prefill_chunk(budget); // maybe only part of the prompt
                budget -= chunk.len();
                batch.push_prefill(&seq, chunk);
                self.running.push(seq);
            }
            if batch.is_empty() { self.wait_for_work(); continue; }

            // 3. ONE forward pass for everybody (this is where the GPU time goes)
            let logits = self.model.forward_batch(&batch, &self.blocks);

            // 4. sample, stream, and retire finished sequences
            for (seq, row) in batch.sequences_needing_a_token(&mut self.running, &logits) {
                let tok = sample(row, &seq.params, &seq.recent, seq.grammar.mask(), &mut seq.rng);
                seq.push_token(tok);
                let _ = seq.out.try_send(Event::Token(tok));   // to the client stream
                if seq.is_finished() {                          // EOS, stop sequence, max_tokens
                    let _ = seq.out.try_send(Event::Finished(seq.usage()));
                    self.blocks.release_all(&seq.block_table);
                }
            }
            self.running.retain(|s| !s.is_finished());
        }
    }
}
`}</Code>
        <Callout kind="rust">
          <p><code>let Some(x) = ... else {"{ break }"};</code> is "let-else": unpack the value or leave the loop. <code>retain</code> keeps only items for which the
            closure returns true. <code>try_send</code> never blocks the engine: if a client's channel is full or closed, the engine moves on — one slow client must
            never stall the GPU loop for everyone.</p>
        </Callout>
        <Callout kind="warn">
          <p>The code above is a sketch: the real version must satisfy the borrow checker (we cannot hold <code>&amp;mut self.running</code> and call
            <code> self.blocks</code> methods inside the same closure). Typical fixes: split the struct into fields borrowed separately, or work with indices.
            Lesson "Ownership &amp; borrowing" explains why Rust insists on this.</p>
        </Callout>
        <Callout kind="kiln">
          <p>The engine thread is fed by the worker's network layer (our wire protocol). The worker's heartbeat to the scheduler reports
            <code> running_seqs</code>, <code>waiting_seqs</code> and <code>kv_blocks_free</code> — all straight from this struct. The scheduler (lesson: Scheduler & fairness)
            decides <b>which</b> requests reach this engine; the engine decides <b>when</b> each runs on the GPU.</p>
        </Callout>
      </Section>

      <Recap items={[
        "Prefill is compute-bound (sets TTFT); decode is memory-bound (sets tokens/s).",
        "Decode reads all weights once per step, so adding sequences to the batch is nearly free — until KV memory runs out.",
        "Continuous batching re-forms the batch every step: finished sequences leave, waiting ones join immediately.",
        "A per-step token budget gives chunked prefill: long prompts don't freeze streaming users.",
        "Out of blocks → preempt the newest; client gone → cancel and free blocks at the next step.",
      ]} />
    </>
  );
}
