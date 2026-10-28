import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Bug, CheckCircle2, ClipboardCheck, FileQuestion, Link2Off, UserX, X, type LucideIcon } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import PageHeader from '@/components/ui/PageHeader';
import TierBadge from '@/components/ui/TierBadge';
import { useApiKey, useGeminiStatus } from '@/hooks/useApiKey';
import { usePersistentState } from '@/hooks/usePersistentState';
import { useWorkspace } from '@/db/settings';
import { CountUp, gsap, useGSAP, useReveal } from '@/lib/motion';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import { plural } from '@/lib/plural';

interface Stat {
  label: string;
  value: number | undefined;
  to: string;
}

interface Attention {
  key: string;
  icon: LucideIcon;
  count: number;
  text: string;
  to: string;
  tone: 'error' | 'warn';
}

/** A group of related counters in one surface; each number links to the page that owns it. */
function StatGroup({ title, stats }: { title: string; stats: Stat[] }) {
  return (
    <section aria-label={title} data-reveal className="card p-0">
      <h2 className="eyebrow px-5 pt-4">{title}</h2>
      <ul className={cn('mt-2 grid pb-1', stats.length === 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4')}>
        {stats.map((s) => (
          <li key={s.label} className={cn('min-w-0 border-l border-outline-variant first:border-l-0', stats.length === 4 && 'max-sm:[&:nth-child(3)]:border-l-0 max-sm:[&:nth-child(n+3)]:border-t')}>
            <Link to={s.to} className="group block px-5 py-3 transition-colors hover:bg-surface-low focus-visible:outline-offset-[-2px]">
              <CountUp value={s.value} className="block font-display text-display-lg tabular-nums" />
              <span className="mt-1 flex items-center gap-1 break-words text-label-md font-normal text-on-surface-variant">
                {s.label}
                <ArrowRight size={12} aria-hidden className="-translate-x-1 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function DashboardPage() {
  const [workspace] = useWorkspace();
  const apiKey = useApiKey();
  const status = useGeminiStatus();
  const [onboardingHidden, setOnboardingHidden] = usePersistentState('eih.onboarding.hidden', false);
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const data = useLiveQuery(async () => {
    const [apps, functionalities, components, projects, requirements, testCases, defects] = await Promise.all([
      db.applications.toArray(),
      db.functionalities.count(),
      db.technicalComponents.count(),
      db.projects.count(),
      db.requirements.toArray(),
      db.testCases.toArray(),
      db.defects.toArray(),
    ]);
    return { apps, functionalities, components, projects, requirements, testCases, defects };
  }, []);

  const loaded = data !== undefined;
  const openDefects = data?.defects.filter((d) => d.status === 'open' || d.status === 'in-progress').length ?? 0;

  const attention: Attention[] = (() => {
    if (!data) return [];
    const covered = new Set(data.testCases.flatMap((t) => t.requirementIds));
    const items: Attention[] = [
      { key: 'defects', icon: Bug, count: openDefects, text: `open ${openDefects === 1 ? 'defect needs' : 'defects need'} a fix`, to: '/testing', tone: 'error' },
      { key: 'review', icon: ClipboardCheck, count: data.requirements.filter((r) => r.status === 'in-review').length, text: 'requirements are waiting for approval', to: '/projects', tone: 'warn' },
      { key: 'unmapped', icon: Link2Off, count: data.requirements.filter((r) => r.functionalityIds.length === 0).length, text: 'requirements are not mapped to a functionality', to: '/projects', tone: 'warn' },
      { key: 'untested', icon: FileQuestion, count: data.requirements.filter((r) => r.status === 'approved' && !covered.has(r.id)).length, text: 'approved requirements have no test case', to: '/testing', tone: 'warn' },
      { key: 'owners', icon: UserX, count: data.apps.filter((a) => !a.businessOwner.trim()).length, text: 'applications have no business owner', to: '/applications', tone: 'warn' },
    ];
    return items.filter((i) => i.count > 0);
  })();

  const recent = [...(data?.apps ?? [])].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 5);

  const steps = [
    { done: !!apiKey, label: 'Add an AI API key', to: '/settings', cta: 'Open settings' },
    { done: status.phase === 'connected', label: 'Test the connection', to: '/settings', cta: 'Test connection' },
    { done: (data?.apps.length ?? 0) > 0, label: 'Document your first application', to: '/applications', cta: 'Go to Applications' },
    { done: (data?.projects ?? 0) > 0, label: 'Create a project and link impacted applications', to: '/projects', cta: 'Go to Projects' },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const showOnboarding = loaded && !onboardingHidden && doneCount < steps.length;

  useReveal(rootRef, '[data-reveal]', { deps: [loaded], y: 16, stagger: 0.07 });

  useGSAP(
    () => {
      if (!loaded || !barRef.current) return;
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.fromTo(barRef.current, { scaleX: 0 }, { scaleX: 1, duration: 0.8, delay: 0.3, ease: 'power3.out', transformOrigin: 'left center' });
      });
      return () => mm.revert();
    },
    { scope: rootRef, dependencies: [loaded, doneCount] },
  );

  return (
    <div ref={rootRef}>
      <PageHeader title="Dashboard" description={`What is documented in ${workspace.name}, and what needs your attention next.`} />

      {showOnboarding && (
        <section aria-label="Getting started" data-reveal className="card mb-6 p-0">
          <div className="flex items-center gap-4 border-b border-outline-variant px-5 py-3">
            <h2 className="text-headline-md">Get set up</h2>
            <div className="flex flex-1 items-center gap-3">
              <div className="h-1.5 max-w-[200px] flex-1 overflow-hidden rounded-full bg-surface-container" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={doneCount} aria-label="Setup progress">
                <div ref={barRef} className="h-full origin-left rounded-full bg-primary" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
              </div>
              <span className="text-label-md font-normal text-on-surface-variant">{doneCount} of {steps.length}</span>
            </div>
            <button type="button" className="icon-btn -mr-2" aria-label="Hide setup checklist" title="Hide" onClick={() => setOnboardingHidden(true)}>
              <X size={16} aria-hidden />
            </button>
          </div>
          <ul className="divide-y divide-outline-variant">
            {steps.map((s) => (
              <li key={s.label} className="flex items-center gap-3 px-5 py-2.5">
                {s.done ? (
                  <CheckCircle2 size={18} aria-label="Done" className="shrink-0 text-success" />
                ) : (
                  <span role="img" aria-label="To do" className="h-[18px] w-[18px] shrink-0 rounded-full border-2 border-outline-variant" />
                )}
                <span className={cn('flex-1', s.done && 'text-on-surface-variant')}>{s.label}</span>
                {!s.done && (
                  <Link to={s.to} className="btn btn-secondary btn-sm">
                    {s.cta}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-4 xl:grid-cols-5">
        <div className="xl:col-span-2">
          <StatGroup
            title="Knowledge"
            stats={[
              { label: 'Applications', value: data?.apps.length, to: '/applications' },
              { label: 'Functionalities', value: data?.functionalities, to: '/applications/catalog' },
              { label: 'Components', value: data?.components, to: '/applications' },
            ]}
          />
        </div>
        <div className="xl:col-span-3">
          <StatGroup
            title="Delivery"
            stats={[
              { label: 'Projects', value: data?.projects, to: '/projects' },
              { label: 'Requirements', value: data?.requirements.length, to: '/projects' },
              { label: 'Test cases', value: data?.testCases.length, to: '/testing' },
              { label: 'Open defects', value: data ? openDefects : undefined, to: '/testing' },
            ]}
          />
        </div>
      </div>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-5">
        <section aria-label="Needs attention" data-reveal className="card lg:col-span-3">
          <h2 className="text-headline-md">Needs attention</h2>
          {!loaded ? (
            <div role="status" aria-label="Loading" className="mt-4 space-y-3">
              <div className="skeleton h-10" />
              <div className="skeleton h-10" />
            </div>
          ) : attention.length === 0 ? (
            <p className="mt-4 flex items-center gap-2 rounded bg-success-container px-3 py-3 text-body-md text-success">
              <CheckCircle2 size={18} aria-hidden />
              Nothing is waiting on you. Documentation, requirements and tests are in step.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-outline-variant">
              {attention.map((a) => (
                <li key={a.key}>
                  <Link to={a.to} className="group -mx-2 flex items-center gap-3 rounded px-2 py-3 transition-colors hover:bg-surface-low">
                    <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', a.tone === 'error' ? 'bg-error-container text-error' : 'bg-warning-container text-warning')}>
                      <a.icon size={16} aria-hidden />
                    </span>
                    <span className="flex-1 text-body-md">
                      <strong className="font-semibold tabular-nums">{a.count}</strong> {a.text}
                    </span>
                    <ArrowRight size={16} aria-hidden className="text-on-surface-variant transition-transform duration-200 group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Recently updated" data-reveal className="card lg:col-span-2">
          <h2 className="text-headline-md">Recently updated</h2>
          {!loaded ? (
            <div role="status" aria-label="Loading" className="mt-4 space-y-3">
              <div className="skeleton h-10" />
              <div className="skeleton h-10" />
            </div>
          ) : recent.length === 0 ? (
            <p className="mt-4 flex items-start gap-2 text-body-md text-on-surface-variant">
              <AlertTriangle size={16} aria-hidden className="mt-0.5 shrink-0" />
              No applications yet. Add one, or load sample data from the Applications page.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-outline-variant">
              {recent.map((a) => (
                <li key={a.id}>
                  <Link to={`/applications/${a.id}`} className="-mx-2 flex items-center justify-between gap-3 rounded px-2 py-2.5 transition-colors hover:bg-surface-low">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{a.name}</span>
                      <span className="block truncate text-label-md font-normal text-on-surface-variant">{formatDateTime(a.updatedAt)}</span>
                    </span>
                    <TierBadge tier={a.criticalTier} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {loaded && <p className="mt-3 text-label-md font-normal text-on-surface-variant">{plural(data.apps.length, 'application')} in this workspace</p>}
        </section>
      </div>
    </div>
  );
}
