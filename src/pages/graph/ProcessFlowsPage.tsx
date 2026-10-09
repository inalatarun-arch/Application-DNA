import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Copy, Download, Image as ImageIcon, Loader2, Minus, Plus, Sparkles, Workflow } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import FlowDiagram from '@/components/flow/FlowDiagram';
import { paletteFor } from '@/config/palette';
import { useTheme } from '@/context/ThemeContext';
import { useGraphSource } from '@/hooks/useGraphSource';
import { usePersistentState } from '@/hooks/usePersistentState';
import { slug } from '@/lib/download';
import { buildFunctionalityFlow, buildModuleFlow, flowToMermaid, type FlowModel, type FlowView } from '@/lib/flowModel';
import { layoutFlow } from '@/lib/flowLayout';
import { exportFlowPng, exportFlowSvg } from '@/lib/flowExport';
import type { GraphSource } from '@/lib/graphModel';
import { cn } from '@/lib/cn';
import KnowledgeTabs from './KnowledgeTabs';
import { useApiKey } from '@/hooks/useApiKey';
import { generateKnowledgeFlow } from '@/services/knowledgeFlowAI';
import { db } from '@/db/db';
import { describeError, isGeminiError } from '@/services/geminiService';
import MermaidDiagram from '@/components/flow/MermaidDiagram';
import FlowActions from '@/components/flow/FlowActions';
import { modelToMermaid } from '@/lib/mermaidFlow';
import PageSkeleton from '@/components/ui/Skeleton';

type Scope = 'functionality' | 'module';

const VIEWS: Array<{ id: FlowView; label: string }> = [
  { id: 'swimlane', label: 'Swimlane' },
  { id: 'flowchart', label: 'Flowchart' },
];

export default function ProcessFlowsPage() {
  const source = useGraphSource();
  return (
    <>
      <PageHeader title="Knowledge graph" description="Step-by-step user and system flows for a functionality or a whole module, drawn from what you have documented." />
      <KnowledgeTabs />
      {source === undefined ? <PageSkeleton /> : <FlowsView source={source} />}
    </>
  );
}

function FlowsView({ source }: { source: GraphSource }) {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [params, setParams] = useSearchParams();
  const [view, setView] = usePersistentState<FlowView>('eih.flow.view', 'swimlane');
  const [zoom, setZoom] = useState(1);
  const [copied, setCopied] = useState(false);
  const [exportError, setExportError] = useState('');
  const [aiFlow, setAiFlow] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const apiKey = useApiKey();
  const frame = useRef<HTMLDivElement>(null);

  const scope: Scope = params.get('type') === 'module' ? 'module' : 'functionality';
  const idParam = params.get('id');
  const appParam = params.get('app');

  const apps = useMemo(() => [...source.applications].sort((a, b) => a.name.localeCompare(b.name)), [source.applications]);
  const idApp = idParam
    ? scope === 'module'
      ? source.modules.find((m) => m.id === idParam)?.applicationId
      : source.functionalities.find((f) => f.id === idParam)?.applicationId
    : undefined;
  const appId = apps.find((a) => a.id === appParam)?.id ?? idApp ?? apps[0]?.id ?? '';

  const modules = useMemo(() => source.modules.filter((m) => m.applicationId === appId).sort((a, b) => a.name.localeCompare(b.name)), [source.modules, appId]);
  const functionalities = useMemo(() => source.functionalities.filter((f) => f.applicationId === appId), [source.functionalities, appId]);
  const screenName = useMemo(() => new Map(source.screens.map((s) => [s.id, s.name])), [source.screens]);

  const groups = useMemo(() => {
    const byScreen = new Map<string, typeof functionalities>();
    for (const f of functionalities) {
      const key = f.screenId ?? '';
      byScreen.set(key, [...(byScreen.get(key) ?? []), f]);
    }
    return [...byScreen.entries()]
      .map(([sid, items]) => ({ label: (sid && screenName.get(sid)) || 'No screen', items: items.sort((a, b) => a.name.localeCompare(b.name)) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [functionalities, screenName]);

  const selectedFn = scope === 'functionality' ? functionalities.find((f) => f.id === idParam) ?? groups[0]?.items[0] : undefined;
  const selectedMod = scope === 'module' ? modules.find((m) => m.id === idParam) ?? modules[0] : undefined;
  const [override, setOverride] = useState<FlowModel | null>(null);
  useEffect(() => { setAiFlow(''); setAiError(''); setOverride(null); }, [selectedFn?.id, selectedMod?.id]);

  const built: FlowModel | null = useMemo(() => {
    if (selectedFn) return buildFunctionalityFlow(selectedFn, source);
    if (selectedMod) return buildModuleFlow(selectedMod, source);
    return null;
  }, [selectedFn, selectedMod, source]);
  const model: FlowModel | null = override ?? built;

  const layout = useMemo(() => (model && model.nodes.length > 0 ? layoutFlow(model, view) : null), [model, view]);
  const mermaid = useMemo(() => (model ? flowToMermaid(model, view) : ''), [model, view]);

  const update = (changes: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(changes)) {
          if (v === null) next.delete(k);
          else next.set(k, v);
        }
        return next;
      },
      { replace: true },
    );

  const title = model ? `${model.title}${model.subtitle ? ` (${model.subtitle})` : ''}` : 'Process flow';
  const generateAiFlow = async () => {
    if (!selectedFn || !apiKey) return;
    setAiBusy(true); setAiError('');
    try {
      const screen = selectedFn.screenId ? source.screens.find(s => s.id === selectedFn.screenId) : undefined;
      const module = selectedFn.moduleId ? source.modules.find(m => m.id === selectedFn.moduleId) : undefined;
      const components = source.components.filter(c => (c.functionalityIds ?? []).includes(selectedFn.id) || (c.screenIds ?? []).includes(selectedFn.screenId ?? ''));
      const app = source.applications.find(a => a.id === selectedFn.applicationId);
      if (!app) throw new Error('The application for this functionality could not be found.');
      const result = await generateKnowledgeFlow(app, module, screen, selectedFn, components);
      setAiFlow(result.data.mermaid);
      if (result.data.issues.length) {
        setAiError('The flow was drawn but still has syntax problems, so it was not saved to the functionality. Try again, or edit it with a sentence below.');
      } else {
        await db.functionalities.update(selectedFn.id, { processFlow: result.data.mermaid, updatedAt: new Date().toISOString() });
      }
    } catch (err) {
      if (!(isGeminiError(err) && err.code === 'ABORTED')) setAiError(describeError(err));
    } finally { setAiBusy(false); }
  };
  const base = model ? `${slug(model.title)}-${view}` : 'process-flow';

  const fitWidth = () => {
    const w = frame.current?.clientWidth;
    if (w && layout) setZoom(Math.min(1.5, Math.max(0.4, Number(((w - 2) / layout.width).toFixed(2)))));
  };

  const copyMermaid = async () => {
    try {
      await navigator.clipboard.writeText(mermaid);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setExportError('Copying is blocked by the browser. Select the text below and copy it manually.');
    }
  };

  const runExport = async (kind: 'svg' | 'png') => {
    if (!layout || !model) return;
    setExportError('');
    try {
      if (kind === 'svg') exportFlowSvg(layout, view, title, `${base}.svg`);
      else await exportFlowPng(layout, view, title, `${base}.png`);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed.');
    }
  };

  if (apps.length === 0 || (functionalities.length === 0 && modules.length === 0 && !selectedFn && !selectedMod && source.functionalities.length === 0 && source.modules.length === 0)) {
    return (
      <EmptyState icon={Workflow} title="No flows to draw yet" description="Flows are built from documented functionalities and modules. Add some, or load the sample enterprise data in Settings.">
        <button type="button" className="btn btn-primary" onClick={() => navigate('/settings')}>Open settings</button>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="flow-scope" className="field-label">Show flow for</label>
          <select id="flow-scope" className="input w-auto" value={scope} onChange={(e) => update({ type: e.target.value, id: null })}>
            <option value="functionality">A functionality</option>
            <option value="module">A module</option>
          </select>
        </div>
        <div>
          <label htmlFor="flow-app" className="field-label">Application</label>
          <select id="flow-app" className="input w-auto" value={appId} onChange={(e) => update({ app: e.target.value, id: null })}>
            {apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div className="min-w-[220px] flex-1">
          <label htmlFor="flow-subject" className="field-label">{scope === 'module' ? 'Module' : 'Functionality'}</label>
          {scope === 'module' ? (
            <select id="flow-subject" className="input" value={selectedMod?.id ?? ''} onChange={(e) => update({ id: e.target.value, app: appId })}>
              {modules.length === 0 && <option value="">No modules in this application</option>}
              {modules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          ) : (
            <select id="flow-subject" className="input" value={selectedFn?.id ?? ''} onChange={(e) => update({ id: e.target.value, app: appId })}>
              {groups.length === 0 && <option value="">No functionalities in this application</option>}
              {groups.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.items.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </optgroup>
              ))}
            </select>
          )}
        </div>
        <div role="group" aria-label="Diagram style" className="flex rounded border border-outline-variant">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => setView(v.id)} className={cn('px-3 py-2 text-body-md first:rounded-l last:rounded-r', view === v.id ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container')}>
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {!model || !layout ? (
        <EmptyState icon={Workflow} title="Nothing to draw for this selection" description={scope === 'module' ? 'This module has no screens yet. Add screens and functionalities to see how they connect.' : 'Pick a functionality to see its flow.'} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="truncate text-headline-md">{model.title}</h2>
              {model.subtitle && <p className="truncate text-body-md text-on-surface-variant">{model.subtitle}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {scope === 'functionality' && selectedFn && (
                <button type="button" className="btn btn-primary px-3 py-1.5" disabled={aiBusy || !apiKey} onClick={() => void generateAiFlow()}>
                  {aiBusy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} aria-hidden />}
                  {aiBusy ? 'Generating…' : 'Generate with Gemini'}
                </button>
              )}
              <div role="group" aria-label="Zoom" className="flex items-center rounded border border-outline-variant">
                <button type="button" className="icon-btn" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.4, Number((z - 0.1).toFixed(2))))}><Minus size={16} aria-hidden /></button>
                <span className="w-12 text-center text-label-md tabular-nums">{Math.round(zoom * 100)}%</span>
                <button type="button" className="icon-btn" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(2, Number((z + 0.1).toFixed(2))))}><Plus size={16} aria-hidden /></button>
              </div>
              <button type="button" className="btn btn-secondary px-3 py-1.5" onClick={fitWidth}>Fit width</button>
              <button type="button" className="btn btn-secondary px-3 py-1.5" onClick={() => void runExport('svg')}><Download size={14} aria-hidden />SVG</button>
              <button type="button" className="btn btn-secondary px-3 py-1.5" onClick={() => void runExport('png')}><ImageIcon size={14} aria-hidden />PNG</button>
              <button type="button" className="btn btn-secondary px-3 py-1.5" onClick={() => void copyMermaid()}>
                {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
                {copied ? 'Copied' : 'Mermaid'}
              </button>
            </div>
          </div>

          {exportError && <p role="alert" className="rounded border border-error bg-error-container p-3 text-body-md text-error">{exportError}</p>}

          <FlowActions
            model={model}
            edited={override !== null}
            onChange={setOverride}
            onReset={() => setOverride(null)}
            saveLabel="Save to functionality"
            onSave={scope === 'functionality' && selectedFn ? async () => {
              await db.functionalities.update(selectedFn.id, { processFlow: modelToMermaid(model), updatedAt: new Date().toISOString() });
              setOverride(null);
            } : undefined}
          />

          <div ref={frame} className="overflow-auto rounded border border-outline-variant bg-surface-lowest" style={{ maxHeight: '70dvh' }}>
            <FlowDiagram layout={layout} view={view} palette={paletteFor(theme)} title={title} idPrefix="eih-view" scale={zoom} onNodeClick={(n) => n.to && navigate(n.to)} />
          </div>

          {aiError && <p role="alert" className="rounded border border-error bg-error-container p-3 text-body-md text-error">{aiError}</p>}
          {aiFlow && <div className="space-y-2"><h3 className="text-body-md font-semibold">AI-generated Mermaid flow</h3><MermaidDiagram source={aiFlow}/><p className="text-label-md font-normal text-on-surface-variant">This flow is generated from the current Application DNA evidence. Regenerate it after adding or changing application functionality, screens or technical mappings.</p></div>}
          <p className="text-label-md font-normal text-on-surface-variant">
            Rounded ends mark where the flow starts and finishes, rectangles are steps, diamonds are decisions and slanted boxes are data. Click a step to open its page. PNG and SVG exports always use the light theme.
          </p>

          <details className="rounded border border-outline-variant">
            <summary className="cursor-pointer px-4 py-2 text-body-md font-medium">Mermaid source</summary>
            <pre className="overflow-x-auto border-t border-outline-variant p-4 font-mono text-code">{mermaid}</pre>
          </details>
        </>
      )}
    </div>
  );
}
