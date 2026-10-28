/** HTTP server: an OpenAI-compatible /v1 API on localhost that the browser app can use as its AI provider. */
import http from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { MODELS, resolveModel } from './config.mjs';
import { claudeVersion, runClaude } from './engine.mjs';
import { BridgeError, chunk, completion, errorBody, finishReason, parseChatRequest, usageOf } from './translate.mjs';

const MAX_WAITING = 50;
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

/** Counts running jobs and holds the rest in line, so a burst of app requests cannot start dozens of processes. */
class Gate {
  constructor(limit) { this.limit = limit; this.active = 0; this.waiting = []; }
  async enter(signal) {
    if (this.active < this.limit) { this.active++; return; }
    if (this.waiting.length >= MAX_WAITING) throw new BridgeError(429, 'The bridge is busy. Try again in a moment.', 'rate_limit_error', 'busy');
    await new Promise((resolve, reject) => {
      const w = { resolve, reject };
      this.waiting.push(w);
      signal?.addEventListener('abort', () => {
        this.waiting = this.waiting.filter((x) => x !== w);
        reject(new BridgeError(499, 'Request cancelled.'));
      }, { once: true });
    });
  }
  leave() {
    const next = this.waiting.shift();
    if (next) next.resolve();
    else this.active--;
  }
}

export function createBridge(cfg, log = () => undefined) {
  const gate = new Gate(cfg.concurrency);
  const stats = { requests: 0, failures: 0, startedAt: Date.now() };
  const allowedOrigin = (o) => LOCAL_ORIGIN.test(o) || cfg.origins.includes(o);

  function authorised(req) {
    if (!cfg.token) return true;
    const m = /^Bearer (.+)$/i.exec(req.headers.authorization ?? '');
    const a = Buffer.from(m?.[1] ?? '');
    const b = Buffer.from(cfg.token);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  function send(res, status, body, headers = {}) {
    const text = JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text), ...headers });
    res.end(text);
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const parts = [];
      req.on('data', (d) => {
        size += d.length;
        if (size > cfg.maxBodyBytes) { reject(new BridgeError(413, 'Request is too large.')); req.destroy(); return; }
        parts.push(d);
      });
      req.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(parts).toString('utf8') || '{}')); }
        catch { reject(new BridgeError(400, 'Request body is not valid JSON.')); }
      });
      req.on('error', reject);
    });
  }

  async function chat(req, res, cors) {
    const body = await readBody(req);
    const job = parseChatRequest(body);
    job.model = resolveModel(job.model, cfg);
    const id = `chatcmpl-${randomUUID()}`;
    const modelName = job.model || 'claude';
    const ac = new AbortController();
    res.on('close', () => { if (!res.writableEnded) ac.abort(); });
    stats.requests++;
    await gate.enter(ac.signal);
    let started = false;
    const sse = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
    const begin = () => {
      if (started) return;
      started = true;
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', ...cors });
      sse(chunk({ id, model: modelName, delta: { role: 'assistant', content: '' } }));
    };
    try {
      const r = await runClaude(cfg, job, {
        signal: ac.signal,
        onText: job.stream ? (d) => { begin(); sse(chunk({ id, model: modelName, delta: { content: d } })); } : undefined,
      });
      const usage = usageOf(r.usage);
      if (!job.stream) return send(res, 200, completion({ id, model: r.model ?? modelName, text: r.text, stopReason: r.stopReason, usage }), cors);
      begin();
      sse(chunk({ id, model: modelName, delta: {}, finish: finishReason(r.stopReason) }));
      if (job.includeUsage && usage) sse(chunk({ id, model: modelName, usage }));
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (err) {
      stats.failures++;
      if (started) {
        // Headers are gone, so report the failure inside the stream.
        sse(errorBody(err instanceof BridgeError ? err : new BridgeError(502, String(err?.message ?? err))));
        res.end();
      } else throw err;
    } finally {
      gate.leave();
    }
  }

  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    // Only an allowed site gets CORS headers, so a refused page cannot even read the refusal.
    const cors = origin && allowedOrigin(origin) ? {
      'Access-Control-Allow-Origin': origin,
      Vary: 'Origin',
      'Access-Control-Allow-Private-Network': 'true',
    } : {};
    try {
      // A page on another site cannot read localhost through a DNS-rebinding trick if the Host header is checked.
      if (!LOCAL_HOST.test(req.headers.host ?? '')) throw new BridgeError(403, 'Requests must be made to localhost.', 'permission_error');
      // Browsers label cross-site requests; refuse them even when a header is missing (defence in depth).
      if (!origin && req.headers['sec-fetch-site'] === 'cross-site') throw new BridgeError(403, 'Cross-site requests are not allowed.', 'permission_error', 'origin_not_allowed');
      if (origin && !allowedOrigin(origin)) {
        throw new BridgeError(403, `The site ${origin} is not allowed to use this bridge. Start the bridge with EIH_BRIDGE_ORIGINS=${origin}`, 'permission_error', 'origin_not_allowed');
      }
      const url = new URL(req.url ?? '/', 'http://localhost');
      const route = url.pathname.replace(/^\/v1(?=\/)/, '').replace(/\/+$/, '') || '/';

      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          ...cors,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'authorization, content-type, accept',
          'Access-Control-Max-Age': '600',
        });
        return res.end();
      }
      if (!authorised(req)) throw new BridgeError(401, 'Wrong or missing bridge token. Enter the EIH_BRIDGE_TOKEN value as the API key.', 'authentication_error', 'invalid_api_key');

      if (req.method === 'GET' && route === '/health') {
        return send(res, 200, { ok: true, active: gate.active, queued: gate.waiting.length, ...stats, claude: await claudeVersion(cfg) }, cors);
      }
      if (req.method === 'GET' && route === '/models') {
        return send(res, 200, { object: 'list', data: MODELS.map((m) => ({ id: m.id, object: 'model', created: 0, owned_by: 'claude-code', name: m.name, description: m.description })) }, cors);
      }
      if (req.method === 'POST' && route === '/chat/completions') return await chat(req, res, cors);
      throw new BridgeError(404, `No such endpoint: ${req.method} ${url.pathname}`, 'invalid_request_error', 'not_found');
    } catch (err) {
      const e = err instanceof BridgeError ? err : new BridgeError(500, String(err?.message ?? err), 'api_error');
      log(`${req.method} ${req.url} -> ${e.status} ${e.message}`);
      if (!res.headersSent) send(res, e.status, errorBody(e), cors);
      else res.end();
    }
  });

  return {
    server,
    stats,
    gate,
    listen: () => new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(cfg.port, cfg.host, () => { server.off('error', reject); resolve(server.address()); });
    }),
    close: () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(() => resolve()); }),
  };
}
