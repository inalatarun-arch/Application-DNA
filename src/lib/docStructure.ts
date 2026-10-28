/**
 * Turns the HTML that Word-to-HTML conversion produces into Markdown that keeps headings, lists and tables, and
 * splits long Markdown into parts along its headings. Plain-text extraction flattens tables into run-on lines; this
 * keeps the "row = record, column = field" shape that specifications are written in, so an AI (or a person) can read it.
 * Pure and dependency-free.
 */

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const inline = (html: string): string => decodeEntities(
  html
    .replace(/<br\s*\/?>/gi, ' / ')
    .replace(/<\/(p|div|li)>\s*(?=<(p|div|li)\b)/gi, ' ')
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/<[^>]+>/g, ''),
).replace(/\s+/g, ' ').trim();

const cell = (html: string): string => inline(html).replace(/\|/g, '\\|');

function tableToMarkdown(table: string): string {
  const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => [...m[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => cell(c[1])));
  const nonEmpty = rows.filter((r) => r.some(Boolean));
  if (!nonEmpty.length) return '';
  const width = Math.max(...nonEmpty.map((r) => r.length));
  const line = (r: string[]) => `| ${Array.from({ length: width }, (_, i) => r[i] ?? '').join(' | ')} |`;
  return [line(nonEmpty[0]), `| ${Array.from({ length: width }, () => '---').join(' | ')} |`, ...nonEmpty.slice(1).map(line)].join('\n');
}

/** Headings become #..###### lines, tables become pipe tables, list items become "- " lines, everything else plain paragraphs. */
export function htmlToMarkdown(html: string): string {
  const blocks: string[] = [];
  const tokens = html.matchAll(/<table\b[\s\S]*?<\/table>|<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>|<li\b[^>]*>([\s\S]*?)<\/li>|<p\b[^>]*>([\s\S]*?)<\/p>/gi);
  for (const m of tokens) {
    const whole = m[0];
    if (/^<table/i.test(whole)) { const t = tableToMarkdown(whole); if (t) blocks.push(t); } else if (m[1]) { const t = inline(m[2]); if (t) blocks.push(`${'#'.repeat(Number(m[1]))} ${t}`); } else if (m[3] !== undefined) { const t = inline(m[3]); if (t) blocks.push(`- ${t}`); } else { const t = inline(m[4] ?? ''); if (t) blocks.push(t); }
  }
  // Lists read better with their items together; everything else is separated by a blank line.
  return blocks.reduce((out, b, i) => out + (i === 0 ? '' : b.startsWith('- ') && blocks[i - 1].startsWith('- ') ? '\n' : '\n\n') + b, '');
}

// ------------------------------------------------------------------ splitting

export interface DocPart {
  /** Headings above the first line of this part, outermost first, so a reader knows where in the document it sits. */
  path: string[];
  text: string;
}

interface Atom { level: number; path: string[]; text: string }

const HEADING = /^(#{1,6})\s+(.*)$/;

/**
 * Cuts Markdown into parts of at most about `maxChars`, only between sections (a heading and its body always stay
 * together, and a table is never cut between rows unless one table alone is larger than the limit). Parts start at a
 * major heading where possible.
 */
export function splitByHeadings(markdown: string, maxChars = 24_000): DocPart[] {
  const atoms: Atom[] = [];
  const stack: Array<{ level: number; title: string }> = [];
  let cur: Atom | null = null;
  const flush = () => { if (cur && cur.text.trim()) atoms.push(cur); cur = null; };
  for (const line of markdown.split('\n')) {
    const h = HEADING.exec(line);
    if (h) {
      flush();
      const level = h[1].length;
      while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
      cur = { level, path: stack.map((s) => s.title), text: `${line}\n` };
      stack.push({ level, title: h[2].trim() });
    } else {
      cur ??= { level: 0, path: [], text: '' };
      cur.text += `${line}\n`;
    }
  }
  flush();

  // A single section larger than the limit is cut at line boundaries (keeping its own heading path).
  const sized: Atom[] = [];
  for (const a of atoms) {
    if (a.text.length <= maxChars) { sized.push(a); continue; }
    let buf = '';
    for (const line of a.text.split('\n')) {
      if (buf.length + line.length + 1 > maxChars && buf) { sized.push({ ...a, text: buf }); buf = ''; }
      buf += `${line}\n`;
    }
    if (buf.trim()) sized.push({ ...a, text: buf });
  }

  const parts: DocPart[] = [];
  let part: { path: string[]; text: string } | null = null;
  for (const a of sized) {
    if (part && (part.text.length + a.text.length > maxChars || (a.level > 0 && a.level <= 2 && part.text.length >= maxChars * 0.6))) { parts.push(part); part = null; }
    if (!part) part = { path: a.path, text: '' };
    part.text += `${a.text}\n`;
  }
  if (part) parts.push(part);
  return parts.map((p) => ({ path: p.path, text: p.text.trim() }));
}

/** Splits one part in two near its middle (at a line break), for retrying a part whose answer was cut off. */
export function halve(part: DocPart): [DocPart, DocPart] | null {
  const lines = part.text.split('\n');
  if (lines.length < 6) return null;
  const mid = Math.floor(part.text.length / 2);
  let acc = 0;
  let at = 0;
  for (let i = 0; i < lines.length; i++) { acc += lines[i].length + 1; if (acc >= mid) { at = i; break; } }
  // Prefer breaking just before a heading or blank line close to the middle so records stay whole.
  for (let d = 0; d < 12; d++) {
    for (const i of [at + d, at - d]) if (i > 1 && i < lines.length - 1 && (HEADING.test(lines[i]) || lines[i] === '')) return [{ path: part.path, text: lines.slice(0, i).join('\n').trim() }, { path: part.path, text: lines.slice(i).join('\n').trim() }];
  }
  return [{ path: part.path, text: lines.slice(0, at).join('\n').trim() }, { path: part.path, text: lines.slice(at).join('\n').trim() }];
}
