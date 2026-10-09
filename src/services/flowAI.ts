/**
 * AI helpers for process flows. The model is never asked to re-draw a whole diagram when a few changes will do:
 * it returns small operations (see lib/flowOps.ts) and they are applied here, which keeps both the prompt and the
 * answer short, and makes every edit reviewable.
 */
import { generateJson } from './geminiService';
import type { FlowModel } from '@/lib/flowModel';
import { FLOW_OPS_SCHEMA, applyFlowOps, flowToCompact, normalizeOps, type FlowOp } from '@/lib/flowOps';
import { mermaidHasErrors, modelToMermaid, parseMermaidFlow, sanitizeMermaid, validateMermaid, type MermaidIssue } from '@/lib/mermaidFlow';
import { FLOW_OPS_SYSTEM, FLOW_SYSTEM, FUTURE_FLOW_DELTA_SYSTEM } from '@/prompts';

export interface FlowEditResult {
  model: FlowModel;
  applied: number;
  skipped: string[];
  note: string;
  usedModel: string;
  tokens?: { prompt?: number; output?: number };
}

/** Applies a plain-language instruction to a flow by asking for operations only. */
export async function editFlow(model: FlowModel, instruction: string, signal?: AbortSignal): Promise<FlowEditResult> {
  const prompt = `CURRENT FLOW\n${flowToCompact(model)}\n\nINSTRUCTION\n${instruction.trim()}`;
  const result = await generateJson<{ ops?: unknown; note?: unknown }>(prompt, {
    feature: 'flow-edit',
    system: FLOW_OPS_SYSTEM,
    responseSchema: FLOW_OPS_SCHEMA as unknown as Record<string, unknown>,
    temperature: 0.1,
    maxOutputTokens: 4096,
    signal,
  });
  const ops: FlowOp[] = normalizeOps(result.data?.ops);
  const applied = applyFlowOps(model, ops);
  return {
    model: applied.model,
    applied: applied.applied,
    skipped: applied.skipped,
    note: typeof result.data?.note === 'string' ? result.data.note : '',
    usedModel: result.model,
    tokens: { prompt: result.usage?.promptTokens, output: result.usage?.outputTokens },
  };
}

export interface ValidatedMermaid {
  mermaid: string;
  issues: MermaidIssue[];
  /** True when the model had to be asked to fix the diagram. */
  fixed: boolean;
}

/**
 * Makes AI-written Mermaid safe to draw: tidies it, checks it, and asks the model once to fix it if it is still wrong.
 * Never throws for bad diagrams; callers get the remaining issues and decide how to warn.
 */
export async function ensureValidMermaid(source: string, signal?: AbortSignal): Promise<ValidatedMermaid> {
  const first = sanitizeMermaid(source);
  const issues = validateMermaid(first);
  if (!mermaidHasErrors(issues)) return { mermaid: first, issues, fixed: false };
  try {
    const result = await generateJson<{ mermaid?: unknown }>(
      `This Mermaid diagram failed validation.\nPROBLEMS\n${issues.map((i) => `- ${i.message}`).join('\n')}\n\nDIAGRAM\n${first}\n\nReturn the corrected diagram with the same meaning in the mermaid field.`,
      {
        feature: 'flow-edit',
        system: FLOW_SYSTEM,
        responseSchema: { type: 'OBJECT', properties: { mermaid: { type: 'STRING' } }, required: ['mermaid'] },
        temperature: 0,
        maxOutputTokens: 6000,
        signal,
      },
    );
    const second = sanitizeMermaid(typeof result.data?.mermaid === 'string' ? result.data.mermaid : '');
    const secondIssues = validateMermaid(second);
    if (!mermaidHasErrors(secondIssues)) return { mermaid: second, issues: secondIssues, fixed: true };
  } catch (err) {
    if (err instanceof Error && err.name === 'GeminiError' && (err as { code?: string }).code === 'ABORTED') throw err;
  }
  return { mermaid: first, issues, fixed: false };
}

export interface FutureFlowResult {
  title: string;
  mermaid: string;
  assumptions: string[];
  changeSummary: string;
  applied: number;
  skipped: string[];
  issues: MermaidIssue[];
  model: string;
  tokens?: { prompt?: number; output?: number };
}

const FUTURE_DELTA_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    assumptions: { type: 'ARRAY', items: { type: 'STRING' } },
    changeSummary: { type: 'STRING' },
    ops: (FLOW_OPS_SCHEMA.properties.ops as unknown) as Record<string, unknown>,
  },
  required: ['title', 'ops', 'changeSummary'],
} as const;

/**
 * Future-state flow as a set of changes to the documented current flow. Only the compact baseline, the approved
 * requirements and a short list of facts go in, and only the changes come out.
 */
export async function generateFutureFlowDelta(
  baseline: FlowModel,
  requirementsText: string,
  factsText: string,
  signal?: AbortSignal,
): Promise<FutureFlowResult> {
  const prompt = `CURRENT FLOW\n${flowToCompact(baseline)}\n\nREQUIREMENTS\n${requirementsText}\n\nFACTS\n${factsText || '(none)'}`;
  const result = await generateJson<{ title?: unknown; assumptions?: unknown; changeSummary?: unknown; ops?: unknown }>(prompt, {
    feature: 'project-flow',
    system: FUTURE_FLOW_DELTA_SYSTEM,
    responseSchema: FUTURE_DELTA_SCHEMA as unknown as Record<string, unknown>,
    temperature: 0.2,
    maxOutputTokens: 8192,
    signal,
  });
  const applied = applyFlowOps(baseline, normalizeOps(result.data?.ops));
  const mermaid = modelToMermaid(applied.model);
  return {
    title: typeof result.data?.title === 'string' && result.data.title.trim() ? result.data.title.trim() : 'Future-state flow',
    mermaid,
    assumptions: Array.isArray(result.data?.assumptions) ? (result.data.assumptions as unknown[]).filter((x): x is string => typeof x === 'string') : [],
    changeSummary: typeof result.data?.changeSummary === 'string' ? result.data.changeSummary : '',
    applied: applied.applied,
    skipped: applied.skipped,
    issues: validateMermaid(mermaid),
    model: result.model,
    tokens: { prompt: result.usage?.promptTokens, output: result.usage?.outputTokens },
  };
}

/** Parses saved Mermaid into a model; returns null when it has no usable structure. */
export function modelFromMermaid(source: string, title: string): FlowModel | null {
  const model = parseMermaidFlow(source, title);
  return model.nodes.length >= 2 && model.edges.length >= 1 ? model : null;
}
