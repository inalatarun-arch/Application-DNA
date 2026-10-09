import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Loader2, Sparkles } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, newId, nowIso } from '@/db/db';
import type { Project } from '@/db/types';
import { useApiKey } from '@/hooks/useApiKey';
import { useGraphSource } from '@/hooks/useGraphSource';
import { generateProjectFlow, type ProjectFlowResult } from '@/services/projectAI';
import { modelFromMermaid } from '@/services/flowAI';
import { describeError, isGeminiError } from '@/services/geminiService';
import { buildFunctionalityFlow, type FlowModel } from '@/lib/flowModel';
import { modelToMermaid } from '@/lib/mermaidFlow';
import { buildRepoDigest } from '@/lib/repoDigest';
import Section from '@/components/ui/Section';
import MermaidDiagram from '@/components/flow/MermaidDiagram';
import FlowActions from '@/components/flow/FlowActions';

/** How many functionalities feed the baseline; more would make the prompt long without making the answer better. */
const MAX_BASELINE = 8;

export default function ProjectFlowTab({ project }: { project: Project }) {
  const source = useGraphSource();
  const apiKey = useApiKey();
  const requirements = useLiveQuery(() => db.requirements.where('projectId').equals(project.id).toArray(), [project.id]);
  const artifacts = useLiveQuery(() => db.artifacts.where('projectId').equals(project.id).filter((a) => a.kind === 'diagram').toArray(), [project.id]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [flow, setFlow] = useState('');
  const [edited, setEdited] = useState<FlowModel | null>(null);
  const [last, setLast] = useState<ProjectFlowResult | null>(null);
  const abort = useRef<AbortController | null>(null);

  const latest = useMemo(() => [...(artifacts ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0], [artifacts]);

  const scoped = useMemo(() => {
    if (!source) return null;
    const fnIds = new Set(project.functionalityIds ?? []);
    const moduleIds = new Set(project.moduleIds ?? []);
    const appIds = new Set(project.applicationIds ?? []);
    const reqFn = new Set((requirements ?? []).flatMap((r) => r.functionalityIds ?? []));
    const functionalities = source.functionalities.filter((f) => fnIds.has(f.id) || reqFn.has(f.id) || moduleIds.has(f.moduleId ?? '') || (!fnIds.size && !moduleIds.size && appIds.has(f.applicationId)));
    const screenIds = new Set(functionalities.map((f) => f.screenId).filter(Boolean));
    return {
      functionalities,
      screens: source.screens.filter((s) => screenIds.has(s.id)),
      modules: source.modules.filter((m) => moduleIds.has(m.id) || functionalities.some((f) => f.moduleId === m.id)),
      components: source.components.filter((c) => (c.functionalityIds ?? []).some((id) => functionalities.some((f) => f.id === id))),
    };
  }, [source, project, requirements]);

  const freshness = useMemo(() => {
    if (!latest || !source) return false;
    const generated = new Date(latest.createdAt).getTime();
    const ids = new Set(project.applicationIds ?? []);
    return [
      ...source.applications.filter((a) => ids.has(a.id)),
      ...source.modules.filter((m) => (project.moduleIds ?? []).includes(m.id)),
      ...source.functionalities.filter((f) => (project.functionalityIds ?? []).includes(f.id)),
      ...(requirements ?? []),
    ].some((x) => new Date(x.updatedAt).getTime() > generated);
  }, [latest, source, project, requirements]);

  const usable = (requirements ?? []).filter((r) => r.status !== 'rejected');

  const generate = async () => {
    if (!source || !scoped || !usable.length || !apiKey) return;
    setBusy(true);
    setError('');
    setNotice('');
    const controller = new AbortController();
    abort.current = controller;
    try {
      const parts = scoped.functionalities.slice(0, MAX_BASELINE).map((f) => ({
        label: f.name,
        model: (f.processFlow && modelFromMermaid(f.processFlow, f.name)) || buildFunctionalityFlow(f, source),
      }));
      const digest = buildRepoDigest({ ...scoped, requirements: usable }, 'lean');
      const result = await generateProjectFlow(project, usable, parts, digest.text.split('\n# REQUIREMENTS')[0], controller.signal);
      const t = nowIso();
      await db.artifacts.add({
        id: newId(), createdAt: t, updatedAt: t, projectId: project.id, kind: 'diagram',
        title: result.title || `Future-state flow · ${project.name}`, content: result.mermaid,
        version: (latest?.version ?? 0) + 1, status: 'draft', approvals: [], generatedBy: { model: result.model, at: t },
      });
      setFlow(result.mermaid);
      setEdited(null);
      setLast(result);
      const cut = scoped.functionalities.length > MAX_BASELINE ? ` Only the first ${MAX_BASELINE} of ${scoped.functionalities.length} functionalities were used as the baseline.` : '';
      const tokens = result.tokens?.prompt != null ? ` ${result.tokens.prompt} input and ${result.tokens.output ?? 0} output tokens.` : '';
      setNotice(`Generated with ${result.model} (${result.mode === 'delta' ? 'changes to the documented flow' : 'full diagram'}).${tokens}${cut}`);
    } catch (err) {
      if (!(isGeminiError(err) && err.code === 'ABORTED')) setError(describeError(err));
    } finally {
      setBusy(false);
      abort.current = null;
    }
  };

  const displayed = flow || latest?.content || '';
  const baseModel = useMemo(() => (displayed ? modelFromMermaid(displayed, latest?.title ?? project.name) : null), [displayed, latest?.title, project.name]);
  useEffect(() => { setEdited(null); }, [displayed]);
  const shown = edited ?? baseModel;
  const shownMermaid = edited ? modelToMermaid(edited) : displayed;

  const saveEdit = async () => {
    if (!edited) return;
    const t = nowIso();
    const content = modelToMermaid(edited);
    await db.artifacts.add({
      id: newId(), createdAt: t, updatedAt: t, projectId: project.id, kind: 'diagram',
      title: latest?.title ?? `Future-state flow · ${project.name}`, content,
      version: (latest?.version ?? 0) + 1, status: 'draft', approvals: [], generatedBy: { model: 'edited with Gemini', at: t },
    });
    setFlow(content);
    setEdited(null);
  };

  return (
    <div className="space-y-6">
      <Section title="Future-state process flow" description="Gemini starts from the documented current flows and describes only what the requirements change, which keeps the request small and the result easy to review.">
        {freshness && (
          <p className="mb-4 flex items-start gap-2 rounded border border-outline-variant bg-surface-low p-3 text-body-md">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
            Application or requirement data changed after this flow was generated. Regenerate it before using it for analysis or design.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {busy ? (
            <button type="button" className="btn btn-secondary" onClick={() => abort.current?.abort()}><Loader2 size={15} className="animate-spin" aria-hidden />Generating. Click to cancel</button>
          ) : (
            <button type="button" className="btn btn-primary" disabled={!apiKey || !usable.length} onClick={() => void generate()}><Sparkles size={16} aria-hidden />Generate / update with Gemini</button>
          )}
          {!apiKey && <span className="text-body-md text-on-surface-variant">Configure Gemini in Settings first.</span>}
          {!usable.length && <span className="text-body-md text-on-surface-variant">Add requirements before generating a future-state flow.</span>}
        </div>
        {notice && <p role="status" className="mt-4 rounded border border-outline-variant bg-surface-low p-3 text-body-md">{notice}</p>}
        {last?.notes.map((n) => <p key={n} className="mt-2 text-label-md text-on-surface-variant">{n}</p>)}
        {error && <p role="alert" className="mt-4 rounded border border-error bg-error-container p-3 text-body-md text-error">{error}</p>}
      </Section>

      {displayed && (
        <Section title={latest?.title ?? 'Generated flow'} description={latest?.generatedBy?.model ? `Generated by ${latest.generatedBy.model} · ${new Date(latest.createdAt).toLocaleString()}` : 'Generated flow'}>
          {shown && <div className="mb-4"><FlowActions model={shown} edited={edited !== null} onChange={setEdited} onReset={() => setEdited(null)} onSave={saveEdit} saveLabel="Save as new version" /></div>}
          <MermaidDiagram source={shownMermaid} />
          {last && (last.changeSummary || last.assumptions.length > 0) && (
            <div className="mt-4 space-y-2 text-body-md">
              {last.changeSummary && <p>{last.changeSummary}</p>}
              {last.assumptions.length > 0 && <ul className="list-disc pl-5 text-on-surface-variant">{last.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>}
            </div>
          )}
          <details className="mt-4 rounded border border-outline-variant">
            <summary className="cursor-pointer px-4 py-2 text-body-md font-medium">Mermaid source</summary>
            <pre className="overflow-x-auto border-t border-outline-variant p-4 font-mono text-code">{shownMermaid}</pre>
          </details>
        </Section>
      )}
    </div>
  );
}
