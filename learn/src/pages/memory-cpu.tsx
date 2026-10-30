import { useEffect, useMemo, useState } from "react";
import { Callout, Code, PageHeader, Quiz, Recap, Section, Seg, Slider, Svg, Viz } from "../components/ui";

/* ---------- 1. latency ladder ---------- */

const LEVELS = [
  { name: "Register", ns: 0.3, size: "~1 KB per core", color: 3 },
  { name: "L1 cache", ns: 1, size: "32 KB per core", color: 3 },
  { name: "L2 cache", ns: 3.5, size: "512 KB per core", color: 6 },
  { name: "L3 cache", ns: 12, size: "16 MB shared", color: 1 },
  { name: "RAM (DDR5)", ns: 90, size: "16 GB", color: 2 },
  { name: "NVMe SSD", ns: 60_000, size: "~500 GB", color: 5 },
];

function human(ns: number, scale: boolean): string {
  if (!scale) {
    if (ns < 1000) return `${ns} ns`;
    return `${(ns / 1000).toFixed(0)} µs`;
  }
  // 1 ns -> 1 s
  const s = ns;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)} seconds`;
  if (s < 3600) return `${(s / 60).toFixed(1)} minutes`;
  if (s < 86400) return `${(s / 3600).toFixed(1)} hours`;
  return `${(s / 86400).toFixed(1)} days`;
}

function LatencyLadder() {
  const [scale, setScale] = useState<"real" | "human">("human");
  const maxLog = Math.log10(LEVELS[LEVELS.length - 1].ns / 0.1);
  return (
    <Viz title="How long does it take to fetch one value?" hint="Bars are on a log scale (each grid step = 10× slower). Switch to the human scale to feel the difference.">
      <Seg options={["real", "human"] as const} value={scale} onChange={setScale} labels={{ real: "Real time", human: "If 1 ns = 1 second" }} />
      <Svg w={720} h={LEVELS.length * 44 + 20}>
        {[0, 1, 2, 3, 4, 5].map((g) => {
          const x = 140 + (g / maxLog) * 400;
          return <line key={g} x1={x} y1={4} x2={x} y2={LEVELS.length * 44 + 6} stroke="var(--border)" />;
        })}
        {LEVELS.map((l, i) => {
          const w = (Math.log10(l.ns / 0.1) / maxLog) * 400;
          return (
            <g key={l.name}>
              <text x={0} y={30 + i * 44} fontSize={13} fontWeight={600} fill="var(--text)">{l.name}</text>
              <text x={0} y={44 + i * 44} fontSize={10} fill="var(--muted)">{l.size}</text>
              <rect x={140} y={14 + i * 44} width={Math.max(w, 3)} height={24} rx={4} fill={`var(--c${l.color})`} opacity={0.85} />
              <text x={148 + w} y={31 + i * 44} fontSize={13} fill="var(--text)" fontWeight={600}>{human(l.ns, scale === "human")}</text>
            </g>
          );
        })}
      </Svg>
      <div className="caption">
        Typical numbers for a ~4 GHz desktop/laptop CPU like the Ryzen 5 6600H (estimates; exact values vary by chip and access pattern).
        On the human scale, a cache hit is a heartbeat, a RAM access is a coffee break, and reading from SSD is most of a day.
      </div>
    </Viz>
  );
}

/* ---------- 2. cache simulation ---------- */

const R = 8, C = 8, LINE = 4, CAP = 4;

function simulate(order: "row" | "col", upto: number) {
  const seq: number[] = [];
  for (let a = 0; a < R; a++) for (let b = 0; b < C; b++) seq.push(order === "row" ? a * C + b : b * C + a);
  let cache: number[] = []; // LRU: most recent at end
  const result: ("hit" | "miss")[] = new Array(R * C).fill(null);
  let hits = 0, misses = 0;
  for (let t = 0; t <= upto && t < seq.length; t++) {
    const addr = seq[t];
    const line = Math.floor(addr / LINE);
    const idx = cache.indexOf(line);
    if (idx >= 0) { hits++; cache.splice(idx, 1); result[addr] = "hit"; }
    else { misses++; if (cache.length >= CAP) cache.shift(); result[addr] = "miss"; }
    cache.push(line);
  }
  return { seq, cache, result, hits, misses, cur: seq[Math.min(upto, seq.length - 1)] };
}

function CacheSim() {
  const [order, setOrder] = useState<"row" | "col">("row");
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const total = R * C;

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setT((v) => {
      if (v >= total - 1) { setPlaying(false); return v; }
      return v + 1;
    }), 140);
    return () => clearInterval(id);
  }, [playing, total]);

  const sim = useMemo(() => simulate(order, t), [order, t]);
  const cell = 40;

  return (
    <Viz title="Cache simulator: walking an 8×8 matrix" hint="Scaled-down model: a cache line holds 4 numbers, and the cache holds only 4 lines (LRU). Real: 64-byte lines = 16 f32, and much bigger caches — same effect.">
      <div className="controls">
        <Seg options={["row", "col"] as const} value={order} onChange={(o) => { setOrder(o); setT(0); }} labels={{ row: "Row by row", col: "Column by column" }} />
        <button className="btn primary" onClick={() => { if (t >= total - 1) setT(0); setPlaying(!playing); }}>{playing ? "Pause" : "▶ Play"}</button>
        <button className="btn" onClick={() => { setPlaying(false); setT(0); }}>Reset</button>
      </div>
      <Slider label="Step" value={t} min={0} max={total - 1} onChange={(v) => { setPlaying(false); setT(v); }} />
      <div className="grid2" style={{ alignItems: "start" }}>
        <svg viewBox={`0 0 ${C * cell + 10} ${R * cell + 10}`} width={C * cell + 10}>
          {Array.from({ length: R * C }, (_, addr) => {
            const r = Math.floor(addr / C), c = addr % C;
            const line = Math.floor(addr / LINE);
            const inCache = sim.cache.includes(line);
            const res = sim.result[addr];
            const fill = addr === sim.cur ? "var(--accent)" : res === "hit" ? "var(--c3-soft)" : res === "miss" ? "var(--c5-soft)" : "var(--panel-2)";
            return (
              <g key={addr}>
                <rect x={5 + c * cell} y={5 + r * cell} width={cell - 4} height={cell - 4} rx={4} fill={fill}
                  stroke={inCache ? "var(--c1)" : "var(--border)"} strokeWidth={inCache ? 2.5 : 1} />
                <text x={5 + c * cell + (cell - 4) / 2} y={5 + r * cell + 24} textAnchor="middle" fontSize={11}
                  fill={addr === sim.cur ? "white" : "var(--muted)"} fontFamily="var(--mono)">{addr}</text>
              </g>
            );
          })}
        </svg>
        <div>
          <div className="card">
            <div><span className="pill" style={{ background: "var(--c3-soft)", color: "var(--c3)" }}>hit</span> <b>{sim.hits}</b> — data was already in cache (fast)</div>
            <div style={{ marginTop: 6 }}><span className="pill" style={{ background: "var(--c5-soft)", color: "var(--c5)" }}>miss</span> <b>{sim.misses}</b> — had to go to RAM (~100× slower)</div>
            <div style={{ marginTop: 6 }} className="small muted">Blue outline = the lines currently in cache: {sim.cache.map((l) => `[${l * LINE}..${l * LINE + LINE - 1}]`).join(" ")}</div>
          </div>
          <p className="small">
            The number in each cell is its <b>memory address</b>. Row-major layout means a row is contiguous:
            address = row × 8 + col. Reading row by row uses every number in a loaded line (1 miss, then 3 hits).
            Reading column by column jumps 8 addresses each time, touches a new line every time, and the small cache throws lines away before we come back.
          </p>
        </div>
      </div>
    </Viz>
  );
}

/* ---------- 3. bandwidth / roofline calculator ---------- */

const DEVICES = {
  cpu: { name: "Ryzen 5 6600H (CPU)", bw: 60, flops: 0.7 },
  gpu: { name: "RTX 3050 Laptop (GPU)", bw: 192, flops: 6 },
} as const;
const MODELS = {
  small: { name: "Qwen3-1.7B Q4", gb: 1.1, params: 1.7 },
  big: { name: "Qwen3-4B Q4", gb: 2.5, params: 4 },
} as const;

function DecodeCalc() {
  const [dev, setDev] = useState<keyof typeof DEVICES>("cpu");
  const [model, setModel] = useState<keyof typeof MODELS>("small");
  const [batch, setBatch] = useState(1);
  const d = DEVICES[dev], m = MODELS[model];

  // One decode step reads all weights once (bytes) and does 2 FLOPs per parameter per sequence.
  const tMem = m.gb / d.bw;                         // seconds
  const tCompute = (2 * m.params * 1e9 * batch) / (d.flops * 1e12);
  const tStep = Math.max(tMem, tCompute);
  const perSeq = 1 / tStep;
  const aggregate = batch / tStep;
  const bound = tMem >= tCompute ? "memory" : "compute";
  const crossover = Math.max(1, Math.round((tMem * d.flops * 1e12) / (2 * m.params * 1e9)));

  const W = 520;
  const maxT = Math.max(tMem, (2 * m.params * 1e9 * 64) / (d.flops * 1e12));

  return (
    <Viz title="Decode speed calculator (the most important number in LLM serving)" hint="Each new token needs every weight read once from memory. Pick a device, a model and a batch size.">
      <div className="controls">
        <Seg options={["cpu", "gpu"] as const} value={dev} onChange={setDev} labels={{ cpu: "CPU + DDR5", gpu: "GPU + GDDR6" }} />
        <Seg options={["small", "big"] as const} value={model} onChange={setModel} labels={{ small: MODELS.small.name, big: MODELS.big.name }} />
      </div>
      <Slider label="Batch size (sequences decoded together)" value={batch} min={1} max={64} onChange={setBatch} />
      <svg viewBox="0 0 720 120" width={720}>
        <text x={0} y={30} fontSize={13} fill="var(--text)">Memory time</text>
        <rect x={150} y={16} width={Math.max(2, (tMem / maxT) * W)} height={22} rx={4} fill="var(--c2)" />
        <text x={156 + (tMem / maxT) * W} y={32} fontSize={12} fill="var(--text)">{(tMem * 1000).toFixed(1)} ms</text>
        <text x={0} y={72} fontSize={13} fill="var(--text)">Compute time</text>
        <rect x={150} y={58} width={Math.max(2, (tCompute / maxT) * W)} height={22} rx={4} fill="var(--c1)" />
        <text x={156 + (tCompute / maxT) * W} y={74} fontSize={12} fill="var(--text)">{(tCompute * 1000).toFixed(2)} ms</text>
        <text x={0} y={108} fontSize={13} fill="var(--muted)">Step time = the bigger bar → <tspan fontWeight={700} fill={bound === "memory" ? "var(--c2)" : "var(--c1)"}>{bound}-bound</tspan></text>
      </svg>
      <div className="grid3 small">
        <div className="card"><b>Per-user speed</b><div className="mono" style={{ fontSize: "1.2rem" }}>{perSeq.toFixed(0)} tok/s</div></div>
        <div className="card"><b>Total throughput</b><div className="mono" style={{ fontSize: "1.2rem" }}>{aggregate.toFixed(0)} tok/s</div></div>
        <div className="card"><b>Free batching up to</b><div className="mono" style={{ fontSize: "1.2rem" }}>~{crossover} seqs</div></div>
      </div>
      <div className="caption">
        Ceilings, not measurements. Assumes {d.bw} GB/s usable bandwidth and ~{d.flops} TFLOPS f32 peak for {d.name} (rough estimates),
        and 2 FLOPs per parameter per token. Real speed is lower (maybe 50–70% of the ceiling). Key insight: while memory-bound,
        adding users to the batch costs almost nothing — the weights are read once and used for everyone.
      </div>
    </Viz>
  );
}

/* ---------- 4. SIMD visual ---------- */

function SimdViz() {
  const N = 16;
  const a = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5, 8, 9, 7, 9, 3];
  const b = [2, 7, 1, 8, 2, 8, 1, 8, 2, 8, 4, 5, 9, 0, 4, 5];
  const [mode, setMode] = useState<"scalar" | "simd">("scalar");
  const [step, setStep] = useState(0);
  const width = mode === "scalar" ? 1 : 8;
  const steps = N / width;
  const done = Math.min(step, steps) * width;
  const lanes = Array.from({ length: 8 }, (_, l) => {
    let s = 0;
    for (let i = l; i < done; i += 8) s += a[i] * b[i];
    return s;
  });
  const scalarSum = a.slice(0, done).reduce((s, x, i) => s + x * b[i], 0);
  const cw = 42;
  return (
    <Viz title="Dot product: one at a time vs 8 at a time (AVX2)" hint="Press Step. Count how many instructions each version needs.">
      <div className="controls">
        <Seg options={["scalar", "simd"] as const} value={mode} onChange={(m) => { setMode(m); setStep(0); }} labels={{ scalar: "Scalar (1 lane)", simd: "AVX2 (8 lanes)" }} />
        <button className="btn primary" disabled={step >= steps} onClick={() => setStep(step + 1)}>Step</button>
        <button className="btn" onClick={() => setStep(0)}>Reset</button>
        <span className="small muted">instructions used: <b>{Math.min(step, steps)}</b> / {steps} multiply-adds</span>
      </div>
      <svg viewBox={`0 0 720 ${mode === "simd" ? 190 : 150}`} width={720}>
        {["a", "b"].map((name, row) => (
          <g key={name}>
            <text x={0} y={32 + row * 46} fontSize={14} fontWeight={700} fill="var(--text)" fontFamily="var(--mono)">{name}</text>
            {(row === 0 ? a : b).map((v, i) => {
              const active = i >= done - width && i < done && step > 0 && step <= steps;
              const used = i < done;
              return (
                <g key={i}>
                  <rect x={30 + i * cw} y={12 + row * 46} width={cw - 4} height={32} rx={4}
                    fill={active ? "var(--accent)" : used ? "var(--c3-soft)" : "var(--panel-2)"} stroke="var(--border)" />
                  <text x={30 + i * cw + (cw - 4) / 2} y={33 + row * 46} textAnchor="middle" fontSize={13} fill={active ? "white" : "var(--text)"} fontFamily="var(--mono)">{v}</text>
                </g>
              );
            })}
          </g>
        ))}
        {mode === "simd" && (
          <g>
            <text x={0} y={140} fontSize={12} fontWeight={700} fill="var(--c1)" fontFamily="var(--mono)">acc</text>
            {lanes.map((v, l) => (
              <g key={l}>
                <rect x={30 + l * cw * 2} y={118} width={cw * 2 - 6} height={32} rx={4} fill="var(--c1-soft)" stroke="var(--c1)" />
                <text x={30 + l * cw * 2 + cw - 3} y={139} textAnchor="middle" fontSize={13} fill="var(--c1)" fontFamily="var(--mono)">{v}</text>
              </g>
            ))}
            <text x={30} y={178} fontSize={13} fill="var(--text)">8 lanes of one 256-bit register. At the end: add the 8 lanes together ("horizontal sum") = {lanes.reduce((s, x) => s + x, 0)}</text>
          </g>
        )}
        {mode === "scalar" && <text x={30} y={130} fontSize={14} fill="var(--text)" fontFamily="var(--mono)">sum = {scalarSum}</text>}
      </svg>
      <div className="caption">One AVX2 FMA instruction ("fused multiply-add") does 8 multiplies and 8 adds. Zen 3 cores can issue two of them per clock cycle.</div>
    </Viz>
  );
}

/* ---------- 5. threads picture ---------- */

function ThreadsPicture() {
  const cores = 6, rows = 24;
  return (
    <Viz title="Splitting a matrix-vector multiply across 6 cores" hint="Each core gets its own block of output rows. No core writes where another writes — so no locks are needed.">
      <Svg w={720} h={210}>
        {Array.from({ length: rows }, (_, r) => {
          const core = Math.floor(r / (rows / cores));
          return <rect key={r} x={20} y={10 + r * 8} width={360} height={7} fill={`var(--c${core + 1})`} opacity={0.75} />;
        })}
        <text x={200} y={208} textAnchor="middle" fontSize={12} fill="var(--muted)">weight matrix W (rows × cols)</text>
        <text x={398} y={110} fontSize={18} fill="var(--text)">×</text>
        {Array.from({ length: 24 }, (_, r) => <rect key={r} x={420} y={10 + r * 8} width={14} height={7} fill="var(--muted)" opacity={0.5} />)}
        <text x={427} y={208} textAnchor="middle" fontSize={12} fill="var(--muted)">x</text>
        <text x={448} y={110} fontSize={18} fill="var(--text)">=</text>
        {Array.from({ length: rows }, (_, r) => {
          const core = Math.floor(r / (rows / cores));
          return <rect key={r} x={470} y={10 + r * 8} width={14} height={7} fill={`var(--c${core + 1})`} opacity={0.75} />;
        })}
        <text x={477} y={208} textAnchor="middle" fontSize={12} fill="var(--muted)">y</text>
        {Array.from({ length: cores }, (_, c) => (
          <g key={c}>
            <rect x={520} y={12 + c * 32} width={180} height={26} rx={6} fill={`var(--c${c + 1}-soft)`} stroke={`var(--c${c + 1})`} />
            <text x={610} y={30 + c * 32} textAnchor="middle" fontSize={12} fill="var(--text)">core {c}: rows {c * 4}–{c * 4 + 3}</text>
          </g>
        ))}
      </Svg>
    </Viz>
  );
}

/* ---------- page ---------- */

export default function Page() {
  return (
    <>
      <PageHeader
        kicker="Computers · Lesson 2"
        title="Memory, caches & SIMD"
        subtitle="Why moving data is slower than doing math — and why that one fact decides how fast an LLM can talk."
        learn={[
          "The memory hierarchy: registers, L1/L2/L3 caches, RAM, SSD — and how slow each one is",
          "Cache lines and why the order you walk through an array matters",
          "Row-major layout and strides (how a 2-D matrix lives in 1-D memory)",
          "Bandwidth vs compute: why LLM decoding is memory-bound",
          "SIMD (AVX2) and multiple threads: how one CPU does many operations at once",
          "Rust code: naive, cache-friendly and AVX2 dot products and matmuls",
        ]}
      />

      <Section title="1. The CPU is fast; memory is far away">
        <p>
          A modern CPU core can do several billion operations per second. But it can only work on data that is <i>inside</i> it,
          in tiny storage slots called <b>registers</b>. Everything else must be fetched — and fetching is slow.
        </p>
        <p>
          To hide this, CPUs have a <b>hierarchy</b> of memories: small and fast near the core, big and slow far away.
        </p>
        <LatencyLadder />
        <Callout kind="analogy">
          Your desk (registers) holds what you are working on now. Your drawer (L1/L2) has things you used a minute ago.
          The shelf in the room (L3) is a few steps away. The library across town (RAM) takes a trip. Ordering a book by mail (SSD) takes days.
          A good programmer arranges work so they rarely leave the desk.
        </Callout>
      </Section>

      <Section title="2. Cache lines: memory comes in 64-byte chunks">
        <p>
          When the CPU reads one <code>f32</code> (4 bytes) from RAM, it never fetches just 4 bytes. It fetches the whole
          <b> cache line</b> around it: <b>64 bytes</b> = 16 <code>f32</code> values. If your next read is the neighbour, it is already in cache — almost free.
        </p>
        <p>
          A matrix is 2-D, but memory is 1-D. In <b>row-major</b> layout (used by Rust arrays, C, and our tensors) rows are stored one after another:
        </p>
        <div className="card mono" style={{ textAlign: "center" }}>address(row, col) = base + (row × num_cols + col) × size_of_element</div>
        <p>
          The number you jump to move one step in a dimension is called the <b>stride</b>. Moving one column = stride 1. Moving one row = stride <code>num_cols</code>.
          Our <code>Tensor</code> type stores strides explicitly, which lets us "transpose" a matrix just by swapping strides, without copying data.
        </p>
        <CacheSim />
        <Code title="the same sum, two loop orders">{`
const N: usize = 4096;

// m is an N×N matrix stored row-major in one Vec<f32>.
fn sum_row_order(m: &[f32]) -> f32 {
    let mut s = 0.0;
    for r in 0..N {
        for c in 0..N {
            s += m[r * N + c];   // address +1 each step: uses the whole cache line
        }
    }
    s
}

fn sum_col_order(m: &[f32]) -> f32 {
    let mut s = 0.0;
    for c in 0..N {
        for r in 0..N {
            s += m[r * N + c];   // address +4096 each step: a new cache line every time
        }
    }
    s
}
// Same answer (apart from float rounding). On a 64 MB matrix the column version
// is typically several times slower — try it yourself with std::time::Instant.`}</Code>
        <Quiz
          q="A cache line is 64 bytes. You read f32 values one after another. Out of every 16 reads, about how many go to RAM?"
          options={["16", "8", "1", "0"]}
          answer={2}
          explain="64 bytes / 4 bytes = 16 floats per line. The first read misses and loads the line; the next 15 hit. (Hardware prefetchers even hide much of that one miss.)"
        />
      </Section>

      <Section title="3. Bandwidth vs compute: why LLMs are memory-bound">
        <p>
          Two speeds matter for any computation:
        </p>
        <ul>
          <li><b>Compute</b> (FLOPS): how many math operations per second.</li>
          <li><b>Memory bandwidth</b> (GB/s): how many bytes per second can come from RAM/VRAM.</li>
        </ul>
        <p>
          <b>Arithmetic intensity</b> = FLOPs done per byte loaded. If it is low, the cores sit idle waiting for data: the program is
          <b> memory-bound</b>. If it is high, memory keeps up and the program is <b>compute-bound</b>. Plotted, this gives the famous "roofline":
        </p>
        <Svg w={720} h={230} label="roofline diagram">
          <line x1={60} y1={200} x2={700} y2={200} stroke="var(--muted)" />
          <line x1={60} y1={200} x2={60} y2={10} stroke="var(--muted)" />
          <line x1={60} y1={200} x2={340} y2={50} stroke="var(--c2)" strokeWidth={3} />
          <line x1={340} y1={50} x2={700} y2={50} stroke="var(--c1)" strokeWidth={3} />
          <line x1={340} y1={50} x2={340} y2={200} stroke="var(--border)" strokeDasharray="4 4" />
          <text x={140} y={110} fontSize={13} fill="var(--c2)" transform="rotate(-28 140 110)">memory-bound: speed = bandwidth × intensity</text>
          <text x={430} y={40} fontSize={13} fill="var(--c1)">compute-bound: peak FLOPS</text>
          <text x={340} y={218} textAnchor="middle" fontSize={11} fill="var(--muted)">"balance point"</text>
          <circle cx={95} cy={181} r={6} fill="var(--c5)" />
          <text x={108} y={185} fontSize={12} fill="var(--c5)">decode, batch 1</text>
          <circle cx={420} cy={50} r={6} fill="var(--c3)" />
          <text x={420} y={75} fontSize={12} fill="var(--c3)">prefill (long prompt)</text>
          <text x={380} y={228} textAnchor="middle" fontSize={12} fill="var(--muted)">arithmetic intensity (FLOPs per byte) →</text>
          <text x={20} y={110} fontSize={12} fill="var(--muted)" transform="rotate(-90 20 110)">achieved FLOPS →</text>
        </Svg>
        <p>
          In <b>decode</b> (generating one token), every weight is read once and used for just one multiply-add per sequence. With 4-bit weights
          that is about 2 FLOPs per ~0.6 bytes — very low intensity. So the speed limit is simply:
        </p>
        <div className="card mono" style={{ textAlign: "center" }}>max tokens/second ≈ memory bandwidth ÷ model size in bytes</div>
        <p>
          Example (estimate): Ryzen 6600H with dual-channel DDR5-4800 has 76.8 GB/s theoretical, maybe 50–60 GB/s in practice. Qwen3-1.7B at Q4 is ~1.1 GB.
          Ceiling ≈ 55 ÷ 1.1 ≈ <b>50 tokens/s</b>, before any other overhead.
        </p>
        <DecodeCalc />
        <Callout kind="kiln">
          This calculator <i>is</i> the business model. Batching many users into one decode step multiplies throughput almost for free,
          until the batch gets big enough to become compute-bound. That is why the Continuous Batching lesson matters so much, and why
          quantization (smaller bytes) directly means more tokens per second.
        </Callout>
        <Quiz
          q="You quantize a model from 8-bit to 4-bit. On a memory-bound decode, roughly what happens to the tokens/s ceiling?"
          options={["Stays the same", "About doubles", "Halves", "Goes up 16×"]}
          answer={1}
          explain="Half the bytes to read per token → about twice the tokens per second. (The extra dequantize math is cheap because the cores were idle anyway.)"
        />
      </Section>

      <Section title="4. SIMD: one instruction, many numbers">
        <p>
          <b>SIMD</b> = Single Instruction, Multiple Data. Instead of adding two numbers, the CPU adds two <i>vectors</i> of numbers in one instruction.
          Our Ryzen supports <b>AVX2</b>: 256-bit registers that hold 8 <code>f32</code>s, plus <b>FMA</b> (fused multiply-add: <code>acc = a × b + acc</code> in one step).
        </p>
        <SimdViz />
        <p>
          The compiler can sometimes use SIMD automatically ("auto-vectorization"), but for tight kernels we write it ourselves with
          <b> intrinsics</b>: functions in <code>std::arch</code> that map one-to-one to CPU instructions.
        </p>
        <Code title="dot product: scalar and AVX2 versions">{`
/// Simple version. Correct everywhere. Used as the reference in tests.
pub fn dot_scalar(a: &[f32], b: &[f32]) -> f32 {
    a.iter().zip(b).map(|(x, y)| x * y).sum()
}

#[cfg(target_arch = "x86_64")]
use std::arch::x86_64::*;

/// AVX2 + FMA version: 8 multiply-adds per instruction.
/// "unsafe" because calling it on a CPU without AVX2 would crash (illegal instruction),
/// and because we use raw pointers. The caller must check the CPU first.
#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2,fma")]
unsafe fn dot_avx2(a: &[f32], b: &[f32]) -> f32 {
    assert_eq!(a.len(), b.len());
    let n = a.len();
    let mut i = 0;
    unsafe {
        let mut acc = _mm256_setzero_ps();                 // 8 lanes of 0.0
        while i + 8 <= n {
            let va = _mm256_loadu_ps(a.as_ptr().add(i));   // load a[i..i+8]
            let vb = _mm256_loadu_ps(b.as_ptr().add(i));   // load b[i..i+8]
            acc = _mm256_fmadd_ps(va, vb, acc);            // acc += va * vb  (8 at once)
            i += 8;
        }
        // Horizontal sum: add the 8 lanes together.
        let mut lanes = [0.0f32; 8];
        _mm256_storeu_ps(lanes.as_mut_ptr(), acc);
        let mut sum: f32 = lanes.iter().sum();
        // Leftover elements when n is not a multiple of 8.
        while i < n {
            sum += a[i] * b[i];
            i += 1;
        }
        sum
    }
}

/// Safe public function: picks the best version at runtime.
pub fn dot(a: &[f32], b: &[f32]) -> f32 {
    #[cfg(target_arch = "x86_64")]
    if is_x86_feature_detected!("avx2") && is_x86_feature_detected!("fma") {
        return unsafe { dot_avx2(a, b) };   // SAFETY: we just checked the CPU has AVX2+FMA
    }
    dot_scalar(a, b)
}`}</Code>
        <Callout kind="rust">
          <p>
            <code>#[target_feature(enable = "avx2,fma")]</code> tells the compiler: "inside this one function you may use AVX2 and FMA instructions".
            The rest of the program stays compatible with older CPUs. Because running it on a CPU without those features is undefined behaviour,
            the function is <code>unsafe</code> to call, and we only call it after <code>is_x86_feature_detected!</code> says yes.
            This pattern — <b>unsafe fast core, safe wrapper with a check</b> — is how all of <code>kiln-engine</code>'s CPU backend is built.
          </p>
        </Callout>
        <Callout kind="warn" title="⚠️ Watch out">
          The AVX2 version adds numbers in a different order (8 separate partial sums), so its result differs from <code>dot_scalar</code> in the last
          digits. Tests must compare with a tolerance, not with <code>==</code>.
        </Callout>
      </Section>

      <Section title="5. Matrix multiply: loop order and blocking">
        <p>
          Matrix multiply (<code>C = A × B</code>) is where an LLM spends almost all its time. The math is three nested loops.
          But the <i>order</i> of the loops and how we group the work change speed by 10× or more, purely because of caches.
        </p>
        <Code title="three versions of matmul (A: M×K, B: K×N, C: M×N, all row-major)">{`
// 1) Naive i-j-k. The inner loop walks B down a COLUMN: stride N. Cache-unfriendly.
fn matmul_ijk(a: &[f32], b: &[f32], c: &mut [f32], m: usize, k: usize, n: usize) {
    for i in 0..m {
        for j in 0..n {
            let mut s = 0.0;
            for p in 0..k {
                s += a[i * k + p] * b[p * n + j];
            }
            c[i * n + j] = s;
        }
    }
}

// 2) i-k-j. Same math, loops swapped. The inner loop now walks B and C along ROWS:
//    stride 1, so every cache line is fully used and the compiler can auto-vectorize.
fn matmul_ikj(a: &[f32], b: &[f32], c: &mut [f32], m: usize, k: usize, n: usize) {
    c.fill(0.0);
    for i in 0..m {
        for p in 0..k {
            let a_ip = a[i * k + p];
            let b_row = &b[p * n..(p + 1) * n];
            let c_row = &mut c[i * n..(i + 1) * n];
            for j in 0..n {
                c_row[j] += a_ip * b_row[j];
            }
        }
    }
}

// 3) Blocked (tiled). Work on small T×T tiles so the pieces of A, B and C
//    being used all stay inside L1/L2 cache while we reuse them.
const T: usize = 64;
fn matmul_blocked(a: &[f32], b: &[f32], c: &mut [f32], m: usize, k: usize, n: usize) {
    c.fill(0.0);
    for i0 in (0..m).step_by(T) {
        for p0 in (0..k).step_by(T) {
            for j0 in (0..n).step_by(T) {
                for i in i0..(i0 + T).min(m) {
                    for p in p0..(p0 + T).min(k) {
                        let a_ip = a[i * k + p];
                        for j in j0..(j0 + T).min(n) {
                            c[i * n + j] += a_ip * b[p * n + j];
                        }
                    }
                }
            }
        }
    }
}`}</Code>
        <Callout kind="deep">
          <p>
            Why does blocking help? A 64×64 tile of f32 is 16 KB. Three tiles (A, B, C) = 48 KB — fits in L2 (512 KB) and mostly in L1.
            Each value loaded from RAM is now reused 64 times before it is evicted. That raises arithmetic intensity, moving us right on the roofline.
            Real BLAS libraries go further: a tiny "micro-kernel" keeps a 6×16 block of C entirely in registers. We will build up to that step by step.
          </p>
        </Callout>
        <Quiz
          q="In matmul_ijk, why is the inner loop slow?"
          options={[
            "Because it uses multiplication",
            "Because b[p * n + j] jumps n floats each step, so almost every read is a new cache line",
            "Because Rust checks array bounds",
            "Because c is written once per (i, j)",
          ]}
          answer={1}
          explain="Walking down a column of a row-major matrix has stride n. Each step lands in a different cache line, wasting 15 of every 16 floats loaded."
        />
      </Section>

      <Section title="6. Using all the cores">
        <p>
          The Ryzen 5 6600H has <b>6 cores / 12 threads</b>. SIMD makes one core do 8× more; threads multiply that by the number of cores.
          The easiest safe split for matrix-vector work: give each thread its own block of <i>output rows</i>.
        </p>
        <ThreadsPicture />
        <Code title="parallel matrix-vector multiply with scoped threads (std only)">{`
use std::thread;

/// y = W · x, where W is rows×cols row-major.
fn matvec_parallel(w: &[f32], x: &[f32], y: &mut [f32], cols: usize, n_threads: usize) {
    let rows = y.len();
    let chunk = rows.div_ceil(n_threads);

    // thread::scope lets threads borrow w, x and y safely: Rust guarantees
    // all threads finish before the scope ends, so the borrows stay valid.
    thread::scope(|s| {
        for (t, y_chunk) in y.chunks_mut(chunk).enumerate() {
            s.spawn(move || {
                let row0 = t * chunk;
                for (r, out) in y_chunk.iter_mut().enumerate() {
                    let row = &w[(row0 + r) * cols..(row0 + r + 1) * cols];
                    *out = dot(row, x);   // the AVX2 dot from above
                }
            });
        }
    });
}`}</Code>
        <Callout kind="rust">
          <code>chunks_mut</code> splits <code>y</code> into non-overlapping mutable pieces. Each thread gets one piece. The borrow checker
          can prove no two threads write the same memory, so this compiles without any locks — and a data race is impossible.
          In <code>kiln-engine</code> we will keep a <b>persistent thread pool</b> instead of spawning threads each call, because spawning costs ~10–50 µs.
        </Callout>
        <Callout kind="kiln">
          CPU backend plan for <code>kiln-engine</code> (used by <code>worker-cpu</code> running Qwen3-1.7B):
          <ol>
            <li>Naive f32 kernels — the correctness reference.</li>
            <li>Cache-friendly loop orders + blocking.</li>
            <li>AVX2/FMA intrinsics, including dot products directly on Q8_0/Q4_K blocks (dequantize in registers, never in RAM).</li>
            <li>Own thread pool across 6 cores.</li>
          </ol>
          At every step we measure tokens/s against the bandwidth ceiling from the calculator above.
        </Callout>
      </Section>

      <Recap
        items={[
          "Memory is a hierarchy: registers → L1 → L2 → L3 → RAM → SSD. Each level is roughly 3–1000× slower than the one above.",
          "Data moves in 64-byte cache lines. Walk memory in order (stride 1) to use every byte you load.",
          "Row-major: address = row × cols + col. Strides tell you how far to jump per dimension.",
          "LLM decode reads every weight per token → memory-bound → tokens/s ≈ bandwidth ÷ model bytes. Batching is nearly free until compute-bound.",
          "SIMD (AVX2 + FMA) does 8 f32 multiply-adds per instruction; use #[target_feature] + a runtime check + a safe wrapper.",
          "Loop order, blocking and threads (one output block per thread) make matmul fast without changing the math.",
        ]}
      />
    </>
  );
}
