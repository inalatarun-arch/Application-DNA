import { generateJson } from './geminiService';
import type { Functionality, Screen, TechnicalComponent, AppModule, Application } from '@/db/types';
import { ensureValidMermaid } from './flowAI';
import { FLOW_SYSTEM, KNOWLEDGE_FLOW_CLOSE, capNote } from '@/prompts';

export interface KnowledgeFlowResult { mermaid: string; rationale: string; issues: string[]; fixed: boolean }

const SCHEMA = {
  type: 'OBJECT',
  properties: { mermaid: { type: 'STRING' }, rationale: { type: 'STRING' } },
  required: ['mermaid', 'rationale'],
} as const;

const clip = (s: string | undefined, n: number) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const line = (label: string, xs: string[] | undefined, n = 8, each = 120) => {
  const items = (xs ?? []).map((x) => clip(x, each)).filter(Boolean);
  return items.length ? `${label}: ${items.slice(0, n).join('; ')}${items.length > n ? ` (+${items.length - n} more)` : ''}` : '';
};

const MAX_COMPONENTS = 14;

/** Plain-text evidence for one functionality: no ids, no empty fields, long text trimmed. */
export function functionalityEvidence(app: Application, module: AppModule | undefined, screen: Screen | undefined, fn: Functionality, components: TechnicalComponent[]): string {
  const comps = components.filter((c) => c.kind !== 'server' && c.kind !== 'cloud' && c.kind !== 'package');
  const shown = comps.slice(0, MAX_COMPONENTS);
  return [
    `APPLICATION: ${app.name}${app.domain ? ` (${app.domain})` : ''}`,
    `MODULE: ${module?.name ?? 'not documented'} | SCREEN: ${screen?.name ?? 'not documented'}`,
    `FUNCTIONALITY: ${fn.name}`,
    fn.description && `Description: ${clip(fn.description, 400)}`,
    fn.businessPurpose && `Purpose: ${clip(fn.businessPurpose, 300)}`,
    line('Roles', fn.userRoles),
    line('Triggers', fn.triggers),
    line('Inputs', fn.inputs),
    line('Outputs', fn.outputs),
    line('Validation exceptions', fn.exceptions?.validation),
    line('Business exceptions', fn.exceptions?.business),
    line('System/error exceptions', [...(fn.exceptions?.system ?? []), ...(fn.exceptions?.error ?? [])]),
    line('Upstream systems', fn.upstreamSystems),
    line('Downstream systems', fn.downstreamSystems),
    screen && line('Screen workflow', screen.workflowSteps, 10),
    screen && line('Screen validation rules', screen.validationRules, 8),
    shown.length ? `TECHNICAL COMPONENTS${capNote(shown.length, comps.length)}:\n${shown.map((c) => `- ${c.name} (${c.kind})${c.description ? `: ${clip(c.description, 100)}` : ''}`).join('\n')}` : '',
  ].filter(Boolean).join('\n');
}

export async function generateKnowledgeFlow(
  app: Application,
  module: AppModule | undefined,
  screen: Screen | undefined,
  fn: Functionality,
  components: TechnicalComponent[],
  signal?: AbortSignal,
): Promise<{ data: KnowledgeFlowResult; model: string; tokens?: { prompt?: number; output?: number } }> {
  const result = await generateJson<{ mermaid?: unknown; rationale?: unknown }>(`${functionalityEvidence(app, module, screen, fn, components)}\n\n${KNOWLEDGE_FLOW_CLOSE}`, {
    feature: 'knowledge-flow',
    system: FLOW_SYSTEM,
    responseSchema: SCHEMA as unknown as Record<string, unknown>,
    temperature: 0.2,
    maxOutputTokens: 6000,
    signal,
  });
  const checked = await ensureValidMermaid(typeof result.data?.mermaid === 'string' ? result.data.mermaid : '', signal);
  if (!checked.mermaid.trim()) throw new Error('The model did not return a flow. Add more detail to the functionality and try again.');
  return {
    data: {
      mermaid: checked.mermaid,
      rationale: typeof result.data?.rationale === 'string' ? result.data.rationale : '',
      issues: checked.issues.filter((i) => i.level === 'error').map((i) => i.message),
      fixed: checked.fixed,
    },
    model: result.model,
    tokens: { prompt: result.usage?.promptTokens, output: result.usage?.outputTokens },
  };
}
