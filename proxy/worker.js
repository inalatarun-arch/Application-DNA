// Cloudflare Worker that keeps the Gemini API key on the server.
// Settings (Cloudflare dashboard > Worker > Settings > Variables and Secrets):
//   GEMINI_API_KEY   (secret, required)  your Google AI Studio key
//   PROXY_TOKEN      (secret, recommended) any long random string; enter the same value in the app
//   ALLOWED_ORIGINS  (text, required) e.g. https://yourname.github.io  (comma separated; the Pages origin has no path)
const UPSTREAM = 'https://generativelanguage.googleapis.com';

function corsHeaders(origin, allowed) {
  const ok = allowed.includes('*') || allowed.includes(origin);
  return ok
    ? {
        'Access-Control-Allow-Origin': allowed.includes('*') ? '*' : origin,
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      }
    : null;
}

export default {
  async fetch(request, env) {
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, allowed);
    if (!cors) return new Response('Origin not allowed.', { status: 403 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    if (!url.pathname.startsWith('/v1beta/')) return new Response('Not found.', { status: 404, headers: cors });
    if (request.method !== 'GET' && request.method !== 'POST') return new Response('Method not allowed.', { status: 405, headers: cors });
    if (!env.GEMINI_API_KEY) return new Response('The proxy has no GEMINI_API_KEY secret.', { status: 500, headers: cors });
    if (env.PROXY_TOKEN && request.headers.get('Authorization') !== `Bearer ${env.PROXY_TOKEN}`) {
      return new Response('Unauthorized.', { status: 401, headers: cors });
    }

    const upstream = await fetch(`${UPSTREAM}${url.pathname}${url.search}`, {
      method: request.method,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: request.method === 'POST' ? request.body : undefined,
    });
    const headers = new Headers(cors);
    headers.set('Content-Type', upstream.headers.get('Content-Type') || 'application/json');
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
