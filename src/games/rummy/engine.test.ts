import { describe, expect, it } from 'vitest';
import {
  buildShoe, cardPoints, classifyGroup, declare, discardCard, drawFromDiscard, drawFromStock, dropPlayer,
  evaluateHand, handCards, newGame, nextRound, arrangeHand, viewFor, type Card, type Suit,
} from './engine';

let nextId = 1000;
const c = (rank: number, suit: Suit | null = 'S'): Card => ({ id: nextId++, rank, suit });
const joker = () => c(0, null);
const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const seats = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));

describe('shoe', () => {
  it('has two decks plus four printed jokers, all ids unique', () => {
    const shoe = buildShoe();
    expect(shoe).toHaveLength(108);
    expect(new Set(shoe.map((x) => x.id)).size).toBe(108);
    expect(shoe.filter((x) => x.rank === 0)).toHaveLength(4);
  });
});

describe('group classification', () => {
  const WILD = 9; // wild rank for most tests
  it('pure sequence: consecutive, same suit, no jokers', () => {
    expect(classifyGroup([c(4, 'H'), c(5, 'H'), c(6, 'H')], WILD)).toBe('pure');
    expect(classifyGroup([c(1, 'H'), c(2, 'H'), c(3, 'H')], WILD)).toBe('pure');
    expect(classifyGroup([c(12, 'H'), c(13, 'H'), c(1, 'H')], WILD)).toBe('pure');
    expect(classifyGroup([c(10, 'D'), c(11, 'D'), c(12, 'D'), c(13, 'D'), c(1, 'D')], WILD)).toBe('pure');
  });
  it('does not wrap around the king', () => {
    expect(classifyGroup([c(13, 'H'), c(1, 'H'), c(2, 'H')], WILD)).toBe('invalid');
  });
  it('a wild-rank card in its natural place still makes a pure sequence', () => {
    expect(classifyGroup([c(8, 'C'), c(9, 'C'), c(10, 'C')], WILD)).toBe('pure');
  });
  it('a printed joker makes a sequence impure', () => {
    expect(classifyGroup([c(4, 'H'), joker(), c(6, 'H')], WILD)).toBe('sequence');
  });
  it('a wild-rank card out of place substitutes in an impure sequence', () => {
    expect(classifyGroup([c(4, 'H'), c(9, 'S'), c(6, 'H')], WILD)).toBe('sequence');
  });
  it('rejects mixed suits and gaps larger than the jokers can fill', () => {
    expect(classifyGroup([c(4, 'H'), c(5, 'S'), c(6, 'H')], WILD)).toBe('invalid');
    expect(classifyGroup([c(4, 'H'), c(7, 'H'), joker()], WILD)).toBe('invalid');
    expect(classifyGroup([c(4, 'H'), c(7, 'H'), joker(), joker()], WILD)).toBe('sequence');
  });
  it('rejects fewer than three cards', () => {
    expect(classifyGroup([c(4, 'H'), c(5, 'H')], WILD)).toBe('invalid');
  });
  it('sets: same rank, different suits, 3 or 4 cards, jokers allowed', () => {
    expect(classifyGroup([c(7, 'S'), c(7, 'H'), c(7, 'D')], WILD)).toBe('set');
    expect(classifyGroup([c(7, 'S'), c(7, 'H'), joker()], WILD)).toBe('set');
    expect(classifyGroup([c(7, 'S'), c(7, 'S'), c(7, 'D')], WILD)).toBe('invalid');
    expect(classifyGroup([c(7, 'S'), c(7, 'H'), c(7, 'D'), c(7, 'C'), joker()], WILD)).toBe('invalid');
    expect(classifyGroup([c(7, 'S'), c(8, 'H'), c(7, 'D')], WILD)).toBe('invalid');
  });
});

describe('scoring', () => {
  it('card values: faces and aces 10, jokers 0', () => {
    expect(cardPoints(c(1), 5)).toBe(10);
    expect(cardPoints(c(13), 5)).toBe(10);
    expect(cardPoints(c(7), 5)).toBe(7);
    expect(cardPoints(c(5), 5)).toBe(0); // wild rank
    expect(cardPoints(joker(), 5)).toBe(0);
  });

  const winning = () => [
    [c(4, 'H'), c(5, 'H'), c(6, 'H')],
    [c(1, 'S'), c(2, 'S'), c(3, 'S'), c(4, 'S')],
    [c(7, 'D'), c(7, 'H'), c(7, 'C')],
    [c(11, 'C'), c(12, 'C'), joker()],
  ];

  it('a winning hand has pure + second sequence and scores 0', () => {
    const ev = evaluateHand(winning(), 9);
    expect(ev.complete).toBe(true);
    expect(ev.points).toBe(0);
  });

  it('without a pure sequence the whole hand counts', () => {
    const hand = [[c(4, 'H'), joker(), c(6, 'H')], [c(7, 'D'), c(7, 'H'), c(7, 'C')], [c(13, 'S'), c(2, 'D')]];
    const ev = evaluateHand(hand, 9);
    expect(ev.complete).toBe(false);
    expect(ev.points).toBe(4 + 6 + 7 * 3 + 10 + 2);
  });

  it('sets do not count until there are two sequences', () => {
    const hand = [[c(4, 'H'), c(5, 'H'), c(6, 'H')], [c(7, 'D'), c(7, 'H'), c(7, 'C')], [c(13, 'S')]];
    const ev = evaluateHand(hand, 9);
    expect(ev.pureCount).toBe(1);
    expect(ev.sequenceCount).toBe(1);
    expect(ev.points).toBe(21 + 10);
  });

  it('caps at 80 points', () => {
    const hand = [Array.from({ length: 13 }, (_, i) => c(i % 2 ? 13 : 1, i % 2 ? 'H' : 'D'))];
    expect(evaluateHand(hand, 9).points).toBe(80);
  });

  it('an invalid group blocks completion even with a pure sequence and a second sequence', () => {
    const hand = winning();
    hand.push([c(13, 'D')]);
    expect(evaluateHand(hand, 9).complete).toBe(false);
  });
});

describe('a game round', () => {
  it('deals 13 cards each, a wild joker, and one open discard', () => {
    const g = newGame(seats(4), 3, seeded());
    for (const p of g.players) expect(handCards(p)).toHaveLength(13);
    expect(g.wildCard).not.toBeNull();
    expect(g.wildCard!.rank).toBeGreaterThan(0);
    expect(g.discard).toHaveLength(1);
    const used = g.players.length * 13 + 1 + 1 + g.stock.length;
    expect(used).toBe(108);
    expect(g.players[g.turn].id).toBe('p1'); // left of dealer p0
  });

  it('needs 3 to 6 players', () => {
    expect(() => newGame(seats(2), 1)).toThrow();
    expect(() => newGame(seats(7), 1)).toThrow();
    expect(() => newGame(seats(3), 1)).not.toThrow();
  });

  it('enforces turn order and draw-then-discard', () => {
    const g = newGame(seats(3), 1, seeded());
    expect(drawFromStock(g, 'p0').ok).toBe(false); // not p0's turn
    const first = g.players[g.turn].id;
    expect(discardCard(g, first, handCards(g.players[g.turn])[0].id).ok).toBe(false); // must draw first
    expect(drawFromStock(g, first).ok).toBe(true);
    expect(drawFromStock(g, first).ok).toBe(false); // already drew
    expect(handCards(g.players[g.turn])).toHaveLength(14);
    const card = handCards(g.players[g.turn])[3];
    expect(discardCard(g, first, card.id).ok).toBe(true);
    expect(g.discard.at(-1)!.id).toBe(card.id);
    expect(g.players[g.turn].id).not.toBe(first);
  });

  it('taking the discard puts that exact card in hand', () => {
    const g = newGame(seats(3), 1, seeded());
    const top = g.discard.at(-1)!;
    const id = g.players[g.turn].id;
    drawFromDiscard(g, id);
    expect(handCards(g.players[g.turn]).some((x) => x.id === top.id)).toBe(true);
    expect(g.discard).toHaveLength(0);
  });

  it('refills the stock from the discards when it runs out', () => {
    const g = newGame(seats(3), 1, seeded());
    g.discard.push(...g.stock.splice(0, g.stock.length));
    const id = g.players[g.turn].id;
    expect(drawFromStock(g, id, seeded(5)).ok).toBe(true);
    expect(g.stock.length).toBeGreaterThan(0);
    expect(g.discard).toHaveLength(1);
  });

  it('first drop costs 20, middle drop 40, and play continues', () => {
    const g = newGame(seats(3), 3, seeded());
    const a = g.players[g.turn];
    expect(dropPlayer(g, a.id).ok).toBe(true);
    expect(a.roundPoints).toBe(20);
    expect(a.out).toBe(true);
    const b = g.players[g.turn];
    drawFromStock(g, b.id);
    discardCard(g, b.id, handCards(b)[0].id);
    const c2 = g.players[g.turn];
    drawFromStock(g, c2.id);
    discardCard(g, c2.id, handCards(c2)[0].id);
    expect(g.players[g.turn].id).toBe(b.id); // a is skipped
    expect(dropPlayer(g, b.id).ok).toBe(true);
    expect(b.roundPoints).toBe(40);
  });

  it('last player standing wins when everyone else drops', () => {
    const g = newGame(seats(3), 1, seeded());
    const ids = [g.players[g.turn].id];
    dropPlayer(g, ids[0]);
    dropPlayer(g, g.players[g.turn].id);
    expect(g.phase).toBe('game-over');
    const winner = g.players.find((p) => p.roundPoints === 0 && !p.out)!;
    expect(winner).toBeDefined();
    expect(g.results[0].winnerId).toBe(winner.id);
  });

  it('arrangeHand accepts permutations of your own cards only', () => {
    const g = newGame(seats(3), 1, seeded());
    const p = g.players[0];
    const ids = handCards(p).map((x) => x.id);
    expect(arrangeHand(g, p.id, [ids.slice(0, 3), ids.slice(3)]).ok).toBe(true);
    expect(p.groups).toHaveLength(2);
    expect(arrangeHand(g, p.id, [ids.slice(0, 12)]).ok).toBe(false); // missing a card
    expect(arrangeHand(g, p.id, [[...ids, ids[0]]]).ok).toBe(false); // duplicate
    expect(arrangeHand(g, p.id, [[...ids.slice(1), 99999]]).ok).toBe(false); // foreign card
  });

  /** Rig the current player's hand: 13 grouped winning cards plus one extra to discard. */
  function rigWinner() {
    const g = newGame(seats(3), 2, seeded());
    g.wildRank = 9;
    const p = g.players[g.turn];
    const groups = [
      [c(4, 'H'), c(5, 'H'), c(6, 'H')],
      [c(1, 'S'), c(2, 'S'), c(3, 'S'), c(4, 'S')],
      [c(7, 'D'), c(7, 'H'), c(7, 'C')],
      [c(11, 'C'), c(12, 'C'), joker()],
    ];
    const extra = c(13, 'D');
    p.groups = [...groups, [extra]];
    p.hasDrawn = true;
    g.step = 'discard';
    return { g, p, groups, extra };
  }

  it('a valid declaration ends the round and scores the others', () => {
    const { g, p, groups, extra } = rigWinner();
    const other = g.players.find((x) => x !== p)!;
    other.groups = [other.groups.flat()]; // one big invalid group
    const res = declare(g, p.id, extra.id, groups.map((gr) => gr.map((x) => x.id)));
    expect(res.ok).toBe(true);
    expect(g.phase).toBe('round-over');
    expect(g.results[0].winnerId).toBe(p.id);
    expect(p.total).toBe(0);
    expect(other.total).toBeGreaterThan(0);
    expect(other.total).toBeLessThanOrEqual(80);
  });

  it('a wrong declaration costs 80 and removes the declarer, round continues', () => {
    const { g, p, groups, extra } = rigWinner();
    const bad = [...groups.slice(0, 3).map((gr) => gr.map((x) => x.id)), [...groups[3].map((x) => x.id)].slice(0, 2)];
    // 11 cards in groups: add the third card as a stray single so all 13 are used but a group is invalid
    bad.push([groups[3][2].id]);
    const res = declare(g, p.id, extra.id, bad);
    expect(res.ok).toBe(true);
    expect(p.out).toBe(true);
    expect(p.roundPoints).toBe(80);
    expect(g.phase).toBe('playing');
    expect(g.players[g.turn].id).not.toBe(p.id);
  });

  it('declare rejects groups that do not use the remaining cards', () => {
    const { g, p, groups, extra } = rigWinner();
    expect(declare(g, p.id, extra.id, groups.slice(0, 3).map((gr) => gr.map((x) => x.id))).ok).toBe(false);
    expect(declare(g, p.id, 123456, groups.map((gr) => gr.map((x) => x.id))).ok).toBe(false);
  });

  it('multi-round game: next round rotates the dealer; final round ends the game', () => {
    const { g, p, groups, extra } = rigWinner();
    declare(g, p.id, extra.id, groups.map((gr) => gr.map((x) => x.id)));
    expect(g.phase).toBe('round-over');
    const dealer = g.dealerIndex;
    expect(nextRound(g, seeded(3)).ok).toBe(true);
    expect(g.round).toBe(2);
    expect(g.dealerIndex).toBe((dealer + 1) % 3);
    for (const pl of g.players) expect(handCards(pl)).toHaveLength(13);
    expect(g.players.some((pl) => pl.total > 0)).toBe(true); // totals carry over
    dropPlayer(g, g.players[g.turn].id);
    dropPlayer(g, g.players[g.turn].id);
    expect(g.phase).toBe('game-over');
    expect(nextRound(g).ok).toBe(false);
  });
});

describe('player view', () => {
  it('never exposes other hands or the stock contents', () => {
    const g = newGame(seats(3), 1, seeded());
    const v = viewFor(g, 'p0', () => true);
    expect(v.myGroups.flat()).toHaveLength(13);
    expect(JSON.stringify(v)).not.toContain(JSON.stringify(g.players[1].groups[0][0]));
    expect(v.players[1].cards).toBe(13);
    expect('stock' in v).toBe(false);
    expect(v.discardTop.length).toBeLessThanOrEqual(6);
  });
});
