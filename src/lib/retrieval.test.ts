import { describe, expect, it } from 'vitest';
import { rank } from '@/lib/retrieval';

const records = [
  { kind: 'functionality', name: 'Supplier Creation', text: 'creates a supplier record' },
  { kind: 'table', name: 'AP_SUPPLIERS', text: 'supplier master table' },
  { kind: 'screen', name: 'Invoice Entry', text: 'enter invoices' },
];

describe('rank', () => {
  it('drops stop words and ranks name matches first', () => {
    const hits = rank(records, 'show me all the supplier things');
    expect(hits[0].name).toBe('Supplier Creation');
    expect(hits.some((h) => h.name === 'Invoice Entry')).toBe(false);
  });
  it('returns nothing when the question has no usable words', () => {
    expect(rank(records, 'show me all')).toHaveLength(0);
  });
});
