import { useState } from 'react';
import { Bot, Loader2, Send, X } from 'lucide-react';
import { describeError, isGeminiError } from '@/services/geminiService';
import { askCopilot } from '@/services/copilotAI';
import { useApiKey } from '@/hooks/useApiKey';

const CHIPS=['Show all integrations connected to Supplier Creation','Which functionalities touch the AP_SUPPLIERS table?','Generate a regression test checklist for Module X'];

export default function CopilotPanel({open,onClose}:{open:boolean;onClose:()=>void}){
 const [query,setQuery]=useState(''); const [answer,setAnswer]=useState(''); const [loading,setLoading]=useState(false);
 const apiKey=useApiKey();
 const ask=async(q=query)=>{if(!q.trim()||!apiKey)return;setQuery(q);setLoading(true);setAnswer('');try{const r=await askCopilot(q);setAnswer(`${r.answer}\n\n(${r.sources} repository record${r.sources===1?'':'s'} used)`);}catch(e){if(!(isGeminiError(e)&&e.code==='ABORTED'))setAnswer(describeError(e));}finally{setLoading(false);}};
 if(!open)return null;
 return <aside className="fixed inset-y-0 right-0 z-[60] flex w-full max-w-[460px] flex-col border-l border-outline-variant bg-surface shadow-2xl"><header className="flex items-center gap-3 border-b border-outline-variant px-4 py-3"><span className="flex h-8 w-8 items-center justify-center rounded bg-primary text-on-primary"><Bot size={17}/></span><div className="min-w-0 flex-1"><p className="font-semibold">Enterprise Copilot</p><p className="text-label-md text-on-surface-variant">Grounded in your repository</p></div><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18}/></button></header><div className="flex-1 overflow-y-auto p-4"><p className="mb-3 text-label-md text-on-surface-variant">Quick prompts</p><div className="flex flex-wrap gap-1.5">{CHIPS.map(c=><button key={c} className="rounded border border-outline-variant px-2 py-1 text-left text-label-md hover:bg-surface-container" onClick={()=>void ask(c)}>{c}</button>)}</div>{loading&&<div className="mt-6 flex items-center gap-2 text-body-md text-on-surface-variant"><Loader2 size={16} className="animate-spin"/>Searching repository and asking Gemini…</div>}{answer&&<div className="mt-6 whitespace-pre-wrap rounded border border-outline-variant bg-surface-low p-3 text-body-md">{answer}</div>}</div><form className="border-t border-outline-variant p-3" onSubmit={e=>{e.preventDefault();void ask()}}><div className="flex gap-2"><input className="input flex-1" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Ask about your application knowledge…"/><button className="btn btn-primary" aria-label="Send" disabled={loading||!query.trim()||!apiKey}><Send size={16}/></button></div></form></aside>;
}