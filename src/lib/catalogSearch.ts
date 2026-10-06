import { db } from '@/db/db';
import type { AppModule, Application, Functionality, Screen } from '@/db/types';

export interface CatalogData {
  applications: Application[];
  modules: AppModule[];
  screens: Screen[];
  functionalities: Functionality[];
}

export type CatalogKind = 'screen' | 'functionality';

export interface CatalogHit {
  kind: CatalogKind;
  id: string;
  name: string;
  applicationId: string;
  applicationName: string;
  /** "Application › Module" for screens, "Application › Module › Screen" for functionalities. */
  path: string;
  matchedIn?: string;
  score: number;
  to: string;
}

export async function loadCatalogData(): Promise<CatalogData> {
  const [applications, modules, screens, functionalities] = await Promise.all([
    db.applications.toArray(),
    db.modules.toArray(),
    db.screens.toArray(),
    db.functionalities.toArray(),
  ]);
  return { applications, modules, screens, functionalities };
}

interface SearchField {
  label: string;
  text: string;
  weight: number;
}

const lines = (xs: string[]) => xs.join('\n');

function screenFields(s: Screen): SearchField[] {
  return [
    { label: 'Name', text: s.name, weight: 5 },
    { label: 'Purpose', text: s.purpose, weight: 3 },
    { label: 'Description', text: s.description, weight: 2 },
    { label: 'Business process', text: s.businessProcess, weight: 2 },
    { label: 'Owners', text: `${s.businessOwner} ${s.functionalOwner}`, weight: 2 },
    { label: 'Navigation path', text: s.navigationPath, weight: 2 },
    { label: 'Field descriptions', text: lines(s.fieldDescriptions.map((r) => `${r.field} ${r.description}`)), weight: 1 },
    { label: 'Validation rules', text: lines(s.validationRules), weight: 1 },
    { label: 'Workflow steps', text: lines(s.workflowSteps), weight: 1 },
    { label: 'Approval logic', text: s.approvalLogic, weight: 1 },
    { label: 'Exception handling', text: lines(s.exceptionHandling), weight: 1 },
    { label: 'Dependencies', text: lines([...s.upstreamSystems, ...s.downstreamSystems]), weight: 1 },
  ];
}

function functionalityFields(f: Functionality): SearchField[] {
  return [
    { label: 'Name', text: f.name, weight: 5 },
    { label: 'Description', text: f.description, weight: 3 },
    { label: 'Business purpose', text: f.businessPurpose, weight: 2 },
    { label: 'User roles', text: lines(f.userRoles), weight: 2 },
    { label: 'Triggers', text: lines(f.triggers), weight: 1 },
    { label: 'Inputs', text: lines(f.inputs), weight: 1 },
    { label: 'Outputs', text: lines(f.outputs), weight: 1 },
    { label: 'Dependencies', text: lines([...f.upstreamSystems, ...f.downstreamSystems]), weight: 1 },
    {
      label: 'Exception scenarios',
      text: lines([...f.exceptions.validation, ...f.exceptions.error, ...f.exceptions.business, ...f.exceptions.system]),
      weight: 1,
    },
    { label: 'Process flow', text: f.processFlow, weight: 1 },
  ];
}

/** Every token must match somewhere (AND). Score favours matches in names over matches in details. */
function score(fields: SearchField[], tokens: string[]): { score: number; matchedIn?: string } | null {
  if (tokens.length === 0) return { score: 0 };
  const lowered = fields.map((f) => ({ ...f, lower: f.text.toLowerCase() }));
  let total = 0;
  let firstLabel: string | undefined;
  for (const token of tokens) {
    let bestWeight = 0;
    let bestLabel = '';
    for (const f of lowered) {
      if (f.weight > bestWeight && f.lower.includes(token)) {
        bestWeight = f.weight;
        bestLabel = f.label;
      }
    }
    if (bestWeight === 0) return null;
    total += bestWeight;
    firstLabel ??= bestLabel;
  }
  return { score: total, matchedIn: firstLabel && firstLabel !== 'Name' ? firstLabel : undefined };
}

export interface SearchOptions {
  query: string;
  applicationId?: string;
  kind?: CatalogKind | 'all';
  limit?: number;
}

export function searchCatalog(data: CatalogData, opts: SearchOptions): CatalogHit[] {
  const tokens = opts.query.toLowerCase().split(/\s+/).filter(Boolean);
  const kind = opts.kind ?? 'all';
  const apps = new Map(data.applications.map((a) => [a.id, a]));
  const mods = new Map(data.modules.map((m) => [m.id, m]));
  const screens = new Map(data.screens.map((s) => [s.id, s]));
  const hits: CatalogHit[] = [];

  const pathFor = (applicationId: string, moduleId?: string, screenName?: string) =>
    [apps.get(applicationId)?.name, moduleId ? mods.get(moduleId)?.name : undefined, screenName].filter(Boolean).join(' › ');

  if (kind !== 'functionality') {
    for (const s of data.screens) {
      if (opts.applicationId && s.applicationId !== opts.applicationId) continue;
      const result = score(screenFields(s), tokens);
      if (!result) continue;
      hits.push({
        kind: 'screen',
        id: s.id,
        name: s.name,
        applicationId: s.applicationId,
        applicationName: apps.get(s.applicationId)?.name ?? 'Unknown application',
        path: pathFor(s.applicationId, s.moduleId),
        matchedIn: result.matchedIn,
        score: result.score,
        to: `/applications/${s.applicationId}/screens/${s.id}`,
      });
    }
  }

  if (kind !== 'screen') {
    for (const f of data.functionalities) {
      if (opts.applicationId && f.applicationId !== opts.applicationId) continue;
      if (!f.screenId) continue;
      const result = score(functionalityFields(f), tokens);
      if (!result) continue;
      const screen = screens.get(f.screenId);
      hits.push({
        kind: 'functionality',
        id: f.id,
        name: f.name,
        applicationId: f.applicationId,
        applicationName: apps.get(f.applicationId)?.name ?? 'Unknown application',
        path: pathFor(f.applicationId, f.moduleId, screen?.name),
        matchedIn: result.matchedIn,
        score: result.score,
        to: `/applications/${f.applicationId}/screens/${f.screenId}?tab=functionalities&open=${f.id}`,
      });
    }
  }

  hits.sort((a, b) => b.score - a.score || a.applicationName.localeCompare(b.applicationName) || a.name.localeCompare(b.name));
  return hits.slice(0, opts.limit ?? 300);
}
