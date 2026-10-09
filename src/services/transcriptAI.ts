/**
 * Gemini pipeline: raw meeting transcript -> structured notes plus requirement suggestions.
 * The model is asked for JSON against a schema, and everything it returns is sanitised before use.
 */
import { generateJson } from './geminiService';
import { TRANSCRIPT_SYSTEM, fileWrap } from '@/prompts';
import type { AppModule, Application, Functionality, Meeting, MeetingAction, MeetingDecision, Project, RequirementCandidate, RequirementKind } from '@/db/types';

export const MAX_TRANSCRIPT_CHARS = 400_000;
const MAX_FUNCTIONALITIES_IN_PROMPT = 150;

type Suggestion = Pick<RequirementCandidate, 'kind' | 'title' | 'description' | 'acceptanceCriteria' | 'priority' | 'sourceQuote' | 'functionalityIds'>;

export interface ExtractionContext {
  project: Project;
  meeting: Pick<Meeting, 'title' | 'meetingDate' | 'attendees' | 'transcript'>;
  applications: Application[];
  modules: AppModule[];
  /** Functionalities in the project's scope; the model may only reference these. */
  functionalities: Functionality[];
}

export interface ExtractionResult {
  summary: string;
  keyPoints: string[];
  decisions: MeetingDecision[];
  actionItems: MeetingAction[];
  openQuestions: string[];
  requirements: Suggestion[];
  model: string;
  truncated: boolean;
  /** True when the reply hit the output limit and only complete items were recovered. */
  outputCut: boolean;
}

interface RawExtraction {
  summary?: unknown;
  keyPoints?: unknown;
  decisions?: unknown;
  actionItems?: unknown;
  openQuestions?: unknown;
  requirements?: unknown;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const records = (v: unknown): Array<Record<string, unknown>> =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)) : [];
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => {
  const s = str(v).toLowerCase().replace(/[\s_]+/g, '-');
  return (allowed as readonly string[]).includes(s) ? (s as T) : fallback;
};

const KINDS = ['functional', 'non-functional', 'integration', 'reporting'] as const satisfies readonly RequirementKind[];
const PRIORITIES = ['high', 'medium', 'low'] as const;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    keyPoints: { type: 'ARRAY', items: { type: 'STRING' } },
    decisions: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { decision: { type: 'STRING' }, owner: { type: 'STRING' } }, required: ['decision'] },
    },
    actionItems: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { task: { type: 'STRING' }, assignee: { type: 'STRING' }, due: { type: 'STRING' } },
        required: ['task'],
      },
    },
    openQuestions: { type: 'ARRAY', items: { type: 'STRING' } },
    requirements: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          kind: { type: 'STRING' },
          title: { type: 'STRING' },
          description: { type: 'STRING' },
          acceptanceCriteria: { type: 'ARRAY', items: { type: 'STRING' } },
          priority: { type: 'STRING' },
          sourceQuote: { type: 'STRING' },
          relatedFunctionalities: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['kind', 'title', 'description'],
      },
    },
  },
  required: ['summary', 'keyPoints', 'decisions', 'actionItems', 'openQuestions', 'requirements'],
} as const;

function buildPrompt(ctx: ExtractionContext, transcript: string, functionalityNames: string[]): string {
  const appNames = ctx.applications.map((a) => a.name).join(', ') || 'none specified';
  const moduleNames = ctx.modules.map((m) => m.name).join(', ') || 'none specified';
  return `PROJECT
Name: ${ctx.project.name}
Description: ${ctx.project.description || 'not provided'}
Impacted applications: ${appNames}
Impacted modules: ${moduleNames}

MEETING
Title: ${ctx.meeting.title}
Date: ${ctx.meeting.meetingDate || 'unknown'}
Attendees: ${ctx.meeting.attendees.join(', ') || 'not listed'}

KNOWN FUNCTIONALITIES (for relatedFunctionalities)
${functionalityNames.length ? functionalityNames.map((n) => `- ${n}`).join('\n') : '(none documented)'}

TRANSCRIPT
${fileWrap('transcript', 'text/plain', transcript)}`;
}

export async function extractFromTranscript(ctx: ExtractionContext, signal?: AbortSignal): Promise<ExtractionResult> {
  const full = ctx.meeting.transcript.trim();
  const truncated = full.length > MAX_TRANSCRIPT_CHARS;
  const transcript = truncated ? full.slice(0, MAX_TRANSCRIPT_CHARS) : full;

  // Unique names so the model's answer can be mapped back to a single record.
  const byName = new Map<string, string>();
  for (const f of ctx.functionalities) {
    const key = f.name.trim().toLowerCase();
    if (key && !byName.has(key)) byName.set(key, f.id);
  }
  const names = ctx.functionalities
    .filter((f, i, all) => all.findIndex((x) => x.name.trim().toLowerCase() === f.name.trim().toLowerCase()) === i)
    .slice(0, MAX_FUNCTIONALITIES_IN_PROMPT)
    .map((f) => f.name.trim())
    .filter(Boolean);

  const result = await generateJson<RawExtraction>(buildPrompt(ctx, transcript, names), {
    feature: 'transcript',
    system: TRANSCRIPT_SYSTEM,
    responseSchema: SCHEMA as unknown as Record<string, unknown>,
    temperature: 0.2,
    maxOutputTokens: 32768,
    signal,
  });
  const raw = result.data ?? {};

  const requirements: Suggestion[] = records(raw.requirements)
    .map((r) => {
      const related = strList(r.relatedFunctionalities)
        .map((n) => byName.get(n.toLowerCase()))
        .filter((id): id is string => !!id);
      return {
        kind: pick(r.kind, KINDS, 'functional'),
        title: str(r.title).slice(0, 200),
        description: str(r.description),
        acceptanceCriteria: strList(r.acceptanceCriteria).slice(0, 8),
        priority: pick(r.priority, PRIORITIES, 'medium'),
        sourceQuote: str(r.sourceQuote).slice(0, 400),
        functionalityIds: [...new Set(related)],
      };
    })
    .filter((r) => r.title !== '');

  return {
    summary: str(raw.summary),
    keyPoints: strList(raw.keyPoints),
    decisions: records(raw.decisions)
      .map((d) => ({ text: str(d.decision), owner: str(d.owner) }))
      .filter((d) => d.text !== ''),
    actionItems: records(raw.actionItems)
      .map((a) => {
        const due = str(a.due);
        return { task: str(a.task), assignee: str(a.assignee) || 'Unassigned', due: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : '', done: false };
      })
      .filter((a) => a.task !== ''),
    openQuestions: strList(raw.openQuestions),
    requirements,
    model: result.model,
    truncated,
    outputCut: !!result.repaired,
  };
}
