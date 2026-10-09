import type { FlowModel } from './flowModel';

/**
 * Puts several flows into one model so the future-state generator can describe changes to all of them at once.
 * Every node id gets a prefix, and each flow becomes its own swimlane.
 */
export function composeFlows(parts: Array<{ label: string; model: FlowModel }>, title = 'Current process'): FlowModel {
  const lanes: string[] = [];
  const nodes: FlowModel['nodes'] = [];
  const edges: FlowModel['edges'] = [];
  parts.forEach((part, i) => {
    const prefix = `p${i + 1}_`;
    const multi = new Set(part.model.nodes.map((n) => n.lane)).size > 1;
    for (const n of part.model.nodes) {
      const lane = multi ? `${part.label} / ${n.lane}` : part.label;
      if (!lanes.includes(lane)) lanes.push(lane);
      nodes.push({ ...n, id: `${prefix}${n.id}`, lane });
    }
    for (const e of part.model.edges) edges.push({ ...e, from: `${prefix}${e.from}`, to: `${prefix}${e.to}` });
  });
  return { title, subtitle: '', lanes, nodes, edges };
}
