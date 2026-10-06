import { cn } from '@/lib/cn';

/** Grayscale status chips: the stronger the outline or fill, the further along. */
const STYLES: Record<string, string> = {
  draft: 'border-outline-variant text-on-surface-variant',
  active: 'border-primary text-on-surface',
  'on-hold': 'border-outline border-dashed text-on-surface-variant',
  completed: 'border-primary bg-primary text-on-primary',
  cancelled: 'border-outline-variant text-on-surface-variant line-through',
  'in-review': 'border-outline text-on-surface',
  approved: 'border-primary bg-primary text-on-primary',
  rejected: 'border-outline-variant text-on-surface-variant line-through',
  processed: 'border-primary text-on-surface',
  error: 'border-error text-error',
  high: 'border-primary text-on-surface',
  medium: 'border-outline text-on-surface-variant',
  low: 'border-outline-variant text-on-surface-variant',
};

export default function StatusBadge({ status, label }: { status: string; label: string }) {
  return <span className={cn('inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-label-md', STYLES[status] ?? STYLES.draft)}>{label}</span>;
}
