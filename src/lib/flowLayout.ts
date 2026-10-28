import { DIAGRAM_LABEL, EDGE_MEANING, type DiagramType, type EdgeType, type FlowEdge, type FlowModel, type FlowNode, type FlowView, type NodeRole } from './flowModel';

export const NODE_W = 176;
export const NODE_H = 60;
export const DECISION_H = 84;
const LANE_LABEL_W = 168;
const PAD = 28;
/** Space between two node columns. Typed diagrams carry labelled arrows, so they get more room. */
const GUTTER = 150;
const LEGACY_GUTTER = 64;
/** Strip at the top and bottom of every typed lane where long connectors run, so they never cross a node. */
const TRACK_BAND = 26;
const TRACK_STEP = 5;
const HEADER_H = 64;

type Pt = [number, number];

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
  /** Edge that points backwards in the flow (a loop). */
  back: boolean;
  /** The connector as a polyline, which is what `d` draws. Kept so tests and exports can reason about it. */
  points: Pt[];
}

export interface PLane {
  name: string;
  y: number;
  h: number;
}

export interface LegendItem {
  kind: 'edge' | 'node';
  key: string;
  label: string;
  meaning: string;
}

export interface FlowLayout {
  width: number;
  height: number;
  nodes: PNode[];
  edges: PEdge[];
  lanes: PLane[];
  laneLabelW: number;
  /** Present for typed module diagrams: the title band, the legend and the gaps-and-uncertainties note. */
  header?: { title: string; subtitle: string; diagram: DiagramType; h: number };
  legend?: { items: LegendItem[]; y: number; h: number; columns: number };
  notes?: { lines: string[]; y: number; h: number; more: number };
}

const heightOf = (n: FlowNode) => (n.kind === 'decision' ? DECISION_H : n.role === 'application' ? 88 : n.sub ? 72 : NODE_H);

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

/** Connection types that say "this comes before that". Associations never move a node. */
const ORDERING = new Set<EdgeType>(['sequence', 'branch', 'handoff', 'dataflow', 'contains']);
const orders = (e: FlowEdge) => !e.type || ORDERING.has(e.type);

/** Longest-path layering over ordering connections only. Edges that would close a loop are set aside so the rest stays a clean DAG. */
function computeRanks(nodes: FlowNode[], allEdges: FlowEdge[]): { rank: Map<string, number>; back: Set<string> } {
  const edges = allEdges.filter(orders);
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

const poly = (pts: Pt[]) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${Math.round(p[0] * 10) / 10} ${Math.round(p[1] * 10) / 10}`).join(' ');

interface Box { x1: number; y1: number; x2: number; y2: number }
const nodeBox = (n: PNode, m = 0): Box => ({ x1: n.x - n.w / 2 - m, y1: n.y - n.h / 2 - m, x2: n.x + n.w / 2 + m, y2: n.y + n.h / 2 + m });
const overlap = (a: Box, b: Box) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;

/** Nudges edge labels off the other labels and off nodes, a few tries each, so text stays readable. */
function placeLabels(edges: PEdge[], nodes: PNode[]): void {
  const placed: Box[] = [];
  for (const e of edges) {
    if (!e.label) continue;
    const lines = wrapText(`${e.uncertain ? '? ' : ''}${e.label}`, 20, 3);
    const w = Math.max(...lines.map((l) => l.length)) * 6.3 + 10;
    const h = lines.length * 13 + 4;
    // Try the natural spot, then up and down, then sideways along the connector's own gutter.
    const tries: Array<[number, number]> = [[0, 0]];
    for (let k = 1; k <= 4; k++) tries.push([0, -k * (h + 2)], [0, k * (h + 2)]);
    for (const dx of [-60, 60, -110, 110]) for (const dy of [0, -(h + 2), h + 2]) tries.push([dx, dy]);
    let done = false;
    for (const [dx, dy] of tries) {
      const box = { x1: e.lx + dx - w / 2, y1: e.ly + dy - h / 2, x2: e.lx + dx + w / 2, y2: e.ly + dy + h / 2 };
      if (!placed.some((p) => overlap(p, box)) && !nodes.some((n) => overlap(nodeBox(n, 2), box))) { e.lx += dx; e.ly += dy; placed.push(box); done = true; break; }
    }
    if (!done) placed.push({ x1: e.lx - w / 2, y1: e.ly - h / 2, x2: e.lx + w / 2, y2: e.ly + h / 2 });
  }
}

function legendFor(model: FlowModel, edges: FlowEdge[], nodes: FlowNode[]): LegendItem[] {
  const items: LegendItem[] = [];
  const used = new Set(edges.map((e) => e.type).filter((t): t is EdgeType => !!t));
  (['sequence', 'branch', 'handoff', 'dataflow', 'depends', 'related', 'contains'] as EdgeType[]).filter((t) => used.has(t)).forEach((t) => items.push({ kind: 'edge', key: t, label: EDGE_MEANING[t].label, meaning: EDGE_MEANING[t].meaning }));
  if (edges.some((e) => e.uncertain)) items.push({ kind: 'edge', key: 'uncertain', label: 'Unconfirmed', meaning: 'Named in the documentation but not settled by it' });
  const roles = new Set<NodeRole | 'decision' | 'flagged'>();
  for (const n of nodes) {
    if (n.kind === 'decision') roles.add('decision');
    if (n.role) roles.add(n.role);
    if (n.flags?.length) roles.add('flagged');
  }
  const names: Record<string, [string, string]> = {
    screen: ['Screen', 'A screen of this module'],
    function: ['Function', 'A step someone performs'],
    unordered: ['Order not documented', 'Function whose place in the sequence is not stated'],
    decision: ['Decision', 'Alternative outcomes; only one is taken'],
    application: ['Application', 'A system in the catalogue'],
    external: ['External system or actor', 'Named in the documentation, not in the catalogue'],
    boundary: ['Boundary', 'Another module or application; not expanded here'],
    flagged: ['? badge', 'Something about this node is not documented'],
  };
  for (const k of ['screen', 'function', 'unordered', 'decision', 'application', 'external', 'boundary', 'flagged']) if (roles.has(k as never)) items.push({ kind: 'node', key: k, label: names[k][0], meaning: names[k][1] });
  void model;
  return items;
}

export function layoutFlow(model: FlowModel, view: FlowView): FlowLayout {
  const typed = !!model.diagram && model.diagram !== 'flow';
  const { rank, back } = computeRanks(model.nodes, model.edges);
  const maxRank = Math.max(0, ...rank.values());
  const placed = new Map<string, PNode>();
  const top0 = typed ? HEADER_H : 0;
  let lanes: PLane[] = [];
  let width = 0;
  let height = 0;
  let laneLabelW = 0;
  const edges: PEdge[] = [];

  if (view === 'swimlane') {
    laneLabelW = LANE_LABEL_W;
    const laneNames = model.lanes.filter((l) => model.nodes.some((n) => n.lane === l));
    const gutter = typed ? GUTTER : LEGACY_GUTTER;
    const colW = NODE_W + gutter;
    const band = typed ? TRACK_BAND : 0;
    const groups = new Map<string, FlowNode[]>();
    for (const n of model.nodes) {
      const key = `${n.lane}|${rank.get(n.id) ?? 0}`;
      groups.set(key, [...(groups.get(key) ?? []), n]);
    }
    let top = top0;
    lanes = laneNames.map((name) => {
      let need = NODE_H;
      for (let r = 0; r <= maxRank; r++) {
        const g = groups.get(`${name}|${r}`);
        if (!g) continue;
        need = Math.max(need, g.reduce((s, n) => s + heightOf(n), 0) + (g.length - 1) * 18);
      }
      const h = Math.max(104, need + 36 + band * 2);
      const lane = { name, y: top, h };
      top += h;
      return lane;
    });
    const laneIndex = new Map(lanes.map((l, i) => [l.name, i]));
    for (const lane of lanes) {
      const avail = lane.h - band * 2;
      for (let r = 0; r <= maxRank; r++) {
        const g = groups.get(`${lane.name}|${r}`);
        if (!g) continue;
        const total = g.reduce((s, n) => s + heightOf(n), 0);
        const gap = (avail - total) / (g.length + 1);
        let cursor = lane.y + band + gap;
        g.forEach((n) => {
          const h = heightOf(n);
          placed.set(n.id, { ...n, w: NODE_W, h, rank: r, x: laneLabelW + PAD + NODE_W / 2 + r * colW, y: cursor + h / 2 });
          cursor += h + gap;
        });
      }
    }
    width = laneLabelW + PAD * 2 + NODE_W + maxRank * colW;
    height = top;

    const slots = new Map<string, number>();
    const nextSlot = (key: string) => { const n = slots.get(key) ?? 0; slots.set(key, n + 1); return n % 4; };
    const gutterUse = new Map<number, number>();
    for (const e of model.edges) {
      const a = placed.get(e.from);
      const b = placed.get(e.to);
      if (!a || !b || a === b) continue;
      const isBack = back.has(`${e.from}>${e.to}`);
      let pts: Pt[];
      let lx: number;
      let ly: number;
      if (!typed) {
        // Older flows keep their original connector shapes.
        const x1 = a.x + a.w / 2;
        const y1 = a.y;
        const x2 = b.x - b.w / 2;
        const y2 = b.y;
        if (isBack || x2 <= x1) {
          edges.push({ ...e, d: `M ${x1} ${y1} C ${x1 + 56} ${y1 - 56}, ${x2 - 56} ${y2 - 56}, ${x2} ${y2}`, lx: (x1 + x2) / 2, ly: Math.min(y1, y2) - 36, back: isBack, points: [[x1, y1], [x2, y2]] });
          continue;
        }
        pts = [[x1, y1], [x1 + 22, y1], [x1 + 22, y2], [x2, y2]];
        lx = x1 + 26;
        ly = y1 === y2 ? y1 - 8 : (y1 + y2) / 2;
        edges.push({ ...e, d: `M ${x1} ${y1} H ${x1 + 22} V ${y2} H ${x2}`, lx, ly, back: isBack, points: pts });
        continue;
      }
      const sx = a.x + a.w / 2;
      const tx = b.x - b.w / 2;
      const la = lanes[laneIndex.get(a.lane) ?? 0];
      const lb = lanes[laneIndex.get(b.lane) ?? 0];
      const ra = a.rank;
      const rb = b.rank;
      if (!isBack && rb === ra + 1) {
        const k = gutterUse.get(ra) ?? 0;
        gutterUse.set(ra, k + 1);
        const gx = sx + gutter / 2 + (((k % 5) - 2) * 7);
        pts = a.y === b.y ? [[sx, a.y], [tx, b.y]] : [[sx, a.y], [gx, a.y], [gx, b.y], [tx, b.y]];
        lx = a.y === b.y ? (sx + tx) / 2 : gx;
        ly = a.y === b.y ? a.y - 12 : (a.y + b.y) / 2;
      } else if (ra === rb && !isBack) {
        // Same column (stacked): a short vertical run down the column's centre line.
        const down = b.y > a.y;
        pts = [[a.x, down ? a.y + a.h / 2 : a.y - a.h / 2], [b.x, down ? b.y - b.h / 2 : b.y + b.h / 2]];
        lx = a.x + 8;
        ly = (a.y + b.y) / 2;
      } else {
        // Long or backward connector: leave through the gutter, travel along a free track at the edge of a lane, come in through the gutter.
        const slot = nextSlot(`${isBack ? laneIndex.get(a.lane) : laneIndex.get(b.lane)}:${isBack || (laneIndex.get(b.lane) ?? 0) < (laneIndex.get(a.lane) ?? 0) ? 'bot' : 'top'}`);
        const lowerSide = isBack || (laneIndex.get(b.lane) ?? 0) < (laneIndex.get(a.lane) ?? 0);
        const laneForTrack = isBack ? la : lb;
        const track = lowerSide ? laneForTrack.y + laneForTrack.h - 8 - slot * TRACK_STEP : laneForTrack.y + 8 + slot * TRACK_STEP;
        const gx1 = sx + 16 + slot * 5;
        const gx2 = tx - 16 - slot * 5;
        pts = [[sx, a.y], [gx1, a.y], [gx1, track], [gx2, track], [gx2, b.y], [tx, b.y]];
        lx = (gx1 + gx2) / 2;
        ly = track - 8;
      }
      edges.push({ ...e, d: poly(pts), lx, ly, back: isBack, points: pts });
    }
  } else {
    const rowH = DECISION_H + 56;
    const gapX = 40;
    const margin = typed ? 44 : 0;
    const byRank: FlowNode[][] = Array.from({ length: maxRank + 1 }, () => []);
    for (const n of model.nodes) byRank[rank.get(n.id) ?? 0].push(n);
    const widest = Math.max(1, ...byRank.map((g) => g.length));
    width = PAD * 2 + margin * 2 + widest * NODE_W + (widest - 1) * gapX;
    height = top0 + PAD * 2 + DECISION_H + maxRank * rowH;

    const preds = new Map<string, string[]>();
    for (const e of model.edges) {
      if (!orders(e) || back.has(`${e.from}>${e.to}`) || e.from === e.to) continue;
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
        placed.set(n.id, { ...n, w: NODE_W, h: heightOf(n), rank: r, x: startX + i * (NODE_W + gapX), y: top0 + PAD + DECISION_H / 2 + r * rowH });
      });
    });

    // Parallel connectors between the same two nodes are fanned out so each stays visible.
    const pairCount = new Map<string, number>();
    const pairSeen = new Map<string, number>();
    const pairKey = (e: FlowEdge) => [e.from, e.to].sort().join('|');
    for (const e of model.edges) pairCount.set(pairKey(e), (pairCount.get(pairKey(e)) ?? 0) + 1);
    let leftSlot = 0;
    let rightSlot = 0;
    // Connectors leaving the same node (or arriving at the same node) are spread across its edge so they do not share one trunk.
    const outs = new Map<string, FlowEdge[]>();
    const ins = new Map<string, FlowEdge[]>();
    for (const e of model.edges) {
      outs.set(e.from, [...(outs.get(e.from) ?? []), e]);
      ins.set(e.to, [...(ins.get(e.to) ?? []), e]);
    }
    const spread = (list: FlowEdge[] | undefined, e: FlowEdge, pick: (x: FlowEdge) => PNode | undefined) => {
      const sorted = [...(list ?? [])].sort((p, q) => (pick(p)?.x ?? 0) - (pick(q)?.x ?? 0));
      return (sorted.indexOf(e) - (sorted.length - 1) / 2) * Math.min(26, (NODE_W - 36) / Math.max(1, sorted.length - 1));
    };
    for (const e of model.edges) {
      const a = placed.get(e.from);
      const b = placed.get(e.to);
      if (!a || !b || a === b) continue;
      const isBack = back.has(`${e.from}>${e.to}`);
      const n = pairCount.get(pairKey(e)) ?? 1;
      const k = pairSeen.get(pairKey(e)) ?? 0;
      pairSeen.set(pairKey(e), k + 1);
      const off = typed ? (k - (n - 1) / 2) * 20 : 0;
      const offA = typed ? off + spread(outs.get(e.from), e, (x) => placed.get(x.to)) : 0;
      const offB = typed ? off + spread(ins.get(e.to), e, (x) => placed.get(x.from)) : 0;
      let pts: Pt[];
      let lx: number;
      let ly: number;
      if (!typed) {
        const x1 = a.x;
        const y1 = a.y + a.h / 2;
        const x2 = b.x;
        const y2 = b.y - b.h / 2;
        if (isBack || y2 <= y1) {
          const sx = a.x + a.w / 2;
          const tx = b.x + b.w / 2;
          edges.push({ ...e, d: `M ${sx} ${a.y} C ${sx + 70} ${a.y}, ${tx + 70} ${b.y}, ${tx} ${b.y}`, lx: Math.max(sx, tx) + 40, ly: (a.y + b.y) / 2, back: isBack, points: [[sx, a.y], [tx, b.y]] });
        } else {
          const ym = y2 - 24;
          edges.push({ ...e, d: `M ${x1} ${y1} V ${ym} H ${x2} V ${y2}`, lx: x1 === x2 ? x1 + 6 : (x1 + x2) / 2, ly: ym - 6, back: isBack, points: [[x1, y1], [x1, ym], [x2, ym], [x2, y2]] });
        }
        continue;
      }
      if (!isBack && b.rank === a.rank + 1) {
        const x1 = a.x + offA;
        const x2 = b.x + offB;
        const y1 = a.y + a.h / 2;
        const y2 = b.y - b.h / 2;
        const ym = y2 - 22 - ((outs.get(e.from) ?? []).indexOf(e) % 4) * 7;
        pts = x1 === x2 ? [[x1, y1], [x2, y2]] : [[x1, y1], [x1, ym], [x2, ym], [x2, y2]];
        lx = (x1 + x2) / 2 + (x1 === x2 ? 0 : 0);
        ly = x1 === x2 ? (y1 + y2) / 2 : ym - 7;
      } else if (!isBack) {
        // Skips rows: run down the left margin so the connector never crosses a node in between.
        const mx = 18 + (leftSlot++ % 5) * 7;
        const y1 = a.y + a.h / 2;
        const y2 = b.y - b.h / 2;
        pts = [[a.x + offA, y1], [a.x + offA, y1 + 14], [mx, y1 + 14], [mx, y2 - 14], [b.x + offB, y2 - 14], [b.x + offB, y2]];
        lx = mx + 4;
        ly = (y1 + y2) / 2;
      } else {
        // Backward connector: out through the gap above its own row, along the right margin, in through the gap above the target's row.
        const mx = width - 18 - (rightSlot++ % 5) * 7;
        const ca = a.y - a.h / 2 - 12 - (rightSlot % 3) * 5;
        const cb = b.y - b.h / 2 - 12 - (rightSlot % 3) * 5;
        pts = [[a.x + offA, a.y - a.h / 2], [a.x + offA, ca], [mx, ca], [mx, cb], [b.x + offB, cb], [b.x + offB, b.y - b.h / 2]];
        lx = mx - 4;
        ly = (ca + cb) / 2;
      }
      edges.push({ ...e, d: poly(pts), lx, ly, back: isBack, points: pts });
    }
  }

  const nodes = [...placed.values()];
  if (typed) placeLabels(edges, nodes);

  const layout: FlowLayout = { width, height, nodes, edges, lanes, laneLabelW };
  if (!typed) return layout;

  // Title band above, legend and gaps-and-uncertainties note below.
  const items = legendFor(model, model.edges, model.nodes);
  const minW = 920;
  const w = Math.max(width, minW);
  const columns = Math.max(1, Math.min(3, Math.floor((w - PAD) / 440)));
  const legendRows = Math.ceil(items.length / columns);
  const legendH = items.length ? 34 + legendRows * 24 : 0;
  const warn = model.warnings ?? [];
  const maxChars = Math.max(60, Math.floor((w - PAD * 2) / 6.4));
  const wrapped = warn.flatMap((t) => wrapText(`• ${t}`, maxChars, 3));
  const maxLines = 14;
  const lines = wrapped.slice(0, maxLines);
  const more = Math.max(0, warn.length - lines.filter((l) => l.startsWith('• ')).length);
  const notesH = warn.length ? 38 + lines.length * 15 + (more ? 16 : 0) : 0;
  const legendY = height + 12;
  const notesY = legendY + legendH + (legendH ? 6 : 0);
  layout.width = w;
  layout.height = notesY + notesH + 12;
  layout.header = { title: model.title, subtitle: model.subtitle, diagram: model.diagram!, h: HEADER_H };
  layout.legend = items.length ? { items, y: legendY, h: legendH, columns } : undefined;
  layout.notes = warn.length ? { lines, y: notesY, h: notesH, more } : undefined;
  return layout;
}

export { DIAGRAM_LABEL };
