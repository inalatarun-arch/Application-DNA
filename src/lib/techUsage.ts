import type { Application, Functionality, Screen, TechnicalComponent } from '@/db/types';

export interface TechnicalGraph {
  applications: Application[];
  components: TechnicalComponent[];
  screens: Screen[];
  functionalities: Functionality[];
}

const MAX_DEPTH = 4;

export interface UsageResult {
  /** Screens that rely on the component, directly or through components that depend on it. */
  screens: Array<{ screen: Screen; via: string[] }>;
  functionalities: Array<{ functionality: Functionality; screen?: Screen; via: string[] }>;
  /** Business processes of those screens. */
  processes: Array<{ name: string; screens: Screen[] }>;
  /** Components that directly depend on this one. */
  dependents: TechnicalComponent[];
}

/**
 * Reverse view. Starting at `target`, walks "depends on" links backwards (to the components that
 * depend on it) and collects every screen and functionality tagged on any of them.
 * `via` is the chain of names between the target and the result; an empty chain means a direct link.
 */
export function computeUsage(target: TechnicalComponent, graph: TechnicalGraph): UsageResult {
  const screensById = new Map(graph.screens.map((s) => [s.id, s]));
  const fnById = new Map(graph.functionalities.map((f) => [f.id, f]));
  const screenHits = new Map<string, { screen: Screen; via: string[] }>();
  const fnHits = new Map<string, { functionality: Functionality; screen?: Screen; via: string[] }>();
  const visited = new Set<string>([target.id]);
  let frontier: Array<{ comp: TechnicalComponent; via: string[] }> = [{ comp: target, via: [] }];

  for (let depth = 0; depth <= MAX_DEPTH && frontier.length > 0; depth++) {
    const next: typeof frontier = [];
    for (const { comp, via } of frontier) {
      for (const sid of comp.screenIds ?? []) {
        const screen = screensById.get(sid);
        if (screen && !screenHits.has(sid)) screenHits.set(sid, { screen, via });
      }
      for (const fid of comp.functionalityIds ?? []) {
        const functionality = fnById.get(fid);
        if (!functionality) continue;
        const screen = functionality.screenId ? screensById.get(functionality.screenId) : undefined;
        if (!fnHits.has(fid)) fnHits.set(fid, { functionality, screen, via });
        if (screen && !screenHits.has(screen.id)) screenHits.set(screen.id, { screen, via: [...via, functionality.name] });
      }
      for (const dep of graph.components) {
        if (!visited.has(dep.id) && (dep.relatedComponentIds ?? []).includes(comp.id)) {
          visited.add(dep.id);
          next.push({ comp: dep, via: [...via, dep.name] });
        }
      }
    }
    frontier = next;
  }

  const byProcess = new Map<string, Screen[]>();
  for (const { screen } of screenHits.values()) {
    const name = screen.businessProcess.trim();
    if (name) byProcess.set(name, [...(byProcess.get(name) ?? []), screen]);
  }

  return {
    screens: [...screenHits.values()].sort((a, b) => a.screen.name.localeCompare(b.screen.name)),
    functionalities: [...fnHits.values()].sort((a, b) => a.functionality.name.localeCompare(b.functionality.name)),
    processes: [...byProcess.entries()].map(([name, screens]) => ({ name, screens })).sort((a, b) => a.name.localeCompare(b.name)),
    dependents: graph.components.filter((c) => c.id !== target.id && (c.relatedComponentIds ?? []).includes(target.id)),
  };
}

/**
 * Forward view. Everything the given components rely on through their "depends on" links
 * (excluding the starting components). `via` is the chain of components the dependency is reached through.
 */
export function dependencyClosure(startIds: Set<string>, graph: TechnicalGraph): Array<{ component: TechnicalComponent; via: string[] }> {
  const byId = new Map(graph.components.map((c) => [c.id, c]));
  const seen = new Set(startIds);
  const out: Array<{ component: TechnicalComponent; via: string[] }> = [];
  let frontier = [...startIds].filter((id) => byId.has(id)).map((id) => ({ id, via: [byId.get(id)!.name] }));

  for (let depth = 0; depth <= MAX_DEPTH && frontier.length > 0; depth++) {
    const next: typeof frontier = [];
    for (const { id, via } of frontier) {
      for (const rid of byId.get(id)?.relatedComponentIds ?? []) {
        const related = byId.get(rid);
        if (!related || seen.has(rid)) continue;
        seen.add(rid);
        out.push({ component: related, via });
        next.push({ id: rid, via: [...via, related.name] });
      }
    }
    frontier = next;
  }
  return out;
}
