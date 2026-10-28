import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { PassThrough } from 'node:stream';
import { loadConfig, resolveModel } from '../src/config.mjs';
import { createBridge } from '../src/server.mjs';
import { parseChatRequest, BridgeError } from '../src/translate.mjs';
import { startMcp } from '../src/mcp.mjs';

const FAKE = fileURLToPath(new URL('./fake-claude.mjs', import.meta.url));
const cfg = loadConfig({ EIH_BRIDGE_PORT: '0', EIH_CLAUDE_BIN: FAKE, EIH_BRIDGE_ORIGINS: 'https://me.github.io', EIH_BRIDGE_TIMEOUT_MS: '2000' });
let bridge;
let base;
before(async () => { bridge = createBridge(cfg); base = `http://127.0.0.1:${(await bridge.listen()).port}/v1`; });
after(() => bridge.close());

const post = (body, headers = {}) => fetch(`${base}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const ask = (content, extra = {}) => post({ model: 'sonnet', messages: [{ role: 'user', content }], ...extra });

test('maps a chat request to one claude call and back', async () => {
  const r = await post({ model: 'opus', max_tokens: 777, messages: [{ role: 'system', content: 'Be brief.' }, { role: 'user', content: 'hello' }] });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.choices[0].finish_reason, 'stop');
  const seen = JSON.parse(j.choices[0].message.content);
  assert.deepEqual({ ...seen }, { prompt: 'hello', system: 'Be brief.', model: 'opus', tools: '', max: '777' });
  assert.equal(j.usage.total_tokens, 14);
});

test('unknown model names fall back to Claude Code default', () => {
  assert.equal(resolveModel('gpt-4o-mini', cfg), '');
  assert.equal(resolveModel('claude-sonnet-5-5', cfg), 'claude-sonnet-5-5');
  assert.equal(resolveModel('sonnet[1m]', cfg), 'sonnet[1m]');
});

test('reports length when the answer hit the output limit', async () => {
  const j = await (await ask('TRUNCATE')).json();
  assert.equal(j.choices[0].finish_reason, 'length');
});

test('streams deltas, a finish chunk, usage and [DONE]', async () => {
  const r = await ask('hi', { stream: true, stream_options: { include_usage: true } });
  assert.match(r.headers.get('content-type'), /event-stream/);
  const events = (await r.text()).split('\n\n').filter(Boolean).map((e) => e.replace(/^data: /, ''));
  assert.equal(events.at(-1), '[DONE]');
  const parsed = events.slice(0, -1).map((e) => JSON.parse(e));
  const text = parsed.map((p) => p.choices[0]?.delta?.content ?? '').join('');
  assert.equal(JSON.parse(text).prompt, 'hi');
  assert.ok(parsed.some((p) => p.choices[0]?.finish_reason === 'stop'));
  assert.equal(parsed.at(-1).usage.completion_tokens, 4);
});

test('multi-turn history and JSON mode reach the prompt and system text', async () => {
  const r = await post({
    model: 'sonnet', response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }, { role: 'user', content: 'c' }],
  });
  const seen = JSON.parse((await r.json()).choices[0].message.content);
  assert.match(seen.prompt, /User:\na\n\nAssistant:\nb\n\nUser:\nc\n\nAssistant:$/);
  assert.match(seen.system, /valid JSON/);
});

test('sign-in and usage-limit failures become typed errors', async () => {
  const a = await ask('FAIL_LOGIN');
  assert.equal(a.status, 401);
  assert.equal((await a.json()).error.code, 'claude_not_signed_in');
  const b = await ask('FAIL_LIMIT');
  assert.equal(b.status, 429);
});

test('a hung claude process is cut off at the timeout', async () => {
  const r = await ask('SLOW');
  assert.equal(r.status, 504);
});

test('rejects foreign sites and bad bodies, allows configured and localhost origins', async () => {
  assert.equal((await fetch(`${base}/models`, { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await fetch(`${base}/models`, { headers: { Origin: 'https://me.github.io' } })).status, 200);
  assert.equal((await fetch(`${base}/models`, { headers: { Origin: 'http://localhost:5173' } })).headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.equal((await ask('x', { messages: [] })).status, 400);
  const bad = await fetch(`${base}/chat/completions`, { method: 'POST', body: '{nope' });
  assert.equal(bad.status, 400);
});

test('token is enforced when configured', async () => {
  const b = createBridge({ ...cfg, token: 'secret-token-123' });
  const addr = await b.listen();
  const url = `http://127.0.0.1:${addr.port}/v1/models`;
  assert.equal((await fetch(url)).status, 401);
  assert.equal((await fetch(url, { headers: { Authorization: 'Bearer secret-token-123' } })).status, 200);
  assert.equal((await fetch(url, { method: 'OPTIONS', headers: { Origin: 'http://localhost:1' } })).status, 204);
  await b.close();
});

test('images must be inline data URLs of a supported type', () => {
  const part = (url) => ({ model: 'x', messages: [{ role: 'user', content: [{ type: 'text', text: 'see' }, { type: 'image_url', image_url: { url } }] }] });
  assert.throws(() => parseChatRequest(part('https://example.com/a.png')), BridgeError);
  assert.throws(() => parseChatRequest(part('data:image/tiff;base64,AAAA')), /not supported/);
  const j = parseChatRequest(part('data:image/png;base64,iVBORw0KGgo='));
  assert.equal(j.images[0].name, 'image-1.png');
  assert.match(j.prompt, /Read tool/);
});

test('oversized system text moves into the prompt', () => {
  const j = parseChatRequest({ messages: [{ role: 'system', content: 'x'.repeat(120_000) }, { role: 'user', content: 'go' }] });
  assert.ok(j.system.length < 200);
  assert.ok(j.prompt.startsWith('<instructions>'));
});

test('MCP: handshake, tool list and status call', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const lines = [];
  output.on('data', (d) => lines.push(...d.toString().split('\n').filter(Boolean).map((l) => JSON.parse(l))));
  const done = startMcp({ input, output, env: { EIH_BRIDGE_PORT: '0', EIH_CLAUDE_BIN: FAKE } });
  const send = (m) => input.write(`${JSON.stringify({ jsonrpc: '2.0', ...m })}\n`);
  send({ id: 1, method: 'initialize', params: {} });
  send({ method: 'notifications/initialized' });
  send({ id: 2, method: 'tools/list' });
  send({ id: 3, method: 'tools/call', params: { name: 'eih_bridge_status', arguments: {} } });
  send({ id: 4, method: 'nope' });
  await new Promise((r) => setTimeout(r, 800));
  input.end();
  await done;
  const by = (id) => lines.find((l) => l.id === id);
  assert.equal(by(1).result.serverInfo.name, 'eih-claude-bridge');
  assert.equal(by(2).result.tools[0].name, 'eih_bridge_status');
  assert.match(by(3).result.content[0].text, /Base URL for the app: http:\/\/127\.0\.0\.1:\d+\/v1/);
  assert.equal(by(4).error.code, -32601);
  assert.equal(lines.length, 4);
});
