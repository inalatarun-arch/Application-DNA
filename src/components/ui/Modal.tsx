import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useDialogIn } from '@/lib/motion';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const SIZES = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' } as const;
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Level-2 overlay: a surface over a dimmed, blurred scrim. Focus is trapped inside while open and returns to the opener on close. */
export default function Modal({ open, title, onClose, children, footer, size = 'md' }: Props) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useDialogIn(dialogRef, open);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === firstEl || !dialogRef.current.contains(active))) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && (active === lastEl || !dialogRef.current.contains(active))) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    // Prefer the first field in the body over the close button.
    const t = window.setTimeout(() => {
      (bodyRef.current?.querySelector<HTMLElement>('input, textarea, select, button') ?? dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE))?.focus();
    }, 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
      opener?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-on-surface/40 p-4 backdrop-blur-[2px] md:pt-[8vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className={cn('w-full rounded-lg border border-outline-variant bg-surface-lowest shadow-pop', SIZES[size])}>
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
