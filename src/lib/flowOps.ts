import type { FlowEdge, FlowKind, FlowModel, FlowNode } from './flowModel';

/**
 * Delta editing for flows. The model returns a handful of operations instead of a whole diagram,
 * which keeps both prompt and answer small, and the operations are applied here deterministically.
 */

export type FlowOp =
  | { op: 'addNode'; id: string; label: string; kind: FlowKind; lane: string }
  | { op: 'updateNode'; id: string; label?: string; kind?: FlowKind; lane?: string }
  | { op: 'removeNode'; id: string }
  | { op: 'addEdge'; from: string; to: string; label?: string }
  | { op: 'removeEdge'; from: string; to: string };

const KINDS: FlowKind[] = ['start', 'end', 'step', 'decision', 'data'];
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const kindOf = (v: unknown): FlowKind | undefined => (KINDS.includes(v as FlowKind) ? (v as FlowKind) : undefined);

/** Sanitises the model's answer into well-formed operations; unknown or malformed entries are dropped. */
export function normalizeOps(raw: unknown): FlowOp[] {
  if (!Array.isArray(raw)) return [];
  const ops: FlowOp[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const id = str(o.id);
    switch (o.op) {
      case 'addNode':
        if (id && str(o.label)) ops.push({ op: 'addNode', id, label: str(o.label).slice(0, 80), kind: kindOf(o.kind) ?? 'step', lane: str(o.lane) });
        break;
      case 'updateNode':
        if (id) ops.push({ op: 'updateNode', id, label: str(o.label).slice(0, 80) || undefined, kind: kindOf(o.kind), lane: str(o.lane) || undefined });
        break;
      case 'removeNode':
        if (id) ops.push({ op: 'removeNode', id });
        break;
      case 'addEdge':
        if (str(o.from) && str(o.to)) ops.push({ op: 'addEdge', from: str(o.from), to: str(o.to), label: str(o.label).slice(0, 60) || undefined });
        break;
      case 'removeEdge':
        if (str(o.from) && str(o.to)) ops.push({ op: 'removeEdge', from: str(o.from), to: str(o.to) });
        break;
    }
  }
  return ops;
}

export interface ApplyResult {
  model: FlowModel;
  applied: number;
  skipped: string[];
}

/** Applies operations to a copy of the model. Operations that reference missing ids are skipped and reported. */
export function applyFlowOps(model: FlowModel, ops: FlowOp[]): ApplyResult {
  const nodes: FlowNode[] = model.nodes.map((n) => ({ ...n }));
  let edges: FlowEdge[] = model.edges.map((e) => ({ ...e }));
  const lanes = [...model.lanes];
  const skipped: string[] = [];
  let applied = 0;
  const find = (id: string) => nodes.find((n) => n.id === id);
  const laneOf = (lane: string) => {
    const name = lane || lanes[0] || 'Process';
    if (!lanes.includes(name)) lanes.push(name);
    return name;
  };

  for (const op of ops) {
    switch (op.op) {
      case 'addNode': {
        if (find(op.id)) { skipped.push(`addNode ${op.id}: id already exists`); break; }
        nodes.push({ id: op.id, label: op.label, kind: op.kind, lane: laneOf(op.lane) });
        applied++;
        break;
      }
      case 'updateNode': {
        const n = find(op.id);
        if (!n) { skipped.push(`updateNode ${op.id}: not found`); break; }
        if (op.label) n.label = op.label;
        if (op.kind) n.kind = op.kind;
        if (op.lane) n.lane = laneOf(op.lane);
        applied++;
        break;
      }
      case 'removeNode': {
        const i = nodes.findIndex((n) => n.id === op.id);
        if (i < 0) { skipped.push(`removeNode ${op.id}: not found`); break; }
        // Heal the gap: connect every predecessor to every successor so the flow stays continuous.
        const ins = edges.filter((e) => e.to === op.id);
        const outs = edges.filter((e) => e.from === op.id);
        nodes.splice(i, 1);
        edges = edges.filter((e) => e.from !== op.id && e.to !== op.id);
        if (ins.length === 1 || outs.length === 1) {
          for (const a of ins) for (const b of outs) {
            if (a.from !== b.to && !edges.some((e) => e.from === a.from && e.to === b.to)) edges.push({ from: a.from, to: b.to, label: a.label ?? b.label });
          }
        }
        applied++;
        break;
      }
      case 'addEdge': {
        if (!find(op.from) || !find(op.to)) { skipped.push(`addEdge ${op.from}>${op.to}: unknown node`); break; }
        if (edges.some((e) => e.from === op.from && e.to === op.to)) { skipped.push(`addEdge ${op.from}>${op.to}: already exists`); break; }
        edges.push({ from: op.from, to: op.to, label: op.label });
        applied++;
        break;
      }
      case 'removeEdge': {
        const before = edges.length;
        edges = edges.filter((e) => !(e.from === op.from && e.to === op.to));
        if (edges.length === before) skipped.push(`removeEdge ${op.from}>${op.to}: not found`);
        else applied++;
        break;
      }
    }
  }
  const used = new Set(nodes.map((n) => n.lane));
  return { model: { ...model, lanes: lanes.filter((l) => used.has(l)), nodes, edges }, applied, skipped };
}

/** One short line per node and edge. This is what goes into prompts instead of full Mermaid or JSON. */
export function flowToCompact(model: FlowModel): string {
  const nodes = model.nodes.map((n) => `${n.id}|${n.kind}|${n.lane}|${n.label}`);
  const edges = model.edges.map((e) => `${e.from}>${e.to}${e.label ? `|${e.label}` : ''}`);
  return `NODES\n${nodes.join('\n')}\nEDGES\n${edges.join('\n')}`;
}

/** Response schema for the flow editor (Gemini schema subset). */
export const FLOW_OPS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    ops: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          op: { type: 'STRING', enum: ['addNode', 'updateNode', 'removeNode', 'addEdge', 'removeEdge'] },
          id: { type: 'STRING' },
          label: { type: 'STRING' },
          kind: { type: 'STRING', enum: KINDS },
          lane: { type: 'STRING' },
          from: { type: 'STRING' },
          to: { type: 'STRING' },
        },
        required: ['op'],
      },
    },
    note: { type: 'STRING' },
  },
  required: ['ops'],
};
