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
    auth: { getSession: () => new Promise(() => {}), onAuthStateChange: () => {},
      signInWithIdToken: async payload => { window.fixtureIdTokenRequest = payload; return { error: null }; } },
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
  window.google = { accounts: { id: {
    initialize(config) { window.fixtureGoogleSignIn = config; },
    renderButton(target) { target.innerHTML = '<button type="button">Google 계정으로 계속하기</button>'; },
  } } };
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(String(input), location.href);
    if (url.origin === 'https://www.googleapis.com' && url.pathname.startsWith('/calendar/')) {
      fixtureGoogleRequests.push({ url: url.href, method: init?.method || 'GET' });
      throw Error('Calendar API must not be requested');
    }
    return nativeFetch(input, init);
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
  assert.deepEqual(await evaluate('[...document.querySelectorAll(".main-nav [data-page]")].slice(0,3).map(link=>link.dataset.page)'),['today','calendar','tasks']);
  await evaluate('document.documentElement.className="";await prepareGoogleSignIn()');
  assert.equal(await evaluate('!!fixtureGoogleSignIn.client_id && /^[a-f0-9]{64}$/.test(fixtureGoogleSignIn.nonce)'),true);
  await evaluate('fixtureGoogleSignIn.callback({credential:"fixture-google-id-token"})');
  assert.deepEqual(await evaluate('({provider:fixtureIdTokenRequest.provider,token:fixtureIdTokenRequest.token,validNonce:fixtureIdTokenRequest.nonce===googleSignInNonce})'),
    {provider:'google',token:'fixture-google-id-token',validNonce:true});
  await evaluate(`${session} await loadTaskDataFromDatabase(activeAuthUser); window.failWrites=true;
    document.querySelector('#openTaskForm').click();`);
  assert.equal(await evaluate('document.querySelector("#taskScheduledDate").value===toProductivityDateString()'),true,'new task has a real default date without picker interaction');
  assert.equal(await evaluate('document.querySelector("#taskScheduledDate")._themedDateTrigger.textContent.trim()===formatThemedDateValue(toProductivityDateString())'),true,'date label matches the value saved');
  await evaluate("taskInput.value='mobile unsaved draft';taskForm.requestSubmit()");
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('farmodoro-productivity:'+activeAuthUser.id)).snapshot.tasks[0].title`), 'mobile unsaved draft', 'edit is durable synchronously');
  await settle('taskSyncRetryAttempt > 0');
  const savedTaskId = await evaluate('state.tasks[0].id');
  await evaluate(`const remote=testRead();remote.tasks.push({id:'10000000-0000-4000-8000-000000000001',title:'desktop completed',status:'done',completion_reward:1,focus_seconds:90,completed_on:toProductivityDateString()});testWrite(remote);`);
  await call('Page.reload');
  await settle('document.readyState === "complete" && !!window.TaskPlanner');
  await evaluate(`${session} await loadTaskDataFromDatabase(activeAuthUser);await syncTaskDatabaseImmediately();`);
  assert.equal(await evaluate(`state.tasks.some(task=>task.id==='${savedTaskId}' && task.title==='mobile unsaved draft')`),true);
  assert.equal(await evaluate(`testRead().tasks.find(task=>task.id==='${savedTaskId}').scheduled_on===toProductivityDateString()`),true,'untouched default date survives save and reload');
  assert.equal(await evaluate(`testRead().tasks.find(task=>task.id==='10000000-0000-4000-8000-000000000001').completion_reward`),1);
  assert.equal(await evaluate('testRead().tasks.length'),2);
  // Test a dirty checkpoint's acknowledgement after a genuine automatic retry.
  await evaluate(`window.failWrites=true;state.tasks.find(task=>task.id==='${savedTaskId}').title='retry me';scheduleTaskDatabaseSync(0);`);
  await settle('taskSyncRetryAttempt > 0');
  await evaluate('window.failWrites=false');
  await settle(`testRead().tasks.some(task=>task.title==='retry me') && taskSyncRetryAttempt===0`);
  // Calendar and recurring form operate against the actual app controls.
  await evaluate(`showPage('tasks');document.querySelector('#openTaskForm').click();`);
  await evaluate(`document.querySelector('#taskScheduledDate')._themedDateTrigger.click();document.querySelector('[data-date-calendar-nav="1"]').click();
    document.querySelector('.themed-date-calendar [data-calendar-date]:not(.outside)').click()`);
  const manuallySelectedDate=await evaluate('document.querySelector("#taskScheduledDate").value');
  await evaluate("taskInput.value='manually dated task';taskForm.requestSubmit();await syncTaskDatabaseImmediately()");
  assert.equal(await evaluate('testRead().tasks.find(task=>task.title==="manually dated task").scheduled_on'),manuallySelectedDate);
  await evaluate('document.querySelector("#openTaskForm").click()');
  assert.equal(await evaluate('document.querySelector("#taskScheduledDate").value===toProductivityDateString()'),true);
  assert.equal(await evaluate('document.querySelector("#taskScheduledDate")._themedDateTrigger.textContent.trim()===formatThemedDateValue(toProductivityDateString())'),true,'reopening clears a previous date label and restores today');
  await evaluate(`taskInput.value='planned normal task';taskForm.requestSubmit();await syncTaskDatabaseImmediately();
    document.querySelector('#openTaskForm').click();taskInput.value='weekly recurring';document.querySelector('#taskRepeatFrequency').value='weekly';
    document.querySelector('#taskRepeatFrequency').dispatchEvent(new Event('change'));taskForm.requestSubmit();`);
  await settle('window.TaskPlanner.snapshotRules().length===1');
  assert.equal(await evaluate('testRead().recurringTasks.length'),1);
  await evaluate('showPage("tasks");openTaskInlineEdit(state.tasks.find(task=>task.title==="manually dated task"))');
  assert.equal(await evaluate('document.querySelector("#taskScheduledDate").value'),manuallySelectedDate);
  assert.equal(await evaluate('document.querySelector("#taskScheduledDate")._themedDateTrigger.textContent.trim()===formatThemedDateValue(document.querySelector("#taskScheduledDate").value)'),true,'editing displays the saved date');
  await evaluate('taskInput.value="edited dated task";taskForm.requestSubmit();await syncTaskDatabaseImmediately()');
  assert.equal(await evaluate('testRead().tasks.find(task=>task.title==="edited dated task").scheduled_on'),manuallySelectedDate,'editing title preserves the untouched date');
  await evaluate('openTaskInlineEdit(state.tasks.find(task=>task.title==="desktop completed"))');
  assert.equal(await evaluate('document.querySelector("#taskScheduledDate").value'),'', 'existing undated tasks stay undated');
  assert.equal(await evaluate('document.querySelector("#taskScheduledDate")._themedDateTrigger.textContent.trim()===formatThemedDateValue("")'),true,'undated edit does not show a stale date');
  await evaluate('closeTaskCreate()');
  await evaluate('document.querySelector("#openTaskForm").click();document.querySelector("#taskScheduledDate")._themedDateTrigger.click();document.querySelector("[data-date-calendar-clear]").click()');
  assert.equal(await evaluate('document.querySelector("#taskScheduledDate").value'),'');
  assert.equal(await evaluate('document.querySelector("#taskScheduledDate")._themedDateTrigger.textContent.trim()===formatThemedDateValue("")'),true);
  await evaluate('taskInput.value="intentionally undated";taskForm.requestSubmit();await syncTaskDatabaseImmediately()');
  assert.equal(await evaluate('testRead().tasks.find(task=>task.title==="intentionally undated").scheduled_on'),null,'explicitly clearing the default date stays supported');
  await evaluate('productivitySchedulingAvailable=false;document.querySelector("#openTaskForm").click()');
  assert.equal(await evaluate('document.querySelector("#taskScheduledDate").value'),'','older database keeps its undated create flow');
  assert.equal(await evaluate('document.querySelector("#taskScheduledDate")._themedDateTrigger.textContent.trim()===formatThemedDateValue("")'),true);
  await evaluate('closeTaskCreate();productivitySchedulingAvailable=true');
  await evaluate('showPage("calendar")');
  assert.equal(await evaluate(`document.querySelector('.calendar-day[aria-pressed="true"]').dataset.calendarDate===toProductivityDateString()`),true,'opening the calendar selects today by default');
  assert.deepEqual(await evaluate('[...document.querySelectorAll(".calendar-weekdays span")].map(day=>day.textContent)'),['일','월','화','수','목','금','토']);
  for (let month=0;month<28;month++) {
    assert.equal(await evaluate('new Date(document.querySelector(".calendar-grid [data-calendar-date]").dataset.calendarDate+"T12:00:00Z").getUTCDay()'),0,'month grid starts on Sunday');
    assert.equal(await evaluate('[...document.querySelectorAll(".calendar-grid .calendar-day")].every((cell,index,cells)=>new Date(cell.dataset.calendarDate+"T12:00:00Z").getUTCDay()===index%7 && (!index || new Date(cell.dataset.calendarDate)-new Date(cells[index-1].dataset.calendarDate)===86400000))'),true,'weekdays and consecutive dates agree across year and leap day');
    assert.equal(await evaluate(`(() => {const days=[...document.querySelectorAll('.calendar-grid .calendar-day:not(.outside)')],first=new Date(days[0].dataset.calendarDate+'T12:00:00Z'),last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();return days.length===last&&first.getUTCDate()===1&&Number(days.at(-1).dataset.calendarDate.slice(-2))===last;})()`),true,'each month includes every date exactly once');
    await evaluate('document.querySelector("[data-calendar-move=\\"1\\"]").click()');
  }
  await evaluate('document.querySelector("[data-calendar-today]").click()');
  assert.equal(await evaluate('document.querySelectorAll(".calendar-grid .calendar-day").length%7'),0);
  assert.equal(await evaluate('document.querySelectorAll("#taskCalendarRoot [data-calendar-add]").length'),0);
  assert.equal(await evaluate('document.querySelector("#taskCalendarRoot").textContent.includes("할 일 추가")'),false);
  assert.equal(await evaluate('taskForm.classList.contains("hidden")'),true);
  assert.equal(await evaluate('document.querySelectorAll(".calendar-agenda-item").length'),2);
  assert.equal(await evaluate('[...document.querySelectorAll(".calendar-agenda-item")].some(item=>item.textContent.includes("planned normal task"))'),true);
  assert.equal(await evaluate('document.querySelectorAll("[data-calendar-edit]").length'),0,'calendar details have no edit buttons');
  assert.equal(await evaluate('document.querySelectorAll("[data-google-connect], [data-google-disconnect], .google-calendar-connection, a[href*=\\"calendar.google.com\\"]").length'),0);
  assert.equal(await evaluate('typeof window.GoogleCalendarSync'),'undefined');
  assert.deepEqual(await evaluate('fixtureGoogleRequests'),[]);
  // Today uses calendar dates, with future recurrence previews kept out of saved tasks.
  await evaluate('showPage("today")');
  assert.equal(await evaluate('document.querySelector("#todayTaskDateControls")'),null,'redundant date navigation is removed');
  assert.equal(await evaluate('getVisibleTasks("waiting").some(task=>task.title==="planned normal task")'),true);
  assert.equal(await evaluate('getVisibleTasks("waiting").some(task=>task.title==="edited dated task")'),false);
  const beforeDateNavigation=await evaluate('serializeTaskDatabaseState()');
  await evaluate(`document.querySelector('[data-today-calendar-move="1"]').click();document.querySelector('.today-calendar-day:not(.outside)').click()`);
  assert.equal(await evaluate('getTaskViewDate()'),manuallySelectedDate);
  assert.equal(await evaluate(`document.querySelector('#taskSection .section-header h2').textContent`),`${Number(manuallySelectedDate.slice(5,7))}월 ${Number(manuallySelectedDate.slice(8))}일 할 일`);
  assert.equal(await evaluate('getVisibleTasks("waiting").some(task=>task.title==="edited dated task")'),true);
  assert.equal(await evaluate('getVisibleTasks("waiting").some(task=>task.title==="planned normal task")'),false);
  assert.equal(await evaluate('getVisibleTasks("waiting").some(task=>task.title==="intentionally undated")'),true);
  assert.equal(await evaluate('document.querySelectorAll("[data-task-planned]").length===window.TaskPlanner.eventsFor(getTaskViewDate()).filter(task=>task.planned).length'),true);
  assert.equal(await evaluate('document.querySelectorAll("[data-task-planned] button, [data-task-planned][data-task-id]").length'),0);
  assert.equal(await evaluate('getListShareSnapshot("tasks").date'),manuallySelectedDate);
  assert.equal(await evaluate('serializeTaskDatabaseState()'),beforeDateNavigation,'browsing recurrence previews never creates saved tasks');
  assert.equal(await evaluate(`document.querySelector('#todayCalendarRoot [aria-pressed="true"]').dataset.todayCalendarDate`),manuallySelectedDate,'Today calendar highlights the selected task date');
  await evaluate('document.querySelector("[data-today-calendar-reset]").click()');
  assert.equal(await evaluate('getTaskViewDate()===toProductivityDateString()'),true,'calendar Today resets the task list date');
  await evaluate(`document.querySelector('[data-today-calendar-move="1"]').focus();document.activeElement.click()`);
  assert.equal(await evaluate('getTaskViewDate()===toProductivityDateString()'),true,'browsing a month does not change the task list date');
  assert.equal(await evaluate('document.activeElement.dataset.todayCalendarMove'),'1','month navigation keeps keyboard focus');
  await evaluate('document.querySelector(".today-calendar-day:not(.outside)").click()');
  assert.equal(await evaluate('getTaskViewDate()'),manuallySelectedDate,'calendar day selects its task list');
  assert.equal(await evaluate('serializeTaskDatabaseState()'),beforeDateNavigation,'calendar navigation never writes tasks');
  await evaluate('document.querySelector("#openTaskForm").click()');
  assert.equal(await evaluate('document.querySelector("#taskScheduledDate").value'),manuallySelectedDate,'adding from a selected date keeps that date');
  await evaluate('closeTaskCreate();showPage("tasks")');
  assert.equal(await evaluate('document.querySelector("#todayTaskDateControls")'),null);
  assert.equal(await evaluate('getVisibleTasks("waiting").some(task=>task.title==="planned normal task")'),true,'all-tasks navigation remains unfiltered by date');
  fs.mkdirSync(capture,{recursive:true});
  for(const width of [1366,390,320]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
    for(const theme of ['white','dark']) {
      await evaluate(`applyWorkspaceTheme(${JSON.stringify(theme)});showPage("today")`);
      assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false,`selected date ${theme} ${width} overflow`);
      assert.equal(await evaluate(`(() => {const timer=document.querySelector('#focusCard').getBoundingClientRect(),calendar=document.querySelector('.today-calendar').getBoundingClientRect(),progress=document.querySelector('.progress-card').getBoundingClientRect(),stats=[...document.querySelectorAll('.progress-stats > div')].slice(0,2).map(el=>el.getBoundingClientRect());return calendar.top-timer.bottom>=12&&progress.top-calendar.bottom>=12&&stats[1].left-stats[0].right>=12&&getComputedStyle(document.querySelector('#summaryGrid')).borderTopWidth==='0px';})()`),true,'timer, calendar, task progress and habit progress have separate cards');
      const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
      fs.writeFileSync(path.join(capture,`today-selected-date-${theme}-${width}.png`),Buffer.from(shot.data,'base64'));
    }
  }
  await evaluate(`document.querySelectorAll('.today-calendar-day:not(.outside)')[1].click()`);
  assert.notEqual(await evaluate('getTaskViewDate()'),manuallySelectedDate);
  await evaluate('document.querySelector("[data-today-calendar-reset]").click();applyWorkspaceTheme("white")');
  assert.equal(await evaluate('getTaskViewDate()===toProductivityDateString()'),true);
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
    assert.equal(await evaluate(`(() => {const card=document.querySelector('#focusCard'),visual=card.querySelector('.focus-visual').getBoundingClientRect(),copy=card.querySelector('.focus-copy').getBoundingClientRect(),button=card.querySelector('#focusButton').getBoundingClientRect();return visual.right<=copy.left+1&&card.getBoundingClientRect().height<180&&button.left>=copy.left-1&&button.right<=copy.right+1;})()`),true,`today ${width} compact timer and controls overlap`);
    assert.equal(await evaluate(`(() => {const calendar=document.querySelector('.today-calendar').getBoundingClientRect(),card=document.querySelector('#focusCard').getBoundingClientRect();return card.bottom<=calendar.top&&[...document.querySelectorAll('.today-calendar-day')].every(day=>{const rect=day.getBoundingClientRect();return rect.width>=28&&rect.left>=calendar.left&&rect.right<=calendar.right+1;});})()`),true,`today ${width} calendar dates fit below the timer`);
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
  // Real mouse/touch input exercises capture, hit testing and durable rescheduling.
  await call('Emulation.setDeviceMetricsOverride',{width:1366,height:1000,deviceScaleFactor:1,mobile:false});
  await evaluate('showPage("calendar");document.querySelector("[data-calendar-today]").click()');
  await pause(350);
  const dateAfter = (date,days) => { const next=new Date(date+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+days);return next.toISOString().slice(0,10); };
  const initialDate=await evaluate(`state.tasks.find(task=>task.id==='${savedTaskId}').scheduledDate`);
  const nextDate=dateAfter(initialDate,1);
  const taskBeforeMove=await evaluate(`JSON.stringify((({scheduledDate,...task})=>task)(state.tasks.find(task=>task.id==='${savedTaskId}')))`);
  const taskCountBeforeMove=await evaluate('state.tasks.length');
  const dragTask = async (selector,date,{touch=false,cancel=false,outside=false}={}) => {
    const points=await evaluate(`(() => {const source=document.querySelector(${JSON.stringify(selector)});source.scrollIntoView({block:'center'});const from=source.getBoundingClientRect(),to=document.querySelector('[data-calendar-date="${date}"]').getBoundingClientRect();return {from:{x:from.left+from.width/2,y:from.top+from.height/2},to:{x:to.left+to.width/2,y:to.top+22}};})()`);
    if(outside) points.to={x:12,y:300};
    const touchPoint = point => [{x:point.x,y:point.y,id:0,radiusX:3,radiusY:3,force:1}];
    if(touch) await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touchPoint(points.from)});
    else {await call('Input.dispatchMouseEvent',{type:'mouseMoved',...points.from});await call('Input.dispatchMouseEvent',{type:'mousePressed',...points.from,button:'left',buttons:1,clickCount:1});}
    for(let step=1;step<=8;step++) {
      const point={x:points.from.x+(points.to.x-points.from.x)*step/8,y:points.from.y+(points.to.y-points.from.y)*step/8};
      if(touch) await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:touchPoint(point)});
      else await call('Input.dispatchMouseEvent',{type:'mouseMoved',...point,button:'left',buttons:1});
    }
    await pause(40);
    assert.equal(await evaluate('!!document.querySelector(".calendar-drag-preview")'),true,'moving a task shows a drag preview');
    if(!outside) assert.equal(await evaluate(`document.querySelector('.calendar-drop-over')?.dataset.calendarDate`),date,'drop date is highlighted');
    if(cancel && !touch) await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    if(touch) await call('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});
    else await call('Input.dispatchMouseEvent',{type:'mouseReleased',...points.to,button:'left',buttons:0,clickCount:1});
    assert.equal(await evaluate('!!document.querySelector(".calendar-drag-preview, .calendar-drop-over")'),false,'drag visuals are cleaned up');
    await pause(350);
  };
  await dragTask(`.calendar-event[data-calendar-task-id="${savedTaskId}"]`,nextDate);
  assert.equal(await evaluate(`state.tasks.find(task=>task.id==='${savedTaskId}').scheduledDate`),nextDate,'month chip moves to another day');
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('farmodoro-productivity:'+activeAuthUser.id)).snapshot.tasks.find(task=>task.id==='${savedTaskId}').scheduled_on`),nextDate,'drop is immediately durable');
  await evaluate('await syncTaskDatabaseImmediately()');
  assert.equal(await evaluate(`testRead().tasks.find(task=>task.id==='${savedTaskId}').scheduled_on`),nextDate,'drop reaches the server');
  assert.equal(await evaluate(`JSON.stringify((({scheduledDate,...task})=>task)(state.tasks.find(task=>task.id==='${savedTaskId}')))`),taskBeforeMove,'rescheduling preserves title, group, status, focus and completion data');
  assert.equal(await evaluate('state.tasks.length'),taskCountBeforeMove,'rescheduling does not duplicate tasks');
  await dragTask(`.calendar-agenda-item[data-calendar-task-id="${savedTaskId}"]`,initialDate,{cancel:true});
  assert.equal(await evaluate(`state.tasks.find(task=>task.id==='${savedTaskId}').scheduledDate`),nextDate,'Escape cancels a drag');
  await dragTask(`.calendar-agenda-item[data-calendar-task-id="${savedTaskId}"]`,initialDate,{outside:true});
  assert.equal(await evaluate(`state.tasks.find(task=>task.id==='${savedTaskId}').scheduledDate`),nextDate,'dropping outside a date changes nothing');
  await dragTask(`.calendar-agenda-item[data-calendar-task-id="${savedTaskId}"]`,initialDate);
  assert.equal(await evaluate(`state.tasks.find(task=>task.id==='${savedTaskId}').scheduledDate`),initialDate,'agenda card moves back');
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:true});
  await call('Emulation.setTouchEmulationEnabled',{enabled:true});
  await dragTask(`.calendar-agenda-item[data-calendar-task-id="${savedTaskId}"] [data-calendar-drag-handle]`,nextDate,{touch:true,cancel:true});
  assert.equal(await evaluate(`state.tasks.find(task=>task.id==='${savedTaskId}').scheduledDate`),initialDate,'touch cancellation changes nothing');
  await dragTask(`.calendar-agenda-item[data-calendar-task-id="${savedTaskId}"] [data-calendar-drag-handle]`,nextDate,{touch:true});
  assert.equal(await evaluate(`state.tasks.find(task=>task.id==='${savedTaskId}').scheduledDate`),nextDate,'touch handle reschedules the task');
  await evaluate(`document.querySelector('.calendar-agenda-item[data-calendar-task-id="${savedTaskId}"]').focus()`);
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',modifiers:1,windowsVirtualKeyCode:39});
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',modifiers:1,windowsVirtualKeyCode:39});
  assert.equal(await evaluate(`state.tasks.find(task=>task.id==='${savedTaskId}').scheduledDate`),dateAfter(nextDate,1),'keyboard can also move a task');
  await evaluate('await syncTaskDatabaseImmediately()');
  await call('Page.reload');
  await settle('document.readyState === "complete" && !!window.TaskPlanner');
  await evaluate(`${session}await loadTaskDataFromDatabase(activeAuthUser);showPage('calendar');`);
  assert.equal(await evaluate(`document.querySelector('.calendar-day[aria-pressed="true"]').dataset.calendarDate===toProductivityDateString()`),true,'a real reload defaults to today instead of the first or previously selected day');
  assert.equal(await evaluate(`state.tasks.find(task=>task.id==='${savedTaskId}').scheduledDate`),dateAfter(nextDate,1),'moved date survives a real reload');
  assert.equal(await evaluate('document.querySelectorAll(".calendar-agenda-item.planned[data-calendar-task-id], .calendar-event.planned[data-calendar-task-id]").length'),0,'future recurrence previews cannot be mistaken for saved tasks');
  await call('Emulation.setTouchEmulationEnabled',{enabled:false});
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
  console.log('PASS: basic Google sign-in, checkpoints/reload/retry, recurring forms, calendar 320/390/768/1366, mouse/touch/keyboard rescheduling, cancelled/outside drops, durable dates, diagnostics privacy.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{socket?.close();chrome?.kill();server.close();});
