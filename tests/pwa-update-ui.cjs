// Real-browser regression for installed PWA updates. Everything is disposable:
// a loopback HTTP fixture, generated service workers, and a fresh Chrome profile.
// 127.0.0.2 is a secure loopback context without the app's local-development bypass.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'farmodoro-pwa-update-'));
let version = 1, chrome, ws, server;

function html() {
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/fixture.css"></head><body>
  <div class="fv-plaza-avatar" style="width:50px;height:50px;background:green"></div>
  <script>
    window.fixtureVersion = ${version};
    sessionStorage.boots = Number(sessionStorage.boots || 0) + 1;
    const nativeNow = Date.now.bind(Date);
    window.clockOffset = 0;
    Date.now = () => nativeNow() + window.clockOffset;
    window.draft = 'initial fixture draft';
    window.flushFarmodoroDataBeforeReload = async () => {
      sessionStorage.flushCalls = Number(sessionStorage.flushCalls || 0) + 1;
      window.flushPending = true;
      if (window.holdFlush) await new Promise(resolve => { window.releaseFlush = resolve; });
      window.flushPending = false;
      if (window.flushResult === false) return false;
      localStorage.savedDraft = window.draft;
      return true;
    };
  </script><script src="/pwa-register.js"></script></body></html>`;
}

function worker() {
  return `const VERSION = ${version}, CACHE = 'farmodoro-pwa-fixture-' + VERSION;
    self.addEventListener('install', event => event.waitUntil((async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(['/', '/fixture.css']);
      await self.skipWaiting();
    })()));
    self.addEventListener('activate', event => event.waitUntil((async () => {
      await Promise.all((await caches.keys()).filter(key => key !== CACHE).map(key => caches.delete(key)));
      await self.clients.claim();
    })()));
    self.addEventListener('fetch', event => event.respondWith((async () => {
      const cached = await (await caches.open(CACHE)).match(event.request);
      return cached || fetch(event.request);
    })()));`;
}

(async () => {
  server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://fixture.test').pathname;
    response.setHeader('Cache-Control', 'no-store');
    if (pathname === '/sw.js') {
      response.setHeader('Content-Type', 'application/javascript');
      response.end(worker());
    } else if (pathname === '/pwa-register.js') {
      response.setHeader('Content-Type', 'application/javascript');
      response.end(fs.readFileSync(path.join(root, 'pwa-register.js')));
    } else if (pathname === '/fixture.css') {
      response.setHeader('Content-Type', 'text/css');
      response.end(`/* fixture version: ${version} */\n.fv-plaza-avatar { animation: ${version > 1 ? 'plaza-hop .3s ease-in-out infinite alternate' : 'none'}; }\n@keyframes plaza-hop { to { transform: translateY(-8px); } }`);
    } else if (pathname === '/') {
      response.setHeader('Content-Type', 'text/html');
      response.end(html());
    } else {
      response.writeHead(204);
      response.end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.2', resolve);
  });
  const url = `http://127.0.0.2:${server.address().port}/`;
  chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-sandbox',
    '--disable-crash-reporter', '--no-proxy-server', '--remote-debugging-port=0',
    `--user-data-dir=${profile}`, 'about:blank',
  ], { cwd: profile, windowsHide: true, stdio: 'ignore' });
  let chromeError;
  chrome.on('error', error => { chromeError = error; });
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 200 && !fs.existsSync(portFile) && !chromeError; i++) await pause(50);
  if (chromeError) throw chromeError;
  assert.ok(fs.existsSync(portFile), 'Chrome exposes its debugging port');
  const port = fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0];
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  let sequence = 0;
  const pending = new Map(), exceptions = [];
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') {
      exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    }
    pending.get(message.id)?.(message);
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timeout = setTimeout(() => { pending.delete(id); reject(Error('Timeout ' + method)); }, 15000);
    pending.set(id, message => {
      clearTimeout(timeout);
      pending.delete(id);
      message.error ? reject(Error(JSON.stringify(message.error))) : resolve(message.result);
    });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, replMode: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const settle = async (predicate, label) => {
    let lastError;
    for (let i = 0; i < 400; i++) {
      try { if (await evaluate(predicate)) return; } catch (error) { lastError = error; }
      await pause(25);
    }
    assert.fail(`${label}: ${predicate}\n${lastError || ''}\n${exceptions.join('\n')}`);
  };
  const foreground = () => evaluate("clockOffset += 61001; window.dispatchEvent(new Event('focus')); true");
  const boots = () => evaluate('Number(sessionStorage.boots)');
  const flushCalls = () => evaluate('Number(sessionStorage.flushCalls || 0)');

  await call('Runtime.enable');
  await call('Page.enable');
  await call('Page.navigate', { url });
  await settle('isSecureContext && !!navigator.serviceWorker.controller', 'first worker claims the page');
  await pause(250);
  assert.equal(await boots(), 1, 'first install does not flash/reload the page');
  assert.equal(await flushCalls(), 0, 'first install does not flush or disturb current work');
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.fv-plaza-avatar')).animationName"), 'none');
  assert.deepEqual(await evaluate('await caches.keys()'), ['farmodoro-pwa-fixture-1']);

  version = 2;
  await foreground();
  await settle('window.fixtureVersion === 2 && Number(sessionStorage.boots) === 2', 'foreground installs current cached app');
  assert.equal(await flushCalls(), 1, 'update saves data once before reload');
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.fv-plaza-avatar')).animationName"), 'plaza-hop');
  const startTransform = await evaluate("getComputedStyle(document.querySelector('.fv-plaza-avatar')).transform");
  await pause(100);
  assert.notEqual(await evaluate("getComputedStyle(document.querySelector('.fv-plaza-avatar')).transform"), startTransform, 'updated plaza avatar actually moves');
  assert.deepEqual(await evaluate('await caches.keys()'), ['farmodoro-pwa-fixture-2']);
  assert.match(await evaluate("await (await (await caches.open('farmodoro-pwa-fixture-2')).match('/fixture.css')).text()"), /fixture version: 2/);

  // An update may finish while an app save is still queued. It must wait, and
  // a failed save must stay retryable even inside the foreground-check throttle.
  version = 3;
  await evaluate("window.draft = 'queued fixture draft'; window.flushResult = false; window.holdFlush = true");
  await foreground();
  await settle('window.flushPending === true', 'update waits for the pending save');
  assert.equal(await boots(), 2);
  assert.equal(await flushCalls(), 2);
  await evaluate("window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('pageshow')); true");
  await pause(100);
  assert.equal(await flushCalls(), 2, 'foreground events share the in-flight save');
  assert.equal(await boots(), 2, 'pending save prevents reload');
  await evaluate('window.releaseFlush(); true');
  await settle('window.flushPending === false', 'failed save finishes');
  await pause(100);
  assert.equal(await boots(), 2, 'failed save blocks reload');
  assert.equal(await evaluate('localStorage.savedDraft'), 'initial fixture draft', 'unsaved draft was not reported saved');
  await evaluate("window.flushResult = true; window.dispatchEvent(new Event('focus')); true");
  await settle('window.flushPending === true', 'next foreground retries pending reload without waiting a minute');
  assert.equal(await flushCalls(), 3);
  await evaluate("window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('online')); true");
  await pause(100);
  assert.equal(await flushCalls(), 3, 'retry also saves only once');
  assert.equal(await boots(), 2, 'retry waits until save resolves');
  await evaluate('window.releaseFlush(); true');
  await settle('window.fixtureVersion === 3 && Number(sessionStorage.boots) === 3', 'successful retry loads new app');
  assert.equal(await evaluate('localStorage.savedDraft'), 'queued fixture draft', 'queued app data survives reload');
  assert.equal(await flushCalls(), 3);
  assert.deepEqual(await evaluate('await caches.keys()'), ['farmodoro-pwa-fixture-3']);
  assert.deepEqual(exceptions, []);
  console.log('PASS: PWA first install avoids reload; foreground upgrades real cached CSS and animates the plaza; pending/failed saves block reload and retry once without losing queued data.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  ws?.close();
  if (chrome && chrome.exitCode === null) {
    const stopped = new Promise(resolve => chrome.once('exit', resolve));
    chrome.kill();
    await Promise.race([stopped, pause(3000)]);
  }
  if (server) await new Promise(resolve => server.close(resolve));
  // Only the newly generated fixture profile is eligible for recursive cleanup.
  const resolved = path.resolve(profile), tempRoot = path.resolve(os.tmpdir()) + path.sep;
  assert.ok(resolved.startsWith(tempRoot) && path.basename(resolved).startsWith('farmodoro-pwa-update-'));
  fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});
