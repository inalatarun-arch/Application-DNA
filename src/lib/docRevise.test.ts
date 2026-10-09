import { describe, expect, it } from 'vitest';
import { applyPatches, indexSections, revisionContext } from '@/lib/docRevise';

const md = '## 1.1 Purpose\n\nOld purpose.\n\n## 1.2 Problem Statement\n\nOld problem about payments.\n\n### 1.2.1 Sub\n\nsub text\n\n## 1.3 Objectives\n\n- one\n';

describe('docRevise', () => {
  it('indexes sections and their extent', () => {
    const { sections } = indexSections(md);
    expect(sections).toHaveLength(4);
    expect(sections[1].end).toBeGreaterThan(sections[2].start);
  });

  it('sends the sections an instruction is about, not the whole document', () => {
    const ctx = revisionContext(md, 'rewrite the problem statement to mention payments');
    expect(ctx.included).toContain('## 1.2 Problem Statement');
    expect(ctx.included).not.toContain('## 1.3 Objectives');
    expect(ctx.index).toContain('1.3 Objectives');
  });

  it('replaces only the named section and keeps the rest', () => {
    const r = applyPatches(md, [{ heading: '## 1.2 Problem Statement', markdown: 'New problem.' }]);
    expect(r.markdown).toContain('## 1.2 Problem Statement\n\nNew problem.');
    expect(r.markdown).toContain('Old purpose.');
    expect(r.markdown).toContain('## 1.3 Objectives');
    expect(r.applied).toHaveLength(1);
  });

  it('reports headings it could not find', () => {
    const r = applyPatches(md, [{ heading: '## 9 Missing', markdown: 'x' }]);
    expect(r.applied).toHaveLength(0);
    expect(r.skipped[0]).toContain('not found');
  });

  it('never lets a patch rename the heading it replaces', () => {
    const r = applyPatches(md, [{ heading: '1.1 Purpose', markdown: '## Something else\n\nBody' }]);
    expect(r.markdown.startsWith('## 1.1 Purpose')).toBe(true);
    expect(r.markdown).not.toContain('Something else');
  });
});
