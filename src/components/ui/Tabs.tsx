import { cn } from '@/lib/cn';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  count?: number;
}

interface Props<T extends string> {
  tabs: Array<TabItem<T>>;
  active: T;
  onChange: (id: T) => void;
  label: string;
}

export default function Tabs<T extends string>({ tabs, active, onChange, label }: Props<T>) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-outline-variant">
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
            className={cn(
              '-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-body-md transition-colors',
              selected ? 'border-primary font-semibold text-on-surface' : 'border-transparent text-on-surface-variant hover:text-on-surface',
            )}
          >
            {t.label}
            {t.count !== undefined && <span className="ml-2 rounded border border-outline-variant px-1.5 text-label-md font-normal text-on-surface-variant">{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
