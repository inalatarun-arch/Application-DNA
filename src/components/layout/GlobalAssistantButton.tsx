import { useRef } from 'react';
import { Sparkles } from 'lucide-react';
import { EASE, gsap, useGSAP } from '@/lib/motion';

interface Props {
  onClick: () => void;
  /** Hidden while the Copilot panel is open so the two never overlap. */
  hidden?: boolean;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** Floating entry to the Copilot. Sits above the mobile safe area and eases in after the page settles. */
export default function GlobalAssistantButton({ onClick, hidden }: Props) {
  const ref = useRef<HTMLButtonElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from(ref.current, { autoAlpha: 0, scale: 0.6, y: 12, duration: 0.5, delay: 0.7, ease: EASE.spring, clearProps: 'transform,opacity,visibility' });
      });
    },
    { scope: ref },
  );

  if (hidden) return null;

  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label="Open Copilot"
      aria-keyshortcuts="Control+J Meta+J"
      title={`Copilot (${isMac ? '⌘J' : 'Ctrl J'})`}
      className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-on-primary shadow-pop transition-transform duration-150 hover:scale-105 active:scale-95"
    >
      <Sparkles size={20} aria-hidden />
    </button>
  );
}
