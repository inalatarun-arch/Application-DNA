import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight, FolderKanban, Trash2 } from 'lucide-react';
import { db } from '@/db/db';
import { countProjectContents, deleteProject, labelOf, PROJECT_STATUSES, type ProjectStats } from '@/db/projects';
import type { Project, ProjectStatus } from '@/db/types';
import { useAutosave } from '@/hooks/useAutosave';
import SaveStatus from '@/components/ui/SaveStatus';
import StatusBadge from '@/components/ui/StatusBadge';
import Tabs from '@/components/ui/Tabs';
import ConfirmModal from '@/components/ui/ConfirmModal';
import EmptyState from '@/components/ui/EmptyState';
import OverviewTab from './OverviewTab';
import MeetingNotesTab from './MeetingNotesTab';
import ExtractedRequirementsTab from './ExtractedRequirementsTab';
import ImpactTab from './ImpactTab';
import DeliverablesTab from './DeliverablesTab';

const TAB_IDS = ['overview', 'notes', 'requirements', 'impact', 'deliverables'] as const;
type TabId = (typeof TAB_IDS)[number];

export default function ProjectWorkspace() {
  const { projectId = '' } = useParams();
  const project = useLiveQuery(() => db.projects.get(projectId).then((p) => p ?? null), [projectId]);

  if (project === undefined) return <p className="text-body-md text-on-surface-variant">Loading…</p>;
  if (project === null) {
    return (
      <EmptyState icon={FolderKanban} title="Project not found" description="It may have been deleted, or you opened a link from a different browser.">
        <Link to="/projects" className="btn btn-secondary">Back to projects</Link>
      </EmptyState>
    );
  }
  return <ProjectEditor key={project.id} project={project} />;
}

function ProjectEditor({ project }: { project: Project }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { draft, update, state } = useAutosave(db.projects, project);
  const [deleting, setDeleting] = useState<ProjectStats | null>(null);

  const requested = params.get('tab');
  const tab: TabId = (TAB_IDS as readonly string[]).includes(requested ?? '') ? (requested as TabId) : 'overview';

  const counts = useLiveQuery(async () => {
    const [meetings, requirements, review] = await Promise.all([
      db.meetings.where('projectId').equals(project.id).count(),
      db.requirements.where('projectId').equals(project.id).count(),
      db.candidates.where('projectId').equals(project.id).filter((c) => c.decision === 'pending' || c.decision === 'accepted').count(),
    ]);
    return { meetings, requirements, review };
  }, [project.id]);

  const selectTab = (id: TabId, extra?: Record<string, string>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', id);
        if (!extra || !('meeting' in extra)) next.delete('meeting');
        for (const [k, v] of Object.entries(extra ?? {})) next.set(k, v);
        return next;
      },
      { replace: true },
    );

  return (
    <div className="space-y-6">
      <nav aria-label="Location" className="flex flex-wrap items-center gap-1 text-body-md">
        <Link to="/projects" className="text-on-surface-variant hover:text-on-surface hover:underline">Projects</Link>
        <ChevronRight size={14} aria-hidden className="text-outline" />
        <span className="font-semibold" aria-current="page">{draft.name || 'Untitled project'}</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <label htmlFor="project-name" className="sr-only">Project name</label>
          <input id="project-name" className="input text-headline-md" value={draft.name} onChange={(e) => update({ name: e.target.value })} placeholder="Project name" />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <SaveStatus state={state} />
            <StatusBadge status={draft.status} label={labelOf(PROJECT_STATUSES, draft.status)} />
          </div>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label htmlFor="project-status" className="field-label">Status</label>
            <select id="project-status" className="input w-auto" value={draft.status} onChange={(e) => update({ status: e.target.value as ProjectStatus })}>
              {PROJECT_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <button type="button" className="btn btn-secondary" onClick={async () => setDeleting(await countProjectContents(project.id))}>
            <Trash2 size={16} aria-hidden />
            Delete
          </button>
        </div>
      </header>

      <Tabs<TabId>
        label="Project workspace"
        active={tab}
        onChange={(id) => selectTab(id)}
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'notes', label: 'Meeting notes', count: counts?.meetings },
          { id: 'requirements', label: 'Extracted requirements', count: counts?.review ? counts.review : counts?.requirements },
          { id: 'impact', label: 'Impact analysis' },
          { id: 'deliverables', label: 'Deliverables' },
        ]}
      />

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'overview' && <OverviewTab project={draft} update={update} />}
        {tab === 'notes' && <MeetingNotesTab project={draft} onReview={() => selectTab('requirements')} />}
        {tab === 'requirements' && <ExtractedRequirementsTab project={draft} onOpenMeeting={(id) => selectTab('notes', { meeting: id })} />}
        {tab === 'impact' && <ImpactTab project={draft} />}
        {tab === 'deliverables' && <DeliverablesTab project={draft} />}
      </div>

      <ConfirmModal
        open={!!deleting}
        title="Delete project?"
        confirmLabel="Delete project"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          await deleteProject(project.id);
          navigate('/projects');
        }}
        message={
          deleting && (
            <>
              <p><strong className="text-on-surface">{draft.name || 'This project'}</strong> will be removed together with {deleting.meetings} meetings, {deleting.suggestions} requirement suggestions and {deleting.requirements} backlog requirements.</p>
              <p className="mt-2">The applications and screens it was linked to are not affected. This cannot be undone.</p>
            </>
          )
        }
      />
    </div>
  );
}
