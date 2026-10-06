import { useEffect, useId, useState } from 'react';
import Modal from '@/components/ui/Modal';
import { KIND_META, KIND_ORDER, LAYERS } from '@/config/technical';
import { createTechnicalComponent } from '@/db/catalog';
import type { TechnicalComponent, TechnicalComponentKind } from '@/db/types';

interface Props {
  open: boolean;
  applicationId: string;
  defaultKind?: TechnicalComponentKind;
  onClose: () => void;
  onCreated: (component: TechnicalComponent) => void;
}

export default function NewComponentModal({ open, applicationId, defaultKind = 'table', onClose, onCreated }: Props) {
  const formId = useId();
  const [kind, setKind] = useState<TechnicalComponentKind>(defaultKind);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setKind(defaultKind);
      setName('');
      setDescription('');
      setError('');
      setBusy(false);
    }
  }, [open, defaultKind]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Component name is required.');
      return;
    }
    setBusy(true);
    try {
      const created = await createTechnicalComponent(applicationId, kind, name, description);
      onClose();
      onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the component.');
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="New technical component"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" form={formId} className="btn btn-primary" disabled={busy}>Create component</button>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => void submit(e)} noValidate className="grid gap-4">
        <div>
          <label htmlFor={`${formId}-kind`} className="field-label">Type</label>
          <select id={`${formId}-kind`} className="input" value={kind} onChange={(e) => setKind(e.target.value as TechnicalComponentKind)}>
            {LAYERS.map((layer) => (
              <optgroup key={layer.id} label={layer.label}>
                {KIND_ORDER.filter((k) => KIND_META[k].layer === layer.id).map((k) => <option key={k} value={k}>{KIND_META[k].label}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${formId}-name`} className="field-label">Name</label>
          <input id={`${formId}-name`} className="input" value={name} placeholder="e.g. AP_SUPPLIERS" onChange={(e) => { setName(e.target.value); setError(''); }} aria-invalid={!!error} />
          {error && <p className="mt-1 text-label-md text-error">{error}</p>}
        </div>
        <div>
          <label htmlFor={`${formId}-desc`} className="field-label">Description</label>
          <textarea id={`${formId}-desc`} className="input min-h-[80px]" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What it is and what it is used for" />
        </div>
      </form>
    </Modal>
  );
}
