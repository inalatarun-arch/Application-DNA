import { generateJson, generateText } from './geminiService';
import type { GeminiContent } from './geminiService';
import type { Project, Requirement, Application, AppModule, Functionality, Screen } from '@/db/types';

export interface ProjectRequirementExtraction { requirements:Array<{kind:Requirement['kind'];title:string;description:string;acceptanceCriteria:string[];priority:'low'|'medium'|'high';parentTitle:string;functionalityNames:string[]}>; summary:string; }

const REQ_SCHEMA={type:'OBJECT',properties:{summary:{type:'STRING'},requirements:{type:'ARRAY',items:{type:'OBJECT',properties:{kind:{type:'STRING'},title:{type:'STRING'},description:{type:'STRING'},acceptanceCriteria:{type:'ARRAY',items:{type:'STRING'}},priority:{type:'STRING'},parentTitle:{type:'STRING'},functionalityNames:{type:'ARRAY',items:{type:'STRING'}}}}}},required:['summary','requirements']} as const;

export async function extractProjectRequirements(project:Project, current:Requirement[], source:{applications:Application[];modules:AppModule[];functionalities:Functionality[];screens:Screen[]}, attachments:GeminiContent[], signal?:AbortSignal){
  const prompt:GeminiContent[]=[{role:'user',parts:[{text:`PROJECT\n${JSON.stringify(project)}\n\nCURRENT REQUIREMENTS\n${JSON.stringify(current.map(r=>({title:r.title,kind:r.kind,description:r.description,parentId:r.parentId})))}\n\nAVAILABLE APPLICATION KNOWLEDGE\n${JSON.stringify({applications:source.applications.map(a=>({id:a.id,name:a.name})),modules:source.modules.map(m=>({id:m.id,name:m.name})),screens:source.screens.map(s=>({id:s.id,name:s.name})),functionalities:source.functionalities.map(f=>({id:f.id,name:f.name}))})}`}]},...attachments,{role:'user',parts:[{text:'Extract the requirements from the uploaded source. Do not silently overwrite existing requirements. Return only the new/changed requirement proposals plus a short summary.'}]}];
  const result=await generateJson<ProjectRequirementExtraction>(prompt,{feature:'requirement-import',system:'You are a senior business analyst. Extract functional, non-functional, integration, reporting, business-rule, epic, feature and user-story requirements from supplied documents. Preserve source intent, avoid invention, and map to documented functionalities only when supported.',responseSchema:REQ_SCHEMA as unknown as Record<string,unknown>,temperature:0.2,maxOutputTokens:32768,signal});
  return {data:result.data,model:result.model};
}

export interface ProjectFlowResult { title:string; mermaid:string; assumptions:string[]; changeSummary:string; }

const FLOW_SCHEMA={type:'OBJECT',properties:{title:{type:'STRING'},mermaid:{type:'STRING'},assumptions:{type:'ARRAY',items:{type:'STRING'}},changeSummary:{type:'STRING'}},required:['title','mermaid','assumptions','changeSummary']} as const;

export async function generateProjectFlow(project:Project, requirements:Requirement[], currentFlows:string[], source:{applications:Application[];modules:AppModule[];screens:Screen[];functionalities:Functionality[]},signal?:AbortSignal){
 const prompt=`PROJECT: ${project.name}\nDESCRIPTION: ${project.description}\nREQUIREMENTS:\n${requirements.map(r=>`- ${r.kind}: ${r.title}\n  ${r.description}\n  AC: ${r.acceptanceCriteria.join('; ')}`).join('\n')}\nCURRENT FLOWS (may be empty):\n${currentFlows.join('\n---\n')}\nCURRENT APPLICATION KNOWLEDGE:\n${JSON.stringify({applications:source.applications.map(a=>({id:a.id,name:a.name})),modules:source.modules.map(m=>({id:m.id,name:m.name})),screens:source.screens.map(s=>({id:s.id,name:s.name,purpose:s.purpose})),functionalities:source.functionalities.map(f=>({id:f.id,name:f.name,processFlow:f.processFlow}))})}\n\nGenerate the proposed future-state process flow after these requirements are implemented. Show current-system handoffs where useful, highlight changed/new steps in labels, and do not invent undocumented systems. Return valid Mermaid flowchart text in the mermaid field.`;
 const result=await generateJson<ProjectFlowResult>(prompt,{feature:'project-flow',system:'You are a business process architect. Generate a future-state Mermaid process flow grounded in the current Application DNA repository and project requirements. Keep Mermaid syntax conservative and renderable.',responseSchema:FLOW_SCHEMA as unknown as Record<string,unknown>,temperature:0.2,maxOutputTokens:12000,signal});
 return {data:result.data,model:result.model};
}
