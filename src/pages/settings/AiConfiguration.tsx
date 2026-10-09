import { useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import KeyVaultCard from '@/components/KeyVaultCard';
import { AI_FEATURES, DEFAULT_MODEL } from '@/config/ai';
import { useAiSettings } from '@/db/settings';
import { useApiKey } from '@/hooks/useApiKey';
import { listAvailableModels, type GeminiModelInfo } from '@/services/geminiService';

export default function AiConfiguration() {
  const savedKey = useApiKey();
  const [ai, saveAi] = useAiSettings();
  const [models, setModels] = useState<GeminiModelInfo[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [modelsUpdatedAt, setModelsUpdatedAt] = useState<number | null>(null);
  const [fallbackDraft, setFallbackDraft] = useState('');

  useEffect(() => setFallbackDraft(ai.fallbackModels.join(', ')), [ai.fallbackModels]);

  const refreshModels = async () => {
    if (!savedKey) {
      setModels([]);
      setModelsError(null);
      return;
    }
    setModelsLoading(true);
    setModelsError(null);
    try {
      const next = await listAvailableModels();
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
    if (savedKey) void refreshModels();
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
        Connect your Google Gemini key. It is encrypted in this browser and sent only to Google&apos;s API, or kept on a server you run.
      </p>

      <KeyVaultCard />

      <hr className="my-6 border-outline-variant" />

      <div className="max-w-xl">
        <label htmlFor="default-model" className="field-label">Default model</label>
        <div className="flex gap-2">
          <select id="default-model" className="input flex-1" value={ai.defaultModel} onChange={(e) => void saveAi({ defaultModel: e.target.value })} disabled={!savedKey || modelsLoading}>
            <option value={DEFAULT_MODEL}>Gemini Flash (latest, auto-updating)</option>
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
            'Unlock or save an API key to load the models that key can actually use.'}
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
