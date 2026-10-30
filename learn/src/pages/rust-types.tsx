import { useState } from "react";
import { PageHeader, Section, Callout, Code, Viz, Seg, Quiz, Recap, Svg, Box, Arrow } from "../components/ui";

/* ---------- Enum memory layout ---------- */

type Variant = "Delta" | "Finished" | "Error";
function EnumLayout() {
  const [v, setV] = useState<Variant>("Delta");
  // Simple model: 8 bytes for tag (1 byte + 7 padding), then 24 bytes of payload.
  const cells: { label: string; color: number; span: number }[] = [{ label: "tag", color: 2, span: 1 }, { label: "pad", color: 0, span: 7 }];
  if (v === "Delta") cells.push({ label: "ptr", color: 1, span: 8 }, { label: "len", color: 1, span: 8 }, { label: "cap", color: 1, span: 8 });
  if (v === "Finished") cells.push({ label: "input u32", color: 3, span: 4 }, { label: "cached u32", color: 3, span: 4 }, { label: "output u32", color: 3, span: 4 }, { label: "reason", color: 4, span: 1 }, { label: "unused", color: 0, span: 11 });
  if (v === "Error") cells.push({ label: "code u16", color: 5, span: 2 }, { label: "unused", color: 0, span: 22 });
  const tagValue = { Delta: 0, Finished: 1, Error: 2 }[v];
  let x = 20;
  const unit = 21;
  return (
    <Viz title="What an enum looks like in memory" hint="Pick a variant. One GenerateEvent value is always the same size: a tag (which variant?) + room for the biggest variant.">
      <Seg options={["Delta", "Finished", "Error"] as const} value={v} onChange={setV} />
      <Svg w={720} h={130} label="enum layout">
        {cells.map((c, i) => {
          const w = c.span * unit;
          const el = (
            <g key={v + i} className="fade-in">
              <rect x={x} y={30} width={w - 2} height={44} rx={4}
                fill={c.color ? `var(--c${c.color}-soft)` : "var(--panel-2)"} stroke={c.color ? `var(--c${c.color})` : "var(--border)"}
                strokeDasharray={c.color ? undefined : "3 3"} />
              <text x={x + w / 2 - 1} y={57} textAnchor="middle" fontSize={c.span < 3 ? 9 : 11} fill="var(--text)" fontFamily="var(--mono)">{c.label}</text>
            </g>
          );
          x += w;
          return el;
        })}
        {[0, 8, 16, 24, 32].map((b) => (
          <text key={b} x={20 + b * unit} y={92} fontSize={10} fill="var(--muted)" textAnchor="middle" fontFamily="var(--mono)">{b}</text>
        ))}
        <text x={20} y={20} fontSize={12} fill="var(--muted)">tag = {tagValue} → "this is {v}"</text>
        <text x={20} y={118} fontSize={11} fill="var(--muted)">byte offset · total 32 bytes in this simple model</text>
      </Svg>
      <p className="small">
        {v === "Delta" && "Delta holds a String: its 24-byte header (pointer to heap text, length, capacity). The text itself is on the heap."}
        {v === "Finished" && "Finished holds the usage counts and a small FinishReason enum (1 byte). The remaining bytes are unused but still reserved."}
        {v === "Error" && "Error only needs 2 bytes, but the value is still 32 bytes, because every GenerateEvent must fit any variant."}
      </p>
    </Viz>
  );
}

/* ---------- Result + ? flow ---------- */

const STEPS = [
  { fn: "parse_bearer(header)?", err: "AuthError::MissingKey", http: "401 invalid_api_key", ok: "\"sk-live-a1b2...\"" },
  { fn: "lookup_key(&hash).await?", err: "AuthError::UnknownKey", http: "401 invalid_api_key", ok: "KeyRecord { project, org, .. }" },
  { fn: "ensure_active(&record)?", err: "AuthError::Revoked", http: "401 invalid_api_key", ok: "()" },
  { fn: "limits.take(&record, cost)?", err: "LimitError::RateLimited { retry_after: 3 }", http: "429 rate_limit_error", ok: "Decision::Allowed" },
];

function ResultFlow() {
  const [fail, setFail] = useState<number | null>(null);
  return (
    <Viz title="How ? short-circuits errors" hint="Click a step to make it fail. Watch where the function stops and what the client receives.">
      <div className="controls">
        <button className={`btn ${fail === null ? "primary" : ""}`} onClick={() => setFail(null)}>everything works</button>
        {STEPS.map((s, i) => (
          <button key={i} className={`btn ${fail === i ? "primary" : ""}`} onClick={() => setFail(i)}>fail step {i + 1}</button>
        ))}
      </div>
      <Svg w={720} h={290} label="result flow">
        {STEPS.map((s, i) => {
          const y = 14 + i * 60;
          const reached = fail === null || i <= fail;
          const failed = fail === i;
          return (
            <g key={i} opacity={reached ? 1 : 0.3}>
              <rect x={20} y={y} width={300} height={42} rx={7}
                fill={failed ? "var(--c5-soft)" : reached ? "var(--c3-soft)" : "var(--panel-2)"}
                stroke={failed ? "var(--c5)" : reached ? "var(--c3)" : "var(--border)"} strokeWidth={1.5} />
              <text x={34} y={y + 26} fontSize={12} fontFamily="var(--mono)" fill="var(--text)">{s.fn}</text>
              {reached && !failed && <text x={330} y={y + 26} fontSize={11} fontFamily="var(--mono)" fill="var(--c3)">Ok({s.ok})</text>}
              {failed && (
                <g className="fade-in">
                  <text x={330} y={y + 18} fontSize={11} fontFamily="var(--mono)" fill="var(--c5)">Err({s.err})</text>
                  <text x={330} y={y + 34} fontSize={11} fill="var(--c5)">? returns early → {s.http}</text>
                </g>
              )}
              {i < STEPS.length - 1 && <line x1={170} y1={y + 42} x2={170} y2={y + 58} stroke="var(--muted)" markerEnd="url(#arrow)" />}
            </g>
          );
        })}
        <g opacity={fail === null ? 1 : 0.3}>
          <rect x={20} y={254} width={300} height={30} rx={7} fill={fail === null ? "var(--c1-soft)" : "var(--panel-2)"} stroke="var(--c1)" />
          <text x={34} y={274} fontSize={12} fontFamily="var(--mono)" fill="var(--text)">Ok(AuthedRequest) → schedule it</text>
        </g>
      </Svg>
    </Viz>
  );
}

/* ---------- static vs dynamic dispatch ---------- */

function DispatchPicture() {
  return (
    <Svg w={720} h={200} label="static vs dynamic dispatch">
      <text x={20} y={20} fontSize={12} fontWeight={700} fill="var(--muted)">GENERICS (static dispatch)</text>
      <Box x={20} y={34} w={150} h={46} label="serve::<CpuEngine>" color={1} />
      <Box x={20} y={92} w={150} h={46} label="serve::<CudaEngine>" color={1} />
      <text x={20} y={164} fontSize={11} fill="var(--muted)">compiler makes one copy per type.</text>
      <text x={20} y={180} fontSize={11} fill="var(--muted)">Calls are direct and can be inlined.</text>
      <text x={380} y={20} fontSize={12} fontWeight={700} fill="var(--muted)">dyn TRAIT (dynamic dispatch)</text>
      <Box x={380} y={34} w={130} h={58} label="Box<dyn Engine>" sub="data ptr + vtable ptr" color={4} />
      <Box x={560} y={20} w={140} h={40} label="CudaEngine data" color={3} />
      <Box x={560} y={74} w={140} h={60} label="vtable" sub="generate → 0x7f3a…, drop …" color={2} />
      <Arrow x1={510} y1={52} x2={558} y2={40} />
      <Arrow x1={510} y1={70} x2={558} y2={100} />
      <text x={380} y={164} fontSize={11} fill="var(--muted)">one copy of the code. Each call looks up the</text>
      <text x={380} y={180} fontSize={11} fill="var(--muted)">function in the vtable (one extra pointer jump).</text>
    </Svg>
  );
}

export default function Page() {
  return (
    <>
      <PageHeader kicker="Rust · Lesson 3" title="Structs, enums, traits & errors"
        subtitle="How to model data in Rust, and how Rust handles errors without exceptions."
        learn={[
          "struct + impl: data and its methods",
          "enum: one value that can be one of several shapes, and match to handle each shape",
          "Option and Result: Rust's way to say 'maybe nothing' and 'maybe failed'",
          "The ? operator, and how Kiln turns errors into HTTP responses",
          "Traits (shared behaviour), generics vs dyn, iterators and closures",
        ]} />

      <Section title="Structs: grouping data">
        <p>A <b>struct</b> groups related values under one name, like a row in a table. <code>impl</code> adds functions ("methods") to it.</p>
        <Code title="usage.rs">{`
/// Token counts for one finished request.
#[derive(Debug, Clone, Copy, Default)]   // auto-generate printing, copying, zero value
pub struct Usage {
    pub input_tokens: u32,
    pub cached_input_tokens: u32,
    pub output_tokens: u32,
}

impl Usage {
    /// An "associated function" (no self): called as Usage::new(..). Like a constructor.
    pub fn new(input: u32, output: u32) -> Self {
        Self { input_tokens: input, cached_input_tokens: 0, output_tokens: output }
    }

    /// A method: takes &self (read-only borrow of the struct).
    pub fn total(&self) -> u32 {
        self.input_tokens + self.output_tokens
    }

    /// &mut self: this method changes the struct.
    pub fn add_output(&mut self, n: u32) {
        self.output_tokens += n;
    }
}

fn main() {
    let mut u = Usage::new(1200, 0);
    u.add_output(1);                // one decoded token
    println!("{u:?} total={}", u.total());
    let zero = Usage::default();    // all fields 0, thanks to #[derive(Default)]
    let copy = Usage { output_tokens: 5, ..zero };   // "struct update": copy the rest
    println!("{copy:?}");
}
`}</Code>
        <Callout kind="rust">
          <code>#[derive(...)]</code> asks the compiler to write common code for you: <code>Debug</code> (printing with <code>{"{:?}"}</code>),
          <code>Clone</code>, <code>Copy</code>, <code>PartialEq</code> (<code>==</code>), <code>Default</code>, <code>Hash</code>.
          <code>pub</code> makes a field or function visible outside its module. Without <code>pub</code> it is private.
        </Callout>
      </Section>

      <Section title="Enums: one of several shapes">
        <p>An <b>enum</b> says "this value is exactly one of these options". Unlike enums in C or Java, each option can carry <b>its own data</b>.
          This is perfect for messages: a worker streams a sequence of events, and each event is one of three kinds.</p>
        <Code title="kiln-wire: events a worker sends while generating">{`
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum FinishReason {
    Stop,        // model produced the end-of-sequence token
    Length,      // hit max_tokens
    Cancelled,   // client went away
}

#[derive(Debug)]
pub enum GenerateEvent {
    Delta(String),                                    // a piece of text
    Finished { reason: FinishReason, usage: Usage },  // named fields
    Error { code: u16 },
}

fn to_sse(ev: &GenerateEvent) -> String {
    // match must handle EVERY variant. Add a 4th variant later and this
    // function stops compiling until you handle it. That is a feature.
    match ev {
        GenerateEvent::Delta(text) => format!("data: {{\\"delta\\":{text:?}}}\\n\\n"),
        GenerateEvent::Finished { reason, usage } => {
            format!("data: {{\\"finish\\":\\"{reason:?}\\",\\"out\\":{}}}\\n\\n", usage.output_tokens)
        }
        GenerateEvent::Error { code } if *code >= 500 => "event: error\\ndata: server\\n\\n".into(),
        GenerateEvent::Error { .. } => "event: error\\ndata: client\\n\\n".into(),
    }
}
`}</Code>
        <EnumLayout />
        <Callout kind="deep">
          The real compiler is smarter than this picture. A String's capacity can never use its highest bit, so Rust can store the tag
          inside those "impossible" values (the <b>niche optimization</b>). Then the enum may be only 24 bytes. You can always check with
          <code>std::mem::size_of::&lt;GenerateEvent&gt;()</code>. The same trick makes <code>{"Option<&T>"}</code> and <code>{"Option<Box<T>>"}</code> the same size as a plain pointer: <code>None</code> is stored as the null address.
        </Callout>
        <Quiz q="You add a new variant GenerateEvent::ToolCall { .. }. What happens to to_sse above?"
          options={["It silently ignores ToolCall", "It panics at runtime when a ToolCall arrives", "It no longer compiles until you add a match arm (or a _ catch-all)", "Nothing, enums are open"]} answer={2}
          explain="match must be exhaustive. The compiler lists the missing pattern (error E0004). This is why Kiln models protocol messages as enums: you cannot forget a case." />
      </Section>

      <Section title="Option: a value that may be missing">
        <p>Rust has <b>no null</b>. If something may be absent, its type says so: <code>{"Option<T>"}</code> is either <code>Some(value)</code> or <code>None</code>.
          You cannot use the value without first checking which one it is, so "null pointer exception" cannot happen.</p>
        <Code title="option.rs">{`
// Option is just an enum from the standard library:
// enum Option<T> { None, Some(T) }

fn find_model(id: &str) -> Option<&'static str> {
    match id {
        "qwen3-4b" | "default" => Some("worker-gpu"),
        "qwen3-1.7b" => Some("worker-cpu"),
        _ => None,
    }
}

fn main() {
    // 1. match: handle both cases explicitly
    match find_model("qwen3-4b") {
        Some(pool) => println!("route to {pool}"),
        None => println!("404 model_not_found"),
    }

    // 2. if let: when you only care about one case
    if let Some(pool) = find_model("default") {
        println!("default goes to {pool}");
    }

    // 3. helper methods
    let pool = find_model("gpt-9").unwrap_or("worker-cpu");   // fallback value
    let len = find_model("qwen3-4b").map(|p| p.len());        // Some(10)
    println!("{pool} {len:?}");

    // 4. unwrap(): "I am sure it is Some" — panics if None. Avoid in server code.
    // let p = find_model("nope").unwrap();   // would PANIC
}
`}</Code>
      </Section>

      <Section title="Result and the ? operator: errors as values">
        <p>Rust has <b>no exceptions</b>. A function that can fail returns <code>{"Result<T, E>"}</code>: either <code>Ok(value)</code> or <code>Err(error)</code>.
          The error is part of the function's type, so callers can see it and must handle it.</p>
        <p>Handling every error with <code>match</code> would be long. The <code>?</code> operator is a shortcut: <b>"if this is Err, return it from my function right now; if Ok, give me the value."</b></p>
        <Code title="gateway/src/auth.rs">{`
use thiserror::Error;     // a small crate that writes Display impls for error enums

#[derive(Debug, Error)]
pub enum AuthError {
    #[error("missing or malformed Authorization header")]
    MissingKey,
    #[error("unknown API key")]
    UnknownKey,
    #[error("API key was revoked")]
    Revoked,
    #[error("database error: {0}")]
    Db(#[from] DbError),   // #[from]: '?' converts a DbError into AuthError::Db automatically
}

pub async fn authenticate(header: Option<&str>, db: &Db) -> Result<KeyRecord, AuthError> {
    let key = parse_bearer(header)?;          // Err -> return Err(MissingKey) immediately
    let hash = sha256_hex(key);
    let record = db.find_key(&hash).await?    // Err(DbError) -> converted -> returned
        .ok_or(AuthError::UnknownKey)?;       // Option -> Result, then '?'
    if record.revoked_at.is_some() {
        return Err(AuthError::Revoked);
    }
    Ok(record)                                // success
}

fn parse_bearer(header: Option<&str>) -> Result<&str, AuthError> {
    header
        .and_then(|h| h.strip_prefix("Bearer "))
        .filter(|k| k.starts_with("sk-"))
        .ok_or(AuthError::MissingKey)
}
`}</Code>
        <ResultFlow />
        <Code title="turning errors into HTTP responses, in one place">{`
impl AuthError {
    pub fn status_and_code(&self) -> (u16, &'static str) {
        match self {
            AuthError::MissingKey | AuthError::UnknownKey | AuthError::Revoked => (401, "invalid_api_key"),
            AuthError::Db(_) => (500, "internal_error"),   // never leak DB details to the client
        }
    }
}
`}</Code>
        <Callout kind="rust" title="🦀 thiserror vs anyhow">
          <b>thiserror</b>: for libraries and anywhere callers need to react to <i>which</i> error happened (our <code>AuthError</code> enum maps each case to an HTTP code).
          <b> anyhow</b>: for the top of a binary (<code>main</code>, startup code) where you only want to print a good message: <code>{"anyhow::Result<()>"}</code>
          accepts any error and lets you add context: <code>{'load_model(path).context("loading qwen3-4b")?'}</code>.
        </Callout>
        <Callout kind="warn">
          <code>panic!</code>, <code>unwrap()</code> and <code>expect()</code> crash the current thread (or task). Use them only for "this is a bug, it can never happen"
          cases, never for things a user can cause (bad JSON, unknown key). A user must never be able to crash the gateway.
        </Callout>
        <Quiz q="Inside fn f() -> Result<u32, AuthError>, what does `let k = parse_bearer(h)?;` do when parse_bearer returns Err(MissingKey)?"
          options={["Panics", "Sets k to a default value", "Returns Err(MissingKey) from f immediately", "Retries parse_bearer"]} answer={2}
          explain="? unwraps Ok values and returns Err values early (after converting them with From if needed). The rest of f does not run." />
      </Section>

      <Section title="Traits: shared behaviour">
        <p>A <b>trait</b> describes what a type can <b>do</b>, without saying how. It is like an interface in Java or Go.
          Kiln uses traits at every boundary where we want to swap implementations: the engine (CPU vs CUDA vs a fake one for tests),
          and the rate-limit store (in-memory now, maybe Redis later).</p>
        <Code title="the two traits from our architecture">{`
/// Anything that can turn a request into a stream of events.
pub trait Engine: Send {
    /// Start generating. Events are pushed into 'tx' as tokens are produced.
    fn submit(&mut self, req: GenerateRequest, tx: EventSender) -> Result<SeqId, EngineError>;
    /// Stop a sequence early and free its KV blocks.
    fn cancel(&mut self, id: SeqId);
    /// Run one batched forward pass. Returns how many sequences are still running.
    fn step(&mut self) -> usize;
}

/// Where rate-limit buckets live.
pub trait LimitStore: Send + Sync {
    fn take(&self, bucket: &str, cost: u64, now_ms: u64) -> Decision;
}

pub enum Decision {
    Allowed { remaining: u64 },
    Denied { retry_after_ms: u64 },
}

/// One implementation: a fake engine that emits "hello" tokens. Used to build the
/// gateway before the real engine exists (the "mock-worker" in our plan).
pub struct MockEngine { next_id: u64 }

impl Engine for MockEngine {
    fn submit(&mut self, _req: GenerateRequest, tx: EventSender) -> Result<SeqId, EngineError> {
        self.next_id += 1;
        tx.send(GenerateEvent::Delta("hello".into()));
        Ok(SeqId(self.next_id))
    }
    fn cancel(&mut self, _id: SeqId) {}
    fn step(&mut self) -> usize { 0 }
}
`}</Code>
        <Callout kind="idea">
          Traits are also how Rust adds behaviour to existing types. <code>Display</code> (how to print), <code>Clone</code>, <code>Drop</code>,
          <code>Iterator</code>, <code>From</code>/<code>Into</code> (conversions), <code>Send</code>/<code>Sync</code> (thread safety) are all traits.
          When you see <code>{"impl Display for Usage"}</code>, read it as "here is how Usage can be printed".
        </Callout>
      </Section>

      <Section title="Generics vs dyn: two ways to use a trait">
        <Code title="dispatch.rs">{`
// 1. Generic: "E is some type that implements Engine". The compiler creates a
//    separate copy of this function for each concrete E it is used with.
fn run_loop<E: Engine>(engine: &mut E) {
    while engine.step() > 0 {}
}

// 2. Trait object: "some Engine, decided at runtime". One copy of the code;
//    calls go through a table of function pointers (the vtable).
fn pick_engine(use_gpu: bool) -> Box<dyn Engine> {
    if use_gpu { Box::new(CudaEngine::new()) } else { Box::new(CpuEngine::new()) }
}
`}</Code>
        <Viz title="What the compiler produces" hint="Left: monomorphization (one copy per type). Right: a fat pointer = data pointer + vtable pointer.">
          <DispatchPicture />
        </Viz>
        <table>
          <thead><tr><th></th><th>Generics <code>{"<E: Engine>"}</code></th><th><code>dyn Engine</code></th></tr></thead>
          <tbody>
            <tr><td>Speed</td><td>Fastest: direct call, can be inlined</td><td>One extra pointer jump per call, no inlining</td></tr>
            <tr><td>Binary size</td><td>Bigger (one copy per type)</td><td>Smaller</td></tr>
            <tr><td>Choose type at runtime?</td><td>No</td><td>Yes</td></tr>
            <tr><td>Kiln uses it for</td><td>Hot math loops: <code>{"matmul<T: Float>"}</code></td><td>Choosing the engine/store from config at startup</td></tr>
          </tbody>
        </table>
      </Section>

      <Section title="Closures and iterators">
        <p>A <b>closure</b> is a small anonymous function that can use variables around it: <code>{"|x| x * 2"}</code>.
          <b> Iterators</b> are chains of steps over a sequence. They look high-level, but the compiler turns them into plain loops, as fast as hand-written code ("zero-cost abstraction").</p>
        <Code title="iterators.rs — numbers from the sampler">{`
fn main() {
    let logits: Vec<f32> = vec![2.0, 0.5, 3.1, -1.0];
    let temperature = 0.7;

    // index of the largest logit (greedy decoding)
    let best = logits
        .iter()                                   // borrow each element
        .enumerate()                              // (index, &value)
        .max_by(|a, b| a.1.total_cmp(b.1))        // closure compares two items
        .map(|(i, _)| i);                         // keep only the index
    println!("{best:?}");                         // Some(2)

    // softmax with temperature: exp(x/t) / sum
    let max = logits.iter().copied().fold(f32::NEG_INFINITY, f32::max);
    let exps: Vec<f32> = logits.iter().map(|&x| ((x - max) / temperature).exp()).collect();
    let sum: f32 = exps.iter().sum();
    let probs: Vec<f32> = exps.iter().map(|e| e / sum).collect();
    println!("{probs:?}");

    // closures capture their environment
    let block_size = 16;
    let blocks_needed = |tokens: usize| tokens.div_ceil(block_size);
    println!("{}", blocks_needed(1000));          // 63
}
`}</Code>
        <Callout kind="rust">
          Iterators are <b>lazy</b>: <code>.map(...)</code> does nothing until something consumes it (<code>collect</code>, <code>sum</code>, <code>for</code>).
          <code>collect()</code> needs to know the target type, which is why you often see <code>{"let v: Vec<_> = ...collect();"}</code>.
        </Callout>
        <Quiz q="Why does Kiln use `fn run_loop<E: Engine>` (generic) in the worker's hot loop instead of Box<dyn Engine>?"
          options={["dyn is not allowed in loops", "Generics allow direct calls and inlining, which matters when called thousands of times per second", "Box is always slower to allocate", "Generics use less memory"]} answer={1}
          explain="Static dispatch lets the compiler see the concrete code and optimise across the call. For something called once at startup, dyn is fine; for hot paths, generics win." />
      </Section>

      <Section title="Modules: organising code">
        <Code title="crates/gateway/src/ layout">{`
// main.rs
mod auth;           // loads src/auth.rs
mod limits;         // loads src/limits.rs (or src/limits/mod.rs)
mod sse;

use auth::authenticate;            // bring a name into scope
use common::usage::Usage;          // from another crate in the workspace

// Visibility:
// pub          -> visible everywhere
// pub(crate)   -> visible in this crate only
// (nothing)    -> private to this module and its children
`}</Code>
      </Section>

      <Recap items={[
        "struct groups data; impl adds methods. &self reads, &mut self changes, self consumes.",
        "enum = one of several shapes, each with its own data. match must handle every shape.",
        "An enum's size = tag + its largest variant (the compiler sometimes hides the tag in unused bits).",
        "Option<T> replaces null. Result<T, E> replaces exceptions. ? returns errors early.",
        "Kiln maps typed errors (thiserror enums) to HTTP status codes in one place; anyhow is for top-level binaries.",
        "Traits define behaviour. Engine and LimitStore are traits so we can swap implementations.",
        "Generics = fast static dispatch; dyn Trait = flexible runtime choice via a vtable.",
        "Iterators and closures compile down to plain loops.",
      ]} />
    </>
  );
}
