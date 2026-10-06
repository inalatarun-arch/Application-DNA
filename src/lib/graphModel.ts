import type { AppModule, Application, Functionality, Requirement, Screen, TechnicalComponent } from '@/db/types';
import { KIND_META, layerOf, type Layer } from '@/config/technical';
import type { NodeType } from '@/config/graph';

export interface GraphSource {
  applications: Application[];
  modules: AppModule[];
  screens: Screen[];
  functionalities: Functionality[];
  components: TechnicalComponent[];
  requirements: Requirement[];
}

export type EdgeKind = 'contains' | 'uses' | 'depends' | 'related' | 'implements';

export interface GraphNodeData {
  id: string;
  type: NodeType;
  refId: string;
  label: string;
  subtitle: string;
  applicationId?: string;
  /** Technical layer, for component nodes. */
  layer?: Layer;
  degree: number;
  /** Page that documents this node, if any. */
  route?: string;
}

export interface GraphEdgeData {
  source: string;
  target: string;
  kind: EdgeKind;
}

export interface GraphData {
  nodes: GraphNodeData[];
  edges: GraphEdgeData[];
}

const PREFIX: Record<NodeType, string> = {
  application: 'app',
  module: 'mod',
  screen: 'scr',
  functionality: 'fn',
  component: 'cmp',
  requirement: 'req',
};

export const nodeId = (type: NodeType, refId: string): string => `${PREFIX[type]}:${refId}`;

/** Turns the whole documented workspace into nodes and edges. Edges to missing records are dropped. */
export function buildGraph(src: GraphSource): GraphData {
  const nodes: GraphNodeData[] = [];
  const edges: GraphEdgeData[] = [];
  const ids = new Set<string>();
  const seen = new Set<string>();

  const appName = new Map(src.applications.map((a) => [a.id, a.name]));
  const modName = new Map(src.modules.map((m) => [m.id, m.name]));
  const scrName = new Map(src.screens.map((s) => [s.id, s.name]));
  const fnById = new Map(src.functionalities.map((f) => [f.id, f]));

  const addNode = (n: Omit<GraphNodeData, 'degree'>) => {
    if (ids.has(n.id)) return;
    ids.add(n.id);
    nodes.push({ ...n, degree: 0 });
  };
  const addEdge = (source: string, target: string, kind: EdgeKind) => {
    if (source === target || !ids.has(source) || !ids.has(target)) return;
    const key = `${source}|${target}|${kind}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ source, target, kind });
  };

  for (const a of src.applications) {
    addNode({ id: nodeId('application', a.id), type: 'application', refId: a.id, label: a.name, subtitle: [a.vendor, a.domain].filter(Boolean).join(' · '), applicationId: a.id, route: `/applications/${a.id}` });
  }
  for (const m of src.modules) {
    addNode({ id: nodeId('module', m.id), type: 'module', refId: m.id, label: m.name, subtitle: appName.get(m.applicationId) ?? '', applicationId: m.applicationId, route: `/applications/${m.applicationId}/modules/${m.id}` });
  }
  for (const s of src.screens) {
    addNode({ id: nodeId('screen', s.id), type: 'screen', refId: s.id, label: s.name, subtitle: (s.moduleId && modName.get(s.moduleId)) || appName.get(s.applicationId) || '', applicationId: s.applicationId, route: `/applications/${s.applicationId}/screens/${s.id}` });
  }
  for (const f of src.functionalities) {
    addNode({
      id: nodeId('functionality', f.id),
      type: 'functionality',
      refId: f.id,
      label: f.name,
      subtitle: (f.screenId && scrName.get(f.screenId)) || appName.get(f.applicationId) || '',
      applicationId: f.applicationId,
      route: f.screenId ? `/applications/${f.applicationId}/screens/${f.screenId}?tab=functionalities&open=${f.id}` : `/applications/${f.applicationId}`,
    });
  }
  for (const c of src.components) {
    addNode({
      id: nodeId('component', c.id),
      type: 'component',
      refId: c.id,
      label: c.name,
      subtitle: `${KIND_META[c.kind].label} · ${appName.get(c.applicationId) ?? ''}`,
      applicationId: c.applicationId,
      layer: layerOf(c.kind),
      route: `/applications/${c.applicationId}/technical/${c.id}`,
    });
  }
  for (const r of src.requirements) {
    const firstFn = (r.functionalityIds ?? []).map((id) => fnById.get(id)).find(Boolean);
    addNode({ id: nodeId('requirement', r.id), type: 'requirement', refId: r.id, label: r.title, subtitle: r.kind, applicationId: firstFn?.applicationId });
  }

  // Hierarchy
  for (const m of src.modules) addEdge(nodeId('application', m.applicationId), nodeId('module', m.id), 'contains');
  for (const s of src.screens) {
    const parent = s.moduleId && ids.has(nodeId('module', s.moduleId)) ? nodeId('module', s.moduleId) : nodeId('application', s.applicationId);
    addEdge(parent, nodeId('screen', s.id), 'contains');
  }
  for (const f of src.functionalities) {
    const parent = f.screenId && ids.has(nodeId('screen', f.screenId)) ? nodeId('screen', f.screenId) : nodeId('application', f.applicationId);
    addEdge(parent, nodeId('functionality', f.id), 'contains');
  }
  for (const c of src.components) addEdge(nodeId('application', c.applicationId), nodeId('component', c.id), 'contains');

  // Relationships
  for (const s of src.screens) for (const rid of s.relatedScreenIds ?? []) addEdge(nodeId('screen', s.id), nodeId('screen', rid), 'related');
  for (const f of src.functionalities) {
    for (const rid of f.relatedFunctionalityIds ?? []) {
      // Related links are symmetrical; keep one direction only.
      if (f.id < rid) addEdge(nodeId('functionality', f.id), nodeId('functionality', rid), 'related');
      else addEdge(nodeId('functionality', rid), nodeId('functionality', f.id), 'related');
    }
  }
  for (const c of src.components) {
    const from = nodeId('component', c.id);
    for (const fid of c.functionalityIds ?? []) addEdge(from, nodeId('functionality', fid), 'uses');
    for (const sid of c.screenIds ?? []) addEdge(from, nodeId('screen', sid), 'uses');
    for (const rid of c.relatedComponentIds ?? []) addEdge(from, nodeId('component', rid), 'depends');
  }
  for (const r of src.requirements) {
    const from = nodeId('requirement', r.id);
    for (const fid of r.functionalityIds ?? []) addEdge(from, nodeId('functionality', fid), 'implements');
    if (r.parentId) addEdge(nodeId('requirement', r.parentId), from, 'contains');
  }

  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }
  for (const n of nodes) n.degree = degree.get(n.id) ?? 0;

  return { nodes, edges };
}

export interface FilterOptions {
  types: Set<NodeType>;
  /** Show application → module → screen → functionality (and application → component) links. */
  hierarchy: boolean;
  /** 'all', or an application id: its own nodes plus anything directly linked to them. */
  applicationId: string;
}

export function filterGraph(data: GraphData, opts: FilterOptions): GraphData {
  let keep: Set<string> | null = null;
  if (opts.applicationId !== 'all') {
    const own = new Set(data.nodes.filter((n) => n.applicationId === opts.applicationId).map((n) => n.id));
    keep = new Set(own);
    for (const e of data.edges) {
      if (own.has(e.source)) keep.add(e.target);
      if (own.has(e.target)) keep.add(e.source);
    }
  }
  const nodes = data.nodes.filter((n) => opts.types.has(n.type) && (!keep || keep.has(n.id)));
  const visible = new Set(nodes.map((n) => n.id));
  const edges = data.edges.filter((e) => visible.has(e.source) && visible.has(e.target) && (opts.hierarchy || e.kind !== 'contains'));
  return { nodes, edges };
}

export function neighborMap(edges: GraphEdgeData[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    const set = map.get(a) ?? new Set<string>();
    set.add(b);
    map.set(a, set);
  };
  for (const e of edges) {
    link(e.source, e.target);
    link(e.target, e.source);
  }
  return map;
}
