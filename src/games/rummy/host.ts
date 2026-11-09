import {
  MAX_PLAYERS, MIN_PLAYERS, arrangeHand, declare, discardCard, drawFromDiscard, drawFromStock, dropPlayer,
  handCards, newGame, nextRound, viewFor, type GameState,
} from './engine';
import type { Action, LobbyView, ToGuest } from './protocol';

/** A way to push a message to one player. The PeerJS binding supplies these; tests supply fakes. */
export interface Channel {
  send(msg: ToGuest): void;
  close(): void;
}

interface Seat {
  id: string;
  key: string;
  name: string;
  channel: Channel | null; // null while disconnected (and always for the host's own local seat)
  local: boolean;
}

/** How long a disconnected player's turn is held before the host plays it for them. */
export const ABSENT_TURN_MS = 30_000;

/**
 * The room. Runs in the host's browser and is the only place the real game state exists. Guests send actions;
 * the host validates them and sends each player a view that contains only what they may see.
 */
export class RoomHost {
  private seats: Seat[] = [];
  private game: GameState | null = null;
  private rounds = 3;
  private nextSeat = 1;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<() => void>();
  hostId = '';

  constructor(private readonly absentMs = ABSENT_TURN_MS) {}

  /** The host's own seat. Its updates reach the UI through `subscribeLocal`. */
  addLocal(key: string, name: string): string {
    const seat = this.addSeat(key, name, null, true);
    this.hostId = seat.id;
    return seat.id;
  }

  subscribeLocal(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Latest thing the host's own screen should show. */
  localMessage(): ToGuest {
    return this.messageFor(this.hostId);
  }

  /** A guest sent a join. Returns the seat id, or null if refused (the guest is told why). */
  join(key: string, name: string, channel: Channel): string | null {
    const cleanName = name.trim().slice(0, 20) || 'Player';
    const existing = this.seats.find((s) => s.key === key);
    if (existing) {
      const old = existing.channel;
      existing.channel = channel; // swap first so the old channel's close event no longer matches this seat
      old?.close();
      this.broadcast();
      return existing.id;
    }
    if (this.game) {
      channel.send({ t: 'error', message: 'This game has already started. Ask the host to start a new room.' });
      channel.close();
      return null;
    }
    if (this.seats.length >= MAX_PLAYERS) {
      channel.send({ t: 'error', message: `This room is full (${MAX_PLAYERS} players).` });
      channel.close();
      return null;
    }
    const seat = this.addSeat(key, cleanName, channel, false);
    this.broadcast();
    return seat.id;
  }

  /** A guest's connection dropped. In the lobby the seat is freed; in a game it is held for them to return. */
  disconnect(channel: Channel) {
    const seat = this.seats.find((s) => s.channel === channel);
    if (!seat) return;
    seat.channel = null;
    if (!this.game) this.seats = this.seats.filter((s) => s !== seat);
    this.broadcast();
  }

  /** Handle an action from the seat that owns `key`. */
  act(key: string, action: Action) {
    const seat = this.seats.find((s) => s.key === key);
    if (!seat) return;
    const error = this.apply(seat, action);
    if (error) this.tell(seat, { t: 'error', message: error });
    this.broadcast();
  }

  /** The host closed the room. */
  shutdown(message = 'The host closed the room.') {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    for (const s of this.seats) {
      s.channel?.send({ t: 'closed', message });
      s.channel?.close();
    }
  }

  // --------------------------------------------------------------------------------------------------------------

  private addSeat(key: string, name: string, channel: Channel | null, local: boolean): Seat {
    const base = name.trim().slice(0, 20) || 'Player';
    let unique = base;
    for (let n = 2; this.seats.some((s) => s.name === unique); n++) unique = `${base} ${n}`;
    const seat: Seat = { id: `p${this.nextSeat++}`, key, name: unique, channel, local };
    this.seats.push(seat);
    return seat;
  }

  private apply(seat: Seat, action: Action): string | null {
    const isHost = seat.id === this.hostId;
    const g = this.game;
    const result = (r: { ok: boolean; error?: string }) => (r.ok ? null : (r as { error: string }).error);

    switch (action.a) {
      case 'rounds':
        if (!isHost || g) return 'Only the host can change rounds before the game starts.';
        this.rounds = Math.max(1, Math.min(10, Math.floor(action.n) || 1));
        return null;
      case 'start':
        if (!isHost) return 'Only the host can start the game.';
        if (g) return 'The game has already started.';
        if (this.seats.length < MIN_PLAYERS) return `You need at least ${MIN_PLAYERS} players to start.`;
        if (this.seats.some((s) => !s.local && !s.channel)) return 'Wait for everyone to be connected, or remove the player who left.';
        this.game = newGame(this.seats.map((s) => ({ id: s.id, name: s.name })), this.rounds);
        return null;
      case 'kick': {
        if (!isHost || g) return 'Players can only be removed from the lobby, by the host.';
        const target = this.seats.find((s) => s.id === action.id);
        if (!target || target.id === this.hostId) return null;
        target.channel?.send({ t: 'closed', message: 'The host removed you from the room.' });
        target.channel?.close();
        this.seats = this.seats.filter((s) => s !== target);
        return null;
      }
    }

    if (!g) return 'The game has not started yet.';
    switch (action.a) {
      case 'draw': return result(drawFromStock(g, seat.id));
      case 'take': return result(drawFromDiscard(g, seat.id));
      case 'discard': return result(discardCard(g, seat.id, action.card));
      case 'arrange': return result(arrangeHand(g, seat.id, action.groups));
      case 'declare': return result(declare(g, seat.id, action.card, action.groups));
      case 'drop': return result(dropPlayer(g, seat.id));
      case 'next':
        if (!isHost) return 'Only the host can start the next round.';
        return result(nextRound(g));
      case 'dropAbsent': {
        if (!isHost) return 'Only the host can do that.';
        const current = g.players[g.turn];
        if (g.phase !== 'playing' || this.isConnected(current.id)) return 'Everyone is connected.';
        return this.playForAbsent();
      }
    }
    return null;
  }

  private isConnected(id: string): boolean {
    const s = this.seats.find((x) => x.id === id);
    return !!s && (s.local || !!s.channel);
  }

  /** Make the current (disconnected) player's move: drop before drawing, otherwise throw back what they just drew. */
  private playForAbsent(): string | null {
    const g = this.game;
    if (!g || g.phase !== 'playing') return null;
    const p = g.players[g.turn];
    if (g.step === 'draw') {
      const r = dropPlayer(g, p.id, 'auto');
      return r.ok ? null : r.error;
    }
    const cards = handCards(p);
    const r = discardCard(g, p.id, cards[cards.length - 1].id);
    return r.ok ? null : r.error;
  }

  /** If the player whose turn it is has gone, give them a short window to come back, then play for them. */
  private watchAbsent() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const g = this.game;
    if (!g || g.phase !== 'playing') return;
    const current = g.players[g.turn];
    if (this.isConnected(current.id)) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const cur = this.game?.players[this.game.turn];
      if (cur && !this.isConnected(cur.id)) {
        this.playForAbsent();
        this.broadcast();
      }
    }, this.absentMs);
  }

  private lobbyView(forId: string): LobbyView {
    return {
      you: forId,
      host: this.hostId,
      players: this.seats.map((s) => ({ id: s.id, name: s.name, connected: s.local || !!s.channel })),
      rounds: this.rounds,
    };
  }

  /**
   * Always a deep copy: the engine mutates hands in place, and the host's own screen would otherwise hold live
   * references that change under React without it noticing.
   */
  private messageFor(id: string): ToGuest {
    if (this.game) return structuredClone({ t: 'view', view: viewFor(this.game, id, (pid) => this.isConnected(pid)), host: this.hostId } as ToGuest);
    return { t: 'lobby', lobby: this.lobbyView(id) };
  }

  private tell(seat: Seat, msg: ToGuest) {
    if (seat.local) {
      this.localError = msg.t === 'error' ? msg.message : this.localError;
      return;
    }
    seat.channel?.send(msg);
  }

  /** Last error for the host's own seat, read once by the UI. */
  private localError: string | null = null;
  takeLocalError(): string | null {
    const e = this.localError;
    this.localError = null;
    return e;
  }

  private broadcast() {
    this.watchAbsent();
    for (const s of this.seats) if (s.channel) s.channel.send(this.messageFor(s.id));
    for (const fn of this.listeners) fn();
  }
}
