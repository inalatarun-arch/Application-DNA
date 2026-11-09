import { useEffect, useReducer, useState } from 'react';
import { GuestSession, HostSession, normalizeCode, type Session } from './session';

/**
 * The one live room for this browser tab. Kept outside React so moving to another page of the site and back
 * does not drop the connection or end the game.
 */
let active: Session | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

const LAST_ROOM = 'rummy.lastRoom';
const NAME_KEY = 'games.playerName';

export function savedName(): string {
  try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; }
}
function saveName(name: string) {
  try { localStorage.setItem(NAME_KEY, name); } catch { /* private mode: fine */ }
}
function rememberRoom(code: string | null) {
  try {
    if (code) sessionStorage.setItem(LAST_ROOM, code); else sessionStorage.removeItem(LAST_ROOM);
  } catch { /* ignore */ }
}
export function lastRoom(): string | null {
  try { return sessionStorage.getItem(LAST_ROOM); } catch { return null; }
}

export function activeSession(): Session | null {
  return active;
}

function install(session: Session) {
  active?.leave();
  active = session;
  notify();
}

export async function hostRoom(name: string): Promise<void> {
  saveName(name);
  install(await HostSession.create(name));
  rememberRoom(null); // hosts cannot rejoin after a refresh: the room lives in their browser
}

export async function joinRoom(rawCode: string, name: string): Promise<void> {
  const code = normalizeCode(rawCode);
  if (code.length !== 5) throw new Error('Room codes are 5 letters or numbers.');
  saveName(name);
  install(await GuestSession.join(code, name));
  rememberRoom(code);
}

export function leaveRoom() {
  active?.leave();
  active = null;
  rememberRoom(null);
  notify();
}

/** Re-render when the room changes, and surface one-off error messages (illegal move, full room) as a notice. */
export function useRoom() {
  const [session, setSession] = useState<Session | null>(active);
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setSession(active);
    listeners.add(sync);
    sync();
    return () => { listeners.delete(sync); };
  }, []);

  useEffect(() => {
    if (!session) return;
    return session.subscribe(() => {
      const e = session.takeError();
      if (e) setNotice(e);
      bump();
    });
  }, [session]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  // Warn before a refresh or tab close would end a game in progress.
  const live = session?.getState().status === 'game' || session?.getState().status === 'lobby';
  useEffect(() => {
    if (!live) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [live]);

  return { session, state: session?.getState() ?? null, notice };
}
