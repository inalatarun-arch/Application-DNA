import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Download, Loader2, Sparkles, Square } from 'lucide-react';
import { db, newId, nowIso } from '@/db/db';
import { useAiSettings } from '@/db/settings';
import { KIND_META, LAYERS } from '@/config/technical';
import type { Project } from '@/db/types';
import { useApiKey } from '@/hooks/useApiKey';
import { useGraphSource } from '@/hooks/useGraphSource';
import Section from '@/components/ui/Section';
import StatusBadge from '@/components/ui/StatusBadge';
import { fileBase, impactToMarkdown, saveText } from '@/lib/exporters';
import { computeGaps, computeScope, groupByLayer } from '@/lib/projectScope';
import { describeError, isGeminiError } from '@/services/geminiService';
import { assessImpact, impactDigest, type ImpactAssessment } from '@/services/impactAI';
import { DIGEST_LABEL, type DigestLevel } from '@/lib/repoDigest';
import { usePersistentState } from '@/hooks/usePersistentState';
import PageSkeleton from '@/components/ui/Skeleton';

const MAX_LISTED = 40;

function parseAssessment(content: string): ImpactAssessment | null {
  try {
    const v = JSON.parse(content) as Partial<ImpactAssessment>;
    return {
      summary: typeof v.summary === 'string' ? v.summary : '',
      functional: Array.isArray(v.functional) ? v.functional.map((x) => ({ ...x, impactedPart: typeof x.impactedPart === 'string' ? x.impactedPart : '', currentState: typeof x.currentState === 'string' ? x.currentState : '', proposedChange: typeof x.proposedChange === 'string' ? x.proposedChange : '', rationale: typeof x.rationale === 'string' ? x.rationale : '', propagation: typeof (x as { propagation?: unknown }).propagation === 'string' ? (x as { propagation: string }).propagation : '' })) : [],
      technical: Array.isArray(v.technical) ? v.technical.map((x) => ({ ...x, impactedPart: typeof x.impactedPart === 'string' ? x.impactedPart : '', currentState: typeof x.currentState === 'string' ? x.currentState : '', proposedChange: typeof x.proposedChange === 'string' ? x.proposedChange : '', rationale: typeof x.rationale === 'string' ? x.rationale : '', propagation: typeof (x as { propagation?: unknown }).propagation === 'string' ? (x as { propagation: string }).propagation : '' })) : [],
      risks: Array.isArray(v.risks) ? v.risks : [],
      gaps: Array.isArray(v.gaps) ? v.gaps : [],
    };
  } catch {
    return null;
  }
}

export default function ImpactTab({ project }: { project: Project }) {
  const source = useGraphSource();
  const apiKey = useApiKey();
  const [ai] = useAiSettings();
  const requirements = useLiveQuery(() => db.requirements.where('projectId').equals(project.id).toArray(), [project.id]);
  const meetings = useLiveQuery(() => db.meetings.where('projectId').equals(project.id).toArray(), [project.id]);
  const candidates = useLiveQuery(() => db.candidates.where('projectId').equals(project.id).toArray(), [project.id]);
  const artifacts = useLiveQuery(() => db.artifacts.where('projectId').equals(project.id).filter((a) => a.kind === 'impact-assessment').toArray(), [project.id]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [runInfo, setRunInfo] = useState('');
  const [level, setLevel] = usePersistentState<DigestLevel>('eih.impact.level', 'standard');
  const abort = useRef<AbortController | null>(null);

  const scope = useMemo(() => (source && requirements ? computeScope(project, source, requirements) : null), [source, requirements, project]);
  const gaps = useMemo(() => (scope && requirements && meetings && candidates ? computeGaps(scope, requirements, meetings, candidates) : []), [scope, requirements, meetings, candidates]);

  const latest = [...(artifacts ?? [])].sort((a, b) => b.version - a.version)[0];
  const assessment = latest ? parseAssessment(latest.content) : null;
  const model = ai.featureModels.impact ?? ai.defaultModel;

  const reqCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of requirements ?? []) for (const id of r.functionalityIds ?? []) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  }, [requirements]);
  const screenName = useMemo(() => new Map((source?.screens ?? []).map((s) => [s.id, s.name])), [source]);
  const appName = useMemo(() => new Map((source?.applications ?? []).map((a) => [a.id, a.name])), [source]);

  const preview = useMemo(() => (source && scope && requirements ? impactDigest(requirements, scope, source, project, level) : null), [source, scope, requirements, project, level]);

  const generate = async () => {
    if (!source || !scope || !requirements) return;
    setBusy(true);
    setError('');
    setRunInfo('');
    const controller = new AbortController();
    abort.current = controller;
    try {
      const run = await assessImpact(project, requirements, scope, source, level, controller.signal);
      const result = run.assessment;
      const used = run.model;
      setRunInfo(`${run.tokens?.prompt != null ? `${run.tokens.prompt} input and ${run.tokens.output ?? 0} output tokens. ` : ''}Sent ${run.digest.shown.functionalities} of ${run.digest.total.functionalities} functionalities, ${run.digest.shown.screens} of ${run.digest.total.screens} screens and ${run.digest.shown.components} of ${run.digest.total.components} components.${run.truncated ? ' The reply was cut off, so only complete items were kept. Try Lean detail or fewer requirements.' : ''}`);
      const t = nowIso();
      const version = (latest?.version ?? 0) + 1;
      await db.artifacts.add({
        id: newId(),
        createdAt: t,
        updatedAt: t,
        projectId: project.id,
        kind: 'impact-assessment',
        title: `Impact assessment v${version}`,
        content: JSON.stringify(result),
        version,
        status: 'draft',
        approvals: [],
        generatedBy: { model: used, at: t },
      });
    } catch (err) {
      if (!(isGeminiError(err) && err.code === 'ABORTED')) setError(describeError(err));
    } finally {
      setBusy(false);
      abort.current = null;
    }
  };

  if (!scope) return <PageSkeleton />;

  const componentGroups = groupByLayer([
    ...scope.directComponents.map((component) => ({ component, via: [] as string[] })),
    ...scope.dependencyComponents,
  ]);
  const noScope = (project.applicationIds ?? []).length === 0;

  return (
    <div className="space-y-6">
      {noScope && (
        <p role="status" className="rounded border border-outline-variant bg-surface-low p-3 text-body-md">
          This project is not linked to any application yet. Link applications and modules in the Overview tab to see what it touches.
        </p>
      )}

      <section aria-label="Scope totals" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ['Screens in scope', scope.screens.length],
          ['Functionalities in scope', scope.functionalities.length],
          ['Technical components', scope.directComponents.length + scope.dependencyComponents.length],
          ['Requirements in backlog', requirements?.length ?? 0],
        ].map(([label, value]) => (
          <div key={label as string} className="card p-4">
            <p className="text-label-md text-on-surface-variant">{label}</p>
            <p className="mt-1 text-headline-lg">{value}</p>
          </div>
        ))}
      </section>

      <Section title="Gap analysis" description="Checks run on your documentation and backlog. No AI is involved.">
        {gaps.length === 0 ? (
          <p className="text-body-md">No gaps found. The backlog is reviewed, mapped and documented.</p>
        ) : (
          <ul className="divide-y divide-outline-variant rounded border border-outline-variant">
            {gaps.map((g) => (
              <li key={g.title} className="flex items-start gap-3 px-3 py-2">
                <span className="mt-0.5 shrink-0"><StatusBadge status={g.severity} label={g.severity === 'high' ? 'High' : g.severity === 'medium' ? 'Medium' : 'Low'} /></span>
                <span className="min-w-0">
                  <span className="block text-body-md font-medium">{g.title}</span>
                  <span className="block text-body-md text-on-surface-variant">{g.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Impacted functionality" description="Functionalities in the linked scope, and how many backlog requirements point at each.">
        {scope.functionalities.length === 0 ? (
          <p className="text-body-md text-on-surface-variant">No documented functionality in the linked scope.</p>
        ) : (
          <div className="overflow-x-auto rounded border border-outline-variant">
            <table className="w-full min-w-[560px] text-left text-body-md">
              <thead className="border-b border-outline-variant bg-surface-low text-label-md text-on-surface-variant">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Functionality</th>
                  <th scope="col" className="px-3 py-2 font-medium">Screen</th>
                  <th scope="col" className="px-3 py-2 font-medium">Requirements</th>
                  <th scope="col" className="px-3 py-2 font-medium">Components</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {[...scope.functionalities]
                  .sort((a, b) => (reqCount.get(b.id) ?? 0) - (reqCount.get(a.id) ?? 0) || a.name.localeCompare(b.name))
                  .slice(0, MAX_LISTED)
                  .map((f) => (
                    <tr key={f.id} className={(reqCount.get(f.id) ?? 0) > 0 ? 'bg-surface-low' : undefined}>
                      <td className="px-3 py-2 font-medium">
                        <Link to={`/applications/${f.applicationId}/screens/${f.screenId ?? ''}?tab=functionalities&open=${f.id}`} className="hover:underline">{f.name}</Link>
                      </td>
                      <td className="px-3 py-2 text-on-surface-variant">{f.screenId ? screenName.get(f.screenId) : '-'}</td>
                      <td className="px-3 py-2 tabular-nums">{reqCount.get(f.id) ?? 0}</td>
                      <td className="px-3 py-2 tabular-nums">{scope.directComponents.filter((c) => (c.functionalityIds ?? []).includes(f.id)).length}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
        {scope.functionalities.length > MAX_LISTED && <p className="text-label-md font-normal text-on-surface-variant">Showing the {MAX_LISTED} most affected of {scope.functionalities.length}.</p>}
        {scope.outsideFunctionalities.length > 0 && (
          <div>
            <p className="mb-1 text-body-md font-semibold">Outside the linked scope</p>
            <p className="mb-2 text-body-md text-on-surface-variant">Requirements point at these functionalities, but they are not in the modules linked to this project. Consider adding them to the scope.</p>
            <ul className="flex flex-wrap gap-2">
              {scope.outsideFunctionalities.map((f) => (
                <li key={f.id} className="rounded border border-outline-variant px-2 py-0.5 text-label-md">{f.name} <span className="font-normal text-on-surface-variant">· {appName.get(f.applicationId)}</span></li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section title="Technical impact" description="Components tagged on the functionality in scope, and what those rely on.">
        {componentGroups.length === 0 ? (
          <p className="text-body-md text-on-surface-variant">No technical components are linked to the functionality in scope yet.</p>
        ) : (
          componentGroups.map((g) => {
            const layer = LAYERS.find((l) => l.id === g.layer);
            return (
              <div key={g.layer}>
                <h4 className="mb-1 flex items-center gap-2 text-body-md font-semibold">
                  {layer && <layer.icon size={16} aria-hidden />}
                  {layer?.label}
                  <span className="font-normal text-on-surface-variant">{g.items.length}</span>
                </h4>
                <ul className="divide-y divide-outline-variant rounded border border-outline-variant">
                  {g.items.slice(0, MAX_LISTED).map(({ component, via }) => (
                    <li key={component.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <span className="min-w-0">
                        <Link to={`/applications/${component.applicationId}/technical/${component.id}`} className="font-medium hover:underline">{component.name}</Link>
                        <span className="ml-2 text-label-md font-normal text-on-surface-variant">{KIND_META[component.kind].label}</span>
                      </span>
                      <span className="text-label-md font-normal text-on-surface-variant">{via.length ? `via ${via.join(' › ')}` : 'Direct'}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </Section>

      <Section title="AI impact assessment" description="Gemini reads the requirements and the documented scope and writes a functional and technical assessment with risks and gaps.">
        <div className="flex flex-wrap items-center gap-3 rounded border border-outline-variant bg-surface-low p-4">
          {!apiKey ? (
            <p className="text-body-md">Add your Gemini API key to generate an assessment. <Link to="/settings" className="font-semibold underline">Open settings</Link></p>
          ) : busy ? (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => abort.current?.abort()}>
                <Square size={14} aria-hidden />
                Cancel
              </button>
              <span className="inline-flex items-center gap-2 text-body-md text-on-surface-variant" aria-live="polite">
                <Loader2 size={14} className="animate-spin" aria-hidden />
                Assessing with {model}…
              </span>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-primary" onClick={() => void generate()} disabled={(requirements ?? []).length === 0}>
                <Sparkles size={16} aria-hidden />
                {latest ? 'Generate a new version' : 'Generate assessment'}
              </button>
              <span className="text-body-md text-on-surface-variant">
                {(requirements ?? []).length === 0 ? 'Add requirements to the backlog first.' : `Uses ${model}. Project details and the documented scope are sent to Google's Gemini API.`}
              </span>
            </>
          )}
        </div>
        {apiKey && !busy && (
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="impact-level" className="field-label">Detail sent to Gemini</label>
              <select id="impact-level" className="input w-auto" value={level} onChange={(e) => setLevel(e.target.value as DigestLevel)}>
                {(Object.keys(DIGEST_LABEL) as DigestLevel[]).map((l) => <option key={l} value={l}>{DIGEST_LABEL[l]}</option>)}
              </select>
            </div>
            {preview && <p className="pb-2 text-body-md text-on-surface-variant">About {preview.tokens.toLocaleString()} input tokens. Most relevant items are sent first.</p>}
          </div>
        )}
        {runInfo && <p role="status" className="text-label-md text-on-surface-variant">{runInfo}</p>}
        {error && <p role="alert" className="rounded border border-error bg-error-container p-3 text-body-md text-error">{error}</p>}

        {latest && assessment && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-label-md font-normal text-on-surface-variant">
                Version {latest.version} · {latest.generatedBy?.model ?? 'Gemini'} · {new Date(latest.createdAt).toLocaleString()}
              </p>
              <button type="button" className="btn btn-secondary px-3 py-1.5" onClick={() => saveText(`${fileBase(project.name, 'impact-assessment')}.md`, impactToMarkdown(project, assessment))}>
                <Download size={14} aria-hidden />
                Download (.md)
              </button>
            </div>
            <p className="whitespace-pre-line text-body-lg">{assessment.summary}</p>
            {([['Functional impact', assessment.functional], ['Technical impact', assessment.technical]] as const).map(([title, rows]) => (
              <div key={title}>
                <h4 className="mb-1 text-body-md font-semibold">{title}</h4>
                {rows.length === 0 ? <p className="text-body-md text-on-surface-variant">None identified.</p> : (
                  <ul className="divide-y divide-outline-variant rounded border border-outline-variant">
                    {rows.map((r, i) => (
                      <li key={i} className="flex items-start gap-3 px-3 py-2">
                        <span className="mt-0.5 shrink-0"><StatusBadge status={r.severity} label={r.severity === 'high' ? 'High' : r.severity === 'low' ? 'Low' : 'Medium'} /></span>
                        <span className="min-w-0"><span className="block font-medium">{r.area}</span><span className="block text-body-md text-on-surface-variant">{r.description}</span>{r.impactedPart && <span className="mt-1 block text-body-md"><strong>Impacted part:</strong> {r.impactedPart}</span>}{r.currentState && <span className="block text-body-md text-on-surface-variant"><strong>Current:</strong> {r.currentState}</span>}{r.proposedChange && <span className="block text-body-md text-on-surface-variant"><strong>Change:</strong> {r.proposedChange}</span>}{r.rationale && <span className="block text-body-md text-on-surface-variant"><strong>Why:</strong> {r.rationale}</span>}{r.propagation && <span className="block text-body-md text-on-surface-variant"><strong>Knock-on:</strong> {r.propagation}</span>}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            <div>
              <h4 className="mb-1 text-body-md font-semibold">Risks</h4>
              {assessment.risks.length === 0 ? <p className="text-body-md text-on-surface-variant">None identified.</p> : (
                <ul className="divide-y divide-outline-variant rounded border border-outline-variant">
                  {assessment.risks.map((r, i) => (
                    <li key={i} className="flex items-start gap-3 px-3 py-2">
                      <span className="mt-0.5 shrink-0"><StatusBadge status={r.severity} label={r.severity === 'high' ? 'High' : r.severity === 'low' ? 'Low' : 'Medium'} /></span>
                      <span className="min-w-0"><span className="block font-medium">{r.risk}</span>{r.mitigation && <span className="block text-body-md text-on-surface-variant">Mitigation: {r.mitigation}</span>}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h4 className="mb-1 text-body-md font-semibold">Gaps and recommendations</h4>
              {assessment.gaps.length === 0 ? <p className="text-body-md text-on-surface-variant">None identified.</p> : (
                <ul className="divide-y divide-outline-variant rounded border border-outline-variant">
                  {assessment.gaps.map((g, i) => (
                    <li key={i} className="px-3 py-2"><span className="block font-medium">{g.gap}</span>{g.recommendation && <span className="block text-body-md text-on-surface-variant">{g.recommendation}</span>}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
        {latest && !assessment && <p className="text-body-md text-on-surface-variant">The saved assessment could not be read. Generate a new version.</p>}
      </Section>
    </div>
  );
}
