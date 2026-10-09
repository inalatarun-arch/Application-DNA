import { describe, expect, it } from 'vitest';
import { markdownToDocx, parseBlocks } from '@/lib/docx';
import { createZip, crc32 } from '@/lib/zip';

const text = (b: Uint8Array) => new TextDecoder('latin1').decode(b);

describe('zip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
  it('writes a zip that starts and ends correctly', () => {
    const z = createZip([{ name: 'a.txt', data: 'hello' }]);
    expect(text(z.slice(0, 2))).toBe('PK');
    expect(text(z)).toContain('a.txt');
  });
});

describe('markdown blocks', () => {
  it('recognises headings, lists, tables and code', () => {
    const blocks = parseBlocks('# T\n\ntext\n\n- a\n- b\n\n| X | Y |\n|---|---|\n| 1 | 2 |\n\n```mermaid\nflowchart TD\n```');
    expect(blocks.map((b) => b.t)).toEqual(['heading', 'para', 'list', 'table', 'code']);
  });
});

describe('markdownToDocx', () => {
  it('produces the parts Word needs and escapes XML', () => {
    const bytes = markdownToDocx('# 1 Intro\n\nA & B <c>\n\n| H1 | H2 |\n|---|---|\n| x | y |\n\n![Wireframe: Screen](wireframe:none)', { title: 'Doc & Co' });
    const s = text(bytes);
    expect(s).toContain('[Content_Types].xml');
    expect(s).toContain('word/document.xml');
    expect(s).toContain('word/numbering.xml');
    expect(s).toContain('Doc &amp; Co');
    expect(s).toContain('A &amp; B &lt;c&gt;');
    expect(s).toContain('Wireframe: Screen');
  });
});
