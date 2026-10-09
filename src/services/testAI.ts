import { generateJson } from './geminiService';
import type { Defect, Requirement, TechnicalComponent, TestCase, TestLevel } from '@/db/types';
import { normalizeCases, type GeneratedCase } from '@/lib/testModel';
import { DEFECT_SYSTEM, TEST_LEVEL, TEST_SYSTEM, compact } from '@/prompts';

const strs = (v: unknown) => (Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean) : []);
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const CASE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    testCases: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          scenario: { type: 'STRING' }, steps: { type: 'ARRAY', items: { type: 'STRING' } }, expectedResult: { type: 'STRING' },
          priority: { type: 'STRING' }, type: { type: 'STRING' }, coversCriteria: { type: 'ARRAY', items: { type: 'INTEGER' } },
        },
        required: ['scenario', 'steps', 'expectedResult'],
      },
    },
  },
  required: ['testCases'],
} as const;

export { normalizeCases };
export type { GeneratedCase };

export async function generateTestCases(
  req: Requirement, story: Requirement | undefined, level: TestLevel, existing: TestCase[], signal?: AbortSignal,
): Promise<{ cases: GeneratedCase[]; model: string; tokens?: { prompt?: number; output?: number } }> {
  const prompt = [
    `LEVEL: ${TEST_LEVEL[level] ?? level.toUpperCase()}`,
    `REQUIREMENT: ${req.title}`,
    `DESCRIPTION: ${clip(req.description.replace(/\s+/g, ' '), 800)}`,
    `USER STORY: ${story ? `${story.title}${story.description ? `: ${clip(story.description, 300)}` : ''}` : req.kind === 'user-story' ? req.title : 'not linked'}`,
    `ACCEPTANCE CRITERIA\n${req.acceptanceCriteria.map((a, i) => `${i + 1}. ${a}`).join('\n') || '(none; cover the description and say so in the first scenario)'}`,
    `EXISTING TESTS\n${existing.map((t) => `- ${clip(t.scenario, 120)}`).join('\n') || '(none)'}`,
  ].join('\n\n');
  const result = await generateJson<unknown>(prompt, {
    feature: 'testcases', system: TEST_SYSTEM, responseSchema: CASE_SCHEMA as unknown as Record<string, unknown>, temperature: 0.3, maxOutputTokens: 8192, signal,
  });
  return {
    cases: normalizeCases(result.data, req.acceptanceCriteria.length, existing.map((t) => t.scenario)),
    model: result.model,
    tokens: { prompt: result.usage?.promptTokens, output: result.usage?.outputTokens },
  };
}

const DEFECT_SCHEMA = {
  type: 'OBJECT',
  properties: { rootCauses: { type: 'ARRAY', items: { type: 'STRING' } }, impactedModules: { type: 'ARRAY', items: { type: 'STRING' } }, recommendations: { type: 'ARRAY', items: { type: 'STRING' } } },
  required: ['rootCauses', 'impactedModules', 'recommendations'],
} as const;

/** Returns text ready to store and show; arrays the model omitted become empty lists instead of crashing. */
export async function analyzeDefect(defect: Defect, test: TestCase | undefined, components: TechnicalComponent[], signal?: AbortSignal): Promise<string> {
  const comps = components.slice(0, 6).map((c) => `${c.kind}: ${c.name}${c.description ? `: ${clip(c.description, 200)}` : ''}${c.definition ? `\nDefinition:\n${clip(c.definition, 1500)}` : ''}`).join('\n\n');
  const prompt = [
    `DEFECT: ${defect.title} [severity ${defect.severity}]`,
    `DESCRIPTION: ${clip(defect.description, 1500)}`,
    test ? `LINKED TEST: ${test.scenario}\nSteps: ${compact(test.steps, 600)}\nExpected: ${clip(test.expectedResult, 300)}\nActual: ${clip(test.actualResult ?? 'not recorded', 300)}` : 'LINKED TEST: none',
    `TECHNICAL COMPONENTS${components.length > 6 ? ` (showing 6 of ${components.length})` : ''}\n${comps || '(none linked)'}`,
  ].join('\n\n');
  const result = await generateJson<{ rootCauses?: unknown; impactedModules?: unknown; recommendations?: unknown }>(prompt, {
    feature: 'defects', system: DEFECT_SYSTEM, responseSchema: DEFECT_SCHEMA as unknown as Record<string, unknown>, temperature: 0.2, maxOutputTokens: 4096, signal,
  });
  const block = (title: string, xs: string[]) => `${title}:\n${xs.length ? xs.map((x) => `• ${x}`).join('\n') : '• none identified from the supplied evidence'}`;
  return [block('Root causes', strs(result.data?.rootCauses)), block('Impacted modules', strs(result.data?.impactedModules)), block('Recommendations', strs(result.data?.recommendations))].join('\n\n');
}
