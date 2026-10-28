/** OpenAI chat-completions request/response shapes <-> what one `claude -p` call needs. */
import { Buffer } from 'node:buffer';

export class BridgeError extends Error {
  constructor(status, message, type = 'invalid_request_error', code = undefined) {
    super(message);
    this.status = status;
    this.type = type;
    this.code = code;
  }
}

const IMAGE_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
// Linux limits one argument to 128 KB; anything larger travels in the prompt instead.
const MAX_SYSTEM_ARG = 100_000;

function partsOf(content) {
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  if (Array.isArray(content)) return content;
  if (content == null) return [];
  throw new BridgeError(400, 'Message content must be a string or an array of parts.');
}

function parseDataUrl(url) {
  const m = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(url ?? '');
  if (!m) throw new BridgeError(400, 'Images must be sent inline as base64 data URLs. Remote image URLs are not fetched.');
  const ext = IMAGE_EXT[m[1].toLowerCase()];
  if (!ext) throw new BridgeError(400, `Image type ${m[1]} is not supported. Use PNG, JPEG, GIF or WebP.`);
  return { ext, data: Buffer.from(m[2].replace(/\s/g, ''), 'base64') };
}

const JSON_RULE = 'Reply with one valid JSON value and nothing else: no markdown fences, no commentary before or after.';

/**
 * Turns an OpenAI request body into { system, prompt, images, model, maxTokens, stream }.
 * `images` are { name, data } the engine writes to a private folder so Claude Code can open them.
 */
export function parseChatRequest(body) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.messages) || !body.messages.length) {
    throw new BridgeError(400, '`messages` must be a non-empty array.');
  }
  const system = [];
  const turns = [];
  const images = [];
  for (const m of body.messages) {
    const role = m?.role;
    const text = [];
    for (const p of partsOf(m?.content)) {
      if (p?.type === 'text' && typeof p.text === 'string') text.push(p.text);
      else if (p?.type === 'image_url') {
        const { ext, data } = parseDataUrl(typeof p.image_url === 'string' ? p.image_url : p.image_url?.url);
        const name = `image-${images.length + 1}.${ext}`;
        images.push({ name, data });
        text.push(`[Attached image: ${name}]`);
      }
    }
    const joined = text.join('\n\n').trim();
    if (!joined) continue;
    if (role === 'system' || role === 'developer') system.push(joined);
    else if (role === 'user' || role === 'assistant') turns.push({ role, text: joined });
    else throw new BridgeError(400, `Unsupported message role "${role}".`);
  }
  if (!turns.length) throw new BridgeError(400, 'At least one user message is required.');

  const rf = body.response_format?.type;
  if (rf === 'json_object' || rf === 'json_schema') {
    const schema = body.response_format.json_schema?.schema;
    system.push([JSON_RULE, schema ? `Follow this JSON Schema:\n${JSON.stringify(schema)}` : ''].filter(Boolean).join('\n'));
  }

  let prompt;
  if (turns.length === 1) prompt = turns[0].text;
  else {
    const history = turns.map((t) => `${t.role === 'user' ? 'User' : 'Assistant'}:\n${t.text}`).join('\n\n');
    prompt = `Below is a conversation. Reply only with the next Assistant message, with no "Assistant:" label.\n\n${history}\n\nAssistant:`;
  }
  if (images.length) {
    prompt += `\n\nThe attached images are files in the current folder (${images.map((i) => i.name).join(', ')}). Open each one with the Read tool before answering.`;
  }

  let systemText = system.join('\n\n');
  if (systemText.length > MAX_SYSTEM_ARG) {
    prompt = `<instructions>\n${systemText}\n</instructions>\n\n${prompt}`;
    systemText = 'Follow the instructions given at the start of the user message.';
  }

  const mt = Number(body.max_completion_tokens ?? body.max_tokens);
  return {
    system: systemText,
    prompt,
    images,
    model: typeof body.model === 'string' ? body.model : '',
    maxTokens: Number.isInteger(mt) && mt > 0 ? mt : undefined,
    stream: body.stream === true,
    includeUsage: body.stream_options?.include_usage === true,
  };
}

const FINISH = { max_tokens: 'length', refusal: 'content_filter' };
export const finishReason = (stopReason) => FINISH[stopReason] ?? 'stop';

export function usageOf(u) {
  if (!u) return undefined;
  const prompt = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
  const completion = u.output_tokens ?? 0;
  return { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion };
}

export function completion({ id, model, text, stopReason, usage }) {
  return {
    id,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: finishReason(stopReason) }],
    ...(usage ? { usage } : {}),
  };
}

export function chunk({ id, model, delta, finish, usage }) {
  return {
    id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: finish === undefined && usage ? [] : [{ index: 0, delta: delta ?? {}, finish_reason: finish ?? null }],
    ...(usage ? { usage } : {}),
  };
}

export const errorBody = (e) => ({ error: { message: e.message, type: e.type ?? 'api_error', code: e.code ?? null } });
