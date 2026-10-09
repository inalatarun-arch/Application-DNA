import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Maximize, Network, RotateCcw, Search, SlidersHorizontal, X, ZoomIn, ZoomOut } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import GraphCanvas, { type GraphCanvasHandle } from '@/components/graph/GraphCanvas';
import NodeDrawer from '@/components/graph/NodeDrawer';
import { autoSpacing, MAX_SPACING, MIN_SPACING, NODE_META, NODE_ORDER, PRESET_TYPES, type NodeType, type Preset } from '@/config/graph';
import { useTheme } from '@/context/ThemeContext';
import { useGraphSource } from '@/hooks/useGraphSource';
import { usePersistentState } from '@/hooks/usePersistentState';
import { buildGraph, filterGraph, neighborMap } from '@/lib/graphModel';
import { cn } from '@/lib/cn';
import KnowledgeTabs from './KnowledgeTabs';

const PRESETS: Array<{ id: Exclude<Preset, 'custom'>; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'functional', label: 'Functional' },
  { id: 'technical', label: 'Technical' },
];

export default function KnowledgeGraphPage() {
  const source = useGraphSource();
  const { theme } = useTheme();
  const graphRef = useRef<GraphCanvasHandle>(null);

  const [types, setTypes] = useState<Set<NodeType>>(() => new Set(NODE_ORDER));
  const [preset, setPreset] = useState<Preset>('all');
  const [appFilter, setAppFilter] = useState('all');
  const [hierarchy, setHierarchy] = useState(true);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [auto, setAuto] = usePersistentState('eih.graph.autoSpacing', true);
  const [manual, setManual] = usePersistentState('eih.graph.spacing', 1.6);
  const [relayout, setRelayout] = useState(0);
  const [layoutOpen, setLayoutOpen] = useState(false);

  const graph = useMemo(() => (source ? buildGraph(source) : null), [source]);
  const filtered = useMemo(
    () => (graph ? filterGraph(graph, { types, hierarchy, applicationId: appFilter }) : { nodes: [], edges: [] }),
    [graph, types, hierarchy, appFilter],
  );
  // Auto spacing grows with the number of visible nodes; manual spacing is whatever the slider says.
  const spacing = auto ? autoSpacing(filtered.nodes.length) : manual;
  const nodesById = useMemo(() => new Map(filtered.nodes.map((n) => [n.id, n])), [filtered.nodes]);
  const adjacency = useMemo(() => neighborMap(filtered.edges), [filtered.edges]);
  const counts = useMemo(() => {
    const c = new Map<NodeType, number>();
    for (const n of graph?.nodes ?? []) c.set(n.type, (c.get(n.type) ?? 0) + 1);
    return c;
  }, [graph]);

  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () => (q ? filtered.nodes.filter((n) => `${n.label} ${n.subtitle}`.toLowerCase().includes(q)) : []),
    [filtered.nodes, q],
  );

  const selected = selectedId ? nodesById.get(selectedId) ?? null : null;

  const highlightIds = useMemo(() => {
    if (q) return new Set(matches.map((n) => n.id));
    if (selected) return new Set<string>([selected.id, ...(adjacency.get(selected.id) ?? [])]);
    return null;
  }, [q, matches, selected, adjacency]);

  const choosePreset = (id: Exclude<Preset, 'custom'>) => {
    setPreset(id);
    setTypes(new Set(PRESET_TYPES[id]));
  };
  const toggleType = (t: NodeType) => {
    setPreset('custom');
    setTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };
  const pick = (id: string) => {
    setSelectedId(id);
    window.setTimeout(() => graphRef.current?.focusNode(id), 0);
  };

  const loading = source === undefined;
  const empty = !loading && (graph?.nodes.length ?? 0) === 0;
  const fitKey = `${preset}|${appFilter}|${filtered.nodes.length > 0 ? 'data' : 'empty'}`;

  return (
    <>
      <PageHeader title="Knowledge graph" description="Every application, module, screen, functionality, technical component and requirement in your workspace, and how they connect." />
      <KnowledgeTabs />

      {empty ? (
        <EmptyState icon={Network} title="Nothing to graph yet" description="Document an application, or load the sample enterprise data, and its relationships appear here.">
          <Link to="/applications" className="btn btn-primary">Go to applications</Link>
          <Link to="/settings" className="btn btn-secondary">Open settings</Link>
        </EmptyState>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
              <input
                className="input pl-9"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && matches[0]) pick(matches[0].id);
                  if (e.key === 'Escape') setQuery('');
                }}
                placeholder="Search nodes by name"
                aria-label="Search nodes"
              />
              {q && matches.length > 0 && (
                <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-outline-variant bg-surface-lowest shadow-pop" role="listbox" aria-label="Matching nodes">
                  {matches.slice(0, 8).map((n) => (
                    <li key={n.id} role="option" aria-selected={n.id === selectedId}>
                      <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-container" onClick={() => { pick(n.id); setQuery(''); }}>
                        <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: NODE_META[n.type].color }} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-body-md font-medium">{n.label}</span>
                          <span className="block truncate text-label-md font-normal text-on-surface-variant">{NODE_META[n.type].label}{n.subtitle ? ` · ${n.subtitle}` : ''}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div role="group" aria-label="Layer" className="flex rounded border border-outline-variant">
              {PRESETS.map((p) => (
                <button key={p.id} type="button" aria-pressed={preset === p.id} onClick={() => choosePreset(p.id)} className={cn('px-3 py-2 text-body-md first:rounded-l last:rounded-r', preset === p.id ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container')}>
                  {p.label}
                </button>
              ))}
            </div>

            <select className="input w-auto" value={appFilter} onChange={(e) => setAppFilter(e.target.value)} aria-label="Focus on an application">
              <option value="all">All applications</option>
              {[...(source?.applications ?? [])].sort((a, b) => a.name.localeCompare(b.name)).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Node types">
            {NODE_ORDER.map((t) => {
              const m = NODE_META[t];
              const on = types.has(t);
              return (
                <button key={t} type="button" aria-pressed={on} onClick={() => toggleType(t)} className={cn('inline-flex items-center gap-2 rounded border px-2.5 py-1 text-label-md transition-colors', on ? 'border-outline bg-surface-lowest text-on-surface' : 'border-outline-variant text-on-surface-variant opacity-60 hover:opacity-100')}>
                  <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: on ? m.color : 'transparent', border: `2px solid ${m.color}` }} />
                  {m.plural}
                  <span className="font-normal text-on-surface-variant">{counts.get(t) ?? 0}</span>
                </button>
              );
            })}
            <label className="ml-auto flex items-center gap-2 text-body-md">
              <input type="checkbox" checked={hierarchy} onChange={(e) => setHierarchy(e.target.checked)} />
              Hierarchy links
            </label>
          </div>

          <div className="relative h-[66dvh] min-h-[440px] overflow-hidden rounded border border-outline-variant bg-surface-lowest">
            <GraphCanvas
              ref={graphRef}
              nodes={filtered.nodes}
              edges={filtered.edges}
              selectedId={selected?.id ?? null}
              highlightIds={highlightIds}
              fitKey={fitKey}
              spacing={spacing}
              relayoutToken={relayout}
              theme={theme}
              ariaLabel={`Knowledge graph with ${filtered.nodes.length} nodes and ${filtered.edges.length} links. Use the search box to find and open nodes.`}
              onSelect={setSelectedId}
            />

            {loading && <p className="absolute left-4 top-4 text-body-md text-on-surface-variant">Loading…</p>}
            {!loading && filtered.nodes.length === 0 && <p className="absolute inset-0 flex items-center justify-center text-body-md text-on-surface-variant">No nodes match the current filters.</p>}

            <div className="absolute left-3 top-3 flex flex-col gap-1">
              {[
                { label: 'Zoom in', icon: ZoomIn, run: () => graphRef.current?.zoomBy(1.3) },
                { label: 'Zoom out', icon: ZoomOut, run: () => graphRef.current?.zoomBy(1 / 1.3) },
                { label: 'Zoom to fit', icon: Maximize, run: () => graphRef.current?.fit() },
                { label: 'Export PNG', icon: Download, run: () => graphRef.current?.exportPng('knowledge-graph.png') },
              ].map((b) => (
                <button key={b.label} type="button" onClick={b.run} aria-label={b.label} title={b.label} className="icon-btn border border-outline-variant bg-surface-lowest">
                  <b.icon size={16} aria-hidden />
                </button>
              ))}
            </div>

            <div className="absolute left-3 top-[11.5rem]">
              <button type="button" onClick={() => setLayoutOpen((o) => !o)} aria-label="Layout and spacing" aria-expanded={layoutOpen} title="Layout and spacing" className="icon-btn border border-outline-variant bg-surface-lowest">
                <SlidersHorizontal size={16} aria-hidden />
              </button>
            </div>

            {layoutOpen && (
              <div role="dialog" aria-label="Layout and spacing" className="absolute left-14 top-3 z-10 w-72 max-w-[calc(100%-4.5rem)] rounded-lg border border-outline-variant bg-surface-lowest shadow-pop p-4">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <h2 className="text-body-md font-semibold">Layout and spacing</h2>
                  <button type="button" className="icon-btn -mr-2 -mt-2" onClick={() => setLayoutOpen(false)} aria-label="Close layout panel">
                    <X size={16} aria-hidden />
                  </button>
                </div>
                <label className="flex items-start gap-2 text-body-md">
                  <input type="checkbox" className="mt-1" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
                  <span>
                    Auto spacing
                    <span className="field-hint block">Adds room as the graph grows so nodes never overlap. Now {spacing.toFixed(2)}× for {filtered.nodes.length} nodes.</span>
                  </span>
                </label>
                <div className="mt-4">
                  <label htmlFor="graph-spacing" className="field-label flex justify-between">
                    <span>Distance between nodes</span>
                    <span className="tabular-nums">{spacing.toFixed(1)}×</span>
                  </label>
                  <input
                    id="graph-spacing"
                    type="range"
                    className="w-full"
                    min={MIN_SPACING}
                    max={MAX_SPACING}
                    step={0.1}
                    value={Math.min(MAX_SPACING, Math.max(MIN_SPACING, spacing))}
                    onChange={(e) => {
                      setAuto(false);
                      setManual(Number(e.target.value));
                    }}
                  />
                  <p className="field-hint">Moving the slider switches to manual spacing. Nodes are still kept from overlapping.</p>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" className="btn btn-secondary px-3 py-1.5" onClick={() => setRelayout((n) => n + 1)}>
                    <RotateCcw size={14} aria-hidden />
                    Re-layout
                  </button>
                  <button type="button" className="btn btn-secondary px-3 py-1.5" onClick={() => setAuto(true)} disabled={auto}>Reset to auto</button>
                </div>
              </div>
            )}

            <p className="pointer-events-none absolute bottom-3 left-3 hidden text-label-md font-normal text-on-surface-variant sm:block">
              {filtered.nodes.length} nodes · {filtered.edges.length} links · scroll to zoom, drag to pan, click a node for details
            </p>

            {selected && source && (
              <NodeDrawer node={selected} source={source} nodesById={nodesById} edges={filtered.edges} onSelect={pick} onClose={() => setSelectedId(null)} />
            )}
          </div>
        </>
      )}
    </>
  );
}
