import type { GameView } from './engine';

/** What a player can ask the host to do. The host checks every one; clients are never trusted. */
export type Action =
  | { a: 'start' }
  | { a: 'rounds'; n: number }
  | { a: 'draw' }
  | { a: 'take' }
  | { a: 'discard'; card: number }
  | { a: 'arrange'; groups: number[][] }
  | { a: 'declare'; card: number; groups: number[][] }
  | { a: 'drop' }
  | { a: 'next' }
  | { a: 'dropAbsent' }
  | { a: 'kick'; id: string };

/** Guest to host. `key` is a private token that lets a guest rejoin the same seat after a refresh. */
export type ToHost = { t: 'join'; key: string; name: string } | { t: 'act'; act: Action };

export interface LobbyPlayer {
  id: string;
  name: string;
  connected: boolean;
}

export interface LobbyView {
  you: string;
  host: string;
  players: LobbyPlayer[];
  rounds: number;
}

/** Host to guest. */
export type ToGuest =
  | { t: 'lobby'; lobby: LobbyView }
  | { t: 'view'; view: GameView; host: string }
  | { t: 'error'; message: string }
  | { t: 'closed'; message: string };

/** What the UI renders. Identical for the host and for guests. */
export type SessionState =
  | { status: 'connecting'; message: string }
  | { status: 'lobby'; code: string; lobby: LobbyView }
  | { status: 'game'; code: string; view: GameView; host: string }
  | { status: 'closed'; message: string };
