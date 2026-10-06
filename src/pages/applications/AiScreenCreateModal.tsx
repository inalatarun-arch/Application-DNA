import { useRef, useState } from 'react';
import { FileUp, Loader2, Sparkles, X } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { useApiKey } from '@/hooks/useApiKey';
import { filesToGeminiParts } from '@/lib/filePayload';
import { extractScreenFromFiles } from '@/services/screenAI';
import { createScreenFromExtraction } from '@/services/screenIngestion';
import { describeError, isGeminiError } from '@/services/geminiService';
import type { AppModule, Screen } from '@/db/types';

export default function AiScreenCreateModal({ open, module, onClose, onCreated }: { open:boolean; module:AppModule; onClose:()=>void; onCreated:(id:string)=>void }) {
 const apiKey=useApiKey(); const [text,setText]=useState(''); const [files,setFiles]=useState<File[]>([]); const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const input=useRef<HTMLInputElement>(null);
 const run=async()=>{
  if(!apiKey || (!text.trim()&&!files.length)) return; setBusy(true);setError('');
  try{
   const blank:Screen={id:'new',createdAt:'',updatedAt:'',applicationId:module.applicationId,moduleId:module.id,name:'',purpose:text,description:'',businessProcess:'',businessOwner:'',functionalOwner:'',navigationPath:'',fieldDescriptions:[],uiElements:[],validationRules:[],workflowSteps:[],approvalLogic:'',exceptionHandling:[],upstreamSystems:[],downstreamSystems:[],relatedScreenIds:[]};
   const parts=await filesToGeminiParts(files);
   if(text.trim()) parts.unshift({role:'user',parts:[{text:`USER SCREEN DESCRIPTION\\n${text}`}]});
   const result=await extractScreenFromFiles(blank,parts);
   const screen=await createScreenFromExtraction(module.applicationId,module,result.data,files);
   onCreated(screen.id); setText('');setFiles([]);onClose();
  }catch(err){if(!(isGeminiError(err)&&err.code==='ABORTED'))setError(describeError(err));}
  finally{setBusy(false);}
 };
 return <Modal open={open} onClose={busy?()=>{}:onClose} title={`AI create screen in ${module.name}`} size="lg">
  <div className="space-y-4">
   <p className="text-body-md text-on-surface-variant">Describe the screen, attach one or more screenshots/documents, or do both. Gemini will create the screen documentation and extract editable fields, inputs, buttons and other controls.</p>
   <textarea className="input min-h-[120px]" value={text} onChange={e=>setText(e.target.value)} placeholder="Example: Supplier Maintenance lets AP users search suppliers, create a supplier, edit payment terms and submit the supplier for approval."/>
   <div className="flex flex-wrap items-center gap-2">
    <button type="button" className="btn btn-secondary" onClick={()=>input.current?.click()}><FileUp size={16}/>Attach screenshots / files</button>
    <input ref={input} type="file" multiple className="sr-only" onChange={e=>{setFiles(Array.from(e.target.files??[]));e.target.value='';}}/>
    {files.length>0&&<span className="text-label-md text-on-surface-variant">{files.map(f=>f.name).join(', ')}</span>}
   </div>
   {error&&<p role="alert" className="rounded border border-error bg-error-container p-3 text-body-md text-error">{error}</p>}
   <div className="flex justify-end gap-2"><button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}><X size={16}/>Cancel</button><button type="button" className="btn btn-primary" onClick={()=>void run()} disabled={busy||!apiKey||(!text.trim()&&!files.length)}>{busy?<><Loader2 size={15} className="animate-spin"/>Analysing…</>:<><Sparkles size={16}/>Create with AI</>}</button></div>
  </div>
 </Modal>;
}
