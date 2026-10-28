import type { CriticalTier } from '@/db/types';
import { CRITICAL_TIERS } from '@/db/catalog';
import { cn } from '@/lib/cn';

/** Four signal bars: the more critical the tier, the more bars are lit. The label is always shown, so color is never the only cue. */
const LEVEL: Record<CriticalTier, number> = { 'tier-1': 4, 'tier-2': 3, 'tier-3': 2, 'tier-4': 1 };

export default function TierBadge({ tier }: { tier: CriticalTier }) {
  const meta = CRITICAL_TIERS.find((t) => t.id === tier);
  const level = LEVEL[tier] ?? 1;
  return (
    <span
      title={meta?.description}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded border px-2 py-0.5 text-label-md',
        tier === 'tier-1' ? 'border-primary/40 bg-primary-container text-on-surface' : 'border-outline-variant text-on-surface-variant',
      )}
    >
      <span aria-hidden className="flex items-end gap-px">
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className={cn('w-[3px] rounded-[1px]', n <= level ? 'bg-primary' : 'bg-outline-variant')} style={{ height: 4 + n * 2 }} />
        ))}
      </span>
      {meta?.label ?? tier}
    </span>
  );
}
