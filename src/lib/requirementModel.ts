import type { Requirement } from '@/db/types';

type ReqKind = Requirement['kind'];
const KINDS: ReqKind[] = ['functional', 'non-functional', 'integration', 'reporting', 'business-rule', 'epic', 'feature', 'user-story'];
const PRIORITIES = ['low', 'medium', 'high'] as const;

export interface ExtractedRequirement {
  kind: ReqKind;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  priority: 'low' | 'medium' | 'high';
  parentTitle: string;
  functionalityNames: string[];
  operation: 'new' | 'changed';
  existingTitle: string;
  sourceQuote: string;
  sourceFile: string;
}
export interface ProjectRequirementExtraction { requirements: ExtractedRequirement[]; summary: string }

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const strs = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

/** Tolerates missing or malformed fields so one odd item never loses the rest. */
export function normalizeRequirements(raw: unknown): ProjectRequirementExtraction {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { summary?: unknown; requirements?: unknown };
  const items = Array.isArray(r.requirements) ? r.requirements : [];
  const out: ExtractedRequirement[] = [];
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    const x = it as Record<string, unknown>;
    const title = str(x.title);
    if (!title) continue;
    const kind = KINDS.find((k) => k === str(x.kind).toLowerCase()) ?? 'functional';
    const priority = PRIORITIES.find((p) => p === str(x.priority).toLowerCase()) ?? 'medium';
    out.push({
      kind, title: title.slice(0, 200), description: str(x.description), acceptanceCriteria: strs(x.acceptanceCriteria), priority,
      parentTitle: str(x.parentTitle), functionalityNames: strs(x.functionalityNames),
      operation: str(x.operation).toLowerCase() === 'changed' ? 'changed' : 'new',
      existingTitle: str(x.existingTitle), sourceQuote: str(x.sourceQuote), sourceFile: str(x.sourceFile),
    });
  }
  return { requirements: out, summary: str(r.summary) };
}

