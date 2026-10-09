import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Boxes, Trash2 } from 'lucide-react';
import { db } from '@/db/db';
import { deleteTechnicalComponent } from '@/db/catalog';
import { KIND_META, KIND_ORDER, LAYERS, describeComponent } from '@/config/technical';
import type { TechnicalComponent, TechnicalComponentKind } from '@/db/types';
import { useAutosave } from '@/hooks/useAutosave';
import { useTechnicalGraph } from '@/hooks/useTechnicalGraph';
import { computeUsage } from '@/lib/techUsage';
import SaveStatus from '@/components/ui/SaveStatus';
import Section from '@/components/ui/Section';
import ConfirmModal from '@/components/ui/ConfirmModal';
import EmptyState from '@/components/ui/EmptyState';
import ColumnListEditor from '@/components/ui/ColumnListEditor';
import RelatedPicker from '@/components/ui/RelatedPicker';
import Chip from '@/components/ui/Chip';
import PageSkeleton from '@/components/ui/Skeleton';

export default function TechnicalComponentPage() {
  const { appId = '', componentId = '' } = useParams();
  const component = useLiveQuery(() => db.technicalComponents.get(componentId).then((c) => c ?? null), [componentId]);

  if (component === undefined) return <PageSkeleton />;
  if (component === null) {
    return (
      <EmptyState icon={Boxes} title="Component not found" description="It may have been deleted.">
        <Link to={`/applications/${appId}/technical`} className="btn btn-secondary">Back to technical components</Link>
      </EmptyState>
    );
  }
  return <ComponentEditor key={component.id} component={component} />;
}

function ComponentEditor({ component }: { component: TechnicalComponent }) {
  const navigate = useNavigate();
  const graph = useTechnicalGraph();
  const initial = useMemo<TechnicalComponent>(
    () => ({
      ...component,
      definition: component.definition ?? '',
      functionalityIds: component.functionalityIds ?? [],
      screenIds: component.screenIds ?? [],
      relatedComponentIds: component.relatedComponentIds ?? [],
      metadata: component.metadata ?? {},
      columns: component.columns ?? [],
    }),
    // Only the first render matters: the draft owns the data from then on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const { draft, update, state } = useAutosave(db.technicalComponents, initial);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const meta = KIND_META[draft.kind];
  const id = (s: string) => `tc-${draft.id}-${s}`;

  const appName = useMemo(() => new Map((graph?.applications ?? []).map((a) => [a.id, a.name])), [graph]);
  const screenName = useMemo(() => new Map((graph?.screens ?? []).map((s) => [s.id, s.name])), [graph]);

  // The graph holds the saved version; swap in the live draft so edits show up immediately.
  const usage = useMemo(() => {
    if (!graph) return null;
    return computeUsage(draft, { ...graph, components: graph.components.map((c) => (c.id === draft.id ? draft : c)) });
  }, [graph, draft]);

  const setMeta = (key: string, value: string) => update({ metadata: { ...draft.metadata, [key]: value } });
  const backPath = `/applications/${draft.applicationId}/technical`;
  const via = (chain: string[]) => (chain.length ? `via ${chain.join(' › ')}` : 'Direct link');

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2 text-label-md text-on-surface-variant">
            <meta.icon size={14} aria-hidden />
            {meta.label}
            <span aria-hidden>·</span>
            {LAYERS.find((l) => l.id === meta.layer)?.label}
          </div>
          <label htmlFor={id('name')} className="sr-only">Component name</label>
          <input id={id('name')} className="input text-headline-md" value={draft.name} onChange={(e) => update({ name: e.target.value })} placeholder="Component name" />
          <div className="mt-2"><SaveStatus state={state} /></div>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => setConfirmDelete(true)}>
          <Trash2 size={16} aria-hidden />
          Delete component
        </button>
      </header>

      <Section title="Details">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor={id('kind')} className="field-label">Type</label>
            <select id={id('kind')} className="input" value={draft.kind} onChange={(e) => update({ kind: e.target.value as TechnicalComponentKind })}>
              {LAYERS.map((layer) => (
                <optgroup key={layer.id} label={layer.label}>
                  {KIND_ORDER.filter((k) => KIND_META[k].layer === layer.id).map((k) => <option key={k} value={k}>{KIND_META[k].label}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="hidden md:block" />
          <div className="md:col-span-2">
            <label htmlFor={id('desc')} className="field-label">Description</label>
            <textarea id={id('desc')} className="input min-h-[80px]" value={draft.description} onChange={(e) => update({ description: e.target.value })} placeholder="What it is and what it is used for" />
          </div>
          {meta.fields.map((f) => (
            <div key={f.key} className={f.multiline ? 'md:col-span-2' : undefined}>
              <label htmlFor={id(f.key)} className="field-label">{f.label}</label>
              {f.options ? (
                <select id={id(f.key)} className="input" value={draft.metadata[f.key] ?? ''} onChange={(e) => setMeta(f.key, e.target.value)}>
                  <option value="">Not set</option>
                  {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : f.multiline ? (
                <textarea id={id(f.key)} className="input min-h-[120px] font-mono text-code" spellCheck={false} value={draft.metadata[f.key] ?? ''} placeholder={f.placeholder} onChange={(e) => setMeta(f.key, e.target.value)} />
              ) : (
                <input id={id(f.key)} className="input" value={draft.metadata[f.key] ?? ''} placeholder={f.placeholder} onChange={(e) => setMeta(f.key, e.target.value)} />
              )}
            </div>
          ))}
        </div>
      </Section>

      {meta.hasColumns && (
        <Section title="Columns and keys" description="Primary and foreign key mappings document how this object relates to others.">
          <ColumnListEditor rows={draft.columns} onChange={(rows) => update({ columns: rows })} />
        </Section>
      )}

      <Section title={meta.definitionLabel}>
        <textarea
          aria-label={meta.definitionLabel}
          className="input min-h-[160px] font-mono text-code"
          spellCheck={false}
          value={draft.definition}
          placeholder={meta.definitionPlaceholder}
          onChange={(e) => update({ definition: e.target.value })}
        />
      </Section>

      <Section title="Dependencies" description="Components this one relies on, such as the procedure behind an API or the parent table of a foreign key.">
        <RelatedPicker
          label="Depends on"
          value={draft.relatedComponentIds}
          onChange={(ids) => update({ relatedComponentIds: ids })}
          options={(graph?.components ?? []).filter((c) => c.id !== draft.id).sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({
            id: c.id,
            label: c.name,
            sublabel: `${KIND_META[c.kind].label} · ${appName.get(c.applicationId) ?? ''}`,
          }))}
        />
        <div>
          <span className="field-label">Depended on by</span>
          {usage && usage.dependents.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {usage.dependents.map((c) => (
                <li key={c.id}>
                  <Link to={`/applications/${c.applicationId}/technical/${c.id}`} className="inline-flex items-center gap-1.5 rounded border border-outline-variant px-2 py-0.5 text-label-md hover:bg-surface-container">
                    {(() => { const K = KIND_META[c.kind].icon; return <K size={12} aria-hidden />; })()}
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body-md text-on-surface-variant">No other component depends on this one yet.</p>
          )}
        </div>
      </Section>

      <Section title="Functional mapping" description="Tag the screens and functionalities this component powers. You can also do this from any screen or functionality page.">
        <RelatedPicker
          label="Linked functionalities"
          value={draft.functionalityIds}
          onChange={(ids) => update({ functionalityIds: ids })}
          options={[...(graph?.functionalities ?? [])].sort((a, b) => a.name.localeCompare(b.name)).map((f) => ({
            id: f.id,
            label: f.name,
            sublabel: [appName.get(f.applicationId), f.screenId ? screenName.get(f.screenId) : undefined].filter(Boolean).join(' › '),
          }))}
        />
        <RelatedPicker
          label="Linked screens"
          value={draft.screenIds}
          onChange={(ids) => update({ screenIds: ids })}
          options={[...(graph?.screens ?? [])].sort((a, b) => a.name.localeCompare(b.name)).map((s) => ({ id: s.id, label: s.name, sublabel: appName.get(s.applicationId) }))}
        />
      </Section>

      <Section title="Where this is used" description="Everything that relies on this component, directly or through components that depend on it.">
        {!usage ? (
          <PageSkeleton />
        ) : usage.screens.length === 0 && usage.functionalities.length === 0 ? (
          <p className="rounded border border-dashed border-outline-variant px-3 py-4 text-body-md text-on-surface-variant">
            Nothing relies on this component yet. Link screens or functionalities above, or tag it from their pages.
          </p>
        ) : (
          <div className="space-y-6">
            <div>
              <h4 className="mb-2 text-body-md font-semibold">Business processes</h4>
              {usage.processes.length === 0 ? (
                <p className="text-body-md text-on-surface-variant">The screens that use it have no business process set.</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {usage.processes.map((p) => (
                    <li key={p.name}>
                      <Chip>{p.name} · {p.screens.length} {p.screens.length === 1 ? 'screen' : 'screens'}</Chip>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h4 className="mb-2 text-body-md font-semibold">Screens <span className="font-normal text-on-surface-variant">({usage.screens.length})</span></h4>
              <ul className="divide-y divide-outline-variant rounded border border-outline-variant">
                {usage.screens.map(({ screen, via: chain }) => (
                  <li key={screen.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span className="min-w-0">
                      <Link to={`/applications/${screen.applicationId}/screens/${screen.id}?tab=technical`} className="font-medium hover:underline">{screen.name}</Link>
                      <span className="block text-label-md font-normal text-on-surface-variant">{[appName.get(screen.applicationId), screen.businessProcess].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="text-label-md font-normal text-on-surface-variant">{via(chain)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="mb-2 text-body-md font-semibold">Functionalities <span className="font-normal text-on-surface-variant">({usage.functionalities.length})</span></h4>
              {usage.functionalities.length === 0 ? (
                <p className="text-body-md text-on-surface-variant">No functionality is tagged yet; the screens above are linked directly.</p>
              ) : (
                <ul className="divide-y divide-outline-variant rounded border border-outline-variant">
                  {usage.functionalities.map(({ functionality, screen, via: chain }) => (
                    <li key={functionality.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <span className="min-w-0">
                        {functionality.screenId ? (
                          <Link to={`/applications/${functionality.applicationId}/screens/${functionality.screenId}?tab=functionalities&open=${functionality.id}`} className="font-medium hover:underline">{functionality.name}</Link>
                        ) : (
                          <span className="font-medium">{functionality.name}</span>
                        )}
                        <span className="block text-label-md font-normal text-on-surface-variant">{[appName.get(functionality.applicationId), screen?.name].filter(Boolean).join(' › ')}</span>
                      </span>
                      <span className="text-label-md font-normal text-on-surface-variant">{via(chain)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Section>

      <ConfirmModal
        open={confirmDelete}
        title="Delete component?"
        confirmLabel="Delete component"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await deleteTechnicalComponent(draft.id);
          navigate(backPath);
        }}
        message={<p><strong className="text-on-surface">{draft.name || 'This component'}</strong> ({describeComponent(draft) || meta.label}) will be removed and unlinked from every screen, functionality and component that referenced it.</p>}
      />
    </div>
  );
}
