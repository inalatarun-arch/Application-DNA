import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Boxes, Plus, Search } from 'lucide-react';
import { KIND_META, KIND_ORDER, LAYERS, describeComponent, layerOf, type Layer } from '@/config/technical';
import type { TechnicalComponentKind } from '@/db/types';
import { useTechnicalGraph } from '@/hooks/useTechnicalGraph';
import Tabs from '@/components/ui/Tabs';
import EmptyState from '@/components/ui/EmptyState';
import { formatDateTime } from '@/lib/format';
import { useAppContext } from './appContext';
import NewComponentModal from './NewComponentModal';

type LayerTab = 'all' | Layer;

export default function TechnicalRegistryPage() {
  const { app } = useAppContext();
  const navigate = useNavigate();
  const graph = useTechnicalGraph();
  const [layer, setLayer] = useState<LayerTab>('all');
  const [kind, setKind] = useState<'all' | TechnicalComponentKind>('all');
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);

  const mine = useMemo(() => (graph?.components ?? []).filter((c) => c.applicationId === app.id), [graph, app.id]);
  const screenIds = useMemo(() => new Set((graph?.screens ?? []).map((s) => s.id)), [graph]);
  const fnIds = useMemo(() => new Set((graph?.functionalities ?? []).map((f) => f.id)), [graph]);

  const visible = useMemo(() => {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    return mine
      .filter((c) => layer === 'all' || layerOf(c.kind) === layer)
      .filter((c) => kind === 'all' || c.kind === kind)
      .filter((c) => {
        const hay = [c.name, c.description, KIND_META[c.kind].label, ...Object.values(c.metadata ?? {}), ...(c.columns ?? []).map((x) => x.name)].join(' ').toLowerCase();
        return tokens.every((t) => hay.includes(t));
      })
      .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.name.localeCompare(b.name));
  }, [mine, layer, kind, query]);

  const layerCount = (l: LayerTab) => (l === 'all' ? mine.length : mine.filter((c) => layerOf(c.kind) === l).length);
  const kindsInLayer = KIND_ORDER.filter((k) => layer === 'all' || KIND_META[k].layer === layer);

  const dependents = (id: string) => mine.length === 0 ? 0 : (graph?.components ?? []).filter((c) => (c.relatedComponentIds ?? []).includes(id)).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-headline-lg">Technical components</h1>
          <p className="mt-1 max-w-2xl text-body-lg text-on-surface-variant">Code, database objects, integrations and infrastructure behind {app.name}, linked to the screens and functionality they power.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
          <Plus size={16} aria-hidden />
          Add component
        </button>
      </header>

      {graph && mine.length === 0 ? (
        <EmptyState icon={Boxes} title="No technical components yet" description="Document the tables, APIs, services and jobs this application relies on, then tag them on screens and functionalities. The sample data in Settings includes a full example.">
          <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
            <Plus size={16} aria-hidden />
            Add component
          </button>
        </EmptyState>
      ) : (
        <>
          <Tabs<LayerTab>
            label="Technical layers"
            active={layer}
            onChange={(id) => { setLayer(id); setKind('all'); }}
            tabs={[{ id: 'all', label: 'All', count: layerCount('all') }, ...LAYERS.map((l) => ({ id: l.id as LayerTab, label: l.label, count: layerCount(l.id) }))]}
          />

          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
              <input className="input pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, description, column or attribute" aria-label="Search components" />
            </div>
            <select className="input w-auto" value={kind} onChange={(e) => setKind(e.target.value as 'all' | TechnicalComponentKind)} aria-label="Filter by type">
              <option value="all">All types</option>
              {kindsInLayer.map((k) => <option key={k} value={k}>{KIND_META[k].label}</option>)}
            </select>
          </div>

          {visible.length === 0 ? (
            <EmptyState icon={Search} title="No components match" description="Try a different search or switch layer." />
          ) : (
            <div className="overflow-x-auto rounded border border-outline-variant bg-surface-lowest">
              <table className="w-full min-w-[760px] text-left text-body-md">
                <thead className="border-b border-outline-variant bg-surface-low text-label-md text-on-surface-variant">
                  <tr>
                    {['Component', 'Type', 'Screens', 'Functionalities', 'Depended on by', 'Updated'].map((h) => <th key={h} scope="col" className="px-4 py-2 font-medium">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {visible.map((c) => {
                    const meta = KIND_META[c.kind];
                    const summary = describeComponent(c);
                    return (
                      <tr key={c.id} className="cursor-pointer hover:bg-surface-low" onClick={() => navigate(`/applications/${app.id}/technical/${c.id}`)}>
                        <td className="px-4 py-3">
                          <Link to={`/applications/${app.id}/technical/${c.id}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-2 font-semibold hover:underline">
                            <meta.icon size={16} aria-hidden className="shrink-0 text-on-surface-variant" />
                            {c.name || 'Untitled component'}
                          </Link>
                          {summary && <span className="ml-6 block truncate text-label-md font-normal text-on-surface-variant">{summary}</span>}
                        </td>
                        <td className="px-4 py-3 text-on-surface-variant">{meta.label}</td>
                        <td className="px-4 py-3 tabular-nums">{(c.screenIds ?? []).filter((id) => screenIds.has(id)).length}</td>
                        <td className="px-4 py-3 tabular-nums">{(c.functionalityIds ?? []).filter((id) => fnIds.has(id)).length}</td>
                        <td className="px-4 py-3 tabular-nums">{dependents(c.id)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-on-surface-variant">{formatDateTime(c.updatedAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <NewComponentModal
        open={adding}
        applicationId={app.id}
        defaultKind={kind !== 'all' ? kind : layer === 'database' ? 'table' : layer === 'integration' ? 'rest' : layer === 'code' ? 'class' : 'table'}
        onClose={() => setAdding(false)}
        onCreated={(c) => navigate(`/applications/${app.id}/technical/${c.id}`)}
      />
    </div>
  );
}
