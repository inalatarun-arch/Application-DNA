import { generateJson } from './geminiService';
import type { DeliveryStory, Requirement } from '@/db/types';
import type { StoryDraft } from '@/db/delivery';
import { STORY_SYSTEM } from '@/prompts';

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    stories: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          requirementCode: { type: 'STRING' }, title: { type: 'STRING' }, asA: { type: 'STRING' }, iWant: { type: 'STRING' }, soThat: { type: 'STRING' },
          acceptanceCriteria: { type: 'ARRAY', items: { type: 'STRING' } }, businessRules: { type: 'ARRAY', items: { type: 'STRING' } }, priority: { type: 'STRING' },
        },
        required: ['requirementCode', 'title', 'asA', 'iWant', 'soThat'],
      },
    },
  },
  required: ['stories'],
} as const;

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const strs = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const BATCH = 15;

export interface StoryRun { drafts: StoryDraft[]; model: string; ignored: number }

/** Writes user stories for the given requirements, a batch at a time. Codes in, requirement ids out. */
export async function generateStories(requirements: Requirement[], existing: DeliveryStory[], signal?: AbortSignal): Promise<StoryRun> {
  const codes = new Map(requirements.map((r, i) => [`REQ-${String(i + 1).padStart(3, '0')}`, r]));
  const entries = [...codes.entries()];
  const have = existing.map((s) => `- ${clip(s.title, 100)}`).join('\n') || '(none)';
  const drafts: StoryDraft[] = [];
  let model = '';
  let ignored = 0;
  for (let i = 0; i < entries.length; i += BATCH) {
    const slice = entries.slice(i, i + BATCH);
    const reqText = slice.map(([code, r]) => `${code} [${r.kind}, ${r.priority ?? 'medium'}] ${clip(r.title, 140)}: ${clip(r.description.replace(/\s+/g, ' '), 300)}${r.acceptanceCriteria.length ? ` AC: ${r.acceptanceCriteria.slice(0, 4).map((a) => clip(a, 90)).join('; ')}` : ''}`).join('\n');
    const result = await generateJson<{ stories?: unknown }>(`REQUIREMENTS\n${reqText}\n\nEXISTING STORIES\n${have}`, {
      feature: 'user-stories', system: STORY_SYSTEM, responseSchema: SCHEMA as unknown as Record<string, unknown>, temperature: 0.2, maxOutputTokens: 16384, signal,
    });
    model = result.model;
    for (const raw of Array.isArray(result.data?.stories) ? result.data.stories : []) {
      if (!raw || typeof raw !== 'object') continue;
      const x = raw as Record<string, unknown>;
      const req = codes.get(str(x.requirementCode).toUpperCase());
      const title = str(x.title);
      if (!req || !title || !str(x.iWant)) { ignored++; continue; }
      const p = str(x.priority).toLowerCase();
      drafts.push({
        requirementId: req.id, title: title.slice(0, 200), asA: str(x.asA).replace(/^as an?\s+/i, ''), iWant: str(x.iWant).replace(/^i want( to)?\s+/i, ''),
        soThat: str(x.soThat).replace(/^so that\s+/i, ''), acceptanceCriteria: strs(x.acceptanceCriteria), businessRules: strs(x.businessRules),
        priority: p === 'high' || p === 'low' ? p : (req.priority ?? 'medium'),
      });
    }
  }
  return { drafts, model, ignored };
}
