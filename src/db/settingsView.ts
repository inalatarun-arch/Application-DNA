/** Pure helpers that map the stored AI settings to the view for one provider (no React or database imports, so they can be tested). */
import { DEFAULT_AI_SETTINGS, type AiSettings } from '@/config/ai';
import { PROVIDERS, type ProviderId } from '@/config/providers';

const cleanList = (list: unknown): string[] =>
  (Array.isArray(list) ? list : [])
    .filter((m): m is string => typeof m === 'string')
    .map((m) => m.trim())
    .filter(Boolean)
    .filter((m, i, all) => all.indexOf(m) === i);

function mergeAi(value: Partial<AiSettings> | undefined): AiSettings {
  const rawFallbacks = Array.isArray(value?.fallbackModels) ? value.fallbackModels : DEFAULT_AI_SETTINGS.fallbackModels;
  return {
    ...DEFAULT_AI_SETTINGS,
    ...value,
    featureModels: { ...DEFAULT_AI_SETTINGS.featureModels, ...value?.featureModels },
    fallbackModels: cleanList(rawFallbacks),
  };
}

/** The settings as the active provider sees them: its own default model, per-feature models and fallbacks. */
export function viewForProvider(stored: Partial<AiSettings> | undefined, provider: ProviderId): AiSettings {
  const base = mergeAi(stored);
  if (provider === 'gemini') return base;
  const cfg = base.providerConfigs?.[provider];
  return {
    ...base,
    defaultModel: cfg?.defaultModel?.trim() || PROVIDERS[provider].defaultModel,
    featureModels: { ...(cfg?.featureModels ?? {}) },
    fallbackModels: cleanList(cfg?.fallbackModels),
  };
}

/** Writes a change made through the active-provider view back into the right place. */
export function applyPatch(stored: Partial<AiSettings> | undefined, provider: ProviderId, patch: Partial<AiSettings>): AiSettings {
  const base = mergeAi(stored);
  const { defaultModel, featureModels, fallbackModels, temperature } = patch;
  if (provider === 'gemini') return { ...base, ...patch, ...(fallbackModels ? { fallbackModels: cleanList(fallbackModels) } : {}) };
  const current = viewForProvider(stored, provider);
  return {
    ...base,
    ...(temperature !== undefined ? { temperature } : {}),
    providerConfigs: {
      ...base.providerConfigs,
      [provider]: {
        defaultModel: defaultModel ?? current.defaultModel,
        featureModels: (featureModels ?? current.featureModels) as Record<string, string>,
        fallbackModels: cleanList(fallbackModels ?? current.fallbackModels),
      },
    },
  };
}

