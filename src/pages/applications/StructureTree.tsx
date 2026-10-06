import { useMemo, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, FolderTree, Plus, Search } from 'lucide-react';
import type { AppModule, Application, Screen } from '@/db/types';
import { createModule, createScreen } from '@/db/catalog';
import QuickCreateModal from '@/components/ui/QuickCreateModal';
import { cn } from '@/lib/cn';

interface Props {
  app: Application;
  modules: AppModule[];
  screens: Screen[];
}

const linkClass = (isActive: boolean) =>
  cn(
    'block truncate rounded px-2 py-1.5 text-body-md transition-colors',
    isActive ? 'bg-surface-container font-semibold text-on-surface' : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
  );

/** Application → Modules → Screens navigation with filter and inline creation. */
export default function StructureTree({ app, modules, screens }: Props) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [newModule, setNewModule] = useState(false);
  const [newScreenIn, setNewScreenIn] = useState<AppModule | null>(null);
  const q = filter.trim().toLowerCase();

  const { groups, orphans } = useMemo(() => {
    const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
    const ids = new Set(modules.map((m) => m.id));
    const map = new Map<string, Screen[]>();
    const orphanList: Screen[] = [];
    for (const s of [...screens].sort(byName)) {
      if (s.moduleId && ids.has(s.moduleId)) map.set(s.moduleId, [...(map.get(s.moduleId) ?? []), s]);
      else orphanList.push(s);
    }
    return { groups: [...modules].sort(byName).map((m) => ({ module: m, screens: map.get(m.id) ?? [] })), orphans: orphanList };
  }, [modules, screens]);

  const visibleGroups = groups
    .map((g) => {
      if (!q) return g;
      const moduleMatches = g.module.name.toLowerCase().includes(q);
      const matching = moduleMatches ? g.screens : g.screens.filter((s) => s.name.toLowerCase().includes(q));
      return moduleMatches || matching.length > 0 ? { ...g, screens: matching } : null;
    })
    .filter((g): g is (typeof groups)[number] => g !== null);
  const visibleOrphans = q ? orphans.filter((s) => s.name.toLowerCase().includes(q)) : orphans;

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const base = `/applications/${app.id}`;

  return (
    <nav aria-label={`${app.name} structure`} className="card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-body-md font-semibold">
          <FolderTree size={16} aria-hidden />
          Structure
        </h2>
        <button type="button" className="btn btn-secondary px-2 py-1 text-label-md" onClick={() => setNewModule(true)}>
          <Plus size={14} aria-hidden />
          Module
        </button>
      </div>

      <div className="relative">
        <Search size={14} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-outline" />
        <input className="input py-1.5 pl-8" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter modules and screens" aria-label="Filter modules and screens" />
      </div>

      <div className="max-h-72 space-y-0.5 overflow-y-auto lg:max-h-[calc(100dvh-20rem)]">
        <NavLink to={base} end className={({ isActive }) => linkClass(isActive)}>Overview</NavLink>
        <NavLink to={`${base}/technical`} className={({ isActive }) => linkClass(isActive)}>Technical components</NavLink>

        {visibleGroups.length === 0 && visibleOrphans.length === 0 && (
          <p className="px-2 py-3 text-body-md text-on-surface-variant">{q ? 'Nothing matches the filter.' : 'No modules yet. Add the first module to start documenting screens.'}</p>
        )}

        {visibleGroups.map(({ module: m, screens: list }) => {
          const open = q ? true : !collapsed.has(m.id);
          return (
            <div key={m.id}>
              <div className="flex items-center">
                <button type="button" className="icon-btn h-8 w-7 shrink-0" onClick={() => toggle(m.id)} aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${m.name}`}>
                  {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
                </button>
                <NavLink to={`${base}/modules/${m.id}`} className={({ isActive }) => cn(linkClass(isActive), 'min-w-0 flex-1 font-medium')}>
                  {m.name}
                </NavLink>
                <button type="button" className="icon-btn h-8 w-8 shrink-0" onClick={() => setNewScreenIn(m)} aria-label={`Add screen to ${m.name}`} title="Add screen">
                  <Plus size={14} aria-hidden />
                </button>
              </div>
              {open && (
                <ul className="ml-7 border-l border-outline-variant pl-1">
                  {list.length === 0 && <li className="px-2 py-1 text-label-md font-normal text-on-surface-variant">No screens</li>}
                  {list.map((s) => (
                    <li key={s.id}>
                      <NavLink to={`${base}/screens/${s.id}`} className={({ isActive }) => linkClass(isActive)}>{s.name}</NavLink>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}

        {visibleOrphans.length > 0 && (
          <div className="pt-2">
            <p className="px-2 py-1 text-label-md text-on-surface-variant">No module</p>
            <ul className="ml-2 border-l border-outline-variant pl-1">
              {visibleOrphans.map((s) => (
                <li key={s.id}>
                  <NavLink to={`${base}/screens/${s.id}`} className={({ isActive }) => linkClass(isActive)}>{s.name}</NavLink>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <QuickCreateModal
        open={newModule}
        title="New module"
        nameLabel="Module name"
        namePlaceholder="e.g. Payables"
        detailLabel="Description"
        detailPlaceholder="What this module covers"
        submitLabel="Create module"
        onClose={() => setNewModule(false)}
        onSubmit={async (name, detail) => {
          const m = await createModule(app.id, name, detail);
          navigate(`${base}/modules/${m.id}`);
        }}
      />
      <QuickCreateModal
        open={!!newScreenIn}
        title={newScreenIn ? `New screen in ${newScreenIn.name}` : 'New screen'}
        nameLabel="Screen name"
        namePlaceholder="e.g. Supplier Maintenance"
        detailLabel="Purpose"
        detailPlaceholder="What users do on this screen"
        submitLabel="Create screen"
        onClose={() => setNewScreenIn(null)}
        onSubmit={async (name, detail) => {
          if (!newScreenIn) return;
          const s = await createScreen(app.id, newScreenIn.id, name, detail);
          navigate(`${base}/screens/${s.id}`);
        }}
      />
    </nav>
  );
}
