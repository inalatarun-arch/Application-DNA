import { useState } from 'react';
import { Loader2, LogIn, Plus } from 'lucide-react';
import { hostRoom, joinRoom, savedName } from '../store';
import { normalizeCode } from '../session';

/** First screen: pick a name, then either open a room or join one with a code. */
export default function Entry({ initialCode }: { initialCode: string }) {
  const [name, setName] = useState(savedName());
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState<'host' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const go = async (kind: 'host' | 'join') => {
    if (!name.trim()) { setError('Enter your name first.'); return; }
    setBusy(kind);
    setError(null);
    try {
      if (kind === 'host') await hostRoom(name.trim());
      else await joinRoom(code, name.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto grid max-w-3xl gap-4 md:grid-cols-2">
      <div className="card md:col-span-2">
        <label htmlFor="rummy-name" className="field-label">Your name</label>
        <input
          id="rummy-name" className="input max-w-sm" value={name} maxLength={20} placeholder="e.g. Priya"
          onChange={(e) => setName(e.target.value)} autoComplete="nickname"
        />
        <p className="field-hint">Shown to the other players at the table.</p>
      </div>

      <div className="card flex flex-col">
        <h2 className="text-headline-md">Start a game</h2>
        <p className="mt-1 flex-1 text-body-md text-on-surface-variant">
          Open a room and share the code or link with your friends. You need at least 3 players, up to 6.
        </p>
        <button type="button" className="btn btn-primary mt-4 self-start" disabled={busy !== null} onClick={() => void go('host')}>
          {busy === 'host' ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Plus size={16} aria-hidden />}
          Create room
        </button>
      </div>

      <form className="card flex flex-col" onSubmit={(e) => { e.preventDefault(); void go('join'); }}>
        <h2 className="text-headline-md">Join a game</h2>
        <label htmlFor="rummy-code" className="field-label mt-1">Room code</label>
        <input
          id="rummy-code" className="input max-w-[12rem] font-mono uppercase tracking-[0.25em]" value={code} maxLength={5}
          placeholder="ABCDE" onChange={(e) => setCode(normalizeCode(e.target.value))} autoCapitalize="characters"
        />
        <button type="submit" className="btn btn-secondary mt-4 self-start" disabled={busy !== null || code.length !== 5}>
          {busy === 'join' ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <LogIn size={16} aria-hidden />}
          Join room
        </button>
      </form>

      {error && <p role="alert" className="rounded border border-error/40 bg-error-container px-3 py-2 text-body-md text-error md:col-span-2">{error}</p>}
    </div>
  );
}
