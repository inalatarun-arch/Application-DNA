import { useState } from 'react';
import { Check, Copy, Crown, UserMinus, Users } from 'lucide-react';
import type { Session } from '../session';
import type { LobbyView } from '../protocol';
import { MAX_PLAYERS, MIN_PLAYERS } from '../engine';

export function inviteLink(code: string): string {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#/games/rummy?room=${code}`;
}

export default function Lobby({ session, code, lobby }: { session: Session; code: string; lobby: LobbyView }) {
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const isHost = session.isHost;
  const ready = lobby.players.length >= MIN_PLAYERS;

  const copy = async (what: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(what === 'code' ? code : inviteLink(code));
      setCopied(what);
      setTimeout(() => setCopied(null), 1800);
    } catch { /* clipboard blocked: the code is on screen anyway */ }
  };

  return (
    <div className="mx-auto grid max-w-3xl gap-4 md:grid-cols-5">
      <div className="card md:col-span-2">
        <p className="eyebrow">Room code</p>
        <p className="mt-1 font-mono text-4xl font-semibold tracking-[0.2em]" aria-label={`Room code ${code.split('').join(' ')}`}>{code}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copy('code')}>
            {copied === 'code' ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />} Copy code
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copy('link')}>
            {copied === 'link' ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />} Copy invite link
          </button>
        </div>
        <p className="field-hint">Friends open the link, or go to Games, Rummy and type the code.</p>
      </div>

      <div className="card md:col-span-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-headline-md"><Users size={18} aria-hidden /> Players ({lobby.players.length}/{MAX_PLAYERS})</h2>
        </div>
        <ul className="mt-3 divide-y divide-outline-variant">
          {lobby.players.map((p) => (
            <li key={p.id} className="flex items-center gap-2 py-2">
              <span className="flex-1 truncate font-medium">
                {p.name}{p.id === lobby.you && <span className="text-on-surface-variant"> (you)</span>}
              </span>
              {p.id === lobby.host && <span className="inline-flex items-center gap-1 text-label-md text-on-surface-variant"><Crown size={14} aria-hidden /> Host</span>}
              {isHost && p.id !== lobby.host && (
                <button type="button" className="icon-btn" aria-label={`Remove ${p.name}`} onClick={() => session.act({ a: 'kick', id: p.id })}>
                  <UserMinus size={16} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>

        {isHost ? (
          <div className="mt-4 space-y-3">
            <div>
              <label htmlFor="rummy-rounds" className="field-label">Number of rounds</label>
              <select
                id="rummy-rounds" className="input max-w-[10rem]" value={lobby.rounds}
                onChange={(e) => session.act({ a: 'rounds', n: Number(e.target.value) })}
              >
                {[1, 2, 3, 5, 7, 10].map((n) => <option key={n} value={n}>{n} {n === 1 ? 'round' : 'rounds'}</option>)}
              </select>
              <p className="field-hint">Lowest total points after the last round wins.</p>
            </div>
            <button type="button" className="btn btn-primary" disabled={!ready} onClick={() => session.act({ a: 'start' })}>
              Start game
            </button>
            {!ready && <p className="field-hint">Waiting for {MIN_PLAYERS - lobby.players.length} more {MIN_PLAYERS - lobby.players.length === 1 ? 'player' : 'players'} (minimum {MIN_PLAYERS}).</p>}
          </div>
        ) : (
          <p className="mt-4 text-body-md text-on-surface-variant">
            Waiting for the host to start. {lobby.rounds} {lobby.rounds === 1 ? 'round' : 'rounds'} will be played.
          </p>
        )}
      </div>
    </div>
  );
}
