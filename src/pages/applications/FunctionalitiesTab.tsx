import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronDown, ChevronRight, ListChecks, Plus } from 'lucide-react';
import { db } from '@/db/db';
import { createFunctionality, deleteFunctionality } from '@/db/catalog';
import type { Functionality, Screen } from '@/db/types';
import QuickCreateModal from '@/components/ui/QuickCreateModal';
import ConfirmModal from '@/components/ui/ConfirmModal';
import EmptyState from '@/components/ui/EmptyState';
import FunctionalityEditor from './FunctionalityEditor';

export default function FunctionalitiesTab({ screen }: { screen: Screen }) {
  const [params] = useSearchParams();
  const [open, setOpen] = useState<Set<string>>(() => new Set(params.get('open') ? [params.get('open') as string] : []));
  const [adding, setAdding] = useState(false);
  const [toDelete, setToDelete] = useState<Functionality | null>(null);

  const all = useLiveQuery(() => db.functionalities.where('applicationId').equals(screen.applicationId).toArray(), [screen.applicationId]);
  const screens = useLiveQuery(() => db.screens.where('applicationId').equals(screen.applicationId).toArray(), [screen.applicationId]);

  const screenName = new Map((screens ?? []).map((s) => [s.id, s.name]));
  const mine = (all ?? []).filter((f) => f.screenId === screen.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const summary = (f: Functionality) =>
    [f.userRoles.length && `${f.userRoles.length} roles`, f.inputs.length && `${f.inputs.length} inputs`, f.outputs.length && `${f.outputs.length} outputs`]
      .filter(Boolean)
      .join(' · ');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-body-md text-on-surface-variant">A screen can hold several distinct functionalities, such as Create, Update or Suspend.</p>
        <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
          <Plus size={16} aria-hidden />
          Add functionality
        </button>
      </div>

      {all && mine.length === 0 ? (
        <EmptyState icon={ListChecks} title="No functionalities yet" description="Break this screen down into the things users can actually do on it.">
          <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
            <Plus size={16} aria-hidden />
            Add functionality
          </button>
        </EmptyState>
      ) : (
        <ul className="rounded border border-outline-variant bg-surface-lowest">
          {mine.map((f) => {
            const expanded = open.has(f.id);
            return (
              <li key={f.id} className="border-b border-outline-variant last:border-b-0">
                <h3>
                  <button type="button" onClick={() => toggle(f.id)} aria-expanded={expanded} aria-controls={`fn-panel-${f.id}`} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-low">
                    {expanded ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{f.name || 'Untitled functionality'}</span>
                      {f.description && <span className="block truncate text-body-md font-normal text-on-surface-variant">{f.description}</span>}
                    </span>
                    <span className="hidden shrink-0 text-label-md font-normal text-on-surface-variant sm:inline">{summary(f)}</span>
                  </button>
                </h3>
                {expanded && (
                  <div id={`fn-panel-${f.id}`} className="border-t border-outline-variant px-4">
                    <FunctionalityEditor
                      key={f.id}
                      functionality={f}
                      relatedOptions={(all ?? []).filter((o) => o.id !== f.id).map((o) => ({ id: o.id, label: o.name, sublabel: o.screenId ? screenName.get(o.screenId) : undefined }))}
                      onDelete={() => setToDelete(f)}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <QuickCreateModal
        open={adding}
        title={`New functionality on ${screen.name || 'this screen'}`}
        nameLabel="Functionality name"
        namePlaceholder="e.g. Create Supplier"
        detailLabel="Description"
        detailPlaceholder="What it does"
        submitLabel="Add functionality"
        onClose={() => setAdding(false)}
        onSubmit={async (name, detail) => {
          const fn = await createFunctionality(screen, name, detail);
          setOpen((prev) => new Set(prev).add(fn.id));
        }}
      />

      <ConfirmModal
        open={!!toDelete}
        title="Delete functionality?"
        message={<p><strong className="text-on-surface">{toDelete?.name}</strong> and everything documented under it will be removed.</p>}
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          if (toDelete) await deleteFunctionality(toDelete.id);
          setToDelete(null);
        }}
      />
    </div>
  );
}
