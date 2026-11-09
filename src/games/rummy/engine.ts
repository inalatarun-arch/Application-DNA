/**
 * 13-card Indian Rummy (Points Rummy) rules engine. Pure functions only: no UI, no network, no randomness
 * except the injectable `rng`, so every rule can be unit tested.
 *
 * Rules implemented
 * - 3 to 6 players, two 52-card decks plus 4 printed jokers (108 cards), 13 cards each.
 * - One card is cut from the stock as the "wild joker" rank. Every card of that rank plus the printed jokers are jokers.
 * - On your turn: draw from the stock or take the top of the discard pile, then discard one card.
 * - To declare: discard one finishing card and arrange the other 13 into groups. You need at least two sequences,
 *   and at least one of them must be pure (no joker). Remaining groups can be sequences or sets.
 * - A wrong declaration costs 80 points and you are out of the round.
 * - Drop: 20 points before your first draw, 40 points after that. A drop takes you out of the round.
 * - Losers score the value of their cards that are not in valid groups, capped at 80. The lowest total after the
 *   chosen number of rounds wins.
 */

export type Suit = 'S' | 'H' | 'D' | 'C';
export const SUITS: Suit[] = ['S', 'H', 'D', 'C'];

export interface Card {
  /** Unique across the whole shoe, so two identical-looking cards stay distinguishable. */
  id: number;
  /** 1 = Ace, 11 = Jack, 12 = Queen, 13 = King, 0 = printed joker. */
  rank: number;
  /** Null for a printed joker. */
  suit: Suit | null;
}

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 6;
export const HAND_SIZE = 13;
export const MAX_POINTS = 80;
export const FIRST_DROP = 20;
export const MIDDLE_DROP = 40;
export const WRONG_DECLARE = 80;

/** Deterministic 0..1 random source type, so tests can seed the shuffle. */
export type Rng = () => number;

export function buildShoe(): Card[] {
  const cards: Card[] = [];
  let id = 0;
  for (let deck = 0; deck < 2; deck++) {
    for (const suit of SUITS) for (let rank = 1; rank <= 13; rank++) cards.push({ id: id++, rank, suit });
    cards.push({ id: id++, rank: 0, suit: null }, { id: id++, rank: 0, suit: null });
  }
  return cards;
}

export function shuffle<T>(items: T[], rng: Rng = Math.random): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function isPrintedJoker(c: Card): boolean {
  return c.rank === 0;
}

/** A joker is a printed joker or any card of the wild rank. `wildRank` 0 means "no wild rank yet". */
export function isJoker(c: Card, wildRank: number): boolean {
  return c.rank === 0 || (wildRank > 0 && c.rank === wildRank);
}

/** Face value for scoring. Jokers (printed or wild rank) are worth nothing. */
export function cardPoints(c: Card, wildRank: number): number {
  if (isJoker(c, wildRank)) return 0;
  return c.rank >= 10 || c.rank === 1 ? 10 : c.rank;
}

export type GroupKind = 'pure' | 'sequence' | 'set' | 'invalid';

/** Pure sequence: 3+ cards of one suit in consecutive order, no printed jokers, no substitutions. A can be low or high. */
export function isPureSequence(cards: Card[]): boolean {
  if (cards.length < 3) return false;
  if (cards.some(isPrintedJoker)) return false;
  const suit = cards[0].suit;
  if (cards.some((c) => c.suit !== suit)) return false;
  return fitsRun(cards.map((c) => c.rank), cards.length);
}

/** Sequence that may use jokers: 3+ cards, the natural cards share a suit and fit one consecutive run. */
export function isSequence(cards: Card[], wildRank: number): boolean {
  if (cards.length < 3) return false;
  const naturals = cards.filter((c) => !isJoker(c, wildRank));
  if (naturals.length === 0) return true;
  const suit = naturals[0].suit;
  if (naturals.some((c) => c.suit !== suit)) return false;
  return fitsRun(naturals.map((c) => c.rank), cards.length);
}

/**
 * Can these ranks sit inside one run of `length` consecutive positions? Ace is position 1 or 14
 * (A-2-3 and Q-K-A are fine, K-A-2 is not). Each rank may appear once.
 */
function fitsRun(ranks: number[], length: number): boolean {
  if (new Set(ranks).size !== ranks.length) return false;
  const aces = ranks.filter((r) => r === 1).length;
  const others = ranks.filter((r) => r !== 1);
  // At most one ace (distinct ranks), placed low (1) or high (14).
  for (const aceAt of aces ? [1, 14] : [0]) {
    const positions = aces ? [...others, aceAt] : others;
    const lo = Math.min(...positions);
    const hi = Math.max(...positions);
    if (hi - lo + 1 > length) continue;
    // Some window of `length` positions inside 1..14 must cover [lo, hi].
    const start = Math.max(1, hi - length + 1);
    if (start <= lo && start + length - 1 <= 14) return true;
  }
  return false;
}

/** Set: 3 or 4 cards of one rank, all different suits. Jokers stand in for any missing card. */
export function isSet(cards: Card[], wildRank: number): boolean {
  if (cards.length < 3 || cards.length > 4) return false;
  const naturals = cards.filter((c) => !isJoker(c, wildRank));
  if (naturals.length === 0) return true;
  const rank = naturals[0].rank;
  if (naturals.some((c) => c.rank !== rank)) return false;
  return new Set(naturals.map((c) => c.suit)).size === naturals.length;
}

export function classifyGroup(cards: Card[], wildRank: number): GroupKind {
  if (isPureSequence(cards)) return 'pure';
  if (isSequence(cards, wildRank)) return 'sequence';
  if (isSet(cards, wildRank)) return 'set';
  return 'invalid';
}

export interface HandEvaluation {
  kinds: GroupKind[];
  pureCount: number;
  sequenceCount: number; // includes pure sequences
  /** True when the arrangement wins: every group valid, 1+ pure sequence and 2+ sequences. */
  complete: boolean;
  /** Points left in the hand (0 when complete), capped at MAX_POINTS. */
  points: number;
}

/**
 * Evaluate a set of groups. Sets only count once the hand has a pure sequence and a second sequence; before that
 * they are dead cards. Without a pure sequence the whole hand counts.
 */
export function evaluateHand(groups: Card[][], wildRank: number): HandEvaluation {
  const kinds = groups.map((g) => classifyGroup(g, wildRank));
  const pureCount = kinds.filter((k) => k === 'pure').length;
  const sequenceCount = pureCount + kinds.filter((k) => k === 'sequence').length;
  const setsCount = sequenceCount >= 2 && pureCount >= 1;
  let points = 0;
  groups.forEach((g, i) => {
    const k = kinds[i];
    let live = false;
    if (pureCount >= 1) live = k === 'pure' || k === 'sequence' || (k === 'set' && setsCount);
    if (!live) points += g.reduce((s, c) => s + cardPoints(c, wildRank), 0);
  });
  const complete = pureCount >= 1 && sequenceCount >= 2 && kinds.every((k) => k !== 'invalid');
  return { kinds, pureCount, sequenceCount, complete, points: complete ? 0 : Math.min(points, MAX_POINTS) };
}

// ----------------------------------------------------------------------------------------------------------------
// Game state (held only by the host; players receive a filtered view, see `viewFor`)
// ----------------------------------------------------------------------------------------------------------------

export interface PlayerState {
  id: string;
  name: string;
  /** The hand, split into the player's own groups. Always contains every card exactly once. */
  groups: Card[][];
  /** Out of this round (dropped, or declared wrongly). */
  out: boolean;
  /** Why they are out, shown to everyone. */
  outReason?: 'drop' | 'middle-drop' | 'wrong-declare';
  /** Has drawn at least once this round (decides first vs middle drop). */
  hasDrawn: boolean;
  /** Score added in the round just finished. */
  roundPoints: number;
  /** Cumulative score across rounds. Lower is better. */
  total: number;
}

export type Phase = 'playing' | 'round-over' | 'game-over';

export interface RoundResult {
  round: number;
  winnerId: string | null;
  /** Declaring player's final groups, so everyone can see the winning hand. */
  winningGroups: Card[][] | null;
  scores: { id: string; name: string; points: number; reason: string; groups: Card[][] }[];
}

export interface GameState {
  phase: Phase;
  round: number;
  totalRounds: number;
  players: PlayerState[];
  dealerIndex: number;
  turn: number; // index into players
  /** 'draw' = must draw next; 'discard' = holds 14 cards, must discard or declare. */
  step: 'draw' | 'discard';
  stock: Card[];
  /** Last element is the top (visible) card. */
  discard: Card[];
  wildCard: Card | null;
  wildRank: number;
  /** Newest last. Short human-readable events. */
  log: string[];
  results: RoundResult[];
}

export interface Seat {
  id: string;
  name: string;
}

function note(state: GameState, text: string) {
  state.log.push(text);
  if (state.log.length > 40) state.log.splice(0, state.log.length - 40);
}

export function newGame(seats: Seat[], totalRounds: number, rng: Rng = Math.random): GameState {
  if (seats.length < MIN_PLAYERS || seats.length > MAX_PLAYERS) {
    throw new Error(`Rummy needs ${MIN_PLAYERS} to ${MAX_PLAYERS} players.`);
  }
  const state: GameState = {
    phase: 'playing',
    round: 0,
    totalRounds: Math.max(1, Math.min(10, Math.floor(totalRounds))),
    players: seats.map((s) => ({ id: s.id, name: s.name, groups: [], out: false, hasDrawn: false, roundPoints: 0, total: 0 })),
    dealerIndex: -1,
    turn: 0,
    step: 'draw',
    stock: [],
    discard: [],
    wildCard: null,
    wildRank: 0,
    log: [],
    results: [],
  };
  dealRound(state, rng);
  return state;
}

/** Shuffle, deal 13 each, cut the wild joker and open the first discard. Dealer rotates each round. */
export function dealRound(state: GameState, rng: Rng = Math.random): void {
  const n = state.players.length;
  state.round += 1;
  state.phase = 'playing';
  state.dealerIndex = (state.dealerIndex + 1) % n;
  let stock = shuffle(buildShoe(), rng);
  for (const p of state.players) {
    p.groups = [];
    p.out = false;
    p.outReason = undefined;
    p.hasDrawn = false;
    p.roundPoints = 0;
  }
  for (const p of state.players) p.groups = [stock.splice(0, HAND_SIZE)];
  // The cut joker cannot be a printed joker: slide those to the bottom until a normal card is on top.
  while (stock[0].rank === 0) stock = [...stock.slice(1), stock[0]];
  const wildCard = stock.shift()!;
  state.wildCard = wildCard;
  state.wildRank = wildCard.rank;
  state.discard = [stock.shift()!];
  state.stock = stock;
  state.turn = (state.dealerIndex + 1) % n;
  state.step = 'draw';
  state.log = [];
  note(state, `Round ${state.round} dealt. Wild joker is ${rankName(wildCard.rank)}.`);
}

export function rankName(rank: number): string {
  return rank === 0 ? 'Joker' : rank === 1 ? 'Ace' : rank === 11 ? 'Jack' : rank === 12 ? 'Queen' : rank === 13 ? 'King' : String(rank);
}

export function handCards(p: PlayerState): Card[] {
  return p.groups.flat();
}

export type ActionResult = { ok: true } | { ok: false; error: string };
const fail = (error: string): ActionResult => ({ ok: false, error });
const OK: ActionResult = { ok: true };

function playerIndex(state: GameState, id: string): number {
  return state.players.findIndex((p) => p.id === id);
}

function activeCount(state: GameState): number {
  return state.players.filter((p) => !p.out).length;
}

/** Index of the next player still in the round after `from`. */
function nextActive(state: GameState, from: number): number {
  const n = state.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (from + i) % n;
    if (!state.players[idx].out) return idx;
  }
  return from;
}

function checkTurn(state: GameState, id: string, step: 'draw' | 'discard'): ActionResult {
  if (state.phase !== 'playing') return fail('The round is not in progress.');
  const idx = playerIndex(state, id);
  if (idx < 0) return fail('You are not in this game.');
  if (state.players[idx].out) return fail('You are out of this round.');
  if (idx !== state.turn) return fail('It is not your turn.');
  if (state.step !== step) return fail(step === 'draw' ? 'Discard a card first.' : 'Draw a card first.');
  return OK;
}

/** Put a freshly drawn card in its own group at the end, so the player can see what they picked up. */
function receive(p: PlayerState, card: Card) {
  p.groups.push([card]);
  p.hasDrawn = true;
}

export function drawFromStock(state: GameState, id: string, rng: Rng = Math.random): ActionResult {
  const check = checkTurn(state, id, 'draw');
  if (!check.ok) return check;
  if (state.stock.length === 0) {
    // Recycle the discard pile (keep its top card showing).
    if (state.discard.length <= 1) return fail('No cards left to draw.');
    const top = state.discard[state.discard.length - 1];
    state.stock = shuffle(state.discard.slice(0, -1), rng);
    state.discard = [top];
    note(state, 'The stock ran out and was refilled from the discard pile.');
  }
  const p = state.players[state.turn];
  receive(p, state.stock.shift()!);
  state.step = 'discard';
  return OK;
}

export function drawFromDiscard(state: GameState, id: string): ActionResult {
  const check = checkTurn(state, id, 'draw');
  if (!check.ok) return check;
  const card = state.discard.pop();
  if (!card) return fail('The discard pile is empty.');
  const p = state.players[state.turn];
  receive(p, card);
  state.step = 'discard';
  return OK;
}

export function discardCard(state: GameState, id: string, cardId: number): ActionResult {
  const check = checkTurn(state, id, 'discard');
  if (!check.ok) return check;
  const p = state.players[state.turn];
  const card = removeCard(p, cardId);
  if (!card) return fail('That card is not in your hand.');
  state.discard.push(card);
  state.turn = nextActive(state, state.turn);
  state.step = 'draw';
  return OK;
}

function removeCard(p: PlayerState, cardId: number): Card | null {
  for (let g = 0; g < p.groups.length; g++) {
    const i = p.groups[g].findIndex((c) => c.id === cardId);
    if (i >= 0) {
      const [card] = p.groups[g].splice(i, 1);
      if (p.groups[g].length === 0) p.groups.splice(g, 1);
      return card;
    }
  }
  return null;
}

/** Replace a player's grouping. Must contain exactly the same cards. Allowed any time, including off turn. */
export function arrangeHand(state: GameState, id: string, groups: number[][]): ActionResult {
  const idx = playerIndex(state, id);
  if (idx < 0) return fail('You are not in this game.');
  const p = state.players[idx];
  if (state.phase === 'game-over') return fail('The game is over.');
  const byId = new Map(handCards(p).map((c) => [c.id, c]));
  const seen = new Set<number>();
  const next: Card[][] = [];
  for (const g of groups) {
    const row: Card[] = [];
    for (const cid of g) {
      const c = byId.get(cid);
      if (!c || seen.has(cid)) return fail('That arrangement does not match your hand.');
      seen.add(cid);
      row.push(c);
    }
    if (row.length) next.push(row);
  }
  if (seen.size !== byId.size) return fail('That arrangement does not match your hand.');
  p.groups = next;
  return OK;
}

export function dropPlayer(state: GameState, id: string, reason: 'manual' | 'auto' = 'manual'): ActionResult {
  const check = checkTurn(state, id, 'draw');
  if (!check.ok) return check;
  const idx = state.turn;
  const p = state.players[idx];
  const middle = p.hasDrawn;
  const penalty = middle ? MIDDLE_DROP : FIRST_DROP;
  p.out = true;
  p.outReason = middle ? 'middle-drop' : 'drop';
  p.roundPoints = penalty;
  note(state, `${p.name} ${reason === 'auto' ? 'was dropped (disconnected)' : 'dropped'}: ${penalty} points.`);
  return afterPlayerOut(state, idx);
}

/** After someone leaves the round: if one player is left they win by default, otherwise play moves on. */
function afterPlayerOut(state: GameState, idx: number): ActionResult {
  if (activeCount(state) <= 1) {
    const winner = state.players.find((p) => !p.out)!;
    finishRound(state, winner.id, null);
  } else {
    state.turn = nextActive(state, idx);
    state.step = 'draw';
  }
  return OK;
}

/**
 * Declare: discard `finishCardId` face down, then show the other 13 cards in `groups`. If the arrangement is a
 * valid winning hand the round ends and everyone else is scored on their own grouping. Otherwise the declarer
 * takes the 80 point penalty and is out.
 */
export function declare(state: GameState, id: string, finishCardId: number, groups: number[][]): ActionResult {
  const check = checkTurn(state, id, 'discard');
  if (!check.ok) return check;
  const idx = state.turn;
  const p = state.players[idx];
  const all = handCards(p);
  const finish = all.find((c) => c.id === finishCardId);
  if (!finish) return fail('Pick one of your cards to finish with.');
  const rest = all.filter((c) => c.id !== finishCardId);
  const byId = new Map(rest.map((c) => [c.id, c]));
  const seen = new Set<number>();
  const arranged: Card[][] = [];
  for (const g of groups) {
    const row: Card[] = [];
    for (const cid of g) {
      const c = byId.get(cid);
      if (!c || seen.has(cid)) return fail('Your groups must use each remaining card exactly once.');
      seen.add(cid);
      row.push(c);
    }
    if (row.length) arranged.push(row);
  }
  if (seen.size !== rest.length) return fail('Your groups must use each remaining card exactly once.');

  const result = evaluateHand(arranged, state.wildRank);
  if (result.complete) {
    p.groups = arranged;
    note(state, `${p.name} declared with a valid hand!`);
    finishRound(state, p.id, arranged);
    return OK;
  }
  p.groups = [...arranged, [finish]];
  p.out = true;
  p.outReason = 'wrong-declare';
  p.roundPoints = WRONG_DECLARE;
  note(state, `${p.name} declared wrongly: ${WRONG_DECLARE} points.`);
  return afterPlayerOut(state, idx);
}

function reasonText(p: PlayerState, isWinner: boolean, eval_: HandEvaluation | null): string {
  if (isWinner) return 'Winner';
  if (p.outReason === 'drop') return 'Dropped (first drop)';
  if (p.outReason === 'middle-drop') return 'Dropped (middle drop)';
  if (p.outReason === 'wrong-declare') return 'Wrong declaration';
  if (eval_ && eval_.pureCount === 0) return 'No pure sequence';
  if (eval_ && eval_.sequenceCount < 2) return 'Needs a second sequence';
  return 'Cards left in hand';
}

function finishRound(state: GameState, winnerId: string, winningGroups: Card[][] | null) {
  const scores: RoundResult['scores'] = [];
  for (const p of state.players) {
    const isWinner = p.id === winnerId;
    let eval_: HandEvaluation | null = null;
    if (isWinner) {
      p.roundPoints = 0;
    } else if (!p.out) {
      eval_ = evaluateHand(p.groups, state.wildRank);
      p.roundPoints = eval_.points;
    }
    p.total += p.roundPoints;
    scores.push({ id: p.id, name: p.name, points: p.roundPoints, reason: reasonText(p, isWinner, eval_), groups: p.groups });
  }
  const winner = state.players.find((p) => p.id === winnerId)!;
  state.results.push({ round: state.round, winnerId, winningGroups, scores });
  state.phase = state.round >= state.totalRounds ? 'game-over' : 'round-over';
  note(state, `${winner.name} wins round ${state.round}.`);
}

/** Start the next round after a round-over screen. */
export function nextRound(state: GameState, rng: Rng = Math.random): ActionResult {
  if (state.phase !== 'round-over') return fail('There is no round to start.');
  dealRound(state, rng);
  return OK;
}

/** Standings at the end (or midway): lowest total first. */
export function standings(state: GameState): PlayerState[] {
  return state.players.slice().sort((a, b) => a.total - b.total);
}

// ----------------------------------------------------------------------------------------------------------------
// Per-player view: what one player is allowed to see. The host sends this, never the raw state.
// ----------------------------------------------------------------------------------------------------------------

export interface PublicPlayer {
  id: string;
  name: string;
  cards: number;
  out: boolean;
  outReason?: PlayerState['outReason'];
  total: number;
  connected: boolean;
}

export interface GameView {
  phase: Phase;
  round: number;
  totalRounds: number;
  you: string;
  players: PublicPlayer[];
  turn: string; // player id
  step: 'draw' | 'discard';
  stockCount: number;
  /** Top few discards, newest last. */
  discardTop: Card[];
  discardCount: number;
  wildCard: Card | null;
  wildRank: number;
  myGroups: Card[][];
  /** Group kinds for my arrangement, so the UI can colour them. */
  myKinds: GroupKind[];
  myPoints: number;
  /** Whether I have drawn yet this round: decides whether a drop costs 20 or 40. */
  iHaveDrawn: boolean;
  log: string[];
  results: RoundResult[];
}

export function viewFor(state: GameState, id: string, connected: (playerId: string) => boolean): GameView {
  const me = state.players.find((p) => p.id === id);
  const groups = me?.groups ?? [];
  const evaluated = evaluateHand(groups, state.wildRank);
  return {
    phase: state.phase,
    round: state.round,
    totalRounds: state.totalRounds,
    you: id,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      cards: handCards(p).length,
      out: p.out,
      outReason: p.outReason,
      total: p.total,
      connected: connected(p.id),
    })),
    turn: state.players[state.turn]?.id ?? '',
    step: state.step,
    stockCount: state.stock.length,
    discardTop: state.discard.slice(-6),
    discardCount: state.discard.length,
    wildCard: state.wildCard,
    wildRank: state.wildRank,
    myGroups: groups,
    myKinds: evaluated.kinds,
    myPoints: evaluated.points,
    iHaveDrawn: me?.hasDrawn ?? false,
    log: state.log.slice(-12),
    results: state.results,
  };
}
