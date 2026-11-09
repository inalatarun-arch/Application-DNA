import { describe, expect, it } from 'vitest';
import type { Card } from './engine';
import { autoSort, groupSelected, moveToGroup, reconcile, toIds, ungroup } from './hand';

const c = (id: number, rank = 5, suit: Card['suit'] = 'H'): Card => ({ id, rank, suit });

describe('hand arrangement helpers', () => {
  it('reconcile keeps the player layout, drops discarded cards and groups new ones apart', () => {
    const local = [[c(1), c(2)], [c(3)]];
    const host = [[c(1), c(3), c(9)]];
    expect(toIds(reconcile(local, host))).toEqual([[1], [3], [9]]);
    expect(toIds(reconcile(local, [[c(1), c(2), c(3)]]))).toEqual([[1, 2], [3]]);
  });

  it('groupSelected pulls cards from any groups into one new group', () => {
    const groups = [[c(1), c(2)], [c(3), c(4)], [c(5)]];
    const out = groupSelected(groups, new Set([2, 3, 5]));
    expect(toIds(out)).toEqual([[1], [2, 3, 5], [4]]);
    expect(out.flat()).toHaveLength(5);
  });

  it('moveToGroup merges the selection into an existing group', () => {
    const groups = [[c(1), c(2)], [c(3)], [c(4)]];
    expect(toIds(moveToGroup(groups, new Set([3, 4]), 1))).toEqual([[1, 2, 3, 4]]);
  });

  it('ungroup splits selected cards, or everything when none selected', () => {
    const groups = [[c(1), c(2), c(3)]];
    expect(toIds(ungroup(groups, new Set([2])))).toEqual([[1, 3], [2]]);
    expect(toIds(ungroup(groups, new Set()))).toEqual([[1], [2], [3]]);
  });

  it('autoSort groups by suit and keeps every card', () => {
    const cards = [c(1, 9, 'H'), c(2, 3, 'S'), c(3, 5, 'H'), c(4, 0, null)];
    const out = autoSort([cards]);
    expect(out.flat()).toHaveLength(4);
    expect(toIds(out)).toEqual([[2], [3, 1], [4]]);
  });
});
