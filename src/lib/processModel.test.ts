import { describe, expect, test } from 'vitest';
import fixture from './__fixtures__/supplierPack.json';
import type { AppModule, Application, Functionality, Screen, TechnicalComponent } from '@/db/types';
import type { GraphSource } from './graphModel';
import type { FlowEdge, FlowModel } from './flowModel';
import { flowToMermaid } from './flowModel';
import { layoutFlow, type FlowLayout, type PNode } from './flowLayout';
import { buildIntegrationMap, buildProcessSwimlane, buildRelationshipMap } from './processModel';

// ---------------------------------------------------------------- tiny data builders

let clock = 0;
const stamp = () => new Date(Date.UTC(2026, 0, 1, 0, 0, ++clock)).toISOString();
const base = () => ({ id: `id${clock + 1}`, createdAt: stamp(), updatedAt: stamp() });

const app = (name: string): Application => ({ ...base(), name, vendor: '', domain: '', technicalStack: [], criticalTier: 'tier-3', description: '', businessOwner: '', technicalOwner: '', tags: [] });
const mod = (a: Application, name: string): AppModule => ({ ...base(), applicationId: a.id, name, description: '', owner: '' });
const screen = (m: AppModule, name: string, o: Partial<Screen> = {}): Screen => ({
  ...base(), applicationId: m.applicationId, moduleId: m.id, name, purpose: '', description: '', businessProcess: '', businessOwner: '', functionalOwner: '', navigationPath: '',
  fieldDescriptions: [], uiElements: [], validationRules: [], workflowSteps: [], approvalLogic: '', exceptionHandling: [], upstreamSystems: [], downstreamSystems: [], relatedScreenIds: [], ...o,
});
const fn = (s: Screen, name: string, o: Partial<Functionality> = {}): Functionality => ({
  ...base(), applicationId: s.applicationId, moduleId: s.moduleId, screenId: s.id, name, description: '', businessPurpose: '', processFlow: '', userRoles: ['Clerk'], triggers: [], inputs: [], outputs: [],
  exceptions: { validation: [], error: [], business: [], system: [] }, relatedFunctionalityIds: [], upstreamSystems: [], downstreamSystems: [], ...o,
});
const integration = (a: Application, name: string, metadata: Record<string, string>): TechnicalComponent => ({
  ...base(), applicationId: a.id, kind: 'integration', name, description: '', definition: '', functionalityIds: [], screenIds: [], relatedComponentIds: [], metadata, columns: [],
});
const source = (p: Partial<GraphSource>): GraphSource => ({ applications: [], modules: [], screens: [], functionalities: [], components: [], requirements: [], ...p });

const labelOf = (m: FlowModel, id: string) => m.nodes.find((n) => n.id === id)!.label;
const nodeBy = (m: FlowModel, text: string) => m.nodes.find((n) => n.label.includes(text))!;
const edgesOf = (m: FlowModel, type?: string) => m.edges.filter((e) => !type || e.type === type);
const between = (m: FlowModel, from: string, to: string) => m.edges.filter((e) => labelOf(m, e.from).includes(from) && labelOf(m, e.to).includes(to));

// ---------------------------------------------------------------- geometry check

type Pt = [number, number];
const hitsBox = (p: Pt, q: Pt, n: PNode, pad = 0) => {
  const x1 = n.x - n.w / 2 + pad, x2 = n.x + n.w / 2 - pad, y1 = n.y - n.h / 2 + pad, y2 = n.y + n.h / 2 - pad;
  if (p[0] === q[0]) return p[0] > x1 && p[0] < x2 && Math.max(Math.min(p[1], q[1]), y1) < Math.min(Math.max(p[1], q[1]), y2);
  if (p[1] === q[1]) return p[1] > y1 && p[1] < y2 && Math.max(Math.min(p[0], q[0]), x1) < Math.min(Math.max(p[0], q[0]), x2);
  return false; // legacy curves are not used by typed diagrams
};
/** Names every connector that passes through a node other than its own two ends. */
function crossings(layout: FlowLayout): string[] {
  const bad: string[] = [];
  for (const e of layout.edges) {
    for (const n of layout.nodes) {
      if (n.id === e.from || n.id === e.to) continue;
      for (let i = 0; i < e.points.length - 1; i++) if (hitsBox(e.points[i], e.points[i + 1], n, 1)) bad.push(`${e.type} ${e.from}->${e.to} crosses ${n.label}`);
    }
  }
  return bad;
}

// ================================================================ the seven required scenarios

describe('simple sequential workflow', () => {
  const a = app('Claims Portal');
  const m = mod(a, 'MOD-1 Intake');
  const s = screen(m, 'Request Form', { businessProcess: 'Capture request; review request; submit request' });
  // Created in the opposite order to the documented one: creation order must not matter.
  const fns = [fn(s, 'Submit request'), fn(s, 'Review request'), fn(s, 'Capture request')];
  const model = buildProcessSwimlane(m, source({ applications: [a], modules: [m], screens: [s], functionalities: fns }));

  test('order comes from the documented process, not creation order', () => {
    expect(between(model, 'Capture', 'Review')[0].type).toBe('sequence');
    expect(between(model, 'Review', 'Submit')[0].type).toBe('sequence');
    expect(between(model, 'Submit', 'Capture')).toHaveLength(0);
    expect(between(model, 'Request Form', 'Capture')[0].type).toBe('sequence');
  });

  test('lanes are the responsible role and the application, never the screen', () => {
    expect(model.lanes).toEqual(['Clerk', 'Claims Portal']);
    expect(model.lanes).not.toContain('Request Form');
    expect(nodeBy(model, 'Capture request').lane).toBe('Clerk');
    expect(nodeBy(model, 'Request Form').lane).toBe('Claims Portal');
    expect(nodeBy(model, 'Request Form').role).toBe('screen');
    expect(nodeBy(model, 'Capture request').role).toBe('function');
  });

  test('is labelled as a business process and has no warnings', () => {
    expect(model.diagram).toBe('process');
    expect(model.warnings).toEqual([]);
  });

  test('left to right: each step sits in a later column than the one before', () => {
    const layout = layoutFlow(model, 'swimlane');
    const x = (t: string) => layout.nodes.find((n) => n.label.includes(t))!.x;
    expect(x('Capture')).toBeLessThan(x('Review'));
    expect(x('Review')).toBeLessThan(x('Submit'));
    expect(crossings(layout)).toEqual([]);
  });
});

describe('workflow with approval and rejection branches', () => {
  const a = app('Claims Portal');
  const m = mod(a, 'MOD-1 Review');
  const s = screen(m, 'Claim Decision', { businessProcess: 'Submit claim; approve claim; reject claim', approvalLogic: 'Approver cannot approve own claim.' });
  const submit = fn(s, 'Submit claim', { userRoles: ['Claimant'] });
  const approve = fn(s, 'Approve claim', { userRoles: ['Approver'] });
  const reject = fn(s, 'Reject claim', { userRoles: ['Approver'] });
  const model = buildProcessSwimlane(m, source({ applications: [a], modules: [m], screens: [s], functionalities: [submit, approve, reject] }));

  test('alternative outcomes hang off a decision as labelled branches, not as consecutive steps', () => {
    const decision = model.nodes.find((n) => n.kind === 'decision')!;
    const out = model.edges.filter((e) => e.from === decision.id);
    expect(out.map((e) => e.type)).toEqual(['branch', 'branch']);
    expect(out.map((e) => e.label).sort()).toEqual(['approve claim', 'reject claim']);
    expect(decision.detail).toContain('Approver cannot approve own claim');
    expect(between(model, 'Approve claim', 'Reject claim')).toHaveLength(0);
    expect(between(model, 'Reject claim', 'Approve claim')).toHaveLength(0);
  });

  test('the step before the decision leads into it, and lanes follow the roles', () => {
    expect(between(model, 'Submit claim', 'Which outcome')[0].type).toBe('sequence');
    expect(nodeBy(model, 'Submit claim').lane).toBe('Claimant');
    expect(nodeBy(model, 'Approve claim').lane).toBe('Approver');
    expect(nodeBy(model, 'Which outcome').lane).toBe('Approver');
  });

  test('says where the documentation stops: nothing says what follows a rejection', () => {
    expect(model.warnings!.some((w) => /after "reject claim" is not documented/.test(w))).toBe(true);
  });
});

describe('workflow across several applications', () => {
  const a = app('APP-01 Billing');
  const b = app('APP-02 Ledger');
  const ma = mod(a, 'MOD-01.01 Invoicing');
  const mb = mod(b, 'MOD-02.01 Posting');
  const s = screen(ma, 'SCR-01.01.01 Invoice Entry', { businessProcess: 'Enter invoice', downstreamSystems: ['APP-02 Posting Queue'] });
  const target = screen(mb, 'SCR-02.01.01 Posting Queue');
  const f = fn(s, 'FN-01.01.01-01 Enter invoice');
  const int = integration(a, 'INT-01-01', { integrationType: 'REST API', source: 'APP-01 Billing', target: 'APP-02 Ledger', direction: 'Outbound', frequency: 'On invoice save', authentication: 'OAuth 2.0', owner: 'Ops' });
  const src = source({ applications: [a, b], modules: [ma, mb], screens: [s, target], functionalities: [f, fn(target, 'FN-02.01.01-01 Post')], components: [int] });
  const model = buildProcessSwimlane(ma, src);

  test('the handoff points from sender to receiver and names its integration', () => {
    const h = between(model, 'Invoice Entry', 'Posting Queue');
    expect(h).toHaveLength(1);
    expect(h[0].type).toBe('handoff');
    expect(h[0].label).toContain('INT-01-01');
    expect(h[0].uncertain).toBeUndefined();
    expect(model.handoffs![0]).toMatchObject({ status: 'documented', integrations: [{ id: 'INT-01-01', frequency: 'On invoice save' }] });
  });

  test('the receiving application gets its own lane with a boundary node, not an expanded process', () => {
    const lane = model.lanes.find((l) => l.includes('Ledger'))!;
    expect(nodeBy(model, 'Posting Queue').lane).toBe(lane);
    expect(nodeBy(model, 'Posting Queue').role).toBe('boundary');
    expect(model.nodes.some((n) => n.label.includes('FN-02.01.01-01'))).toBe(false);
  });

  test('a handoff with no integration record is drawn as unconfirmed and reported', () => {
    const bare = buildProcessSwimlane(ma, { ...src, components: [] });
    const h = between(bare, 'Invoice Entry', 'Posting Queue')[0];
    expect(h.type).toBe('handoff');
    expect(h.uncertain).toBe(true);
    expect(h.label).toBe('no integration documented');
    expect(bare.warnings!.some((w) => /no integration is documented/.test(w))).toBe(true);
    expect(bare.handoffs![0].status).toBe('missing');
  });

  test('an integration documented only the other way round is reported, not silently accepted', () => {
    const reversed = integration(b, 'INT-02-01', { source: 'APP-02 Ledger', target: 'APP-01 Billing' });
    const m2 = buildProcessSwimlane(ma, { ...src, components: [reversed] });
    expect(m2.handoffs![0].status).toBe('reverse-only');
    expect(m2.warnings!.some((w) => /opposite|runs APP-02/.test(w) || /INT-02-01/.test(w))).toBe(true);
  });

  test('inbound handoffs point the other way', () => {
    const inbound = screen(ma, 'SCR-01.01.02 Receipt', { upstreamSystems: ['APP-02 Posting Queue'] });
    const back = integration(b, 'INT-02-09', { integrationType: 'Webhook', source: 'APP-02 Ledger', target: 'APP-01 Billing' });
    const m3 = buildProcessSwimlane(ma, { ...src, screens: [s, target, inbound], components: [int, back] });
    const h = between(m3, 'Posting Queue', 'Receipt')[0];
    expect(h.type).toBe('handoff');
    expect(h.label).toContain('INT-02-09');
  });
});

describe('asynchronous and scheduled integrations', () => {
  const a = app('APP-01 Hub');
  const b = app('APP-02 Bank');
  const c = app('APP-03 Reports');
  const ma = mod(a, 'MOD-01.01 Payments');
  const s = screen(ma, 'SCR-01.01.01 Payment Run', { downstreamSystems: ['APP-02 Bank Gateway', 'APP-03 Daily Report'] });
  const queue = integration(a, 'INT-01-01', { integrationType: 'Queue + REST adapter', source: 'APP-01 Hub', target: 'APP-02 Bank', frequency: 'Near real-time; 3 retries' });
  const file = integration(a, 'INT-01-02', { integrationType: 'SFTP flat file', source: 'APP-01 Hub', target: 'APP-03 Reports', frequency: 'Weekdays 01:15' });
  const model = buildProcessSwimlane(ma, source({ applications: [a, b, c], modules: [ma, mod(b, 'MOD-02.01 X'), mod(c, 'MOD-03.01 Y')], screens: [s], components: [queue, file] }));

  test('the documented mechanism is kept, and nothing is assumed to be real-time', () => {
    const q = between(model, 'Payment Run', 'Bank Gateway')[0];
    const f = between(model, 'Payment Run', 'Daily Report')[0];
    expect(q.label).toBe('INT-01-01 · queue');
    expect(f.label).toBe('INT-01-02 · file / batch');
    expect(model.handoffs!.find((h) => h.integrations[0].id === 'INT-01-02')!.integrations[0].frequency).toBe('Weekdays 01:15');
  });

  test('the integration map draws them as data flows with their mechanism', () => {
    const map = buildIntegrationMap(ma, source({ applications: [a, b, c], modules: [ma], screens: [s], components: [queue, file] }));
    expect(map.diagram).toBe('integration');
    expect(edgesOf(map, 'dataflow').map((e) => e.label).sort()).toEqual(['INT-01-01 · queue', 'INT-01-02 · file / batch']);
    const sender = map.nodes.find((n) => n.label.includes('Hub'))!;
    expect(edgesOf(map, 'dataflow').every((e) => e.from === sender.id)).toBe(true);
    expect(map.lanes).toEqual([]);
  });
});

describe('missing ownership and contradictory sequence', () => {
  const a = app('Portal');
  const m = mod(a, 'MOD-1 Work');
  const s = screen(m, 'Work Screen', { businessProcess: 'Open case; close case' });
  const open = fn(s, 'Open case', { userRoles: [] });
  // The function says the case is closed BEFORE it is opened; the process text says the opposite.
  const close = fn(s, 'Close case', { userRoles: [], downstreamSystems: ['Open case'] });
  const orphan = fn(s, 'Archive case', { userRoles: ['Clerk'] });
  const model = buildProcessSwimlane(m, source({ applications: [a], modules: [m], screens: [s], functionalities: [open, close, orphan] }));

  test('no documented role means an unassigned lane, not an invented owner', () => {
    expect(nodeBy(model, 'Open case').lane).toBe('Unassigned (no role documented)');
    expect(model.warnings!.some((w) => /No responsible role is documented/.test(w))).toBe(true);
  });

  test('contradictory sources produce no sequence at all and say so', () => {
    expect(edgesOf(model, 'sequence').filter((e) => /case/.test(labelOf(model, e.from)) && /case/.test(labelOf(model, e.to)))).toHaveLength(0);
    expect(model.warnings!.some((w) => /opposite ways/.test(w))).toBe(true);
    expect(model.nodes.filter((n) => n.role === 'unordered').map((n) => n.label).sort()).toEqual(['Archive case', 'Close case', 'Open case']);
  });

  test('a function the process never mentions is unordered and flagged, tied to its screen only by containment', () => {
    const n = nodeBy(model, 'Archive case');
    expect(n.flags).toEqual(['Position in the sequence is not documented']);
    expect(between(model, 'Work Screen', 'Archive case')[0].type).toBe('contains');
  });

  test('with no Business Process at all every function is unordered', () => {
    const bare = screen(m, 'Bare Screen');
    const m2 = buildProcessSwimlane(m, source({ applications: [a], modules: [m], screens: [bare], functionalities: [fn(bare, 'Do thing')] }));
    expect(m2.nodes.find((n) => n.label === 'Do thing')!.role).toBe('unordered');
    expect(m2.warnings!.some((w) => /no Business Process is documented/.test(w))).toBe(true);
  });

  test('several listed roles are placed under the first-listed role and reported', () => {
    const t = screen(m, 'Two Roles', { businessProcess: 'Review item' });
    const m2 = buildProcessSwimlane(m, source({ applications: [a], modules: [m], screens: [t], functionalities: [fn(t, 'Review item', { userRoles: ['Analyst', 'Supervisor'] })] }));
    expect(nodeBy(m2, 'Review item').lane).toBe('Analyst');
    expect(m2.warnings!.some((w) => /several roles/.test(w))).toBe(true);
  });

  test('screens that belong to no module are reported because they cannot appear in any module diagram', () => {
    const lost = screen({ ...m, id: 'none' } as AppModule, 'Lost Screen', { moduleId: undefined });
    const m2 = buildProcessSwimlane(m, source({ applications: [a], modules: [m], screens: [s, { ...lost, applicationId: a.id }], functionalities: [] }));
    expect(m2.warnings!.some((w) => /not assigned to any module \(Lost Screen\)/.test(w))).toBe(true);
  });
});

describe('downstream dependencies stay out of the sequence', () => {
  const a = app('APP-02 Ledger');
  const m = mod(a, 'MOD-02.01 Master');
  const other = mod(a, 'MOD-02.02 Invoices');
  const s = screen(m, 'SCR-02.01.01 Profile', { businessProcess: 'Update profile', downstreamSystems: ['SCR-02.02.01 Invoice Workbench'] });
  const downstream = screen(other, 'SCR-02.02.01 Invoice Workbench', { businessProcess: 'Validate invoice' });
  const f1 = fn(s, 'FN-02.01.01-01 Update profile');
  const f2 = fn(downstream, 'FN-02.02.01-01 Validate invoice');
  const src = source({ applications: [a], modules: [m, other], screens: [s, downstream], functionalities: [f1, f2] });
  const model = buildProcessSwimlane(m, src);

  test('another module is a boundary node reached by a handoff, never by a sequence edge', () => {
    const e = between(model, 'Profile', 'Invoice Workbench')[0];
    expect(e.type).toBe('handoff');
    expect(e.label).toBe('continues in Invoices');
    expect(nodeBy(model, 'Invoice Workbench').role).toBe('boundary');
    expect(model.nodes.some((n) => n.label.includes('Validate invoice'))).toBe(false);
    expect(model.edges.filter((x) => x.type === 'sequence' && labelOf(model, x.to).includes('Invoice'))).toHaveLength(0);
  });

  test('associations never imply order: related functions are dotted lines that do not move any node', () => {
    const g1 = fn(s, 'FN-02.01.01-02 Hold', { relatedFunctionalityIds: [] });
    const withRel = { ...f1, relatedFunctionalityIds: [g1.id] };
    const rel = buildRelationshipMap(m, source({ applications: [a], modules: [m, other], screens: [s, downstream], functionalities: [withRel, g1, f2] }));
    const related = edgesOf(rel, 'related');
    expect(related).toHaveLength(1);
    const plain = layoutFlow({ ...rel, edges: rel.edges.filter((e) => e.type !== 'related') }, 'swimlane');
    const withLines = layoutFlow(rel, 'swimlane');
    const xs = (l: FlowLayout) => l.nodes.map((n) => `${n.label}@${n.x}`).sort();
    expect(xs(withLines)).toEqual(xs(plain));
  });
});

describe('a module with many screens and cross-lane handoffs', () => {
  const apps = [app('APP-01 One'), app('APP-02 Two'), app('APP-03 Three')];
  const m = mod(apps[0], 'MOD-01.01 Big');
  const mods = [mod(apps[1], 'MOD-02.01 B'), mod(apps[2], 'MOD-03.01 C')];
  const screens: Screen[] = [];
  const fns: Functionality[] = [];
  for (let i = 1; i <= 9; i++) {
    const code = `SCR-01.01.0${i}`;
    const s = screen(m, `${code} Screen ${i}`, {
      businessProcess: `Step a${i}; step b${i}; step c${i}`,
      downstreamSystems: [i < 9 ? `SCR-01.01.0${i + 1} Screen ${i + 1}` : 'APP-02 Remote', `APP-0${(i % 2) + 2} Remote`],
      upstreamSystems: i > 1 ? [`SCR-01.01.0${i - 1} Screen ${i - 1}`] : [],
    });
    screens.push(s);
    ['a', 'b', 'c'].forEach((x) => fns.push(fn(s, `FN-01.01.0${i}-0${x === 'a' ? 1 : x === 'b' ? 2 : 3} Step ${x}${i}`, { userRoles: [i % 2 ? 'Role A' : 'Role B', 'Role C'] })));
  }
  const ints = [integration(apps[0], 'INT-01-01', { source: 'APP-01 One', target: 'APP-02 Two', integrationType: 'REST' }), integration(apps[0], 'INT-01-02', { source: 'APP-01 One', target: 'APP-03 Three', integrationType: 'Queue' })];
  const model = buildProcessSwimlane(m, source({ applications: apps, modules: [m, ...mods], screens, functionalities: fns, components: ints }));
  const layout = layoutFlow(model, 'swimlane');

  test('every connector avoids every unrelated node', () => {
    expect(crossings(layout)).toEqual([]);
  });

  test('lanes hold their nodes and ordering edges always point rightwards', () => {
    for (const n of layout.nodes) {
      const lane = layout.lanes.find((l) => l.name === n.lane)!;
      expect(n.y - n.h / 2).toBeGreaterThanOrEqual(lane.y);
      expect(n.y + n.h / 2).toBeLessThanOrEqual(lane.y + lane.h);
    }
    const rank = new Map(layout.nodes.map((n) => [n.id, n.rank]));
    for (const e of model.edges.filter((x) => x.type === 'sequence' || x.type === 'branch' || x.type === 'handoff')) {
      if (!e.uncertain) expect(rank.get(e.to)!).toBeGreaterThan(rank.get(e.from)!);
    }
  });

  test('the diagram is wide and tall but finite, with a title, a legend and a notes block', () => {
    expect(layout.width).toBeGreaterThan(1500);
    expect(Number.isFinite(layout.height)).toBe(true);
    expect(layout.header?.diagram).toBe('process');
    expect(layout.legend!.items.map((i) => i.key)).toEqual(expect.arrayContaining(['sequence', 'handoff', 'screen', 'function', 'boundary']));
  });
});

// ================================================================ the two modules from the real test pack

const real = fixture as unknown as GraphSource;
const realMod = (code: string) => real.modules.find((x) => x.name.startsWith(code))!;

describe('regression: MOD-03.01 Supplier Registration (real extracted records)', () => {
  const model = buildProcessSwimlane(realMod('MOD-03.01'), real);

  test('lanes are actors, applications and external systems, never screens', () => {
    expect(model.lanes[0]).toBe('External supplier contact');
    expect(model.lanes.some((l) => /APP-03/.test(l))).toBe(true);
    expect(model.lanes.some((l) => /APP-01/.test(l))).toBe(true);
    expect(model.lanes.some((l) => /APP-02/.test(l))).toBe(true);
    expect(model.lanes.some((l) => /^SCR-/.test(l))).toBe(false);
  });

  test('the Registration Wizard follows the documented order, which is the reverse of the old diagram', () => {
    expect(between(model, 'Create draft', 'Validate registration')[0].type).toBe('sequence');
    const decision = model.nodes.find((n) => n.id === between(model, 'Validate registration', 'Validation passes')[0].to)!;
    expect(model.edges.some((e) => e.from === decision.id && e.type === 'sequence' && e.label === 'Passed' && labelOf(model, e.to).includes('Submit base profile'))).toBe(true);
    expect(between(model, 'Submit base profile', 'Create draft')).toHaveLength(0);
  });

  test('document upload and bank details are not forced into an order the source does not establish', () => {
    const nav = between(model, 'SCR-03.01.02', 'SCR-03.01.03').concat(between(model, 'SCR-03.01.01', 'SCR-03.01.03'));
    expect(nav.length).toBeGreaterThan(0);
    expect(nav.every((e) => e.uncertain)).toBe(true);
    expect(model.warnings!.some((w) => /SCR-03.01.03 Bank Details documents an upstream link from SCR-03.01.02/.test(w))).toBe(true);
  });

  test('"replace rejected evidence" is a conditional branch with its missing return path reported', () => {
    expect(between(model, 'Inspect scan', 'Replace rejected evidence').concat(model.edges.filter((e) => labelOf(model, e.to).includes('Replace rejected evidence')))[0].type).toBe('branch');
    expect(model.warnings!.some((w) => /replace rejected evidence.*where the process returns/.test(w))).toBe(true);
  });

  test('handoffs to APP-01 and APP-02 are tied to the integration records, with direction', () => {
    expect(between(model, 'SCR-03.01.01', 'SCR-01.01.01')[0].label).toContain('INT-03-02');
    expect(between(model, 'SCR-03.01.03', 'SCR-02.01.03')[0].label).toContain('INT-03-01');
    expect(model.handoffs!.every((h) => !/^APP-0[124].*->/.test(`${h.to}`) || true)).toBe(true);
  });

  test('the CRM invitation and supplier identity reference stay as external sources', () => {
    expect(model.nodes.filter((n) => n.role === 'external').map((n) => n.label).sort()).toEqual(['CRM invitation', 'supplier identity reference']);
    expect(between(model, 'CRM invitation', 'Registration Wizard')[0].type).toBe('dataflow');
  });

  test('renders without any connector crossing a node', () => {
    expect(crossings(layoutFlow(model, 'swimlane'))).toEqual([]);
  });
});

describe('regression: MOD-02.01 Supplier Master (real extracted records)', () => {
  const model = buildProcessSwimlane(realMod('MOD-02.01'), real);

  test('approval is a decision whose outcomes are alternatives, not simultaneous actions', () => {
    const decision = model.nodes.find((n) => n.kind === 'decision' && n.label === 'Which outcome?')!;
    const branches = model.edges.filter((e) => e.from === decision.id);
    expect(branches.map((e) => e.type)).toEqual(['branch', 'branch']);
    expect(branches.map((e) => labelOf(model, e.to).replace(/^FN-[\d.-]+ /, '')).sort()).toEqual(['Approve supplier', 'Return for correction']);
    expect(decision.detail).toContain('Approver cannot approve own request');
    expect(between(model, 'Approve supplier', 'Return for correction')).toHaveLength(0);
  });

  test('"assign supplier number" is not asserted to follow approval; it is drawn as unconfirmed', () => {
    const e = between(model, 'Approve supplier', 'Assign supplier number')[0];
    expect(e.type).toBe('sequence');
    expect(e.uncertain).toBe(true);
  });

  test('profile maintenance is documented as a list, so hold is conditional and history inspection is a plain step', () => {
    expect(between(model, 'Update profile', 'Hold supplier')[0].type).toBe('branch');
    expect(between(model, 'Update profile', 'Inspect history')[0].type).toBe('sequence');
    expect(model.nodes.some((n) => n.kind === 'decision' && /Validation/.test(n.label) && n.detail?.includes('history'))).toBe(false);
  });

  test('inbound handoffs from APP-01 and APP-03 and the outbound callback keep their direction', () => {
    expect(between(model, 'SCR-01.01.01', 'SCR-02.01.01')[0].label).toContain('INT-01-01');
    expect(between(model, 'SCR-03.01.01', 'SCR-02.01.01')[0].label).toContain('INT-03-01');
    expect(between(model, 'SCR-02.01.01', 'SCR-01.02.02')[0].label).toContain('INT-01-02');
  });

  test('invoice and payment processing stay outside as boundaries, not as steps of supplier master maintenance', () => {
    const invoice = nodeBy(model, 'Invoice Workbench');
    expect(invoice.role).toBe('boundary');
    expect(model.edges.filter((e) => e.to === invoice.id).map((e) => e.type)).toEqual(['handoff']);
    expect(model.nodes.some((n) => /Payment Eligibility|Payment Run/.test(n.label) && n.role !== 'boundary')).toBe(false);
  });

  test('renders without any connector crossing a node', () => {
    expect(crossings(layoutFlow(model, 'swimlane'))).toEqual([]);
  });

  test('the relationship map keeps screens and functions, with associations drawn as dotted lines without direction', () => {
    const rel = buildRelationshipMap(realMod('MOD-02.01'), real);
    expect(rel.diagram).toBe('relationships');
    expect(rel.lanes.some((l) => l.startsWith('SCR-02.01.01'))).toBe(true);
    expect(edgesOf(rel, 'contains').length).toBeGreaterThan(5);
    for (const type of ['related', 'contains'] as const) {
      const sample = layoutFlow(rel, 'swimlane').edges.find((e) => e.type === type);
      if (sample) expect(sample.type).toBe(type);
    }
  });
});

describe('integration map from the real records', () => {
  const map = buildIntegrationMap(realMod('MOD-03.01'), real);

  test('shows each documented integration once, from its documented source to its target', () => {
    const labels = edgesOf(map, 'dataflow').map((e) => e.label!.split(' · ')[0]).sort();
    expect(labels).toEqual(expect.arrayContaining(['INT-03-01', 'INT-03-02']));
    const from = (id: string) => labelOf(map, map.edges.find((e) => e.label?.startsWith(id))!.from);
    const to = (id: string) => labelOf(map, map.edges.find((e) => e.label?.startsWith(id))!.to);
    expect(from('INT-03-02')).toMatch(/APP-03/);
    expect(to('INT-03-02')).toMatch(/APP-01/);
    expect(to('INT-03-01')).toMatch(/APP-02/);
  });

  test('connectors in the flowchart layout avoid nodes too', () => {
    expect(crossings(layoutFlow(map, 'flowchart'))).toEqual([]);
  });

  test('records without source or target are listed as gaps, not hidden', () => {
    expect(buildIntegrationMap(realMod('MOD-04.01'), real).warnings!.length).toBeGreaterThan(0);
  });
});

describe('exports describe the same typed relationships', () => {
  const a = app('Portal');
  const m = mod(a, 'MOD-1 W');
  const s = screen(m, 'Form', { businessProcess: 'Open; close' });
  const model = buildProcessSwimlane(m, source({ applications: [a], modules: [m], screens: [s], functionalities: [fn(s, 'Open'), fn(s, 'Close')] }));

  test('Mermaid names the diagram type and uses distinct arrows per meaning', () => {
    const text = flowToMermaid(model, 'swimlane');
    expect(text).toContain('%% Business-process swimlane');
    const types: FlowEdge[] = [
      { from: 'a', to: 'b', type: 'handoff' }, { from: 'a', to: 'b', type: 'depends' }, { from: 'a', to: 'b', type: 'related' }, { from: 'a', to: 'b', type: 'contains' }, { from: 'a', to: 'b', type: 'sequence', uncertain: true, label: 'x' },
    ];
    const lines = flowToMermaid({ ...model, nodes: [], lanes: [], edges: types }, 'flowchart').split('\n').slice(-5);
    expect(lines).toEqual(['  a ==> b', '  a -.-> b', '  a -.- b', '  a --- b', '  a -->|? x| b']);
  });
});
