import { useState } from 'react';
import { FolderPlus, ChevronDown, ChevronUp, Download } from 'lucide-react';
import { db, nowIso, useLive } from '../db/deliveryDb';
import type { Project } from '../db/deliveryDb';
import { getKnowledgeDbName, listExistingProjects, listExistingRequirements } from '../lib/knowledge';
import { btnPrimary, btnSecondary, card, input, label, muted } from './ui';

interface Props {
  projectId: number | null;
  onSelect: (id: number | null) => void;
}

const emptyProject = (): Omit<Project, 'id'> => ({
  name: '',
  description: '',
  applications: '',
  scope: '',
  currentProcess: '',
  futureProcess: '',
  notes: '',
  createdAt: nowIso(),
  updatedAt: nowIso(),
});

export function ProjectBar({ projectId, onSelect }: Props) {
  const projects = useLive(() => db.projects.orderBy('name').toArray(), [], [] as Project[]);
  const project = projects.find((p) => p.id === projectId) ?? null;
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Omit<Project, 'id'>>(emptyProject());
  const [importMsg, setImportMsg] = useState('');

  const create = async () => {
    if (!draft.name.trim()) return;
    const id = await db.projects.add({ ...draft, name: draft.name.trim(), createdAt: nowIso(), updatedAt: nowIso() });
    setCreating(false);
    setDraft(emptyProject());
    onSelect(id);
  };

  const patch = async (changes: Partial<Project>) => {
    if (!project?.id) return;
    await db.projects.update(project.id, { ...changes, updatedAt: nowIso() });
  };

  const importFromKnowledge = async () => {
    const name = getKnowledgeDbName();
    if (!name) {
      setImportMsg('Pick the Knowledge Repository database on the Impact Assessment tab first.');
      return;
    }
    try {
      const found = await listExistingProjects(name);
      let added = 0;
      for (const p of found) {
        if (!(await db.projects.where('name').equals(p.name).count())) {
          await db.projects.add({ ...emptyProject(), ...p });
          added++;
        }
      }
      let reqAdded = 0;
      if (project?.id) {
        const reqs = await listExistingRequirements(name);
        for (const r of reqs) {
          const dup = await db.requirements.where('projectId').equals(project.id).filter((x) => x.text === r.text).count();
          if (!dup) {
            await db.requirements.add({ projectId: project.id, ...r, status: 'Draft', createdAt: nowIso(), updatedAt: nowIso() });
            reqAdded++;
          }
        }
      }
      setImportMsg(`Imported ${added} project(s)${project ? ` and ${reqAdded} requirement(s) into "${project.name}"` : ''}.`);
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message : 'Import failed.');
    }
  };

  return (
    <div className={`${card} !p-4`}>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-[12px] font-medium text-[#45464c]" htmlFor="eih-project">
          Project
        </label>
        <select
          id="eih-project"
          className={`${input} max-w-[320px]`}
          value={projectId ?? ''}
          onChange={(e) => onSelect(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">Select a project...</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button className={btnSecondary} onClick={() => setCreating((c) => !c)}>
          <FolderPlus size={14} /> New project
        </button>
        <button className={btnSecondary} onClick={() => void importFromKnowledge()} title="Import projects/requirements from your Knowledge Repository database">
          <Download size={14} /> Import
        </button>
        {project && (
          <button className="ml-auto inline-flex items-center gap-1 text-[13px] font-medium text-[#45464c]" onClick={() => setOpen((o) => !o)}>
            Project context {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
      </div>
      {importMsg && <p className={`${muted} mt-2`}>{importMsg}</p>}

      {creating && (
        <div className="mt-4 grid gap-3 border-t border-[#E5E7EB] pt-4 md:grid-cols-2">
          <div>
            <label className={label}>Project name</label>
            <input className={input} value={draft.name} placeholder="Supplier Onboarding Enhancement" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div>
            <label className={label}>Impacted applications (comma separated)</label>
            <input className={input} value={draft.applications} placeholder="Oracle EBS, Salesforce" onChange={(e) => setDraft({ ...draft, applications: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <label className={label}>Description</label>
            <textarea className={input} rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </div>
          <div className="flex gap-2 md:col-span-2">
            <button className={btnPrimary} disabled={!draft.name.trim()} onClick={() => void create()}>
              Create project
            </button>
            <button className={btnSecondary} onClick={() => setCreating(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {project && open && (
        <div className="mt-4 grid gap-3 border-t border-[#E5E7EB] pt-4 md:grid-cols-2">
          <p className={`${muted} md:col-span-2`}>This context is fed to Gemini when generating impact reports, stories, the FRD and the TDD. Changes save automatically.</p>
          {(
            [
              ['name', 'Project name', false],
              ['applications', 'Impacted applications', false],
              ['description', 'Description', true],
              ['scope', 'Scope (in / out)', true],
              ['currentProcess', 'Current process (as-is)', true],
              ['futureProcess', 'Future process (to-be)', true],
              ['notes', 'Assumptions, constraints & notes', true],
            ] as [keyof Project, string, boolean][]
          ).map(([key, text, multi]) => (
            <div key={key} className={multi && key !== 'description' ? '' : ''}>
              <label className={label}>{text}</label>
              {multi ? (
                <textarea className={input} rows={3} defaultValue={String(project[key] ?? '')} key={`${project.id}-${key}`} onBlur={(e) => void patch({ [key]: e.target.value })} />
              ) : (
                <input className={input} defaultValue={String(project[key] ?? '')} key={`${project.id}-${key}`} onBlur={(e) => void patch({ [key]: e.target.value })} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
