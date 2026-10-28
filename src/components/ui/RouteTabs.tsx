import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/cn';
import TabStrip, { TAB_ACTIVE, TAB_CLASS, TAB_IDLE } from './TabStrip';

export interface RouteTab {
  to: string;
  label: string;
  end?: boolean;
}

/** Route-based tab strip: each tab is a link, and the page URL decides which is active. */
export default function RouteTabs({ tabs, label }: { tabs: RouteTab[]; label: string }) {
  return (
    <div className="mb-6">
      <TabStrip label={label} measureKey={tabs.map((t) => t.to).join('|')}>
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => cn(TAB_CLASS, isActive ? TAB_ACTIVE : TAB_IDLE)}>
            {t.label}
          </NavLink>
        ))}
      </TabStrip>
    </div>
  );
}
