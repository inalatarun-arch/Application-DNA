import { describe, expect, it } from 'vitest';
import {
  FDD_PART_CLOSING, FDD_PART_OVERVIEW, NOT_DOCUMENTED, TABLES, defaultFrdHeadings, enforceTemplate, functionalitySections,
  isFddTemplate, renderSkeleton, splitFunctionalityChunks, tableHeaders,
} from '@/lib/fddTemplate';

describe('template', () => {
  it('lists the five top-level sections in order', () => {
    const tops = defaultFrdHeadings().filter((h) => /^# /.test(h));
    expect(tops).toEqual(['# 1 Introduction', '# 2 System/Solution Overview', '# 3 Functional Specifications', '# 4 Non-Functional Requirements', '# 5 Appendix/Glossary']);
    expect(isFddTemplate(defaultFrdHeadings().join('\n'))).toBe(true);
  });

  it('numbers each functionality and keeps the field-level specification headings', () => {
    const titles = functionalitySections(2, 'Create invoice').map((s) => `${s.num} ${s.title}`.trim());
    expect(titles).toContain('3.2 Create invoice');
    expect(titles).toContain('3.2.4 Field Level Specifications');
    expect(titles).toContain('Form Elements');
    expect(titles).toContain('Inputs and Outputs');
  });

  it('puts guidance in {{ }} in the skeleton', () => {
    expect(renderSkeleton(FDD_PART_OVERVIEW)).toContain('{{');
  });
});

describe('enforceTemplate', () => {
  it('rebuilds the exact headings even when the model renames, reorders or skips them', () => {
    const messy = '## Purpose\nWhy we write this.\n\n## 1.6 Risks and Assumptions\n| Risk/Assumption | Likelihood | Impact | Mitigation Strategy |\n|---|---|---|---|\n| Late data | Low | High | Load early |\n\n## 1.2 Problem Statement\nBad process.\n\n## Bonus Section\nExtra text';
    const r = enforceTemplate(messy, FDD_PART_OVERVIEW);
    const order = r.markdown.split('\n').filter((l) => /^#{1,3} /.test(l));
    expect(order[0]).toBe('# 1 Introduction');
    expect(order.indexOf('## 1.1 Purpose of Documentation')).toBeLessThan(order.indexOf('## 1.2 Problem Statement'));
    expect(r.markdown).toContain('Why we write this.');
    expect(r.markdown).toContain('Late data');
    expect(r.markdown).toContain('**Bonus Section**');
    expect(r.markdown).not.toContain('## Bonus Section');
  });

  it('marks sections the model did not write as not documented and reports them', () => {
    const r = enforceTemplate('## 1.1 Purpose of Documentation\nText', FDD_PART_OVERVIEW);
    expect(r.missing).toContain('## 1.2 Problem Statement');
    expect(r.markdown).toContain(NOT_DOCUMENTED);
  });

  it('inserts a prelude (for example the diagram) right after its heading', () => {
    const r = enforceTemplate('', FDD_PART_OVERVIEW, { '2.1': '```mermaid\nflowchart TD\nA-->B\n```' });
    const at = r.markdown.indexOf('## 2.1 Business Process Model');
    expect(r.markdown.indexOf('```mermaid')).toBeGreaterThan(at);
  });

  it('does not treat headings inside code fences as sections', () => {
    const r = enforceTemplate('## 1.1 Purpose of Documentation\n```\n## 1.2 Problem Statement\n```\n', FDD_PART_OVERVIEW);
    expect(r.markdown).toContain('```\n## 1.2 Problem Statement\n```');
  });

  it('works for a functionality block and the closing sections', () => {
    const own = functionalitySections(1, 'Create invoice');
    const e = enforceTemplate('## 3.1 Create invoice\n### Use Case\n| Item | Detail |\n|---|---|\n| Goal | Make an invoice |', own, { '3.1.2': '![Wireframe: Invoice Entry](wireframe:s1)' });
    expect(e.markdown).toContain('Goal');
    expect(e.markdown).toContain('![Wireframe: Invoice Entry](wireframe:s1)');
    expect(enforceTemplate('', FDD_PART_CLOSING).missing.length).toBeGreaterThan(5);
  });
});

describe('helpers', () => {
  it('splits section 3 output per functionality', () => {
    const chunks = splitFunctionalityChunks('intro\n## 3.1 A\ntext\n### Use Case\n## 3.2 B\nmore');
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toContain('### Use Case');
  });
  it('reads table headers', () => {
    const h = tableHeaders(`| ${TABLES.risks.join(' | ')} |\n|---|---|---|---|\n| a | b | c | d |`);
    expect(h[0]).toEqual([...TABLES.risks]);
  });
});
