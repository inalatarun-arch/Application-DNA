import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export interface Crumb {
  label: string;
  to?: string;
}

export default function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Location" className="flex flex-wrap items-center gap-1 text-body-md">
      {items.map((c, i) => (
        <span key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-1">
          {i > 0 && <ChevronRight size={14} aria-hidden className="shrink-0 text-outline" />}
          {c.to ? (
            <Link to={c.to} className="truncate text-on-surface-variant transition-colors hover:text-on-surface hover:underline">{c.label}</Link>
          ) : (
            <span className="truncate font-semibold" aria-current="page">{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
