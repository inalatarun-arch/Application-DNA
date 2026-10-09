import { generateJson } from './geminiService';
import type { GeminiContent } from './geminiService';
import type { Screen } from '@/db/types';
import type { UiElementAI } from './applicationAI';
import { SCREEN_CLOSE, SCREEN_SYSTEM, compact } from '@/prompts';

export interface ScreenExtraction {
  name: string;
  purpose: string;
  description: string;
  businessProcess: string;
  navigationPath: string;
  fieldDescriptions: Array<{ field: string; description: string }>;
  uiElements: UiElementAI[];
  validationRules: string[];
  workflowSteps: string[];
  approvalLogic: string;
  exceptionHandling: string[];
  upstreamSystems: string[];
  downstreamSystems: string[];
}

const SCHEMA = { type: 'OBJECT', properties: {
  name:{type:'STRING'}, purpose:{type:'STRING'}, description:{type:'STRING'}, businessProcess:{type:'STRING'}, navigationPath:{type:'STRING'},
  fieldDescriptions:{type:'ARRAY',items:{type:'OBJECT',properties:{field:{type:'STRING'},description:{type:'STRING'}}}},
  uiElements:{type:'ARRAY',items:{type:'OBJECT',properties:{name:{type:'STRING'},type:{type:'STRING'},description:{type:'STRING'},action:{type:'STRING'},required:{type:'BOOLEAN'}}}},
  validationRules:{type:'ARRAY',items:{type:'STRING'}}, workflowSteps:{type:'ARRAY',items:{type:'STRING'}}, approvalLogic:{type:'STRING'},
  exceptionHandling:{type:'ARRAY',items:{type:'STRING'}}, upstreamSystems:{type:'ARRAY',items:{type:'STRING'}}, downstreamSystems:{type:'ARRAY',items:{type:'STRING'}}
},required:['name','fieldDescriptions','uiElements','validationRules','workflowSteps','exceptionHandling','upstreamSystems','downstreamSystems']} as const;

export async function extractScreenFromFiles(screen: Screen, attachments: GeminiContent[], signal?: AbortSignal): Promise<{ data: ScreenExtraction; model: string }> {
  const context = compact({
    name: screen.name,
    purpose: screen.purpose,
    description: screen.description,
    businessProcess: screen.businessProcess,
    navigationPath: screen.navigationPath,
    fieldDescriptions: (screen.fieldDescriptions ?? []).slice(0, 60),
    uiElements: (screen.uiElements ?? []).slice(0, 80).map((u) => ({ name: u.name, type: u.type })),
  }, 6000);
  const prompt: GeminiContent[] = [
    { role: 'user', parts: [{ text: 'Existing screen context:\n' + context }] },
    ...attachments,
    { role: 'user', parts: [{ text: SCREEN_CLOSE }] },
  ];
  const result = await generateJson<ScreenExtraction>(prompt, {
    feature: 'screen-extraction',
    system: SCREEN_SYSTEM,
    responseSchema: SCHEMA as unknown as Record<string, unknown>,
    temperature: 0.1,
    maxOutputTokens: 16384,
    signal,
  });
  const d = (result.data ?? {}) as Partial<ScreenExtraction>;
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const list = (v: unknown) => (Array.isArray(v) ? v.map(text).filter(Boolean) : []);
  const data: ScreenExtraction = {
    name: text(d.name) || screen.name,
    purpose: text(d.purpose),
    description: text(d.description),
    businessProcess: text(d.businessProcess),
    navigationPath: text(d.navigationPath),
    fieldDescriptions: (Array.isArray(d.fieldDescriptions) ? d.fieldDescriptions : []).filter((f) => f && text(f.field)).map((f) => ({ field: text(f.field), description: text(f.description) })),
    uiElements: (Array.isArray(d.uiElements) ? d.uiElements : []).filter((u) => u && text(u.name)),
    validationRules: list(d.validationRules),
    workflowSteps: list(d.workflowSteps),
    approvalLogic: text(d.approvalLogic),
    exceptionHandling: list(d.exceptionHandling),
    upstreamSystems: list(d.upstreamSystems),
    downstreamSystems: list(d.downstreamSystems),
  };
  return { data, model: result.model };
}
