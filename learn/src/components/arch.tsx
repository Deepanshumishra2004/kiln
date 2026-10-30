// The Kiln system diagram, shared by the "big picture" and "request lifecycle" pages.
// Nodes and edges have ids so pages can highlight parts of the system.

import { Arrow, Box, Svg } from "./ui";

export type NodeId =
  | "client" | "edge" | "gateway" | "console" | "log" | "scheduler"
  | "admin" | "usage" | "gpu" | "cpu" | "pg";

type Node = { id: NodeId; x: number; y: number; w?: number; label: string; sub: string; color: 1 | 2 | 3 | 4 | 5 | 6 };

export const NODES: Node[] = [
  { id: "client", x: 20, y: 30, label: "Client", sub: "OpenAI SDK / agent", color: 6 },
  { id: "edge", x: 200, y: 30, label: "Cloudflare", sub: "TLS edge", color: 6 },
  { id: "gateway", x: 380, y: 30, label: "gateway", sub: "HTTP · auth · limits", color: 2 },
  { id: "console", x: 600, y: 30, label: "console", sub: "web UI", color: 4 },
  { id: "log", x: 130, y: 170, label: "kiln-log", sub: "usage event log", color: 3 },
  { id: "scheduler", x: 380, y: 170, label: "scheduler", sub: "queues · fairness", color: 2 },
  { id: "admin", x: 600, y: 170, label: "admin-api", sub: "orgs · keys · usage", color: 4 },
  { id: "usage", x: 40, y: 310, label: "usage-worker", sub: "price · ledger", color: 3 },
  { id: "gpu", x: 270, y: 310, label: "worker-gpu", sub: "kiln-engine · CUDA", color: 1 },
  { id: "cpu", x: 420, y: 310, label: "worker-cpu", sub: "kiln-engine · AVX2", color: 1 },
  { id: "pg", x: 330, y: 430, w: 170, label: "Postgres", sub: "accounts · keys · billing", color: 5 },
];

export type EdgeId =
  | "client-edge" | "edge-gateway" | "gateway-scheduler" | "gateway-log" | "scheduler-gpu"
  | "scheduler-cpu" | "log-usage" | "usage-pg" | "admin-pg" | "console-admin";

const EDGES: { id: EdgeId; x1: number; y1: number; x2: number; y2: number; label?: string; dashed?: boolean }[] = [
  { id: "client-edge", x1: 150, y1: 56, x2: 198, y2: 56 },
  { id: "edge-gateway", x1: 330, y1: 56, x2: 378, y2: 56 },
  { id: "gateway-scheduler", x1: 445, y1: 82, x2: 445, y2: 168, label: "kiln-wire" },
  { id: "gateway-log", x1: 400, y1: 82, x2: 230, y2: 168, label: "usage event" },
  { id: "scheduler-gpu", x1: 425, y1: 222, x2: 345, y2: 308 },
  { id: "scheduler-cpu", x1: 465, y1: 222, x2: 485, y2: 308 },
  { id: "log-usage", x1: 175, y1: 222, x2: 120, y2: 308 },
  { id: "usage-pg", x1: 110, y1: 362, x2: 328, y2: 452 },
  { id: "admin-pg", x1: 665, y1: 222, x2: 502, y2: 440 },
  { id: "console-admin", x1: 665, y1: 82, x2: 665, y2: 168, label: "HTTP" },
];

export function ArchDiagram(props: {
  active?: NodeId[];
  activeEdges?: EdgeId[];
  selected?: NodeId | null;
  onSelect?: (id: NodeId) => void;
}) {
  const anyActive = (props.active?.length ?? 0) > 0;
  return (
    <Svg w={760} h={500} label="Kiln architecture">
      {/* trust boundary: everything inside runs on the laptop */}
      <path d="M355,8 H752 V494 H30 V140 H355 Z" fill="none" stroke="var(--border)" strokeDasharray="6 5" />
      <text x={740} y={488} textAnchor="end" fontSize={11} fill="var(--muted)">your laptop (only gateway + console are public)</text>
      {EDGES.map((e) => (
        <Arrow key={e.id} {...e} accent={props.activeEdges?.includes(e.id)} />
      ))}
      {/* gateway reads key records (cached) from Postgres: drawn as a note, not a line through other boxes */}
      <text x={520} y={118} fontSize={10.5} fill="var(--muted)">gateway also reads</text>
      <text x={520} y={131} fontSize={10.5} fill="var(--muted)">keys from Postgres (cached)</text>
      {NODES.map((n) => (
        <Box key={n.id} x={n.x} y={n.y} w={n.w ?? 130} h={52} label={n.label} sub={n.sub} color={n.color}
          active={props.selected === n.id || props.active?.includes(n.id)}
          dim={anyActive && !props.active?.includes(n.id)}
          onClick={props.onSelect ? () => props.onSelect!(n.id) : undefined} />
      ))}
    </Svg>
  );
}
