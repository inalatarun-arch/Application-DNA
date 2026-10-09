/** The AI providers the app can talk to. Pure data and helpers, safe to import anywhere. */

export type ProviderId = 'gemini' | 'anthropic' | 'openai';

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  short: string;
  /** Hint for the key field. */
  keyPlaceholder: string;
  /** Where the user creates a key. */
  keyUrl: string;
  keyUrlLabel: string;
  /** Shown before the live model list loads, and used when the list cannot be fetched. */
  defaultModel: string;
  suggestedModels: string[];
  /** The endpoint can be changed (OpenAI-compatible services). */
  customBaseUrl: boolean;
  defaultBaseUrl: string;
  /** Minimum key length accepted when saving. */
  minKeyLength: number;
  /** Can read PDFs and images sent with a prompt. */
  readsPdf: boolean;
  readsImages: boolean;
  note: string;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    short: 'Gemini',
    keyPlaceholder: 'AIza...',
    keyUrl: 'https://aistudio.google.com/apikey',
    keyUrlLabel: 'Google AI Studio',
    defaultModel: 'gemini-flash-latest',
    suggestedModels: ['gemini-flash-latest', 'gemini-2.5-flash'],
    customBaseUrl: false,
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    minKeyLength: 20,
    readsPdf: true,
    readsImages: true,
    note: 'Reads PDFs and images natively. A server proxy is available so the key never reaches the browser.',
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic Claude',
    short: 'Claude',
    keyPlaceholder: 'sk-ant-...',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyUrlLabel: 'Anthropic Console',
    defaultModel: 'claude-sonnet-5-5',
    suggestedModels: ['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5'],
    customBaseUrl: false,
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    minKeyLength: 20,
    readsPdf: true,
    readsImages: true,
    note: 'Reads PDFs and images. Calls go straight from this browser to Anthropic.',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI or compatible',
    short: 'OpenAI',
    keyPlaceholder: 'sk-...',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyUrlLabel: 'OpenAI Platform',
    defaultModel: 'gpt-4o-mini',
    suggestedModels: ['gpt-4o-mini', 'gpt-4o'],
    customBaseUrl: true,
    defaultBaseUrl: 'https://api.openai.com/v1',
    minKeyLength: 8,
    readsPdf: false,
    readsImages: true,
    note: 'Works with OpenAI and any service that follows the OpenAI chat API (OpenRouter, Groq, Mistral, Azure OpenAI v1 endpoints, local servers). Change the base URL to point at one. PDFs are not sent; use text, Word or Excel files.',
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

export function isProviderId(v: unknown): v is ProviderId {
  return typeof v === 'string' && (PROVIDER_IDS as string[]).includes(v);
}

/** Model settings kept separately for every provider (model ids are not shared between providers). */
export interface ProviderModelConfig {
  defaultModel: string;
  featureModels: Record<string, string>;
  fallbackModels: string[];
}

export function emptyModelConfig(provider: ProviderId): ProviderModelConfig {
  return { defaultModel: PROVIDERS[provider].defaultModel, featureModels: {}, fallbackModels: [] };
}

export interface ModelInfo {
  id: string;
  displayName: string;
  description?: string;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
}

/** Normalises a user-typed base URL: https only (or http for localhost), no trailing slash. Returns '' when invalid. */
export function cleanBaseUrl(raw: string): string {
  const v = raw.trim().replace(/\/+$/, '');
  if (!v) return '';
  if (/^https:\/\//i.test(v)) return v;
  if (/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(v)) return v;
  return '';
}
