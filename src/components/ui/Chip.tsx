import type { ReactNode } from 'react';

export default function Chip({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center rounded border border-outline-variant px-1.5 py-0.5 text-label-md text-on-surface-variant">{children}</span>;
}
