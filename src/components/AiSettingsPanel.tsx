import { useState } from 'react';
import { Eye, EyeOff, Lock, Unlock, ShieldCheck, Trash2, PlugZap, Loader2, KeyRound, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useVault } from './useVault';
import {
  saveKey,
  unlock,
  lock,
  deleteVault,
  findLegacyKeys,
  readLegacyKey,
  wipeLegacyKeys,
} from '../lib/vault';
import type { VaultMode, LegacyKeyHit } from '../lib/vault';
import { testConnection } from '@/services/geminiService';
import { DEFAULT_MODEL } from '@/config/ai';
import { btnPrimary, btnSecondary, card, h2, h3, input, label, muted } from './ui';

export function AiSettingsPanel() {
  const vault = useVault();
  const [apiKey, setApiKey] = useState('');
  const [reveal, setReveal] = useState(false);
  const [mode, setMode] = useState<VaultMode>('passphrase');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [unlockPass, setUnlockPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [model, setModelState] = useState(DEFAULT_MODEL);
  const [models, setModels] = useState<string[]>([]);
  const [testing, setTesting] = useState(false);
  const [legacy, setLegacy] = useState<LegacyKeyHit[]>(() => findLegacyKeys());
  const [replacing, setReplacing] = useState(false);

  const showForm = !vault.hasVault || replacing;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Something went wrong.' });
    } finally {
      setBusy(false);
    }
  };

  const onSave = () =>
    run(async () => {
      if (mode === 'passphrase' && pass !== pass2) throw new Error('Passphrases do not match.');
      await saveKey(apiKey, mode, pass);
      setApiKey('');
      setPass('');
      setPass2('');
      setReveal(false);
      setReplacing(false);
      setMsg({ kind: 'ok', text: 'Key encrypted and saved. It is now unlocked for this session.' });
    });

  const onUnlock = () =>
    run(async () => {
      await unlock(unlockPass);
      setUnlockPass('');
      setMsg({ kind: 'ok', text: 'Unlocked for this browser session.' });
    });

  const onTest = async () => {
    setTesting(true);
    setMsg(null);
    const r = await testConnection({ model });
    if (r.models.length) setModels(r.models);
    setMsg({ kind: r.ok ? 'ok' : 'err', text: r.message + (r.latencyMs ? ` (${r.latencyMs} ms)` : '') });
    setTesting(false);
  };

  const importLegacy = () =>
    run(async () => {
      const first = legacy.map(readLegacyKey).find((k): k is string => !!k);
      if (!first) throw new Error('Could not read the old key.');
      if (mode === 'passphrase' && (pass.length < 8 || pass !== pass2))
        throw new Error('Set a passphrase (8+ characters, entered twice) below, then import.');
      await saveKey(first, mode, pass);
      wipeLegacyKeys(legacy);
      setLegacy(findLegacyKeys());
      setPass('');
      setPass2('');
      setMsg({ kind: 'ok', text: 'Imported the old key into the encrypted vault and erased the plain-text copies.' });
    });

  return (
    <div className="space-y-6">
      <div>
        <h2 className={h2}>AI Settings</h2>
        <p className={muted}>One Gemini API key powers every AI feature (impact analysis, user stories, FRD, TDD, copilot).</p>
      </div>

      {/* status */}
      <div className={`${card} flex flex-wrap items-center gap-3`}>
        <KeyRound size={18} />
        <div className="flex-1">
          <div className={h3}>
            {!vault.hasVault ? 'No API key saved' : vault.unlocked ? 'API key unlocked (this session)' : 'API key saved - locked'}
          </div>
          <div className={muted}>
            {vault.hasVault
              ? `Stored encrypted (AES-256-GCM, ${vault.mode === 'passphrase' ? 'passphrase-protected' : 'device-bound'}). The key itself is never shown again.`
              : 'Paste your key below. It is encrypted in your browser before it is stored.'}
          </div>
        </div>
        {vault.hasVault && vault.unlocked && (
          <button className={btnSecondary} onClick={lock}>
            <Lock size={14} /> Lock now
          </button>
        )}
        {vault.hasVault && !replacing && (
          <button className={btnSecondary} onClick={() => setReplacing(true)}>
            Replace key
          </button>
        )}
        {vault.hasVault && (
          <button
            className={btnSecondary}
            onClick={() => {
              if (window.confirm('Delete the stored API key from this browser?')) void deleteVault();
            }}
          >
            <Trash2 size={14} /> Remove
          </button>
        )}
      </div>

      {/* unlock */}
      {vault.hasVault && !vault.unlocked && vault.mode === 'passphrase' && (
        <div className={card}>
          <h3 className={`${h3} mb-3`}>Unlock</h3>
          <div className="flex max-w-xl gap-2">
            <input
              type="password"
              className={input}
              placeholder="Passphrase"
              value={unlockPass}
              autoComplete="off"
              onChange={(e) => setUnlockPass(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && unlockPass && void onUnlock()}
            />
            <button className={btnPrimary} disabled={busy || !unlockPass} onClick={() => void onUnlock()}>
              <Unlock size={14} /> Unlock
            </button>
          </div>
        </div>
      )}

      {/* add / replace */}
      {showForm && (
        <div className={card}>
          <h3 className={`${h3} mb-4`}>{vault.hasVault ? 'Replace API key' : 'Add your Gemini API key'}</h3>
          <div className="max-w-xl space-y-4">
            <div>
              <label className={label} htmlFor="eih-key">
                Gemini API key
              </label>
              <div className="flex gap-2">
                <input
                  id="eih-key"
                  className={input}
                  type={reveal ? 'text' : 'password'}
                  value={apiKey}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="••••••••••••••••••••"
                  onChange={(e) => setApiKey(e.target.value)}
                />
                <button className={btnSecondary} type="button" onClick={() => setReveal((r) => !r)} aria-label="Toggle visibility">
                  {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <p className={`${muted} mt-1`}>Visibility toggle works only while typing. After saving, the key can no longer be displayed.</p>
            </div>

            <div>
              <span className={label}>Protection</span>
              <label className="mb-2 flex cursor-pointer items-start gap-2 text-[13px]">
                <input type="radio" checked={mode === 'passphrase'} onChange={() => setMode('passphrase')} className="mt-1" />
                <span>
                  <strong>Passphrase (recommended)</strong> - the key is encrypted with a passphrase only you know. You enter it once per
                  browser session.
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 text-[13px]">
                <input type="radio" checked={mode === 'device'} onChange={() => setMode('device')} className="mt-1" />
                <span>
                  <strong>This device only</strong> - no passphrase; encrypted with a non-exportable browser key. Convenient, but weaker:
                  anyone using this browser profile can use the app.
                </span>
              </label>
            </div>

            {mode === 'passphrase' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={label}>Passphrase (min 8 characters)</label>
                  <input type="password" className={input} value={pass} autoComplete="new-password" onChange={(e) => setPass(e.target.value)} />
                </div>
                <div>
                  <label className={label}>Repeat passphrase</label>
                  <input type="password" className={input} value={pass2} autoComplete="new-password" onChange={(e) => setPass2(e.target.value)} />
                </div>
              </div>
            )}
            <p className={`${muted}`}>If you forget the passphrase it cannot be recovered - you would simply add the key again.</p>
            <div className="flex gap-2">
              <button className={btnPrimary} disabled={busy || !apiKey.trim()} onClick={() => void onSave()}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Encrypt &amp; save
              </button>
              {replacing && (
                <button className={btnSecondary} onClick={() => setReplacing(false)}>
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* model + test */}
      <div className={card}>
        <h3 className={`${h3} mb-4`}>Model &amp; connection</h3>
        <div className="max-w-xl space-y-3">
          <div>
            <label className={label} htmlFor="eih-model">
              Model
            </label>
            <input
              id="eih-model"
              className={input}
              list="eih-model-list"
              value={model}
              onChange={(e) => setModelState(e.target.value)}
              onBlur={() => undefined}
            />
            <datalist id="eih-model-list">
              {[...new Set([DEFAULT_MODEL, ...models])].map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            <p className={`${muted} mt-1`}>
              "gemini-flash-latest" always follows Google's current Flash model, so it keeps working when older versions are retired. Click
              Test Connection to load the models your key can use.
            </p>
          </div>
          <button className={btnSecondary} disabled={testing || !vault.unlocked} onClick={() => void onTest()}>
            {testing ? <Loader2 size={14} className="animate-spin" /> : <PlugZap size={14} />} Test Connection
          </button>
          {!vault.unlocked && <p className={muted}>Unlock the key first to test it.</p>}
        </div>
      </div>

      {/* legacy keys */}
      {legacy.length > 0 && (
        <div className={`${card} border-2 border-[#111827]`}>
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle size={16} />
            <h3 className={h3}>Plain-text keys found in this browser</h3>
          </div>
          <p className={`${muted} mb-3`}>
            Earlier versions stored API keys unencrypted. Import one into the vault (it becomes the single shared key) and the plain-text copies
            are erased.
          </p>
          <ul className="mb-3 space-y-1 text-[13px]">
            {legacy.map((l) => (
              <li key={`${l.storage}:${l.name}`}>
                <code>{l.name}</code> ({l.storage}) - {l.preview}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button className={btnPrimary} disabled={busy} onClick={() => void importLegacy()}>
              Import &amp; erase old copies
            </button>
            <button
              className={btnSecondary}
              onClick={() => {
                wipeLegacyKeys(legacy);
                setLegacy(findLegacyKeys());
              }}
            >
              Just erase them
            </button>
          </div>
          {!vault.hasVault && mode === 'passphrase' && <p className={`${muted} mt-2`}>Importing uses the passphrase fields in the form above.</p>}
        </div>
      )}

      {msg && (
        <div
          role="status"
          className={`flex items-start gap-2 rounded border px-3 py-2 text-[13px] ${
            msg.kind === 'ok' ? 'border-[#9CA3AF] bg-[#F3F4F6]' : 'border-2 border-[#111827] bg-white'
          }`}
        >
          {msg.kind === 'ok' ? <CheckCircle2 size={16} className="mt-[1px]" /> : <AlertTriangle size={16} className="mt-[1px]" />}
          <span>{msg.text}</span>
        </div>
      )}

      <div className={`${card} bg-[#F9FAFB]`}>
        <h3 className={`${h3} mb-2`}>What this protects - and what it cannot</h3>
        <ul className="list-disc space-y-1 pl-5 text-[13px] text-[#45464c]">
          <li>The key is never in the source code, the Git repository or the published site files. Visitors to your public URL cannot find it.</li>
          <li>It is stored only as AES-256-GCM ciphertext in your browser, so reading browser storage reveals nothing usable.</li>
          <li>
            While unlocked, the key is in memory and is sent to Google with each request - you (or anyone at an unlocked browser) can see it in the
            Network tab. A browser-only app cannot hide a key from its own user.
          </li>
          <li>
            For stronger protection, restrict the key in Google AI Studio / Cloud Console to your site's HTTP referrer, and set a quota cap.
          </li>
        </ul>
      </div>

      {/*
      ===========================================================================================
      MULTI-KEY ROUTING SCREEN - DISABLED ON PURPOSE (re-enable when separate keys are needed)
      ===========================================================================================
      To reinstate:
        1. Uncomment this block and the imports it needs.
        2. Extend src/lib/vault.ts to store { [FeatureId]: encrypted record } (one record per feature,
           each encrypted the same way), with saveKeyFor(feature, ...) / getKeyFor(feature).
        3. In src/lib/gemini.ts replace the body of resolveKey() with: return getKeyFor(feature) ?? getKey();

      const FEATURES: { id: FeatureId; name: string }[] = [
        { id: 'transcript', name: 'Transcript processing' },
        { id: 'impact', name: 'Impact analysis' },
        { id: 'userStories', name: 'User story generation' },
        { id: 'frd', name: 'FRD generation' },
        { id: 'tdd', name: 'TDD generation' },
        { id: 'copilot', name: 'Enterprise Copilot' },
      ];

      <div className={card}>
        <h3 className={h3}>Per-feature API keys</h3>
        {FEATURES.map((f) => (
          <div key={f.id} className="mt-3 flex items-center gap-3">
            <span className="w-56 text-[13px]">{f.name}</span>
            <input type="password" className={input} placeholder="Use shared key" />
            <button className={btnSecondary}>Save</button>
          </div>
        ))}
      </div>
      */}
    </div>
  );
}
