import { useEffect, useMemo, useState } from "react";
import {
  Arrow, Box, Callout, Code, PageHeader, Quiz, Recap, Section, Seg, Slider, Stepper, Svg, Viz,
} from "../components/ui";

/* ---------- Fairness simulation (FIFO vs Deficit Round Robin) ---------- */

type Org = "A" | "B" | "C";
const ORGS: Org[] = ["A", "B", "C"];
const ORG_COLOR: Record<Org, number> = { A: 2, B: 1, C: 3 };
type Job = { id: number; org: Org; arrive: number; cost: number };
type Seg_ = { job: Job; start: number; end: number };

function makeJobs(flood: number): Job[] {
  const jobs: Job[] = [];
  let id = 0;
  // Org A floods: `flood` requests in the first 2 ticks, cost 2 each
  for (let i = 0; i < flood; i++) jobs.push({ id: id++, org: "A", arrive: i % 2, cost: 2 });
  // Org B: small request every 4 ticks
  for (let t = 1; t < 40; t += 4) jobs.push({ id: id++, org: "B", arrive: t, cost: 1 });
  // Org C: medium request every 7 ticks
  for (let t = 3; t < 40; t += 7) jobs.push({ id: id++, org: "C", arrive: t, cost: 3 });
  return jobs.sort((a, b) => a.arrive - b.arrive || a.id - b.id);
}

function simulate(jobs: Job[], mode: "fifo" | "drr", quantum: number) {
  const pending = [...jobs];
  const queues: Record<Org, Job[]> = { A: [], B: [], C: [] };
  const deficit: Record<Org, number> = { A: 0, B: 0, C: 0 };
  let ptr = 0;
  const segs: Seg_[] = [];
  let t = 0;
  let guard = 0;

  const admit = (now: number) => {
    while (pending.length && pending[0].arrive <= now) { const j = pending.shift()!; queues[j.org].push(j); }
  };
  const anyQueued = () => ORGS.some((o) => queues[o].length);

  const pick = (): Job | null => {
    if (mode === "fifo") {
      let best: Org | null = null;
      for (const o of ORGS) {
        const h = queues[o][0];
        if (h && (!best || h.arrive < queues[best][0].arrive || (h.arrive === queues[best][0].arrive && h.id < queues[best][0].id))) best = o;
      }
      return best ? queues[best].shift()! : null;
    }
    // Deficit Round Robin
    for (let spins = 0; spins < 100; spins++) {
      const o = ORGS[ptr];
      const q = queues[o];
      if (!q.length) { deficit[o] = 0; ptr = (ptr + 1) % 3; continue; }
      // same logic as the Rust sketch below: spend budget if enough, else add a quantum and pass the turn
      if (deficit[o] >= q[0].cost) { deficit[o] -= q[0].cost; return q.shift()!; }
      deficit[o] += quantum;
      ptr = (ptr + 1) % 3;
    }
    return null;
  };

  while ((pending.length || anyQueued()) && guard++ < 1000) {
    admit(t);
    if (!anyQueued()) { t = pending[0].arrive; continue; }
    const j = pick();
    if (!j) break;
    segs.push({ job: j, start: t, end: t + j.cost });
    t += j.cost;
  }
  const waits: Record<Org, number[]> = { A: [], B: [], C: [] };
  for (const s of segs) waits[s.job.org].push(s.start - s.job.arrive);
  return { segs, waits, end: t };
}

function FairnessSim() {
  const [mode, setMode] = useState<"fifo" | "drr">("fifo");
  const [flood, setFlood] = useState(24);
  const [quantum, setQuantum] = useState(2);
  const [now, setNow] = useState(0);
  const [playing, setPlaying] = useState(false);

  const jobs = useMemo(() => makeJobs(flood), [flood]);
  const sim = useMemo(() => simulate(jobs, mode, quantum), [jobs, mode, quantum]);
  const T = Math.max(sim.end, 1);

  useEffect(() => { setNow(0); setPlaying(false); }, [mode, flood, quantum]);
  useEffect(() => {
    if (!playing) return;
    if (now >= T) { setPlaying(false); return; }
    const id = setTimeout(() => setNow((n) => Math.min(T, n + 1)), 120);
    return () => clearTimeout(id);
  }, [playing, now, T]);

  const W = 700, X0 = 40, scale = (W - X0 - 10) / T;
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const queued = (o: Org) => jobs.filter((j) => j.org === o && j.arrive <= now && !sim.segs.some((s) => s.job.id === j.id && s.start <= now)).length;

  return (
    <Viz title="Fairness: one org floods, two orgs behave"
      hint="Org A sends a flood at t=0. Orgs B and C send a few requests over time. The single GPU serves one job at a time (job width = its cost). Compare FIFO and Deficit Round Robin."
      caption="Watch org B's and C's waiting time. With FIFO they wait behind A's whole flood. With DRR, A only slows itself down.">
      <div className="controls">
        <Seg options={["fifo", "drr"] as const} value={mode} onChange={setMode} labels={{ fifo: "FIFO (one queue)", drr: "DRR (per-org queues)" }} />
        <button className="btn primary" onClick={() => { if (now >= T) setNow(0); setPlaying(!playing); }}>{playing ? "pause" : now >= T ? "replay" : "play"}</button>
        <button className="btn" onClick={() => setNow(T)}>jump to end</button>
      </div>
      <div className="controls">
        <Slider label="org A flood size" value={flood} min={0} max={40} onChange={setFlood} />
        {mode === "drr" && <Slider label="DRR quantum (cost units per round)" value={quantum} min={1} max={6} onChange={setQuantum} />}
      </div>
      <Svg w={720} h={150} label="GPU timeline">
        <text x={0} y={16} fontSize={12} fill="var(--muted)">GPU timeline (who is being served)</text>
        <text x={4} y={52} fontSize={12} fill="var(--muted)">GPU</text>
        {sim.segs.filter((s) => s.start < now).map((s) => {
          const end = Math.min(s.end, now);
          return <rect key={s.job.id} x={X0 + s.start * scale} y={30} width={Math.max(1, (end - s.start) * scale - 1)} height={36}
            fill={`var(--c${ORG_COLOR[s.job.org]})`} opacity={0.85} />;
        })}
        <line x1={X0 + now * scale} y1={24} x2={X0 + now * scale} y2={72} stroke="var(--accent)" strokeWidth={2} />
        {ORGS.map((o, i) => (
          <g key={o}>
            <rect x={X0 + i * 150} y={92} width={14} height={14} fill={`var(--c${ORG_COLOR[o]})`} />
            <text x={X0 + i * 150 + 20} y={104} fontSize={12} fill="var(--text)">org {o}: {queued(o)} waiting</text>
          </g>
        ))}
        <text x={X0} y={136} fontSize={11} fill="var(--muted)">t = {now} / {T} ticks</text>
      </Svg>
      <table>
        <thead><tr><th>org</th><th>requests</th><th>avg wait (ticks)</th><th>max wait</th></tr></thead>
        <tbody>{ORGS.map((o) => (
          <tr key={o}><td><b style={{ color: `var(--c${ORG_COLOR[o]})` }}>{o}</b></td><td>{sim.waits[o].length}</td>
            <td>{avg(sim.waits[o]).toFixed(1)}</td><td>{Math.max(0, ...sim.waits[o])}</td></tr>
        ))}</tbody>
      </table>
    </Viz>
  );
}

/* ---------- Admission control simulation ---------- */

function AdmissionSim() {
  const [arrival, setArrival] = useState(6);   // req/s
  const [capacity, setCapacity] = useState(4); // req/s the GPU can finish
  const [maxWait, setMaxWait] = useState(5);   // seconds
  const [shed, setShed] = useState<"on" | "off">("on");

  const res = useMemo(() => {
    const dt = 0.1, Tend = 60;
    let backlog = 0; // requests waiting
    let acc = 0, rej = 0;
    const pts: { t: number; wait: number }[] = [];
    let arrAcc = 0;
    for (let t = 0; t < Tend; t += dt) {
      arrAcc += arrival * dt;
      while (arrAcc >= 1) {
        arrAcc -= 1;
        const est = backlog / capacity;
        if (shed === "on" && est > maxWait) { rej++; }
        else { backlog += 1; acc++; pts.push({ t, wait: est }); }
      }
      backlog = Math.max(0, backlog - capacity * dt);
    }
    return { acc, rej, pts, lastWait: pts.length ? pts[pts.length - 1].wait : 0 };
  }, [arrival, capacity, maxWait, shed]);

  const maxY = Math.max(maxWait * 1.5, ...res.pts.map((p) => p.wait), 1);
  const X = (t: number) => 50 + (t / 60) * 650;
  const Y = (w: number) => 160 - (w / maxY) * 140;

  return (
    <Viz title="Admission control: reject early or let everyone suffer?"
      hint="Requests arrive faster than the GPU can finish them. Without shedding, the queue (and waiting time) grows forever. With shedding, extra requests get an instant 503."
      caption={`Accepted ${res.acc}, rejected ${res.rej} in 60 s. Wait of the last accepted request: ${res.lastWait.toFixed(1)} s.`}>
      <div className="controls">
        <Seg options={["on", "off"] as const} value={shed} onChange={setShed} labels={{ on: "load shedding ON", off: "unbounded queue" }} />
      </div>
      <div className="controls">
        <Slider label="arrivals (req/s)" value={arrival} min={1} max={12} onChange={setArrival} />
        <Slider label="GPU capacity (req/s)" value={capacity} min={1} max={12} onChange={setCapacity} />
        <Slider label="max wait budget (s)" value={maxWait} min={1} max={30} onChange={setMaxWait} />
      </div>
      <Svg w={720} h={190} label="estimated wait over time">
        <line x1={50} y1={160} x2={700} y2={160} stroke="var(--border)" />
        <line x1={50} y1={20} x2={50} y2={160} stroke="var(--border)" />
        <text x={8} y={24} fontSize={11} fill="var(--muted)">{maxY.toFixed(0)}s</text>
        <text x={14} y={163} fontSize={11} fill="var(--muted)">0</text>
        <text x={700} y={180} textAnchor="end" fontSize={11} fill="var(--muted)">60 s</text>
        <text x={375} y={180} textAnchor="middle" fontSize={11} fill="var(--muted)">time → (each dot = one accepted request, height = its wait)</text>
        <line x1={50} y1={Y(maxWait)} x2={700} y2={Y(maxWait)} stroke="var(--c5)" strokeDasharray="5 4" />
        <text x={696} y={Y(maxWait) - 4} textAnchor="end" fontSize={11} fill="var(--c5)">wait budget</text>
        {res.pts.filter((_, i) => i % 2 === 0).map((p, i) => <circle key={i} cx={X(p.t)} cy={Y(p.wait)} r={2} fill="var(--c1)" />)}
      </Svg>
    </Viz>
  );
}

/* ---------- Worker selection ---------- */

function WorkerPick() {
  const BLOCK = 16;
  const [input, setInput] = useState(1200);
  const [maxTok, setMaxTok] = useState(500);
  const workers = [
    { id: "worker-gpu-0", total: 390, free: 140, healthy: true },
    { id: "worker-gpu-1", total: 390, free: 60, healthy: true },
    { id: "worker-gpu-2", total: 390, free: 300, healthy: false },
  ];
  const need = Math.ceil((input + maxTok) / BLOCK);
  const fits = workers.filter((w) => w.healthy && w.free >= need);
  const chosen = fits.sort((a, b) => b.free - a.free)[0];
  const neverFits = need > 390;

  return (
    <Viz title="Which worker gets the request?"
      hint="A request needs ceil((input + max_tokens) / 16) KV blocks. The scheduler picks the healthy worker with the most free blocks. (Worker 2 is shown to teach failover; today Kiln has one GPU worker per model.)"
      caption={neverFits ? `Needs ${need} blocks — more than a whole worker (390). Rejected at the gateway: 400 context_length_exceeded.`
        : chosen ? `Needs ${need} blocks → dispatched to ${chosen.id}.` : `Needs ${need} blocks → no healthy worker has room now. Request waits in the queue.`}>
      <div className="controls">
        <Slider label="input tokens" value={input} min={50} max={6000} step={50} onChange={setInput} />
        <Slider label="max_tokens" value={maxTok} min={50} max={2000} step={50} onChange={setMaxTok} />
      </div>
      <Svg w={720} h={150} label="workers and their free KV blocks">
        {workers.map((w, i) => {
          const x = 20 + i * 235;
          const isChosen = chosen?.id === w.id;
          return (
            <g key={w.id} opacity={w.healthy ? 1 : 0.4}>
              <rect x={x} y={20} width={215} height={110} rx={8} fill="var(--panel-2)" stroke={isChosen ? "var(--accent)" : "var(--border)"} strokeWidth={isChosen ? 3 : 1.5} />
              <text x={x + 12} y={42} fontSize={13} fontWeight={600} fill="var(--text)">{w.id}</text>
              <text x={x + 12} y={60} fontSize={11} fill="var(--muted)">{w.healthy ? "healthy" : "❌ missed heartbeats"}</text>
              <rect x={x + 12} y={72} width={190} height={18} rx={4} fill="var(--border)" />
              <rect x={x + 12} y={72} width={190 * (1 - w.free / w.total)} height={18} rx={4} fill="var(--c2)" />
              <rect x={x + 12 + 190 * (1 - w.free / w.total)} y={72} width={Math.min(190 * (need / w.total), 190 * (w.free / w.total))} height={18} fill={w.free >= need ? "var(--c3)" : "var(--c5)"} opacity={0.7} />
              <text x={x + 12} y={110} fontSize={11} fill="var(--muted)">free {w.free} / {w.total} blocks · need {need}</text>
            </g>
          );
        })}
      </Svg>
    </Viz>
  );
}

/* ---------- Page ---------- */

export default function Page() {
  return (
    <>
      <PageHeader
        kicker="Platform · Lesson 5"
        title="Scheduler & fairness"
        subtitle="The scheduler decides who uses the GPU next. It is the traffic police between the gateway and the workers."
        learn={[
          "Why the gateway never talks to workers directly",
          "Admission control: rejecting early (503) instead of queueing forever",
          "Fair sharing between customers with Deficit Round Robin (DRR)",
          "Priority classes: interactive vs batch",
          "Picking a worker by free KV blocks; heartbeats and failover",
          "A Rust skeleton of the scheduler loop",
        ]}
      />

      <Section title="Why a scheduler?">
        <p>
          Rate limits (previous lesson) control how much each customer may send <i>per minute</i>. But even within limits,
          ten customers can send requests at the same second, and our GPU can run only a few at once. Someone has to decide:
          <b> who goes next, who waits, and who is told "not now"</b>. That is the scheduler.
        </p>
        <Svg w={720} h={130} label="gateway, scheduler, workers">
          <Box x={10} y={40} w={150} h={54} label="gateway" sub="auth · limits" color={1} />
          <Arrow x1={160} y1={67} x2={268} y2={67} label="Submit" />
          <Box x={270} y={25} w={180} h={84} label="scheduler" sub="queues · fairness · admission" color={4} />
          <Arrow x1={450} y1={52} x2={560} y2={40} label="Generate" />
          <Arrow x1={450} y1={82} x2={560} y2={95} />
          <Box x={562} y={14} w={150} h={46} label="worker-gpu" sub="qwen3-4b" color={2} />
          <Box x={562} y={72} w={150} h={46} label="worker-cpu" sub="qwen3-1.7b" color={2} />
        </Svg>
        <Callout kind="analogy">
          A restaurant host. Guests (requests) arrive; tables (GPU slots) are limited. The host keeps a waiting list, makes sure
          one big group does not take every table, seats people where a table fits, and politely tells new guests "the wait is
          over an hour" instead of letting the line grow out the door.
        </Callout>
      </Section>

      <Section title="Step 1 — Admission control & load shedding">
        <p>On every <code>Submit</code>, the scheduler estimates how long the request would wait:</p>
        <Code lang="text">{`
estimated_wait = tokens_queued_ahead / pool_throughput_tokens_per_sec

if queue_len >= max_queue_len  or  estimated_wait > max_wait (30 s interactive):
    reject → gateway returns 503 overloaded_error, retry-after = estimated_wait
`}</Code>
        <AdmissionSim />
        <Callout kind="idea">
          When arrivals are faster than capacity, a queue does not "absorb" the extra load — it grows <b>forever</b>, and
          <b> every</b> request becomes slow, not only the extra ones. Rejecting fast is kinder: most users get fast answers,
          and the rejected ones can retry later or elsewhere.
        </Callout>
        <Quiz
          q="Arrivals = 6 req/s, capacity = 4 req/s, no load shedding. What happens to waiting time after 60 seconds?"
          options={[
            "It stays around 1.5 s",
            "It grows steadily: the backlog increases by ~2 requests every second",
            "It goes to zero because the GPU catches up",
            "Requests are automatically rejected",
          ]}
          answer={1}
          explain="Backlog grows by 6 − 4 = 2 requests per second, so after 60 s about 120 requests are waiting: ~30 s of waiting for everyone. That is why we shed load."
        />
      </Section>

      <Section title="Step 2 — Fairness with Deficit Round Robin">
        <p>
          With a single FIFO queue, the customer who sends the most requests gets the most GPU. One org sending 100 requests
          pushes everybody else to the back. The fix is <b>one sub-queue per org</b>, served in turns.
        </p>
        <p>
          But turns of "one request each" are unfair too: requests have different sizes. <b>Deficit Round Robin</b> gives each
          org a budget (<i>quantum</i>) of work per round. An org can spend its budget on one big request or several small ones.
          Unused budget is remembered (the <i>deficit</i>) so big requests are not starved.
        </p>
        <FairnessSim />
        <Code lang="text" title="DRR in plain words">{`
loop over orgs in a circle:
    if org's queue is empty:   deficit = 0; next org
    deficit += quantum                       (optionally × tier weight)
    while queue not empty and head.cost <= deficit:
        dispatch head; deficit -= head.cost
    next org
`}</Code>
        <Callout kind="deep">
          DRR comes from network routers (1995): it shares a link fairly between flows with different packet sizes in O(1) per
          packet. Our "packets" are requests and their "size" is token cost (input + max_tokens). Weighting the quantum by usage
          tier gives paying customers a bigger share while still protecting everyone.
        </Callout>
        <h3>Priority classes</h3>
        <table>
          <thead><tr><th>Class</th><th>Source</th><th>Behaviour</th></tr></thead>
          <tbody>
            <tr><td><code>interactive</code></td><td>normal API calls</td><td>served first, strict wait budget (~30 s)</td></tr>
            <tr><td><code>batch</code></td><td>Batch API (phase 6)</td><td>only when interactive is empty; may wait hours; 50% price</td></tr>
          </tbody>
        </table>
        <Quiz
          q="With DRR and an equal quantum, org A has 30 queued requests, org B has 1. Who gets the next GPU slot after A's current turn?"
          options={["A, because it has more requests", "B, because the round moves to the next org with work", "Whoever arrived first", "Random"]}
          answer={1}
          explain="DRR visits orgs in a circle. A's big queue only means A has more turns ahead — it does not let A skip B's turn."
        />
      </Section>

      <Section title="Step 3 — Picking a worker">
        <p>
          A request can run on a worker only if its KV cache fits (see the KV cache lesson). Workers report
          <code>kv_blocks_free</code> in every heartbeat. A conservative check:
          <code>kv_blocks_free ≥ ceil((input_tokens + max_tokens) / 16)</code> and <code>running_seqs &lt; max_seqs</code>.
        </p>
        <WorkerPick />
        <Callout kind="kiln">
          Later improvement: <b>prefix-cache affinity</b>. Send requests with the same long system prompt to the same worker, so
          its prefix cache gets hits (cheaper and faster). Real providers do this aggressively.
        </Callout>
      </Section>

      <Section title="Step 4 — Heartbeats & failover">
        <Stepper title="A worker dies" steps={[
          { title: "Normal", body: <p>Every 1 s each worker sends <code>Heartbeat {"{kv_blocks_free, running_seqs, waiting_seqs, tokens_per_sec}"}</code> over kiln-wire. The scheduler's registry is just this data in memory.</p> },
          { title: "Silence", body: <p>No heartbeat for 3 s → worker marked <b>unhealthy</b>. No new requests are sent to it.</p> },
          { title: "In-flight requests", body: <p>Streams on the dead worker fail. The gateway sends an SSE <code>error</code> event. We do <b>not</b> retry mid-stream — the user already saw part of the answer. Tokens already delivered are billed.</p> },
          { title: "Not-started requests", body: <p>Requests that were dispatched but not yet started can be safely re-queued to another worker for the same model.</p> },
          { title: "Recovery", body: <p>When the worker restarts and heartbeats again, it rejoins the pool. The registry is rebuilt from heartbeats alone — the scheduler has no database.</p> },
        ]} />
      </Section>

      <Section title="Step 5 — Rust skeleton">
        <Code title="crates/scheduler/src/lib.rs (sketch)">{`
use std::collections::{HashMap, VecDeque};
use tokio::sync::{mpsc, oneshot};

pub struct Pending {
    pub org: OrgId,
    pub cost: u32,                         // input_tokens + max_tokens
    pub req: GenerateRequest,
    pub reply: oneshot::Sender<Result<StreamHandle, Reject>>,
}

struct OrgQueue { deficit: i64, items: VecDeque<Pending> }

pub struct ModelQueue {
    orgs: HashMap<OrgId, OrgQueue>,
    ring: VecDeque<OrgId>,                 // round-robin order of orgs with work
    queued_tokens: u64,
    quantum: i64,
}

impl ModelQueue {
    /// Admission control happens here, before anything is queued.
    pub fn submit(&mut self, p: Pending, throughput_tps: f64, max_wait_s: f64) {
        let est_wait = self.queued_tokens as f64 / throughput_tps.max(1.0);
        if est_wait > max_wait_s {
            let _ = p.reply.send(Err(Reject::Overloaded { retry_after_s: est_wait }));
            return;
        }
        self.queued_tokens += p.cost as u64;
        let q = self.orgs.entry(p.org).or_insert_with(|| OrgQueue { deficit: 0, items: VecDeque::new() });
        if q.items.is_empty() { self.ring.push_back(p.org); }
        q.items.push_back(p);
    }

    /// Deficit Round Robin: return the next request that should run.
    pub fn next(&mut self) -> Option<Pending> {
        while let Some(org) = self.ring.front().copied() {
            let q = self.orgs.get_mut(&org).unwrap();
            let head_cost = q.items.front().map(|p| p.cost as i64)?;
            if q.deficit >= head_cost {
                q.deficit -= head_cost;
                let p = q.items.pop_front().unwrap();
                if q.items.is_empty() { q.deficit = 0; self.ring.pop_front(); }
                self.queued_tokens -= p.cost as u64;
                return Some(p);
            }
            q.deficit += self.quantum;             // add budget, move to the back of the ring
            self.ring.rotate_left(1);
        }
        None
    }
}

// The main loop: wake up when a request arrives OR a worker reports free capacity.
pub async fn run(mut submits: mpsc::Receiver<Pending>, mut beats: mpsc::Receiver<Heartbeat>, mut s: State) {
    loop {
        tokio::select! {
            Some(p) = submits.recv() => s.queue_for(&p.req.model).submit(p, s.tps(), 30.0),
            Some(h) = beats.recv()   => s.registry.update(h),
        }
        s.dispatch_while_capacity().await;     // pop from queues while a worker fits
    }
}
`}</Code>
        <Callout kind="rust">
          <ul style={{ margin: 0 }}>
            <li><code>VecDeque</code> = double-ended queue: fast push/pop at both ends. Perfect for FIFO queues and rings.</li>
            <li><code>oneshot::Sender</code> = a channel for exactly one message. The gateway waits on the other end for "accepted" or "rejected".</li>
            <li><code>tokio::select!</code> waits on several things at once and runs the branch that is ready first.</li>
            <li>The <code>?</code> on an <code>Option</code> returns <code>None</code> early — here "this org has no head item".</li>
          </ul>
        </Callout>
      </Section>

      <Recap items={[
        "The scheduler sits between gateway and workers: queues, fairness, admission, dispatch, cancellation.",
        "Admission control rejects with 503 when estimated wait is too long — unbounded queues make everyone slow.",
        "DRR gives each org a quantum per round; a flooding org only slows itself.",
        "Interactive beats batch; batch fills idle GPU time at a discount.",
        "Dispatch only if KV blocks fit; requests that can never fit are rejected at the gateway.",
        "Heartbeats are the source of truth for worker health; no mid-stream retries.",
      ]} />
    </>
  );
}
