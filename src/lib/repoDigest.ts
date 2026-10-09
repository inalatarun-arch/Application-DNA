/**
 * Compact markdown digest of the documented repository, built for prompts.
 * Short codes (M1, S1, F1, C1) replace ids and long names in links, items are ranked by relevance to the
 * requirements, and a character budget decides how much detail fits. Pure, so it is easy to test.
 */

export type DigestLevel = 'lean' | 'standard' | 'deep';

export const DIGEST_BUDGET: Record<DigestLevel, number> = { lean: 6_000, standard: 14_000, deep: 30_000 };
export const DIGEST_LABEL: Record<DigestLevel, string> = {
  lean: 'Lean: names, purposes and links',
  standard: 'Standard: adds rules, fields, inputs and outputs',
  deep: 'Deep: adds exceptions, flow steps and table columns',
};

interface DModule { id: string; name: string; description?: string }
interface DScreen {
  id: string; name: string; moduleId?: string; purpose?: string; businessProcess?: string;
  uiElements?: Array<{ name: string; type: string; required: boolean }>;
  validationRules?: string[]; workflowSteps?: string[]; approvalLogic?: string; exceptionHandling?: string[];
  upstreamSystems?: string[]; downstreamSystems?: string[];
}
interface DFunctionality {
  id: string; name: string; screenId?: string; moduleId?: string; description?: string; businessPurpose?: string;
  userRoles?: string[]; triggers?: string[]; inputs?: string[]; outputs?: string[];
  exceptions?: { validation: string[]; error: string[]; business: string[]; system: string[] };
  upstreamSystems?: string[]; downstreamSystems?: string[]; relatedFunctionalityIds?: string[];
}
interface DComponent {
  id: string; name: string; kind: string; description?: string; functionalityIds?: string[]; screenIds?: string[];
  relatedComponentIds?: string[]; columns?: Array<{ name: string; dataType: string; key: string }>;
}
export interface DigestRequirement {
  id: string; kind: string; title: string; description: string; acceptanceCriteria?: string[];
  status: string; priority?: string; functionalityIds?: string[];
}

export interface DigestInput {
  modules: DModule[];
  screens: DScreen[];
  functionalities: DFunctionality[];
  components: DComponent[];
  requirements: DigestRequirement[];
}

export interface Digest {
  text: string;
  tokens: number;
  shown: { modules: number; screens: number; functionalities: number; components: number };
  total: { modules: number; screens: number; functionalities: number; components: number };
  /** code -> real name, so answers that cite a code can be resolved. */
  codes: Map<string, string>;
}

export const estimateTokens = (text: string) => Math.ceil(text.length / 4);

const clip = (s: string | undefined, n: number) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const list = (xs: string[] | undefined, n: number, each = 60) => (xs ?? []).slice(0, n).map((x) => clip(x, each)).filter(Boolean).join('; ');
const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []);

/** Requirement lines: code, kind, priority, status, title, trimmed description, acceptance criteria. */
export function requirementsDigest(reqs: DigestRequirement[], fnCode: Map<string, string>, max = 60): { text: string; codes: Map<string, string> } {
  const usable = reqs.filter((r) => r.status !== 'rejected');
  const codes = new Map<string, string>();
  const lines = usable.slice(0, max).map((r, i) => {
    const code = `REQ-${String(i + 1).padStart(3, '0')}`;
    codes.set(code, r.title);
    const fns = (r.functionalityIds ?? []).map((id) => fnCode.get(id)).filter(Boolean).join(',');
    const tentative = r.status === 'draft' ? ' (draft, tentative)' : '';
    const ac = (r.acceptanceCriteria ?? []).length ? ` AC: ${list(r.acceptanceCriteria, 3, 90)}` : '';
    return `${code} [${r.kind}|${r.priority ?? 'medium'}]${tentative} ${clip(r.title, 140)}: ${clip(r.description, 220)}${ac}${fns ? ` -> ${fns}` : ''}`;
  });
  const cut = usable.length > max ? ` (showing ${max} of ${usable.length})` : '';
  return { text: `${lines.join('\n')}${cut}`, codes };
}

export function buildRepoDigest(input: DigestInput, level: DigestLevel = 'standard'): Digest {
  const budget = DIGEST_BUDGET[level];
  const reqText = input.requirements.filter((r) => r.status !== 'rejected').map((r) => `${r.title} ${r.description}`).join(' ');
  const reqWords = words(reqText);
  const tagged = new Set(input.requirements.flatMap((r) => r.functionalityIds ?? []));

  const score = (name: string, extra = 0) => {
    let s = extra;
    for (const w of words(name)) if (reqWords.has(w)) s += 1;
    return s;
  };

  // Codes are assigned in relevance order so the most relevant items get the lowest numbers.
  const fnScore = new Map(input.functionalities.map((f) => [f.id, score(`${f.name} ${f.description ?? ''}`, tagged.has(f.id) ? 5 : 0)]));
  const fns = [...input.functionalities].sort((a, b) => (fnScore.get(b.id)! - fnScore.get(a.id)!) || a.name.localeCompare(b.name));
  const screenScore = new Map(input.screens.map((s) => [s.id, score(`${s.name} ${s.purpose ?? ''}`) + Math.max(0, ...input.functionalities.filter((f) => f.screenId === s.id).map((f) => fnScore.get(f.id)! * 0.5))]));
  const screens = [...input.screens].sort((a, b) => (screenScore.get(b.id)! - screenScore.get(a.id)!) || a.name.localeCompare(b.name));
  const compScore = new Map(input.components.map((c) => [c.id, score(`${c.name} ${c.description ?? ''}`) + Math.max(0, ...(c.functionalityIds ?? []).map((id) => (fnScore.get(id) ?? 0) * 0.5))]));
  const comps = [...input.components].sort((a, b) => (compScore.get(b.id)! - compScore.get(a.id)!) || a.name.localeCompare(b.name));

  const mCode = new Map(input.modules.map((m, i) => [m.id, `M${i + 1}`]));
  const sCode = new Map(screens.map((s, i) => [s.id, `S${i + 1}`]));
  const fCode = new Map(fns.map((f, i) => [f.id, `F${i + 1}`]));
  const cCode = new Map(comps.map((c, i) => [c.id, `C${i + 1}`]));
  const codes = new Map<string, string>();
  const codeList = (ids: string[] | undefined, map: Map<string, string>) => (ids ?? []).map((id) => map.get(id)).filter(Boolean).join(',');

  const deep = level === 'deep';
  const std = level !== 'lean';

  const modLines = input.modules.map((m) => {
    codes.set(mCode.get(m.id)!, m.name);
    return `${mCode.get(m.id)} ${m.name}${m.description ? `: ${clip(m.description, 100)}` : ''}`;
  });
  const screenLine = (s: DScreen) => {
    const code = sCode.get(s.id)!;
    codes.set(code, s.name);
    const parts = [`${code} ${s.name}${s.moduleId && mCode.get(s.moduleId) ? ` [${mCode.get(s.moduleId)}]` : ''}`];
    if (s.purpose) parts.push(clip(s.purpose, std ? 140 : 90));
    if (std && s.uiElements?.length) parts.push(`fields: ${s.uiElements.slice(0, 12).map((u) => `${clip(u.name, 24)}${u.required ? '*' : ''}(${u.type})`).join(', ')}`);
    if (std && s.validationRules?.length) parts.push(`rules: ${list(s.validationRules, 4, 90)}`);
    if (deep && s.workflowSteps?.length) parts.push(`flow: ${s.workflowSteps.slice(0, 8).map((x) => clip(x, 40)).join(' > ')}`);
    if (deep && s.approvalLogic) parts.push(`approval: ${clip(s.approvalLogic, 100)}`);
    if (deep && s.exceptionHandling?.length) parts.push(`exceptions: ${list(s.exceptionHandling, 3, 80)}`);
    if (s.upstreamSystems?.length) parts.push(`up: ${list(s.upstreamSystems, 4, 30)}`);
    if (s.downstreamSystems?.length) parts.push(`down: ${list(s.downstreamSystems, 4, 30)}`);
    return parts.join(' | ');
  };
  const fnLine = (f: DFunctionality) => {
    const code = fCode.get(f.id)!;
    codes.set(code, f.name);
    const parts = [`${code} ${f.name}${f.screenId && sCode.get(f.screenId) ? ` [${sCode.get(f.screenId)}]` : ''}`];
    const d = f.businessPurpose || f.description;
    if (d) parts.push(clip(d, std ? 150 : 90));
    if (f.userRoles?.length) parts.push(`roles: ${list(f.userRoles, 4, 24)}`);
    if (std && f.triggers?.length) parts.push(`trigger: ${list(f.triggers, 3, 50)}`);
    if (std && f.inputs?.length) parts.push(`in: ${list(f.inputs, 5, 40)}`);
    if (std && f.outputs?.length) parts.push(`out: ${list(f.outputs, 5, 40)}`);
    if (deep && f.exceptions) {
      const ex = [...f.exceptions.validation, ...f.exceptions.business, ...f.exceptions.error, ...f.exceptions.system];
      if (ex.length) parts.push(`exceptions: ${list(ex, 4, 70)}`);
    }
    if (f.upstreamSystems?.length) parts.push(`up: ${list(f.upstreamSystems, 4, 30)}`);
    if (f.downstreamSystems?.length) parts.push(`down: ${list(f.downstreamSystems, 4, 30)}`);
    const rel = codeList(f.relatedFunctionalityIds, fCode);
    if (rel) parts.push(`-> ${rel}`);
    return parts.join(' | ');
  };
  const compLine = (c: DComponent) => {
    const code = cCode.get(c.id)!;
    codes.set(code, c.name);
    const parts = [`${code} ${c.name} (${c.kind})`];
    if (c.description) parts.push(clip(c.description, std ? 110 : 70));
    const used = [codeList(c.functionalityIds, fCode), codeList(c.screenIds, sCode)].filter(Boolean).join(',');
    if (used) parts.push(`used by: ${used}`);
    const dep = codeList(c.relatedComponentIds, cCode);
    if (dep) parts.push(`depends: ${dep}`);
    if (deep && c.columns?.length) parts.push(`cols: ${c.columns.slice(0, 12).map((x) => `${x.name} ${x.dataType}${x.key ? ' ' + x.key : ''}`).join(', ')}`);
    return parts.join(' | ');
  };

  // Fill the budget round-robin by relevance so no section is starved by a long one.
  const reqs = requirementsDigest(input.requirements, fCode);
  let used = modLines.join('\n').length + reqs.text.length + 200;
  const take = <T,>(items: T[], line: (x: T) => string, share: number): string[] => {
    const out: string[] = [];
    let spent = 0;
    for (const item of items) {
      const l = line(item);
      if (spent + l.length + 1 > budget * share || used + l.length + 1 > budget) break;
      out.push(l);
      spent += l.length + 1;
      used += l.length + 1;
    }
    return out;
  };
  const fLines = take(fns, fnLine, 0.4);
  const sLines = take(screens, screenLine, 0.3);
  const cLines = take(comps, compLine, 0.3);
  // Links that point at items cut by the budget are harmless: codes still exist, details just are not shown.
  const note = (shown: number, total: number) => (shown < total ? ` (showing ${shown} of ${total}, most relevant first)` : '');

  const text = [
    '# REPOSITORY DIGEST',
    'Codes: M module, S screen, F functionality, C component. "[S1]" = belongs to; "->" = related to; "*" = mandatory field.',
    `## Modules (${modLines.length})`, ...modLines,
    `## Screens${note(sLines.length, screens.length)}`, ...sLines,
    `## Functionalities${note(fLines.length, fns.length)}`, ...fLines,
    `## Technical components${note(cLines.length, comps.length)}`, ...cLines,
    '# REQUIREMENTS', reqs.text || '(none)',
  ].join('\n');
  for (const [k, v] of reqs.codes) codes.set(k, v);

  return {
    text,
    tokens: estimateTokens(text),
    shown: { modules: modLines.length, screens: sLines.length, functionalities: fLines.length, components: cLines.length },
    total: { modules: input.modules.length, screens: screens.length, functionalities: fns.length, components: comps.length },
    codes,
  };
}
