/**
 * Section-level editing of a Markdown document. The model is given an index of headings and the text of the sections
 * the instruction is about, and answers with replacement sections only, so a change costs a few hundred tokens
 * instead of re-sending and re-writing the whole document. Pure, so it can be tested without the network.
 */

export interface DocSection {
  heading: string;
  level: number;
  /** Line index of the heading. */
  start: number;
  /** Line index after the last line of the section (exclusive). */
  end: number;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

export function indexSections(md: string): { lines: string[]; sections: DocSection[] } {
  const lines = md.replace(/\r/g, '').split('\n');
  const heads: Array<{ heading: string; level: number; start: number }> = [];
  let fence = false;
  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) fence = !fence;
    const h = !fence ? /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line) : null;
    if (h) heads.push({ heading: line.trim(), level: h[1].length, start: i });
  });
  const sections = heads.map((h, k) => {
    let end = lines.length;
    for (let j = k + 1; j < heads.length; j++) {
      if (heads[j].level <= h.level) { end = heads[j].start; break; }
    }
    return { ...h, end };
  });
  return { lines, sections };
}

const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
const STOP = new Set('the and for with that this from into add change update remove make section sections please should must need also more less all any'.split(' '));

/** Headings plus the bodies of the sections most related to the instruction, within a character budget. */
export function revisionContext(md: string, instruction: string, budget = 9000): { index: string; bodies: string; included: string[] } {
  const { lines, sections } = indexSections(md);
  const index = sections.map((s) => `${'  '.repeat(s.level - 1)}${s.heading}`).join('\n');
  const want = [...words(instruction)].filter((w) => !STOP.has(w));
  // Leaf-most sections only: a parent's text would repeat its children.
  const own = sections.map((s, i) => {
    const next = sections[i + 1];
    const stop = next && next.start < s.end ? next.start : s.end;
    return { s, text: lines.slice(s.start, stop).join('\n') };
  });
  const scored = own
    .map(({ s, text }) => {
      const hw = words(s.heading);
      const bw = words(text);
      let score = 0;
      for (const w of want) { if (hw.has(w)) score += 3; else if (bw.has(w)) score += 1; }
      return { s, text, score };
    })
    .filter((x) => x.score > 0 && x.text.trim().length > 0)
    .sort((a, b) => b.score - a.score);
  let used = 0;
  const included: string[] = [];
  const bodies: string[] = [];
  for (const x of scored) {
    if (used + x.text.length > budget) continue;
    bodies.push(x.text);
    included.push(x.s.heading);
    used += x.text.length;
  }
  return { index, bodies: bodies.join('\n\n'), included };
}

export interface Patch { heading: string; markdown: string }

export interface PatchResult { markdown: string; applied: string[]; skipped: string[] }

/** Replaces whole sections by exact heading (case and numbering-insensitive). A patch that loses its heading line gets it back. */
export function applyPatches(md: string, patches: Patch[]): PatchResult {
  let current = md.replace(/\r/g, '');
  const applied: string[] = [];
  const skipped: string[] = [];
  for (const p of patches) {
    const body = p.markdown.replace(/\r/g, '').trim();
    if (!p.heading.trim() || !body) { skipped.push(p.heading || '(empty)'); continue; }
    const { lines, sections } = indexSections(current);
    const key = norm(p.heading.replace(/^#+\s*/, ''));
    const matches = sections.filter((s) => norm(s.heading.replace(/^#+\s*/, '')) === key);
    if (matches.length !== 1) { skipped.push(`${p.heading} (${matches.length === 0 ? 'not found' : 'ambiguous'})`); continue; }
    const target = matches[0];
    // The heading is owned by the template: whatever heading line the patch starts with is replaced by the original.
    const patchLines = body.split('\n');
    const bodyLines = /^#{1,6}\s/.test(patchLines[0]) ? patchLines.slice(1) : patchLines;
    const fixed = [target.heading, '', ...bodyLines].join('\n');
    current = [...lines.slice(0, target.start), ...fixed.split('\n'), ...lines.slice(target.end)].join('\n');
    applied.push(target.heading);
  }
  return { markdown: current.replace(/\n{3,}/g, '\n\n'), applied, skipped };
}
