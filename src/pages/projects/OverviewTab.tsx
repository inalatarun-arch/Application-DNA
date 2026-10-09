import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, X } from 'lucide-react';
import { db, newId, nowIso } from '@/db/db';
import { PRIORITIES } from '@/db/projects';
import type { Project, ProjectNote, ProjectPriority } from '@/db/types';
import { useGraphSource } from '@/hooks/useGraphSource';
import Section from '@/components/ui/Section';
import ScopePicker from '@/components/ui/ScopePicker';
import { computeScope } from '@/lib/projectScope';

interface Props {
  project: Project;
  update: (patch: Partial<Project>) => void;
}

const NOTE_KINDS: Array<{ id: ProjectNote['kind']; label: string }> = [
  { id: 'assumption', label: 'Assumption' },
  { id: 'risk', label: 'Risk' },
  { id: 'dependency', label: 'Dependency' },
  { id: 'decision', label: 'Decision' },
  { id: 'change-request', label: 'Change request' },
  { id: 'meeting-note', label: 'Note' },
];

export default function OverviewTab({ project, update }: Props) {
  const applications = useLiveQuery(() => db.applications.toArray(), []);
  const modules = useLiveQuery(() => db.modules.toArray(), []);
  const source = useGraphSource();
  const [noteKind, setNoteKind] = useState<ProjectNote['kind']>('assumption');
  const [noteText, setNoteText] = useState('');

  const scope = source ? computeScope(project, source, source.requirements.filter((r) => r.projectId === project.id)) : null;
  const appName = new Map((applications ?? []).map((a) => [a.id, a.name]));
  const moduleName = new Map((modules ?? []).map((m) => [m.id, m.name]));

  const addNote = () => {
    const text = noteText.trim();
    if (!text) return;
    update({ notes: [...project.notes, { id: newId(), kind: noteKind, text, createdAt: nowIso() }] });
    setNoteText('');
  };

  return (
    <div className="space-y-6">
      <Section title="Details" description="What the initiative is, who runs it and when it is due.">
        <div>
          <label htmlFor="p-desc" className="field-label">Description</label>
          <textarea id="p-desc" className="input min-h-[96px]" value={project.description} onChange={(e) => update({ description: e.target.value })} placeholder="What the initiative changes and why it matters" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="p-owner" className="field-label">Business analyst / owner</label>
            <input id="p-owner" className="input" value={project.owner} onChange={(e) => update({ owner: e.target.value })} />
          </div>
          <div>
            <label htmlFor="p-sponsor" className="field-label">Project sponsor</label>
            <input id="p-sponsor" className="input" value={project.sponsor} onChange={(e) => update({ sponsor: e.target.value })} />
          </div>
          <div>
            <label htmlFor="p-priority" className="field-label">Priority</label>
            <select id="p-priority" className="input" value={project.priority ?? 'medium'} onChange={(e) => update({ priority: e.target.value as ProjectPriority })}>
              {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="p-date" className="field-label">Target date</label>
            <input id="p-date" type="date" className="input" value={project.targetDate ?? ''} onChange={(e) => update({ targetDate: e.target.value })} />
          </div>
        </div>
      </Section>

      <Section title="Impacted applications and modules" description="The AI uses this scope when it reads a transcript, and the impact analysis starts from it.">
        <ScopePicker
          applications={applications ?? []}
          modules={modules ?? []}
          applicationIds={project.applicationIds ?? []}
          moduleIds={project.moduleIds ?? []}
          onChange={(applicationIds, moduleIds) => update({ applicationIds, moduleIds })}
        />
        {(project.applicationIds ?? []).length > 0 && (
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-body-md">
            <span className="text-on-surface-variant">Open:</span>
            {(project.applicationIds ?? []).map((id) => appName.has(id) && <Link key={id} to={`/applications/${id}`} className="hover:underline">{appName.get(id)}</Link>)}
            {(project.moduleIds ?? []).map((id) => moduleName.has(id) && <span key={id} className="text-on-surface-variant">{moduleName.get(id)}</span>)}
          </div>
        )}
        {scope && (
          <p className="rounded border border-outline-variant bg-surface-low px-3 py-2 text-body-md text-on-surface-variant">
            In scope: <strong className="text-on-surface">{scope.screens.length}</strong> screens, <strong className="text-on-surface">{scope.functionalities.length}</strong> functionalities and{' '}
            <strong className="text-on-surface">{scope.directComponents.length + scope.dependencyComponents.length}</strong> technical components.
          </p>
        )}
      </Section>

      <Section title="Assumptions, risks and dependencies" description="A running log for the project.">
        <div className="flex flex-wrap gap-2">
          <select className="input w-auto" value={noteKind} onChange={(e) => setNoteKind(e.target.value as ProjectNote['kind'])} aria-label="Entry type">
            {NOTE_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
          <input
            className="input min-w-[220px] flex-1"
            value={noteText}
            placeholder="Add an entry and press Enter"
            aria-label="New entry"
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addNote();
              }
            }}
          />
          <button type="button" className="btn btn-secondary" onClick={addNote} disabled={!noteText.trim()}>
            <Plus size={16} aria-hidden />
            Add
          </button>
        </div>
        {project.notes.length === 0 ? (
          <p className="text-body-md text-on-surface-variant">Nothing logged yet.</p>
        ) : (
          <ul className="divide-y divide-outline-variant rounded border border-outline-variant">
            {[...project.notes].reverse().map((n) => (
              <li key={n.id} className="flex items-start gap-3 px-3 py-2">
                <span className="mt-0.5 w-28 shrink-0 text-label-md text-on-surface-variant">{NOTE_KINDS.find((k) => k.id === n.kind)?.label ?? n.kind}</span>
                <span className="min-w-0 flex-1 whitespace-pre-line break-words text-body-md">{n.text}</span>
                <button type="button" className="icon-btn -my-1 shrink-0" aria-label="Remove entry" onClick={() => update({ notes: project.notes.filter((x) => x.id !== n.id) })}>
                  <X size={16} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
