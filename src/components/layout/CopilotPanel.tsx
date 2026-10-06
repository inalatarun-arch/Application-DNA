import { useMemo, useState } from 'react';
import { Bot, ChevronRight, Loader2, Send, X } from 'lucide-react';
import { db } from '@/db/db';
import { generateText, describeError } from '@/services/geminiService';

const CHIPS=['Show all integrations connected to Supplier Creation','Which functionalities touch the AP_SUPPLIERS table?','Generate a regression test checklist for Module X'];

async function repositoryContext(query:string){
 const [apps,mods,screens,funcs,components,projects,requirements,tests,defects]=await Promise.all([db.applications.toArray(),db.modules.toArray(),db.screens.toArray(),db.functionalities.toArray(),db.technicalComponents.toArray(),db.projects.toArray(),db.requirements.toArray(),db.testCases.toArray(),db.defects.toArray()]);
 const q=query.toLowerCase();
 const score=(text:string)=>q.split(/\s+/).filter(Boolean).reduce((n,t)=>n+(text.toLowerCase().includes(t)?1:0),0);
 const groups=[
  ...apps.map(x=>({kind:'application',id:x.id,name:x.name,text:JSON.stringify(x)})),
  ...mods.map(x=>({kind:'module',id:x.id,name:x.name,text:JSON.stringify(x)})),
  ...screens.map(x=>({kind:'screen',id:x.id,name:x.name,text:JSON.stringify(x)})),
  ...funcs.map(x=>({kind:'functionality',id:x.id,name:x.name,text:JSON.stringify(x)})),
  ...components.map(x=>({kind:'technical component',id:x.id,name:x.name,text:JSON.stringify(x)})),
  ...projects.map(x=>({kind:'project',id:x.id,name:x.name,text:JSON.stringify(x)})),
  ...requirements.map(x=>({kind:'requirement',id:x.id,name:x.title,text:JSON.stringify(x)})),
  ...tests.map(x=>({kind:'test case',id:x.id,name:x.scenario,text:JSON.stringify(x)})),
  ...defects.map(x=>({kind:'defect',id:x.id,name:x.title,text:JSON.stringify(x)})),
 ];
 return groups.map(x=>({...x,score:score(x.text)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,40).map(x=>`[${x.kind}] ${x.name}\n${x.text}`).join('\n\n');
}

export default function CopilotPanel({open,onClose}:{open:boolean;onClose:()=>void}){
 const [query,setQuery]=useState(''); const [answer,setAnswer]=useState(''); const [loading,setLoading]=useState(false);
 const ask=async(q=query)=>{if(!q.trim())return;setQuery(q);setLoading(true);setAnswer('');try{const context=await repositoryContext(q);const result=await generateText(`Answer the user's question using only the repository context below. If the answer is not supported, say that it is not documented. Be concise and cite entity names exactly as supplied.\n\nUSER QUESTION:\n${q}\n\nREPOSITORY CONTEXT:\n${context||'No matching repository records found.'}`,{feature:'copilot',maxOutputTokens:2500});setAnswer(result.text);}catch(e){setAnswer(describeError(e));}finally{setLoading(false);}};
 if(!open)return null;
 return <aside className="fixed inset-y-0 right-0 z-[60] flex w-full max-w-[460px] flex-col border-l border-outline-variant bg-surface shadow-2xl"><header className="flex items-center gap-3 border-b border-outline-variant px-4 py-3"><span className="flex h-8 w-8 items-center justify-center rounded bg-primary text-on-primary"><Bot size={17}/></span><div className="min-w-0 flex-1"><p className="font-semibold">Enterprise Copilot</p><p className="text-label-md text-on-surface-variant">Grounded in your repository</p></div><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18}/></button></header><div className="flex-1 overflow-y-auto p-4"><p className="mb-3 text-label-md text-on-surface-variant">Quick prompts</p><div className="flex flex-wrap gap-1.5">{CHIPS.map(c=><button key={c} className="rounded border border-outline-variant px-2 py-1 text-left text-label-md hover:bg-surface-container" onClick={()=>void ask(c)}>{c}</button>)}</div>{loading&&<div className="mt-6 flex items-center gap-2 text-body-md text-on-surface-variant"><Loader2 size={16} className="animate-spin"/>Searching repository and asking Gemini…</div>}{answer&&<div className="mt-6 whitespace-pre-wrap rounded border border-outline-variant bg-surface-low p-3 text-body-md">{answer}</div>}</div><form className="border-t border-outline-variant p-3" onSubmit={e=>{e.preventDefault();void ask()}}><div className="flex gap-2"><input className="input flex-1" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Ask about your application knowledge…"/><button className="btn btn-primary" disabled={loading||!query.trim()}><Send size={16}/></button></div></form></aside>;
}