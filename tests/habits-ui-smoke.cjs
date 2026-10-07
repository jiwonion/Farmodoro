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
  const habitFocusEditing = await call('Runtime.evaluate', { returnByValue: true, expression: `(() => {
    taskDataHydrated = true;
    showPage('habits');
    openHabitModal();
    if (habitFocusEnabled.checked) throw Error('New habits should not require a timer');
    habitInput.value = '지각 안 하기';
    habitForm.requestSubmit();
    const untimed = state.habits.at(-1);
    if (untimed.measureType !== 'amount' || getHabitFocusMinutes(untimed) !== 0) throw Error('Untimed habit not saved');
    if (document.querySelector('[data-focus-habit="' + untimed.id + '"]')) throw Error('Untimed habit has a focus button');
    const untimedSnapshot = JSON.parse(serializeTaskDatabaseState());
    const untimedRow = untimedSnapshot.habits.find(row => row.id === untimed.id);
    openHabitModal(mapDatabaseHabit(untimedRow, []));
    if (habitFocusEnabled.checked || !habitFocusMinutes.disabled) throw Error('Untimed setting not restored');
    closeHabitModal();
    openHabitModal();
    habitFocusEnabled.click();
    habitInput.value = '목표 집중 시간';
    habitFocusMinutes.value = '45';
    habitForm.requestSubmit();
    const habit = state.habits.at(-1);
    const today = toLocalDateString();
    if (habit.targetValue !== 45 || habit.measureType !== 'time' || getHabitDailyFocusSeconds(habit) !== 0) throw Error('Target must not create focus records');
    habit.focusSecondsByDate[today] = 617;
    openHabitModal(habit);
    if (habitFocusMinutes.value !== '45') throw Error('Target not restored');
    habitFocusMinutes.value = '30';
    const weekday = new Date().getDay() || 7;
    const dayInput = habitForm.querySelector('[data-habit-focus-weekday="' + weekday + '"]');
    dayInput.value = '40';
    habitForm.requestSubmit();
    if (getHabitDailyFocusSeconds(habit) !== 617) throw Error('Target edit changed focus history');
    const snapshot = JSON.parse(serializeTaskDatabaseState());
    const row = snapshot.habits.find(row => row.id === habit.id);
    if (row.target_value !== 30 || row.target_by_weekday[weekday] !== 40 || row.measure_type !== 'time' || 'focus_minutes' in row) throw Error('Targets must use existing database columns');
    const restored = mapDatabaseHabit(row, snapshot.habitRecords.filter(row => row.habit_id === habit.id));
    if (getHabitFocusMinutes(restored) !== 40 || getHabitFocusMinutes(restored, null) !== 30 || getHabitDailyFocusSeconds(restored) !== 617) throw Error('Database round trip');
    openHabitModal(restored);
    if (habitForm.querySelector('[data-habit-focus-weekday="' + weekday + '"]').value !== '40') throw Error('Weekday target not restored');
    const otherDay = weekday === 7 ? 1 : weekday + 1;
    const checkbox = habitForm.querySelector('[name="habitWeekday"][value="' + otherDay + '"]');
    checkbox.click();
    if (!habitForm.querySelector('[data-habit-focus-weekday="' + otherDay + '"]').disabled) throw Error('Off-day input should be disabled');
    checkbox.click();
    closeHabitModal();
    startItemFocus('habit', habit.id);
    if (!focusRuntimeByMode.linked.countdown || focusSeconds !== 1783 || runningFocusMode !== 'linked') throw Error('Countdown did not start with weekday target');
    toggleFocus();
    const paused = focusSeconds;
    toggleFocus();
    if (focusSeconds !== paused) throw Error('Resume reset countdown');
    const originalConfirm = confirmHabitCompletionWithServer;
    confirmHabitCompletionWithServer = () => {};
    farmWalletHydrated = true;
    try {
      focusLastTickAt = Date.now() - (paused + 10) * 1000;
      advanceRunningFocusTimer('linked');
      if (runningFocusMode !== null || activeFocus !== null || !isHabitCompleteToday(habit)) throw Error('Target did not complete habit');
      if (getHabitDailyFocusSeconds(habit) !== 2400) throw Error('Countdown exceeded target');
    } finally {
      confirmHabitCompletionWithServer = originalConfirm;
      farmWalletHydrated = false;
      hideFocusAlertBanner();
    }
    return true;
  })()` });
  if (habitFocusEditing.exceptionDetails) throw Error(habitFocusEditing.exceptionDetails.text + ': ' + habitFocusEditing.exceptionDetails.exception?.description);
  assert.equal(habitFocusEditing.result.value, true);
  console.log('Habit weekday target persistence, countdown and resume PASS');
  for (const width of [1440, 390, 320]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    const layout = await call('Runtime.evaluate', { returnByValue: true, expression: `(() => {
      openHabitModal(state.habits.at(-1));
      const form = habitForm.getBoundingClientRect();
      const inputs = [...habitForm.querySelectorAll('[data-habit-focus-weekday]')];
      const fits = inputs.length === 7 && inputs.every(input => {
        const r = input.getBoundingClientRect();
        return r.width > 0 && r.left >= form.left && r.right <= form.right + 1;
      });
      closeHabitModal();
      return fits && document.documentElement.scrollWidth <= innerWidth;
    })()` });
    assert.equal(layout.result.value, true, 'Weekday inputs fit at ' + width + 'px');
  }
  const disableFocus = await call('Runtime.evaluate', { returnByValue: true, expression: `(() => {
    const habit = state.habits.at(-1);
    const recorded = getHabitDailyFocusSeconds(habit);
    openHabitModal(habit);
    habitFocusEnabled.click();
    habitFocusMinutes.value = '';
    habitForm.requestSubmit();
    return habit.measureType === 'amount' && getHabitFocusMinutes(habit) === 0 &&
      getHabitDailyFocusSeconds(habit) === recorded && isHabitCompleteToday(habit);
  })()` });
  assert.equal(disableFocus.result.value, true, 'Disabling focus preserves history and completion');
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
