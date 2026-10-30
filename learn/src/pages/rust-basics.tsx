import { useState } from "react";
import { PageHeader, Section, Callout, Code, Viz, Slider, Seg, Stepper, Quiz, Recap, Svg, Box, Arrow } from "../components/ui";

/* ---------- Integer / number type explorer ---------- */

type NumType = "u8" | "u16" | "u32" | "u64" | "i8" | "i16" | "i32" | "i64" | "f32" | "usize";
const TYPES: readonly NumType[] = ["u8", "u16", "u32", "u64", "i8", "i16", "i32", "i64", "f32", "usize"];

const TYPE_INFO: Record<NumType, { bits: number; signed: boolean; float?: boolean; kiln: string }> = {
  u8: { bits: 8, signed: false, kiln: "One raw byte. Model files, network frames and UTF-8 text are all lists of u8 (Vec<u8>)." },
  u16: { bits: 16, signed: false, kiln: "Small counters, e.g. an error code inside a wire frame." },
  u32: { bits: 32, signed: false, kiln: "Token ids (Qwen3 vocabulary is ~151k, which fits in u32 but not u16). Frame length prefix." },
  u64: { bits: 64, signed: false, kiln: "Big counters: total tokens served, credit in micro-dollars, stream ids, byte offsets in the event log." },
  i8: { bits: 8, signed: true, kiln: "Quantized weights: a 4-bit or 8-bit weight is a small signed integer times a scale." },
  i16: { bits: 16, signed: true, kiln: "Rare for us. Sometimes used for intermediate sums in quantized math." },
  i32: { bits: 32, signed: true, kiln: "Default integer type when you write `let x = 5;`. Used where a value can be negative." },
  i64: { bits: 64, signed: true, kiln: "Ledger entries: a credit can be +500 or a charge -37 (micro-dollars)." },
  f32: { bits: 32, signed: true, float: true, kiln: "Activations, logits, probabilities. Most math inside the model is f32 (or f16/bf16)." },
  usize: { bits: 64, signed: false, kiln: "Index into a Vec or slice, and lengths. Same size as a pointer (64 bits on our PC)." },
};

function range(t: NumType): [string, string] {
  const info = TYPE_INFO[t];
  if (info.float) return ["≈ -3.4 × 10³⁸", "≈ 3.4 × 10³⁸ (about 7 decimal digits of precision)"];
  const b = BigInt(info.bits);
  if (info.signed) return [(-(2n ** (b - 1n))).toLocaleString("en-US"), (2n ** (b - 1n) - 1n).toLocaleString("en-US")];
  return ["0", (2n ** b - 1n).toLocaleString("en-US")];
}

function TypeExplorer() {
  const [t, setT] = useState<NumType>("u32");
  const info = TYPE_INFO[t];
  const [min, max] = range(t);
  const bytes = info.bits / 8;
  return (
    <Viz title="Number type explorer" hint="Pick a type. Each square is one byte (8 bits) of memory.">
      <Seg options={TYPES} value={t} onChange={setT} />
      <div style={{ display: "flex", gap: 4, margin: "16px 0", flexWrap: "wrap" }}>
        {Array.from({ length: bytes }).map((_, i) => (
          <div key={i} className="fade-in" style={{
            width: 64, height: 46, borderRadius: 6, display: "grid", placeItems: "center",
            background: info.float ? "var(--c4-soft)" : info.signed ? "var(--c2-soft)" : "var(--c1-soft)",
            border: `1.5px solid ${info.float ? "var(--c4)" : info.signed ? "var(--c2)" : "var(--c1)"}`,
            fontFamily: "var(--mono)", fontSize: 12,
          }}>byte {i}</div>
        ))}
      </div>
      <table>
        <tbody>
          <tr><th>Size</th><td>{info.bits} bits = {bytes} byte{bytes > 1 ? "s" : ""}</td></tr>
          <tr><th>Kind</th><td>{info.float ? "floating point (has a fraction part)" : info.signed ? "signed integer (can be negative)" : "unsigned integer (0 or positive only)"}</td></tr>
          <tr><th>Smallest</th><td className="mono">{min}</td></tr>
          <tr><th>Largest</th><td className="mono">{max}</td></tr>
          <tr><th>In Kiln</th><td>{info.kiln}</td></tr>
        </tbody>
      </table>
      {t === "usize" && <p className="small muted">usize is 8 bytes on a 64-bit machine and 4 bytes on a 32-bit machine. It always matches the pointer size.</p>}
    </Viz>
  );
}

/* ---------- Overflow demo ---------- */

function OverflowDemo() {
  const [add, setAdd] = useState(10);
  const start = 250;
  const real = start + add;
  const wrapped = real % 256;
  const fits = real <= 255;
  return (
    <Viz title="What happens when a u8 gets too big?" hint="We start with 250u8 and add a number. A u8 can only hold 0..=255.">
      <Slider label="value to add" value={add} min={0} max={20} onChange={setAdd} />
      <div className="grid3" style={{ marginTop: 12 }}>
        <div className="card"><h4 className="mono">250 + {add}</h4><div className="muted small">real math answer</div><div className="mono" style={{ fontSize: 22 }}>{real}</div></div>
        <div className="card"><h4 className="mono">checked_add</h4><div className="muted small">safe: tells you if it failed</div>
          <div className="mono" style={{ fontSize: 22, color: fits ? "var(--c3)" : "var(--c5)" }}>{fits ? `Some(${real})` : "None"}</div></div>
        <div className="card"><h4 className="mono">wrapping_add</h4><div className="muted small">wraps around like a clock</div>
          <div className="mono" style={{ fontSize: 22 }}>{wrapped}</div></div>
      </div>
      <p className="small">With plain <code>+</code>: in a <b>debug build</b> the program <b>panics</b> (stops with an error) when it overflows.
        In a <b>release build</b> it silently wraps to <code>{wrapped}</code>. {fits ? "Right now it fits, so all three agree." : "Right now it does NOT fit."}</p>
    </Viz>
  );
}

/* ---------- Stack frame stepper ---------- */

function Frame(props: { x: number; y: number; name: string; vars: [string, string][]; active?: boolean; color: 1 | 2 | 3 }) {
  const h = 34 + props.vars.length * 24;
  return (
    <g className="fade-in">
      <rect x={props.x} y={props.y} width={300} height={h} rx={8} fill={`var(--c${props.color}-soft)`}
        stroke={props.active ? "var(--accent)" : `var(--c${props.color})`} strokeWidth={props.active ? 3 : 1.5} />
      <text x={props.x + 12} y={props.y + 22} fontSize={13} fontWeight={700} fill="var(--text)">frame: {props.name}</text>
      {props.vars.map(([k, v], i) => (
        <text key={i} x={props.x + 20} y={props.y + 46 + i * 24} fontSize={13} fill="var(--text)" fontFamily="var(--mono)">
          {k} = {v}
        </text>
      ))}
    </g>
  );
}

function StackStepper() {
  const code = (hl: number) => (
    <Code title="main.rs (line in focus is marked ◀)">{[
      "fn count_words(text: &str) -> usize {",
      "    let n = text.split_whitespace().count();",
      "    n",
      "}",
      "",
      "fn main() {",
      "    let prompt = \"hello kiln world\";",
      "    let words = count_words(prompt);",
      "    println!(\"{words}\");",
      "}",
    ].map((l, i) => (i === hl ? l + "   // ◀" : l)).join("\n")}</Code>
  );
  const S = (frames: { name: string; vars: [string, string][]; color: 1 | 2 | 3 }[], note: string, hl: number) => (
    <div className="grid2">
      {code(hl)}
      <div>
        <Svg w={340} h={250} label="call stack">
          <text x={20} y={16} fontSize={12} fill="var(--muted)">STACK (grows downward in this picture)</text>
          {frames.map((f, i) => <Frame key={f.name} x={20} y={28 + i * 100} name={f.name} vars={f.vars} color={f.color} active={i === frames.length - 1} />)}
        </Svg>
        <p className="small">{note}</p>
      </div>
    </div>
  );
  return (
    <Stepper title="The call stack, one line at a time" hint="Every function call gets a 'frame' on the stack for its local variables. When it returns, the frame is thrown away."
      steps={[
        { title: "Program starts: main gets a frame", body: S([{ name: "main", vars: [], color: 1 }], "The OS calls main. Rust reserves a stack frame for main's local variables.", 5) },
        { title: "let prompt = \"hello kiln world\";", body: S([{ name: "main", vars: [["prompt", "&str → (ptr, len=16)"]], color: 1 }], "prompt is a &str: a pointer to text stored inside the program file, plus a length. Only 16 bytes live on the stack.", 6) },
        { title: "Call count_words(prompt)", body: S([{ name: "main", vars: [["prompt", "&str"], ["words", "(not yet)"]], color: 1 }, { name: "count_words", vars: [["text", "&str (copy of the pointer)"]], color: 2 }], "A new frame is pushed. The parameter text is a copy of the pointer+length. The text itself is NOT copied.", 1) },
        { title: "let n = ... count();", body: S([{ name: "main", vars: [["prompt", "&str"], ["words", "(not yet)"]], color: 1 }, { name: "count_words", vars: [["text", "&str"], ["n", "3"]], color: 2 }], "n is a usize (8 bytes) inside count_words' frame.", 1) },
        { title: "Return n", body: S([{ name: "main", vars: [["prompt", "&str"], ["words", "3"]], color: 1 }], "count_words' frame is popped. Its value 3 is copied into words. Popping is almost free: the CPU just moves the stack pointer.", 7) },
        { title: "main ends", body: S([], "main returns, its frame is popped, and the program exits.", 9) },
      ]} />
  );
}

/* ---------- Workspace picture ---------- */

function WorkspacePicture() {
  return (
    <Svg w={720} h={230} label="cargo workspace">
      <rect x={10} y={10} width={700} height={210} rx={12} fill="none" stroke="var(--border)" strokeDasharray="6 4" />
      <text x={24} y={34} fontSize={13} fontWeight={700} fill="var(--muted)">workspace: infra/ (one Cargo.toml with [workspace], one target/ folder, one Cargo.lock)</text>
      <Box x={30} y={60} w={150} h={56} label="common" sub="library crate" color={3} />
      <Box x={200} y={60} w={150} h={56} label="kiln-engine" sub="library crate" color={4} />
      <Box x={370} y={60} w={150} h={56} label="kiln-wire" sub="library crate" color={3} />
      <Box x={110} y={150} w={150} h={56} label="gateway" sub="binary crate" color={1} />
      <Box x={290} y={150} w={150} h={56} label="inference-worker" sub="binary crate" color={1} />
      <Box x={470} y={150} w={150} h={56} label="scheduler" sub="binary crate" color={1} />
      <Arrow x1={170} y1={150} x2={110} y2={118} />
      <Arrow x1={200} y1={150} x2={430} y2={118} />
      <Arrow x1={350} y1={150} x2={275} y2={118} />
      <Arrow x1={380} y1={150} x2={440} y2={118} />
      <Arrow x1={530} y1={150} x2={460} y2={118} />
      <Box x={560} y={60} w={130} h={56} label="tokio, serde" sub="external crates" />
      <text x={30} y={140} fontSize={11} fill="var(--muted)">arrow = "depends on"</text>
    </Svg>
  );
}

export default function Page() {
  return (
    <>
      <PageHeader kicker="Rust · Lesson 1" title="Rust basics: values, types, functions"
        subtitle="Enough Rust to read every code example in this site. We start from zero."
        learn={[
          "What Cargo, crates and a workspace are, and how Kiln is organised",
          "Variables, mutability and the basic number types (and how many bytes each one uses)",
          "Text: String vs &str. Lists: arrays, Vec and slices",
          "Functions, if, loops and match",
          "A small complete program: counting tokens in text",
        ]} />

      <Section title="Why Rust for Kiln?">
        <p>Kiln does two kinds of work. First, <b>heavy math</b>: multiplying millions of numbers per token inside the model.
          Second, <b>serving many users at once</b>: thousands of open connections, queues, timers.</p>
        <p>Languages like Python are easy, but slow for the first job. C and C++ are fast, but one small mistake with memory
          can crash the server or leak data. Rust gives the speed of C with a compiler that <b>checks memory safety before the program runs</b>.</p>
        <Callout kind="analogy">
          Think of the Rust compiler as a very strict building inspector. It refuses to let you open the building until
          every staircase and fire exit is correct. It is annoying at first. But once the building opens, it does not fall down.
        </Callout>
        <Callout kind="idea">
          In Rust most bugs show up as <b>compile errors</b> (you see them on your desk) instead of <b>crashes in production</b> (your users see them).
          Reading compiler errors carefully is the most important Rust skill. They are usually very helpful.
        </Callout>
      </Section>

      <Section title="Cargo, crates and the workspace">
        <p><b>Cargo</b> is Rust's build tool and package manager. One command builds, tests and runs your code.</p>
        <ul>
          <li>A <b>crate</b> is one unit of compilation. It is either a <b>library</b> (code other crates use, starts at <code>src/lib.rs</code>)
            or a <b>binary</b> (a program you can run, starts at <code>src/main.rs</code>).</li>
          <li>A <b>package</b> is a folder with a <code>Cargo.toml</code> file. It contains one or more crates.</li>
          <li>A <b>workspace</b> is many packages that are built together and share one <code>target/</code> folder and one <code>Cargo.lock</code>.</li>
        </ul>
        <div className="viz"><WorkspacePicture /><div className="caption">Kiln is one workspace. Binaries (blue) are the programs we run. Libraries (green/purple) are shared code.</div></div>
        <Code lang="toml" title="infra/Cargo.toml (the workspace root)">{`
[workspace]
resolver = "2"
members = [
    "crates/common",
    "crates/kiln-wire",
    "crates/kiln-engine",
    "crates/gateway",
    "crates/scheduler",
    "crates/inference-worker",
]

# Versions declared once here, used by every crate.
[workspace.dependencies]
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
`}</Code>
        <Code lang="toml" title="crates/gateway/Cargo.toml">{`
[package]
name = "gateway"
version = "0.1.0"
edition = "2021"

[dependencies]
common = { path = "../common" }       # our own library crate
kiln-wire = { path = "../kiln-wire" }
tokio = { workspace = true }          # version comes from the workspace root
`}</Code>
        <Code lang="text" title="Everyday commands">{`
cargo new hello            # create a new binary package
cargo build                # compile (debug: fast to build, slow to run)
cargo build --release      # compile with optimisations (10-50x faster for math!)
cargo run -p gateway       # build and run one package in the workspace
cargo test                 # run all tests
cargo check                # only type-check, no binary (fastest feedback)
cargo clippy               # extra lints: "this works, but here is a better way"
cargo fmt                  # format code the standard way
`}</Code>
        <Callout kind="warn">
          Always run the inference worker with <code>--release</code>. A debug build of model math can be 10 to 50 times slower.
          Debug builds keep extra checks (like overflow checks) and do not optimise loops.
        </Callout>
      </Section>

      <Section title="Variables and mutability">
        <p>In Rust, variables are <b>immutable by default</b>. You cannot change them unless you say <code>mut</code>.
          This sounds strange, but it makes code easier to reason about: if there is no <code>mut</code>, the value never changes.</p>
        <Code title="variables.rs">{`
fn main() {
    let max_tokens = 512;          // immutable: cannot be changed later
    // max_tokens = 1024;          // ERROR: cannot assign twice to immutable variable

    let mut generated = 0;         // mutable: we will change it
    generated += 1;                // ok
    generated += 1;
    println!("generated {generated} of {max_tokens} tokens");

    // Shadowing: a NEW variable with the same name. Often used to change the type.
    let input = "  42  ";          // &str
    let input: u32 = input.trim().parse().unwrap(); // now a u32
    println!("input = {input}");

    // Constants: known at compile time, must have a type, written in UPPER_CASE.
    const BLOCK_SIZE: usize = 16;  // tokens per KV-cache block
    println!("{BLOCK_SIZE}");
}
`}</Code>
        <Callout kind="rust">
          Rust usually <b>infers</b> types, so you do not have to write them. <code>let x = 5;</code> becomes <code>i32</code>,
          <code>let y = 2.0;</code> becomes <code>f64</code>. You add a type when the compiler cannot guess, or to be clear:
          <code>let id: u32 = 151_643;</code> (the <code>_</code> is only for readability).
        </Callout>
      </Section>

      <Section title="Number types: every type has a fixed size">
        <p>A computer's memory is a long row of <b>bytes</b>. Each byte holds 8 bits (a number from 0 to 255).
          In Rust, every number type has an exact size, and the name tells you: <code>u32</code> = <b>u</b>nsigned, <b>32</b> bits.
          <code>i64</code> = signed (<b>i</b>nteger, can be negative), 64 bits. <code>f32</code> = 32-bit <b>f</b>loat.</p>
        <TypeExplorer />
        <p>Why care about sizes? Because in Kiln we store <b>billions</b> of numbers. A 4-billion-weight model stored as
          <code>f32</code> needs 16 GB. As <code>f16</code> (2 bytes) it needs 8 GB. As 4-bit integers it needs about 2.5 GB, which fits on our GPU.
          Choosing the right type is choosing how much memory you spend.</p>
        <Callout kind="deep">
          Rust's standard library has no <code>f16</code> type in stable Rust yet. Libraries (like the <code>half</code> crate) store an
          f16 as a <code>u16</code> and convert it. In Kiln's engine we will write this conversion ourselves; you will see how in the
          "Bits, bytes &amp; floating point" lesson.
        </Callout>
        <OverflowDemo />
        <p>Other basic types:</p>
        <table>
          <thead><tr><th>Type</th><th>Size</th><th>Example</th><th>Notes</th></tr></thead>
          <tbody>
            <tr><td><code>bool</code></td><td>1 byte</td><td><code>let streaming = true;</code></td><td>true or false</td></tr>
            <tr><td><code>char</code></td><td>4 bytes</td><td><code>let c = 'é';</code></td><td>one Unicode character (not one byte!)</td></tr>
            <tr><td><code>(u32, f32)</code></td><td>8 bytes</td><td><code>let best = (42, 0.91);</code></td><td>a tuple: fixed group of values, read with <code>best.0</code>, <code>best.1</code></td></tr>
            <tr><td><code>()</code></td><td>0 bytes</td><td><code>let nothing = ();</code></td><td>"unit": the value of a function that returns nothing</td></tr>
          </tbody>
        </table>
        <Code title="Converting between number types">{`
let token_id: u32 = 9_906;
let index = token_id as usize;          // 'as' converts. Use it to index a Vec.
let small = 300u32 as u8;               // 'as' can silently cut bits: 300 becomes 44!
let safe: Result<u8, _> = u8::try_from(300u32); // Err(..): safe conversion that can fail
let prob = 3 as f32 / 4 as f32;         // 0.75
`}</Code>
        <Quiz q="The Qwen3 vocabulary has about 151,000 tokens. Which is the smallest unsigned type that can hold every token id?"
          options={["u8 (max 255)", "u16 (max 65,535)", "u32 (max ~4.29 billion)", "u64"]} answer={2}
          explain="u16 stops at 65,535, which is too small. u32 is the smallest that fits, so token ids are u32 in Kiln." />
      </Section>

      <Section title="The stack: where local variables live">
        <p>When a function runs, its local variables live in a memory area called the <b>stack</b>. It works like a stack of plates:
          calling a function puts a plate (a <b>frame</b>) on top; returning removes it. This is extremely fast because the
          computer only moves one pointer up or down.</p>
        <StackStepper />
        <Callout kind="idea">
          The stack is fast but each value on it must have a <b>size known at compile time</b>. Things whose size changes
          (a growing list of tokens, a user's prompt text) live in another area called the <b>heap</b>. The next lesson is all about this.
        </Callout>
      </Section>

      <Section title="Text: String vs &str">
        <p>Rust has two main text types. This confuses every beginner, so let's be precise.</p>
        <div className="grid2">
          <div className="card"><h4><code>String</code></h4>
            <p className="small">Owns its text. The bytes live on the heap. It can grow (<code>push_str</code>). When the String is dropped, the memory is freed.</p>
            <p className="small">Use it when you <b>create or keep</b> text: a generated answer, a JSON body.</p></div>
          <div className="card"><h4><code>&amp;str</code> ("string slice")</h4>
            <p className="small">A <b>view</b> into text owned by someone else: just a pointer + length. Cannot grow. Very cheap to pass around.</p>
            <p className="small">Use it for <b>function parameters</b> that only read text.</p></div>
        </div>
        <Code title="strings.rs">{`
fn main() {
    let literal: &str = "sk-live-";              // text stored inside the program binary
    let mut key = String::from(literal);         // copy it into a new heap String
    key.push_str("a1b2c3");                      // grow it: "sk-live-a1b2c3"

    let prefix: &str = &key[0..8];               // a view of the first 8 BYTES: "sk-live-"
    println!("{key} starts with {prefix}");

    print_len(&key);                             // &String turns into &str automatically
    print_len("hello");                          // a literal is already &str
}

// Taking &str means: "give me any text, I will only read it".
fn print_len(s: &str) {
    println!("{} bytes, {} chars", s.len(), s.chars().count());
}
`}</Code>
        <Callout kind="warn">
          Rust strings are <b>UTF-8 bytes</b>. <code>len()</code> counts bytes, not letters. <code>"é".len()</code> is 2.
          Slicing in the middle of a multi-byte character (<code>&amp;s[0..1]</code> on "é") <b>panics</b>.
          This matters for Kiln: a token can end in the middle of a character, so the streaming code must buffer bytes until a full character arrives.
        </Callout>
      </Section>

      <Section title="Lists: arrays, Vec and slices">
        <table>
          <thead><tr><th>Type</th><th>Size</th><th>Where</th><th>Kiln example</th></tr></thead>
          <tbody>
            <tr><td><code>[f32; 8]</code> array</td><td>fixed, known at compile time</td><td>stack (usually)</td><td>8 floats processed by one AVX2 instruction</td></tr>
            <tr><td><code>{"Vec<u32>"}</code> vector</td><td>grows at runtime</td><td>heap</td><td>the token ids of a prompt</td></tr>
            <tr><td><code>{"&[u32]"}</code> slice</td><td>a view: pointer + length</td><td>points anywhere</td><td>"the last 16 tokens" without copying</td></tr>
          </tbody>
        </table>
        <Code title="lists.rs">{`
fn main() {
    let lanes: [f32; 4] = [1.0, 2.0, 3.0, 4.0];   // array: exactly 4 f32 = 16 bytes
    let mut tokens: Vec<u32> = Vec::new();        // empty growable list
    tokens.push(9906);                            // add at the end
    tokens.push(11);
    tokens.extend([1917, 0]);                     // add several
    println!("{} tokens: {:?}", tokens.len(), tokens); // {:?} = debug print

    let first_two: &[u32] = &tokens[..2];         // slice: no copy, just a view
    let total = sum(first_two);
    println!("sum = {total}, lanes[2] = {}", lanes[2]);

    // tokens[99];   // index out of range -> PANIC (Rust checks bounds at runtime)
    let maybe = tokens.get(99);                    // safe version: returns Option<&u32>
    println!("{maybe:?}");                         // prints: None
}

// A function that accepts a Vec, an array, or part of either: take a slice.
fn sum(xs: &[u32]) -> u64 {
    let mut s = 0u64;
    for &x in xs {          // loop over each element (copy it out with &x)
        s += x as u64;
    }
    s
}
`}</Code>
        <Callout kind="deep">
          A <code>Vec</code> is three numbers on the stack: a <b>pointer</b> to heap memory, a <b>length</b> (how many items are used) and a
          <b>capacity</b> (how many fit before it must grow). When it is full, <code>push</code> allocates a bigger block (about 2×),
          copies everything, and frees the old block. If you know the size, use <code>Vec::with_capacity(n)</code> to avoid that.
        </Callout>
      </Section>

      <Section title="Functions and control flow">
        <p>Rust is an <b>expression</b> language: almost everything gives back a value. An <code>if</code> gives a value. A block's last line
          (without <code>;</code>) is its value. That is why functions often end without <code>return</code>.</p>
        <Code title="control_flow.rs">{`
// Parameters always have types. "-> f32" is the return type.
fn price_usd(input_tokens: u32, output_tokens: u32) -> f32 {
    let input_cost = input_tokens as f32 * 0.10 / 1_000_000.0;
    let output_cost = output_tokens as f32 * 0.40 / 1_000_000.0;
    input_cost + output_cost        // no ';' -> this is the return value
}

fn main() {
    let cost = price_usd(1200, 300);

    // 'if' is an expression: it returns a value
    let tier = if cost > 1.0 { "expensive" } else { "cheap" };

    // 'for' over a range: 0, 1, 2, 3 (end is excluded)
    for step in 0..4 {
        println!("decode step {step}");
    }

    // 'while' while a condition holds
    let mut free_blocks = 3;
    while free_blocks > 0 {
        free_blocks -= 1;
    }

    // 'loop' forever, until 'break'. 'break' can return a value.
    let mut n = 0;
    let first_big = loop {
        n += 7;
        if n > 30 { break n; }
    };

    // 'match' compares against patterns. It must cover EVERY case.
    let status = 429;
    let meaning = match status {
        200 => "ok",
        400..=499 => "client error",   // a range pattern
        500 | 503 => "server error",   // either value
        _ => "something else",          // _ = everything not listed above
    };
    println!("{cost:.6} {tier} {first_big} {meaning}");
}
`}</Code>
        <Quiz q="What does this function return?  fn f() -> i32 { let x = 3; x * 2; }"
          options={["6", "It does not compile", "0", "()"]} answer={1}
          explain="The ';' after x * 2 turns it into a statement, so the block's value is () (unit), not i32. The compiler says 'mismatched types: expected i32, found ()'. Remove the ';' to return 6." />
      </Section>

      <Section title="Putting it together: a tiny token counter">
        <p>Real tokenizers are more complex (see the Tokenization lesson), but here is a complete program that splits text
          into "tokens" by spaces and punctuation, counts them, and estimates the price. Every concept from this page is used once.</p>
        <Code title="src/main.rs — cargo run -- &quot;Hello, Kiln! How are you?&quot;">{`
use std::collections::HashMap;   // a hash map (dictionary) from the standard library
use std::env;                    // read command-line arguments

/// Split text into simple tokens: runs of letters/digits, or single punctuation marks.
fn tokenize(text: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    for c in text.chars() {
        if c.is_alphanumeric() {
            current.push(c);                       // still inside a word
        } else {
            if !current.is_empty() {
                tokens.push(current.clone());      // finish the word
                current.clear();
            }
            if !c.is_whitespace() {
                tokens.push(c.to_string());        // punctuation is its own token
            }
        }
    }
    if !current.is_empty() {
        tokens.push(current);                      // last word
    }
    tokens
}

fn main() {
    // args: [program name, first argument, ...]. Use a default if none given.
    let text = env::args().nth(1).unwrap_or(String::from("Hello, Kiln! Hello again."));
    let tokens = tokenize(&text);

    // Count how often each token appears.
    let mut counts: HashMap<&str, usize> = HashMap::new();
    for t in &tokens {
        *counts.entry(t.as_str()).or_insert(0) += 1;
    }

    println!("{} tokens: {:?}", tokens.len(), tokens);
    for (tok, n) in &counts {
        println!("  {tok:>8} x{n}");
    }
    let cost = tokens.len() as f64 * 0.10 / 1_000_000.0;
    println!("input cost at $0.10 / 1M tokens: \${cost:.8}");
}
`}</Code>
        <Callout kind="kiln">
          In Kiln the gateway tokenizes the prompt <b>before</b> sending it to the GPU, for the same reason as this toy program:
          it needs the token count to check rate limits (tokens per minute) and to estimate cost. The real tokenizer lives in
          <code>kiln-engine/tokenizer</code> and is shared by the gateway and the workers.
        </Callout>
      </Section>

      <Section title="Printing and debugging">
        <Code title="formatting cheat sheet">{`
let id = 7u32;
let name = "qwen3-4b";
println!("plain {}", id);            // Display: for humans
println!("inline {id} {name}");      // variables can go inside {}
println!("{:?}", vec![1, 2, 3]);     // Debug: for developers, works on most types
println!("{:#?}", (1, "a"));         // pretty Debug, multi-line
println!("{:>8}|", name);            // right-align in 8 chars
println!("{:.3}", 3.14159);          // 3 decimal places -> 3.142
println!("{:08b}", 5u8);             // binary, 8 digits -> 00000101
println!("{:#x}", 255);              // hex -> 0xff
eprintln!("goes to stderr");         // error output
dbg!(id * 2);                        // prints file:line, the expression and its value
`}</Code>
        <Callout kind="rust">
          Names ending in <code>!</code> like <code>println!</code>, <code>vec!</code> and <code>dbg!</code> are <b>macros</b>, not functions.
          A macro writes code for you at compile time. <code>println!</code> checks your format string at compile time, so a typo is a compile error, not a crash.
        </Callout>
      </Section>

      <Recap items={[
        "Cargo builds and runs code. A crate is a library or a binary. Kiln is one workspace of many crates.",
        "Variables are immutable unless marked mut. Types are usually inferred.",
        "Every number type has a fixed size (u8 = 1 byte ... u64 = 8 bytes). Choosing types = choosing memory.",
        "Local variables live on the stack in function frames; pushing/popping a frame is nearly free.",
        "String owns heap text; &str is a cheap view. Vec owns a growable list; &[T] is a view.",
        "if, match and blocks are expressions. A function returns its last expression (no semicolon).",
        "Use --release for anything that does math.",
      ]} />
    </>
  );
}
