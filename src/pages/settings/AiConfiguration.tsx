import { useEffect, useState } from 'react';
import { Eye, EyeOff, KeyRound, Loader2, RefreshCw, Trash2, Zap } from 'lucide-react';
import { AI_FEATURES, DEFAULT_MODEL } from '@/config/ai';
import { useAiSettings } from '@/db/settings';
import { useApiKey } from '@/hooks/useApiKey';
import { clearApiKey, setApiKey } from '@/services/apiKeyStore';
import { listAvailableModels, testConnection, type ConnectionTestResult, type GeminiModelInfo } from '@/services/geminiService';
import { cn } from '@/lib/cn';

export default function AiConfiguration() {
  const savedKey = useApiKey();
  const [ai, saveAi] = useAiSettings();
  const [draft, setDraft] = useState(savedKey);
  const [reveal, setReveal] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<ConnectionTestResult | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [models, setModels] = useState<GeminiModelInfo[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [modelsUpdatedAt, setModelsUpdatedAt] = useState<number | null>(null);
  const [fallbackDraft, setFallbackDraft] = useState('');

  // Keep the field in sync if the key changes elsewhere (restore, other tab).
  useEffect(() => setDraft(savedKey), [savedKey]);
  useEffect(() => setFallbackDraft(ai.fallbackModels.join(', ')), [ai.fallbackModels]);

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

  const refreshModels = async (key = savedKey) => {
    if (!key.trim()) {
      setModels([]);
      setModelsError(null);
      return;
    }
    setModelsLoading(true);
    setModelsError(null);
    try {
      const next = await listAvailableModels(key);
      setModels(next);
      setModelsUpdatedAt(Date.now());
      const available = new Set(next.map((m) => m.id));
      available.add(DEFAULT_MODEL);
      const selectedDefault = available.has(ai.defaultModel) ? ai.defaultModel : DEFAULT_MODEL;
      const nextFeatureModels = Object.fromEntries(
        Object.entries(ai.featureModels).filter(([, model]) => model && available.has(model)),
      ) as typeof ai.featureModels;
      const changed = selectedDefault !== ai.defaultModel || Object.keys(nextFeatureModels).length !== Object.keys(ai.featureModels).length;
      if (changed) void saveAi({ defaultModel: selectedDefault, featureModels: nextFeatureModels });
    } catch (e) {
      setModelsError(e instanceof Error ? e.message : 'Could not load Gemini models.');
    } finally {
      setModelsLoading(false);
    }
  };

  useEffect(() => {
    if (savedKey) void refreshModels(savedKey);
  }, [savedKey]);

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
        <div className="flex gap-2">
          <select id="default-model" className="input flex-1" value={ai.defaultModel} onChange={(e) => void saveAi({ defaultModel: e.target.value })} disabled={!savedKey || modelsLoading}>
            <option value={DEFAULT_MODEL}>Gemini Flash (latest — auto-updating)</option>
            {models.filter((m) => m.id !== DEFAULT_MODEL).map((m) => (
              <option key={m.id} value={m.id}>{m.displayName} ({m.id})</option>
            ))}
          </select>
          <button type="button" className="btn btn-secondary" onClick={() => void refreshModels()} disabled={!savedKey || modelsLoading} title="Refresh models from Google">
            {modelsLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Refresh
          </button>
        </div>
        <p className="field-hint">
          {modelsLoading ? 'Loading models available to this API key from Google…' :
            modelsUpdatedAt ? `Live model list updated ${new Date(modelsUpdatedAt).toLocaleTimeString()}.` :
            'Save an API key to load the models that key can actually use.'}
        </p>
        {modelsError && <p className="field-hint text-error">{modelsError}</p>}
      </div>

      <div className="mt-6 max-w-xl">
        <label htmlFor="fallback-models" className="field-label">Fallback models</label>
        <textarea
          id="fallback-models"
          className="input min-h-20 font-mono"
          value={fallbackDraft}
          onChange={(e) => setFallbackDraft(e.target.value)}
          placeholder="gemini-2.5-flash, gemini-2.0-flash"
          spellCheck={false}
        />
        <p className="field-hint">Optional comma-separated model IDs. When the primary model returns 404 or 503, Application DNA tries these in order. The UI reports which model answered.</p>
        <button
          type="button"
          className="btn btn-secondary mt-2"
          onClick={() => void saveAi({ fallbackModels: fallbackDraft.split(',').map((model) => model.trim()).filter(Boolean) })}
        >
          Save fallback list
        </button>
      </div>

      <div className="mt-6">
        <h3 className="text-body-lg font-semibold">Model by feature</h3>
        <p className="text-body-md text-on-surface-variant">Models are loaded live from Google for your API key. Deprecated or unavailable models are removed automatically. Leave on default to follow the model above.</p>
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
                {models.filter((m) => m.id !== DEFAULT_MODEL).map((m) => (
                  <option key={m.id} value={m.id}>{m.displayName}</option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
