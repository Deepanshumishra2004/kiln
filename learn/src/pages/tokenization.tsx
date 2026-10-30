import { useMemo, useState } from "react";
import {
  PageHeader, Section, Callout, Code, Viz, Slider, Seg, Stepper, Quiz, Recap, Svg, Box, Arrow,
} from "../components/ui";

/* ------------------------------------------------------------------ */
/* A REAL (tiny) byte-level BPE, implemented right here in TypeScript. */
/* ------------------------------------------------------------------ */

// Turn text into a list of "byte symbols".
// ASCII bytes are shown as their character, other bytes as <E2> style hex.
function textToByteSymbols(text: string): string[] {
  const bytes = new TextEncoder().encode(text);
  return Array.from(bytes, (b) =>
    b >= 32 && b < 127 ? String.fromCharCode(b) : `<${b.toString(16).toUpperCase().padStart(2, "0")}>`,
  );
}

// Hand-made merge table. Rank = position in the list. Lower rank = learned earlier = applied first.
const MERGES: [string, string][] = [
  ["e", "r"], ["t", "h"], [" ", "t"], ["i", "n"], ["a", "n"], ["o", "n"], ["e", "n"],
  [" t", "he"], ["h", "e"], ["in", "g"], [" ", "a"], [" ", "s"], ["r", "e"], ["o", "u"],
  ["e", "d"], ["s", "t"], [" ", "w"], [" ", "i"], ["l", "l"], [" ", "c"], ["o", "r"],
  ["a", "t"], [" t", "h"], [" th", "e"], [" ", "m"], ["e", "s"], ["k", "e"], ["t", "o"],
  ["o", "k"], ["to", "k"], ["tok", "en"], [" ", "tok"], [" tok", "en"], ["i", "s"], [" i", "s"],
  ["l", "o"], ["lo", "w"], ["w", "er"], ["low", "er"], [" ", "low"], ["m", "o"], ["mo", "d"],
  ["mod", "el"], ["e", "l"], [" ", "mod"], [" mod", "el"], ["K", "i"], ["Ki", "l"], ["Kil", "n"],
  ["R", "u"], ["Ru", "s"], ["Rus", "t"], [" ", "Rust"], [" ", "Kiln"], ["s", "s"], ["he", "llo"],
  ["h", "ello"], ["e", "ll"], ["ell", "o"], ["H", "ello"], ["!", "!"],
];
const RANK = new Map(MERGES.map(([a, b], i) => [a + "\u0000" + b, i]));

type EncodeStep = { tokens: string[]; merged?: [string, string]; rank?: number };

// Standard BPE encoding: repeatedly merge the adjacent pair with the LOWEST rank.
function bpeEncode(text: string): EncodeStep[] {
  let tokens = textToByteSymbols(text);
  const steps: EncodeStep[] = [{ tokens }];
  for (;;) {
    let best = -1, bestRank = Infinity;
    for (let i = 0; i + 1 < tokens.length; i++) {
      const r = RANK.get(tokens[i] + "\u0000" + tokens[i + 1]);
      if (r !== undefined && r < bestRank) { bestRank = r; best = i; }
    }
    if (best < 0) break;
    const [a, b] = MERGES[bestRank];
    const next: string[] = [];
    for (let i = 0; i < tokens.length; i++) {
      if (i + 1 < tokens.length && tokens[i] === a && tokens[i + 1] === b) { next.push(a + b); i++; }
      else next.push(tokens[i]);
    }
    tokens = next;
    steps.push({ tokens, merged: [a, b], rank: bestRank });
  }
  return steps;
}

// Token id: 0..255 are raw bytes, 256 + rank are merges.
function tokenId(sym: string): number {
  if (sym.length === 1) return sym.charCodeAt(0);
  const hex = /^<([0-9A-F]{2})>$/.exec(sym);
  if (hex) return parseInt(hex[1], 16);
  for (let r = MERGES.length - 1; r >= 0; r--) if (MERGES[r][0] + MERGES[r][1] === sym) return 256 + r;
  return -1;
}

const TOKEN_COLORS = [1, 2, 3, 4, 5, 6] as const;

function TokenChips(props: { tokens: string[]; showIds?: boolean; highlight?: string }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, fontFamily: "var(--mono)", fontSize: "0.85rem" }}>
      {props.tokens.map((t, i) => {
        const c = TOKEN_COLORS[i % TOKEN_COLORS.length];
        const hi = props.highlight && t === props.highlight;
        return (
          <span key={i} style={{
            padding: "2px 6px", borderRadius: 5, background: `var(--c${c}-soft)`,
            border: `1.5px solid ${hi ? "var(--accent)" : `var(--c${c})`}`,
            boxShadow: hi ? "0 0 0 2px var(--accent-soft)" : undefined,
            display: "inline-flex", flexDirection: "column", alignItems: "center", lineHeight: 1.3,
          }}>
            <span style={{ whiteSpace: "pre" }}>{t.replace(/ /g, "·")}</span>
            {props.showIds && <span style={{ fontSize: "0.68rem", color: "var(--muted)" }}>{tokenId(t)}</span>}
          </span>
        );
      })}
    </div>
  );
}

function BpeEncoder() {
  const [text, setText] = useState("Hello the token model is lower in Kiln");
  const steps = useMemo(() => bpeEncode(text.slice(0, 120)), [text]);
  const [k, setK] = useState(999);
  const idx = Math.min(k, steps.length - 1);
  const s = steps[idx];
  return (
    <Viz title="Live BPE encoder (real algorithm, tiny merge table)"
      hint="Type any text. Then drag the slider to replay the merges one at a time. Spaces are shown as ·">
      <input type="text" value={text} onChange={(e) => { setText(e.target.value); setK(999); }} />
      <div className="controls">
        <Slider label="Merge step" value={idx} min={0} max={steps.length - 1}
          onChange={setK} format={(v) => `${v} / ${steps.length - 1}`} />
      </div>
      <div className="small muted" style={{ marginBottom: 6 }}>
        {s.merged
          ? <>Step {idx}: merged <code>{s.merged[0].replace(/ /g, "·")}</code> + <code>{s.merged[1].replace(/ /g, "·")}</code> (rank {s.rank}, the lowest-rank pair present)</>
          : <>Step 0: start from raw UTF-8 bytes. Every byte is its own token.</>}
      </div>
      <TokenChips tokens={s.tokens} showIds highlight={s.merged ? s.merged[0] + s.merged[1] : undefined} />
      <div className="controls small">
        <span>Bytes: <b className="mono">{steps[0].tokens.length}</b></span>
        <span>Tokens now: <b className="mono">{s.tokens.length}</b></span>
        <span>Compression: <b className="mono">{(steps[0].tokens.length / s.tokens.length).toFixed(2)}× </b></span>
      </div>
      <div className="caption">
        Small numbers under each chip are token ids: 0–255 are raw bytes, 256+ are learned merges.
        Try an emoji or "नमस्ते": they fall back to bytes like <code>&lt;E0&gt;</code>, because our tiny table has no merges for them. Nothing is ever "unknown".
      </div>
    </Viz>
  );
}

/* ---------------- BPE training on a tiny corpus ---------------- */

const CORPUS: [string, number][] = [["low", 5], ["lower", 2], ["newest", 6], ["widest", 3], ["lowest", 2]];

function trainBpe(numMerges: number) {
  let words = CORPUS.map(([w, c]) => ({ syms: w.split(""), count: c }));
  const learned: { pair: [string, string]; freq: number }[] = [];
  let lastCounts: [string, number][] = [];
  for (let m = 0; m <= numMerges; m++) {
    const counts = new Map<string, number>();
    for (const w of words)
      for (let i = 0; i + 1 < w.syms.length; i++) {
        const key = w.syms[i] + "\u0000" + w.syms[i + 1];
        counts.set(key, (counts.get(key) ?? 0) + w.count);
      }
    lastCounts = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    if (m === numMerges || lastCounts.length === 0) break;
    const [key, freq] = lastCounts[0];
    const [a, b] = key.split("\u0000") as [string, string];
    learned.push({ pair: [a, b], freq });
    words = words.map((w) => {
      const out: string[] = [];
      for (let i = 0; i < w.syms.length; i++) {
        if (i + 1 < w.syms.length && w.syms[i] === a && w.syms[i + 1] === b) { out.push(a + b); i++; }
        else out.push(w.syms[i]);
      }
      return { syms: out, count: w.count };
    });
  }
  return { words, learned, counts: lastCounts.slice(0, 6) };
}

function BpeTrainer() {
  const [n, setN] = useState(0);
  const { words, learned, counts } = useMemo(() => trainBpe(n), [n]);
  return (
    <Viz title="Training BPE: count pairs, merge the most frequent, repeat"
      hint="Corpus = 5×low, 2×lower, 6×newest, 3×widest, 2×lowest. Move the slider to learn more merges.">
      <Slider label="Merges learned" value={n} min={0} max={10} onChange={setN} />
      <div className="grid2" style={{ marginTop: 10 }}>
        <div>
          <div className="small muted">Words split into current symbols</div>
          {words.map((w, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0" }}>
              <span className="mono small muted" style={{ width: 28 }}>×{w.count}</span>
              <TokenChips tokens={w.syms} />
            </div>
          ))}
        </div>
        <div>
          <div className="small muted">Most frequent adjacent pairs right now</div>
          <table>
            <thead><tr><th>pair</th><th>count</th></tr></thead>
            <tbody>
              {counts.map(([k, c], i) => (
                <tr key={k} style={i === 0 ? { background: "var(--accent-soft)" } : undefined}>
                  <td className="mono">{k.replace("\u0000", " + ")}</td><td className="mono">{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="small muted">Highlighted row = next merge.</div>
        </div>
      </div>
      <div className="small" style={{ marginTop: 8 }}>
        <b>Merge table so far:</b>{" "}
        {learned.length === 0 ? <span className="muted">(empty)</span> :
          learned.map((l, i) => <code key={i} style={{ marginRight: 6 }}>{i}: {l.pair[0]}+{l.pair[1]}</code>)}
      </div>
    </Viz>
  );
}

/* ---------------- Chat template ---------------- */

function ChatTemplate() {
  const [system, setSystem] = useState("You are a helpful assistant.");
  const [user, setUser] = useState("What is a token?");
  const rendered =
    `<|im_start|>system\n${system}<|im_end|>\n<|im_start|>user\n${user}<|im_end|>\n<|im_start|>assistant\n`;
  const parts = rendered.split(/(<\|im_start\|>|<\|im_end\|>)/).filter(Boolean);
  return (
    <Viz title="Qwen chat template: messages → one flat string"
      hint="Edit the messages. Orange chips are special tokens: each is exactly ONE token id, and users can never type them.">
      <div className="grid2">
        <div><div className="small muted">system</div><input type="text" value={system} onChange={(e) => setSystem(e.target.value)} /></div>
        <div><div className="small muted">user</div><input type="text" value={user} onChange={(e) => setUser(e.target.value)} /></div>
      </div>
      <pre style={{ background: "var(--code-bg)", border: "1px solid var(--border)", borderRadius: 8, padding: 12, whiteSpace: "pre-wrap", fontFamily: "var(--mono)", fontSize: "0.85rem", marginTop: 12 }}>
        {parts.map((p, i) =>
          p.startsWith("<|")
            ? <span key={i} style={{ background: "var(--c2-soft)", color: "var(--c2)", border: "1px solid var(--c2)", borderRadius: 4, padding: "0 3px" }}>{p}</span>
            : <span key={i}>{p}</span>)}
        <span style={{ opacity: 0.5 }}>▌ ← the model continues from here</span>
      </pre>
      <div className="caption">
        <code>&lt;|im_start|&gt;</code> = id 151644, <code>&lt;|im_end|&gt;</code> = id 151645 in Qwen's vocabulary.
        The model stops when it generates <code>&lt;|im_end|&gt;</code>.
      </div>
    </Viz>
  );
}

/* ---------------- Granularity comparison ---------------- */

function Granularity() {
  const [mode, setMode] = useState<"chars" | "words" | "bpe">("bpe");
  const text = "the lower model is tokenizing";
  const toks =
    mode === "chars" ? text.split("") :
    mode === "words" ? text.split(/(?= )/) :
    bpeEncode(text).slice(-1)[0].tokens;
  const info = {
    chars: "Tiny vocabulary (~256), but sequences are very long. Attention cost grows with length², so this is slow.",
    words: "Short sequences, but the vocabulary explodes (every word form, name, typo). Unknown words break it.",
    bpe: "The middle: common pieces become one token, rare words split into known pieces. Vocabulary ~150k, never unknown.",
  }[mode];
  return (
    <Viz title="Three ways to cut text" hint="Switch between the three strategies.">
      <Seg options={["chars", "words", "bpe"] as const} value={mode} onChange={setMode}
        labels={{ chars: "Characters", words: "Words", bpe: "BPE subwords" }} />
      <div style={{ marginTop: 12 }}><TokenChips tokens={toks} /></div>
      <p className="small"><b>{toks.length} tokens.</b> {info}</p>
    </Viz>
  );
}

/* ---------------- Pipeline diagram ---------------- */

function PipelineDiagram() {
  return (
    <Svg w={740} h={130} label="text to ids pipeline">
      <Box x={5} y={35} w={110} h={56} label="text" sub="&quot;héllo&quot;" color={1} />
      <Arrow x1={115} y1={63} x2={150} y2={63} />
      <Box x={150} y={35} w={130} h={56} label="UTF-8 bytes" sub="68 C3 A9 6C 6C 6F" color={2} />
      <Arrow x1={280} y1={63} x2={315} y2={63} />
      <Box x={315} y={35} w={130} h={56} label="pre-split" sub="regex: words, spaces" color={4} />
      <Arrow x1={445} y1={63} x2={480} y2={63} />
      <Box x={480} y={35} w={120} h={56} label="BPE merges" sub="lowest rank first" color={6} />
      <Arrow x1={600} y1={63} x2={635} y2={63} />
      <Box x={635} y={35} w={100} h={56} label="ids" sub="[71, 2309]" color={3} />
    </Svg>
  );
}

/* ---------------- Page ---------------- */

export default function Page() {
  return (
    <>
      <PageHeader
        kicker="LLMs · Lesson 1"
        title="Tokenization (BPE)"
        subtitle="A model cannot read letters. It reads numbers. Tokenization is how text becomes numbers — and back."
        learn={[
          "Why models do not use characters or whole words",
          "How UTF-8 turns any text into bytes",
          "How BPE learns merges (training) and uses them (encoding) — with a real working encoder",
          "Special tokens and the Qwen chat template",
          "How we will write our own tokenizer in Rust, and why tokens are the billing unit",
        ]}
      />

      <Section title="1. The problem: models only understand numbers">
        <p>
          A neural network is a big math function. Its input must be numbers. So before the model sees
          your prompt, we must turn the text into a list of integers. Each integer is a <b>token id</b>.
          After the model answers with ids, we turn them back into text. This two-way mapping is the <b>tokenizer</b>.
        </p>
        <Callout kind="analogy">
          <p>Think of a phrase book. Common phrases ("good morning") have one entry. Rare words you spell
            letter by letter. The tokenizer is the phrase book; the token id is the page number.</p>
        </Callout>
        <p>How should we cut text into pieces? There are three options. Try them:</p>
        <Granularity />
        <Callout kind="idea">
          <p>We want two things at the same time: <b>short sequences</b> (fast, because attention cost grows
            with length) and a <b>vocabulary of reasonable size</b> (the embedding table and the output layer
            have one row per token). BPE is the balance between them.</p>
        </Callout>
      </Section>

      <Section title="2. First, bytes: UTF-8">
        <p>
          Computers store text as bytes using <b>UTF-8</b>. English letters take 1 byte. Accented letters take 2.
          Hindi, Chinese and most emoji take 3 or 4. Every possible text is just a list of bytes in 0–255.
        </p>
        <div className="grid3">
          <div className="card"><h4 className="mono">"a"</h4><div className="bytes"><span>61</span></div><div className="small muted">1 byte</div></div>
          <div className="card"><h4 className="mono">"é"</h4><div className="bytes"><span>C3</span><span>A9</span></div><div className="small muted">2 bytes</div></div>
          <div className="card"><h4 className="mono">"🔥"</h4><div className="bytes"><span>F0</span><span>9F</span><span>94</span><span>A5</span></div><div className="small muted">4 bytes</div></div>
        </div>
        <p>
          <b>Byte-level BPE</b> (what Qwen uses) starts from these 256 byte values. So the 256 bytes are always in the
          vocabulary, and <b>no text can ever be "unknown"</b>. In the worst case a strange character is just a few byte tokens.
        </p>
        <PipelineDiagram />
      </Section>

      <Section title="3. Training BPE: learn which pieces are common">
        <p>
          BPE means <b>Byte Pair Encoding</b>. Training is a simple loop over a huge text corpus:
        </p>
        <ol>
          <li>Split every word into single symbols (bytes).</li>
          <li>Count every <b>adjacent pair</b> of symbols across the whole corpus.</li>
          <li>Take the most frequent pair, for example <code>e + s</code>, and make it a new symbol <code>es</code>.</li>
          <li>Write this merge into the <b>merge table</b>. Its position is its <b>rank</b>.</li>
          <li>Repeat until the vocabulary is the size you want (Qwen: about 151,000).</li>
        </ol>
        <BpeTrainer />
        <Callout kind="deep">
          <p>Real training first <b>pre-splits</b> text with a regex (letters, digits, punctuation, spaces), so merges never
            cross word boundaries like "dog." + "The". That is why many tokens begin with a space: <code>·the</code>, <code>·model</code>.
            The space belongs to the word that follows it.</p>
        </Callout>
        <p>We do <b>not</b> train our own tokenizer. A tokenizer must match the model: Qwen was trained with its own
          vocabulary, so we load Qwen's merge table from the model files. But we <b>do</b> write the encoder ourselves.</p>
      </Section>

      <Section title="4. Encoding: applying the merges">
        <p>
          To encode new text, start from bytes and repeatedly merge the adjacent pair with the <b>lowest rank</b>
          (the merge that was learned first). Stop when no adjacent pair is in the table.
          This is a real implementation running in your browser:
        </p>
        <BpeEncoder />
        <Quiz
          q="Why does encoding merge the LOWEST-rank pair first, not the most frequent pair in your sentence?"
          options={[
            "Because it is faster",
            "Because encoding must reproduce exactly the same splits the model saw during training",
            "Because high-rank merges are wrong",
          ]}
          answer={1}
          explain="Ranks record the order merges were learned. Replaying them in the same order gives the same tokens the model was trained on. A different split would be text the model has rarely seen."
        />
        <Callout kind="deep" title="🔬 Decoding is easy">
          <p>Decoding is the reverse: each id maps to its bytes; concatenate the bytes; interpret as UTF-8.
            One catch for streaming: a single token can end in the <b>middle</b> of a multi-byte character
            (e.g. first 2 bytes of 🔥). The streamer must hold back incomplete bytes until the character is complete,
            or the client sees garbage like <code>�</code>.</p>
        </Callout>
      </Section>

      <Section title="5. Special tokens and the chat template">
        <p>
          Chat models are trained on conversations in a fixed format. Special tokens mark who is speaking.
          They are added to the vocabulary as single ids and are <b>never produced by BPE</b> from user text —
          otherwise a user could fake a "system" message (prompt injection at the token level).
        </p>
        <ChatTemplate />
        <Callout kind="warn">
          <p>If our template differs from the one used in training by even one newline, quality drops silently.
            We will test our hand-written template against the reference template output, byte for byte.</p>
        </Callout>
      </Section>

      <Section title="6. Our tokenizer in Rust">
        <p>
          Qwen ships a <code>tokenizer.json</code> file containing the vocabulary (piece → id) and the merges list.
          Our Rust code loads it once and builds two hash maps. Read the comments line by line:
        </p>
        <Code title="kiln-engine/src/tokenizer/mod.rs">{`
use std::collections::HashMap;

/// A byte-level BPE tokenizer. Built once at startup, then shared (read-only) by all threads.
pub struct Tokenizer {
    /// (left id, right id) -> (rank, merged id). Lower rank = learned earlier = applied first.
    merges: HashMap<(u32, u32), (u32, u32)>,
    /// id -> raw bytes, used for decoding.
    id_to_bytes: Vec<Vec<u8>>,
    /// special tokens like "<|im_start|>" -> 151644
    special: HashMap<String, u32>,
}

impl Tokenizer {
    /// Encode one pre-split piece of text (special tokens handled by the caller).
    pub fn encode_piece(&self, piece: &str) -> Vec<u32> {
        // 1. start: one token per byte (we map each byte to its base id)
        let mut ids: Vec<u32> = piece.bytes().map(|b| self.byte_id(b)).collect();

        // 2. repeatedly merge the lowest-rank adjacent pair
        loop {
            let mut best: Option<(usize, u32, u32)> = None; // (position, rank, new id)
            for i in 0..ids.len().saturating_sub(1) {
                if let Some(&(rank, new_id)) = self.merges.get(&(ids[i], ids[i + 1])) {
                    if best.map_or(true, |(_, r, _)| rank < r) {
                        best = Some((i, rank, new_id));
                    }
                }
            }
            match best {
                None => break,                       // nothing left to merge
                Some((i, _, new_id)) => {
                    ids[i] = new_id;                 // replace the pair...
                    ids.remove(i + 1);               // ...with one token
                }
            }
        }
        ids
    }

    pub fn decode(&self, ids: &[u32]) -> Vec<u8> {
        ids.iter().flat_map(|&id| self.id_to_bytes[id as usize].iter().copied()).collect()
    }

    fn byte_id(&self, b: u8) -> u32 { /* lookup in a 256-entry table */ b as u32 }
}
`}</Code>
        <Callout kind="rust">
          <p><code>Vec&lt;u32&gt;</code> is a growable array of 32-bit unsigned numbers. <code>HashMap&lt;(u32, u32), (u32, u32)&gt;</code> uses a
            <b>tuple</b> as key. <code>Option</code> means "maybe a value": <code>None</code> or <code>Some(x)</code>. The <code>match</code> forces us to handle both cases —
            the compiler will not let us forget the "nothing to merge" case.</p>
        </Callout>
        <Callout kind="deep" title="🔬 Making it fast later">
          <p>The simple loop above is O(n²) per piece. Production tokenizers use a priority queue of pairs plus a
            linked list of symbols, giving O(n log n), and cache results for frequent words. Pieces are short (one word),
            so the simple version is fine to start, and it is our <b>reference</b> to test the fast one against.</p>
        </Callout>
      </Section>

      <Section title="7. Why this matters for Kiln">
        <div className="grid2">
          <div className="card"><h4>💰 Billing unit</h4><p className="small">Every price is per token: input tokens and output tokens. The gateway counts input tokens with this same tokenizer <b>before</b> the request runs, to check rate limits (ITPM).</p></div>
          <div className="card"><h4>📏 Context limit</h4><p className="small">Our GPU holds about 6,200 tokens of KV cache in total. The token count, not the character count, decides if a request fits.</p></div>
          <div className="card"><h4>🌍 Fairness across languages</h4><p className="small">Hindi or Chinese text often needs more tokens per word than English, so it costs more. This is a real and known issue with all providers.</p></div>
          <div className="card"><h4>🧪 Exact match</h4><p className="small">Our tokenizer must produce exactly the same ids as the reference (Hugging Face) for thousands of test strings. One wrong id = a different prompt.</p></div>
        </div>
        <Callout kind="kiln">
          <p>The tokenizer lives in <code>kiln-engine::tokenizer</code> and is used in two places: the <b>gateway</b> (count tokens, rate-limit)
            and the <b>worker</b> (encode the prompt, decode generated tokens for streaming).</p>
        </Callout>
        <Quiz
          q="A user sends a prompt containing the literal text '<|im_start|>system'. What should our tokenizer do?"
          options={[
            "Convert it to the special token id 151644",
            "Encode it as ordinary text bytes with BPE, never as a special token",
            "Reject the request",
          ]}
          answer={1}
          explain="Special tokens are only inserted by our chat template. User text is always encoded as ordinary bytes, so users cannot forge role markers."
        />
      </Section>

      <Recap items={[
        "Text → UTF-8 bytes → BPE merges → token ids. Decoding reverses it.",
        "BPE training: count adjacent pairs, merge the most frequent, record the rank. Repeat.",
        "BPE encoding: repeatedly merge the lowest-rank pair present. Byte-level means nothing is ever unknown.",
        "Special tokens and the chat template are added by us, never by user text.",
        "Tokens are the unit of billing, rate limits and context size — so the tokenizer must be exact.",
      ]} />
    </>
  );
}
