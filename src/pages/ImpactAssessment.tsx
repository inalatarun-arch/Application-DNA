import { useEffect, useMemo, useState } from 'react';
import { Sparkles, Plus, Trash2, Loader2, Copy, AlertTriangle, Database, ChevronDown, ChevronRight } from 'lucide-react';
import { db, nowIso, useLive } from '../db/deliveryDb';
import type { Requirement, RequirementStatus, RequirementType, ImpactRecord, ImpactReport } from '../db/deliveryDb';
import { generateJson, getModel } from '../lib/gemini';
import { IMPACT_SYSTEM, buildImpactPrompt } from '../lib/prompts';
import { gatherKnowledge, getKnowledgeDbName, listKnowledgeCandidates, setKnowledgeDbName } from '../lib/knowledge';
import type { GatherResult } from '../lib/knowledge';
import { normalizeImpact, impactToMarkdown } from '../lib/impact';
import { useVault } from '../components/useVault';
import { RiskBadge, StatusTag, Chip } from '../components/Badges';
import { btnPrimary, btnSecondary, btnGhost, card, cardTight, h2, h3, input, muted, td, th } from '../components/ui';

const TYPES: RequirementType[] = ['Functional', 'Non-Functional', 'Reporting', 'Integration', 'Change Request'];
const STATUSES: RequirementStatus[] = ['Draft', 'Approved', 'Rejected'];

interface Props {
  projectId: number | null;
}

function Refs({ ids, refs }: { ids: string[]; refs: ImpactRecord['contextRefs'] }) {
  if (!ids.length) return <span className="text-[#9CA3AF]">inferred</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {ids.map((id) => {
        const r = refs.find((x) => x.id === id);
        return (
          <span key={id} title={r ? `${r.source}: ${r.label}` : 'Unknown source'} className="rounded border border-[#D1D5DB] bg-[#F3F4F6] px-1 text-[11px] font-medium">
            {id}
          </span>
        );
      })}
    </span>
  );
}

function GapList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className={`${h3} mb-1`}>{title}</div>
      {items.length ? (
        <ul className="list-disc space-y-1 pl-5 text-[13px]">
          {items.map((i, idx) => (
            <li key={idx}>{i}</li>
          ))}
        </ul>
      ) : (
        <p className={muted}>None identified</p>
      )}
    </div>
  );
}

function ReportView({ report, refs }: { report: ImpactReport; refs: ImpactRecord['contextRefs'] }) {
  return (
    <div className="space-y-5">
      <div className={cardTight}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className={h3}>Overall risk</span>
          <RiskBadge value={report.overallRisk} />
          <Chip>Confidence: {report.confidence}</Chip>
        </div>
        <p className="text-[14px] leading-6">{report.summary}</p>
        {report.knowledgeCoverage && <p className={`${muted} mt-2`}>Knowledge coverage: {report.knowledgeCoverage}</p>}
      </div>

      <div className={cardTight}>
        <div className={`${h3} mb-2`}>Impacted functional screens</div>
        {report.functionalImpact.screens.length ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {['Screen', 'Application', 'Change', 'Impact', 'Source'].map((c) => (
                    <th key={c} className={th}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.functionalImpact.screens.map((s, i) => (
                  <tr key={i}>
                    <td className={`${td} font-medium`}>{s.name}</td>
                    <td className={td}>{s.application || '-'}</td>
                    <td className={td}><Chip>{s.changeType}</Chip></td>
                    <td className={td}>{s.impact}</td>
                    <td className={td}><Refs ids={s.sourceRefs} refs={refs} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={muted}>No screens identified.</p>
        )}
        <div className={`${h3} mb-2 mt-5`}>Impacted processes &amp; workflows</div>
        {report.functionalImpact.processes.length ? (
          <ul className="space-y-2 text-[13px]">
            {report.functionalImpact.processes.map((p, i) => (
              <li key={i}>
                <strong>{p.name}</strong> - {p.impact} <Refs ids={p.sourceRefs} refs={refs} />
              </li>
            ))}
          </ul>
        ) : (
          <p className={muted}>No processes identified.</p>
        )}
      </div>

      <div className={cardTight}>
        <div className={`${h3} mb-2`}>Impacted technical components</div>
        {report.technicalImpact.components.length ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {['Type', 'Component', 'Change', 'Impact', 'Source'].map((c) => (
                    <th key={c} className={th}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.technicalImpact.components.map((c, i) => (
                  <tr key={i}>
                    <td className={td}><Chip>{c.type}</Chip></td>
                    <td className={`${td} font-medium`}><code>{c.name}</code></td>
                    <td className={td}>{c.changeType}</td>
                    <td className={td}>{c.impact}</td>
                    <td className={td}><Refs ids={c.sourceRefs} refs={refs} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={muted}>No technical components identified.</p>
        )}
      </div>

      <div className={cardTight}>
        <div className={`${h3} mb-2`}>Upstream / downstream integration risks</div>
        {report.integrationRisks.length ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {['Direction', 'System', 'Risk', 'Severity', 'Mitigation', 'Source'].map((c) => (
                    <th key={c} className={th}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.integrationRisks.map((r, i) => (
                  <tr key={i}>
                    <td className={td}>{r.direction}</td>
                    <td className={`${td} font-medium`}>{r.system}</td>
                    <td className={td}>{r.risk}</td>
                    <td className={td}><RiskBadge value={r.severity} /></td>
                    <td className={td}>{r.mitigation}</td>
                    <td className={td}><Refs ids={r.sourceRefs} refs={refs} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={muted}>No integration risks identified.</p>
        )}
      </div>

      <div className={cardTight}>
        <div className={`${h3} mb-3`}>Gap analysis</div>
        <div className="grid gap-5 md:grid-cols-2">
          <GapList title="Missing approval steps" items={report.gapAnalysis.missingApprovalSteps} />
          <GapList title="Potential regression risks" items={report.gapAnalysis.regressionRisks} />
          <GapList title="Missing requirements" items={report.gapAnalysis.missingRequirements} />
          <GapList title="Missing test coverage" items={report.gapAnalysis.missingTestCoverage} />
          <GapList title="Unaddressed dependencies" items={report.gapAnalysis.unaddressedDependencies} />
          <GapList title="Overlapping projects" items={report.overlappingProjects} />
        </div>
      </div>

      <div className={cardTight}>
        <GapList title="Recommended actions" items={report.recommendedActions} />
      </div>
    </div>
  );
}

export function ImpactAssessment({ projectId }: Props) {
  const vault = useVault();
  const reqs = useLive(
    () => (projectId ? db.requirements.where('projectId').equals(projectId).sortBy('id') : Promise.resolve([] as Requirement[])),
    [projectId],
    [] as Requirement[],
  );
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = useMemo(() => reqs.find((r) => r.id === selectedId) ?? null, [reqs, selectedId]);

  const reports = useLive(
    () => (selectedId ? db.impactReports.where('requirementId').equals(selectedId).reverse().sortBy('createdAt') : Promise.resolve([] as ImpactRecord[])),
    [selectedId],
    [] as ImpactRecord[],
  );
  const [reportIdx, setReportIdx] = useState(0);
  const report = reports[reportIdx] ?? null;

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: '', text: '', type: 'Functional' as RequirementType });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [gather, setGather] = useState<GatherResult | null>(null);
  const [showCtx, setShowCtx] = useState(false);
  const [dbName, setDbName] = useState(getKnowledgeDbName());
  const [candidates, setCandidates] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void listKnowledgeCandidates().then(setCandidates);
  }, []);
  useEffect(() => {
    setSelectedId(null);
  }, [projectId]);
  useEffect(() => {
    setReportIdx(0);
    setGather(null);
    setError('');
  }, [selectedId]);

  if (!projectId) return <div className={card}><p className={muted}>Select or create a project above to start.</p></div>;

  const addRequirement = async () => {
    if (!form.title.trim() || !form.text.trim()) return;
    const id = await db.requirements.add({
      projectId,
      title: form.title.trim(),
      text: form.text.trim(),
      type: form.type,
      status: 'Draft',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    setForm({ title: '', text: '', type: 'Functional' });
    setAdding(false);
    setSelectedId(id);
  };

  const analyze = async () => {
    if (!selected?.id) return;
    setBusy(true);
    setError('');
    try {
      const project = await db.projects.get(projectId);
      if (!project) throw new Error('Project not found.');
      const g = await gatherKnowledge(`${selected.title}\n${selected.text}\n${project.applications}`, { dbName });
      setGather(g);
      const raw = await generateJson<unknown>({
        feature: 'impact',
        system: IMPACT_SYSTEM,
        prompt: buildImpactPrompt(project, selected, g.snippets),
        temperature: 0.2,
        maxOutputTokens: 12000,
      });
      const normalized = normalizeImpact(raw);
      await db.impactReports.add({
        projectId,
        requirementId: selected.id,
        model: getModel(),
        report: normalized,
        contextRefs: g.snippets.map((s) => ({ id: s.id, source: s.source, label: s.label })),
        createdAt: nowIso(),
      });
      setReportIdx(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impact analysis failed.');
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (status: RequirementStatus) => {
    if (selected?.id) await db.requirements.update(selected.id, { status, updatedAt: nowIso() });
  };

  const remove = async () => {
    if (!selected?.id || !window.confirm(`Delete "${selected.title}" and its impact reports?`)) return;
    await db.impactReports.where('requirementId').equals(selected.id).delete();
    await db.requirements.delete(selected.id);
    setSelectedId(null);
  };

  const copyMd = async () => {
    if (!selected || !report) return;
    await navigator.clipboard.writeText(impactToMarkdown(selected, report.report));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      {/* left: requirement list */}
      <div className="space-y-4">
        <div className={cardTight}>
          <div className="mb-2 flex items-center gap-2">
            <Database size={14} />
            <span className={h3}>Knowledge source</span>
          </div>
          {candidates.length > 0 ? (
            <select
              className={input}
              value={dbName}
              onChange={(e) => {
                setDbName(e.target.value);
                setKnowledgeDbName(e.target.value);
              }}
            >
              <option value="">Select your Knowledge Repository DB...</option>
              {candidates.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          ) : (
            <input
              className={input}
              placeholder="IndexedDB name of your Knowledge Repository"
              value={dbName}
              onChange={(e) => {
                setDbName(e.target.value);
                setKnowledgeDbName(e.target.value);
              }}
            />
          )}
          <p className={`${muted} mt-1`}>Rows from this database are sent to Gemini as grounding context. Tables named like settings/keys/logs are never read.</p>
        </div>

        <div className={cardTight}>
          <div className="mb-3 flex items-center justify-between">
            <span className={h3}>Requirements &amp; change requests ({reqs.length})</span>
            <button className={btnGhost} onClick={() => setAdding((a) => !a)}>
              <Plus size={14} /> Add
            </button>
          </div>
          {adding && (
            <div className="mb-4 space-y-2 border-b border-[#E5E7EB] pb-4">
              <input className={input} placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <select className={input} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as RequirementType })}>
                {TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <textarea className={input} rows={5} placeholder="Requirement text..." value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} />
              <button className={btnPrimary} disabled={!form.title.trim() || !form.text.trim()} onClick={() => void addRequirement()}>
                Save requirement
              </button>
            </div>
          )}
          {reqs.length === 0 && !adding && <p className={muted}>No requirements yet. Add one, paste from the AI transcript output, or use Import.</p>}
          <ul className="space-y-1">
            {reqs.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => setSelectedId(r.id as number)}
                  className={`w-full rounded border px-3 py-2 text-left ${r.id === selectedId ? 'border-2 border-[#111827] bg-white' : 'border-[#E5E7EB] bg-white hover:bg-[#F3F4F6]'}`}
                >
                  <div className="text-[13px] font-medium text-[#111827]">REQ-{r.id} · {r.title}</div>
                  <div className="mt-1 flex items-center gap-2">
                    <Chip>{r.type}</Chip>
                    <StatusTag value={r.status} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* right: detail + report */}
      <div className="space-y-4">
        {!selected ? (
          <div className={card}><p className={muted}>Select a requirement to analyze its impact.</p></div>
        ) : (
          <>
            <div className={card}>
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className={h2}>REQ-{selected.id} · {selected.title}</h2>
                  <div className="mt-1 flex items-center gap-2">
                    <Chip>{selected.type}</Chip>
                    <select className="rounded border border-[#D1D5DB] bg-white px-2 py-1 text-[12px]" value={selected.status} onChange={(e) => void setStatus(e.target.value as RequirementStatus)}>
                      {STATUSES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className={btnPrimary} disabled={busy || !vault.unlocked} onClick={() => void analyze()} title={vault.unlocked ? '' : 'Unlock your AI key first'}>
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Analyze Impact with Gemini
                  </button>
                  <button className={btnSecondary} onClick={() => void remove()} aria-label="Delete requirement">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <p className="whitespace-pre-wrap text-[14px] leading-6">{selected.text}</p>
              {!vault.unlocked && <p className={`${muted} mt-3`}>Unlock your Gemini key (banner above) to run the analysis.</p>}
            </div>

            {error && (
              <div role="alert" className="flex items-start gap-2 rounded border-2 border-[#111827] bg-white px-3 py-2 text-[13px]">
                <AlertTriangle size={16} className="mt-[1px]" /> <span>{error}</span>
              </div>
            )}

            {gather && (
              <div className={cardTight}>
                <button className="flex w-full items-center gap-2 text-left" onClick={() => setShowCtx((s) => !s)}>
                  {showCtx ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span className={h3}>Context sent to Gemini: {gather.snippets.length} repository snippet(s) from {gather.tablesScanned.length} table(s)</span>
                </button>
                {gather.warning && <p className="mt-2 text-[13px] font-medium">⚠ {gather.warning}</p>}
                {showCtx && (
                  <ul className="mt-3 space-y-2 text-[12px]">
                    {gather.snippets.map((s) => (
                      <li key={s.id} className="rounded border border-[#E5E7EB] bg-[#F9FAFB] p-2">
                        <strong>[{s.id}]</strong> {s.source} · {s.label}
                        <div className="mt-1 text-[#6B7280]">{s.text.slice(0, 260)}{s.text.length > 260 ? '...' : ''}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {busy && (
              <div className={`${cardTight} flex items-center gap-2 text-[13px]`}>
                <Loader2 size={14} className="animate-spin" /> Gathering repository context and asking Gemini... this can take up to a minute.
              </div>
            )}

            {report && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-[13px]">
                    <span className={muted}>Report</span>
                    <select className="rounded border border-[#D1D5DB] bg-white px-2 py-1 text-[12px]" value={reportIdx} onChange={(e) => setReportIdx(Number(e.target.value))}>
                      {reports.map((r, i) => (
                        <option key={r.id} value={i}>
                          {new Date(r.createdAt).toLocaleString()} · {r.model}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button className={btnSecondary} onClick={() => void copyMd()}>
                    <Copy size={14} /> {copied ? 'Copied' : 'Copy as Markdown'}
                  </button>
                </div>
                <ReportView report={report.report} refs={report.contextRefs} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
