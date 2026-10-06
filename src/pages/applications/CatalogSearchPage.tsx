import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AppWindow, ListChecks, Search } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import { loadCatalogData, searchCatalog, type CatalogKind } from '@/lib/catalogSearch';
import { cn } from '@/lib/cn';
import ApplicationsTabs from './ApplicationsTabs';

const KINDS: Array<{ id: CatalogKind | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'screen', label: 'Screens' },
  { id: 'functionality', label: 'Functionalities' },
];

export default function CatalogSearchPage() {
  const data = useLiveQuery(loadCatalogData, []);
  const [query, setQuery] = useState('');
  const [applicationId, setApplicationId] = useState('all');
  const [kind, setKind] = useState<CatalogKind | 'all'>('all');

  const hits = useMemo(
    () => (data ? searchCatalog(data, { query, kind, applicationId: applicationId === 'all' ? undefined : applicationId, limit: 300 }) : []),
    [data, query, kind, applicationId],
  );
  const total = (data?.screens.length ?? 0) + (data?.functionalities.length ?? 0);

  return (
    <>
      <PageHeader title="Applications" description="Search every documented screen and functionality, including field descriptions, rules, roles, inputs and outputs." />
      <ApplicationsTabs />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
          <input className="input pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search names, purposes, fields, rules, roles, systems…" aria-label="Search screens and functionalities" autoFocus />
        </div>
        <select className="input w-auto" value={applicationId} onChange={(e) => setApplicationId(e.target.value)} aria-label="Filter by application">
          <option value="all">All applications</option>
          {[...(data?.applications ?? [])].sort((a, b) => a.name.localeCompare(b.name)).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <div role="group" aria-label="Type" className="flex rounded border border-outline-variant">
          {KINDS.map((k) => (
            <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => setKind(k.id)} className={cn('px-3 py-2 text-body-md first:rounded-l last:rounded-r', kind === k.id ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container')}>
              {k.label}
            </button>
          ))}
        </div>
      </div>

      {data && total === 0 ? (
        <EmptyState icon={AppWindow} title="Nothing documented yet" description="Screens and functionalities appear here as soon as you add them to an application.">
          <Link to="/applications" className="btn btn-secondary">Go to applications</Link>
        </EmptyState>
      ) : hits.length === 0 ? (
        <EmptyState icon={Search} title="No matches" description="Try fewer words, or search a different application." />
      ) : (
        <>
          <p className="mb-2 text-label-md font-normal text-on-surface-variant" aria-live="polite">{hits.length} {hits.length === 1 ? 'result' : 'results'}{hits.length === 300 ? ' (showing the first 300)' : ''}</p>
          <div className="overflow-x-auto rounded border border-outline-variant bg-surface-lowest">
            <table className="w-full min-w-[640px] text-left text-body-md">
              <thead className="border-b border-outline-variant bg-surface-low text-label-md text-on-surface-variant">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">Name</th>
                  <th scope="col" className="px-4 py-2 font-medium">Location</th>
                  <th scope="col" className="px-4 py-2 font-medium">Matched in</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {hits.map((h) => (
                  <tr key={`${h.kind}-${h.id}`} className="hover:bg-surface-low">
                    <td className="px-4 py-3">
                      <Link to={h.to} className="flex items-center gap-2 font-semibold hover:underline">
                        {h.kind === 'screen' ? <AppWindow size={16} aria-label="Screen" className="shrink-0 text-on-surface-variant" /> : <ListChecks size={16} aria-label="Functionality" className="shrink-0 text-on-surface-variant" />}
                        {h.name || 'Untitled'}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant">{h.path}</td>
                    <td className="px-4 py-3 text-on-surface-variant">{h.matchedIn ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
