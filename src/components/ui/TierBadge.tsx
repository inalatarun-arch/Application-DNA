import type { CriticalTier } from '@/db/types';
import { CRITICAL_TIERS } from '@/db/catalog';
import { cn } from '@/lib/cn';

/** Grayscale hierarchy: the more critical, the heavier the badge. */
const STYLES: Record<CriticalTier, string> = {
  'tier-1': 'border-primary bg-primary text-on-primary',
  'tier-2': 'border-primary text-on-surface',
  'tier-3': 'border-outline text-on-surface-variant',
  'tier-4': 'border-outline-variant text-on-surface-variant',
};

export default function TierBadge({ tier }: { tier: CriticalTier }) {
  const meta = CRITICAL_TIERS.find((t) => t.id === tier);
  return (
    <span title={meta?.description} className={cn('inline-flex items-center rounded border px-2 py-0.5 text-label-md', STYLES[tier])}>
      {meta?.label ?? tier}
    </span>
  );
}
