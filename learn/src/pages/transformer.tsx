import { useMemo, useState } from "react";
import {
  PageHeader, Section, Callout, Code, Viz, Slider, Seg, Stepper, Quiz, Recap, Svg, Box, Arrow,
} from "../components/ui";

/* ------------------------------------------------------------------ */
/* Small math helpers used by the interactive figures                  */
/* ------------------------------------------------------------------ */

const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
const norm = (a: number[]) => Math.sqrt(dot(a, a));
function softmax(xs: number[]): number[] {
  const m = Math.max(...xs.filter((x) => isFinite(x)));
  const e = xs.map((x) => (isFinite(x) ? Math.exp(x - m) : 0));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / s);
}
const fmt = (x: number, d = 2) => (Math.abs(x) < 1e-9 ? "0" : x.toFixed(d));

/* ---------------- 1. Dot product in 2D ---------------- */

function DotProduct2D() {
  const [angA, setAngA] = useState(30);
  const [angB, setAngB] = useState(70);
  const [lenB, setLenB] = useState(1);
  const rad = (d: number) => (d * Math.PI) / 180;
  const a = [Math.cos(rad(angA)), Math.sin(rad(angA))];
  const b = [lenB * Math.cos(rad(angB)), lenB * Math.sin(rad(angB))];
  const d = dot(a, b);
  const cos = d / (norm(a) * norm(b));
  const S = 90, cx = 150, cy = 140;
  const P = (v: number[]) => [cx + v[0] * S, cy - v[1] * S];
  const [ax, ay] = P(a), [bx, by] = P(b);
  const verdict = cos > 0.7 ? "very similar" : cos > 0.2 ? "somewhat similar" : cos > -0.2 ? "unrelated (≈ 90°)" : "opposite";
  return (
    <Viz title="Dot product = how much two vectors point the same way"
      hint="Rotate the two vectors. Watch the dot product and the cosine similarity.">
      <div className="grid2">
        <Svg w={300} h={280} label="two vectors">
          <circle cx={cx} cy={cy} r={S} fill="none" stroke="var(--border)" strokeDasharray="3 4" />
          <line x1={cx - 140} y1={cy} x2={cx + 140} y2={cy} stroke="var(--border)" />
          <line x1={cx} y1={cy - 135} x2={cx} y2={cy + 135} stroke="var(--border)" />
          <line x1={cx} y1={cy} x2={ax} y2={ay} stroke="var(--c1)" strokeWidth={3} />
          <circle cx={ax} cy={ay} r={5} fill="var(--c1)" />
          <text x={ax + 8} y={ay} fill="var(--c1)" fontWeight={700}>a</text>
          <line x1={cx} y1={cy} x2={bx} y2={by} stroke="var(--c2)" strokeWidth={3} />
          <circle cx={bx} cy={by} r={5} fill="var(--c2)" />
          <text x={bx + 8} y={by} fill="var(--c2)" fontWeight={700}>b</text>
        </Svg>
        <div>
          <Slider label="angle of a" value={angA} min={0} max={360} onChange={setAngA} format={(v) => `${v}°`} />
          <Slider label="angle of b" value={angB} min={0} max={360} onChange={setAngB} format={(v) => `${v}°`} />
          <Slider label="length of b" value={lenB} min={0.2} max={1.5} step={0.05} onChange={setLenB} format={(v) => v.toFixed(2)} />
          <div className="mono small" style={{ marginTop: 10 }}>
            a = [{fmt(a[0])}, {fmt(a[1])}]<br />
            b = [{fmt(b[0])}, {fmt(b[1])}]<br />
            a·b = {fmt(a[0])}×{fmt(b[0])} + {fmt(a[1])}×{fmt(b[1])} = <b>{fmt(d, 3)}</b><br />
            cosine = <b>{fmt(cos, 3)}</b> → {verdict}
          </div>
        </div>
      </div>
      <div className="caption">The dot product grows when vectors point the same way <i>and</i> when they are longer. Cosine removes the length.</div>
    </Viz>
  );
}

/* ---------------- 2. Matmul = many dot products ---------------- */

const W = [
  [0.5, -1, 0, 2],
  [1, 1, 1, 1],
  [-0.5, 0, 2, 0],
];
const X = [1, 2, 3, 0.5];

function MatmulViz() {
  const [row, setRow] = useState(0);
  const y = W.map((r) => dot(r, X));
  const cell = (v: number, hi: boolean, key: string) => (
    <td key={key} className="mono" style={{ textAlign: "center", background: hi ? "var(--accent-soft)" : undefined, padding: "4px 10px" }}>{v}</td>
  );
  return (
    <Viz title="Matrix × vector = one dot product per row" hint="Click a row of W to see how its output number is computed.">
      <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div className="small muted">W (3 × 4)</div>
          <table style={{ width: "auto", display: "table" }}><tbody>
            {W.map((r, i) => (
              <tr key={i} onClick={() => setRow(i)} style={{ cursor: "pointer" }}>{r.map((v, j) => cell(v, i === row, `${i}${j}`))}</tr>
            ))}
          </tbody></table>
        </div>
        <div style={{ fontSize: 22 }}>×</div>
        <div>
          <div className="small muted">x (4)</div>
          <table style={{ width: "auto", display: "table" }}><tbody>
            {X.map((v, i) => <tr key={i}>{cell(v, true, `x${i}`)}</tr>)}
          </tbody></table>
        </div>
        <div style={{ fontSize: 22 }}>=</div>
        <div>
          <div className="small muted">y (3)</div>
          <table style={{ width: "auto", display: "table" }}><tbody>
            {y.map((v, i) => <tr key={i}>{cell(v, i === row, `y${i}`)}</tr>)}
          </tbody></table>
        </div>
      </div>
      <div className="mono small" style={{ marginTop: 8 }}>
        y[{row}] = {W[row].map((w, j) => `${w}×${X[j]}`).join(" + ")} = <b>{y[row]}</b>
      </div>
      <div className="caption">In Qwen3-4B one such matrix is 2560 × 9728 ≈ 25 million numbers. Each output is a dot product of length 2560. That is the work a GPU does.</div>
    </Viz>
  );
}

/* ---------------- 3. RMSNorm ---------------- */

function RmsNormViz() {
  const [scale, setScale] = useState(1);
  const base = [0.8, -2.4, 1.6, 0.2, -0.6, 3.0];
  const x = base.map((v) => v * scale);
  const rms = Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);
  const y = x.map((v) => v / (rms + 1e-6));
  const maxAbs = 6;
  const bar = (v: number, i: number, color: string, ox: number) => {
    const h = (Math.abs(v) / maxAbs) * 70;
    return <rect key={i} x={ox + i * 28} y={v >= 0 ? 90 - h : 90} width={20} height={Math.max(h, 1)} fill={color} rx={2} />;
  };
  return (
    <Viz title="RMSNorm: keep the vector's size stable" hint="Make the input bigger or smaller. The output always has the same size (RMS = 1).">
      <Slider label="input scale" value={scale} min={0.1} max={2} step={0.05} onChange={setScale} format={(v) => `${v.toFixed(2)}×`} />
      <Svg w={420} h={180} label="rmsnorm bars">
        <line x1={10} y1={90} x2={410} y2={90} stroke="var(--border)" />
        {x.map((v, i) => bar(v, i, "var(--c1)", 20))}
        {y.map((v, i) => bar(v, i, "var(--c3)", 240))}
        <text x={20} y={175} fontSize={12} fill="var(--muted)">input x   (RMS = {rms.toFixed(2)})</text>
        <text x={240} y={175} fontSize={12} fill="var(--muted)">x / RMS   (RMS = 1.00)</text>
      </Svg>
      <div className="caption">Formula: y = x / sqrt(mean(x²) + ε) × g, where g is a learned weight per dimension. Without this, values grow layer after layer and training (and fp16 math) breaks.</div>
    </Viz>
  );
}

/* ---------------- 4. Attention heatmap ---------------- */

// Toy 4-d "meaning" features: [animal, action, function-word, tiredness]
const WORDS = ["The", "cat", "sat", "on", "the", "mat", "because", "it", "was", "tired"];
const EMB: number[][] = [
  [0, 0, 1, 0], [1, 0, 0, 0.3], [0.2, 1, 0, 0], [0, 0.2, 1, 0], [0, 0, 1, 0],
  [0.1, 0, 0.2, 0], [0, 0.3, 0.8, 0.2], [0.9, 0, 0.2, 0.1], [0, 0.6, 0.6, 0.2], [0.3, 0.2, 0, 1],
];
// Toy projection matrices (4×4). Query asks "who is the actor?", key says "I am an animal".
const WQ = [[1, 0, 0, 0.2], [0, 1, 0, 0], [0, 0, 0.3, 0], [1.2, 0.4, 0, 1]];
const WK = [[2, 0, 0, 0], [0, 1.2, 0, 0], [0, 0, 0.4, 0], [0.4, 0, 0, 0.8]];
const mv = (M: number[][], v: number[]) => M.map((r) => dot(r, v));

function AttentionHeatmap() {
  const [temp, setTemp] = useState(1);
  const [causal, setCausal] = useState<"on" | "off">("on");
  const [sel, setSel] = useState(7);
  const n = WORDS.length;
  const weights = useMemo(() => {
    const Q = EMB.map((e) => mv(WQ, e));
    const K = EMB.map((e) => mv(WK, e));
    return Q.map((q, i) => softmax(K.map((k, j) =>
      causal === "on" && j > i ? -Infinity : (dot(q, k) / Math.sqrt(4)) / temp)));
  }, [temp, causal]);
  const cs = 44, ox = 80, oy = 70;
  return (
    <Viz title="Attention weights for a real (toy) sentence"
      hint="Each row is one token asking 'which earlier tokens matter to me?'. Click a row. Try turning the causal mask off and changing the temperature.">
      <div className="controls">
        <Slider label="softmax temperature (sharpness)" value={temp} min={0.15} max={3} step={0.05} onChange={setTemp} format={(v) => v.toFixed(2)} />
        <div><div className="small muted">causal mask</div><Seg options={["on", "off"] as const} value={causal} onChange={setCausal} /></div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <Svg w={ox + n * cs + 10} h={oy + n * cs + 10} label="attention heatmap">
          {WORDS.map((w, j) => (
            <text key={"c" + j} x={ox + j * cs + cs / 2} y={oy - 8} fontSize={11} textAnchor="end"
              transform={`rotate(-45 ${ox + j * cs + cs / 2} ${oy - 8})`} fill="var(--muted)">{w}</text>
          ))}
          {WORDS.map((w, i) => (
            <text key={"r" + i} x={ox - 8} y={oy + i * cs + cs / 2 + 4} fontSize={12} textAnchor="end"
              fill={i === sel ? "var(--accent)" : "var(--text)"} fontWeight={i === sel ? 700 : 400}
              style={{ cursor: "pointer" }} onClick={() => setSel(i)}>{w}</text>
          ))}
          {weights.map((row, i) => row.map((wt, j) => (
            <g key={i + "-" + j} onClick={() => setSel(i)} style={{ cursor: "pointer" }}>
              <rect x={ox + j * cs + 1} y={oy + i * cs + 1} width={cs - 2} height={cs - 2} rx={3}
                fill={causal === "on" && j > i ? "var(--panel-2)" : "var(--c2)"}
                fillOpacity={causal === "on" && j > i ? 1 : 0.08 + 0.92 * wt}
                stroke={i === sel ? "var(--accent)" : "none"} strokeWidth={2} />
              {!(causal === "on" && j > i) && wt > 0.005 &&
                <text x={ox + j * cs + cs / 2} y={oy + i * cs + cs / 2 + 4} fontSize={10} textAnchor="middle"
                  fill={wt > 0.5 ? "white" : "var(--text)"}>{(wt * 100).toFixed(0)}</text>}
            </g>
          )))}
        </Svg>
      </div>
      <div className="small">
        Row <b>"{WORDS[sel]}"</b> attends most to{" "}
        <b>"{WORDS[weights[sel].indexOf(Math.max(...weights[sel]))]}"</b> ({(Math.max(...weights[sel]) * 100).toFixed(0)}%). Numbers are percentages; every row sums to 100.
      </div>
      <div className="caption">
        These Q and K vectors are hand-made 4-number toys, but the math is the real one: score = q·k / √d, mask, softmax.
        Notice "it" looks back at "cat" — its query asks "who is the animal?" and "cat"'s key answers "I am an animal".
      </div>
    </Viz>
  );
}

/* ---------------- 5. Multi-head, GQA, MQA ---------------- */

function GqaViz() {
  const [mode, setMode] = useState<"MHA" | "GQA" | "MQA">("GQA");
  const nQ = 32;
  const nKV = mode === "MHA" ? 32 : mode === "GQA" ? 8 : 1;
  const group = nQ / nKV;
  const kvBytes = 2 * 36 * nKV * 128 * 2;
  const qx = (i: number) => 14 + i * 22.5;
  const kvx = (j: number) => (nKV === 1 ? 370 : 14 + (j * (31 * 22.5)) / (nKV - 1));
  return (
    <Viz title="32 query heads share fewer key/value heads" hint="Switch between Multi-Head, Grouped-Query (Qwen3-4B) and Multi-Query attention.">
      <Seg options={["MHA", "GQA", "MQA"] as const} value={mode} onChange={setMode}
        labels={{ MHA: "MHA (32 KV)", GQA: "GQA (8 KV) — Qwen3", MQA: "MQA (1 KV)" }} />
      <Svg w={740} h={190} label="gqa">
        {Array.from({ length: nQ }, (_, i) => {
          const g = Math.floor(i / group);
          return (
            <g key={i}>
              <line x1={qx(i) + 9} y1={42} x2={kvx(g) + 9} y2={140} stroke={`var(--c${(g % 6) + 1})`} strokeOpacity={0.6} />
              <rect x={qx(i)} y={20} width={18} height={22} rx={3} fill={`var(--c${(g % 6) + 1}-soft)`} stroke={`var(--c${(g % 6) + 1})`} />
            </g>
          );
        })}
        {Array.from({ length: nKV }, (_, j) => (
          <rect key={j} x={kvx(j)} y={140} width={18} height={22} rx={3} fill={`var(--c${(j % 6) + 1})`} />
        ))}
        <text x={14} y={14} fontSize={12} fill="var(--muted)">32 query heads (each 128 numbers)</text>
        <text x={14} y={182} fontSize={12} fill="var(--muted)">{nKV} key/value head{nKV > 1 ? "s" : ""} — these are what we must store in the KV cache</text>
      </Svg>
      <div className="small">
        KV cache per token: 2 × 36 layers × <b>{nKV}</b> heads × 128 × 2 bytes = <b>{(kvBytes / 1024).toFixed(0)} KiB</b>.
        With ~900 MiB free → about <b>{Math.floor((900 * 1024) / (kvBytes / 1024)).toLocaleString()}</b> tokens of context in total.
      </div>
      <div className="caption">GQA keeps most of MHA's quality but cuts KV memory 4×. On a 4 GB GPU this is the difference between 1,500 and 6,200 tokens of context.</div>
    </Viz>
  );
}

/* ---------------- 6. RoPE ---------------- */

function RopeViz() {
  const [m, setM] = useState(5);
  const [n, setN] = useState(2);
  const theta = 0.35; // rotation per position for this frequency pair (radians)
  const q0 = [1, 0.3], k0 = [0.8, 0.6];
  const rot = (v: number[], ang: number) => [v[0] * Math.cos(ang) - v[1] * Math.sin(ang), v[0] * Math.sin(ang) + v[1] * Math.cos(ang)];
  const q = rot(q0, m * theta), k = rot(k0, n * theta);
  const S = 80, cx = 120, cy = 110;
  const P = (v: number[]) => [cx + v[0] * S, cy - v[1] * S];
  const [qx, qy] = P(q), [kx, ky] = P(k);
  return (
    <Viz title="RoPE: encode position by rotating q and k"
      hint="q sits at position m, k at position n. Each is rotated by (its position × θ). Move both sliders together: the score stays the same.">
      <div className="grid2">
        <Svg w={240} h={220} label="rope">
          <circle cx={cx} cy={cy} r={S} fill="none" stroke="var(--border)" strokeDasharray="3 4" />
          <line x1={cx} y1={cy} x2={qx} y2={qy} stroke="var(--c1)" strokeWidth={3} />
          <text x={qx + 5} y={qy} fill="var(--c1)" fontWeight={700}>q (pos {m})</text>
          <line x1={cx} y1={cy} x2={kx} y2={ky} stroke="var(--c2)" strokeWidth={3} />
          <text x={kx + 5} y={ky + 12} fill="var(--c2)" fontWeight={700}>k (pos {n})</text>
        </Svg>
        <div>
          <Slider label="query position m" value={m} min={0} max={20} onChange={setM} />
          <Slider label="key position n" value={n} min={0} max={20} onChange={setN} />
          <div className="mono small" style={{ marginTop: 8 }}>
            distance m − n = <b>{m - n}</b><br />
            score q·k = <b>{dot(q, k).toFixed(4)}</b>
          </div>
          <p className="small">Set m=5, n=2, then m=12, n=9. Same distance → same score. The model sees <b>relative</b> position, which is what language needs ("the word 3 back").</p>
        </div>
      </div>
      <div className="caption">Real RoPE splits the 128-dim head into 64 pairs, each rotating at a different speed θᵢ = 1,000,000^(−2i/128) for Qwen3: fast pairs see local order, slow pairs see long range.</div>
    </Viz>
  );
}

/* ---------------- 7. Layer diagram ---------------- */

function LayerDiagram() {
  return (
    <Svg w={740} h={330} label="one decoder layer">
      {/* residual stream */}
      <line x1={60} y1={315} x2={60} y2={15} stroke="var(--c1)" strokeWidth={6} strokeOpacity={0.35} markerEnd="url(#arrow)" />
      <text x={12} y={170} fontSize={12} fill="var(--c1)" transform="rotate(-90 22 170)">residual stream (2560 numbers per token)</text>
      <Box x={110} y={250} w={130} h={44} label="RMSNorm" color={6} />
      <Box x={270} y={250} w={190} h={44} label="Attention" sub="Q,K,V · RoPE · softmax" color={2} />
      <Box x={490} y={250} w={110} h={44} label="o_proj" color={2} />
      <Arrow x1={60} y1={272} x2={110} y2={272} />
      <Arrow x1={240} y1={272} x2={270} y2={272} />
      <Arrow x1={460} y1={272} x2={490} y2={272} />
      <path d="M600 272 C 660 272, 660 200, 80 200" fill="none" stroke="var(--muted)" strokeWidth={1.5} markerEnd="url(#arrow)" />
      <circle cx={60} cy={200} r={12} fill="var(--panel)" stroke="var(--c1)" strokeWidth={2} />
      <text x={60} y={205} textAnchor="middle" fontWeight={700} fill="var(--c1)">+</text>

      <Box x={110} y={110} w={130} h={44} label="RMSNorm" color={6} />
      <Box x={270} y={110} w={190} h={44} label="SwiGLU MLP" sub="2560 → 9728 → 2560" color={4} />
      <Arrow x1={60} y1={132} x2={110} y2={132} />
      <Arrow x1={240} y1={132} x2={270} y2={132} />
      <path d="M460 132 C 560 132, 560 60, 80 60" fill="none" stroke="var(--muted)" strokeWidth={1.5} markerEnd="url(#arrow)" />
      <circle cx={60} cy={60} r={12} fill="var(--panel)" stroke="var(--c1)" strokeWidth={2} />
      <text x={60} y={65} textAnchor="middle" fontWeight={700} fill="var(--c1)">+</text>
      <text x={500} y={30} fontSize={13} fill="var(--muted)">× 36 layers, stacked</text>
    </Svg>
  );
}

/* ---------------- 8. Parameter count ---------------- */

function ParamCount() {
  const H = 2560, Q = 32 * 128, KV = 8 * 128, I = 9728, V = 151936, L = 36;
  const rows: [string, number][] = [
    ["q_proj  2560 × 4096", H * Q],
    ["k_proj  2560 × 1024", H * KV],
    ["v_proj  2560 × 1024", H * KV],
    ["o_proj  4096 × 2560", Q * H],
    ["gate_proj 2560 × 9728", H * I],
    ["up_proj   2560 × 9728", H * I],
    ["down_proj 9728 × 2560", I * H],
    ["2 RMSNorm + q/k norm", 2 * H + 2 * 128],
  ];
  const perLayer = rows.reduce((s, r) => s + r[1], 0);
  const emb = V * H;
  const total = perLayer * L + emb + H;
  const M = (x: number) => (x / 1e6).toFixed(1) + " M";
  return (
    <table>
      <thead><tr><th>Weight matrix (one layer)</th><th>Parameters</th></tr></thead>
      <tbody>
        {rows.map(([n, c]) => <tr key={n}><td className="mono">{n}</td><td className="mono">{M(c)}</td></tr>)}
        <tr><td><b>One layer</b></td><td className="mono"><b>{M(perLayer)}</b></td></tr>
        <tr><td>× 36 layers</td><td className="mono">{M(perLayer * L)}</td></tr>
        <tr><td className="mono">embedding 151,936 × 2560 (shared with lm_head)</td><td className="mono">{M(emb)}</td></tr>
        <tr><td><b>Total</b></td><td className="mono"><b>{(total / 1e9).toFixed(2)} B</b></td></tr>
      </tbody>
    </table>
  );
}

/* ---------------- 9. Forward pass stepper ---------------- */

const shape = (s: string) => <code style={{ color: "var(--c1)" }}>{s}</code>;
const FORWARD_STEPS = [
  { title: "Token id", body: <p>The tokenizer gave us one integer, e.g. <code>9707</code> for "Hello". Shape: {shape("[1]")} (one token).</p> },
  { title: "Embedding lookup", body: <p>Row 9707 of the embedding table <code>[151936, 2560]</code> is copied out. No math, just a lookup. Now we have {shape("[2560]")} — the token's starting "meaning vector". This vector is the <b>residual stream</b>; every layer reads it and adds to it.</p> },
  { title: "RMSNorm", body: <p>Normalize the vector so its RMS is 1, then multiply by a learned gain. Shape stays {shape("[2560]")}.</p> },
  { title: "Q, K, V projections", body: <p>Three matrix-vector products: q = Wq·x {shape("[4096] = 32 heads × 128")}, k = Wk·x {shape("[1024] = 8 heads × 128")}, v = Wv·x {shape("[1024]")}. Qwen3 then applies RMSNorm to each q and k head (QK-norm), and rotates them with RoPE.</p> },
  { title: "Write K, V to the KV cache", body: <p>This token's k and v are stored, so future tokens can attend to it. 8 heads × 128 × 2 (K and V) × 2 bytes = 4 KiB per layer, × 36 layers = <b>144 KiB per token</b>.</p> },
  { title: "Attention", body: <p>For each of 32 query heads: scores = q · every cached k (of its KV group) / √128, softmax, then weighted sum of cached v. With T tokens so far: scores {shape("[32, T]")}, output {shape("[4096]")}.</p> },
  { title: "Output projection + residual add", body: <p>o = Wo · attn {shape("[2560]")}. Then <b>x = x + o</b>. Adding (not replacing) keeps old information flowing. That is the residual connection.</p> },
  { title: "RMSNorm + SwiGLU MLP + residual add", body: <p>g = W_gate·x, u = W_up·x {shape("[9728]")}; h = silu(g) ⊙ u; m = W_down·h {shape("[2560]")}; x = x + m. The MLP is where most "knowledge" is stored (75% of parameters).</p> },
  { title: "Repeat for 36 layers", body: <p>Steps 3–8 run 36 times, each with its own weights. The residual stream {shape("[2560]")} gets refined layer by layer.</p> },
  { title: "Final norm + lm_head → logits", body: <p>One last RMSNorm, then multiply by the embedding table transposed: {shape("[151936, 2560] · [2560] = [151936]")}. One score (logit) for <b>every</b> token in the vocabulary. The sampler (next lessons) picks one. Then the whole thing runs again for the next token.</p> },
];

/* ---------------- Page ---------------- */

export default function Page() {
  return (
    <>
      <PageHeader
        kicker="LLMs · Lesson 2"
        title="The transformer, from first principles"
        subtitle="What actually happens inside Qwen3-4B, one multiplication at a time."
        learn={[
          "Vectors and dot products — the one operation everything is built from",
          "Matrix multiplication as 'many dot products', and why it dominates cost",
          "RMSNorm, attention (Q, K, V, softmax, causal mask), multi-head and GQA",
          "RoPE: how the model knows word order",
          "SwiGLU MLP, the residual stream, and the full layer",
          "A full forward pass with real Qwen3-4B tensor shapes, and our Rust forward()",
        ]}
      />

      <Section title="1. The big idea in one paragraph">
        <p>
          A language model does one job: given the tokens so far, give a score to every possible next token.
          The transformer does this by turning each token into a long list of numbers (a <b>vector</b>), then
          letting the vectors <b>talk to each other</b> (attention) and <b>think alone</b> (MLP), many times in a row.
          At the end, the last vector is compared with every word in the vocabulary. The best matches get high scores.
        </p>
        <Callout kind="analogy">
          <p>Imagine 36 rounds of a meeting. In each round, every person (token) first listens to the earlier speakers
            (attention), then thinks privately and updates their notes (MLP). After 36 rounds, the last person's notes
            contain a good guess of what should be said next.</p>
        </Callout>
      </Section>

      <Section title="2. Vectors and the dot product">
        <p>
          A <b>vector</b> is a list of numbers, like <code>[0.2, -1.3, 0.7]</code>. In Qwen3-4B every token becomes a vector of
          <b> 2560</b> numbers. You can think of it as a point or an arrow in a 2560-dimensional space.
          Directions in this space mean things ("is an animal", "is plural", "is past tense").
        </p>
        <p>
          The <b>dot product</b> multiplies matching entries and adds them up: <code>a·b = a₁b₁ + a₂b₂ + …</code>.
          It measures how much two arrows point the same way. This one operation is the heart of the transformer.
        </p>
        <DotProduct2D />
      </Section>

      <Section title="3. Matrix multiplication is many dot products">
        <p>
          A <b>matrix</b> is a grid of numbers. Multiplying a matrix by a vector means: take a dot product of the vector with
          every row. The result is a new vector. This is how a layer "transforms" a vector into another vector with a different meaning or size.
        </p>
        <MatmulViz />
        <Callout kind="idea">
          <p>Almost all the compute in an LLM is matrix multiplication. For one token, Qwen3-4B does about
            <b> 2 × 4 billion = 8 billion</b> multiply-adds (one multiply and one add per weight). Making matmul fast on our GPU
            is the main job of <code>kiln-engine</code>'s CUDA kernels.</p>
        </Callout>
        <Quiz
          q="A weight matrix has shape [9728, 2560] and the input vector has 2560 numbers. How many numbers come out?"
          options={["2560", "9728", "9728 × 2560"]}
          answer={1}
          explain="One output per row. The matrix has 9728 rows, each a dot product with the 2560-number input."
        />
      </Section>

      <Section title="4. Embeddings: from token id to vector">
        <p>
          The model has an <b>embedding table</b> with one row per token: <code>[151936 rows × 2560 columns]</code>.
          Turning token id 9707 into a vector is simply "read row 9707". The table is learned during training, so
          tokens with similar meaning end up with similar rows (high dot product).
        </p>
        <Code title="kiln-engine: embedding lookup">{`
// weights: one long flat slice, row-major: row r starts at r * hidden
fn embed(table: &[f32], token: u32, hidden: usize) -> Vec<f32> {
    let start = token as usize * hidden;
    table[start..start + hidden].to_vec()   // copy one row out
}
`}</Code>
      </Section>

      <Section title="5. RMSNorm: keep numbers in a safe range">
        <p>
          After many additions, vectors can grow large or tiny. Large numbers overflow in 16-bit floats; tiny ones lose precision.
          <b> RMSNorm</b> divides the vector by its root-mean-square, so its overall size is always about 1.
        </p>
        <RmsNormViz />
        <Code title="kiln-engine: rms_norm (CPU reference version)">{`
fn rms_norm(x: &[f32], gain: &[f32], eps: f32) -> Vec<f32> {
    let mean_sq = x.iter().map(|v| v * v).sum::<f32>() / x.len() as f32;
    let inv = 1.0 / (mean_sq + eps).sqrt();
    x.iter().zip(gain).map(|(v, g)| v * inv * g).collect()
}
`}</Code>
      </Section>

      <Section title="6. Attention: tokens looking at each other">
        <p>
          A single token vector does not know its context. "it" could mean anything. <b>Attention</b> lets each token
          collect information from earlier tokens. Each token makes three vectors from itself:
        </p>
        <div className="grid3">
          <div className="card"><h4 style={{ color: "var(--c1)" }}>Query (q)</h4><p className="small">"What am I looking for?"</p></div>
          <div className="card"><h4 style={{ color: "var(--c2)" }}>Key (k)</h4><p className="small">"What do I contain?" — used to be found.</p></div>
          <div className="card"><h4 style={{ color: "var(--c3)" }}>Value (v)</h4><p className="small">"What do I give if you pick me?"</p></div>
        </div>
        <p>Then, for one token:</p>
        <ol>
          <li><b>Score</b> every earlier token: <code>score_j = q · k_j / √d</code> (d = 128 here; dividing keeps scores from getting huge).</li>
          <li><b>Mask</b> the future: a token may not look at tokens after it (set their score to −∞). This is the <b>causal mask</b>.</li>
          <li><b>Softmax</b> the scores into weights that are positive and sum to 1.</li>
          <li><b>Mix</b>: output = Σ weight_j × v_j. A weighted average of the values.</li>
        </ol>
        <AttentionHeatmap />
        <Callout kind="idea">
          <p>The causal mask is why generation works one token at a time: during training each token only learned from the past,
            so at inference we can feed the past and ask for the next. It is also why the KV cache works: past keys and values
            never change once computed.</p>
        </Callout>
        <Quiz
          q="Why must a token not attend to tokens after it?"
          options={[
            "It would be too slow",
            "At generation time future tokens do not exist yet, so the model must learn to predict without them",
            "Softmax cannot handle more than one direction",
          ]}
          answer={1}
          explain="Training must match inference. When generating, the future is unknown, so during training we hide it with the mask."
        />
      </Section>

      <Section title="7. Multiple heads and GQA">
        <p>
          One attention pattern is not enough: a token needs to look for the subject, the previous word, the matching bracket,
          and so on — at the same time. So the 4096-number query is split into <b>32 heads</b> of 128 numbers. Each head does its
          own attention independently. Their outputs are glued back together.
        </p>
        <p>
          Storing keys and values for every head is expensive (they live in the KV cache). <b>Grouped-Query Attention</b> lets
          several query heads <b>share</b> one key/value head. Qwen3-4B: 32 query heads, 8 KV heads → groups of 4.
        </p>
        <GqaViz />
      </Section>

      <Section title="8. RoPE: how the model knows word order">
        <p>
          Attention by itself has no idea of order: "dog bites man" and "man bites dog" would give the same scores.
          <b> Rotary Position Embedding (RoPE)</b> fixes this by <b>rotating</b> each q and k by an angle proportional to its position.
          When you take a dot product of two rotated vectors, only the <b>difference</b> of their angles matters — so the score depends on relative distance.
        </p>
        <RopeViz />
        <Code title="kiln-engine: apply RoPE to one head (pairs of numbers rotate)">{`
fn rope(head: &mut [f32], pos: usize, base: f32) {
    let d = head.len();                 // 128
    for i in 0..d / 2 {
        let theta = base.powf(-2.0 * i as f32 / d as f32);   // speed of this pair
        let (sin, cos) = (pos as f32 * theta).sin_cos();
        // Qwen uses the "half split" layout: pair (i, i + d/2)
        let (a, b) = (head[i], head[i + d / 2]);
        head[i]         = a * cos - b * sin;
        head[i + d / 2] = a * sin + b * cos;
    }
}
`}</Code>
        <Callout kind="warn">
          <p>There are two RoPE layouts: pairs <code>(0,1), (2,3)…</code> (interleaved) and pairs <code>(i, i+64)</code> (half split).
            Using the wrong one gives a model that runs but outputs nonsense. This is exactly the kind of bug our
            layer-by-layer comparison against the reference will catch.</p>
        </Callout>
      </Section>

      <Section title="9. The MLP (SwiGLU): thinking alone">
        <p>
          After attention, each token goes through a small 2-layer network on its own. Qwen uses <b>SwiGLU</b>:
          expand from 2560 to 9728 numbers twice (gate and up), combine them, and shrink back to 2560.
        </p>
        <Code title="kiln-engine: SwiGLU">{`
// silu(x) = x * sigmoid(x): a smooth "mostly let positives through" switch
fn silu(x: f32) -> f32 { x / (1.0 + (-x).exp()) }

fn mlp(x: &[f32], w: &MlpWeights) -> Vec<f32> {
    let gate = matvec(&w.gate, x);          // [9728]
    let up   = matvec(&w.up, x);            // [9728]
    let h: Vec<f32> = gate.iter().zip(&up).map(|(g, u)| silu(*g) * u).collect();
    matvec(&w.down, &h)                     // back to [2560]
}
`}</Code>
        <p>The gate decides <b>which</b> of the 9728 "features" are active for this token; up decides <b>how much</b>. About 75% of all weights live here.</p>
      </Section>

      <Section title="10. The residual stream and the full layer">
        <p>
          Neither attention nor MLP replace the vector. They compute a change and <b>add</b> it: <code>x = x + attention(norm(x))</code>,
          then <code>x = x + mlp(norm(x))</code>. This "highway" is the <b>residual stream</b>. It lets information and gradients pass through 36 layers without fading.
        </p>
        <LayerDiagram />
        <h3>Where do 4 billion parameters come from?</h3>
        <ParamCount />
      </Section>

      <Section title="11. One full forward pass, with real shapes">
        <Stepper title="Generating one token with Qwen3-4B" hint="Step through. Shapes in blue are real Qwen3-4B tensor shapes." steps={FORWARD_STEPS} />
      </Section>

      <Section title="12. Our forward() in Rust">
        <p>This is the shape of the code we will write in <code>kiln-engine/src/model/qwen3.rs</code>. The first version runs on the CPU in f32 and is slow but simple — it is our ground truth.</p>
        <Code title="kiln-engine/src/model/qwen3.rs (skeleton)">{`
pub struct Qwen3 {
    cfg: Config,                 // hidden=2560, layers=36, heads=32, kv_heads=8, head_dim=128 ...
    embed: Tensor,               // [vocab, hidden], also used as lm_head (tied)
    layers: Vec<Layer>,          // 36 of them
    final_norm: Tensor,          // [hidden]
}

pub struct Layer {
    attn_norm: Tensor, q: Tensor, k: Tensor, v: Tensor, o: Tensor,
    q_norm: Tensor, k_norm: Tensor,
    mlp_norm: Tensor, gate: Tensor, up: Tensor, down: Tensor,
}

impl Qwen3 {
    /// Run ONE new token at position \`pos\`, using and updating the KV cache.
    /// Returns logits: one score per vocabulary entry.
    pub fn forward(&self, token: u32, pos: usize, cache: &mut KvCache) -> Vec<f32> {
        let c = &self.cfg;
        let mut x = embed(&self.embed, token, c.hidden);                 // [2560]

        for (l, layer) in self.layers.iter().enumerate() {
            // ---- attention block ----
            let h = rms_norm(&x, &layer.attn_norm, c.eps);
            let mut q = matvec(&layer.q, &h);                             // [32*128]
            let mut k = matvec(&layer.k, &h);                             // [8*128]
            let v     = matvec(&layer.v, &h);                             // [8*128]
            per_head(&mut q, c.head_dim, |hd| { rms_norm_inplace(hd, &layer.q_norm); rope(hd, pos, c.rope_base) });
            per_head(&mut k, c.head_dim, |hd| { rms_norm_inplace(hd, &layer.k_norm); rope(hd, pos, c.rope_base) });
            cache.write(l, pos, &k, &v);                                  // remember for later tokens

            let attn = attention(&q, cache.keys(l, pos), cache.values(l, pos), c); // [4096]
            let o = matvec(&layer.o, &attn);                              // [2560]
            add_inplace(&mut x, &o);                                      // residual

            // ---- MLP block ----
            let h = rms_norm(&x, &layer.mlp_norm, c.eps);
            let m = mlp(&h, layer);
            add_inplace(&mut x, &m);                                      // residual
        }

        let x = rms_norm(&x, &self.final_norm, c.eps);
        matvec(&self.embed, &x)                                           // [151936] logits
    }
}
`}</Code>
        <Callout kind="rust">
          <p><code>&amp;self</code> borrows the model read-only (many requests can share it). <code>&amp;mut KvCache</code> borrows the cache
            mutably — Rust guarantees no one else touches it while forward() writes to it. <code>|hd| {"{ ... }"}</code> is a closure (a small inline function).</p>
        </Callout>
        <Callout kind="kiln">
          <p>Later versions of <code>forward</code> take a <b>batch</b> of tokens from many requests at once (lesson: Continuous batching),
            store weights in 4-bit (lesson: Quantization), read K/V from paged blocks (lesson: KV cache), and run every <code>matvec</code> as a CUDA kernel.
            The structure above never changes — only how each step is computed.</p>
        </Callout>
        <Quiz
          q="During prefill of a 1,000-token prompt, how many times does the model read each weight from memory, at best?"
          options={["1,000 times — once per token", "Once — all 1,000 tokens are multiplied with each weight while it is loaded", "36 times — once per layer"]}
          answer={1}
          explain="In prefill, all prompt tokens form a matrix, so each weight is loaded once and used 1,000 times. That makes prefill compute-bound. Decode has only one token per step, so it is memory-bound."
        />
      </Section>

      <Recap items={[
        "Everything is dot products: matrix × vector = one dot product per row.",
        "Token id → embedding row → 36 × (attention + MLP), each added into the residual stream → logits.",
        "Attention: q·k/√d scores, causal mask, softmax, weighted sum of v. Multi-head = many patterns in parallel.",
        "GQA: 32 query heads share 8 KV heads → 4× smaller KV cache (144 KiB/token for Qwen3-4B).",
        "RoPE rotates q and k by position so scores depend on relative distance.",
        "~4.0B parameters: ~100M per layer × 36 + 389M embedding (shared with the output layer).",
      ]} />
    </>
  );
}
