import { describe, expect, it } from 'vitest';
import { buildRepoDigest, estimateTokens, DIGEST_BUDGET, type DigestInput } from '@/lib/repoDigest';

function input(extra = 0): DigestInput {
  const functionalities = Array.from({ length: 40 + extra }, (_, i) => ({
    id: `f${i}`, name: i === 7 ? 'Supplier Bank Account Update' : `Generic Task ${i}`, description: `Does generic work number ${i} for the business`, userRoles: ['Buyer'],
    inputs: ['a', 'b'], outputs: ['c'], screenId: 's1', moduleId: 'm1',
  }));
  return {
    modules: [{ id: 'm1', name: 'Suppliers' }],
    screens: [{ id: 's1', name: 'Supplier Screen', moduleId: 'm1', purpose: 'Maintain suppliers' }],
    functionalities,
    components: [{ id: 'c1', name: 'AP_SUPPLIERS', kind: 'table', functionalityIds: ['f7'] }],
    requirements: [{ id: 'r1', kind: 'functional', title: 'Allow buyers to update supplier bank account', description: 'Buyers can change the supplier bank account', status: 'approved', functionalityIds: [] }],
  };
}

describe('buildRepoDigest', () => {
  it('uses short codes instead of ids', () => {
    const d = buildRepoDigest(input(), 'standard');
    expect(d.text).toContain('M1 Suppliers');
    expect(d.text).not.toContain('f7');
    expect(d.codes.get('REQ-001')).toBe('Allow buyers to update supplier bank account');
  });

  it('ranks the functionality that matches the requirement first', () => {
    const d = buildRepoDigest(input(), 'lean');
    expect(d.text.indexOf('F1 Supplier Bank Account Update')).toBeGreaterThan(-1);
  });

  it('stays inside the budget and says when it cut a list', () => {
    const d = buildRepoDigest(input(400), 'lean');
    expect(d.text.length).toBeLessThan(DIGEST_BUDGET.lean + 4000);
    expect(d.text).toContain('showing');
    expect(d.shown.functionalities).toBeLessThan(d.total.functionalities);
  });

  it('gets bigger as the level goes up', () => {
    const lean = buildRepoDigest(input(), 'lean').tokens;
    const deep = buildRepoDigest(input(), 'deep').tokens;
    expect(deep).toBeGreaterThan(lean - 1);
  });

  it('ignores rejected requirements', () => {
    const i = input();
    i.requirements.push({ id: 'r2', kind: 'functional', title: 'Rejected idea', description: 'x', status: 'rejected' });
    expect(buildRepoDigest(i).text).not.toContain('Rejected idea');
  });
});

describe('estimateTokens', () => {
  it('is about a quarter of the characters', () => {
    expect(estimateTokens('x'.repeat(400))).toBe(100);
  });
});
