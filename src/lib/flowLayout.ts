import type { FlowEdge, FlowModel, FlowNode, FlowView } from './flowModel';

export const NODE_W = 176;
export const NODE_H = 60;
export const DECISION_H = 84;
const LANE_LABEL_W = 150;
const PAD = 28;

export interface PNode extends FlowNode {
  /** Centre of the node. */
  x: number;
  y: number;
  w: number;
  h: number;
  rank: number;
}

export interface PEdge extends FlowEdge {
  d: string;
  lx: number;
  ly: number;
  /** Edge that points backwards in the flow (a loop); drawn as a curve. */
  back: boolean;
}

export interface PLane {
  name: string;
  y: number;
  h: number;
}

export interface FlowLayout {
  width: number;
  height: number;
  nodes: PNode[];
  edges: PEdge[];
  lanes: PLane[];
  laneLabelW: number;
}

const heightOf = (n: FlowNode) => (n.kind === 'decision' ? DECISION_H : NODE_H);

/** Splits text into at most `maxLines` lines of roughly `maxChars` characters. */
export function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const candidate = cur ? `${cur} ${w}` : w;
    if (candidate.length <= maxChars) cur = candidate;
    else {
      if (cur) lines.push(cur);
      cur = w.length > maxChars ? `${w.slice(0, maxChars - 1)}…` : w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    const last = kept[maxLines - 1];
    kept[maxLines - 1] = `${last.length > maxChars - 1 ? last.slice(0, maxChars - 1) : last}…`;
    return kept;
  }
  return lines.length > 0 ? lines : [''];
}

/** Longest-path layering. Edges that would close a loop are set aside so the rest stays a clean DAG. */
function computeRanks(nodes: FlowNode[], edges: FlowEdge[]): { rank: Map<string, number>; back: Set<string> } {
  const out = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  const indegree = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  for (const e of edges) {
    if (e.from === e.to || !out.has(e.from) || !out.has(e.to)) continue;
    out.get(e.from)!.push(e.to);
    indegree.set(e.to, (indegree.get(e.to) ?? 0) + 1);
  }

  const color = new Map<string, number>();
  const finished: string[] = [];
  const back = new Set<string>();
  const visit = (u: string) => {
    color.set(u, 1);
    for (const v of out.get(u) ?? []) {
      const c = color.get(v) ?? 0;
      if (c === 1) back.add(`${u}>${v}`);
      else if (c === 0) visit(v);
    }
    color.set(u, 2);
    finished.push(u);
  };
  const roots = nodes.filter((n) => (indegree.get(n.id) ?? 0) === 0).map((n) => n.id);
  for (const id of [...roots, ...nodes.map((n) => n.id)]) if (!color.get(id)) visit(id);

  const rank = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  for (const u of [...finished].reverse()) {
    for (const v of out.get(u) ?? []) {
      if (back.has(`${u}>${v}`)) continue;
      rank.set(v, Math.max(rank.get(v) ?? 0, (rank.get(u) ?? 0) + 1));
    }
  }
  return { rank, back };
}

export function layoutFlow(model: FlowModel, view: FlowView): FlowLayout {
  const { rank, back } = computeRanks(model.nodes, model.edges);
  const maxRank = Math.max(0, ...rank.values());
  const placed = new Map<string, PNode>();
  let lanes: PLane[] = [];
  let width = 0;
  let height = 0;
  let laneLabelW = 0;

  if (view === 'swimlane') {
    laneLabelW = LANE_LABEL_W;
    const laneNames = model.lanes.filter((l) => model.nodes.some((n) => n.lane === l));
    const colW = NODE_W + 64;
    const groups = new Map<string, FlowNode[]>();
    for (const n of model.nodes) {
      const key = `${n.lane}|${rank.get(n.id) ?? 0}`;
      groups.set(key, [...(groups.get(key) ?? []), n]);
    }
    let top = 0;
    lanes = laneNames.map((name) => {
      let stack = 1;
      let tallest = NODE_H;
      for (let r = 0; r <= maxRank; r++) {
        const g = groups.get(`${name}|${r}`);
        if (!g) continue;
        stack = Math.max(stack, g.length);
        tallest = Math.max(tallest, ...g.map(heightOf));
      }
      const h = Math.max(104, stack * (tallest + 18) + 18);
      const lane = { name, y: top, h };
      top += h;
      return lane;
    });
    for (const lane of lanes) {
      for (let r = 0; r <= maxRank; r++) {
        const g = groups.get(`${lane.name}|${r}`);
        if (!g) continue;
        g.forEach((n, i) => {
          placed.set(n.id, {
            ...n,
            w: NODE_W,
            h: heightOf(n),
            rank: r,
            x: laneLabelW + PAD + NODE_W / 2 + r * colW,
            y: lane.y + (lane.h * (i + 0.5)) / g.length,
          });
        });
      }
    }
    width = laneLabelW + PAD * 2 + NODE_W + maxRank * colW;
    height = top;
  } else {
    const rowH = DECISION_H + 46;
    const gapX = 40;
    const byRank: FlowNode[][] = Array.from({ length: maxRank + 1 }, () => []);
    for (const n of model.nodes) byRank[rank.get(n.id) ?? 0].push(n);
    const widest = Math.max(1, ...byRank.map((g) => g.length));
    width = PAD * 2 + widest * NODE_W + (widest - 1) * gapX;
    height = PAD * 2 + DECISION_H + maxRank * rowH;

    const preds = new Map<string, string[]>();
    for (const e of model.edges) {
      if (back.has(`${e.from}>${e.to}`) || e.from === e.to) continue;
      preds.set(e.to, [...(preds.get(e.to) ?? []), e.from]);
    }
    byRank.forEach((group, r) => {
      // Order by the average position of what feeds each node, which keeps most edges from crossing.
      const order = group
        .map((n, i) => {
          const xs = (preds.get(n.id) ?? []).map((p) => placed.get(p)?.x).filter((v): v is number => v !== undefined);
          return { n, key: xs.length ? xs.reduce((a, c) => a + c, 0) / xs.length : i * 1000 };
        })
        .sort((a, c) => a.key - c.key)
        .map((o) => o.n);
      const total = order.length * NODE_W + (order.length - 1) * gapX;
      const startX = (width - total) / 2 + NODE_W / 2;
      order.forEach((n, i) => {
        placed.set(n.id, { ...n, w: NODE_W, h: heightOf(n), rank: r, x: startX + i * (NODE_W + gapX), y: PAD + DECISION_H / 2 + r * rowH });
      });
    });
  }

  const edges: PEdge[] = [];
  for (const e of model.edges) {
    const a = placed.get(e.from);
    const b = placed.get(e.to);
    if (!a || !b || a === b) continue;
    const isBack = back.has(`${e.from}>${e.to}`);
    let d: string;
    let lx: number;
    let ly: number;
    if (view === 'swimlane') {
      const x1 = a.x + a.w / 2;
      const y1 = a.y;
      const x2 = b.x - b.w / 2;
      const y2 = b.y;
      if (isBack || x2 <= x1) {
        d = `M ${x1} ${y1} C ${x1 + 56} ${y1 - 56}, ${x2 - 56} ${y2 - 56}, ${x2} ${y2}`;
        lx = (x1 + x2) / 2;
        ly = Math.min(y1, y2) - 36;
      } else {
        d = `M ${x1} ${y1} H ${x1 + 22} V ${y2} H ${x2}`;
        lx = x1 + 26;
        ly = y1 === y2 ? y1 - 8 : (y1 + y2) / 2;
      }
    } else {
      const x1 = a.x;
      const y1 = a.y + a.h / 2;
      const x2 = b.x;
      const y2 = b.y - b.h / 2;
      if (isBack || y2 <= y1) {
        const sx = a.x + a.w / 2;
        const tx = b.x + b.w / 2;
        d = `M ${sx} ${a.y} C ${sx + 70} ${a.y}, ${tx + 70} ${b.y}, ${tx} ${b.y}`;
        lx = Math.max(sx, tx) + 40;
        ly = (a.y + b.y) / 2;
      } else {
        const ym = y2 - 24;
        d = `M ${x1} ${y1} V ${ym} H ${x2} V ${y2}`;
        lx = x1 === x2 ? x1 + 6 : (x1 + x2) / 2;
        ly = ym - 6;
      }
    }
    edges.push({ ...e, d, lx, ly, back: isBack });
  }

  return { width, height, nodes: [...placed.values()], edges, lanes, laneLabelW };
}
