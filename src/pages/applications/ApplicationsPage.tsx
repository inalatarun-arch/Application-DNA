import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Blocks, LayoutGrid, Pencil, Plus, Search, Table2, Trash2 } from 'lucide-react';
import { db } from '@/db/db';
import { CRITICAL_TIERS, countApplicationContents, deleteApplication, type ApplicationStats } from '@/db/catalog';
import { loadSampleData } from '@/db/seed';
import type { Application, CriticalTier } from '@/db/types';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmModal from '@/components/ui/ConfirmModal';
import TierBadge from '@/components/ui/TierBadge';
import Chip from '@/components/ui/Chip';
import { usePersistentState } from '@/hooks/usePersistentState';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import ApplicationsTabs from './ApplicationsTabs';
import ApplicationFormModal from './ApplicationFormModal';

type View = 'grid' | 'table';

function tally(keys: unknown[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const k of keys) m.set(String(k), (m.get(String(k)) ?? 0) + 1);
  return m;
}

export default function ApplicationsPage() {
  const [view, setView] = usePersistentState<View>('eih.apps.view', 'grid');
  const [query, setQuery] = useState('');
  const [tier, setTier] = useState<'all' | CriticalTier>('all');
  const [domain, setDomain] = useState('all');
  const [form, setForm] = useState<{ open: boolean; app?: Application }>({ open: false });
  const [toDelete, setToDelete] = useState<{ app: Application; stats: ApplicationStats } | null>(null);
  const [seeding, setSeeding] = useState(false);

  const data = useLiveQuery(async () => {
    const [apps, modKeys, scrKeys, fnKeys] = await Promise.all([
      db.applications.toArray(),
      db.modules.orderBy('applicationId').keys(),
      db.screens.orderBy('applicationId').keys(),
      db.functionalities.orderBy('applicationId').keys(),
    ]);
    apps.sort((a, b) => a.name.localeCompare(b.name));
    return { apps, modules: tally(modKeys), screens: tally(scrKeys), functionalities: tally(fnKeys) };
  }, []);

  const domains = useMemo(() => Array.from(new Set((data?.apps ?? []).map((a) => a.domain).filter(Boolean))).sort(), [data]);

  const filtered = useMemo(() => {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    return (data?.apps ?? []).filter((a) => {
      if (tier !== 'all' && a.criticalTier !== tier) return false;
      if (domain !== 'all' && a.domain !== domain) return false;
      const hay = [a.name, a.vendor, a.domain, a.description, a.businessOwner, a.technicalOwner, ...a.technicalStack, ...a.tags].join(' ').toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [data, query, tier, domain]);

  const counts = (id: string) => ({
    modules: data?.modules.get(id) ?? 0,
    screens: data?.screens.get(id) ?? 0,
    functionalities: data?.functionalities.get(id) ?? 0,
  });

  const askDelete = async (app: Application) => setToDelete({ app, stats: await countApplicationContents(app.id) });

  const seed = async () => {
    setSeeding(true);
    try {
      await loadSampleData();
    } finally {
      setSeeding(false);
    }
  };

  const hasFilters = query !== '' || tier !== 'all' || domain !== 'all';
  const loading = data === undefined;
  const empty = !loading && data.apps.length === 0;

  return (
    <>
      <PageHeader
        title="Applications"
        description="Every enterprise application you document, with its modules, screens and functionality."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setForm({ open: true })}>
            <Plus size={16} aria-hidden />
            New application
          </button>
        }
      />
      <ApplicationsTabs />

      {empty ? (
        <EmptyState icon={Blocks} title="No applications yet" description="Add the first application you want to document, or load a small sample catalog to explore how the pieces fit together.">
          <button type="button" className="btn btn-primary" onClick={() => setForm({ open: true })}>
            <Plus size={16} aria-hidden />
            New application
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => void seed()} disabled={seeding}>
            Load sample data
          </button>
        </EmptyState>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
              <input className="input pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, platform, stack, owner or tag" aria-label="Search applications" />
            </div>
            <select className="input w-auto" value={tier} onChange={(e) => setTier(e.target.value as 'all' | CriticalTier)} aria-label="Filter by critical tier">
              <option value="all">All tiers</option>
              {CRITICAL_TIERS.map((t) => <option key={t.id} value={t.id}>{t.label} — {t.description}</option>)}
            </select>
            <select className="input w-auto" value={domain} onChange={(e) => setDomain(e.target.value)} aria-label="Filter by domain">
              <option value="all">All domains</option>
              {domains.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <div role="group" aria-label="View" className="flex rounded border border-outline-variant">
              {([['grid', LayoutGrid, 'Grid view'], ['table', Table2, 'Table view']] as const).map(([id, Icon, label]) => (
                <button key={id} type="button" aria-label={label} aria-pressed={view === id} title={label} onClick={() => setView(id)} className={cn('flex h-9 w-9 items-center justify-center first:rounded-l last:rounded-r', view === id ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container')}>
                  <Icon size={16} aria-hidden />
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <p className="text-body-md text-on-surface-variant">Loading…</p>
          ) : filtered.length === 0 ? (
            <EmptyState icon={Search} title="No applications match" description={hasFilters ? 'Try a different search or clear the filters.' : undefined}>
              <button type="button" className="btn btn-secondary" onClick={() => { setQuery(''); setTier('all'); setDomain('all'); }}>Clear filters</button>
            </EmptyState>
          ) : view === 'grid' ? (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((app) => {
                const c = counts(app.id);
                return (
                  <li key={app.id}>
                    <article className="card relative flex h-full flex-col gap-3 transition-colors hover:border-outline">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h2 className="truncate text-headline-md">
                            <Link to={`/applications/${app.id}`} className="after:absolute after:inset-0">{app.name}</Link>
                          </h2>
                          <p className="truncate text-body-md text-on-surface-variant">{[app.vendor, app.domain].filter(Boolean).join(' · ')}</p>
                        </div>
                        <TierBadge tier={app.criticalTier} />
                      </div>
                      {app.description && <p className="line-clamp-2 text-body-md text-on-surface-variant">{app.description}</p>}
                      {app.technicalStack.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {app.technicalStack.slice(0, 4).map((s) => <Chip key={s}>{s}</Chip>)}
                          {app.technicalStack.length > 4 && <Chip>+{app.technicalStack.length - 4}</Chip>}
                        </div>
                      )}
                      <div className="mt-auto flex items-end justify-between gap-2 border-t border-outline-variant pt-3">
                        <div className="min-w-0 text-label-md font-normal text-on-surface-variant">
                          <p>{c.modules} modules · {c.screens} screens · {c.functionalities} functionalities</p>
                          {app.businessOwner && <p className="truncate">Owner: {app.businessOwner}</p>}
                        </div>
                        <div className="relative z-10 flex shrink-0">
                          <button type="button" className="icon-btn" aria-label={`Edit ${app.name}`} onClick={() => setForm({ open: true, app })}><Pencil size={16} aria-hidden /></button>
                          <button type="button" className="icon-btn" aria-label={`Delete ${app.name}`} onClick={() => void askDelete(app)}><Trash2 size={16} aria-hidden /></button>
                        </div>
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="overflow-x-auto rounded border border-outline-variant bg-surface-lowest">
              <table className="w-full min-w-[860px] text-left text-body-md">
                <thead className="border-b border-outline-variant bg-surface-low text-label-md text-on-surface-variant">
                  <tr>
                    {['Application', 'Platform', 'Domain', 'Tier', 'Business owner', 'Modules', 'Screens', 'Functionalities', 'Updated', ''].map((h, i) => (
                      <th key={i} scope="col" className="px-4 py-2 font-medium">{h || <span className="sr-only">Actions</span>}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {filtered.map((app) => {
                    const c = counts(app.id);
                    return (
                      <tr key={app.id} className="hover:bg-surface-low">
                        <td className="px-4 py-3 font-semibold"><Link to={`/applications/${app.id}`} className="hover:underline">{app.name}</Link></td>
                        <td className="px-4 py-3 text-on-surface-variant">{app.vendor || '—'}</td>
                        <td className="px-4 py-3 text-on-surface-variant">{app.domain || '—'}</td>
                        <td className="px-4 py-3"><TierBadge tier={app.criticalTier} /></td>
                        <td className="px-4 py-3 text-on-surface-variant">{app.businessOwner || '—'}</td>
                        <td className="px-4 py-3 tabular-nums">{c.modules}</td>
                        <td className="px-4 py-3 tabular-nums">{c.screens}</td>
                        <td className="px-4 py-3 tabular-nums">{c.functionalities}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-on-surface-variant">{formatDateTime(app.updatedAt)}</td>
                        <td className="whitespace-nowrap px-2 py-1 text-right">
                          <button type="button" className="icon-btn" aria-label={`Edit ${app.name}`} onClick={() => setForm({ open: true, app })}><Pencil size={16} aria-hidden /></button>
                          <button type="button" className="icon-btn" aria-label={`Delete ${app.name}`} onClick={() => void askDelete(app)}><Trash2 size={16} aria-hidden /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <ApplicationFormModal open={form.open} application={form.app} onClose={() => setForm({ open: false })} />

      <ConfirmModal
        open={!!toDelete}
        title="Delete application?"
        confirmLabel="Delete application"
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          if (toDelete) await deleteApplication(toDelete.app.id);
          setToDelete(null);
        }}
        message={
          toDelete && (
            <>
              <p><strong className="text-on-surface">{toDelete.app.name}</strong> will be removed together with its {toDelete.stats.modules} modules, {toDelete.stats.screens} screens and {toDelete.stats.functionalities} functionalities, including uploaded images.</p>
              <p className="mt-2">This cannot be undone. Export a backup from Settings first if you might need it.</p>
            </>
          )
        }
      />
    </>
  );
}
