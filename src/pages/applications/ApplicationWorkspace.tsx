import { Link, Outlet, useMatch, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Blocks, ChevronRight } from 'lucide-react';
import { db } from '@/db/db';
import EmptyState from '@/components/ui/EmptyState';
import StructureTree from './StructureTree';
import type { AppContext } from './appContext';

/** Layout for /applications/:appId — structure tree on the left, the selected page on the right. */
export default function ApplicationWorkspace() {
  const { appId = '' } = useParams();
  const screenMatch = useMatch('/applications/:appId/screens/:screenId');
  const moduleMatch = useMatch('/applications/:appId/modules/:moduleId');

  const app = useLiveQuery(() => db.applications.get(appId).then((a) => a ?? null), [appId]);
  const modules = useLiveQuery(() => db.modules.where('applicationId').equals(appId).toArray(), [appId]);
  const screens = useLiveQuery(() => db.screens.where('applicationId').equals(appId).toArray(), [appId]);

  if (app === undefined || modules === undefined || screens === undefined) {
    return <p className="text-body-md text-on-surface-variant">Loading…</p>;
  }
  if (app === null) {
    return (
      <EmptyState icon={Blocks} title="Application not found" description="It may have been deleted, or you opened a link from a different browser.">
        <Link to="/applications" className="btn btn-secondary">Back to applications</Link>
      </EmptyState>
    );
  }

  const screen = screenMatch ? screens.find((s) => s.id === screenMatch.params.screenId) : undefined;
  const mod = modules.find((m) => m.id === (screen?.moduleId ?? moduleMatch?.params.moduleId));
  const base = `/applications/${app.id}`;

  const crumbs: Array<{ label: string; to?: string }> = [
    { label: 'Applications', to: '/applications' },
    { label: app.name, to: screen || mod ? base : undefined },
  ];
  if (mod) crumbs.push({ label: mod.name, to: screen ? `${base}/modules/${mod.id}` : undefined });
  if (screen) crumbs.push({ label: screen.name });

  const context: AppContext = { app };

  return (
    <div>
      <nav aria-label="Location" className="mb-4 flex flex-wrap items-center gap-1 text-body-md">
        {crumbs.map((c, i) => (
          <span key={`${c.label}-${i}`} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={14} aria-hidden className="text-outline" />}
            {c.to ? <Link to={c.to} className="text-on-surface-variant hover:text-on-surface hover:underline">{c.label}</Link> : <span className="font-semibold" aria-current="page">{c.label}</span>}
          </span>
        ))}
      </nav>
      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside>
          <StructureTree app={app} modules={modules} screens={screens} />
        </aside>
        <div className="min-w-0">
          <Outlet context={context} />
        </div>
      </div>
    </div>
  );
}
