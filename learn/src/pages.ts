// Single source of truth for navigation order.
// To add a lesson: create src/pages/<slug>.tsx (default export) and add a row here.

import { ComponentType, lazy, LazyExoticComponent } from "react";

export type PageDef = {
  slug: string;
  title: string;
  track: string;
  Component: LazyExoticComponent<ComponentType>;
};

const p = (slug: string, title: string, track: string): PageDef => ({
  slug, title, track,
  Component: lazy(() => import(`./pages/${slug}.tsx`)),
});

export const TRACKS = [
  "Start here",
  "Rust from zero",
  "How computers work",
  "How LLMs work",
  "The platform",
  "The plan",
] as const;

export const PAGES: PageDef[] = [
  p("welcome", "Welcome & how to use this", "Start here"),
  p("big-picture", "The big picture", "Start here"),
  p("request-lifecycle", "Life of one request", "Start here"),

  p("rust-basics", "Rust basics: values, types, functions", "Rust from zero"),
  p("rust-ownership", "Ownership & borrowing", "Rust from zero"),
  p("rust-types", "Structs, enums, traits & errors", "Rust from zero"),
  p("rust-concurrency", "Threads, async & channels", "Rust from zero"),
  p("rust-unsafe", "Unsafe, pointers & FFI", "Rust from zero"),

  p("bits-bytes", "Bits, bytes & floating point", "How computers work"),
  p("memory-cpu", "Memory, caches & SIMD", "How computers work"),
  p("gpu-cuda", "GPUs & CUDA", "How computers work"),

  p("tokenization", "Tokenization (BPE)", "How LLMs work"),
  p("transformer", "The transformer, from first principles", "How LLMs work"),
  p("quantization", "Quantization", "How LLMs work"),
  p("sampling", "Sampling: picking the next token", "How LLMs work"),
  p("kv-cache", "KV cache & paged memory", "How LLMs work"),
  p("batching", "Continuous batching", "How LLMs work"),

  p("http-sse", "HTTP & streaming from scratch", "The platform"),
  p("wire-protocol", "Our wire protocol", "The platform"),
  p("auth-keys", "API keys & auth", "The platform"),
  p("rate-limiting", "Rate limiting", "The platform"),
  p("scheduler", "Scheduler & fairness", "The platform"),
  p("event-log-billing", "Event log & billing", "The platform"),
  p("observability", "Observability", "The platform"),

  p("build-vs-buy", "What we build vs use", "The plan"),
  p("roadmap", "Roadmap & phases", "The plan"),
  p("glossary", "Glossary", "The plan"),
];
