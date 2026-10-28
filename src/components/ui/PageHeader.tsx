import type { ReactNode } from 'react';

/** Page title block. The serif display face is reserved for these titles so every screen opens the same way. */
export default function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-headline-lg">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-body-md text-on-surface-variant">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
