import Peer, { type DataConnection, type PeerOptions } from 'peerjs';
import { RoomHost, type Channel } from './host';
import type { Action, SessionState, ToGuest, ToHost } from './protocol';

/** One object the UI talks to, whether this browser is hosting the room or has joined someone else's. */
export interface Session {
  getState(): SessionState;
  subscribe(fn: () => void): () => void;
  act(action: Action): void;
  /** Most recent error message for this player (illegal move, full room...). Cleared when read. */
  takeError(): string | null;
  leave(): void;
  readonly code: string;
  readonly isHost: boolean;
}

const PREFIX = 'appdna-rummy-';
// No 0/O/1/I so a code read aloud or typed from a phone is unambiguous.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CONNECT_TIMEOUT_MS = 15_000;

/**
 * Connection settings. By default PeerJS uses its free public matchmaking server and Google's STUN server, which
 * is enough for most home and mobile networks. Set these at build time to self-host the matchmaking server or to
 * add a TURN relay for strict networks:
 *   VITE_PEER_HOST, VITE_PEER_PORT, VITE_PEER_PATH, VITE_PEER_SECURE ("false" for plain http/ws)
 *   VITE_PEER_ICE  JSON array of RTCIceServer, e.g. [{"urls":"turn:turn.example.com","username":"u","credential":"p"}]
 */
function peerOptions(): PeerOptions {
  const env = import.meta.env;
  const opts: PeerOptions = { debug: 0 };
  if (env.VITE_PEER_HOST) {
    opts.host = env.VITE_PEER_HOST;
    if (env.VITE_PEER_PORT) opts.port = Number(env.VITE_PEER_PORT);
    if (env.VITE_PEER_PATH) opts.path = env.VITE_PEER_PATH;
    opts.secure = env.VITE_PEER_SECURE !== 'false';
  }
  if (env.VITE_PEER_ICE) {
    try {
      opts.config = { iceServers: JSON.parse(env.VITE_PEER_ICE) };
    } catch { /* malformed: fall back to the defaults */ }
  }
  return opts;
}

export function makeCode(len = 5): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
}

/** A private token that lets this browser tab reclaim its seat after a refresh. Stays out of the shared view. */
function seatKey(code: string): string {
  const k = `rummy.key.${code}`;
  try {
    const found = sessionStorage.getItem(k);
    if (found) return found;
    const fresh = crypto.randomUUID();
    sessionStorage.setItem(k, fresh);
    return fresh;
  } catch {
    return crypto.randomUUID();
  }
}

/** Listeners and last-state bookkeeping shared by both session kinds. */
abstract class Base implements Session {
  protected state: SessionState = { status: 'connecting', message: 'Connecting…' };
  protected listeners = new Set<() => void>();
  protected error: string | null = null;
  abstract readonly isHost: boolean;
  constructor(readonly code: string) {}
  getState() { return this.state; }
  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }
  takeError() {
    const e = this.error;
    this.error = null;
    return e;
  }
  protected set(state: SessionState) {
    this.state = state;
    this.emit();
  }
  protected emit() { for (const fn of this.listeners) fn(); }
  protected apply(msg: ToGuest) {
    if (this.state.status === 'closed') return;
    if (msg.t === 'lobby') this.set({ status: 'lobby', code: this.code, lobby: msg.lobby });
    else if (msg.t === 'view') this.set({ status: 'game', code: this.code, view: msg.view, host: msg.host });
    else if (msg.t === 'error') { this.error = msg.message; this.emit(); }
    else this.set({ status: 'closed', message: msg.message });
  }
  abstract act(action: Action): void;
  abstract leave(): void;
}

export class HostSession extends Base {
  readonly isHost = true;
  private room = new RoomHost();
  private peer: Peer | null = null;
  private key: string;
  private connections = new Map<DataConnection, Channel>();

  private constructor(code: string, private readonly name: string) {
    super(code);
    this.key = seatKey(code);
  }

  /** Register a room with the PeerJS broker. Retries with a fresh code if the one picked is taken. */
  static create(name: string): Promise<HostSession> {
    return new Promise((resolve, reject) => {
      const attempt = (left: number) => {
        const code = makeCode();
        const session = new HostSession(code, name);
        const peer = new Peer(PREFIX + code, peerOptions());
        const timeout = setTimeout(() => {
          peer.destroy();
          reject(new Error('Could not reach the matchmaking service. Check your connection and try again.'));
        }, CONNECT_TIMEOUT_MS);
        peer.on('open', () => {
          clearTimeout(timeout);
          session.start(peer);
          resolve(session);
        });
        peer.on('error', (err: { type?: string }) => {
          clearTimeout(timeout);
          peer.destroy();
          if (err.type === 'unavailable-id' && left > 0) attempt(left - 1);
          else reject(new Error('Could not create a room. Check your connection and try again.'));
        });
      };
      attempt(4);
    });
  }

  private start(peer: Peer) {
    this.peer = peer;
    this.room.addLocal(this.key, this.name);
    this.room.subscribeLocal(() => this.refresh());
    this.refresh();
    peer.on('connection', (conn) => this.accept(conn));
    peer.on('disconnected', () => {
      // Lost the broker, not the players: existing connections keep working, new joins need the broker back.
      if (!peer.destroyed) peer.reconnect();
    });
    peer.on('error', () => { /* a single failed guest must not take the room down */ });
  }

  private accept(conn: DataConnection) {
    const channel: Channel = {
      send: (msg) => { if (conn.open) conn.send(msg); },
      close: () => conn.close(),
    };
    this.connections.set(conn, channel);
    conn.on('data', (raw) => {
      const msg = raw as ToHost;
      if (msg.t === 'join') {
        const id = this.room.join(String(msg.key), String(msg.name), channel);
        if (id) guestKeys.set(channel, String(msg.key));
      } else if (msg.t === 'act') {
        const key = guestKeys.get(channel);
        if (key) this.room.act(key, msg.act);
      }
    });
    const gone = () => {
      this.connections.delete(conn);
      this.room.disconnect(channel);
    };
    conn.on('close', gone);
    conn.on('error', gone);
  }

  private refresh() {
    const err = this.room.takeLocalError();
    if (err) this.error = err;
    this.apply(this.room.localMessage());
  }

  act(action: Action) { this.room.act(this.key, action); }

  leave() {
    this.room.shutdown();
    this.peer?.destroy();
    this.set({ status: 'closed', message: 'You closed the room.' });
  }
}

/** Remembers which key each guest channel joined with, so later actions cannot claim another seat. */
const guestKeys = new WeakMap<Channel, string>();

export class GuestSession extends Base {
  readonly isHost = false;
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private key: string;

  private constructor(code: string, private readonly name: string) {
    super(code);
    this.key = seatKey(code);
  }

  static join(code: string, name: string): Promise<GuestSession> {
    const session = new GuestSession(code, name);
    return new Promise((resolve, reject) => {
      const peer = new Peer(peerOptions());
      session.peer = peer;
      const fail = (message: string) => {
        clearTimeout(timeout);
        peer.destroy();
        reject(new Error(message));
      };
      const timeout = setTimeout(() => fail('Could not connect to that room. It may be closed, or your network blocks direct connections.'), CONNECT_TIMEOUT_MS);
      peer.on('error', (err: { type?: string }) =>
        fail(err.type === 'peer-unavailable' ? `No room found with code ${code}. Check the code and ask the host if it is still open.` : 'Could not reach the matchmaking service. Try again.'));
      peer.on('open', () => {
        const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
        conn.on('open', () => {
          clearTimeout(timeout);
          session.conn = conn;
          conn.send({ t: 'join', key: session.key, name: session.name } satisfies ToHost);
          resolve(session);
        });
        conn.on('data', (raw) => session.apply(raw as ToGuest));
        conn.on('close', () => {
          if (session.state.status !== 'closed') session.set({ status: 'closed', message: 'The connection to the host was lost.' });
        });
        conn.on('error', () => fail('The connection to the host failed.'));
      });
    });
  }

  act(action: Action) {
    if (this.conn?.open) this.conn.send({ t: 'act', act: action } satisfies ToHost);
  }

  leave() {
    this.conn?.close();
    this.peer?.destroy();
    this.set({ status: 'closed', message: 'You left the room.' });
  }
}
