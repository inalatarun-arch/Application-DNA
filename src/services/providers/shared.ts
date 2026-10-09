/** Provider-neutral request/response shapes plus the HTTP plumbing shared by the Claude and OpenAI adapters. */
import { GeminiError, describeError, isGeminiError } from '../aiErrors';

export interface NormPart {
  text?: string;
  image?: { mimeType: string; data: string };
  document?: { mimeType: string; data: string };
}
export interface NormMessage {
  role: 'user' | 'assistant';
  parts: NormPart[];
}
export interface NormRequest {
  model: string;
  system?: string;
  messages: NormMessage[];
  temperature: number;
  maxTokens?: number;
  /** Ask for JSON only. */
  json?: boolean;
  /** Optional JSON Schema, described to the model in words because only some providers enforce one. */
  schema?: Record<string, unknown>;
}
export interface NormResult {
  text: string;
  /** 'STOP' | 'MAX_TOKENS' | other provider reason, mapped to the same words the Gemini code uses. */
  finishReason?: string;
  usage?: { promptTokens?: number; outputTokens?: number; totalTokens?: number };
}

interface GeminiLikeContent {
  role: string;
  parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>;
}

/** Converts the Gemini-shaped prompt every feature builds into neutral messages. */
export function toNormMessages(prompt: string | GeminiLikeContent[], providerLabel: string, accepts: { pdf: boolean; image: boolean }): NormMessage[] {
  const contents: GeminiLikeContent[] = typeof prompt === 'string' ? [{ role: 'user', parts: [{ text: prompt }] }] : prompt;
  const out: NormMessage[] = [];
  for (const c of contents) {
    const parts: NormPart[] = [];
    for (const p of c.parts) {
      if (p.text) parts.push({ text: p.text });
      else if (p.inlineData) {
        const { mimeType, data } = p.inlineData;
        if (mimeType.startsWith('image/')) {
          if (!accepts.image) throw new GeminiError('BAD_REQUEST', `${providerLabel} cannot read images here. Switch provider in Settings or describe the image in text.`);
          parts.push({ image: { mimeType, data } });
        } else if (mimeType === 'application/pdf') {
          if (!accepts.pdf) {
            throw new GeminiError('BAD_REQUEST', `${providerLabel} cannot read PDF files here. Switch to Gemini or Claude in Settings, or upload the document as Word, text or Excel instead.`);
          }
          parts.push({ document: { mimeType, data } });
        } else {
          throw new GeminiError('BAD_REQUEST', `${providerLabel} cannot read ${mimeType} attachments.`);
        }
      }
    }
    if (!parts.length) continue;
    const role = c.role === 'model' || c.role === 'assistant' ? 'assistant' : 'user';
    const last = out[out.length - 1];
    if (last && last.role === role) last.parts.push(...parts);
    else out.push({ role, parts });
  }
  if (!out.length) out.push({ role: 'user', parts: [{ text: '.' }] });
  return out;
}

/** System text with JSON instructions added for providers that have no native JSON-schema mode. */
export function withJsonInstructions(system: string | undefined, schema?: Record<string, unknown>): string {
  const rules = [
    'Reply with one valid JSON value and nothing else: no markdown fences, no commentary before or after.',
    schema ? `The JSON must follow this JSON Schema (treat type names case-insensitively):\n${JSON.stringify(schema)}` : '',
  ].filter(Boolean).join('\n');
  return system ? `${system}\n\n${rules}` : rules;
}

export function networkMessage(label: string): string {
  return `Couldn't reach ${label}. Check your internet connection. Some services also refuse calls made straight from a browser (CORS); if that is the case here, use a different provider.`;
}

export async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, signal: AbortSignal | undefined, label: string): Promise<Response> {
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
    if (timedOut) throw new GeminiError('TIMEOUT', `${label} did not respond within ${Math.round(timeoutMs / 1000)}s.`, { cause: err });
    if (signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) throw new GeminiError('ABORTED', 'Request cancelled.', { cause: err });
    throw new GeminiError('NETWORK', networkMessage(label), { cause: err });
  } finally {
    clearTimeout(timer);
  }
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new GeminiError('ABORTED', 'Request cancelled.'));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(new GeminiError('ABORTED', 'Request cancelled.')); }, { once: true });
  });
}

/** Reads `{ error: { message } }` (OpenAI) or `{ type:'error', error:{ message } }` (Anthropic) into a typed error. */
export async function errorFromResponse(res: Response, label: string): Promise<GeminiError> {
  let message = res.statusText || `HTTP ${res.status}`;
  try {
    const body = (await res.json()) as { error?: { message?: string } | string; message?: string };
    const e = body.error;
    if (typeof e === 'string') message = e;
    else if (e?.message) message = e.message;
    else if (body.message) message = body.message;
  } catch {
    /* body was not JSON */
  }
  const header = Number(res.headers.get('retry-after'));
  const retryAfterMs = Number.isFinite(header) && header > 0 ? header * 1000 : undefined;
  return mapStatus(res.status, message, label, retryAfterMs);
}

export function mapStatus(status: number, message: string, label: string, retryAfterMs?: number): GeminiError {
  const extra = { httpStatus: status, retryAfterMs };
  if (status === 401) return new GeminiError('INVALID_KEY', `${label} rejected this API key. Check that it is correct and active.`, extra);
  if (status === 403) return new GeminiError('PERMISSION_DENIED', `${label} did not allow this request (${message}).`, extra);
  if (status === 404) return new GeminiError('MODEL_NOT_FOUND', `${label} could not find that model or address (${message}). Pick another model in Settings, or check the base URL.`, extra);
  if (status === 429) {
    const wait = retryAfterMs ? ` Try again in about ${Math.ceil(retryAfterMs / 1000)}s.` : '';
    return new GeminiError('QUOTA_EXCEEDED', `${label} rate limit or quota reached.${wait} ${message}`.trim(), extra);
  }
  if (status === 400 || status === 413 || status === 422) return new GeminiError('BAD_REQUEST', `${label} rejected the request: ${message}`, extra);
  if (status >= 500) return new GeminiError('SERVER_ERROR', `${label} is temporarily unavailable (${status}). ${message}`.trim(), extra);
  return new GeminiError('UNKNOWN', message, extra);
}

export function shouldRetry(err: GeminiError): boolean {
  return err.code === 'SERVER_ERROR' || err.code === 'NETWORK' || err.code === 'QUOTA_EXCEEDED';
}

/** POST/GET JSON with retries on transient errors and an optional body adjuster for parameter differences. */
export async function requestJson<T>(
  url: string,
  init: RequestInit & { body?: string },
  opts: { label: string; timeoutMs: number; retries: number; signal?: AbortSignal; adjust?: (body: Record<string, unknown>, message: string) => Record<string, unknown> | null },
): Promise<T> {
  let current = init;
  let adjusted = 0;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetchWithTimeout(url, current, opts.timeoutMs, opts.signal, opts.label);
      if (!res.ok) throw await errorFromResponse(res, opts.label);
      return (await res.json()) as T;
    } catch (err) {
      const e = isGeminiError(err) ? err : new GeminiError('UNKNOWN', describeError(err), { cause: err });
      if (e.code === 'BAD_REQUEST' && opts.adjust && current.body && adjusted < 3) {
        try {
          const next = opts.adjust(JSON.parse(current.body) as Record<string, unknown>, e.message);
          if (next) {
            adjusted++;
            current = { ...current, body: JSON.stringify(next) };
            attempt--;
            continue;
          }
        } catch {
          /* fall through to the original error */
        }
      }
      if (attempt >= opts.retries || !shouldRetry(e)) throw e;
      await sleep(e.retryAfterMs ?? Math.min(15_000, 800 * 2 ** attempt), opts.signal);
    }
  }
}

/** Reads a server-sent-event response, calling `onData` with each JSON payload line. */
export async function readSse(res: Response, onData: (json: unknown) => void, label: string, signal?: AbortSignal): Promise<void> {
  if (!res.body) throw new GeminiError('EMPTY_RESPONSE', 'The streaming response had no body.');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const line = (l: string) => {
    if (!l.startsWith('data:')) return;
    const payload = l.slice(5).trim();
    if (!payload || payload === '[DONE]') return;
    let json: unknown;
    try {
      json = JSON.parse(payload);
    } catch {
      return;
    }
    onData(json);
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      lines.forEach(line);
    }
    if (buffer) line(buffer);
  } catch (err) {
    if (isGeminiError(err)) throw err;
    if (signal?.aborted) throw new GeminiError('ABORTED', 'Request cancelled.', { cause: err });
    throw new GeminiError('NETWORK', `The connection to ${label} was interrupted while streaming.`, { cause: err });
  }
}
