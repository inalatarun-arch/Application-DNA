import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { FileText, Plus } from 'lucide-react';
import { db } from '@/db/db';
import { createMeeting } from '@/db/projects';
import type { Project } from '@/db/types';
import EmptyState from '@/components/ui/EmptyState';
import QuickCreateModal from '@/components/ui/QuickCreateModal';
import StatusBadge from '@/components/ui/StatusBadge';
import { cn } from '@/lib/cn';
import MeetingEditor from './MeetingEditor';

interface Props {
  project: Project;
  onReview: () => void;
}

export default function MeetingNotesTab({ project, onReview }: Props) {
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const meetings = useLiveQuery(() => db.meetings.where('projectId').equals(project.id).toArray(), [project.id]);

  const sorted = [...(meetings ?? [])].sort((a, b) => b.meetingDate.localeCompare(a.meetingDate) || b.createdAt.localeCompare(a.createdAt));
  const requested = params.get('meeting');
  const selected = sorted.find((m) => m.id === requested) ?? sorted[0];

  const select = (id: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set('meeting', id);
        else next.delete('meeting');
        return next;
      },
      { replace: true },
    );

  if (meetings && meetings.length === 0) {
    return (
      <>
        <EmptyState icon={FileText} title="No meetings yet" description="Add a kickoff or workshop session, paste or upload the transcript, and Gemini will write the notes and suggest requirements for you to review.">
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            <Plus size={16} aria-hidden />
            New meeting
          </button>
        </EmptyState>
        <NewMeeting open={creating} projectId={project.id} onClose={() => setCreating(false)} onCreated={select} />
      </>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside aria-label="Meetings" className="space-y-3">
        <button type="button" className="btn btn-primary w-full" onClick={() => setCreating(true)}>
          <Plus size={16} aria-hidden />
          New meeting
        </button>
        <ul className="divide-y divide-outline-variant rounded border border-outline-variant bg-surface-lowest">
          {sorted.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => select(m.id)} aria-current={selected?.id === m.id} className={cn('block w-full px-3 py-2 text-left transition-colors hover:bg-surface-low', selected?.id === m.id && 'bg-surface-container')}>
                <span className={cn('block truncate text-body-md', selected?.id === m.id ? 'font-semibold' : 'font-medium')}>{m.title || 'Untitled meeting'}</span>
                <span className="mt-1 flex items-center gap-2 text-label-md font-normal text-on-surface-variant">
                  {m.meetingDate || 'No date'}
                  {m.status !== 'draft' && <StatusBadge status={m.status} label={m.status === 'processed' ? 'Processed' : 'Failed'} />}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <div className="min-w-0">
        {selected ? (
          <MeetingEditor key={selected.id} meeting={selected} project={project} onReview={onReview} onDeleted={() => select(null)} />
        ) : (
          <p className="text-body-md text-on-surface-variant">Loading…</p>
        )}
      </div>
      <NewMeeting open={creating} projectId={project.id} onClose={() => setCreating(false)} onCreated={select} />
    </div>
  );
}

function NewMeeting({ open, projectId, onClose, onCreated }: { open: boolean; projectId: string; onClose: () => void; onCreated: (id: string) => void }) {
  return (
    <QuickCreateModal
      open={open}
      title="New meeting"
      nameLabel="Meeting title"
      namePlaceholder="e.g. Supplier onboarding kickoff workshop"
      submitLabel="Create meeting"
      onClose={onClose}
      onSubmit={async (title) => {
        const m = await createMeeting(projectId, title);
        onCreated(m.id);
      }}
    />
  );
}
