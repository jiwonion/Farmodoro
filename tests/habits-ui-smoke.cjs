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
    const today = toProductivityDateString();
    if (habit.targetValue !== 45 || habit.measureType !== 'time' || getHabitDailyFocusSeconds(habit) !== 0) throw Error('Target must not create focus records');
    habit.focusSecondsByDate[today] = 617;
    openHabitModal(habit);
    if (habitFocusMinutes.value !== '45') throw Error('Target not restored');
    habitFocusMinutes.value = '30';
    const weekday = getProductivityDate().getDay() || 7;
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
  const minimumFocusEditing = await call('Runtime.evaluate', { returnByValue: true, expression: `(() => {
    const originalConfirm = confirmHabitCompletionWithServer;
    const originalUndo = confirmHabitUncompletionWithServer;
    const originalCoins = state.coins;
    confirmHabitCompletionWithServer = () => {};
    confirmHabitUncompletionWithServer = () => {};
    farmWalletHydrated = true;
    taskDataHydrated = true;
    showPage('habits');
    try {
      openHabitModal();
      if (!habitMinimumFocusMinutes.disabled || habitMinimumFocusMinutes.value !== '') throw Error('Minimum focus must be optional and initially disabled');
      habitInput.value = 'English study';
      habitFocusEnabled.click();
      habitFocusMinutes.value = '25';
      if (habitMinimumFocusMinutes.disabled || !habitMinimumFocusMinutes.getClientRects().length) throw Error('Minimum focus must be available even before a minimum goal name is entered');
      habitMinimumInput.value = 'Read three words';
      habitMinimumInput.dispatchEvent(new Event('input', { bubbles: true }));
      habitForm.requestSubmit();
      const habit = state.habits.at(-1);
      if (habit.minimumFocusMinutes != null || getHabitFocusMinutes(habit, undefined, 'min') !== 0) throw Error('An empty minimum duration must remain optional');
      // A tiered card shows one tier's timer, so show the requested tier first when it is selectable.
      const focusButton = level => {
        document.querySelector('[data-habit-id="' + habit.id + '"] [data-habit-view-level="' + level + '"]')?.click();
        return document.querySelector('[data-focus-habit="' + habit.id + '"][data-focus-level="' + level + '"]');
      };
      if (focusButton('min')) throw Error('An untimed minimum must not acquire a timer');
      openHabitModal(habit);
      habitMinimumFocusMinutes.value = '5';
      habitForm.requestSubmit();
      if (habit.minimumFocusMinutes !== 5 || getHabitFocusMinutes(habit, undefined, 'min') !== 5) throw Error('Minimum focus was not saved');
      if (!focusButton('min') || !focusButton('max')) throw Error('Minimum and maximum focus controls must be available');
      const snapshot = JSON.parse(serializeTaskDatabaseState());
      const row = snapshot.habits.find(row => row.id === habit.id);
      if (row.minimum_focus_minutes !== 5 || mapDatabaseHabit(row, []).minimumFocusMinutes !== 5) throw Error('Minimum focus database round trip failed');
      openHabitModal(habit);
      if (habitMinimumFocusMinutes.value !== '5') throw Error('Editing did not restore minimum focus');
      for (const invalid of ['0', '25', '26', '2.5', '10000']) {
        habitMinimumFocusMinutes.value = invalid;
        habitMinimumFocusMinutes.dispatchEvent(new Event('input', { bubbles: true }));
        habitForm.requestSubmit();
        if (habit.minimumFocusMinutes !== 5 || habit.targetValue !== 25) throw Error('Invalid minimum focus was saved: ' + invalid);
      }
      habitMinimumFocusMinutes.value = '5';
      habitMinimumFocusMinutes.dispatchEvent(new Event('input', { bubbles: true }));
      const weekday = getProductivityDate().getDay() || 7;
      const weekdayInput = habitForm.querySelector('[data-habit-focus-weekday="' + weekday + '"]');
      weekdayInput.value = '4';
      weekdayInput.dispatchEvent(new Event('input', { bubbles: true }));
      habitForm.requestSubmit();
      if (habit.targetByWeekday[weekday] === 4) throw Error('Minimum focus must be shorter than every scheduled maximum');
      weekdayInput.value = '';
      weekdayInput.dispatchEvent(new Event('input', { bubbles: true }));
      habitForm.requestSubmit();
      if (habit.minimumFocusMinutes !== 5) throw Error('Valid minimum focus was not preserved');
      openHabitModal(habit);
      habitMinimumInput.value = '';
      habitMinimumInput.dispatchEvent(new Event('input', { bubbles: true }));
      if (habitMinimumFocusMinutes.disabled || !habitMinimumFocusMinutes.getClientRects().length || habitMinimumFocusMinutes.value !== '5') throw Error('Clearing the optional goal name must preserve its visible minimum focus duration');
      habitForm.requestSubmit();
      if (habit.minimumTitle || habit.minimumFocusMinutes !== 5 || !hasHabitMinimum(habit)) throw Error('A minimum duration must work without a separate goal name');
      const timeOnlySnapshot = JSON.parse(serializeTaskDatabaseState());
      const timeOnlyRow = timeOnlySnapshot.habits.find(row => row.id === habit.id);
      const timeOnlyRestored = mapDatabaseHabit(timeOnlyRow, timeOnlySnapshot.habitRecords.filter(row => row.habit_id === habit.id));
      if (timeOnlyRow.minimum_title !== null || timeOnlyRow.minimum_focus_minutes !== 5 || !hasHabitMinimum(timeOnlyRestored) || getHabitGoalTitle(timeOnlyRestored, 'min') !== habit.title) throw Error('A time-only minimum must round trip using the habit name');
      openHabitModal(habit);
      if (habitMinimumInput.value !== '' || habitMinimumFocusMinutes.value !== '5') throw Error('Editing must restore a blank minimum name and its duration');
      habitForm.requestSubmit();
      renderFocusPicker();
      const pickerOption = level => document.querySelector('[data-focus-value="habit:' + habit.id + (level === 'min' ? ':min' : '') + '"]');
      if (!pickerOption('min') || !pickerOption('max')) throw Error('Focus picker must offer both timed habit levels');
      pickerOption('min').click();
      if (activeFocus?.completionLevel !== 'min' || focusSeconds !== 300 || !document.querySelector('#focusTarget').textContent.includes(habit.title)) throw Error('Focus picker must select the time-only minimum using the habit name and its duration');
      pickerOption('max').click();
      if ((activeFocus?.completionLevel || 'max') !== 'max' || focusSeconds !== 1500) throw Error('Focus picker did not restore the maximum goal and its duration');
      focusButton('min').click();
      if (activeFocus?.completionLevel !== 'min' || focusRuntimeByMode.linked.completionLevel !== 'min' || focusSeconds !== 300) throw Error('Minimum focus did not start its five-minute countdown');
      focusLastTickAt = Date.now() - 60 * 1000;
      advanceRunningFocusTimer('linked');
      toggleFocus();
      const paused = focusSeconds;
      const savedRuntime = getFocusTimerDatabasePayload();
      if (savedRuntime.activeFocus?.completionLevel !== 'min' || savedRuntime.runtimes.linked.completionLevel !== 'min') throw Error('Paused minimum timer lost its saved level');
      applyFocusTimerDatabaseState(savedRuntime);
      if (activeFocus?.completionLevel !== 'min' || focusSeconds !== paused) throw Error('Restoring a paused minimum timer changed its level or remaining time');
      toggleFocus();
      if (focusSeconds !== paused) throw Error('Resuming a minimum timer restarted it');
      focusLastTickAt = Date.now() - (paused + 10) * 1000;
      advanceRunningFocusTimer('linked');
      if (runningFocusMode !== null || activeFocus !== null || getHabitCompletionLevel(habit) !== 'min' || state.coins !== originalCoins + 1) throw Error('Minimum timer must complete the minimum goal for one coin');
      if (getHabitDailyFocusSeconds(habit) !== 300 || focusButton('min')) throw Error('Minimum timer exceeded its target or stayed available after completion');
      focusButton('max').click();
      if ((activeFocus?.completionLevel || 'max') !== 'max' || focusSeconds !== 1200) throw Error('Maximum focus must continue from the five minutes already recorded');
      focusLastTickAt = Date.now() - 1210 * 1000;
      advanceRunningFocusTimer('linked');
      if (getHabitCompletionLevel(habit) !== 'max' || state.coins !== originalCoins + 1 || getHabitDailyFocusSeconds(habit) !== 1500) throw Error('Maximum timer must add the remaining time while keeping the habit reward at one coin total');
      return true;
    } finally {
      closeHabitModal();
      confirmHabitCompletionWithServer = originalConfirm;
      confirmHabitUncompletionWithServer = originalUndo;
      state.coins = originalCoins;
      farmWalletHydrated = false;
      hideFocusAlertBanner();
    }
  })()` });
  if (minimumFocusEditing.exceptionDetails) throw Error(minimumFocusEditing.exceptionDetails.exception?.description || minimumFocusEditing.exceptionDetails.text);
  assert.equal(minimumFocusEditing.result.value, true);
  console.log('Optional minimum names, time-only minimum focus, validation, persistence, pause/restore/resume and minimum-to-maximum rewards PASS');
  for (const width of [1920, 1440, 390, 320]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    const layout = await call('Runtime.evaluate', { returnByValue: true, expression: `(() => {
      openHabitModal(state.habits.at(-1));
      const form = habitForm.getBoundingClientRect();
      const inputs = [...habitForm.querySelectorAll('[data-habit-focus-weekday]')];
      const fits = inputs.length === 7 && inputs.every(input => {
        const r = input.getBoundingClientRect();
        return r.width > 0 && r.left >= form.left && r.right <= form.right + 1;
      });
      const minimum = habitMinimumInput.getBoundingClientRect();
      const minimumFits = minimum.width > 0 && minimum.left >= form.left && minimum.right <= form.right + 1;
      const minimumFocus = habitMinimumFocusMinutes.getBoundingClientRect();
      const minimumFocusFits = minimumFocus.width > 0 && minimumFocus.left >= form.left && minimumFocus.right <= form.right + 1;
      closeHabitModal();
      const originalHabits = state.habits;
      const sample = { ...originalHabits.at(-1), id: 'tier-layout-preview', title: '영어 문장을 읽고 직접 말하기 연습하기', minimumTitle: '아주 바쁜 날에도 영어 단어 세 개는 꼭 읽어보기',
        measureType: 'time', targetValue: 25, targetByWeekday: {}, minimumFocusMinutes: 5,
        completionDates: [], recordMetaByDate: {}, progressByDate: {}, focusSecondsByDate: {}, complete: false };
      const timeOnly = { ...sample, id: 'time-only-layout-preview', title: '독서', minimumTitle: '' };
      const untimed = { ...sample, id: 'single-layout-preview', title: '비타민 챙겨 먹기', minimumTitle: '', measureType: 'amount', minimumFocusMinutes: null };
      try {
        if (!fits || !minimumFits || !minimumFocusFits) throw Error('Habit form controls exceed their container');
        state.habits = [untimed, sample, timeOnly];
        for (const page of ['habits', 'today']) {
          showPage(page);
          renderHabits();
          const list = document.querySelector('#habitList');
          const listRect = list.getBoundingClientRect();
          const cards = [...list.querySelectorAll('[data-habit-id]')];
          if (cards.length !== 3) throw Error(page + ': all three habits must remain visible');
          let previousBottom = -Infinity;
          for (const card of cards) {
            const r = card.getBoundingClientRect();
            if (Math.abs(r.left - listRect.left) > 1 || Math.abs(r.width - listRect.width) > 2 || r.top < previousBottom - 1) throw Error(page + ': habit articles must form one full-width column');
            previousBottom = r.bottom;
          }
          for (const habit of [sample, timeOnly]) {
            for (const [level, name, minutes] of [['max', habit.title, 25], ['min', habit.minimumTitle || habit.title, 5]]) {
              if (level === 'min') document.querySelector('[data-habit-id="' + habit.id + '"] [data-habit-view-level="min"]').click();
              const card = document.querySelector('[data-habit-id="' + habit.id + '"]');
              const cardRect = card.getBoundingClientRect();
              const checks = [...card.querySelectorAll('.habit-check[data-toggle-habit]')];
              const focusButtons = [...card.querySelectorAll('[data-focus-habit]')];
              const tierSwitch = card.querySelector('.habit-tier-switch');
              if (card.querySelector('input[type="checkbox"], .habit-goal-row') || checks.length !== 1 || focusButtons.length !== 1 || !tierSwitch) throw Error(page + ': a tiered habit needs one check, one focus control and a tier switch');
              if (card.dataset.habitViewTier !== level || checks[0].dataset.habitLevel !== level || focusButtons[0].dataset.focusLevel !== level) throw Error(page + ': the check and focus controls must follow the shown tier');
              const title = card.querySelector('.habit-copy > strong');
              if (title?.textContent.trim() !== name || card.querySelector('.habit-tier-badge') || !card.querySelector('.habit-summary').textContent.includes('목표 ' + minutes + '분')) throw Error(page + ': the shown goal must retain its name and target time without a tier badge');
              if (!checks[0].getAttribute('aria-label')?.includes(name)) throw Error(page + ': the check needs the shown goal name');
              for (const control of [...checks, ...focusButtons, tierSwitch]) {
                const r = control.getBoundingClientRect();
                if (!r.width || r.left < cardRect.left || r.right > cardRect.right + 1) throw Error(page + ': tier controls exceed the habit article');
              }
              if (tierSwitch.scrollWidth > tierSwitch.clientWidth + 1) throw Error(page + ': the tier switch label must fit');
              const style = getComputedStyle(title);
              const r = title.getBoundingClientRect();
              if (parseFloat(style.fontSize) < 15 || Number(style.opacity) < 1 || !r.width || !r.height || r.left < cardRect.left || r.right > cardRect.right + 1) throw Error(page + ': goal names must remain readable and wrap fully');
            }
          }
          habitTierViewLevels.clear();
          renderHabits();
          if (document.documentElement.scrollWidth > innerWidth) throw Error(page + ': habit list causes horizontal overflow');
        }
        return true;
      } finally {
        state.habits = originalHabits;
        showPage('habits');
        renderHabits();
      }
    })()` });
    assert.equal(layout.exceptionDetails, undefined, JSON.stringify(layout.exceptionDetails));
    assert.equal(layout.result.value, true, 'Habit form, one-column lists and readable goal names/times fit at ' + width + 'px');
    console.log(width + 'px: one-column habits/today lists, readable maximum/minimum names and time-only goals PASS');
  }
  if (process.env.HABIT_FOCUS_SCREENSHOTS) {
    fs.accessSync(process.env.HABIT_FOCUS_SCREENSHOTS);
    for (const [label, width] of [['desktop', 1440], ['mobile', 390]]) {
      await call('Emulation.setDeviceMetricsOverride', { width, height: 1100, deviceScaleFactor: 1, mobile: false });
      await call('Runtime.evaluate', { expression: `(() => {
        window.__habitFocusScreenshotHabits = state.habits;
        const today = toProductivityDateString();
        const base = { ...state.habits.at(-1), startDate: today.slice(0, 8) + '01', endDate: '', weekdays: [1, 2, 3, 4, 5, 6, 7],
          measureType: 'time', targetValue: 25, targetByWeekday: {}, minimumFocusMinutes: 5,
          completionDates: [today], progressByDate: { [today]: 1 }, focusSecondsByDate: { [today]: 300 },
          recordMetaByDate: { [today]: { completionLevel: 'min', completionReward: 1 } },
          complete: true, completedDate: today, completionReward: 1 };
        state.habits = [
          { ...base, id: 'preview-english', title: '영어 공부하기', minimumTitle: '영어 단어 보기' },
          { ...base, id: 'preview-reading', title: '독서', minimumTitle: '', completionDates: [], progressByDate: {}, recordMetaByDate: {}, focusSecondsByDate: {}, complete: false },
          { ...base, id: 'preview-exercise', title: '운동', minimumTitle: '스트레칭', measureType: 'amount', minimumFocusMinutes: null,
            recordMetaByDate: { [today]: { completionLevel: 'max', completionReward: 2 } }, completionReward: 2, focusSecondsByDate: {} },
          { ...base, id: 'preview-vitamin', title: '비타민 챙겨 먹기', minimumTitle: '', measureType: 'amount', minimumFocusMinutes: null,
            recordMetaByDate: { [today]: { completionLevel: 'max', completionReward: 1 } }, completionReward: 1, focusSecondsByDate: {} }
        ];
        showPage('habits');
        renderHabitUpdates();
        closeHabitModal();
        clearTimeout(toastTimer);
        toast.classList.remove('show');
        document.activeElement?.blur();
        scrollTo(0, 0);
      })()` });
      const content = await call('Page.getLayoutMetrics');
      await call('Emulation.setDeviceMetricsOverride', { width, height: Math.ceil(content.cssContentSize.height), deviceScaleFactor: 1, mobile: false });
      await pause(100);
      const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      fs.writeFileSync(path.join(process.env.HABIT_FOCUS_SCREENSHOTS, 'habit-goals-checkboxes-' + label + '.png'), Buffer.from(shot.data, 'base64'));
      await call('Runtime.evaluate', { expression: `
        closeHabitModal();
        state.habits = window.__habitFocusScreenshotHabits;
        delete window.__habitFocusScreenshotHabits;
        renderHabitUpdates();
      ` });
    }
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
  assert.equal(disableFocus.exceptionDetails, undefined, JSON.stringify(disableFocus.exceptionDetails));
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
