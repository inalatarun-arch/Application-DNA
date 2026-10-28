import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, Boxes, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { db } from '@/db/db';
import { createModule, deleteApplication, countApplicationContents, type ApplicationStats } from '@/db/catalog';
import TierBadge from '@/components/ui/TierBadge';
import Chip from '@/components/ui/Chip';
import ConfirmModal from '@/components/ui/ConfirmModal';
import QuickCreateModal from '@/components/ui/QuickCreateModal';
import Disclosure from '@/components/ui/Disclosure';
import StatStrip from '@/components/ui/StatStrip';
import { useReveal } from '@/lib/motion';
import { plural } from '@/lib/plural';
import { useAppContext } from './appContext';
import ApplicationFormModal from './ApplicationFormModal';
import ApplicationAiIngest from './ApplicationAiIngest';

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1 text-body-md">{children}</dd>
    </div>
  );
}

export default function ApplicationOverview() {
  const { app } = useAppContext();
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState<ApplicationStats | null>(null);
  const [newModule, setNewModule] = useState(false);

  const data = useLiveQuery(async () => {
    const [modules, screens, fnCount, componentCount] = await Promise.all([
      db.modules.where('applicationId').equals(app.id).toArray(),
      db.screens.where('applicationId').equals(app.id).toArray(),
      db.functionalities.where('applicationId').equals(app.id).count(),
      db.technicalComponents.where('applicationId').equals(app.id).count(),
    ]);
    modules.sort((a, b) => a.name.localeCompare(b.name));
    return { modules, screens, functionalities: fnCount, components: componentCount };
  }, [app.id]);

  useReveal(rootRef, '[data-reveal]', { deps: [app.id, data !== undefined], y: 12, stagger: 0.06 });

  const screenCount = (moduleId: string) => data?.screens.filter((s) => s.moduleId === moduleId).length ?? 0;
  const dash = <span className="text-on-surface-variant">Not set</span>;
  // An application with nothing documented yet should open on the capture tool; a documented one keeps it tucked away.
  const empty = data !== undefined && data.modules.length === 0 && data.screens.length === 0;

  return (
    <div ref={rootRef} className="space-y-5">
      <header data-reveal className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-headline-lg">{app.name}</h1>
            <TierBadge tier={app.criticalTier} />
          </div>
          <p className="mt-1 text-body-md text-on-surface-variant">{[app.vendor, app.domain].filter(Boolean).join(' · ') || 'No platform or domain set'}</p>
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

      <div data-reveal>
        <StatStrip
          label="Totals"
          stats={[
            { label: 'Modules', value: data?.modules.length },
            { label: 'Screens', value: data?.screens.length },
            { label: 'Functionalities', value: data?.functionalities },
            { label: 'Technical components', value: data?.components, to: `/applications/${app.id}/technical` },
          ]}
        />
      </div>

      <section data-reveal className="card" aria-label="Application details">
        {app.description && <p className="mb-5 max-w-3xl text-body-lg">{app.description}</p>}
        <dl className="grid gap-5 sm:grid-cols-2">
          <Meta label="Business owner">{app.businessOwner || dash}</Meta>
          <Meta label="Technical owner">{app.technicalOwner || dash}</Meta>
          <Meta label="Technical stack">
            {app.technicalStack.length ? <span className="flex flex-wrap gap-1">{app.technicalStack.map((s) => <Chip key={s}>{s}</Chip>)}</span> : dash}
          </Meta>
          <Meta label="Tags">{app.tags.length ? <span className="flex flex-wrap gap-1">{app.tags.map((s) => <Chip key={s}>{s}</Chip>)}</span> : dash}</Meta>
        </dl>
      </section>

      <section data-reveal aria-labelledby="modules-heading">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="modules-heading" className="text-headline-md">Modules</h2>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setNewModule(true)}>
            <Plus size={14} aria-hidden />
            Add module
          </button>
        </div>
        {data && data.modules.length === 0 ? (
          <p className="rounded-lg border border-dashed border-outline-variant p-5 text-body-md text-on-surface-variant">No modules yet. Modules group the screens of this application, for example Payables or Accounts. Add one, or use AI capture below to draft them from a description.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {data?.modules.map((m) => (
              <li key={m.id}>
                <Link to={`/applications/${app.id}/modules/${m.id}`} className="card card-interactive group flex h-full items-start gap-3 p-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-container text-primary">
                    <Boxes size={16} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{m.name}</span>
                    {m.description && <span className="mt-0.5 line-clamp-2 block text-body-md text-on-surface-variant">{m.description}</span>}
                    <span className="mt-2 block text-label-md font-normal text-on-surface-variant">{plural(screenCount(m.id), 'screen')}</span>
                  </span>
                  <ArrowRight size={16} aria-hidden className="mt-1 shrink-0 text-on-surface-variant transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {data && (
        <div data-reveal>
          <Disclosure
            key={empty ? 'open' : 'closed'}
            icon={Sparkles}
            title="Capture with AI"
            description="Draft modules, screens and functionality from a description, files, a live site or a repository."
            defaultOpen={empty}
          >
            <ApplicationAiIngest applicationId={app.id} embedded />
          </Disclosure>
        </div>
      )}

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
              <p><strong className="text-on-surface">{app.name}</strong> will be removed together with {plural(deleting.modules, 'module')}, {plural(deleting.screens, 'screen')} and {plural(deleting.functionalities, 'functionality', 'functionalities')}, including uploaded images.</p>
              <p className="mt-2">This cannot be undone.</p>
            </>
          )
        }
      />
    </div>
  );
}
