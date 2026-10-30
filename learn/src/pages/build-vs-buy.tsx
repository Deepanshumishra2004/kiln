import { useState } from "react";
import { Callout, PageHeader, Quiz, Recap, Section, Seg } from "../components/ui";

type Row = { layer: string; area: "engine" | "platform" | "infra"; decision: "build" | "use" | "open"; replaces: string; why: string };

const ROWS: Row[] = [
  { layer: "Tensor type & math (matmul, softmax, RMSNorm, RoPE)", area: "engine", decision: "build", replaces: "candle", why: "The heart of inference. You cannot optimise what you have never written." },
  { layer: "CPU kernels with SIMD (AVX2) and threads", area: "engine", decision: "build", replaces: "candle CPU", why: "Teaches memory bandwidth, cache lines, vector instructions." },
  { layer: "GPU kernels (CUDA C → PTX)", area: "engine", decision: "build", replaces: "candle CUDA", why: "Teaches warps, shared memory, coalescing — how GPUs really work." },
  { layer: "CUDA driver bindings (~30 functions)", area: "engine", decision: "build", replaces: "cudarc", why: "Small, and shows exactly how a program launches GPU work." },
  { layer: "Big GEMM for prefill: own kernel or cuBLAS?", area: "engine", decision: "open", replaces: "cuBLAS", why: "Own tiled GEMM is the best lesson; cuBLAS is the fast baseline to compare against. Team to decide." },
  { layer: "Model file loaders (GGUF, safetensors, mmap)", area: "engine", decision: "build", replaces: "mistral.rs", why: "Simple binary formats; teaches endianness and memory mapping." },
  { layer: "Quantization (Q8_0, Q4_0, Q4_K) + dequant", area: "engine", decision: "build", replaces: "GGUF tools / ISQ", why: "Lets the 4B model fit in 4 GB; we understand every bit of it." },
  { layer: "Tokenizer (byte-level BPE)", area: "engine", decision: "build", replaces: "tokenizers", why: "~500 lines; tokens are the unit of everything." },
  { layer: "Chat template (Qwen format)", area: "engine", decision: "build", replaces: "Jinja engine", why: "Hand-written for our model; no template language needed." },
  { layer: "Sampler (temperature, top-k/p, min-p, penalties, seeded RNG)", area: "engine", decision: "build", replaces: "mistral.rs", why: "Small, and controls answer quality." },
  { layer: "Paged KV cache + prefix cache", area: "engine", decision: "build", replaces: "mistral.rs", why: "The core of serving economics: how many users fit on one GPU." },
  { layer: "Continuous batching engine loop", area: "engine", decision: "build", replaces: "mistral.rs", why: "Why serving many users is cheap." },
  { layer: "Constrained decoding (JSON / tool calls)", area: "engine", decision: "build", replaces: "engine grammar", why: "Guarantees valid tool-call JSON from a small model." },
  { layer: "HTTP/1.1 server + SSE", area: "platform", decision: "open", replaces: "axum / hyper", why: "Own server (~800 lines) teaches the protocol; hyper is battle-tested. Leaning: build." },
  { layer: "Internal RPC (kiln-wire)", area: "platform", decision: "build", replaces: "gRPC / tonic / protobuf", why: "gRPC hides framing, streaming and cancellation — exactly what we want to learn." },
  { layer: "Event log (kiln-log)", area: "platform", decision: "build", replaces: "Apache Iggy / Kafka", why: "~1k lines; teaches durable logs, offsets, checksums." },
  { layer: "Rate limiter (token bucket / GCRA)", area: "platform", decision: "build", replaces: "Redis + Lua", why: "In-process behind a trait; one gateway means Redis is optional." },
  { layer: "Redis itself", area: "platform", decision: "open", replaces: "—", why: "Drop it, or build a tiny RESP-compatible server as a lesson. Team to decide." },
  { layer: "Metrics exporter (Prometheus text format)", area: "platform", decision: "build", replaces: "metrics crate", why: "Trivial text format." },
  { layer: "Console UI", area: "platform", decision: "open", replaces: "—", why: "Leptos (Rust → WebAssembly) or server-rendered HTML. Team to decide." },
  { layer: "Async runtime", area: "infra", decision: "use", replaces: "tokio", why: "Months of work for no product gain. We will build a toy executor as a lesson only." },
  { layer: "JSON parsing", area: "infra", decision: "use", replaces: "serde_json", why: "Solved, fast, and not where the learning is." },
  { layer: "Database", area: "infra", decision: "use", replaces: "Postgres", why: "Writing a correct database is a career. Real providers use one too." },
  { layer: "Cryptography (SHA-256, HMAC, argon2, OS randomness)", area: "infra", decision: "use", replaces: "sha2, argon2, getrandom", why: "Hand-written crypto is the classic way to leak every API key. Never." },
  { layer: "TLS", area: "infra", decision: "use", replaces: "Cloudflare", why: "Same reason as crypto." },
  { layer: "GPU driver & CUDA compiler", area: "infra", decision: "use", replaces: "NVIDIA", why: "Closed hardware interface; nothing to build." },
];

export default function Page() {
  const [filter, setFilter] = useState<"all" | "build" | "use" | "open">("all");
  const rows = ROWS.filter((r) => filter === "all" || r.decision === filter);
  const count = (d: Row["decision"]) => ROWS.filter((r) => r.decision === d).length;
  return (
    <>
      <PageHeader
        kicker="The plan"
        title="What we build vs what we use"
        subtitle="The line between our own code and off-the-shelf software, and the reason for each decision."
        learn={["The rule we use to decide", "Every layer and its decision", "Which decisions are still open"]}
      />

      <Section title="The rule">
        <p>
          <b>Build</b> anything that is core to being an LLM provider and teaches us how it works.{" "}
          <b>Use</b> existing software only when building it ourselves is <b>dangerous</b> (cryptography, TLS) or a{" "}
          <b>separate career</b> (database, async runtime, GPU driver).
        </p>
        <Callout kind="warn">
          <p>
            <b>Security rule:</b> never ship hand-written cryptography. Implementing SHA-256 yourself to learn how it
            works is fine — in a test folder. Production key hashing, passwords and TLS always use audited libraries.
          </p>
        </Callout>
      </Section>

      <Section title="Every layer">
        <div className="controls">
          <Seg options={["all", "build", "use", "open"] as const} value={filter} onChange={setFilter}
            labels={{ all: `All (${ROWS.length})`, build: `Build (${count("build")})`, use: `Use (${count("use")})`, open: `Open (${count("open")})` }} />
        </div>
        <table>
          <thead><tr><th>Layer</th><th>Decision</th><th>Instead of</th><th>Why</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.layer}>
                <td>{r.layer}<div className="small muted">{r.area}</div></td>
                <td><span className={`pill ${r.decision === "build" ? "build" : r.decision === "use" ? "use" : "later"}`}>{r.decision}</span></td>
                <td className="mono small">{r.replaces}</td>
                <td className="small">{r.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Callout kind="kiln">
          <p>
            Rows marked <b>open</b> are decisions the team still needs to make. Until then, write code behind a small
            Rust <b>trait</b> (an interface), so either choice can be plugged in later without rewriting callers.
          </p>
        </Callout>
      </Section>

      <Section title="How we stay correct while building everything">
        <p>Writing math from scratch has one big danger: bugs are <b>silent</b>. A wrong kernel still produces text — just worse text. So:</p>
        <ul>
          <li><b>Golden reference:</b> run the same prompt in a trusted implementation (Hugging Face transformers or llama.cpp), save every layer's output, and compare ours layer by layer.</li>
          <li><b>Naive first:</b> every fast kernel has a slow, obvious CPU version. Tests compare them on random inputs.</li>
          <li><b>Token-for-token:</b> greedy decoding (always pick the most likely token) of 100 tokens must match the reference exactly in f32.</li>
          <li><b>Benchmark against the best:</b> measure tokens/second against llama.cpp on the same GPU, so we know how far we are and when an optimisation really helps.</li>
        </ul>
        <Quiz
          q="Your new GPU softmax kernel makes the model output slightly different text. What do you do first?"
          options={[
            "Nothing — the text still looks fine",
            "Compare the kernel's output against the naive CPU softmax on the same inputs, then compare layer outputs against the reference",
            "Switch back to a library",
          ]}
          answer={1}
          explain="Different text means some numbers changed. Small differences can come from rounding order, but they must be within a tolerance. The naive-vs-fast test tells you if the kernel is wrong; the layer comparison tells you where the error first appears."
        />
      </Section>

      <Recap items={[
        "Build what is core and teaches us; use what is dangerous (crypto, TLS) or huge (database, runtime, driver).",
        "The whole engine is ours: tensors, kernels, loaders, quantization, tokenizer, sampler, KV cache, batching.",
        "Platform internals are ours too: HTTP server (likely), kiln-wire, kiln-log, rate limiter, metrics.",
        "Open decisions hide behind traits so they can change later.",
        "Correctness comes from golden references, naive kernels and token-for-token tests.",
      ]} />
    </>
  );
}
