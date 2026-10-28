import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import Collapse from './Collapse';

interface Props {
  title: string;
  description?: string;
  icon?: LucideIcon;
  defaultOpen?: boolean;
  children: ReactNode;
}

/** A card whose body opens and closes under a header button. Use it to keep a rarely needed tool out of the way. */
export default function Disclosure({ title, description, icon: Icon, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  return (
    <section className="card p-0">
      <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 rounded-lg px-5 py-4 text-left transition-colors hover:bg-surface-low">
        {Icon && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-container text-primary">
            <Icon size={18} aria-hidden />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-headline-md">{title}</span>
          {description && <span className="block text-body-md font-normal text-on-surface-variant">{description}</span>}
        </span>
        <ChevronDown size={18} aria-hidden className={cn('shrink-0 text-on-surface-variant transition-transform duration-300', open && 'rotate-180')} />
      </button>
      <Collapse open={open}>
        <div id={bodyId} className="border-t border-outline-variant p-5">
          {children}
        </div>
      </Collapse>
    </section>
  );
}
