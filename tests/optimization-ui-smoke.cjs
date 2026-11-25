// Local-only browser fixture: exercise real checkpoint/save/reload/form paths.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const http = require('node:http'), os = require('node:os'), { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const capture = process.env.OPTIMIZATION_CAPTURE_DIR || path.join(root, 'output/optimization-review');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'farmodoro-optimization-'));
function fixture() {
  const empty = () => ({ groups: [], tasks: [], habits: [], habitRecords: [], recurringTasks: [], schedulingVersion: 1 });
  window.testRead = () => JSON.parse(localStorage.getItem(`test-server:${activeAuthUser.id}`) || JSON.stringify(empty()));
  window.testWrite = data => localStorage.setItem(`test-server:${activeAuthUser.id}`, JSON.stringify(data));
  const client = {
    auth: { getSession: () => new Promise(() => {}), onAuthStateChange: () => {} },
    rpc: async (name, params) => {
      if (name === 'get_my_productivity_state') return { data: testRead() };
      if (name === 'save_my_recurring_task') {
        if (window.failWrites) return { error: { code: 'offline' } };
        const data = testRead();
        if (!data.recurringTasks.some(rule => rule.id === params.p_id)) data.recurringTasks.push({ id: params.p_id,
          title: params.p_title, frequency: params.p_frequency, weekdays: params.p_weekdays,
          month_day: params.p_month_day, start_date: params.p_start_date, end_date: params.p_end_date, active: true });
        testWrite(data); return { data: null };
      }
      if (name === 'log_my_sync_events') { window.uploadedLogs = params.p_events; return { data: null }; }
      return { data: {} };
    },
    from: table => {
      const name = { task_groups: 'groups', tasks: 'tasks', habits: 'habits', habit_daily_records: 'habitRecords' }[table];
      const fail = () => window.failWrites ? { error: { code: 'offline', message: 'fixture offline' } } : null;
      return {
        async upsert(rows) {
          if (fail()) return fail();
          const data = testRead();
          for (const row of rows) {
            const before = data[name].find(item => item.id === row.id);
            if (before) Object.assign(before, row);
            else data[name].push({ status: 'waiting', focus_seconds: 0, completion_reward: 0, ...row });
          }
          testWrite(data); return { error: null };
        },
        update(changes) {
          const filters = [];
          const query = { eq(key, value) { filters.push([key, value]); return query; },
            then(resolve) {
              if (fail()) return Promise.resolve(fail()).then(resolve);
              const data = testRead();
              data[name].filter(row => filters.every(([key, value]) => row[key] === value)).forEach(row => Object.assign(row, changes));
              testWrite(data); return Promise.resolve({ error: null }).then(resolve);
            } };
          return query;
        },
      };
    },
  };
  window.supabase = { createClient: () => client };
  window.fixtureGoogleRequests = [];
  window.google = { accounts: { oauth2: {
    hasGrantedAllScopes: (response, ...scopes) => scopes.every(scope => response.scope.split(' ').includes(scope)),
    initTokenClient(config) { return { requestAccessToken() {
      setTimeout(() => { void config.callback({ access_token: 'google-fixture-token', expires_in: 3600, scope: config.scope }); }, 0);
    } }; },
  } } };
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(String(input), location.href);
    if (url.origin !== 'https://www.googleapis.com') return nativeFetch(input, init);
    fixtureGoogleRequests.push({ url: url.href, method: init?.method || 'GET' });
    return { ok: true, json: async () => ({ items: url.pathname.endsWith('/calendarList')
      ? [{ id: 'fixture-primary', summary: 'Personal', primary: true, accessRole: 'owner' }]
      : [{ id: 'meeting', summary: 'Google meeting', start: { dateTime: `${toProductivityDateString()}T09:00:00+09:00` }, end: { dateTime: `${toProductivityDateString()}T10:00:00+09:00` }, htmlLink: 'https://calendar.google.com/calendar/event?eid=fixture' }],
    }) };
  };
}
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  .replace(/<script\b[^>]*src="(?:https:[^"]*|\.\/pwa-register\.js[^"]*)"[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace('</head>', '<script src="/fixture-client.js"></script></head>');
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (pathname === '/') { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html); return; }
  if (pathname === '/fixture-client.js') { response.setHeader('Content-Type', 'text/javascript; charset=utf-8'); response.end(`(${fixture.toString()})();`); return; }
  const file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  try { response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream'); response.end(fs.readFileSync(file)); }
  catch { response.writeHead(404).end(); }
});
let chrome, socket;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-sandbox', '--disable-crash-reporter',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { windowsHide: true, stdio: 'ignore' });
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let n = 0; n < 200 && !fs.existsSync(portFile); n++) await pause(50);
  const port = fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0];
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let sequence = 0; const pending = new Map(), exceptions = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence, timeout = setTimeout(() => reject(Error(method)), 10000);
    pending.set(id, message => { clearTimeout(timeout); message.error ? reject(Error(JSON.stringify(message.error))) : resolve(message.result); });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, replMode: true });
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const settle = async expression => { for (let n = 0; n < 150; n++) { if (await evaluate(expression)) return; await pause(25); }
    assert.fail(expression+' '+JSON.stringify(await evaluate(`({toast:document.querySelector('.toast')?.textContent,formHidden:taskForm.classList.contains('hidden'),frequency:document.querySelector('#taskRepeatFrequency').value,valid:taskForm.checkValidity(),rules:window.TaskPlanner.snapshotRules(),database:testRead(),intent:localStorage.getItem('farmodoro-recurring-intent:'+activeAuthUser.id)})`))); };
  const session = `activeAuthUser={id:'00000000-0000-4000-8000-000000000001'};
    window.SyncDiagnostics.selectUser(activeAuthUser.id); document.documentElement.className='';
    document.body.classList.remove('auth-gated');document.querySelector('#authGate').hidden=true;
    appStateHydrated=true;farmWalletHydrated=true;farmWalletUserId=activeAuthUser.id;farmDataHydrated=true;
    focusTimerDatabaseUnavailable=true;`;
  await call('Runtime.enable');
  await call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
  await settle('document.readyState === "complete" && !!window.TaskPlanner');
  await evaluate(`${session} await loadTaskDataFromDatabase(activeAuthUser); window.failWrites=true;
    document.querySelector('#openTaskForm').click();taskInput.value='mobile unsaved draft';taskForm.requestSubmit();`);
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('farmodoro-productivity:'+activeAuthUser.id)).snapshot.tasks[0].title`), 'mobile unsaved draft', 'edit is durable synchronously');
  await settle('taskSyncRetryAttempt > 0');
  const savedTaskId = await evaluate('state.tasks[0].id');
  await evaluate(`const remote=testRead();remote.tasks.push({id:'10000000-0000-4000-8000-000000000001',title:'desktop completed',status:'done',completion_reward:1,focus_seconds:90,completed_on:toProductivityDateString()});testWrite(remote);`);
  await call('Page.reload');
  await settle('document.readyState === "complete" && !!window.TaskPlanner');
  await evaluate(`${session} await loadTaskDataFromDatabase(activeAuthUser);await syncTaskDatabaseImmediately();`);
  assert.equal(await evaluate(`state.tasks.some(task=>task.id==='${savedTaskId}' && task.title==='mobile unsaved draft')`),true);
  assert.equal(await evaluate(`testRead().tasks.find(task=>task.id==='10000000-0000-4000-8000-000000000001').completion_reward`),1);
  assert.equal(await evaluate('testRead().tasks.length'),2);
  // Test a dirty checkpoint's acknowledgement after a genuine automatic retry.
  await evaluate(`window.failWrites=true;state.tasks.find(task=>task.id==='${savedTaskId}').title='retry me';scheduleTaskDatabaseSync(0);`);
  await settle('taskSyncRetryAttempt > 0');
  await evaluate('window.failWrites=false');
  await settle(`testRead().tasks.some(task=>task.title==='retry me') && taskSyncRetryAttempt===0`);
  // Calendar and recurring form operate against the actual app controls.
  await evaluate(`showPage('tasks');document.querySelector('#openTaskForm').click();taskInput.value='planned normal task';
    document.querySelector('#taskScheduledDate').value=toProductivityDateString();taskForm.requestSubmit();await syncTaskDatabaseImmediately();
    document.querySelector('#openTaskForm').click();taskInput.value='weekly recurring';document.querySelector('#taskRepeatFrequency').value='weekly';
    document.querySelector('#taskRepeatFrequency').dispatchEvent(new Event('change'));taskForm.requestSubmit();`);
  await settle('window.TaskPlanner.snapshotRules().length===1');
  assert.equal(await evaluate('testRead().recurringTasks.length'),1);
  await evaluate('showPage("calendar"); document.querySelector("[data-calendar-today]").click()');
  assert.equal(await evaluate('document.querySelectorAll(".calendar-grid .calendar-day").length%7'),0);
  assert.equal(await evaluate('document.querySelectorAll("#taskCalendarRoot [data-calendar-add]").length'),0);
  assert.equal(await evaluate('document.querySelector("#taskCalendarRoot").textContent.includes("할 일 추가")'),false);
  assert.equal(await evaluate('taskForm.classList.contains("hidden")'),true);
  assert.equal(await evaluate('document.querySelectorAll(".calendar-agenda-item").length'),1);
  const link=await evaluate('document.querySelector(".calendar-agenda-item a").href');
  assert.equal(new URL(link).origin,'https://calendar.google.com');
  assert.equal(new URL(link).searchParams.get('text'),'planned normal task');
  await evaluate('document.querySelector("[data-google-connect]").click()');
  await settle('document.querySelectorAll(".google-agenda-item").length===1');
  assert.equal(await evaluate('document.querySelectorAll(".calendar-agenda-item").length'),2);
  assert.equal(await evaluate('document.querySelector(".google-agenda-item").textContent.includes("Google meeting")'),true);
  assert.equal(await evaluate('fixtureGoogleRequests.every(request=>request.method==="GET")'),true);
  await evaluate('window.SyncDiagnostics.record("productivity_save_failed",{code:"offline",title:"private title",token:"private token"});await window.SyncDiagnostics.flush()');
  assert.equal(await evaluate('JSON.stringify(window.uploadedLogs).includes("private")'),false);
  fs.mkdirSync(capture,{recursive:true});
  // One live timer component survives navigation and has no linked entry points.
  await evaluate('showPage("today");document.querySelector("#focusButton").click();focusLastTickAt-=65000;resumeFocusTimerAfterBackground()');
  const beforeNavigation=await evaluate('focusRuntimeByMode.quick.seconds');
  await evaluate('showPage("focus");showPage("today")');
  assert.equal(await evaluate('focusMode'), 'quick');
  assert.equal(await evaluate('runningFocusMode'), 'quick');
  assert.equal(await evaluate('focusRuntimeByMode.quick.seconds'), beforeNavigation);
  assert.equal(await evaluate('document.querySelectorAll("[data-focus-mode], [data-focus-task], [data-focus-habit]").length'),0);
  assert.equal(await evaluate('document.querySelectorAll("#focusCard").length'),1);
  assert.equal(await evaluate('document.querySelector("#miniFocusTimer").hidden'),true);
  await evaluate('document.querySelector("#focusButton").click()');
  for(const width of [1366,768,390,320]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
    await evaluate('showPage("today")');await pause(80);
    assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false,`today ${width} overflow`);
    assert.equal(await evaluate(`(() => {const card=document.querySelector('#focusCard'),visual=card.querySelector('.focus-visual').getBoundingClientRect(),copy=card.querySelector('.focus-copy').getBoundingClientRect(),button=card.querySelector('#focusButton').getBoundingClientRect();return (innerWidth<=700?visual.right<=copy.left+1:visual.bottom<=copy.top+1)&&button.left>=copy.left-1&&button.right<=copy.right+1;})()`),true,`today ${width} timer and controls overlap`);
    assert.equal(await evaluate(`(() => {const card=document.querySelector('#focusCard'),visual=card.querySelector('.focus-visual').getBoundingClientRect(),copy=card.querySelector('.focus-copy').getBoundingClientRect(),button=card.querySelector('#focusButton').getBoundingClientRect();return (innerWidth<=700?visual.right<=copy.left+1:visual.bottom<=copy.top+1)&&button.left>=copy.left-1&&button.right<=copy.right+1;})()`),true,`today ${width} timer and controls overlap`);
    const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
    fs.writeFileSync(path.join(capture,`today-pomodoro-${width}.png`),Buffer.from(shot.data,'base64'));
  }
  for(const width of [1366,768,390,320]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
    await evaluate('showPage("calendar")');
    await pause(80);
    assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false,`calendar ${width} overflow`);
    const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
    fs.writeFileSync(path.join(capture,`calendar-${width}.png`),Buffer.from(shot.data,'base64'));
  }
  for (const page of ['privacy', 'about']) {
    for (const width of [1366,390,320]) {
      await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
      await call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/${page}.html`});
      await settle('document.readyState === "complete" && !!document.querySelector(".public-main")');
      assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false,`${page} ${width} overflow`);
      assert.equal(await evaluate('document.querySelectorAll("script, #authGate, #googleSignInButton").length'),0,'public information must not require login or API scripts');
      assert.equal(await evaluate('document.querySelectorAll(".public-main h1").length'),1);
      assert.equal(await evaluate('!!document.querySelector("a[href=\\"./privacy.html\\"]")'),true);
      if (page==='privacy') {
        assert.equal(await evaluate('document.querySelector("main").textContent.includes("ap-northeast-2")'),true);
        assert.equal(await evaluate('document.querySelector("#contact").parentElement.textContent.includes("wlfhddl23@gmail.com")'),true);
      }
      const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      fs.writeFileSync(path.join(capture,`${page}-${width}.png`),Buffer.from(shot.data,'base64'));
    }
  }
  assert.deepEqual(exceptions,[]);
  console.log('PASS: synchronous mobile checkpoint, real reload recovery, remote completion preservation, automatic retry, dated/recurring forms, month calendar 320/390/768/1366, Google link, diagnostics privacy.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{socket?.close();chrome?.kill();server.close();});
