import { useEffect, useRef, type RefObject } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

/** Every animation here is wrapped in this query, so reduced-motion users get the final state with no movement. */
const MOTION_OK = '(prefers-reduced-motion: no-preference)';

export const EASE = { out: 'power3.out', inOut: 'power3.inOut', spring: 'back.out(1.4)' } as const;

interface RevealOptions {
  /** Re-run when these change (for example once async data has arrived). */
  deps?: unknown[];
  y?: number;
  duration?: number;
  stagger?: number;
  delay?: number;
}

/**
 * Fades and lifts every `selector` match inside `scope` into place, one after another.
 * Targets are cleared of inline styles when finished so hover and stacking behave normally.
 */
export function useReveal(scope: RefObject<HTMLElement>, selector: string, { deps = [], y = 14, duration = 0.5, stagger = 0.05, delay = 0 }: RevealOptions = {}) {
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const targets = gsap.utils.toArray<HTMLElement>(selector, scope.current);
        if (targets.length === 0) return;
        gsap.from(targets, { autoAlpha: 0, y, duration, delay, stagger: { each: stagger, amount: Math.min(stagger * targets.length, 0.5) }, ease: EASE.out, clearProps: 'transform,opacity,visibility' });
      });
      return () => mm.revert();
    },
    { scope, dependencies: deps, revertOnUpdate: true },
  );
}

/** Brief fade-and-rise of one element each time `key` changes (used for route changes). */
export function useEnter(ref: RefObject<HTMLElement>, key: unknown) {
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.from(ref.current, { autoAlpha: 0, y: 10, duration: 0.32, ease: EASE.out, clearProps: 'transform,opacity,visibility' });
      });
      return () => mm.revert();
    },
    { scope: ref, dependencies: [key], revertOnUpdate: true },
  );
}

/** Counts a number up to `value` the first time it shows and tweens between values after that. */
export function CountUp({ value, className }: { value: number | undefined; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || value === undefined) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      shown.current = value;
      el.textContent = String(value);
      return;
    }
    const state = { n: shown.current };
    const tween = gsap.to(state, {
      n: value,
      duration: Math.min(1.1, 0.4 + Math.abs(value - state.n) * 0.02),
      ease: 'power2.out',
      onUpdate: () => {
        shown.current = state.n;
        el.textContent = String(Math.round(state.n));
      },
      onComplete: () => {
        shown.current = value;
        el.textContent = String(value);
      },
    });
    return () => {
      tween.kill();
    };
  }, [value]);

  return (
    <span ref={ref} className={className}>
      {value === undefined ? '–' : 0}
    </span>
  );
}

/** Slides a panel in from the right (or scales a dialog up) when it mounts. Call from a ref callback effect. */
export function useDialogIn(ref: RefObject<HTMLElement>, open: boolean, from: 'center' | 'right' = 'center') {
  useGSAP(
    () => {
      if (!open || !ref.current) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.from(ref.current, from === 'right' ? { xPercent: 100, duration: 0.38, ease: EASE.out, clearProps: 'transform' } : { autoAlpha: 0, y: 14, scale: 0.98, duration: 0.28, ease: EASE.out, clearProps: 'transform,opacity,visibility' });
        const scrim = ref.current?.parentElement;
        if (scrim && from === 'center') gsap.from(scrim, { autoAlpha: 0, duration: 0.2, clearProps: 'opacity,visibility' });
      });
      return () => mm.revert();
    },
    { dependencies: [open], revertOnUpdate: true },
  );
}

export { gsap, useGSAP };
