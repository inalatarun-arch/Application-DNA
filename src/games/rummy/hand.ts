import type { Card } from './engine';

/**
 * Keep the player's own arrangement stable while the host's view changes underneath it. The player's layout
 * wins; cards that left the hand are removed and newly received cards each start in their own group.
 */
export function reconcile(local: Card[][], fromHost: Card[][]): Card[][] {
  const hostCards = new Map(fromHost.flat().map((c) => [c.id, c]));
  const kept = new Set<number>();
  const next: Card[][] = [];
  for (const g of local) {
    const row = g.filter((c) => hostCards.has(c.id) && !kept.has(c.id)).map((c) => hostCards.get(c.id)!);
    row.forEach((c) => kept.add(c.id));
    if (row.length) next.push(row);
  }
  for (const c of hostCards.values()) if (!kept.has(c.id)) next.push([c]);
  return next;
}

export const toIds = (groups: Card[][]): number[][] => groups.map((g) => g.map((c) => c.id));

const SUIT_ORDER = { S: 0, H: 1, C: 2, D: 3 } as const;
const bySuitRank = (a: Card, b: Card) => (a.suit ? SUIT_ORDER[a.suit] : 9) - (b.suit ? SUIT_ORDER[b.suit] : 9) || a.rank - b.rank;

/** Sort the cards inside every group, lowest rank first, jokers last. */
export function sortWithinGroups(groups: Card[][]): Card[][] {
  return groups.map((g) => g.slice().sort((a, b) => (a.rank === 0 ? 99 : a.rank) - (b.rank === 0 ? 99 : b.rank) || bySuitRank(a, b)));
}

/** Lay the whole hand out by suit, one group per suit and jokers together: a starting point for arranging. */
export function autoSort(groups: Card[][]): Card[][] {
  const all = groups.flat();
  const out: Card[][] = [];
  for (const suit of ['S', 'H', 'C', 'D'] as const) {
    const g = all.filter((c) => c.suit === suit).sort((a, b) => a.rank - b.rank);
    if (g.length) out.push(g);
  }
  const jokers = all.filter((c) => c.suit === null);
  if (jokers.length) out.push(jokers);
  return out;
}

/** Move the selected cards into a new group placed where the first selected card was. */
export function groupSelected(groups: Card[][], selected: Set<number>): Card[][] {
  const picked: Card[] = [];
  let insertAt = -1;
  const rest: Card[][] = [];
  for (const g of groups) {
    const keep = g.filter((c) => !selected.has(c.id));
    const took = g.filter((c) => selected.has(c.id));
    picked.push(...took);
    if (keep.length) rest.push(keep);
    // The new group goes right after whatever is left of the first group a selected card came from.
    if (took.length && insertAt < 0) insertAt = rest.length;
  }
  if (!picked.length) return groups;
  rest.splice(Math.min(insertAt, rest.length), 0, picked);
  return rest;
}

/** Move the selected cards into an existing group (identified by one of its card ids). */
export function moveToGroup(groups: Card[][], selected: Set<number>, targetCardId: number): Card[][] {
  const target = groups.find((g) => g.some((c) => c.id === targetCardId));
  if (!target) return groups;
  const moving = groups.flat().filter((c) => selected.has(c.id) && !target.includes(c));
  if (!moving.length) return groups;
  const result: Card[][] = [];
  for (const g of groups) {
    if (g === target) { result.push([...g, ...moving]); continue; }
    const keep = g.filter((c) => !selected.has(c.id));
    if (keep.length) result.push(keep);
  }
  return result;
}

/** Break every selected card out of its group into singles (or all groups if nothing is selected). */
export function ungroup(groups: Card[][], selected: Set<number>): Card[][] {
  if (!selected.size) return groups.flatMap((g) => g.map((c) => [c]));
  const out: Card[][] = [];
  for (const g of groups) {
    const keep = g.filter((c) => !selected.has(c.id));
    if (keep.length) out.push(keep);
    g.filter((c) => selected.has(c.id)).forEach((c) => out.push([c]));
  }
  return out;
}
