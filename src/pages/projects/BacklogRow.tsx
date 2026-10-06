import { useState } from 'react';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { db } from '@/db/db';
import { labelOf, PRIORITIES, REQUIREMENT_KINDS, REQUIREMENT_STATUSES } from '@/db/projects';
import type { Requirement, RequirementKind } from '@/db/types';
import { useAutosave } from '@/hooks/useAutosave';
import RelatedPicker, { type RelatedOption } from '@/components/ui/RelatedPicker';
import SaveStatus from '@/components/ui/SaveStatus';
import StatusBadge from '@/components/ui/StatusBadge';
import StringListEditor from '@/components/ui/StringListEditor';

interface Props {
  requirement: Requirement;
  code: string;
  meetingTitle: string;
  options: RelatedOption[];
  onDelete: () => void;
}

function Editor({ requirement, meetingTitle, options, onDelete }: Omit<Props, 'code'>) {
  const { draft, update, state } = useAutosave(db.requirements, requirement);
  const id = (s: string) => `req-${requirement.id}-${s}`;
  return (
    <div className="space-y-4 border-t border-outline-variant px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SaveStatus state={state} />
        <button type="button" className="btn btn-secondary px-3 py-1" onClick={onDelete}>
          <Trash2 size={14} aria-hidden />
          Delete requirement
        </button>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <div>
          <label htmlFor={id('kind')} className="field-label">Type</label>
          <select id={id('kind')} className="input" value={draft.kind} onChange={(e) => update({ kind: e.target.value as RequirementKind })}>
            {REQUIREMENT_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={id('priority')} className="field-label">Priority</label>
          <select id={id('priority')} className="input" value={draft.priority ?? 'medium'} onChange={(e) => update({ priority: e.target.value as Requirement['priority'] })}>
            {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={id('status')} className="field-label">Status</label>
          <select id={id('status')} className="input" value={draft.status} onChange={(e) => update({ status: e.target.value as Requirement['status'] })}>
            {REQUIREMENT_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <span className="field-label">Source</span>
          <p className="py-2 text-body-md text-on-surface-variant">{meetingTitle || 'Added manually'}</p>
        </div>
        <div className="md:col-span-4">
          <label htmlFor={id('title')} className="field-label">Title</label>
          <input id={id('title')} className="input" value={draft.title} onChange={(e) => update({ title: e.target.value })} />
        </div>
        <div className="md:col-span-4">
          <label htmlFor={id('desc')} className="field-label">Description</label>
          <textarea id={id('desc')} className="input min-h-[88px]" value={draft.description} onChange={(e) => update({ description: e.target.value })} />
        </div>
        <div className="md:col-span-2">
          <StringListEditor label="Acceptance criteria" items={draft.acceptanceCriteria} onChange={(v) => update({ acceptanceCriteria: v })} addLabel="Add criterion" placeholder="A testable statement" multiline />
        </div>
        <div className="md:col-span-2">
          <RelatedPicker label="Impacted functionalities" options={options} value={draft.functionalityIds} onChange={(ids) => update({ functionalityIds: ids })} />
        </div>
      </div>
    </div>
  );
}

/** A committed requirement in the project backlog. Click to expand the editor. */
export default function BacklogRow({ requirement, code, meetingTitle, options, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const optionIds = new Set(options.map((o) => o.id));
  const mapped = (requirement.functionalityIds ?? []).filter((id) => optionIds.has(id)).length;
  return (
    <li className="border-b border-outline-variant last:border-b-0">
      <h3>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-low">
          {open ? <ChevronDown size={16} aria-hidden className="shrink-0" /> : <ChevronRight size={16} aria-hidden className="shrink-0" />}
          <span className="w-16 shrink-0 font-mono text-code text-on-surface-variant">{code}</span>
          <span className="hidden w-28 shrink-0 text-label-md font-normal text-on-surface-variant sm:inline">{labelOf(REQUIREMENT_KINDS, requirement.kind)}</span>
          <span className="min-w-0 flex-1 truncate font-medium">{requirement.title || 'Untitled requirement'}</span>
          <span className="hidden shrink-0 text-label-md font-normal text-on-surface-variant md:inline">{mapped} functionalit{mapped === 1 ? 'y' : 'ies'}</span>
          <span className="hidden shrink-0 sm:inline"><StatusBadge status={requirement.priority ?? 'medium'} label={labelOf(PRIORITIES, requirement.priority ?? 'medium')} /></span>
          <StatusBadge status={requirement.status} label={labelOf(REQUIREMENT_STATUSES, requirement.status)} />
        </button>
      </h3>
      {open && <Editor requirement={requirement} meetingTitle={meetingTitle} options={options} onDelete={onDelete} />}
    </li>
  );
}
