import { generateJson } from './geminiService';
import type { Application, AppModule, Functionality, Screen, TechnicalComponent } from '@/db/types';
import type { GeminiContent } from './geminiService';
import {
  EXTRACTION_SCHEMA,
  mergeExtractions,
  normalizeApplicationExtraction,
  type ApplicationExtraction,
} from '@/lib/extractionModel';
import { REVISION_SCHEMA, parseRevision, stagedForPrompt, type Revision, type StagedItem } from '@/lib/extractionStage';
import { APPLICATION_CLOSE, APPLICATION_SYSTEM, EXTRACTION_REVISE_SYSTEM, capNote } from '@/prompts';

export type { ApplicationExtraction, UiElementAI } from '@/lib/extractionModel';

const MAX_LISTED = 250;
const BATCH_COST = 120_000;
const BATCH_FILES = 6;

const clip = (s: string | undefined, n: number) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const list = <T,>(label: string, items: T[], line: (x: T) => string) => {
  const shown = items.slice(0, MAX_LISTED);
  return `${label} (${items.length})${capNote(shown.length, items.length)}\n${shown.map(line).join('\n') || '(none)'}`;
};

/** Names and one-line purposes only: enough to match existing records without sending the whole repository. */
function context(app: Application, modules: AppModule[], screens: Screen[], functionalities: Functionality[], components: TechnicalComponent[]): string {
  const moduleName = new Map(modules.map((m) => [m.id, m.name]));
  const screenName = new Map(screens.map((s) => [s.id, s.name]));
  return [
    'CURRENT REPOSITORY (use these exact names in matchName when updating)',
    `APPLICATION: ${app.name} | vendor ${app.vendor || '-'} | domain ${app.domain || '-'} | tier ${app.criticalTier || '-'} | stack ${(app.technicalStack ?? []).join(', ') || '-'}${app.description ? ` | ${clip(app.description, 160)}` : ''}`,
    list('MODULES', modules, (m) => `- ${m.name}${m.description ? `: ${clip(m.description, 70)}` : ''}`),
    list('SCREENS', screens, (s) => `- ${s.name}${s.moduleId && moduleName.get(s.moduleId) ? ` [${moduleName.get(s.moduleId)}]` : ''}${s.purpose ? `: ${clip(s.purpose, 70)}` : ''}`),
    list('FUNCTIONALITIES', functionalities, (f) => `- ${f.name}${f.screenId && screenName.get(f.screenId) ? ` [${screenName.get(f.screenId)}]` : ''}${f.description ? `: ${clip(f.description, 70)}` : ''}`),
    list('TECHNICAL COMPONENTS', components, (c) => `- ${c.name} (${c.kind})`),
  ].join('\n\n');
}

const costOf = (c: GeminiContent) =>
  c.parts.reduce((n, p) => n + (p.text?.length ?? 0) + (p.inlineData ? Math.round(p.inlineData.data.length / 2) : 0), 0);

/** Splits attachments into batches so one reply never has to hold the extraction of everything at once. */
export function batchAttachments(attachments: GeminiContent[]): GeminiContent[][] {
  const batches: GeminiContent[][] = [];
  let current: GeminiContent[] = [];
  let cost = 0;
  for (const a of attachments) {
    const c = costOf(a);
    // A text part and its binary part are separate contents; keep them together by only splitting before a "<<<FILE" label.
    const startsFile = a.parts.some((p) => p.text?.startsWith('<<<FILE'));
    if (current.length && startsFile && (cost + c > BATCH_COST || current.filter((x) => x.parts.some((p) => p.text?.startsWith('<<<FILE'))).length >= BATCH_FILES)) {
      batches.push(current);
      current = [];
      cost = 0;
    }
    current.push(a);
    cost += c;
  }
  if (current.length) batches.push(current);
  return batches.length ? batches : [[]];
}

export interface ExtractionRun {
  data: ApplicationExtraction;
  model: string;
  /** True when a reply was cut off by the output limit and only the completed items were recovered. */
  truncated: boolean;
  batches: number;
}

export async function extractApplicationKnowledge(
  app: Application,
  modules: AppModule[],
  screens: Screen[],
  functionalities: Functionality[],
  components: TechnicalComponent[],
  userText: string,
  attachments: GeminiContent[],
  signal?: AbortSignal,
  onProgress?: (done: number, total: number) => void,
): Promise<ExtractionRun> {
  const repo = context(app, modules, screens, functionalities, components);
  const batches = batchAttachments(attachments);
  const plans: ApplicationExtraction[] = [];
  let model = '';
  let truncated = false;
  for (let i = 0; i < batches.length; i++) {
    onProgress?.(i, batches.length);
    const note = batches.length > 1 ? `\n\n(Source batch ${i + 1} of ${batches.length}. Other batches are processed separately and merged afterwards, so extract everything in this batch.)` : '';
    const prompt: GeminiContent[] = [
      { role: 'user', parts: [{ text: `${repo}\n\nUSER DESCRIPTION\n${userText || '(none)'}${note}` }] },
      ...batches[i],
      { role: 'user', parts: [{ text: APPLICATION_CLOSE }] },
    ];
    const result = await generateJson<unknown>(prompt, {
      feature: 'application-ingestion',
      system: APPLICATION_SYSTEM,
      responseSchema: EXTRACTION_SCHEMA as unknown as Record<string, unknown>,
      temperature: 0.2,
      maxOutputTokens: 32768,
      signal,
    });
    plans.push(normalizeApplicationExtraction(result.data));
    model = result.model;
    truncated = truncated || !!result.repaired;
  }
  onProgress?.(batches.length, batches.length);
  return { data: mergeExtractions(plans), model, truncated, batches: batches.length };
}

/** Sends the staged plan and a reviewer's instruction to the model; returns the edits to apply locally. */
export async function reviseExtraction(staged: StagedItem[], instruction: string, signal?: AbortSignal): Promise<{ revision: Revision; model: string }> {
  const prompt = `STAGED ITEMS\n${stagedForPrompt(staged)}\n\nINSTRUCTION\n${instruction.trim()}`;
  const result = await generateJson<unknown>(prompt, {
    feature: 'extraction-revise',
    system: EXTRACTION_REVISE_SYSTEM,
    responseSchema: REVISION_SCHEMA as unknown as Record<string, unknown>,
    temperature: 0.2,
    maxOutputTokens: 16384,
    signal,
  });
  return { revision: parseRevision(result.data), model: result.model };
}
