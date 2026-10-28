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

/** Card grid placeholder that matches the Applications grid, so the layout does not jump when data arrives. */
export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card space-y-3">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <div className="flex gap-1.5 pt-1"><Skeleton className="h-5 w-14" /><Skeleton className="h-5 w-16" /><Skeleton className="h-5 w-12" /></div>
        </div>
      ))}
    </div>
  );
}
