import { cn } from '@/lib/cn';

/** Status chips use hue for meaning (green done, amber needs a decision, red blocked, teal in progress) and the label for everything else. */
const NEUTRAL = 'border-outline-variant text-on-surface-variant';
const STYLES: Record<string, string> = {
  draft: NEUTRAL,
  active: 'border-primary/40 bg-primary-container text-on-surface',
  'on-hold': 'border-warning/40 bg-warning-container text-warning',
  completed: 'border-success/40 bg-success-container text-success',
  cancelled: `${NEUTRAL} line-through`,
  'in-review': 'border-warning/40 bg-warning-container text-warning',
  approved: 'border-success/40 bg-success-container text-success',
  rejected: 'border-error/40 bg-error-container text-error',
  processed: 'border-primary/40 bg-primary-container text-on-surface',
  error: 'border-error/40 bg-error-container text-error',
  high: 'border-warning/40 bg-warning-container text-warning',
  medium: 'border-outline text-on-surface-variant',
  low: NEUTRAL,
};

export default function StatusBadge({ status, label }: { status: string; label: string }) {
  return <span className={cn('inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-label-md', STYLES[status] ?? STYLES.draft)}>{label}</span>;
}
