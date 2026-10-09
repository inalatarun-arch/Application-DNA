/** OpenAI Chat Completions API and services that copy it (OpenRouter, Groq, Mistral, local servers, ...). */
import { GeminiBlockedError, GeminiEmptyResponseError } from '../aiErrors';
import type { ModelInfo } from '@/config/providers';
import { fetchWithTimeout, errorFromResponse, readSse, requestJson, withJsonInstructions, type NormMessage, type NormRequest, type NormResult } from './shared';

const LABEL = 'The AI service';

export const openaiHeaders = (apiKey: string): Record<string, string> => ({
  'Content-Type': 'application/json',
  ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
});

function toContent(m: NormMessage): string | Array<Record<string, unknown>> {
  const onlyText = m.parts.every((p) => p.text);
  if (onlyText) return m.parts.map((p) => p.text).join('\n\n');
  return m.parts.map((p) => {
    if (p.text) return { type: 'text', text: p.text };
    if (p.image) return { type: 'image_url', image_url: { url: `data:${p.image.mimeType};base64,${p.image.data}` } };
    return { type: 'text', text: '' };
  }).filter((p) => !(p.type === 'text' && !p.text));
}

export function buildOpenAiBody(req: NormRequest, stream = false): Record<string, unknown> {
  const system = req.json ? withJsonInstructions(req.system, req.schema) : req.system;
  const messages: Array<{ role: string; content: unknown }> = [];
  if (system) messages.push({ role: 'system', content: system });
  for (const m of req.messages) messages.push({ role: m.role, content: toContent(m) });
  return {
    model: req.model,
    messages,
    temperature: req.temperature,
    ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
    ...(req.json ? { response_format: { type: 'json_object' } } : {}),
    ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
  };
}

/**
 * Providers disagree on a few parameters (newer OpenAI models want max_completion_tokens and no temperature, some
 * servers do not know response_format or stream_options). Read the complaint and change only what it names.
 */
export function adjustOpenAiBody(body: Record<string, unknown>, message: string): Record<string, unknown> | null {
  const next = { ...body };
  // "max_tokens is too large: 65536. This model supports at most 16384 completion tokens"
  const cap = message.match(/at most\s+(\d+)/i);
  if (cap && /max(_completion)?_tokens/i.test(message)) {
    const field = 'max_completion_tokens' in next ? 'max_completion_tokens' : 'max_tokens';
    const limit = Number(cap[1]);
    if (limit > 0 && limit < Number(next[field])) return { ...next, [field]: limit };
  }
  if (/max_completion_tokens/i.test(message) && 'max_tokens' in next) {
    next.max_completion_tokens = next.max_tokens;
    delete next.max_tokens;
    return next;
  }
  if (/temperature/i.test(message) && 'temperature' in next) {
    delete next.temperature;
    return next;
  }
  if (/response_format|json_object/i.test(message) && 'response_format' in next) {
    delete next.response_format;
    return next;
  }
  if (/stream_options/i.test(message) && 'stream_options' in next) {
    delete next.stream_options;
    return next;
  }
  if (/max_tokens/i.test(message) && 'max_tokens' in next) {
    delete next.max_tokens;
    return next;
  }
  return null;
}

interface OpenAiResponse {
  choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> | null; refusal?: string | null }; finish_reason?: string | null }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

const FINISH: Record<string, string> = { stop: 'STOP', length: 'MAX_TOKENS', content_filter: 'SAFETY', tool_calls: 'STOP' };

export function parseOpenAiResponse(raw: OpenAiResponse): NormResult {
  if (!raw || typeof raw !== 'object') throw new GeminiEmptyResponseError();
  const choice = raw.choices?.[0];
  const c = choice?.message?.content;
  const text = typeof c === 'string' ? c : Array.isArray(c) ? c.map((p) => p.text ?? '').join('') : '';
  const reason = choice?.finish_reason ?? undefined;
  if (choice?.message?.refusal) throw new GeminiBlockedError(`The model declined: ${choice.message.refusal}`);
  if (!text.trim()) {
    if (reason === 'content_filter') throw new GeminiBlockedError('The service filtered this request. Rephrase the input and try again.');
    throw new GeminiEmptyResponseError();
  }
  const u = raw.usage;
  return {
    text,
    finishReason: reason ? FINISH[reason] ?? reason.toUpperCase() : undefined,
    usage: u ? { promptTokens: u.prompt_tokens, outputTokens: u.completion_tokens, totalTokens: u.total_tokens } : undefined,
  };
}

export async function openaiGenerate(apiKey: string, baseUrl: string, req: NormRequest, o: { timeoutMs: number; retries: number; signal?: AbortSignal }): Promise<NormResult> {
  const raw = await requestJson<OpenAiResponse>(
    `${baseUrl}/chat/completions`,
    { method: 'POST', headers: openaiHeaders(apiKey), body: JSON.stringify(buildOpenAiBody(req)) },
    { label: LABEL, adjust: adjustOpenAiBody, ...o },
  );
  return parseOpenAiResponse(raw);
}

export async function openaiStream(
  apiKey: string, baseUrl: string, req: NormRequest,
  o: { timeoutMs: number; signal?: AbortSignal }, onChunk: (delta: string, full: string) => void,
): Promise<NormResult> {
  let body = buildOpenAiBody(req, true);
  let res: Response | null = null;
  for (let tries = 0; tries < 4; tries++) {
    res = await fetchWithTimeout(`${baseUrl}/chat/completions`, { method: 'POST', headers: openaiHeaders(apiKey), body: JSON.stringify(body) }, o.timeoutMs, o.signal, LABEL);
    if (res.ok) break;
    const err = await errorFromResponse(res, LABEL);
    const next = err.code === 'BAD_REQUEST' ? adjustOpenAiBody(body, err.message) : null;
    if (!next) throw err;
    body = next;
    res = null;
  }
  if (!res) throw new GeminiEmptyResponseError();
  let full = '';
  let reason: string | undefined;
  let usage: NormResult['usage'];
  await readSse(res, (j) => {
    const e = j as { choices?: Array<{ delta?: { content?: string | null }; finish_reason?: string | null }>; usage?: OpenAiResponse['usage'] };
    const ch = e.choices?.[0];
    const d = ch?.delta?.content;
    if (d) {
      full += d;
      onChunk(d, full);
    }
    reason = ch?.finish_reason ?? reason;
    if (e.usage) usage = { promptTokens: e.usage.prompt_tokens, outputTokens: e.usage.completion_tokens, totalTokens: e.usage.total_tokens };
  }, LABEL, o.signal);
  if (!full) throw new GeminiEmptyResponseError();
  return { text: full, finishReason: reason ? FINISH[reason] ?? reason.toUpperCase() : 'STOP', usage };
}

const NOT_CHAT = /embed|whisper|tts|dall-e|moderation|davinci|babbage|transcribe|realtime|audio|image|sora|search-preview|computer-use/i;

/** On OpenAI's own endpoint hide models that cannot chat; on other services show everything they list. */
export function parseOpenAiModels(data: { data?: Array<{ id?: string; name?: string }> }, isOpenAiHost: boolean): ModelInfo[] {
  return (data.data ?? [])
    .filter((m): m is { id: string; name?: string } => typeof m.id === 'string' && !!m.id)
    .filter((m) => !isOpenAiHost || !NOT_CHAT.test(m.id))
    .map((m) => ({ id: m.id, displayName: m.name && m.name !== m.id ? `${m.name}` : m.id }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export async function openaiListModels(apiKey: string, baseUrl: string): Promise<ModelInfo[]> {
  const data = await requestJson<{ data?: Array<{ id?: string; name?: string }> }>(
    `${baseUrl}/models`,
    { method: 'GET', headers: openaiHeaders(apiKey) },
    { label: LABEL, timeoutMs: 15_000, retries: 1 },
  );
  return parseOpenAiModels(data, /^https:\/\/api\.openai\.com\//i.test(baseUrl));
}

/** A one-token request is the one check every OpenAI-style server supports. */
export async function openaiTest(apiKey: string, baseUrl: string, model: string, signal?: AbortSignal): Promise<void> {
  const body = { model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 };
  await requestJson<unknown>(
    `${baseUrl}/chat/completions`,
    { method: 'POST', headers: openaiHeaders(apiKey), body: JSON.stringify(body) },
    { label: LABEL, timeoutMs: 20_000, retries: 0, signal, adjust: adjustOpenAiBody },
  );
}
