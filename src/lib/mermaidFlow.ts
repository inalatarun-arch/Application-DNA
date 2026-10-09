import type { FlowEdge, FlowKind, FlowModel, FlowNode } from './flowModel';

/**
 * Small, forgiving Mermaid flowchart reader. It understands what the app and the prompts produce:
 * node shapes, labelled edges, chains, subgraphs (used as lanes) and comments. Anything else is skipped.
 * Dependency-free so the same reader serves AI output validation, editing and export.
 */

const DEFAULT_LANE = 'Process';

export interface MermaidIssue {
  level: 'error' | 'warning';
  message: string;
}

const SHAPES: Array<{ open: string; close: string; kind: FlowKind | 'round' }> = [
  { open: '([', close: '])', kind: 'round' },
  { open: '[(', close: ')]', kind: 'data' },
  { open: '[[', close: ']]', kind: 'step' },
  { open: '((', close: '))', kind: 'round' },
  { open: '{{', close: '}}', kind: 'decision' },
  { open: '[/', close: '/]', kind: 'data' },
  { open: '[\\', close: '\\]', kind: 'data' },
  { open: '{', close: '}', kind: 'decision' },
  { open: '[', close: ']', kind: 'step' },
  { open: '(', close: ')', kind: 'step' },
];

const unquote = (s: string) => s.trim().replace(/^"(.*)"$/s, '$1').replace(/^'(.*)'$/s, '$1').replace(/<br\s*\/?>/gi, ' ').trim();

interface RawNode {
  id: string;
  label?: string;
  kind?: FlowKind | 'round';
}

/** Reads `id`, `id["label"]`, `id{"label"}` ... at the start of `s`; returns the node and the remaining text. */
function readNode(s: string): { node: RawNode; rest: string } | null {
  const m = /^\s*([A-Za-z_][\w-]*)/.exec(s);
  if (!m) return null;
  const id = m[1];
  let rest = s.slice(m[0].length);
  for (const shape of SHAPES) {
    if (!rest.startsWith(shape.open)) continue;
    // Find the matching close, honouring quoted labels that may contain bracket characters.
    let i = shape.open.length;
    let quote = '';
    for (; i < rest.length; i++) {
      const c = rest[i];
      if (quote) {
        if (c === quote) quote = '';
      } else if (c === '"') quote = c;
      else if (rest.startsWith(shape.close, i)) break;
    }
    if (i >= rest.length) continue;
    const label = unquote(rest.slice(shape.open.length, i));
    rest = rest.slice(i + shape.close.length);
    return { node: { id, label, kind: shape.kind }, rest: rest.replace(/^:::\w+/, '') };
  }
  return { node: { id }, rest: rest.replace(/^:::\w+/, '') };
}

const ARROW = /^\s*(?:-\.+->|-\.->|==+>|--+>|--+o|--+x|~~~|---)/;
const LABELLED_PIPE = /^\|([^|]*)\|/;
const LABELLED_TEXT = /^\s*(--|==|-\.)\s*([^-=>.][^]*?)\s*(-->|==>|-\.->)/;

function readArrow(s: string): { dashed: boolean; label?: string; rest: string } | null {
  const text = LABELLED_TEXT.exec(s);
  if (text) {
    return { dashed: text[3] === '-.->', label: unquote(text[2]), rest: s.slice(text[0].length) };
  }
  const a = ARROW.exec(s);
  if (!a) return null;
  let rest = s.slice(a[0].length);
  let label: string | undefined;
  const p = LABELLED_PIPE.exec(rest.trimStart());
  if (p) {
    label = unquote(p[1]);
    rest = rest.trimStart().slice(p[0].length);
  }
  return { dashed: a[0].includes('.'), label, rest };
}

export function parseMermaidFlow(source: string, title = 'Process flow'): FlowModel {
  const nodes = new Map<string, FlowNode>();
  const edges: FlowEdge[] = [];
  const lanes: string[] = [];
  const laneStack: string[] = [];
  const touch = (raw: RawNode) => {
    const lane = laneStack[laneStack.length - 1] ?? DEFAULT_LANE;
    const existing = nodes.get(raw.id);
    if (existing) {
      if (raw.label) existing.label = raw.label;
      if (raw.kind && raw.kind !== 'round') existing.kind = raw.kind;
      else if (raw.kind === 'round' && existing.kind === 'step') existing.kind = 'start';
      if (laneStack.length && existing.lane === DEFAULT_LANE) existing.lane = lane;
      return;
    }
    const kind: FlowKind = raw.kind === 'round' ? 'start' : raw.kind ?? 'step';
    nodes.set(raw.id, { id: raw.id, label: raw.label || raw.id, lane, kind });
    if (!lanes.includes(lane)) lanes.push(lane);
  };

  const lines = source
    .replace(/\r/g, '')
    .split(/\n|;(?=\s*(?:[A-Za-z_]|$))/)
    .map((l) => l.replace(/%%.*$/, '').trim())
    .filter(Boolean);

  let pendingArrow: { dashed: boolean; label?: string } | null = null;
  for (const line of lines) {
    if (/^(flowchart|graph)\b/i.test(line)) continue;
    if (/^(classDef|class|style|linkStyle|click|direction|accTitle|accDescr)\b/i.test(line)) continue;
    const sub = /^subgraph\s+(?:([\w-]+)\s*)?(?:\[\s*"?([^"\]]*)"?\s*\])?/i.exec(line);
    if (sub) {
      laneStack.push(unquote(sub[2] ?? sub[1] ?? 'Group') || 'Group');
      continue;
    }
    if (/^end$/i.test(line)) {
      laneStack.pop();
      continue;
    }
    let rest = line;
    let prev: string[] = [];
    for (let guard = 0; guard < 50 && rest.trim(); guard++) {
      const group: RawNode[] = [];
      for (;;) {
        const r = readNode(rest);
        if (!r) break;
        group.push(r.node);
        rest = r.rest;
        if (/^\s*&/.test(rest)) rest = rest.replace(/^\s*&/, '');
        else break;
      }
      if (!group.length) break;
      group.forEach(touch);
      for (const p of prev) {
        for (const g of group) {
          const pending = pendingArrow;
          if (pending) edges.push({ from: p, to: g.id, label: pending.label || undefined, dashed: pending.dashed || undefined });
        }
      }
      const arrow = readArrow(rest);
      if (!arrow) break;
      pendingArrow = { dashed: arrow.dashed, label: arrow.label };
      prev = group.map((g) => g.id);
      rest = arrow.rest;
    }
    pendingArrow = null;
  }

  // Terminal heuristics: a round node with no incoming edges starts; one with no outgoing ends.
  const hasIn = new Set(edges.map((e) => e.to));
  const hasOut = new Set(edges.map((e) => e.from));
  for (const n of nodes.values()) {
    if (n.kind === 'start' && hasIn.has(n.id) && !hasOut.has(n.id)) n.kind = 'end';
    else if (n.kind === 'start' && hasIn.has(n.id)) n.kind = 'step';
  }
  return {
    title,
    subtitle: '',
    lanes: lanes.length ? lanes : [DEFAULT_LANE],
    nodes: [...nodes.values()],
    edges: edges.filter((e) => nodes.has(e.from) && nodes.has(e.to)),
  };
}

/** Checks AI-produced Mermaid for the things that make it fail to render or lose meaning. */
export function validateMermaid(source: string): MermaidIssue[] {
  const issues: MermaidIssue[] = [];
  const text = source.trim();
  if (!text) return [{ level: 'error', message: 'Diagram is empty.' }];
  if (/^```/.test(text)) issues.push({ level: 'error', message: 'Diagram is wrapped in a code fence.' });
  if (!/^\s*(flowchart|graph)\s+(TD|TB|LR|RL|BT)\b/im.test(text)) {
    issues.push({ level: 'error', message: 'First line must be "flowchart TD".' });
  }
  const quotes = (text.match(/"/g) ?? []).length;
  if (quotes % 2) issues.push({ level: 'error', message: 'Unbalanced double quotes.' });
  const model = parseMermaidFlow(text);
  if (model.nodes.length < 2) issues.push({ level: 'error', message: 'Fewer than two nodes were found.' });
  if (model.edges.length === 0) issues.push({ level: 'error', message: 'No connections were found.' });
  if (model.nodes.length > 40) issues.push({ level: 'warning', message: `Large diagram (${model.nodes.length} nodes).` });
  const ids = new Set(model.nodes.map((n) => n.id));
  const linked = new Set(model.edges.flatMap((e) => [e.from, e.to]));
  const orphans = [...ids].filter((id) => !linked.has(id));
  if (orphans.length && model.nodes.length > 1) issues.push({ level: 'warning', message: `Unconnected nodes: ${orphans.slice(0, 5).join(', ')}.` });
  for (const n of model.nodes.filter((x) => x.kind === 'decision')) {
    const out = model.edges.filter((e) => e.from === n.id);
    if (out.length > 1 && out.some((e) => !e.label)) issues.push({ level: 'warning', message: `Decision "${n.label}" has unlabelled branches.` });
  }
  return issues;
}

export const mermaidHasErrors = (issues: MermaidIssue[]) => issues.some((i) => i.level === 'error');

/** Last-resort tidy: removes fences and chatter, forces a header, strips characters that break parsing. */
export function sanitizeMermaid(source: string): string {
  let t = source.trim().replace(/^```(?:mermaid)?\s*/i, '').replace(/\s*```$/, '').trim();
  const start = t.search(/^\s*(flowchart|graph)\b/im);
  if (start > 0) t = t.slice(start);
  if (!/^\s*(flowchart|graph)\b/i.test(t)) t = `flowchart TD\n${t}`;
  return t.replace(/\(([^()\n"]*)\)(?=[^\n]*["\]])/g, '($1)');
}

const q = (s: string) => s.replace(/"/g, "'").replace(/[\r\n]+/g, ' ').trim();

/** Dependency-free Mermaid writer for a FlowModel (lanes become subgraphs when more than one). */
export function modelToMermaid(model: FlowModel, direction: 'TD' | 'LR' = 'TD'): string {
  const shape = (n: FlowNode) => {
    const t = q(n.label);
    if (n.kind === 'decision') return `${n.id}{"${t}"}`;
    if (n.kind === 'start' || n.kind === 'end') return `${n.id}(["${t}"])`;
    if (n.kind === 'data') return `${n.id}[("${t}")]`;
    return `${n.id}["${t}"]`;
  };
  const out = [`flowchart ${direction}`];
  if (model.lanes.length > 1) {
    model.lanes.forEach((lane, i) => {
      const inLane = model.nodes.filter((n) => n.lane === lane);
      if (!inLane.length) return;
      out.push(`  subgraph lane${i}["${q(lane)}"]`, ...inLane.map((n) => `    ${shape(n)}`), '  end');
    });
  } else {
    out.push(...model.nodes.map((n) => `  ${shape(n)}`));
  }
  for (const e of model.edges) {
    const arrow = e.dashed ? '-.->' : '-->';
    out.push(e.label ? `  ${e.from} ${arrow}|${q(e.label)}| ${e.to}` : `  ${e.from} ${arrow} ${e.to}`);
  }
  return out.join('\n');
}
