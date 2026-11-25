const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '..'), source = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
function harness(fetcher, cached = { body: 'cached shell' }) {
  const handlers = {}, timers = new Map(), writes = [];
  const ctx = vm.createContext({ URL, Response, console,
    self: { location: { href: 'https://farmodoro.app/sw.js', origin: 'https://farmodoro.app' }, addEventListener: (name, callback) => { handlers[name] = callback; } },
    caches: { match: async request => typeof cached === 'function' ? cached(request) : cached, open: async name => ({ put: async (request, response) => { writes.push({ name, request, response }); } }) },
    fetch: fetcher,
    setTimeout: (fn, delay) => { timers.set(1, { fn, delay }); return 1; }, clearTimeout: id => timers.delete(id),
  });
  vm.runInContext(source, ctx);
  return { ctx, handlers, timers, writes };
}
test('precache contains only the small shell and exactly matches the current local scripts/styles', () => {
  const h = harness(async () => new Response('ok'));
  const paths = Array.from(vm.runInContext('APP_SHELL', h.ctx));
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const resources = [...html.matchAll(/<(?:link|script)\b[^>]*(?:href|src)="(\.\/[^\"]+)"/g)].map(m => m[1]).filter(p => /\.(css|js)(\?|$)/.test(p));
  for (const resource of resources) assert.ok(paths.includes(resource), resource);
  assert.ok(paths.every(p => !/\.(png|ttf|woff2|mp3)/.test(p)), 'art/font/audio download only on use');
  const bytes = paths.reduce((sum, p) => sum + fs.statSync(path.join(root, p.split('?')[0])).size, 0);
  assert.ok(bytes < 1.5 * 1024 * 1024, `${bytes} bytes`);
  assert.ok([...html.matchAll(/<script\b[^>]*src=[^>]*>/g)].every(m => m[0].includes('defer')));
});
test('slow mobile navigation uses its cached shell after 1.8s and still refreshes the cache', async () => {
  let resolveNetwork;
  const h = harness(() => new Promise(resolve => { resolveNetwork = resolve; }));
  let response, background;
  h.handlers.fetch({ request: { method: 'GET', mode: 'navigate', url: 'https://farmodoro.app/', headers: { has: () => false } },
    respondWith: value => { response = value; }, waitUntil: value => { background = value; } });
  await new Promise(setImmediate);
  assert.equal(h.timers.get(1).delay, 1800);
  h.timers.get(1).fn();
  assert.equal((await response).body, 'cached shell');
  resolveNetwork(new Response('new shell'));
  await background;
  assert.equal(h.writes.length,1);
  assert.equal(await h.writes[0].response.text(),'new shell');
});
test('offline navigation returns the installed shell without a blank screen', async () => {
  const h = harness(async () => { throw Error('offline'); });
  const response = await vm.runInContext('networkFirst({}, {waitUntil(){}})',h.ctx);
  assert.equal(response.body,'cached shell');
  assert.equal(h.timers.size,0);
});

test('public information navigation uses its own cached document and never replaces the app shell', async () => {
  for (const page of ['privacy.html', 'about.html']) {
    let releaseNetwork;
    const h = harness(() => new Promise(resolve => { releaseNetwork = resolve; }),
      request => ({ body: request === `./${page}` ? `cached ${page}` : 'private app shell' }));
    let response, background;
    h.handlers.fetch({ request: { method: 'GET', mode: 'navigate', url: `https://farmodoro.app/${page}?source=google`, headers: { has: () => false } },
      respondWith: value => { response = value; }, waitUntil: value => { background = value; } });
    await new Promise(setImmediate);
    h.timers.get(1).fn();
    assert.equal((await response).body, `cached ${page}`);
    releaseNetwork(new Response(`updated ${page}`));
    await background;
    assert.deepEqual(h.writes.map(write => write.request), [`./${page}`]);
  }
});

test('a missing public page or unrelated document cannot fall back to a logged-in app screen', async () => {
  const h = harness(async () => new Response('Not found', { status: 404 }),
    request => request === './index.html' ? { body: 'private app shell' } : undefined);
  const response = await vm.runInContext('networkFirst({url:"https://farmodoro.app/privacy.html"}, {waitUntil(){}})', h.ctx);
  assert.equal(response.status, 404);
  assert.equal(h.writes.length, 0);
  const unrelated = await vm.runInContext('networkFirst({url:"https://farmodoro.app/another-document.html"}, {waitUntil(){}})', h.ctx);
  assert.equal(unrelated.status, 404);
});
