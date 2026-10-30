import { useMemo, useState } from "react";
import { PageHeader, Section, Callout, Code, Viz, Slider, Seg, Stepper, Quiz, Recap, Svg } from "../components/ui";

/* ---------- Threads vs async timeline ---------- */

type Mode = "threads" | "async";
type Cell = "cpu" | "wait" | "queued" | "done";

// Each request: 1 tick of CPU (parse), 6 ticks waiting (network / GPU), 1 tick CPU (write response).
const PLAN: ("cpu" | "wait")[] = ["cpu", "wait", "wait", "wait", "wait", "wait", "wait", "cpu"];

function simulate(n: number, mode: Mode, lanes: number): Cell[][] {
  const rows: Cell[][] = Array.from({ length: n }, () => []);
  const pos = Array(n).fill(0);
  for (let t = 0; t < 40; t++) {
    let free = mode === "threads" ? Infinity : lanes;
    for (let i = 0; i < n; i++) {
      if (pos[i] >= PLAN.length) { rows[i].push("done"); continue; }
      if (PLAN[pos[i]] === "wait") { rows[i].push("wait"); pos[i]++; continue; }
      if (free > 0) { free--; rows[i].push("cpu"); pos[i]++; }
      else rows[i].push("queued");
    }
    if (pos.every((p) => p >= PLAN.length)) break;
  }
  return rows;
}

function Timeline() {
  const [mode, setMode] = useState<Mode>("async");
  const [n, setN] = useState(6);
  const lanes = 2;
  const rows = useMemo(() => simulate(n, mode, lanes), [n, mode]);
  const ticks = Math.max(...rows.map((r) => r.filter((c) => c !== "done").length));
  const W = 26;
  const color: Record<Cell, string> = { cpu: "var(--c1)", wait: "var(--panel-2)", queued: "var(--c2-soft)", done: "transparent" };
  const threads = mode === "threads" ? n : lanes;
  const mem = mode === "threads" ? `${n} × 2 MiB stack = ${2 * n} MiB reserved` : `${lanes} threads × 2 MiB + ${n} tasks × ~1 KiB`;
  return (
    <Viz title="Threads vs async: who waits, and how much does it cost?" hint="Each request: 1 tick of CPU work, 6 ticks waiting for I/O (network, GPU), 1 tick of CPU work.">
      <div className="controls">
        <Seg options={["threads", "async"] as const} value={mode} onChange={setMode} labels={{ threads: "1 OS thread per request", async: "async: 2 threads, many tasks" }} />
        <Slider label="concurrent requests" value={n} min={1} max={10} onChange={setN} />
      </div>
      <Svg w={Math.min(720, 80 + ticks * W)} h={40 + n * 30} label="timeline">
        {rows.map((r, i) => (
          <g key={i}>
            <text x={10} y={30 + i * 30} fontSize={11} fill="var(--muted)" fontFamily="var(--mono)">req {i + 1}</text>
            {r.map((c, t) => c === "done" ? null : (
              <rect key={t} x={60 + t * W} y={16 + i * 30} width={W - 2} height={20} rx={3} fill={color[c]}
                stroke={c === "wait" ? "var(--border)" : "none"} />
            ))}
          </g>
        ))}
        <text x={60} y={10} fontSize={10} fill="var(--muted)">time →</text>
      </Svg>
      <div className="controls small">
        <span><span className="pill" style={{ background: "var(--c1)", color: "white" }}>CPU</span> running on a thread</span>
        <span><span className="pill">wait</span> waiting for I/O (no CPU used)</span>
        <span><span className="pill" style={{ background: "var(--c2-soft)" }}>queued</span> ready, waiting for a free thread</span>
      </div>
      <table><tbody>
        <tr><th>OS threads</th><td>{threads}</td></tr>
        <tr><th>All requests finished after</th><td>{ticks} ticks</td></tr>
        <tr><th>Memory for stacks</th><td>{mem}</td></tr>
        <tr><th>Observation</th><td>{mode === "threads"
          ? "Every request has its own thread, but each thread spends 75% of its life asleep. With 10,000 connections that is 10,000 threads and ~20 GB of reserved stack."
          : "Two threads serve every request. While one task waits, the thread runs another. Occasionally a task is ready but must wait a tick (orange): that is the price, and it is small."}</td></tr>
      </tbody></table>
    </Viz>
  );
}

/* ---------- Executor stepper ---------- */

type TaskState = { name: string; state: "ready" | "running" | "pending" | "done"; at: string };
function ExecPicture(props: { queue: string[]; tasks: TaskState[]; reactor: string[]; note: string; thread: string }) {
  const stateColor = { ready: 2, running: 1, pending: 4, done: 3 } as const;
  return (
    <div>
      <Svg w={720} h={230} label="executor">
        <rect x={10} y={10} width={220} height={100} rx={8} fill="var(--panel-2)" stroke="var(--border)" />
        <text x={22} y={30} fontSize={12} fontWeight={700} fill="var(--text)">Ready queue</text>
        {props.queue.length === 0 && <text x={22} y={70} fontSize={12} fill="var(--muted)">(empty)</text>}
        {props.queue.map((q, i) => (
          <g key={q + i} className="fade-in"><rect x={22 + i * 60} y={48} width={50} height={40} rx={6} fill="var(--c2-soft)" stroke="var(--c2)" />
            <text x={47 + i * 60} y={73} textAnchor="middle" fontSize={13} fontWeight={700} fill="var(--text)">{q}</text></g>
        ))}
        <rect x={10} y={124} width={220} height={96} rx={8} fill="var(--c1-soft)" stroke="var(--c1)" />
        <text x={22} y={144} fontSize={12} fontWeight={700} fill="var(--text)">Worker thread</text>
        <text x={22} y={168} fontSize={12} fill="var(--text)" fontFamily="var(--mono)">{props.thread}</text>
        <rect x={250} y={10} width={240} height={210} rx={8} fill="var(--panel)" stroke="var(--border)" />
        <text x={262} y={30} fontSize={12} fontWeight={700} fill="var(--text)">Tasks (futures)</text>
        {props.tasks.map((t, i) => (
          <g key={t.name}>
            <rect x={262} y={44 + i * 82} width={216} height={70} rx={7} fill={`var(--c${stateColor[t.state]}-soft)`} stroke={`var(--c${stateColor[t.state]})`} />
            <text x={274} y={64 + i * 82} fontSize={13} fontWeight={700} fill="var(--text)">task {t.name}: {t.state.toUpperCase()}</text>
            <text x={274} y={84 + i * 82} fontSize={11} fill="var(--muted)" fontFamily="var(--mono)">{t.at}</text>
          </g>
        ))}
        <rect x={510} y={10} width={200} height={210} rx={8} fill="var(--c4-soft)" stroke="var(--c4)" />
        <text x={522} y={30} fontSize={12} fontWeight={700} fill="var(--text)">Reactor (OS I/O: IOCP)</text>
        {props.reactor.map((r, i) => <text key={i} x={522} y={56 + i * 22} fontSize={11} fill="var(--text)" fontFamily="var(--mono)">{r}</text>)}
      </Svg>
      <p className="small">{props.note}</p>
    </div>
  );
}

function ExecutorStepper() {
  return (
    <Stepper title="Inside an async runtime (tokio), step by step" hint="Two tasks: A reads a request from a socket, B sleeps for 100 ms."
      steps={[
        { title: "tokio::spawn(A); tokio::spawn(B);", body: <ExecPicture queue={["A", "B"]} thread="idle" reactor={["(nothing registered)"]}
          tasks={[{ name: "A", state: "ready", at: "state 0: not started" }, { name: "B", state: "ready", at: "state 0: not started" }]}
          note="spawn does not run anything. It puts the task (a future) in the ready queue. A future is a value that knows how to make progress when polled." /> },
        { title: "Poll A: it reaches socket.read().await", body: <ExecPicture queue={["B"]} thread="poll(A)" reactor={["socket#7 → wake A"]}
          tasks={[{ name: "A", state: "pending", at: "state 1: waiting at read()" }, { name: "B", state: "ready", at: "state 0: not started" }]}
          note="The thread calls A.poll(). A runs until its first .await. The socket has no data yet, so A registers its waker with the reactor and returns Poll::Pending. A remembers where it stopped (state 1)." /> },
        { title: "Poll B: it reaches sleep(100ms).await", body: <ExecPicture queue={[]} thread="poll(B)" reactor={["socket#7 → wake A", "timer +100ms → wake B"]}
          tasks={[{ name: "A", state: "pending", at: "state 1: waiting at read()" }, { name: "B", state: "pending", at: "state 1: waiting at sleep" }]}
          note="Same for B. Both tasks are now parked. They use no CPU, only the few bytes of memory that hold their state." /> },
        { title: "Nothing to do: the thread sleeps in the OS", body: <ExecPicture queue={[]} thread="blocked in OS wait" reactor={["socket#7 → wake A", "timer +100ms → wake B"]}
          tasks={[{ name: "A", state: "pending", at: "state 1" }, { name: "B", state: "pending", at: "state 1" }]}
          note="The ready queue is empty. The thread asks the OS: 'wake me when any of these sockets or timers is ready' (IOCP on Windows, epoll on Linux). CPU usage: zero." /> },
        { title: "Data arrives on socket #7", body: <ExecPicture queue={["A"]} thread="woken by OS" reactor={["timer +100ms → wake B"]}
          tasks={[{ name: "A", state: "ready", at: "state 1 → will resume" }, { name: "B", state: "pending", at: "state 1" }]}
          note="The OS wakes the thread. The reactor calls A's waker. The waker's only job is to put A back in the ready queue." /> },
        { title: "Poll A again: it continues and finishes", body: <ExecPicture queue={[]} thread="poll(A) → Ready" reactor={["timer +100ms → wake B"]}
          tasks={[{ name: "A", state: "done", at: "returned Poll::Ready(bytes)" }, { name: "B", state: "pending", at: "state 1" }]}
          note="A resumes exactly after the .await (the compiler turned the async fn into a state machine). It finishes and returns Poll::Ready. The task is dropped. Later the timer fires and B runs the same way." /> },
      ]} />
  );
}

/* ---------- Cancellation demo ---------- */

function CancelDemo() {
  const [cut, setCut] = useState(6);
  const total = 12;
  const disconnected = cut < total;
  const chain = ["client closes TCP", "gateway: response body dropped", "stream future dropped", "kiln-wire: Cancel frame sent", "worker: engine.cancel(seq)", "KvBlocks dropped → blocks back to pool"];
  return (
    <Viz title="Client disconnect = drop = free GPU memory" hint="The answer needs 12 tokens. Move the slider to choose when the client disconnects.">
      <Slider label="client disconnects after token" value={cut} min={1} max={total} onChange={setCut} format={(v) => (v === total ? "never" : String(v))} />
      <div style={{ display: "flex", gap: 4, margin: "12px 0", flexWrap: "wrap" }}>
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} style={{ width: 44, height: 30, borderRadius: 5, display: "grid", placeItems: "center", fontSize: 11, fontFamily: "var(--mono)",
            background: i < cut ? "var(--c3-soft)" : "var(--panel-2)", border: `1px solid ${i < cut ? "var(--c3)" : "var(--border)"}`, opacity: i < cut ? 1 : 0.4 }}>
            t{i + 1}
          </div>
        ))}
      </div>
      {disconnected ? (
        <div className="fade-in" key={cut}>
          <ol className="small">{chain.map((c, i) => <li key={i}>{c}</li>)}</ol>
          <p className="small">Tokens generated: <b>{cut}</b>. Billed: <b>{cut}</b> output tokens. GPU work saved: <b>{total - cut}</b> decode steps. KV blocks freed immediately.</p>
        </div>
      ) : <p className="small">The client stayed. All 12 tokens were generated and billed; blocks are freed when the sequence finishes normally.</p>}
    </Viz>
  );
}

export default function Page() {
  return (
    <>
      <PageHeader kicker="Rust · Lesson 4" title="Threads, async & channels"
        subtitle="How Kiln serves many users at once without wasting CPU, and why it cannot have data races."
        learn={[
          "Concurrency vs parallelism, and why servers mostly wait",
          "OS threads, Send and Sync, Arc<Mutex<T>>",
          "Channels: passing messages between threads and tasks",
          "What async/await really is: futures as state machines, polling, wakers, the executor",
          "tokio::spawn, select!, timeouts, and cancellation by drop (how a disconnect frees the GPU)",
        ]} />

      <Section title="Concurrency vs parallelism">
        <div className="grid2">
          <div className="card"><h4>Concurrency</h4><p className="small">Dealing with many things at once. One cook with five pots: stir one, while another heats up.</p></div>
          <div className="card"><h4>Parallelism</h4><p className="small">Doing many things at the same instant. Five cooks, each with one pot. Needs multiple CPU cores.</p></div>
        </div>
        <p>Kiln needs both. The gateway mostly <b>waits</b> (for the client to send bytes, for the scheduler, for the next token). That is a concurrency problem.
          The engine does heavy math on all CPU cores or the GPU. That is a parallelism problem. Rust gives us <b>threads</b> for parallelism and <b>async</b> for cheap concurrency.</p>
      </Section>

      <Section title="Threads">
        <p>An <b>OS thread</b> is an independent line of execution that the operating system schedules onto CPU cores. Each one has its own stack (2 MiB by default for Rust-spawned threads).</p>
        <Code title="threads.rs — split a big sum across cores">{`
use std::thread;

fn main() {
    let weights: Vec<f32> = (0..8_000_000).map(|i| (i % 7) as f32).collect();
    let n_threads = 4;
    let chunk = weights.len() / n_threads;

    // thread::scope lets threads BORROW 'weights' safely: the scope guarantees
    // every thread finishes before 'weights' can be dropped.
    let total: f32 = thread::scope(|s| {
        let handles: Vec<_> = weights
            .chunks(chunk)                                   // 4 non-overlapping slices
            .map(|part| s.spawn(move || part.iter().sum::<f32>()))
            .collect();
        handles.into_iter().map(|h| h.join().unwrap()).sum() // wait for each, add up
    });
    println!("sum = {total}");
}
`}</Code>
        <Callout kind="kiln">
          The CPU backend of our engine works exactly like this: a matrix multiplication splits the output rows into chunks, and each core computes its chunk.
          The chunks do not overlap, so the borrow checker can prove the threads never write to the same memory.
        </Callout>
      </Section>

      <Section title="Send and Sync: thread safety checked by the compiler">
        <p>Two marker traits decide what may cross thread boundaries. The compiler implements them automatically when it is safe.</p>
        <table>
          <thead><tr><th>Trait</th><th>Meaning</th><th>Example that is NOT</th></tr></thead>
          <tbody>
            <tr><td><code>Send</code></td><td>Ownership can be <b>moved</b> to another thread</td><td><code>Rc</code> (its counter is not atomic), raw pointers</td></tr>
            <tr><td><code>Sync</code></td><td>A <code>&amp;T</code> can be <b>shared</b> between threads</td><td><code>RefCell</code>, <code>Cell</code> (unsynchronised mutation)</td></tr>
          </tbody>
        </table>
        <Code title="the compiler refuses unsafe sharing">{`
use std::rc::Rc;
let shared = Rc::new(5);
std::thread::spawn(move || println!("{shared}"));
// error[E0277]: Rc<i32> cannot be sent between threads safely
//   the trait Send is not implemented for Rc<i32>
// Fix: use Arc (atomic reference counting).
`}</Code>
      </Section>

      <Section title="Shared state: Arc<Mutex<T>>">
        <p>To <b>change</b> shared data from several threads you need a lock. A <code>Mutex</code> ("mutual exclusion") lets only one thread in at a time.
          In Rust the data lives <b>inside</b> the mutex, so you physically cannot touch it without locking first.</p>
        <Code title="a shared in-memory rate-limit table">{`
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::thread;

fn main() {
    // Arc = shared ownership across threads. Mutex = one writer at a time.
    let used: Arc<Mutex<HashMap<String, u64>>> = Arc::new(Mutex::new(HashMap::new()));

    let mut handles = vec![];
    for i in 0..4 {
        let used = Arc::clone(&used);               // each thread gets its own handle
        handles.push(thread::spawn(move || {
            let mut map = used.lock().unwrap();     // wait for the lock; get a guard
            *map.entry(format!("key-{}", i % 2)).or_insert(0) += 100;
        }));                                        // guard dropped here -> unlocked
    }
    for h in handles { h.join().unwrap(); }
    println!("{:?}", used.lock().unwrap());         // {"key-0": 200, "key-1": 200}
}
`}</Code>
        <Callout kind="warn">
          Locks are simple but can become a bottleneck: every request waiting for one mutex is serialised. Keep the locked section tiny, never hold a
          <code>std::sync::Mutex</code> guard across an <code>.await</code>, and prefer sharding (many small locks) or atomics for hot counters.
        </Callout>
      </Section>

      <Section title="Channels: share by communicating">
        <p>Instead of sharing memory, threads can send <b>messages</b> through a channel. One side sends, the other receives. Ownership of each message
          moves through the channel, so there is nothing to lock.</p>
        <Code title="token stream from the engine thread to the request task">{`
use std::sync::mpsc;      // multi-producer, single-consumer
use std::thread;

fn main() {
    let (tx, rx) = mpsc::channel::<String>();

    // The "engine": produces tokens on its own thread.
    thread::spawn(move || {
        for tok in ["Hello", ",", " world", "!"] {
            tx.send(tok.to_string()).unwrap();   // ownership moves into the channel
        }
        // tx dropped here -> channel closes -> receiver's loop ends
    });

    // The "request handler": consumes tokens as they arrive.
    for tok in rx {
        print!("{tok}");
    }
    println!();
}
`}</Code>
        <Callout kind="kiln">
          Kiln's worker uses exactly this shape: one engine loop thread owns the GPU and the model, and each request gets a <b>bounded</b> channel
          for its tokens. Bounded (fixed capacity) is important: if a client reads slowly, the channel fills and the producer notices,
          instead of buffering unlimited memory (this is called <b>backpressure</b>).
        </Callout>
      </Section>

      <Section title="Why async?">
        <p>A gateway with 10,000 open streaming connections spends almost all its time waiting. With one thread per connection, we pay for 10,000 stacks
          and the OS spends time switching between threads. <b>Async</b> lets a few threads juggle thousands of waiting tasks.</p>
        <Timeline />
      </Section>

      <Section title="What async/await really is">
        <p>An <code>async fn</code> does not run when you call it. It returns a <b>future</b>: a value that represents work not yet done.
          Something must <b>poll</b> it to make progress. The compiler turns the function body into a <b>state machine</b>: each <code>.await</code> is a point where it can pause and later resume.</p>
        <Code title="what you write">{`
async fn handle(mut sock: TcpStream) -> io::Result<()> {
    let mut buf = [0u8; 1024];
    let n = sock.read(&mut buf).await?;    // pause point 1
    let reply = process(&buf[..n]);
    sock.write_all(&reply).await?;         // pause point 2
    Ok(())
}
`}</Code>
        <Code title="roughly what the compiler generates (simplified)">{`
enum HandleFuture {
    Start   { sock: TcpStream },
    Reading { sock: TcpStream, buf: [u8; 1024] },
    Writing { sock: TcpStream, reply: Vec<u8> },
    Done,
}

// The Future trait (from std). The executor calls poll() again and again.
trait Future {
    type Output;
    fn poll(self: Pin<&mut Self>, cx: &mut Context) -> Poll<Self::Output>;
}
enum Poll<T> { Ready(T), Pending }
// poll(): run until the next await point. If the I/O is not ready, store the
// waker from 'cx' (so the reactor can wake us later) and return Pending.
`}</Code>
        <ExecutorStepper />
        <Callout kind="idea">
          Three parts, three jobs: the <b>future</b> knows how to make progress; the <b>executor</b> decides which future to poll next; the <b>reactor</b>
          talks to the OS and calls <b>wakers</b> when I/O is ready. tokio provides the executor and the reactor.
        </Callout>
        <Callout kind="warn">
          Never do long CPU work (like a matrix multiply) or blocking calls inside an async task. It holds the thread, and every other task on it stalls.
          Use <code>tokio::task::spawn_blocking</code> or a dedicated thread. That is why Kiln's engine loop runs on its <b>own OS thread</b>, not as a tokio task.
        </Callout>
        <Quiz q="An async task calls std::thread::sleep(Duration::from_secs(1)) (not the tokio version). What happens?"
          options={["Only that task sleeps", "The whole worker thread is blocked for 1 s, so all tasks on it stall", "tokio converts it automatically", "Compile error"]} answer={1}
          explain="std::thread::sleep blocks the OS thread. Tasks cannot pause unless they reach an .await on something async. Use tokio::time::sleep(..).await instead." />
      </Section>

      <Section title="tokio in practice">
        <Code title="a minimal TCP server: one task per connection">{`
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

#[tokio::main]                     // macro: builds a multi-threaded runtime and runs main on it
async fn main() -> std::io::Result<()> {
    let listener = TcpListener::bind("127.0.0.1:8080").await?;
    loop {
        let (mut sock, addr) = listener.accept().await?;   // wait for a client
        tokio::spawn(async move {                          // new task, very cheap
            let mut buf = vec![0u8; 4096];
            let n = sock.read(&mut buf).await.unwrap_or(0);
            println!("{addr} sent {n} bytes");
            let _ = sock.write_all(b"HTTP/1.1 200 OK\\r\\ncontent-length: 2\\r\\n\\r\\nok").await;
        });
    }
}
`}</Code>
        <Code title="select!, timeouts and cancellation">{`
use tokio::time::{timeout, Duration};

// Wait for whichever happens first: next token, client disconnect, or a stall.
loop {
    tokio::select! {
        ev = tokens.recv() => match ev {
            Some(ev) => write_sse(&mut body, ev).await?,
            None => break,                         // engine finished
        },
        _ = client_closed.notified() => {
            break;                                 // leaving the loop drops 'tokens' -> Cancel
        }
        _ = tokio::time::sleep(Duration::from_secs(30)) => {
            return Err(Error::Stalled);           // no token for 30 s
        }
    }
}

// Or wrap any future with a deadline:
let reply = timeout(Duration::from_secs(5), scheduler.submit(req)).await;  // Err(Elapsed) if too slow
`}</Code>
        <Callout kind="deep">
          <b>Cancellation in Rust async = dropping the future.</b> If nobody polls a future again and it is dropped, it simply stops at its last
          <code>.await</code>, and all values it owns are dropped (running their <code>Drop</code> code). There is no exception, no special API.
          This is why RAII matters so much: cleanup must live in <code>Drop</code>, because code after the <code>.await</code> may never run.
        </Callout>
        <CancelDemo />
        <Quiz q="In Kiln, how does the KV cache get freed when a user closes their browser mid-answer?"
          options={["A cron job scans for idle sequences every minute", "The gateway's future is dropped, which drops the stream, which sends Cancel; the worker drops the sequence's KvBlocks", "The GPU frees it by itself", "It is never freed until restart"]} answer={1}
          explain="Cancellation travels as a chain of drops: response body → stream → wire Cancel frame → engine.cancel → KvBlocks::drop. Each step is automatic." />
      </Section>

      <Recap items={[
        "Concurrency = juggling many waiting things. Parallelism = computing on many cores at once. Kiln needs both.",
        "Threads are real OS workers (2 MiB stack each). thread::scope lets threads borrow data safely.",
        "Send/Sync are checked by the compiler: unsafe sharing does not compile.",
        "Arc<Mutex<T>> = shared mutable state; the data is only reachable through the lock.",
        "Channels move ownership of messages between threads; bounded channels give backpressure.",
        "async fn → future → state machine. Executor polls, reactor waits on the OS, wakers re-queue tasks.",
        "Never block inside async. The engine loop runs on its own thread.",
        "Dropping a future cancels it; Drop impls do the cleanup. That is how disconnects free GPU memory.",
      ]} />
    </>
  );
}
