/**
 * Tiny, dependency-free Markdown -> HTML renderer. Input is HTML-escaped first, so
 * model output can never inject scripts. Supports headings, paragraphs, bold/italic,
 * inline code, fenced code (```mermaid blocks are tagged for diagram rendering),
 * tables, ordered/unordered lists (nested), blockquotes, horizontal rules and links.
 */

export interface Heading {
  level: number;
  text: string;
  slug: string;
  line: number;
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section'
  );
}

function inline(text: string): string {
  let t = escapeHtml(text);
  const codes: string[] = [];
  t = t.replace(/`([^`]+)`/g, (_m, c: string) => {
    codes.push(`<code>${c}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*])\*([^*\s][^*]*)\*(?!\*)/g, '$1<em>$2</em>');
  // Image lines in generated documents are placeholders until the DOCX export embeds the real picture.
  t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt: string) => `<span class="md-wire">${alt || 'Image placeholder'}</span>`);
  t = t.replace(/&lt;br\s*\/?&gt;/gi, '<br>');
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, href: string) => {
    const h = href.replace(/&amp;/g, '&');
    return /^(https?:\/\/|mailto:|#)/i.test(h) ? `<a href="${escapeHtml(h)}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
  });
  // eslint-disable-next-line no-control-regex
  t = t.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => codes[Number(i)]);
  return t;
}

function splitRow(line: string): string[] {
  let l = line.trim();
  if (l.startsWith('|')) l = l.slice(1);
  if (l.endsWith('|')) l = l.slice(0, -1);
  return l.split('|').map((c) => c.trim());
}

const isTableSep = (l: string): boolean => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);

export function extractHeadings(md: string): Heading[] {
  const out: Heading[] = [];
  const used = new Map<string, number>();
  let inFence = false;
  md.replace(/\r\n/g, '\n')
    .split('\n')
    .forEach((line, idx) => {
      if (/^\s*```/.test(line)) inFence = !inFence;
      if (inFence) return;
      const m = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
      if (!m) return;
      const base = slugify(m[2]);
      const n = used.get(base) ?? 0;
      used.set(base, n + 1);
      out.push({ level: m[1].length, text: m[2], slug: n === 0 ? base : `${base}-${n}`, line: idx });
    });
  return out;
}

export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const headings = extractHeadings(md);
  const headingBySlugLine = new Map<number, string>();
  headings.forEach((h) => headingBySlugLine.set(h.line, h.slug));

  const html: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // fenced code
    const fence = line.match(/^\s*```\s*([\w-]*)/);
    if (fence) {
      const lang = fence[1].toLowerCase();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      const code = escapeHtml(buf.join('\n'));
      html.push(
        lang === 'mermaid'
          ? `<pre class="md-mermaid" data-code="${code.replace(/\n/g, '&#10;')}"><code>${code}</code></pre>`
          : `<pre><code>${code}</code></pre>`,
      );
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    // heading
    const h = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) {
      const lvl = h[1].length;
      html.push(`<h${lvl} id="${headingBySlugLine.get(i) ?? slugify(h[2])}">${inline(h[2])}</h${lvl}>`);
      i++;
      continue;
    }

    // hr
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      html.push('<hr/>');
      i++;
      continue;
    }

    // table
    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(splitRow(lines[i++]));
      html.push(
        `<div class="md-table"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows
          .map((r) => `<tr>${head.map((_c, ci) => `<td>${inline(r[ci] ?? '')}</td>`).join('')}</tr>`)
          .join('')}</tbody></table></div>`,
      );
      continue;
    }

    // blockquote
    if (/^\s*>/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      html.push(`<blockquote>${inline(buf.join(' '))}</blockquote>`);
      continue;
    }

    // lists (with nesting by indentation)
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const stack: { indent: number; tag: 'ul' | 'ol' }[] = [];
      const out: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
        if (!m) break;
        const indent = m[1].replace(/\t/g, '    ').length;
        const tag: 'ul' | 'ol' = /\d/.test(m[2]) ? 'ol' : 'ul';
        while (stack.length && indent < stack[stack.length - 1].indent) {
          out.push(`</li></${stack.pop()!.tag}>`);
        }
        if (!stack.length || indent > stack[stack.length - 1].indent) {
          stack.push({ indent, tag });
          out.push(`<${tag}><li>${inline(m[3])}`);
        } else {
          out.push(`</li><li>${inline(m[3])}`);
        }
        i++;
      }
      while (stack.length) out.push(`</li></${stack.pop()!.tag}>`);
      html.push(out.join(''));
      continue;
    }

    // paragraph
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s*(```|#{1,6}\s|>|([-*+]|\d+[.)])\s+|(-{3,}|\*{3,}|_{3,})\s*$)/.test(lines[i]) &&
      !(lines[i].includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1]))
    ) {
      buf.push(lines[i++]);
    }
    if (buf.length === 0) {
      buf.push(lines[i++]);
    }
    html.push(`<p>${inline(buf.join(' '))}</p>`);
  }
  return html.join('\n');
}

/* ------------------------------ section helpers ----------------------------- */

export interface Section {
  heading: Heading;
  startLine: number;
  endLine: number; // exclusive
}

/** Splits a document into level-2 sections (## ...). */
export function getSections(md: string): Section[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const h2 = extractHeadings(md).filter((h) => h.level === 2);
  return h2.map((h, idx) => ({
    heading: h,
    startLine: h.line,
    endLine: idx + 1 < h2.length ? h2[idx + 1].line : lines.length,
  }));
}

export function getSectionText(md: string, s: Section): string {
  return md.replace(/\r\n/g, '\n').split('\n').slice(s.startLine, s.endLine).join('\n').trimEnd();
}

export function replaceSection(md: string, s: Section, replacement: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const before = lines.slice(0, s.startLine);
  const after = lines.slice(s.endLine);
  return [...before, ...replacement.trimEnd().split('\n'), '', ...after].join('\n').replace(/\n{3,}/g, '\n\n');
}

/** Strip a wrapping ```markdown fence the model sometimes adds. */
export function stripOuterFence(text: string): string {
  const t = text.trim();
  const m = t.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i);
  return m ? m[1] : t;
}
