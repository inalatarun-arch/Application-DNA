import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, X } from 'lucide-react';
import { KIND_META, LAYERS, describeComponent, layerOf, type Layer } from '@/config/technical';
import { linkComponent, unlinkComponent, type LinkTarget } from '@/db/catalog';
import type { TechnicalComponent } from '@/db/types';
import { useTechnicalGraph } from '@/hooks/useTechnicalGraph';
import { dependencyClosure } from '@/lib/techUsage';

interface Props {
  target: LinkTarget;
  targetId: string;
  applicationId: string;
}

function ComponentLine({ component, appLabel, trailing }: { component: TechnicalComponent; appLabel?: string; trailing?: React.ReactNode }) {
  const meta = KIND_META[component.kind];
  const summary = describeComponent(component);
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <meta.icon size={16} aria-hidden className="shrink-0 text-on-surface-variant" />
      <span className="min-w-0 flex-1">
        <Link to={`/applications/${component.applicationId}/technical/${component.id}`} className="block truncate font-medium hover:underline">
          {component.name || 'Untitled component'}
        </Link>
        <span className="block truncate text-label-md font-normal text-on-surface-variant">
          {[meta.label, summary, appLabel].filter(Boolean).join(' · ')}
        </span>
      </span>
      {trailing}
    </li>
  );
}

/**
 * "Linked technical components" selector. Works for both screens and functionalities and writes
 * straight to the component records, so the link also shows up in each component's reverse view.
 */
export default function LinkedComponentsPanel({ target, targetId, applicationId }: Props) {
  const graph = useTechnicalGraph();
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'app' | 'all'>('app');
  const [layer, setLayer] = useState<'all' | Layer>('all');

  if (!graph) return <p className="text-body-md text-on-surface-variant">Loading…</p>;

  const appName = new Map(graph.applications.map((a) => [a.id, a.name]));
  const labelFor = (c: TechnicalComponent) => (c.applicationId === applicationId ? undefined : appName.get(c.applicationId));
  const key = target === 'screen' ? 'screenIds' : 'functionalityIds';

  const direct = graph.components.filter((c) => (c[key] ?? []).includes(targetId));
  const directIds = new Set(direct.map((c) => c.id));

  // For a screen, also surface components tagged on its functionalities.
  const screenFns = target === 'screen' ? graph.functionalities.filter((f) => f.screenId === targetId) : [];
  const viaFunctionalities = graph.components
    .filter((c) => !directIds.has(c.id))
    .map((c) => ({ component: c, fns: screenFns.filter((f) => (c.functionalityIds ?? []).includes(f.id)) }))
    .filter((x) => x.fns.length > 0);

  const startIds = new Set([...directIds, ...viaFunctionalities.map((x) => x.component.id)]);
  const throughDependencies = dependencyClosure(startIds, graph);

  const q = query.trim().toLowerCase();
  const candidates = graph.components
    .filter((c) => !directIds.has(c.id))
    .filter((c) => scope === 'all' || c.applicationId === applicationId)
    .filter((c) => layer === 'all' || layerOf(c.kind) === layer)
    .filter((c) => !q || `${c.name} ${c.description} ${KIND_META[c.kind].label}`.toLowerCase().includes(q))
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))
    .slice(0, 80);

  const hasOwnComponents = graph.components.some((c) => c.applicationId === applicationId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-body-md text-on-surface-variant">
          Tag the tables, APIs and services that power this {target}. The link also appears on each component&apos;s own page.
        </p>
        <button type="button" className="btn btn-primary" onClick={() => setPicking((p) => !p)} aria-expanded={picking}>
          <Plus size={16} aria-hidden />
          {picking ? 'Done' : 'Link component'}
        </button>
      </div>

      {picking && (
        <div className="rounded border-2 border-primary p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search size={14} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-outline" />
              <input className="input py-1.5 pl-8" placeholder="Search components by name or type" aria-label="Search components" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
            </div>
            <select className="input w-auto py-1.5" value={layer} onChange={(e) => setLayer(e.target.value as 'all' | Layer)} aria-label="Filter by layer">
              <option value="all">All layers</option>
              {LAYERS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
            <select className="input w-auto py-1.5" value={scope} onChange={(e) => setScope(e.target.value as 'app' | 'all')} aria-label="Application scope">
              <option value="app">This application</option>
              <option value="all">All applications</option>
            </select>
          </div>
          {candidates.length === 0 ? (
            <p className="text-body-md text-on-surface-variant">
              {!hasOwnComponents && scope === 'app' ? (
                <>No technical components documented for this application yet. <Link className="underline" to={`/applications/${applicationId}/technical`}>Add them in the registry</Link>, or search all applications.</>
              ) : (
                'No unlinked components match.'
              )}
            </p>
          ) : (
            <ul className="max-h-72 divide-y divide-outline-variant overflow-y-auto rounded border border-outline-variant">
              {candidates.map((c) => (
                <ComponentLine
                  key={c.id}
                  component={c}
                  appLabel={labelFor(c)}
                  trailing={
                    <button type="button" className="btn btn-secondary px-2 py-1 text-label-md" onClick={() => void linkComponent(c.id, target, targetId)}>
                      <Plus size={14} aria-hidden />
                      Link
                    </button>
                  }
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {direct.length === 0 ? (
        <p className="rounded border border-dashed border-outline-variant px-3 py-4 text-body-md text-on-surface-variant">No technical components linked directly yet.</p>
      ) : (
        LAYERS.map((l) => {
          const rows = direct.filter((c) => layerOf(c.kind) === l.id).sort((a, b) => a.name.localeCompare(b.name));
          if (rows.length === 0) return null;
          return (
            <section key={l.id} aria-label={l.label}>
              <h4 className="mb-1 flex items-center gap-2 text-body-md font-semibold">
                <l.icon size={16} aria-hidden />
                {l.label}
                <span className="text-label-md font-normal text-on-surface-variant">{rows.length}</span>
              </h4>
              <ul className="divide-y divide-outline-variant rounded border border-outline-variant">
                {rows.map((c) => (
                  <ComponentLine
                    key={c.id}
                    component={c}
                    appLabel={labelFor(c)}
                    trailing={
                      <button type="button" className="icon-btn" aria-label={`Unlink ${c.name}`} onClick={() => void unlinkComponent(c.id, target, targetId)}>
                        <X size={16} aria-hidden />
                      </button>
                    }
                  />
                ))}
              </ul>
            </section>
          );
        })
      )}

      {viaFunctionalities.length > 0 && (
        <section aria-label="Linked through functionalities">
          <h4 className="mb-1 text-body-md font-semibold">Linked through this screen&apos;s functionalities</h4>
          <ul className="divide-y divide-outline-variant rounded border border-outline-variant">
            {viaFunctionalities.map(({ component, fns }) => (
              <ComponentLine
                key={component.id}
                component={component}
                appLabel={labelFor(component)}
                trailing={<span className="hidden shrink-0 text-label-md font-normal text-on-surface-variant sm:inline">{fns.map((f) => f.name).join(', ')}</span>}
              />
            ))}
          </ul>
        </section>
      )}

      {throughDependencies.length > 0 && (
        <section aria-label="Also relies on">
          <h4 className="mb-1 text-body-md font-semibold">Also relies on, through dependencies</h4>
          <ul className="divide-y divide-outline-variant rounded border border-outline-variant">
            {throughDependencies.map(({ component, via }) => (
              <ComponentLine
                key={component.id}
                component={component}
                appLabel={labelFor(component)}
                trailing={<span className="hidden shrink-0 text-label-md font-normal text-on-surface-variant sm:inline">via {via.join(' › ')}</span>}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
