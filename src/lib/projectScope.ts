import { layerOf, type Layer } from '@/config/technical';
import type { Functionality, Meeting, Project, Requirement, RequirementCandidate, Screen, TechnicalComponent } from '@/db/types';
import { dependencyClosure, type TechnicalGraph } from './techUsage';
import type { GraphSource } from './graphModel';

export interface ProjectScope {
  screens: Screen[];
  functionalities: Functionality[];
  /** Technical components tagged directly on the screens and functionalities in scope. */
  directComponents: TechnicalComponent[];
  /** Components those rely on, reached through "depends on" links. */
  dependencyComponents: Array<{ component: TechnicalComponent; via: string[] }>;
  /** Functionalities that requirements point at but that sit outside the linked modules. */
  outsideFunctionalities: Functionality[];
}

/**
 * What a project touches: the screens and functionalities of its linked modules (or whole applications when no
 * module is chosen for them), and the technical components behind them.
 */
export function computeScope(project: Project, src: GraphSource, requirements: Requirement[]): ProjectScope {
  const moduleIds = new Set(project.moduleIds ?? []);
  const appIds = new Set(project.applicationIds ?? []);
  for (const m of src.modules) if (moduleIds.has(m.id)) appIds.add(m.applicationId);

  // An application with chosen modules contributes only those modules; otherwise all of it.
  const appsWithModules = new Set(src.modules.filter((m) => moduleIds.has(m.id)).map((m) => m.applicationId));
  const inScope = (applicationId: string, moduleId?: string) =>
    appIds.has(applicationId) && (!appsWithModules.has(applicationId) || (!!moduleId && moduleIds.has(moduleId)));

  const screens = src.screens.filter((s) => inScope(s.applicationId, s.moduleId));
  const screenIds = new Set(screens.map((s) => s.id));
  const functionalities = src.functionalities.filter((f) => (f.screenId && screenIds.has(f.screenId)) || (!f.screenId && inScope(f.applicationId, f.moduleId)));
  const fnIds = new Set(functionalities.map((f) => f.id));

  const tagged = new Set(requirements.flatMap((r) => r.functionalityIds ?? []));
  const outsideFunctionalities = src.functionalities.filter((f) => tagged.has(f.id) && !fnIds.has(f.id));

  const relevantFns = new Set([...fnIds, ...outsideFunctionalities.map((f) => f.id)]);
  const directComponents = src.components.filter(
    (c) => (c.functionalityIds ?? []).some((id) => relevantFns.has(id)) || (c.screenIds ?? []).some((id) => screenIds.has(id)),
  );
  const graph: TechnicalGraph = { applications: src.applications, components: src.components, screens: src.screens, functionalities: src.functionalities };
  const dependencyComponents = dependencyClosure(new Set(directComponents.map((c) => c.id)), graph);

  return { screens, functionalities, directComponents, dependencyComponents, outsideFunctionalities };
}

export function groupByLayer<T extends { component: TechnicalComponent }>(items: T[]): Array<{ layer: Layer; items: T[] }> {
  const layers: Layer[] = ['code', 'database', 'integration'];
  return layers.map((layer) => ({ layer, items: items.filter((i) => layerOf(i.component.kind) === layer) })).filter((g) => g.items.length > 0);
}

export interface Gap {
  severity: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
}

/** Checks that need no AI: what the documentation and the backlog are still missing. */
export function computeGaps(
  scope: ProjectScope,
  requirements: Requirement[],
  meetings: Meeting[],
  candidates: RequirementCandidate[],
): Gap[] {
  const gaps: Gap[] = [];
  const pending = candidates.filter((c) => c.decision === 'pending' || c.decision === 'accepted').length;
  const unmapped = requirements.filter((r) => (r.functionalityIds ?? []).length === 0);
  const openActions = meetings.reduce((n, m) => n + (m.actionItems ?? []).filter((a) => !a.done).length, 0);
  const fnsWithoutTech = scope.functionalities.filter((f) => !scope.directComponents.some((c) => (c.functionalityIds ?? []).includes(f.id)));

  if (meetings.length === 0) gaps.push({ severity: 'high', title: 'No discovery sessions recorded', detail: 'Upload a meeting transcript so requirements can be extracted and traced to a source.' });
  if (requirements.length === 0) gaps.push({ severity: 'high', title: 'The backlog is empty', detail: 'Review the AI suggestions or add requirements manually before assessing impact.' });
  if (pending > 0) gaps.push({ severity: 'medium', title: `${pending} suggested requirement${pending === 1 ? '' : 's'} not yet in the backlog`, detail: 'Accept or reject them in Extracted Requirements, then commit the accepted ones.' });
  if (unmapped.length > 0) gaps.push({ severity: 'medium', title: `${unmapped.length} requirement${unmapped.length === 1 ? ' is' : 's are'} not mapped to a functionality`, detail: 'Tag the impacted functionalities so technical impact can be traced.' });
  if (requirements.length > 0 && !requirements.some((r) => r.kind === 'non-functional')) gaps.push({ severity: 'low', title: 'No non-functional requirements', detail: 'Performance, security, availability and compliance needs are usually discussed in kickoff sessions.' });
  if (requirements.some((r) => r.kind === 'integration') && !scope.directComponents.some((c) => layerOf(c.kind) === 'integration') && !scope.dependencyComponents.some((d) => layerOf(d.component.kind) === 'integration')) {
    gaps.push({ severity: 'medium', title: 'Integration requirements, but no documented integrations in scope', detail: 'Document the APIs, queues or middleware flows involved in the Technical components registry.' });
  }
  if (requirements.length > 0 && requirements.some((r) => r.status === 'draft')) gaps.push({ severity: 'low', title: `${requirements.filter((r) => r.status === 'draft').length} requirement(s) still in draft`, detail: 'Move them through review so the FRD can be generated from approved requirements.' });
  if (fnsWithoutTech.length > 0) gaps.push({ severity: 'low', title: `${fnsWithoutTech.length} functionalit${fnsWithoutTech.length === 1 ? 'y' : 'ies'} in scope with no technical components linked`, detail: fnsWithoutTech.slice(0, 5).map((f) => f.name).join(', ') + (fnsWithoutTech.length > 5 ? '…' : '') });
  if (scope.functionalities.length === 0) gaps.push({ severity: 'medium', title: 'Nothing documented in the linked scope', detail: 'The linked applications or modules have no documented functionality yet, so impact can only be estimated.' });
  if (openActions > 0) gaps.push({ severity: 'low', title: `${openActions} open action item${openActions === 1 ? '' : 's'} from meetings`, detail: 'Close or reassign them before sign-off.' });
  return gaps;
}
