import { useCallback, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ClipboardList, Plus } from 'lucide-react';
import { db, nowIso } from '@/db/db';
import { addRequirement, commitAcceptedCandidates, deleteRequirement, REQUIREMENT_KINDS, REQUIREMENT_STATUSES } from '@/db/projects';
import type { CandidateDecision, Project, Requirement, RequirementKind } from '@/db/types';
import { useGraphSource } from '@/hooks/useGraphSource';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmModal from '@/components/ui/ConfirmModal';
import QuickCreateModal from '@/components/ui/QuickCreateModal';
import type { RelatedOption } from '@/components/ui/RelatedPicker';
import { sorted } from '@/lib/exporters';
import CandidateRow from './CandidateRow';
import BacklogRow from './BacklogRow';

interface Props {
  project: Project;
  onOpenMeeting: (meetingId: string) => void;
}

type QueueFilter = 'open' | CandidateDecision | 'all';

const QUEUE_FILTERS: Array<{ id: QueueFilter; label: string }> = [
  { id: 'open', label: 'Needs review' },
  { id: 'pending', label: 'Not reviewed' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'committed', label: 'In backlog' },
  { id: 'all', label: 'All' },
];

export default function ExtractedRequirementsTab({ project, onOpenMeeting }: Props) {
  const source = useGraphSource();
  const candidates = useLiveQuery(() => db.candidates.where('projectId').equals(project.id).toArray(), [project.id]);
  const meetings = useLiveQuery(() => db.meetings.where('projectId').equals(project.id).toArray(), [project.id]);
  const requirements = useLiveQuery(() => db.requirements.where('projectId').equals(project.id).toArray(), [project.id]);

  const flushers = useRef(new Map<string, () => Promise<void>>());
  const registerFlush = useCallback((id: string, fn: (() => Promise<void>) | null) => {
    if (fn) flushers.current.set(id, fn);
    else flushers.current.delete(id);
  }, []);

  const [filter, setFilter] = useState<QueueFilter>('open');
  const [meetingFilter, setMeetingFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | Requirement['status']>('all');
  const [kindFilter, setKindFilter] = useState<'all' | RequirementKind>('all');
  const [message, setMessage] = useState('');
  const [adding, setAdding] = useState(false);
  const [toDelete, setToDelete] = useState<Requirement | null>(null);
  const [busy, setBusy] = useState(false);

  const meetingTitle = useMemo(() => new Map((meetings ?? []).map((m) => [m.id, m.title])), [meetings]);
  const meetingDate = useMemo(() => new Map((meetings ?? []).map((m) => [m.id, m.meetingDate])), [meetings]);

  const options = useMemo<RelatedOption[]>(() => {
    if (!source) return [];
    const apps = new Set(project.applicationIds ?? []);
    const appName = new Map(source.applications.map((a) => [a.id, a.name]));
    const screenName = new Map(source.screens.map((s) => [s.id, s.name]));
    return source.functionalities
      .filter((f) => apps.size === 0 || apps.has(f.applicationId))
      .map((f) => ({ id: f.id, label: f.name, sublabel: [appName.get(f.applicationId), f.screenId ? screenName.get(f.screenId) : undefined].filter(Boolean).join(' › ') }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [source, project.applicationIds]);

  const all = candidates ?? [];
  const counts = {
    pending: all.filter((c) => c.decision === 'pending').length,
    accepted: all.filter((c) => c.decision === 'accepted').length,
  };

  const visible = all
    .filter((c) => (filter === 'all' ? true : filter === 'open' ? c.decision === 'pending' || c.decision === 'accepted' : c.decision === filter))
    .filter((c) => meetingFilter === 'all' || c.meetingId === meetingFilter)
    .sort((a, b) => (meetingDate.get(b.meetingId) ?? '').localeCompare(meetingDate.get(a.meetingId) ?? '') || a.createdAt.localeCompare(b.createdAt));

  const setMany = async (ids: string[], decision: CandidateDecision) => {
    await db.transaction('rw', db.candidates, async () => {
      for (const id of ids) await db.candidates.update(id, { decision, updatedAt: nowIso() });
    });
  };

  const commit = async () => {
    setBusy(true);
    setMessage('');
    try {
      // Make sure edits typed a moment ago are saved before they are copied into the backlog.
      await Promise.all([...flushers.current.values()].map((flush) => flush()));
      const n = await commitAcceptedCandidates(project.id);
      setMessage(n > 0 ? `Added ${n} requirement${n === 1 ? '' : 's'} to the backlog as drafts.` : 'No accepted suggestions with a title to add.');
    } finally {
      setBusy(false);
    }
  };

  const backlog = sorted(requirements ?? []);
  const codeOf = new Map(backlog.map((r, i) => [r.id, `REQ-${String(i + 1).padStart(3, '0')}`]));
  const backlogVisible = backlog.filter((r) => (statusFilter === 'all' || r.status === statusFilter) && (kindFilter === 'all' || r.kind === kindFilter));

  return (
    <div className="space-y-8">
      <section aria-labelledby="queue-heading" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="queue-heading" className="text-headline-md">Review queue</h2>
            <p className="max-w-2xl text-body-md text-on-surface-variant">Requirements Gemini found in your transcripts. Edit anything that needs fixing, then accept or reject. Only accepted items move to the backlog.</p>
          </div>
        </div>

        {candidates && all.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No suggestions yet" description="Process a transcript in Meeting notes and the requirements Gemini finds will appear here for review.">
            <button type="button" className="btn btn-secondary" onClick={() => setAdding(true)}>
              <Plus size={16} aria-hidden />
              Add a requirement manually
            </button>
          </EmptyState>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <select className="input w-auto" value={filter} onChange={(e) => setFilter(e.target.value as QueueFilter)} aria-label="Show suggestions">
                {QUEUE_FILTERS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
              <select className="input w-auto" value={meetingFilter} onChange={(e) => setMeetingFilter(e.target.value)} aria-label="Filter by meeting">
                <option value="all">All meetings</option>
                {(meetings ?? []).map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
              </select>
              <span className="text-label-md font-normal text-on-surface-variant" aria-live="polite">{counts.pending} not reviewed · {counts.accepted} accepted</span>
              <div className="ml-auto flex flex-wrap gap-2">
                <button type="button" className="btn btn-secondary px-3 py-1.5" disabled={visible.filter((c) => c.decision === 'pending').length === 0} onClick={() => void setMany(visible.filter((c) => c.decision === 'pending').map((c) => c.id), 'accepted')}>Accept all shown</button>
                <button type="button" className="btn btn-secondary px-3 py-1.5" disabled={visible.filter((c) => c.decision === 'pending').length === 0} onClick={() => void setMany(visible.filter((c) => c.decision === 'pending').map((c) => c.id), 'rejected')}>Reject all shown</button>
                <button type="button" className="btn btn-primary px-3 py-1.5" disabled={counts.accepted === 0 || busy} onClick={() => void commit()}>
                  Add {counts.accepted} accepted to backlog
                </button>
              </div>
            </div>
            {message && <p role="status" className="rounded border border-outline-variant bg-surface-low p-3 text-body-md">{message}</p>}

            {visible.length === 0 ? (
              <p className="rounded border border-dashed border-outline-variant px-3 py-6 text-center text-body-md text-on-surface-variant">Nothing to show for this filter.</p>
            ) : (
              <div className="overflow-hidden rounded border border-outline-variant bg-surface-lowest">
                <div className="hidden grid-cols-[130px_minmax(0,1.1fr)_minmax(0,1.5fr)_100px_150px] gap-3 border-b border-outline-variant bg-surface-low px-3 py-2 text-label-md text-on-surface-variant md:grid">
                  <span>Type</span>
                  <span>Requirement</span>
                  <span>Description</span>
                  <span>Priority</span>
                  <span>Review</span>
                </div>
                <ul>
                  {visible.map((c) => (
                    <CandidateRow
                      key={c.id}
                      candidate={c}
                      meetingId={c.meetingId}
                      meetingTitle={meetingTitle.get(c.meetingId) ?? ''}
                      options={options}
                      registerFlush={registerFlush}
                      onOpenMeeting={onOpenMeeting}
                    />
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="backlog-heading" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="backlog-heading" className="text-headline-md">Project backlog <span className="text-body-lg font-normal text-on-surface-variant">({backlog.length})</span></h2>
            <p className="max-w-2xl text-body-md text-on-surface-variant">Committed requirements. Open one to refine it, map it to functionalities and move it through review.</p>
          </div>
          <button type="button" className="btn btn-secondary" onClick={() => setAdding(true)}>
            <Plus size={16} aria-hidden />
            Add requirement
          </button>
        </div>

        {backlog.length === 0 ? (
          <p className="rounded border border-dashed border-outline-variant px-3 py-6 text-center text-body-md text-on-surface-variant">The backlog is empty. Accept suggestions above or add a requirement manually.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <select className="input w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | Requirement['status'])} aria-label="Filter by status">
                <option value="all">All statuses</option>
                {REQUIREMENT_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <select className="input w-auto" value={kindFilter} onChange={(e) => setKindFilter(e.target.value as 'all' | RequirementKind)} aria-label="Filter by type">
                <option value="all">All types</option>
                {REQUIREMENT_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
            </div>
            <ul className="overflow-hidden rounded border border-outline-variant bg-surface-lowest">
              {backlogVisible.map((r) => (
                <BacklogRow key={r.id} requirement={r} code={codeOf.get(r.id) ?? ''} meetingTitle={r.source ? meetingTitle.get(r.source) ?? 'Deleted meeting' : ''} options={options} onDelete={() => setToDelete(r)} />
              ))}
            </ul>
          </>
        )}
      </section>

      <QuickCreateModal
        open={adding}
        title="Add requirement"
        nameLabel="Requirement"
        namePlaceholder="e.g. The system shall allow multiple bank accounts per supplier"
        detailLabel="Description"
        submitLabel="Add to backlog"
        onClose={() => setAdding(false)}
        onSubmit={async (title, description) => {
          await addRequirement(project.id, { title, description });
        }}
      />

      <ConfirmModal
        open={!!toDelete}
        title="Delete requirement?"
        confirmLabel="Delete requirement"
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          if (toDelete) await deleteRequirement(toDelete.id);
          setToDelete(null);
        }}
        message={<p><strong className="text-on-surface">{toDelete?.title || 'This requirement'}</strong> will be removed from the backlog. If it came from a suggestion, that suggestion returns to the accepted list.</p>}
      />
    </div>
  );
}
