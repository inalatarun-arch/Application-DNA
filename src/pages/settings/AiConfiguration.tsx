import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Check, Loader2, RefreshCw } from 'lucide-react';
import KeyVaultCard from '@/components/KeyVaultCard';
import { AI_FEATURES } from '@/config/ai';
import { PROVIDERS, PROVIDER_IDS, type ModelInfo, type ProviderId } from '@/config/providers';
import { useAiSettings } from '@/db/settings';
import { useApiKey } from '@/hooks/useApiKey';
import { useVault } from '@/components/useVault';
import { cn } from '@/lib/cn';
import { getActiveProvider, setActiveProvider, subscribeApiKey } from '@/services/apiKeyStore';
import { listAvailableModels } from '@/services/geminiService';

function ProviderOption({ id, active, onPick }: { id: ProviderId; active: boolean; onPick: () => void }) {
  const info = PROVIDERS[id];
  const vault = useVault(id);
  return (
    <label className={cn('flex cursor-pointer flex-col gap-1 rounded-lg border p-3 transition-colors', active ? 'border-primary bg-surface-low' : 'border-outline-variant hover:bg-surface-low')}>
      <span className="flex items-center gap-2">
        <input type="radio" name="ai-provider" className="shrink-0" checked={active} onChange={onPick} />
        <span className="text-body-md font-semibold">{info.label}</span>
        {vault.hasVault && <Check size={14} aria-label="Key saved" className="ml-auto text-on-surface-variant" />}
      </span>
      <span className="pl-6 text-label-md font-normal text-on-surface-variant">{vault.hasVault ? (vault.unlocked ? 'Key saved and unlocked' : 'Key saved, locked') : 'No key yet'}</span>
    </label>
  );
}

export default function AiConfiguration() {
  const provider = useSyncExternalStore(subscribeApiKey, getActiveProvider);
  const info = PROVIDERS[provider];
  const savedKey = useApiKey();
  const [ai, saveAi] = useAiSettings();
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [modelsUpdatedAt, setModelsUpdatedAt] = useState<number | null>(null);
  const [fallbackDraft, setFallbackDraft] = useState('');
  const latest = useRef(0);

  useEffect(() => setFallbackDraft(ai.fallbackModels.join(', ')), [ai.fallbackModels]);

  // A different provider has different models: drop the old list at once so the dropdowns never show stale entries.
  useEffect(() => {
    latest.current++;
    setModels([]);
    setModelsError(null);
    setModelsUpdatedAt(null);
    setModelsLoading(false);
  }, [provider]);

  const refreshModels = async () => {
    const ticket = ++latest.current;
    if (!savedKey) {
      setModels([]);
      setModelsError(null);
      return;
    }
    setModelsLoading(true);
    setModelsError(null);
    try {
      const next = await listAvailableModels(undefined, provider);
      if (ticket !== latest.current) return; // the provider changed while this was loading
      setModels(next);
      setModelsUpdatedAt(Date.now());
      const available = new Set(next.map((m) => m.id));
      if (provider === 'gemini') available.add(info.defaultModel);
      const fallbackDefault = available.has(info.defaultModel) ? info.defaultModel : next[0]?.id ?? info.defaultModel;
      const selectedDefault = available.has(ai.defaultModel) ? ai.defaultModel : fallbackDefault;
      const nextFeatureModels = Object.fromEntries(
        Object.entries(ai.featureModels).filter(([, model]) => model && available.has(model)),
      ) as typeof ai.featureModels;
      const changed = selectedDefault !== ai.defaultModel || Object.keys(nextFeatureModels).length !== Object.keys(ai.featureModels).length;
      if (changed) void saveAi({ defaultModel: selectedDefault, featureModels: nextFeatureModels });
    } catch (e) {
      if (ticket !== latest.current) return;
      setModelsError(e instanceof Error ? e.message : `Could not load ${info.short} models.`);
    } finally {
      if (ticket === latest.current) setModelsLoading(false);
    }
  };

  useEffect(() => {
    if (savedKey) void refreshModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey, provider]);

  const setFeatureModel = (feature: (typeof AI_FEATURES)[number]['id'], model: string) => {
    const next = { ...ai.featureModels };
    if (model) next[feature] = model;
    else delete next[feature];
    void saveAi({ featureModels: next });
  };

  // Before the live list arrives (or when it cannot load) still offer the known models and the current choice.
  const listed: ModelInfo[] = models.length
    ? models
    : [...new Set([...info.suggestedModels, ai.defaultModel])].map((id) => ({ id, displayName: id }));
  const withCurrent = (current: string): ModelInfo[] => (current && !listed.some((m) => m.id === current) ? [...listed, { id: current, displayName: current }] : listed);
  const label = (m: ModelInfo) => (m.displayName && m.displayName !== m.id ? `${m.displayName} (${m.id})` : m.id);

  return (
    <section className="card" aria-labelledby="ai-config-title">
      <h2 id="ai-config-title" className="text-headline-md">AI configuration</h2>
      <p className="mt-1 text-body-md text-on-surface-variant">
        Choose which AI service Application DNA uses and add your own API key for it. Keys are encrypted in this browser and sent only to the service you picked.
      </p>

      <fieldset className="mt-5">
        <legend className="field-label">AI provider</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {PROVIDER_IDS.map((id) => (
            <ProviderOption key={id} id={id} active={id === provider} onPick={() => setActiveProvider(id)} />
          ))}
        </div>
        <p className="field-hint">Switching provider changes which key, model list and settings below are used. Every feature follows the provider selected here.</p>
      </fieldset>

      <KeyVaultCard key={provider} provider={provider} />

      <hr className="my-6 border-outline-variant" />

      <div className="max-w-xl">
        <label htmlFor="default-model" className="field-label">Default model</label>
        <div className="flex gap-2">
          <select id="default-model" className="input flex-1" value={ai.defaultModel} onChange={(e) => void saveAi({ defaultModel: e.target.value })} disabled={modelsLoading}>
            {withCurrent(ai.defaultModel).map((m) => (
              <option key={m.id} value={m.id}>{provider === 'gemini' && m.id === info.defaultModel ? 'Gemini Flash (latest, auto-updating)' : label(m)}</option>
            ))}
          </select>
          <button type="button" className="btn btn-secondary" onClick={() => void refreshModels()} disabled={!savedKey || modelsLoading} title={`Refresh models from ${info.short}`}>
            {modelsLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Refresh
          </button>
        </div>
        <p className="field-hint">
          {modelsLoading ? `Loading models available to this ${info.short} key…` :
            modelsUpdatedAt ? `Live ${info.short} model list updated ${new Date(modelsUpdatedAt).toLocaleTimeString()}.` :
            savedKey ? 'Press Refresh to load the models this key can use.' :
            `Showing common ${info.short} models. Save and unlock a key to load the full list for it.`}
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
          placeholder={info.suggestedModels.slice(1).join(', ') || info.suggestedModels[0]}
          spellCheck={false}
        />
        <p className="field-hint">Optional comma-separated model IDs for {info.short}. When the primary model returns 404 or 503, Application DNA tries these in order. The UI reports which model answered.</p>
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
        <p className="text-body-md text-on-surface-variant">Each provider keeps its own choices. Models come live from {info.short} for your API key. Leave a feature on default to follow the model above.</p>
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
                {withCurrent(ai.featureModels[f.id] ?? '').filter((m) => m.id !== ai.defaultModel || ai.featureModels[f.id] === m.id).map((m) => (
                  <option key={m.id} value={m.id}>{m.displayName || m.id}</option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
