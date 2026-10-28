import type { Functionality, TechnicalComponent, TechnicalComponentKind } from '@/db/types';
import { KIND_META, describeComponent, layerOf, type Layer } from '@/config/technical';
import type { GraphSource } from './graphModel';

export type FlowKind = 'start' | 'end' | 'step' | 'decision' | 'data';

/**
 * Finer node meaning for the typed module diagrams. Older flows leave it unset and are drawn from `kind` alone, so
 * saved and AI-edited flows keep working.
 */
export type NodeRole = 'function' | 'screen' | 'application' | 'external' | 'boundary' | 'unordered';

/**
 * What a connection means. Only `sequence` and `branch` say "this happens after that"; `handoff` and `dataflow` say
 * work or data crosses a boundary; `depends` and `related` and `contains` are associations with no order at all.
 */
export type EdgeType = 'sequence' | 'branch' | 'handoff' | 'dataflow' | 'depends' | 'related' | 'contains';

/** Which of the three module views a model is. `flow` is an older, untyped flow. */
export type DiagramType = 'process' | 'relationships' | 'integration' | 'flow';

export const DIAGRAM_LABEL: Record<DiagramType, string> = {
  process: 'Business-process swimlane',
  relationships: 'Screen and function relationship map',
  integration: 'Cross-application integration map',
  flow: 'Process flow',
};

/** One-line meaning of every connection type, shown in the legend. */
export const EDGE_MEANING: Record<EdgeType, { label: string; meaning: string }> = {
  sequence: { label: 'Sequence', meaning: 'Next step in the documented order' },
  branch: { label: 'Conditional branch', meaning: 'One of several alternative outcomes' },
  handoff: { label: 'Handoff', meaning: 'Work or responsibility passes to another system or module' },
  dataflow: { label: 'Data flow', meaning: 'Data sent from a source to a destination' },
  depends: { label: 'Depends on', meaning: 'Relies on it; no execution order implied' },
  related: { label: 'Related to', meaning: 'Association only; no order or direction' },
  contains: { label: 'Contains', meaning: 'Screen and the functions on it' },
};

export interface FlowNode {
  id: string;
  label: string;
  detail?: string;
  /** Swimlane this step belongs to. */
  lane: string;
  kind: FlowKind;
  /** Page to open when the step is clicked. */
  to?: string;
  role?: NodeRole;
  /** Second, smaller line under the label (for example the screen a function sits on). */
  sub?: string;
  /** Plain-language notes about what the documentation does not settle for this node. Shown as a badge and a tooltip. */
  flags?: string[];
}

export interface FlowEdge {
  from: string;
  to: string;
  label?: string;
  dashed?: boolean;
  /** Meaning of the connection. Unset on older flows, which are drawn from `dashed` as before. */
  type?: EdgeType;
  /** The documentation names this connection but does not settle it (one-sided, unconfirmed order, no integration). */
  uncertain?: boolean;
  /** Where in the documentation the connection comes from, for the tooltip. */
  evidence?: string;
}

/** One cross-boundary transfer, listed beside the diagram with what the integration records say about it. */
export interface HandoffInfo {
  from: string;
  to: string;
  status: 'documented' | 'ambiguous' | 'missing' | 'reverse-only' | 'internal';
  integrations: Array<{ id: string; type: string; frequency: string; payload: string; authentication: string; errorHandling: string; owner: string }>;
  note: string;
}

export interface FlowModel {
  title: string;
  subtitle: string;
  lanes: string[];
  nodes: FlowNode[];
  edges: FlowEdge[];
  diagram?: DiagramType;
  /** Gaps and contradictions in the documentation that the diagram shows as uncertain instead of guessing. */
  warnings?: string[];
  handoffs?: HandoffInfo[];
}

export type FlowView = 'flowchart' | 'swimlane';

const EXTERNAL = 'External systems';
const LAYER_LANE: Record<Layer, string> = { code: 'Services & jobs', database: 'Database', integration: 'Integration & API' };
/** Infrastructure and containers describe where things run, not what happens, so they stay out of flows. */
const SKIPPED: TechnicalComponentKind[] = ['server', 'cloud', 'package'];
const VERB: Partial<Record<TechnicalComponentKind, string>> = {
  class: 'Run',
  method: 'Run',
  service: 'Call',
  job: 'Run job',
  middleware: 'Route via',
  rest: 'Call',
  soap: 'Call',
  api: 'Call',
  queue: 'Publish to',
  procedure: 'Execute',
  trigger: 'Fire',
  view: 'Read',
  table: 'Read / write',
};
const MAX_COMPONENTS = 14;

const clean = (xs: string[] | undefined) => (xs ?? []).map((x) => x.trim()).filter(Boolean);
const brief = (xs: string[], n: number) => xs.slice(0, n).join(', ') + (xs.length > n ? '…' : '');

class Builder {
  nodes: FlowNode[] = [];
  edges: FlowEdge[] = [];
  private n = 0;
  add(node: Omit<FlowNode, 'id'>): string {
    const id = `n${++this.n}`;
    this.nodes.push({ id, ...node });
    return id;
  }
  link(from: string, to: string, label?: string, dashed?: boolean): void {
    this.edges.push({ from, to, label, dashed });
  }
  lanes(order: string[]): string[] {
    const used = new Set(this.nodes.map((n) => n.lane));
    return order.filter((l) => used.has(l));
  }
}

/** Step-by-step user and system actions for one functionality, derived from what has been documented about it. */
export function buildFunctionalityFlow(fn: Functionality, src: GraphSource): FlowModel {
  const screen = src.screens.find((s) => s.id === fn.screenId);
  const app = src.applications.find((a) => a.id === fn.applicationId);
  const userLane = clean(fn.userRoles).join(' / ') || 'User';
  const appLane = app?.name ?? 'Application';
  const b = new Builder();

  // Entry
  const userStarts: string[] = [];
  const triggers = clean(fn.triggers).slice(0, 3);
  if (triggers.length === 0) userStarts.push(b.add({ label: `Start ${fn.name}`, lane: userLane, kind: 'start' }));
  else for (const t of triggers) userStarts.push(b.add({ label: t, lane: userLane, kind: 'start', detail: 'Business trigger' }));
  const externalStarts = clean(fn.upstreamSystems).slice(0, 3).map((u) => b.add({ label: `Data from ${u}`, lane: EXTERNAL, kind: 'start', detail: 'Upstream system' }));

  const inputs = clean(fn.inputs);
  const provide = b.add({ label: inputs.length ? `Provide ${brief(inputs, 3)}` : 'Provide request details', detail: inputs.join(', ') || undefined, lane: userLane, kind: 'data' });
  const submit = b.add({
    label: screen ? `Submit on ${screen.name}` : `Run ${fn.name}`,
    detail: fn.description || undefined,
    lane: appLane,
    kind: 'step',
    to: screen ? `/applications/${fn.applicationId}/screens/${screen.id}?tab=functionalities&open=${fn.id}` : undefined,
  });
  userStarts.forEach((s) => b.link(s, provide));
  b.link(provide, submit);
  externalStarts.forEach((s) => b.link(s, submit));

  let current = submit;
  let pending: string | undefined;
  const next = (to: string) => {
    b.link(current, to, pending);
    pending = undefined;
    current = to;
  };

  // Validation and approval
  const validations = [...clean(fn.exceptions?.validation), ...clean(screen?.validationRules)];
  if (validations.length > 0) {
    const check = b.add({ label: 'Validation passes?', detail: validations.slice(0, 5).join('; '), lane: appLane, kind: 'decision' });
    next(check);
    const reject = b.add({ label: `Reject: ${clean(fn.exceptions?.validation)[0] ?? 'rule violated'}`, lane: appLane, kind: 'end' });
    b.link(check, reject, 'No');
    pending = 'Yes';
  }
  if (screen?.approvalLogic.trim()) {
    next(b.add({ label: 'Route for approval', detail: screen.approvalLogic, lane: appLane, kind: 'step' }));
  }

  // System actions, following the documented "depends on" links
  const byId = new Map(src.components.map((c) => [c.id, c]));
  const included = new Map<string, TechnicalComponent>();
  const usable = (c: TechnicalComponent) => !SKIPPED.includes(c.kind);
  for (const c of src.components) {
    if ((c.functionalityIds ?? []).includes(fn.id) && usable(c) && included.size < MAX_COMPONENTS) included.set(c.id, c);
  }
  let frontier = [...included.values()];
  for (let depth = 0; depth < 2; depth++) {
    const nextFrontier: TechnicalComponent[] = [];
    for (const c of frontier) {
      for (const rid of c.relatedComponentIds ?? []) {
        const r = byId.get(rid);
        if (r && usable(r) && !included.has(rid) && included.size < MAX_COMPONENTS) {
          included.set(rid, r);
          nextFrontier.push(r);
        }
      }
    }
    frontier = nextFrontier;
  }

  const compNode = new Map<string, string>();
  for (const c of included.values()) {
    const summary = describeComponent(c);
    compNode.set(
      c.id,
      b.add({
        label: `${VERB[c.kind] ?? 'Use'} ${c.name}`,
        detail: [KIND_META[c.kind].label, summary, c.description].filter(Boolean).join(' · '),
        lane: LAYER_LANE[layerOf(c.kind)],
        kind: 'step',
        to: `/applications/${c.applicationId}/technical/${c.id}`,
      }),
    );
  }
  const hasIncoming = new Set<string>();
  const hasOutgoing = new Set<string>();
  for (const c of included.values()) {
    for (const rid of c.relatedComponentIds ?? []) {
      if (!included.has(rid)) continue;
      b.link(compNode.get(c.id)!, compNode.get(rid)!);
      hasOutgoing.add(c.id);
      hasIncoming.add(rid);
    }
  }
  const keys = [...included.keys()];
  let roots = keys.filter((id) => !hasIncoming.has(id));
  if (roots.length === 0 && keys.length > 0) roots = [keys[0]]; // circular dependencies: start anywhere
  let leaves = keys.filter((id) => !hasOutgoing.has(id));
  if (leaves.length === 0 && keys.length > 0) leaves = [keys[keys.length - 1]];
  if (roots.length > 0) {
    roots.forEach((id, i) => b.link(current, compNode.get(id)!, i === 0 ? pending : undefined));
    pending = undefined;
  }
  const tails = leaves.length > 0 ? leaves.map((id) => compNode.get(id)!) : [current];

  // Results
  const outputs = clean(fn.outputs);
  const done = b.add({ label: outputs.length ? `Receive ${brief(outputs, 2)}` : `${fn.name} complete`, detail: outputs.join(', ') || undefined, lane: userLane, kind: 'end' });
  tails.forEach((t) => b.link(t, done, leaves.length === 0 ? pending : undefined));
  for (const d of clean(fn.downstreamSystems).slice(0, 3)) {
    const notify = b.add({ label: `Send to ${d}`, detail: 'Downstream system', lane: EXTERNAL, kind: 'step' });
    tails.forEach((t) => b.link(t, notify));
  }

  const failures = [...clean(fn.exceptions?.error), ...clean(fn.exceptions?.system)];
  if (failures.length > 0) {
    const fail = b.add({ label: `Handle: ${failures[0]}`, detail: failures.join('; '), lane: appLane, kind: 'end' });
    b.link(roots.length > 0 ? compNode.get(roots[0])! : submit, fail, 'On failure', true);
  }

  return {
    title: fn.name,
    subtitle: [app?.name, screen?.name].filter(Boolean).join(' › '),
    lanes: b.lanes([userLane, appLane, LAYER_LANE.code, LAYER_LANE.integration, LAYER_LANE.database, EXTERNAL]),
    nodes: b.nodes,
    edges: b.edges,
  };
}

const esc = (s: string) => s.replace(/"/g, "'").replace(/[\r\n]+/g, ' ');

/** Arrow token for Mermaid: line style carries the meaning (thick = handoff, dotted without a head = association). */
function mermaidArrow(e: FlowEdge): string {
  switch (e.type) {
    case 'handoff': return '==>';
    case 'dataflow': case 'depends': return '-.->';
    case 'related': return '-.-';
    case 'contains': return '---';
    default: return e.dashed ? '-.->' : '-->';
  }
}

/** Mermaid source for the same diagram, for Draw.io, Visio import or documentation. */
export function flowToMermaid(model: FlowModel, view: FlowView): string {
  const shape = (n: FlowNode) => {
    const t = esc(n.sub ? `${n.label} (${n.sub})` : n.label);
    if (n.kind === 'decision') return `${n.id}{"${t}"}`;
    switch (n.role) {
      case 'screen': return `${n.id}[["${t}"]]`;
      case 'application': return `${n.id}{{"${t}"}}`;
      case 'external': return `${n.id}(["${t}"])`;
      case 'boundary': return `${n.id}[/"${t}"/]`;
      default: break;
    }
    switch (n.kind) {
      case 'start':
      case 'end':
        return `${n.id}(["${t}"])`;
      case 'data':
        return `${n.id}[/"${t}"/]`;
      default:
        return `${n.id}["${t}"]`;
    }
  };
  const lines: string[] = [];
  if (model.diagram && model.diagram !== 'flow') {
    lines.push(`%% ${DIAGRAM_LABEL[model.diagram]}: ${esc(model.title)}`);
    for (const w of model.warnings ?? []) lines.push(`%% Uncertain: ${esc(w)}`);
  }
  lines.push(view === 'swimlane' ? 'flowchart LR' : 'flowchart TD');
  if (view === 'swimlane') {
    model.lanes.forEach((lane, i) => {
      lines.push(`  subgraph lane${i}["${esc(lane)}"]`);
      for (const n of model.nodes.filter((x) => x.lane === lane)) lines.push(`    ${shape(n)}`);
      lines.push('  end');
    });
  } else {
    for (const n of model.nodes) lines.push(`  ${shape(n)}`);
  }
  for (const e of model.edges) {
    const arrow = mermaidArrow(e);
    const label = e.label ? `${e.uncertain ? '? ' : ''}${esc(e.label)}` : e.uncertain ? '?' : '';
    // Association lines (related, contains) take no label in Mermaid.
    lines.push(label && arrow !== '-.-' && arrow !== '---' ? `  ${e.from} ${arrow}|${label}| ${e.to}` : `  ${e.from} ${arrow} ${e.to}`);
  }
  return lines.join('\n');
}
