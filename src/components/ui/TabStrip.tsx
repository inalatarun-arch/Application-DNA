import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { EASE, gsap } from '@/lib/motion';

interface Props {
  /** Changes whenever the labels or counts change, so the underline is re-measured. */
  measureKey: string;
  children: ReactNode;
  role?: 'tablist';
  label: string;
}

/**
 * Scrolling tab row with one underline that slides to the active tab.
 * The active tab is whichever child carries aria-selected="true" or aria-current="page".
 */
export default function TabStrip({ measureKey, children, role, label }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);

  useLayoutEffect(() => {
    const list = listRef.current;
    const bar = barRef.current;
    if (!list || !bar) return;
    const place = (animate: boolean) => {
      const active = list.querySelector<HTMLElement>('[aria-selected="true"], [aria-current="page"]');
      if (!active) {
        gsap.set(bar, { autoAlpha: 0 });
        return;
      }
      const props = { x: active.offsetLeft, width: active.offsetWidth, autoAlpha: 1 };
      if (!animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) gsap.set(bar, props);
      else gsap.to(bar, { ...props, duration: 0.38, ease: EASE.out, overwrite: 'auto' });
    };
    place(placed.current);
    placed.current = true;
    const onResize = () => place(false);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  });

  return (
    <div className="border-b border-outline-variant">
      <div ref={listRef} role={role} aria-label={label} data-key={measureKey} className="relative flex gap-1 overflow-x-auto">
        {children}
        <span ref={barRef} aria-hidden className="pointer-events-none absolute bottom-0 left-0 h-0.5 rounded-full bg-primary opacity-0" />
      </div>
    </div>
  );
}

export const TAB_CLASS = 'relative inline-flex items-center gap-2 whitespace-nowrap px-4 py-2.5 text-body-md transition-colors';
export const TAB_ACTIVE = 'font-semibold text-on-surface';
export const TAB_IDLE = 'text-on-surface-variant hover:text-on-surface';
