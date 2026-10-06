import { useEffect, useState } from 'react';
import { Eye, EyeOff, KeyRound, Loader2, Trash2, Zap } from 'lucide-react';
import { AI_FEATURES, GEMINI_MODELS } from '@/config/ai';
import { useAiSettings } from '@/db/settings';
import { useApiKey } from '@/hooks/useApiKey';
import { clearApiKey, setApiKey } from '@/services/apiKeyStore';
import { testConnection, type ConnectionTestResult } from '@/services/geminiService';
import { cn } from '@/lib/cn';

export default function AiConfiguration() {
  const savedKey = useApiKey();
  const [ai, saveAi] = useAiSettings();
  const [draft, setDraft] = useState(savedKey);
  const [reveal, setReveal] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<ConnectionTestResult | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  // Keep the field in sync if the key changes elsewhere (restore, other tab).
  useEffect(() => setDraft(savedKey), [savedKey]);

  const trimmed = draft.trim();
  const dirty = trimmed !== savedKey;

  const onSave = () => {
    setApiKey(trimmed);
    setResult(null);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  };

  const onClear = () => {
    clearApiKey();
    setDraft('');
    setResult(null);
  };

  const onTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      setResult(await testConnection({ apiKey: trimmed, model: ai.defaultModel }));
    } finally {
      setTesting(false);
    }
  };

  const setFeatureModel = (feature: (typeof AI_FEATURES)[number]['id'], model: string) => {
    const next = { ...ai.featureModels };
    if (model) next[feature] = model;
    else delete next[feature];
    void saveAi({ featureModels: next });
  };

  return (
    <section className="card" aria-labelledby="ai-config-title">
      <h2 id="ai-config-title" className="text-headline-md">AI configuration</h2>
      <p className="mt-1 text-body-md text-on-surface-variant">
        Connect your own Google Gemini key. It stays in this browser and is sent only to Google&apos;s API.
      </p>

      <div className="mt-6 max-w-xl">
        <label htmlFor="gemini-key" className="field-label">Gemini API key</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <KeyRound size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
            <input
              id="gemini-key"
              name="gemini-api-key"
              type={reveal ? 'text' : 'password'}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="AIza…"
              autoComplete="off"
              spellCheck={false}
              data-1p-ignore
              className="input pl-9 pr-10 font-mono"
            />
            <button
              type="button"
              onClick={() => setReveal((r) => !r)}
              aria-label={reveal ? 'Hide API key' : 'Show API key'}
              aria-pressed={reveal}
              className="icon-btn absolute right-0.5 top-1/2 h-8 w-8 -translate-y-1/2"
            >
              {reveal ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
            </button>
          </div>
        </div>
        <p className="field-hint">
          {savedFlash ? 'Saved in this browser.' : savedKey ? (dirty ? 'You have unsaved changes.' : 'Saved in this browser.') : 'Create a key in Google AI Studio, then paste it here.'}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" onClick={onSave} disabled={!dirty || !trimmed}>
            Save key
          </button>
          <button type="button" className="btn btn-secondary" onClick={onTest} disabled={testing || !trimmed}>
            {testing ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Zap size={16} aria-hidden />}
            Test API connection
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClear} disabled={!savedKey && !draft}>
            <Trash2 size={16} aria-hidden />
            Remove key
          </button>
        </div>

        <div aria-live="polite" className="mt-4">
          {result && (
            <div
              className={cn(
                'rounded border p-3 text-body-md',
                result.ok ? 'border-outline-variant bg-surface-low' : 'border-error bg-error-container text-error',
              )}
            >
              {result.ok ? (
                <>
                  <p className="font-semibold">Connection successful</p>
                  <p className="text-on-surface-variant">
                    {result.model} responded in <span className="font-semibold text-on-surface">{result.latencyMs} ms</span>.
                    {dirty && ' This key is not saved yet.'}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-semibold">Connection failed</p>
                  <p>{result.message}</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <hr className="my-6 border-outline-variant" />

      <div className="max-w-xl">
        <label htmlFor="default-model" className="field-label">Default model</label>
        <select id="default-model" className="input" value={ai.defaultModel} onChange={(e) => void saveAi({ defaultModel: e.target.value })}>
          {GEMINI_MODELS.map((m) => (
            <option key={m.id} value={m.id}>{m.label} ({m.id})</option>
          ))}
        </select>
        <p className="field-hint">{GEMINI_MODELS.find((m) => m.id === ai.defaultModel)?.hint}</p>
      </div>

      <div className="mt-6">
        <h3 className="text-body-lg font-semibold">Model by feature</h3>
        <p className="text-body-md text-on-surface-variant">Route each AI feature to the model that fits it. Leave on default to follow the model above.</p>
        <ul className="mt-3 divide-y divide-outline-variant rounded border border-outline-variant">
          {AI_FEATURES.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <label htmlFor={`model-${f.id}`} className="text-body-md font-medium">{f.label}</label>
                <p className="text-label-md font-normal text-on-surface-variant">{f.description}</p>
              </div>
              <select
                id={`model-${f.id}`}
                className="input w-full sm:w-64"
                value={ai.featureModels[f.id] ?? ''}
                onChange={(e) => setFeatureModel(f.id, e.target.value)}
              >
                <option value="">Default ({ai.defaultModel})</option>
                {GEMINI_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
