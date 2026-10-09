import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Layers, Plus, Sparkles, Trash2 } from 'lucide-react';
import { db } from '@/db/db';
import { createScreen, deleteModule } from '@/db/catalog';
import type { AppModule } from '@/db/types';
import { useAutosave } from '@/hooks/useAutosave';
import SaveStatus from '@/components/ui/SaveStatus';
import ConfirmModal from '@/components/ui/ConfirmModal';
import QuickCreateModal from '@/components/ui/QuickCreateModal';
import EmptyState from '@/components/ui/EmptyState';
import AiScreenCreateModal from './AiScreenCreateModal';
import PageSkeleton from '@/components/ui/Skeleton';

export default function ModuleDetailPage() {
  const { appId = '', moduleId = '' } = useParams();
  const mod = useLiveQuery(() => db.modules.get(moduleId).then((m) => m ?? null), [moduleId]);

  if (mod === undefined) return <PageSkeleton />;
  if (mod === null) {
    return (
      <EmptyState icon={Layers} title="Module not found" description="It may have been deleted.">
        <Link to={`/applications/${appId}`} className="btn btn-secondary">Back to application</Link>
      </EmptyState>
    );
  }
  return <ModuleEditor key={mod.id} module={mod} />;
}

function ModuleEditor({ module: initial }: { module: AppModule }) {
  const navigate = useNavigate();
  const { draft, update, state } = useAutosave(db.modules, initial);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newScreen, setNewScreen] = useState(false);
  const [aiScreen, setAiScreen] = useState(false);

  const screens = useLiveQuery(() => db.screens.where('moduleId').equals(initial.id).toArray(), [initial.id]);
  const sorted = [...(screens ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const appBase = `/applications/${initial.applicationId}`;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <label htmlFor="module-name" className="sr-only">Module name</label>
          <input id="module-name" className="input text-headline-md" value={draft.name} onChange={(e) => update({ name: e.target.value })} placeholder="Module name" />
          <div className="mt-2"><SaveStatus state={state} /></div>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => setConfirmDelete(true)}>
          <Trash2 size={16} aria-hidden />
          Delete module
        </button>
      </header>

      <section className="card grid gap-4 md:grid-cols-2" aria-label="Module details">
        <div className="md:col-span-2">
          <label htmlFor="module-desc" className="field-label">Description</label>
          <textarea id="module-desc" className="input min-h-[88px]" value={draft.description} onChange={(e) => update({ description: e.target.value })} />
        </div>
        <div>
          <label htmlFor="module-owner" className="field-label">Module owner</label>
          <input id="module-owner" className="input" value={draft.owner} onChange={(e) => update({ owner: e.target.value })} />
        </div>
      </section>

      <section className="card" aria-labelledby="module-screens">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 id="module-screens" className="text-headline-md">Screens</h2>
          <button type="button" className="btn btn-secondary" onClick={() => setAiScreen(true)}><Sparkles size={16} aria-hidden />AI create screen</button>
          <button type="button" className="btn btn-primary" onClick={() => setNewScreen(true)}>
            <Plus size={16} aria-hidden />
            Add screen
          </button>
        </div>
        {sorted.length === 0 ? (
          <p className="text-body-md text-on-surface-variant">No screens in this module yet.</p>
        ) : (
          <ul className="divide-y divide-outline-variant">
            {sorted.map((s) => (
              <li key={s.id}>
                <Link to={`${appBase}/screens/${s.id}`} className="block py-3 hover:bg-surface-low">
                  <span className="block font-semibold">{s.name}</span>
                  {s.purpose && <span className="block truncate text-body-md text-on-surface-variant">{s.purpose}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AiScreenCreateModal open={aiScreen} module={initial} onClose={() => setAiScreen(false)} onCreated={(id) => navigate(`${appBase}/screens/${id}`)} />

      <QuickCreateModal
        open={newScreen}
        title={`New screen in ${draft.name || 'module'}`}
        nameLabel="Screen name"
        namePlaceholder="e.g. Supplier Maintenance"
        detailLabel="Purpose"
        submitLabel="Create screen"
        onClose={() => setNewScreen(false)}
        onSubmit={async (name, detail) => {
          const s = await createScreen(initial.applicationId, initial.id, name, detail);
          navigate(`${appBase}/screens/${s.id}`);
        }}
      />

      <ConfirmModal
        open={confirmDelete}
        title="Delete module?"
        confirmLabel="Delete module"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await deleteModule(initial.id);
          navigate(appBase);
        }}
        message={<p>This deletes <strong className="text-on-surface">{draft.name || 'this module'}</strong> together with its {sorted.length} screens, their functionalities and uploaded images. This cannot be undone.</p>}
      />
    </div>
  );
}
