import { describe, expect, test } from 'vitest';
import { decodeEntities, halve, htmlToMarkdown, splitByHeadings } from './docStructure';

describe('htmlToMarkdown', () => {
  test('headings, paragraphs, lists, entities and images', () => {
    const md = htmlToMarkdown('<h1>2. Apps &amp; Co</h1><p>First <strong>bold</strong> text.</p><ul><li>one</li><li>two<br />lines</li></ul><p><img src="" /></p><h3>Sub</h3>');
    expect(md).toBe('# 2. Apps & Co\n\nFirst bold text.\n\n- one\n- two / lines\n\n### Sub');
  });

  test('tables keep rows and columns, escape pipes and drop empty rows', () => {
    const md = htmlToMarkdown('<table><thead><tr><th><p>Field</p></th><th><p>Rule</p></th></tr></thead><tbody><tr><td><p>Name</p></td><td><p>a | b</p></td></tr><tr><td></td><td></td></tr><tr><td>Tax</td></tr></tbody></table>');
    expect(md).toBe('| Field | Rule |\n| --- | --- |\n| Name | a \\| b |\n| Tax |  |');
  });

  test('decodes numeric and named entities, leaves unknown ones', () => {
    expect(decodeEntities('&#8212; &#x41; &mdash; &bogus; &lt;')).toBe('— A — &bogus; <');
  });
});

describe('splitByHeadings', () => {
  const doc = (n: number) => Array.from({ length: n }, (_, i) => `## Section ${i}\n\n${'text '.repeat(40)}\n\n| a | b |\n| --- | --- |\n| ${i} | x |`).join('\n\n');

  test('keeps a heading with its body, records the path, and respects the size limit', () => {
    const md = `# Part 1\n\nintro\n\n### Deep heading\n\nbody\n\n${doc(10)}`;
    const parts = splitByHeadings(md, 900);
    expect(parts.length).toBeGreaterThan(2);
    for (const p of parts) expect(p.text.length).toBeLessThanOrEqual(1000);
    // every heading line is followed by its own content inside the same part
    const all = parts.map((p) => p.text).join('\n');
    expect([...all.matchAll(/## Section \d+/g)].length).toBe(10);
    expect(parts.some((p) => p.text.startsWith('## Section'))).toBe(true);
    expect(splitByHeadings(md, 900)[1].path[0]).toBe('Part 1');
  });

  test('one oversized section is cut on line boundaries, never mid-line', () => {
    const rows = Array.from({ length: 200 }, (_, i) => `| row ${i} | value |`).join('\n');
    const parts = splitByHeadings(`## Big\n\n${rows}`, 600);
    expect(parts.length).toBeGreaterThan(3);
    expect(parts.flatMap((p) => p.text.split('\n')).filter((l) => l.startsWith('| row')).length).toBe(200);
    for (const p of parts) expect(p.path).toEqual([]);
  });

  test('small document stays a single part; empty input gives none', () => {
    expect(splitByHeadings('# A\n\nx', 1000)).toHaveLength(1);
    expect(splitByHeadings('', 1000)).toEqual([]);
  });
});

describe('halve', () => {
  test('splits near the middle on a heading or blank line, losing nothing', () => {
    const text = Array.from({ length: 30 }, (_, i) => (i % 6 === 0 ? `### H${i}` : `line ${i}`)).join('\n');
    const [a, b] = halve({ path: ['X'], text })!;
    expect(`${a.text}\n${b.text}`.replace(/\n+/g, '\n')).toBe(text);
    expect(Math.abs(a.text.length - b.text.length)).toBeLessThan(text.length / 2);
    expect(halve({ path: [], text: 'a\nb' })).toBeNull();
  });
});
