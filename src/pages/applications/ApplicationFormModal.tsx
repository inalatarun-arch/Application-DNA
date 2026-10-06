import { useEffect, useId, useState } from 'react';
import Modal from '@/components/ui/Modal';
import TagInput from '@/components/ui/TagInput';
import {
  CRITICAL_TIERS,
  DOMAIN_SUGGESTIONS,
  VENDOR_PRESETS,
  applicationNameExists,
  createApplication,
  emptyApplicationInput,
  updateApplication,
  type ApplicationInput,
} from '@/db/catalog';
import type { Application, CriticalTier } from '@/db/types';

interface Props {
  open: boolean;
  /** Omit to create a new application. */
  application?: Application;
  onClose: () => void;
  onSaved?: (app: Application) => void;
}

function toInput(app?: Application): ApplicationInput {
  if (!app) return emptyApplicationInput();
  const { name, vendor, domain, technicalStack, criticalTier, description, businessOwner, technicalOwner, tags } = app;
  return { name, vendor, domain, technicalStack, criticalTier, description, businessOwner, technicalOwner, tags };
}

export default function ApplicationFormModal({ open, application, onClose, onSaved }: Props) {
  const formId = useId();
  const [form, setForm] = useState<ApplicationInput>(emptyApplicationInput);
  const [errors, setErrors] = useState<{ name?: string; domain?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const editing = !!application;

  useEffect(() => {
    if (open) {
      setForm(toInput(application));
      setErrors({});
      setBusy(false);
    }
  }, [open, application?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof ApplicationInput>(key: K, value: ApplicationInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!form.name.trim()) next.name = 'Application name is required.';
    if (!form.domain.trim()) next.domain = 'Domain is required.';
    if (!next.name && (await applicationNameExists(form.name, application?.id))) next.name = 'An application with this name already exists.';
    if (next.name || next.domain) {
      setErrors(next);
      return;
    }
    setBusy(true);
    try {
      if (application) {
        await updateApplication(application.id, form);
        onSaved?.({ ...application, ...form });
      } else {
        onSaved?.(await createApplication(form));
      }
      onClose();
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : 'Could not save the application.' });
      setBusy(false);
    }
  };

  const id = (s: string) => `${formId}-${s}`;

  return (
    <Modal
      open={open}
      size="lg"
      title={editing ? 'Edit application' : 'New application'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" form={formId} className="btn btn-primary" disabled={busy}>{editing ? 'Save changes' : 'Create application'}</button>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => void submit(e)} noValidate className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor={id('name')} className="field-label">Application name</label>
          <input id={id('name')} className="input" value={form.name} onChange={(e) => { set('name', e.target.value); setErrors((x) => ({ ...x, name: undefined })); }} aria-invalid={!!errors.name} placeholder="e.g. Oracle E-Business Suite" />
          {errors.name && <p className="mt-1 text-label-md text-error">{errors.name}</p>}
        </div>
        <div>
          <label htmlFor={id('vendor')} className="field-label">Platform / vendor</label>
          <input id={id('vendor')} className="input" list={id('vendors')} value={form.vendor} onChange={(e) => set('vendor', e.target.value)} placeholder="Pick one or type your own" />
          <datalist id={id('vendors')}>{VENDOR_PRESETS.map((v) => <option key={v} value={v} />)}</datalist>
        </div>
        <div>
          <label htmlFor={id('domain')} className="field-label">Business domain</label>
          <input id={id('domain')} className="input" list={id('domains')} value={form.domain} onChange={(e) => { set('domain', e.target.value); setErrors((x) => ({ ...x, domain: undefined })); }} aria-invalid={!!errors.domain} placeholder="e.g. Finance" />
          <datalist id={id('domains')}>{DOMAIN_SUGGESTIONS.map((v) => <option key={v} value={v} />)}</datalist>
          {errors.domain && <p className="mt-1 text-label-md text-error">{errors.domain}</p>}
        </div>
        <div>
          <label htmlFor={id('tier')} className="field-label">Critical tier</label>
          <select id={id('tier')} className="input" value={form.criticalTier} onChange={(e) => set('criticalTier', e.target.value as CriticalTier)}>
            {CRITICAL_TIERS.map((t) => <option key={t.id} value={t.id}>{t.label} — {t.description}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <label htmlFor={id('stack')} className="field-label">Technical stack</label>
          <TagInput id={id('stack')} value={form.technicalStack} onChange={(v) => set('technicalStack', v)} placeholder="e.g. PL/SQL, Oracle Forms — press Enter to add" />
        </div>
        <div>
          <label htmlFor={id('bo')} className="field-label">Business owner</label>
          <input id={id('bo')} className="input" value={form.businessOwner} onChange={(e) => set('businessOwner', e.target.value)} />
        </div>
        <div>
          <label htmlFor={id('to')} className="field-label">Technical owner</label>
          <input id={id('to')} className="input" value={form.technicalOwner} onChange={(e) => set('technicalOwner', e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <label htmlFor={id('desc')} className="field-label">Description</label>
          <textarea id={id('desc')} className="input min-h-[88px]" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="What the application does and who relies on it" />
        </div>
        <div className="md:col-span-2">
          <label htmlFor={id('tags')} className="field-label">Tags</label>
          <TagInput id={id('tags')} value={form.tags} onChange={(v) => set('tags', v)} placeholder="e.g. SOX, ERP" />
        </div>
        {errors.form && <p className="text-body-md text-error md:col-span-2">{errors.form}</p>}
      </form>
    </Modal>
  );
}
