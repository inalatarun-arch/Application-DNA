import { EXTRACTION_SCHEMA, mergeExtractions, normalizeApplicationExtraction, type ApplicationExtraction } from './extractionModel';
import { asRecord, safeTrim } from './safeValue';
import type { DocPart } from './docStructure';

/**
 * Multi-application extraction: one AI answer can describe screens, functionalities and technical components for
 * several applications at once, each item tagged with the application it belongs to. This file holds the response
 * schema, the code that makes the answer safe, and the merging of many answers (one per part of a long document).
 */

const S = { type: 'STRING' } as const;
const P = EXTRACTION_SCHEMA.properties;

export const CATALOGUE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    applications: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { applicationName: S, modules: P.modules, screens: P.screens, functionalities: P.functionalities, technicalComponents: P.technicalComponents },
        required: ['applicationName'],
      },
    },
  },
  required: ['applications'],
} as const;

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Which roster application an answer's name refers to: exact, then one containing the other. */
export function resolveApplication(name: string, roster: string[]): string | null {
  const k = key(name);
  if (!k) return null;
  const exact = roster.find((r) => key(r) === k);
  if (exact) return exact;
  const loose = roster.filter((r) => { const rk = key(r); return rk && (rk.includes(k) || k.includes(rk)); });
  return loose.length === 1 ? loose[0] : null;
}

export interface PartAnswer {
  perApp: Map<string, ApplicationExtraction>;
  /** Items the model attached to a name that is not on the roster. */
  unmatched: number;
}

/** Reads one raw answer. Nothing outside the roster is kept, so a stray application name can never create records. */
export function normalizeCatalogue(raw: unknown, roster: string[]): PartAnswer {
  const list = Array.isArray(asRecord(raw).applications) ? (asRecord(raw).applications as unknown[]) : [];
  const perApp = new Map<string, ApplicationExtraction>();
  let unmatched = 0;
  for (const entry of list) {
    const rec = asRecord(entry);
    const plan = normalizeApplicationExtraction(rec);
    const size = plan.modules.length + plan.screens.length + plan.functionalities.length + plan.technicalComponents.length;
    const target = resolveApplication(safeTrim(rec.applicationName), roster);
    if (!target) { unmatched += size; continue; }
    plan.application = {};
    perApp.set(target, perApp.has(target) ? mergeExtractions([perApp.get(target)!, plan]) : plan);
  }
  return { perApp, unmatched };
}

// ------------------------------------------------------------------ source IDs

/** "SCR-01.01.01 Supplier Request" -> "SCR-01.01.01". Names without a leading identifier give ''. */
export function leadingId(name: string): string {
  const m = /^([A-Za-z]{2,6}-[A-Za-z0-9.]+(?:-[A-Za-z0-9.]+)*)(?=\s|$|[:—–-]\s)/.exec(name.trim());
  // "APP-03" is an application code that many different items start with, not the identifier of one item.
  return m && !/^APP-\d+$/i.test(m[1]) ? m[1].toUpperCase() : '';
}

/**
 * Specifications restate the same item in several places (a screen list, a design section, a test). Items that carry
 * the same source ID are one item whatever the model called it; every name, and every reference to it, is made to
 * use the first full name seen, so merging collapses them instead of keeping duplicates.
 */
/** "SCR-01.01.01 Supplier Request" -> "supplier request": the name without its identifier, for matching restatements. */
const stripId = (name: string): string => {
  const id = leadingId(name);
  return key(id ? name.trim().slice(id.length).replace(/^[\s:—–-]+/, '') : name);
};

export function canonicaliseIds(plans: ApplicationExtraction[]): ApplicationExtraction[] {
  const byId = new Map<string, string>();
  // "AP_SUPPLIER" restated in a design section is the item "OBJ-02-01 AP_SUPPLIER" when no other item claims that bare name.
  const byBare = new Map<string, string | null>();
  const note = (n: string) => {
    const id = leadingId(n);
    if (!id) return;
    if (!byId.has(id)) byId.set(id, n.trim());
    const bare = stripId(n);
    if (bare) byBare.set(bare, byBare.has(bare) && byBare.get(bare) !== byId.get(id) ? null : byId.get(id)!);
  };
  for (const p of plans) {
    p.modules.forEach((x) => note(x.name)); p.screens.forEach((x) => note(x.name));
    p.functionalities.forEach((x) => note(x.name)); p.technicalComponents.forEach((x) => note(x.name));
  }
  const fix = (n: string) => {
    const id = leadingId(n);
    if (id) return byId.get(id) ?? n;
    return byBare.get(key(n)) ?? n;
  };
  const fixAll = (ns: string[]) => ns.map(fix);
  return plans.map((p) => ({
    ...p,
    modules: p.modules.map((x) => ({ ...x, name: fix(x.name), matchName: fix(x.matchName) })),
    screens: p.screens.map((x) => ({ ...x, name: fix(x.name), matchName: fix(x.matchName), moduleName: fix(x.moduleName), relatedScreenNames: fixAll(x.relatedScreenNames) })),
    functionalities: p.functionalities.map((x) => ({ ...x, name: fix(x.name), matchName: fix(x.matchName), screenName: fix(x.screenName), moduleName: fix(x.moduleName), relatedFunctionalityNames: fixAll(x.relatedFunctionalityNames) })),
    technicalComponents: p.technicalComponents.map((x) => ({ ...x, name: fix(x.name), matchName: fix(x.matchName), functionalityNames: fixAll(x.functionalityNames), screenNames: fixAll(x.screenNames), dependsOnNames: fixAll(x.dependsOnNames) })),
  }));
}

/** The numbers inside an identifier: "SCR-02.01.03" -> [2, 1, 3]. */
const idNumbers = (name: string): number[] => (leadingId(name).match(/\d+/g) ?? []).map(Number);

/**
 * A screen the AI left without a module is placed under the module whose identifier numbers begin the screen's own
 * (MOD-02.01 holds SCR-02.01.03), which is how the specification's own numbering expresses membership. Only a single,
 * unambiguous match is used, and every repair is reported so it can be checked.
 */
export function repairModules(plan: ApplicationExtraction, repairs: string[] = []): ApplicationExtraction {
  const mods = plan.modules.map((m) => ({ name: m.name, nums: idNumbers(m.name) })).filter((m) => m.nums.length);
  return {
    ...plan,
    screens: plan.screens.map((s) => {
      if (s.moduleName) return s;
      const nums = idNumbers(s.name);
      const hits = mods.filter((m) => m.nums.length < nums.length && m.nums.every((n, i) => n === nums[i]));
      const best = hits.filter((h) => h.nums.length === Math.max(...hits.map((x) => x.nums.length)));
      if (best.length !== 1) return s;
      repairs.push(`${s.name} had no module; placed under ${best[0].name} (its identifier numbers fall under that module's).`);
      return { ...s, moduleName: best[0].name };
    }),
  };
}

/** Merges every part's answer into one plan per application. */
export function mergeAnswers(answers: PartAnswer[], roster: string[], repairs: string[] = []): Map<string, ApplicationExtraction> {
  const out = new Map<string, ApplicationExtraction>();
  for (const app of roster) {
    const plans = answers.map((a) => a.perApp.get(app)).filter((p): p is ApplicationExtraction => !!p);
    if (plans.length) out.set(app, repairModules(mergeExtractions(canonicaliseIds(plans)), repairs));
  }
  return out;
}

// ------------------------------------------------------------------ summary

export interface PlanCounts {
  modules: number;
  screens: number;
  functionalities: number;
  integrations: number;
  /** Tables, views, procedures and triggers. */
  database: number;
  /** REST, SOAP and other API endpoints. */
  apis: number;
  /** Everything else: services, jobs, servers, classes ... */
  components: number;
}

export function countPlan(plan: ApplicationExtraction): PlanCounts {
  const c: PlanCounts = { modules: plan.modules.length, screens: plan.screens.length, functionalities: plan.functionalities.length, integrations: 0, database: 0, apis: 0, components: 0 };
  for (const t of plan.technicalComponents) {
    if (t.kind === 'integration') c.integrations++;
    else if (t.kind === 'table' || t.kind === 'view' || t.kind === 'procedure' || t.kind === 'trigger') c.database++;
    else if (t.kind === 'rest' || t.kind === 'soap' || t.kind === 'api') c.apis++;
    else c.components++;
  }
  return c;
}

export const sumCounts = (list: PlanCounts[]): PlanCounts => list.reduce((a, b) => ({
  modules: a.modules + b.modules, screens: a.screens + b.screens, functionalities: a.functionalities + b.functionalities,
  integrations: a.integrations + b.integrations, database: a.database + b.database, apis: a.apis + b.apis, components: a.components + b.components,
}), { modules: 0, screens: 0, functionalities: 0, integrations: 0, database: 0, apis: 0, components: 0 });

// ------------------------------------------------------------------ which parts of a document are worth reading

/** Sections that record how the project is being tested or approved say nothing new about the applications themselves. */
const PROJECT_ONLY = /^\W*(?:\d+\.?\s*|[A-Z]\.?\s*)?(test cases?|defects?|requirements? traceability|traceability matrix|approval matrix|glossary|appendix|document control|table of contents|revision history|change log)\b/i;

export function isProjectOnlyPart(part: DocPart): boolean {
  const title = part.path[0] ?? /^#+\s*(.*)$/.exec(part.text.split('\n', 1)[0] ?? '')?.[1] ?? '';
  return PROJECT_ONLY.test(title.trim());
}
