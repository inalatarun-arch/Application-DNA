import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { RefreshCw, CheckCircle2, XCircle, FileText, Table2 } from 'lucide-react';
import { db, newId, nowIso } from '@/db/db';
import { createDocument, saveDocumentVersion, submitDocument, decideDocument, generateRequirementStories, buildRtm, ensureDefaultTemplates } from '@/db/delivery';
import type { DeliveryDocument, DeliveryApproval, Requirement, DeliveryStory, RequirementTrace } from '@/db/types';
import { generateText } from '@/services/geminiService';
import PageHeader from '@/components/ui/PageHeader';

function download(name:string,text:string,mime='text/markdown'){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:mime}));a.download=name;a.click();URL.revokeObjectURL(a.href);}
function esc(v:string){return v.replace(/\|/g,'\\|').replace(/\n/g,' ');}
function buildPrompt(project:any,reqs:Requirement[],stories:any[],type:'frd'|'tdd',template:string){
  const reqText=reqs.map(r=>`[${r.id}] ${r.title}: ${r.description}\nAcceptance: ${r.acceptanceCriteria.join('; ')}`).join('\n');
  const storyText=stories.map(s=>`[${s.id}] ${s.title}: As a ${s.asA}, I want ${s.iWant}, so that ${s.soThat}. AC: ${s.acceptanceCriteria.join('; ')}`).join('\n');
  const process=project.futureProcess||project.currentProcess;
  return `PROJECT: ${project.name}\nDESCRIPTION: ${project.description||'not documented'}\nSCOPE: ${project.notes||'not documented'}\nREQUIREMENTS:\n${reqText||'not documented'}\nSTORIES:\n${storyText||'not documented'}\nAPPLICATIONS: ${(project.applicationIds||[]).join(', ')||'not documented'}\nPROCESS:\n${process||'not documented'}\n\nTEMPLATE HEADINGS:\n${template}\n\nGROUNDING: Use only supplied facts. If absent write "not documented". Existing application/database/API/component names must not be invented. Label any proposed design "(Proposed)".\n\nWrite the complete ${type.toUpperCase()} in Markdown, preserving every template heading. For FRD include functional requirements, NFRs, assumptions, risks, process Mermaid, security, reporting and approval sign-off. For TDD include architecture, components, data, APIs, integrations, errors, deployment, security and performance. Include trace IDs back to requirements/stories where applicable.`;
}
export default function StudioPage(){
  const [projectId,setProjectId]=useState('');
  const [type,setType]=useState<'frd'|'tdd'>('frd');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[reviewer,setReviewer]=useState(''),[comment,setComment]=useState('');
  const [draft,setDraft]=useState('');
  const projects=useLiveQuery(()=>db.projects.orderBy('name').toArray(),[],[]);
  const docs=useLiveQuery(()=>projectId?db.deliveryDocuments.where('projectId').equals(projectId).toArray():Promise.resolve([] as DeliveryDocument[]),[projectId],[]);
  const approvals=useLiveQuery(()=>{const d=docs.find(x=>x.type===type);return d?db.deliveryApprovals.where('documentId').equals(d.id).sortBy('createdAt'):Promise.resolve([] as DeliveryApproval[])},[docs,type],[]);
  const versions=useLiveQuery(()=>{const d=docs.find(x=>x.type===type);return d?db.deliveryDocumentVersions.where('documentId').equals(d.id).sortBy('version').then(v=>v.reverse()):Promise.resolve([])},[docs,type],[]);
  const reqs=useLiveQuery(()=>projectId?db.requirements.where('projectId').equals(projectId).toArray():Promise.resolve([] as Requirement[]),[projectId],[]);
  const stories=useLiveQuery(()=>projectId?db.deliveryStories.where('projectId').equals(projectId).toArray():Promise.resolve([] as DeliveryStory[]),[projectId],[] as import('@/db/types').DeliveryStory[]);
  const rtm=useLiveQuery(()=>projectId?buildRtm(projectId):Promise.resolve([] as RequirementTrace[]),[projectId],[] as import('@/db/types').RequirementTrace[]);
  const project=projects?.find(p=>p.id===projectId); const doc=docs?.find(d=>d.type===type);
  const content=doc?.content ?? draft;
  const headings=useMemo(()=>content.split('\n').filter(x=>/^#{1,2} /.test(x)).join('\n'),[content]);
  const generate=async()=>{
    if(!project) return; setBusy(true);setError('');
    try{
      await ensureDefaultTemplates(); let d=doc;
      if(!d) d=await createDocument(project.id,type,`${project.name} - ${type.toUpperCase()}`);
      const template=await db.organizationTemplates.where('type').equals(type).first();
      const generated=await generateText(buildPrompt(project,reqs,stories,type,template?.markdownHeadings??''),{feature:type,temperature:.2,maxOutputTokens:30000});
      await db.transaction('rw',[db.deliveryDocuments,db.deliveryDocumentVersions],async()=>{
        if(d!.content) await db.deliveryDocumentVersions.add({id:newId(),documentId:d!.id,version:d!.version,content:d!.content,note:'Before regeneration',createdAt:nowIso()});
        await db.deliveryDocuments.update(d!.id,{content:generated.text,version:d!.version+1,updatedAt:nowIso(),status:'draft',generatedAt:nowIso()});
      });
      setDraft(generated.text);
    }catch(e){setError(e instanceof Error?e.message:'Generation failed.')}finally{setBusy(false)}
  };
  const save=async()=>{if(!doc)return;await saveDocumentVersion(doc.id,draft||content,'Manual save');};
  const storiesGenerate=async()=>{if(projectId) await generateRequirementStories(projectId)};
  const submit=async()=>{if(doc)await submitDocument(doc.id)};
  const decide=async(decision:'approved'|'rejected')=>{if(!doc)return;await decideDocument(doc.id,'business-owner',reviewer,decision,comment)};
  const exportRtm=()=>download(`${project?.name||'project'}-rtm.md`,`# Requirements Traceability Matrix\n\n| Requirement | Story | Design Component | Document | Test Cases |\n|---|---|---|---|---|\n${rtm.map(x=>`|${esc(x.requirementId)}|${esc(x.storyId||'not documented')}|${esc(x.designComponentId||'not documented')}|${esc(x.documentId||'not documented')}|${x.testCaseIds.length}|`).join('\n')}`);
  if(!projects)return <p>Loading…</p>;
  return <div>
    <PageHeader title="FRD / TDD Studio" description="Generate, edit, version, approve and export grounded delivery documents."/>
    <div className="card mb-4 flex flex-wrap gap-3 items-end">
      <label className="text-sm">Project<select className="input mt-1 block min-w-64" value={projectId} onChange={e=>setProjectId(e.target.value)}><option value="">Select project…</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label className="text-sm">Document<select className="input mt-1 block" value={type} onChange={e=>setType(e.target.value as 'frd'|'tdd')}><option value="frd">FRD</option><option value="tdd">TDD</option></select></label>
      <button className="btn btn-secondary" disabled={!projectId||busy} onClick={()=>void storiesGenerate()}>Generate stories</button>
      <button className="btn btn-primary" disabled={!projectId||busy} onClick={()=>void generate()}>{busy?<RefreshCw className="animate-spin" size={15}/>:<FileText size={15}/>} Generate</button>
      <button className="btn btn-secondary" disabled={!doc||!draft} onClick={()=>void save()}>Save version</button>
      <button className="btn btn-secondary" disabled={!doc} onClick={()=>download(`${project?.name}-${type}.md`,draft||content)}>Download Markdown</button>
      <button className="btn btn-secondary" disabled={!projectId} onClick={exportRtm}><Table2 size={15}/> RTM</button>
    </div>
    {error&&<div className="mb-4 border border-red-300 p-3 text-sm text-red-700">{error}</div>}
    {!project?<div className="card">Select a project to begin.</div>:<div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <section className="card"><textarea className="min-h-[680px] w-full border-0 bg-transparent font-mono text-sm outline-none" value={draft||content} onChange={e=>setDraft(e.target.value)} placeholder={`Generate a ${type.toUpperCase()} or write Markdown here…`}/></section>
      <aside className="space-y-4">
        <section className="card"><h2 className="font-semibold">Approval</h2><p className="mt-2 text-sm">Status: {doc?.status??'draft'}</p>{doc?.status==='draft'&&<button className="btn btn-primary mt-3 w-full" onClick={()=>void submit()}>Submit for approval</button>}{doc?.status==='in-review'&&<><input className="input mt-3 w-full" placeholder="Reviewer name" value={reviewer} onChange={e=>setReviewer(e.target.value)}/><textarea className="input mt-2 w-full" placeholder="Comment" value={comment} onChange={e=>setComment(e.target.value)}/><div className="mt-2 flex gap-2"><button className="btn btn-primary" onClick={()=>void decide('approved')}><CheckCircle2 size={14}/> Approve</button><button className="btn btn-secondary" onClick={()=>void decide('rejected')}><XCircle size={14}/> Reject</button></div></>}{approvals.map(a=><p key={a.id} className="mt-2 border-t pt-2 text-xs">{a.role}: {a.decision} — {a.approverName||'system'}<br/>{a.comment}</p>)}</section>
        <section className="card"><h2 className="font-semibold">Version history</h2>{versions.map(v=><div key={v.id} className="mt-2 border-t pt-2 text-xs">v{v.version} · {v.note}</div>)}</section>
        <section className="card"><h2 className="font-semibold">Template headings</h2><pre className="mt-2 whitespace-pre-wrap text-xs">{headings||'No document generated.'}</pre></section>
        <section className="card"><h2 className="font-semibold">RTM</h2><p className="mt-1 text-sm">{rtm.length} trace record(s)</p><p className="text-xs text-on-surface-variant">Stories: {stories.length} · Requirements: {reqs.length}</p></section>
      </aside>
    </div>}
  </div>;
}
