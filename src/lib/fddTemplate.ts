/**
 * Functional Design Document (FDD/FRD) template and the structure checks around it.
 * The model writes the content; this module owns the headings, table columns and order, so every
 * generated document has the same shape no matter what the model does. Pure and dependency-free.
 */

export interface TplSection {
  /** Markdown heading level (1 to 4). */
  level: 1 | 2 | 3 | 4;
  /** Numbering such as "1.6" or "3.2.4"; empty for unnumbered sub-headings. */
  num: string;
  title: string;
  /** What belongs under the heading. Shown to the model inside {{ }}; never copied to output. */
  hint: string;
}

const t = (level: TplSection['level'], num: string, title: string, hint: string): TplSection => ({ level, num, title, hint });

export const TABLES = {
  risks: ['Risk/Assumption', 'Likelihood', 'Impact', 'Mitigation Strategy'],
  roles: ['Role', 'Functionality'],
  useCase: ['Item', 'Detail'],
  buttons: ['Button', 'Action', 'Result'],
  fields: ['Field Label', 'Type', 'Mandatory', 'Length', 'Data Type', 'Value Set', 'Default', 'Source'],
  rules: ['Field Label', 'Rule', 'Error', 'Dependencies', 'Notes'],
  controls: ['Name', 'Tooltip', 'Visible', 'Enable/Disable', 'Navigate To', 'Validations', 'Dependencies'],
  io: ['Input', 'Output', 'Dependency', 'Criteria', 'Remarks'],
  edge: ['Edge Case', 'Frequency', 'Solution', 'Workaround'],
  terms: ['Term', 'Definition'],
  acronyms: ['Acronym', 'Expansion'],
  abbreviations: ['Abbreviation', 'Meaning'],
  questions: ['Question', 'Owner', 'Needed By'],
} as const;

const cols = (c: readonly string[]) => `Markdown table with exactly these columns: ${c.join(' | ')}.`;
export const USE_CASE_ROWS = ['Goal', 'Actors', 'Pre-Conditions', 'Steps', 'Post-Conditions', 'Summary'];

/** Sections 1 and 2. */
export const FDD_PART_OVERVIEW: TplSection[] = [
  t(1, '1', 'Introduction', ''),
  t(2, '1.1', 'Purpose of Documentation', 'One short paragraph: why this document exists, who reads it, what it covers.'),
  t(2, '1.2', 'Problem Statement', 'The business problem in two to four sentences, from the requirements.'),
  t(2, '1.3', 'High Level User Stories', 'Bullets "US-nn As a <role>, I want <goal>, so that <value>". Use the supplied stories and codes.'),
  t(2, '1.4', 'Objectives of the Solution', 'Bullets of measurable outcomes the solution must achieve.'),
  t(2, '1.5', 'Out of Scope', 'Bullets of what this solution does not cover.'),
  t(2, '1.6', 'Risks and Assumptions', cols(TABLES.risks) + ' Likelihood and Impact are High, Medium or Low.'),
  t(1, '2', 'System/Solution Overview', ''),
  t(2, '2.1', 'Business Process Model', 'A Mermaid flowchart of the future-state process in a ```mermaid fence, then two to three sentences explaining it.'),
  t(2, '2.2', 'Activity Flow', 'Numbered activities in order: who does what, and what the system does in response.'),
  t(2, '2.3', 'Dependencies and Change Impacts', ''),
  t(3, '2.3.1', 'External Dependencies', 'Bullets: systems, vendors or teams outside this application the solution relies on.'),
  t(3, '2.3.2', 'Internal Dependencies', 'Bullets: modules, screens, components and data inside the application the solution relies on.'),
  t(3, '2.3.3', 'External Change Impacts', 'Bullets: what changes for outside systems and teams, with the reason.'),
  t(3, '2.3.4', 'Internal Change Impacts', 'Bullets: what changes inside the application, naming screens, functionalities and components.'),
  t(2, '2.4', 'Role Matrix', cols(TABLES.roles) + ' One row per role.'),
];

/** Sections 4 and 5. */
export const FDD_PART_CLOSING: TplSection[] = [
  t(1, '4', 'Non-Functional Requirements', ''),
  t(2, '4.1', 'Performance', 'Bullets "The system shall ..." with measurable targets only when the source gives them.'),
  t(2, '4.2', 'Security', 'Bullets "The system shall ..." covering access, data protection, audit.'),
  t(2, '4.3', 'Accessibility', 'Bullets "The system shall ..." covering usability and accessibility.'),
  t(2, '4.4', 'Scalability', 'Bullets "The system shall ..." covering volume and growth.'),
  t(2, '4.5', 'Possible Edge Cases and Handling', cols(TABLES.edge) + ' Frequency is Rare, Occasional or Frequent.'),
  t(1, '5', 'Appendix/Glossary', ''),
  t(2, '5.1', 'Definitions', cols(TABLES.terms)),
  t(2, '5.2', 'Acronyms', cols(TABLES.acronyms)),
  t(2, '5.3', 'Abbreviations', cols(TABLES.abbreviations)),
  t(2, '5.4', 'References', 'Bullets of source documents, meetings and standards used.'),
  t(2, '5.5', 'Related Documents', 'Bullets of related documents (TDD, test plan, impact assessment) that exist or are planned.'),
  t(2, '5.6', 'Open Questions', cols(TABLES.questions)),
];

/** One functionality in section 3. `n` is its number (1-based). */
export function functionalitySections(n: number, title: string): TplSection[] {
  const p = `3.${n}`;
  return [
    t(2, p, title, ''),
    t(3, `${p}.1`, 'Use Case', `Two-column Markdown table (Item | Detail) with exactly these rows in order: ${USE_CASE_ROWS.join(', ')}. Steps are numbered inside the cell separated by <br>.`),
    t(3, `${p}.2`, 'Wireframes', `Do not write image lines. Write only: ${cols(TABLES.buttons)} One row per button or action on the screen.`),
    t(3, `${p}.3`, 'Functional Requirements', `Numbered list "FR-${n}.1 The system shall ..." one testable requirement per line, citing REQ codes.`),
    t(3, `${p}.4`, 'Field Level Specifications', ''),
    t(4, '', 'Form Elements', cols(TABLES.fields)),
    t(4, '', 'Business Rules and Dependencies', cols(TABLES.rules)),
    t(4, '', 'Buttons, Links, and Icons', cols(TABLES.controls)),
    t(4, '', 'Inputs and Outputs', cols(TABLES.io)),
  ];
}

export const SECTION_3_HEADING: TplSection = t(1, '3', 'Functional Specifications', '');

// ---------------------------------------------------------------- rendering

export const headingLine = (s: TplSection) => `${'#'.repeat(s.level)} ${s.num ? `${s.num} ` : ''}${s.title}`;

/** Skeleton shown to the model: headings with {{guidance}} under each. */
export function renderSkeleton(sections: TplSection[]): string {
  return sections.map((s) => `${headingLine(s)}${s.hint ? `\n{{${s.hint}}}` : ''}`).join('\n\n');
}

/** Heading list stored as the organisation template; "3.n" stands for each functionality. */
export function defaultFrdHeadings(): string[] {
  return [
    ...FDD_PART_OVERVIEW.map(headingLine),
    headingLine(SECTION_3_HEADING),
    ...functionalitySections(1, '[Functionality Title]').map(headingLine),
    ...FDD_PART_CLOSING.map(headingLine),
  ];
}

export const isFddTemplate = (headings: string) => /Functional Specifications/i.test(headings) && /Field Level Specifications/i.test(headings);

// ---------------------------------------------------------------- structure enforcement

const keyOf = (text: string) => text.toLowerCase().replace(/^\s*\d+(?:\.\d+)*\.?\s+/, '').replace(/[^a-z0-9]+/g, '');

export const NOT_DOCUMENTED = '_Not documented._';

/**
 * Rebuilds `md` so it has exactly the template's headings in the template's order.
 * Content under a recognised heading is kept; unrecognised headings become bold lines inside the section
 * they appeared in; missing sections get a "not documented" line. `prelude` text is inserted right after a heading.
 */
export function enforceTemplate(md: string, sections: TplSection[], prelude: Record<string, string> = {}): { markdown: string; missing: string[] } {
  const exact = new Map(sections.map((s, i) => [keyOf(s.title), i]));
  const byNum = new Map(sections.filter((s) => s.num).map((s) => [s.num, sections.indexOf(s)] as const));
  const bodies: string[][] = sections.map(() => []);
  const orphans: string[] = [];

  /** Exact title, then the heading's own number ("1.1"), then a title that contains or is contained in exactly one template title. */
  const match = (heading: string): number | undefined => {
    const k = keyOf(heading);
    const hit = exact.get(k);
    if (hit !== undefined && sections[hit].title !== '') return hit;
    const num = /^\s*(\d+(?:\.\d+)*)\.?\s/.exec(heading)?.[1];
    if (num && byNum.has(num)) return byNum.get(num);
    if (k.length >= 4) {
      const cands = sections.map((s, i) => ({ i, key: keyOf(s.title) })).filter((c) => c.key.length >= 4 && (c.key.includes(k) || k.includes(c.key)));
      if (cands.length === 1) return cands[0].i;
    }
    return undefined;
  };

  let current = -1;
  let inFence = false;
  for (const line of md.replace(/\r/g, '').split('\n')) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    const h = !inFence ? /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line) : null;
    if (h) {
      const idx = match(h[2]);
      if (idx !== undefined) {
        current = idx;
        continue;
      }
      (current >= 0 ? bodies[current] : orphans).push(`**${h[2]}**`);
      continue;
    }
    (current >= 0 ? bodies[current] : orphans).push(line);
  }
  // Text before any recognised heading is kept (in the first section that holds content) rather than silently lost.
  const orphanText = orphans.join('\n').trim();
  if (orphanText) {
    const first = sections.findIndex((s, i) => !(!s.hint && s.level < 4 && sections[i + 1] && sections[i + 1].level > s.level));
    if (first >= 0) bodies[first].unshift(orphanText, '');
  }

  const missing: string[] = [];
  const out: string[] = [];
  sections.forEach((s, i) => {
    const body = bodies[i].join('\n').replace(/\{\{[^}]*\}\}/g, '').trim();
    out.push(headingLine(s));
    if (prelude[s.num || s.title]) out.push('', prelude[s.num || s.title]);
    const isContainer = !s.hint && s.level < 4 && sections[i + 1] && sections[i + 1].level > s.level;
    if (body) out.push('', body);
    else if (!isContainer) {
      missing.push(headingLine(s));
      out.push('', NOT_DOCUMENTED);
    }
    out.push('');
  });
  return { markdown: out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd(), missing };
}

/**
 * Splits model output for section 3 into one chunk per functionality, in order, by its level-2 headings.
 * Text before the first level-2 heading is ignored.
 */
export function splitFunctionalityChunks(md: string): string[] {
  const chunks: string[] = [];
  let inFence = false;
  for (const line of md.replace(/\r/g, '').split('\n')) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    if (!inFence && /^##\s+/.test(line)) chunks.push(line);
    else if (chunks.length) chunks[chunks.length - 1] += `\n${line}`;
  }
  return chunks;
}

/** Markdown table headers found in a document, used to confirm the required columns are present. */
export function tableHeaders(md: string): string[][] {
  const lines = md.split('\n');
  const out: string[][] = [];
  for (let i = 0; i + 1 < lines.length; i++) {
    if (/^\s*\|/.test(lines[i]) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      out.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
    }
  }
  return out;
}
