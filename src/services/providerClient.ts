/**
 * Claude and OpenAI-compatible providers behind the same functions the Gemini client exposes.
 * geminiService calls into here when the active provider is not Gemini, so no feature code has to change.
 */
import type { AiFeature } from '@/config/ai';
import { PROVIDERS, type ModelInfo, type ProviderId } from '@/config/providers';
import { getAiSettings } from '@/db/settings';
import { getVaultSnapshot } from '@/lib/vault';
import { parseJsonLoose } from '@/lib/jsonRepair';
import { safeTrim } from '@/lib/safeValue';
import { GeminiError, KeyLockedError, describeError, isGeminiError } from './aiErrors';
import { getApiKey, getBaseUrl } from './apiKeyStore';
import { setStatus } from './geminiStatus';
import { anthropicGenerate, anthropicListModels, anthropicStream, anthropicTest } from './providers/anthropic';
import { openaiGenerate, openaiListModels, openaiStream, openaiTest } from './providers/openai';
import { toNormMessages, type NormRequest, type NormResult } from './providers/shared';

export type OtherProvider = Exclude<ProviderId, 'gemini'>;

/** The slice of the public generate options these providers understand (matches geminiService.GenerateOptions). */
export interface ProviderOptions {
  feature?: AiFeature;
  model?: string;
  system?: string;
  temperature?: number;
  maxOutputTokens?: number;
  responseSchema?: Record<string, unknown>;
  signal?: AbortSignal;
  timeoutMs?: number;
  retries?: number;
  jsonRetries?: number;
}
type PromptLike = Parameters<typeof toNormMessages>[0];

export interface ProviderResult {
  text: string;
  model: string;
  latencyMs: number;
  finishReason?: string;
  usage?: NormResult['usage'];
}

const TIMEOUT = 120_000;

function requireKey(p: OtherProvider, override?: string): string {
  const given = safeTrim(override);
  if (given) return given;
  const key = safeTrim(getApiKey(p));
  if (key) return key;
  if (getVaultSnapshot(p).hasVault) throw new KeyLockedError();
  // A custom OpenAI-compatible server (for example a local one) may need no key at all.
  if (p === 'openai' && getBaseUrl(p) !== PROVIDERS.openai.defaultBaseUrl) return '';
  throw new GeminiError('MISSING_KEY', `No ${PROVIDERS[p].label} API key is configured. Add one in Settings, AI Configuration.`);
}

async function resolve(p: OtherProvider, opts: ProviderOptions) {
  const s = await getAiSettings(p);
  const model = opts.model ?? (opts.feature ? s.featureModels[opts.feature] : undefined) ?? s.defaultModel;
  const fallbacks = opts.model ? [] : s.fallbackModels.filter((m) => m !== model);
  return { model, fallbacks, temperature: opts.temperature ?? s.temperature };
}

function report(err: unknown, model: string): void {
  if (!isGeminiError(err)) return;
  if (err.code === 'QUOTA_EXCEEDED') setStatus({ phase: 'quota', model, checkedAt: Date.now(), message: err.message });
  else if (err.code === 'INVALID_KEY' || err.code === 'PERMISSION_DENIED') setStatus({ phase: 'error', model, checkedAt: Date.now(), message: err.message });
}

function normRequest(p: OtherProvider, prompt: PromptLike, opts: ProviderOptions, model: string, temperature: number, json: boolean): NormRequest {
  const info = PROVIDERS[p];
  return {
    model,
    system: opts.system,
    messages: toNormMessages(prompt, info.label, { pdf: info.readsPdf, image: info.readsImages }),
    temperature,
    maxTokens: opts.maxOutputTokens,
    json,
    schema: opts.responseSchema,
  };
}

async function call(p: OtherProvider, key: string, req: NormRequest, opts: ProviderOptions): Promise<NormResult> {
  const o = { timeoutMs: opts.timeoutMs ?? TIMEOUT, retries: opts.retries ?? 2, signal: opts.signal };
  return p === 'anthropic' ? anthropicGenerate(key, getBaseUrl(p), req, o) : openaiGenerate(key, getBaseUrl(p), req, o);
}

async function withFallback<T>(models: string[], run: (m: string) => Promise<T>): Promise<{ value: T; model: string }> {
  let last: unknown;
  for (const model of models) {
    try {
      return { value: await run(model), model };
    } catch (err) {
      last = err;
      if (!(err instanceof GeminiError) || !['MODEL_NOT_FOUND', 'SERVER_ERROR'].includes(err.code)) throw err;
    }
  }
  throw last;
}

async function generate(p: OtherProvider, prompt: PromptLike, opts: ProviderOptions, json: boolean): Promise<ProviderResult> {
  const key = requireKey(p);
  const { model, fallbacks, temperature } = await resolve(p, opts);
  const started = performance.now();
  try {
    const { value, model: used } = await withFallback([model, ...fallbacks], (m) => call(p, key, normRequest(p, prompt, opts, m, temperature, json), opts));
    const latencyMs = Math.round(performance.now() - started);
    setStatus({ phase: 'connected', model: used, latencyMs, checkedAt: Date.now() });
    return { text: value.text, model: used, latencyMs, finishReason: value.finishReason, usage: value.usage };
  } catch (err) {
    report(err, model);
    throw err;
  }
}

export const providerGenerateText = (p: OtherProvider, prompt: PromptLike, opts: ProviderOptions = {}) => generate(p, prompt, opts, false);

export async function providerGenerateJson<T>(p: OtherProvider, prompt: PromptLike, opts: ProviderOptions = {}): Promise<{ data: T; repaired?: boolean } & ProviderResult> {
  const r = await generate(p, prompt, opts, true);
  try {
    const { value, repaired } = parseJsonLoose<T>(r.text);
    return { ...r, data: value, repaired };
  } catch (err) {
    const retries = opts.jsonRetries ?? 1;
    if (retries > 0 && r.finishReason !== 'MAX_TOKENS') return providerGenerateJson<T>(p, prompt, { ...opts, temperature: 0, jsonRetries: retries - 1 });
    const why = r.finishReason === 'MAX_TOKENS'
      ? 'The reply was cut off by the output limit. Try a smaller input or split the work.'
      : `${PROVIDERS[p].short} returned malformed JSON. Try again, simplify the request, or pick a stronger model in Settings.`;
    throw new GeminiError('PARSE', why, { cause: err });
  }
}

export async function providerStreamText(p: OtherProvider, prompt: PromptLike, opts: ProviderOptions, onChunk: (delta: string, full: string) => void): Promise<ProviderResult> {
  const key = requireKey(p);
  const { model, temperature } = await resolve(p, opts);
  const started = performance.now();
  const req = normRequest(p, prompt, opts, model, temperature, false);
  const o = { timeoutMs: opts.timeoutMs ?? TIMEOUT, signal: opts.signal };
  try {
    const r = p === 'anthropic' ? await anthropicStream(key, getBaseUrl(p), req, o, onChunk) : await openaiStream(key, getBaseUrl(p), req, o, onChunk);
    const latencyMs = Math.round(performance.now() - started);
    setStatus({ phase: 'connected', model, latencyMs, checkedAt: Date.now() });
    return { text: r.text, model, latencyMs, finishReason: r.finishReason, usage: r.usage };
  } catch (err) {
    report(err, model);
    throw err;
  }
}

export async function providerListModels(p: OtherProvider, keyOverride?: string): Promise<ModelInfo[]> {
  const key = requireKey(p, keyOverride);
  const list = p === 'anthropic' ? await anthropicListModels(key, getBaseUrl(p)) : await openaiListModels(key, getBaseUrl(p));
  return list;
}

export interface ProviderTestResult {
  ok: boolean;
  model: string;
  latencyMs?: number;
  code?: GeminiError['code'];
  message: string;
}

export async function providerTest(p: OtherProvider, opts: { apiKey?: string; model: string; signal?: AbortSignal }): Promise<ProviderTestResult> {
  const typed = safeTrim(opts.apiKey);
  const isSaved = !typed;
  let key: string;
  try {
    key = requireKey(p, opts.apiKey);
  } catch (err) {
    const e = isGeminiError(err) ? err : new GeminiError('UNKNOWN', describeError(err));
    return { ok: false, model: opts.model, code: e.code, message: e.message };
  }
  if (isSaved) setStatus({ phase: 'checking', model: opts.model });
  const started = performance.now();
  try {
    if (p === 'anthropic') await anthropicTest(key, getBaseUrl(p), opts.model, opts.signal);
    else await openaiTest(key, getBaseUrl(p), opts.model, opts.signal);
    const latencyMs = Math.round(performance.now() - started);
    if (isSaved) setStatus({ phase: 'connected', model: opts.model, latencyMs, checkedAt: Date.now() });
    return { ok: true, model: opts.model, latencyMs, message: `Connected to ${opts.model}.` };
  } catch (err) {
    const e = isGeminiError(err) ? err : new GeminiError('UNKNOWN', describeError(err));
    if (isSaved) setStatus({ phase: e.code === 'QUOTA_EXCEEDED' ? 'quota' : 'error', model: opts.model, checkedAt: Date.now(), message: e.message });
    return { ok: false, model: opts.model, code: e.code, message: e.message };
  }
}
