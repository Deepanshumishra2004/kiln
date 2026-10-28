# 11 — Dev setup (this machine)

State on 2026-10-27: Rust 1.93.1 installed ✓ · WSL2 enabled but **no distro** ✗ ·
Docker **not installed** ✗ · CUDA toolkit **not installed** ✗ (`nvcc` not found).

Where things run:

| What | Where | Why |
|---|---|---|
| Our Rust services (gateway, scheduler, workers, …) | Native Windows | Direct GPU access, fast builds, no VM RAM overhead |
| Postgres, Redis, Iggy, Prometheus, Grafana, Jaeger | Docker Desktop (WSL2 backend) | Not our code; one `docker compose up` |
| cloudflared | Native Windows | Single binary |

## 1. NVIDIA driver + CUDA toolkit

1. Update the GPU driver to the latest NVIDIA Studio or Game Ready driver
   (current 546.33 is from late 2023).
2. Install **CUDA Toolkit 12.x** for Windows (choose a version supported by the new
   driver and by mistral.rs/candle at build time). Select: CUDA compiler (nvcc),
   libraries (cuBLAS), runtime.
3. Verify in a new terminal:
   ```powershell
   nvcc --version
   nvidia-smi
   ```
4. Set the compute capability so candle compiles kernels only for this GPU (faster
   builds):
   ```powershell
   setx CUDA_COMPUTE_CAP 86
   ```

## 2. C++ build tools

CUDA kernels compile through MSVC. Install **Visual Studio 2022 Build Tools** with
the "Desktop development with C++" workload (Rust on Windows usually has it already;
verify `cl.exe` is available from the "x64 Native Tools" prompt).

## 3. Rust tooling

```powershell
rustup update
rustup target add wasm32-unknown-unknown         # Leptos browser bundle
cargo install cargo-leptos                       # build/serve the console
cargo install sqlx-cli --no-default-features --features rustls,postgres
cargo install cargo-watch                        # optional: auto-rebuild
```

`protoc` for tonic: use the `protoc-bin-vendored` crate in `crates/proto/build.rs`,
so no system install is needed.

## 4. WSL2 + Docker Desktop

```powershell
wsl --install -d Ubuntu-24.04
```

Install Docker Desktop (WSL2 backend). Then cap the VM's memory so it cannot starve
Windows and the model — create `C:\Users\<you>\.wslconfig`:

```ini
[wsl2]
memory=3GB
processors=4
swap=2GB
```

Apply with `wsl --shutdown`, then restart Docker Desktop.

## 5. Infra containers

`deploy/docker-compose.yml` (created in phase 1) runs:

| Service | Image | Memory limit |
|---|---|---|
| postgres | `postgres:16` | 512 MB |
| redis | `redis:7` | 128 MB |
| iggy *(phase 3)* | `apache/iggy` | 256 MB |
| prometheus | `prom/prometheus` | 256 MB |
| grafana | `grafana/grafana` | 256 MB |
| jaeger | `jaegertracing/all-in-one` | 256 MB |

```powershell
docker compose -f deploy/docker-compose.yml up -d
sqlx migrate run
```

## 6. Models

Weights download from Hugging Face on first worker start (mistral.rs uses the
`hf-hub` crate) into `models/` (`HF_HOME` pointed there, on D:). Qwen3 repos are not
gated, so no token is required. Expected disk: ~2.5 GB (4B Q4) + ~1.1 GB (1.7B Q4);
more if downloading FP16 safetensors for ISQ (~8 GB for 4B).

## 7. Running everything (from phase 1 on)

```powershell
cargo run -p inference-worker -- --config config/worker-gpu.toml
cargo run -p inference-worker -- --config config/worker-cpu.toml
cargo run -p scheduler
cargo run -p gateway
cargo run -p usage-worker
cargo run -p admin-api
cargo leptos watch -p console
```

A `scripts/dev.ps1` will start them together. Release builds (`--release`) are
required for the workers — debug-mode inference is 10–50× slower.

## 8. Public access (phase 5)

```powershell
winget install Cloudflare.cloudflared
cloudflared tunnel login
cloudflared tunnel create ai-infra
cloudflared tunnel route dns ai-infra api.<your-domain>
cloudflared tunnel route dns ai-infra console.<your-domain>
cloudflared tunnel run ai-infra       # uses deploy/cloudflared/config.yml
```

Requires a domain on Cloudflare (free plan is enough). For quick tests without a
domain: `cloudflared tunnel --url http://localhost:8080` gives a temporary
`*.trycloudflare.com` URL.

## Laptop realities

- Plug in AC power and use the "Best performance" power mode; on battery the GPU
  is heavily power-limited.
- Disable sleep while serving, or the API goes down when the lid closes.
- Watch GPU temperature (doc 08); laptop GPUs throttle around 87 °C.
