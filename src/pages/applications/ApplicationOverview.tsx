import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { db } from '@/db/db';
import { createModule, deleteApplication, countApplicationContents, type ApplicationStats } from '@/db/catalog';
import TierBadge from '@/components/ui/TierBadge';
import Chip from '@/components/ui/Chip';
import ConfirmModal from '@/components/ui/ConfirmModal';
import QuickCreateModal from '@/components/ui/QuickCreateModal';
import { useAppContext } from './appContext';
import ApplicationFormModal from './ApplicationFormModal';
import ApplicationAiIngest from './ApplicationAiIngest';

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-label-md text-on-surface-variant">{label}</dt>
      <dd className="mt-0.5 text-body-md">{children}</dd>
    </div>
  );
}

export default function ApplicationOverview() {
  const { app } = useAppContext();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState<ApplicationStats | null>(null);
  const [newModule, setNewModule] = useState(false);

  const data = useLiveQuery(async () => {
    const [modules, screenKeys, fnCount, componentCount] = await Promise.all([
      db.modules.where('applicationId').equals(app.id).toArray(),
      db.screens.where('applicationId').equals(app.id).toArray(),
      db.functionalities.where('applicationId').equals(app.id).count(),
      db.technicalComponents.where('applicationId').equals(app.id).count(),
    ]);
    modules.sort((a, b) => a.name.localeCompare(b.name));
    return { modules, screens: screenKeys, functionalities: fnCount, components: componentCount };
  }, [app.id]);

  const screenCount = (moduleId: string) => data?.screens.filter((s) => s.moduleId === moduleId).length ?? 0;
  const dash = <span className="text-on-surface-variant">Not set</span>;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-headline-lg">{app.name}</h1>
            <TierBadge tier={app.criticalTier} />
          </div>
          <p className="mt-1 text-body-lg text-on-surface-variant">{[app.vendor, app.domain].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>
            <Pencil size={16} aria-hidden />
            Edit
          </button>
          <button type="button" className="btn btn-secondary" onClick={async () => setDeleting(await countApplicationContents(app.id))}>
            <Trash2 size={16} aria-hidden />
            Delete
          </button>
        </div>
      </header>

      <ApplicationAiIngest applicationId={app.id} />

      <section className="card" aria-label="Application details">
        {app.description && <p className="mb-4 text-body-lg">{app.description}</p>}
        <dl className="grid gap-4 sm:grid-cols-2">
          <Meta label="Business owner">{app.businessOwner || dash}</Meta>
          <Meta label="Technical owner">{app.technicalOwner || dash}</Meta>
          <Meta label="Technical stack">
            {app.technicalStack.length ? <span className="flex flex-wrap gap-1">{app.technicalStack.map((s) => <Chip key={s}>{s}</Chip>)}</span> : dash}
          </Meta>
          <Meta label="Tags">{app.tags.length ? <span className="flex flex-wrap gap-1">{app.tags.map((s) => <Chip key={s}>{s}</Chip>)}</span> : dash}</Meta>
        </dl>
      </section>

      <section aria-label="Totals" className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          ['Modules', data?.modules.length],
          ['Screens', data?.screens.length],
          ['Functionalities', data?.functionalities],
          ['Technical components', data?.components],
        ].map(([label, value]) => (
          <div key={label as string} className="card p-4">
            <p className="text-label-md text-on-surface-variant">{label}</p>
            <p className="mt-1 text-headline-lg">{value ?? '–'}</p>
          </div>
        ))}
      </section>

      <section className="card" aria-labelledby="modules-heading">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 id="modules-heading" className="text-headline-md">Modules</h2>
          <button type="button" className="btn btn-primary" onClick={() => setNewModule(true)}>
            <Plus size={16} aria-hidden />
            Add module
          </button>
        </div>
        {data && data.modules.length === 0 ? (
          <p className="text-body-md text-on-surface-variant">No modules yet. Modules group the screens of this application, for example Payables or Accounts.</p>
        ) : (
          <ul className="divide-y divide-outline-variant">
            {data?.modules.map((m) => (
              <li key={m.id}>
                <Link to={`/applications/${app.id}/modules/${m.id}`} className="flex items-center justify-between gap-4 py-3 hover:bg-surface-low">
                  <span className="min-w-0">
                    <span className="block font-semibold">{m.name}</span>
                    {m.description && <span className="block truncate text-body-md text-on-surface-variant">{m.description}</span>}
                  </span>
                  <span className="shrink-0 text-label-md font-normal text-on-surface-variant">{screenCount(m.id)} screens</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ApplicationFormModal open={editing} application={app} onClose={() => setEditing(false)} />

      <QuickCreateModal
        open={newModule}
        title="New module"
        nameLabel="Module name"
        namePlaceholder="e.g. Payables"
        detailLabel="Description"
        submitLabel="Create module"
        onClose={() => setNewModule(false)}
        onSubmit={async (name, detail) => {
          const m = await createModule(app.id, name, detail);
          navigate(`/applications/${app.id}/modules/${m.id}`);
        }}
      />

      <ConfirmModal
        open={!!deleting}
        title="Delete application?"
        confirmLabel="Delete application"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          await deleteApplication(app.id);
          navigate('/applications');
        }}
        message={
          deleting && (
            <>
              <p><strong className="text-on-surface">{app.name}</strong> will be removed together with {deleting.modules} modules, {deleting.screens} screens and {deleting.functionalities} functionalities, including uploaded images.</p>
              <p className="mt-2">This cannot be undone.</p>
            </>
          )
        }
      />
    </div>
  );
}
