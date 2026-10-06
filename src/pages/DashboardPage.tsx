import { Link } from 'react-router-dom';
import { Check, Circle } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import PageHeader from '@/components/ui/PageHeader';
import { useApiKey, useGeminiStatus } from '@/hooks/useApiKey';
import { useWorkspace } from '@/db/settings';

const COUNTERS = [
  { label: 'Applications', key: 'applications' },
  { label: 'Functionalities', key: 'functionalities' },
  { label: 'Projects', key: 'projects' },
  { label: 'Requirements', key: 'requirements' },
  { label: 'Test cases', key: 'testCases' },
  { label: 'Open defects', key: 'defects' },
] as const;

export default function DashboardPage() {
  const [workspace] = useWorkspace();
  const apiKey = useApiKey();
  const status = useGeminiStatus();

  const counts = useLiveQuery(async () => {
    const [applications, functionalities, projects, requirements, testCases, defects] = await Promise.all([
      db.applications.count(),
      db.functionalities.count(),
      db.projects.count(),
      db.requirements.count(),
      db.testCases.count(),
      db.defects.where('status').anyOf('open', 'in-progress').count(),
    ]);
    return { applications, functionalities, projects, requirements, testCases, defects };
  }, []);

  const steps = [
    { done: !!apiKey, label: 'Add a Gemini API key', to: '/settings', cta: 'Open settings' },
    { done: status.phase === 'connected', label: 'Test the connection', to: '/settings', cta: 'Test connection' },
    { done: (counts?.applications ?? 0) > 0, label: 'Document your first application', to: '/applications', cta: 'Go to Applications' },
    { done: (counts?.projects ?? 0) > 0, label: 'Create a project and link impacted applications', to: '/projects', cta: 'Go to Projects' },
  ];

  return (
    <>
      <PageHeader title="Dashboard" description={`Overview of ${workspace.name}.`} />

      <section aria-label="Repository totals" className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {COUNTERS.map((c) => (
          <div key={c.key} className="card">
            <p className="text-label-md text-on-surface-variant">{c.label}</p>
            <p className="mt-2 text-headline-lg">{counts ? counts[c.key] : '–'}</p>
          </div>
        ))}
      </section>

      <section className="card mt-6" aria-label="Getting started">
        <h2 className="text-headline-md">Getting started</h2>
        <ul className="mt-4 divide-y divide-outline-variant">
          {steps.map((s) => (
            <li key={s.label} className="flex items-center gap-3 py-3">
              {s.done ? (
                <Check size={18} aria-label="Done" className="shrink-0" />
              ) : (
                <Circle size={18} aria-label="To do" className="shrink-0 text-outline" />
              )}
              <span className={s.done ? 'flex-1 text-on-surface-variant line-through' : 'flex-1'}>{s.label}</span>
              {!s.done && (
                <Link to={s.to} className="btn btn-secondary py-1">
                  {s.cta}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
