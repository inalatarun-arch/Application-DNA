import { useState } from 'react';
import { Lock, KeyRound, Loader2 } from 'lucide-react';
import { useVault } from './useVault';
import { unlock } from '../lib/vault';
import { btnPrimary, btnSecondary, input } from './ui';

/** Shown above AI pages when the shared Gemini key is missing or locked. Renders nothing when ready. */
export function AiKeyBanner({ onOpenSettings }: { onOpenSettings: () => void }) {
  const vault = useVault();
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (vault.unlocked) return null;

  const doUnlock = async () => {
    setBusy(true);
    setErr('');
    try {
      await unlock(pass);
      setPass('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not unlock.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded border-2 border-[#111827] bg-white px-4 py-3 text-[13px]">
      {vault.hasVault ? <Lock size={16} /> : <KeyRound size={16} />}
      {!vault.hasVault ? (
        <>
          <span className="flex-1">AI features need your Gemini API key. Add it once - it is stored encrypted.</span>
          <button className={btnPrimary} onClick={onOpenSettings}>
            Open AI Settings
          </button>
        </>
      ) : (
        <>
          <span className="flex-1">Your AI key is locked for this session.</span>
          {vault.mode === 'passphrase' ? (
            <>
              <input
                type="password"
                className={`${input} max-w-[240px]`}
                placeholder="Passphrase"
                value={pass}
                autoComplete="off"
                onChange={(e) => setPass(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && pass && void doUnlock()}
              />
              <button className={btnPrimary} disabled={busy || !pass} onClick={() => void doUnlock()}>
                {busy && <Loader2 size={14} className="animate-spin" />} Unlock
              </button>
            </>
          ) : (
            <button className={btnPrimary} disabled={busy} onClick={() => void doUnlock()}>
              Unlock
            </button>
          )}
          <button className={btnSecondary} onClick={onOpenSettings}>
            AI Settings
          </button>
          {err && <span className="w-full text-[12px] font-semibold">{err}</span>}
        </>
      )}
    </div>
  );
}
