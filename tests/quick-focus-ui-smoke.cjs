// Browser regression: quick focus has one duration, ends at that duration even
// after suspension, and requires an explicit start for every subsequent session.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'farmodoro-quick-focus-'));
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  .replace(/<script\b[^>]*src="(?:https:[^"]*|\.\/pwa-register\.js[^"]*)"[^>]*>[\s\S]*?<\/script>/gi, '');
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (pathname === '/') { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html); return; }
  const file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  try {
    response.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
    response.end(fs.readFileSync(file));
  } catch { response.writeHead(404).end(); }
});
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
let chrome;
let socket;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-sandbox', '--disable-crash-reporter',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'
  ], { windowsHide: true, stdio: 'ignore' });
  chrome.on('error', error => { throw error; });
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 200 && !fs.existsSync(portFile); attempt++) await pause(50);
  const port = fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0];
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let sequence = 0;
  const pending = new Map();
  const exceptions = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, 10000);
    pending.set(id, message => { clearTimeout(timeout); if (message.error) reject(new Error(JSON.stringify(message.error))); else resolve(message.result); });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    assert.equal(result.exceptionDetails, undefined, JSON.stringify({ evaluation: result.exceptionDetails, runtime: exceptions }));
    return result.result.value;
  };
  const settle = async expression => {
    for (let attempt = 0; attempt < 100; attempt++) { if (await evaluate(expression)) return; await pause(30); }
    assert.fail(`UI did not settle: ${expression}`);
  };
  await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
  await settle('document.readyState === "complete"');
  await evaluate(`
    document.documentElement.className = '';
    document.body.classList.remove('auth-gated');
    document.querySelector('#authGate').hidden = true;
    document.querySelector('.auth-boot')?.remove();
    focusTimerDatabaseUnavailable = true;
    state.tasks = []; state.habits = []; taskDataHydrated = true;
    // The browser runs offline; only the external preferences write is stubbed.
    saveMyFocusSettings = async (mode, minutes) => { window.savedFocusSettings = {mode, minutes}; };
    render(); showPage('focus'); setFocusMode('quick');
  `);
  await evaluate('document.fonts.ready');
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await evaluate("document.querySelector('#toggleFocusSettings').click()");
    assert.deepEqual(await evaluate(`(() => {
      const panel = document.querySelector('#focusSettings');
      const rect = panel.getBoundingClientRect();
      return {
        inputs: [...panel.querySelectorAll('input')].map(input => input.id),
        visible: !panel.classList.contains('hidden'),
        fits: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
        removed: !document.querySelector('#focusSkipBreakButton, #breakEnabledInput, #breakMinutesInput'),
      };
    })()`), { inputs: ['focusMinutesInput'], visible: true, fits: true, removed: true });
    if (process.env.QUICK_FOCUS_CAPTURE === '1') {
      fs.mkdirSync(path.join(root, 'output'), { recursive: true });
      const screenshot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(root, 'output', `quick-focus-settings-${width}.png`), Buffer.from(screenshot.data, 'base64'));
    }
    await evaluate('closeFocusSettings()');
  }
  await evaluate(`
    openFocusSettings(); focusMinutesInput.value = '25';
    document.querySelector('#saveFocusSettings').click();
  `);
  await settle("document.querySelector('#focusSettings').classList.contains('hidden')");
  assert.deepEqual(await evaluate('window.savedFocusSettings'), { mode: 'quick', minutes: 25 });
  assert.deepEqual(await evaluate('state.settings.quick'), { focusMinutes: 25 });
  await evaluate(`
    document.querySelector('#focusButton').click();
    focusLastTickAt -= 23 * 60 * 60 * 1000;
    resumeFocusTimerAfterBackground();
  `);
  assert.deepEqual(await evaluate(`({running:runningFocusMode, started:focusRuntimeByMode.quick.started,
    phase:focusRuntimeByMode.quick.phase, seconds:getPendingFocusSeconds(),
    ready:document.querySelector('#focusButton').textContent.trim(),
    alarm:!document.querySelector('#focusAlertBanner').classList.contains('hidden')})`),
    { running: null, started: false, phase: 'focus', seconds: 1500, ready: '▶ 25분 시작', alarm: true });
  await evaluate('resumeFocusTimerAfterBackground(); resumeFocusTimerAfterBackground()');
  assert.equal(await evaluate('getPendingFocusSeconds()'), 1500);
  await evaluate(`
    document.querySelector('#focusButton').click();
    focusLastTickAt -= 10 * 60 * 1000;
    document.querySelector('#focusButton').click();
    resumeFocusTimerAfterBackground();
  `);
  assert.deepEqual(await evaluate('({running:runningFocusMode, remaining:focusRuntimeByMode.quick.seconds, seconds:getPendingFocusSeconds()})'),
    { running: null, remaining: 900, seconds: 2100 });
  await evaluate(`
    document.querySelector('#focusButton').click();
    focusLastTickAt -= 23 * 60 * 60 * 1000;
    resumeFocusTimerAfterBackground();
  `);
  assert.equal(await evaluate('getPendingFocusSeconds()'), 3000);
  assert.equal(await evaluate('runningFocusMode'), null);
  await evaluate(`
    openFocusSettings(); focusMinutesInput.value = '10';
    document.querySelector('#saveFocusSettings').click();
  `);
  await settle("document.querySelector('#focusSettings').classList.contains('hidden')");
  await evaluate(`
    document.querySelector('#focusButton').click();
    focusLastTickAt -= 10 * 60 * 1000;
    resumeFocusTimerAfterBackground();
    hideFocusAlertBanner();
  `);
  assert.deepEqual(await evaluate('({running:runningFocusMode, seconds:getPendingFocusSeconds(), progress:state.focusRewardSeconds})'),
    { running: null, seconds: 3600, progress: 0 });
  assert.deepEqual(exceptions, [], 'No browser runtime errors');
  console.log('PASS: desktop/mobile duration-only settings; target-limited overnight recovery; completion alarm; manual restart; pause/resume; cumulative 60-minute reward progress.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { socket?.close(); chrome?.kill(); server.close(); });
