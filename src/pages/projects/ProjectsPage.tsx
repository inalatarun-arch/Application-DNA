import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { FolderKanban, Plus, Search } from 'lucide-react';
import { db } from '@/db/db';
import { labelOf, PRIORITIES, PROJECT_STATUSES } from '@/db/projects';
import type { ProjectStatus } from '@/db/types';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import StatusBadge from '@/components/ui/StatusBadge';
import Chip from '@/components/ui/Chip';
import { formatDateTime } from '@/lib/format';
import ProjectFormModal from './ProjectFormModal';
import PageSkeleton from '@/components/ui/Skeleton';

function tally(keys: unknown[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const k of keys) m.set(String(k), (m.get(String(k)) ?? 0) + 1);
  return m;
}

export default function ProjectsPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | ProjectStatus>('all');
  const [creating, setCreating] = useState(false);

  const data = useLiveQuery(async () => {
    const [projects, applications, modules, meetingKeys, reqKeys, pending, meetings] = await Promise.all([
      db.projects.toArray(),
      db.applications.toArray(),
      db.modules.toArray(),
      db.meetings.orderBy('projectId').keys(),
      db.requirements.orderBy('projectId').keys(),
      db.candidates.where('decision').anyOf('pending', 'accepted').toArray(),
      db.meetings.toArray(),
    ]);
    projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const openActions = new Map<string, number>();
    for (const m of meetings) openActions.set(m.projectId, (openActions.get(m.projectId) ?? 0) + (m.actionItems ?? []).filter((a) => !a.done).length);
    return {
      projects,
      appName: new Map(applications.map((a) => [a.id, a.name])),
      moduleCount: modules.length,
      meetings: tally(meetingKeys),
      requirements: tally(reqKeys),
      pending: tally(pending.map((c) => c.projectId)),
      openActions,
    };
  }, []);

  const filtered = useMemo(() => {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    return (data?.projects ?? []).filter((p) => {
      if (status !== 'all' && p.status !== status) return false;
      const hay = `${p.name} ${p.description} ${p.owner} ${p.sponsor} ${(p.applicationIds ?? []).map((id) => data?.appName.get(id) ?? '').join(' ')}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [data, query, status]);

  const totals = useMemo(() => {
    const projects = data?.projects ?? [];
    const sum = (m?: Map<string, number>) => (m ? [...m.values()].reduce((a, b) => a + b, 0) : 0);
    return {
      active: projects.filter((p) => p.status === 'active').length,
      requirements: sum(data?.requirements),
      pending: sum(data?.pending),
      actions: sum(data?.openActions),
    };
  }, [data]);

  const loading = data === undefined;
  const empty = !loading && data.projects.length === 0;

  return (
    <>
      <PageHeader
        title="Projects & Delivery"
        description="Track initiatives from kickoff to approved requirements. Link them to the applications they change, then turn workshop transcripts into notes and a reviewed backlog."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            <Plus size={16} aria-hidden />
            New project
          </button>
        }
      />

      {empty ? (
        <EmptyState icon={FolderKanban} title="No projects yet" description="Create a project such as “Supplier Onboarding Enhancement”, link the applications it affects, and upload the first workshop transcript.">
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            <Plus size={16} aria-hidden />
            New project
          </button>
        </EmptyState>
      ) : (
        <>
          <section aria-label="Totals" className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              ['Active projects', totals.active],
              ['Requirements in backlogs', totals.requirements],
              ['Suggestions awaiting review', totals.pending],
              ['Open action items', totals.actions],
            ].map(([label, value]) => (
              <div key={label as string} className="card p-4">
                <p className="text-label-md text-on-surface-variant">{label}</p>
                <p className="mt-1 text-headline-lg">{loading ? '–' : value}</p>
              </div>
            ))}
          </section>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
              <input className="input pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, owner, sponsor or application" aria-label="Search projects" />
            </div>
            <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value as 'all' | ProjectStatus)} aria-label="Filter by status">
              <option value="all">All statuses</option>
              {PROJECT_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>

          {loading ? (
            <PageSkeleton />
          ) : filtered.length === 0 ? (
            <EmptyState icon={Search} title="No projects match" description="Try a different search or status." />
          ) : (
            <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((p) => {
                const apps = (p.applicationIds ?? []).map((id) => data.appName.get(id)).filter((n): n is string => !!n);
                return (
                  <li key={p.id}>
                    <article className="card relative flex h-full flex-col gap-3 transition-colors hover:border-outline">
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="min-w-0 text-headline-md">
                          <Link to={`/projects/${p.id}`} className="after:absolute after:inset-0">{p.name || 'Untitled project'}</Link>
                        </h2>
                        <StatusBadge status={p.status} label={labelOf(PROJECT_STATUSES, p.status)} />
                      </div>
                      {p.description && <p className="line-clamp-2 text-body-md text-on-surface-variant">{p.description}</p>}
                      <div className="flex flex-wrap gap-1">
                        {apps.length === 0 ? <span className="text-label-md font-normal text-on-surface-variant">No applications linked</span> : apps.slice(0, 4).map((n) => <Chip key={n}>{n}</Chip>)}
                        {apps.length > 4 && <Chip>+{apps.length - 4}</Chip>}
                      </div>
                      <dl className="mt-auto grid grid-cols-3 gap-2 border-t border-outline-variant pt-3 text-center">
                        {[
                          ['Meetings', data.meetings.get(p.id) ?? 0],
                          ['Backlog', data.requirements.get(p.id) ?? 0],
                          ['To review', data.pending.get(p.id) ?? 0],
                        ].map(([k, v]) => (
                          <div key={k as string}>
                            <dd className="text-headline-md">{v}</dd>
                            <dt className="text-label-md font-normal text-on-surface-variant">{k}</dt>
                          </div>
                        ))}
                      </dl>
                      <p className="text-label-md font-normal text-on-surface-variant">
                        {[p.owner && `Owner: ${p.owner}`, p.targetDate && `Target: ${p.targetDate}`, `${labelOf(PRIORITIES, p.priority ?? 'medium')} priority`, `Updated ${formatDateTime(p.updatedAt)}`].filter(Boolean).join(' · ')}
                      </p>
                    </article>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <ProjectFormModal open={creating} onClose={() => setCreating(false)} onCreated={(p) => navigate(`/projects/${p.id}`)} />
    </>
  );
}
