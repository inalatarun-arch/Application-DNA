import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Workflow, X } from 'lucide-react';
import { NODE_META } from '@/config/graph';
import { KIND_META, describeComponent } from '@/config/technical';
import { CRITICAL_TIERS } from '@/db/catalog';
import type { EdgeKind, GraphEdgeData, GraphNodeData, GraphSource } from '@/lib/graphModel';

interface Props {
  node: GraphNodeData;
  source: GraphSource;
  nodesById: Map<string, GraphNodeData>;
  /** Visible edges only, so every connection listed can be selected in the graph. */
  edges: GraphEdgeData[];
  onSelect: (id: string) => void;
  onClose: () => void;
}

interface Row {
  label: string;
  value: string;
}

const list = (xs: string[] | undefined) => (xs ?? []).filter(Boolean).join(', ');

function detailRows(node: GraphNodeData, src: GraphSource): Row[] {
  const rows: Row[] = [];
  const push = (label: string, value: string | undefined) => {
    if (value && value.trim()) rows.push({ label, value });
  };
  switch (node.type) {
    case 'application': {
      const a = src.applications.find((x) => x.id === node.refId);
      if (!a) break;
      push('Platform', a.vendor);
      push('Domain', a.domain);
      const tier = CRITICAL_TIERS.find((t) => t.id === a.criticalTier);
      push('Critical tier', tier ? `${tier.label} · ${tier.description}` : a.criticalTier);
      push('Business owner', a.businessOwner);
      push('Technical owner', a.technicalOwner);
      push('Technical stack', list(a.technicalStack));
      push('Description', a.description);
      break;
    }
    case 'module': {
      const m = src.modules.find((x) => x.id === node.refId);
      if (!m) break;
      push('Description', m.description);
      push('Owner', m.owner);
      break;
    }
    case 'screen': {
      const s = src.screens.find((x) => x.id === node.refId);
      if (!s) break;
      push('Purpose', s.purpose);
      push('Business process', s.businessProcess);
      push('Business owner', s.businessOwner);
      push('Functional owner', s.functionalOwner);
      push('Navigation path', s.navigationPath);
      break;
    }
    case 'functionality': {
      const f = src.functionalities.find((x) => x.id === node.refId);
      if (!f) break;
      push('Description', f.description);
      push('Business purpose', f.businessPurpose);
      push('User roles', list(f.userRoles));
      push('Triggers', list(f.triggers));
      push('Inputs', list(f.inputs));
      push('Outputs', list(f.outputs));
      break;
    }
    case 'component': {
      const c = src.components.find((x) => x.id === node.refId);
      if (!c) break;
      const meta = KIND_META[c.kind];
      push('Type', meta.label);
      push('Summary', describeComponent(c));
      push('Description', c.description);
      for (const f of meta.fields) {
        if (!f.multiline) push(f.label, c.metadata?.[f.key]);
      }
      break;
    }
    case 'requirement': {
      const r = src.requirements.find((x) => x.id === node.refId);
      if (!r) break;
      push('Type', r.kind);
      push('Status', r.status);
      push('Priority', r.priority);
      push('Description', r.description);
      push('Acceptance criteria', (r.acceptanceCriteria ?? []).filter(Boolean).join('; '));
      break;
    }
  }
  return rows;
}

function relation(kind: EdgeKind, outgoing: boolean): string {
  switch (kind) {
    case 'contains':
      return outgoing ? 'Contains' : 'Part of';
    case 'uses':
      return outgoing ? 'Powers' : 'Relies on';
    case 'depends':
      return outgoing ? 'Depends on' : 'Depended on by';
    case 'implements':
      return outgoing ? 'Implements' : 'Implemented by';
    default:
      return 'Related to';
  }
}

/** Where "View process flow" should point for this node, if a flow can be drawn for it. */
function flowLink(node: GraphNodeData, src: GraphSource): string | null {
  if (node.type === 'functionality') return `/knowledge-graph/flows?type=functionality&id=${node.refId}`;
  if (node.type === 'module') return `/knowledge-graph/flows?type=module&id=${node.refId}`;
  if (node.type === 'screen') {
    const s = src.screens.find((x) => x.id === node.refId);
    if (s?.moduleId) return `/knowledge-graph/flows?type=module&id=${s.moduleId}`;
  }
  return null;
}

const MAX_PER_GROUP = 30;

export default function NodeDrawer({ node, source, nodesById, edges, onSelect, onClose }: Props) {
  const meta = NODE_META[node.type];
  const rows = useMemo(() => detailRows(node, source), [node, source]);

  const groups = useMemo(() => {
    const map = new Map<string, GraphNodeData[]>();
    for (const e of edges) {
      const outgoing = e.source === node.id;
      if (!outgoing && e.target !== node.id) continue;
      const other = nodesById.get(outgoing ? e.target : e.source);
      if (!other) continue;
      const key = relation(e.kind, outgoing);
      map.set(key, [...(map.get(key) ?? []), other]);
    }
    return [...map.entries()].map(([title, items]) => ({ title, items: items.sort((a, b) => a.label.localeCompare(b.label)) }));
  }, [edges, node.id, nodesById]);

  const flow = flowLink(node, source);

  return (
    <aside
      role="dialog"
      aria-label={`${node.label} details`}
      className="absolute inset-x-0 bottom-0 z-10 flex max-h-[72%] flex-col rounded-t border-2 border-primary bg-surface-lowest sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-96 sm:rounded-none"
    >
      <div className="flex items-start gap-3 border-b border-outline-variant p-4">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded text-white" style={{ backgroundColor: meta.color }}>
          <meta.icon size={16} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-label-md text-on-surface-variant">{node.type === 'component' && node.layer ? `${meta.label} · ${node.subtitle.split(' · ')[0]}` : meta.label}</p>
          <h2 className="break-words text-headline-md">{node.label || 'Untitled'}</h2>
          {node.subtitle && node.type !== 'component' && <p className="text-body-md text-on-surface-variant">{node.subtitle}</p>}
        </div>
        <button type="button" className="icon-btn -mr-2 -mt-1" onClick={onClose} aria-label="Close details">
          <X size={18} aria-hidden />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {(node.route || flow) && (
          <div className="flex flex-wrap gap-2">
            {node.route && (
              <Link to={node.route} className="btn btn-primary px-3 py-1.5">
                <ExternalLink size={14} aria-hidden />
                Open page
              </Link>
            )}
            {flow && (
              <Link to={flow} className="btn btn-secondary px-3 py-1.5">
                <Workflow size={14} aria-hidden />
                View process flow
              </Link>
            )}
          </div>
        )}

        {rows.length > 0 && (
          <dl className="space-y-3">
            {rows.map((r) => (
              <div key={r.label}>
                <dt className="text-label-md text-on-surface-variant">{r.label}</dt>
                <dd className="mt-0.5 whitespace-pre-line break-words text-body-md">{r.value}</dd>
              </div>
            ))}
          </dl>
        )}

        <section aria-label="Connections">
          <h3 className="mb-2 text-body-md font-semibold">Connections <span className="font-normal text-on-surface-variant">({groups.reduce((n, g) => n + g.items.length, 0)})</span></h3>
          {groups.length === 0 ? (
            <p className="text-body-md text-on-surface-variant">No visible connections. Adjust the filters to see more.</p>
          ) : (
            <div className="space-y-4">
              {groups.map((g) => (
                <div key={g.title}>
                  <p className="mb-1 text-label-md text-on-surface-variant">{g.title}</p>
                  <ul className="divide-y divide-outline-variant rounded border border-outline-variant">
                    {g.items.slice(0, MAX_PER_GROUP).map((o) => {
                      const m = NODE_META[o.type];
                      return (
                        <li key={o.id}>
                          <button type="button" onClick={() => onSelect(o.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-low">
                            <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: m.color }} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-body-md font-medium">{o.label}</span>
                              <span className="block truncate text-label-md font-normal text-on-surface-variant">{m.label}</span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {g.items.length > MAX_PER_GROUP && <p className="mt-1 text-label-md font-normal text-on-surface-variant">+{g.items.length - MAX_PER_GROUP} more</p>}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </aside>
  );
}
