const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'mobile-orientation.js'), 'utf8');
function harness({ mobile = true, coarse = true, supported = true, rejected = false } = {}) {
  const calls = [], handlers = {};
  const orientation = supported ? {
    lock: async value => { calls.push(value); if (rejected) throw new Error('Fullscreen required'); },
    addEventListener: (name, callback) => { handlers['orientation:' + name] = callback; },
  } : {};
  const document = { visibilityState: 'visible', addEventListener: (name, callback) => { handlers[name] = callback; } };
  vm.runInNewContext(source, { screen: { orientation }, navigator: { userAgentData: { mobile } }, document,
    window: { matchMedia: () => ({ matches: coarse }), addEventListener: (name, callback) => { handlers[name] = callback; } } });
  return { calls, handlers, document };
}
test('installed app requests upright portrait; mobile retries on fullscreen, resume and rotation', async () => {
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8')).orientation, 'portrait-primary');
  const h = harness();
  assert.deepEqual(h.calls, ['portrait-primary']);
  await h.handlers.fullscreenchange();
  await h.handlers.pageshow();
  await h.handlers['orientation:change']();
  h.document.visibilityState = 'hidden'; h.handlers.visibilitychange();
  assert.equal(h.calls.length, 4);
  h.document.visibilityState = 'visible'; h.handlers.visibilitychange();
  assert.deepEqual(h.calls, Array(5).fill('portrait-primary'));
});
test('touch browsers without user-agent mobile detection still request portrait', () => {
  assert.deepEqual(harness({ mobile: false, coarse: true }).calls, ['portrait-primary']);
});
test('desktop, unsupported APIs and browser rejection leave controls usable', async () => {
  assert.deepEqual(harness({ mobile: false, coarse: false }).calls, []);
  const unsupported = harness({ supported: false });
  await unsupported.handlers.fullscreenchange();
  const rejected = harness({ rejected: true });
  await rejected.handlers.fullscreenchange();
  await rejected.handlers.pageshow();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(rejected.calls, Array(3).fill('portrait-primary'));
});
