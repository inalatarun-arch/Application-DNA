import { db, newId, nowIso } from '@/db/db';
import type { AppModule, Screen } from '@/db/types';
import type { ScreenExtraction } from './screenAI';

export async function createScreenFromExtraction(applicationId:string,module:AppModule,extraction:ScreenExtraction,files:File[]):Promise<Screen>{
 const t=nowIso();
 const screen:Screen={id:newId(),createdAt:t,updatedAt:t,applicationId,moduleId:module.id,name:extraction.name||'Untitled screen',purpose:extraction.purpose||'',description:extraction.description||'',businessProcess:extraction.businessProcess||'',businessOwner:'',functionalOwner:'',navigationPath:extraction.navigationPath||'',fieldDescriptions:extraction.fieldDescriptions||[],uiElements:extraction.uiElements||[],validationRules:extraction.validationRules||[],workflowSteps:extraction.workflowSteps||[],approvalLogic:extraction.approvalLogic||'',exceptionHandling:extraction.exceptionHandling||[],upstreamSystems:extraction.upstreamSystems||[],downstreamSystems:extraction.downstreamSystems||[],relatedScreenIds:[]};
 await db.transaction('rw',[db.screens,db.screenMedia],async()=>{
   await db.screens.add(screen);
   for(const file of files.filter(f=>f.type.startsWith('image/'))){
     const dataUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error(`Could not read ${file.name}.`));reader.onload=()=>resolve(String(reader.result));reader.readAsDataURL(file);});
     await db.screenMedia.add({id:newId(),createdAt:t,updatedAt:t,screenId:screen.id,applicationId,kind:'screenshot',name:file.name,caption:'Source screenshot analysed by Gemini.',mimeType:file.type||'image/*',sizeBytes:file.size,dataUrl});
   }
 });
 return screen;
}
