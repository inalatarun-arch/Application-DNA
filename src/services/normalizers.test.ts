import { describe, expect, it } from 'vitest';
import { normalizeRequirements } from '@/lib/requirementModel';
import { normalizeCases } from '@/lib/testModel';
import { applyPatches } from '@/lib/docRevise';

describe('normalizeRequirements', () => {
  it('repairs kinds and priorities and drops items without a title', () => {
    const r = normalizeRequirements({
      summary: ' ok ',
      requirements: [
        { title: 'The system shall log changes', kind: 'NON-FUNCTIONAL', priority: 'High', operation: 'changed', existingTitle: 'Log changes' },
        { title: '', kind: 'functional' },
        { title: 'Odd one', kind: 'mystery', priority: 'urgent' },
        'not an object',
      ],
    });
    expect(r.summary).toBe('ok');
    expect(r.requirements).toHaveLength(2);
    expect(r.requirements[0].kind).toBe('non-functional');
    expect(r.requirements[0].priority).toBe('high');
    expect(r.requirements[0].operation).toBe('changed');
    expect(r.requirements[1].kind).toBe('functional');
    expect(r.requirements[1].priority).toBe('medium');
  });

  it('survives a completely wrong answer', () => {
    expect(normalizeRequirements(null).requirements).toHaveLength(0);
    expect(normalizeRequirements({ requirements: 'x' }).requirements).toHaveLength(0);
  });
});

describe('normalizeCases', () => {
  it('keeps complete cases, removes duplicates and bad criteria numbers', () => {
    const cases = normalizeCases({
      testCases: [
        { scenario: 'Valid login', steps: ['Open', 'Submit'], expectedResult: 'Logged in', priority: 'high', type: 'positive', coversCriteria: [1, 9, 2] },
        { scenario: 'valid login', steps: ['x'], expectedResult: 'dup' },
        { scenario: 'Empty steps', steps: [], expectedResult: 'x' },
        { scenario: 'Existing one', steps: ['a'], expectedResult: 'b' },
      ],
    }, 2, ['Existing one']);
    expect(cases).toHaveLength(1);
    expect(cases[0].coversCriteria).toEqual([1, 2]);
    expect(cases[0].caseType).toBe('positive');
  });
});

describe('applyPatches through the revise path', () => {
  it('leaves the document alone when the model returns nothing usable', () => {
    const r = applyPatches('## A\n\nx', [{ heading: '', markdown: '' }]);
    expect(r.markdown).toBe('## A\n\nx');
    expect(r.applied).toHaveLength(0);
  });
});
