import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import TabStrip, { TAB_ACTIVE, TAB_CLASS, TAB_IDLE } from './TabStrip';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  count?: number;
  icon?: LucideIcon;
}

interface Props<T extends string> {
  tabs: Array<TabItem<T>>;
  active: T;
  onChange: (id: T) => void;
  label: string;
}

export default function Tabs<T extends string>({ tabs, active, onChange, label }: Props<T>) {
  return (
    <TabStrip role="tablist" label={label} measureKey={tabs.map((t) => `${t.id}${t.count ?? ''}`).join('|')}>
      {tabs.map((t) => {
        const selected = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={selected}
            aria-controls={`panel-${t.id}`}
            onClick={() => onChange(t.id)}
            className={cn(TAB_CLASS, selected ? TAB_ACTIVE : TAB_IDLE)}
          >
            {t.icon && <t.icon size={16} aria-hidden />}
            {t.label}
            {t.count !== undefined && <span className="rounded-full bg-surface-container px-1.5 text-label-md font-normal tabular-nums text-on-surface-variant">{t.count}</span>}
          </button>
        );
      })}
    </TabStrip>
  );
}
