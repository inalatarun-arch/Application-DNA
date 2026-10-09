import { generateJson } from './geminiService';
import type { GeminiContent } from './geminiService';
import type { Project, Requirement, Application, AppModule, Functionality, Screen } from '@/db/types';
import { normalizeRequirements, type ExtractedRequirement, type ProjectRequirementExtraction } from '@/lib/requirementModel';
import { composeFlows } from '@/lib/flowCompose';
import type { FlowModel } from '@/lib/flowModel';
import { estimateTokens } from '@/lib/repoDigest';
import { REQ_IMPORT_SYSTEM, PROJECT_FLOW_SYSTEM, capNote } from '@/prompts';
import { ensureValidMermaid, generateFutureFlowDelta } from './flowAI';

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const strs = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

const REQ_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    requirements: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          operation: { type: 'STRING' }, existingTitle: { type: 'STRING' }, kind: { type: 'STRING' }, title: { type: 'STRING' },
          description: { type: 'STRING' }, acceptanceCriteria: { type: 'ARRAY', items: { type: 'STRING' } }, priority: { type: 'STRING' },
          parentTitle: { type: 'STRING' }, functionalityNames: { type: 'ARRAY', items: { type: 'STRING' } },
          sourceQuote: { type: 'STRING' }, sourceFile: { type: 'STRING' },
        },
        required: ['title', 'kind'],
      },
    },
  },
  required: ['summary', 'requirements'],
} as const;

const MAX_NAMES = 300;
const MAX_CURRENT = 120;

export { normalizeRequirements };
export type { ExtractedRequirement, ProjectRequirementExtraction };

export async function extractProjectRequirements(
  project: Project,
  current: Requirement[],
  source: { applications: Application[]; modules: AppModule[]; functionalities: Functionality[]; screens: Screen[] },
  attachments: GeminiContent[],
  signal?: AbortSignal,
) {
  const names = source.functionalities.slice(0, MAX_NAMES).map((f) => `- ${f.name}`).join('\n') || '(none)';
  const cur = current.slice(0, MAX_CURRENT).map((r) => `- ${r.title} [${r.kind}]`).join('\n') || '(none)';
  const head = [
    `PROJECT: ${project.name}${project.description ? ` | ${project.description.slice(0, 300)}` : ''}`,
    `APPLICATIONS: ${source.applications.map((a) => a.name).join(', ') || '(none)'}`,
    `CURRENT REQUIREMENTS (${current.length})${capNote(Math.min(current.length, MAX_CURRENT), current.length)}\n${cur}`,
    `AVAILABLE APPLICATION KNOWLEDGE: functionalities (${source.functionalities.length})${capNote(Math.min(source.functionalities.length, MAX_NAMES), source.functionalities.length)}\n${names}`,
  ].join('\n\n');
  const prompt: GeminiContent[] = [
    { role: 'user', parts: [{ text: head }] },
    ...attachments,
    { role: 'user', parts: [{ text: 'Extract the requirements from the supplied files. Return only new or changed proposals, each with a short source quote, plus a one to three sentence summary.' }] },
  ];
  const result = await generateJson<unknown>(prompt, {
    feature: 'requirement-import',
    system: REQ_IMPORT_SYSTEM,
    responseSchema: REQ_SCHEMA as unknown as Record<string, unknown>,
    temperature: 0.2,
    maxOutputTokens: 32768,
    signal,
  });
  return { data: normalizeRequirements(result.data), model: result.model, repaired: !!result.repaired };
}

export interface ProjectFlowResult {
  title: string;
  mermaid: string;
  assumptions: string[];
  changeSummary: string;
  /** "delta" = changes applied to the documented flow, "full" = whole diagram written by the model. */
  mode: 'delta' | 'full';
  notes: string[];
  model: string;
  tokens?: { prompt?: number; output?: number };
}

const FLOW_SCHEMA = {
  type: 'OBJECT',
  properties: { title: { type: 'STRING' }, mermaid: { type: 'STRING' }, assumptions: { type: 'ARRAY', items: { type: 'STRING' } }, changeSummary: { type: 'STRING' } },
  required: ['title', 'mermaid', 'assumptions', 'changeSummary'],
} as const;

/** Requirement lines for the flow prompts: kind, title, short description and the first acceptance criteria. */
export function requirementsForFlow(requirements: Requirement[], max = 40): string {
  const usable = requirements.filter((r) => r.status !== 'rejected').slice(0, max);
  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  const lines = usable.map((r) => `- [${r.kind}${r.status === 'draft' ? ', draft' : ''}] ${clip(r.title, 140)}: ${clip(r.description.replace(/\s+/g, ' '), 200)}${r.acceptanceCriteria.length ? ` AC: ${r.acceptanceCriteria.slice(0, 3).map((a) => clip(a, 80)).join('; ')}` : ''}`);
  return lines.join('\n') + capNote(usable.length, requirements.filter((r) => r.status !== 'rejected').length);
}

/**
 * Future-state flow. Preferred path: send the documented current flow in compact form and receive only the changes.
 * If there is no usable baseline, or the delta fails or changes nothing, fall back to one full Mermaid answer that is
 * validated and repaired before being returned.
 */
export async function generateProjectFlow(
  project: Project,
  requirements: Requirement[],
  baselineParts: Array<{ label: string; model: FlowModel }>,
  factsText: string,
  signal?: AbortSignal,
): Promise<ProjectFlowResult> {
  const reqText = requirementsForFlow(requirements);
  const notes: string[] = [];
  const baseline = baselineParts.length ? composeFlows(baselineParts, `Future state: ${project.name}`) : null;

  if (baseline && baseline.nodes.length >= 2) {
    try {
      const d = await generateFutureFlowDelta(baseline, reqText, factsText, signal);
      if (d.applied > 0) {
        if (d.skipped.length) notes.push(`${d.skipped.length} proposed change${d.skipped.length === 1 ? ' was' : 's were'} skipped because they did not match the current flow.`);
        const checked = await ensureValidMermaid(d.mermaid, signal);
        if (checked.fixed) notes.push('The diagram needed a syntax fix, which was applied.');
        return { title: d.title, mermaid: checked.mermaid, assumptions: d.assumptions, changeSummary: d.changeSummary, mode: 'delta', notes, model: d.model, tokens: d.tokens };
      }
      notes.push('The change-only answer had no usable changes, so a full diagram was requested instead.');
    } catch (err) {
      if (err instanceof Error && (err as { code?: string }).code === 'ABORTED') throw err;
      notes.push('The change-only request failed, so a full diagram was requested instead.');
    }
  }

  const prompt = `PROJECT: ${project.name}${project.description ? `\nDESCRIPTION: ${project.description.slice(0, 400)}` : ''}\n\nREQUIREMENTS\n${reqText}\n\nFACTS\n${factsText || '(none)'}\n\nWrite the future-state flow after these requirements are implemented. Estimated input: ${estimateTokens(reqText + factsText)} tokens.`;
  const result = await generateJson<{ title?: unknown; mermaid?: unknown; assumptions?: unknown; changeSummary?: unknown }>(prompt, {
    feature: 'project-flow',
    system: PROJECT_FLOW_SYSTEM,
    responseSchema: FLOW_SCHEMA as unknown as Record<string, unknown>,
    temperature: 0.2,
    maxOutputTokens: 8192,
    signal,
  });
  const checked = await ensureValidMermaid(typeof result.data?.mermaid === 'string' ? result.data.mermaid : '', signal);
  if (!checked.mermaid.trim()) throw new Error('The model did not return a flow. Try again, or add more detail to the requirements.');
  if (checked.issues.some((i) => i.level === 'error')) notes.push('The diagram still has syntax problems. Check the Mermaid source before relying on it.');
  return {
    title: str(result.data?.title) || `Future-state flow: ${project.name}`,
    mermaid: checked.mermaid,
    assumptions: strs(result.data?.assumptions),
    changeSummary: str(result.data?.changeSummary),
    mode: 'full',
    notes,
    model: result.model,
    tokens: { prompt: result.usage?.promptTokens, output: result.usage?.outputTokens },
  };
}
