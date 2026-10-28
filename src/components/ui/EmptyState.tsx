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
    <div className="flex flex-col items-center rounded-lg border border-dashed border-outline-variant bg-surface-lowest/50 px-6 py-14 text-center">
      <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-primary-container text-primary">
        <Icon size={20} aria-hidden />
      </span>
      <h2 className="font-display text-headline-md font-medium">{title}</h2>
      {description && <p className="mt-1 max-w-md text-body-md text-on-surface-variant">{description}</p>}
      {children && <div className="mt-5 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}
