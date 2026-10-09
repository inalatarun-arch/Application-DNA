/** Anthropic Messages API (https://docs.anthropic.com/en/api/messages), called straight from the browser. */
import { GeminiBlockedError, GeminiEmptyResponseError, GeminiError } from '../aiErrors';
import type { ModelInfo } from '@/config/providers';
import { fetchWithTimeout, errorFromResponse, readSse, requestJson, withJsonInstructions, type NormMessage, type NormRequest, type NormResult } from './shared';

const LABEL = 'Claude';
const VERSION = '2023-06-01';
export const ANTHROPIC_DEFAULT_MAX_TOKENS = 8192;

export const anthropicHeaders = (apiKey: string): Record<string, string> => ({
  'Content-Type': 'application/json',
  'x-api-key': apiKey,
  'anthropic-version': VERSION,
  // Required for calls made from a web page; the key is the user's own and never leaves their browser except to Anthropic.
  'anthropic-dangerous-direct-browser-access': 'true',
});

function toBlocks(m: NormMessage): Array<Record<string, unknown>> {
  return m.parts.map((p) => {
    if (p.text) return { type: 'text', text: p.text };
    if (p.image) return { type: 'image', source: { type: 'base64', media_type: p.image.mimeType, data: p.image.data } };
    return { type: 'document', source: { type: 'base64', media_type: p.document?.mimeType ?? 'application/pdf', data: p.document?.data ?? '' } };
  });
}

export function buildAnthropicBody(req: NormRequest, stream = false): Record<string, unknown> {
  const system = req.json ? withJsonInstructions(req.system, req.schema) : req.system;
  return {
    model: req.model,
    max_tokens: req.maxTokens ?? ANTHROPIC_DEFAULT_MAX_TOKENS,
    temperature: Math.min(1, Math.max(0, req.temperature)),
    ...(system ? { system } : {}),
    messages: req.messages.map((m) => ({ role: m.role, content: toBlocks(m) })),
    ...(stream ? { stream: true } : {}),
  };
}

interface AnthropicResponse {
  content?: Array<{ type?: string; text?: string }>;
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

const FINISH: Record<string, string> = { end_turn: 'STOP', stop_sequence: 'STOP', max_tokens: 'MAX_TOKENS', pause_turn: 'STOP' };

export function parseAnthropicResponse(raw: AnthropicResponse): NormResult {
  if (!raw || typeof raw !== 'object') throw new GeminiEmptyResponseError();
  const text = (raw.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
  const reason = raw.stop_reason ?? undefined;
  if (reason === 'refusal') throw new GeminiBlockedError('Claude declined to answer this request. Rephrase the input and try again.');
  const usage = raw.usage
    ? { promptTokens: raw.usage.input_tokens, outputTokens: raw.usage.output_tokens, totalTokens: (raw.usage.input_tokens ?? 0) + (raw.usage.output_tokens ?? 0) }
    : undefined;
  if (!text.trim()) {
    if (reason === 'max_tokens') throw new GeminiError('EMPTY_RESPONSE', 'The output limit was reached before any text was produced. Raise maxOutputTokens.');
    throw new GeminiEmptyResponseError();
  }
  return { text, finishReason: reason ? FINISH[reason] ?? reason.toUpperCase() : undefined, usage };
}

/** Some newer models refuse a temperature setting; drop it and try again. */
export function adjust(body: Record<string, unknown>, message: string): Record<string, unknown> | null {
  // "max_tokens: 65536 > 32000, which is the maximum allowed number of output tokens for ..."
  const cap = message.match(/max_tokens:\s*\d+\s*>\s*(\d+)/i);
  if (cap && Number(cap[1]) > 0 && Number(cap[1]) < Number(body.max_tokens)) return { ...body, max_tokens: Number(cap[1]) };
  if (/temperature/i.test(message) && 'temperature' in body) {
    const rest = { ...body };
    delete rest.temperature;
    return rest;
  }
  return null;
}

export async function anthropicGenerate(apiKey: string, baseUrl: string, req: NormRequest, o: { timeoutMs: number; retries: number; signal?: AbortSignal }): Promise<NormResult> {
  const raw = await requestJson<AnthropicResponse>(
    `${baseUrl}/messages`,
    { method: 'POST', headers: anthropicHeaders(apiKey), body: JSON.stringify(buildAnthropicBody(req)) },
    { label: LABEL, adjust, ...o },
  );
  return parseAnthropicResponse(raw);
}

export async function anthropicStream(
  apiKey: string, baseUrl: string, req: NormRequest,
  o: { timeoutMs: number; signal?: AbortSignal }, onChunk: (delta: string, full: string) => void,
): Promise<NormResult> {
  let body = buildAnthropicBody(req, true);
  let res = await fetchWithTimeout(`${baseUrl}/messages`, { method: 'POST', headers: anthropicHeaders(apiKey), body: JSON.stringify(body) }, o.timeoutMs, o.signal, LABEL);
  if (!res.ok) {
    const err = await errorFromResponse(res, LABEL);
    const next = err.code === 'BAD_REQUEST' ? adjust(body, err.message) : null;
    if (!next) throw err;
    body = next;
    res = await fetchWithTimeout(`${baseUrl}/messages`, { method: 'POST', headers: anthropicHeaders(apiKey), body: JSON.stringify(body) }, o.timeoutMs, o.signal, LABEL);
    if (!res.ok) throw await errorFromResponse(res, LABEL);
  }
  let full = '';
  let reason: string | undefined;
  let input: number | undefined;
  let output: number | undefined;
  await readSse(res, (j) => {
    const e = j as { type?: string; delta?: { type?: string; text?: string; stop_reason?: string }; message?: { usage?: { input_tokens?: number } }; usage?: { output_tokens?: number }; error?: { message?: string } };
    if (e.type === 'error') throw new GeminiError('SERVER_ERROR', e.error?.message ?? 'Claude reported an error while streaming.');
    if (e.type === 'message_start') input = e.message?.usage?.input_tokens ?? input;
    if (e.type === 'content_block_delta' && e.delta?.type === 'text_delta' && e.delta.text) {
      full += e.delta.text;
      onChunk(e.delta.text, full);
    }
    if (e.type === 'message_delta') {
      reason = e.delta?.stop_reason ?? reason;
      output = e.usage?.output_tokens ?? output;
    }
  }, LABEL, o.signal);
  if (!full) throw new GeminiEmptyResponseError();
  return { text: full, finishReason: reason ? FINISH[reason] ?? reason.toUpperCase() : 'STOP', usage: { promptTokens: input, outputTokens: output, totalTokens: (input ?? 0) + (output ?? 0) } };
}

export function parseAnthropicModels(data: { data?: Array<{ id?: string; display_name?: string }> }): ModelInfo[] {
  return (data.data ?? [])
    .filter((m): m is { id: string; display_name?: string } => typeof m.id === 'string' && m.id.startsWith('claude'))
    .map((m) => ({ id: m.id, displayName: m.display_name || m.id }));
}

export async function anthropicListModels(apiKey: string, baseUrl: string): Promise<ModelInfo[]> {
  const out: ModelInfo[] = [];
  let after = '';
  for (let page = 0; page < 5; page++) {
    const q = new URLSearchParams({ limit: '100' });
    if (after) q.set('after_id', after);
    const data = await requestJson<{ data?: Array<{ id?: string; display_name?: string }>; has_more?: boolean; last_id?: string }>(
      `${baseUrl}/models?${q.toString()}`,
      { method: 'GET', headers: anthropicHeaders(apiKey) },
      { label: LABEL, timeoutMs: 15_000, retries: 1 },
    );
    out.push(...parseAnthropicModels(data));
    if (!data.has_more || !data.last_id) break;
    after = data.last_id;
  }
  return out;
}

export async function anthropicTest(apiKey: string, baseUrl: string, model: string, signal?: AbortSignal): Promise<void> {
  await requestJson<unknown>(`${baseUrl}/models/${encodeURIComponent(model)}`, { method: 'GET', headers: anthropicHeaders(apiKey) }, { label: LABEL, timeoutMs: 15_000, retries: 0, signal });
}
