import { useMemo, useState } from "react";
import {
  PageHeader, Section, Callout, Code, Viz, Slider, Seg, Stepper, Quiz, Recap, Svg, Box, Arrow,
} from "../components/ui";

/* ---------------- seeded PRNG (same idea as our Rust Pcg32) ---------------- */

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- the sampling pipeline, for real ---------------- */

type Cand = { tok: string; logit: number };
const CANDS: Cand[] = [
  { tok: " Paris", logit: 8.1 }, { tok: " the", logit: 6.4 }, { tok: " a", logit: 5.6 },
  { tok: " located", logit: 5.2 }, { tok: " known", logit: 4.9 }, { tok: " beautiful", logit: 4.1 },
  { tok: " Lyon", logit: 3.6 }, { tok: " not", logit: 3.0 }, { tok: " Berlin", logit: 2.2 }, { tok: " banana", logit: 0.4 },
];

type Settings = { temp: number; topK: number; topP: number; minP: number; repPen: number; recent: Set<string> };

function pipeline(cands: Cand[], s: Settings) {
  // 1. repetition penalty: shrink logits of recently generated tokens
  const pen = cands.map((c) => {
    if (!s.recent.has(c.tok) || s.repPen === 1) return c.logit;
    return c.logit > 0 ? c.logit / s.repPen : c.logit * s.repPen;
  });
  // 2. temperature
  const t = Math.max(s.temp, 1e-4);
  const scaled = pen.map((l) => l / t);
  // 3. softmax
  const m = Math.max(...scaled);
  const ex = scaled.map((x) => Math.exp(x - m));
  const Z = ex.reduce((a, b) => a + b, 0);
  const p = ex.map((x) => x / Z);
  // 4. filters on the sorted list
  const order = p.map((_, i) => i).sort((a, b) => p[b] - p[a]);
  const keep = new Array(p.length).fill(false);
  const why = new Array<string>(p.length).fill("");
  let cum = 0;
  order.forEach((i, rank) => {
    if (rank >= s.topK) { why[i] = "top-k"; return; }
    if (cum >= s.topP && rank > 0) { why[i] = "top-p"; return; }
    if (p[i] < s.minP * p[order[0]]) { why[i] = "min-p"; return; }
    keep[i] = true; cum += p[i];
  });
  const kept = p.map((x, i) => (keep[i] ? x : 0));
  const Zk = kept.reduce((a, b) => a + b, 0);
  const final = kept.map((x) => x / Zk);
  return { pen, p, final, keep, why };
}

function sampleFrom(probs: number[], u: number) {
  let acc = 0;
  for (let i = 0; i < probs.length; i++) { acc += probs[i]; if (u < acc) return i; }
  return probs.length - 1;
}

function SamplerLab() {
  const [temp, setTemp] = useState(1);
  const [topK, setTopK] = useState(10);
  const [topP, setTopP] = useState(1);
  const [minP, setMinP] = useState(0);
  const [repPen, setRepPen] = useState(1);
  const [seed, setSeed] = useState(42);
  const [draws, setDraws] = useState<number[]>([]);
  const recent = useMemo(() => new Set([" Paris"]), []);
  const r = useMemo(() => pipeline(CANDS, { temp, topK, topP, minP, repPen, recent }), [temp, topK, topP, minP, repPen, recent]);

  const drawMany = (n: number) => {
    const rng = mulberry32(seed);
    setDraws(Array.from({ length: n }, () => sampleFrom(r.final, rng())));
  };
  const counts = CANDS.map((_, i) => draws.filter((d) => d === i).length);
  const greedy = r.final.indexOf(Math.max(...r.final));

  const rowH = 26, ox = 110, bw = 360;
  return (
    <Viz title="Sampler lab — prompt: “The capital of France is”"
      hint="Change the knobs. Grey bars are tokens removed by a filter (the label says which). Then draw samples with a fixed seed.">
      <div className="controls">
        <Slider label="temperature" value={temp} min={0.05} max={2.5} step={0.05} onChange={setTemp} format={(v) => v.toFixed(2)} />
        <Slider label="top-k" value={topK} min={1} max={10} onChange={setTopK} />
        <Slider label="top-p" value={topP} min={0.05} max={1} step={0.01} onChange={setTopP} format={(v) => v.toFixed(2)} />
        <Slider label="min-p" value={minP} min={0} max={0.5} step={0.01} onChange={setMinP} format={(v) => v.toFixed(2)} />
        <Slider label="repetition penalty (“ Paris” was already generated)" value={repPen} min={1} max={2} step={0.05} onChange={setRepPen} format={(v) => v.toFixed(2)} />
      </div>
      <Svg w={740} h={CANDS.length * rowH + 30} label="probabilities">
        <text x={ox} y={14} fontSize={11} fill="var(--muted)">final probability (after filters, renormalized)</text>
        <text x={ox + bw + 20} y={14} fontSize={11} fill="var(--muted)">logit → after penalty</text>
        {CANDS.map((c, i) => {
          const y = 22 + i * rowH;
          return (
            <g key={c.tok}>
              <text x={ox - 8} y={y + 15} fontSize={12} textAnchor="end" fill="var(--text)" className="mono">{c.tok.replace(" ", "·")}</text>
              <rect x={ox} y={y + 3} width={bw} height={rowH - 8} fill="var(--panel-2)" rx={3} />
              <rect x={ox} y={y + 3} width={Math.max(r.keep[i] ? r.final[i] * bw : r.p[i] * bw, 1)} height={rowH - 8} rx={3}
                fill={r.keep[i] ? (i === greedy ? "var(--accent)" : "var(--c1)") : "var(--muted)"} fillOpacity={r.keep[i] ? 0.85 : 0.3} />
              <text x={ox + 6} y={y + 15} fontSize={11} fill="var(--text)">
                {r.keep[i] ? `${(r.final[i] * 100).toFixed(1)}%` : `removed by ${r.why[i]} (was ${(r.p[i] * 100).toFixed(1)}%)`}
              </text>
              <text x={ox + bw + 20} y={y + 15} fontSize={11} className="mono" fill="var(--muted)">
                {c.logit.toFixed(1)}{r.pen[i] !== c.logit ? ` → ${r.pen[i].toFixed(2)}` : ""}
              </text>
            </g>
          );
        })}
      </Svg>
      <div className="controls">
        <Slider label="seed" value={seed} min={1} max={100} onChange={(v) => { setSeed(v); setDraws([]); }} />
        <button className="btn primary" onClick={() => drawMany(1)}>Sample 1 token</button>
        <button className="btn" onClick={() => drawMany(200)}>Sample 200 times</button>
      </div>
      {draws.length === 1 && <p className="small">Seed {seed} picked <b className="mono">{CANDS[draws[0]].tok.replace(" ", "·")}</b>. Click again: same seed → same answer. Change the seed → maybe different.</p>}
      {draws.length > 1 && (
        <div className="small">
          200 draws with seed {seed}:{" "}
          {CANDS.map((c, i) => counts[i] > 0 && <span key={i} className="pill" style={{ marginRight: 4 }}>{c.tok.replace(" ", "·")} {counts[i]}</span>)}
        </div>
      )}
      <div className="caption">Orange bar = the greedy choice (highest probability). Temperature → 0 makes everything greedy; high temperature flattens the distribution and lets "banana" in.</div>
    </Viz>
  );
}

/* ---------------- softmax temperature curve ---------------- */

function TempCurve() {
  const [temp, setTemp] = useState(1);
  const logits = [3, 2, 1, 0.5, 0];
  const s = logits.map((l) => l / temp);
  const m = Math.max(...s);
  const e = s.map((x) => Math.exp(x - m));
  const Z = e.reduce((a, b) => a + b, 0);
  const p = e.map((x) => x / Z);
  return (
    <Viz title="Softmax: turn scores into probabilities" hint="Logits are [3, 2, 1, 0.5, 0]. Move temperature and watch the shape change.">
      <Slider label="temperature" value={temp} min={0.1} max={5} step={0.05} onChange={setTemp} format={(v) => v.toFixed(2)} />
      <Svg w={500} h={170} label="softmax bars">
        {p.map((v, i) => (
          <g key={i}>
            <rect x={30 + i * 92} y={140 - v * 125} width={60} height={v * 125} rx={4} fill="var(--c4)" fillOpacity={0.8} />
            <text x={60 + i * 92} y={135 - v * 125} fontSize={11} textAnchor="middle" fill="var(--text)">{(v * 100).toFixed(1)}%</text>
            <text x={60 + i * 92} y={160} fontSize={11} textAnchor="middle" fill="var(--muted)">logit {logits[i]}</text>
          </g>
        ))}
      </Svg>
      <div className="caption mono">p_i = exp(logit_i / T) / Σ_j exp(logit_j / T)</div>
    </Viz>
  );
}

/* ---------------- constrained decoding ---------------- */

const VOCAB = ["{", "Sure", "\"city\"", ":", " \"", "Paris", " France", "\"", "}", "<|im_end|>"];
// A tiny grammar for {"city": "<words>"} as a state machine over token strings.
const ALLOWED: Record<number, string[]> = {
  0: ["{"], 1: ["\"city\""], 2: [":"], 3: [" \""], 4: ["Paris", " France"], 5: ["Paris", " France", "\""], 6: ["}"], 7: ["<|im_end|>"],
};
function nextState(s: number, tok: string) {
  if (s === 4) return 5;
  if (s === 5) return tok === "\"" ? 6 : 5;
  return s + 1;
}
// What the (small, chatty) model "wants" at each state — hand-made logits.
const MODEL_LOGITS: Record<number, number[]> = {
  0: [2.0, 4.5, 0.2, 0, 0, 1.0, 0, 0, 0, 0.5],
  1: [0, 1.0, 3.0, 0.1, 0.2, 2.0, 0, 0.5, 0, 0],
  2: [0, 0.5, 0, 4.0, 0.5, 0, 0, 0.2, 0.3, 0],
  3: [0, 0, 0, 0.3, 3.5, 2.5, 0, 0, 0, 0],
  4: [0, 0.4, 0, 0, 0, 4.0, 1.5, 0.5, 0, 0.3],
  5: [0, 0.2, 0, 0, 0, 0.5, 2.0, 3.5, 0.4, 1.0],
  6: [0, 0, 0, 0, 0, 0, 0, 0.3, 3.0, 2.5],
  7: [0, 0, 0, 0, 0, 0, 0, 0, 0.5, 4.0],
};

function GrammarViz() {
  const [on, setOn] = useState<"on" | "off">("on");
  const [steps, setSteps] = useState(0);
  // replay greedy decoding for `steps` steps
  const trace = useMemo(() => {
    let s = 0;
    const out: { state: number; pick: number }[] = [];
    for (let k = 0; k < steps; k++) {
      const logits = MODEL_LOGITS[Math.min(s, 7)];
      const allowed = (i: number) => on === "off" || ALLOWED[Math.min(s, 7)].includes(VOCAB[i]);
      let best = -1;
      logits.forEach((l, i) => { if (allowed(i) && (best < 0 || l > logits[best])) best = i; });
      out.push({ state: s, pick: best });
      s = on === "on" ? nextState(s, VOCAB[best]) : s + 1;
      if (VOCAB[best] === "<|im_end|>" || s > 8) break;
    }
    return { out, state: s };
  }, [steps, on]);
  const cur = Math.min(trace.state, 7);
  const done = trace.out.length > 0 && VOCAB[trace.out[trace.out.length - 1].pick] === "<|im_end|>";
  const logits = MODEL_LOGITS[cur];
  return (
    <Viz title="Constrained decoding: force valid JSON" hint='Goal: output {"city": "..."}. Step the decoder. With the grammar ON, tokens that would break the format are masked to −∞ before sampling.'>
      <div className="controls">
        <div><span className="small muted">grammar </span><Seg options={["on", "off"] as const} value={on} onChange={(v) => { setOn(v); setSteps(0); }} /></div>
        <button className="btn primary" disabled={done || steps > 10} onClick={() => setSteps(steps + 1)}>Generate next token</button>
        <button className="btn" onClick={() => setSteps(0)}>Reset</button>
      </div>
      <div className="mono" style={{ background: "var(--code-bg)", border: "1px solid var(--border)", borderRadius: 8, padding: 10, minHeight: 40, whiteSpace: "pre" }}>
        {trace.out.map((t, i) => <span key={i} style={{ background: `var(--c${(i % 6) + 1}-soft)`, borderRadius: 3 }}>{VOCAB[t.pick]}</span>)}
        <span style={{ opacity: 0.4 }}>▌</span>
      </div>
      {!done && (
        <Svg w={740} h={VOCAB.length * 22 + 10} label="mask">
          {VOCAB.map((v, i) => {
            const ok = on === "off" || ALLOWED[cur].includes(v);
            return (
              <g key={v}>
                <text x={120} y={i * 22 + 18} fontSize={12} textAnchor="end" className="mono" fill={ok ? "var(--text)" : "var(--muted)"}>{v}</text>
                <rect x={130} y={i * 22 + 6} width={logits[i] * 70 + 2} height={15} rx={3} fill={ok ? "var(--c3)" : "var(--c5)"} fillOpacity={ok ? 0.8 : 0.25} />
                <text x={140 + logits[i] * 70} y={i * 22 + 18} fontSize={11} fill="var(--muted)">{ok ? `logit ${logits[i]}` : `logit ${logits[i]} → −∞ (masked)`}</text>
              </g>
            );
          })}
        </Svg>
      )}
      <div className="caption">
        Without the grammar, our small model starts with "Sure" (it loves to chat) and the JSON is broken. With it, the model can only choose
        among valid continuations — the output is valid by construction, and still uses the model's preferences inside the allowed set.
      </div>
    </Viz>
  );
}

/* ---------------- pipeline diagram ---------------- */

function PipelineDiagram() {
  const items: [string, string, 1 | 2 | 3 | 4 | 5 | 6][] = [
    ["logits", "[151936]", 1], ["penalties", "repeat/presence", 5], ["grammar mask", "−∞ if invalid", 6],
    ["÷ temperature", "", 2], ["softmax", "→ probabilities", 4], ["top-k/p, min-p", "cut the tail", 5], ["draw", "seeded RNG", 3],
  ];
  return (
    <Svg w={740} h={90} label="sampling pipeline">
      {items.map(([l, s, c], i) => (
        <g key={l}>
          <Box x={4 + i * 105} y={18} w={92} h={52} label={<tspan fontSize={12}>{l}</tspan>} sub={s} color={c} />
          {i < items.length - 1 && <Arrow x1={96 + i * 105} y1={44} x2={109 + i * 105} y2={44} />}
        </g>
      ))}
    </Svg>
  );
}

const STOP_STEPS = [
  { title: "The model generates text token by token", body: <p className="mono">Answer: 42\n</p> },
  { title: "Stop sequence '\\n\\n' may be split across tokens", body: <p>Next token is <code>"\n"</code>. The text now ends with <code>"\n\n"</code>, but that came from two tokens. We must check the <b>decoded text tail</b>, not single token ids.</p> },
  { title: "Hold back text that might be the start of a stop sequence", body: <p>When text ends with <code>"\n"</code> (a prefix of the stop sequence), the streamer waits before sending it to the client. If the next token completes the stop sequence → stop and never send it. If not → flush the held text.</p> },
  { title: "Finish", body: <p>We return <code>finish_reason: "stop"</code>. Other reasons: <code>"length"</code> (hit max_tokens), <code>"tool_calls"</code>. The EOS token <code>&lt;|im_end|&gt;</code> is also a stop and is never shown to the user.</p> },
];

/* ---------------- Page ---------------- */

export default function Page() {
  return (
    <>
      <PageHeader
        kicker="LLMs · Lesson 4"
        title="Sampling: picking the next token"
        subtitle="The model gives a score to all 151,936 tokens. The sampler decides which one we actually output."
        learn={[
          "Logits and softmax; what temperature really does",
          "Greedy vs random sampling; top-k, top-p (nucleus) and min-p filters",
          "Seeded random numbers: why the same seed gives the same answer",
          "Repetition penalties and stop sequences",
          "Constrained decoding: forcing valid JSON for tool calls",
        ]}
      />

      <Section title="1. From logits to probabilities">
        <p>
          The last layer outputs one number per vocabulary token: a <b>logit</b>. Higher means "more likely next". Logits can be any real number,
          so we convert them into probabilities with <b>softmax</b>: exponentiate each, then divide by the sum. Now every value is positive and they sum to 1.
        </p>
        <p><b>Temperature</b> divides the logits before softmax. Small T exaggerates differences (confident, repetitive). Large T shrinks differences (creative, random).</p>
        <TempCurve />
        <Callout kind="deep">
          <p>Real code subtracts the max logit before <code>exp</code>: <code>exp(x − max)</code>. The result is identical, but it avoids overflow —
            <code>exp(100)</code> does not fit in an f32. You will see this "safe softmax" trick again inside the attention kernel.</p>
        </Callout>
      </Section>

      <Section title="2. The sampler pipeline">
        <p>Each step runs the same pipeline on the logits of the last token:</p>
        <PipelineDiagram />
        <ul>
          <li><b>Greedy</b> = always take the highest. Deterministic, but tends to loop ("the the the…") and sounds dull.</li>
          <li><b>top-k</b> = keep only the k most likely tokens.</li>
          <li><b>top-p (nucleus)</b> = keep the smallest set of top tokens whose probabilities add up to p (e.g. 0.9). Adapts: few tokens when the model is sure, many when it is unsure.</li>
          <li><b>min-p</b> = drop tokens with probability below <code>min_p × p(best)</code>. Simple and works well at high temperature.</li>
        </ul>
        <SamplerLab />
        <Quiz
          q="The model is very sure: p(' Paris') = 0.97. With top-p = 0.9, how many tokens survive?"
          options={["Exactly 1", "About 10", "It depends on temperature only"]}
          answer={0}
          explain="The first token alone already reaches 0.9 cumulative probability, so the nucleus contains only ' Paris'. Top-p adapts to the model's confidence."
        />
      </Section>

      <Section title="3. Randomness you can repeat: seeded PRNG">
        <p>
          Computers make "random" numbers with a <b>pseudo-random number generator</b> (PRNG): a tiny state that is scrambled by a formula each call.
          The same starting state (<b>seed</b>) always produces the same sequence. If the user sends <code>seed: 42</code>, we can reproduce their answer exactly
          — great for debugging and tests.
        </p>
        <Code title="kiln-engine/src/sample/rng.rs — PCG32, ~10 lines">{`
/// PCG32: small, fast, good-quality PRNG. Same seed => same numbers, on every machine.
pub struct Pcg32 { state: u64, inc: u64 }

impl Pcg32 {
    pub fn new(seed: u64) -> Self {
        let mut r = Pcg32 { state: 0, inc: (seed << 1) | 1 };
        r.next_u32(); r.state = r.state.wrapping_add(seed); r.next_u32();
        r
    }
    pub fn next_u32(&mut self) -> u32 {
        let old = self.state;
        self.state = old.wrapping_mul(6364136223846793005).wrapping_add(self.inc);
        let xorshifted = (((old >> 18) ^ old) >> 27) as u32;
        let rot = (old >> 59) as u32;
        xorshifted.rotate_right(rot)
    }
    /// uniform float in [0, 1)
    pub fn next_f32(&mut self) -> f32 { (self.next_u32() >> 8) as f32 / (1u32 << 24) as f32 }
}
`}</Code>
        <Callout kind="rust">
          <p><code>wrapping_mul</code> / <code>wrapping_add</code>: in Rust, normal <code>*</code> and <code>+</code> panic on overflow in debug builds. A PRNG <i>wants</i> overflow
            (math modulo 2⁶⁴), so we say so explicitly. Rust makes you state your intent.</p>
        </Callout>
        <Callout kind="warn">
          <p>Same seed gives the same answer only if the logits are bit-identical. Batching with different neighbors or a different GPU kernel can change
            the last bits of floating-point sums, and then a different token may win. Providers call seeds "best effort" for this reason.</p>
        </Callout>
      </Section>

      <Section title="4. Repetition penalties and stop sequences">
        <p>
          Small models love to repeat themselves. A <b>repetition penalty</b> lowers the logits of tokens already generated (divide positive logits by the penalty).
          OpenAI-style APIs also have <code>presence_penalty</code> (subtract a constant if the token appeared at all) and <code>frequency_penalty</code> (subtract per occurrence).
          Try the penalty slider in the lab above: " Paris" was already generated, so it loses probability.
        </p>
        <Stepper title="Stop sequences, done correctly" steps={STOP_STEPS} />
      </Section>

      <Section title="5. Constrained decoding (grammars)">
        <p>
          For tool calls the output <b>must</b> be valid JSON matching a schema. A 4B model makes mistakes. Instead of hoping, we <b>enforce</b> it:
          a state machine tracks where we are in the JSON, and before sampling we set the logit of every token that would break the grammar to −∞.
        </p>
        <GrammarViz />
        <Callout kind="deep">
          <p>The hard part in real life is speed: checking 151,936 tokens against the grammar each step is slow. Engines precompute, for each grammar state,
            which tokens are valid (a bitmask), and handle tokens that span several grammar symbols (e.g. <code>{"\"}"}</code>). This is a fun project
            for <code>kiln-engine::grammar</code>.</p>
        </Callout>
        <Quiz
          q="Why apply the grammar mask BEFORE temperature and top-p, not after?"
          options={[
            "It does not matter",
            "So that probability mass is redistributed only among valid tokens; filtering after could leave zero valid tokens",
            "Because temperature changes the grammar",
          ]}
          answer={1}
          explain="If top-p first kept only invalid tokens, masking afterwards would leave nothing. Mask first, then all later steps work on valid tokens only."
        />
      </Section>

      <Section title="6. Our sampler in Rust">
        <Code title="kiln-engine/src/sample/mod.rs">{`
pub struct SamplingParams {
    pub temperature: f32, pub top_k: usize, pub top_p: f32, pub min_p: f32,
    pub repetition_penalty: f32,
}

/// Pick the next token from one row of logits. \`mask\` comes from the grammar (if any).
pub fn sample(logits: &mut [f32], p: &SamplingParams, recent: &[u32],
              mask: Option<&BitSet>, rng: &mut Pcg32) -> u32 {
    // 1. penalties
    for &t in recent {
        let l = &mut logits[t as usize];
        *l = if *l > 0.0 { *l / p.repetition_penalty } else { *l * p.repetition_penalty };
    }
    // 2. grammar mask
    if let Some(m) = mask {
        for (i, l) in logits.iter_mut().enumerate() { if !m.contains(i) { *l = f32::NEG_INFINITY; } }
    }
    // 3. greedy shortcut
    if p.temperature <= 1e-5 { return argmax(logits); }

    // 4. temperature + safe softmax over the top candidates only (sorting 151k floats is slow)
    let mut cand: Vec<(u32, f32)> = top_n(logits, p.top_k.max(1).min(1024));   // sorted, best first
    let max = cand[0].1;
    let mut sum = 0.0;
    for (_, l) in cand.iter_mut() { *l = ((*l - max) / p.temperature).exp(); sum += *l; }
    for (_, l) in cand.iter_mut() { *l /= sum; }

    // 5. min-p and top-p cut
    let floor = p.min_p * cand[0].1;
    let mut cum = 0.0;
    let mut keep = 0;
    for (_, pr) in &cand {
        if keep > 0 && (cum >= p.top_p || *pr < floor) { break; }
        cum += pr; keep += 1;
    }
    cand.truncate(keep);

    // 6. draw: walk the cumulative distribution until we pass a uniform random number
    let u = rng.next_f32() * cum;
    let mut acc = 0.0;
    for &(tok, pr) in &cand { acc += pr; if u < acc { return tok; } }
    cand.last().unwrap().0
}
`}</Code>
        <Callout kind="kiln">
          <p>Sampling parameters come straight from the API request (<code>temperature</code>, <code>top_p</code>, <code>seed</code>, <code>stop</code>, <code>response_format</code>).
            Each sequence in a batch has its own params and its own <code>Pcg32</code>, so users never affect each other's randomness.
            In the GPU version, temperature + softmax + top-k run in a CUDA kernel, and only ~1,000 candidates are copied back to the CPU.</p>
        </Callout>
      </Section>

      <Recap items={[
        "Logits → (penalties, grammar mask) → ÷ temperature → softmax → top-k / top-p / min-p → random draw.",
        "Temperature controls sharpness; top-p and min-p cut the unlikely tail adaptively.",
        "A seeded PRNG (PCG32) makes sampling reproducible — as long as the logits are bit-identical.",
        "Stop sequences must be checked on decoded text, holding back possible prefixes while streaming.",
        "Constrained decoding masks invalid tokens to −∞, so JSON tool calls are valid by construction.",
      ]} />
    </>
  );
}
