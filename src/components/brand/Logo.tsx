import { cn } from '@/lib/cn';

/** The Application DNA mark: two strands (teal and coral) twisting around shared rungs. */
export default function Logo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden className={cn('shrink-0', className)} fill="none" strokeLinecap="round">
      <g stroke="rgb(var(--outline))" strokeWidth="1.5" opacity="0.7">
        <path d="M12.4 6.5h7.2M10.3 16h11.4M12.4 25.5h7.2" />
      </g>
      <path d="M10 3c0 8 12 8 12 13s-12 5-12 13" stroke="rgb(var(--primary))" strokeWidth="2.6" />
      <path d="M22 3c0 8-12 8-12 13s12 5 12 13" stroke="rgb(var(--accent))" strokeWidth="2.6" />
    </svg>
  );
}
