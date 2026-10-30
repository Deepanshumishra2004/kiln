import { useMemo, useState } from "react";
import {
  Arrow, Box, Callout, Code, PageHeader, Quiz, Recap, Section, Seg, Slider, Stepper, Svg, Viz,
} from "../components/ui";

/* ---------- helpers: base62, CRC32, HMAC (browser crypto) ---------- */

const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function base62(bytes: Uint8Array) {
  // simple big-number base conversion (fine for 32 bytes)
  let digits = Array.from(bytes);
  let out = "";
  while (digits.some((d) => d > 0)) {
    let rem = 0;
    const next: number[] = [];
    for (const d of digits) {
      const acc = rem * 256 + d;
      const q = Math.floor(acc / 62);
      rem = acc % 62;
      if (next.length || q) next.push(q);
    }
    out = B62[rem] + out;
    digits = next;
  }
  return out.padStart(43, "0");
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(s: string) {
  let c = 0xffffffff;
  for (const b of new TextEncoder().encode(s)) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return ((c ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0");
}

function makeKey() {
  const r = new Uint8Array(32);
  crypto.getRandomValues(r);
  const body = "sk-live-" + base62(r);
  return `${body}_${crc32(body)}`;
}

function checkKey(k: string): { ok: boolean; why: string } {
  const m = /^(sk-(live|test|admin)-[0-9A-Za-z]+)_([0-9a-f]{8})$/.exec(k.trim());
  if (!m) return { ok: false, why: "Wrong shape: expected sk-<env>-<base62>_<8 hex>." };
  const want = crc32(m[1]);
  return want === m[3]
    ? { ok: true, why: `Checksum ${m[3]} matches. Looks like a real key → now (and only now) look it up.` }
    : { ok: false, why: `Checksum mismatch: key says ${m[3]}, computed ${want}. Typo or garbage → reject with 401, no database work.` };
}

async function hmacHex(pepper: string, msg: string) {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode(pepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
  return Array.from(sig).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ---------- Visual 1: generate + store ---------- */

function KeyGenerator() {
  const [key, setKey] = useState<string>("");
  const [hash, setHash] = useState<string>("");
  const [pepper, setPepper] = useState("demo-pepper-from-env");

  const generate = async () => {
    const k = makeKey();
    setKey(k);
    setHash(await hmacHex(pepper, k));
  };
  const rehash = async (p: string) => { setPepper(p); if (key) setHash(await hmacHex(p, key)); };

  const display = key ? `${key.slice(0, 12)}…${key.slice(-4)}` : "";
  return (
    <Viz title="Create an API key (really, in your browser)"
      hint="Uses crypto.getRandomValues (the OS random generator) and crypto.subtle HMAC-SHA256 — the same primitives the server uses.">
      <div className="controls">
        <button className="btn primary" onClick={generate}>generate new key</button>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="small muted">pepper (server secret, from env var — never in the DB)</div>
          <input type="text" value={pepper} onChange={(e) => rehash(e.target.value)} />
        </div>
      </div>
      {key && (
        <div className="grid2 fade-in">
          <div className="card">
            <h4>👤 The user gets (shown ONCE)</h4>
            <div className="mono small" style={{ wordBreak: "break-all" }}>
              <span style={{ color: "var(--c2)" }}>{key.slice(0, 8)}</span>
              <span style={{ color: "var(--c1)" }}>{key.slice(8, key.lastIndexOf("_"))}</span>
              <span style={{ color: "var(--c3)" }}>{key.slice(key.lastIndexOf("_"))}</span>
            </div>
            <div className="small muted" style={{ marginTop: 6 }}>
              <span style={{ color: "var(--c2)" }}>prefix</span> · <span style={{ color: "var(--c1)" }}>256 random bits (base62)</span> · <span style={{ color: "var(--c3)" }}>CRC32 checksum</span>
            </div>
          </div>
          <div className="card">
            <h4>🗄️ Postgres stores</h4>
            <div className="small"><b>key_hash</b> (HMAC-SHA256):</div>
            <div className="mono small" style={{ wordBreak: "break-all" }}>{hash}</div>
            <div className="small" style={{ marginTop: 6 }}><b>display_prefix</b>: <span className="mono">{display}</span></div>
            <div className="small muted">The full key is never stored. If the DB leaks, attackers get hashes they cannot reverse — and without the pepper they cannot even test guesses.</div>
          </div>
        </div>
      )}
    </Viz>
  );
}

/* ---------- Visual 2: checksum ---------- */

function ChecksumCheck() {
  const [k, setK] = useState(() => makeKey());
  const res = checkKey(k);
  return (
    <Viz title="Checksum: reject garbage without touching the database"
      hint="Change one character of the key. The CRC32 no longer matches, so the gateway rejects it in microseconds.">
      <input type="text" value={k} onChange={(e) => setK(e.target.value)} />
      <div className="controls">
        <button className="btn" onClick={() => setK(makeKey())}>fresh valid key</button>
        <button className="btn" onClick={() => setK(k.slice(0, 20) + (k[20] === "a" ? "b" : "a") + k.slice(21))}>flip one character</button>
      </div>
      <div className="card small" style={{ borderColor: res.ok ? "var(--c3)" : "var(--c5)" }}>{res.ok ? "✅ " : "❌ "}{res.why}</div>
    </Viz>
  );
}

/* ---------- Visual 3: lookup path with cache + revocation ---------- */

type Ev = { t: number; path: string; ms: number; result: string };

function LookupSim() {
  const [now, setNow] = useState(0);              // seconds
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [revoked, setRevoked] = useState(false);
  const [mode, setMode] = useState<"notify" | "ttl">("notify");
  const [log, setLog] = useState<Ev[]>([]);
  const TTL = 60;

  const cacheValid = cachedAt !== null && now - cachedAt < TTL;

  const send = () => {
    let ev: Ev;
    if (cacheValid) {
      ev = { t: now, path: "cache HIT", ms: 0.01, result: "200 ✅ (cached: active)" };
    } else {
      ev = { t: now, path: "cache MISS → Postgres", ms: 1.8, result: revoked ? "401 ❌ revoked" : "200 ✅" };
      if (!revoked) setCachedAt(now);
    }
    setLog((l) => [ev, ...l].slice(0, 8));
  };
  const revoke = () => {
    setRevoked(true);
    if (mode === "notify") {
      setCachedAt(null);
      setLog((l) => [{ t: now, path: "NOTIFY key_revoked → cache evicted", ms: 0, result: "—" }, ...l].slice(0, 8));
    } else {
      setLog((l) => [{ t: now, path: "revoked in DB only (no notify)", ms: 0, result: "—" }, ...l].slice(0, 8));
    }
  };
  const reset = () => { setNow(0); setCachedAt(null); setRevoked(false); setLog([]); };

  return (
    <Viz title="Key lookup: cache, database, and instant revocation"
      hint="Send requests, then revoke the key. Compare 'notify' (gateway is told immediately) with 'TTL only' (gateway waits until the cache entry expires)."
      caption={revoked && cacheValid ? `⚠️ Key is revoked in the DB, but this gateway still trusts its cache for ${TTL - (now - (cachedAt ?? 0))} more seconds. That is why we need the notify message.` : "Cache hit ≈ 10 µs. Database lookup ≈ 1–2 ms. Auth runs on every request, so the cache matters."}>
      <div className="controls">
        <Seg options={["notify", "ttl"] as const} value={mode} onChange={(m) => { setMode(m); reset(); }} labels={{ notify: "revoke with notify", ttl: "TTL only" }} />
        <button className="btn primary" onClick={send}>send request</button>
        <button className="btn" disabled={revoked} onClick={revoke}>revoke key</button>
        <button className="btn" onClick={() => setNow(now + 15)}>⏩ +15 s</button>
        <button className="btn" onClick={reset}>reset</button>
      </div>
      <Svg w={720} h={120} label="gateway cache and postgres">
        <Box x={10} y={35} w={130} h={50} label="request" sub={`t = ${now}s`} color={1} />
        <Arrow x1={140} y1={60} x2={215} y2={60} />
        <Box x={220} y={20} w={200} h={80} label="gateway cache" sub={cacheValid ? `entry: active (age ${now - (cachedAt ?? 0)}s / ${TTL}s)` : "empty"} color={cacheValid ? 3 : undefined} />
        <Arrow x1={420} y1={60} x2={505} y2={60} dashed={cacheValid} label="on miss" />
        <Box x={510} y={20} w={200} h={80} label="Postgres api_keys" sub={revoked ? "revoked_at = set" : "active"} color={revoked ? 5 : 3} />
      </Svg>
      <table>
        <thead><tr><th>t</th><th>path</th><th>latency</th><th>result</th></tr></thead>
        <tbody>{log.map((e, i) => <tr key={i}><td>{e.t}s</td><td>{e.path}</td><td>{e.ms ? `${e.ms} ms` : ""}</td><td>{e.result}</td></tr>)}</tbody>
      </table>
    </Viz>
  );
}

/* ---------- Visual 4: timing leak ---------- */

function TimingLeak() {
  const secret = "a7f3c9e1";
  const [guess, setGuess] = useState("a7f00000");
  const [mode, setMode] = useState<"naive" | "ct">("naive");
  const matched = useMemo(() => { let i = 0; while (i < secret.length && guess[i] === secret[i]) i++; return i; }, [guess]);
  const time = mode === "naive" ? 10 + matched * 12 : 10 + secret.length * 12;
  return (
    <Viz title="Why comparisons must be constant-time"
      hint="A naive compare stops at the first different byte. An attacker who can measure time learns how many leading bytes are right.">
      <div className="controls">
        <Seg options={["naive", "ct"] as const} value={mode} onChange={setMode} labels={{ naive: "naive ==", ct: "constant-time" }} />
        <div style={{ flex: 1 }}><div className="small muted">attacker's guess (secret is 8 hex chars)</div><input type="text" maxLength={8} value={guess} onChange={(e) => setGuess(e.target.value)} /></div>
      </div>
      <div className="bytes">
        {secret.split("").map((c, i) => (
          <span key={i} style={{ background: mode === "naive" ? (i < matched ? "var(--c5-soft)" : i === matched ? "var(--c2-soft)" : "transparent") : "var(--panel-2)" }}>
            {guess[i] ?? "·"}{mode === "naive" && i < matched ? " ✓" : ""}
          </span>
        ))}
      </div>
      <div style={{ marginTop: 10 }}>
        <div className="small">measured time: <b>{time} ns</b></div>
        <div style={{ height: 14, background: "var(--panel-2)", borderRadius: 4 }}>
          <div style={{ width: `${(time / (10 + 8 * 12)) * 100}%`, height: "100%", background: mode === "naive" ? "var(--c5)" : "var(--c3)", borderRadius: 4, transition: "width .2s" }} />
        </div>
      </div>
      <div className="caption">{mode === "naive"
        ? `Leak: time grows with the number of correct leading characters (${matched}). The attacker can guess one character at a time: 16 tries per position instead of 16^8 total.`
        : "Constant-time: always compares all bytes, so time says nothing. Use the subtle crate (ConstantTimeEq) or compare hashes."}</div>
    </Viz>
  );
}

/* ---------- Hierarchy diagram ---------- */

function Hierarchy() {
  return (
    <Svg w={720} h={260} label="organization, projects and keys">
      <Box x={260} y={10} w={200} h={54} label="Organization: Acme" sub="billing · tier · balance" color={4} />
      <Box x={60} y={110} w={220} h={54} label="Project: prod-backend" sub="budget · isolation" color={1} />
      <Box x={440} y={110} w={220} h={54} label="Project: agents" sub="low budget" color={1} />
      <Arrow x1={330} y1={64} x2={190} y2={108} />
      <Arrow x1={390} y1={64} x2={540} y2={108} />
      <Box x={10} y={200} w={150} h={50} label="sk-live-a1b2…" sub="server key" color={2} />
      <Box x={180} y={200} w={150} h={50} label="sk-live-9xZq…" sub="staging, 10 RPM" color={2} />
      <Box x={480} y={200} w={150} h={50} label="sk-live-Kp3m…" sub="CLI agent" color={2} />
      <Arrow x1={140} y1={164} x2={90} y2={198} />
      <Arrow x1={200} y1={164} x2={250} y2={198} />
      <Arrow x1={550} y1={164} x2={555} y2={198} />
    </Svg>
  );
}

/* ---------- Page ---------- */

export default function Page() {
  return (
    <>
      <PageHeader
        kicker="Platform · Lesson 3"
        title="API keys & auth"
        subtitle="An API key is a password for programs. We will design one the way OpenAI and GitHub do: unguessable, recognisable, and never stored in plain text."
        learn={[
          "The Org → Project → Key hierarchy and why each level exists",
          "Key format: prefix + 256 random bits + checksum",
          "Why we store only a hash (HMAC-SHA256 with a secret pepper)",
          "The lookup path: checksum → hash → cache → Postgres",
          "Instant revocation, constant-time comparison, and leak handling",
        ]}
      />

      <Section title="Who is calling? — the tenancy hierarchy">
        <p>Every request must answer three questions: <b>who pays</b>, <b>which app</b>, and <b>which credential</b>.</p>
        <Hierarchy />
        <ul>
          <li><b>Organization</b>: the customer company. Owns money (credit balance), the usage tier, and the rate limits.</li>
          <li><b>Project</b>: one app or team inside the org. Separate budgets and usage reports.</li>
          <li><b>API key</b>: one credential inside a project. Can be revoked alone without breaking other apps. Can have its own lower limits and allowed models.</li>
        </ul>
        <Callout kind="kiln">
          Tables <code>organizations</code>, <code>projects</code>, <code>api_keys</code> in doc 03. The <code>api_keys</code>
          row also stores <code>org_id</code> (a copy) so auth needs only one indexed lookup.
        </Callout>
      </Section>

      <Section title="Step 1 — The key format">
        <Code lang="text" title="anatomy of a Kiln key">{`
sk-live-2Xk9QmR7vT4pLw8NcB3yZf6HjD1sGa5E...  _1a2b3c4d
└┬┘└─┬┘ └───────────────┬────────────────┘  └───┬───┘
 │   │      32 random bytes, base62            CRC32 of everything before "_"
 │   └ environment: live | test | admin
 └ "secret key"
`}</Code>
        <ul>
          <li><b>32 random bytes = 256 bits</b>. There are 2<sup>256</sup> possible keys (more than atoms in the universe ≈ 2<sup>266</sup>). Guessing is impossible, even at a billion tries per second for a billion years.</li>
          <li><b>Prefix</b> lets humans and secret scanners recognise a Kiln key. Admin keys (<code>sk-admin-</code>) cannot call models, and inference keys cannot call the admin API.</li>
          <li><b>Checksum</b> lets us reject typos and random garbage with zero database work. GitHub tokens use the same trick.</li>
        </ul>
        <KeyGenerator />
        <ChecksumCheck />
        <Callout kind="warn" title="⚠️ Security: never hand-roll crypto in production">
          Implementing SHA-256 or HMAC yourself is a great learning exercise — do it in a scratch crate. But the real gateway
          must use audited crates: <code>getrandom</code>/<code>rand::rngs::OsRng</code> for randomness, <code>sha2</code> +
          <code>hmac</code> for hashing, <code>subtle</code> for constant-time comparison, <code>argon2</code> for passwords.
          Subtle bugs here (weak randomness, timing leaks, wrong padding) silently expose every customer's key, and tests will
          not catch them. CRC32 is <b>not</b> crypto — it only catches typos.
        </Callout>
      </Section>

      <Section title="Step 2 — Why store only a hash?">
        <Callout kind="analogy">
          A hotel does not keep a copy of your room key. It keeps a lock that only your key opens. A hash is the lock: easy to
          check a key against it, impossible to make the key from it.
        </Callout>
        <p>
          A <b>hash function</b> like SHA-256 turns any input into 32 bytes. It is one-way: from the output you cannot get the
          input back. Changing one input bit changes about half the output bits.
        </p>
        <p>Why HMAC-SHA256 with a <b>pepper</b> and not a slow password hash like argon2?</p>
        <table>
          <thead><tr><th></th><th>User passwords</th><th>API keys</th></tr></thead>
          <tbody>
            <tr><td>Entropy</td><td>low (humans pick "summer2024")</td><td>256 bits (random)</td></tr>
            <tr><td>Brute force possible?</td><td>yes → must be slow (argon2, ~50 ms)</td><td>no, never</td></tr>
            <tr><td>How often checked?</td><td>once per login</td><td>every request → must be fast (~1 µs)</td></tr>
            <tr><td>Our choice</td><td>argon2id</td><td>HMAC-SHA256(pepper, key)</td></tr>
          </tbody>
        </table>
        <p>
          The pepper is a server secret in an environment variable, not in the database. A stolen database alone is useless:
          the attacker cannot even check whether a candidate key is valid.
        </p>
        <Quiz
          q="The database is stolen. What can the attacker do with the key_hash column?"
          options={[
            "Reverse the hashes to get the keys",
            "Use the hashes directly as API keys",
            "Almost nothing: hashes cannot be reversed or used, and without the pepper they cannot even test guesses",
            "Decrypt them with the display_prefix",
          ]}
          answer={2}
          explain="The gateway hashes whatever the client sends. Sending a hash as the key would hash it again and fail. One-way + pepper means the column is safe to leak (we would still rotate the pepper and keys to be careful)."
        />
      </Section>

      <Section title="Step 3 — The lookup path on every request">
        <Stepper title="What the gateway does with 'Authorization: Bearer sk-live-…'" steps={[
          { title: "Parse the header", body: <p>Missing header or not <code>Bearer …</code> → <code>401 authentication_error</code>.</p> },
          { title: "Format + checksum", body: <p>Regex shape + CRC32 check. No I/O. Garbage and typos stop here — this protects the database from key-spraying floods.</p> },
          { title: "Hash", body: <p><code>h = HMAC-SHA256(pepper, key)</code>. About 1 µs.</p> },
          { title: "Cache lookup", body: <p>In-process cache (moka-like, TTL 60 s, ~10k entries): <code>h → AuthContext</code>. Hit → done. Unknown keys are cached as "negative" for a few seconds too.</p> },
          { title: "On miss: Postgres", body: <p><code>SELECT … FROM api_keys JOIN projects JOIN organizations WHERE key_hash = $1</code>. One indexed lookup, ~1–2 ms. Result goes into the cache.</p> },
          { title: "Policy checks", body: <p>Revoked? Expired? Project archived? Org suspended? Model allowed? IP allowed? Any "no" → 401/403 with a clear error code.</p> },
          { title: "AuthContext ready", body: <p><code>{"{key_id, project_id, org_id, tier, limits, allowed_models}"}</code> travels with the request to rate limiting, quotas, scheduling, and the usage event.</p> },
        ]} />
        <LookupSim />
        <Callout kind="kiln">
          Revocation must be instant, not "within 60 s". Doc 05 used Redis pub/sub. In the from-scratch proposal Redis may
          be dropped, so the <b>proposed</b> replacement is Postgres <code>LISTEN/NOTIFY</code>: admin-api runs
          <code>NOTIFY key_revoked, '&lt;hash&gt;'</code> in the same transaction as the revoke, and every gateway listens and
          evicts the entry. The TTL stays as a safety net if a message is missed.
        </Callout>
      </Section>

      <Section title="Step 4 — Rust code">
        <Code title="crates/common/src/apikey.rs">{`
use hmac::{Hmac, Mac};
use rand::{rngs::OsRng, RngCore};
use sha2::Sha256;
use subtle::ConstantTimeEq;

type HmacSha256 = Hmac<Sha256>;

pub struct NewKey {
    pub secret: String,        // shown to the user ONCE
    pub hash: [u8; 32],        // stored in api_keys.key_hash
    pub display: String,       // "sk-live-2Xk9…a1b2"
}

pub fn generate(env: &str, pepper: &[u8]) -> NewKey {
    let mut raw = [0u8; 32];
    OsRng.fill_bytes(&mut raw);                       // OS randomness, never a seeded PRNG
    let body = format!("sk-{env}-{}", base62::encode(&raw));
    let secret = format!("{body}_{:08x}", crc32fast::hash(body.as_bytes()));
    let hash = hash_key(pepper, &secret);
    let display = format!("{}…{}", &secret[..12], &secret[secret.len() - 4..]);
    NewKey { secret, hash, display }
}

pub fn hash_key(pepper: &[u8], key: &str) -> [u8; 32] {
    let mut mac = HmacSha256::new_from_slice(pepper).expect("any key length works");
    mac.update(key.as_bytes());
    mac.finalize().into_bytes().into()
}

/// Cheap pre-check: shape + checksum. No I/O.
pub fn looks_valid(key: &str) -> bool {
    let Some((body, sum)) = key.rsplit_once('_') else { return false };
    body.starts_with("sk-")
        && sum.len() == 8
        && u32::from_str_radix(sum, 16).ok() == Some(crc32fast::hash(body.as_bytes()))
}

/// Compare two hashes without leaking timing information.
pub fn same_hash(a: &[u8; 32], b: &[u8; 32]) -> bool {
    a.ct_eq(b).into()
}
`}</Code>
        <Callout kind="rust">
          <ul style={{ margin: 0 }}>
            <li><code>let Some(x) = … else {"{ return false }"};</code> is "let-else": unpack or leave the function early.</li>
            <li><code>[u8; 32]</code> is a fixed-size array stored inline (no heap). Perfect for hashes.</li>
            <li><code>format!("sk-{"{env}"}-…")</code> can use variable names directly inside the braces.</li>
          </ul>
        </Callout>
        <TimingLeak />
        <Callout kind="deep">
          Because we look keys up <b>by hash</b> in a database index, the attacker never gets to compare their guess against
          a specific stored key byte-by-byte, which already removes most timing risk. We still use constant-time comparison
          anywhere secrets are compared directly (webhook signatures, session tokens). It costs nothing and removes a whole class of bugs.
        </Callout>
      </Section>

      <Section title="Step 5 — When a key leaks">
        <p>Keys leak all the time: pushed to GitHub, pasted in a chat, logged by a careless app. The plan (doc 09):</p>
        <ol>
          <li><b>Recognisable format</b> → our own scanner (and GitHub's secret scanning, if we register the pattern) can spot it.</li>
          <li><b>Self-service revoke + rotate</b> in the console, effective in under a second (notify + cache eviction).</li>
          <li><b>Anomaly alerts</b>: spend in the last hour &gt; 10× the 7-day average, new country, many new IPs → alert; extreme cases auto-pause with <code>revoked_reason = 'leaked'</code>.</li>
          <li><b>Limit the blast radius</b>: per-key RPM, allowed models, IP allowlist, project budget.</li>
          <li><b>Never log keys</b>: the <code>authorization</code> header is redacted by our logging layer.</li>
        </ol>
        <Quiz
          q="A user typed their key with one wrong character. What is the cheapest correct reaction?"
          options={[
            "Look it up in Postgres, find nothing, return 401",
            "Checksum fails → return 401 immediately, no cache or database access",
            "Try nearby keys to auto-correct the typo",
            "Return 500 because the key is malformed",
          ]}
          answer={1}
          explain="The checksum exists exactly for this. It also protects Postgres from attackers who spray millions of random keys: they all die at the checksum step."
        />
      </Section>

      <Recap items={[
        "Org pays, project isolates, key authenticates. Each key can be limited and revoked alone.",
        "Key = prefix + 256 random bits + CRC32. Random means unguessable; checksum means cheap rejection.",
        "Store only HMAC-SHA256(pepper, key). Fast enough for every request, useless to a database thief.",
        "Lookup: checksum → hash → in-process cache → Postgres on miss → policy checks → AuthContext.",
        "Revocation needs a push message (proposed: Postgres NOTIFY) — a TTL alone leaves a 60 s window.",
        "Use audited crypto crates in production; compare secrets in constant time.",
      ]} />
    </>
  );
}
