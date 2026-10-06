import type { ReactNode } from 'react';

export default function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="card">
      <h3 className="text-body-lg font-semibold">{title}</h3>
      {description && <p className="mt-0.5 text-body-md text-on-surface-variant">{description}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}
