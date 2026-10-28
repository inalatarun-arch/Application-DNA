import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/** A page title you can edit in place. It reads as a heading until hovered or focused, then shows its field edge. */
export default function TitleInput({ label, className, ...rest }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <>
      <label htmlFor={rest.id} className="sr-only">{label}</label>
      <input
        {...rest}
        className={cn(
          '-mx-2 w-[calc(100%+1rem)] rounded border border-transparent bg-transparent px-2 py-1 font-display text-headline-lg text-on-surface transition-colors placeholder:text-outline hover:border-outline-variant focus-visible:border-primary focus-visible:bg-surface-lowest focus-visible:outline-none',
          className,
        )}
      />
    </>
  );
}
