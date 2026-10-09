/**
 * FDD pipeline, free of network code: the caller supplies `deps.generate`, so the whole flow (parts, template
 * enforcement, partial failure handling) can be tested with a fake model.
 */
import type { DeliveryStory, Functionality, Project, Requirement, Screen } from '@/db/types';
import type { GraphSource } from '@/lib/graphModel';
import { buildRepoDigest, type DigestLevel } from '@/lib/repoDigest';
import {
  FDD_PART_CLOSING, FDD_PART_OVERVIEW, NOT_DOCUMENTED, SECTION_3_HEADING, enforceTemplate, functionalitySections,
  headingLine, renderSkeleton, splitFunctionalityChunks, type TplSection,
} from '@/lib/fddTemplate';
import { FRD_SYSTEM, capNote } from '@/prompts';

export interface GenResult { text: string; model: string; usage?: { promptTokens?: number; outputTokens?: number } }
export interface FddDeps {
  /** Writes one part. May throw; an abort must carry code "ABORTED". */
  generate: (prompt: string, system: string, signal?: AbortSignal) => Promise<GenResult>;
}

export const MAX_FDD_FUNCTIONALITIES = 30;
const PER_CALL = 2;

export interface FddInput {
  project: Project;
  requirements: Requirement[];
  stories: DeliveryStory[];
  source: GraphSource;
  /** Latest future-state flow as Mermaid; inserted into 2.1 by code. */
  futureFlow?: string;
  level: DigestLevel;
}

export interface DocRun {
  markdown: string;
  model: string;
  tokens: { prompt: number; output: number };
  /** Sections the model left empty (shown as "not documented"). */
  missing: string[];
  /** Parts that could not be generated at all. */
  failed: string[];
  notes: string[];
}

type Progress = (done: number, total: number, label: string) => void;
const isAbort = (err: unknown) => err instanceof Error && (err as { code?: string }).code === 'ABORTED';

const clip = (s: string | undefined, n: number) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const bullets = (label: string, xs: string[] | undefined, n = 10, each = 140) => {
  const items = (xs ?? []).map((x) => clip(x, each)).filter(Boolean);
  return items.length ? `${label}: ${items.slice(0, n).join('; ')}${items.length > n ? ` (+${items.length - n} more)` : ''}` : '';
};

/** Trace codes: stable within one run, listed in the prompt so the model can cite them. */
export function traceCodes(requirements: Requirement[], stories: DeliveryStory[]) {
  const usable = requirements.filter((r) => r.status !== 'rejected');
  const reqCode = new Map(usable.map((r, i) => [r.id, `REQ-${String(i + 1).padStart(3, '0')}`]));
  const storyCode = new Map(stories.map((s, i) => [s.id, `US-${String(i + 1).padStart(3, '0')}`]));
  return { usable, reqCode, storyCode };
}

/**
 * Functionalities a project covers: those requirements point at, those chosen on the project, and everything in the
 * linked modules (or in the linked applications when no module is chosen). Requirement-linked ones come first.
 */
export function pickFunctionalities(project: Project, requirements: Requirement[], source: GraphSource): Functionality[] {
  const reqFn = new Set(requirements.flatMap((r) => r.functionalityIds ?? []));
  const chosen = new Set(project.functionalityIds ?? []);
  const modules = new Set(project.moduleIds ?? []);
  const apps = new Set(project.applicationIds ?? []);
  const inScope = (f: Functionality) => (modules.size ? modules.has(f.moduleId ?? '') : apps.has(f.applicationId));
  return source.functionalities
    .filter((f) => reqFn.has(f.id) || chosen.has(f.id) || inScope(f))
    .sort((a, b) => Number(reqFn.has(b.id)) - Number(reqFn.has(a.id)) || a.name.localeCompare(b.name));
}

export function storiesText(stories: DeliveryStory[], storyCode: Map<string, string>, reqCode: Map<string, string>, max = 40): string {
  const shown = stories.slice(0, max);
  const lines = shown.map((s) => `${storyCode.get(s.id)} ${clip(s.asA, 60)} wants ${clip(s.iWant, 140)} so that ${clip(s.soThat, 100)}${s.requirementIds.length ? ` (${s.requirementIds.map((id) => reqCode.get(id)).filter(Boolean).join(',')})` : ''}`);
  return (lines.join('\n') || '(none)') + capNote(shown.length, stories.length);
}

export function reqLines(requirements: Requirement[], reqCode: Map<string, string>, max = 60): string {
  const usable = requirements.filter((r) => r.status !== 'rejected');
  const shown = usable.slice(0, max);
  const lines = shown.map((r) => `${reqCode.get(r.id)} [${r.kind}${r.status === 'draft' ? ', draft' : ''}] ${clip(r.title, 140)}: ${clip(r.description, 220)}${r.acceptanceCriteria.length ? ` AC: ${r.acceptanceCriteria.slice(0, 3).map((a) => clip(a, 80)).join('; ')}` : ''}`);
  return (lines.join('\n') || '(none)') + capNote(shown.length, usable.length);
}

function screenEvidence(s: Screen | undefined): string {
  if (!s) return 'SCREEN: not documented';
  const fields = (s.uiElements ?? []).slice(0, 40).map((u) => `${clip(u.name, 40)} (${u.type}${u.required ? ', mandatory' : ''}${u.description ? `: ${clip(u.description, 80)}` : ''}${u.action ? `; action: ${clip(u.action, 60)}` : ''})`);
  return [
    `SCREEN: ${s.name}`,
    s.purpose && `Purpose: ${clip(s.purpose, 200)}`,
    s.navigationPath && `Navigation: ${clip(s.navigationPath, 120)}`,
    fields.length && `Controls: ${fields.join('; ')}`,
    bullets('Field notes', (s.fieldDescriptions ?? []).map((f) => `${f.field}: ${f.description}`), 20, 120),
    bullets('Screen rules', s.validationRules, 12),
    bullets('Workflow', s.workflowSteps, 12, 100),
    s.approvalLogic && `Approval: ${clip(s.approvalLogic, 160)}`,
    bullets('Screen exceptions', s.exceptionHandling, 8),
  ].filter(Boolean).join('\n');
}

function functionalityEvidenceBlock(f: Functionality, source: GraphSource, reqCode: Map<string, string>, requirements: Requirement[]): string {
  const screen = f.screenId ? source.screens.find((s) => s.id === f.screenId) : undefined;
  const comps = source.components.filter((c) => (c.functionalityIds ?? []).includes(f.id)).slice(0, 10);
  const linked = requirements.filter((r) => r.status !== 'rejected' && (r.functionalityIds ?? []).includes(f.id)).map((r) => reqCode.get(r.id)).filter(Boolean);
  return [
    `FUNCTIONALITY: ${f.name}`,
    f.description && `Description: ${clip(f.description, 400)}`,
    f.businessPurpose && `Purpose: ${clip(f.businessPurpose, 300)}`,
    bullets('Roles', f.userRoles, 10, 60),
    bullets('Triggers', f.triggers, 6),
    bullets('Inputs', f.inputs, 12, 80),
    bullets('Outputs', f.outputs, 12, 80),
    bullets('Validation exceptions', f.exceptions?.validation, 8),
    bullets('Business exceptions', f.exceptions?.business, 8),
    bullets('System/error exceptions', [...(f.exceptions?.system ?? []), ...(f.exceptions?.error ?? [])], 8),
    bullets('Upstream', f.upstreamSystems, 6, 60),
    bullets('Downstream', f.downstreamSystems, 6, 60),
    comps.length && `Components: ${comps.map((c) => `${c.name} (${c.kind})`).join(', ')}`,
    linked.length && `Requirements: ${linked.join(', ')}`,
    screenEvidence(screen),
  ].filter(Boolean).join('\n');
}

/** One generation step with a single retry for transient trouble; returns null when the part came back empty. */
async function runPart(deps: FddDeps, prompt: string, signal?: AbortSignal): Promise<GenResult | null> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await deps.generate(prompt, FRD_SYSTEM, signal);
      if (r.text.trim()) return r;
    } catch (err) {
      if (isAbort(err)) throw err;
      lastError = err;
    }
  }
  if (lastError instanceof Error) throw lastError;
  return null;
}

export async function generateFdd(input: FddInput, deps: FddDeps, onProgress?: Progress, signal?: AbortSignal): Promise<DocRun> {
  const { project, requirements, stories, source, level } = input;
  const { usable, reqCode, storyCode } = traceCodes(requirements, stories);
  const notes: string[] = [];
  const failed: string[] = [];
  const missing: string[] = [];
  const tokens = { prompt: 0, output: 0 };
  let model = '';

  const projectModules = new Set(project.moduleIds ?? []);
  const projectApps = new Set(project.applicationIds ?? []);
  let fns = pickFunctionalities(project, usable, source);
  if (fns.length > MAX_FDD_FUNCTIONALITIES) {
    notes.push(`Section 3 covers ${MAX_FDD_FUNCTIONALITIES} of ${fns.length} functionalities in scope, those linked to requirements first. Narrow the project scope to cover the rest.`);
    fns = fns.slice(0, MAX_FDD_FUNCTIONALITIES);
  }

  const groups: Functionality[][] = [];
  for (let i = 0; i < fns.length; i += PER_CALL) groups.push(fns.slice(i, i + PER_CALL));
  const total = 2 + groups.length;
  let done = 0;

  const digest = buildRepoDigest({
    modules: source.modules.filter((m) => projectModules.has(m.id) || fns.some((f) => f.moduleId === m.id)),
    screens: source.screens.filter((s) => fns.some((f) => f.screenId === s.id)),
    functionalities: fns,
    components: source.components.filter((c) => (c.functionalityIds ?? []).some((id) => fns.some((f) => f.id === id))),
    requirements: usable,
  }, level);
  const facts = digest.text.split('\n# REQUIREMENTS')[0];

  const head = [
    `PROJECT: ${project.name}${project.description ? ` | ${clip(project.description, 500)}` : ''}`,
    `APPLICATIONS: ${source.applications.filter((a) => projectApps.has(a.id)).map((a) => a.name).join(', ') || 'not documented'}`,
    `REQUIREMENTS\n${reqLines(requirements, reqCode)}`,
    `USER STORIES\n${storiesText(stories, storyCode, reqCode)}`,
  ].join('\n\n');

  const add = (r: { model: string; usage?: { promptTokens?: number; outputTokens?: number } }) => {
    model = r.model || model;
    tokens.prompt += r.usage?.promptTokens ?? 0;
    tokens.output += r.usage?.outputTokens ?? 0;
  };

  // ---- Part 1: sections 1 and 2
  onProgress?.(done, total, 'Introduction and solution overview');
  const flow = (input.futureFlow ?? '').trim();
  const overview: TplSection[] = FDD_PART_OVERVIEW.map((s) =>
    s.num === '2.1' && flow ? { ...s, hint: 'The diagram is inserted automatically. Write only two to three sentences explaining the future-state process, including what is new or changed.' } : s,
  );
  const overviewPrelude: Record<string, string> = flow ? { '2.1': `\`\`\`mermaid\n${flow}\n\`\`\`` } : {};
  let overviewMd = '';
  try {
    const r = await runPart(deps, `${head}\n\nREPOSITORY FACTS\n${facts}\n\nFUTURE-STATE FLOW: ${flow ? 'provided and inserted into 2.1' : 'not available, so draw it in 2.1'}\n\nWrite these sections of the FDD, using exactly these headings. Text in {{ }} is guidance, not output.\n\n${renderSkeleton(overview)}`, signal);
    if (r) { add(r); overviewMd = r.text; }
  } catch (err) {
    if (isAbort(err)) throw err;
    failed.push('Sections 1 and 2');
  }
  const o = enforceTemplate(overviewMd, overview, overviewPrelude);
  missing.push(...o.missing);
  done++;

  // ---- Part 2: section 3, a few functionalities per call
  const functionalChunks: string[] = [];
  let n = 0;
  for (const group of groups) {
    onProgress?.(done, total, `Functional specifications ${n + 1} to ${n + group.length} of ${fns.length}`);
    const sections = group.flatMap((f, i) => functionalitySections(n + i + 1, f.name));
    const evidence = group.map((f) => functionalityEvidenceBlock(f, source, reqCode, usable)).join('\n\n---\n\n');
    let md = '';
    try {
      const r = await runPart(deps, `${head.split('\n\nUSER STORIES')[0]}\n\nEVIDENCE\n${evidence}\n\nWrite section 3 entries for exactly these ${group.length} functionalit${group.length === 1 ? 'y' : 'ies'}, in this order, using exactly these headings. Text in {{ }} is guidance, not output. Use only the evidence above; write "not documented" in a cell when the evidence does not say.\n\n${renderSkeleton(sections)}`, signal);
      if (r) { add(r); md = r.text; }
    } catch (err) {
      if (isAbort(err)) throw err;
      failed.push(`Functional specifications: ${group.map((f) => f.name).join(', ')}`);
    }
    const chunks = splitFunctionalityChunks(md);
    group.forEach((f, i) => {
      const num = n + i + 1;
      const own = functionalitySections(num, f.name);
      const screen = f.screenId ? source.screens.find((s) => s.id === f.screenId) : undefined;
      const wire = `![Wireframe: ${screen?.name ?? f.name}](wireframe:${screen?.id ?? 'none'})`;
      // Chunks arrive in order; the title is forced to the real name so numbering never depends on the model.
      const e = enforceTemplate(chunks[i] ?? '', own, { [`3.${num}.2`]: wire });
      missing.push(...e.missing);
      functionalChunks.push(e.markdown);
    });
    n += group.length;
    done++;
  }

  // ---- Part 3: sections 4 and 5
  onProgress?.(done, total, 'Non-functional requirements and appendix');
  let closingMd = '';
  const nfr = usable.filter((r) => r.kind === 'non-functional' || r.kind === 'integration' || r.kind === 'reporting');
  try {
    const exceptions = fns.slice(0, 15).map((f) => bullets(`${f.name} exceptions`, [...(f.exceptions?.validation ?? []), ...(f.exceptions?.business ?? []), ...(f.exceptions?.system ?? []), ...(f.exceptions?.error ?? [])], 4, 100)).filter(Boolean).join('\n');
    const r = await runPart(deps, `${head.split('\n\nUSER STORIES')[0]}\n\nNON-FUNCTIONAL, INTEGRATION AND REPORTING REQUIREMENTS\n${reqLines(nfr, reqCode, 40)}\n\nDOCUMENTED EXCEPTIONS\n${exceptions || '(none)'}\n\nTERMS SEEN IN THE SOURCES: ${[...new Set([...fns.map((f) => f.name), ...source.modules.slice(0, 20).map((m) => m.name)])].slice(0, 40).join(', ')}\n\nWrite these sections of the FDD, using exactly these headings. Text in {{ }} is guidance, not output.\n\n${renderSkeleton(FDD_PART_CLOSING)}`, signal);
    if (r) { add(r); closingMd = r.text; }
  } catch (err) {
    if (isAbort(err)) throw err;
    failed.push('Sections 4 and 5');
  }
  const c = enforceTemplate(closingMd, FDD_PART_CLOSING);
  missing.push(...c.missing);
  done++;
  onProgress?.(done, total, 'Done');

  const section3 = functionalChunks.length ? functionalChunks.join('\n\n') : NOT_DOCUMENTED;
  const markdown = [o.markdown, headingLine(SECTION_3_HEADING), section3, c.markdown].join('\n\n');
  if (failed.length) notes.push(`${failed.length} part${failed.length === 1 ? '' : 's'} could not be generated and ${failed.length === 1 ? 'is' : 'are'} marked "not documented". Use "Revise with AI" or generate again.`);
  return { markdown, model, tokens, missing, failed, notes };
}

