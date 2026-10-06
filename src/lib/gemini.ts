/**
 * Single Gemini client. Every AI feature (impact analysis, user stories, FRD, TDD,
 * transcript processing, copilot...) calls generateText()/generateJson() here and
 * they all share the ONE key held in the vault.
 */
import { getKey } from './vault';

const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta';
const LS_MODEL = 'eih.ai.model';

/** 'gemini-flash-latest' is a Google-maintained alias that always points at the current Flash model. */
export const DEFAULT_MODEL = 'gemini-flash-latest';
export const MODEL_PRESETS = ['gemini-flash-latest', 'gemini-3-flash-preview', 'gemini-3.1-flash-lite', 'gemini-3.1-pro-preview'];

export type FeatureId = 'impact' | 'userStories' | 'frd' | 'tdd' | 'sectionRefine' | 'transcript' | 'copilot' | 'test';

export function getModel(): string {
  try {
    return localStorage.getItem(LS_MODEL) || DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}
export function setModel(model: string): void {
  try {
    localStorage.setItem(LS_MODEL, model.trim() || DEFAULT_MODEL);
  } catch {
    /* ignore */
  }
}

/**
 * Key resolution. For now every feature uses the same shared key.
 *
 * ---- MULTI-KEY ROUTING (disabled - re-enable together with the commented block in AiSettingsPanel.tsx) ----
 * To give each feature its own key later:
 *   1. Extend vault.ts to store a map { [feature]: encryptedRecord } instead of one record.
 *   2. Replace the body below with:
 *        return getKeyFor(feature) ?? getKey();
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function resolveKey(_feature: FeatureId): string {
  return getKey();
}

export class GeminiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
  }
}

export interface GenerateOptions {
  feature: FeatureId;
  /** System instruction - the standing "rules of behaviour" for this task. */
  system?: string;
  /** The user turn - task + injected project/knowledge context. */
  prompt: string;
  /** Ask Gemini for a JSON response (responseMimeType = application/json). */
  json?: boolean;
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
  model?: string;
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function friendlyHttpError(status: number, apiMessage: string | undefined, model: string): string {
  const m = apiMessage ? ` (${apiMessage})` : '';
  if (status === 400 && /api key/i.test(apiMessage ?? '')) return `Google rejected the API key as invalid${m}.`;
  if (status === 400) return `Gemini could not process the request${m}.`;
  if (status === 401 || status === 403)
    return `The API key was refused or is not allowed to call Gemini from this site${m}. Check key restrictions in Google AI Studio / Cloud Console.`;
  if (status === 404) return `Model "${model}" was not found. Choose another model in AI Settings${m}.`;
  if (status === 429) return `Gemini rate limit or quota reached${m}. Wait a minute and retry, or check your quota.`;
  if (status >= 500) return `Gemini is temporarily unavailable${m}. Please retry.`;
  return `Gemini request failed with HTTP ${status}${m}.`;
}

async function callGemini(opts: GenerateOptions): Promise<string> {
  const model = opts.model || getModel();
  const key = resolveKey(opts.feature);
  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: opts.prompt }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.3,
      maxOutputTokens: opts.maxOutputTokens ?? 8192,
      ...(opts.json ? { responseMimeType: 'application/json' } : {}),
    },
  };
  if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };

  const url = `${API_ROOT}/models/${encodeURIComponent(model)}:generateContent`;
  const maxAttempts = 3;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), 180_000);
    const onAbort = () => timeout.abort();
    opts.signal?.addEventListener('abort', onAbort);
    try {
      // The key travels in a header (never in the URL) so it is not written to logs/history.
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
        signal: timeout.signal,
      });
      const data = (await res.json().catch(() => ({}))) as GeminiResponse;
      if (!res.ok) {
        const err = new GeminiError(friendlyHttpError(res.status, data.error?.message, model), res.status);
        if ((res.status === 429 || res.status >= 500) && attempt < maxAttempts) {
          lastErr = err;
          await sleep(1500 * 2 ** (attempt - 1));
          continue;
        }
        throw err;
      }
      if (data.promptFeedback?.blockReason)
        throw new GeminiError(`Gemini blocked the request (${data.promptFeedback.blockReason}). Rephrase the input.`);
      const cand = data.candidates?.[0];
      const text = (cand?.content?.parts ?? []).map((p) => p.text ?? '').join('');
      if (!text.trim()) throw new GeminiError(`Gemini returned an empty response (finish reason: ${cand?.finishReason ?? 'unknown'}).`);
      if (cand?.finishReason === 'MAX_TOKENS') {
        if (opts.json) throw new GeminiError('The response was cut off because it was too long. Try fewer requirements at once.');
        return text + '\n\n> **Note:** output was truncated by the model token limit. Use "Refine section" to continue the missing sections.';
      }
      return text;
    } catch (e) {
      if (opts.signal?.aborted) throw new GeminiError('Cancelled.');
      if (e instanceof GeminiError) throw e;
      if (e instanceof DOMException && e.name === 'AbortError') throw new GeminiError('Gemini took too long to respond (timeout).');
      lastErr = e;
      if (attempt < maxAttempts) {
        await sleep(1500 * 2 ** (attempt - 1));
        continue;
      }
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
    }
  }
  if (lastErr instanceof GeminiError) throw lastErr;
  throw new GeminiError('Network error while contacting Gemini. Check your connection and any key restrictions.');
}

export function generateText(opts: Omit<GenerateOptions, 'json'>): Promise<string> {
  return callGemini({ ...opts, json: false });
}

/** Extract and parse JSON even when the model wraps it in fences or adds commentary. */
export function parseJsonLoose<T>(text: string): T {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      } catch {
        /* fall through */
      }
    }
    throw new GeminiError('Gemini returned malformed JSON. Please retry.');
  }
}

export async function generateJson<T>(opts: Omit<GenerateOptions, 'json'>): Promise<T> {
  const text = await callGemini({ ...opts, json: true });
  return parseJsonLoose<T>(text);
}

export interface ConnectionResult {
  ok: boolean;
  message: string;
  models: string[];
  latencyMs?: number;
}

/** Validates the saved key against Google (lists models, then runs a 1-token-ish ping on the selected model). */
export async function testConnection(): Promise<ConnectionResult> {
  const started = performance.now();
  try {
    const key = getKey();
    const res = await fetch(`${API_ROOT}/models?pageSize=200`, { headers: { 'x-goog-api-key': key } });
    const data = (await res.json().catch(() => ({}))) as {
      models?: { name: string; supportedGenerationMethods?: string[] }[];
      error?: { message?: string };
    };
    if (!res.ok) return { ok: false, models: [], message: friendlyHttpError(res.status, data.error?.message, getModel()) };
    const models = (data.models ?? [])
      .filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''))
      .filter((n) => n.startsWith('gemini'));
    try {
      await callGemini({ feature: 'test', prompt: 'Reply with the single word: OK', maxOutputTokens: 256, temperature: 0 });
    } catch (e) {
      return {
        ok: false,
        models,
        message: `Key is valid, but the selected model "${getModel()}" failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
    return {
      ok: true,
      models,
      latencyMs: Math.round(performance.now() - started),
      message: `Connected. Key is valid and "${getModel()}" responded.`,
    };
  } catch (e) {
    return { ok: false, models: [], message: e instanceof Error ? e.message : 'Connection test failed.' };
  }
}
