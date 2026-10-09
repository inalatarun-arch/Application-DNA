/**
 * FDD and TDD generation against Gemini. The FDD pipeline itself lives in lib/fddPipeline.ts; this file connects it
 * to the model and adds the TDD and the section-level revision.
 */
import { generateJson, generateTextLong } from './geminiService';
import { buildRepoDigest } from '@/lib/repoDigest';
import { applyPatches, revisionContext, type Patch } from '@/lib/docRevise';
import { FRD_REVISE_SYSTEM, TDD_SYSTEM } from '@/prompts';
import { generateFdd as runFdd, pickFunctionalities, reqLines, storiesText, traceCodes, type DocRun, type FddInput } from '@/lib/fddPipeline';

export { MAX_FDD_FUNCTIONALITIES, traceCodes } from '@/lib/fddPipeline';
export type { DocRun, FddInput } from '@/lib/fddPipeline';

type Progress = (done: number, total: number, label: string) => void;
const clip = (s: string | undefined, n: number) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

export function generateFdd(input: FddInput, onProgress?: Progress, signal?: AbortSignal): Promise<DocRun> {
  return runFdd(input, {
    generate: async (prompt, system, sig) => {
      const r = await generateTextLong(prompt, { feature: 'frd', system, temperature: 0.2, maxOutputTokens: 16384, signal: sig }, 3);
      return { text: r.text, model: r.model, usage: r.usage };
    },
  }, onProgress, signal);
}

// ---------------------------------------------------------------- TDD

/** Short version of an FDD for the TDD prompt: headings, functional requirement lines and the rules tables' first rows. */
export function condenseFdd(md: string, max = 9000): string {
  const out: string[] = [];
  let fence = false;
  for (const line of md.replace(/\r/g, '').split('\n')) {
    if (/^\s*```/.test(line)) { fence = !fence; continue; }
    if (fence) continue;
    if (/^#{1,4}\s/.test(line) || /\bshall\b/i.test(line) || /^\|\s*(Goal|Actors)\b/.test(line)) out.push(line.length > 260 ? `${line.slice(0, 259)}…` : line);
  }
  const text = out.join('\n');
  return text.length > max ? `${text.slice(0, max)}\n(cut)` : text;
}

export async function generateTdd(input: FddInput, fddMarkdown: string, templateHeadings: string, signal?: AbortSignal): Promise<DocRun> {
  const { project, requirements, stories, source, level } = input;
  const { usable, reqCode, storyCode } = traceCodes(requirements, stories);
  const fns = pickFunctionalities(project, usable, source).slice(0, 60);
  const digest = buildRepoDigest({
    modules: source.modules.filter((m) => fns.some((f) => f.moduleId === m.id)),
    screens: source.screens.filter((s) => fns.some((f) => f.screenId === s.id)),
    functionalities: fns,
    components: source.components.filter((c) => (c.functionalityIds ?? []).some((id) => fns.some((f) => f.id === id))),
    requirements: usable,
  }, level);
  const prompt = `PROJECT: ${project.name}${project.description ? ` | ${clip(project.description, 400)}` : ''}\n\nREQUIREMENTS\n${reqLines(requirements, reqCode, 40)}\n\nUSER STORIES\n${storiesText(stories, storyCode, reqCode, 25)}\n\nAPPROVED OR DRAFT FDD (condensed)\n${fddMarkdown.trim() ? condenseFdd(fddMarkdown) : '(no FDD yet)'}\n\n${digest.text.split('\n# REQUIREMENTS')[0]}\n\nTEMPLATE HEADINGS (keep every one, in order)\n${templateHeadings}\n\nWrite the complete Technical Design Document in Markdown.`;
  const r = await generateTextLong(prompt, { feature: 'tdd', system: TDD_SYSTEM, temperature: 0.2, maxOutputTokens: 16384, signal }, 4);
  if (!r.text.trim()) throw new Error('The model returned an empty document. Try again.');
  return { markdown: r.text.trim(), model: r.model, tokens: { prompt: r.usage?.promptTokens ?? 0, output: r.usage?.outputTokens ?? 0 }, missing: [], failed: [], notes: r.parts > 1 ? ['The document was long, so it was written in several parts and joined.'] : [] };
}

// ---------------------------------------------------------------- revision

export interface RevisionResult { markdown: string; applied: string[]; skipped: string[]; note: string; model: string; tokens: { prompt?: number; output?: number } }

const REVISE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    note: { type: 'STRING' },
    patches: { type: 'ARRAY', items: { type: 'OBJECT', properties: { heading: { type: 'STRING' }, markdown: { type: 'STRING' } }, required: ['heading', 'markdown'] } },
  },
  required: ['patches'],
} as const;

/** Applies a reviewer's comment by replacing only the sections it concerns. */
export async function reviseDocument(markdown: string, instruction: string, signal?: AbortSignal): Promise<RevisionResult> {
  const ctx = revisionContext(markdown, instruction);
  const prompt = `SECTION INDEX\n${ctx.index}\n\nRELEVANT SECTIONS (current text)\n${ctx.bodies || '(none matched; choose sections from the index and keep them minimal)'}\n\nINSTRUCTION\n${instruction.trim()}`;
  const result = await generateJson<{ patches?: unknown; note?: unknown }>(prompt, {
    feature: 'document-revise',
    system: FRD_REVISE_SYSTEM,
    responseSchema: REVISE_SCHEMA as unknown as Record<string, unknown>,
    temperature: 0.2,
    maxOutputTokens: 12000,
    signal,
  });
  const patches: Patch[] = (Array.isArray(result.data?.patches) ? result.data.patches : [])
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .map((p) => ({ heading: typeof p.heading === 'string' ? p.heading : '', markdown: typeof p.markdown === 'string' ? p.markdown : '' }));
  const applied = applyPatches(markdown, patches);
  return {
    markdown: applied.markdown,
    applied: applied.applied,
    skipped: applied.skipped,
    note: typeof result.data?.note === 'string' ? result.data.note : '',
    model: result.model,
    tokens: { prompt: result.usage?.promptTokens, output: result.usage?.outputTokens },
  };
}
