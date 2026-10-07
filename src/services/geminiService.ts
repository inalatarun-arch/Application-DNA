/**
 * Central abstraction over the Google Gemini REST API.
 * Every AI feature (transcripts, FRD/TDD, impact analysis, Copilot...) calls through here so that
 * key handling, model routing, retries and error mapping live in exactly one place.
 */
import { getApiKey } from './apiKeyStore';
import { setStatus } from './geminiStatus';
import { getAiSettings } from '@/db/settings';
import type { AiFeature } from '@/config/ai';
import { safeTrim } from '@/lib/safeValue';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_TIMEOUT_MS = 90_000;
const MAX_AUTO_RETRY_DELAY_MS = 15_000;

// ---------------------------------------------------------------- errors

export type GeminiErrorCode =
  | 'MISSING_KEY'
  | 'INVALID_KEY'
  | 'PERMISSION_DENIED'
  | 'QUOTA_EXCEEDED'
  | 'MODEL_NOT_FOUND'
  | 'BAD_REQUEST'
  | 'BLOCKED'
  | 'EMPTY_RESPONSE'
  | 'SERVER_ERROR'
  | 'TIMEOUT'
  | 'ABORTED'
  | 'NETWORK'
  | 'PARSE'
  | 'UNKNOWN';

export class GeminiHttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.name = 'GeminiHttpError'; this.status = status; }
}
export class GeminiBlockedError extends Error {
  constructor(message: string) { super(message); this.name = 'GeminiBlockedError'; }
}
export class GeminiEmptyResponseError extends Error {
  constructor(message = 'Gemini returned an empty response. Try again.') { super(message); this.name = 'GeminiEmptyResponseError'; }
}
export class GeminiTruncatedError extends Error {
  constructor(message = 'Gemini stopped before completing the response. Raise maxOutputTokens and try again.') { super(message); this.name = 'GeminiTruncatedError'; }
}
export class KeyLockedError extends Error {
  constructor(message = 'The Gemini API key is locked. Unlock it in AI Configuration and try again.') { super(message); this.name = 'KeyLockedError'; }
}

export class GeminiError extends GeminiHttpError {
  readonly code: GeminiErrorCode;
  readonly httpStatus?: number;
  /** Server-suggested wait before retrying (quota / overload). */
  readonly retryAfterMs?: number;

  constructor(
    code: GeminiErrorCode,
    message: string,
    extra: { httpStatus?: number; retryAfterMs?: number; cause?: unknown } = {},
  ) {
    super(extra.httpStatus ?? 0, message);
    this.name = 'GeminiError';
    this.code = code;
    this.httpStatus = extra.httpStatus;
    this.retryAfterMs = extra.retryAfterMs;
  }
}

export function isGeminiError(err: unknown): err is GeminiError {
  return err instanceof GeminiError;
}

/** User-presentable message for any thrown value. */
export function describeError(err: unknown): string {
  if (isGeminiError(err)) return err.message;
  return err instanceof Error ? err.message : 'Something went wrong.';
}

// ---------------------------------------------------------------- types

export interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}
export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}
export type Prompt = string | GeminiContent[];

export interface GenerateOptions {
  /** Routes to the model configured for this feature in Settings. */
  feature?: AiFeature;
  /** Explicit model id; wins over `feature`. */
  model?: string;
  system?: string;
  temperature?: number;
  maxOutputTokens?: number;
  /** JSON Schema subset accepted by Gemini; implies JSON output. */
  responseSchema?: Record<string, unknown>;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Automatic retries for transient failures (default 2). */
  retries?: number;
}

export interface GenerateResult {
  text: string;
  model: string;
  latencyMs: number;
  finishReason?: string;
  usage?: { promptTokens?: number; outputTokens?: number; totalTokens?: number };
}

interface RawResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
}

// ---------------------------------------------------------------- low-level helpers

function requireKey(override?: string): string {
  const key = safeTrim(override ?? getApiKey());
  if (!key) {
    throw new GeminiError('MISSING_KEY', 'No Gemini API key is configured. Add one in Settings → AI Configuration.');
  }
  return key;
}

const headers = (apiKey: string): HeadersInit => ({
  'Content-Type': 'application/json',
  // Header (not ?key=) keeps the key out of URLs, history and proxy logs.
  'x-goog-api-key': apiKey,
});

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new GeminiError('ABORTED', 'Request cancelled.'));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new GeminiError('ABORTED', 'Request cancelled.'));
      },
      { once: true },
    );
  });
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, signal?: AbortSignal): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', () => controller.abort(), { once: true });

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (timedOut) throw new GeminiError('TIMEOUT', `Gemini did not respond within ${Math.round(timeoutMs / 1000)}s.`, { cause: err });
    if (signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
      throw new GeminiError('ABORTED', 'Request cancelled.', { cause: err });
    }
    throw new GeminiError(
      'NETWORK',
      "Couldn't reach Google's Gemini API. Check your internet connection or whether a firewall blocks generativelanguage.googleapis.com.",
      { cause: err },
    );
  } finally {
    clearTimeout(timer);
  }
}

async function toGeminiError(res: Response): Promise<GeminiError> {
  let message = res.statusText || `HTTP ${res.status}`;
  let apiStatus = '';
  let reason = '';
  let retryAfterMs: number | undefined;

  try {
    const body = (await res.json()) as {
      error?: { message?: string; status?: string; details?: Array<Record<string, unknown>> };
    };
    const e = body.error;
    if (e) {
      message = e.message ?? message;
      apiStatus = e.status ?? '';
      for (const d of e.details ?? []) {
        if (typeof d.retryDelay === 'string') retryAfterMs = parseFloat(d.retryDelay) * 1000;
        if (typeof d.reason === 'string') reason = d.reason;
      }
    }
  } catch {
    /* body wasn't JSON */
  }
  const header = Number(res.headers.get('retry-after'));
  if (retryAfterMs === undefined && Number.isFinite(header) && header > 0) retryAfterMs = header * 1000;

  const extra = { httpStatus: res.status, retryAfterMs };
  const s = res.status;

  if (reason === 'API_KEY_INVALID' || /api key not valid|api key expired/i.test(message) || s === 401) {
    return new GeminiError('INVALID_KEY', 'Google rejected this API key. Check that it is correct, active and not restricted from the Gemini API.', extra);
  }
  if (s === 403 || apiStatus === 'PERMISSION_DENIED') {
    return new GeminiError('PERMISSION_DENIED', `This key isn't permitted to use that model or API (${message}). Confirm the Generative Language API is enabled for the key's project.`, extra);
  }
  if (s === 404 || apiStatus === 'NOT_FOUND') {
    return new GeminiError('MODEL_NOT_FOUND', `The selected model isn't available to this key (${message}). Pick a different model in Settings.`, extra);
  }
  if (s === 429 || apiStatus === 'RESOURCE_EXHAUSTED') {
    const wait = retryAfterMs ? ` Try again in about ${Math.ceil(retryAfterMs / 1000)}s.` : '';
    return new GeminiError('QUOTA_EXCEEDED', `Gemini quota or rate limit reached.${wait} Check your plan and billing in Google AI Studio, or switch to a lighter model.`, extra);
  }
  if (s === 400) return new GeminiError('BAD_REQUEST', `Gemini rejected the request: ${message}`, extra);
  if (s >= 500) return new GeminiError('SERVER_ERROR', `Gemini is temporarily unavailable (${s}). ${message}`, extra);
  return new GeminiError('UNKNOWN', message, extra);
}

function shouldRetry(err: GeminiError): boolean {
  if (err.code === 'SERVER_ERROR' || err.code === 'NETWORK') return true;
  // Only auto-retry quota errors when Google says the wait is short (per-minute limits).
  if (err.code === 'QUOTA_EXCEEDED') return true;
  return false;
}

async function requestJson<T>(
  url: string,
  init: RequestInit,
  opts: { timeoutMs: number; retries: number; signal?: AbortSignal; model?: string },
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetchWithTimeout(url, init, opts.timeoutMs, opts.signal);
      if (!res.ok) throw await toGeminiError(res);
      return (await res.json()) as T;
    } catch (err) {
      const e = isGeminiError(err) ? err : new GeminiError('UNKNOWN', describeError(err), { cause: err });
      if (attempt >= opts.retries || !shouldRetry(e)) throw e;
      const backoff = e.retryAfterMs ?? Math.min(MAX_AUTO_RETRY_DELAY_MS, 800 * 2 ** attempt);
      if (opts.model) setStatus({ phase: 'retrying', model: opts.model, checkedAt: Date.now(), attempt: attempt + 2, maxAttempts: opts.retries + 1, message: 'Retrying (' + (attempt + 2) + '/' + (opts.retries + 1) + ')…' });
      await sleep(backoff, opts.signal);
    }
  }
}

function reportFailure(err: GeminiError, model: string): void {
  if (err.code === 'QUOTA_EXCEEDED') setStatus({ phase: 'quota', model, checkedAt: Date.now(), message: err.message });
  else if (err.code === 'INVALID_KEY' || err.code === 'PERMISSION_DENIED') {
    setStatus({ phase: 'error', model, checkedAt: Date.now(), message: err.message });
  }
}

function reportSuccess(model: string, latencyMs: number): void {
  setStatus({ phase: 'connected', model, latencyMs, checkedAt: Date.now() });
}

async function resolveModel(opts: GenerateOptions): Promise<{ model: string; temperature: number; fallbackModels: string[] }> {
  const settings = await getAiSettings();
  const model = opts.model ?? (opts.feature ? settings.featureModels[opts.feature] : undefined) ?? settings.defaultModel;
  const fallbackModels = opts.model ? [] : settings.fallbackModels.filter((candidate) => candidate !== model);
  return { model, temperature: opts.temperature ?? settings.temperature, fallbackModels };
}

async function requestWithFallback<T>(
  models: string[],
  request: (model: string) => Promise<T>,
): Promise<{ value: T; model: string }> {
  let lastError: unknown;
  for (const model of models) {
    try {
      return { value: await request(model), model };
    } catch (err) {
      lastError = err;
      if (!(err instanceof GeminiError) || !['MODEL_NOT_FOUND', 'SERVER_ERROR'].includes(err.code)) throw err;
    }
  }
  throw lastError;
}

function buildBody(prompt: Prompt, opts: GenerateOptions, temperature: number, json: boolean): string {
  const contents: GeminiContent[] = typeof prompt === 'string' ? [{ role: 'user', parts: [{ text: prompt }] }] : prompt;
  const generationConfig: Record<string, unknown> = { temperature };
  if (opts.maxOutputTokens) generationConfig.maxOutputTokens = opts.maxOutputTokens;
  if (json || opts.responseSchema) generationConfig.responseMimeType = 'application/json';
  if (opts.responseSchema) generationConfig.responseSchema = opts.responseSchema;

  return JSON.stringify({
    contents,
    generationConfig,
    ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
  });
}

export function extractGeminiResponse(raw: unknown): { text: string; finishReason?: string } {
  if (!raw || typeof raw !== 'object') throw new GeminiEmptyResponseError();
  if (raw.promptFeedback?.blockReason) {
    throw new GeminiBlockedError(`Gemini blocked the prompt (${raw.promptFeedback.blockReason}). Rephrase the input and try again.`);
  }
  const candidate = raw.candidates?.[0];
  const finishReason = candidate?.finishReason;
  const text = (candidate?.content?.parts ?? [])
    .filter((p) => !p.thought)
    .map((p) => p.text ?? '')
    .join('');

  if (!text) {
    if (finishReason === 'SAFETY' || finishReason === 'PROHIBITED_CONTENT' || finishReason === 'RECITATION') {
      throw new GeminiBlockedError(`Gemini withheld the response (${finishReason}). Rephrase the input and try again.`);
    }
    if (finishReason === 'MAX_TOKENS') {
      throw new GeminiTruncatedError('The output limit was reached before any text was produced. Raise maxOutputTokens.');
    }
    if (finishReason && finishReason !== 'STOP') {
      throw new GeminiTruncatedError(`Gemini stopped with finish reason ${finishReason} before producing usable text.`);
    }
    throw new GeminiEmptyResponseError();
  }
  return { text, finishReason };
}

function usageOf(raw: RawResponse): GenerateResult['usage'] {
  const u = raw.usageMetadata;
  return u ? { promptTokens: u.promptTokenCount, outputTokens: u.candidatesTokenCount, totalTokens: u.totalTokenCount } : undefined;
}

// ---------------------------------------------------------------- public API

/** Single-shot text generation. */
export async function generateText(prompt: Prompt, opts: GenerateOptions = {}): Promise<GenerateResult> {
  const apiKey = requireKey();
  const { model, temperature, fallbackModels } = await resolveModel(opts);
  const started = performance.now();

  let raw: RawResponse;
  try {
    const routed = await requestWithFallback([model, ...fallbackModels], (candidateModel) =>
      requestJson<RawResponse>(
        `${API_BASE}/models/${encodeURIComponent(candidateModel)}:generateContent`,
        { method: 'POST', headers: headers(apiKey), body: buildBody(prompt, opts, temperature, false) },
        { timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, retries: opts.retries ?? 2, signal: opts.signal, model: candidateModel },
      ),
    );
    raw = routed.value;
  } catch (err) {
    if (isGeminiError(err)) reportFailure(err, model);
    throw err;
  }

  const latencyMs = Math.round(performance.now() - started);
  const { text, finishReason } = extractGeminiResponse(raw);
  const answeredBy = routed?.model ?? model;
  reportSuccess(answeredBy, latencyMs);
  return { text, model: answeredBy, latencyMs, finishReason, usage: usageOf(raw) };
}

/** Generation constrained to JSON, parsed and returned as T. Pass `responseSchema` for best results. */
export async function generateJson<T = unknown>(prompt: Prompt, opts: GenerateOptions = {}): Promise<{ data: T } & GenerateResult> {
  const apiKey = requireKey();
  const { model, temperature, fallbackModels } = await resolveModel(opts);
  const started = performance.now();

  let raw: RawResponse;
  let answeredBy = model;
  try {
    const routed = await requestWithFallback([model, ...fallbackModels], (candidateModel) =>
      requestJson<RawResponse>(
        `${API_BASE}/models/${encodeURIComponent(candidateModel)}:generateContent`,
        { method: 'POST', headers: headers(apiKey), body: buildBody(prompt, opts, temperature, true) },
        { timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, retries: opts.retries ?? 2, signal: opts.signal, model: candidateModel },
      ),
    );
    raw = routed.value;
    answeredBy = routed.model;
  } catch (err) {
    if (isGeminiError(err)) reportFailure(err, model);
    throw err;
  }

  const latencyMs = Math.round(performance.now() - started);
  const { text, finishReason } = extract(raw);
  reportSuccess(answeredBy, latencyMs);

  const cleaned = safeTrim(text).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return { data: JSON.parse(cleaned) as T, text, model: answeredBy, latencyMs, finishReason, usage: usageOf(raw) };
  } catch (err) {
    throw new GeminiError('PARSE', 'Gemini returned malformed JSON. Try again or simplify the request.', { cause: err });
  }
}

/** Streaming generation (Server-Sent Events). `onChunk` receives each delta and the accumulated text. */
export async function streamText(
  prompt: Prompt,
  opts: GenerateOptions,
  onChunk: (delta: string, fullText: string) => void,
): Promise<GenerateResult> {
  const apiKey = requireKey();
  const { model, temperature } = await resolveModel(opts);
  const started = performance.now();

  let res: Response;
  try {
    res = await fetchWithTimeout(
      `${API_BASE}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
      { method: 'POST', headers: headers(apiKey), body: buildBody(prompt, opts, temperature, false) },
      opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      opts.signal,
    );
    if (!res.ok) throw await toGeminiError(res);
  } catch (err) {
    if (isGeminiError(err)) reportFailure(err, model);
    throw err;
  }
  if (!res.body) throw new GeminiError('EMPTY_RESPONSE', 'The streaming response had no body.');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  let finishReason: string | undefined;
  let usage: GenerateResult['usage'];

  const handleLine = (line: string) => {
    if (!line.startsWith('data:')) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') return;
    let raw: RawResponse;
    try {
      raw = JSON.parse(payload) as RawResponse;
    } catch {
      return; // ignore partial/keep-alive frames
    }
    if (raw.promptFeedback?.blockReason) {
      throw new GeminiError('BLOCKED', `Gemini blocked the prompt (${raw.promptFeedback.blockReason}).`);
    }
    const cand = raw.candidates?.[0];
    finishReason = cand?.finishReason ?? finishReason;
    usage = usageOf(raw) ?? usage;
    const delta = (cand?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? '').join('');
    if (delta) {
      full += delta;
      onChunk(delta, full);
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      lines.forEach(handleLine);
    }
    if (buffer) handleLine(buffer);
  } catch (err) {
    if (isGeminiError(err)) throw err;
    if (opts.signal?.aborted) throw new GeminiError('ABORTED', 'Request cancelled.', { cause: err });
    throw new GeminiError('NETWORK', 'The connection to Gemini was interrupted while streaming.', { cause: err });
  }

  if (!full) throw new GeminiError('EMPTY_RESPONSE', 'Gemini returned an empty response. Try again.');
  const latencyMs = Math.round(performance.now() - started);
  reportSuccess(model, latencyMs);
  return { text: full, model, latencyMs, finishReason, usage };
}

export interface GeminiModelInfo {
  id: string;
  displayName: string;
  description?: string;
  version?: string;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
}

/** Returns the Gemini models currently exposed to this API key that support generateContent. */
export async function listAvailableModels(apiKeyOverride?: string): Promise<GeminiModelInfo[]> {
  const key = requireKey(apiKeyOverride);
  const models: GeminiModelInfo[] = [];
  let pageToken = '';
  do {
    const query = new URLSearchParams({ pageSize: '1000' });
    if (pageToken) query.set('pageToken', pageToken);
    const data = await requestJson<{ models?: Array<{ name?: string; displayName?: string; description?: string; version?: string; inputTokenLimit?: number; outputTokenLimit?: number; supportedGenerationMethods?: string[] }>; nextPageToken?: string }>(
      `${API_BASE}/models?${query.toString()}`,
      { method: 'GET', headers: headers(key) },
      { timeoutMs: 15_000, retries: 1 },
    );
    for (const model of data.models ?? []) {
      const id = (model.name ?? '').replace(/^models\//, '');
      if (!id.startsWith('gemini-') || !(model.supportedGenerationMethods ?? []).includes('generateContent')) continue;
      models.push({ id, displayName: model.displayName || id, description: model.description, version: model.version, inputTokenLimit: model.inputTokenLimit, outputTokenLimit: model.outputTokenLimit });
    }
    pageToken = data.nextPageToken ?? '';
  } while (pageToken);
  return models.sort((a, b) => a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id));
}
// ---------------------------------------------------------------- connection test

export interface ConnectionTestResult {
  ok: boolean;
  model: string;
  latencyMs?: number;
  code?: GeminiErrorCode;
  message: string;
}

/**
 * Live ping: GET /models/{model}. Validates the key and model access over a real round trip
 * without spending generation quota. Updates the header status pill when testing the saved key.
 */
export async function testConnection(opts: { apiKey?: string; model: string; signal?: AbortSignal }): Promise<ConnectionTestResult> {
  const candidate = safeTrim(opts.apiKey ?? getApiKey());
  const isSavedKey = candidate !== '' && candidate === getApiKey();

  if (!candidate) {
    return { ok: false, model: opts.model, code: 'MISSING_KEY', message: 'Enter an API key first.' };
  }
  if (isSavedKey) setStatus({ phase: 'checking', model: opts.model });

  const started = performance.now();
  try {
    await requestJson<{ name?: string }>(
      `${API_BASE}/models/${encodeURIComponent(opts.model)}`,
      { method: 'GET', headers: headers(candidate) },
      { timeoutMs: 15_000, retries: 0, signal: opts.signal },
    );
    const latencyMs = Math.round(performance.now() - started);
    if (isSavedKey) reportSuccess(opts.model, latencyMs);
    return { ok: true, model: opts.model, latencyMs, message: `Connected to ${opts.model}.` };
  } catch (err) {
    const e = isGeminiError(err) ? err : new GeminiError('UNKNOWN', describeError(err));
    if (isSavedKey) {
      setStatus({
        phase: e.code === 'QUOTA_EXCEEDED' ? 'quota' : 'error',
        model: opts.model,
        checkedAt: Date.now(),
        message: e.message,
      });
    }
    return { ok: false, model: opts.model, code: e.code, message: e.message };
  }
}
