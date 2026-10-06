import { useEffect, useId, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Modal from '@/components/ui/Modal';
import ScopePicker from '@/components/ui/ScopePicker';
import { db } from '@/db/db';
import { createProject, emptyProjectInput, PRIORITIES, PROJECT_STATUSES, type ProjectInput } from '@/db/projects';
import type { Project, ProjectPriority, ProjectStatus } from '@/db/types';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (project: Project) => void;
}

export default function ProjectFormModal({ open, onClose, onCreated }: Props) {
  const formId = useId();
  const [form, setForm] = useState<ProjectInput>(emptyProjectInput);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const applications = useLiveQuery(() => db.applications.toArray(), []);
  const modules = useLiveQuery(() => db.modules.toArray(), []);

  useEffect(() => {
    if (open) {
      setForm(emptyProjectInput());
      setError('');
      setBusy(false);
    }
  }, [open]);

  const set = <K extends keyof ProjectInput>(key: K, value: ProjectInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const id = (s: string) => `${formId}-${s}`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Project name is required.');
      return;
    }
    setBusy(true);
    try {
      const created = await createProject(form);
      onClose();
      onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the project.');
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      size="lg"
      title="New project"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" form={formId} className="btn btn-primary" disabled={busy}>Create project</button>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => void submit(e)} noValidate className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label htmlFor={id('name')} className="field-label">Project name</label>
          <input id={id('name')} className="input" value={form.name} placeholder="e.g. Supplier Onboarding Enhancement" onChange={(e) => { set('name', e.target.value); setError(''); }} aria-invalid={!!error} />
          {error && <p className="mt-1 text-label-md text-error">{error}</p>}
        </div>
        <div className="md:col-span-2">
          <label htmlFor={id('desc')} className="field-label">Description</label>
          <textarea id={id('desc')} className="input min-h-[80px]" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="What the initiative changes and why" />
        </div>
        <div>
          <label htmlFor={id('status')} className="field-label">Status</label>
          <select id={id('status')} className="input" value={form.status} onChange={(e) => set('status', e.target.value as ProjectStatus)}>
            {PROJECT_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={id('priority')} className="field-label">Priority</label>
          <select id={id('priority')} className="input" value={form.priority} onChange={(e) => set('priority', e.target.value as ProjectPriority)}>
            {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={id('owner')} className="field-label">Business analyst / owner</label>
          <input id={id('owner')} className="input" value={form.owner} onChange={(e) => set('owner', e.target.value)} />
        </div>
        <div>
          <label htmlFor={id('sponsor')} className="field-label">Project sponsor</label>
          <input id={id('sponsor')} className="input" value={form.sponsor} onChange={(e) => set('sponsor', e.target.value)} />
        </div>
        <div>
          <label htmlFor={id('date')} className="field-label">Target date</label>
          <input id={id('date')} type="date" className="input" value={form.targetDate} onChange={(e) => set('targetDate', e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <span className="field-label">Impacted applications and modules</span>
          <ScopePicker
            applications={applications ?? []}
            modules={modules ?? []}
            applicationIds={form.applicationIds}
            moduleIds={form.moduleIds}
            onChange={(applicationIds, moduleIds) => setForm((f) => ({ ...f, applicationIds, moduleIds }))}
          />
        </div>
      </form>
    </Modal>
  );
}
