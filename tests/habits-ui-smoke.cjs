// Run manually with Node 22+ and CHROME_PATH (optional on Windows).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { spawn } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "farmodoro-ui-"));
const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
// Run the actual application; omit only external authentication and service worker
// scripts so this test doesn't contact accounts or depend on the network.
const html = fs.readFileSync(path.join(root, "index.html"), "utf8")
  .replace(/<script\b[^>]*src="(?:https:[^"]*|\.\/pwa-register\.js[^"]*)"[^>]*>[\s\S]*?<\/script>/gi, "");
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const file = path.resolve(root, "." + pathname);
  if (pathname === "/") { response.setHeader("Content-Type", "text/html; charset=utf-8"); response.end(html); return; }
  if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  try {
    response.setHeader("Content-Type", file.endsWith(".css") ? "text/css" : file.endsWith(".js") ? "text/javascript" : file.endsWith(".svg") ? "image/svg+xml" : "application/octet-stream");
    response.end(fs.readFileSync(file));
  } catch { response.writeHead(404).end(); }
});
let chrome;
let ws;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  chrome = spawn(chromePath, ["--headless=new", "--disable-gpu", "--no-sandbox", "--disable-crash-reporter", "--no-first-run", "--remote-debugging-port=0",
    `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
  chrome.on("error", (error) => { throw error; });
  const portFile = path.join(profile, "DevToolsActivePort");
  for (let i = 0; i < 200 && !fs.existsSync(portFile); i++) await pause(50);
  const port = fs.readFileSync(portFile, "utf8").split(/\r?\n/)[0];
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(tabs.find((tab) => tab.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  const exceptions = [];
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const next = ++id;
    const timeout = setTimeout(() => reject(new Error(`Timeout: ${method}`)), 10000);
    pending.set(next, (message) => {
      clearTimeout(timeout);
      if (message.error) reject(new Error(JSON.stringify(message.error))); else resolve(message.result);
    });
    ws.send(JSON.stringify({ id: next, method, params }));
  });
  await call("Runtime.enable");
  await call("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/` });
  for (let i = 0; i < 100; i++) {
    const result = await call("Runtime.evaluate", { expression: 'document.readyState === "complete"' });
    if (result.result.value) break;
    await pause(50);
  }
  await call("Runtime.evaluate", { expression: `
    document.documentElement.className = "";
    document.body.classList.remove("auth-gated");
    document.querySelector("#authGate").hidden = true;
    document.querySelector(".auth-boot").remove();
  ` });
  const tutorialElements = await call("Runtime.evaluate", {
    expression: 'document.querySelectorAll("#tutorialModal, #reopenTutorial, .tutorial-settings-section").length',
  });
  assert.equal(tutorialElements.result.value, 0, "tutorial UI must stay removed");
  const habitTiers = await call("Runtime.evaluate", { returnByValue: true, expression: `(() => {
    taskDataHydrated = true;
    farmWalletHydrated = true;
    showPage('habits');
    const originalConfirm = confirmHabitCompletionWithServer;
    const originalUndo = confirmHabitUncompletionWithServer;
    const originalCoins = state.coins;
    confirmHabitCompletionWithServer = () => {};
    confirmHabitUncompletionWithServer = () => {};
    let habit;
    try {
      openHabitModal();
      if (habitMinimumInput.value !== '' || habitMinimumInput.maxLength !== 30) throw Error('Minimum goal must be optional and limited to 30 characters');
      if (habitForm.textContent.includes('Coin')) throw Error('Habit form must omit redundant coin labels');
      habitInput.value = '영어 공부하기';
      habitMinimumInput.value = '영어 단어 보기';
      habitForm.requestSubmit();
      habit = state.habits.at(-1);
      if (habit.title !== '영어 공부하기' || habit.minimumTitle !== '영어 단어 보기') throw Error('Minimum and maximum habit goals were not created');
      openHabitModal(habit);
      if (habitMinimumInput.value !== '영어 단어 보기') throw Error('Editing lost the minimum goal');
      habitMinimumInput.value = '단어 3개 보기';
      if (habitForm.textContent.includes('Coin')) throw Error('A minimum goal must not add a coin label');
      habitForm.requestSubmit();
      if (habit.minimumTitle !== '단어 3개 보기') throw Error('Minimum goal edit was not saved');
      const snapshot = JSON.parse(serializeTaskDatabaseState());
      const row = snapshot.habits.find(row => row.id === habit.id);
      if (row.minimum_title !== '단어 3개 보기' || mapDatabaseHabit(row, []).minimumTitle !== '단어 3개 보기') throw Error('Minimum goal database round trip failed');
      const card = () => document.querySelector('#habitList [data-habit-id="' + habit.id + '"]');
      const checkButton = () => card()?.querySelector('.habit-check[data-toggle-habit="' + habit.id + '"]');
      // Choosing a tier: undo the other completed tier first, then show and complete the requested one; the same tier undoes.
      const chooseTier = level => {
        if (card().dataset.habitViewTier === level) return checkButton().click();
        if (getHabitProgressRatio(habit, getHabitViewDate()) >= 1) checkButton().click();
        if (getHabitProgressRatio(habit, getHabitViewDate()) >= 1) return;
        card().querySelector('.habit-tier-switch').click();
        checkButton().click();
      };
      const checkbox = level => ({ click: () => chooseTier(level) });
      const check = (level, coins) => {
        if (state.coins !== originalCoins + coins || getHabitCompletionLevel(habit) !== level) throw Error('Incorrect tier reward: ' + level);
        if (!checkButton() || checkButton().getAttribute('aria-pressed') !== String(Boolean(level)) || card().querySelectorAll('[data-toggle-habit].habit-check').length !== 1) throw Error('A tiered habit needs one completion control reflecting its state');
        if (level && (card().dataset.habitViewTier !== level || checkButton().dataset.habitLevel !== level)) throw Error('A completed tiered habit must show its recorded tier');
        if (habit.completionDates.length !== (level ? 1 : 0)) throw Error('Completion levels must share one habit day');
      };
      check(null, 0);
      farmWalletHydrated = false;
      checkbox('min').click(); check(null, 0);
      farmWalletHydrated = true;
      const originalStartDate = habit.startDate;
      const pastDay = new Date(toProductivityDateString() + 'T12:00:00');
      pastDay.setDate(pastDay.getDate() - 1);
      try {
        habit.startDate = toLocalDateString(pastDay);
        selectedHabitDate = habit.startDate;
        taskDataHydrated = false;
        renderHabits();
        checkbox('min').click();
        if (checkButton().getAttribute('aria-pressed') === 'true' || habit.completionDates.length || state.coins !== originalCoins) throw Error('A historical checkbox must not appear completed before habit data is hydrated');
      } finally {
        habit.startDate = originalStartDate;
        selectedHabitDate = null;
        taskDataHydrated = true;
        renderHabits();
      }
      checkbox('min').click(); check('min', 1);
      farmWalletHydrated = false;
      checkbox('max').click(); check('min', 1);
      farmWalletHydrated = true;
      if (!isHabitCompleteToday(habit) || getHabitStreak(habit) !== 1) throw Error('Minimum goal must count toward the habit streak');
      const minimumCell = document.querySelector('#habitHeatmapGrid .heatmap-cell[aria-label^="영어 공부하기"][aria-label*="' + toProductivityDateString() + '"]');
      const minimumHeatmap = minimumCell?.className;
      const originalTheme = document.documentElement.dataset.theme;
      try {
        for (const theme of ['white', 'dark']) {
          document.documentElement.dataset.theme = theme;
          const style = getComputedStyle(minimumCell);
          const legend = document.querySelector('#habitsPage .heatmap-legend i.completed-min');
          const scheduled = document.querySelector('#habitHeatmapGrid .heatmap-cell.scheduled:not(.completed-min):not(.level-4)');
          const color = style.backgroundColor.match(/[\\d.]+/g)?.map(Number) || [];
          if (color.length < 3 || color[2] <= color[0] || color[2] <= color[1] || (color.length === 4 && color[3] !== 1)) throw Error(theme + ': minimum completion needs an opaque blue fill');
          if ([style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth, style.outlineWidth].some(value => parseFloat(value) !== 0) || style.boxShadow !== 'none') throw Error(theme + ': minimum completion must use a fill without an outline');
          if (!legend || getComputedStyle(legend).backgroundColor !== style.backgroundColor) throw Error(theme + ': the minimum legend must match its filled heatmap cell');
          if (scheduled && getComputedStyle(scheduled).backgroundColor === style.backgroundColor) throw Error(theme + ': minimum completion must visibly differ from a scheduled day');
        }
      } finally {
        if (originalTheme === undefined) delete document.documentElement.dataset.theme;
        else document.documentElement.dataset.theme = originalTheme;
      }
      checkbox('max').click(); check('max', 1);
      const maximumHeatmap = document.querySelector('#habitHeatmapGrid .heatmap-cell[aria-label^="영어 공부하기"][aria-label*="' + toProductivityDateString() + '"]')?.className;
      if (!minimumHeatmap || !maximumHeatmap || minimumHeatmap === maximumHeatmap) throw Error('Heatmap must distinguish minimum and maximum completion');
      checkbox('min').click(); check('min', 1);
      checkbox('min').click(); check(null, 0);
      checkbox('max').click(); check('max', 1);
      checkbox('max').click(); check(null, 0);
      openHabitModal(habit);
      habitMinimumInput.value = '';
      habitForm.requestSubmit();
      if (habit.minimumTitle || document.querySelector('[data-toggle-habit="' + habit.id + '"][data-habit-level]')) throw Error('Removing the minimum goal must restore a single completion control');
      return true;
    } finally {
      closeHabitModal();
      confirmHabitCompletionWithServer = originalConfirm;
      confirmHabitUncompletionWithServer = originalUndo;
      state.coins = originalCoins;
      if (habit) state.habits = state.habits.filter(item => item.id !== habit.id);
      farmWalletHydrated = false;
      renderHabitUpdates();
    }
  })()` });
  if (habitTiers.exceptionDetails) throw Error(habitTiers.exceptionDetails.exception?.description || habitTiers.exceptionDetails.text);
  assert.equal(habitTiers.result.value, true);
  console.log("Optional minimum goal creation/edit, persistence, tier rewards, streak, heatmap and undo PASS");
  const evaluateHabit = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  assert.equal(await evaluateHabit('document.querySelectorAll("#habitFocusEnabled, #habitFocusSettings, #habitFocusMinutes, #habitMinimumFocusMinutes, [data-habit-focus-weekday]").length'),0);
  await evaluateHabit(`taskDataHydrated=true;showPage('habits');openHabitModal();habitInput.value='직접 체크하는 습관';habitForm.requestSubmit()`);
  assert.deepEqual(await evaluateHabit(`(() => {const habit=state.habits.at(-1);return [habit.measureType,habit.targetValue,habit.minimumFocusMinutes,Object.keys(habit.targetByWeekday).length,hasHabitMinimum(habit)];})()`),['amount',1,null,0,false]);
  const legacyEdit = await evaluateHabit(`(() => {
    const today=toProductivityDateString();
    const habit=mapDatabaseHabit({id:'legacy-focus-goal',title:'독서',minimum_title:null,minimum_focus_minutes:5,
      measure_type:'time',target_value:25,target_by_weekday:{1:40},unit:'분',weekdays:[1,2,3,4,5,6,7],start_date:'2020-01-01'},
      [{record_date:today,progress_value:1,focus_seconds:300,completed_at:new Date().toISOString(),completion_level:'min',completion_reward:1,completion_cycle_id:'existing-cycle'}]);
    state.habits.push(habit);
    window.habitLegacyBefore=JSON.stringify({dates:habit.completionDates,progress:habit.progressByDate,focus:habit.focusSecondsByDate,records:habit.recordMetaByDate,reward:habit.completionReward});
    const coins=state.coins;
    renderHabitUpdates();
    const card=document.querySelector('[data-habit-id="legacy-focus-goal"]');
    if(card.querySelector('.habit-tier-switch')||card.querySelector('[data-focus-habit]')||card.textContent.includes('분')||card.textContent.includes('집중')) throw Error('Retired time-only goals must have no duration or duplicate tier controls');
    if(!card.querySelector('.habit-check[aria-pressed="true"]')||getHabitCompletionLevel(habit)!=='min') throw Error('Existing minimum completion must remain visible');
    openHabitModal(habit);
    habitInput.value='독서 수정';
    habitMinimumInput.value='한 문장 읽기';
    habitForm.requestSubmit();
    const after=JSON.stringify({dates:habit.completionDates,progress:habit.progressByDate,focus:habit.focusSecondsByDate,records:habit.recordMetaByDate,reward:habit.completionReward});
    if(after!==window.habitLegacyBefore||coins!==state.coins) throw Error('Editing must preserve completion, historical focus, payout and coins');
    const row=JSON.parse(serializeTaskDatabaseState()).habits.find(row=>row.id===habit.id);
    if(row.measure_type!=='amount'||row.target_value!==1||row.minimum_focus_minutes!==null||Object.keys(row.target_by_weekday).length) throw Error('Saved habit must use check completion without duration constraints');
    if(row.minimum_title!=='한 문장 읽기'||!hasHabitMinimum(habit)) throw Error('Named minimum goal must stay usable');
    window.habitRetirementSample=habit;
    return true;
  })()`);
  assert.equal(legacyEdit,true);
  // The shared Pomodoro timer never changes a habit's completion or recorded focus.
  const beforeTimer=await evaluateHabit('JSON.stringify(state.habits)');
  await evaluateHabit('showPage("focus");document.querySelector("#focusButton").click();focusLastTickAt-=65000;resumeFocusTimerAfterBackground();document.querySelector("#focusButton").click()');
  assert.equal(await evaluateHabit('JSON.stringify(state.habits)'),beforeTimer);
  await evaluateHabit('endFocusSession("quick")');
  for (const width of [1920,1440,390,320]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
    for (const theme of ['white','dark']) {
      await evaluateHabit('applyWorkspaceTheme('+JSON.stringify(theme)+');showPage("habits");openHabitModal(habitRetirementSample)');
      assert.equal(await evaluateHabit(`(() => {const form=habitForm.getBoundingClientRect();return [habitInput,habitMinimumInput,habitStartDate._themedDateTrigger,habitEndDate._themedDateTrigger].every(input=>{const r=input.getBoundingClientRect();return r.width>0&&r.left>=form.left-1&&r.right<=form.right+1;})&&!habitForm.textContent.includes('집중')&&document.documentElement.scrollWidth<=innerWidth;})()`),true,'Habit editor fits without focus settings');
      if(process.env.HABIT_FOCUS_SCREENSHOTS && [1440,390].includes(width)) {
        fs.mkdirSync(process.env.HABIT_FOCUS_SCREENSHOTS,{recursive:true});
        const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
        fs.writeFileSync(path.join(process.env.HABIT_FOCUS_SCREENSHOTS,'habit-editor-'+theme+'-'+width+'.png'),Buffer.from(shot.data,'base64'));
      }
      await evaluateHabit(`closeHabitModal();habitRetirementSample.completionDates=[];habitRetirementSample.recordMetaByDate={};renderHabitUpdates()`);
      for(const page of ['habits','today']) {
        await evaluateHabit('showPage('+JSON.stringify(page)+')');
        assert.equal(await evaluateHabit(`(() => {
          const card=document.querySelector('[data-habit-id="legacy-focus-goal"]');
          if(card.querySelectorAll('.habit-check').length!==1||card.querySelector('[data-focus-habit], [data-habit-focus-time]')||card.textContent.includes('집중')||card.textContent.includes('분')) return false;
          card.querySelector('[data-habit-view-level="min"]')?.click();
          const shown=document.querySelector('[data-habit-id="legacy-focus-goal"]');
          return shown.querySelector('strong').textContent==='한 문장 읽기'&&document.documentElement.scrollWidth<=innerWidth;
        })()`),true,'Named goals work without focus controls on '+page);
      }
      if(process.env.HABIT_FOCUS_SCREENSHOTS && [1440,390].includes(width)) {
        const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
        fs.writeFileSync(path.join(process.env.HABIT_FOCUS_SCREENSHOTS,'habit-list-'+theme+'-'+width+'.png'),Buffer.from(shot.data,'base64'));
      }
    }
  }
  assert.deepEqual(exceptions,[],'No habit editor, shared timer or list runtime errors');
  console.log('PASS: removed habit focus fields, checkable creation, legacy edits preserve history/coins, named goals, independent Pomodoro, white/dark editor and lists at 320/390/1440/1920.');
  await call('Runtime.evaluate', { expression: 'state.habits = []; taskDataHydrated = false; renderHabits();' });
  if (process.env.HABIT_FOCUS_ONLY) return;
  for (const width of [1440, 768, 656, 390, 320]) {
    await call("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    for (const page of ["tasks", "habits", "focus", "farm", "today", "habits"]) {
      await call("Runtime.evaluate", { expression: `document.querySelector('[data-page="${page}"]').click()` });
      let active;
      for (let i = 0; i < 20; i++) {
        const result = await call("Runtime.evaluate", { expression: 'document.querySelector(".page-view.active")?.dataset.view' });
        active = result.result.value;
        if (active === page) break;
        await pause(25);
      }
      assert.equal(active, page, `${width}px menu ${page}: ${exceptions.join("\n")}`);
      if (["tasks", "habits", "focus", "farm"].includes(page)) {
        const heading = await call("Runtime.evaluate", { returnByValue: true, expression: `(() => {
          const view = document.querySelector('#${page}Page');
          const direct = view.querySelector(':scope > .page-header');
          return {
            hasTitle: !!direct?.querySelector('h1, .section-kicker, p'),
            titleText: direct?.querySelector('h1, .section-kicker, p')?.textContent.trim() || '',
            firstVisibleTop: [...view.children].find(el => getComputedStyle(el).display !== 'none')?.getBoundingClientRect().top || 0
          };
        })()` });
        assert.equal(heading.exceptionDetails, undefined, JSON.stringify(heading.exceptionDetails));
        assert.equal(heading.result.value.hasTitle, false, `${page} page heading copy removed`);
      }
      if (process.env.THEME_SCREENSHOTS) {
        await pause(300);
        const shot = await call('Page.captureScreenshot', {format:'png',captureBeyondViewport:true});
        fs.mkdirSync(process.env.THEME_SCREENSHOTS,{recursive:true});
        fs.writeFileSync(path.join(process.env.THEME_SCREENSHOTS,`${page}-${width}.png`),Buffer.from(shot.data,'base64'));
      }
    }
    assert.deepEqual(exceptions, [], "No application runtime errors");
    console.log(`${width}px: all menu navigation PASS`);
    const groupResult = await call("Runtime.evaluate", { returnByValue: true, expression: `(() => {
      state.groups = [{ id: "study", name: "공부", colorIndex: 0 }, { id: "work", name: "업무", colorIndex: 1 }];
      state.tasks = [
        { id: "one", title: "공부 대기", groupId: "study", status: "waiting" },
        { id: "two", title: "업무 대기", groupId: "work", status: "waiting" },
        { id: "three", title: "미분류", groupId: null, status: "waiting" },
        { id: "four", title: "보관", groupId: "study", status: "done", archived: true },
        { id: "five", title: "공부 진행", groupId: "study", status: "doing" },
        { id: "six", title: "공부 완료", groupId: "study", status: "done" }
      ];
      taskArchiveView = true;
      showPage("today");
      const visible = () => [...document.querySelectorAll("#taskBoard [data-task-id]")].map(card => card.dataset.taskId);
      document.querySelector('#todayTaskGroupFilters [data-task-group-filter="study"]').click();
      const study = visible();
      const active = document.querySelector('#todayTaskGroupFilters [aria-pressed="true"]').textContent.trim();
      document.querySelector('#todayTaskGroupFilters [data-task-group-filter="none"]').click();
      const none = visible();
      document.querySelector('#todayTaskGroupFilters [data-task-group-filter="all"]').click();
      const all = visible();
      const filters = document.querySelector("#todayTaskGroupFilters");
      const fits = filters.scrollWidth <= filters.clientWidth;
      state.tasks = []; state.groups = []; taskArchiveView = false;
      showPage("habits");
      return { study, active, none, all, fits };
    })()` });
    assert.equal(groupResult.exceptionDetails, undefined, JSON.stringify(groupResult.exceptionDetails));
    assert.deepEqual(groupResult.result.value, { study: ["one", "five", "six"], active: "공부", none: ["three"], all: ["one", "two", "three", "five", "six"], fits: true });
    console.log(`${width}px: today group filters and archive exclusion PASS`);
    const result = await call("Runtime.evaluate", { returnByValue: true, expression: `(() => {
      const style = id => { const s = getComputedStyle(document.getElementById(id)); return [s.width, s.height, s.backgroundColor, s.border, s.boxShadow, s.fontSize]; };
      const nav = document.querySelector("#habitDateNav");
      return { month: style("previousHabitMonth"), day: style("previousHabitDate"), today: style("habitDateToday"),
        fits: nav.scrollWidth <= nav.clientWidth, empty: document.querySelector("#habitList").textContent.trim(),
        modal: !!document.querySelector("#habitRecordModal") };
    })()` });
    const value = result.result.value;
    assert.deepEqual(value.day, value.month);
    assert.equal(value.today[2], "rgb(243, 207, 99)");
    assert.equal(value.fits, true);
    assert.equal(value.empty, "");
    assert.equal(value.modal, false);
    console.log(`${width}px: shared arrows, colored today button, empty list, no record modal PASS`);
  }
  assert.deepEqual(exceptions, [], "No habit or navigation runtime errors");
  console.log("Habit form, weekday countdown, menu navigation, group filters and date controls PASS");
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => {
  ws?.close();
  chrome?.kill();
  server.close();
});
