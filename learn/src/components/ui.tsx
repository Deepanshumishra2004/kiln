// Shared building blocks for every lesson page.
// Pages should only need: PageHeader, Section, Callout, Code, Viz, Slider, Seg,
// Stepper, Quiz, Recap, Svg (+ Arrow/Box helpers). Keep pages consistent by using these.

import { ReactNode, useState } from "react";

/* ---------- Page structure ---------- */

export function PageHeader(props: {
  kicker: string;          // e.g. "Rust · Lesson 2"
  title: string;
  subtitle?: string;
  learn?: string[];        // "What you will learn" bullet list
}) {
  return (
    <header className="page-header">
      <div className="kicker">{props.kicker}</div>
      <h1>{props.title}</h1>
      {props.subtitle && <div className="subtitle">{props.subtitle}</div>}
      {props.learn && (
        <div className="learn-box">
          <strong>What you will learn</strong>
          <ul>{props.learn.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </div>
      )}
    </header>
  );
}

export function Section(props: { title: string; id?: string; children: ReactNode }) {
  return (
    <section id={props.id}>
      <h2>{props.title}</h2>
      {props.children}
    </section>
  );
}

const CALLOUT_TITLES = {
  idea: "💡 Key idea",
  analogy: "🧭 Analogy",
  warn: "⚠️ Watch out",
  rust: "🦀 Rust note",
  deep: "🔬 Under the hood",
  kiln: "🔥 In Kiln",
} as const;

export function Callout(props: { kind: keyof typeof CALLOUT_TITLES; title?: string; children: ReactNode }) {
  return (
    <div className={`callout ${props.kind}`}>
      <div className="callout-title">{props.title ?? CALLOUT_TITLES[props.kind]}</div>
      <div>{props.children}</div>
    </div>
  );
}

export function Recap(props: { items: ReactNode[] }) {
  return (
    <div className="recap">
      <strong>Recap</strong>
      <ul>{props.items.map((t, i) => <li key={i}>{t}</li>)}</ul>
    </div>
  );
}

/* ---------- Code with tiny syntax highlighter ---------- */

const KW = {
  rust: "fn let mut pub struct enum impl trait for in if else match loop while return use mod crate self Self super as where async await move ref const static unsafe extern type dyn true false break continue Some None Ok Err",
  ts: "function const let var return if else for while import export from default class new type interface async await true false null undefined of in",
  c: "__global__ __shared__ __device__ __syncthreads void int float half const return if else for while struct unsigned char",
};

type Lang = "rust" | "ts" | "c" | "text" | "http" | "toml";

function highlight(src: string, lang: Lang): ReactNode[] {
  if (lang === "text" || lang === "http") return [src];
  const kws = new Set((KW[lang as keyof typeof KW] ?? KW.rust).split(" "));
  const re = /(\/\/[^\n]*|#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])'|\b\d[\d_]*(?:\.\d+)?(?:e-?\d+)?(?:[iuf](?:8|16|32|64|128|size))?\b|\b[A-Za-z_][A-Za-z0-9_]*!?)/g;
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push(src.slice(last, m.index));
    const t = m[0];
    let cls = "";
    if (t.startsWith("//")) cls = "tok-com";
    else if (t.startsWith("#")) cls = lang === "toml" || lang === "c" ? "tok-com" : "tok-mac";
    else if (t.startsWith('"') || t.startsWith("'")) cls = "tok-str";
    else if (/^\d/.test(t)) cls = "tok-num";
    else if (t.endsWith("!")) cls = "tok-mac";
    else if (kws.has(t)) cls = "tok-kw";
    else if (/^[A-Z]/.test(t)) cls = "tok-type";
    else if (src[re.lastIndex] === "(") cls = "tok-fn";
    out.push(cls ? <span key={k++} className={cls}>{t}</span> : t);
    last = re.lastIndex;
  }
  if (last < src.length) out.push(src.slice(last));
  return out;
}

export function Code(props: { children: string; lang?: Lang; title?: string }) {
  const lang = props.lang ?? "rust";
  const src = props.children.replace(/^\n/, "").replace(/\s+$/, "");
  return (
    <div className="code">
      {props.title && <div className="code-title"><span>{props.title}</span><span>{lang}</span></div>}
      <pre><code style={{ background: "none", padding: 0 }}>{highlight(src, lang)}</code></pre>
    </div>
  );
}

/* ---------- Interactive panel + controls ---------- */

export function Viz(props: { title: string; hint?: string; children: ReactNode; caption?: ReactNode }) {
  return (
    <div className="viz">
      <div className="viz-title">{props.title}</div>
      {props.hint && <div className="viz-hint">{props.hint}</div>}
      {props.children}
      {props.caption && <div className="caption">{props.caption}</div>}
    </div>
  );
}

export function Slider(props: {
  label: string; value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void; format?: (v: number) => string;
}) {
  return (
    <div className="slider">
      <label>{props.label} <b>{props.format ? props.format(props.value) : props.value}</b></label>
      <input type="range" min={props.min} max={props.max} step={props.step ?? 1} value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))} />
    </div>
  );
}

export function Seg<T extends string>(props: { options: readonly T[]; value: T; onChange: (v: T) => void; labels?: Record<T, string> }) {
  return (
    <div className="seg">
      {props.options.map((o) => (
        <button key={o} className={o === props.value ? "on" : ""} onClick={() => props.onChange(o)}>
          {props.labels?.[o] ?? o}
        </button>
      ))}
    </div>
  );
}

/** Step-through explainer. Each step renders its own content (usually an SVG + text). */
export function Stepper(props: { steps: { title: string; body: ReactNode }[]; title?: string; hint?: string }) {
  const [i, setI] = useState(0);
  const s = props.steps[i];
  return (
    <div className="viz">
      {props.title && <div className="viz-title">{props.title}</div>}
      {props.hint && <div className="viz-hint">{props.hint}</div>}
      <div className="fade-in" key={i}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>{i + 1}. {s.title}</div>
        {s.body}
      </div>
      <div className="stepper-nav">
        <button className="btn" disabled={i === 0} onClick={() => setI(i - 1)}>← Back</button>
        <button className="btn primary" disabled={i === props.steps.length - 1} onClick={() => setI(i + 1)}>Next →</button>
        <div className="dots">
          {props.steps.map((_, j) => <button key={j} className={`dot ${j <= i ? "on" : ""}`} onClick={() => setI(j)} aria-label={`step ${j + 1}`} />)}
        </div>
        <span className="step-label">step {i + 1} / {props.steps.length}</span>
      </div>
    </div>
  );
}

export function Quiz(props: { q: string; options: string[]; answer: number; explain: ReactNode }) {
  const [pick, setPick] = useState<number | null>(null);
  return (
    <div className="quiz">
      <div className="q">🧠 Check yourself: {props.q}</div>
      {props.options.map((o, i) => {
        let cls = "opt";
        if (pick !== null && i === props.answer) cls += " right";
        else if (pick === i) cls += " wrong";
        return <button key={i} className={cls} onClick={() => setPick(i)}>{o}</button>;
      })}
      {pick !== null && <div className="explain fade-in">{pick === props.answer ? "✅ Correct. " : "❌ Not quite. "}{props.explain}</div>}
    </div>
  );
}

/* ---------- SVG helpers ---------- */

/** SVG canvas with an arrowhead marker (use markerEnd="url(#arrow)"). */
export function Svg(props: { w: number; h: number; children: ReactNode; label?: string }) {
  return (
    <svg viewBox={`0 0 ${props.w} ${props.h}`} width={props.w} role="img" aria-label={props.label}>
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--muted)" />
        </marker>
        <marker id="arrow-accent" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)" />
        </marker>
      </defs>
      {props.children}
    </svg>
  );
}

/** Rounded labelled box. color = 1..6 (categorical palette) or undefined for neutral. */
export function Box(props: {
  x: number; y: number; w: number; h: number; label: ReactNode; sub?: string;
  color?: 1 | 2 | 3 | 4 | 5 | 6; active?: boolean; dim?: boolean; onClick?: () => void;
}) {
  const stroke = props.color ? `var(--c${props.color})` : "var(--border)";
  const fill = props.color ? `var(--c${props.color}-soft)` : "var(--panel-2)";
  return (
    <g onClick={props.onClick} style={{ cursor: props.onClick ? "pointer" : undefined, opacity: props.dim ? 0.35 : 1, transition: "opacity .2s" }}>
      <rect x={props.x} y={props.y} width={props.w} height={props.h} rx={8}
        fill={fill} stroke={props.active ? "var(--accent)" : stroke} strokeWidth={props.active ? 3 : 1.5} />
      <text x={props.x + props.w / 2} y={props.y + props.h / 2 + (props.sub ? -3 : 5)} textAnchor="middle"
        fontSize={14} fontWeight={600} fill="var(--text)">{props.label}</text>
      {props.sub && <text x={props.x + props.w / 2} y={props.y + props.h / 2 + 14} textAnchor="middle" fontSize={11} fill="var(--muted)">{props.sub}</text>}
    </g>
  );
}

export function Arrow(props: { x1: number; y1: number; x2: number; y2: number; label?: string; accent?: boolean; dashed?: boolean }) {
  const mx = (props.x1 + props.x2) / 2, my = (props.y1 + props.y2) / 2;
  return (
    <g>
      <line x1={props.x1} y1={props.y1} x2={props.x2} y2={props.y2}
        stroke={props.accent ? "var(--accent)" : "var(--muted)"} strokeWidth={props.accent ? 2.5 : 1.5}
        strokeDasharray={props.dashed ? "5 4" : undefined}
        markerEnd={props.accent ? "url(#arrow-accent)" : "url(#arrow)"} />
      {props.label && <text x={mx + 4} y={my - 5} fontSize={11} fill="var(--muted)">{props.label}</text>}
    </g>
  );
}
