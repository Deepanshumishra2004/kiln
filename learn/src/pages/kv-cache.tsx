import { useState } from "react";
import {
  PageHeader, Section, Callout, Code, Viz, Slider, Seg, Stepper, Quiz, Recap, Svg, Box, Arrow,
} from "../components/ui";

/* ---------------- 1. Recompute vs cache ---------------- */

function CostCompare() {
  const [n, setN] = useState(200);
  // without cache: generating token t recomputes K,V for all t previous tokens
  const without = (n * (n + 1)) / 2;
  const withc = n;
  const W = 600;
  return (
    <Viz title="How much K/V work to generate N tokens?" hint="Without a cache, step t recomputes keys and values for all t tokens. With a cache, each token is computed once.">
      <Slider label="tokens generated (N)" value={n} min={10} max={2000} step={10} onChange={setN} />
      <Svg w={740} h={90} label="cost bars">
        <text x={0} y={22} fontSize={12} fill="var(--text)">no cache</text>
        <rect x={100} y={8} width={W} height={20} rx={3} fill="var(--c5)" fillOpacity={0.75} />
        <text x={106} y={23} fontSize={11} fill="white">{without.toLocaleString()} token-computations  (N²/2)</text>
        <text x={0} y={62} fontSize={12} fill="var(--text)">KV cache</text>
        <rect x={100} y={48} width={Math.max(2, (W * withc) / without)} height={20} rx={3} fill="var(--c3)" />
        <text x={106 + Math.max(2, (W * withc) / without)} y={63} fontSize={11} fill="var(--text)">{withc.toLocaleString()} (N) — {Math.round(without / withc)}× less</text>
      </Svg>
    </Viz>
  );
}

const RECOMPUTE_STEPS = [
  { title: "Step 1: prompt “The cat sat”", body: <p>Prefill computes q, k, v for all 3 tokens in every layer. Attention needs the k and v of all earlier tokens.</p> },
  { title: "Step 2: generate “on”", body: <p>To produce the 4th token, the new token's query must be compared with the keys of “The”, “cat”, “sat” — and mixed with their values. Should we compute those again?</p> },
  { title: "The key observation", body: <p>Because of the <b>causal mask</b>, the k and v of “The” depend only on tokens up to “The”. Adding later tokens never changes them. So they are <b>the same every step</b>. Computing them again is pure waste.</p> },
  { title: "So: store them", body: <p>After computing a token's k and v (per layer), write them into a buffer: the <b>KV cache</b>. Each new step computes q, k, v for only the <b>one</b> new token, appends its k and v, and reads all previous ones from the cache.</p> },
  { title: "The price", body: <p>Memory. Every token of every active request keeps its k and v for all 36 layers, for as long as the request lives. For Qwen3-4B that is <b>144 KiB per token</b>. The KV cache, not the weights, decides how many users we can serve at once.</p> },
];

/* ---------------- 2. Memory calculator ---------------- */

function MemCalc() {
  const [layers, setLayers] = useState(36);
  const [kvHeads, setKvHeads] = useState(8);
  const [headDim, setHeadDim] = useState(128);
  const [dtype, setDtype] = useState<"fp16" | "q8">("fp16");
  const [ctx, setCtx] = useState(2048);
  const [users, setUsers] = useState(3);
  const bytesPer = dtype === "fp16" ? 2 : 1.0625; // q8 with a small scale overhead
  const perToken = 2 * layers * kvHeads * headDim * bytesPer;
  const total = perToken * ctx * users;
  const budget = 900 * 1024 * 1024;
  const pct = total / budget;
  return (
    <Viz title="KV cache memory calculator" hint="Defaults are Qwen3-4B. Budget = ~900 MiB left on our 4 GB GPU after weights.">
      <div className="controls">
        <Slider label="layers" value={layers} min={1} max={80} onChange={setLayers} />
        <Slider label="KV heads" value={kvHeads} min={1} max={64} onChange={setKvHeads} />
        <Slider label="head dim" value={headDim} min={32} max={256} step={32} onChange={setHeadDim} />
        <Slider label="context per request (tokens)" value={ctx} min={128} max={32768} step={128} onChange={setCtx} />
        <Slider label="concurrent requests" value={users} min={1} max={32} onChange={setUsers} />
        <div><div className="small muted">KV dtype</div><Seg options={["fp16", "q8"] as const} value={dtype} onChange={setDtype} /></div>
      </div>
      <p className="mono small">
        per token = 2 (K,V) × {layers} × {kvHeads} × {headDim} × {bytesPer} B = <b>{(perToken / 1024).toFixed(1)} KiB</b><br />
        total = {(perToken / 1024).toFixed(1)} KiB × {ctx.toLocaleString()} tokens × {users} requests = <b>{(total / 1024 / 1024).toFixed(0)} MiB</b>
      </p>
      <Svg w={740} h={50} label="budget">
        <rect x={0} y={10} width={700} height={24} rx={4} fill="var(--panel-2)" stroke="var(--border)" />
        <rect x={0} y={10} width={Math.min(700, 700 * pct)} height={24} rx={4} fill={pct <= 1 ? "var(--c3)" : "var(--c5)"} fillOpacity={0.8} />
        <text x={8} y={27} fontSize={12} fill="var(--text)">{(pct * 100).toFixed(0)}% of 900 MiB budget {pct > 1 ? "— does NOT fit" : "— fits"}</text>
      </Svg>
      <div className="caption">Max tokens in the budget: <b>{Math.floor(budget / perToken).toLocaleString()}</b> (shared by all requests).</div>
    </Viz>
  );
}

/* ---------------- 3. Paged allocator simulator ---------------- */

const BLOCK = 4;          // tokens per block (real: 16) — small so you can see it
const NBLOCKS = 32;
const PREFIX_TOKENS = 8;  // shared system prompt = 2 full blocks

type Req = { id: number; name: string; tokens: number; blocks: number[]; color: number; prefixShared: number };
type Sim = { reqs: Req[]; ref: number[]; owner: (number | null)[]; prefixBlocks: number[] | null; nextId: number; log: string[] };

const initSim = (): Sim => ({ reqs: [], ref: Array(NBLOCKS).fill(0), owner: Array(NBLOCKS).fill(null), prefixBlocks: null, nextId: 1, log: [] });

// Prefer truly free blocks; otherwise evict a cached prefix block with refcount 0 (LRU-ish).
function allocBlock(s: Sim, owner: number): number | null {
  let i = s.owner.findIndex((o, k) => o === null && s.ref[k] === 0);
  if (i < 0) {
    i = s.owner.findIndex((o, k) => o === -1 && s.ref[k] === 0);
    if (i < 0) return null;
    s.prefixBlocks = null;                                   // prefix evicted: next request misses
    s.owner = s.owner.map((o) => (o === -1 ? null : o));
    s.log.push(`evicted cached prefix block ${i}`);
  }
  s.ref[i] = 1; s.owner[i] = owner;
  return i;
}

function KvSimulator() {
  const [sim, setSim] = useState<Sim>(initSim);
  const [len, setLen] = useState(10);
  const [usePrefix, setUsePrefix] = useState<"off" | "on">("on");
  const [maxCtx] = useState(24);

  const update = (f: (s: Sim) => void) => setSim((old) => {
    const s: Sim = { ...old, reqs: old.reqs.map((r) => ({ ...r, blocks: [...r.blocks] })), ref: [...old.ref], owner: [...old.owner], log: [...old.log] };
    f(s);
    s.log = s.log.slice(-5);
    return s;
  });

  const addReq = () => update((s) => {
    const id = s.nextId++;
    const r: Req = { id, name: `R${id}`, tokens: 0, blocks: [], color: ((id - 1) % 6) + 1, prefixShared: 0 };
    let remaining = len;
    if (usePrefix === "on" && len >= PREFIX_TOKENS) {
      if (s.prefixBlocks && s.prefixBlocks.every((b) => s.owner[b] === -1)) {
        for (const b of s.prefixBlocks) { s.ref[b]++; r.blocks.push(b); }
        r.prefixShared = s.prefixBlocks.length;
        s.log.push(`${r.name}: prefix cache HIT — reused blocks ${s.prefixBlocks.join(", ")} (no prefill for ${PREFIX_TOKENS} tokens)`);
      } else {
        const pb: number[] = [];
        for (let k = 0; k < PREFIX_TOKENS / BLOCK; k++) { const b = allocBlock(s, -1); if (b === null) { s.log.push("OUT OF BLOCKS"); return; } pb.push(b); }
        s.prefixBlocks = pb; r.blocks.push(...pb); r.prefixShared = pb.length;
        s.log.push(`${r.name}: prefix cache MISS — computed and cached prefix in blocks ${pb.join(", ")}`);
      }
      r.tokens = PREFIX_TOKENS; remaining -= PREFIX_TOKENS;
    }
    while (remaining > 0) {
      if (r.tokens % BLOCK === 0) {
        const b = allocBlock(s, id);
        if (b === null) { s.log.push(`${r.name}: OUT OF BLOCKS — request must wait in the queue`); for (const bb of r.blocks) { s.ref[bb]--; if (s.ref[bb] === 0 && s.owner[bb] !== -1) s.owner[bb] = null; } return; }
        r.blocks.push(b);
      }
      r.tokens++; remaining--;
    }
    s.reqs.push(r);
    if (!r.prefixShared) s.log.push(`${r.name}: prompt ${len} tokens → ${r.blocks.length} blocks`);
  });

  const step = () => update((s) => {
    for (const r of s.reqs) {
      if (r.tokens % BLOCK === 0) {
        const b = allocBlock(s, r.id);
        if (b === null) { s.log.push(`${r.name}: needs a new block but none free → PREEMPT (pause it, free its blocks, recompute later)`); continue; }
        r.blocks.push(b);
        s.log.push(`${r.name}: block full → new block ${b}`);
      }
      r.tokens++;
    }
  });

  const finish = (id: number) => update((s) => {
    const r = s.reqs.find((x) => x.id === id)!;
    for (const b of r.blocks) {
      s.ref[b]--;
      // shared prefix blocks stay cached (owner -1) even at ref 0 until evicted; private blocks become free
      if (s.ref[b] === 0 && s.owner[b] !== -1) s.owner[b] = null;
    }
    s.reqs = s.reqs.filter((x) => x.id !== id);
    s.log.push(`${r.name}: finished → freed ${r.blocks.length - r.prefixShared} private blocks${r.prefixShared ? ", prefix refcount −1" : ""}`);
  });

  const used = sim.ref.filter((r) => r > 0).length;
  const naive = sim.reqs.length * Math.ceil(maxCtx / BLOCK);
  const tokensStored = sim.reqs.reduce((a, r) => a + r.tokens - (r.prefixShared ? PREFIX_TOKENS : 0), 0) + (sim.prefixBlocks ? PREFIX_TOKENS : 0);

  const cs = 42;
  return (
    <Viz title="Paged KV cache simulator" hint={`32 physical blocks × ${BLOCK} tokens each. Add requests, generate tokens, finish requests. Numbers in blocks = refcount.`}>
      <div className="controls">
        <Slider label="prompt length (tokens)" value={len} min={1} max={20} onChange={setLen} />
        <div><span className="small muted">shared system prompt (8 tokens) </span><Seg options={["off", "on"] as const} value={usePrefix} onChange={setUsePrefix} /></div>
        <button className="btn primary" onClick={addReq}>+ Add request</button>
        <button className="btn" onClick={step} disabled={!sim.reqs.length}>▶ Decode 1 step (all)</button>
        <button className="btn" onClick={() => setSim(initSim())}>Reset</button>
      </div>
      <Svg w={740} h={2 * cs + 30} label="physical blocks">
        <text x={0} y={12} fontSize={11} fill="var(--muted)">GPU memory — physical blocks 0..31</text>
        {sim.ref.map((ref, i) => {
          const owner = sim.owner[i];
          const req = sim.reqs.find((r) => r.id === owner);
          const isPrefix = owner === -1;
          const color = isPrefix ? 4 : req?.color;
          const x = (i % 16) * (cs + 3), y = 20 + Math.floor(i / 16) * (cs + 4);
          return (
            <g key={i}>
              <rect x={x} y={y} width={cs} height={cs} rx={5}
                fill={color ? `var(--c${color}-soft)` : "var(--panel-2)"}
                stroke={color ? `var(--c${color})` : "var(--border)"} strokeWidth={1.5}
                strokeDasharray={isPrefix && ref === 0 ? "4 3" : undefined} />
              <text x={x + 4} y={y + 12} fontSize={9} fill="var(--muted)">{i}</text>
              {(ref > 0 || isPrefix) && <text x={x + cs / 2} y={y + cs / 2 + 7} fontSize={13} textAnchor="middle" fontWeight={700} fill="var(--text)">{isPrefix ? `P${ref}` : ref}</text>}
            </g>
          );
        })}
      </Svg>
      <div className="small" style={{ marginTop: 6 }}>
        <b>Block tables</b> (logical → physical, like an OS page table):
        {sim.reqs.length === 0 && <span className="muted"> no requests yet</span>}
        {sim.reqs.map((r) => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0", flexWrap: "wrap" }}>
            <span className="pill" style={{ background: `var(--c${r.color}-soft)`, color: `var(--c${r.color})` }}>{r.name}</span>
            <span className="mono">{r.tokens} tok →</span>
            <span className="mono">[{r.blocks.map((b, k) => <span key={k} style={{ color: k < r.prefixShared ? "var(--c4)" : undefined }}>{b}{k < r.blocks.length - 1 ? ", " : ""}</span>)}]</span>
            <button className="btn" onClick={() => finish(r.id)}>finish</button>
          </div>
        ))}
      </div>
      <div className="grid3" style={{ marginTop: 8 }}>
        <div className="card small"><div className="muted">blocks in use</div><b className="mono">{used} / {NBLOCKS}</b></div>
        <div className="card small"><div className="muted">tokens stored (unique)</div><b className="mono">{tokensStored}</b></div>
        <div className="card small"><div className="muted">naive "reserve max ctx ({maxCtx})" would need</div><b className="mono" style={{ color: naive > NBLOCKS ? "var(--c5)" : undefined }}>{naive} blocks</b></div>
      </div>
      <div className="mono small" style={{ marginTop: 8, background: "var(--code-bg)", padding: 8, borderRadius: 6, minHeight: 30 }}>
        {sim.log.map((l, i) => <div key={i}>› {l}</div>)}
      </div>
      <div className="caption">P = shared prefix block (purple). Dashed purple = cached prefix with refcount 0: still valid, kept for future hits, evicted first when memory runs out (LRU).</div>
    </Viz>
  );
}

/* ---------------- 4. Virtual memory diagram ---------------- */

function PagingDiagram() {
  return (
    <Svg w={740} h={210} label="block table mapping">
      <text x={10} y={16} fontSize={12} fill="var(--muted)">Request A: logical blocks</text>
      {[0, 1, 2].map((i) => <Box key={"a" + i} x={10 + i * 70} y={24} w={62} h={36} label={`A${i}`} color={1} />)}
      <text x={10} y={96} fontSize={12} fill="var(--muted)">Request B: logical blocks</text>
      {[0, 1].map((i) => <Box key={"b" + i} x={10 + i * 70} y={104} w={62} h={36} label={`B${i}`} color={2} />)}
      <text x={420} y={16} fontSize={12} fill="var(--muted)">Physical blocks in VRAM</text>
      {Array.from({ length: 8 }, (_, i) => {
        const map: Record<number, [string, 1 | 2]> = { 1: ["A0", 1], 6: ["A1", 1], 3: ["A2", 1], 0: ["B0", 2], 4: ["B1", 2] };
        const m = map[i];
        return <Box key={"p" + i} x={420 + (i % 4) * 78} y={24 + Math.floor(i / 4) * 60} w={70} h={44} label={m ? m[0] : "free"} sub={`#${i}`} color={m ? m[1] : undefined} />;
      })}
      <Arrow x1={41} y1={60} x2={530} y2={46} dashed />
      <Arrow x1={111} y1={60} x2={535} y2={100} dashed />
      <Arrow x1={181} y1={60} x2={685} y2={46} dashed />
      <text x={10} y={175} fontSize={12} fill="var(--text)">Each request sees a continuous list of blocks; physically they are anywhere.</text>
      <text x={10} y={195} fontSize={12} fill="var(--text)">A request only owns blocks for tokens that exist (+ at most one partially filled block).</text>
    </Svg>
  );
}

/* ---------------- Page ---------------- */

export default function Page() {
  return (
    <>
      <PageHeader
        kicker="LLMs · Lesson 5"
        title="KV cache & paged memory"
        subtitle="The memory that decides how many users one GPU can serve — and how we manage it like an operating system."
        learn={[
          "Why recomputing keys and values every step is wasteful, and what the KV cache stores",
          "The KV memory formula, and why it limits concurrency on our 4 GB GPU",
          "Paged attention: fixed-size blocks + block tables, like OS virtual memory",
          "Prefix caching with shared blocks and reference counts; eviction",
          "Our BlockAllocator in Rust",
        ]}
      />

      <Section title="1. Why a cache?">
        <Stepper title="The idea in five steps" steps={RECOMPUTE_STEPS} />
        <CostCompare />
      </Section>

      <Section title="2. What exactly is stored, and how big is it?">
        <p>
          For every token, for every layer, we store the <b>key</b> and <b>value</b> vectors of every <b>KV head</b>. Qwen3-4B has 36 layers,
          8 KV heads (thanks to GQA) and 128 numbers per head, in fp16 (2 bytes):
        </p>
        <Code lang="text">{`
2 (K and V) × 36 layers × 8 KV heads × 128 dims × 2 bytes = 147,456 bytes ≈ 144 KiB per token
`}</Code>
        <p>Our GPU has ~900 MiB left after loading the 4-bit weights → about <b>6,200 tokens in total</b>, shared by all requests. Play with the numbers:</p>
        <MemCalc />
        <Callout kind="idea">
          <p>On big GPUs it's the same story: the weights are fixed, but the KV cache grows with <b>users × context length</b>.
            Providers' capacity planning is mostly KV-cache planning. That is why long-context requests cost more.</p>
        </Callout>
        <Quiz
          q="Qwen3-4B with 8-bit KV cache instead of fp16. Roughly how many tokens fit in our 900 MiB?"
          options={["~3,100", "~6,200", "~12,000"]}
          answer={2}
          explain="Half the bytes per value → roughly double the tokens: ~12,000 (a little less due to the scales stored with q8)."
        />
      </Section>

      <Section title="3. The fragmentation problem">
        <p>
          The simple approach: when a request arrives, reserve one contiguous buffer for its maximum length (e.g. 8,192 tokens). But most requests
          are much shorter, and we don't know the final length in advance. Result: <b>60–80% of KV memory is reserved but empty</b>. Also, freed buffers
          leave holes of odd sizes (fragmentation).
        </p>
        <Callout kind="analogy">
          <p>A restaurant that reserves a 10-seat table for every group "in case more friends come". Most groups are 2 people. The restaurant looks full
            while most seats are empty.</p>
        </Callout>
      </Section>

      <Section title="4. Paged KV cache: borrow the OS idea">
        <p>
          Operating systems solved this 50 years ago with <b>virtual memory</b>: memory is split into fixed-size <b>pages</b>; each program has a <b>page table</b>
          mapping its logical pages to any physical page. <b>PagedAttention</b> (vLLM, 2023) does the same for the KV cache:
        </p>
        <ul>
          <li>KV memory is split into <b>blocks</b> of 16 tokens each (Qwen3-4B: 16 × 144 KiB = 2.25 MiB per block; ~390 blocks on our GPU).</li>
          <li>Each request has a <b>block table</b>: logical block i → physical block number.</li>
          <li>A new block is allocated only when the current one is full. Waste is at most one partially filled block per request.</li>
          <li>The attention kernel reads K/V through the block table (one extra indirection, very cheap).</li>
        </ul>
        <PagingDiagram />
        <KvSimulator />
        <Callout kind="deep" title="🔬 Preemption">
          <p>If generation needs a new block and none is free, the engine must <b>preempt</b> a request: pause it and free its blocks. Later, it is resumed by
            recomputing its KV (a prefill of prompt + already generated tokens). vLLM calls this "recompute" preemption. The alternative is "swap" — copy blocks to CPU RAM —
            which needs spare RAM and PCIe bandwidth. We start with recompute: simpler, and our RAM is tight.</p>
        </Callout>
      </Section>

      <Section title="5. Prefix caching: share identical beginnings">
        <p>
          Many requests start the same way: the same system prompt, or a chat that resends the whole history plus one new message.
          The K/V for identical leading tokens are identical. So we keep finished blocks in a cache keyed by their content:
        </p>
        <Code lang="text">{`
block_hash = hash(parent_block_hash, token ids in this block)     // a chain: depends on everything before
`}</Code>
        <ul>
          <li>When a new request arrives, walk its prompt block by block. If a block's hash exists in the cache → reuse that physical block, increase its <b>refcount</b>, skip its prefill.</li>
          <li>When a request finishes, decrease refcounts. Blocks at refcount 0 stay in the cache (still valid) but become <b>evictable</b>.</li>
          <li>When memory is needed, evict the <b>least recently used</b> refcount-0 block.</li>
          <li>Only <b>full</b> blocks are shared. A block that is still being written belongs to one request only.</li>
        </ul>
        <p>Turn on "shared system prompt" in the simulator above and add two requests: the second one reuses blocks and skips prefill for them.</p>
        <Callout kind="kiln">
          <p>Prefix caching is why agents (lesson: our own agent) are affordable: each step resends the whole conversation, but only the new tail is prefilled.
            The worker reports <code>cached_input_tokens</code> and billing charges them less.</p>
        </Callout>
        <Quiz
          q="Why must the block hash include the hash of the PREVIOUS block, not just this block's 16 tokens?"
          options={[
            "To make the hash longer",
            "Because K and V of a token depend on all earlier tokens (attention + RoPE position), so the same 16 tokens after a different prefix have different K/V",
            "Because blocks are stored in order",
          ]}
          answer={1}
          explain="K/V at layer > 0 depend on the whole context before the token, and on its position. Same text, different past → different numbers. Chaining the hash encodes the entire prefix."
        />
      </Section>

      <Section title="6. Our BlockAllocator in Rust">
        <Code title="kiln-engine/src/kv/allocator.rs">{`
use std::collections::{HashMap, VecDeque};

pub type BlockId = u32;

pub struct BlockAllocator {
    free: Vec<BlockId>,                       // blocks with no data at all
    refcount: Vec<u32>,                       // per physical block
    hash_of: Vec<Option<u64>>,                // content hash if the block is full & cached
    cached: HashMap<u64, BlockId>,            // prefix cache: hash -> block
    evictable: VecDeque<BlockId>,             // refcount==0 but cached; front = least recently used
}

impl BlockAllocator {
    pub fn new(num_blocks: u32) -> Self {
        Self {
            free: (0..num_blocks).rev().collect(),
            refcount: vec![0; num_blocks as usize],
            hash_of: vec![None; num_blocks as usize],
            cached: HashMap::new(),
            evictable: VecDeque::new(),
        }
    }

    /// Get an empty block: from the free list, else evict the LRU cached block.
    pub fn alloc(&mut self) -> Option<BlockId> {
        let b = match self.free.pop() {
            Some(b) => b,
            None => {
                let b = self.evictable.pop_front()?;          // '?' returns None if empty: out of memory
                if let Some(h) = self.hash_of[b as usize].take() { self.cached.remove(&h); }
                b
            }
        };
        self.refcount[b as usize] = 1;
        Some(b)
    }

    /// Prefix cache lookup: reuse an existing full block with the same content.
    pub fn lookup(&mut self, hash: u64) -> Option<BlockId> {
        let b = *self.cached.get(&hash)?;
        if self.refcount[b as usize] == 0 {
            self.evictable.retain(|&x| x != b);               // back in use, not evictable
        }
        self.refcount[b as usize] += 1;
        Some(b)
    }

    /// Called when a block becomes full: publish it to the prefix cache.
    pub fn seal(&mut self, b: BlockId, hash: u64) {
        self.hash_of[b as usize] = Some(hash);
        self.cached.entry(hash).or_insert(b);
    }

    /// A request releases a block (finish, cancel or preempt).
    pub fn release(&mut self, b: BlockId) {
        let rc = &mut self.refcount[b as usize];
        *rc -= 1;
        if *rc == 0 {
            if self.hash_of[b as usize].is_some() {
                self.evictable.push_back(b);                  // keep data, may be reused
            } else {
                self.free.push(b);                            // nothing worth keeping
            }
        }
    }

    pub fn num_available(&self) -> usize { self.free.len() + self.evictable.len() }
}
`}</Code>
        <Callout kind="rust">
          <p>The <code>?</code> operator on an <code>Option</code> means "if this is None, return None from the whole function right now". It replaces many
            <code> if let</code> checks. <code>VecDeque</code> is a ring buffer with fast push/pop at both ends — good for LRU queues.
            (The <code>retain</code> scan is O(n); a later version uses an intrusive linked list for O(1).)</p>
        </Callout>
        <Callout kind="kiln">
          <p>The worker reports <code>num_available()</code> to the scheduler in every heartbeat as <code>kv_blocks_free</code>. The scheduler only sends a request
            to a worker if <code>ceil((input + max_tokens) / 16)</code> blocks are available — that is how one component's memory accounting becomes the
            whole platform's admission control.</p>
        </Callout>
      </Section>

      <Recap items={[
        "K and V of past tokens never change (causal mask), so we compute them once and cache them.",
        "Cost: 144 KiB per token for Qwen3-4B → ~6,200 tokens total on our GPU. KV memory limits concurrency.",
        "Paged KV: 16-token blocks + per-request block tables. No reservation, no fragmentation.",
        "Prefix caching: full blocks keyed by a chained hash, shared with refcounts, LRU-evicted at refcount 0.",
        "Out of blocks → preempt (free and recompute later). Free-block count drives the scheduler's dispatch.",
      ]} />
    </>
  );
}
