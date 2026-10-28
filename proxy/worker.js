// Cloudflare Worker that keeps the Gemini API key on the server.
// Settings (Cloudflare dashboard > Worker > Settings > Variables and Secrets):
//   GEMINI_API_KEY   (secret, required)  your Google AI Studio key
//   PROXY_TOKEN      (secret, required)  a long random string (32+ characters); enter the same value in the app
//   ALLOWED_ORIGINS  (text, required)    e.g. https://yourname.github.io  (comma separated; the Pages origin has no path)
//
// What it allows: only the calls the app makes (list models, read one model, generateContent,
// streamGenerateContent, countTokens), only from the listed origins, only with the token, and only for
// request bodies up to MAX_BODY_BYTES. Everything else (file upload, tuned models, delete) is refused.
const UPSTREAM = 'https://generativelanguage.googleapis.com';
const MAX_BODY_BYTES = 25 * 1024 * 1024; // the app caps uploads at 12 MB; base64 adds about a third
const MIN_TOKEN_LENGTH = 24;

// /v1beta/models  |  /v1beta/models/{model}  |  /v1beta/models/{model}:generateContent (and the two other verbs)
const PATH = /^\/v1beta\/models(?:\/[A-Za-z0-9._-]+(?::(?:generateContent|streamGenerateContent|countTokens))?)?$/;
// Query parameters the app uses. Anything else (notably "key") is dropped.
const QUERY_ALLOWED = new Set(['alt', 'pageSize', 'pageToken']);

function corsHeaders(origin, allowed) {
  // A wildcard is deliberately not supported: it would let any website use the key if the token leaked.
  if (!origin || !allowed.includes(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

// Compares two strings without leaking, through timing, how many leading characters matched.
async function safeEqual(a, b) {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const x = new Uint8Array(da);
  const y = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

const text = (body, status, headers) => new Response(body, { status, headers });

export default {
  async fetch(request, env) {
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter((s) => s && s !== '*');
    const cors = corsHeaders(request.headers.get('Origin') || '', allowed);
    if (!cors) return text('Origin not allowed.', 403);
    if (request.method === 'OPTIONS') return text(null, 204, cors);

    if (!env.GEMINI_API_KEY) return text('The proxy has no GEMINI_API_KEY secret.', 500, cors);
    if (!env.PROXY_TOKEN || env.PROXY_TOKEN.length < MIN_TOKEN_LENGTH) {
      return text('The proxy is not set up: add a PROXY_TOKEN secret of at least 24 characters.', 500, cors);
    }
    const supplied = (request.headers.get('Authorization') || '').replace(/^Bearer /, '');
    if (!(await safeEqual(supplied, env.PROXY_TOKEN))) return text('Unauthorized.', 401, cors);

    if (request.method !== 'GET' && request.method !== 'POST') return text('Method not allowed.', 405, cors);
    const url = new URL(request.url);
    if (!PATH.test(url.pathname)) return text('Not found.', 404, cors);

    let body;
    if (request.method === 'POST') {
      const length = Number(request.headers.get('Content-Length'));
      if (!Number.isFinite(length) || length <= 0) return text('Content-Length is required.', 411, cors);
      if (length > MAX_BODY_BYTES) return text('Request is too large.', 413, cors);
      body = request.body;
    }

    const query = new URLSearchParams();
    for (const [k, v] of url.searchParams) if (QUERY_ALLOWED.has(k)) query.append(k, v);
    const qs = query.toString();

    const upstream = await fetch(`${UPSTREAM}${url.pathname}${qs ? `?${qs}` : ''}`, {
      method: request.method,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body,
    });
    const headers = new Headers(cors);
    headers.set('Content-Type', upstream.headers.get('Content-Type') || 'application/json');
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
