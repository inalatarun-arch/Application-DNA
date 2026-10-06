import type { ReactNode } from 'react';

export default function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-headline-lg">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-body-lg text-on-surface-variant">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
