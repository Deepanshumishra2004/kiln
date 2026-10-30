import { useEffect, useMemo, useState } from "react";
import {
  Arrow, Box, Callout, Code, PageHeader, Quiz, Recap, Section, Seg, Slider, Stepper, Svg, Viz,
} from "../components/ui";

/* ---------- helpers ---------- */

const enc = new TextEncoder();
const byteLen = (s: string) => enc.encode(s).length;

/** Render a string so that CR, LF and spaces are visible. */
function Visible(props: { text: string }) {
  const parts: JSX.Element[] = [];
  let k = 0;
  for (const ch of props.text) {
    if (ch === "\r") parts.push(<span key={k++} style={{ color: "var(--c5)", fontWeight: 700 }}>␍</span>);
    else if (ch === "\n") {
      parts.push(<span key={k++} style={{ color: "var(--c1)", fontWeight: 700 }}>␊</span>);
      parts.push(<br key={k++} />);
    } else parts.push(<span key={k++}>{ch}</span>);
  }
  return <div className="mono small" style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", background: "var(--code-bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px" }}>{parts}</div>;
}

function hex(s: string, max = 96) {
  const b = enc.encode(s);
  const shown = Array.from(b.slice(0, max)).map((x) => x.toString(16).padStart(2, "0"));
  return shown.join(" ") + (b.length > max ? ` … (+${b.length - max} bytes)` : "");
}

/* ---------- Visual 1: build a raw HTTP request ---------- */

function RequestBuilder() {
  const [method, setMethod] = useState<"GET" | "POST">("POST");
  const [path, setPath] = useState("/v1/chat/completions");
  const [body, setBody] = useState('{"model":"qwen3-4b","stream":true,"messages":[{"role":"user","content":"Hi"}]}');
  const [view, setView] = useState<"text" | "hex">("text");

  const raw = useMemo(() => {
    const lines = [
      `${method} ${path} HTTP/1.1`,
      "Host: api.kiln.dev",
      "Authorization: Bearer sk-live-…",
    ];
    if (method === "POST") {
      lines.push("Content-Type: application/json");
      lines.push(`Content-Length: ${byteLen(body)}`);
    }
    return lines.join("\r\n") + "\r\n\r\n" + (method === "POST" ? body : "");
  }, [method, path, body]);

  const headEnd = raw.indexOf("\r\n\r\n") + 4;

  return (
    <Viz title="Build an HTTP request and see the real bytes"
      hint="Edit the path or body. Red ␍ = carriage return (byte 0x0D), blue ␊ = line feed (byte 0x0A). Content-Length updates by itself."
      caption={<>Total: <b>{byteLen(raw)}</b> bytes. Head: {byteLen(raw.slice(0, headEnd))} bytes, body: {byteLen(raw.slice(headEnd))} bytes. The empty line (␍␊␍␊) is the only thing that tells the server "headers are finished".</>}>
      <div className="controls">
        <Seg options={["GET", "POST"] as const} value={method} onChange={setMethod} />
        <Seg options={["text", "hex"] as const} value={view} onChange={setView} labels={{ text: "show text", hex: "show hex bytes" }} />
      </div>
      <div className="grid2" style={{ marginBottom: 10 }}>
        <div><div className="small muted">Path</div><input type="text" value={path} onChange={(e) => setPath(e.target.value)} /></div>
        <div><div className="small muted">JSON body {method === "GET" && "(GET has no body)"}</div>
          <input type="text" value={body} disabled={method === "GET"} onChange={(e) => setBody(e.target.value)} /></div>
      </div>
      {view === "text" ? <Visible text={raw} /> : <div className="mono small" style={{ background: "var(--code-bg)", padding: 10, borderRadius: 8, wordBreak: "break-all" }}>{hex(raw, 200)}</div>}
    </Viz>
  );
}

/* ---------- Visual 2: TCP delivers bytes in random pieces ---------- */

const SAMPLE = "POST /v1/chat/completions HTTP/1.1\r\nHost: api.kiln.dev\r\nContent-Length: 13\r\n\r\n{\"model\":\"x\"}";

function TcpChunks() {
  const [seg, setSeg] = useState(9);
  const [seed, setSeed] = useState(1);
  const [n, setN] = useState(0);

  // deterministic "random" segment sizes so the student can replay
  const chunks = useMemo(() => {
    const out: string[] = [];
    let i = 0, s = seed * 9301 + 49297;
    while (i < SAMPLE.length) {
      s = (s * 9301 + 49297) % 233280;
      const len = Math.max(1, Math.round(seg * (0.4 + (s / 233280) * 1.2)));
      out.push(SAMPLE.slice(i, i + len));
      i += len;
    }
    return out;
  }, [seg, seed]);

  useEffect(() => { setN(0); }, [seg, seed]);

  const buffer = chunks.slice(0, n).join("");
  const headEnd = buffer.indexOf("\r\n\r\n");
  let status = "Waiting: no empty line (␍␊␍␊) yet → cannot parse headers.";
  if (headEnd >= 0) {
    const m = /Content-Length: (\d+)/.exec(buffer);
    const need = m ? Number(m[1]) : 0;
    const have = buffer.length - (headEnd + 4);
    status = have >= need
      ? `✅ Headers parsed. Body complete (${need}/${need} bytes). Request is ready.`
      : `Headers parsed. Body: ${have}/${need} bytes → keep reading.`;
  }

  return (
    <Viz title="TCP gives you a stream, not messages"
      hint="The network splits the same request into random pieces (segments). Press 'receive next piece'. The parser must buffer until it has enough bytes.">
      <div className="controls">
        <Slider label="average piece size (bytes)" value={seg} min={3} max={40} onChange={setSeg} />
        <button className="btn" onClick={() => setSeed(seed + 1)}>new random split</button>
        <button className="btn primary" disabled={n >= chunks.length} onClick={() => setN(n + 1)}>receive next piece ({n}/{chunks.length})</button>
        <button className="btn" onClick={() => setN(0)}>reset</button>
      </div>
      <div className="bytes" style={{ marginBottom: 10 }}>
        {chunks.map((c, i) => (
          <span key={i} style={{ background: i < n ? `var(--c${(i % 6) + 1}-soft)` : "transparent", opacity: i < n ? 1 : 0.35 }}>
            {c.replace(/\r/g, "␍").replace(/\n/g, "␊")}
          </span>
        ))}
      </div>
      <div className="small"><b>Parser buffer</b> ({buffer.length} bytes):</div>
      <Visible text={buffer || " "} />
      <div className="small" style={{ marginTop: 8 }}><b>{status}</b></div>
    </Viz>
  );
}

/* ---------- Visual 3: Content-Length vs chunked ---------- */

function Framing() {
  const [mode, setMode] = useState<"length" | "chunked">("length");
  const body = '{"id":"chatcmpl-1","choices":[…]}';
  const raw = mode === "length"
    ? `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${byteLen(body)}\r\n\r\n${body}`
    : "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nTransfer-Encoding: chunked\r\n\r\n" +
      `${(byteLen("data: {\"delta\":\"Hel\"}\n\n")).toString(16)}\r\ndata: {"delta":"Hel"}\n\n\r\n` +
      `${(byteLen("data: {\"delta\":\"lo\"}\n\n")).toString(16)}\r\ndata: {"delta":"lo"}\n\n\r\n` +
      "0\r\n\r\n";
  return (
    <Viz title="Two ways to say where the body ends"
      hint="Content-Length: size known before sending. Chunked: send pieces as they appear, each with its size in hex. A size of 0 means 'finished'.">
      <div className="controls"><Seg options={["length", "chunked"] as const} value={mode} onChange={setMode} labels={{ length: "Content-Length", chunked: "Transfer-Encoding: chunked" }} /></div>
      <Visible text={raw} />
      <div className="caption">{mode === "length"
        ? "Good for normal (non-streaming) responses: we build the whole JSON first, then send it."
        : "Good for streaming: we do not know the final size when the first token is ready. Each chunk = <hex size>␍␊<bytes>␍␊."}</div>
    </Viz>
  );
}

/* ---------- Visual 4: SSE token stream ---------- */

const TOKENS = ["A", " KV", " cache", " stores", " past", " keys", " and", " values", ",", " so", " the", " model", " never", " recomputes", " them", "."];

function SseStream() {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(6);

  useEffect(() => {
    if (!playing) return;
    if (i >= TOKENS.length + 2) { setPlaying(false); return; }
    const t = setTimeout(() => setI((x) => x + 1), 1000 / speed);
    return () => clearTimeout(t);
  }, [playing, i, speed]);

  const events: string[] = [];
  events.push(`data: {"object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant"}}]}`);
  for (let k = 0; k < Math.min(i, TOKENS.length); k++)
    events.push(`data: {"object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":${JSON.stringify(TOKENS[k])}}}]}`);
  if (i > TOKENS.length) events.push(`data: {"object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":24,"completion_tokens":${TOKENS.length}}}`);
  if (i > TOKENS.length + 1) events.push("data: [DONE]");

  return (
    <Viz title="Server-Sent Events: watch tokens arrive"
      hint="Left: exact text on the wire. Right: what the user sees in the chat app. Each event = 'data: <json>' followed by an empty line."
      caption="TTFT (time to first token) = time until the first content event. After that, the gap between events = time per output token.">
      <div className="controls">
        <button className="btn primary" onClick={() => { if (i >= TOKENS.length + 2) setI(0); setPlaying(!playing); }}>{playing ? "pause" : i >= TOKENS.length + 2 ? "replay" : "play stream"}</button>
        <button className="btn" onClick={() => { setPlaying(false); setI(0); }}>reset</button>
        <Slider label="tokens per second" value={speed} min={1} max={30} onChange={setSpeed} />
      </div>
      <div className="grid2">
        <div className="mono small" style={{ background: "var(--code-bg)", border: "1px solid var(--border)", borderRadius: 8, padding: 10, height: 260, overflowY: "auto", wordBreak: "break-all" }}>
          {events.map((e, k) => <div key={k} className="fade-in" style={{ marginBottom: 8 }}>{e}<br /><span style={{ color: "var(--c1)" }}>␊␊</span></div>)}
        </div>
        <div className="card" style={{ height: 260 }}>
          <div className="small muted">assistant</div>
          <div>{TOKENS.slice(0, Math.min(i, TOKENS.length)).join("")}{i < TOKENS.length + 1 && <span style={{ color: "var(--accent)" }}>▍</span>}</div>
        </div>
      </div>
    </Viz>
  );
}

/* ---------- Static diagram: TCP connection ---------- */

function TcpDiagram() {
  return (
    <Svg w={720} h={200} label="client and server connected by TCP">
      <Box x={20} y={60} w={170} h={70} label="Client" sub="203.0.113.7 : 51734" color={1} />
      <Box x={530} y={60} w={170} h={70} label="Gateway" sub="127.0.0.1 : 8080" color={2} />
      <Arrow x1={190} y1={82} x2={528} y2={82} label="bytes →  (request)" />
      <Arrow x1={530} y1={110} x2={192} y2={110} label="← bytes  (response)" />
      <text x={360} y={160} textAnchor="middle" fontSize={12} fill="var(--muted)">One TCP connection = two ordered byte pipes (one each way).</text>
      <text x={360} y={178} textAnchor="middle" fontSize={12} fill="var(--muted)">Identified by 4 numbers: client IP, client port, server IP, server port.</text>
    </Svg>
  );
}

/* ---------- Page ---------- */

export default function Page() {
  return (
    <>
      <PageHeader
        kicker="Platform · Lesson 1"
        title="HTTP & streaming from scratch"
        subtitle="Every API call starts as bytes on a TCP connection. We will see those bytes, parse them ourselves, and stream tokens back."
        learn={[
          "What TCP really gives you: an ordered stream of bytes, not messages",
          "What an HTTP/1.1 request and response look like, byte by byte",
          "How the server knows where a body ends: Content-Length vs chunked",
          "How Server-Sent Events (SSE) stream tokens to the user",
          "How to write a tiny, safe HTTP parser in Rust on tokio",
        ]}
      />

      <Section title="Why learn this?">
        <p>
          Most web frameworks (axum, Express, Next.js) hide HTTP. You write a function, and a request object appears.
          That is comfortable, but it hides the most important facts for an LLM API: a response can be <b>long</b>
          (tens of seconds), it is sent <b>piece by piece</b>, and the client can <b>disconnect</b> in the middle.
        </p>
        <p>
          Kiln's gateway is the front door. In the proposed design, we write the HTTP/1.1 layer ourselves on top of raw
          tokio TCP sockets. It is about 800 lines. After this lesson you will know exactly what those lines do.
        </p>
        <Callout kind="kiln">
          Proposed: own HTTP/1.1 + SSE server in <code>crates/gateway/src/http/</code>. Cloudflare terminates TLS (HTTPS)
          in front of us, so our server only speaks plain HTTP/1.1 on <code>127.0.0.1:8080</code>. The team can still
          decide to keep <code>hyper</code> underneath; the rest of the gateway does not change.
        </Callout>
      </Section>

      <Section title="Step 1 — TCP: a phone call for bytes">
        <Callout kind="analogy">
          TCP is like a phone call. First you dial and the other side picks up (the <i>handshake</i>). Then both people can
          talk at the same time. Words arrive in order, and nothing is lost — if the line drops a word, TCP repeats it
          silently. But TCP does not know about "sentences". It only carries a stream of sounds (bytes).
        </Callout>
        <TcpDiagram />
        <p>Facts you must remember:</p>
        <ul>
          <li><b>Port</b>: a number (0–65535) that picks which program on a machine gets the bytes. Our gateway listens on 8080.</li>
          <li><b>Ordered and reliable</b>: bytes arrive in the same order they were sent, or the connection breaks.</li>
          <li><b>No message boundaries</b>: if the client sends 500 bytes, the server may receive 120, then 380. Or 1 and 499. You cannot know in advance.</li>
          <li><b>Close</b>: either side can close. When the client closes, our next read returns 0 bytes (end of stream) or our next write fails. This is how we notice a user left.</li>
        </ul>
        <TcpChunks />
        <Callout kind="idea">
          Because TCP has no message boundaries, <b>every protocol on top of TCP must answer one question: where does one
          message end?</b> HTTP answers with "an empty line ends the headers" plus Content-Length or chunked encoding.
          Our own wire protocol (next lesson) answers with a length prefix.
        </Callout>
      </Section>

      <Section title="Step 2 — An HTTP/1.1 request, byte by byte">
        <p>HTTP/1.1 is a <b>text</b> protocol. A request has three parts:</p>
        <ol>
          <li><b>Request line</b>: <code>METHOD PATH VERSION</code>, for example <code>POST /v1/chat/completions HTTP/1.1</code>.</li>
          <li><b>Headers</b>: one <code>Name: value</code> per line. Every line ends with two bytes: <code>\r\n</code> (CR LF).</li>
          <li><b>Empty line</b> (<code>\r\n</code> alone), then the <b>body</b> (for POST), exactly <code>Content-Length</code> bytes.</li>
        </ol>
        <RequestBuilder />
        <Callout kind="deep">
          Content-Length counts <b>bytes</b>, not characters. "Hi" is 2 bytes, but "नमस्ते" is 18 bytes in UTF-8.
          Try typing non-English text in the body above and watch the length jump. Many hand-written servers get this wrong.
        </Callout>
        <h3>The response</h3>
        <p>The response has the same shape: a <b>status line</b> (<code>HTTP/1.1 200 OK</code>), headers, empty line, body.</p>
        <Framing />
        <h3>Keep-alive: reuse the connection</h3>
        <p>
          Opening a TCP connection costs a round trip (and with TLS, more). HTTP/1.1 keeps the connection open by default
          after a response, so the next request can reuse it. This is why the server <b>must</b> know exactly where each
          body ends: otherwise it cannot know where the next request starts. A request with <code>Connection: close</code>
          asks the server to close after responding.
        </p>
        <Quiz
          q="A client sends a POST with 'Content-Length: 50', but our first read() returned only the headers and 20 body bytes. What should the parser do?"
          options={[
            "Return an error: the body is incomplete",
            "Keep the 20 bytes in a buffer and read again until it has 50",
            "Process the request with the 20 bytes it has",
            "Close the connection and ask the client to retry",
          ]}
          answer={1}
          explain="TCP may split data anywhere. Partial data is normal, not an error. The parser buffers and reads more, with a timeout so a slow client cannot hold the connection forever."
        />
      </Section>

      <Section title="Step 3 — Streaming tokens with Server-Sent Events">
        <p>
          An LLM produces one token every ~20–30 ms. If we waited for the whole answer (maybe 10 seconds) before sending
          anything, the user would stare at an empty screen. Instead, we send each token as soon as it exists.
        </p>
        <p>
          <b>Server-Sent Events (SSE)</b> is the simplest standard for this. The response has
          <code>Content-Type: text/event-stream</code> and stays open. Each event is lines starting with <code>data: </code>,
          followed by an empty line. That is all. OpenAI and Anthropic both use it.
        </p>
        <SseStream />
        <Code lang="text" title="the exact SSE format">{`
data: {"choices":[{"delta":{"content":"Hel"}}]}\\n
\\n                          <- empty line = end of this event
data: {"choices":[{"delta":{"content":"lo"}}]}\\n
\\n
: ping\\n                    <- a line starting with ':' is a comment (keep-alive)
\\n
data: [DONE]\\n              <- OpenAI's "stream finished" marker
\\n
`}</Code>
        <Callout kind="warn">
          After the first byte of a streaming response is sent, the status code (200) is <b>already gone</b>. If the worker
          crashes in the middle, we cannot change it to 500. We send an SSE event <code>{`data: {"error": {...}}`}</code> and
          close the stream. Clients must handle this.
        </Callout>
        <p>
          Proxies like Cloudflare close connections that are silent for ~100 seconds. If a request waits in the queue for a
          long time, the gateway sends <code>: ping</code> comments every 15 seconds so the connection stays alive.
        </p>
        <Quiz
          q="Why do we send 'Transfer-Encoding: chunked' (or simply close the connection at the end) for a streaming response instead of Content-Length?"
          options={[
            "Chunked is faster on the network",
            "We do not know the total size of the answer when we start sending",
            "Content-Length is not allowed with JSON",
            "Browsers require chunked for SSE",
          ]}
          answer={1}
          explain="Content-Length must be written in the headers, before the body. When we start streaming, the model has not finished, so the size is unknown. Chunked encoding sends a size per piece instead."
        />
      </Section>

      <Section title="Step 4 — The Rust code">
        <p>
          Here is the core of a tiny HTTP/1.1 server. It is simplified (no chunked request bodies, no pipelining), but
          the structure is real: accept connections, read into a buffer, find the end of headers, parse, read the body,
          respond. Read the comments line by line.
        </p>
        <Code title="crates/gateway/src/http/server.rs (sketch)">{`
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::time::{timeout, Duration};

const MAX_HEAD: usize = 16 * 1024;        // 16 KiB of headers max
const MAX_BODY: usize = 1024 * 1024;      // 1 MiB body max (doc 04)
const HEAD_TIMEOUT: Duration = Duration::from_secs(10);

pub struct Request {
    pub method: String,
    pub path: String,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

#[tokio::main]
async fn main() -> std::io::Result<()> {
    let listener = TcpListener::bind("127.0.0.1:8080").await?;
    loop {
        // accept() waits for a new TCP connection
        let (stream, peer) = listener.accept().await?;
        // one lightweight task per connection; a slow client blocks only itself
        tokio::spawn(async move {
            if let Err(e) = handle_conn(stream).await {
                tracing::debug!(%peer, error = %e, "connection closed");
            }
        });
    }
}

async fn handle_conn(mut stream: TcpStream) -> anyhow::Result<()> {
    let mut buf: Vec<u8> = Vec::with_capacity(4096);
    loop {
        // keep-alive: many requests can come on one connection
        let req = match timeout(HEAD_TIMEOUT, read_request(&mut stream, &mut buf)).await {
            Ok(Ok(Some(req))) => req,
            Ok(Ok(None)) => return Ok(()),            // client closed cleanly
            Ok(Err(e)) => { write_error(&mut stream, 400, &e.to_string()).await?; return Ok(()); }
            Err(_) => return Ok(()),                  // too slow: drop (slowloris defence)
        };
        route(&mut stream, req).await?;
    }
}

async fn read_request(stream: &mut TcpStream, buf: &mut Vec<u8>) -> anyhow::Result<Option<Request>> {
    // 1. read until we see the empty line \\r\\n\\r\\n
    let head_end = loop {
        if let Some(pos) = find(buf, b"\\r\\n\\r\\n") { break pos + 4; }
        if buf.len() > MAX_HEAD { anyhow::bail!("headers too large"); }
        let mut chunk = [0u8; 4096];
        let n = stream.read(&mut chunk).await?;
        if n == 0 { return Ok(None); }               // 0 bytes = peer closed
        buf.extend_from_slice(&chunk[..n]);
    };

    // 2. parse request line + headers (they must be valid UTF-8 text)
    let head = std::str::from_utf8(&buf[..head_end])?;
    let mut lines = head.split("\\r\\n");
    let mut first = lines.next().unwrap_or("").split(' ');
    let method = first.next().unwrap_or("").to_string();
    let path = first.next().unwrap_or("").to_string();
    let mut headers = Vec::new();
    for line in lines.filter(|l| !l.is_empty()) {
        let (name, value) = line.split_once(':').ok_or_else(|| anyhow::anyhow!("bad header"))?;
        headers.push((name.trim().to_ascii_lowercase(), value.trim().to_string()));
    }

    // 3. body: exactly Content-Length bytes
    let len: usize = headers.iter()
        .find(|(n, _)| n == "content-length")
        .map(|(_, v)| v.parse()).transpose()?.unwrap_or(0);
    if len > MAX_BODY { anyhow::bail!("body too large"); }
    while buf.len() < head_end + len {
        let mut chunk = [0u8; 8192];
        let n = stream.read(&mut chunk).await?;
        if n == 0 { anyhow::bail!("client closed mid-body"); }
        buf.extend_from_slice(&chunk[..n]);
    }
    let body = buf[head_end..head_end + len].to_vec();

    // 4. remove this request from the buffer; leftover bytes belong to the NEXT request
    buf.drain(..head_end + len);
    Ok(Some(Request { method, path, headers, body }))
}

fn find(hay: &[u8], needle: &[u8]) -> Option<usize> {
    hay.windows(needle.len()).position(|w| w == needle)
}
`}</Code>
        <Callout kind="rust">
          <ul style={{ margin: 0 }}>
            <li><code>async fn</code> + <code>.await</code>: the function pauses while waiting for the network, and tokio runs other connections meanwhile. One thread can serve thousands of connections.</li>
            <li><code>tokio::spawn</code> starts an independent task, like a very cheap thread.</li>
            <li><code>?</code> means: "if this is an error, return it from my function now".</li>
            <li><code>buf.drain(..n)</code> removes the first <code>n</code> bytes. Leftover bytes stay — they may be the start of the next keep-alive request.</li>
          </ul>
        </Callout>
        <h3>Writing an SSE stream</h3>
        <Code title="crates/gateway/src/http/sse.rs (sketch)">{`
pub async fn stream_sse(
    stream: &mut TcpStream,
    mut tokens: tokio::sync::mpsc::Receiver<String>,   // JSON chunks from the scheduler
) -> std::io::Result<()> {
    stream.write_all(
        b"HTTP/1.1 200 OK\\r\\n\\
          Content-Type: text/event-stream\\r\\n\\
          Cache-Control: no-cache\\r\\n\\
          Connection: close\\r\\n\\r\\n",
    ).await?;

    let mut ping = tokio::time::interval(Duration::from_secs(15));
    loop {
        tokio::select! {
            maybe = tokens.recv() => match maybe {
                Some(json) => {
                    let event = format!("data: {}\\n\\n", json);
                    // if the client is gone, this write fails -> we return Err
                    // -> the receiver is dropped -> the scheduler cancels the GPU work
                    stream.write_all(event.as_bytes()).await?;
                }
                None => break,                        // generation finished
            },
            _ = ping.tick() => stream.write_all(b": ping\\n\\n").await?,
        }
    }
    stream.write_all(b"data: [DONE]\\n\\n").await?;
    Ok(())
}
`}</Code>
        <Callout kind="idea">
          With <code>Connection: close</code>, the end of the TCP stream marks the end of the body, so we do not even need
          chunked encoding for SSE. Simple and valid HTTP/1.1. The cost: that one connection cannot be reused.
        </Callout>
      </Section>

      <Section title="Step 5 — Safety limits (the internet is hostile)">
        <p>When you write the server yourself, you also own its defences. Every limit below protects memory or connections:</p>
        <table>
          <thead><tr><th>Attack / mistake</th><th>What happens without a limit</th><th>Our limit</th></tr></thead>
          <tbody>
            <tr><td>Huge headers</td><td>Buffer grows until RAM is gone</td><td>16 KiB head → 431 / close</td></tr>
            <tr><td>Huge body</td><td>Same, with JSON parsing on top</td><td>1 MiB → 413 <code>request_too_large</code></td></tr>
            <tr><td><b>Slowloris</b>: send 1 byte every 9 seconds</td><td>Thousands of open sockets, each waiting forever</td><td>10 s to receive full headers, body timeout</td></tr>
            <tr><td>Too many connections</td><td>File descriptors / memory exhausted</td><td>Max concurrent connections (semaphore)</td></tr>
            <tr><td>Bad Content-Length (negative, two headers)</td><td>Request smuggling bugs</td><td>Reject anything ambiguous with 400</td></tr>
            <tr><td>Idle keep-alive</td><td>Sockets held open by nobody</td><td>Idle timeout ~60 s</td></tr>
          </tbody>
        </table>
        <Stepper title="What happens when the user closes the browser tab mid-answer" steps={[
          { title: "Tab closes", body: <p>The browser closes the TCP connection. Cloudflare forwards the close to our gateway.</p> },
          { title: "Our next write fails", body: <p><code>stream.write_all(event)</code> returns an error (connection reset / broken pipe). <code>?</code> returns it from <code>stream_sse</code>.</p> },
          { title: "Receiver is dropped", body: <p>The <code>tokens</code> channel receiver is dropped. The scheduler notices its sender is closed and sends a <code>Cancel</code> frame to the worker.</p> },
          { title: "GPU memory freed", body: <p>The worker aborts the sequence and frees its KV cache blocks. Another user's request can use them immediately.</p> },
          { title: "Usage still recorded", body: <p>The tokens generated before the cancel <b>are billed</b>. The gateway emits a usage event with <code>status: "cancelled"</code>.</p> },
        ]} />
      </Section>

      <Recap items={[
        "TCP = reliable, ordered byte stream with no message boundaries. Every protocol must define where a message ends.",
        "HTTP/1.1 = request line + headers (each ending \\r\\n) + empty line + body of Content-Length bytes.",
        "Streaming uses chunked encoding or close-delimited bodies, because the final size is unknown.",
        "SSE = 'data: <json>' + empty line per event; OpenAI ends with 'data: [DONE]'.",
        "A failed write is how we detect a disconnected client — and that must cancel GPU work.",
        "Writing your own server means owning its limits: header size, body size, timeouts, connection count.",
      ]} />
    </>
  );
}
