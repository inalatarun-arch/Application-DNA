import { useState, type ReactNode } from 'react';
import Modal from './Modal';

interface Props {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export default function ConfirmModal({ open, title, message, confirmLabel = 'Delete', onConfirm, onCancel }: Props) {
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={title}
      size="sm"
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={() => void run()} disabled={busy}>{confirmLabel}</button>
        </>
      }
    >
      <div className="text-body-md text-on-surface-variant">{message}</div>
    </Modal>
  );
}
