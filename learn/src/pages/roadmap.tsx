import { useState } from "react";
import { Link } from "react-router-dom";
import { Arrow, Box, Callout, Code, PageHeader, Quiz, Recap, Section, Svg, Viz } from "../components/ui";

type Phase = {
  id: string; lane: "both" | "engine" | "platform"; col: number; title: string;
  goal: string; build: string[]; done: string; read: [string, string][];
};

const PHASES: Phase[] = [
  { id: "P0", lane: "both", col: 0, title: "Contracts",
    goal: "Agree on how the pieces talk to each other, so both teams can work in parallel.",
    build: ["Cargo workspace, common crate, config, logging", "kiln-wire frame format + encoder/decoder with tests", "trait Engine (the API of our inference engine)", "mock-worker: fake tokens at a fake speed, speaks kiln-wire", "Install CUDA toolkit, Docker, Postgres"],
    done: "A tiny gateway streams fake tokens from the mock-worker to curl.",
    read: [["wire-protocol", "Our wire protocol"], ["rust-types", "Structs, enums, traits"]] },
  { id: "E1", lane: "engine", col: 1, title: "CPU f32 engine",
    goal: "A correct (slow) Qwen3 forward pass on the CPU.",
    build: ["safetensors + GGUF loader, mmap", "BPE tokenizer + Qwen chat template", "Tensor type, naive f32 kernels", "Qwen3 layers: RMSNorm, RoPE, GQA attention, SwiGLU", "Greedy sampling, reference-comparison test harness"],
    done: "Greedy output matches the reference implementation token-for-token for 100 tokens.",
    read: [["tokenization", "Tokenization"], ["transformer", "The transformer"], ["bits-bytes", "Bits & bytes"]] },
  { id: "E2", lane: "engine", col: 2, title: "Quantized + fast CPU",
    goal: "Make the CPU path small and fast.",
    build: ["Our quantizer: f16 → Q8_0 / Q4_K", "Quantized dot products", "AVX2 SIMD kernels, thread pool", "Full sampler (temperature, top-p, min-p, seed)"],
    done: "Qwen3-1.7B Q4 runs on the Ryzen; tok/s measured against llama.cpp; error within tolerance.",
    read: [["quantization", "Quantization"], ["memory-cpu", "Memory, caches & SIMD"], ["sampling", "Sampling"]] },
  { id: "E3", lane: "engine", col: 3, title: "CUDA backend",
    goal: "Run the 4B model on the RTX 3050.",
    build: ["Our CUDA driver FFI + device memory type", "Kernels: RMSNorm, RoPE, softmax, quantized matvec, attention", "PTX compiled at build time", "Benchmarks: VRAM, TTFT, tok/s"],
    done: "Qwen3-4B Q4 generates on the GPU with correct output; numbers in docs/benchmarks.md.",
    read: [["gpu-cuda", "GPUs & CUDA"], ["rust-unsafe", "Unsafe & FFI"]] },
  { id: "E4", lane: "engine", col: 4, title: "Serving engine",
    goal: "Serve many users at once.",
    build: ["Paged KV cache + block allocator", "Continuous batching step loop, chunked prefill", "Prefix cache with refcounts", "Cancellation frees blocks; real inference-worker replaces the mock"],
    done: "4 concurrent streams on the GPU; disconnecting a client frees its KV blocks immediately.",
    read: [["kv-cache", "KV cache"], ["batching", "Continuous batching"]] },
  { id: "E5", lane: "engine", col: 5, title: "Tools & grammar",
    goal: "Reliable tool calls for agents.",
    build: ["Tool rendering in the chat template", "Grammar-constrained decoding (JSON schema → token mask)", "Streaming tool_calls parser"],
    done: "Tool-call arguments are valid JSON 100% of the time.",
    read: [["sampling", "Sampling"]] },
  { id: "P1", lane: "platform", col: 1, title: "Core API",
    goal: "A real OpenAI-compatible API in front of the mock-worker.",
    build: ["Our HTTP/1.1 server + SSE", "/v1/chat/completions, /v1/models, OpenAI error format", "API keys (hash, cache), Postgres schema", "Token-bucket rate limits with reserve/refund"],
    done: "The official OpenAI Python SDK streams from Kiln with a key; a second key gets 429 + retry-after.",
    read: [["http-sse", "HTTP & SSE"], ["auth-keys", "API keys"], ["rate-limiting", "Rate limiting"]] },
  { id: "P2", lane: "platform", col: 2, title: "Scheduler",
    goal: "Fair, safe queueing between gateway and workers.",
    build: ["Worker registry + heartbeats", "Per-model queues, deficit round robin per org", "Admission control → 503", "Load-test tool"],
    done: "When one org floods, other orgs' p95 TTFT stays within target; extra load gets 503 fast.",
    read: [["scheduler", "Scheduler & fairness"], ["rust-concurrency", "Threads & async"]] },
  { id: "P3", lane: "platform", col: 3, title: "Metering & billing",
    goal: "Every token is counted and charged exactly once.",
    build: ["kiln-log: segments, offsets, CRC, fsync", "usage-worker: pricing, idempotent inserts, credit ledger", "Spend caps, insufficient_quota", "Reconciliation job"],
    done: "Killing the usage-worker mid-batch and restarting gives no lost and no double charges.",
    read: [["event-log-billing", "Event log & billing"]] },
  { id: "P4", lane: "platform", col: 4, title: "Console & admin",
    goal: "See and control everything.",
    build: ["admin-api: orgs, projects, keys, limits, usage, audit log", "Console: keys, usage charts, live requests, capacity", "Instant key revocation"],
    done: "Create a key in the UI, watch its requests live, revoke it in under a second.",
    read: [["auth-keys", "API keys & auth"]] },
  { id: "P5", lane: "platform", col: 5, title: "Observe & go public",
    goal: "Run it like a real service for friends.",
    build: ["Our Prometheus exporter in every service, traces", "Grafana dashboards + alerts, GPU metrics", "Cloudflare Tunnel, status page"],
    done: "A friend uses the API over the internet; you follow their request from the console to its trace.",
    read: [["observability", "Observability"]] },
  { id: "A", lane: "both", col: 6, title: "Our agent",
    goal: "Use our own platform as a customer.",
    build: ["Rust CLI agent: tool loop, file/shell tools, permissions", "Session grouping in usage", "Context compaction for a small model"],
    done: "The agent completes a small coding task using a key from our console; the console shows the run's cost.",
    read: [["request-lifecycle", "Life of one request"]] },
];

const COLW = 104;
const laneY = { engine: 40, platform: 170, both: 105 } as const;

export default function Page() {
  const [sel, setSel] = useState("P0");
  const ph = PHASES.find((p) => p.id === sel)!;
  return (
    <>
      <PageHeader
        kicker="The plan"
        title="Roadmap & phases"
        subtitle="Two teams, two lanes, one shared contract. Each phase ends with something you can run and show."
        learn={["Why we start with contracts and a mock worker", "The engine lane and the platform lane", "What 'done' means for every phase"]}
      />

      <Section title="Why two lanes?">
        <p>
          The engine is the riskiest and slowest part: weeks of math before the first correct token. If the platform
          team waited for it, they would sit idle. So in <b>phase 0</b> we agree on two <b>contracts</b>:
        </p>
        <ul>
          <li><b>kiln-wire</b>: the exact bytes the scheduler and workers exchange.</li>
          <li><b><code>trait Engine</code></b>: the Rust interface the inference engine offers.</li>
        </ul>
        <p>Then a <b>mock-worker</b> implements the contract with fake tokens. The platform team builds against the mock; the engine team builds the real thing. On the day the real engine is ready, we swap it in — nothing else changes.</p>
        <Viz title="Contract first" hint="Both workers speak the same protocol, so the scheduler cannot tell them apart.">
          <Svg w={700} h={200} label="mock vs real worker">
            <Box x={20} y={70} w={150} h={56} label="gateway" sub="+ scheduler" color={2} />
            <Box x={290} y={70} w={150} h={56} label="kiln-wire" sub="the contract" color={3} />
            <Box x={540} y={20} w={150} h={56} label="mock-worker" sub="fake tokens (P0)" color={6} />
            <Box x={540} y={120} w={150} h={56} label="inference-worker" sub="kiln-engine (E4)" color={1} />
            <Arrow x1={172} y1={98} x2={288} y2={98} />
            <Arrow x1={442} y1={90} x2={538} y2={52} />
            <Arrow x1={442} y1={106} x2={538} y2={144} dashed />
          </Svg>
        </Viz>
        <Code title="crates/kiln-engine/src/lib.rs (proposed contract)">{`
/// What every engine (mock, CPU, CUDA) must offer.
pub trait Engine: Send + Sync {
    /// Start generating. Tokens arrive on the returned channel.
    /// Dropping the receiver cancels the request and frees its memory.
    fn submit(&self, req: GenerateRequest) -> Result<mpsc::Receiver<GenerateEvent>, EngineError>;

    /// Capacity report for the scheduler's heartbeat.
    fn status(&self) -> EngineStatus; // running seqs, free KV blocks, tokens/s
}
`}</Code>
      </Section>

      <Section title="The phases">
        <div className="viz">
          <div className="viz-title">Click a phase</div>
          <div className="viz-hint">Top lane: engine team. Bottom lane: platform team. Middle: everyone.</div>
          <Svg w={740} h={240} label="roadmap lanes">
            <text x={4} y={laneY.engine - 8} fontSize={11} fill="var(--muted)">ENGINE</text>
            <text x={4} y={laneY.platform + 72} fontSize={11} fill="var(--muted)">PLATFORM</text>
            {PHASES.map((p) => (
              <Box key={p.id} x={6 + p.col * COLW} y={laneY[p.lane]} w={96} h={56} label={p.id} sub={p.title}
                color={p.lane === "engine" ? 1 : p.lane === "platform" ? 2 : 3} active={p.id === sel} onClick={() => setSel(p.id)} />
            ))}
          </Svg>
          <div className="card fade-in" key={sel}>
            <h4>{ph.id} — {ph.title}</h4>
            <p><b>Goal:</b> {ph.goal}</p>
            <p style={{ marginBottom: 2 }}><b>Build:</b></p>
            <ul>{ph.build.map((b) => <li key={b}>{b}</li>)}</ul>
            <p><b>Done when:</b> {ph.done}</p>
            <p className="small">Read first: {ph.read.map(([s, t], i) => <span key={s}>{i > 0 && " · "}<Link to={`/${s}`}>{t}</Link></span>)}</p>
          </div>
        </div>
        <Callout kind="idea">
          <p>
            Every phase has a <b>"done when"</b> sentence you can demonstrate. Not "the scheduler is mostly written" but
            "when one org floods, others still get fast answers". If you cannot show it, it is not done.
          </p>
        </Callout>
        <Callout kind="warn">
          <p>
            Honest expectation: our first CUDA kernels will be several times slower than llama.cpp. That is normal.
            Making them faster (better memory access, shared-memory tiles, fused kernels) <i>is</i> the learning. We
            measure every step so we always know where we stand.
          </p>
        </Callout>
        <Quiz
          q="The engine team is still in E2. Can the platform team finish P2 (scheduler with fairness)?"
          options={[
            "No, the scheduler needs a real model",
            "Yes — the mock-worker speaks kiln-wire and reports fake capacity, so scheduling can be built and load-tested",
            "Only if they write their own engine too",
          ]}
          answer={1}
          explain="That is the point of contracts. The scheduler only sees frames and heartbeats. A mock that produces tokens at a configurable speed is enough to test queues, fairness and load shedding."
        />
      </Section>

      <Section title="Still out of scope">
        <table>
          <thead><tr><th>Real-provider feature</th><th>Why not here</th></tr></thead>
          <tbody>
            <tr><td>Huge models, many GPUs per model</td><td>One 4 GB GPU</td></tr>
            <tr><td>Multiple regions, global load balancing</td><td>One laptop</td></tr>
            <tr><td>Training and fine-tuning</td><td>Needs far more compute; a different problem</td></tr>
            <tr><td>Compliance certifications (SOC 2, GDPR)</td><td>Legal and process work, not code</td></tr>
          </tbody>
        </table>
      </Section>

      <Recap items={[
        "Phase 0 fixes the contracts (kiln-wire, trait Engine) and builds a mock-worker.",
        "Engine lane: CPU f32 → quantized CPU → CUDA → serving engine → tools.",
        "Platform lane: core API → scheduler → billing → console → observability.",
        "Every phase ends with a demonstrable 'done when'.",
      ]} />
    </>
  );
}
