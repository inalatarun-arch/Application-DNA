import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { CountUp } from '@/lib/motion';

export interface Stat {
  label: string;
  value: number | undefined;
  /** Rendered after the number, for example "%". */
  suffix?: string;
  tone?: 'default' | 'good' | 'bad';
  to?: string;
}

const TONE = { default: '', good: 'text-success', bad: 'text-error' } as const;

/** A row of headline numbers in one surface. Numbers count up when they first appear. */
export default function StatStrip({ stats, label, className }: { stats: Stat[]; label: string; className?: string }) {
  return (
    <section aria-label={label} className={cn('card p-0', className)}>
      <ul className="grid grid-cols-2 sm:flex">
        {stats.map((s, i) => {
          const body = (
            <>
              <span className={cn('block font-display text-[1.75rem] leading-9 tabular-nums', TONE[s.tone ?? 'default'])}>
                <CountUp value={s.value} />
                {s.suffix && s.value !== undefined ? s.suffix : ''}
              </span>
              <span className="mt-0.5 block text-label-md font-normal text-on-surface-variant">{s.label}</span>
            </>
          );
          return (
            <li key={s.label} className={cn('min-w-0 flex-1 border-outline-variant', i > 0 && 'sm:border-l', i % 2 === 1 && 'max-sm:border-l', i > 1 && 'max-sm:border-t')}>
              {s.to ? (
                <Link to={s.to} className="block px-5 py-3.5 transition-colors hover:bg-surface-low">
                  {body}
                </Link>
              ) : (
                <div className="px-5 py-3.5">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
