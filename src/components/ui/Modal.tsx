import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const SIZES = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' } as const;

/** Level-2 overlay: white surface with a 2px high-contrast border, no shadow. */
export default function Modal({ open, title, onClose, children, footer, size = 'md' }: Props) {
  const titleId = useId();
  const bodyRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => {
      bodyRef.current?.querySelector<HTMLElement>('input, textarea, select, button')?.focus();
    }, 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 md:pt-[8vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className={cn('w-full rounded border-2 border-primary bg-surface-lowest', SIZES[size])}>
        <div className="flex items-center justify-between gap-4 border-b border-outline-variant px-6 py-4">
          <h2 id={titleId} className="text-headline-md">{title}</h2>
          <button type="button" className="icon-btn -mr-2" onClick={onClose} aria-label="Close dialog">
            <X size={18} aria-hidden />
          </button>
        </div>
        <div ref={bodyRef} className="p-6">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-outline-variant px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}
