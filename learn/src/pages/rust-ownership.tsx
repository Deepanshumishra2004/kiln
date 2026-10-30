import { useState } from "react";
import { PageHeader, Section, Callout, Code, Viz, Seg, Stepper, Quiz, Recap, Svg } from "../components/ui";

/* ---------- Memory picture: stack variables pointing to heap blocks ---------- */

type Var = { name: string; kind: "owner" | "moved" | "ref" | "dropped"; target?: string; note?: string };
type Heap = { id: string; text: string; freed?: boolean };

function MemoryPicture(props: { vars: Var[]; heap: Heap[] }) {
  const rowH = 52;
  const varY = (i: number) => 40 + i * rowH;
  const heapY = (i: number) => 40 + i * 70;
  const h = Math.max(props.vars.length * rowH, props.heap.length * 70) + 60;
  return (
    <Svg w={720} h={Math.max(h, 180)} label="stack and heap">
      <text x={20} y={22} fontSize={12} fontWeight={700} fill="var(--muted)">STACK (fixed-size slots)</text>
      <text x={430} y={22} fontSize={12} fontWeight={700} fill="var(--muted)">HEAP (variable-size blocks)</text>
      <line x1={380} y1={10} x2={380} y2={h} stroke="var(--border)" strokeDasharray="4 4" />
      {props.heap.map((b, i) => (
        <g key={b.id} className="fade-in" opacity={b.freed ? 0.3 : 1}>
          <rect x={430} y={heapY(i)} width={260} height={46} rx={7}
            fill={b.freed ? "var(--panel-2)" : "var(--c3-soft)"} stroke={b.freed ? "var(--border)" : "var(--c3)"} strokeWidth={1.5}
            strokeDasharray={b.freed ? "5 4" : undefined} />
          <text x={445} y={heapY(i) + 20} fontSize={11} fill="var(--muted)" fontFamily="var(--mono)">block {b.id}{b.freed ? " — FREED" : ""}</text>
          <text x={445} y={heapY(i) + 37} fontSize={14} fill="var(--text)" fontFamily="var(--mono)">"{b.text}"</text>
        </g>
      ))}
      {props.vars.map((v, i) => {
        const color = v.kind === "owner" ? "var(--c1)" : v.kind === "ref" ? "var(--c4)" : "var(--border)";
        const fill = v.kind === "owner" ? "var(--c1-soft)" : v.kind === "ref" ? "var(--c4-soft)" : "var(--panel-2)";
        const ti = props.heap.findIndex((b) => b.id === v.target);
        const refTarget = props.vars.findIndex((o) => o.name === v.target);
        return (
          <g key={v.name} className="fade-in" opacity={v.kind === "moved" || v.kind === "dropped" ? 0.4 : 1}>
            <rect x={20} y={varY(i)} width={240} height={40} rx={7} fill={fill} stroke={color} strokeWidth={1.5} />
            <text x={34} y={varY(i) + 25} fontSize={14} fontWeight={700} fill="var(--text)" fontFamily="var(--mono)">{v.name}</text>
            <text x={80} y={varY(i) + 25} fontSize={11} fill="var(--muted)" fontFamily="var(--mono)">
              {v.kind === "owner" ? "{ptr, len, cap}" : v.kind === "ref" ? "&  (pointer only)" : v.kind === "moved" ? "moved — unusable" : "dropped"}
            </text>
            {v.kind === "owner" && ti >= 0 && (
              <line x1={260} y1={varY(i) + 20} x2={428} y2={heapY(ti) + 23} stroke="var(--c1)" strokeWidth={2} markerEnd="url(#arrow)" />
            )}
            {v.kind === "ref" && refTarget >= 0 && (
              <path d={`M 260 ${varY(i) + 20} C 330 ${varY(i) + 20}, 330 ${varY(refTarget) + 20}, 262 ${varY(refTarget) + 20}`}
                fill="none" stroke="var(--c4)" strokeWidth={2} markerEnd="url(#arrow)" />
            )}
            {v.note && <text x={270} y={varY(i) + 44} fontSize={10} fill="var(--muted)">{v.note}</text>}
          </g>
        );
      })}
    </Svg>
  );
}

function OwnershipStepper() {
  const lines = [
    "let a = String::from(\"sk-live-abc\");",
    "let b = a;",
    "// println!(\"{a}\");  // ERROR: a was moved",
    "let c = b.clone();",
    "let r = &c;",
    "println!(\"{b} {r}\");",
    "}   // end of scope",
  ];
  const code = (hl: number) => (
    <Code title="inside fn main() {">{lines.map((l, i) => (i === hl ? l + "   // ◀" : l)).join("\n")}</Code>
  );
  const steps: { title: string; hl: number; vars: Var[]; heap: Heap[]; text: string }[] = [
    { title: "Create a String", hl: 0, vars: [{ name: "a", kind: "owner", target: "1" }], heap: [{ id: "1", text: "sk-live-abc" }],
      text: "String::from asks the allocator for 11 bytes on the heap and copies the text there. The variable a (24 bytes on the stack: pointer, length, capacity) OWNS that heap block." },
    { title: "Move: let b = a", hl: 1, vars: [{ name: "a", kind: "moved" }, { name: "b", kind: "owner", target: "1" }], heap: [{ id: "1", text: "sk-live-abc" }],
      text: "The 24 stack bytes are copied into b. The heap text is NOT copied. Now there would be two owners of the same block, which would free it twice. So Rust says: a is MOVED. b is the only owner. a can no longer be used." },
    { title: "Using a after the move", hl: 2, vars: [{ name: "a", kind: "moved", note: "error[E0382]: borrow of moved value: `a`" }, { name: "b", kind: "owner", target: "1" }], heap: [{ id: "1", text: "sk-live-abc" }],
      text: "If you try to use a, the compiler stops you: 'value borrowed here after move'. This error happens at compile time. The program never runs with this bug." },
    { title: "Clone: an explicit deep copy", hl: 3, vars: [{ name: "a", kind: "moved" }, { name: "b", kind: "owner", target: "1" }, { name: "c", kind: "owner", target: "2" }], heap: [{ id: "1", text: "sk-live-abc" }, { id: "2", text: "sk-live-abc" }],
      text: "clone() allocates a NEW heap block and copies the bytes. Now there are two independent strings with two owners. Copying is never hidden in Rust: you see .clone() and you know it costs memory and time." },
    { title: "Borrow: let r = &c", hl: 4, vars: [{ name: "a", kind: "moved" }, { name: "b", kind: "owner", target: "1" }, { name: "c", kind: "owner", target: "2" }, { name: "r", kind: "ref", target: "c" }], heap: [{ id: "1", text: "sk-live-abc" }, { id: "2", text: "sk-live-abc" }],
      text: "r is a REFERENCE: it points at c, but does not own anything. Borrowing is free (just one pointer). While r exists, c cannot be moved or dropped, because r would then point at garbage." },
    { title: "Use them", hl: 5, vars: [{ name: "a", kind: "moved" }, { name: "b", kind: "owner", target: "1" }, { name: "c", kind: "owner", target: "2" }, { name: "r", kind: "ref", target: "c" }], heap: [{ id: "1", text: "sk-live-abc" }, { id: "2", text: "sk-live-abc" }],
      text: "Reading through a reference is fine. Many shared references can exist at the same time." },
    { title: "End of scope: drop", hl: 6, vars: [{ name: "a", kind: "dropped" }, { name: "b", kind: "dropped" }, { name: "c", kind: "dropped" }, { name: "r", kind: "dropped" }], heap: [{ id: "1", text: "sk-live-abc", freed: true }, { id: "2", text: "sk-live-abc", freed: true }],
      text: "At the closing brace Rust automatically calls drop for every owner, in reverse order: c frees block 2, b frees block 1. a was moved, so nothing happens for a. No garbage collector, no manual free(), no leak, no double free." },
  ];
  return (
    <Stepper title="Ownership, line by line" hint="Watch the stack (left) and the heap (right). Blue = owner, purple = reference, grey = gone."
      steps={steps.map((s) => ({
        title: s.title,
        body: (<div>{code(s.hl)}<MemoryPicture vars={s.vars} heap={s.heap} /><p className="small">{s.text}</p></div>),
      }))} />
  );
}

/* ---------- Borrow checker playground ---------- */

type Action = "read" | "write";
function BorrowPlayground() {
  const [shared, setShared] = useState(0);
  const [mutb, setMutb] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [owned, setOwned] = useState(true);

  const tryShared = () => {
    if (!owned) return setMsg({ ok: false, text: "error[E0382]: borrow of moved value: `tokens`" });
    if (mutb > 0) return setMsg({ ok: false, text: "error[E0502]: cannot borrow `tokens` as immutable because it is also borrowed as mutable" });
    setShared(shared + 1); setMsg({ ok: true, text: `let r${shared + 1} = &tokens;  // ok: shared borrows can be many` });
  };
  const tryMut = () => {
    if (!owned) return setMsg({ ok: false, text: "error[E0382]: borrow of moved value: `tokens`" });
    if (shared > 0) return setMsg({ ok: false, text: "error[E0502]: cannot borrow `tokens` as mutable because it is also borrowed as immutable" });
    if (mutb > 0) return setMsg({ ok: false, text: "error[E0499]: cannot borrow `tokens` as mutable more than once at a time" });
    setMutb(1); setMsg({ ok: true, text: "let w = &mut tokens;  // ok: the only borrow right now" });
  };
  const tryMove = () => {
    if (!owned) return setMsg({ ok: false, text: "error[E0382]: use of moved value: `tokens`" });
    if (shared + mutb > 0) return setMsg({ ok: false, text: "error[E0505]: cannot move out of `tokens` because it is borrowed" });
    setOwned(false); setMsg({ ok: true, text: "let other = tokens;  // ok: ownership moved, `tokens` is now unusable" });
  };
  const endBorrows = () => { setShared(0); setMutb(0); setMsg({ ok: true, text: "All references went out of scope. `tokens` is free again." }); };
  const reset = () => { setShared(0); setMutb(0); setOwned(true); setMsg(null); };

  return (
    <Viz title="Be the borrow checker" hint="We own: let mut tokens: Vec<u32> = vec![...]. Try to create references and see what the compiler says.">
      <div className="controls">
        <button className="btn" onClick={tryShared}>+ shared borrow  &amp;tokens</button>
        <button className="btn" onClick={tryMut}>+ mutable borrow  &amp;mut tokens</button>
        <button className="btn" onClick={tryMove}>move it  let other = tokens</button>
        <button className="btn" onClick={endBorrows}>end all borrows</button>
        <button className="btn" onClick={reset}>reset</button>
      </div>
      <Svg w={700} h={130} label="borrow state">
        <rect x={20} y={40} width={170} height={56} rx={8} fill={owned ? "var(--c1-soft)" : "var(--panel-2)"} stroke={owned ? "var(--c1)" : "var(--border)"} strokeWidth={2} />
        <text x={105} y={66} textAnchor="middle" fontSize={14} fontWeight={700} fill="var(--text)" fontFamily="var(--mono)">tokens</text>
        <text x={105} y={84} textAnchor="middle" fontSize={11} fill="var(--muted)">{owned ? "owner" : "moved away"}</text>
        {Array.from({ length: shared }).map((_, i) => (
          <g key={i} className="fade-in">
            <rect x={260 + i * 80} y={10} width={66} height={36} rx={7} fill="var(--c4-soft)" stroke="var(--c4)" />
            <text x={293 + i * 80} y={33} textAnchor="middle" fontSize={12} fontFamily="var(--mono)" fill="var(--text)">&amp;r{i + 1}</text>
            <line x1={260 + i * 80} y1={30} x2={192} y2={60} stroke="var(--c4)" markerEnd="url(#arrow)" />
          </g>
        ))}
        {mutb > 0 && (
          <g className="fade-in">
            <rect x={260} y={84} width={100} height={36} rx={7} fill="var(--c5-soft)" stroke="var(--c5)" />
            <text x={310} y={107} textAnchor="middle" fontSize={12} fontFamily="var(--mono)" fill="var(--text)">&amp;mut w</text>
            <line x1={260} y1={100} x2={192} y2={80} stroke="var(--c5)" markerEnd="url(#arrow)" />
          </g>
        )}
        <text x={690} y={125} textAnchor="end" fontSize={11} fill="var(--muted)">readers: {shared} · writers: {mutb}</text>
      </Svg>
      {msg && <div className="code fade-in" key={msg.text}><pre style={{ color: msg.ok ? "var(--c3)" : "var(--c5)" }}>{msg.text}</pre></div>}
    </Viz>
  );
}

/* ---------- Smart pointers ---------- */

type Smart = "Box" | "Rc" | "Arc";
function SmartPointers() {
  const [k, setK] = useState<Smart>("Arc");
  const info: Record<Smart, { owners: number; counter: string; threads: string; kiln: string; code: string }> = {
    Box: { owners: 1, counter: "none", threads: "yes, if T can be sent", kiln: "Put a big or recursive value on the heap. Box<dyn Engine> holds 'some engine' whose exact type is chosen at runtime.",
      code: `let engine: Box<dyn Engine> = Box::new(CpuEngine::new());\n// one owner. Freed when 'engine' goes out of scope.` },
    Rc: { owners: 3, counter: "plain counter (not thread-safe)", threads: "no — the compiler refuses", kiln: "Rarely used in Kiln, because almost everything is shared between async tasks on many threads.",
      code: `use std::rc::Rc;\nlet a = Rc::new(String::from("system prompt"));\nlet b = Rc::clone(&a);   // count = 2, no text copied\nprintln!("{}", Rc::strong_count(&a)); // 2` },
    Arc: { owners: 3, counter: "atomic counter (thread-safe)", threads: "yes", kiln: "Shared read-only state: the loaded model weights, the tokenizer, the config. Every request task gets an Arc clone (cheap: +1 on a counter).",
      code: `use std::sync::Arc;\nlet tokenizer = Arc::new(Tokenizer::load("tokenizer.json")?);\nfor _ in 0..3 {\n    let t = Arc::clone(&tokenizer);          // count + 1\n    tokio::spawn(async move { t.encode("hi"); }); // each task owns one handle\n}   // the tokenizer is freed when the LAST Arc is dropped` },
  };
  const s = info[k];
  return (
    <Viz title="Box, Rc and Arc: who owns the heap value?" hint="Pick a smart pointer.">
      <Seg options={["Box", "Rc", "Arc"] as const} value={k} onChange={setK} />
      <Svg w={700} h={170} label="smart pointer diagram">
        {Array.from({ length: s.owners }).map((_, i) => (
          <g key={k + i} className="fade-in">
            <rect x={30} y={20 + i * 48} width={150} height={36} rx={7} fill="var(--c1-soft)" stroke="var(--c1)" />
            <text x={105} y={43 + i * 48} textAnchor="middle" fontSize={12} fontFamily="var(--mono)" fill="var(--text)">{k}&lt;T&gt; handle {i + 1}</text>
            <line x1={180} y1={38 + i * 48} x2={398} y2={80} stroke="var(--c1)" markerEnd="url(#arrow)" />
          </g>
        ))}
        <rect x={400} y={40} width={270} height={80} rx={8} fill="var(--c3-soft)" stroke="var(--c3)" />
        {k !== "Box" && <text x={415} y={62} fontSize={12} fontFamily="var(--mono)" fill="var(--text)">count = {s.owners}</text>}
        <text x={415} y={k !== "Box" ? 86 : 74} fontSize={13} fontFamily="var(--mono)" fill="var(--text)">T (the value)</text>
        <text x={415} y={108} fontSize={11} fill="var(--muted)">HEAP</text>
      </Svg>
      <table><tbody>
        <tr><th>Owners</th><td>{k === "Box" ? "exactly one" : "many (shared ownership)"}</td></tr>
        <tr><th>Reference counter</th><td>{s.counter}</td></tr>
        <tr><th>Share across threads?</th><td>{s.threads}</td></tr>
        <tr><th>In Kiln</th><td>{s.kiln}</td></tr>
      </tbody></table>
      <Code>{s.code}</Code>
    </Viz>
  );
}

export default function Page() {
  return (
    <>
      <PageHeader kicker="Rust · Lesson 2" title="Ownership & borrowing"
        subtitle="The one idea that makes Rust different. Understand this page and the rest of Rust becomes easy."
        learn={[
          "Stack vs heap: why some data needs the heap",
          "The 3 ownership rules, and what 'move' really does in memory",
          "Borrowing: shared (&) and mutable (&mut) references, and the one rule that prevents data races",
          "Lifetimes: what the compiler is checking when it talks about them",
          "Box, Rc and Arc: when one owner is not enough",
        ]} />

      <Section title="The problem: who frees the memory?">
        <p>Programs constantly ask for memory ("I need room for this 3,000-token prompt") and must give it back later.
          Every language must answer one question: <b>who gives it back, and when?</b></p>
        <table>
          <thead><tr><th>Approach</th><th>Languages</th><th>Cost</th></tr></thead>
          <tbody>
            <tr><td>The programmer calls <code>free()</code> by hand</td><td>C, C++</td><td>Fast, but easy to get wrong: forget → <b>leak</b>; free twice → <b>crash</b>; use after free → <b>security hole</b>.</td></tr>
            <tr><td>A garbage collector finds unused memory at runtime</td><td>Python, Java, Go, JS</td><td>Safe, but uses extra memory and CPU, and sometimes pauses the program.</td></tr>
            <tr><td><b>Ownership</b>: the compiler knows exactly when each value dies, and inserts the free for you</td><td>Rust</td><td>Safe <b>and</b> fast. The price: you must follow rules the compiler checks.</td></tr>
          </tbody>
        </table>
        <Callout kind="kiln">
          Kiln serves many users at once. A GC pause in the middle of streaming tokens is visible as stutter (bad inter-token latency).
          A use-after-free in the gateway could leak one customer's prompt to another. Ownership removes both problems.
        </Callout>
      </Section>

      <Section title="Stack vs heap">
        <div className="grid2">
          <div className="card"><h4>Stack</h4>
            <ul className="small">
              <li>Fixed-size values only (size known at compile time)</li>
              <li>Allocation = move one pointer. Almost free.</li>
              <li>Freed automatically when the function returns</li>
              <li>Examples: <code>u32</code>, <code>f32</code>, <code>[f32; 8]</code>, the 24-byte "header" of a String or Vec</li>
            </ul></div>
          <div className="card"><h4>Heap</h4>
            <ul className="small">
              <li>Any size, can grow at runtime</li>
              <li>Allocation = ask the allocator to find free space. Slower.</li>
              <li>Must be freed by someone, exactly once</li>
              <li>Examples: the bytes of a String, the elements of a Vec, model weights</li>
            </ul></div>
        </div>
        <Callout kind="analogy">
          The stack is your desk: small, fast, cleaned automatically when you leave. The heap is a warehouse: huge, but you need a
          ticket (a pointer) to find your box, and someone must return the box when it is no longer needed. Ownership says: <b>whoever holds the ticket returns the box</b>.
        </Callout>
      </Section>

      <Section title="The three rules of ownership">
        <ol>
          <li><b>Every value has exactly one owner</b> (a variable, a struct field, a Vec slot...).</li>
          <li><b>There can only be one owner at a time.</b> Assigning or passing a value <b>moves</b> ownership.</li>
          <li><b>When the owner goes out of scope, the value is dropped</b> (its memory is freed, files closed, etc.).</li>
        </ol>
        <OwnershipStepper />
        <Callout kind="rust" title="🦀 Copy types are different">
          Small stack-only types like <code>u32</code>, <code>f32</code>, <code>bool</code>, <code>char</code> implement the <code>Copy</code> trait.
          <code>let b = a;</code> copies them and both stay usable, because there is no heap memory to free twice.
          Moves only matter for types that own something (String, Vec, Box, file handles, GPU buffers).
        </Callout>
        <Code title="moves into functions">{`
fn log_key(key: String) {          // this function TAKES ownership
    println!("using {key}");
}                                  // key is dropped (freed) here

fn log_key_ref(key: &str) {        // this function only BORROWS
    println!("using {key}");
}

fn main() {
    let key = String::from("sk-live-abc");
    log_key_ref(&key);             // lend it: key is still ours
    log_key_ref(&key);             // again, fine
    log_key(key);                  // give it away
    // log_key_ref(&key);          // ERROR: value used after move
}
`}</Code>
        <Quiz q="let ids: Vec<u32> = vec![1, 2, 3]; let other = ids; — how many bytes of token data are copied?"
          options={["12 bytes (3 × u32)", "0 bytes of token data — only the 24-byte Vec header is copied", "24 + 12 bytes", "It does not compile"]} answer={1}
          explain="A move copies only the stack part (pointer, length, capacity). The heap elements stay where they are; only ownership changes. That is why moves are cheap." />
      </Section>

      <Section title="Borrowing: using a value without owning it">
        <p>Moving is often not what you want: you just want to <b>look at</b> or <b>change</b> something for a while.
          For that you create a <b>reference</b> (a "borrow"). There are two kinds:</p>
        <div className="grid2">
          <div className="card"><h4><code>&amp;T</code> — shared reference</h4><p className="small">Read only. You can have <b>as many as you want</b> at the same time.</p></div>
          <div className="card"><h4><code>&amp;mut T</code> — mutable reference</h4><p className="small">Can change the value. Only <b>one</b> at a time, and no shared references during that time.</p></div>
        </div>
        <Callout kind="idea" title="💡 The one rule: many readers OR one writer">
          At any moment you can have <b>many readers</b> or <b>exactly one writer</b>, never both. This single rule, checked at compile time,
          makes <b>data races impossible</b>: a data race needs two accesses at the same time where at least one is a write.
        </Callout>
        <BorrowPlayground />
        <Code title="why the rule matters: a real bug Rust prevents">{`
let mut tokens: Vec<u32> = vec![1, 2, 3];
let first: &u32 = &tokens[0];   // a reference INTO the Vec's heap buffer
tokens.push(4);                 // ERROR E0502: cannot borrow as mutable
println!("{first}");            //   because 'first' is still in use

// Why? push() may need to grow: allocate a new buffer, copy, FREE the old one.
// 'first' would then point into freed memory (use-after-free).
// In C++ this compiles and sometimes crashes in production. In Rust it never compiles.
`}</Code>
        <Callout kind="deep">
          The compiler tracks borrows only as long as they are <b>actually used</b> (this is called "non-lexical lifetimes").
          If you delete the <code>println!("{"{first}"}")</code> line above, the code compiles, because <code>first</code> is dead before the push.
        </Callout>
      </Section>

      <Section title="Lifetimes: how long a reference is valid">
        <p>A <b>lifetime</b> is the region of code where a reference is valid. Most of the time the compiler figures it out alone.
          Sometimes, when a function returns a reference, you must tell it <b>which input the output borrows from</b>.</p>
        <Code title="lifetimes.rs">{`
// The returned &str points into 'text', so it cannot outlive 'text'.
// 'a is a name for "the lifetime of text". Read it as: output lives as long as input.
fn first_word<'a>(text: &'a str) -> &'a str {
    text.split_whitespace().next().unwrap_or("")
}

// Two inputs: the compiler cannot guess which one the result borrows from,
// so we must say it. Here both must live at least as long as the result.
fn longer<'a>(x: &'a str, y: &'a str) -> &'a str {
    if x.len() >= y.len() { x } else { y }
}

fn main() {
    let w;
    {
        let prompt = String::from("hello kiln");
        w = first_word(&prompt);
        println!("{w}");          // ok: prompt is still alive
    }                             // prompt is dropped here
    // println!("{w}");           // ERROR: 'prompt' does not live long enough
}
`}</Code>
        <Callout kind="analogy">
          A reference is a library card for a book. The lifetime is the loan period. The compiler is the librarian who makes sure
          nobody keeps reading a book after the library has thrown it away.
        </Callout>
        <Callout kind="kiln">
          In Kiln, the engine reads model weights through a <code>{"&[u8]"}</code> slice that points into a memory-mapped file.
          The lifetime makes sure no tensor can outlive the file mapping. If someone tried to keep a weight slice after unmapping the file,
          the code would not compile.
        </Callout>
        <Quiz q="Why can a function NOT return a reference to its own local String?"
          options={["References cannot be returned at all", "The String is dropped when the function returns, so the reference would point to freed memory", "Strings are always on the stack", "Because of Copy"]} answer={1}
          explain="Local variables are dropped at the end of the function. A reference to them would dangle. Return the String itself (move ownership out) instead." />
      </Section>

      <Section title="Smart pointers: Box, Rc, Arc">
        <p>Sometimes one owner is not enough: the model weights are used by every request at the same time. Rust has
          <b> smart pointers</b> for these cases. They are normal structs that own heap memory and run code when dropped.</p>
        <SmartPointers />
        <Callout kind="warn">
          <code>Arc</code> gives shared <b>read</b> access. To change shared data you need a lock inside it: <code>{"Arc<Mutex<T>>"}</code>.
          That is in the concurrency lesson. Also: two Arcs that point at each other form a cycle and are never freed (a leak). Use <code>Weak</code> for back-pointers.
        </Callout>
      </Section>

      <Section title="Drop: cleanup that always runs">
        <p>Rule 3 says the value is dropped when its owner dies. You can run your own code at that moment by implementing <code>Drop</code>.
          This pattern is called <b>RAII</b> (resource acquisition is initialization): getting a resource = creating a value; releasing it = dropping the value.</p>
        <Code title="raii.rs — the pattern Kiln uses for KV-cache blocks">{`
struct KvBlocks {
    ids: Vec<u32>,        // which cache blocks this request holds
}

impl Drop for KvBlocks {
    fn drop(&mut self) {
        // In Kiln this returns the blocks to the allocator's free list.
        println!("returning {} KV blocks to the pool", self.ids.len());
    }
}

fn handle_request() {
    let blocks = KvBlocks { ids: vec![7, 8, 9] };
    // ... generate tokens ...
    // Even if we return early, or a '?' error exits, or the task is cancelled,
    // 'blocks' is dropped and the KV memory goes back. No leak possible.
}
`}</Code>
        <Callout kind="kiln">
          This is how Kiln guarantees that a client disconnect frees GPU memory: the request's KV blocks and GPU buffers are owned by values
          with <code>Drop</code>. When the request task is cancelled, those values are dropped, and the memory returns to the pool automatically.
        </Callout>
      </Section>

      <Recap items={[
        "Stack = fast, fixed size, auto-freed. Heap = flexible, must be freed exactly once.",
        "Every value has one owner. Assignment and function calls MOVE ownership; the old name becomes unusable.",
        ".clone() is an explicit, visible deep copy. Small Copy types (numbers, bool) are copied automatically.",
        "Borrow with & (many readers) or &mut (one writer). Never both at once → no data races, no use-after-free.",
        "Lifetimes tell the compiler how long a reference is valid. The compiler infers most of them.",
        "Box = one owner on the heap. Rc = shared, single thread. Arc = shared across threads.",
        "Drop runs cleanup automatically. Kiln uses it to free KV blocks and GPU memory on cancel.",
      ]} />
    </>
  );
}
