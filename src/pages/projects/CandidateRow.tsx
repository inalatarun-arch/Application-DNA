import { useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronRight, X } from 'lucide-react';
import { db, nowIso } from '@/db/db';
import { PRIORITIES, REQUIREMENT_KINDS } from '@/db/projects';
import type { CandidateDecision, RequirementCandidate, RequirementKind } from '@/db/types';
import { useAutosave } from '@/hooks/useAutosave';
import RelatedPicker, { type RelatedOption } from '@/components/ui/RelatedPicker';
import StringListEditor from '@/components/ui/StringListEditor';
import StatusBadge from '@/components/ui/StatusBadge';
import { cn } from '@/lib/cn';

interface Props {
  candidate: RequirementCandidate;
  meetingId: string;
  meetingTitle: string;
  options: RelatedOption[];
  registerFlush: (id: string, flush: (() => Promise<void>) | null) => void;
  onOpenMeeting: (meetingId: string) => void;
}

/** One AI suggestion in the review queue: edit it, then accept or reject it. Mount with key={candidate.id}. */
export default function CandidateRow({ candidate, meetingId, meetingTitle, options, registerFlush, onOpenMeeting }: Props) {
  const { draft, update, flush } = useAutosave(db.candidates, candidate, 500);
  const [open, setOpen] = useState(false);
  // The decision is written straight to the database, so the live record is the source of truth for it.
  const decision = candidate.decision;
  const locked = decision === 'committed';

  useEffect(() => {
    registerFlush(candidate.id, flush);
    return () => registerFlush(candidate.id, null);
  }, [candidate.id, flush, registerFlush]);

  const decide = (next: CandidateDecision) => {
    const value: CandidateDecision = decision === next ? 'pending' : next;
    void db.candidates.update(candidate.id, { decision: value, updatedAt: nowIso() });
  };

  const id = (s: string) => `cand-${candidate.id}-${s}`;

  return (
    <li className={cn('border-b border-outline-variant last:border-b-0', decision === 'accepted' && 'border-l-2 border-l-primary', decision === 'rejected' && 'opacity-60')}>
      <div className="grid gap-3 p-3 md:grid-cols-[130px_minmax(0,1.1fr)_minmax(0,1.5fr)_100px_150px]">
        <div>
          <label htmlFor={id('kind')} className="sr-only">Type</label>
          <select id={id('kind')} className="input" disabled={locked} value={draft.kind} onChange={(e) => update({ kind: e.target.value as RequirementKind })}>
            {REQUIREMENT_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        </div>
        <div className="min-w-0">
          <label htmlFor={id('title')} className="sr-only">Requirement title</label>
          <textarea id={id('title')} className="input min-h-[38px] font-medium" rows={2} disabled={locked} value={draft.title} onChange={(e) => update({ title: e.target.value })} />
          {candidate.sourceQuote && <p className="mt-1 line-clamp-2 text-label-md font-normal italic text-on-surface-variant">“{candidate.sourceQuote}”</p>}
          <button type="button" className="mt-1 text-label-md font-normal text-on-surface-variant underline hover:text-on-surface" onClick={() => onOpenMeeting(meetingId)}>{meetingTitle || 'Meeting'}</button>
        </div>
        <div>
          <label htmlFor={id('desc')} className="sr-only">Description</label>
          <textarea id={id('desc')} className="input min-h-[84px]" rows={3} disabled={locked} value={draft.description} onChange={(e) => update({ description: e.target.value })} />
        </div>
        <div>
          <label htmlFor={id('priority')} className="sr-only">Priority</label>
          <select id={id('priority')} className="input" disabled={locked} value={draft.priority} onChange={(e) => update({ priority: e.target.value as RequirementCandidate['priority'] })}>
            {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {locked ? (
            <StatusBadge status="approved" label="In backlog" />
          ) : (
            <div role="group" aria-label="Review decision" className="flex gap-2">
              <button type="button" aria-pressed={decision === 'accepted'} onClick={() => decide('accepted')} className={cn('btn px-3 py-1.5', decision === 'accepted' ? 'btn-primary' : 'btn-secondary')}>
                <Check size={14} aria-hidden />
                Accept
              </button>
              <button type="button" aria-pressed={decision === 'rejected'} onClick={() => decide('rejected')} className={cn('btn px-3 py-1.5', decision === 'rejected' ? 'btn-primary' : 'btn-secondary')}>
                <X size={14} aria-hidden />
                Reject
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="px-3 pb-3">
        <button type="button" className="inline-flex items-center gap-1 text-label-md text-on-surface-variant hover:text-on-surface" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
          Acceptance criteria ({draft.acceptanceCriteria.filter((c) => c.trim()).length}) and impacted functionalities ({draft.functionalityIds.length})
        </button>
        {open && (
          <fieldset disabled={locked} className="mt-3 grid gap-4 md:grid-cols-2">
            <StringListEditor label="Acceptance criteria" items={draft.acceptanceCriteria} onChange={(v) => update({ acceptanceCriteria: v })} addLabel="Add criterion" placeholder="A testable statement" multiline />
            <RelatedPicker label="Impacted functionalities" options={options} value={draft.functionalityIds} onChange={(ids) => update({ functionalityIds: ids })} />
          </fieldset>
        )}
      </div>
    </li>
  );
}
