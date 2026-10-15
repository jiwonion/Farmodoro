const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'pwa-register.js'), 'utf8');

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function harness({ hostname = 'farmodoro.app', controlled = true, supported = true, session = new Map() } = {}) {
  const handlers = new Map();
  const target = prefix => ({ addEventListener(name, callback) { handlers.set(`${prefix}:${name}`, callback); } });
  const calls = { register: [], updates: 0, reloads: 0, flushes: 0, warnings: [], unregisters: 0, deleted: [] };
  let now = 1000;
  let update = async () => {};
  let register = async () => registration;
  const registration = { update: () => { calls.updates++; return update(); }, unregister: async () => { calls.unregisters++; } };
  const serviceWorker = {
    ...target('worker'),
    controller: controlled ? {} : null,
    register: (...args) => { calls.register.push(args); return register(); },
    getRegistrations: async () => controlled ? [registration] : [],
  };
  const navigator = { onLine: true, ...(supported ? { serviceWorker } : {}) };
  const document = { ...target('document'), visibilityState: 'visible' };
  const caches = { keys: async () => ['farmodoro-old-app', 'farmodoro-old-runtime', 'another-app'], delete: async name => { calls.deleted.push(name); } };
  const window = { ...target('window'), location: { hostname, reload: () => { calls.reloads++; } }, caches };
  vm.runInNewContext(source, { navigator, document, window, caches,
    sessionStorage: { getItem: key => session.get(key), setItem: (key, value) => session.set(key, value), removeItem: key => session.delete(key) },
    Date: { now: () => now }, console: { warn: (...args) => { calls.warnings.push(args); } },
  });
  return { calls, navigator, document, window, handlers, session,
    advance: ms => { now += ms; },
    setUpdate: callback => { update = callback; },
    setRegister: callback => { register = callback; },
    setFlush: callback => { window.flushFarmodoroDataBeforeReload = () => { calls.flushes++; return callback(); }; },
    emit: (name, prefix = 'window') => Promise.resolve(handlers.get(`${prefix}:${name}`)?.({ type: name })),
    changeController: () => { serviceWorker.controller = {}; return Promise.resolve(handlers.get('worker:controllerchange')?.()); },
  };
}

test('registers without HTTP cache and checks foreground updates at most once a minute', async () => {
  const h = harness();
  await h.emit('load');
  assert.equal(h.calls.register.length, 1);
  assert.equal(h.calls.register[0][0], './sw.js');
  assert.equal(h.calls.register[0][1].updateViaCache, 'none');
  await h.emit('pageshow');
  await h.emit('focus');
  assert.equal(h.calls.updates, 0);
  h.advance(61000);
  h.document.visibilityState = 'hidden';
  await h.emit('visibilitychange', 'document');
  await h.emit('focus');
  assert.equal(h.calls.updates, 0);
  h.document.visibilityState = 'visible';
  await h.emit('visibilitychange', 'document');
  await h.emit('pageshow');
  await h.emit('focus');
  assert.equal(h.calls.updates, 1);
  h.advance(60000);
  await h.emit('pageshow');
  h.advance(60000);
  await h.emit('focus');
  assert.equal(h.calls.updates, 3);
  await h.emit('online');
  assert.equal(h.calls.updates, 4, 'reconnection bypasses the throttle');
});

test('deduplicates in-flight update checks and recovers from update or registration failure', async () => {
  const h = harness();
  await h.emit('load');
  const pending = deferred();
  h.setUpdate(() => pending.promise);
  h.advance(61000);
  const foreground = h.emit('focus');
  const duplicate = h.emit('pageshow');
  const online = h.emit('online');
  await Promise.resolve();
  assert.equal(h.calls.updates, 1);
  pending.resolve();
  await Promise.all([foreground, duplicate, online]);
  h.setUpdate(async () => { throw new Error('network unavailable'); });
  await h.emit('online');
  assert.equal(h.calls.warnings.length, 1);
  h.setUpdate(async () => {});
  await h.emit('online');
  assert.equal(h.calls.updates, 3);

  const registrationFailure = harness();
  registrationFailure.setRegister(async () => { throw new Error('offline'); });
  await registrationFailure.emit('load');
  assert.equal(registrationFailure.calls.warnings.length, 1);
  registrationFailure.setRegister(async () => ({ update: async () => {} }));
  await registrationFailure.emit('online');
  assert.equal(registrationFailure.calls.register.length, 2);
});

test('offline startup retries registration on reconnect', async () => {
  const h = harness();
  h.navigator.onLine = false;
  await h.emit('load');
  await h.emit('focus');
  assert.equal(h.calls.register.length, 0);
  h.navigator.onLine = true;
  await h.emit('online');
  assert.equal(h.calls.register.length, 1);
});

test('first installation claims the page without reload; the next controller updates it', async () => {
  const h = harness({ controlled: false });
  await h.emit('load');
  await h.changeController();
  assert.equal(h.calls.reloads, 0);
  await h.changeController();
  assert.equal(h.calls.reloads, 1);
});

test('awaits pending data flush and reloads once despite overlapping controller events', async () => {
  const h = harness();
  const saved = deferred();
  h.setFlush(() => saved.promise);
  const change = h.changeController();
  await h.changeController();
  await h.emit('focus');
  assert.equal(h.calls.flushes, 1);
  assert.equal(h.calls.reloads, 0);
  saved.resolve(true);
  await change;
  await h.emit('pageshow');
  assert.equal(h.calls.reloads, 1);
});

test('a hidden controller update waits until foreground before flushing or reloading', async () => {
  const h = harness();
  h.setFlush(async () => true);
  h.document.visibilityState = 'hidden';
  await h.changeController();
  assert.equal(h.calls.flushes, 0);
  assert.equal(h.calls.reloads, 0);
  h.document.visibilityState = 'visible';
  await h.emit('visibilitychange', 'document');
  assert.equal(h.calls.flushes, 1);
  assert.equal(h.calls.reloads, 1);
});

test('if the app hides during a flush it retains the pending update for next foreground', async () => {
  const h = harness();
  const saved = deferred();
  h.setFlush(() => saved.promise);
  const change = h.changeController();
  h.document.visibilityState = 'hidden';
  saved.resolve(true);
  await change;
  assert.equal(h.calls.reloads, 0);
  h.document.visibilityState = 'visible';
  h.setFlush(async () => true);
  await h.emit('pageshow');
  assert.equal(h.calls.reloads, 1);
});

test('unsaved or rejected flushes defer reload and retry on foreground even within update throttle', async () => {
  const h = harness();
  await h.emit('load');
  h.setFlush(async () => false);
  await h.changeController();
  assert.equal(h.calls.reloads, 0);
  h.setFlush(async () => { throw new Error('save failed'); });
  await h.emit('focus');
  assert.equal(h.calls.reloads, 0);
  assert.equal(h.calls.warnings.length, 1);
  h.setFlush(async () => true);
  await h.emit('pageshow');
  assert.equal(h.calls.flushes, 3);
  assert.equal(h.calls.reloads, 1);
  assert.equal(h.calls.updates, 0);
});

test('localhost still unregisters workers and clears only Farmodoro caches with one reload', async () => {
  const h = harness({ hostname: '127.0.0.1' });
  await h.emit('load');
  assert.equal(h.calls.unregisters, 1);
  assert.deepEqual(h.calls.deleted, ['farmodoro-old-app', 'farmodoro-old-runtime']);
  assert.equal(h.calls.reloads, 1);
  assert.equal(h.calls.register.length, 0);
  assert.equal(h.handlers.has('window:focus'), false);
  const secondLoad = harness({ hostname: 'localhost', session: h.session });
  await secondLoad.emit('load');
  assert.equal(secondLoad.calls.reloads, 0);
  assert.equal(secondLoad.session.has('farmodoro-local-cache-cleared'), false);
});

test('unsupported browsers leave the page alone', async () => {
  const h = harness({ supported: false });
  await h.emit('load');
  assert.equal(h.calls.register.length, 0);
  assert.equal(h.handlers.size, 0);
});
