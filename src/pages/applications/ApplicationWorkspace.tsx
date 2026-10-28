import { useState } from 'react';
import { Link, Outlet, useMatch, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Blocks, ChevronDown, FolderTree } from 'lucide-react';
import { cn } from '@/lib/cn';
import { db } from '@/db/db';
import EmptyState from '@/components/ui/EmptyState';
import Breadcrumbs, { type Crumb } from '@/components/ui/Breadcrumbs';
import StructureTree from './StructureTree';
import type { AppContext } from './appContext';
import PageSkeleton from '@/components/ui/Skeleton';

/** Layout for /applications/:appId, structure tree on the left, the selected page on the right. */
export default function ApplicationWorkspace() {
  const { appId = '' } = useParams();
  const screenMatch = useMatch('/applications/:appId/screens/:screenId');
  const moduleMatch = useMatch('/applications/:appId/modules/:moduleId');
  const techMatch = useMatch('/applications/:appId/technical');
  const componentMatch = useMatch('/applications/:appId/technical/:componentId');
  const componentId = componentMatch?.params.componentId;
  const [treeOpen, setTreeOpen] = useState(false);

  const app = useLiveQuery(() => db.applications.get(appId).then((a) => a ?? null), [appId]);
  const modules = useLiveQuery(() => db.modules.where('applicationId').equals(appId).toArray(), [appId]);
  const screens = useLiveQuery(() => db.screens.where('applicationId').equals(appId).toArray(), [appId]);
  const component = useLiveQuery(() => (componentId ? db.technicalComponents.get(componentId) : undefined), [componentId]);

  if (app === undefined || modules === undefined || screens === undefined) {
    return <PageSkeleton />;
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

  const crumbs: Crumb[] = [
    { label: 'Applications', to: '/applications' },
    { label: app.name, to: screen || mod || techMatch || componentMatch ? base : undefined },
  ];
  if (mod) crumbs.push({ label: mod.name, to: screen ? `${base}/modules/${mod.id}` : undefined });
  if (screen) crumbs.push({ label: screen.name });
  if (techMatch || componentMatch) {
    crumbs.push({ label: 'Technical components', to: componentMatch ? `${base}/technical` : undefined });
    if (componentMatch && component) crumbs.push({ label: component.name || 'Untitled component' });
  }

  const context: AppContext = { app };

  return (
    <div>
      <div className="mb-4"><Breadcrumbs items={crumbs} /></div>
      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-0 lg:self-start">
          {/* On narrow screens the tree folds away so the page itself is the first thing you see. */}
          <button type="button" aria-expanded={treeOpen} onClick={() => setTreeOpen((o) => !o)} className="btn btn-secondary w-full justify-between lg:hidden">
            <span className="flex items-center gap-2"><FolderTree size={16} aria-hidden /> Structure</span>
            <ChevronDown size={16} aria-hidden className={cn('transition-transform duration-200', treeOpen && 'rotate-180')} />
          </button>
          <div className={cn('mt-3 lg:mt-0 lg:block', !treeOpen && 'hidden')}>
            <StructureTree app={app} modules={modules} screens={screens} />
          </div>
        </aside>
        <div className="min-w-0">
          <Outlet context={context} />
        </div>
      </div>
    </div>
  );
}
