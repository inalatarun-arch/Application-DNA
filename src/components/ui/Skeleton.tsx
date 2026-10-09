import { cn } from '@/lib/cn';

/** A grey bar that pulses while content loads. Size it with className. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton h-4 w-full', className)} />;
}

/** Page-shaped placeholder: a heading, a toolbar row and a few content blocks. */
export default function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="space-y-5">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <div className="flex gap-3"><Skeleton className="h-9 w-40" /><Skeleton className="h-9 w-28" /></div>
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" />
      </div>
      <Skeleton className="h-48" />
    </div>
  );
}
