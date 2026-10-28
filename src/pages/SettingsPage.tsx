import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Cloud, Database, FlaskConical, Sparkles } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { cn } from '@/lib/cn';
import { useReveal } from '@/lib/motion';
import AiConfiguration from './settings/AiConfiguration';
import WorkspaceCard from './settings/WorkspaceCard';
import DataManagement from './settings/DataManagement';
import SampleDataCard from './settings/SampleDataCard';

const SECTIONS = [
  { id: 'ai', label: 'AI configuration', icon: Sparkles },
  { id: 'workspace-section', label: 'Workspace', icon: Cloud },
  { id: 'sample', label: 'Sample data', icon: FlaskConical },
  { id: 'data', label: 'Backup and data', icon: Database },
] as const;

export default function SettingsPage() {
  const { hash } = useLocation();
  const rootRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string>(SECTIONS[0].id);

  // HashRouter owns the URL hash, so deep-link to the workspace card manually.
  useEffect(() => {
    if (hash === '#workspace') document.getElementById('workspace')?.scrollIntoView();
  }, [hash]);

  // Highlight the section nearest the top of the scroll area.
  useEffect(() => {
    const root = document.getElementById('main');
    const targets = SECTIONS.map((s) => document.getElementById(s.id)).filter((el): el is HTMLElement => !!el);
    if (!root || targets.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      { root, rootMargin: '-10% 0px -70% 0px' },
    );
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, []);

  useReveal(rootRef, '[data-section]', { y: 14, stagger: 0.07 });

  const jump = (id: string) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <div ref={rootRef}>
      <PageHeader title="Settings" description="Configure the AI connection, your workspace and local data." />
      <div className="grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="hidden lg:block">
          <ul className="sticky top-0 space-y-0.5">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => jump(s.id)}
                  aria-current={active === s.id ? 'true' : undefined}
                  className={cn(
                    'relative flex w-full items-center gap-2.5 rounded px-3 py-2 text-left text-body-md transition-colors',
                    active === s.id ? 'bg-primary-container font-semibold text-on-surface before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r before:bg-primary' : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
                  )}
                >
                  <s.icon size={16} aria-hidden className="shrink-0" />
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 space-y-6">
          <div id="ai" data-section className="scroll-mt-4"><AiConfiguration /></div>
          <div id="workspace-section" data-section className="scroll-mt-4"><WorkspaceCard /></div>
          <div id="sample" data-section className="scroll-mt-4"><SampleDataCard /></div>
          <div id="data" data-section className="scroll-mt-4"><DataManagement /></div>
        </div>
      </div>
    </div>
  );
}
