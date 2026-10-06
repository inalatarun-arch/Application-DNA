import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface Props {
  icon: LucideIcon;
  title: string;
  description?: string;
  children?: ReactNode;
}

export default function EmptyState({ icon: Icon, title, description, children }: Props) {
  return (
    <div className="flex flex-col items-center rounded border border-dashed border-outline-variant px-6 py-12 text-center">
      <span className="mb-3 flex h-10 w-10 items-center justify-center rounded border border-outline-variant text-on-surface-variant">
        <Icon size={20} aria-hidden />
      </span>
      <h2 className="text-headline-md">{title}</h2>
      {description && <p className="mt-1 max-w-md text-body-md text-on-surface-variant">{description}</p>}
      {children && <div className="mt-4 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}
