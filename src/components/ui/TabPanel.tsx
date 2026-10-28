import { useRef, type ReactNode } from 'react';
import { useEnter } from '@/lib/motion';

/** The content area under a Tabs row. It fades up each time the active tab changes. */
export default function TabPanel({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEnter(ref, id);
  return (
    <div ref={ref} role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} className={className}>
      {children}
    </div>
  );
}
