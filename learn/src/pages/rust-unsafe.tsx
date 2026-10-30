import { useState } from "react";
import { PageHeader, Section, Callout, Code, Viz, Slider, Seg, Quiz, Recap, Svg, Box, Arrow } from "../components/ui";

/* ---------- Pointer arithmetic visual ---------- */

const VALUES = [0.5, -1.25, 2.0, 3.75];
const BASE = 0x7ff61000;

function f32Bytes(v: number): string[] {
  const dv = new DataView(new ArrayBuffer(4));
  dv.setFloat32(0, v, true); // little-endian, like x86
  return [0, 1, 2, 3].map((i) => dv.getUint8(i).toString(16).padStart(2, "0"));
}

function PointerViz() {
  const [i, setI] = useState(1);
  const inBounds = i < VALUES.length;
  const cellW = 40;
  return (
    <Viz title="A raw pointer is just an address" hint="let w: [f32; 4] = [0.5, -1.25, 2.0, 3.75]; let p = w.as_ptr();  Move the slider to compute p.add(i).">
      <Slider label="i in p.add(i)" value={i} min={0} max={6} onChange={setI} />
      <Svg w={720} h={170} label="memory bytes">
        {Array.from({ length: 28 }).map((_, b) => {
          const elem = Math.floor(b / 4);
          const owned = elem < VALUES.length;
          const bytes = owned ? f32Bytes(VALUES[elem]) : ["??", "??", "??", "??"];
          const selected = elem === i;
          return (
            <g key={b}>
              <rect x={20 + b * (cellW - 16)} y={60} width={cellW - 18} height={34} rx={3}
                fill={selected ? (owned ? "var(--c3-soft)" : "var(--c5-soft)") : owned ? "var(--c1-soft)" : "var(--panel-2)"}
                stroke={selected ? (owned ? "var(--c3)" : "var(--c5)") : owned ? "var(--c1)" : "var(--border)"} />
              <text x={20 + b * (cellW - 16) + 11} y={82} textAnchor="middle" fontSize={9} fontFamily="var(--mono)" fill="var(--text)">{bytes[b % 4]}</text>
              {b % 4 === 0 && (
                <text x={20 + b * (cellW - 16)} y={112} fontSize={9} fontFamily="var(--mono)" fill="var(--muted)">0x{(BASE + b).toString(16)}</text>
              )}
              {b % 4 === 0 && owned && (
                <text x={20 + b * (cellW - 16) + 44} y={50} textAnchor="middle" fontSize={11} fontFamily="var(--mono)" fill="var(--text)">w[{elem}]={VALUES[elem]}</text>
              )}
            </g>
          );
        })}
        <line x1={20 + i * 4 * (cellW - 16) + 10} y1={150} x2={20 + i * 4 * (cellW - 16) + 10} y2={98} stroke={inBounds ? "var(--c3)" : "var(--c5)"} strokeWidth={2} markerEnd="url(#arrow)" />
        <text x={20 + i * 4 * (cellW - 16) + 16} y={160} fontSize={11} fontFamily="var(--mono)" fill={inBounds ? "var(--c3)" : "var(--c5)"}>
          p.add({i}) = 0x{(BASE + i * 4).toString(16)}
        </text>
      </Svg>
      <p className="small">
        p.add({i}) moves {i} × 4 bytes (size of f32) from the start.{" "}
        {inBounds
          ? <>Reading <code>*p.add({i})</code> gives <b>{VALUES[i]}</b>. The bytes are little-endian: the lowest byte comes first.</>
          : <span style={{ color: "var(--c5)" }}>This address is past the end of the array. Computing it is allowed, but reading it is <b>undefined behaviour</b>: it may return garbage, crash, or silently corrupt other data. Safe Rust's <code>w[{i}]</code> would panic instead.</span>}
      </p>
    </Viz>
  );
}

/* ---------- repr(C) layout ---------- */

function ReprViz() {
  const [repr, setRepr] = useState<"Rust" | "C">("C");
  // struct Header { flag: u8, len: u32, kind: u8 }
  const layout = repr === "C"
    ? [{ l: "flag", s: 1, c: 1 }, { l: "pad", s: 3, c: 0 }, { l: "len", s: 4, c: 2 }, { l: "kind", s: 1, c: 3 }, { l: "pad", s: 3, c: 0 }]
    : [{ l: "len", s: 4, c: 2 }, { l: "flag", s: 1, c: 1 }, { l: "kind", s: 1, c: 3 }, { l: "pad", s: 2, c: 0 }];
  const total = layout.reduce((a, b) => a + b.s, 0);
  let x = 20;
  return (
    <Viz title="Why #[repr(C)] matters" hint="struct Header { flag: u8, len: u32, kind: u8 } — a u32 must start at an address divisible by 4 (alignment).">
      <Seg options={["Rust", "C"] as const} value={repr} onChange={setRepr} labels={{ Rust: "default (repr(Rust))", C: "#[repr(C)]" }} />
      <Svg w={720} h={100} label="struct layout">
        {layout.map((f, i) => {
          const w = f.s * 50;
          const g = (
            <g key={repr + i} className="fade-in">
              <rect x={x} y={20} width={w - 3} height={40} rx={4} fill={f.c ? `var(--c${f.c}-soft)` : "var(--panel-2)"}
                stroke={f.c ? `var(--c${f.c})` : "var(--border)"} strokeDasharray={f.c ? undefined : "3 3"} />
              <text x={x + w / 2} y={45} textAnchor="middle" fontSize={12} fontFamily="var(--mono)" fill="var(--text)">{f.l}</text>
            </g>
          );
          x += w;
          return g;
        })}
        <text x={20} y={85} fontSize={12} fill="var(--muted)">size = {total} bytes</text>
      </Svg>
      <p className="small">{repr === "C"
        ? "repr(C): fields stay in the written order, with padding exactly like a C compiler adds it. Required when C code (CUDA, the OS) reads this struct."
        : "Default Rust layout: the compiler may reorder fields to remove padding (here: 8 bytes instead of 12). Great for memory, but C code cannot know the order."}</p>
    </Viz>
  );
}

/* ---------- Safe wrapper layers ---------- */

const LAYERS = [
  { name: "kiln-engine (model code)", color: 3 as const, safe: true, text: "Calls things like buf.copy_from(&weights) and kernel.launch(...). 100% safe Rust. Cannot cause memory errors, no matter what.",
    code: `let mut w = DeviceBuffer::alloc(weights.len() * 4)?;\nw.copy_from(&weights)?;\nrmsnorm.launch(grid, block, &[&x, &w, &out])?;` },
  { name: "kiln-cuda (safe wrappers)", color: 1 as const, safe: true, text: "Small types like Context, DeviceBuffer, Module, Kernel, Stream. Each unsafe call is inside here, surrounded by checks (sizes, null, error codes) and Drop impls that free resources.",
    code: `impl Drop for DeviceBuffer {\n    fn drop(&mut self) {\n        unsafe { cuMemFree_v2(self.ptr) };\n    }\n}` },
  { name: "kiln-cuda-sys (raw FFI)", color: 2 as const, safe: false, text: "Only extern \"C\" declarations that match cuda.h exactly: types, constants, function signatures. No logic. Every call is unsafe.",
    code: `extern "C" {\n    pub fn cuMemAlloc_v2(dptr: *mut CUdeviceptr, bytesize: usize) -> CUresult;\n}` },
  { name: "nvcuda.dll (NVIDIA driver)", color: 4 as const, safe: false, text: "Not our code. The CUDA driver API, written in C. It talks to the kernel-mode driver, which programs the GPU.", code: "" },
  { name: "GPU hardware", color: 5 as const, safe: false, text: "RTX 3050: 4 GB VRAM, 16 streaming multiprocessors. Runs the kernels we compiled to PTX.", code: "" },
];

function LayersViz() {
  const [sel, setSel] = useState(1);
  const L = LAYERS[sel];
  return (
    <Viz title="Layers: from safe engine code down to the GPU" hint="Click a layer. Unsafe code is kept in the thin layers in the middle.">
      <Svg w={720} h={300} label="layers">
        {LAYERS.map((l, i) => (
          <Box key={i} x={120} y={10 + i * 58} w={380} h={46} label={l.name} sub={l.safe ? "safe Rust" : i === 2 ? "unsafe Rust" : "outside Rust"}
            color={l.color} active={sel === i} onClick={() => setSel(i)} />
        ))}
        {LAYERS.slice(0, -1).map((_, i) => <Arrow key={i} x1={310} y1={56 + i * 58} x2={310} y2={68 + i * 58} />)}
        <rect x={530} y={10} width={170} height={104} rx={8} fill="var(--c3-soft)" stroke="var(--c3)" />
        <text x={615} y={55} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--text)">compiler-checked</text>
        <text x={615} y={73} textAnchor="middle" fontSize={11} fill="var(--muted)">memory safety</text>
        <rect x={530} y={126} width={170} height={46} rx={8} fill="var(--c5-soft)" stroke="var(--c5)" />
        <text x={615} y={154} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--text)">we must be careful</text>
      </Svg>
      <p className="small fade-in" key={sel}><b>{L.name}:</b> {L.text}</p>
      {L.code && <Code>{L.code}</Code>}
    </Viz>
  );
}

export default function Page() {
  return (
    <>
      <PageHeader kicker="Rust · Lesson 5" title="Unsafe, pointers & FFI"
        subtitle="How Rust talks to the GPU driver, maps a 2.5 GB model file, and uses SIMD — without giving up safety everywhere else."
        learn={[
          "What unsafe means, and the exact 5 extra things it allows",
          "Raw pointers, addresses, alignment and memory layout (#[repr(C)])",
          "FFI: calling C functions from Rust, using the real CUDA driver API",
          "The most important pattern: a small unsafe core inside a safe type with Drop",
          "Memory-mapping a model file and a first look at SIMD intrinsics",
        ]} />

      <Section title="Why do we need unsafe at all?">
        <p>The borrow checker proves memory safety for code it understands. But some things are outside its view:</p>
        <ul>
          <li>The GPU driver is a C library. Rust cannot check what C code does with a pointer.</li>
          <li>A memory-mapped file is memory owned by the operating system.</li>
          <li>SIMD instructions only exist on some CPUs; calling them on the wrong CPU crashes.</li>
          <li>Some fast data structures (like our KV block allocator's free list) need patterns the checker cannot prove.</li>
        </ul>
        <p>For these cases Rust has <code>unsafe</code>. It does <b>not</b> turn off the borrow checker. It unlocks a few extra operations, and it means:
          <b> "Compiler, I checked this part myself. I promise the rules hold."</b></p>
        <Callout kind="analogy">
          A kitchen where knives are locked away by default. <code>unsafe</code> is the key to the knife drawer. You still follow every other kitchen rule;
          you just have one more tool, and if you cut yourself it is your responsibility.
        </Callout>
        <h3>The five superpowers</h3>
        <ol>
          <li>Dereference a <b>raw pointer</b> (<code>*const T</code>, <code>*mut T</code>).</li>
          <li>Call an <b>unsafe function</b> (including every C function through FFI).</li>
          <li>Read or write a <b>mutable static</b> variable.</li>
          <li>Implement an <b>unsafe trait</b> (for example, promise that a type is <code>Send</code>).</li>
          <li>Read fields of a <b>union</b>.</li>
        </ol>
        <p>That is all. Everything else (types, ownership, borrowing of references) is still checked inside <code>unsafe</code>.</p>
      </Section>

      <Section title="Raw pointers and memory">
        <p>Memory is a giant array of bytes, each with a numeric <b>address</b>. A pointer is just such an address. References (<code>&amp;T</code>) are pointers
          with compiler-checked guarantees: never null, always aligned, always pointing at a live value. <b>Raw pointers</b> have no guarantees.</p>
        <PointerViz />
        <Code title="raw_pointers.rs">{`
fn main() {
    let w: [f32; 4] = [0.5, -1.25, 2.0, 3.75];
    let p: *const f32 = w.as_ptr();       // creating a raw pointer is SAFE
    println!("address = {:p}", p);        // printing it is safe too

    // Dereferencing needs unsafe: WE promise p.add(2) is inside the array.
    let third = unsafe { *p.add(2) };     // 2.0
    println!("{third}");

    // Converting bytes to floats: a typical thing the model loader does.
    let bytes: [u8; 4] = [0x00, 0x00, 0x00, 0x3f];  // little-endian bits of 0.5
    let x = f32::from_le_bytes(bytes);              // SAFE way: no unsafe needed!
    println!("{x}");                                 // 0.5
}
`}</Code>
        <Callout kind="deep" title="🔬 Alignment">
          CPUs read memory fastest (and some instructions only work) when a value of size N starts at an address divisible by N:
          a <code>u32</code>/<code>f32</code> at a multiple of 4, a <code>u64</code> at a multiple of 8. Reading an <code>f32</code> through a misaligned pointer is undefined behaviour in Rust.
          This is why GGUF model files pad every tensor to a 32-byte boundary.
        </Callout>
        <ReprViz />
      </Section>

      <Section title="FFI: calling C from Rust">
        <p><b>FFI</b> (Foreign Function Interface) means calling functions written in another language. Almost every system library (the OS, the CUDA driver)
          exposes a <b>C interface</b>, because C's calling convention is the common language all compilers understand.</p>
        <p>To call the CUDA driver we only need to <b>declare</b> its functions in Rust with the exact same types as in NVIDIA's <code>cuda.h</code>.
          The linker connects them to <code>nvcuda.dll</code>. This is what crates like <code>cudarc</code> do, and what our <code>kiln-cuda-sys</code> crate will do by hand (about 30 functions).</p>
        <Code title="crates/kiln-cuda-sys/src/lib.rs — raw declarations">{`
#![allow(non_camel_case_types)]
use std::ffi::{c_char, c_int, c_uint, c_void};

pub type CUresult = c_int;          // 0 = CUDA_SUCCESS, anything else = error code
pub type CUdevice = c_int;
pub type CUdeviceptr = u64;         // a GPU address (not usable as a CPU pointer!)

// Opaque handles: C gives us pointers to structs we never look inside.
#[repr(C)] pub struct CUctx_st { _p: [u8; 0] }
#[repr(C)] pub struct CUmod_st { _p: [u8; 0] }
#[repr(C)] pub struct CUfunc_st { _p: [u8; 0] }
#[repr(C)] pub struct CUstream_st { _p: [u8; 0] }
pub type CUcontext = *mut CUctx_st;
pub type CUmodule = *mut CUmod_st;
pub type CUfunction = *mut CUfunc_st;
pub type CUstream = *mut CUstream_st;   // null = the default stream

#[link(name = "cuda")]   // cuda.lib (Windows) / libcuda.so (Linux) -> the driver
extern "C" {
    pub fn cuInit(flags: c_uint) -> CUresult;
    pub fn cuDeviceGet(device: *mut CUdevice, ordinal: c_int) -> CUresult;
    pub fn cuCtxCreate_v2(ctx: *mut CUcontext, flags: c_uint, dev: CUdevice) -> CUresult;
    pub fn cuMemAlloc_v2(dptr: *mut CUdeviceptr, bytesize: usize) -> CUresult;
    pub fn cuMemFree_v2(dptr: CUdeviceptr) -> CUresult;
    pub fn cuMemcpyHtoD_v2(dst: CUdeviceptr, src: *const c_void, bytes: usize) -> CUresult;
    pub fn cuMemcpyDtoH_v2(dst: *mut c_void, src: CUdeviceptr, bytes: usize) -> CUresult;
    pub fn cuModuleLoadData(module: *mut CUmodule, image: *const c_void) -> CUresult;
    pub fn cuModuleGetFunction(f: *mut CUfunction, m: CUmodule, name: *const c_char) -> CUresult;
    pub fn cuLaunchKernel(
        f: CUfunction,
        grid_x: c_uint, grid_y: c_uint, grid_z: c_uint,      // how many blocks
        block_x: c_uint, block_y: c_uint, block_z: c_uint,   // threads per block
        shared_mem_bytes: c_uint,
        stream: CUstream,
        kernel_params: *mut *mut c_void,    // array of pointers to each argument
        extra: *mut *mut c_void,
    ) -> CUresult;
    pub fn cuCtxSynchronize() -> CUresult;
}
`}</Code>
        <Callout kind="rust">
          Why <code>_v2</code>? In <code>cuda.h</code>, <code>cuMemAlloc</code> is a C macro that expands to <code>cuMemAlloc_v2</code>. Macros do not exist in the DLL, so from Rust
          we must use the real exported name. Also note: in the Rust 2024 edition the block is written <code>unsafe extern "C" {"{ ... }"}</code>, to make it clear that the declarations themselves are a promise.
        </Callout>
        <Code lang="c" title="kernels/scale.cu — the GPU side (compiled to PTX by nvcc)">{`
// One GPU thread handles one element: x[i] = x[i] * s
extern "C" __global__ void scale(float* x, unsigned int n, float s) {
    unsigned int i = blockIdx.x * blockDim.x + threadIdx.x;   // my global index
    if (i < n) {                                              // the last block may be partial
        x[i] = x[i] * s;
    }
}
`}</Code>
      </Section>

      <Section title="The golden pattern: unsafe inside, safe outside">
        <p>We never let <code>unsafe</code> spread through the codebase. Each unsafe operation is wrapped in a small type whose <b>public API is safe</b>:
          the type checks everything that the C function cannot (sizes, null, error codes) and frees resources in <code>Drop</code>.
          If the wrapper is correct, no caller can misuse the GPU memory, ever.</p>
        <LayersViz />
        <Code title="crates/kiln-cuda/src/buffer.rs — a safe GPU buffer">{`
use kiln_cuda_sys::*;

#[derive(Debug)]
pub struct CudaError(pub CUresult);

fn check(rc: CUresult) -> Result<(), CudaError> {
    if rc == 0 { Ok(()) } else { Err(CudaError(rc)) }
}

/// Owns a block of GPU memory. Freed automatically when dropped.
pub struct DeviceBuffer {
    ptr: CUdeviceptr,   // private: nobody outside can forge or reuse it
    bytes: usize,
}

impl DeviceBuffer {
    pub fn alloc(bytes: usize) -> Result<Self, CudaError> {
        let mut ptr: CUdeviceptr = 0;
        // SAFETY: &mut ptr is a valid place for the driver to write the address.
        // A CUDA context must be current on this thread (guaranteed by Context::bind).
        check(unsafe { cuMemAlloc_v2(&mut ptr, bytes) })?;
        Ok(Self { ptr, bytes })
    }

    /// Copy floats from CPU memory into this buffer.
    pub fn copy_from(&mut self, src: &[f32]) -> Result<(), CudaError> {
        let n = std::mem::size_of_val(src);            // length in BYTES
        assert!(n <= self.bytes, "copy of {n} bytes into a {}-byte buffer", self.bytes);
        // SAFETY: src is a valid slice of n bytes; the buffer holds at least n bytes.
        check(unsafe { cuMemcpyHtoD_v2(self.ptr, src.as_ptr().cast(), n) })
    }

    pub fn len_bytes(&self) -> usize { self.bytes }
    pub(crate) fn raw(&self) -> CUdeviceptr { self.ptr }
}

impl Drop for DeviceBuffer {
    fn drop(&mut self) {
        // SAFETY: ptr came from cuMemAlloc and is freed exactly once (Drop runs once).
        unsafe { cuMemFree_v2(self.ptr) };
    }
}
`}</Code>
        <Code title="launching the kernel through a safe-ish API">{`
use std::ffi::c_void;

pub fn scale(kernel: CUfunction, x: &mut DeviceBuffer, s: f32) -> Result<(), CudaError> {
    let n = (x.len_bytes() / 4) as u32;
    let block = 256u32;                       // threads per block
    let grid = n.div_ceil(block);             // enough blocks to cover n elements

    // cuLaunchKernel wants an array of POINTERS TO each argument value.
    let mut ptr = x.raw();
    let mut n_arg = n;
    let mut s_arg = s;
    let mut params: [*mut c_void; 3] = [
        &mut ptr as *mut _ as *mut c_void,
        &mut n_arg as *mut _ as *mut c_void,
        &mut s_arg as *mut _ as *mut c_void,
    ];
    // SAFETY: argument types and order match 'scale(float*, unsigned int, float)'.
    check(unsafe {
        cuLaunchKernel(kernel, grid, 1, 1, block, 1, 1, 0,
                       std::ptr::null_mut(), params.as_mut_ptr(), std::ptr::null_mut())
    })
}
`}</Code>
        <Callout kind="warn">
          The kernel launch is the most dangerous line in the engine: if the Rust argument list does not match the CUDA function's parameters,
          the GPU reads garbage and may write to random VRAM. Nothing checks this for us. In Kiln each kernel gets a tiny typed Rust wrapper
          (like <code>scale</code> above) plus a test that compares its output with a plain CPU implementation.
        </Callout>
        <Callout kind="idea">
          Write a <code>// SAFETY:</code> comment above every <code>unsafe</code> block explaining <b>why</b> it is correct. Reviewers check the argument, not just the code.
          <code>cargo clippy</code> can enforce this (<code>clippy::undocumented_unsafe_blocks</code>).
        </Callout>
        <Quiz q="Who frees the GPU memory of a DeviceBuffer if the request handler returns early with an error via `?`?"
          options={["Nobody: it leaks", "The caller must call free() manually", "Its Drop impl runs automatically when the value goes out of scope", "The CUDA driver frees it after a timeout"]} answer={2}
          explain="Early return drops all local values, so Drop calls cuMemFree_v2. That is the whole point of wrapping the raw handle in an owning type." />
      </Section>

      <Section title="Memory-mapping the model file">
        <p>Our model file is ~2.5 GB. Reading it with <code>read()</code> would copy it into RAM first. <b>Memory mapping</b> (mmap) asks the OS to make the file
          <b> appear</b> as a range of memory. Pages are loaded from disk only when touched, and the OS can drop them again under memory pressure.</p>
        <Code title="kiln-engine/src/format/mmap.rs">{`
use std::fs::File;

pub fn open_model(path: &str) -> std::io::Result<memmap2::Mmap> {
    let file = File::open(path)?;
    // SAFETY: the file must not be modified or truncated by anyone while mapped;
    // otherwise our &[u8] would change under us. We treat model files as read-only.
    // (On Windows memmap2 calls CreateFileMappingW + MapViewOfFile; we may write
    //  those few calls ourselves through windows-sys.)
    unsafe { memmap2::Mmap::map(&file) }
}

/// View raw bytes as f32 values WITHOUT copying.
pub fn as_f32s(b: &[u8]) -> &[f32] {
    assert!(b.len() % 4 == 0, "length must be a multiple of 4");
    assert!(b.as_ptr() as usize % std::mem::align_of::<f32>() == 0, "misaligned tensor");
    // SAFETY: checked length and alignment above; every bit pattern is a valid f32;
    // the returned slice borrows 'b', so it cannot outlive the mapping.
    unsafe { std::slice::from_raw_parts(b.as_ptr().cast::<f32>(), b.len() / 4) }
}

fn main() -> std::io::Result<()> {
    let map = open_model("models/qwen3-4b-q4_k_m.gguf")?;
    let bytes: &[u8] = &map;                 // looks like a normal 2.5 GB slice
    assert_eq!(&bytes[0..4], b"GGUF");       // file magic number
    Ok(())
}
`}</Code>
        <Callout kind="kiln">
          Notice the lifetime trick from lesson 2 in <code>as_f32s</code>: the output slice borrows the input bytes, which borrow the mapping.
          So the compiler guarantees no tensor view outlives the mapped file, even though we used <code>unsafe</code> to create it.
        </Callout>
      </Section>

      <Section title="A first look at SIMD">
        <p>Modern CPUs can do the same operation on <b>8 floats at once</b> with one instruction (AVX2: 256-bit registers). Our Ryzen supports AVX2 and FMA
          ("fused multiply-add": <code>a*b + c</code> in one step). <code>std::arch</code> exposes these instructions directly. They are <code>unsafe</code> because
          running them on a CPU without AVX2 is undefined behaviour, so we must check the CPU first.</p>
        <Code title="dot product: the inner loop of a matrix multiply">{`
#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2,fma")]
unsafe fn dot_avx2(a: &[f32], b: &[f32]) -> f32 {
    use std::arch::x86_64::*;
    assert_eq!(a.len(), b.len());
    let mut acc = _mm256_setzero_ps();                    // 8 lanes of 0.0
    let chunks = a.len() / 8;
    for i in 0..chunks {
        // SAFETY: i*8+8 <= len, so both loads read inside the slices.
        let va = unsafe { _mm256_loadu_ps(a.as_ptr().add(i * 8)) };   // load 8 floats
        let vb = unsafe { _mm256_loadu_ps(b.as_ptr().add(i * 8)) };
        acc = _mm256_fmadd_ps(va, vb, acc);               // acc += va * vb (8 at once)
    }
    let mut lanes = [0.0f32; 8];
    unsafe { _mm256_storeu_ps(lanes.as_mut_ptr(), acc) };
    let mut sum: f32 = lanes.iter().sum();                // add the 8 partial sums
    for i in chunks * 8..a.len() {                        // leftover elements
        sum += a[i] * b[i];
    }
    sum
}

pub fn dot(a: &[f32], b: &[f32]) -> f32 {
    #[cfg(target_arch = "x86_64")]
    if is_x86_feature_detected!("avx2") && is_x86_feature_detected!("fma") {
        // SAFETY: we just checked the CPU supports both features.
        return unsafe { dot_avx2(a, b) };
    }
    a.iter().zip(b).map(|(x, y)| x * y).sum()            // portable fallback
}
`}</Code>
        <Callout kind="deep">
          The SIMD version adds numbers in a different order than the simple loop, so results can differ in the last few bits.
          Floating-point addition is not associative: <code>(a+b)+c</code> may differ from <code>a+(b+c)</code>. That is why Kiln's kernel tests compare with a <b>tolerance</b>, not exact equality.
          The "Memory, caches &amp; SIMD" lesson goes deeper.
        </Callout>
        <Quiz q="Which of these does NOT require an unsafe block?"
          options={["Dereferencing a *const f32", "Calling cuMemAlloc_v2", "Creating a raw pointer with slice.as_ptr()", "Calling _mm256_loadu_ps on a raw pointer"]} answer={2}
          explain="Creating or printing a raw pointer is safe; only using it (dereferencing, passing it to unsafe functions) needs unsafe. The danger is in the access, not the address." />
      </Section>

      <Recap items={[
        "unsafe unlocks 5 things (raw pointer deref, unsafe/FFI calls, mutable statics, unsafe traits, unions). All other checks stay on.",
        "A raw pointer is just an address. You promise it is valid, aligned and in bounds.",
        "#[repr(C)] fixes struct layout so C code (CUDA, the OS) can read it.",
        "FFI = declaring C functions with matching types in an extern \"C\" block; the linker connects them to the DLL.",
        "Golden pattern: tiny unsafe core + safe public API + Drop for cleanup + // SAFETY: comments.",
        "mmap makes a 2.5 GB file look like a &[u8] without copying; lifetimes keep tensor views valid.",
        "SIMD (AVX2/FMA) processes 8 floats per instruction; check CPU features first, compare results with tolerance.",
      ]} />
    </>
  );
}
