import { describe, expect, it } from 'vitest';
import { parseJsonLoose, stripJsonFence } from '@/lib/jsonRepair';

describe('stripJsonFence', () => {
  it('removes a json fence and leading chatter', () => {
    expect(stripJsonFence('Here you go:\n```json\n{"a":1}\n```')).toBe('{"a":1}');
  });
});

describe('parseJsonLoose', () => {
  it('parses clean JSON without repair', () => {
    const r = parseJsonLoose<{ a: number }>('{"a":1}');
    expect(r.value.a).toBe(1);
    expect(r.repaired).toBe(false);
  });

  it('recovers complete items from a reply cut off mid-array', () => {
    const r = parseJsonLoose<{ items: Array<{ n: string }> }>('{"items":[{"n":"one"},{"n":"two"},{"n":"thr');
    expect(r.repaired).toBe(true);
    expect(r.value.items.length).toBeGreaterThan(1);
    expect(r.value.items[0].n).toBe('one');
  });

  it('throws when nothing can be recovered', () => {
    expect(() => parseJsonLoose('no json here')).toThrow(/./);
  });
});
