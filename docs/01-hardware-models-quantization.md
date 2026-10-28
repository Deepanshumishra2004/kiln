# 01 — Hardware, models & quantization

## This machine

Measured on 2026-10-27:

| Component | Spec | Consequence |
|---|---|---|
| GPU | NVIDIA GeForce RTX 3050 Laptop, **4 GB GDDR6**, Ampere (sm_86), 85 W | The binding constraint. ~4B-parameter models at 4-bit. |
| Display GPU | AMD Radeon 660M (integrated) | The desktop renders on the iGPU, so the 3050's 4 GB is almost fully free (18 MiB idle). |
| Driver | 546.33, CUDA 12.3 | Works; updating to the latest Studio/Game Ready driver is recommended before installing the CUDA toolkit. |
| CPU | AMD Ryzen 5 6600H, 6C/12T, Zen 3+ (AVX2) | Can serve a small second model on CPU. |
| RAM | 15.2 GB | The whole stack must stay lean (see budget below). |
| Disk | D: 124 GB free | Plenty for several quantized models (~1–3 GB each). |

Ampere does **not** support FP8 tensor cores (that needs Ada/Hopper), so FP8
quantization is out; integer 4/8-bit is the path.

## Why quantization is required

A model's weights are just numbers. VRAM needed ≈ `parameters × bytes per parameter`.

| Model size | FP16 (2 bytes) | INT8 (~1 byte) | 4-bit (~0.6 bytes incl. scales) |
|---|---|---|---|
| 1.7B | 3.4 GB | 1.8 GB | ~1.1 GB |
| 4B | 8.0 GB | 4.3 GB | **~2.5 GB** |
| 8B | 16 GB | 8.5 GB | ~4.9 GB ✗ |

With 4 GB VRAM, even a 4B model only fits at 4-bit. An 8B model at 4-bit does not
fit at all (it would have to spill layers to CPU RAM and run at a few tokens/second,
which is useless for a multi-user API).

### How quantization works (short version)

Weights are grouped into small blocks (e.g. 32 or 256 values). Each block stores one
or two FP16 **scale** numbers plus each weight as a small integer (e.g. 4 bits = 16
possible levels). At inference time the engine multiplies back: `w ≈ scale × q`.
Errors are small because weights inside a block have similar magnitude.

| Format | Where used | Notes |
|---|---|---|
| **GGUF k-quants** (`Q4_K_M`, `Q5_K_M`, `Q6_K`, `Q8_0`) | llama.cpp ecosystem, mistral.rs, candle | Most widely available pre-quantized files. `Q4_K_M` ≈ 4.8 bits/weight, best size/quality balance. |
| **ISQ** (in-situ quantization) | mistral.rs | Loads the original FP16 safetensors and quantizes *while loading*, in Rust. This is "doing the quantization ourselves". |
| **UQFF** | mistral.rs | mistral.rs's file format to save an ISQ result so the next start is instant. |
| AWQ / GPTQ | vLLM, TensorRT | Calibration-based 4-bit, GPU-optimized. Not our path (vLLM is Python and needs more VRAM headroom). |
| FP8 | H100/Ada | Not supported on Ampere. |

Quality rule of thumb: `Q8_0` ≈ lossless, `Q6_K` ≈ near-lossless, `Q5_K_M` very
small loss, `Q4_K_M` small loss (the standard choice), `Q3` and below degrade
noticeably on small models. Small models suffer more from quantization than large
ones, so we do not go below 4-bit.

**KV cache quantization** is a separate knob: storing the KV cache in 8-bit instead
of FP16 halves its memory, which on this GPU roughly doubles concurrent context.

## VRAM budget for the GPU model

```
 4096 MiB  total
 -  ~400   CUDA context + cuBLAS workspace
 -  ~300   activations / scratch buffers
 - ~2500   Qwen3-4B weights @ Q4_K_M
 ───────
   ~900 MiB left for KV cache
```

KV cache per token for Qwen3-4B (36 layers, 8 KV heads, head dim 128, GQA):

```
2 (K and V) × 36 layers × 8 heads × 128 dims × 2 bytes (FP16) = 147,456 B ≈ 144 KiB / token
```

So ~900 MiB holds **~6,200 tokens of context in total, across all concurrent
requests** (FP16 KV), or **~12,000 tokens** with 8-bit KV cache. In practice:
about 3–5 concurrent conversations of 2k tokens each. This is exactly the kind of
capacity math real providers do — at much larger scale — to decide how many requests
a GPU can admit.

Expected speed (estimate, to be measured in phase 0): the 3050 Laptop has ~192 GB/s
memory bandwidth. Decode reads every weight once per token, so the ceiling is about
`192 / 2.5 ≈ 75 tok/s` for one stream; real-world expectation is **30–50 tok/s
single-stream**, with higher *aggregate* throughput when batching several users.

## Chosen model lineup

Real providers sell a tiered lineup (e.g. a big smart model and a small fast cheap
one). We mirror that with two workers, which also makes routing/scheduling real:

| Public model id | Weights | Quant | Runs on | Role |
|---|---|---|---|---|
| `qwen3-4b` (alias `default`) | Qwen3-4B-Instruct-2507 | Q4_K_M (or ISQ Q4K) | GPU (RTX 3050) | Flagship: best quality that fits |
| `qwen3-1.7b` | Qwen3-1.7B | Q4_K_M | CPU (Ryzen) | Fast/cheap tier, overflow capacity |
| `embed-small` *(phase 6)* | a small embedding model (e.g. bge-small / Qwen3-Embedding-0.6B) | FP16/Q8 | CPU (candle) | `/v1/embeddings` |

Why Qwen3:

- **Apache 2.0 licence** — allowed to serve to other people commercially. (Llama and
  Gemma have their own licences with extra terms.)
- Strongest small models of their size class at the time of writing, good at
  instruction following, tool calling and multilingual text.
- Grouped-query attention with few KV heads → small KV cache → more concurrency.

Alternatives that also fit 4 GB at Q4: Llama 3.2 3B, Phi-4-mini (3.8B), Gemma 3 4B,
Qwen2.5-3B. The platform is model-agnostic: the model registry (doc 03) maps public
ids to weights, so swapping later is a config change. **Re-check for newer small
models during phase 0** — this space moves fast.

Not viable on this machine: any 7B/8B+ model (does not fit), vLLM (needs Linux,
Python, and more VRAM headroom than 4 GB gives a 4B model).

## Inference engine: mistral.rs

To keep everything in Rust, the engine is **mistral.rs**, a Rust LLM inference
engine built on Hugging Face's **candle** tensor library. Relevant features:

- CUDA backend (works on Windows with the CUDA toolkit + MSVC), plus CPU backend.
- Loads GGUF files directly, or safetensors + **ISQ** quantization on load.
- Paged attention / KV cache management and continuous batching on CUDA.
- Usable **as a library crate** — our `inference-worker` embeds it directly instead
  of calling a separate server. That is how real providers work: the engine is a
  component inside their own worker process.

Phase 0 is a spike that proves this on this exact machine (load model, measure VRAM,
TTFT and tok/s). If something does not work on Windows, fallbacks in order: run the
same worker inside WSL2 Ubuntu with CUDA; or use candle's quantized examples directly.

## RAM budget (15 GB)

| Item | Approx |
|---|---|
| Windows + browser + IDE | 5–6 GB |
| Docker/WSL2 VM (Postgres, Redis, Iggy, Prometheus, Grafana) — capped via `.wslconfig` | 3 GB |
| CPU worker: Qwen3-1.7B Q4 + KV cache | 1.5–2 GB |
| GPU worker host process | ~0.5 GB |
| Gateway, scheduler, usage-worker, console (Rust) | < 0.3 GB total |
| Rust compile (cargo, peaks) | 2–4 GB |

This fits, but it is why ClickHouse/Kafka (multi-GB each) are deferred or replaced.
