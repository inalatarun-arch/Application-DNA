import { useState } from 'react';
import { AlertTriangle, Eye, EyeOff, KeyRound, Loader2, Lock, ShieldCheck, Trash2, Unlock, Zap } from 'lucide-react';
import { useVault } from './useVault';
import { deleteVault, findLegacyKeys, lock, readLegacyKey, saveKey, unlock, wipeLegacyKeys, type LegacyKeyHit, type VaultMode } from '@/lib/vault';
import { PROVIDERS, type ProviderId } from '@/config/providers';
import { getBaseUrl, getProxy, setBaseUrl, setProxy } from '@/services/apiKeyStore';
import { testConnection, type ConnectionTestResult } from '@/services/geminiService';
import { useAiSettings } from '@/db/settings';
import { cn } from '@/lib/cn';

const MIN_PASSPHRASE = 8;

/** Where one provider's key lives: encrypted in this browser (passphrase or device), or (Gemini only) on a server proxy. */
export default function KeyVaultCard({ provider = 'gemini' }: { provider?: ProviderId }) {
  const info = PROVIDERS[provider];
  const isGemini = provider === 'gemini';
  const vault = useVault(provider);
  const [baseUrl, setBaseUrlDraft] = useState(() => getBaseUrl(provider));
  const [ai] = useAiSettings();
  const [key, setKey] = useState('');
  const [reveal, setReveal] = useState(false);
  const [mode, setMode] = useState<VaultMode>('passphrase');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [unlockPass, setUnlockPass] = useState('');
  const [replacing, setReplacing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [test, setTest] = useState<ConnectionTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [legacy, setLegacy] = useState<LegacyKeyHit[]>(() => (isGemini ? findLegacyKeys() : []));
  const [proxyUrl, setProxyUrl] = useState(() => getProxy().url);
  const [proxyToken, setProxyToken] = useState(() => getProxy().token);

  const showForm = !vault.hasVault || replacing;
  const proxyOn = isGemini && !!getProxy().url;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Something went wrong.' });
    } finally {
      setBusy(false);
    }
  };

  const checkPassphrase = () => {
    if (mode !== 'passphrase') return;
    if (pass.length < MIN_PASSPHRASE) throw new Error(`Use a passphrase of at least ${MIN_PASSPHRASE} characters.`);
    if (pass !== pass2) throw new Error('The two passphrases do not match.');
  };

  const onSave = () => run(async () => {
    if (!key.trim()) throw new Error(`Paste your ${info.short} API key first.`);
    checkPassphrase();
    await saveKey(key, mode, pass, provider, info.minKeyLength);
    setKey(''); setPass(''); setPass2(''); setReveal(false); setReplacing(false); setTest(null);
    setMsg({ ok: true, text: 'Key encrypted and saved. It is unlocked for this session.' });
  });

  const onUnlock = () => run(async () => {
    await unlock(unlockPass, provider);
    setUnlockPass('');
    setMsg({ ok: true, text: 'Unlocked for this browser session.' });
  });

  const onTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      setTest(await testConnection({ model: ai.defaultModel, provider }));
    } finally {
      setTesting(false);
    }
  };

  const importLegacy = () => run(async () => {
    const first = legacy.map(readLegacyKey).find((k): k is string => !!k);
    if (!first) throw new Error('Could not read the old key.');
    checkPassphrase();
    await saveKey(first, mode, pass, 'gemini');
    wipeLegacyKeys(legacy);
    setLegacy(findLegacyKeys());
    setPass(''); setPass2('');
    setMsg({ ok: true, text: 'Imported the old key into the encrypted store and erased the plain-text copies.' });
  });

  const onProxy = () => run(async () => {
    setProxy(proxyUrl, proxyToken);
    setMsg({ ok: true, text: proxyUrl.trim() ? 'Proxy saved. AI requests now go through it and no key is needed in this browser.' : 'Proxy removed.' });
  });

  const modePicker = (
    <fieldset className="space-y-2">
      <legend className="field-label">How to protect it</legend>
      {([
        ['passphrase', 'Passphrase (recommended)', 'You enter the passphrase once per browser session. Nothing readable is stored.'],
        ['device', 'This device only', 'Unlocks automatically on this browser. Anyone using this browser profile can use the key.'],
      ] as const).map(([id, title, text]) => (
        <label key={id} className={cn('flex cursor-pointer items-start gap-3 rounded border p-3', mode === id ? 'border-primary bg-surface-low' : 'border-outline-variant')}>
          <input type="radio" name="vault-mode" className="mt-1" checked={mode === id} onChange={() => setMode(id)} />
          <span><span className="block text-body-md font-medium">{title}</span><span className="block text-label-md font-normal text-on-surface-variant">{text}</span></span>
        </label>
      ))}
      {mode === 'passphrase' && (
        <div className="grid gap-2 sm:grid-cols-2">
          <input type="password" aria-label="Passphrase" className="input" placeholder="Passphrase" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} />
          <input type="password" aria-label="Repeat passphrase" className="input" placeholder="Repeat passphrase" autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} />
        </div>
      )}
    </fieldset>
  );

  return (
    <div className="mt-6 max-w-xl space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded border border-outline-variant bg-surface-low p-3">
        {vault.unlocked || proxyOn ? <ShieldCheck size={18} aria-hidden /> : vault.hasVault ? <Lock size={18} aria-hidden /> : <KeyRound size={18} aria-hidden />}
        <div className="min-w-0 flex-1">
          <p className="text-body-md font-semibold">
            {proxyOn ? 'Using a server proxy' : !vault.hasVault ? 'No API key saved' : vault.unlocked ? 'API key unlocked for this session' : 'API key saved and locked'}
          </p>
          <p className="text-label-md font-normal text-on-surface-variant">
            {proxyOn ? 'Requests go to your proxy, which holds the key.' : vault.hasVault ? `Stored encrypted (AES-256-GCM, ${vault.mode === 'passphrase' ? 'passphrase' : 'device'} protected). It is never shown again.` : `Create a key in ${info.keyUrlLabel} and paste it below. It is encrypted before it is stored.`}
          </p>
        </div>
        {vault.hasVault && vault.unlocked && <button type="button" className="btn btn-secondary px-3 py-1.5" onClick={() => lock(provider)}><Lock size={14} aria-hidden />Lock</button>}
        {vault.hasVault && !replacing && <button type="button" className="btn btn-secondary px-3 py-1.5" onClick={() => setReplacing(true)}>Replace</button>}
        {vault.hasVault && <button type="button" className="btn btn-secondary px-3 py-1.5" onClick={() => { if (window.confirm('Delete the stored API key from this browser?')) void deleteVault(provider); }}><Trash2 size={14} aria-hidden />Remove</button>}
      </div>

      {vault.hasVault && !vault.unlocked && vault.mode === 'passphrase' && (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void onUnlock(); }}>
          <input type="password" aria-label="Passphrase to unlock" className="input flex-1" placeholder="Passphrase" autoComplete="current-password" value={unlockPass} onChange={(e) => setUnlockPass(e.target.value)} />
          <button type="submit" className="btn btn-primary" disabled={busy || !unlockPass}>{busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Unlock size={16} aria-hidden />}Unlock</button>
        </form>
      )}

      {legacy.length > 0 && !vault.hasVault && (
        <div className="space-y-3 rounded border border-outline-variant p-3">
          <p className="flex items-start gap-2 text-body-md"><AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />A key from an older version is stored as plain text in this browser. Move it into the encrypted store.</p>
          {modePicker}
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void importLegacy()}>Encrypt and import old key</button>
        </div>
      )}

      {info.customBaseUrl && (
        <div className="space-y-2">
          <label htmlFor={`${provider}-base`} className="field-label">Base URL</label>
          <div className="flex gap-2">
            <input id={`${provider}-base`} className="input flex-1 font-mono" value={baseUrl} onChange={(e) => setBaseUrlDraft(e.target.value)} spellCheck={false} placeholder={info.defaultBaseUrl} />
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void run(async () => { setBaseUrl(provider, baseUrl); setBaseUrlDraft(getBaseUrl(provider)); setMsg({ ok: true, text: 'Address saved. Press Refresh next to the model list to load that service\'s models.' }); })}>Save address</button>
          </div>
          <p className="field-hint">Leave as is for OpenAI. For OpenRouter, Groq, Mistral or a local server, paste its OpenAI-style address (it usually ends in /v1). If your server needs no key, enter any placeholder of 8 or more characters.</p>
        </div>
      )}

      {showForm && (
        <div className="space-y-4">
          <div>
            <label htmlFor={`${provider}-key`} className="field-label">{info.short} API key</label>
            <div className="relative">
              <KeyRound size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
              <input id={`${provider}-key`} name={`${provider}-api-key`} type={reveal ? 'text' : 'password'} value={key} onChange={(e) => setKey(e.target.value)} placeholder={info.keyPlaceholder} autoComplete="off" spellCheck={false} data-1p-ignore className="input pl-9 pr-10 font-mono" />
              <button type="button" onClick={() => setReveal((r) => !r)} aria-label={reveal ? 'Hide API key' : 'Show API key'} aria-pressed={reveal} className="icon-btn absolute right-0.5 top-1/2 h-8 w-8 -translate-y-1/2">{reveal ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}</button>
            </div>
            <p className="field-hint">
              Get a key from <a className="underline" href={info.keyUrl} target="_blank" rel="noreferrer">{info.keyUrlLabel}</a>. {info.note}
            </p>
          </div>
          {modePicker}
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary" disabled={busy || !key.trim()} onClick={() => void onSave()}>{busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <ShieldCheck size={16} aria-hidden />}Encrypt and save</button>
            {replacing && <button type="button" className="btn btn-secondary" onClick={() => setReplacing(false)}>Cancel</button>}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-secondary" onClick={() => void onTest()} disabled={testing || (!vault.unlocked && !proxyOn)}>
          {testing ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Zap size={16} aria-hidden />}Test API connection
        </button>
      </div>

      <div aria-live="polite" className="space-y-2">
        {msg && <p role={msg.ok ? 'status' : 'alert'} className={cn('rounded border p-3 text-body-md', msg.ok ? 'border-outline-variant bg-surface-low' : 'border-error bg-error-container text-error')}>{msg.text}</p>}
        {test && (
          <div className={cn('rounded border p-3 text-body-md', test.ok ? 'border-outline-variant bg-surface-low' : 'border-error bg-error-container text-error')}>
            {test.ok ? <><p className="font-semibold">Connection successful</p><p className="text-on-surface-variant">{test.model} responded in {test.latencyMs} ms.</p></> : <><p className="font-semibold">Connection failed</p><p>{test.message}</p></>}
          </div>
        )}
      </div>

      {isGemini && <details className="rounded border border-outline-variant" open={proxyOn}>
        <summary className="cursor-pointer px-4 py-2 text-body-md font-medium">Keep the key off this device with a server proxy</summary>
        <div className="space-y-3 border-t border-outline-variant p-4">
          <p className="text-label-md font-normal text-on-surface-variant">
            Browser encryption protects a stored key, but any code running in this page could still use it while it is unlocked. The only way to keep the key out of the browser entirely is a small server that holds it and forwards requests to Google. Enter its address (it must expose the Gemini <code>/v1beta</code> paths) and an optional access token. The folder <code>proxy/</code> in this project has a ready-made Cloudflare Worker.
          </p>
          <div>
            <label htmlFor="proxy-url" className="field-label">Proxy URL</label>
            <input id="proxy-url" className="input font-mono" placeholder="https://your-proxy.example.workers.dev" value={proxyUrl} onChange={(e) => setProxyUrl(e.target.value)} spellCheck={false} />
          </div>
          <div>
            <label htmlFor="proxy-token" className="field-label">Access token (optional)</label>
            <input id="proxy-token" type="password" className="input font-mono" autoComplete="off" value={proxyToken} onChange={(e) => setProxyToken(e.target.value)} />
          </div>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void onProxy()}>Save proxy</button>
        </div>
      </details>}
    </div>
  );
}
