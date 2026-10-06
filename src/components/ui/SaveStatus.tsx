import { AlertCircle, Check, Loader2, Pencil } from 'lucide-react';
import type { SaveState } from '@/hooks/useAutosave';
import { cn } from '@/lib/cn';

export default function SaveStatus({ state }: { state: SaveState }) {
  const view = {
    idle: { icon: Check, text: 'Auto-save on' },
    dirty: { icon: Pencil, text: 'Unsaved changes…' },
    saving: { icon: Loader2, text: 'Saving…' },
    saved: { icon: Check, text: 'All changes saved' },
    error: { icon: AlertCircle, text: "Couldn't save. Changes are kept on screen." },
  }[state];
  const Icon = view.icon;
  return (
    <span role="status" aria-live="polite" className={cn('inline-flex items-center gap-1.5 text-label-md', state === 'error' ? 'text-error' : 'text-on-surface-variant')}>
      <Icon size={14} aria-hidden className={state === 'saving' ? 'animate-spin' : undefined} />
      {view.text}
    </span>
  );
}
