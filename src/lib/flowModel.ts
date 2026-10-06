import type { AppModule, Functionality, TechnicalComponent, TechnicalComponentKind } from '@/db/types';
import { KIND_META, describeComponent, layerOf, type Layer } from '@/config/technical';
import type { GraphSource } from './graphModel';

export type FlowKind = 'start' | 'end' | 'step' | 'decision' | 'data';

export interface FlowNode {
  id: string;
  label: string;
  detail?: string;
  /** Swimlane this step belongs to. */
  lane: string;
  kind: FlowKind;
  /** Page to open when the step is clicked. */
  to?: string;
}

export interface FlowEdge {
  from: string;
  to: string;
  label?: string;
  dashed?: boolean;
}

export interface FlowModel {
  title: string;
  subtitle: string;
  lanes: string[];
  nodes: FlowNode[];
  edges: FlowEdge[];
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

/** Screens of a module with their functionalities, how they hand off to each other, and the systems around them. */
export function buildModuleFlow(mod: AppModule, src: GraphSource): FlowModel {
  const b = new Builder();
  const app = src.applications.find((a) => a.id === mod.applicationId);
  const screens = src.screens.filter((s) => s.moduleId === mod.id).sort((a, c) => a.name.localeCompare(c.name));
  const screenNode = new Map<string, string>();
  const fnNode = new Map<string, string>();

  for (const s of screens) {
    const sn = b.add({ label: s.name, detail: s.purpose || undefined, lane: s.name, kind: 'step', to: `/applications/${s.applicationId}/screens/${s.id}` });
    screenNode.set(s.id, sn);
    const fns = src.functionalities.filter((f) => f.screenId === s.id).sort((a, c) => a.createdAt.localeCompare(c.createdAt));
    for (const f of fns) {
      const fnId = b.add({ label: f.name, detail: f.description || undefined, lane: s.name, kind: 'step', to: `/applications/${f.applicationId}/screens/${s.id}?tab=functionalities&open=${f.id}` });
      fnNode.set(f.id, fnId);
      b.link(sn, fnId);
    }
  }

  // Hand-offs between screens, from documented upstream/downstream names and related-screen links
  const byName = new Map(screens.map((s) => [s.name.toLowerCase(), s]));
  const handoffs = new Set<string>();
  const handoff = (from: string, to: string) => {
    const key = `${from}>${to}`;
    if (from === to || handoffs.has(key)) return;
    handoffs.add(key);
    b.link(screenNode.get(from)!, screenNode.get(to)!, 'hands off');
  };
  for (const s of screens) {
    for (const d of clean(s.downstreamSystems)) {
      const target = byName.get(d.toLowerCase());
      if (target) handoff(s.id, target.id);
    }
    for (const u of clean(s.upstreamSystems)) {
      const origin = byName.get(u.toLowerCase());
      if (origin) handoff(origin.id, s.id);
    }
    for (const rid of s.relatedScreenIds ?? []) if (screenNode.has(rid) && s.id < rid) handoff(s.id, rid);
  }

  // Related functionalities (dashed)
  for (const [fid, nodeId] of fnNode) {
    const f = src.functionalities.find((x) => x.id === fid);
    for (const rid of f?.relatedFunctionalityIds ?? []) {
      const other = fnNode.get(rid);
      if (other && fid < rid) b.link(nodeId, other, 'related', true);
    }
  }

  // External systems that are not screens of this module
  const externals = new Map<string, string>();
  const external = (name: string, kind: FlowKind): string | null => {
    const key = `${kind}:${name.toLowerCase()}`;
    const existing = externals.get(key);
    if (existing) return existing;
    if (externals.size >= 8) return null;
    const id = b.add({ label: name, lane: EXTERNAL, kind, detail: kind === 'start' ? 'Upstream system' : 'Downstream system' });
    externals.set(key, id);
    return id;
  };
  for (const s of screens) {
    for (const u of clean(s.upstreamSystems)) {
      if (byName.has(u.toLowerCase())) continue;
      const id = external(u, 'start');
      if (id) b.link(id, screenNode.get(s.id)!);
    }
    for (const d of clean(s.downstreamSystems)) {
      if (byName.has(d.toLowerCase())) continue;
      const id = external(d, 'end');
      if (id) b.link(screenNode.get(s.id)!, id);
    }
  }

  return {
    title: mod.name,
    subtitle: app?.name ?? '',
    lanes: b.lanes([...screens.map((s) => s.name), EXTERNAL]),
    nodes: b.nodes,
    edges: b.edges,
  };
}

const esc = (s: string) => s.replace(/"/g, "'").replace(/[\r\n]+/g, ' ');

/** Mermaid source for the same diagram, for Draw.io, Visio import or documentation. */
export function flowToMermaid(model: FlowModel, view: FlowView): string {
  const shape = (n: FlowNode) => {
    const t = esc(n.label);
    switch (n.kind) {
      case 'start':
      case 'end':
        return `${n.id}(["${t}"])`;
      case 'decision':
        return `${n.id}{"${t}"}`;
      case 'data':
        return `${n.id}[/"${t}"/]`;
      default:
        return `${n.id}["${t}"]`;
    }
  };
  const lines: string[] = [view === 'swimlane' ? 'flowchart LR' : 'flowchart TD'];
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
    const arrow = e.dashed ? '-.->' : '-->';
    lines.push(e.label ? `  ${e.from} ${arrow}|${esc(e.label)}| ${e.to}` : `  ${e.from} ${arrow} ${e.to}`);
  }
  return lines.join('\n');
}
