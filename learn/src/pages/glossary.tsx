import { useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader, Section } from "../components/ui";

type Term = { term: string; def: string; link?: string };

const TERMS: Term[] = [
  { term: "Admission control", def: "Deciding at the door whether a request may enter the queue. If the expected wait is too long, reject immediately (503) instead of letting queues grow forever.", link: "scheduler" },
  { term: "API key", def: "A secret string (sk-live-…) that identifies a project. We store only its HMAC-SHA256 hash (SHA-256 keyed with a server-side secret).", link: "auth-keys" },
  { term: "Arc", def: "Rust's 'atomically reference counted' pointer: shared ownership of a value across threads.", link: "rust-ownership" },
  { term: "async / await", def: "Rust syntax for code that can pause while waiting (for the network, a timer) and let other tasks run on the same thread.", link: "rust-concurrency" },
  { term: "AVX2", def: "x86 CPU vector instructions that work on 256 bits at once (8 f32 numbers). Our CPU kernels use them.", link: "memory-cpu" },
  { term: "Batching (continuous)", def: "Running many users' requests in the same GPU step, adding and removing requests every step instead of waiting for a whole batch to finish.", link: "batching" },
  { term: "bf16 / f16", def: "16-bit floating point formats. Half the memory of f32. bf16 keeps f32's range with less precision; f16 has more precision but a smaller range.", link: "bits-bytes" },
  { term: "Block (KV)", def: "A fixed-size page of KV-cache memory, e.g. 16 tokens. Requests get blocks on demand, like an OS gives memory pages.", link: "kv-cache" },
  { term: "BPE (Byte Pair Encoding)", def: "The tokenizer algorithm: start from bytes and repeatedly merge the most common adjacent pair into a new token.", link: "tokenization" },
  { term: "Borrow", def: "In Rust, temporary access to a value without owning it: &T (shared, read-only) or &mut T (exclusive, can change).", link: "rust-ownership" },
  { term: "Cache line", def: "The 64-byte unit in which the CPU moves data between RAM and its caches. Reading one byte loads all 64.", link: "memory-cpu" },
  { term: "Cargo / crate / workspace", def: "Cargo is Rust's build tool. A crate is one library or program. A workspace is many crates in one repository.", link: "rust-basics" },
  { term: "Coalesced access", def: "When the 32 threads of a GPU warp read neighbouring addresses, so the hardware combines them into few memory transactions. Essential for GPU speed.", link: "gpu-cuda" },
  { term: "Control plane / data plane", def: "Data plane: the hot path every request touches. Control plane: configuration and bookkeeping. The data plane never waits for the control plane.", link: "big-picture" },
  { term: "CRC", def: "A checksum stored next to data on disk so corruption (e.g., a half-written record after a crash) can be detected.", link: "event-log-billing" },
  { term: "CUDA", def: "NVIDIA's platform for running general programs on its GPUs. Kernels are written in CUDA C and launched from the host program.", link: "gpu-cuda" },
  { term: "Decode", def: "Generating output one token per step. Limited by memory bandwidth (all weights are read each step).", link: "batching" },
  { term: "Deficit round robin (DRR)", def: "A fair-queueing algorithm: each org gets a token 'allowance' per round, so one heavy org cannot starve others.", link: "scheduler" },
  { term: "Embedding", def: "The vector that represents a token inside the model. Token id → row of the embedding matrix.", link: "transformer" },
  { term: "Endianness", def: "Byte order of multi-byte numbers in memory. x86, GGUF and our wire protocol use little-endian (lowest byte first).", link: "bits-bytes" },
  { term: "FFI", def: "Foreign Function Interface: calling functions written in another language (e.g., the C CUDA driver) from Rust.", link: "rust-unsafe" },
  { term: "Frame", def: "A self-describing message on a byte stream: [length][type][stream id][payload]. TCP has no message boundaries, so we add them.", link: "wire-protocol" },
  { term: "GCRA / token bucket", def: "Rate-limiting algorithms: a bucket refills at a fixed rate; each request takes tokens; an empty bucket means 429.", link: "rate-limiting" },
  { term: "GGUF", def: "A single-file model format (from llama.cpp) holding metadata, tokenizer and (often quantized) weights.", link: "quantization" },
  { term: "GQA (grouped-query attention)", def: "Several query heads share one key/value head (Qwen3-4B: 32 Q heads, 8 KV heads), making the KV cache 4× smaller.", link: "transformer" },
  { term: "Idempotency", def: "Doing the same operation twice has the same effect as once. Billing must be idempotent because events can be delivered twice.", link: "event-log-billing" },
  { term: "Kernel (GPU)", def: "A function that runs on the GPU, executed by thousands of threads in parallel.", link: "gpu-cuda" },
  { term: "kiln-log", def: "Our own append-only event log (a tiny Kafka) that carries usage events to billing.", link: "event-log-billing" },
  { term: "kiln-wire", def: "Our own binary protocol between gateway, scheduler and workers (instead of gRPC).", link: "wire-protocol" },
  { term: "KV cache", def: "Stored attention keys and values for every past token, so they are not recomputed on each step. Often the real limit on how many users fit.", link: "kv-cache" },
  { term: "Logits", def: "The model's raw score for every token in the vocabulary. Softmax turns them into probabilities.", link: "sampling" },
  { term: "Memory-bound / compute-bound", def: "Whether speed is limited by moving data (bandwidth) or by doing math. LLM decode is memory-bound; prefill is compute-bound.", link: "memory-cpu" },
  { term: "mmap", def: "Mapping a file into memory so the OS loads its pages on demand. Lets us 'open' a 2.5 GB model file instantly.", link: "rust-unsafe" },
  { term: "Offset", def: "The position of a record in a log. A consumer remembers its offset so it can continue after a restart.", link: "event-log-billing" },
  { term: "Ownership", def: "Rust's rule that every value has exactly one owner; when the owner goes away, the value is freed. No garbage collector needed.", link: "rust-ownership" },
  { term: "p50 / p95 / p99", def: "Percentiles: p95 latency = 95% of requests were faster than this. Averages hide slow outliers; percentiles show them.", link: "observability" },
  { term: "Prefill", def: "Processing the whole prompt in one parallel pass to fill the KV cache. Compute-bound; sets the time to first token.", link: "batching" },
  { term: "Prefix caching", def: "Reusing KV blocks of an identical prompt beginning (same system prompt, same chat history) across requests. Billed cheaper as cached tokens.", link: "kv-cache" },
  { term: "PTX", def: "NVIDIA's assembly-like intermediate language. nvcc compiles our .cu kernels to PTX; the driver turns PTX into machine code for the GPU.", link: "gpu-cuda" },
  { term: "Quantization", def: "Storing weights with fewer bits (e.g., 4 instead of 16) plus a scale per small block. Makes models 3-4× smaller.", link: "quantization" },
  { term: "Result / Option", def: "Rust enums for 'may fail' (Ok/Err) and 'may be missing' (Some/None). The ? operator returns early on errors.", link: "rust-types" },
  { term: "RMSNorm", def: "Normalisation: divide a vector by its root-mean-square, then scale. Keeps numbers in a stable range between layers.", link: "transformer" },
  { term: "RoPE", def: "Rotary position embedding: encodes a token's position by rotating its query/key vectors by a position-dependent angle.", link: "transformer" },
  { term: "RPM / ITPM / OTPM", def: "Requests, input tokens and output tokens per minute: the three rate-limit dimensions.", link: "rate-limiting" },
  { term: "Shared memory (GPU)", def: "Small, very fast memory inside each GPU SM, shared by the threads of one block. Used for tiling and reductions.", link: "gpu-cuda" },
  { term: "SIMD", def: "Single Instruction, Multiple Data: one CPU instruction processes several numbers at once.", link: "memory-cpu" },
  { term: "SM / warp", def: "A GPU is made of Streaming Multiprocessors (SMs). Threads run in groups of 32 called warps that execute the same instruction together.", link: "gpu-cuda" },
  { term: "Softmax", def: "Turns a list of scores into probabilities: exponentiate each, divide by the sum.", link: "sampling" },
  { term: "SSE (Server-Sent Events)", def: "A simple HTTP streaming format: the server sends lines like 'data: {...}' followed by a blank line, while keeping the connection open.", link: "http-sse" },
  { term: "Temperature / top-p / top-k", def: "Sampling controls: temperature flattens or sharpens probabilities; top-k / top-p keep only the most likely candidates.", link: "sampling" },
  { term: "Token", def: "The unit of text the model reads and writes (about ¾ of an English word). Everything is limited and billed in tokens.", link: "tokenization" },
  { term: "Trait", def: "Rust's interface: a set of methods a type promises to provide (e.g., trait Engine).", link: "rust-types" },
  { term: "TTFT / TPOT", def: "Time To First Token (how long until text starts) and Time Per Output Token (how fast it then flows).", link: "observability" },
  { term: "unsafe", def: "A Rust block where you promise the compiler you uphold memory-safety rules it cannot check (raw pointers, FFI). Kept small and wrapped in safe APIs.", link: "rust-unsafe" },
  { term: "UTF-8", def: "The text encoding used everywhere: each character is 1-4 bytes. Byte-level BPE works on these bytes.", link: "tokenization" },
  { term: "VRAM", def: "The GPU's own memory (4 GB GDDR6 on our RTX 3050). Weights + KV cache + scratch must all fit.", link: "gpu-cuda" },
];

export default function Page() {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const shown = TERMS.filter((t) => !query || t.term.toLowerCase().includes(query) || t.def.toLowerCase().includes(query));
  return (
    <>
      <PageHeader kicker="The plan" title="Glossary" subtitle="Every term used on this site, in one sentence, with a link to the lesson that explains it." />
      <input type="text" placeholder="Search terms… (e.g. cache, rust, gpu)" value={q} onChange={(e) => setQ(e.target.value)} />
      <p className="small muted">{shown.length} of {TERMS.length} terms</p>
      <Section title="Terms">
        <table>
          <tbody>
            {shown.map((t) => (
              <tr key={t.term}>
                <td style={{ width: "28%" }}><b>{t.term}</b></td>
                <td>{t.def} {t.link && <Link to={`/${t.link}`} className="small">→ lesson</Link>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </>
  );
}
