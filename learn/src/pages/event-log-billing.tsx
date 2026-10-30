import { useMemo, useState } from "react";
import {
  Arrow, Box, Callout, Code, PageHeader, Quiz, Recap, Section, Seg, Slider, Stepper, Svg, Viz,
} from "../components/ui";

/* ---------- Visual 1: log + consumer + crash + replay ---------- */

type Event = { offset: number; requestId: string; cost: number };
type SimState = {
  log: Event[];
  cursor: number;          // next offset the consumer will read (in memory)
  committed: number;       // offset saved durably
  db: string[];            // request_ids in usage_events
  balance: number;         // cents
  skipped: number;
  msgs: string[];
  pendingCommit: boolean;  // processed into DB but offset not committed yet
};

const SEG = 4;
const START_BAL = 500;

function initial(): SimState {
  return { log: [], cursor: 0, committed: 0, db: [], balance: START_BAL, skipped: 0, msgs: [], pendingCommit: false };
}

function LogSim() {
  const [s, setS] = useState<SimState>(initial);
  const [idem, setIdem] = useState<"on" | "off">("on");
  const say = (st: SimState, m: string): SimState => ({ ...st, msgs: [m, ...st.msgs].slice(0, 6) });

  const append = () => setS((st) => {
    const cost = 10 + ((st.log.length * 37) % 40);
    const ev = { offset: st.log.length, requestId: `req-${(0x0192f3a0 + st.log.length).toString(16)}`, cost };
    return say({ ...st, log: [...st.log, ev] }, `gateway appended offset ${ev.offset} (${ev.requestId}, ${ev.cost}¢)`);
  });

  const processOne = () => setS((st) => {
    if (st.cursor >= st.log.length) return say(st, "consumer: nothing new to read");
    const ev = st.log[st.cursor];
    let next = { ...st, cursor: st.cursor + 1, pendingCommit: true };
    if (idem === "on" && st.db.includes(ev.requestId)) {
      next = { ...next, skipped: st.skipped + 1 };
      return say(next, `offset ${ev.offset}: INSERT … ON CONFLICT DO NOTHING → 0 rows. Duplicate ignored ✅`);
    }
    next = { ...next, db: [...st.db, ev.requestId], balance: st.balance - ev.cost };
    return say(next, `offset ${ev.offset}: inserted usage row + ledger −${ev.cost}¢ (DB COMMIT)`);
  });

  const commit = () => setS((st) => say({ ...st, committed: st.cursor, pendingCommit: false }, `consumer committed offset ${st.cursor} (durable)`));

  const crash = () => setS((st) => say({ ...st, cursor: st.committed, pendingCommit: false },
    `💥 consumer crashed! restarts from last committed offset ${st.committed}${st.cursor > st.committed ? ` — offsets ${st.committed}..${st.cursor - 1} will be delivered AGAIN` : ""}`));

  const uniqueCharged = new Set(s.db).size;
  const costOf = (id: string) => s.log.find((e) => e.requestId === id)?.cost ?? 0;
  const expected = START_BAL - Array.from(new Set(s.db)).reduce((a, id) => a + costOf(id), 0);
  const wrong = s.db.length !== uniqueCharged;

  const segments: Event[][] = [];
  for (let i = 0; i < s.log.length; i += SEG) segments.push(s.log.slice(i, i + SEG));

  return (
    <Viz title="Append, consume, crash, replay"
      hint="Append usage events, process them, then crash the consumer BEFORE committing the offset. On restart, events are delivered again. Does the customer pay twice?"
      caption={wrong
        ? `❌ Customer was charged ${s.db.length} times for ${uniqueCharged} requests. Overcharged by ${expected - s.balance}¢.`
        : `✅ ${uniqueCharged} requests charged exactly once. Duplicates safely ignored: ${s.skipped}.`}>
      <div className="controls">
        <Seg options={["on", "off"] as const} value={idem} onChange={(v) => { setIdem(v); setS(initial()); }} labels={{ on: "idempotent (ON CONFLICT)", off: "naive INSERT" }} />
      </div>
      <div className="controls">
        <button className="btn" onClick={append}>1. gateway: append event</button>
        <button className="btn primary" onClick={processOne}>2. consumer: process next</button>
        <button className="btn" onClick={commit} disabled={!s.pendingCommit}>3. commit offset</button>
        <button className="btn" onClick={crash}>💥 crash consumer</button>
        <button className="btn" onClick={() => setS(initial())}>reset</button>
      </div>
      <Svg w={720} h={130} label="segmented log with offsets and consumer cursor">
        <text x={0} y={14} fontSize={12} fill="var(--muted)">kiln-log topic "usage" — segment files of {SEG} records</text>
        {segments.map((seg, si) => (
          <g key={si}>
            <rect x={si * 178} y={24} width={170} height={58} rx={6} fill="var(--panel-2)" stroke="var(--border)" />
            <text x={si * 178 + 6} y={96} fontSize={10} fill="var(--muted)">{String(si * SEG).padStart(8, "0")}.log</text>
            {seg.map((e, i) => {
              const x = si * 178 + 6 + i * 41;
              const done = e.offset < s.committed;
              const read = e.offset < s.cursor;
              return (
                <g key={e.offset}>
                  <rect x={x} y={32} width={36} height={42} rx={4} fill={done ? "var(--c3-soft)" : read ? "var(--c2-soft)" : "var(--panel)"} stroke={done ? "var(--c3)" : read ? "var(--c2)" : "var(--border)"} />
                  <text x={x + 18} y={50} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--text)">{e.offset}</text>
                  <text x={x + 18} y={66} textAnchor="middle" fontSize={10} fill="var(--muted)">{e.cost}¢</text>
                </g>
              );
            })}
          </g>
        ))}
        {s.log.length === 0 && <text x={10} y={56} fontSize={12} fill="var(--muted)">(empty — press "append event")</text>}
        <text x={0} y={122} fontSize={11} fill="var(--c3)">■ committed (&lt; {s.committed})</text>
        <text x={170} y={122} fontSize={11} fill="var(--c2)">■ read, not committed (&lt; {s.cursor})</text>
        <text x={400} y={122} fontSize={11} fill="var(--muted)">□ not read yet</text>
      </Svg>
      <div className="grid2">
        <div className="card small">
          <b>Postgres usage_events</b> ({s.db.length} rows)
          <div className="mono" style={{ maxHeight: 100, overflowY: "auto" }}>
            {s.db.map((r, i) => <div key={i} style={{ color: s.db.indexOf(r) !== i ? "var(--c5)" : undefined }}>{r}{s.db.indexOf(r) !== i ? "  ← DUPLICATE" : ""}</div>)}
          </div>
          <div style={{ marginTop: 6 }}>org balance: <b>{s.balance}¢</b></div>
        </div>
        <div className="card small">
          <b>what happened</b>
          {s.msgs.map((m, i) => <div key={i} className={i === 0 ? "fade-in" : "muted"}>{m}</div>)}
        </div>
      </div>
    </Viz>
  );
}

/* ---------- Visual 2: pricing calculator ---------- */

const PRICES = {
  "qwen3-4b": { input: 200, cached: 50, output: 800 },
  "qwen3-1.7b": { input: 50, cached: 10, output: 200 },
} as const;
type ModelId = keyof typeof PRICES;

function PricingCalc() {
  const [model, setModel] = useState<ModelId>("qwen3-4b");
  const [input, setInput] = useState(1240);
  const [cached, setCached] = useState(1024);
  const [output, setOutput] = useState(312);
  const [batch, setBatch] = useState<"no" | "yes">("no");
  const p = PRICES[model];
  const c = Math.min(cached, input);
  const parts = [
    { label: "uncached input", n: input - c, price: p.input, color: 1 },
    { label: "cached input", n: c, price: p.cached, color: 6 },
    { label: "output", n: output, price: p.output, color: 2 },
  ];
  let nanos = parts.reduce((a, x) => a + x.n * x.price, 0);
  if (batch === "yes") nanos = Math.floor((nanos * 50) / 100);
  const max = Math.max(...parts.map((x) => x.n * x.price), 1);

  return (
    <Viz title="Price one request (integer nano-dollars)"
      hint="Prices are stored per token in nano-USD (1 USD = 1,000,000,000). All math is integers — no rounding drift, ever."
      caption={`= ${nanos.toLocaleString()} nanos = $${(nanos / 1e9).toFixed(6)}. A million such requests ≈ $${((nanos * 1e6) / 1e9).toFixed(0)}.`}>
      <div className="controls">
        <Seg options={["qwen3-4b", "qwen3-1.7b"] as const} value={model} onChange={setModel} />
        <Seg options={["no", "yes"] as const} value={batch} onChange={setBatch} labels={{ no: "interactive", yes: "batch (−50%)" }} />
      </div>
      <div className="controls">
        <Slider label="input tokens" value={input} min={0} max={8000} step={10} onChange={setInput} />
        <Slider label="… of which cached" value={c} min={0} max={input} step={8} onChange={setCached} />
        <Slider label="output tokens" value={output} min={0} max={4000} step={2} onChange={setOutput} />
      </div>
      {parts.map((x) => (
        <div key={x.label} style={{ marginBottom: 6 }}>
          <div className="small mono">{x.label}: {x.n.toLocaleString()} × {x.price} = <b>{(x.n * x.price).toLocaleString()}</b> nanos</div>
          <div style={{ height: 12, background: "var(--panel-2)", borderRadius: 4 }}>
            <div style={{ width: `${((x.n * x.price) / max) * 100}%`, height: "100%", borderRadius: 4, background: `var(--c${x.color})`, transition: "width .2s" }} />
          </div>
        </div>
      ))}
    </Viz>
  );
}

/* ---------- Visual 3: ledger + reconciliation ---------- */

type Row = { kind: string; ref: string; amount: number };

function Ledger() {
  const [rows, setRows] = useState<Row[]>([{ kind: "grant", ref: "signup-bonus", amount: 1_000_000_000 }]);
  const [cache, setCache] = useState(1_000_000_000);
  const [drift, setDrift] = useState(false);
  const sum = useMemo(() => rows.reduce((a, r) => a + r.amount, 0), [rows]);
  const add = (r: Row) => {
    if (rows.some((x) => x.kind === r.kind && x.ref === r.ref)) return; // UNIQUE(kind, ref)
    setRows([...rows, r]);
    setCache(cache + r.amount + (drift ? 7_000 : 0));
  };
  const usage = () => add({ kind: "usage", ref: `req-${rows.length}`, amount: -(250_000 + (rows.length * 13_337) % 200_000) });
  const usd = (n: number) => `${n < 0 ? "−" : "+"}$${(Math.abs(n) / 1e9).toFixed(6)}`;

  return (
    <Viz title="Append-only credit ledger"
      hint="Money changes are new rows, never edits. Balance = sum of all rows. org_balances is just a cached copy, and a nightly job checks it."
      caption={cache === sum ? "Reconciliation: cached balance = sum(ledger) ✅" : `🚨 Reconciliation alert: cached ${usd(cache)} ≠ ledger ${usd(sum)}. Something updated the cache without a ledger row.`}>
      <div className="controls">
        <button className="btn" onClick={() => add({ kind: "purchase", ref: `pi_${rows.length}`, amount: 5_000_000_000 })}>top-up $5</button>
        <button className="btn primary" onClick={usage}>request used</button>
        <button className="btn" onClick={() => add({ kind: "purchase", ref: "pi_dup", amount: 5_000_000_000 })}>Stripe webhook (send twice!)</button>
        <button className="btn" onClick={() => { const last = [...rows].reverse().find((r) => r.kind === "usage"); if (last) add({ kind: "refund", ref: last.ref, amount: -last.amount }); }}>refund last request</button>
        <label className="small"><input type="checkbox" checked={drift} onChange={(e) => setDrift(e.target.checked)} /> simulate a bug in cache update</label>
      </div>
      <table>
        <thead><tr><th>#</th><th>kind</th><th>ref</th><th>amount</th></tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i} className={i === rows.length - 1 ? "fade-in" : ""}><td>{i + 1}</td><td>{r.kind}</td><td className="mono">{r.ref}</td>
            <td className="mono" style={{ color: r.amount < 0 ? "var(--c5)" : "var(--c3)" }}>{usd(r.amount)}</td></tr>
        ))}</tbody>
      </table>
      <div className="grid2">
        <div className="card small">sum(ledger): <b className="mono">{usd(sum)}</b></div>
        <div className="card small">org_balances (cached): <b className="mono">{usd(cache)}</b></div>
      </div>
    </Viz>
  );
}

/* ---------- Visual 4: CRC + torn write ---------- */

function crc32(bytes: number[]) {
  let c = 0xffffffff;
  for (const b of bytes) { c ^= b; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; }
  return (c ^ 0xffffffff) >>> 0;
}

function CrcDemo() {
  const payload = useMemo(() => Array.from(new TextEncoder().encode('{"req":"0192f3a4","out":312}')), []);
  const stored = useMemo(() => crc32(payload), [payload]);
  const [bytes, setBytes] = useState<number[]>(payload);
  const [torn, setTorn] = useState(false);
  const data = torn ? bytes.slice(0, 17) : bytes;
  const now = crc32(data);
  const ok = !torn && now === stored;

  return (
    <Viz title="Every record carries a checksum"
      hint="Record on disk = [u32 len][u32 crc32][payload]. On startup we re-check every record at the end of the log. Flip a bit or simulate a power cut mid-write."
      caption={ok ? "CRC matches → record is intact." : torn
        ? `Record shorter than its length field says → torn write (power cut). Recovery truncates the file to the last good record. The gateway never got an ack for it, so it will resend.`
        : `CRC mismatch (stored ${stored.toString(16)}, computed ${now.toString(16)}) → corrupted record detected, not silently billed.`}>
      <div className="controls">
        <button className="btn" onClick={() => { const b = [...bytes]; b[9] ^= 0x04; setBytes(b); }}>flip one bit in byte 9</button>
        <button className="btn" onClick={() => setTorn(!torn)}>{torn ? "undo power cut" : "⚡ power cut mid-write"}</button>
        <button className="btn" onClick={() => { setBytes(payload); setTorn(false); }}>reset</button>
      </div>
      <div className="bytes">
        <span style={{ background: "var(--c1-soft)" }}>len={payload.length}</span>
        <span style={{ background: "var(--c4-soft)" }}>crc={stored.toString(16)}</span>
        {data.map((b, i) => <span key={i} style={{ background: b !== payload[i] ? "var(--c5-soft)" : "var(--c3-soft)" }}>{String.fromCharCode(b)}</span>)}
        {torn && <span style={{ borderStyle: "dashed" }}>… missing {payload.length - 17} bytes</span>}
      </div>
      <div className="card small" style={{ marginTop: 8, borderColor: ok ? "var(--c3)" : "var(--c5)" }}>{ok ? "✅ valid" : "❌ invalid — stop reading here"}</div>
    </Viz>
  );
}

/* ---------- Page ---------- */

export default function Page() {
  return (
    <>
      <PageHeader
        kicker="Platform · Lesson 6"
        title="Event log & billing"
        subtitle="Every request costs money. We must never lose a usage record and never count one twice. This lesson shows how."
        learn={[
          "The two billing rules and why 'exactly once' is built from 'at least once' + idempotency",
          "Our own append-only log (kiln-log): segments, offsets, CRC, fsync",
          "Consumers, offsets, crashes and replay — and why ON CONFLICT DO NOTHING saves us",
          "Pricing math in integer nano-dollars",
          "The append-only credit ledger and nightly reconciliation",
        ]}
      />

      <Section title="The two rules of metering">
        <ol>
          <li><b>Never lose a usage event.</b> A lost event = free GPU time given away.</li>
          <li><b>Never count one twice.</b> A double charge = angry customer, refunds, lost trust.</li>
        </ol>
        <p>
          Networks and processes fail. A message can be lost, or sent twice because the sender did not hear "OK". There is no
          magic delivery that is "exactly once". What we can build is:
        </p>
        <Callout kind="idea">
          <b>Exactly-once <i>effect</i> = at-least-once delivery + idempotent processing.</b> We make sure every event arrives
          one or more times (retry until acknowledged), and we make processing the same event twice harmless (the second time
          does nothing). The event's <code>request_id</code> is the idempotency key from end to end.
        </Callout>
        <Callout kind="analogy">
          A cashier who stamps each receipt "PAID" with its number. If the same receipt comes back, they see the stamp and do
          not take money again. The receipt number is the <code>request_id</code>; the stamp book is the <code>UNIQUE</code>
          index in Postgres.
        </Callout>
      </Section>

      <Section title="Step 1 — The pipeline">
        <Svg w={720} h={150} label="usage pipeline">
          <Box x={10} y={45} w={120} h={56} label="gateway" sub="request ends" color={1} />
          <Arrow x1={130} y1={73} x2={190} y2={73} label="append" />
          <Box x={192} y={35} w={160} h={76} label="kiln-log" sub='topic "usage" (proposed)' color={4} />
          <Arrow x1={352} y1={73} x2={412} y2={73} label="read" />
          <Box x={414} y={45} w={130} h={56} label="usage-worker" sub="price + dedupe" color={2} />
          <Arrow x1={544} y1={73} x2={598} y2={73} label="1 txn" />
          <Box x={600} y={35} w={110} h={76} label="Postgres" sub="events · ledger" color={3} />
          <text x={140} y={135} fontSize={11} fill="var(--muted)">If the log is unreachable, the gateway appends to a local spill file and replays later.</text>
        </Svg>
        <p>
          The original design used Apache Iggy (a Rust streaming server), with a Postgres outbox table before that. The
          <b> proposed</b> from-scratch version is <b>kiln-log</b>: our own append-only log, about 1,000 lines, which teaches how
          Kafka works inside. The usage-worker logic (price, insert with ON CONFLICT, debit ledger, commit offset) is identical
          for all three transports.
        </p>
      </Section>

      <Section title="Step 2 — An append-only log, from first principles">
        <p>
          A log is the simplest storage there is: a file you only ever <b>append</b> to. Each record gets an <b>offset</b>
          (0, 1, 2, …) — its position number. Records are never changed or deleted in place. Readers remember the offset
          they reached.
        </p>
        <ul>
          <li><b>Segments</b>: instead of one huge file, we roll to a new file every N MB. File name = first offset inside
            (<code>00000000.log</code>, <code>00004096.log</code>). Old segments can be deleted after everyone has read them.</li>
          <li><b>Index</b>: a small side file maps offset → byte position, so a reader can jump to any offset quickly.</li>
          <li><b>CRC</b>: each record has a checksum, so a half-written or corrupted record is detected.</li>
          <li><b>fsync</b>: <code>write()</code> only puts bytes in the OS page cache (RAM). <code>fsync()</code> forces them to
            the disk. We ack the gateway only after fsync (or after a short group-commit window of a few ms, batching many records into one fsync).</li>
          <li><b>Consumer offset</b>: the reader stores "I have fully processed everything before offset N" durably.</li>
        </ul>
        <CrcDemo />
        <Code title="crates/log/src/segment.rs (sketch)">{`
use std::fs::{File, OpenOptions};
use std::io::{Write, BufWriter};

pub struct Segment {
    base_offset: u64,          // offset of the first record in this file
    next_offset: u64,
    file: BufWriter<File>,
    bytes: u64,
}

impl Segment {
    /// Append one record. Returns its offset.
    /// On-disk layout: [u32 len][u32 crc32(payload)][payload]
    pub fn append(&mut self, payload: &[u8]) -> std::io::Result<u64> {
        let crc = crc32fast::hash(payload);
        self.file.write_all(&(payload.len() as u32).to_le_bytes())?;
        self.file.write_all(&crc.to_le_bytes())?;
        self.file.write_all(payload)?;
        self.bytes += 8 + payload.len() as u64;
        let off = self.next_offset;
        self.next_offset += 1;
        Ok(off)
    }

    /// Make everything appended so far durable. Called once per group-commit batch.
    pub fn sync(&mut self) -> std::io::Result<()> {
        self.file.flush()?;              // BufWriter -> OS page cache
        self.file.get_ref().sync_data()  // OS page cache -> disk (fsync)
    }
}

/// On startup: scan the last segment, stop at the first bad record, truncate there.
pub fn recover(path: &std::path::Path) -> std::io::Result<u64> {
    let data = std::fs::read(path)?;
    let (mut pos, mut count) = (0usize, 0u64);
    while pos + 8 <= data.len() {
        let len = u32::from_le_bytes(data[pos..pos + 4].try_into().unwrap()) as usize;
        let crc = u32::from_le_bytes(data[pos + 4..pos + 8].try_into().unwrap());
        let end = pos + 8 + len;
        if end > data.len() || crc32fast::hash(&data[pos + 8..end]) != crc {
            break;                       // torn or corrupt tail
        }
        pos = end;
        count += 1;
    }
    OpenOptions::new().write(true).open(path)?.set_len(pos as u64)?;  // cut the bad tail
    Ok(count)
}
`}</Code>
        <Callout kind="rust">
          <ul style={{ margin: 0 }}>
            <li><code>BufWriter</code> collects small writes in memory and sends them to the OS in big pieces — fewer system calls.</li>
            <li><code>sync_data()</code> is Rust's <code>fdatasync</code> (on Windows: <code>FlushFileBuffers</code>). Slow (~ms), so we batch.</li>
            <li><code>data[a..b].try_into().unwrap()</code> turns a 4-byte slice into a <code>[u8; 4]</code> array for <code>from_le_bytes</code>.</li>
          </ul>
        </Callout>
      </Section>

      <Section title="Step 3 — Consumers, crashes and duplicates">
        <p>The usage-worker loop, in order:</p>
        <ol>
          <li>Read the record at the current offset.</li>
          <li>Price it and, in <b>one Postgres transaction</b>: <code>INSERT INTO usage_events … ON CONFLICT (request_id) DO NOTHING</code>; only if a row was inserted, add a ledger row and update the balance. <code>COMMIT</code>.</li>
          <li><b>Then</b> save the new offset.</li>
        </ol>
        <p>A crash between step 2 and step 3 means the record will be read again. Try it:</p>
        <LogSim />
        <Code lang="text" title="usage-worker transaction (SQL)">{`
BEGIN;
  INSERT INTO usage_events (request_id, org_id, model_id, input_tokens, cached_input_tokens,
                            output_tokens, cost_nanos, started_at, ...)
  VALUES ($1, ...)
  ON CONFLICT (request_id) DO NOTHING;           -- duplicate? 0 rows, nothing else happens

  -- only when the INSERT above affected 1 row:
  INSERT INTO credit_ledger (org_id, kind, ref, amount_nanos) VALUES ($org, 'usage', $1, -$cost);
  UPDATE org_balances SET balance_nanos = balance_nanos - $cost WHERE org_id = $org;
  INSERT INTO usage_daily (...) VALUES (...) ON CONFLICT (...) DO UPDATE SET ... += ...;
COMMIT;
-- after COMMIT succeeds: store consumer offset
`}</Code>
        <Quiz
          q="The worker commits the database transaction, then crashes before saving the offset. After restart, what happens?"
          options={[
            "The event is lost forever",
            "The event is read again; ON CONFLICT DO NOTHING makes the second insert a no-op, so no double charge",
            "The customer is charged twice",
            "Postgres rolls back the first transaction",
          ]}
          answer={1}
          explain="At-least-once delivery means re-reading is expected. Idempotent processing (the unique request_id) turns the duplicate into a no-op. If we saved the offset BEFORE the DB commit instead, a crash would lose the event — rule 1 broken."
        />
      </Section>

      <Section title="Step 4 — Pricing">
        <Code lang="text" title="cost formula (doc 06)">{`
cost_nanos =  (input_tokens − cached_input_tokens) × input_nanos_per_token
            +  cached_input_tokens                  × cached_input_nanos_per_token
            +  output_tokens                        × output_nanos_per_token
batch requests: × (100 − batch_discount_pct) / 100
`}</Code>
        <PricingCalc />
        <Callout kind="deep">
          <p>Why output tokens cost 4× input: prefill processes all input tokens in one parallel pass (cheap per token);
          decode produces output one token at a time, each step holding a batch slot and KV memory (expensive per token).
          Cached input skipped prefill entirely, so it is cheapest.</p>
          <p>Why integers: <code>0.1 + 0.2 = 0.30000000000000004</code> in floating point. Over millions of requests, float
          rounding creates or destroys money. <code>i64</code> nano-dollars can count up to ~$9.2 billion with no error.</p>
        </Callout>
      </Section>

      <Section title="Step 5 — The credit ledger">
        <p>
          A ledger is an append-only list of money movements. The balance is not a number we edit — it is the <b>sum of all
          rows</b>. Corrections are new rows (<code>refund</code>, <code>adjustment</code>), never edits. This is how banks and
          accountants have worked for 500 years: you can always explain how you got to today's number.
        </p>
        <Ledger />
        <Callout kind="kiln">
          <code>UNIQUE(kind, ref)</code> on <code>credit_ledger</code> is a second guard: the same Stripe payment
          (<code>ref = payment_intent id</code>) or the same request cannot produce two rows, even if a webhook is delivered twice.
          The nightly <b>reconciliation job</b> recomputes balances from the ledger and <code>usage_daily</code> from
          <code>usage_events</code>; any mismatch raises an alert.
        </Callout>
        <Stepper title="One request, from token to money" steps={[
          { title: "Stream ends", body: <p>Worker reports <code>usage {"{input: 1240, cached: 1024, output: 312}"}</code> in its <code>Finished</code> frame. The worker's count is the truth — it knows exactly what it processed.</p> },
          { title: "Gateway appends", body: <p>Gateway builds the <code>usage.v1</code> event with <code>request_id</code> and appends it to kiln-log (or the spill file). It does not wait for billing.</p> },
          { title: "Worker prices", body: <p>usage-worker reads it, looks up the price valid at <code>started_at</code> (prices are versioned), computes nanos.</p> },
          { title: "One transaction", body: <p>Insert event (dedupe) → ledger row → balance → daily rollup. All or nothing.</p> },
          { title: "Commit offset", body: <p>Only after COMMIT. Then refresh the quota mirror the gateway reads, and check 50/80/100% alert thresholds.</p> },
        ]} />
      </Section>

      <Recap items={[
        "Rule 1: never lose an event. Rule 2: never count one twice.",
        "Exactly-once effect = at-least-once delivery + idempotent processing keyed by request_id.",
        "kiln-log (proposed): segments of [len][crc][payload] records, fsync with group commit, truncate torn tails on recovery.",
        "Commit the DB transaction first, then the consumer offset — duplicates are fine, losses are not.",
        "Prices and money are integer nano-dollars; output costs more than input, cached input costs least.",
        "Ledger is append-only; balance = sum; reconciliation checks the cached balance every night.",
      ]} />
    </>
  );
}
