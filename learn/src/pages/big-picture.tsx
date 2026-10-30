import { useState } from "react";
import { Link } from "react-router-dom";
import { ArchDiagram, NodeId } from "../components/arch";
import { Arrow, Box, Callout, Code, PageHeader, Quiz, Recap, Section, Seg, Svg, Viz } from "../components/ui";

type Info = {
  title: string;
  what: string;
  why: string;
  owns: string;
  scratch: "build" | "use";
  crate: string;
  lessons: [string, string][];
};

const INFO: Record<NodeId, Info> = {
  client: {
    title: "Client",
    what: "Any program that calls our API: a Python script using the official OpenAI SDK, curl, or our own Rust agent.",
    why: "We copy the OpenAI API format exactly, so existing tools work with Kiln by changing only the base URL and key.",
    owns: "Nothing. It only holds an API key like sk-live-…",
    scratch: "use",
    crate: "(not ours) — except crates/agent, our own CLI agent",
    lessons: [["request-lifecycle", "Life of one request"]],
  },
  edge: {
    title: "Cloudflare Tunnel (the edge)",
    what: "A free service that gives us a public HTTPS address and forwards traffic to the laptop through an outgoing connection.",
    why: "We get TLS (the 🔒 in the browser) and DDoS protection without opening any port on the laptop. Real providers have a global edge network doing the same job.",
    owns: "TLS certificates. No application data.",
    scratch: "use",
    crate: "cloudflared (a binary we run)",
    lessons: [["http-sse", "HTTP & streaming"]],
  },
  gateway: {
    title: "gateway — the front door",
    what: "Our own HTTP/1.1 server. It reads the request, checks the API key, checks rate limits and credit, counts input tokens, asks the scheduler to run it, and streams tokens back as Server-Sent Events.",
    why: "Every request passes here, so every rule (who, how much, how fast) is enforced in one place. It is stateless, so in production you could run 100 copies.",
    owns: "Only caches (key cache, rate-limit counters). Truth lives in Postgres.",
    scratch: "build",
    crate: "crates/gateway",
    lessons: [["http-sse", "HTTP & SSE"], ["auth-keys", "API keys"], ["rate-limiting", "Rate limiting"]],
  },
  console: {
    title: "console — the dashboard",
    what: "Web UI. Operators see all orgs, live requests and GPU health. Customers see their keys, usage and bills.",
    why: "If you cannot see it, you cannot run it. Every provider has a console.",
    owns: "Nothing. It only talks to admin-api.",
    scratch: "build",
    crate: "crates/console (tech still to be decided)",
    lessons: [["observability", "Observability"]],
  },
  log: {
    title: "kiln-log — the event log",
    what: "Our own append-only log (a tiny Kafka). The gateway writes one usage event per finished request; consumers read them in order and remember their position (offset).",
    why: "Billing must never lose an event and never charge twice. An append-only log + idempotent consumers gives exactly that, and decouples the fast API path from slow billing work.",
    owns: "Usage events on disk, in segment files with checksums.",
    scratch: "build",
    crate: "crates/kiln-log",
    lessons: [["event-log-billing", "Event log & billing"]],
  },
  scheduler: {
    title: "scheduler — the traffic controller",
    what: "Keeps a queue per model, shares GPU time fairly between organisations, rejects work early when the system is full, and sends each request to the worker with the most free memory.",
    why: "The GPU is the scarce resource. Without a scheduler, one heavy customer slows everyone, and queues grow forever under load.",
    owns: "In-memory queues and the list of live workers (rebuilt from heartbeats after a restart).",
    scratch: "build",
    crate: "crates/scheduler",
    lessons: [["scheduler", "Scheduler & fairness"], ["batching", "Continuous batching"]],
  },
  admin: {
    title: "admin-api",
    what: "Backend for the console: create orgs, projects, keys; change limits; query usage; read the audit log.",
    why: "Kept separate from the gateway so a slow dashboard query can never slow down live API traffic.",
    owns: "Nothing; reads and writes Postgres.",
    scratch: "build",
    crate: "crates/admin-api",
    lessons: [["auth-keys", "API keys & auth"]],
  },
  usage: {
    title: "usage-worker — the accountant",
    what: "Reads usage events from kiln-log, calculates the price, writes the usage row, debits the org's credit ledger and updates daily totals.",
    why: "Money logic in one small, careful, idempotent place. If it crashes, it restarts from its last offset and duplicates are ignored.",
    owns: "Its consumer offset.",
    scratch: "build",
    crate: "crates/usage-worker",
    lessons: [["event-log-billing", "Event log & billing"]],
  },
  gpu: {
    title: "worker-gpu — runs the big model",
    what: "A process that loads Qwen3-4B (4-bit) into the RTX 3050's 4 GB of memory using kiln-engine, our own inference engine, and generates tokens for many requests at once.",
    why: "This is where the AI actually happens. Everything else exists to feed it fairly and bill it correctly.",
    owns: "Model weights and the KV cache in GPU memory.",
    scratch: "build",
    crate: "crates/inference-worker + crates/kiln-engine (CUDA backend)",
    lessons: [["transformer", "The transformer"], ["gpu-cuda", "GPUs & CUDA"], ["kv-cache", "KV cache"]],
  },
  cpu: {
    title: "worker-cpu — runs the small model",
    what: "Same program, CPU backend: runs Qwen3-1.7B on the Ryzen CPU with our own AVX2 SIMD kernels.",
    why: "A cheaper, faster second model (like 'mini' models at real providers) and overflow capacity. It also makes the scheduler's routing real.",
    owns: "Model weights and KV cache in RAM.",
    scratch: "build",
    crate: "crates/inference-worker + crates/kiln-engine (CPU backend)",
    lessons: [["memory-cpu", "Memory, caches & SIMD"]],
  },
  pg: {
    title: "Postgres — the source of truth",
    what: "The database: organisations, projects, members, API key hashes, limits, prices, usage records, the credit ledger, the audit log.",
    why: "Writing a correct database is a career by itself. Real providers use Postgres-class databases too.",
    owns: "All durable business data.",
    scratch: "use",
    crate: "(not ours) — accessed via sqlx; schema in migrations/",
    lessons: [["event-log-billing", "Event log & billing"]],
  },
};

function LayerDiagram() {
  const [view, setView] = useState<"provider" | "kiln">("provider");
  const layers = view === "provider"
    ? ["Clients (apps using the SDK)", "Edge (global TLS, DDoS shield)", "Gateway fleet (auth, limits, metering)", "Scheduler (queues, fairness, routing)", "GPU fleet (inference engines)"]
    : ["OpenAI SDK, curl, our agent", "Cloudflare Tunnel", "gateway (1 process)", "scheduler (1 process)", "worker-gpu + worker-cpu (kiln-engine)"];
  return (
    <Viz title="Five layers, every provider" hint="Switch between a real provider and Kiln. The jobs are the same; only the scale differs.">
      <div className="controls"><Seg options={["provider", "kiln"] as const} value={view} onChange={setView} labels={{ provider: "Big provider", kiln: "Kiln" }} /></div>
      <Svg w={600} h={330} label="layers">
        {layers.map((l, i) => (
          <g key={i}>
            <Box x={100} y={10 + i * 64} w={400} h={46} label={l} color={([6, 6, 2, 2, 1] as const)[i]} />
            {i < 4 && <Arrow x1={300} y1={58 + i * 64} x2={300} y2={72 + i * 64} />}
          </g>
        ))}
      </Svg>
    </Viz>
  );
}

export default function Page() {
  const [sel, setSel] = useState<NodeId>("gateway");
  const info = INFO[sel];
  return (
    <>
      <PageHeader
        kicker="Start here"
        title="The big picture"
        subtitle="Every box in Kiln, what it does, and why it exists."
        learn={[
          "The five layers every LLM provider has",
          "Each Kiln component and its single job",
          "Data plane vs control plane",
          "How the code is organised into crates",
        ]}
      />

      <Section title="Five layers, every provider">
        <p>
          OpenAI, Anthropic, Google and every other model provider look different from outside, but inside they all
          have the same five layers. A request travels down through them, and the answer travels back up.
        </p>
        <LayerDiagram />
        <Callout kind="idea">
          <p>Each layer has <b>one job</b>. The gateway decides <i>whether</i> a request may run. The scheduler decides <i>when and where</i>. The worker decides nothing: it just runs the math as fast as possible.</p>
        </Callout>
      </Section>

      <Section title="The Kiln system map">
        <p>Click any box to learn what it does. Orange = request path, blue = model workers, green = billing, purple = dashboard, red = database.</p>
        <div className="viz">
          <ArchDiagram selected={sel} onSelect={setSel} />
          <div className="card fade-in" key={sel} style={{ marginTop: 12 }}>
            <h4>{info.title} <span className={`pill ${info.scratch}`}>{info.scratch === "build" ? "we build it" : "we use it"}</span></h4>
            <p><b>What it does.</b> {info.what}</p>
            <p><b>Why it exists.</b> {info.why}</p>
            <p><b>State it owns.</b> {info.owns}</p>
            <p className="small muted">Code: <span className="mono">{info.crate}</span></p>
            <p className="small">Learn more: {info.lessons.map(([s, t], i) => <span key={s}>{i > 0 && " · "}<Link to={`/${s}`}>{t}</Link></span>)}</p>
          </div>
        </div>
        <Callout kind="deep">
          <p>
            Each box is a <b>separate process</b> (a separate running program). They talk over the network, even though
            they are on the same laptop. Why? You can restart the gateway without unloading the 2.5 GB model from the
            GPU. A crash in billing does not stop the API. And in a real deployment, each box becomes a fleet of machines
            without changing the code.
          </p>
        </Callout>
      </Section>

      <Section title="Data plane vs control plane">
        <p>Engineers split a system like this into two halves:</p>
        <div className="grid2">
          <div className="card">
            <h4>⚡ Data plane</h4>
            <p className="small">The hot path that every API request touches: gateway → scheduler → worker → back. Must be <b>fast</b> (milliseconds matter) and <b>always up</b>.</p>
          </div>
          <div className="card">
            <h4>🎛 Control plane</h4>
            <p className="small">Configuration and bookkeeping: console, admin-api, usage-worker, Postgres writes. Can be a little slower. If it is down for a minute, the API keeps serving.</p>
          </div>
        </div>
        <Callout kind="kiln">
          <p>
            This is why the gateway caches API keys and rate-limit counters in memory instead of asking Postgres on
            every request, and why billing goes through an event log instead of a direct database write. The data plane
            never waits for the control plane.
          </p>
        </Callout>
        <Quiz
          q="The usage-worker crashes for 5 minutes. What happens to API users?"
          options={[
            "All API requests fail until it is back",
            "Requests keep working; usage events wait in kiln-log and are billed when the worker restarts",
            "Requests work, but those 5 minutes are never billed",
          ]}
          answer={1}
          explain="The gateway only appends events to the log. The usage-worker reads them later from its last saved offset, so nothing is lost and users are not affected."
        />
      </Section>

      <Section title="How the code is organised">
        <p>
          All our Rust code lives in one <b>Cargo workspace</b>: one repository, many <b>crates</b> (a crate is a Rust
          library or program). Each service is a binary crate; shared code is in library crates.
        </p>
        <Code lang="text" title="repository layout (proposed)">{`
infra/
├─ Cargo.toml              # the workspace: lists all crates
├─ crates/
│  ├─ common/              # shared types, config, errors, key hashing
│  ├─ kiln-wire/           # our binary protocol between services
│  ├─ kiln-log/            # our append-only event log
│  ├─ kiln-engine/         # OUR inference engine (tensors, kernels, model, KV cache)
│  ├─ inference-worker/    # process that wraps kiln-engine and serves kiln-wire
│  ├─ scheduler/
│  ├─ gateway/
│  ├─ usage-worker/
│  ├─ admin-api/
│  ├─ console/
│  └─ agent/               # our CLI agent, a customer of our own API
├─ migrations/             # Postgres schema
├─ docs/                   # long design documents
└─ learn/                  # this website
`}</Code>
        <Quiz
          q="Why is kiln-engine a separate library crate instead of code inside inference-worker?"
          options={[
            "Rust requires every folder to be a crate",
            "So the engine can be tested, benchmarked and reused (CPU and GPU workers, tests, CLI tools) without the network server around it",
            "Because library crates run faster",
          ]}
          answer={1}
          explain="Keeping the engine free of networking means we can run it from a tiny test program, compare it against a reference implementation, and benchmark it alone."
        />
      </Section>

      <Recap items={[
        "Every provider has five layers: clients, edge, gateway, scheduler, GPU workers.",
        "Kiln has one process per job; they talk over the network so each can restart and scale alone.",
        "Data plane (fast, always up) never waits for the control plane (config, billing).",
        "We build almost every box; we use Cloudflare and Postgres.",
      ]} />
    </>
  );
}
