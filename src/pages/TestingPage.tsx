import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bug, CheckCircle2, ClipboardList, Filter, Loader2, Plus, Sparkles, X } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import { db, newId, nowIso } from '@/db/db';
import { describeError, isGeminiError } from '@/services/geminiService';
import { analyzeDefect, generateTestCases } from '@/services/testAI';
import { useApiKey } from '@/hooks/useApiKey';
import type { Defect, Requirement, TechnicalComponent, TestCase, TestLevel, TestStatus } from '@/db/types';
import { cn } from '@/lib/cn';

type Tab = 'tests' | 'rtm' | 'defects';

const LEVELS: TestLevel[] = ['unit','sit','regression','uat'];
const STATUS_LABEL: Record<TestStatus,string> = {'not-run':'Not Run',passed:'Pass',failed:'Fail',blocked:'Blocked'};

export default function TestingPage() {
  const [tab,setTab] = useState<Tab>('tests');
  const requirements = useLiveQuery(() => db.requirements.toArray(), []);
  const projects = useLiveQuery(() => db.projects.toArray(), []);
  const tests = useLiveQuery(() => db.testCases.toArray(), []);
  const defects = useLiveQuery(() => db.defects.toArray(), []);
  const components = useLiveQuery(() => db.technicalComponents.toArray(), []);
  const [selectedRequirement,setSelectedRequirement] = useState('');
  const [level,setLevel] = useState<TestLevel>('sit');
  const apiKey = useApiKey();
  const [generating,setGenerating] = useState(false);
  const [message,setMessage] = useState('');
  const [rtmFilter,setRtmFilter] = useState<'all'|'unmapped'|'failing'>('all');
  const [defectDraft,setDefectDraft] = useState<Partial<Defect>|null>(null);

  const reqs = requirements ?? [];
  const rows = useMemo(() => {
    const stories = reqs.filter(r => r.kind === 'user-story');
    const componentMap = new Map((components ?? []).map(c=>[c.id,c]));
    const testMap = new Map((tests ?? []).map(t=>[t.id,t]));
    return reqs.filter(r=>r.kind !== 'user-story').map(r=>{
      const storyIds = r.kind === 'user-story' ? [r.id] : stories.filter(s=>s.parentId===r.id || r.parentId===s.id).map(s=>s.id);
      const linkedComponents = (r.functionalityIds ?? []).flatMap(fid => (components ?? []).filter(c=>c.functionalityIds?.includes(fid)));
      const linkedTests = (tests ?? []).filter(t=>t.requirementIds?.includes(r.id));
      const linkedDefects = (defects ?? []).filter(d=>d.requirementId===r.id || (d.testCaseId && linkedTests.some(t=>t.id===d.testCaseId)));
      return {r, stories: stories.filter(s=>storyIds.includes(s.id)), linkedComponents:[...new Map(linkedComponents.map(c=>[c.id,c])).values()], linkedTests, linkedDefects, componentMap, testMap};
    });
  },[reqs,components,tests,defects]);

  const passing = rows.filter(x=>x.linkedTests.some(t=>t.status==='passed')).length;
  const coverage = rows.length ? Math.round((passing/rows.length)*100) : 0;
  const filteredRows = rows.filter(x => rtmFilter==='all' || (rtmFilter==='unmapped' ? x.linkedTests.length===0 : x.linkedTests.some(t=>t.status==='failed')));

  const generateCases = async () => {
    const req = reqs.find(r=>r.id===selectedRequirement);
    if (!req) return;
    setGenerating(true); setMessage('');
    try {
      const story = req.kind==='user-story' ? undefined : reqs.find(s=>s.id===req.parentId && s.kind==='user-story');
      const result = await generateTestCases(req, story, level, (tests ?? []).filter(t=>t.requirementIds?.includes(req.id) && t.level===level));
      const projectId = req.projectId;
      for (const item of result.cases) {
        await db.testCases.add({id:newId(),createdAt:nowIso(),updatedAt:nowIso(),projectId,requirementIds:[req.id],level,scenario:item.scenario,steps:item.steps,expectedResult:item.expectedResult,status:'not-run',priority:item.priority,caseType:item.caseType,coversCriteria:item.coversCriteria});
      }
      setMessage(result.cases.length ? `${result.cases.length} ${level.toUpperCase()} test cases saved.${result.tokens?.prompt!=null?` ${result.tokens.prompt} input and ${result.tokens.output ?? 0} output tokens.`:''}` : 'No new test cases. The model returned only scenarios you already have, or none that were usable.');
    } catch(e) { if(!(isGeminiError(e)&&e.code==='ABORTED')) setMessage(describeError(e)); } finally { setGenerating(false); }
  };

  const updateTest = async (test:TestCase, patch:Partial<TestCase>) => db.testCases.update(test.id,{...patch,updatedAt:nowIso()});
  const createDefect = async (d:Partial<Defect>) => {
    if (!d.title?.trim() || !d.description?.trim() || !d.projectId) return;
    await db.defects.add({id:newId(),createdAt:nowIso(),updatedAt:nowIso(),projectId:d.projectId,title:d.title,description:d.description,severity:d.severity ?? 'medium',priority:d.priority ?? 'medium',status:'open',assignedTo:d.assignedTo,requirementId:d.requirementId,testCaseId:d.testCaseId,technicalComponentIds:d.technicalComponentIds ?? [],screenshots:d.screenshots ?? []});
    setDefectDraft(null);
  };

  return <div className="space-y-6">
    <PageHeader title="Testing & Quality" description="Generate tests, trace requirements through delivery, and manage defects with AI-assisted analysis." />
    <div className="flex flex-wrap gap-1 border-b border-outline-variant">
      {([['tests','Test cases',ClipboardList],['rtm','RTM',CheckCircle2],['defects','Defects',Bug]] as const).map(([id,label,Icon])=><button key={id} type="button" onClick={()=>setTab(id)} className={cn('flex items-center gap-2 border-b-2 px-3 py-2 text-body-md',tab===id?'border-primary font-semibold':'border-transparent text-on-surface-variant') }><Icon size={16}/>{label}</button>)}
    </div>

    {tab==='tests' && <section className="space-y-6">
      <div className="card">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><h2 className="text-headline-md">AI Test Case Generator</h2><p className="mt-1 text-body-md text-on-surface-variant">Generate Unit, SIT, Regression or UAT cases from an approved requirement and its acceptance criteria.</p></div>
          <div className="flex flex-wrap gap-2">
            <select className="input w-48" value={selectedRequirement} onChange={e=>setSelectedRequirement(e.target.value)}><option value="">Select requirement…</option>{reqs.map(r=><option key={r.id} value={r.id}>{r.title}</option>)}</select>
            <select className="input w-36" value={level} onChange={e=>setLevel(e.target.value as TestLevel)}>{LEVELS.map(x=><option key={x} value={x}>{x.toUpperCase()}</option>)}</select>
            <button className="btn btn-primary" type="button" disabled={!selectedRequirement||generating||!apiKey} onClick={()=>void generateCases()}>{generating?<Loader2 size={16} className="animate-spin"/>:<Sparkles size={16}/>} Generate</button>
          </div>
        </div>
        {message && <p className="mt-4 rounded border border-outline-variant bg-surface-low p-3 text-body-md">{message}</p>}
      </div>
      <div className="card overflow-hidden p-0">
        <div className="border-b border-outline-variant px-4 py-3"><h2 className="text-body-lg font-semibold">Test suite</h2></div>
        {(tests ?? []).length===0 ? <EmptyState icon={ClipboardList} title="No test cases yet" description="Select a requirement above and generate your first suite."/> :
        <div className="overflow-x-auto"><table className="w-full text-left text-body-md"><thead><tr className="border-b border-outline-variant text-label-md text-on-surface-variant"><th className="px-4 py-3">Scenario</th><th>Suite</th><th>Priority</th><th>Status</th><th className="px-4 py-3">Expected / Actual</th></tr></thead><tbody>{(tests ?? []).map(t=><tr key={t.id} className="border-b border-outline-variant align-top"><td className="px-4 py-3"><div className="font-medium">{t.scenario}</div><ol className="mt-2 list-decimal space-y-1 pl-5 text-label-md text-on-surface-variant">{t.steps.map((s,i)=><li key={i}>{s}</li>)}</ol></td><td><StatusBadge status={t.level} label={t.level.toUpperCase()}/>{t.caseType&&<div className="mt-1 text-label-md text-on-surface-variant">{t.caseType}</div>}</td><td><StatusBadge status={t.priority} label={t.priority}/></td><td><select className="input w-28" value={t.status} onChange={e=>void updateTest(t,{status:e.target.value as TestStatus})}>{Object.entries(STATUS_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></td><td className="max-w-md px-4 py-3"><div>{t.expectedResult}</div><textarea className="input mt-2 min-h-16 text-label-md" value={t.actualResult ?? ''} placeholder="Actual result…" onChange={e=>void updateTest(t,{actualResult:e.target.value})}/></td></tr>)}</tbody></table></div>}
      </div>
    </section>}

    {tab==='rtm' && <section className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3"><div className="card"><p className="text-label-md text-on-surface-variant">Test coverage</p><p className="mt-1 text-3xl font-semibold">{coverage}%</p><p className="text-label-md text-on-surface-variant">{passing} of {rows.length} requirements have a passing test</p></div><div className="card"><p className="text-label-md text-on-surface-variant">Requirements</p><p className="mt-1 text-3xl font-semibold">{rows.length}</p></div><div className="card"><p className="text-label-md text-on-surface-variant">Failing tests</p><p className="mt-1 text-3xl font-semibold">{rows.filter(x=>x.linkedTests.some(t=>t.status==='failed')).length}</p></div></div>
      <div className="card overflow-hidden p-0"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant px-4 py-3"><div><h2 className="text-body-lg font-semibold">Requirements Traceability Matrix</h2><p className="text-label-md text-on-surface-variant">Requirement → User Story → Technical Component → Test Case → Defect</p></div><div className="flex gap-1">{([['all','All'],['unmapped','Unmapped'],['failing','Failing tests']] as const).map(([v,l])=><button key={v} className={cn('btn btn-secondary',rtmFilter===v&&'border-primary')} onClick={()=>setRtmFilter(v)}><Filter size={14}/>{l}</button>)}</div></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-label-md"><thead><tr className="border-b border-outline-variant"><th className="px-4 py-3">Requirement</th><th>User Story</th><th>Technical Component</th><th>Test Case</th><th>Defect</th><th>Coverage</th></tr></thead><tbody>{filteredRows.map(x=><tr key={x.r.id} className="border-b border-outline-variant align-top"><td className="px-4 py-3"><div className="font-medium">{x.r.title}</div><span className="text-on-surface-variant">{x.r.kind}</span></td><td>{x.stories.length?x.stories.map(s=><div key={s.id}>{s.title}</div>):<span className="text-on-surface-variant">Unmapped</span>}</td><td>{x.linkedComponents.length?x.linkedComponents.map(c=><div key={c.id}>{c.name}</div>):<span className="text-on-surface-variant">Unmapped</span>}</td><td>{x.linkedTests.length?x.linkedTests.map(t=><div key={t.id}><span className="font-medium">{t.scenario}</span> · {STATUS_LABEL[t.status]}</div>):<span className="text-on-surface-variant">Unmapped</span>}</td><td>{x.linkedDefects.length?x.linkedDefects.map(d=><div key={d.id}>{d.title} · {d.severity}</div>):<span className="text-on-surface-variant">None</span>}</td><td><span className={cn('font-semibold',x.linkedTests.some(t=>t.status==='passed')?'text-on-surface':'text-on-surface-variant')}>{x.linkedTests.some(t=>t.status==='passed')?'Covered':'Not covered'}</span></td></tr>)}</tbody></table></div>
      </div>
    </section>}

    {tab==='defects' && <section className="space-y-6">
      <div className="flex justify-end"><button className="btn btn-primary" onClick={()=>setDefectDraft({projectId:projects?.[0]?.id})}><Plus size={16}/> Log defect</button></div>
      {defectDraft && <DefectForm draft={defectDraft} requirements={reqs} tests={tests ?? []} components={components ?? []} projects={projects ?? []} onCancel={()=>setDefectDraft(null)} onSave={d=>void createDefect(d)}/>}
      <div className="card overflow-hidden p-0">{(defects ?? []).length===0?<EmptyState icon={Bug} title="No defects logged" description="Log a defect and link it to its failing test and technical components."/>:<div className="divide-y divide-outline-variant">{(defects ?? []).map(d=><DefectRow key={d.id} defect={d} tests={tests ?? []} components={components ?? []}/>)}</div>}</div>
    </section>}
  </div>;
}

function DefectForm({draft,requirements,tests,components,projects,onCancel,onSave}:{draft:Partial<Defect>;requirements:Requirement[];tests:TestCase[];components:TechnicalComponent[];projects:{id:string;name:string}[];onCancel:()=>void;onSave:(d:Partial<Defect>)=>void}) {
  const [d,setD]=useState(draft); const [file,setFile]=useState<File|null>(null);
  const set=(p:Partial<Defect>)=>setD(x=>({...x,...p}));
  const addFile=async(f:File|null)=>{setFile(f); if(f){const reader=new FileReader(); reader.onload=()=>set({screenshots:[{kind:'screenshot',name:f.name,dataUrl:String(reader.result)}]}); reader.readAsDataURL(f);}};
  return <div className="card"><div className="flex items-center justify-between"><h2 className="text-headline-md">Log defect</h2><button className="icon-btn" onClick={onCancel}><X size={16}/></button></div><div className="mt-4 grid gap-4 md:grid-cols-2"><div><label className="field-label">Project</label><select className="input" value={d.projectId ?? ''} onChange={e=>set({projectId:e.target.value})}>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div><div><label className="field-label">Title</label><input className="input" value={d.title ?? ''} onChange={e=>set({title:e.target.value})}/></div><div className="md:col-span-2"><label className="field-label">Description</label><textarea className="input min-h-24" value={d.description ?? ''} onChange={e=>set({description:e.target.value})}/></div><div><label className="field-label">Severity</label><select className="input" value={d.severity ?? 'medium'} onChange={e=>set({severity:e.target.value as Defect['severity']})}>{['low','medium','high','critical'].map(v=><option key={v}>{v}</option>)}</select></div><div><label className="field-label">Priority</label><select className="input" value={d.priority ?? 'medium'} onChange={e=>set({priority:e.target.value as Defect['priority']})}>{['low','medium','high'].map(v=><option key={v}>{v}</option>)}</select></div><div><label className="field-label">Requirement</label><select className="input" value={d.requirementId ?? ''} onChange={e=>set({requirementId:e.target.value||undefined})}><option value="">Not linked</option>{requirements.map(r=><option key={r.id} value={r.id}>{r.title}</option>)}</select></div><div><label className="field-label">Test case</label><select className="input" value={d.testCaseId ?? ''} onChange={e=>set({testCaseId:e.target.value||undefined})}><option value="">Not linked</option>{tests.map(t=><option key={t.id} value={t.id}>{t.scenario}</option>)}</select></div><div className="md:col-span-2"><label className="field-label">Technical components</label><select multiple className="input min-h-28" value={d.technicalComponentIds ?? []} onChange={e=>set({technicalComponentIds:Array.from(e.target.selectedOptions).map(o=>o.value)})}>{components.map(c=><option key={c.id} value={c.id}>{c.name} · {c.kind}</option>)}</select></div><div className="md:col-span-2"><label className="field-label">Screenshot</label><input type="file" accept="image/*" onChange={e=>void addFile(e.target.files?.[0] ?? null)}/>{file&&<p className="field-hint">{file.name}</p>}</div></div><div className="mt-4 flex gap-2"><button className="btn btn-primary" onClick={()=>onSave(d)}>Save defect</button><button className="btn btn-secondary" onClick={onCancel}>Cancel</button></div></div>;
}

function DefectRow({defect,tests,components}:{defect:Defect;tests:TestCase[];components:TechnicalComponent[]}) {
 const apiKey=useApiKey();
 const [analysis,setAnalysis]=useState(defect.aiAnalysis ?? ''); const [loading,setLoading]=useState(false);
 const run=async()=>{setLoading(true);try{const linked=components.filter(c=>(defect.technicalComponentIds ?? []).includes(c.id));const tc=tests.find(t=>t.id===defect.testCaseId);const text=await analyzeDefect(defect,tc,linked);setAnalysis(text);await db.defects.update(defect.id,{aiAnalysis:text,updatedAt:nowIso()});}catch(e){setAnalysis(describeError(e));}finally{setLoading(false);}};
 return <article className="p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{defect.title}</h3><p className="mt-1 text-body-md text-on-surface-variant">{defect.description}</p><div className="mt-2 flex flex-wrap gap-1.5"><StatusBadge status={defect.severity} label={defect.severity}/><StatusBadge status={defect.priority} label={defect.priority}/><StatusBadge status={defect.status} label={defect.status}/>{(defect.screenshots ?? []).length>0&&<span className="text-label-md text-on-surface-variant">Screenshot attached</span>}</div></div><button className="btn btn-secondary" onClick={()=>void run()} disabled={loading||!apiKey}>{loading?<Loader2 size={16} className="animate-spin"/>:<Sparkles size={16}/>} AI Root Cause Advisor</button></div>{analysis&&<pre className="mt-4 whitespace-pre-wrap rounded border border-outline-variant bg-surface-low p-3 text-label-md">{analysis}</pre>}</article>;
}