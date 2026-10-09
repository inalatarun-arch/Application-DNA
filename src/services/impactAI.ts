/** Gemini-generated impact assessment for a project, grounded in the documented repository. */
import { generateJson } from './geminiService';
import type { Project, Requirement } from '@/db/types';
import type { ProjectScope } from '@/lib/projectScope';
import type { GraphSource } from '@/lib/graphModel';
import { IMPACT_SYSTEM } from '@/prompts';
import { buildRepoDigest, type Digest, type DigestLevel } from '@/lib/repoDigest';

export type Severity = 'high' | 'medium' | 'low';

export interface ImpactAssessment {
  summary: string;
  functional: Array<{ area: string; description: string; severity: Severity; impactedPart: string; currentState: string; proposedChange: string; rationale: string; propagation: string }>;
  technical: Array<{ area: string; description: string; severity: Severity; impactedPart: string; currentState: string; proposedChange: string; rationale: string; propagation: string }>;
  risks: Array<{ risk: string; mitigation: string; severity: Severity }>;
  gaps: Array<{ gap: string; recommendation: string }>;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const records = (v: unknown): Array<Record<string, unknown>> =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)) : [];
const severity = (v: unknown): Severity => {
  const s = str(v).toLowerCase();
  return s === 'high' || s === 'low' ? s : 'medium';
};

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    functional: { type: 'ARRAY', items: { type: 'OBJECT', properties: { area: { type: 'STRING' }, description: { type: 'STRING' }, severity: { type: 'STRING' }, impactedPart: { type: 'STRING' }, currentState: { type: 'STRING' }, proposedChange: { type: 'STRING' }, rationale: { type: 'STRING' }, propagation: { type: 'STRING' } }, required: ['area', 'description'] } },
    technical: { type: 'ARRAY', items: { type: 'OBJECT', properties: { area: { type: 'STRING' }, description: { type: 'STRING' }, severity: { type: 'STRING' }, impactedPart: { type: 'STRING' }, currentState: { type: 'STRING' }, proposedChange: { type: 'STRING' }, rationale: { type: 'STRING' }, propagation: { type: 'STRING' } }, required: ['area', 'description'] } },
    risks: { type: 'ARRAY', items: { type: 'OBJECT', properties: { risk: { type: 'STRING' }, mitigation: { type: 'STRING' }, severity: { type: 'STRING' } }, required: ['risk'] } },
    gaps: { type: 'ARRAY', items: { type: 'OBJECT', properties: { gap: { type: 'STRING' }, recommendation: { type: 'STRING' } }, required: ['gap'] } },
  },
  required: ['summary', 'functional', 'technical', 'risks', 'gaps'],
} as const;

export interface ImpactRun {
  assessment: ImpactAssessment;
  model: string;
  level: DigestLevel;
  digest: { tokens: number; shown: Digest['shown']; total: Digest['total'] };
  tokens?: { prompt?: number; output?: number };
  /** True when the reply was cut off and only complete items were kept. */
  truncated: boolean;
}

/** What would be sent, without sending it: used to show the token estimate before the user commits. */
export function impactDigest(requirements: Requirement[], scope: ProjectScope, source: GraphSource, project: Project, level: DigestLevel): Digest {
  const moduleIds = new Set(project.moduleIds ?? []);
  for (const f of scope.functionalities) if (f.moduleId) moduleIds.add(f.moduleId);
  for (const s of scope.screens) if (s.moduleId) moduleIds.add(s.moduleId);
  return buildRepoDigest({
    modules: source.modules.filter((m) => moduleIds.has(m.id)),
    screens: scope.screens,
    functionalities: scope.functionalities,
    components: [...scope.directComponents, ...scope.dependencyComponents.map((d) => d.component)],
    requirements,
  }, level);
}

export async function assessImpact(
  project: Project,
  requirements: Requirement[],
  scope: ProjectScope,
  source: GraphSource,
  level: DigestLevel = 'standard',
  signal?: AbortSignal,
): Promise<ImpactRun> {
  const digest = impactDigest(requirements, scope, source, project, level);
  const apps = source.applications.filter((a) => (project.applicationIds ?? []).includes(a.id)).map((a) => a.name);
  const prompt = `PROJECT: ${project.name}${project.description ? ` | ${project.description.slice(0, 400)}` : ''}\nAPPLICATIONS IN SCOPE: ${apps.join(', ') || 'none linked'}\n\n${digest.text}`;

  const result = await generateJson<Record<string, unknown>>(prompt, {
    feature: 'impact',
    system: IMPACT_SYSTEM,
    responseSchema: SCHEMA as unknown as Record<string, unknown>,
    temperature: 0.2,
    maxOutputTokens: 16384,
    signal,
  });
  const raw = result.data ?? {};
  const item = (x: Record<string, unknown>) => ({ area: str(x.area), description: str(x.description), severity: severity(x.severity), impactedPart: str(x.impactedPart), currentState: str(x.currentState), proposedChange: str(x.proposedChange), rationale: str(x.rationale), propagation: str(x.propagation) });
  return {
    model: result.model,
    level,
    digest: { tokens: digest.tokens, shown: digest.shown, total: digest.total },
    tokens: { prompt: result.usage?.promptTokens, output: result.usage?.outputTokens },
    truncated: !!result.repaired,
    assessment: {
      summary: str(raw.summary),
      functional: records(raw.functional).map(item).filter((x) => x.area || x.description),
      technical: records(raw.technical).map(item).filter((x) => x.area || x.description),
      risks: records(raw.risks).map((x) => ({ risk: str(x.risk), mitigation: str(x.mitigation), severity: severity(x.severity) })).filter((x) => x.risk),
      gaps: records(raw.gaps).map((x) => ({ gap: str(x.gap), recommendation: str(x.recommendation) })).filter((x) => x.gap),
    },
  };
}
