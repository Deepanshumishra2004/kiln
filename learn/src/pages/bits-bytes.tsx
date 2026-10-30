import { useState } from "react";
import { Callout, Code, PageHeader, Quiz, Recap, Section, Seg, Slider, Viz } from "../components/ui";

/* ---------- float helpers (pure JS, no deps) ---------- */

const f32buf = new Float32Array(1);
const u32buf = new Uint32Array(f32buf.buffer);

function f32Bits(x: number): number {
  f32buf[0] = x;
  return u32buf[0];
}
function bitsToF32(b: number): number {
  u32buf[0] = b >>> 0;
  return f32buf[0];
}

/** f32 -> f16 bits, round-to-nearest-even (same rule the hardware uses). */
function toF16Bits(x: number): number {
  const b = f32Bits(x);
  const sign = (b >>> 16) & 0x8000;
  const exp = (b >>> 23) & 0xff;
  let mant = b & 0x7fffff;
  if (exp === 0xff) return sign | 0x7c00 | (mant ? 0x200 : 0); // inf / NaN
  const e = exp - 127 + 15;
  if (e >= 0x1f) return sign | 0x7c00; // too big -> infinity
  if (e <= 0) {
    // subnormal f16 (or underflow to zero)
    if (e < -10) return sign;
    mant |= 0x800000;
    const shift = 14 - e;
    let h = mant >> shift;
    const rem = mant & ((1 << shift) - 1);
    const half = 1 << (shift - 1);
    if (rem > half || (rem === half && h & 1)) h++;
    return sign | h;
  }
  let h = (e << 10) | (mant >> 13);
  const rem = mant & 0x1fff;
  if (rem > 0x1000 || (rem === 0x1000 && h & 1)) h++;
  return sign | h;
}
function f16ToNum(h: number): number {
  const s = h & 0x8000 ? -1 : 1;
  const e = (h >> 10) & 0x1f;
  const m = h & 0x3ff;
  if (e === 0) return s * m * 2 ** -24;
  if (e === 31) return m ? NaN : s * Infinity;
  return s * (1 + m / 1024) * 2 ** (e - 15);
}
/** f32 -> bf16 bits: keep the top 16 bits, round-to-nearest-even. */
function toBf16Bits(x: number): number {
  const b = f32Bits(x);
  if (Number.isNaN(x)) return (b >>> 16) | 0x40;
  const lsb = (b >>> 16) & 1;
  return Math.floor((b + 0x7fff + lsb) / 65536) & 0xffff;
}
function bf16ToNum(h: number): number {
  return bitsToF32(h << 16);
}

function bin(n: number, width: number): string {
  return (n >>> 0).toString(2).padStart(width, "0").slice(-width);
}
function hex(n: number, width: number): string {
  return (n >>> 0).toString(16).toUpperCase().padStart(width, "0").slice(-width);
}

/* ---------- small visual pieces ---------- */

const FIELD_COLORS = { s: "var(--c5)", e: "var(--c1)", m: "var(--c3)" };
const FIELD_SOFT = { s: "var(--c5-soft)", e: "var(--c1-soft)", m: "var(--c3-soft)" };

/** Render a bit string with sign / exponent / mantissa colouring. */
function FloatBits(props: { bits: string; expBits: number }) {
  return (
    <div className="bytes" style={{ gap: 2 }}>
      {props.bits.split("").map((c, i) => {
        const f = i === 0 ? "s" : i <= props.expBits ? "e" : "m";
        return (
          <span key={i} style={{ background: FIELD_SOFT[f], borderColor: FIELD_COLORS[f], color: FIELD_COLORS[f], padding: "2px 4px", fontWeight: 600 }}>
            {c}
          </span>
        );
      })}
    </div>
  );
}

function Legend() {
  return (
    <div className="small" style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 6 }}>
      <span><span className="pill" style={{ background: FIELD_SOFT.s, color: FIELD_COLORS.s }}>sign</span> + or −</span>
      <span><span className="pill" style={{ background: FIELD_SOFT.e, color: FIELD_COLORS.e }}>exponent</span> how big (power of 2)</span>
      <span><span className="pill" style={{ background: FIELD_SOFT.m, color: FIELD_COLORS.m }}>mantissa</span> the precise digits</span>
    </div>
  );
}

/* ---------- 1. byte explorer ---------- */

function ByteExplorer() {
  const [v, setV] = useState(173);
  const places = [128, 64, 32, 16, 8, 4, 2, 1];
  return (
    <Viz title="One byte = 8 switches" hint="Drag the slider, or click a bit to flip it. Every bit is a power of two.">
      <Slider label="Value (decimal)" value={v} min={0} max={255} onChange={setV} />
      <svg viewBox="0 0 720 120" width={720}>
        {places.map((p, i) => {
          const on = (v & p) !== 0;
          const x = 10 + i * 88;
          return (
            <g key={p} style={{ cursor: "pointer" }} onClick={() => setV(v ^ p)}>
              <rect x={x} y={10} width={78} height={56} rx={8} fill={on ? "var(--accent)" : "var(--panel-2)"} stroke="var(--border)" />
              <text x={x + 39} y={46} textAnchor="middle" fontSize={24} fontWeight={700} fill={on ? "white" : "var(--muted)"} fontFamily="var(--mono)">{on ? 1 : 0}</text>
              <text x={x + 39} y={88} textAnchor="middle" fontSize={13} fill="var(--muted)">2^{7 - i}</text>
              <text x={x + 39} y={108} textAnchor="middle" fontSize={13} fill="var(--text)">{p}</text>
            </g>
          );
        })}
      </svg>
      <div className="grid3 small" style={{ marginTop: 8 }}>
        <div className="card"><b>Decimal</b><div className="mono">{v}</div></div>
        <div className="card"><b>Binary</b><div className="mono">0b{bin(v, 8)}</div></div>
        <div className="card"><b>Hex</b><div className="mono">0x{hex(v, 2)} <span className="muted">= {hex(v >> 4, 1)} | {hex(v & 15, 1)}</span></div></div>
      </div>
      <div className="caption">
        Sum of the orange boxes = {places.filter((p) => v & p).join(" + ") || "0"} = {v}. One hex digit is exactly 4 bits (a "nibble"),
        so a byte is always two hex digits.
      </div>
    </Viz>
  );
}

/* ---------- 2. endianness ---------- */

function EndianViz() {
  const [n, setN] = useState(0x12345678);
  const bytes = [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]; // little-endian order
  const colors = [3, 1, 4, 2];
  const row = (title: string, order: number[]) => (
    <div style={{ marginTop: 10 }}>
      <div className="small"><b>{title}</b></div>
      <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
        {order.map((bi, addr) => (
          <div key={addr} style={{ textAlign: "center" }}>
            <div className="mono" style={{ padding: "8px 14px", borderRadius: 6, border: `2px solid var(--c${colors[bi]})`, background: `var(--c${colors[bi]}-soft)`, fontWeight: 700 }}>
              {hex(bytes[bi], 2)}
            </div>
            <div className="small muted mono">addr {addr}</div>
          </div>
        ))}
      </div>
    </div>
  );
  return (
    <Viz title="Same number, two byte orders" hint="A u32 needs 4 bytes. Which byte goes to the lowest memory address?">
      <Slider label="u32 value" value={n} min={0} max={0xffffffff} step={1} onChange={(x) => setN(Math.round(x) >>> 0)}
        format={(x) => "0x" + hex(Math.round(x), 8)} />
      <div className="controls">
        <button className="btn" onClick={() => setN(0x12345678)}>0x12345678</button>
        <button className="btn" onClick={() => setN(1)}>1</button>
        <button className="btn" onClick={() => setN(0x46554747)}>"GGUF" magic</button>
      </div>
      {row("Little-endian (x86, ARM, GGUF files, our wire protocol): smallest byte first", [0, 1, 2, 3])}
      {row("Big-endian (\"network order\", old protocols): biggest byte first", [3, 2, 1, 0])}
      <div className="caption">
        Colour = which part of the number. In little-endian the byte <span className="mono">{hex(bytes[0], 2)}</span> (the "ones" place) sits at address 0.
        A GGUF file starts with the u32 0x46554747; written little-endian the bytes read
        <span className="mono"> 47 47 55 46</span> = ASCII "GGUF".
      </div>
    </Viz>
  );
}

/* ---------- 3. two's complement ---------- */

function TwosComplement() {
  const [v, setV] = useState(-5);
  const u = v & 0xff;
  const pos = Math.abs(v) & 0xff;
  return (
    <Viz title="Negative numbers: two's complement (i8)" hint="Slide from −128 to 127. Watch the top bit.">
      <Slider label="i8 value" value={v} min={-128} max={127} onChange={setV} />
      <div style={{ marginTop: 8 }}>
        <div className="bytes" style={{ gap: 2 }}>
          {bin(u, 8).split("").map((c, i) => (
            <span key={i} style={{ padding: "4px 8px", fontWeight: 700, background: i === 0 ? "var(--c5-soft)" : "var(--panel-2)", color: i === 0 ? "var(--c5)" : "var(--text)" }}>{c}</span>
          ))}
        </div>
        <div className="small muted" style={{ marginTop: 4 }}>
          Top bit has weight <b>−128</b> instead of +128. Value = {u & 0x80 ? "−128 + " + (u & 0x7f) : u & 0x7f} = {v}
        </div>
      </div>
      {v < 0 && (
        <div className="card small fade-in" style={{ marginTop: 10 }}>
          <b>How to get −{pos} by hand:</b>
          <div className="mono">+{pos} = {bin(pos, 8)}</div>
          <div className="mono">flip   = {bin(~pos & 0xff, 8)}</div>
          <div className="mono">+1     = {bin(u, 8)}  ← this is {v}</div>
        </div>
      )}
      <div className="caption">
        Why this trick? The CPU can use the <i>same adder circuit</i> for signed and unsigned numbers. (−5) + 5 = 0b11111011 + 0b00000101 = 0b1_00000000,
        and the 9th bit falls off, leaving 0.
      </div>
    </Viz>
  );
}

/* ---------- 4. float explorer ---------- */

function FloatExplorer() {
  const [text, setText] = useState("0.1");
  const parsed = Number(text);
  const x = parsed;
  const valid = text.trim() !== "" && !Number.isNaN(x);

  const b32 = f32Bits(x);
  const v32 = bitsToF32(b32);
  const h16 = toF16Bits(x);
  const v16 = f16ToNum(h16);
  const hb = toBf16Bits(x);
  const vb = bf16ToNum(hb);

  const sign = b32 >>> 31;
  const expRaw = (b32 >>> 23) & 0xff;
  const mant = b32 & 0x7fffff;

  const err = (approx: number) => {
    if (!valid || !Number.isFinite(approx)) return "—";
    const abs = Math.abs(approx - x);
    const rel = x === 0 ? 0 : abs / Math.abs(x);
    return `${abs.toExponential(2)} (${(rel * 100).toPrecision(2)}%)`;
  };

  return (
    <Viz title="Float explorer: type any number" hint="See exactly which bits the computer stores, in f32, f16 and bf16 — and how much each one rounds.">
      <div className="controls">
        <div style={{ flex: 1, minWidth: 180 }}>
          <input type="text" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        {["0.1", "1", "-2.5", "3.14159265", "65504", "70000", "0.0001", "1e-8", "123456.789"].map((s) => (
          <button key={s} className="btn" onClick={() => setText(s)}>{s}</button>
        ))}
      </div>
      {!valid ? <p className="muted">Type a number.</p> : (
        <div className="fade-in">
          <h4 style={{ margin: "12px 0 4px" }}>f32 — 32 bits (1 + 8 + 23)</h4>
          <FloatBits bits={bin(b32, 32)} expBits={8} />
          <div className="small mono" style={{ marginTop: 6 }}>
            (−1)^<span style={{ color: FIELD_COLORS.s }}>{sign}</span> × 2^(<span style={{ color: FIELD_COLORS.e }}>{expRaw}</span> − 127)
            × (1 + <span style={{ color: FIELD_COLORS.m }}>{mant}</span>/2^23)
            {expRaw === 0 && <span className="muted"> (subnormal: no hidden 1)</span>}
          </div>
          <div className="small">stored value: <span className="mono">{v32.toPrecision(10)}</span> · error {err(v32)}</div>

          <h4 style={{ margin: "14px 0 4px" }}>f16 — 16 bits (1 + 5 + 10)</h4>
          <FloatBits bits={bin(h16, 16)} expBits={5} />
          <div className="small">stored value: <span className="mono">{Number.isFinite(v16) ? v16.toPrecision(8) : String(v16)}</span> · error {err(v16)}
            {!Number.isFinite(v16) && <b style={{ color: "var(--c5)" }}> overflow! f16 max is 65504</b>}
          </div>

          <h4 style={{ margin: "14px 0 4px" }}>bf16 — 16 bits (1 + 8 + 7)</h4>
          <FloatBits bits={bin(hb, 16)} expBits={8} />
          <div className="small">stored value: <span className="mono">{vb.toPrecision(8)}</span> · error {err(vb)}</div>
          <Legend />
        </div>
      )}
      <div className="caption">
        Try 0.1: no binary float can store it exactly (like 1/3 in decimal). Try 70000: f16 overflows to infinity but bf16 is fine,
        because bf16 kept f32's 8 exponent bits and threw away mantissa bits instead.
      </div>
    </Viz>
  );
}

/* ---------- 5. nibble packer ---------- */

function NibblePacker() {
  const [mode, setMode] = useState<"unsigned" | "signed">("unsigned");
  const [a, setA] = useState(3);
  const [b, setB] = useState(12);
  const min = mode === "unsigned" ? 0 : -8, max = mode === "unsigned" ? 15 : 7;
  const qa = a - min, qb = b - min; // stored nibble 0..15 (signed uses +8 offset, like GGUF Q4_0)
  const byte = (qa & 0x0f) | ((qb & 0x0f) << 4);
  return (
    <Viz title="Packing two 4-bit numbers into one byte" hint="This is how 4-bit quantized weights are stored: 2 weights per byte.">
      <div className="controls">
        <Seg options={["unsigned", "signed"] as const} value={mode} onChange={(m) => { setMode(m); setA(m === "unsigned" ? 3 : -5); setB(m === "unsigned" ? 12 : 4); }}
          labels={{ unsigned: "0..15", signed: "−8..7 (offset +8)" }} />
      </div>
      <div className="controls">
        <Slider label="weight A (low nibble)" value={a} min={min} max={max} onChange={setA} />
        <Slider label="weight B (high nibble)" value={b} min={min} max={max} onChange={setB} />
      </div>
      <svg viewBox="0 0 720 140" width={720}>
        {bin(byte, 8).split("").map((c, i) => {
          const hi = i < 4;
          const col = hi ? "var(--c4)" : "var(--c6)";
          const soft = hi ? "var(--c4-soft)" : "var(--c6-soft)";
          return (
            <g key={i}>
              <rect x={150 + i * 54} y={30} width={48} height={48} rx={6} fill={soft} stroke={col} strokeWidth={2} />
              <text x={174 + i * 54} y={61} textAnchor="middle" fontSize={22} fontWeight={700} fill={col} fontFamily="var(--mono)">{c}</text>
            </g>
          );
        })}
        <text x={150 + 2 * 54} y={20} textAnchor="middle" fontSize={13} fill="var(--c4)">B stored = {qb}</text>
        <text x={150 + 6 * 54} y={20} textAnchor="middle" fontSize={13} fill="var(--c6)">A stored = {qa}</text>
        <text x={360} y={110} textAnchor="middle" fontSize={15} fill="var(--text)" fontFamily="var(--mono)">
          byte = A | (B {"<<"} 4) = 0x{hex(byte, 2)} = {byte}
        </text>
        <text x={360} y={132} textAnchor="middle" fontSize={12} fill="var(--muted)" fontFamily="var(--mono)">
          unpack: A = (byte {"&"} 0x0F){mode === "signed" ? " − 8" : ""} = {a},  B = (byte {">>"} 4){mode === "signed" ? " − 8" : ""} = {b}
        </text>
      </svg>
      <div className="caption">
        4 bits can only hold 16 different values. For signed weights, GGUF's Q4_0 stores <i>value + 8</i> so everything fits in 0..15,
        then subtracts 8 when reading. A 4B-parameter model at 4 bits is ~2 GB of these nibbles (plus scales).
      </div>
    </Viz>
  );
}

/* ---------- memory size comparison ---------- */

function MemSize() {
  const [params, setParams] = useState(4);
  const rows = [
    { name: "f32", bits: 32, color: 5 },
    { name: "f16 / bf16", bits: 16, color: 1 },
    { name: "int8 (Q8_0)", bits: 8.5, color: 4 },
    { name: "int4 (Q4_K_M)", bits: 4.8, color: 3 },
  ];
  const maxGb = params * 4;
  return (
    <Viz title="Why number format = memory size" hint="Model memory ≈ parameters × bytes per parameter. The RTX 3050 Laptop has 4 GB.">
      <Slider label="Parameters (billions)" value={params} min={0.5} max={8} step={0.1} onChange={setParams} format={(v) => v.toFixed(1) + " B"} />
      <svg viewBox="0 0 720 190" width={720}>
        {rows.map((r, i) => {
          const gb = (params * 1e9 * r.bits) / 8 / 1e9;
          const w = (gb / maxGb) * 470;
          const fits = gb < 3.2;
          return (
            <g key={r.name}>
              <text x={0} y={30 + i * 42} fontSize={13} fill="var(--text)">{r.name}</text>
              <rect x={120} y={14 + i * 42} width={Math.max(w, 2)} height={24} rx={4} fill={`var(--c${r.color})`} opacity={0.85} />
              <text x={128 + w} y={31 + i * 42} fontSize={13} fill="var(--text)">{gb.toFixed(2)} GB {fits ? "✓ fits" : "✗ too big"}</text>
            </g>
          );
        })}
        <line x1={120 + (4 / maxGb) * 470} y1={8} x2={120 + (4 / maxGb) * 470} y2={180} stroke="var(--c5)" strokeDasharray="5 4" />
        <text x={124 + (4 / maxGb) * 470} y={182} fontSize={11} fill="var(--c5)">4 GB VRAM</text>
      </svg>
      <div className="caption">"Fits" here means under ~3.2 GB, leaving room for the CUDA context and KV cache (an estimate). Q8_0 is ~8.5 bits and Q4_K_M ~4.8 bits per weight because each block also stores scale numbers.</div>
    </Viz>
  );
}

/* ---------- page ---------- */

export default function Page() {
  return (
    <>
      <PageHeader
        kicker="Computers · Lesson 1"
        title="Bits, bytes & floating point"
        subtitle="Everything inside a computer — model weights, API keys, network packets — is a long row of 0s and 1s. Let's learn to read them."
        learn={[
          "Binary and hexadecimal, and why a byte is 8 bits",
          "Endianness: in what order bytes sit in memory (GGUF and our wire protocol use little-endian)",
          "How negative integers are stored (two's complement)",
          "How floats really work: sign, exponent, mantissa — and f32 vs f16 vs bf16",
          "How 4-bit weights are packed two-per-byte (the base of quantization)",
          "The Rust tools for all of this: to_le_bytes, to_bits, shifts and masks",
        ]}
      />

      <Section title="1. Why start with bits?">
        <p>
          A model file is 2.5 GB of bytes. Our wire protocol sends bytes over TCP. An API key is bytes that we hash.
          If you cannot read bytes, every one of these feels like magic. If you can, they become simple.
        </p>
        <p>
          A <b>bit</b> is one switch: off (0) or on (1). Hardware is built from billions of these switches (transistors).
          A <b>byte</b> is a group of 8 bits. Memory is a giant array of bytes, and every byte has an <b>address</b> (its index).
        </p>
        <Callout kind="analogy">
          Memory is like a very long street of tiny houses. Each house has a number (the address) and holds exactly one byte.
          A bigger value, like a 4-byte integer, simply uses 4 houses next to each other.
        </Callout>
      </Section>

      <Section title="2. Binary and hexadecimal">
        <p>
          In decimal each position is worth 10× the one to its right (1, 10, 100…). In <b>binary</b> each position is worth 2× (1, 2, 4, 8…).
          With 8 bits we can count from 0 to 255 (2<sup>8</sup> − 1).
        </p>
        <ByteExplorer />
        <p>
          Long binary strings are hard to read, so programmers use <b>hexadecimal</b> (base 16, digits 0–9 and A–F).
          One hex digit = exactly 4 bits, so <code>0xAD</code> = <code>1010 1101</code>. You will see hex everywhere: memory dumps,
          hash outputs, GGUF headers, colours.
        </p>
        <Code title="binary and hex in Rust">{`
fn main() {
    let x: u8 = 173;
    println!("{x}");        // 173
    println!("{x:08b}");    // 10101101   (binary, padded to 8 digits)
    println!("{x:#04x}");   // 0xad       (hex)

    let y = 0b1010_1101u8;  // binary literal, _ is just for readability
    let z = 0xADu8;         // hex literal
    assert_eq!(x, y);
    assert_eq!(y, z);
}`}</Code>
        <table>
          <thead><tr><th>Rust type</th><th>Bits</th><th>Range</th><th>Used in Kiln for</th></tr></thead>
          <tbody>
            <tr><td><code>u8</code></td><td>8</td><td>0 … 255</td><td>raw bytes, packed 4-bit weights</td></tr>
            <tr><td><code>i8</code></td><td>8</td><td>−128 … 127</td><td>Q8_0 quantized weights</td></tr>
            <tr><td><code>u32</code></td><td>32</td><td>0 … ~4.29 billion</td><td>token ids, frame lengths</td></tr>
            <tr><td><code>u64</code></td><td>64</td><td>0 … ~1.8×10<sup>19</sup></td><td>stream ids, offsets in the event log, file sizes</td></tr>
            <tr><td><code>usize</code></td><td>64 (on our PC)</td><td>size of a pointer</td><td>array indexes, lengths</td></tr>
            <tr><td><code>f32</code></td><td>32</td><td>~±3.4×10<sup>38</sup></td><td>activations, math on CPU</td></tr>
          </tbody>
        </table>
      </Section>

      <Section title="3. Endianness: byte order in memory">
        <p>
          A <code>u32</code> takes 4 bytes. But which byte is stored first — the big end or the little end?
          Both choices exist. Almost all modern CPUs (x86, ARM) are <b>little-endian</b>: the least significant byte goes to the lowest address.
        </p>
        <EndianViz />
        <p>
          Why does this matter to us? When we read a GGUF model file, or a frame of our wire protocol, we get raw bytes.
          We must turn them into numbers in the <i>same order</i> they were written. Get it wrong and a length of 16 becomes 268,435,456.
        </p>
        <Code title="reading and writing numbers as bytes">{`
fn main() {
    let n: u32 = 0x12345678;

    let le = n.to_le_bytes();  // [0x78, 0x56, 0x34, 0x12]  little-endian
    let be = n.to_be_bytes();  // [0x12, 0x34, 0x56, 0x78]  big-endian

    // Reading back: you must use the same order you wrote with.
    assert_eq!(u32::from_le_bytes(le), n);
    assert_eq!(u32::from_le_bytes(be), 0x78563412); // wrong order = wrong number!

    // Parsing the start of a GGUF file:
    let file: &[u8] = &[0x47, 0x47, 0x55, 0x46, 3, 0, 0, 0];
    let magic = u32::from_le_bytes(file[0..4].try_into().unwrap());
    let version = u32::from_le_bytes(file[4..8].try_into().unwrap());
    assert_eq!(magic, 0x46554747); // "GGUF"
    assert_eq!(version, 3);
}`}</Code>
        <Callout kind="kiln">
          Kiln rule: <b>every multi-byte number we put on disk or on the network is little-endian.</b> GGUF already is, and our
          <code>kiln-wire</code> frames (<code>[u32 len][u8 type][u64 stream_id]…</code>) and event-log records will be too.
          Then on x86 reading a number is a free copy, with no byte swapping.
        </Callout>
        <Quiz
          q="The bytes at addresses 0..4 are 10 00 00 00 (hex). Read as a little-endian u32, what is the value?"
          options={["0x10000000 = 268,435,456", "0x00000010 = 16", "0x00001000 = 4096", "It depends on the CPU speed"]}
          answer={1}
          explain="Little-endian: the first byte (address 0) is the least significant. So the value is 0x00000010 = 16."
        />
      </Section>

      <Section title="4. Negative integers: two's complement">
        <p>
          A byte holds 256 patterns. For <code>i8</code> we want half of them to be negative. The trick that every CPU uses is
          <b> two's complement</b>: the top bit is worth <b>−128</b> instead of +128. Everything else stays the same.
        </p>
        <TwosComplement />
        <Callout kind="warn" title="⚠️ Watch out: overflow">
          <p>
            <code>let x: u8 = 255; x + 1</code> — in debug builds Rust <b>panics</b> ("attempt to add with overflow"). In release builds it
            silently wraps to 0. When you <i>want</i> wrapping (hashes, checksums, RNGs) say so explicitly:
            <code>x.wrapping_add(1)</code>. When you want to detect it: <code>x.checked_add(1)</code> returns <code>None</code>.
          </p>
        </Callout>
        <Code title="casts between widths">{`
let a: i8 = -5;
let b = a as u8;        // 251  (same bits, read as unsigned)
let c = a as i32;       // -5   (sign-extended: the top bit is copied left)
let d = b as i32;       // 251  (zero-extended)
let e = 300i32 as u8;   // 44   (keeps only the low 8 bits: 300 - 256)`}</Code>
      </Section>

      <Section title="5. Floating point from scratch">
        <p>
          Neural networks work with real numbers like 0.0213 or −1.75. We can't store infinite digits, so we use
          <b> scientific notation in binary</b>:
        </p>
        <div className="card mono" style={{ textAlign: "center", fontSize: "1.05rem" }}>
          value = (−1)<sup>sign</sup> × 2<sup>exponent − bias</sup> × 1.mantissa
        </div>
        <ul>
          <li><b>Sign</b> (1 bit): positive or negative.</li>
          <li><b>Exponent</b>: which power of two. This sets the <i>range</i> (how big or small a number can be). Stored with a "bias" (127 for f32) so it can be negative.</li>
          <li><b>Mantissa</b> (fraction): the digits after "1.". This sets the <i>precision</i> (how many significant digits). The leading 1 is not stored — it is free ("hidden bit").</li>
        </ul>
        <Callout kind="analogy">
          Think of a ruler that you can zoom. The exponent picks the zoom level (millimetres or kilometres). The mantissa is how many tick
          marks you have at that zoom. Floats have the same number of tick marks at every zoom, so the <i>gaps</i> between representable
          numbers grow as numbers get bigger.
        </Callout>
        <FloatExplorer />
        <table>
          <thead><tr><th>Format</th><th>Sign</th><th>Exponent</th><th>Mantissa</th><th>Max value</th><th>Decimal digits (approx)</th><th>Bytes</th></tr></thead>
          <tbody>
            <tr><td>f32</td><td>1</td><td>8</td><td>23</td><td>~3.4×10<sup>38</sup></td><td>~7</td><td>4</td></tr>
            <tr><td>f16 (IEEE half)</td><td>1</td><td>5</td><td>10</td><td>65,504</td><td>~3.3</td><td>2</td></tr>
            <tr><td>bf16 ("brain float")</td><td>1</td><td>8</td><td>7</td><td>~3.4×10<sup>38</sup></td><td>~2.4</td><td>2</td></tr>
          </tbody>
        </table>
        <p>
          <b>f16</b> keeps more precision but has a tiny range — values above 65,504 become infinity. <b>bf16</b> is literally the top half of an
          f32: same range, less precision. Neural networks care more about range than about the 4th decimal digit, which is why bf16 is popular
          for training. For inference, GGUF files usually store scales in f16.
        </p>
        <Code title="looking at float bits in Rust">{`
fn main() {
    let x: f32 = 0.1;
    let bits: u32 = x.to_bits();               // reinterpret the same 4 bytes as u32
    println!("{bits:032b}");                    // 00111101110011001100110011001101

    let sign     = bits >> 31;                  // top 1 bit
    let exponent = (bits >> 23) & 0xFF;         // next 8 bits  (mask = 0b1111_1111)
    let mantissa = bits & 0x7F_FFFF;            // low 23 bits
    println!("sign={sign} exp={exponent} (2^{}) mant={mantissa}", exponent as i32 - 127);

    // bf16 by hand: keep the top 16 bits (real code also rounds; see the explorer above).
    let bf16_bits: u16 = (bits >> 16) as u16;
    let back = f32::from_bits((bf16_bits as u32) << 16);
    println!("{x} -> bf16 -> {back}");          // 0.1 -> bf16 -> 0.099609375
}`}</Code>
        <Callout kind="deep">
          <p>
            <b>Shifts and masks</b> are the two tools of bit work. <code>x {">>"} n</code> moves bits right by n (dropping the low ones).
            <code> x {"&"} mask</code> keeps only the bits where the mask has 1s. <code>x | y</code> combines bits. <code>x {"<<"} n</code> moves left.
            Every file-format parser and quantization kernel in Kiln is built from these four operations.
          </p>
        </Callout>
        <Callout kind="warn" title="⚠️ Watch out: floats are not exact">
          <code>0.1 + 0.2 == 0.3</code> is <b>false</b> in every language that uses IEEE floats. When we test our kernels against a reference,
          we never compare with <code>==</code>; we check <code>(a - b).abs() {"<"} tolerance</code>. Also: the order of additions changes the
          result slightly, so a GPU sum and a CPU sum of the same numbers will differ in the last digits. That is normal.
        </Callout>
        <Quiz
          q="Why can a weight of 70,000 be stored in bf16 but not in f16?"
          options={[
            "bf16 has more mantissa bits",
            "bf16 has 8 exponent bits like f32, f16 only has 5, so f16's max is 65,504",
            "f16 cannot store integers",
            "bf16 uses 32 bits",
          ]}
          answer={1}
          explain="Range comes from exponent bits. bf16 copies f32's 8-bit exponent; f16's 5-bit exponent tops out at 65,504."
        />
      </Section>

      <Section title="6. Fewer bits per number = smaller model">
        <p>
          A model is mostly a huge list of weights. Going from f32 to f16 <b>halves</b> the memory, and to 4 bits divides it by ~7.
          On a 4 GB GPU this is the difference between "impossible" and "runs".
        </p>
        <MemSize />
        <p>
          The smallest practical unit is the <b>nibble</b> (4 bits). There is no <code>u4</code> type, so we pack two nibbles into one <code>u8</code>.
        </p>
        <NibblePacker />
        <Code title="packing and unpacking 4-bit values">{`
/// Pack two values in 0..=15 into one byte. a = low nibble, b = high nibble.
fn pack(a: u8, b: u8) -> u8 {
    debug_assert!(a < 16 && b < 16);
    a | (b << 4)
}

fn unpack(byte: u8) -> (u8, u8) {
    (byte & 0x0F, byte >> 4)
}

/// Q4_0-style signed: stored nibble = value + 8, so -8..=7 fits in 0..=15.
fn unpack_signed(byte: u8) -> (i8, i8) {
    ((byte & 0x0F) as i8 - 8, (byte >> 4) as i8 - 8)
}

fn main() {
    let b = pack(3, 12);
    assert_eq!(b, 0xC3);
    assert_eq!(unpack(b), (3, 12));
}`}</Code>
        <Callout kind="kiln">
          The <code>quant/</code> module in <code>kiln-engine</code> is exactly this, at scale: read blocks of packed nibbles plus an f16 scale,
          and turn them back into numbers (<code>w ≈ scale × q</code>) inside the matrix-multiply loop. The full story is in the Quantization lesson.
        </Callout>
        <Quiz
          q="A byte holds 0xC3. Using unpack(), what are (low, high)?"
          options={["(12, 3)", "(3, 12)", "(195, 0)", "(0xC, 0x3) = (12, 3)"]}
          answer={1}
          explain="Low nibble = 0xC3 & 0x0F = 0x3 = 3. High nibble = 0xC3 >> 4 = 0xC = 12."
        />
      </Section>

      <Recap
        items={[
          "A byte = 8 bits = 2 hex digits. Memory is a big array of bytes with addresses.",
          "Little-endian: lowest byte at lowest address. GGUF, x86 and our own formats are little-endian; use to_le_bytes / from_le_bytes.",
          "Signed integers use two's complement: top bit has negative weight. Watch for overflow; use wrapping_/checked_ when needed.",
          "Floats = sign × 2^exponent × 1.mantissa. Exponent bits give range, mantissa bits give precision.",
          "f16 (5+10) has precision but small range; bf16 (8+7) has f32's range but less precision. Both halve memory vs f32.",
          "4-bit weights are packed two per byte with shifts and masks — the foundation of quantization.",
        ]}
      />
    </>
  );
}
