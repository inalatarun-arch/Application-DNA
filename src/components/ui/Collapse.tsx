import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { EASE, gsap } from '@/lib/motion';

/** Animates its height open and closed. Closed content is hidden from sight and from the tab order. */
export default function Collapse({ open, children, className }: { open: boolean; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const ready = useRef(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!ready.current || reduce) {
      ready.current = true;
      gsap.set(el, { height: open ? 'auto' : 0, autoAlpha: open ? 1 : 0 });
      return;
    }
    const tween = open
      ? gsap.to(el, { height: 'auto', autoAlpha: 1, duration: 0.3, ease: EASE.out, onComplete: () => void gsap.set(el, { height: 'auto' }) })
      : gsap.to(el, { height: 0, autoAlpha: 0, duration: 0.22, ease: EASE.inOut });
    return () => {
      tween.kill();
    };
  }, [open]);

  return (
    <div ref={ref} className={cn('overflow-hidden', className)} aria-hidden={!open}>
      {children}
    </div>
  );
}
