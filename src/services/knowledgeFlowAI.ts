import { generateJson } from './geminiService';
import type { Functionality, Screen, TechnicalComponent, AppModule, Application } from '@/db/types';
import type { GeminiContent } from './geminiService';

export interface KnowledgeFlowResult { mermaid:string; rationale:string; }

const SCHEMA={type:'OBJECT',properties:{mermaid:{type:'STRING'},rationale:{type:'STRING'}},required:['mermaid','rationale']} as const;

export async function generateKnowledgeFlow(
 app:Application,module:AppModule|undefined,screen:Screen|undefined,fn:Functionality,components:TechnicalComponent[],signal?:AbortSignal
){
 const prompt:GeminiContent[]=[{role:'user',parts:[{text:`APPLICATION: ${app.name} · ${app.vendor} · ${app.domain}
MODULE: ${module?.name??'not documented'}
SCREEN: ${screen?.name??'not documented'}
FUNCTIONALITY:
${JSON.stringify(fn)}
LINKED TECHNICAL COMPONENTS:
${JSON.stringify(components.map(c=>({name:c.name,kind:c.kind,description:c.description,definition:c.definition,metadata:c.metadata})))}

Generate a Mermaid flowchart for this functionality from the documented evidence. Include user/system handoffs, decisions, validations, inputs/outputs and relevant technical boundaries where supported. Do not invent undocumented systems or steps. Return renderable Mermaid text and a short rationale.`}] }];
 const result=await generateJson<KnowledgeFlowResult>(prompt,{feature:'knowledge-flow',system:'You are an enterprise process modeller. Produce conservative, valid Mermaid flowchart syntax grounded only in the Application DNA evidence.',responseSchema:SCHEMA as unknown as Record<string,unknown>,temperature:0.2,maxOutputTokens:10000,signal});
 return {data:result.data,model:result.model};
}
