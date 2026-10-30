import { useMemo, useState } from "react";
import {
  PageHeader, Section, Callout, Code, Viz, Slider, Seg, Stepper, Quiz, Recap, Svg, Box, Arrow,
} from "../components/ui";

/* ---------------- deterministic random numbers ---------------- */

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gaussianWeights(seed: number, n: number, outlier: boolean): number[] {
  const r = mulberry32(seed);
  const w = Array.from({ length: n }, () => {
    const u = Math.max(r(), 1e-9), v = r();
    return 0.04 * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); // typical weights are small
  });
  if (outlier) w[Math.floor(r() * n)] = 0.32;
  return w;
}

/* ---------------- the three quantizers (same math as ggml) ---------------- */

type Fmt = "Q8_0" | "Q4_0" | "Q4_K";
type QResult = { q: number[]; deq: number[]; params: string; bpw: number; levels: number[] };

function quantize(w: number[], fmt: Fmt): QResult {
  if (fmt === "Q8_0") {
    // symmetric: d = max|w| / 127, q in [-127, 127]
    const amax = Math.max(...w.map(Math.abs));
    const d = amax / 127;
    const q = w.map((x) => (d ? Math.round(x / d) : 0));
    return { q, deq: q.map((v) => v * d), params: `d (scale, fp16) = ${d.toExponential(3)}`, bpw: (32 * 8 + 16) / 32,
      levels: Array.from({ length: 255 }, (_, i) => (i - 127) * d) };
  }
  if (fmt === "Q4_0") {
    // ggml: take the value with largest |w| (keep its sign), d = max / -8, q = round(w/d) + 8 clamped to 0..15
    let m = 0;
    for (const x of w) if (Math.abs(x) > Math.abs(m)) m = x;
    const d = m / -8;
    const q = w.map((x) => Math.min(15, Math.max(0, Math.round(d ? x / d : 0) + 8)));
    return { q, deq: q.map((v) => (v - 8) * d), params: `d (scale, fp16) = ${d.toExponential(3)}`, bpw: (32 * 4 + 16) / 32,
      levels: Array.from({ length: 16 }, (_, i) => (i - 8) * d) };
  }
  // Q4_K-style: asymmetric, per 32-block scale AND min (real Q4_K stores those in 6 bits inside a 256 super-block)
  const lo = Math.min(...w), hi = Math.max(...w);
  const s = (hi - lo) / 15;
  const q = w.map((x) => (s ? Math.round((x - lo) / s) : 0));
  return { q, deq: q.map((v) => v * s + lo), params: `scale = ${s.toExponential(3)}, min = ${lo.toExponential(3)}`, bpw: 4.5,
    levels: Array.from({ length: 16 }, (_, i) => i * s + lo) };
}

/* ---------------- Interactive block quantizer ---------------- */

function BlockQuantizer() {
  const [seed, setSeed] = useState(7);
  const [fmt, setFmt] = useState<Fmt>("Q4_0");
  const [outlier, setOutlier] = useState<"no" | "yes">("no");
  const w = useMemo(() => gaussianWeights(seed, 32, outlier === "yes"), [seed, outlier]);
  const r = useMemo(() => quantize(w, fmt), [w, fmt]);
  const err = w.map((x, i) => r.deq[i] - x);
  const rmse = Math.sqrt(err.reduce((s, e) => s + e * e, 0) / err.length);
  const maxErr = Math.max(...err.map(Math.abs));
  const rms = Math.sqrt(w.reduce((s, x) => s + x * x, 0) / w.length);

  const H = 260, mid = 130, ox = 40, bw = 21;
  const ymax = Math.max(0.36, ...w.map(Math.abs)) * 1.05;
  const Y = (v: number) => mid - (v / ymax) * 115;
  return (
    <Viz title="Quantize one block of 32 weights"
      hint="Bars = original fp32 weights. Dots = value after quantize → dequantize. Red = error. Faint lines = the only values this format can represent.">
      <div className="controls">
        <Seg options={["Q8_0", "Q4_0", "Q4_K"] as const} value={fmt} onChange={setFmt}
          labels={{ Q8_0: "Q8_0 (8-bit)", Q4_0: "Q4_0 (4-bit symmetric)", Q4_K: "Q4_K-style (4-bit + min)" }} />
        <button className="btn" onClick={() => setSeed(seed + 1)}>🎲 New random weights</button>
        <div><span className="small muted">outlier </span><Seg options={["no", "yes"] as const} value={outlier} onChange={setOutlier} /></div>
      </div>
      <Svg w={740} h={H} label="quantization block">
        {fmt !== "Q8_0" && r.levels.map((l, i) => (
          <line key={i} x1={ox} x2={ox + 32 * bw} y1={Y(l)} y2={Y(l)} stroke="var(--c4)" strokeOpacity={0.25} />
        ))}
        <line x1={ox} x2={ox + 32 * bw} y1={mid} y2={mid} stroke="var(--border)" />
        {w.map((x, i) => {
          const cx = ox + i * bw + bw / 2;
          return (
            <g key={i}>
              <rect x={ox + i * bw + 3} y={Math.min(Y(x), mid)} width={bw - 6} height={Math.max(1, Math.abs(Y(x) - mid))} fill="var(--c1)" fillOpacity={0.45} rx={2} />
              <line x1={cx} x2={cx} y1={Y(x)} y2={Y(r.deq[i])} stroke="var(--c5)" strokeWidth={2} />
              <circle cx={cx} cy={Y(r.deq[i])} r={3.5} fill="var(--c2)" />
              <text x={cx} y={H - 4} fontSize={9} textAnchor="middle" fill="var(--muted)">{r.q[i]}</text>
            </g>
          );
        })}
        <text x={2} y={Y(ymax * 0.9)} fontSize={10} fill="var(--muted)">+{(ymax * 0.9).toFixed(2)}</text>
        <text x={2} y={Y(-ymax * 0.9)} fontSize={10} fill="var(--muted)">−{(ymax * 0.9).toFixed(2)}</text>
      </Svg>
      <div className="small muted">Numbers along the bottom are the stored integers.</div>
      <div className="grid3" style={{ marginTop: 10 }}>
        <div className="card"><div className="small muted">stored per block</div><div className="mono small">{r.params}</div><div className="mono small">+ 32 × {fmt === "Q8_0" ? 8 : 4}-bit ints</div></div>
        <div className="card"><div className="small muted">bits per weight</div><div className="mono" style={{ fontSize: 22 }}>{r.bpw}</div><div className="small muted">fp16 = 16, fp32 = 32</div></div>
        <div className="card"><div className="small muted">error</div><div className="mono small">RMSE = {rmse.toExponential(2)}</div><div className="mono small">max = {maxErr.toExponential(2)}</div><div className="mono small">relative = {((rmse / rms) * 100).toFixed(1)}%</div></div>
      </div>
      <div className="caption">Turn the outlier on with Q4_0: one big weight stretches the scale, and the 15 small "steps" become too coarse for all the other weights. This is why small blocks (32) and smarter formats (K-quants) exist.</div>
    </Viz>
  );
}

/* ---------------- Model size calculator ---------------- */

const FORMATS: [string, number][] = [
  ["F32", 32], ["F16 / BF16", 16], ["Q8_0", 8.5], ["Q6_K", 6.5625], ["Q5_K_M", 5.7], ["Q4_K_M", 4.85], ["Q4_0", 4.5], ["Q3_K_M", 3.9],
];

function SizeCalculator() {
  const [model, setModel] = useState<"1.7B" | "4B" | "8B">("4B");
  const [vram, setVram] = useState(4);
  const params = { "1.7B": 1.72e9, "4B": 4.02e9, "8B": 8.19e9 }[model];
  const overhead = 0.7; // GB: CUDA context + activations
  const maxGB = 34;
  return (
    <Viz title="Will it fit in VRAM?" hint="Size = parameters × bits per weight ÷ 8. Overhead (CUDA context + scratch ≈ 0.7 GB) is shown in grey.">
      <div className="controls">
        <Seg options={["1.7B", "4B", "8B"] as const} value={model} onChange={setModel} labels={{ "1.7B": "Qwen3-1.7B", "4B": "Qwen3-4B", "8B": "Qwen3-8B" }} />
        <Slider label="GPU VRAM" value={vram} min={2} max={24} onChange={setVram} format={(v) => `${v} GB`} />
      </div>
      <Svg w={740} h={FORMATS.length * 30 + 30} label="size bars">
        {FORMATS.map(([name, bpw], i) => {
          const gb = (params * bpw) / 8 / 1e9;
          const total = gb + overhead;
          const fits = total <= vram;
          const sx = (v: number) => 120 + (v / maxGB) * 560;
          return (
            <g key={name}>
              <text x={112} y={i * 30 + 22} fontSize={12} textAnchor="end" fill="var(--text)" className="mono">{name}</text>
              <rect x={120} y={i * 30 + 8} width={sx(gb) - 120} height={20} rx={3} fill={fits ? "var(--c3)" : "var(--c5)"} fillOpacity={0.75} />
              <rect x={sx(gb)} y={i * 30 + 8} width={sx(total) - sx(gb)} height={20} fill="var(--muted)" fillOpacity={0.3} />
              <text x={Math.min(sx(total) + 6, 690)} y={i * 30 + 22} fontSize={11} fill="var(--text)">{gb.toFixed(2)} GB {fits ? "✓" : "✗"}</text>
            </g>
          );
        })}
        <line x1={120 + (vram / maxGB) * 560} x2={120 + (vram / maxGB) * 560} y1={2} y2={FORMATS.length * 30 + 12} stroke="var(--accent)" strokeWidth={2} strokeDasharray="5 3" />
        <text x={124 + (vram / maxGB) * 560} y={FORMATS.length * 30 + 26} fontSize={11} fill="var(--accent)">{vram} GB VRAM</text>
      </Svg>
      <div className="caption">Even when the weights fit, we still need room for the KV cache (lesson 5). Qwen3-4B at Q4_K_M leaves about 0.9 GB of our 4 GB for it.</div>
    </Viz>
  );
}

/* ---------------- Q4_K super-block layout ---------------- */

function Q4KLayout() {
  return (
    <Svg w={740} h={190} label="Q4_K super-block">
      <text x={10} y={18} fontSize={13} fontWeight={700} fill="var(--text)">One Q4_K super-block = 256 weights = 144 bytes = 4.5 bits/weight</text>
      <rect x={10} y={32} width={60} height={40} rx={4} fill="var(--c2-soft)" stroke="var(--c2)" />
      <text x={40} y={50} fontSize={11} textAnchor="middle" fill="var(--text)">d</text>
      <text x={40} y={64} fontSize={10} textAnchor="middle" fill="var(--muted)">fp16 · 2B</text>
      <rect x={72} y={32} width={60} height={40} rx={4} fill="var(--c2-soft)" stroke="var(--c2)" />
      <text x={102} y={50} fontSize={11} textAnchor="middle" fill="var(--text)">dmin</text>
      <text x={102} y={64} fontSize={10} textAnchor="middle" fill="var(--muted)">fp16 · 2B</text>
      <rect x={134} y={32} width={120} height={40} rx={4} fill="var(--c4-soft)" stroke="var(--c4)" />
      <text x={194} y={50} fontSize={11} textAnchor="middle" fill="var(--text)">8 scales + 8 mins</text>
      <text x={194} y={64} fontSize={10} textAnchor="middle" fill="var(--muted)">6-bit each · 12B</text>
      <rect x={256} y={32} width={474} height={40} rx={4} fill="var(--c1-soft)" stroke="var(--c1)" />
      <text x={493} y={50} fontSize={11} textAnchor="middle" fill="var(--text)">256 × 4-bit quants</text>
      <text x={493} y={64} fontSize={10} textAnchor="middle" fill="var(--muted)">128 bytes</text>
      {Array.from({ length: 8 }, (_, i) => (
        <g key={i}>
          <rect x={256 + i * 59.25} y={90} width={57} height={30} rx={3} fill="var(--c1-soft)" stroke="var(--c1)" strokeOpacity={0.6} />
          <text x={256 + i * 59.25 + 28} y={109} fontSize={10} textAnchor="middle" fill="var(--text)">sub {i} · 32</text>
        </g>
      ))}
      <text x={10} y={145} fontSize={12} fill="var(--text)">weight = d × scaleᵢ × q  −  dmin × minᵢ</text>
      <text x={10} y={165} fontSize={12} fill="var(--muted)">Two levels of scaling: a fp16 "scale of scales" for the super-block, and a cheap 6-bit scale + min for each sub-block of 32.</text>
      <text x={10} y={183} fontSize={12} fill="var(--muted)">(2 + 2 + 12 + 128) bytes × 8 bits ÷ 256 weights = 4.5 bits per weight.</text>
    </Svg>
  );
}

/* ---------------- Dequant + dot product stepper ---------------- */

const DOT_STEPS = [
  { title: "The problem", body: <p>Decode reads every weight once per token. Qwen3-4B in fp16 = 8 GB → our GPU's ~192 GB/s bandwidth gives at most ~24 tokens/s, and it does not even fit. In 4-bit: 2.5 GB → up to ~75 tokens/s. <b>Fewer bytes = faster</b>, because decode is limited by memory, not math.</p> },
  { title: "Never dequantize the whole matrix", body: <p>We do <b>not</b> expand the 4-bit weights back into an fp16 matrix in memory (that would cancel the savings). Instead the kernel loads a 4-bit block into registers and expands it there, right before multiplying.</p> },
  { title: "Fused dequant-dot", body: <p>For one block: load scale d (2 bytes) and 16 bytes of packed nibbles. For each nibble: <code>w = (q − 8) × d</code>, multiply with the matching activation, add to a sum. One block = 32 multiply-adds from only 18 bytes read.</p> },
  { title: "Factor out the scale", body: <p>Even better: <code>Σ (qᵢ−8)·d·xᵢ = d · Σ (qᵢ−8)·xᵢ</code>. Do the inner sum with small integers and multiply by d once per block. If activations are also quantized to 8-bit (Q8 activations), the inner sum is pure integer math — very fast on CPUs (AVX2) and GPUs (dp4a instruction).</p> },
];

/* ---------------- Page ---------------- */

export default function Page() {
  return (
    <>
      <PageHeader
        kicker="LLMs · Lesson 3"
        title="Quantization"
        subtitle="How a 4-billion-parameter model fits into a 4 GB GPU: store each weight in 4 bits instead of 16."
        learn={[
          "Why weights take so much memory, and why fewer bytes also means faster",
          "Block quantization: a scale per block + small integers (try it live)",
          "Q8_0, Q4_0 and the K-quant super-block layout used in GGUF files",
          "Why outliers hurt, and how block size helps",
          "How our Rust engine quantizes and computes dot products directly on 4-bit data",
        ]}
      />

      <Section title="1. Why quantize?">
        <p>
          A model is mostly weights. Qwen3-4B has about 4 billion of them. Training stores each as a 16-bit float (2 bytes):
          <b> 8 GB</b>. Our GPU has 4 GB. It does not fit.
        </p>
        <p>
          Weights are small numbers (mostly between −0.1 and 0.1) and the model is tolerant to small errors. So we store each
          weight with fewer bits, accepting a tiny loss in quality. That is <b>quantization</b>.
        </p>
        <Callout kind="analogy">
          <p>A photo with 16 million colors versus the same photo with 256 colors. If the 256 colors are chosen well for <i>this</i>
            photo, you barely notice. Quantization chooses a small palette of values for each small group of weights.</p>
        </Callout>
        <Callout kind="idea">
          <p>Quantization saves <b>memory</b> and makes decode <b>faster</b>. Generating one token reads every weight once.
            The GPU spends most of its time waiting for memory, not computing. Half the bytes ≈ twice the tokens per second.</p>
        </Callout>
      </Section>

      <Section title="2. The core trick: scale + small integers">
        <p>
          Take a block of 32 weights. Find the largest absolute value, e.g. 0.12. Choose a <b>scale</b> so that this value maps to the largest
          integer we can store. For 8 bits (−127…127): <code>d = 0.12 / 127</code>. Each weight is stored as <code>q = round(w / d)</code>.
          To use it: <code>w ≈ q × d</code>.
        </p>
        <div className="grid2">
          <div className="card"><h4>Quantize (once, offline)</h4><p className="mono small">d = max|w| / 127<br />q = round(w / d)</p></div>
          <div className="card"><h4>Dequantize (every use)</h4><p className="mono small">w' = q × d<br />error = w' − w ≤ d/2</p></div>
        </div>
        <p>The scale is stored once per block (2 bytes), so its cost is spread over 32 weights. Try it:</p>
        <BlockQuantizer />
        <Quiz
          q="Q4_0 can only represent 16 different values per block. Why is the quality still acceptable?"
          options={[
            "Because each block of 32 has its OWN scale, so the 16 levels are placed where those 32 weights actually are",
            "Because the GPU adds the missing bits back",
            "Because weights are always integers",
          ]}
          answer={0}
          explain="A global scale would be terrible. A per-block scale adapts the 16 levels to the local range of every 32 weights."
        />
      </Section>

      <Section title="3. The formats you will meet">
        <table>
          <thead><tr><th>Format</th><th>Block</th><th>Stored</th><th>Bits / weight</th><th>Quality</th></tr></thead>
          <tbody>
            <tr><td className="mono">F16</td><td>—</td><td>16-bit float</td><td>16</td><td>reference</td></tr>
            <tr><td className="mono">Q8_0</td><td>32</td><td>fp16 scale + 32 × int8</td><td>8.5</td><td>≈ lossless</td></tr>
            <tr><td className="mono">Q6_K</td><td>256 (16×16)</td><td>fp16 d + 8-bit scales + 6-bit q</td><td>6.56</td><td>near lossless</td></tr>
            <tr><td className="mono">Q4_K_M</td><td>256 (8×32)</td><td>mix of Q4_K and Q6_K per tensor</td><td>~4.85</td><td>small loss — the standard choice</td></tr>
            <tr><td className="mono">Q4_0</td><td>32</td><td>fp16 scale + 32 × 4-bit</td><td>4.5</td><td>small-medium loss</td></tr>
          </tbody>
        </table>
        <h3>The K-quant super-block (Q4_K)</h3>
        <p>
          K-quants add a second level: 8 sub-blocks of 32 share one fp16 "scale of scales". Each sub-block gets a cheap 6-bit scale <b>and</b> a 6-bit
          minimum (asymmetric — good when a block's weights are not centered on zero).
        </p>
        <Q4KLayout />
        <Callout kind="deep">
          <p>"_M" in Q4_K_M means "mixed": sensitive tensors (like parts of attention <code>v</code> and the MLP <code>down</code> projection in some layers)
            use Q6_K, the rest use Q4_K. So the average is ~4.85 bits. Choosing <i>which</i> tensors get more bits is a real engineering decision.</p>
        </Callout>
      </Section>

      <Section title="4. Does it fit? The size math">
        <SizeCalculator />
      </Section>

      <Section title="5. Computing with quantized weights">
        <Stepper title="How a quantized matvec works" steps={DOT_STEPS} />
        <Code title="kiln-engine/src/quant/q8_0.rs">{`
pub const QK: usize = 32;               // weights per block

/// One Q8_0 block: 2 + 32 = 34 bytes for 32 weights.
#[repr(C)]                              // fixed memory layout, same as the GGUF file
pub struct BlockQ8_0 {
    pub d: u16,                         // scale, stored as raw f16 bits
    pub qs: [i8; QK],                   // 32 signed 8-bit integers
}

/// Quantize f32 weights into Q8_0 blocks. Run once when loading/converting a model.
pub fn quantize_q8_0(w: &[f32]) -> Vec<BlockQ8_0> {
    assert!(w.len() % QK == 0);
    w.chunks_exact(QK).map(|chunk| {
        let amax = chunk.iter().fold(0.0f32, |m, x| m.max(x.abs()));
        let d = amax / 127.0;
        let inv = if d != 0.0 { 1.0 / d } else { 0.0 };
        let mut qs = [0i8; QK];
        for (q, x) in qs.iter_mut().zip(chunk) {
            *q = (x * inv).round() as i8;
        }
        BlockQ8_0 { d: f32_to_f16_bits(d), qs }
    }).collect()
}

/// Dot product of one quantized row with an f32 activation vector.
/// The weights are never expanded into memory: each block is decoded on the fly.
pub fn dot_q8_0(row: &[BlockQ8_0], x: &[f32]) -> f32 {
    let mut sum = 0.0f32;
    for (b, xs) in row.iter().zip(x.chunks_exact(QK)) {
        let mut block_sum = 0.0f32;
        for (q, xv) in b.qs.iter().zip(xs) {
            block_sum += *q as f32 * xv;   // small integer × activation
        }
        sum += f16_bits_to_f32(b.d) * block_sum;   // apply the scale ONCE per block
    }
    sum
}
`}</Code>
        <Callout kind="rust">
          <p><code>#[repr(C)]</code> tells Rust to lay out the struct exactly in field order with no reordering — so we can read blocks
            directly from the memory-mapped GGUF file. <code>chunks_exact(32)</code> walks a slice 32 items at a time.
            We write <code>f32_to_f16_bits</code> ourselves (lesson: Bits, bytes &amp; floating point).</p>
        </Callout>
        <Callout kind="kiln">
          <p>Plan for <code>kiln-engine</code>: (1) load GGUF files that are already quantized by others, to test against llama.cpp;
            (2) write our own quantizer that converts Qwen's fp16 safetensors to Q8_0 / Q4_0 / Q4_K; (3) compare quality with a
            perplexity test on a fixed text. Same algorithm, our own code.</p>
        </Callout>
      </Section>

      <Section title="6. Quantizing the KV cache too">
        <p>
          Weights are not the only big thing. The KV cache (144 KiB per token in fp16) can also be stored in 8 bits.
          That halves its size: ~6,200 → ~12,000 tokens of context on our GPU. The cost is a small accuracy loss, mostly on very long contexts.
          Unlike weights, KV values are produced <b>at runtime</b>, so they are quantized on the fly in the attention kernel.
        </p>
        <Quiz
          q="Why is a 4-bit model usually FASTER at decode than the fp16 version, not just smaller?"
          options={[
            "4-bit math instructions are 4× faster",
            "Decode is limited by memory bandwidth; reading 4× fewer bytes per token means up to ~4× more tokens per second",
            "The model has fewer layers",
          ]}
          answer={1}
          explain="During decode the GPU mostly waits for weights to arrive from VRAM. Fewer bytes per weight → less waiting. The extra dequantize math is almost free."
        />
      </Section>

      <Recap items={[
        "Quantization = store each weight as a small integer + a shared scale per block of 32 (or 256).",
        "Q8_0 ≈ lossless at 8.5 bits; Q4_K_M ≈ 4.85 bits with small loss — the standard choice for our 4 GB GPU.",
        "Outliers stretch the scale; small blocks and K-quants (scale + min, two-level scales) limit the damage.",
        "Kernels dequantize inside registers and multiply by the scale once per block — never expand the full matrix.",
        "Fewer bytes = faster decode, because decode is memory-bandwidth-bound.",
      ]} />
    </>
  );
}
