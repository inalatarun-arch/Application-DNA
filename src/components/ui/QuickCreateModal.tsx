import { useEffect, useId, useState } from 'react';
import Modal from './Modal';

interface Props {
  open: boolean;
  title: string;
  nameLabel: string;
  namePlaceholder?: string;
  detailLabel?: string;
  detailPlaceholder?: string;
  submitLabel: string;
  onSubmit: (name: string, detail: string) => Promise<void> | void;
  onClose: () => void;
}

/** Small "name + one description field" dialog used for modules, screens and functionalities. */
export default function QuickCreateModal({ open, title, nameLabel, namePlaceholder, detailLabel, detailPlaceholder, submitLabel, onSubmit, onClose }: Props) {
  const formId = useId();
  const [name, setName] = useState('');
  const [detail, setDetail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setDetail('');
      setError('');
      setBusy(false);
    }
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(`${nameLabel} is required.`);
      return;
    }
    setBusy(true);
    try {
      await onSubmit(name.trim(), detail.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" form={formId} className="btn btn-primary" disabled={busy}>{submitLabel}</button>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => void submit(e)} className="grid gap-4" noValidate>
        <div>
          <label htmlFor={`${formId}-name`} className="field-label">{nameLabel}</label>
          <input id={`${formId}-name`} className="input" value={name} placeholder={namePlaceholder} onChange={(e) => { setName(e.target.value); setError(''); }} aria-invalid={!!error} aria-describedby={error ? `${formId}-err` : undefined} />
          {error && <p id={`${formId}-err`} className="mt-1 text-label-md text-error">{error}</p>}
        </div>
        {detailLabel && (
          <div>
            <label htmlFor={`${formId}-detail`} className="field-label">{detailLabel}</label>
            <textarea id={`${formId}-detail`} className="input min-h-[80px]" value={detail} placeholder={detailPlaceholder} onChange={(e) => setDetail(e.target.value)} />
          </div>
        )}
      </form>
    </Modal>
  );
}
