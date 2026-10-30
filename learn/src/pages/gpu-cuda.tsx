import { useState } from "react";
import { Arrow, Box, Callout, Code, PageHeader, Quiz, Recap, Section, Seg, Slider, Stepper, Svg, Viz } from "../components/ui";

/* ---------- 1. CPU vs GPU picture ---------- */

function CpuVsGpu() {
  return (
    <Viz title="Few big cores vs thousands of small ones" hint="Same chip area, different philosophy.">
      <Svg w={720} h={250}>
        <text x={170} y={18} textAnchor="middle" fontSize={14} fontWeight={700} fill="var(--text)">CPU (Ryzen 5 6600H): 6 cores</text>
        <rect x={10} y={28} width={320} height={210} rx={10} fill="var(--panel-2)" stroke="var(--border)" />
        {Array.from({ length: 6 }, (_, i) => (
          <g key={i}>
            <rect x={22 + (i % 3) * 102} y={40 + Math.floor(i / 3) * 70} width={92} height={60} rx={6} fill="var(--c1-soft)" stroke="var(--c1)" />
            <text x={68 + (i % 3) * 102} y={66 + Math.floor(i / 3) * 70} textAnchor="middle" fontSize={11} fill="var(--c1)">core</text>
            <text x={68 + (i % 3) * 102} y={82 + Math.floor(i / 3) * 70} textAnchor="middle" fontSize={9} fill="var(--muted)">branch predictor, OoO</text>
          </g>
        ))}
        <rect x={22} y={184} width={296} height={44} rx={6} fill="var(--c4-soft)" stroke="var(--c4)" />
        <text x={170} y={211} textAnchor="middle" fontSize={12} fill="var(--c4)">big caches (16 MB L3)</text>

        <text x={545} y={18} textAnchor="middle" fontSize={14} fontWeight={700} fill="var(--text)">GPU (RTX 3050 Laptop): 16 SMs × 128 cores</text>
        <rect x={360} y={28} width={360} height={210} rx={10} fill="var(--panel-2)" stroke="var(--border)" />
        {Array.from({ length: 16 }, (_, s) => {
          const sx = 370 + (s % 4) * 87, sy = 38 + Math.floor(s / 4) * 50;
          return (
            <g key={s}>
              <rect x={sx} y={sy} width={80} height={44} rx={4} fill="var(--c3-soft)" stroke="var(--c3)" />
              {Array.from({ length: 32 }, (_, c) => (
                <rect key={c} x={sx + 4 + (c % 8) * 9.2} y={sy + 5 + Math.floor(c / 8) * 9} width={7} height={7} fill="var(--c3)" opacity={0.7} />
              ))}
            </g>
          );
        })}
      </Svg>
      <div className="caption">
        A CPU core is a genius: it predicts branches, runs instructions out of order, and has big caches — great for one complicated task.
        A GPU has 2,048 simple cores (drawn as 32 dots per SM for space). Each is slow and simple, but together they run the same math on
        thousands of numbers at once — exactly what matrix multiplies need.
      </div>
    </Viz>
  );
}

/* ---------- 2. grid / block / thread indexing ---------- */

function GridIndexing() {
  const [blockDim, setBlockDim] = useState<"4" | "8" | "16">("8");
  const [gridDim, setGridDim] = useState(4);
  const [n, setN] = useState(28);
  const [sel, setSel] = useState(13);
  const bd = Number(blockDim);
  const total = bd * gridDim;
  const selClamped = Math.min(sel, total - 1);
  const bIdx = Math.floor(selClamped / bd), tIdx = selClamped % bd;
  const cell = Math.min(40, Math.floor(700 / total));
  return (
    <Viz title="From blockIdx and threadIdx to a global index" hint="Click any thread. Threads past n are launched but do nothing (the bounds check). Real warps have 32 threads — this is scaled down.">
      <div className="controls">
        <div><span className="small muted">blockDim.x </span><Seg options={["4", "8", "16"] as const} value={blockDim} onChange={setBlockDim} /></div>
        <Slider label="gridDim.x (number of blocks)" value={gridDim} min={1} max={6} onChange={setGridDim} />
        <Slider label="n (array length)" value={n} min={1} max={total} onChange={setN} />
      </div>
      <svg viewBox={`0 0 ${Math.max(total * cell + 10, 300)} 110`} width={Math.max(total * cell + 10, 300)}>
        {Array.from({ length: gridDim }, (_, b) => (
          <g key={b}>
            <rect x={4 + b * bd * cell} y={4} width={bd * cell - 2} height={78} rx={6} fill={`var(--c${(b % 6) + 1}-soft)`} stroke={`var(--c${(b % 6) + 1})`} />
            <text x={4 + b * bd * cell + 6} y={18} fontSize={11} fontWeight={700} fill={`var(--c${(b % 6) + 1})`}>block {b}</text>
          </g>
        ))}
        {Array.from({ length: total }, (_, g) => {
          const idle = g >= n;
          const on = g === selClamped;
          return (
            <g key={g} onClick={() => setSel(g)} style={{ cursor: "pointer" }}>
              <rect x={6 + g * cell} y={26} width={cell - 6} height={cell - 6} rx={4}
                fill={on ? "var(--accent)" : idle ? "var(--panel-2)" : "var(--panel)"} stroke={on ? "var(--accent)" : "var(--border)"} opacity={idle ? 0.5 : 1} />
              <text x={6 + g * cell + (cell - 6) / 2} y={26 + (cell - 6) / 2 + 4} textAnchor="middle" fontSize={Math.min(11, cell / 3)}
                fill={on ? "white" : "var(--muted)"} fontFamily="var(--mono)">{g % bd}</text>
              <text x={6 + g * cell + (cell - 6) / 2} y={100} textAnchor="middle" fontSize={Math.min(10, cell / 3.2)} fill="var(--muted)" fontFamily="var(--mono)">{g}</text>
            </g>
          );
        })}
      </svg>
      <div className="card mono small" style={{ marginTop: 8 }}>
        int i = blockIdx.x * blockDim.x + threadIdx.x;<br />
        &nbsp;&nbsp;&nbsp;&nbsp;= {bIdx} × {bd} + {tIdx} = <b style={{ color: "var(--accent)" }}>{selClamped}</b>
        {selClamped >= n ? <span style={{ color: "var(--c5)" }}> → i ≥ n ({n}), this thread returns immediately</span> : <span> → this thread computes c[{selClamped}] = a[{selClamped}] + b[{selClamped}]</span>}
      </div>
      <div className="caption">Numbers inside boxes = threadIdx.x (local to its block). Numbers below = global index. Launch config: {gridDim} blocks × {bd} threads = {total} threads for n = {n}.</div>
    </Viz>
  );
}

/* ---------- 3. memory hierarchy ---------- */

function GpuMemory() {
  return (
    <Viz title="GPU memory hierarchy (RTX 3050 Laptop, Ampere sm_86)" hint="Closer to the cores = faster but smaller. Numbers are approximate.">
      <Svg w={720} h={300}>
        <rect x={10} y={10} width={500} height={200} rx={10} fill="var(--panel-2)" stroke="var(--border)" />
        <text x={20} y={30} fontSize={12} fontWeight={700} fill="var(--muted)">GPU chip</text>
        {[0, 1, 2].map((s) => (
          <g key={s}>
            <rect x={24 + s * 160} y={40} width={145} height={110} rx={8} fill="var(--c3-soft)" stroke="var(--c3)" />
            <text x={96 + s * 160} y={56} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--c3)">SM {s === 2 ? "… 15" : s}</text>
            <rect x={34 + s * 160} y={64} width={125} height={30} rx={4} fill="var(--panel)" stroke="var(--c6)" />
            <text x={96 + s * 160} y={83} textAnchor="middle" fontSize={11} fill="var(--text)">registers 256 KB</text>
            <rect x={34 + s * 160} y={102} width={125} height={38} rx={4} fill="var(--panel)" stroke="var(--c1)" />
            <text x={96 + s * 160} y={118} textAnchor="middle" fontSize={11} fill="var(--text)">L1 / shared memory</text>
            <text x={96 + s * 160} y={132} textAnchor="middle" fontSize={10} fill="var(--muted)">128 KB (≤100 KB shared)</text>
          </g>
        ))}
        <rect x={24} y={160} width={465} height={38} rx={6} fill="var(--c4-soft)" stroke="var(--c4)" />
        <text x={256} y={184} textAnchor="middle" fontSize={12} fill="var(--c4)">L2 cache — 2 MB, shared by all SMs</text>
        <rect x={10} y={240} width={500} height={50} rx={8} fill="var(--c2-soft)" stroke="var(--c2)" />
        <text x={260} y={262} textAnchor="middle" fontSize={13} fontWeight={700} fill="var(--c2)">VRAM: 4 GB GDDR6, 128-bit bus</text>
        <text x={260} y={280} textAnchor="middle" fontSize={11} fill="var(--muted)">~192 GB/s (model weights + KV cache live here)</text>
        <Arrow x1={256} y1={210} x2={256} y2={238} />
        <text x={530} y={82} fontSize={12} fill="var(--text)">registers: ~1 cycle, private per thread</text>
        <text x={530} y={124} fontSize={12} fill="var(--text)">shared: ~20–30 cycles, per block</text>
        <text x={530} y={184} fontSize={12} fill="var(--text)">L2: ~200 cycles</text>
        <text x={530} y={268} fontSize={12} fill="var(--text)">VRAM: ~400–600 cycles</text>
      </Svg>
      <div className="caption">
        Per SM on sm_86: 64K 32-bit registers, up to 1,536 resident threads (48 warps), max 1,024 threads per block.
        Some 3050 Laptop variants have 14 Gbps memory (~224 GB/s); we use 192 GB/s as the conservative number.
      </div>
    </Viz>
  );
}

/* ---------- 4. coalescing ---------- */

function Coalescing() {
  const [stride, setStride] = useState<"1" | "2" | "4" | "8" | "32">("1");
  const s = Number(stride);
  const addrs = Array.from({ length: 32 }, (_, i) => i * s); // in floats
  const sectors = Array.from(new Set(addrs.map((a) => Math.floor(a / 8)))); // 32-byte sector = 8 floats
  const maxSector = Math.max(...sectors) + 1;
  const drawn = Math.max(16, maxSector);
  const sw = 700 / drawn;
  const useful = 32 * 4, moved = sectors.length * 32;
  return (
    <Viz title="Coalesced vs strided memory access (one warp = 32 threads)" hint="Thread i reads float a[i × stride]. The hardware fetches memory in 32-byte sectors.">
      <div className="controls">
        <span className="small muted">stride</span>
        <Seg options={["1", "2", "4", "8", "32"] as const} value={stride} onChange={setStride} />
      </div>
      <svg viewBox="0 0 720 160" width={720}>
        {addrs.map((a, i) => {
          const tx = 10 + i * 21.8 + 8;
          const sx = 10 + Math.floor(a / 8) * sw + sw / 2;
          return (
            <g key={i}>
              <circle cx={tx} cy={18} r={7} fill="var(--c1)" />
              <line x1={tx} y1={26} x2={sx} y2={108} stroke="var(--c1)" strokeOpacity={0.35} />
            </g>
          );
        })}
        <text x={10} y={50} fontSize={11} fill="var(--muted)">32 threads of a warp</text>
        {Array.from({ length: drawn }, (_, k) => {
          const hit = sectors.includes(k);
          return <rect key={k} x={10 + k * sw} y={110} width={Math.max(sw - 1, 1)} height={26} fill={hit ? "var(--c2)" : "var(--panel-2)"} stroke="var(--border)" strokeWidth={0.5} />;
        })}
        <text x={10} y={154} fontSize={11} fill="var(--muted)">memory, in 32-byte sectors (orange = fetched)</text>
      </svg>
      <div className="grid3 small">
        <div className="card"><b>Sectors fetched</b><div className="mono">{sectors.length}</div></div>
        <div className="card"><b>Bytes moved / used</b><div className="mono">{moved} / {useful}</div></div>
        <div className="card"><b>Efficiency</b><div className="mono" style={{ color: useful / moved > 0.9 ? "var(--c3)" : "var(--c5)" }}>{((useful / moved) * 100).toFixed(0)}%</div></div>
      </div>
      <div className="caption">
        Stride 1: neighbouring threads read neighbouring addresses → 4 sectors, 100% useful ("coalesced"). Stride 8+: every thread needs its own sector,
        so the memory system moves 8× more bytes than we use. On a memory-bound workload that is directly 8× slower.
      </div>
    </Viz>
  );
}

/* ---------- 5. reduction tree ---------- */

function reductionSteps() {
  const init = [3, 1, 4, 1, 5, 9, 2, 6];
  const states: number[][] = [init.slice()];
  let cur = init.slice();
  for (let stride = 4; stride >= 1; stride /= 2) {
    const next = cur.slice();
    for (let t = 0; t < stride; t++) next[t] = cur[t] + cur[t + stride];
    states.push(next);
    cur = next;
  }
  const draw = (k: number) => {
    const st = states[k];
    const prev = k > 0 ? states[k - 1] : null;
    const stride = k > 0 ? 8 >> k : 0;
    return (
      <Svg w={720} h={150}>
        {prev && prev.map((v, i) => (
          <g key={"p" + i}>
            <rect x={20 + i * 86} y={10} width={74} height={36} rx={6} fill="var(--panel-2)" stroke="var(--border)" opacity={i < stride * 2 ? 1 : 0.35} />
            <text x={57 + i * 86} y={33} textAnchor="middle" fontSize={14} fill="var(--muted)" fontFamily="var(--mono)">{v}</text>
          </g>
        ))}
        {prev && Array.from({ length: stride }, (_, t) => (
          <g key={"a" + t}>
            <line x1={57 + t * 86} y1={46} x2={57 + t * 86} y2={92} stroke="var(--c1)" markerEnd="url(#arrow)" />
            <line x1={57 + (t + stride) * 86} y1={46} x2={60 + t * 86} y2={92} stroke="var(--c2)" markerEnd="url(#arrow)" />
          </g>
        ))}
        {st.map((v, i) => {
          const live = k === 0 || i < stride;
          return (
            <g key={"s" + i}>
              <rect x={20 + i * 86} y={96} width={74} height={36} rx={6} fill={live ? (k === 3 && i === 0 ? "var(--accent)" : "var(--c3-soft)") : "var(--panel-2)"}
                stroke={live ? "var(--c3)" : "var(--border)"} opacity={live ? 1 : 0.35} />
              <text x={57 + i * 86} y={119} textAnchor="middle" fontSize={14} fontWeight={700} fill={k === 3 && i === 0 ? "white" : "var(--text)"} fontFamily="var(--mono)">{v}</text>
              <text x={57 + i * 86} y={146} textAnchor="middle" fontSize={10} fill="var(--muted)">thread {i}</text>
            </g>
          );
        })}
      </Svg>
    );
  };
  return [
    { title: "Each thread holds one value in shared memory", body: <>{draw(0)}<p className="small">8 threads, 8 numbers. A loop on one thread would need 7 additions in a row. Can we use the threads together?</p></> },
    { title: "stride = 4: threads 0–3 add the value 4 places to the right", body: <>{draw(1)}<p className="small"><code>partial[t] += partial[t + 4]</code> — 4 additions happen <b>at the same time</b>. Then <code>__syncthreads()</code> so everyone sees the new values.</p></> },
    { title: "stride = 2: threads 0–1 keep going", body: <>{draw(2)}<p className="small">Half the threads drop out each round.</p></> },
    { title: "stride = 1: thread 0 has the total", body: <>{draw(3)}<p className="small">8 numbers summed in <b>3 steps</b> (log₂ 8) instead of 7. For 1,024 numbers: 10 steps instead of 1,023. This is how RMSNorm and softmax compute their sums on the GPU.</p></> },
  ];
}

/* ---------- 6. tiled matmul ---------- */

type T2 = [number, number] | null;

function MatTiles(props: { a: T2; b: T2; c: T2; cDone?: T2; note?: string }) {
  const cell = 28, tile = 2;
  const mat = (ox: number, label: string, hl: T2, color: number, done?: T2) => (
    <g>
      <text x={ox + 56} y={14} textAnchor="middle" fontSize={13} fontWeight={700} fill="var(--text)">{label}</text>
      {Array.from({ length: 16 }, (_, k) => {
        const r = Math.floor(k / 4), c = k % 4;
        const inT = hl && Math.floor(r / tile) === hl[0] && Math.floor(c / tile) === hl[1];
        const inDone = done && Math.floor(r / tile) === done[0] && Math.floor(c / tile) === done[1];
        return <rect key={k} x={ox + c * cell} y={22 + r * cell} width={cell - 3} height={cell - 3} rx={3}
          fill={inT ? `var(--c${color})` : inDone ? "var(--c3-soft)" : "var(--panel-2)"} opacity={inT ? 0.85 : 1} stroke="var(--border)" />;
      })}
    </g>
  );
  return (
    <div>
      <Svg w={720} h={170}>
        {mat(10, "A (VRAM)", props.a, 1)}
        <text x={140} y={80} fontSize={20} fill="var(--text)">×</text>
        {mat(165, "B (VRAM)", props.b, 2)}
        <text x={295} y={80} fontSize={20} fill="var(--text)">=</text>
        {mat(320, "C", props.c, 3, props.cDone)}
        <rect x={470} y={22} width={240} height={110} rx={8} fill="var(--c1-soft)" stroke="var(--c1)" strokeDasharray="5 4" />
        <text x={590} y={40} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--c1)">shared memory (one block)</text>
        {props.a && Array.from({ length: 4 }, (_, k) => <rect key={"sa" + k} x={490 + (k % 2) * 28} y={55 + Math.floor(k / 2) * 28} width={25} height={25} rx={3} fill="var(--c1)" opacity={0.85} />)}
        {props.b && Array.from({ length: 4 }, (_, k) => <rect key={"sb" + k} x={620 + (k % 2) * 28} y={55 + Math.floor(k / 2) * 28} width={25} height={25} rx={3} fill="var(--c2)" opacity={0.85} />)}
        <text x={515} y={128} textAnchor="middle" fontSize={10} fill="var(--muted)">tile of A</text>
        <text x={645} y={128} textAnchor="middle" fontSize={10} fill="var(--muted)">tile of B</text>
      </Svg>
      {props.note && <p className="small">{props.note}</p>}
    </div>
  );
}

const TILE_STEPS = [
  { title: "Goal: one thread block computes one tile of C", body: <MatTiles a={null} b={null} c={[0, 1]} note="C is 4×4, tile size 2×2 (real kernels use 16×16 or 32×32). The block owns the green tile C[0..2, 2..4]. Each of its 4 threads computes one element." /> },
  { title: "Phase 0: cooperatively load tile A(0,0) and B(0,1) into shared memory", body: <MatTiles a={[0, 0]} b={[0, 1]} c={[0, 1]} note="Each thread loads ONE element of each tile (coalesced). Then __syncthreads() — wait until the whole tile is loaded." /> },
  { title: "Compute: every thread uses the whole shared tiles", body: <MatTiles a={[0, 0]} b={[0, 1]} c={[0, 1]} note="Each element in shared memory is read by 2 threads (TILE threads in general). Shared memory is ~20× faster than VRAM, and VRAM was read only once per element. Then __syncthreads() again before overwriting the tiles." /> },
  { title: "Phase 1: slide along K — load A(0,1) and B(1,1)", body: <MatTiles a={[0, 1]} b={[1, 1]} c={[0, 1]} note="Same pattern: load, sync, multiply-accumulate, sync. Partial sums stay in registers between phases." /> },
  { title: "Done: write the finished tile of C", body: <MatTiles a={null} b={null} c={null} cDone={[0, 1]} note="Without tiling each thread reads K elements of A and K of B from VRAM. With TILE×TILE tiles, VRAM traffic drops by a factor of TILE (16× for 16×16 tiles). This is the same blocking idea as on the CPU, with shared memory as a hand-managed cache." /> },
];

/* ---------- 7. streams timeline ---------- */

function StreamsTimeline() {
  const [mode, setMode] = useState<"one" | "two">("one");
  const U = 60;
  const ops = mode === "one"
    ? [
      { lane: 0, x: 0, w: 2, label: "copy in 1", c: 2 }, { lane: 0, x: 2, w: 3, label: "kernel 1", c: 3 }, { lane: 0, x: 5, w: 1, label: "out 1", c: 4 },
      { lane: 0, x: 6, w: 2, label: "copy in 2", c: 2 }, { lane: 0, x: 8, w: 3, label: "kernel 2", c: 3 }, { lane: 0, x: 11, w: 1, label: "out 2", c: 4 },
    ]
    : [
      { lane: 0, x: 0, w: 2, label: "copy in 1", c: 2 }, { lane: 0, x: 2, w: 3, label: "kernel 1", c: 3 }, { lane: 0, x: 5, w: 1, label: "out 1", c: 4 },
      { lane: 1, x: 2, w: 2, label: "copy in 2", c: 2 }, { lane: 1, x: 5, w: 3, label: "kernel 2", c: 3 }, { lane: 1, x: 8, w: 1, label: "out 2", c: 4 },
    ];
  const end = Math.max(...ops.map((o) => o.x + o.w));
  return (
    <Viz title="Streams: overlapping copies and compute" hint="The GPU has separate copy engines and compute units. Work in different streams can run at the same time.">
      <Seg options={["one", "two"] as const} value={mode} onChange={setMode} labels={{ one: "1 stream (in order)", two: "2 streams (overlap)" }} />
      <Svg w={720} h={110}>
        {["stream A", "stream B"].map((s, i) => <text key={s} x={0} y={36 + i * 40} fontSize={12} fill="var(--muted)">{s}</text>)}
        {ops.map((o, i) => (
          <g key={i}>
            <rect x={70 + o.x * U * 0.85} y={18 + o.lane * 40} width={o.w * U * 0.85 - 3} height={28} rx={4} fill={`var(--c${o.c}-soft)`} stroke={`var(--c${o.c})`} />
            <text x={70 + o.x * U * 0.85 + (o.w * U * 0.85) / 2} y={36 + o.lane * 40} textAnchor="middle" fontSize={11} fill="var(--text)">{o.label}</text>
          </g>
        ))}
        <line x1={70 + end * U * 0.85} y1={10} x2={70 + end * U * 0.85} y2={100} stroke="var(--accent)" strokeDasharray="4 3" />
        <text x={74 + end * U * 0.85} y={104} fontSize={11} fill="var(--accent)">done at t={end}</text>
      </Svg>
      <div className="caption">Every launch and async copy just puts a command into a stream's queue and returns immediately. The CPU only waits when it calls cuStreamSynchronize (or a blocking copy).</div>
    </Viz>
  );
}

/* ---------- page ---------- */

export default function Page() {
  return (
    <>
      <PageHeader
        kicker="Computers · Lesson 3"
        title="GPUs & CUDA"
        subtitle="How a graphics card does 2,048 things at once, how we write programs (kernels) for it, and how Rust launches them without any library in between."
        learn={[
          "Why GPUs are good at LLM math: many simple cores vs few smart ones",
          "The CUDA model: grid → blocks → warps (32 threads) → threads, and how each thread finds its data",
          "GPU memory: registers, shared memory, L2, VRAM — and why coalesced access matters",
          "Real kernels in CUDA C: vector add, RMSNorm with a reduction tree, a quantized matvec, a tiled matmul",
          "How Rust compiles kernels to PTX and launches them through our own CUDA driver FFI",
          "Streams: how GPU work runs asynchronously",
        ]}
      />

      <Section title="1. Why a GPU?">
        <p>
          An LLM forward pass is mostly one operation repeated: multiply a big matrix by a vector (or another matrix). Every output number can
          be computed <i>independently</i> of the others. That is called <b>data parallelism</b>, and it is exactly what GPUs were built for
          (originally: computing the colour of millions of pixels independently).
        </p>
        <CpuVsGpu />
        <table>
          <thead><tr><th>Our GPU: RTX 3050 Laptop</th><th>Value</th><th>Why it matters</th></tr></thead>
          <tbody>
            <tr><td>Architecture</td><td>Ampere, compute capability <b>sm_86</b> (chip GA107)</td><td>We compile kernels for exactly this target. No FP8 support.</td></tr>
            <tr><td>SMs (streaming multiprocessors)</td><td>16</td><td>Each SM runs several thread blocks at once</td></tr>
            <tr><td>CUDA cores</td><td>2,048 (128 per SM)</td><td>Parallel f32 units</td></tr>
            <tr><td>VRAM</td><td>4 GB GDDR6, 128-bit</td><td>Weights + KV cache must fit here</td></tr>
            <tr><td>Bandwidth</td><td>~192 GB/s</td><td>Decode ceiling ≈ 192 ÷ 2.5 GB ≈ 75 tokens/s for Qwen3-4B Q4</td></tr>
            <tr><td>L2 cache</td><td>2 MB</td><td>Too small to hold weights; they stream from VRAM every token</td></tr>
          </tbody>
        </table>
        <Callout kind="analogy">
          A CPU is a few expert chefs, each able to cook any complex dish. A GPU is a stadium of 2,000 helpers who can each only chop —
          but if you need 2 million onions chopped, the stadium wins easily.
        </Callout>
      </Section>

      <Section title="2. The CUDA programming model">
        <p>
          You write one function, the <b>kernel</b>, from the point of view of <i>one thread</i>. Then you launch it with thousands of threads.
          Each thread asks "who am I?" and works on its own piece of data.
        </p>
        <ul>
          <li><b>Thread</b>: one instance of the kernel. Has its own registers.</li>
          <li><b>Warp</b>: 32 threads that execute the <i>same instruction</i> together, in lock-step. The real unit of scheduling.</li>
          <li><b>Block</b>: up to 1,024 threads that run on the <i>same SM</i>, can share fast <b>shared memory</b>, and can wait for each other (<code>__syncthreads()</code>).</li>
          <li><b>Grid</b>: all the blocks of one launch. Blocks are independent and can run in any order.</li>
        </ul>
        <GridIndexing />
        <Code lang="c" title="kernels/vector_add.cu — the 'hello world' of CUDA">{`
// __global__ = a kernel: runs on the GPU, launched from the CPU.
// extern "C" = keep the plain name "vector_add" so Rust can find it.
extern "C" __global__ void vector_add(const float* a, const float* b, float* c, int n) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;   // my global index
    if (i < n) {                                      // the grid may be bigger than n
        c[i] = a[i] + b[i];
    }
}

// Launch idea (pseudo-code): 1,000,000 elements, 256 threads per block
//   blocks = (1000000 + 255) / 256 = 3907
//   vector_add<<<3907, 256>>>(a, b, c, 1000000);`}</Code>
        <Callout kind="warn" title="⚠️ Watch out: warp divergence">
          All 32 threads in a warp run the same instruction. If half of them take an <code>if</code> branch and half take the <code>else</code>,
          the warp runs <i>both</i> paths one after the other, with half the threads masked off. Keep branches uniform inside a warp when you can.
        </Callout>
        <Quiz
          q="blockDim.x = 256. Thread 10 of block 3 computes which global index?"
          options={["13", "266", "778", "2560"]}
          answer={2}
          explain="i = blockIdx.x × blockDim.x + threadIdx.x = 3 × 256 + 10 = 778."
        />
      </Section>

      <Section title="3. GPU memory and coalescing">
        <GpuMemory />
        <p>
          The golden rule of GPU performance: <b>VRAM is slow, so read every byte once, and read it in a coalesced way.</b>
          When the 32 threads of a warp read 32 neighbouring floats, the hardware combines them into a few wide transactions.
          When they read scattered addresses, each needs its own transaction.
        </p>
        <Coalescing />
        <Callout kind="deep">
          <p>
            This is why the <b>layout</b> of weights in memory is a design decision, not a detail. For our quantized matvec kernels we may
            re-arrange (repack) GGUF blocks at load time so that consecutive threads read consecutive bytes. llama.cpp and every serious
            engine does some version of this.
          </p>
        </Callout>
      </Section>

      <Section title="4. Working together: shared memory and reductions">
        <p>
          Many LLM operations need a <b>sum over a whole row</b>: RMSNorm (sum of squares), softmax (sum of exponentials), dot products.
          One thread summing 2,560 numbers alone is slow. Instead, the threads of a block cooperate using a <b>reduction tree</b>.
        </p>
        <Stepper title="Reduction tree: summing 8 numbers with 8 threads" hint="Press Next. Each round, half the threads add a partner's value." steps={reductionSteps()} />
        <p>Here is a real RMSNorm kernel (the normalization used before every attention and MLP layer in Qwen3) using exactly this tree:</p>
        <Code lang="c" title="kernels/rmsnorm.cu">{`
// y[i] = x[i] / sqrt(mean(x^2) + eps) * w[i]
// One block per row (one token), 256 threads per block.
extern "C" __global__ void rmsnorm_f32(const float* x, const float* w, float* y,
                                       int n, float eps) {
    __shared__ float partial[256];              // shared by the 256 threads of this block

    const float* row = x + (size_t)blockIdx.x * n;
    float*       out = y + (size_t)blockIdx.x * n;

    // 1) Each thread sums squares of a strided slice: i, i+256, i+512, ... (coalesced)
    float s = 0.0f;
    for (int i = threadIdx.x; i < n; i += blockDim.x) s += row[i] * row[i];
    partial[threadIdx.x] = s;
    __syncthreads();

    // 2) Reduction tree in shared memory: 256 -> 128 -> ... -> 1
    for (int stride = blockDim.x / 2; stride > 0; stride /= 2) {
        if (threadIdx.x < stride) partial[threadIdx.x] += partial[threadIdx.x + stride];
        __syncthreads();
    }

    // 3) Everyone reads the total and writes their slice of the output.
    float scale = rsqrtf(partial[0] / n + eps);   // 1 / sqrt(...)
    for (int i = threadIdx.x; i < n; i += blockDim.x) out[i] = row[i] * scale * w[i];
}`}</Code>
        <Quiz
          q="Why is __syncthreads() needed inside the reduction loop?"
          options={[
            "To make the GPU run faster",
            "So no thread reads partial[t + stride] before the thread that writes it has finished the previous round",
            "Because shared memory is read-only",
            "To synchronize with the CPU",
          ]}
          answer={1}
          explain="Threads in different warps run at different times. Without the barrier, a thread could read a partner's value from the old round — a race condition with a wrong sum."
        />
      </Section>

      <Section title="5. The kernel that matters most: quantized matrix × vector">
        <p>
          In decode, almost all time goes to <code>y = W · x</code> with quantized <code>W</code>. Here is a simple version for the <b>Q8_0</b> format
          (blocks of 32 int8 weights with one f16 scale = 34 bytes). It uses one <b>warp per output row</b> and a <b>warp shuffle</b> — threads in a warp can
          pass registers to each other directly, without shared memory.
        </p>
        <Code lang="c" title="kernels/matvec_q8_0.cu (learning sketch)">{`
#include <cuda_fp16.h>
#include <stdint.h>

struct BlockQ8_0 {          // same layout as GGUF Q8_0
    half   d;               // scale
    int8_t qs[32];          // 32 quantized weights: w = d * q
};

// One warp (32 threads) computes one output row. 4 warps (128 threads) per block.
extern "C" __global__ void matvec_q8_0(const BlockQ8_0* W, const float* x, float* y,
                                       int rows, int cols) {
    int row  = blockIdx.x * (blockDim.x / 32) + threadIdx.x / 32;
    int lane = threadIdx.x % 32;                    // my position inside the warp
    if (row >= rows) return;

    int nblocks = cols / 32;
    const BlockQ8_0* wrow = W + (size_t)row * nblocks;

    float sum = 0.0f;
    for (int b = lane; b < nblocks; b += 32) {       // lanes take blocks round-robin
        float d = __half2float(wrow[b].d);
        const float* xb = x + b * 32;
        float s = 0.0f;
        for (int j = 0; j < 32; j++) s += (float)wrow[b].qs[j] * xb[j];
        sum += d * s;                                // dequantize once per block
    }

    // Warp reduction with shuffles: 32 -> 16 -> 8 -> 4 -> 2 -> 1
    for (int off = 16; off > 0; off /= 2)
        sum += __shfl_down_sync(0xffffffff, sum, off);

    if (lane == 0) y[row] = sum;
}`}</Code>
        <Callout kind="deep">
          This sketch is correct but not fast: neighbouring lanes read blocks 34 bytes apart, so loads are only partly coalesced, and each
          weight is turned into a float one by one. Faster versions let all 32 lanes share one block (lane j takes weight j), load 4 bytes at a
          time, and use the <code>__dp4a</code> instruction (4 int8 multiply-adds in one). Making this kernel fast is one of the main
          learning projects of <code>kiln-engine</code>.
        </Callout>
      </Section>

      <Section title="6. Tiled matrix multiply (prefill)">
        <p>
          During <b>prefill</b> we process all prompt tokens at once, so it is matrix × matrix. Now each weight is used by many tokens, and the trick is
          to load a <b>tile</b> into shared memory once and reuse it many times.
        </p>
        <Stepper title="Tiled matmul with shared memory" hint="Follow one thread block computing one tile of C." steps={TILE_STEPS} />
        <Code lang="c" title="kernels/matmul_tiled.cu">{`
#define TILE 16

// C (M×N) = A (M×K) × B (K×N), row-major. Launch: blocks = (N/16, M/16), threads = (16, 16).
extern "C" __global__ void matmul_tiled(const float* A, const float* B, float* C,
                                        int M, int N, int K) {
    __shared__ float As[TILE][TILE];
    __shared__ float Bs[TILE][TILE];

    int row = blockIdx.y * TILE + threadIdx.y;
    int col = blockIdx.x * TILE + threadIdx.x;
    float acc = 0.0f;

    for (int t = 0; t < (K + TILE - 1) / TILE; t++) {
        // Each thread loads one element of each tile (0 if out of range).
        int ak = t * TILE + threadIdx.x;
        int bk = t * TILE + threadIdx.y;
        As[threadIdx.y][threadIdx.x] = (row < M && ak < K) ? A[row * K + ak] : 0.0f;
        Bs[threadIdx.y][threadIdx.x] = (bk < K && col < N) ? B[bk * N + col] : 0.0f;
        __syncthreads();                       // tile fully loaded

        for (int k = 0; k < TILE; k++)
            acc += As[threadIdx.y][k] * Bs[k][threadIdx.x];
        __syncthreads();                       // done using this tile
    }
    if (row < M && col < N) C[row * N + col] = acc;
}`}</Code>
        <Quiz
          q="With 16×16 tiles, roughly how much does tiling reduce reads from VRAM compared with every thread reading its own row and column?"
          options={["2×", "16×", "256×", "No change"]}
          answer={1}
          explain="Each element loaded into shared memory is reused by 16 threads, so VRAM traffic drops by about the tile width, 16×."
        />
      </Section>

      <Section title="7. From Rust to the GPU: no library in between">
        <p>
          The usual way is a crate like <code>cudarc</code>. In Kiln we write the thin layer ourselves so we see every step.
          The path looks like this:
        </p>
        <Svg w={720} h={120} label="build and launch pipeline">
          <Box x={0} y={30} w={120} h={56} label=".cu files" sub="CUDA C kernels" color={3} />
          <Arrow x1={122} y1={58} x2={162} y2={58} label="nvcc" />
          <Box x={165} y={30} w={120} h={56} label="kernels.ptx" sub="GPU assembly (text)" color={1} />
          <Arrow x1={287} y1={58} x2={327} y2={58} label="include_str!" />
          <Box x={330} y={30} w={120} h={56} label="Rust binary" sub="PTX embedded" color={2} />
          <Arrow x1={452} y1={58} x2={492} y2={58} label="FFI" />
          <Box x={495} y={30} w={110} h={56} label="nvcuda.dll" sub="CUDA driver" color={4} />
          <Arrow x1={607} y1={58} x2={642} y2={58} />
          <Box x={645} y={30} w={74} h={56} label="GPU" color={5} />
        </Svg>
        <p><b>Step 1 — compile kernels at build time.</b> Cargo runs <code>build.rs</code> before compiling our crate:</p>
        <Code title="crates/kiln-engine/build.rs">{`
use std::process::Command;

fn main() {
    let out_dir = std::env::var("OUT_DIR").unwrap();
    println!("cargo:rerun-if-changed=kernels/kernels.cu");

    // -ptx: produce PTX text, -arch=sm_86: our RTX 3050's architecture
    let status = Command::new("nvcc")
        .args(["-ptx", "-O3", "-arch=sm_86", "kernels/kernels.cu", "-o"])
        .arg(format!("{out_dir}/kernels.ptx"))
        .status()
        .expect("nvcc not found - is the CUDA toolkit installed?");
    assert!(status.success(), "nvcc failed");
}`}</Code>
        <p><b>Step 2 — declare the driver functions we need.</b> The CUDA <i>driver API</i> is a plain C library. We describe a few of its functions to Rust:</p>
        <Code title="crates/kiln-engine/src/backend/cuda/ffi.rs">{`
use std::ffi::{c_char, c_int, c_uint, c_void};

pub type CUresult = c_int;            // 0 = CUDA_SUCCESS
pub type CUdevice = c_int;
pub type CUdeviceptr = u64;           // an address in VRAM (not usable as a CPU pointer!)
pub type CUcontext = *mut c_void;     // opaque handles
pub type CUmodule = *mut c_void;
pub type CUfunction = *mut c_void;
pub type CUstream = *mut c_void;

#[link(name = "cuda")]                // links cuda.lib -> calls go to nvcuda.dll
unsafe extern "system" {
    pub fn cuInit(flags: c_uint) -> CUresult;
    pub fn cuDeviceGet(dev: *mut CUdevice, ordinal: c_int) -> CUresult;
    pub fn cuCtxCreate_v2(ctx: *mut CUcontext, flags: c_uint, dev: CUdevice) -> CUresult;
    pub fn cuModuleLoadData(module: *mut CUmodule, image: *const c_void) -> CUresult;
    pub fn cuModuleGetFunction(f: *mut CUfunction, m: CUmodule, name: *const c_char) -> CUresult;
    pub fn cuMemAlloc_v2(ptr: *mut CUdeviceptr, bytes: usize) -> CUresult;
    pub fn cuMemcpyHtoD_v2(dst: CUdeviceptr, src: *const c_void, bytes: usize) -> CUresult;
    pub fn cuMemcpyDtoH_v2(dst: *mut c_void, src: CUdeviceptr, bytes: usize) -> CUresult;
    pub fn cuLaunchKernel(
        f: CUfunction,
        grid_x: c_uint, grid_y: c_uint, grid_z: c_uint,
        block_x: c_uint, block_y: c_uint, block_z: c_uint,
        shared_mem_bytes: c_uint,
        stream: CUstream,
        params: *mut *mut c_void,      // array of pointers to each argument
        extra: *mut *mut c_void,
    ) -> CUresult;
    pub fn cuCtxSynchronize() -> CUresult;
}`}</Code>
        <p><b>Step 3 — load the PTX and launch.</b> (Simplified: real code wraps these in safe types that free memory on <code>Drop</code>.)</p>
        <Code title="launching vector_add from Rust">{`
use std::ffi::{c_void, CString};
use std::ptr::null_mut;

static PTX: &str = include_str!(concat!(env!("OUT_DIR"), "/kernels.ptx"));

fn check(r: CUresult) {
    assert_eq!(r, 0, "CUDA driver error code {r}");
}

fn main() {
    let n: usize = 1 << 20;
    let a = vec![1.0f32; n];
    let b = vec![2.0f32; n];
    let mut c = vec![0.0f32; n];
    let bytes = n * std::mem::size_of::<f32>();

    unsafe {
        check(cuInit(0));
        let mut dev = 0;
        check(cuDeviceGet(&mut dev, 0));
        let mut ctx = null_mut();
        check(cuCtxCreate_v2(&mut ctx, 0, dev));

        // Load our compiled kernels and find one by name.
        let ptx = CString::new(PTX).unwrap();             // driver wants a NUL-terminated string
        let mut module = null_mut();
        check(cuModuleLoadData(&mut module, ptx.as_ptr() as *const c_void));
        let mut func = null_mut();
        let name = CString::new("vector_add").unwrap();
        check(cuModuleGetFunction(&mut func, module, name.as_ptr()));

        // Allocate VRAM and copy inputs CPU -> GPU.
        let (mut d_a, mut d_b, mut d_c) = (0u64, 0u64, 0u64);
        check(cuMemAlloc_v2(&mut d_a, bytes));
        check(cuMemAlloc_v2(&mut d_b, bytes));
        check(cuMemAlloc_v2(&mut d_c, bytes));
        check(cuMemcpyHtoD_v2(d_a, a.as_ptr() as *const c_void, bytes));
        check(cuMemcpyHtoD_v2(d_b, b.as_ptr() as *const c_void, bytes));

        // Kernel arguments: an array of POINTERS to each argument value.
        let mut n_arg = n as i32;
        let mut params: [*mut c_void; 4] = [
            &mut d_a as *mut u64 as *mut c_void,
            &mut d_b as *mut u64 as *mut c_void,
            &mut d_c as *mut u64 as *mut c_void,
            &mut n_arg as *mut i32 as *mut c_void,
        ];
        let threads = 256u32;
        let blocks = (n as u32).div_ceil(threads);
        check(cuLaunchKernel(func, blocks, 1, 1, threads, 1, 1, 0, null_mut(),
                             params.as_mut_ptr(), null_mut()));

        // Launch is async; this copy waits for the kernel to finish first.
        check(cuMemcpyDtoH_v2(c.as_mut_ptr() as *mut c_void, d_c, bytes));
    }
    assert!(c.iter().all(|&v| v == 3.0));
    println!("vector_add OK on {n} elements");
}`}</Code>
        <Callout kind="rust">
          <p>
            Everything here is <code>unsafe</code> because Rust cannot check what C code does with our pointers. Our job is to build a small
            <b> safe wrapper</b> on top: a <code>DeviceBuffer&lt;T&gt;</code> that remembers its length and calls <code>cuMemFree</code> in
            <code> Drop</code>, a <code>Kernel</code> type with typed <code>launch()</code> methods, and error codes turned into a Rust
            <code> Result</code>. The rest of the engine never touches raw CUDA. The "Unsafe, pointers & FFI" lesson covers these patterns.
          </p>
        </Callout>
      </Section>

      <Section title="8. Streams: the GPU works in the background">
        <p>
          <code>cuLaunchKernel</code> does <b>not</b> wait for the kernel to finish. It puts a command into a <b>stream</b> (a queue) and returns in a few
          microseconds. Commands in one stream run in order; commands in different streams may overlap. This lets the CPU prepare the next
          batch while the GPU is still computing — essential for keeping the GPU busy in a serving engine.
        </p>
        <StreamsTimeline />
        <Callout kind="kiln">
          <p>
            In <code>worker-gpu</code>, one decode step for a batch is a fixed sequence of ~10 kernels per layer × 36 layers. Each launch costs
            a few microseconds of CPU time, which adds up (~1–2 ms per token is possible). Later optimizations: <b>fuse kernels</b> (e.g. RMSNorm +
            matvec), and record the whole step once as a <b>CUDA graph</b> and replay it each token.
          </p>
        </Callout>
        <Quiz
          q="Right after cuLaunchKernel returns, is the result in VRAM ready?"
          options={[
            "Yes, the call blocks until the kernel is done",
            "Not necessarily — the launch is queued; you must synchronize (or do a copy in the same stream) before reading",
            "Only for small kernels",
            "Only on Windows",
          ]}
          answer={1}
          explain="Kernel launches are asynchronous. A synchronous copy in the same stream, cuStreamSynchronize or cuCtxSynchronize waits for it."
        />
      </Section>

      <Recap
        items={[
          "GPUs win on data-parallel math: thousands of simple cores running one kernel on different data. Our RTX 3050 Laptop: sm_86, 16 SMs, 2,048 cores, 4 GB, ~192 GB/s.",
          "Kernel = code for one thread. Threads → warps of 32 (lock-step) → blocks (share memory, sync) → grid. Global index = blockIdx × blockDim + threadIdx.",
          "Memory: registers → shared/L1 → L2 → VRAM. VRAM is slow: read each byte once and keep warp accesses coalesced.",
          "Reductions (sums) use a tree in shared memory or warp shuffles: log₂(n) steps instead of n.",
          "Tiling loads data into shared memory once and reuses it TILE times — the GPU version of CPU cache blocking.",
          "Kiln compiles .cu → PTX with nvcc in build.rs, embeds it, and launches through ~10 hand-written driver API functions, wrapped in safe Rust types.",
          "Launches are asynchronous and go into streams; synchronize before reading results.",
        ]}
      />
    </>
  );
}
