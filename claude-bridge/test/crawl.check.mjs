import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCrawlUrl, crawlSite, parsePage, scanBundle } from '../src/crawl-site.mjs';
import { checkRepoUrl, digestDir, findDataModels, findRoutes } from '../src/crawl-repo.mjs';
import { createBridge } from '../src/server.mjs';
import { loadConfig } from '../src/config.mjs';

const hits = [];
const PAGES = {
  '/': '<title>Supplier Portal</title><meta name="description" content="Manage suppliers"><h1>Home</h1><nav><a href="/suppliers">Suppliers</a><a href="/logout">Logout</a><a href="https://other.example/x">Out</a><a href="/old">Old</a></nav><button>New</button>',
  '/suppliers': '<title>Suppliers</title><h2>Supplier list</h2><table><tr><th>Name</th><th>Tax ID</th></tr></table><a href="/suppliers/new">Create</a><a href="/secret">Secret</a>',
  '/suppliers/new': '<title>New supplier</title><form action="/api/suppliers" method="post"><label for="n">Supplier name</label><input id="n" name="name" required><input name="taxId" placeholder="Tax ID"><input type="hidden" name="csrf"><select name="country"></select><button>Save</button></form>',
};
let server;
let base;
before(async () => {
  server = http.createServer((req, res) => {
    hits.push(`${req.url} cookie=${req.headers.cookie ?? ''}`);
    if (req.url === '/old') { res.writeHead(302, { Location: 'https://other.example/' }); return res.end(); }
    if (req.url === '/secret') { res.writeHead(403); return res.end('no'); }
    if (req.url === '/robots.txt') { res.setHeader('content-type', 'text/plain'); return res.end('User-agent: *\nDisallow: /private'); }
    if (req.url === '/app.js') { res.setHeader('content-type', 'application/javascript'); return res.end('const r=[{path:"/reports"},{path:"settings/users"}];fetch("/api/orders/list")'); }
    if (PAGES[req.url]) { res.setHeader('content-type', 'text/html'); return res.end(`<html><head><script src="/app.js"></script></head><body>${PAGES[req.url]}</body></html>`); }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('site crawl reads pages, forms, tables, bundle routes; stays on host; skips logout; reports sign-in pages', async () => {
  const r = await crawlSite({ url: `${base}/` });
  assert.match(r.text, /Supplier Portal/);
  assert.match(r.text, /Form POST \/api\/suppliers: Supplier name \[text, required\]; Tax ID \[text\]; country \[select\]/);
  assert.match(r.text, /Table columns: Name \| Tax ID/);
  assert.match(r.text, /- \/reports/);
  assert.match(r.text, /- \/api\/orders\/list/);
  assert.match(r.text, /\/secret: access denied \(403\)/);
  assert.match(r.text, /redirects to another site/);
  assert.ok(!hits.some((h) => h.startsWith('/logout')), 'logout must never be requested');
  assert.equal(r.stats.pages, 3);
});

test('site crawl sends the Cookie only to the target host', async () => {
  hits.length = 0;
  await crawlSite({ url: `${base}/`, headers: { cookie: 'sid=abc' }, maxPages: 2 });
  assert.ok(hits.every((h) => h.endsWith('cookie=sid=abc') || h.startsWith('/robots.txt')));
});

test('address checks refuse unsafe targets', () => {
  assert.throws(() => checkCrawlUrl('file:///etc/passwd'), /Only http/);
  assert.throws(() => checkCrawlUrl('http://169.254.169.254/latest'), /blocked/);
  assert.throws(() => checkCrawlUrl('http://user:pw@example.com'), /username/);
  assert.throws(() => checkRepoUrl('git@github.com:a/b.git'), /https/);
  assert.throws(() => checkRepoUrl('ext::sh -c id'), /https/);
  assert.throws(() => checkRepoUrl('http://github.com/a/b'), /https/);
  assert.equal(checkRepoUrl('https://github.com/a/b/'), 'https://github.com/a/b');
});

test('page parser and bundle scanner', () => {
  const p = parsePage('<h1>A</h1><a href="/x#y">X</a><a href="javascript:void(0)">J</a>', 'http://h/');
  assert.deepEqual(p.links.map((l) => l.url.pathname), ['/x']);
  assert.deepEqual(scanBundle('{path:"/a/:id"}"/api/v1/things"').routes, ['/a/:id']);
});

test('repo digest finds stack, routes, data models and key files', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'eih-fixture-'));
  try {
    await mkdir(path.join(dir, 'src/routes'), { recursive: true });
    await mkdir(path.join(dir, 'node_modules/x'), { recursive: true });
    await writeFile(path.join(dir, 'README.md'), '# Orders service');
    await writeFile(path.join(dir, 'package.json'), '{"dependencies":{"express":"4"}}');
    await writeFile(path.join(dir, 'src/routes/orders.js'), "router.post('/orders', create);\napp.get('/orders/:id', read);");
    await writeFile(path.join(dir, 'schema.sql'), 'CREATE TABLE orders (id int);');
    await writeFile(path.join(dir, 'node_modules/x/ignore.js'), "app.get('/ignored')");
    const d = await digestDir(dir, 'https://github.com/acme/orders');
    assert.match(d.text, /POST \/orders \(src\/routes\/orders\.js\)/);
    assert.match(d.text, /GET \/orders\/:id/);
    assert.match(d.text, /- orders/);
    assert.match(d.text, /express/);
    assert.ok(!d.text.includes('/ignored'));
    assert.equal(d.name, 'crawl-repo-acme-orders.md');
  } finally { await rm(dir, { recursive: true, force: true }); }
  assert.deepEqual(findRoutes('@GetMapping("/x")', 'A.java'), ['GET /x (A.java)']);
  assert.deepEqual(findDataModels('model User {\n}'), ['User']);
});

test('/crawl endpoint: partial success, origin protection, validation', async () => {
  const cfg = loadConfig({ EIH_BRIDGE_PORT: '0', EIH_CLAUDE_BIN: fileURLToPath(new URL('./fake-claude.mjs', import.meta.url)) });
  const b = createBridge(cfg);
  const addr = await b.listen();
  const url = `http://127.0.0.1:${addr.port}/v1/crawl`;
  const post = (body, headers = {}) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const ok = await (await post({ siteUrl: `${base}/`, repoUrl: 'http://not-https/x' })).json();
  assert.equal(ok.files.length, 1);
  assert.equal(ok.errors[0].source, 'repository');
  assert.equal((await post({})).status, 400);
  assert.equal((await post({ siteUrl: `${base}/` }, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await post({ repoUrl: 'ext::x' })).status, 502);
  await b.close();
});
