import type { ReactNode } from 'react';

interface Props {
  title: string;
  description?: string;
  children: ReactNode;
  /** Drop the card and title, for use inside a surface that already supplies them (such as a Disclosure). */
  bare?: boolean;
}

export default function Section({ title, description, children, bare }: Props) {
  if (bare) {
    return (
      <section aria-label={title}>
        {description && <p className="mb-4 text-body-md text-on-surface-variant">{description}</p>}
        <div className="space-y-4">{children}</div>
      </section>
    );
  }
  return (
    <section className="card">
      <h3 className="text-body-lg font-semibold">{title}</h3>
      {description && <p className="mt-0.5 text-body-md text-on-surface-variant">{description}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}
