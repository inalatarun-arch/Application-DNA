import type { AppModule, Application, Functionality, Screen } from '@/db/types';
import type { GraphSource } from './graphModel';
import type { EdgeType, FlowEdge, FlowModel, FlowNode, HandoffInfo } from './flowModel';
import { buildIndex, displayName, findIntegrations, integrationsOf, MECHANISM_LABEL, norm, resolveRef, splitRefs, type Index, type Integration, type Ref } from './processResolve';
import { classifyStep, conflictingPairs, isOutcome, matchSteps, splitSteps } from './processSteps';

/**
 * The three module views, each built from what the documentation states and nothing else:
 *   - business process: who does what, in the documented order, with decisions and handoffs
 *   - relationship map: which functions sit on which screen and what each is related to (no order)
 *   - integration map: the applications and the documented integrations between them
 * Lanes are actors, applications or system boundaries, never screens. Order comes only from documented process text.
 * Where the documentation is silent, partial or contradictory the diagram says so (flags, warnings, dashed amber lines)
 * instead of drawing a convincing but unsupported flow.
 */

const EXTERNAL = 'External systems';
const UNASSIGNED = 'Unassigned (no role documented)';
const BOUNDARY = 'Other modules and applications';

const docOrder = <T extends { createdAt: string; name: string }>(a: T, b: T) => a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name);
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const splitRoles = (xs: string[] | undefined): string[] => [...new Set((xs ?? []).flatMap((x) => x.split(/[;,]/)).map((x) => x.trim()).filter(Boolean))];

class Scene {
  nodes: FlowNode[] = [];
  edges: FlowEdge[] = [];
  warnings: string[] = [];
  handoffs: HandoffInfo[] = [];
  private keys = new Map<string, string>();
  private seenEdges = new Set<string>();
  private seenWarn = new Set<string>();

  node(key: string, spec: Omit<FlowNode, 'id'>): string {
    const hit = this.keys.get(key);
    if (hit) return hit;
    const id = `n${this.nodes.length + 1}`;
    this.keys.set(key, id);
    this.nodes.push({ id, ...spec });
    return id;
  }
  find(key: string): string | undefined {
    return this.keys.get(key);
  }
  patch(id: string, fn: (n: FlowNode) => void): void {
    const n = this.nodes.find((x) => x.id === id);
    if (n) fn(n);
  }
  edge(from: string, to: string, type: EdgeType, extra: Partial<FlowEdge> = {}): void {
    if (from === to) return;
    const k = `${from}>${to}>${type}`;
    if (this.seenEdges.has(k)) return;
    this.seenEdges.add(k);
    this.edges.push({ from, to, type, dashed: type === 'depends' || type === 'related' || extra.uncertain ? true : undefined, ...extra });
  }
  warn(text: string): void {
    if (this.seenWarn.has(text)) return;
    this.seenWarn.add(text);
    this.warnings.push(text);
  }
  lanes(order: string[]): string[] {
    const used = new Set(this.nodes.map((n) => n.lane));
    return order.filter((l) => used.has(l));
  }
}

function appLabel(app: Application, idx: Index): string {
  const code = idx.codeOfApp.get(app.id);
  return code && !app.name.toUpperCase().startsWith(code) ? `${code} — ${app.name}` : app.name;
}

function integrationSummary(i: Integration): string {
  return [`${i.id}${i.type ? `: ${i.type}` : ''}`, i.direction && `direction ${i.direction}`, i.frequency && `when: ${i.frequency}`, i.payload && `payload: ${i.payload}`, i.authentication && `auth: ${i.authentication}`, i.errorHandling && `errors: ${i.errorHandling}`, i.owner && `owner: ${i.owner}`].filter(Boolean).join(' · ');
}

const infoOf = (i: Integration) => ({ id: i.id, type: i.type, frequency: i.frequency, payload: i.payload, authentication: i.authentication, errorHandling: i.errorHandling, owner: i.owner });

// ------------------------------------------------------------------ shared: what a screen points at

interface Target {
  ref: Ref;
  dir: 'down' | 'up';
  text: string;
}

function targetsOf(s: Screen, idx: Index): Target[] {
  const out: Target[] = [];
  for (const t of splitRefs(s.downstreamSystems)) out.push({ ref: resolveRef(t, idx, s.applicationId), dir: 'down', text: t });
  for (const t of splitRefs(s.upstreamSystems)) out.push({ ref: resolveRef(t, idx, s.applicationId), dir: 'up', text: t });
  return out;
}

interface Ctx {
  b: Scene;
  idx: Index;
  mod: AppModule;
  app: Application | undefined;
  screenIds: Set<string>;
  integrations: Integration[];
  /** Lane that holds boundary nodes of other applications and modules. */
  laneOf: (app: Application | undefined) => string;
  /** The node that stands for an in-module screen. */
  screenNode: (s: Screen) => string;
  withIntegrations: boolean;
}

/** An edge between a node of ours and something outside the module (another module, another application, an external system). */
function linkBoundary(ctx: Ctx, from: Screen, t: Target): void {
  const { b, idx, app } = ctx;
  const mine = ctx.screenNode(from);
  const arrow = (other: string, type: EdgeType, extra: Partial<FlowEdge> = {}) => (t.dir === 'down' ? b.edge(mine, other, type, extra) : b.edge(other, mine, type, extra));
  const ref = t.ref;

  if (ref.kind === 'external') {
    const id = b.node(`ext:${norm(ref.name)}`, { label: ref.name, lane: EXTERNAL, kind: t.dir === 'up' ? 'start' : 'end', role: 'external', detail: t.dir === 'up' ? 'Documented upstream source; no entity or integration is recorded for it' : 'Documented downstream target; no entity or integration is recorded for it' });
    arrow(id, 'dataflow', { evidence: `${from.name}: ${t.dir === 'up' ? 'Upstream' : 'Downstream'} Systems lists "${ref.name}"` });
    return;
  }

  let target: Application | undefined;
  let label = '';
  let sub = '';
  let key = '';
  let detail: string | undefined;
  let to = '';
  if (ref.kind === 'screen') {
    target = idx.appById.get(ref.screen.applicationId);
    const m = ref.screen.moduleId ? idx.moduleById.get(ref.screen.moduleId) : undefined;
    label = ref.screen.name; sub = m ? m.name : ''; key = `bnd:s:${ref.screen.id}`; detail = ref.screen.purpose || undefined; to = `/applications/${ref.screen.applicationId}/screens/${ref.screen.id}`;
  } else if (ref.kind === 'module') {
    target = idx.appById.get(ref.module.applicationId);
    label = ref.module.name; sub = 'Module'; key = `bnd:m:${ref.module.id}`; to = `/applications/${ref.module.applicationId}/modules/${ref.module.id}`;
  } else if (ref.kind === 'application') {
    target = ref.app;
    label = ref.remainder || appLabel(ref.app, idx); sub = ref.remainder ? appLabel(ref.app, idx) : 'Application'; key = `bnd:a:${ref.app.id}:${norm(ref.remainder)}`;
  } else {
    // A function of another screen: shown as a dependency, never as a step.
    const f = ref.fn;
    const fnNode = b.find(`fn:${f.id}`);
    if (fnNode) { b.edge(mine, fnNode, 'depends', { evidence: `${from.name} lists ${f.name}` }); return; }
    target = idx.appById.get(f.applicationId);
    label = f.name; sub = 'Function'; key = `bnd:f:${f.id}`;
  }

  const crossApp = !!app && !!target && target.id !== app.id;
  const sameModuleElsewhere = !crossApp && ref.kind !== 'application';
  const lane = ctx.laneOf(target);
  const other = b.node(key, { label, sub, lane, kind: 'step', role: 'boundary', detail, to: to || undefined });

  if (!crossApp) {
    arrow(other, 'handoff', { label: sameModuleElsewhere ? `continues in ${ref.kind === 'screen' && sub ? sub.replace(/^MOD-[\d.]+\s*[—–-]?\s*/i, '') : 'another module'}` : undefined, evidence: `${from.name}: ${t.dir === 'up' ? 'Upstream' : 'Downstream'} Systems lists "${t.text}" (same application, outside this module)` });
    b.handoffs.push({ from: t.dir === 'down' ? from.name : label, to: t.dir === 'down' ? label : from.name, status: 'internal', integrations: [], note: 'Within the same application; a separate module, shown as a boundary rather than expanded.' });
    return;
  }

  const [src, dst] = t.dir === 'down' ? [app!, target!] : [target!, app!];
  const found = findIntegrations(ctx.integrations, src, dst);
  const names = { from: appLabel(src, idx), to: appLabel(dst, idx) };
  const ev = `${from.name}: ${t.dir === 'up' ? 'Upstream' : 'Downstream'} Systems lists "${t.text}"`;
  if (found.matches.length > 0) {
    const ids = found.matches.map((i) => i.id).join(' / ');
    const mech = [...new Set(found.matches.map((i) => MECHANISM_LABEL[i.mechanism]))].join(' / ');
    const ambiguous = found.matches.length > 1;
    arrow(other, 'handoff', { label: `${ids} · ${mech}`, uncertain: ambiguous || undefined, evidence: `${ev}. ${found.matches.map(integrationSummary).join(' | ')}` });
    b.handoffs.push({ from: names.from, to: names.to, status: ambiguous ? 'ambiguous' : 'documented', integrations: found.matches.map(infoOf), note: ambiguous ? `Several integrations are documented from ${names.from} to ${names.to}; which one carries this handoff is not stated.` : '' });
    if (ambiguous) b.warn(`${names.from} → ${names.to}: ${found.matches.length} integrations are documented (${ids}); which one carries the handoff from ${from.name} is not stated.`);
  } else if (found.reverse.length > 0) {
    arrow(other, 'handoff', { label: 'integration documented in the other direction', uncertain: true, evidence: `${ev}. Only ${found.reverse.map((i) => i.id).join(', ')} is documented, and it runs ${names.to} → ${names.from}` });
    b.handoffs.push({ from: names.from, to: names.to, status: 'reverse-only', integrations: found.reverse.map(infoOf), note: `Only the opposite direction (${names.to} → ${names.from}) is documented.` });
    b.warn(`${from.name} hands off ${names.from} → ${names.to}, but the only documented integration (${found.reverse.map((i) => i.id).join(', ')}) runs ${names.to} → ${names.from}.`);
  } else {
    arrow(other, 'handoff', { label: 'no integration documented', uncertain: true, evidence: ev });
    b.handoffs.push({ from: names.from, to: names.to, status: 'missing', integrations: [], note: 'The screen documents this handoff, but no integration record covers it.' });
    b.warn(`${from.name} hands off ${names.from} → ${names.to}, but no integration is documented between them.`);
  }
}

/** Navigation between screens of the module, from each side's Upstream / Downstream lists. One-sided claims are drawn as uncertain. */
function linkNavigation(ctx: Ctx, screens: Screen[], targets: Map<string, Target[]>): void {
  const { b } = ctx;
  const claims = new Map<string, { from: Screen; to: Screen; byFrom: boolean; byTo: boolean }>();
  const claim = (from: Screen, to: Screen, byFrom: boolean) => {
    const k = `${from.id}>${to.id}`;
    const c = claims.get(k) ?? { from, to, byFrom: false, byTo: false };
    if (byFrom) c.byFrom = true; else c.byTo = true;
    claims.set(k, c);
  };
  for (const s of screens) {
    for (const t of targets.get(s.id) ?? []) {
      if (t.ref.kind !== 'screen' || !ctx.screenIds.has(t.ref.screen.id) || t.ref.screen.id === s.id) continue;
      if (t.dir === 'down') claim(s, t.ref.screen, true); else claim(t.ref.screen, s, false);
    }
  }
  for (const c of claims.values()) {
    const both = c.byFrom && c.byTo;
    b.edge(ctx.screenNode(c.from), ctx.screenNode(c.to), 'sequence', {
      label: 'navigates to', uncertain: both ? undefined : true,
      evidence: both ? `${c.from.name} lists ${c.to.name} as downstream and ${c.to.name} lists ${c.from.name} as upstream` : `Only ${c.byFrom ? c.from.name : c.to.name} documents this link (${c.byFrom ? 'as downstream' : 'as upstream'}); ${c.byFrom ? c.to.name : c.from.name} does not confirm it`,
    });
    if (!both) b.warn(`${c.byFrom ? c.from.name : c.to.name} documents ${c.byFrom ? 'a downstream link to' : 'an upstream link from'} ${c.byFrom ? c.to.name : c.from.name}, which does not list it back.`);
  }
}

function makeCtx(mod: AppModule, withIntegrations: boolean, laneOf: Ctx['laneOf'], b: Scene, idx: Index, screens: Screen[], screenNodeOf: (s: Screen) => string): Ctx {
  return { b, idx, mod, app: idx.appById.get(mod.applicationId), screenIds: new Set(screens.map((s) => s.id)), integrations: integrationsOf(idx), laneOf, screenNode: screenNodeOf, withIntegrations };
}

// ------------------------------------------------------------------ 1. business process

interface RoleChoice {
  lane: string;
  roles: string[];
}

/**
 * One lane per responsible role. A function that lists several roles without saying which performs it goes under the first
 * one listed (the documented primary) and is flagged, rather than guessing who really does it.
 */
function roleChooser(): (f: Functionality) => RoleChoice {
  return (f) => {
    const roles = splitRoles(f.userRoles);
    return roles.length ? { lane: roles[0], roles } : { lane: UNASSIGNED, roles };
  };
}

/** Documented process sequence for the functions of one screen. Returns what to draw first and what could not be ordered. */
function planScreen(s: Screen, fns: Functionality[], idx: Index, b: Scene) {
  const steps = splitSteps(s.businessProcess);
  const plan = matchSteps(steps, fns);
  const sources: string[][] = [plan.ordered.map((m) => m.fn.id)];
  const wf = matchSteps(s.workflowSteps ?? [], fns).ordered;
  if (wf.length > 1) sources.push(wf.map((m) => m.fn.id));
  // A function that names another function of the screen as upstream or downstream gives a third, independent order.
  const own = new Set(fns.map((f) => f.id));
  const refPairs: string[][] = [];
  for (const f of fns) {
    for (const t of splitRefs(f.downstreamSystems)) { const r = resolveRef(t, idx, f.applicationId); if (r.kind === 'function' && own.has(r.fn.id) && r.fn.id !== f.id) refPairs.push([f.id, r.fn.id]); }
    for (const t of splitRefs(f.upstreamSystems)) { const r = resolveRef(t, idx, f.applicationId); if (r.kind === 'function' && own.has(r.fn.id) && r.fn.id !== f.id) refPairs.push([r.fn.id, f.id]); }
  }
  refPairs.forEach((p) => sources.push(p));
  const conflicts = conflictingPairs(sources);
  const name = (id: string) => { const f = fns.find((x) => x.id === id); return f ? displayName(f) : id; };
  if (conflicts.length) {
    b.warn(`${s.name}: the documentation orders these steps in opposite ways (${conflicts.map(([x, y]) => `${name(x)} / ${name(y)}`).join('; ')}), so no sequence is drawn for this screen.`);
    return { ordered: [], unordered: fns, stepsWithoutFunction: [] as string[], conflicted: true };
  }
  if (!steps.length && fns.length) b.warn(`${s.name}: no Business Process is documented, so the order of its ${fns.length} function${fns.length === 1 ? '' : 's'} is unknown.`);
  else if (plan.unordered.length) b.warn(`${s.name}: ${plan.unordered.map((f) => displayName(f)).join(', ')} ${plan.unordered.length === 1 ? 'is' : 'are'} not named in the documented process, so ${plan.unordered.length === 1 ? 'its' : 'their'} place in the sequence is unknown.`);
  if (plan.stepsWithoutFunction.length) b.warn(`${s.name}: documented step${plan.stepsWithoutFunction.length === 1 ? '' : 's'} "${plan.stepsWithoutFunction.join('", "')}" ${plan.stepsWithoutFunction.length === 1 ? 'has' : 'have'} no matching function.`);
  return { ...plan, conflicted: false };
}

export function buildProcessSwimlane(mod: AppModule, src: GraphSource): FlowModel {
  const idx = buildIndex(src);
  const b = new Scene();
  const app = idx.appById.get(mod.applicationId);
  const screens = src.screens.filter((s) => s.moduleId === mod.id).sort(docOrder);
  const fnsByScreen = new Map(screens.map((s) => [s.id, src.functionalities.filter((f) => f.screenId === s.id).sort(docOrder)]));
  const chooseRole = roleChooser();
  const appLane = (a: Application | undefined) => (a ? appLabel(a, idx) : 'Application');
  const laneOrder: string[] = [];
  const roleLanes: string[] = [];
  const otherApps: string[] = [];
  const noteLane = (l: string, list: string[]) => { if (!list.includes(l)) list.push(l); };

  const screenNode = (s: Screen) => b.node(`scr:${s.id}`, { label: s.name, sub: s.purpose ? clip(s.purpose, 60) : undefined, lane: appLane(app), kind: 'step', role: 'screen', detail: [s.purpose, s.approvalLogic && `Approval logic: ${s.approvalLogic}`].filter(Boolean).join(' · ') || undefined, to: `/applications/${s.applicationId}/screens/${s.id}` });
  const ctx = makeCtx(mod, true, (a) => { const l = appLane(a); if (a && a.id !== app?.id) noteLane(l, otherApps); return l; }, b, idx, screens, screenNode);
  const targets = new Map(screens.map((s) => [s.id, targetsOf(s, idx)]));

  const noRole = new Set<string>();
  const multiRole = new Set<string>();
  for (const s of screens) {
    const sn = screenNode(s);
    const fns = fnsByScreen.get(s.id) ?? [];
    const plan = planScreen(s, fns, idx, b);

    const fnNode = (f: Functionality, role: 'function' | 'unordered') => {
      const choice = chooseRole(f);
      noteLane(choice.lane, roleLanes);
      if (choice.lane === UNASSIGNED) noRole.add(displayName(f));
      else if (choice.roles.length > 1) multiRole.add(displayName(f));
      const flags = role === 'unordered' ? ['Position in the sequence is not documented'] : [];
      return b.node(`fn:${f.id}`, {
        label: displayName(f), sub: choice.roles.length > 1 ? `Roles: ${choice.roles.join(', ')}` : undefined, lane: choice.lane, kind: 'step', role,
        detail: [f.description, f.businessPurpose].filter(Boolean).join(' · ') || undefined, flags: flags.length ? flags : undefined,
        to: `/applications/${f.applicationId}/screens/${s.id}?tab=functionalities&open=${f.id}`,
      });
    };

    for (const f of plan.unordered) b.edge(sn, fnNode(f, 'unordered'), 'contains', { evidence: `${displayName(f)} is a function of ${s.name}` });

    // The documented sequence, with decisions only where the documentation supports them.
    const items = plan.ordered.map((m) => ({ ...m, cls: classifyStep(m.step) }));
    const outcomes = items.filter((m) => isOutcome(m.cls));
    const grouped = outcomes.length >= 2;
    let prev = sn;
    let prevLabel: string | undefined = 'opens';
    let prevUncertain = false;
    let lastMain: string | null = null;
    let decisionMade = false;
    let afterOutcomes: { from: string; because: string } | null = null;
    const chain = (to: string, evidence: string) => { b.edge(prev, to, 'sequence', { label: prevLabel, uncertain: prevUncertain || undefined, evidence }); prevLabel = undefined; prevUncertain = false; };

    for (const m of items) {
      const f = m.fn;
      const evidence = `Business Process of ${s.name}: "${s.businessProcess}"`;
      if (grouped && isOutcome(m.cls)) {
        if (!decisionMade) {
          decisionMade = true;
          const first = fnNode(outcomes[0].fn, 'function');
          const lane = b.nodes.find((n) => n.id === first)?.lane ?? appLane(app);
          const d = b.node(`dec:${s.id}:outcome`, { label: 'Which outcome?', lane, kind: 'decision', detail: s.approvalLogic ? `Documented rule: ${s.approvalLogic}` : 'Outcome rule not documented', flags: s.approvalLogic ? undefined : ['No approval or outcome rule is documented'] });
          if (!s.approvalLogic) b.warn(`${s.name}: alternative outcomes (${outcomes.map((o) => displayName(o.fn)).join(', ')}) are documented but no approval rule says when each applies.`);
          chain(d, evidence);
          for (const o of outcomes) {
            const on = fnNode(o.fn, 'function');
            b.edge(d, on, 'branch', { label: o.step, evidence: `${evidence}; alternatives, so shown as branches` });
            if (o.cls === 'decline') b.warn(`${s.name}: where the process continues after "${o.step}" is not documented.`);
          }
          const positive = outcomes.find((o) => o.cls === 'approve');
          prev = positive ? fnNode(positive.fn, 'function') : d;
          prevLabel = undefined;
          afterOutcomes = { from: prev, because: positive ? positive.step : 'the decision' };
          lastMain = prev;
        }
        continue;
      }
      if (!grouped && (isOutcome(m.cls) || m.cls === 'rework')) {
        // A single outcome or a rework step is a conditional side path from the step before it; the main line goes on without it.
        const on = fnNode(f, 'function');
        b.edge(lastMain ?? sn, on, 'branch', { label: 'conditional', evidence: `${evidence}; "${m.step}" is a ${m.cls === 'rework' ? 'rework' : 'conditional outcome'} step, so it is drawn as a branch, not part of the main sequence` });
        b.patch(on, (n) => { n.flags = [...(n.flags ?? []), 'Condition and return path are not documented']; });
        b.warn(`${s.name}: "${m.step}" is documented as a step, but the condition that triggers it and where the process returns afterwards are not.`);
        continue;
      }
      const n = fnNode(f, 'function');
      if (afterOutcomes) {
        b.edge(afterOutcomes.from, n, 'sequence', { uncertain: true, evidence: `${evidence}; listed after the alternative outcomes, but not stated to depend on "${afterOutcomes.because}"` });
        b.warn(`${s.name}: "${m.step}" is listed after the alternative outcomes; the documentation does not say it only follows "${afterOutcomes.because}".`);
        afterOutcomes = null; prev = n; prevLabel = undefined; prevUncertain = false;
      } else chain(n, evidence);
      prev = n;
      lastMain = n;
      const validation = f.exceptions?.validation?.length ? f.exceptions.validation : s.validationRules ?? [];
      if (m.cls === 'check' && validation.length) {
        const lane = b.nodes.find((x) => x.id === n)?.lane ?? appLane(app);
        const d = b.node(`dec:${f.id}:valid`, { label: 'Validation passes?', lane, kind: 'decision', detail: `Documented validation: ${validation.slice(0, 3).join('; ')}` });
        b.edge(n, d, 'sequence', { evidence });
        const fail = b.node(`dec:${f.id}:invalid`, { label: 'Validation failed', sub: clip(validation[0], 56), lane, kind: 'end', role: 'function', detail: validation.join('; '), flags: ['Return path after failed validation is not documented'] });
        b.edge(d, fail, 'branch', { label: 'Validation failed', evidence: `Validation documented for ${displayName(f)}: ${validation.slice(0, 2).join('; ')}` });
        prev = d; prevLabel = 'Passed'; lastMain = d;
        b.warn(`${displayName(f)}: validation can fail, but the documentation does not say where the process returns.`);
      }
    }

    // Navigation and handoffs recorded on the screen itself.
    for (const t of targets.get(s.id) ?? []) {
      if (t.ref.kind === 'screen' && ctx.screenIds.has(t.ref.screen.id)) continue;
      linkBoundary(ctx, s, t);
    }
  }
  linkNavigation(ctx, screens, targets);

  const noRoleList = [...noRole];
  const multiRoleList = [...multiRole];
  if (noRoleList.length) b.warn(`No responsible role is documented for ${noRoleList.length} step${noRoleList.length === 1 ? '' : 's'} (${noRoleList.slice(0, 4).join(', ')}${noRoleList.length > 4 ? ', …' : ''}); they are shown as unassigned.`);
  if (multiRoleList.length) b.warn(`${multiRoleList.length} step${multiRoleList.length === 1 ? '' : 's'} list several roles without saying which performs the step; each is placed under its first-listed role (${multiRoleList.slice(0, 3).join(', ')}${multiRoleList.length > 3 ? ', …' : ''}).`);
  const orphans = src.screens.filter((s) => s.applicationId === mod.applicationId && !s.moduleId);
  if (orphans.length) b.warn(`${orphans.length} screen${orphans.length === 1 ? '' : 's'} of this application ${orphans.length === 1 ? 'is' : 'are'} not assigned to any module (${orphans.slice(0, 3).map((o) => o.name).join(', ')}${orphans.length > 3 ? ', …' : ''}), so ${orphans.length === 1 ? 'it is' : 'they are'} not part of any module diagram.`);

  laneOrder.push(...roleLanes, appLane(app), ...otherApps, EXTERNAL, UNASSIGNED);
  return {
    title: mod.name, subtitle: app ? appLabel(app, idx) : '', lanes: b.lanes(laneOrder), nodes: b.nodes, edges: b.edges,
    diagram: 'process', warnings: b.warnings, handoffs: b.handoffs,
  };
}

// ------------------------------------------------------------------ 2. screen and function relationship map

export function buildRelationshipMap(mod: AppModule, src: GraphSource): FlowModel {
  const idx = buildIndex(src);
  const b = new Scene();
  const app = idx.appById.get(mod.applicationId);
  const screens = src.screens.filter((s) => s.moduleId === mod.id).sort(docOrder);
  const screenNode = (s: Screen) => b.node(`scr:${s.id}`, { label: s.name, sub: s.purpose ? clip(s.purpose, 60) : undefined, lane: s.name, kind: 'step', role: 'screen', detail: s.purpose || undefined, to: `/applications/${s.applicationId}/screens/${s.id}` });
  const ctx = makeCtx(mod, true, () => BOUNDARY, b, idx, screens, screenNode);
  const targets = new Map(screens.map((s) => [s.id, targetsOf(s, idx)]));
  const fnIds = new Set<string>();

  for (const s of screens) {
    const sn = screenNode(s);
    for (const f of src.functionalities.filter((x) => x.screenId === s.id).sort(docOrder)) {
      fnIds.add(f.id);
      const id = b.node(`fn:${f.id}`, { label: f.name, lane: s.name, kind: 'step', role: 'function', detail: f.description || undefined, to: `/applications/${f.applicationId}/screens/${s.id}?tab=functionalities&open=${f.id}` });
      b.edge(sn, id, 'contains', { evidence: `${f.name} is a function of ${s.name}` });
    }
  }
  // A relation declared by either side is one line; "related" has no direction, so each pair is drawn once.
  const drawn = new Set<string>();
  const pairOnce = (x: string, y: string) => { const k = [x, y].sort().join('|'); if (drawn.has(k)) return false; drawn.add(k); return true; };
  for (const s of screens) {
    for (const rid of s.relatedScreenIds ?? []) {
      const other = idx.screenById.get(rid);
      if (other && ctx.screenIds.has(rid) && pairOnce(s.id, rid)) b.edge(screenNode(s), screenNode(other), 'related', { evidence: 'Related Screens' });
    }
  }
  for (const f of src.functionalities.filter((x) => fnIds.has(x.id))) {
    for (const rid of f.relatedFunctionalityIds ?? []) if (fnIds.has(rid) && pairOnce(f.id, rid)) b.edge(b.find(`fn:${f.id}`)!, b.find(`fn:${rid}`)!, 'related', { evidence: 'Related functionalities' });
  }
  for (const s of screens) {
    for (const t of targets.get(s.id) ?? []) {
      if (t.ref.kind === 'screen' && ctx.screenIds.has(t.ref.screen.id)) continue;
      linkBoundary(ctx, s, t);
    }
  }
  linkNavigation(ctx, screens, targets);

  return {
    title: mod.name, subtitle: app ? appLabel(app, idx) : '', lanes: b.lanes([...screens.map((s) => s.name), BOUNDARY, EXTERNAL]), nodes: b.nodes, edges: b.edges,
    diagram: 'relationships', warnings: b.warnings, handoffs: b.handoffs,
  };
}

// ------------------------------------------------------------------ 3. cross-application integration map

export function buildIntegrationMap(mod: AppModule, src: GraphSource): FlowModel {
  const idx = buildIndex(src);
  const b = new Scene();
  const app = idx.appById.get(mod.applicationId);
  const all = integrationsOf(idx);
  const mine = app ? all.filter((i) => i.sourceApp?.id === app.id || i.targetApp?.id === app.id || (!i.sourceApp && !i.targetApp)) : [];
  const endpoint = (a: Application | null, text: string) => (a
    ? b.node(`app:${a.id}`, { label: appLabel(a, idx), sub: a.id === app?.id ? 'This module’s application' : undefined, lane: 'Applications', kind: 'step', role: 'application', detail: a.description || undefined, to: `/applications/${a.id}` })
    : b.node(`ext:${norm(text)}`, { label: text || 'Unknown system', lane: 'Applications', kind: 'step', role: 'external', detail: 'Named in an integration but not an application in this catalogue' }));
  if (app) endpoint(app, '');

  for (const i of mine) {
    const from = endpoint(i.sourceApp, i.source);
    const to = endpoint(i.targetApp, i.target);
    const missing = !i.sourceApp || !i.targetApp;
    b.edge(from, to, 'dataflow', {
      label: `${i.id} · ${MECHANISM_LABEL[i.mechanism]}`, uncertain: missing || undefined,
      evidence: integrationSummary(i),
    });
    b.handoffs.push({ from: i.sourceApp ? appLabel(i.sourceApp, idx) : i.source || 'Unknown', to: i.targetApp ? appLabel(i.targetApp, idx) : i.target || 'Unknown', status: 'documented', integrations: [infoOf(i)], note: '' });
    if (missing) b.warn(`${i.id}: ${!i.sourceApp ? `source "${i.source || 'not stated'}"` : `target "${i.target || 'not stated'}"`} is not an application in the catalogue, so it is shown as an outside system.`);
  }
  // One note per kind of gap, naming every integration it applies to.
  const lacking = (label: string, test: (i: Integration) => boolean) => {
    const ids = mine.filter(test).map((i) => i.id);
    if (ids.length) b.warn(`No ${label} is documented for ${ids.join(', ')}.`);
  };
  lacking('frequency or trigger', (i) => !i.frequency);
  lacking('authentication', (i) => !i.authentication);
  lacking('owner', (i) => !i.owner || /^tbd$/i.test(i.owner.trim()));
  // Two records for the same source and target describe one connection twice, or two connections; either way the reader should see it.
  const pairs = new Map<string, Integration[]>();
  for (const i of mine) if (i.sourceApp && i.targetApp) pairs.set(`${i.sourceApp.id}>${i.targetApp.id}`, [...(pairs.get(`${i.sourceApp.id}>${i.targetApp.id}`) ?? []), i]);
  for (const list of pairs.values()) {
    const kinds = new Set(list.map((i) => i.mechanism));
    if (list.length > 1) b.warn(`${list.map((i) => i.id).join(' and ')} both connect ${appLabel(list[0].sourceApp!, idx)} to ${appLabel(list[0].targetApp!, idx)}${kinds.size > 1 ? ` with different mechanisms (${list.map((i) => `${i.id}: ${i.type || MECHANISM_LABEL[i.mechanism]}`).join('; ')})` : ''}; whether they are one connection documented twice is not stated.`);
  }

  // Handoffs the module's screens document with no matching integration, as dependencies (never as integrations).
  if (app) {
    const screens = src.screens.filter((s) => s.moduleId === mod.id);
    for (const s of screens) {
      for (const t of targetsOf(s, idx)) {
        const other = t.ref.kind === 'screen' ? idx.appById.get(t.ref.screen.applicationId) : t.ref.kind === 'application' ? t.ref.app : undefined;
        if (!other || other.id === app.id) continue;
        const [from, to] = t.dir === 'down' ? [app, other] : [other, app];
        if (findIntegrations(all, from, to).matches.length) continue;
        b.edge(endpoint(from, ''), endpoint(to, ''), 'depends', { label: 'documented on a screen; no integration', uncertain: true, evidence: `${s.name} lists "${t.text}"` });
        b.warn(`${s.name} depends on ${appLabel(other, idx)} (${t.text}), but no integration is documented from ${appLabel(from, idx)} to ${appLabel(to, idx)}.`);
      }
    }
  }
  if (!mine.length) b.warn('No integration is documented for this application.');

  return { title: mod.name, subtitle: app ? appLabel(app, idx) : '', lanes: [], nodes: b.nodes, edges: b.edges, diagram: 'integration', warnings: b.warnings, handoffs: b.handoffs };
}

export type ModuleDiagram = 'process' | 'relationships' | 'integration';

export const MODULE_DIAGRAMS: Array<{ id: ModuleDiagram; label: string; purpose: string }> = [
  { id: 'process', label: 'Business process', purpose: 'Who does what, in the documented order, with decisions and handoffs between systems.' },
  { id: 'relationships', label: 'Screens and functions', purpose: 'Which functions sit on which screen and how things relate. Not a workflow.' },
  { id: 'integration', label: 'Integrations', purpose: 'The applications around this module and the documented integrations between them.' },
];

export function buildModuleDiagram(kind: ModuleDiagram, mod: AppModule, src: GraphSource): FlowModel {
  return kind === 'process' ? buildProcessSwimlane(mod, src) : kind === 'relationships' ? buildRelationshipMap(mod, src) : buildIntegrationMap(mod, src);
}
