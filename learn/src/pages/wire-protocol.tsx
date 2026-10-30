import { useEffect, useMemo, useState } from "react";
import {
  Arrow, Box, Callout, Code, PageHeader, Quiz, Recap, Section, Seg, Slider, Stepper, Svg, Viz,
} from "../components/ui";

/* ---------- frame model (proposed kiln-wire v1) ---------- */

const FRAME_TYPES = {
  Generate: 1, TokenDelta: 2, Finished: 3, Error: 4, Cancel: 5, Heartbeat: 6, Ping: 7, Pong: 8,
} as const;
type FrameType = keyof typeof FRAME_TYPES;
const TYPE_NAMES = Object.keys(FRAME_TYPES) as FrameType[];

const enc = new TextEncoder();
const h2 = (b: number) => b.toString(16).padStart(2, "0");

function u32le(n: number) { return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]; }
function u64le(n: number) {
  // JS numbers are exact up to 2^53, enough for a demo
  const lo = n % 2 ** 32, hi = Math.floor(n / 2 ** 32);
  return [...u32le(lo), ...u32le(hi)];
}

function encodeFrame(type: FrameType, streamId: number, payload: string) {
  const p = Array.from(enc.encode(payload));
  const len = 1 + 8 + p.length; // everything after the length field
  return { len: u32le(len), type: [FRAME_TYPES[type]], sid: u64le(streamId), payload: p, total: 4 + len };
}

/* ---------- Visual 1: the framing problem ---------- */

const MSGS = ["Generate#1", "Cancel#7", "Ping"];

function FramingProblem() {
  const [mode, setMode] = useState<"none" | "prefix">("none");
  const [cut, setCut] = useState(7);

  const wire = useMemo(() => {
    if (mode === "none") return MSGS.join("");
    return MSGS.map((m) => `[${String(m.length).padStart(2, "0")}]${m}`).join("");
  }, [mode]);

  // split the wire stream into reads of size `cut`
  const reads: string[] = [];
  for (let i = 0; i < wire.length; i += cut) reads.push(wire.slice(i, i + cut));

  // decoder for prefix mode
  const decoded: string[] = [];
  if (mode === "prefix") {
    let buf = "";
    for (const r of reads) {
      buf += r;
      while (buf.length >= 4) {
        const n = Number(buf.slice(1, 3));
        if (buf.length < 4 + n) break;
        decoded.push(buf.slice(4, 4 + n));
        buf = buf.slice(4 + n);
      }
    }
  }

  return (
    <Viz title="The framing problem"
      hint="We send 3 messages. TCP delivers the bytes in reads of N bytes (move the slider). Can the receiver find the messages again?">
      <div className="controls">
        <Seg options={["none", "prefix"] as const} value={mode} onChange={setMode} labels={{ none: "no framing", prefix: "length prefix [NN]" }} />
        <Slider label="bytes per read()" value={cut} min={2} max={16} onChange={setCut} />
      </div>
      <div className="small muted">Sender wrote:</div>
      <div className="bytes" style={{ marginBottom: 8 }}>
        {MSGS.map((m, i) => <span key={i} style={{ background: `var(--c${i + 1}-soft)` }}>{mode === "prefix" && <b>[{String(m.length).padStart(2, "0")}]</b>}{m}</span>)}
      </div>
      <div className="small muted">Receiver got these reads:</div>
      <div className="bytes" style={{ marginBottom: 8 }}>
        {reads.map((r, i) => <span key={i}>{r}</span>)}
      </div>
      <div className="small muted">Receiver understands:</div>
      {mode === "none"
        ? <div className="card small">❌ Just one long string <span className="mono">"{wire}"</span>. Is "Ping" one message, or the end of "Cancel#7Ping"? Impossible to know.</div>
        : <div className="bytes">{decoded.map((d, i) => <span key={i} style={{ background: `var(--c${i + 1}-soft)` }}>✅ {d}</span>)}</div>}
    </Viz>
  );
}

/* ---------- Visual 2: frame encoder ---------- */

function FrameEncoder() {
  const [type, setType] = useState<FrameType>("TokenDelta");
  const [sid, setSid] = useState(42);
  const [payload, setPayload] = useState('{"text":" Hello"}');
  const noPayload = type === "Cancel" || type === "Ping" || type === "Pong";
  const f = encodeFrame(type, sid, noPayload ? "" : payload);

  const field = (label: string, bytes: number[], color: number, note: string) => (
    <div style={{ marginBottom: 8 }}>
      <div className="small"><b style={{ color: `var(--c${color})` }}>{label}</b> <span className="muted">— {note}</span></div>
      <div className="bytes">{bytes.length === 0 ? <span className="muted">(empty)</span> : bytes.map((b, i) =>
        <span key={i} style={{ background: `var(--c${color}-soft)`, borderColor: `var(--c${color})` }}>{h2(b)}</span>)}</div>
    </div>
  );

  return (
    <Viz title="Encode a kiln-wire frame (proposed format)"
      hint="Pick a frame type, stream id and payload. Every byte is shown in hex, coloured by field. Numbers are little-endian (lowest byte first)."
      caption={<>Total frame: <b>{f.total}</b> bytes = 4 (length) + {f.total - 4} (the length value). The receiver reads 4 bytes, learns how many more to read, and never guesses.</>}>
      <div className="controls">
        <select className="btn" value={type} onChange={(e) => setType(e.target.value as FrameType)}>
          {TYPE_NAMES.map((t) => <option key={t} value={t}>{FRAME_TYPES[t]} · {t}</option>)}
        </select>
        <Slider label="stream_id" value={sid} min={0} max={70000} onChange={setSid} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <div className="small muted">payload (UTF-8 JSON in v1 — could become a binary encoding later)</div>
        <input type="text" value={noPayload ? "" : payload} disabled={noPayload} onChange={(e) => setPayload(e.target.value)} />
      </div>
      <div className="bytes" style={{ marginBottom: 12 }}>
        {[...f.len.map((b) => [b, 1]), ...f.type.map((b) => [b, 2]), ...f.sid.map((b) => [b, 4]), ...f.payload.map((b) => [b, 3])].map(([b, c], i) =>
          <span key={i} style={{ background: `var(--c${c}-soft)` }}>{h2(b)}</span>)}
      </div>
      {field("len: u32", f.len, 1, `${f.total - 4} = 1 + 8 + ${f.payload.length} payload bytes`)}
      {field("type: u8", f.type, 2, `${FRAME_TYPES[type]} = ${type}`)}
      {field("stream_id: u64", f.sid, 4, `${sid} → which request this frame belongs to`)}
      {field("payload", f.payload, 3, noPayload ? "this frame type carries no payload" : `${f.payload.length} bytes`)}
    </Viz>
  );
}

/* ---------- Visual 3: multiplexing ---------- */

type Wf = { sid: number; kind: "Tok" | "Fin" | "Cancel"; text: string };

const STREAM_TEXT: Record<number, string[]> = {
  1: ["The", " sky", " is", " blue", "."],
  2: ["Rust", " is", " a", " systems", " language", " with", " no", " GC", "."],
  3: ["Hi", "!"],
};

function Multiplex() {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [cancelAt, setCancelAt] = useState<number | null>(null);

  // build interleaved frame sequence deterministically: round-robin over live streams
  const frames = useMemo(() => {
    const out: Wf[] = [];
    const pos: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
    const done: Record<number, boolean> = { 1: false, 2: false, 3: false };
    let step = 0;
    while (!(done[1] && done[2] && done[3]) && step < 100) {
      for (const sid of [1, 2, 3]) {
        if (done[sid]) continue;
        if (sid === 2 && cancelAt !== null && out.length >= cancelAt) {
          out.push({ sid, kind: "Cancel", text: "" });
          done[sid] = true;
          continue;
        }
        const toks = STREAM_TEXT[sid];
        if (pos[sid] < toks.length) out.push({ sid, kind: "Tok", text: toks[pos[sid]++] });
        else { out.push({ sid, kind: "Fin", text: "" }); done[sid] = true; }
      }
      step++;
    }
    return out;
  }, [cancelAt]);

  useEffect(() => {
    if (!playing) return;
    if (t >= frames.length) { setPlaying(false); return; }
    const id = setTimeout(() => setT((x) => x + 1), 380);
    return () => clearTimeout(id);
  }, [playing, t, frames.length]);

  const seen = frames.slice(0, t);
  const textOf = (sid: number) => seen.filter((f) => f.sid === sid && f.kind === "Tok").map((f) => f.text).join("");
  const stateOf = (sid: number) => seen.some((f) => f.sid === sid && f.kind === "Cancel") ? "cancelled" : seen.some((f) => f.sid === sid && f.kind === "Fin") ? "finished" : "streaming";
  const colorOf = (sid: number) => (sid === 1 ? 1 : sid === 2 ? 2 : 3);

  return (
    <Viz title="Many requests, one connection"
      hint="The scheduler and a worker share ONE TCP connection. Frames from three requests are interleaved; the stream_id tells the receiver where each frame goes. Try cancelling stream 2."
      caption="Without stream ids we would need one TCP connection per request. With them, one connection carries hundreds of concurrent generations.">
      <div className="controls">
        <button className="btn primary" onClick={() => { if (t >= frames.length) setT(0); setPlaying(!playing); }}>{playing ? "pause" : t >= frames.length ? "replay" : "play"}</button>
        <button className="btn" onClick={() => { setPlaying(false); setT(0); setCancelAt(null); }}>reset</button>
        <button className="btn" disabled={cancelAt !== null || t >= frames.length} onClick={() => setCancelAt(t)}>✋ client of stream 2 disconnects now</button>
      </div>
      <div className="small muted">On the wire (newest on the right):</div>
      <div className="bytes" style={{ minHeight: 32, marginBottom: 12 }}>
        {seen.slice(-14).map((f, i) => (
          <span key={i} className="fade-in" style={{ background: `var(--c${colorOf(f.sid)}-soft)`, borderColor: f.kind !== "Tok" ? `var(--c${colorOf(f.sid)})` : undefined }}>
            s{f.sid}:{f.kind === "Tok" ? JSON.stringify(f.text) : f.kind}
          </span>
        ))}
      </div>
      <div className="grid3">
        {[1, 2, 3].map((sid) => (
          <div key={sid} className="card" style={{ borderColor: `var(--c${colorOf(sid)})` }}>
            <div className="small"><b>stream {sid}</b> · <span className="muted">{stateOf(sid)}</span></div>
            <div style={{ minHeight: 48 }}>{textOf(sid)}</div>
          </div>
        ))}
      </div>
    </Viz>
  );
}

/* ---------- Visual 4: backpressure ---------- */

function Backpressure() {
  const [prod, setProd] = useState(8);
  const [cons, setCons] = useState(4);
  const [cap, setCap] = useState(6);
  const [bounded, setBounded] = useState<"bounded" | "unbounded">("bounded");
  const [sim, setSim] = useState({ q: 0, blocked: 0, tick: 0 });
  const [running, setRunning] = useState(false);
  const { q, blocked, tick } = sim;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setSim((s) => {
        let x = s.q + prod / 10;
        let full = false;
        if (bounded === "bounded" && x > cap) { x = cap; full = true; }
        return { q: Math.max(0, x - cons / 10), blocked: s.blocked + (full ? 1 : 0), tick: s.tick + 1 };
      });
    }, 100);
    return () => clearInterval(id);
  }, [running, prod, cons, cap, bounded]);

  const reset = () => setSim({ q: 0, blocked: 0, tick: 0 });
  const maxShow = bounded === "bounded" ? cap : Math.max(cap, Math.ceil(q) + 2);
  const memMB = (q * 0.25).toFixed(1);

  return (
    <Viz title="Backpressure: what if the producer is faster than the consumer?"
      hint="The worker produces token frames; a slow client consumes them. A bounded channel makes the producer wait when the queue is full. An unbounded one grows forever."
      caption={bounded === "bounded"
        ? `Queue is capped at ${cap}. The producer was told "wait" ${blocked} times — memory stays flat.`
        : `Unbounded: queue holds ${q.toFixed(0)} frames (~${memMB} MB in a real system with big payloads). With a slow client this grows until the process dies.`}>
      <div className="controls">
        <Seg options={["bounded", "unbounded"] as const} value={bounded} onChange={(v) => { setBounded(v); reset(); }} />
        <button className="btn primary" onClick={() => setRunning(!running)}>{running ? "pause" : "run"}</button>
        <button className="btn" onClick={reset}>reset</button>
      </div>
      <div className="controls">
        <Slider label="producer frames/s" value={prod} min={1} max={20} onChange={setProd} />
        <Slider label="consumer frames/s" value={cons} min={1} max={20} onChange={setCons} />
        <Slider label="channel capacity" value={cap} min={1} max={20} onChange={setCap} />
      </div>
      <Svg w={700} h={110} label="producer, queue, consumer">
        <Box x={10} y={30} w={120} h={50} label="worker" sub={`${prod}/s`} color={2} />
        <Arrow x1={130} y1={55} x2={170} y2={55} />
        <rect x={175} y={30} width={360} height={50} rx={8} fill="var(--panel-2)" stroke="var(--border)" />
        {Array.from({ length: Math.min(Math.floor(q), 60) }).map((_, i) => (
          <rect key={i} x={180 + i * (350 / Math.max(maxShow, 1))} y={36} width={Math.max(2, 350 / Math.max(maxShow, 1) - 3)} height={38} rx={3}
            fill={bounded === "bounded" && q >= cap - cons / 10 - 0.01 ? "var(--c5)" : "var(--c1)"} />
        ))}
        <text x={355} y={100} textAnchor="middle" fontSize={12} fill="var(--muted)">queue: {q.toFixed(1)} {bounded === "bounded" ? `/ ${cap}` : "(no limit)"} · t = {(tick / 10).toFixed(1)} s</text>
        <Arrow x1={537} y1={55} x2={575} y2={55} />
        <Box x={580} y={30} w={110} h={50} label="client" sub={`${cons}/s`} color={1} />
      </Svg>
    </Viz>
  );
}

/* ---------- Page ---------- */

export default function Page() {
  return (
    <>
      <PageHeader
        kicker="Platform · Lesson 2"
        title="Our wire protocol (kiln-wire)"
        subtitle="How the gateway, scheduler and workers talk to each other: a small binary protocol we design and write ourselves."
        learn={[
          "Why TCP needs 'framing' and how a length prefix solves it",
          "The exact byte layout of a kiln-wire frame",
          "Multiplexing: many requests over one connection with stream ids",
          "Cancel frames, heartbeats, and backpressure with bounded channels",
          "How to encode and decode frames in Rust with to_le_bytes / from_le_bytes",
        ]}
      />

      <Section title="Why not just use gRPC?">
        <p>
          The original design used <b>gRPC</b> (with the <code>tonic</code> crate and protobuf). gRPC is excellent, and
          most companies should use it. But it hides exactly the things we want to learn: how messages are cut out of a
          byte stream, how many requests share one connection, how a cancel travels, how a slow reader slows down the writer.
        </p>
        <p>
          Our internal traffic is simple: a few message types, one direction of streaming (tokens flow back), all on
          <code>127.0.0.1</code>. A protocol for that fits in ~400 lines of Rust. We call it <b>kiln-wire</b>.
        </p>
        <Callout kind="kiln">
          <b>Proposed</b> (not final): <code>crates/wire</code> replaces <code>crates/proto</code>. Used by
          gateway → scheduler and scheduler → worker. If the team prefers gRPC later, only this crate changes; the
          message meanings (Generate, TokenDelta, Finished, Cancel…) stay the same.
        </Callout>
        <table>
          <thead><tr><th></th><th>gRPC (HTTP/2 + protobuf)</th><th>kiln-wire (ours)</th></tr></thead>
          <tbody>
            <tr><td>Framing</td><td>HTTP/2 frames + gRPC 5-byte prefix</td><td>4-byte length prefix</td></tr>
            <tr><td>Multiplexing</td><td>HTTP/2 streams</td><td><code>stream_id</code> field</td></tr>
            <tr><td>Cancellation</td><td>RST_STREAM, hidden by tonic</td><td>explicit <code>Cancel</code> frame</td></tr>
            <tr><td>Flow control</td><td>HTTP/2 windows (complex)</td><td>bounded channels per stream</td></tr>
            <tr><td>Schema</td><td>.proto files + codegen</td><td>Rust enums + serde (v1: JSON payload)</td></tr>
            <tr><td>Learning value</td><td>low (black box)</td><td>high</td></tr>
          </tbody>
        </table>
      </Section>

      <Section title="Step 1 — The framing problem">
        <p>
          Remember from the HTTP lesson: <b>TCP is a stream of bytes with no message boundaries</b>. If we write three
          messages, the other side may read them glued together, or cut in random places.
        </p>
        <FramingProblem />
        <Callout kind="analogy">
          Imagine sending letters through a pipe as one long paper ribbon. Without marks, the reader cannot tell where
          one letter ends. If every letter starts with "the next 214 characters are one letter", reading is easy:
          read the number, then read exactly that many characters.
        </Callout>
        <p>
          There are three classic solutions: a <b>delimiter</b> (HTTP headers end at <code>\r\n\r\n</code> — but then the
          delimiter cannot appear inside the data), a <b>fixed size</b> (wasteful), or a <b>length prefix</b>. Binary
          protocols almost always choose the length prefix: Kafka, Postgres, Redis (partly), gRPC, and us.
        </p>
      </Section>

      <Section title="Step 2 — The frame layout">
        <Code lang="text" title="kiln-wire frame (v1, proposed)">{`
 0        4    5                  13                         13+N
 ┌────────┬────┬──────────────────┬──────────────────────────┐
 │ len    │type│ stream_id        │ payload (N bytes)        │
 │ u32 LE │ u8 │ u64 LE           │                          │
 └────────┴────┴──────────────────┴──────────────────────────┘
   len = 1 + 8 + N   (bytes AFTER the len field)

 type:  1 Generate    2 TokenDelta   3 Finished   4 Error
        5 Cancel      6 Heartbeat    7 Ping       8 Pong
`}</Code>
        <FrameEncoder />
        <Callout kind="deep">
          <p><b>Little-endian</b> means the least significant byte comes first. The number 300 = 0x0000012C is stored as
          <code>2c 01 00 00</code>. x86 and ARM CPUs are little-endian, so reading it is a plain memory copy. Network
          protocols traditionally use big-endian ("network byte order"); since both ends are ours and run on x86, we
          choose little-endian. What matters is that both sides agree.</p>
        </Callout>
        <p>Rules that make the decoder safe:</p>
        <ul>
          <li><b>Max frame size</b> (e.g. 4 MiB). A corrupt or malicious <code>len</code> of 4 GB must not make us allocate 4 GB.</li>
          <li><b>Unknown type</b> → close the connection with an error. Never guess.</li>
          <li><b>Version handshake</b>: the first frame on a connection says "kiln-wire v1", so future changes are detected.</li>
        </ul>
        <Quiz
          q="A frame has a 20-byte payload. What value is in the len field?"
          options={["20", "24", "29", "33"]}
          answer={2}
          explain="len counts everything after itself: 1 byte type + 8 bytes stream_id + 20 bytes payload = 29. The whole frame on the wire is 4 + 29 = 33 bytes."
        />
      </Section>

      <Section title="Step 3 — The Rust code: encode and decode">
        <Code title="crates/wire/src/frame.rs">{`
use bytes::{Buf, BufMut, BytesMut};

pub const MAX_FRAME: usize = 4 * 1024 * 1024;   // 4 MiB safety limit
const HEADER: usize = 4 + 1 + 8;                 // len + type + stream_id

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum FrameType {
    Generate = 1, TokenDelta = 2, Finished = 3, Error = 4,
    Cancel = 5, Heartbeat = 6, Ping = 7, Pong = 8,
}

impl TryFrom<u8> for FrameType {
    type Error = WireError;
    fn try_from(b: u8) -> Result<Self, WireError> {
        Ok(match b {
            1 => Self::Generate, 2 => Self::TokenDelta, 3 => Self::Finished,
            4 => Self::Error, 5 => Self::Cancel, 6 => Self::Heartbeat,
            7 => Self::Ping, 8 => Self::Pong,
            other => return Err(WireError::UnknownType(other)),
        })
    }
}

#[derive(Debug)]
pub struct Frame {
    pub kind: FrameType,
    pub stream_id: u64,
    pub payload: Vec<u8>,
}

#[derive(Debug, thiserror::Error)]
pub enum WireError {
    #[error("unknown frame type {0}")] UnknownType(u8),
    #[error("frame too large: {0} bytes")] TooLarge(usize),
}

impl Frame {
    /// Append this frame's bytes to \`out\`.
    pub fn encode(&self, out: &mut BytesMut) {
        let len = 1 + 8 + self.payload.len();
        out.reserve(4 + len);
        out.put_slice(&(len as u32).to_le_bytes());     // [u32 len]
        out.put_u8(self.kind as u8);                     // [u8 type]
        out.put_slice(&self.stream_id.to_le_bytes());   // [u64 stream_id]
        out.put_slice(&self.payload);                    // [payload]
    }

    /// Try to cut ONE frame from the front of \`buf\`.
    /// Ok(None) = "not enough bytes yet, read more from the socket".
    pub fn decode(buf: &mut BytesMut) -> Result<Option<Frame>, WireError> {
        if buf.len() < 4 { return Ok(None); }
        let len = u32::from_le_bytes(buf[0..4].try_into().unwrap()) as usize;
        if len > MAX_FRAME { return Err(WireError::TooLarge(len)); }
        if len < 9 || buf.len() < 4 + len { return Ok(None); }

        buf.advance(4);                                  // drop the len field
        let kind = FrameType::try_from(buf.get_u8())?;
        let stream_id = buf.get_u64_le();
        let payload = buf.split_to(len - 9).to_vec();
        Ok(Some(Frame { kind, stream_id, payload }))
    }
}
`}</Code>
        <Callout kind="rust">
          <ul style={{ margin: 0 }}>
            <li><code>#[repr(u8)]</code> makes each enum variant exactly one byte with the number we chose.</li>
            <li><code>to_le_bytes()</code> turns a number into its little-endian bytes: <code>300u32.to_le_bytes() == [0x2c, 0x01, 0, 0]</code>. <code>from_le_bytes</code> does the reverse.</li>
            <li><code>TryFrom</code> is the standard trait for conversions that can fail. Unknown bytes become an error, not a panic.</li>
            <li><code>Ok(None)</code> vs <code>Err(..)</code>: "need more data" is <i>not</i> an error. Only invalid data is.</li>
          </ul>
        </Callout>
        <p>The read loop around <code>decode</code> is short:</p>
        <Code title="crates/wire/src/conn.rs (read side)">{`
pub async fn read_loop(mut sock: OwnedReadHalf, router: Router) -> anyhow::Result<()> {
    let mut buf = BytesMut::with_capacity(64 * 1024);
    loop {
        // 1. cut out every complete frame already in the buffer
        while let Some(frame) = Frame::decode(&mut buf)? {
            router.dispatch(frame).await;          // send to the right stream by stream_id
        }
        // 2. need more bytes: read from the socket (appends to buf)
        if sock.read_buf(&mut buf).await? == 0 {
            anyhow::bail!("peer closed the connection");
        }
    }
}
`}</Code>
      </Section>

      <Section title="Step 4 — Multiplexing, cancel and heartbeats">
        <p>
          The scheduler keeps <b>one</b> long-lived TCP connection to each worker. Every request gets a fresh
          <code>stream_id</code>. Frames of different requests interleave freely on the connection; the receiver keeps a
          map <code>stream_id → channel</code> and forwards each frame to the right place.
        </p>
        <Multiplex />
        <Stepper title="One generation over kiln-wire" steps={[
          { title: "Open stream", body: <p>Scheduler picks a new id (e.g. 42) and sends <code>Generate(stream 42, {"{messages, max_tokens, …}"})</code>.</p> },
          { title: "Tokens flow back", body: <p>The worker sends many <code>TokenDelta(stream 42, {"{text}"})</code> frames, one per token (or per few tokens).</p> },
          { title: "Normal end", body: <p>Worker sends <code>Finished(stream 42, {"{finish_reason, usage{input, cached, output}}"})</code>. Both sides forget stream 42.</p> },
          { title: "Or: cancel", body: <p>If the client disconnects, the scheduler sends <code>Cancel(stream 42)</code>. The worker aborts the sequence, frees KV blocks, and still replies <code>Finished</code> with the usage so far — so billing is correct.</p> },
          { title: "Heartbeats in the background", body: <p>Every 1 s the worker sends <code>Heartbeat(stream 0, {"{kv_blocks_free, running_seqs, …}"})</code>. Stream 0 is reserved for connection-level messages. 3 missed heartbeats → worker marked unhealthy.</p> },
        ]} />
        <Callout kind="warn">
          A <code>Cancel</code> and a <code>Finished</code> can cross on the wire (both sent at the same moment). Both
          sides must accept frames for a stream they already closed and simply ignore them. Race conditions like this are
          exactly what a black-box library would hide from you.
        </Callout>
      </Section>

      <Section title="Step 5 — Backpressure">
        <p>
          A worker can generate 50 tokens/s, but a user on a bad mobile network may read only 5 tokens/s. Where do the
          extra tokens go? If we put them in an <b>unbounded</b> queue, memory grows without limit. A
          <b>bounded</b> channel (fixed capacity) solves it: when it is full, the sender's <code>send().await</code>
          waits. The slowness travels backwards ("back pressure") to the source.
        </p>
        <Backpressure />
        <Code title="per-stream channel">{`
// capacity 64 frames per stream: memory per request is bounded
let (tx, rx) = tokio::sync::mpsc::channel::<Frame>(64);

// sender side (router): waits if the client is slow
tx.send(frame).await?;         // Err = receiver dropped = client gone -> send Cancel

// receiver side (gateway SSE writer)
while let Some(frame) = rx.recv().await { /* write SSE event */ }
`}</Code>
        <Callout kind="deep">
          Careful: if one slow stream blocks the <i>shared</i> read loop, all other streams on that connection stall
          (head-of-line blocking). Real fix: the router uses <code>try_send</code>; if a stream's channel is full for too
          long, it cancels only that stream. In practice, the gateway buffers enough for slow clients, because the GPU
          should never wait for one user.
        </Callout>
        <Quiz
          q="The worker's connection to the scheduler stops sending heartbeats, but the TCP connection is still open. What should the scheduler do?"
          options={[
            "Nothing — TCP is still connected, so the worker is fine",
            "After ~3 missed heartbeats, mark the worker unhealthy and stop sending it new requests",
            "Immediately restart the worker process",
            "Send all requests to it twice",
          ]}
          answer={1}
          explain="An open TCP connection does not prove the process is healthy (it may be stuck, or the GPU hung). Heartbeats prove the application loop is alive. The scheduler stops dispatching; in-flight streams get errors; operators get an alert."
        />
      </Section>

      <Recap items={[
        "TCP has no message boundaries; kiln-wire uses a 4-byte length prefix to cut frames.",
        "Frame = [u32 len][u8 type][u64 stream_id][payload], little-endian, with a max size limit.",
        "stream_id multiplexes many generations on one connection; stream 0 is for connection-level frames.",
        "Cancel is an explicit frame; workers still report usage for tokens already produced.",
        "Bounded channels give backpressure and keep memory flat; never use unbounded queues on hot paths.",
        "All of this is proposed — the message meanings stay the same even if the team picks gRPC later.",
      ]} />
    </>
  );
}
