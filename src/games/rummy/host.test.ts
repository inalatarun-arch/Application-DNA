import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomHost, type Channel } from './host';
import type { ToGuest } from './protocol';

function fake() {
  const got: ToGuest[] = [];
  let closed = false;
  const ch: Channel & { got: ToGuest[]; closed: () => boolean; last: () => ToGuest } = {
    got,
    send: (m) => { got.push(m); },
    close: () => { closed = true; },
    closed: () => closed,
    last: () => got[got.length - 1],
  };
  return ch;
}

function lobbyOf(room: RoomHost, n: number) {
  room.addLocal('k0', 'Host');
  const guests = Array.from({ length: n - 1 }, (_, i) => {
    const ch = fake();
    room.join(`k${i + 1}`, `Guest${i + 1}`, ch);
    return ch;
  });
  return guests;
}

describe('RoomHost lobby', () => {
  it('lists players, dedupes names, caps at six', () => {
    const room = new RoomHost();
    room.addLocal('k0', 'Sam');
    const a = fake(); room.join('k1', 'Sam', a);
    const m = a.last();
    expect(m.t).toBe('lobby');
    if (m.t === 'lobby') expect(m.lobby.players.map((p) => p.name)).toEqual(['Sam', 'Sam 2']);
    for (let i = 2; i < 6; i++) room.join(`k${i}`, `P${i}`, fake());
    const extra = fake();
    expect(room.join('k9', 'Late', extra)).toBeNull();
    expect(extra.last()).toMatchObject({ t: 'error' });
    expect(extra.closed()).toBe(true);
  });

  it('will not start with fewer than three players, and only the host can start', () => {
    const room = new RoomHost();
    const [g1] = lobbyOf(room, 2);
    room.act('k0', { a: 'start' });
    expect(room.takeLocalError()).toMatch(/at least 3/);
    room.act('k1', { a: 'start' });
    expect(g1.got.some((m) => m.t === 'error')).toBe(true);
  });

  it('a disconnected guest frees the lobby seat', () => {
    const room = new RoomHost();
    const [g1] = lobbyOf(room, 3);
    room.disconnect(g1);
    const m = room.localMessage();
    if (m.t === 'lobby') expect(m.lobby.players).toHaveLength(2);
  });
});

describe('RoomHost game', () => {
  it('starts with 3 players and gives each only their own cards', () => {
    const room = new RoomHost();
    const [g1, g2] = lobbyOf(room, 3);
    room.act('k0', { a: 'rounds', n: 2 });
    room.act('k0', { a: 'start' });
    for (const ch of [g1, g2]) {
      const m = ch.last();
      expect(m.t).toBe('view');
      if (m.t === 'view') {
        expect(m.view.myGroups.flat()).toHaveLength(13);
        expect(m.view.totalRounds).toBe(2);
      }
    }
    const a = g1.last(), b = g2.last();
    if (a.t === 'view' && b.t === 'view') {
      const ids = new Set(a.view.myGroups.flat().map((c) => c.id));
      expect(b.view.myGroups.flat().some((c) => ids.has(c.id))).toBe(false);
    }
  });

  it('ignores moves out of turn and reports why', () => {
    const room = new RoomHost();
    const [g1, g2] = lobbyOf(room, 3);
    room.act('k0', { a: 'start' });
    const m = g1.last();
    if (m.t !== 'view') throw new Error('no view');
    const notTurn = m.view.turn === m.view.you ? 'k2' : 'k1';
    const ch = notTurn === 'k1' ? g1 : g2;
    room.act(notTurn, { a: 'draw' });
    expect(ch.got.some((x) => x.t === 'error')).toBe(true);
  });

  it('a late stranger cannot join, but a known player can reconnect to their seat', () => {
    const room = new RoomHost();
    const [g1] = lobbyOf(room, 3);
    room.act('k0', { a: 'start' });
    const stranger = fake();
    expect(room.join('nope', 'Late', stranger)).toBeNull();
    room.disconnect(g1);
    const back = fake();
    expect(room.join('k1', 'Guest1', back)).not.toBeNull();
    expect(back.last().t).toBe('view');
  });
});

describe('views are snapshots', () => {
  it('a view taken earlier does not change when the game moves on', () => {
    const room = new RoomHost();
    lobbyOf(room, 3);
    room.act('k0', { a: 'start' });
    const before = room.localMessage();
    if (before.t !== 'view') throw new Error('no view');
    const snapshot = JSON.stringify(before.view);
    // Whoever is to move (host or guest) draws; the host's old snapshot must stay exactly as it was.
    const turnKey = { p1: 'k0', p2: 'k1', p3: 'k2' }[before.view.turn as 'p1'];
    room.act(turnKey, { a: 'draw' });
    expect(JSON.stringify(before.view)).toBe(snapshot);
    expect(room.localMessage()).not.toBe(before);
  });
});

describe('absent players', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('plays a drop for a disconnected player whose turn it is after the grace period', () => {
    const room = new RoomHost(1000);
    const guests = lobbyOf(room, 3);
    room.act('k0', { a: 'start' });
    const first = (room.localMessage() as { t: 'view'; view: { turn: string } }).view.turn;
    // p1 = host, p2 = guest1, p3 = guest2. Turn starts left of dealer (p1 is dealer), so p2.
    expect(first).toBe('p2');
    room.disconnect(guests[0]);
    vi.advanceTimersByTime(999);
    expect((room.localMessage() as { t: 'view'; view: { turn: string } }).view.turn).toBe('p2');
    vi.advanceTimersByTime(2);
    const v = (room.localMessage() as { t: 'view'; view: { turn: string; players: { id: string; out: boolean; total: number }[] } }).view;
    expect(v.turn).toBe('p3');
    expect(v.players.find((p) => p.id === 'p2')!.out).toBe(true);
  });

  it('host can drop an absent player immediately; refused when everyone is connected', () => {
    const room = new RoomHost(60_000);
    const guests = lobbyOf(room, 3);
    room.act('k0', { a: 'start' });
    room.act('k0', { a: 'dropAbsent' });
    expect(room.takeLocalError()).toMatch(/connected/);
    room.disconnect(guests[0]);
    room.act('k0', { a: 'dropAbsent' });
    expect(room.takeLocalError()).toBeNull();
    expect((room.localMessage() as { t: 'view'; view: { turn: string } }).view.turn).toBe('p3');
  });
});
