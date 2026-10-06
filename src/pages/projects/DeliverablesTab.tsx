import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Circle, Download } from 'lucide-react';
import { db } from '@/db/db';
import type { Project } from '@/db/types';
import { useGraphSource } from '@/hooks/useGraphSource';
import Section from '@/components/ui/Section';
import { backlogToCsv, backlogToMarkdown, fileBase, impactToMarkdown, meetingToMarkdown, saveText, sorted } from '@/lib/exporters';
import type { ImpactAssessment } from '@/services/impactAI';

function parse(content: string): ImpactAssessment | null {
  try {
    const v = JSON.parse(content) as Partial<ImpactAssessment>;
    return { summary: v.summary ?? '', functional: v.functional ?? [], technical: v.technical ?? [], risks: v.risks ?? [], gaps: v.gaps ?? [] };
  } catch {
    return null;
  }
}

export default function DeliverablesTab({ project }: { project: Project }) {
  const source = useGraphSource();
  const meetings = useLiveQuery(() => db.meetings.where('projectId').equals(project.id).toArray(), [project.id]);
  const requirements = useLiveQuery(() => db.requirements.where('projectId').equals(project.id).toArray(), [project.id]);
  const candidates = useLiveQuery(() => db.candidates.where('projectId').equals(project.id).toArray(), [project.id]);
  const artifacts = useLiveQuery(() => db.artifacts.where('projectId').equals(project.id).filter((a) => a.kind === 'impact-assessment').toArray(), [project.id]);

  const fnName = useMemo(() => new Map((source?.functionalities ?? []).map((f) => [f.id, f.name])), [source]);
  const reqs = requirements ?? [];
  const mts = useMemo(() => [...(meetings ?? [])].sort((a, b) => b.meetingDate.localeCompare(a.meetingDate)), [meetings]);
  const meetingTitle = (id?: string) => (id ? mts.find((m) => m.id === id)?.title ?? '' : '');
  const latest = [...(artifacts ?? [])].sort((a, b) => b.version - a.version)[0];
  const impact = latest ? parse(latest.content) : null;

  const approved = reqs.filter((r) => r.status === 'approved').length;
  const unmapped = reqs.filter((r) => (r.functionalityIds ?? []).length === 0).length;
  const unreviewed = (candidates ?? []).filter((c) => c.decision === 'pending' || c.decision === 'accepted').length;

  const checks: Array<{ ok: boolean; label: string }> = [
    { ok: mts.some((m) => m.status === 'processed'), label: 'At least one meeting processed' },
    { ok: reqs.length > 0, label: `Requirements in the backlog (${reqs.length})` },
    { ok: reqs.length > 0 && unreviewed === 0, label: unreviewed > 0 ? `${unreviewed} suggestion${unreviewed === 1 ? '' : 's'} still to review` : 'All suggestions reviewed' },
    { ok: reqs.length > 0 && unmapped === 0, label: unmapped > 0 ? `${unmapped} requirement${unmapped === 1 ? '' : 's'} not mapped to a functionality` : 'Every requirement mapped to a functionality' },
    { ok: reqs.length > 0 && approved === reqs.length, label: `Requirements approved (${approved} of ${reqs.length})` },
    { ok: !!impact, label: 'Impact assessment generated' },
  ];
  const ready = checks.every((c) => c.ok);
  const nameOf = (id: string) => fnName.get(id) ?? '';

  return (
    <div className="space-y-6">
      <Section title="Readiness for the functional requirements document" description="The FRD and TDD are generated from approved requirements in the FRD/TDD Studio, which arrives in a later step.">
        <ul className="divide-y divide-outline-variant rounded border border-outline-variant">
          {checks.map((c) => (
            <li key={c.label} className="flex items-center gap-3 px-3 py-2">
              {c.ok ? <Check size={18} aria-label="Done" className="shrink-0" /> : <Circle size={18} aria-label="To do" className="shrink-0 text-outline" />}
              <span className={c.ok ? 'text-on-surface-variant' : ''}>{c.label}</span>
            </li>
          ))}
        </ul>
        <p className="text-body-md text-on-surface-variant">{ready ? 'Everything needed for FRD generation is in place.' : 'Complete the open items above before generating the FRD.'}</p>
      </Section>

      <Section title="Documents you can download now">
        <ul className="divide-y divide-outline-variant rounded border border-outline-variant">
          <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-3">
            <span>
              <span className="block font-medium">Requirements backlog</span>
              <span className="block text-body-md text-on-surface-variant">{reqs.length} requirement{reqs.length === 1 ? '' : 's'} with acceptance criteria and impacted functionalities</span>
            </span>
            <span className="flex gap-2">
              <button type="button" className="btn btn-secondary px-3 py-1.5" disabled={reqs.length === 0} onClick={() => saveText(`${fileBase(project.name, 'backlog')}.csv`, backlogToCsv(reqs, meetingTitle, nameOf), 'text/csv')}>
                <Download size={14} aria-hidden />
                CSV
              </button>
              <button type="button" className="btn btn-secondary px-3 py-1.5" disabled={reqs.length === 0} onClick={() => saveText(`${fileBase(project.name, 'backlog')}.md`, backlogToMarkdown(project, sorted(reqs), nameOf))}>
                <Download size={14} aria-hidden />
                Markdown
              </button>
            </span>
          </li>
          <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-3">
            <span>
              <span className="block font-medium">Impact assessment</span>
              <span className="block text-body-md text-on-surface-variant">{latest ? `Version ${latest.version}` : 'Not generated yet. Create it in the Impact analysis tab.'}</span>
            </span>
            <button type="button" className="btn btn-secondary px-3 py-1.5" disabled={!impact} onClick={() => impact && saveText(`${fileBase(project.name, 'impact-assessment')}.md`, impactToMarkdown(project, impact))}>
              <Download size={14} aria-hidden />
              Markdown
            </button>
          </li>
        </ul>
      </Section>

      <Section title="Meeting minutes">
        {mts.length === 0 ? (
          <p className="text-body-md text-on-surface-variant">No meetings yet. Add one in the <Link to={`/projects/${project.id}?tab=notes`} className="underline">Meeting notes</Link> tab.</p>
        ) : (
          <ul className="divide-y divide-outline-variant rounded border border-outline-variant">
            {mts.map((m) => {
              const hasNotes = !!(m.summary || m.keyPoints.length || m.decisions.length || m.actionItems.length);
              return (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-3">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{m.title || 'Untitled meeting'}</span>
                    <span className="block text-body-md text-on-surface-variant">{[m.meetingDate, hasNotes ? 'Notes ready' : 'No notes yet'].filter(Boolean).join(' · ')}</span>
                  </span>
                  <button type="button" className="btn btn-secondary px-3 py-1.5" disabled={!hasNotes} onClick={() => saveText(`${fileBase(m.title, 'minutes')}.md`, meetingToMarkdown(m, project))}>
                    <Download size={14} aria-hidden />
                    Markdown
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}
