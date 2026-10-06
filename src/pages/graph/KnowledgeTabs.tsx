import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/cn';

const TABS = [
  { to: '/knowledge-graph', label: 'Graph', end: true },
  { to: '/knowledge-graph/flows', label: 'Process flows', end: false },
];

export default function KnowledgeTabs() {
  return (
    <nav aria-label="Knowledge graph views" className="mb-6 flex gap-1 overflow-x-auto border-b border-outline-variant">
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) =>
            cn(
              '-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-body-md transition-colors',
              isActive ? 'border-primary font-semibold text-on-surface' : 'border-transparent text-on-surface-variant hover:text-on-surface',
            )
          }
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
