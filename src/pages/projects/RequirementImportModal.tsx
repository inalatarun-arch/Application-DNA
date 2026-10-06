import { useRef, useState } from 'react';
import { FileUp, Loader2, Sparkles } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { useApiKey } from '@/hooks/useApiKey';
import { filesToGeminiParts } from '@/lib/filePayload';
import { extractProjectRequirements } from '@/services/projectAI';
import { describeError, isGeminiError } from '@/services/geminiService';
import { addRequirement } from '@/db/projects';
import { db } from '@/db/db';
import type { Project } from '@/db/types';
import { useGraphSource } from '@/hooks/useGraphSource';

export default function RequirementImportModal({ open, project, onClose, onImported }: { open:boolean; project:Project; onClose:()=>void; onImported:()=>void }) {
 const apiKey=useApiKey(); const source=useGraphSource(); const [files,setFiles]=useState<File[]>([]); const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [notice,setNotice]=useState(''); const input=useRef<HTMLInputElement>(null);
 const run=async()=>{
  if(!source||!files.length||!apiKey)return;setBusy(true);setError('');setNotice('');
  try{
   const current=await db.requirements.where('projectId').equals(project.id).toArray();
   const result=await extractProjectRequirements(project,current,source,await filesToGeminiParts(files));
   const fnByName=new Map(source.functionalities.map(f=>[f.name.trim().toLowerCase(),f.id]));
   let added=0;
   for(const req of result.data.requirements??[]){
    if(!req.title?.trim())continue;
    const ids=(req.functionalityNames??[]).map(n=>fnByName.get(n.trim().toLowerCase())).filter((x):x is string=>!!x);
    const duplicate=current.some(r=>r.title.trim().toLowerCase()===req.title.trim().toLowerCase());
    if(duplicate)continue;
    await addRequirement(project.id,{title:req.title,description:req.description,kind:req.kind,acceptanceCriteria:req.acceptanceCriteria,priority:req.priority,functionalityIds:ids,source:files.map(f=>f.name).join(', ')});
    added++;
   }
   setNotice(`Gemini extracted ${result.data.requirements.length} requirements and added ${added} new draft requirements to the backlog.`);
   setFiles([]);onImported();
  }catch(err){if(!(isGeminiError(err)&&err.code==='ABORTED'))setError(describeError(err));}
  finally{setBusy(false);}
 };
 return <Modal open={open} onClose={busy?()=>{}:onClose} title="Import requirements with AI" size="lg">
  <div className="space-y-4">
   <p className="text-body-md text-on-surface-variant">Upload a requirements document, spreadsheet, PDF, transcript or other source. Gemini will extract requirements, acceptance criteria and map them to documented functionalities where evidence exists.</p>
   <button type="button" className="btn btn-secondary" onClick={()=>input.current?.click()} disabled={busy}><FileUp size={16}/>Choose files</button>
   <input ref={input} type="file" multiple className="sr-only" onChange={e=>{setFiles(Array.from(e.target.files??[]));e.target.value='';}}/>
   {files.length>0&&<p className="text-label-md text-on-surface-variant">{files.map(f=>f.name).join(', ')}</p>}
   {notice&&<p role="status" className="rounded border border-outline-variant bg-surface-low p-3 text-body-md">{notice}</p>}
   {error&&<p role="alert" className="rounded border border-error bg-error-container p-3 text-body-md text-error">{error}</p>}
   <div className="flex justify-end gap-2"><button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="btn btn-primary" disabled={busy||!apiKey||!files.length} onClick={()=>void run()}>{busy?<><Loader2 size={15} className="animate-spin"/>Extracting…</>:<><Sparkles size={16}/>Extract requirements</>}</button></div>
  </div>
 </Modal>;
}
