import { useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bug, CheckCircle2, ClipboardList, Loader2, Plus, Sparkles, X } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import StatStrip from '@/components/ui/StatStrip';
import Tabs from '@/components/ui/Tabs';
import TabPanel from '@/components/ui/TabPanel';
import { db, newId, nowIso } from '@/db/db';
import { describeError, isGeminiError } from '@/services/geminiService';
import { analyzeDefect, generateTestCases } from '@/services/testAI';
import { useApiKey } from '@/hooks/useApiKey';
import type { Defect, Requirement, TechnicalComponent, TestCase, TestLevel, TestStatus } from '@/db/types';
import { cn } from '@/lib/cn';
import { useReveal } from '@/lib/motion';

type Tab = 'tests' | 'rtm' | 'defects';
type RtmFilter = 'all' | 'unmapped' | 'failing';

const LEVELS: TestLevel[] = ['unit', 'sit', 'regression', 'uat'];
const STATUS_LABEL: Record<TestStatus, string> = { 'not-run': 'Not run', passed: 'Pass', failed: 'Fail', blocked: 'Blocked' };
const RTM_FILTERS: Array<[RtmFilter, string]> = [['all', 'All'], ['unmapped', 'Unmapped'], ['failing', 'Failing tests']];
const TH = 'px-4 py-3 text-left text-label-md font-medium text-on-surface-variant';
const TD = 'px-4 py-3 align-top';

export default function TestingPage() {
  const [tab, setTab] = useState<Tab>('tests');
  const requirements = useLiveQuery(() => db.requirements.toArray(), []);
  const projects = useLiveQuery(() => db.projects.toArray(), []);
  const tests = useLiveQuery(() => db.testCases.toArray(), []);
  const defects = useLiveQuery(() => db.defects.toArray(), []);
  const components = useLiveQuery(() => db.technicalComponents.toArray(), []);
  const [selectedRequirement, setSelectedRequirement] = useState('');
  const [level, setLevel] = useState<TestLevel>('sit');
  const apiKey = useApiKey();
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState('');
  const [rtmFilter, setRtmFilter] = useState<RtmFilter>('all');
  const [defectDraft, setDefectDraft] = useState<Partial<Defect> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const reqs = useMemo(() => requirements ?? [], [requirements]);
  const allTests = useMemo(() => tests ?? [], [tests]);
  const loaded = requirements !== undefined && tests !== undefined && defects !== undefined;
  useReveal(panelRef, '[data-row]', { deps: [tab, loaded, rtmFilter], y: 8, stagger: 0.03 });

  const rows = useMemo(() => {
    const stories = reqs.filter((r) => r.kind === 'user-story');
    return reqs
      .filter((r) => r.kind !== 'user-story')
      .map((r) => {
        const storyIds = stories.filter((s) => s.parentId === r.id || r.parentId === s.id).map((s) => s.id);
        const linkedComponents = (r.functionalityIds ?? []).flatMap((fid) => (components ?? []).filter((c) => c.functionalityIds?.includes(fid)));
        const linkedTests = allTests.filter((t) => t.requirementIds?.includes(r.id));
        const linkedDefects = (defects ?? []).filter((d) => d.requirementId === r.id || (d.testCaseId && linkedTests.some((t) => t.id === d.testCaseId)));
        return { r, stories: stories.filter((s) => storyIds.includes(s.id)), linkedComponents: [...new Map(linkedComponents.map((c) => [c.id, c])).values()], linkedTests, linkedDefects };
      });
  }, [reqs, components, allTests, defects]);

  const covered = rows.filter((x) => x.linkedTests.some((t) => t.status === 'passed')).length;
  const coverage = rows.length ? Math.round((covered / rows.length) * 100) : 0;
  const failingReqs = rows.filter((x) => x.linkedTests.some((t) => t.status === 'failed')).length;
  const filteredRows = rows.filter((x) => rtmFilter === 'all' || (rtmFilter === 'unmapped' ? x.linkedTests.length === 0 : x.linkedTests.some((t) => t.status === 'failed')));
  const count = (s: TestStatus) => allTests.filter((t) => t.status === s).length;
  const openDefects = (defects ?? []).filter((d) => d.status === 'open' || d.status === 'in-progress').length;

  const generateCases = async () => {
    const req = reqs.find((r) => r.id === selectedRequirement);
    if (!req) return;
    setGenerating(true);
    setMessage('');
    try {
      const story = req.kind === 'user-story' ? undefined : reqs.find((s) => s.id === req.parentId && s.kind === 'user-story');
      const result = await generateTestCases(req, story, level, allTests.filter((t) => t.requirementIds?.includes(req.id) && t.level === level));
      for (const item of result.cases) {
        await db.testCases.add({ id: newId(), createdAt: nowIso(), updatedAt: nowIso(), projectId: req.projectId, requirementIds: [req.id], level, scenario: item.scenario, steps: item.steps, expectedResult: item.expectedResult, status: 'not-run', priority: item.priority, caseType: item.caseType, coversCriteria: item.coversCriteria });
      }
      setMessage(
        result.cases.length
          ? `${result.cases.length} ${level.toUpperCase()} test cases saved.${result.tokens?.prompt != null ? ` ${result.tokens.prompt} input and ${result.tokens.output ?? 0} output tokens.` : ''}`
          : 'No new test cases. The model returned only scenarios you already have, or none that were usable.',
      );
    } catch (e) {
      if (!(isGeminiError(e) && e.code === 'ABORTED')) setMessage(describeError(e));
    } finally {
      setGenerating(false);
    }
  };

  const updateTest = async (test: TestCase, patch: Partial<TestCase>) => db.testCases.update(test.id, { ...patch, updatedAt: nowIso() });

  const createDefect = async (d: Partial<Defect>) => {
    if (!d.title?.trim() || !d.description?.trim() || !d.projectId) return;
    await db.defects.add({ id: newId(), createdAt: nowIso(), updatedAt: nowIso(), projectId: d.projectId, title: d.title, description: d.description, severity: d.severity ?? 'medium', priority: d.priority ?? 'medium', status: 'open', assignedTo: d.assignedTo, requirementId: d.requirementId, testCaseId: d.testCaseId, technicalComponentIds: d.technicalComponentIds ?? [], screenshots: d.screenshots ?? [] });
    setDefectDraft(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Testing & Quality" description="Generate tests, trace requirements through delivery, and manage defects with AI-assisted analysis." />

      <Tabs<Tab>
        label="Testing views"
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'tests', label: 'Test cases', icon: ClipboardList, count: tests?.length },
          { id: 'rtm', label: 'RTM', icon: CheckCircle2 },
          { id: 'defects', label: 'Defects', icon: Bug, count: defects?.length },
        ]}
      />

      <TabPanel id={tab}>
        <div ref={panelRef} className="space-y-6">
          {tab === 'tests' && (
            <>
              <StatStrip
                label="Test results"
                stats={[
                  { label: 'Test cases', value: loaded ? allTests.length : undefined },
                  { label: 'Passed', value: loaded ? count('passed') : undefined, tone: count('passed') > 0 ? 'good' : 'default' },
                  { label: 'Failed', value: loaded ? count('failed') : undefined, tone: count('failed') > 0 ? 'bad' : 'default' },
                  { label: 'Not run', value: loaded ? count('not-run') + count('blocked') : undefined },
                ]}
              />

              <section className="card" aria-label="AI test case generator">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-headline-md">AI test case generator</h2>
                    <p className="mt-1 text-body-md text-on-surface-variant">Generate Unit, SIT, Regression or UAT cases from a requirement and its acceptance criteria.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <select className="input w-56" aria-label="Requirement" value={selectedRequirement} onChange={(e) => setSelectedRequirement(e.target.value)}>
                      <option value="">Select requirement…</option>
                      {reqs.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
                    </select>
                    <select className="input w-32" aria-label="Test level" value={level} onChange={(e) => setLevel(e.target.value as TestLevel)}>
                      {LEVELS.map((x) => <option key={x} value={x}>{x.toUpperCase()}</option>)}
                    </select>
                    <button className="btn btn-primary" type="button" disabled={!selectedRequirement || generating || !apiKey} onClick={() => void generateCases()}>
                      {generating ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Sparkles size={16} aria-hidden />} Generate
                    </button>
                  </div>
                </div>
                {!apiKey && <p className="mt-3 text-label-md font-normal text-on-surface-variant">Add an AI key in Settings to generate test cases.</p>}
                {message && <p role="status" className="mt-4 rounded border border-outline-variant bg-surface-low p-3 text-body-md">{message}</p>}
              </section>

              <section className="card overflow-hidden p-0" aria-label="Test suite">
                <div className="border-b border-outline-variant px-4 py-3"><h2 className="text-body-lg font-semibold">Test suite</h2></div>
                {allTests.length === 0 ? (
                  <EmptyState icon={ClipboardList} title="No test cases yet" description="Select a requirement above and generate your first suite." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] text-left text-body-md">
                      <thead>
                        <tr className="border-b border-outline-variant bg-surface-low">
                          <th scope="col" className={TH}>Scenario</th>
                          <th scope="col" className={TH}>Suite</th>
                          <th scope="col" className={TH}>Priority</th>
                          <th scope="col" className={TH}>Status</th>
                          <th scope="col" className={TH}>Expected / actual</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant">
                        {allTests.map((t) => (
                          <tr key={t.id} data-row>
                            <td className={TD}>
                              <div className="font-medium">{t.scenario}</div>
                              <ol className="mt-2 list-decimal space-y-1 pl-5 text-label-md font-normal text-on-surface-variant">{t.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
                            </td>
                            <td className={TD}>
                              <StatusBadge status={t.level} label={t.level.toUpperCase()} />
                              {t.caseType && <div className="mt-1 text-label-md font-normal text-on-surface-variant">{t.caseType}</div>}
                            </td>
                            <td className={TD}><StatusBadge status={t.priority} label={t.priority} /></td>
                            <td className={TD}>
                              <div><StatusBadge status={t.status} label={STATUS_LABEL[t.status]} /></div>
                              <select className="input mt-2 w-28 py-1" aria-label={`Status of ${t.scenario}`} value={t.status} onChange={(e) => void updateTest(t, { status: e.target.value as TestStatus })}>
                                {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                              </select>
                            </td>
                            <td className={cn(TD, 'max-w-md')}>
                              <div>{t.expectedResult}</div>
                              <textarea className="input mt-2 min-h-16 text-label-md" aria-label={`Actual result for ${t.scenario}`} value={t.actualResult ?? ''} placeholder="Actual result…" onChange={(e) => void updateTest(t, { actualResult: e.target.value })} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}

          {tab === 'rtm' && (
            <>
              <StatStrip
                label="Traceability summary"
                stats={[
                  { label: 'Requirements with a passing test', value: loaded ? coverage : undefined, suffix: '%', tone: coverage === 100 && rows.length > 0 ? 'good' : 'default' },
                  { label: 'Requirements', value: loaded ? rows.length : undefined },
                  { label: 'With failing tests', value: loaded ? failingReqs : undefined, tone: failingReqs > 0 ? 'bad' : 'default' },
                ]}
              />
              <section className="card overflow-hidden p-0" aria-label="Requirements traceability matrix">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant px-4 py-3">
                  <div>
                    <h2 className="text-body-lg font-semibold">Requirements traceability matrix</h2>
                    <p className="text-label-md font-normal text-on-surface-variant">Requirement → user story → technical component → test case → defect</p>
                  </div>
                  <div role="group" aria-label="Filter requirements" className="flex gap-1">
                    {RTM_FILTERS.map(([v, l]) => (
                      <button key={v} type="button" aria-pressed={rtmFilter === v} className={cn('btn btn-sm', rtmFilter === v ? 'border-primary bg-primary-container text-on-surface' : 'btn-secondary')} onClick={() => setRtmFilter(v)}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                {filteredRows.length === 0 ? (
                  <EmptyState icon={CheckCircle2} title={rows.length === 0 ? 'No requirements to trace yet' : 'Nothing matches this filter'} description={rows.length === 0 ? 'Add requirements to a project and they appear here with their tests and defects.' : 'Try another filter.'} />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1050px] text-left text-label-md">
                      <thead>
                        <tr className="border-b border-outline-variant bg-surface-low">
                          {['Requirement', 'User story', 'Technical component', 'Test case', 'Defect', 'Coverage'].map((h) => <th key={h} scope="col" className={TH}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant">
                        {filteredRows.map((x) => {
                          const isCovered = x.linkedTests.some((t) => t.status === 'passed');
                          const none = <span className="text-on-surface-variant">Unmapped</span>;
                          return (
                            <tr key={x.r.id} data-row>
                              <td className={TD}>
                                <div className="text-body-md font-medium">{x.r.title}</div>
                                <span className="font-normal text-on-surface-variant">{x.r.kind}</span>
                              </td>
                              <td className={TD}>{x.stories.length ? x.stories.map((s) => <div key={s.id}>{s.title}</div>) : none}</td>
                              <td className={TD}>{x.linkedComponents.length ? x.linkedComponents.map((c) => <div key={c.id}>{c.name}</div>) : none}</td>
                              <td className={TD}>
                                {x.linkedTests.length ? (
                                  <ul className="space-y-1.5">
                                    {x.linkedTests.map((t) => (
                                      <li key={t.id} className="flex flex-wrap items-center gap-1.5">
                                        <span className="font-medium">{t.scenario}</span>
                                        <StatusBadge status={t.status} label={STATUS_LABEL[t.status]} />
                                      </li>
                                    ))}
                                  </ul>
                                ) : none}
                              </td>
                              <td className={TD}>
                                {x.linkedDefects.length ? (
                                  <ul className="space-y-1.5">
                                    {x.linkedDefects.map((d) => (
                                      <li key={d.id} className="flex flex-wrap items-center gap-1.5">
                                        <span>{d.title}</span>
                                        <StatusBadge status={d.severity} label={d.severity} />
                                      </li>
                                    ))}
                                  </ul>
                                ) : <span className="text-on-surface-variant">None</span>}
                              </td>
                              <td className={TD}><StatusBadge status={isCovered ? 'passed' : 'not-run'} label={isCovered ? 'Covered' : 'Not covered'} /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}

          {tab === 'defects' && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-body-md text-on-surface-variant">{loaded ? `${openDefects} open of ${(defects ?? []).length} logged` : 'Loading defects…'}</p>
                <button type="button" className="btn btn-primary" onClick={() => setDefectDraft({ projectId: projects?.[0]?.id })}>
                  <Plus size={16} aria-hidden /> Log defect
                </button>
              </div>
              {defectDraft && <DefectForm draft={defectDraft} requirements={reqs} tests={allTests} components={components ?? []} projects={projects ?? []} onCancel={() => setDefectDraft(null)} onSave={(d) => void createDefect(d)} />}
              <section className="card overflow-hidden p-0" aria-label="Defects">
                {(defects ?? []).length === 0 ? (
                  <EmptyState icon={Bug} title="No defects logged" description="Log a defect and link it to its failing test and technical components." />
                ) : (
                  <div className="divide-y divide-outline-variant">
                    {(defects ?? []).map((d) => <div key={d.id} data-row><DefectRow defect={d} tests={allTests} components={components ?? []} /></div>)}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </TabPanel>
    </div>
  );
}

interface DefectFormProps {
  draft: Partial<Defect>;
  requirements: Requirement[];
  tests: TestCase[];
  components: TechnicalComponent[];
  projects: { id: string; name: string }[];
  onCancel: () => void;
  onSave: (d: Partial<Defect>) => void;
}

function DefectForm({ draft, requirements, tests, components, projects, onCancel, onSave }: DefectFormProps) {
  const [d, setD] = useState(draft);
  const [file, setFile] = useState<File | null>(null);
  const set = (p: Partial<Defect>) => setD((x) => ({ ...x, ...p }));
  const addFile = (f: File | null) => {
    setFile(f);
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => set({ screenshots: [{ kind: 'screenshot', name: f.name, dataUrl: String(reader.result) }] });
    reader.readAsDataURL(f);
  };
  return (
    <section className="card" aria-label="Log defect">
      <div className="flex items-center justify-between">
        <h2 className="text-headline-md">Log defect</h2>
        <button type="button" className="icon-btn" onClick={onCancel} aria-label="Cancel"><X size={16} aria-hidden /></button>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div><label htmlFor="d-project" className="field-label">Project</label><select id="d-project" className="input" value={d.projectId ?? ''} onChange={(e) => set({ projectId: e.target.value })}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <div><label htmlFor="d-title" className="field-label">Title</label><input id="d-title" className="input" value={d.title ?? ''} onChange={(e) => set({ title: e.target.value })} /></div>
        <div className="md:col-span-2"><label htmlFor="d-desc" className="field-label">Description</label><textarea id="d-desc" className="input min-h-24" value={d.description ?? ''} onChange={(e) => set({ description: e.target.value })} /></div>
        <div><label htmlFor="d-sev" className="field-label">Severity</label><select id="d-sev" className="input" value={d.severity ?? 'medium'} onChange={(e) => set({ severity: e.target.value as Defect['severity'] })}>{['low', 'medium', 'high', 'critical'].map((v) => <option key={v}>{v}</option>)}</select></div>
        <div><label htmlFor="d-pri" className="field-label">Priority</label><select id="d-pri" className="input" value={d.priority ?? 'medium'} onChange={(e) => set({ priority: e.target.value as Defect['priority'] })}>{['low', 'medium', 'high'].map((v) => <option key={v}>{v}</option>)}</select></div>
        <div><label htmlFor="d-req" className="field-label">Requirement</label><select id="d-req" className="input" value={d.requirementId ?? ''} onChange={(e) => set({ requirementId: e.target.value || undefined })}><option value="">Not linked</option>{requirements.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}</select></div>
        <div><label htmlFor="d-test" className="field-label">Test case</label><select id="d-test" className="input" value={d.testCaseId ?? ''} onChange={(e) => set({ testCaseId: e.target.value || undefined })}><option value="">Not linked</option>{tests.map((t) => <option key={t.id} value={t.id}>{t.scenario}</option>)}</select></div>
        <div className="md:col-span-2"><label htmlFor="d-comp" className="field-label">Technical components</label><select id="d-comp" multiple className="input min-h-28" value={d.technicalComponentIds ?? []} onChange={(e) => set({ technicalComponentIds: Array.from(e.target.selectedOptions).map((o) => o.value) })}>{components.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.kind}</option>)}</select></div>
        <div className="md:col-span-2"><label htmlFor="d-shot" className="field-label">Screenshot</label><input id="d-shot" type="file" accept="image/*" onChange={(e) => addFile(e.target.files?.[0] ?? null)} />{file && <p className="field-hint">{file.name}</p>}</div>
      </div>
      <div className="mt-4 flex gap-2">
        <button type="button" className="btn btn-primary" onClick={() => onSave(d)}>Save defect</button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}

function DefectRow({ defect, tests, components }: { defect: Defect; tests: TestCase[]; components: TechnicalComponent[] }) {
  const apiKey = useApiKey();
  const [analysis, setAnalysis] = useState(defect.aiAnalysis ?? '');
  const [loading, setLoading] = useState(false);
  const run = async () => {
    setLoading(true);
    try {
      const linked = components.filter((c) => (defect.technicalComponentIds ?? []).includes(c.id));
      const tc = tests.find((t) => t.id === defect.testCaseId);
      const text = await analyzeDefect(defect, tc, linked);
      setAnalysis(text);
      await db.defects.update(defect.id, { aiAnalysis: text, updatedAt: nowIso() });
    } catch (e) {
      setAnalysis(describeError(e));
    } finally {
      setLoading(false);
    }
  };
  return (
    <article className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">{defect.title}</h3>
          <p className="mt-1 text-body-md text-on-surface-variant">{defect.description}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={defect.severity} label={`${defect.severity} severity`} />
            <StatusBadge status={defect.priority} label={`${defect.priority} priority`} />
            <StatusBadge status={defect.status} label={defect.status} />
            {(defect.screenshots ?? []).length > 0 && <span className="text-label-md font-normal text-on-surface-variant">Screenshot attached</span>}
          </div>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => void run()} disabled={loading || !apiKey}>
          {loading ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Sparkles size={16} aria-hidden />} AI root cause advisor
        </button>
      </div>
      {analysis && <pre className="mt-4 whitespace-pre-wrap rounded border border-outline-variant bg-surface-low p-3 text-label-md">{analysis}</pre>}
    </article>
  );
}
