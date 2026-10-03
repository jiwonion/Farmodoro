const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
function context(names, globals = {}) {
  const ctx = vm.createContext({ console, ...globals });
  for (const name of names) {
    const match = source.match(new RegExp(`(?:async )?function ${name}\\([^]*?^\\}`, "m"));
    assert.ok(match, name);
    vm.runInContext(match[0], ctx);
  }
  // Stubs of toLocalDateString stand for the app's "today"; the 04:00
  // productivity-day helpers follow them unless a test loads the real ones.
  if (!names.includes("toProductivityDateString")) ctx.toProductivityDateString = (...args) => ctx.toLocalDateString(...args);
  if (!names.includes("getProductivityDate")) ctx.getProductivityDate = (instant) => instant ?? new (ctx.Date ?? Date)();
  return ctx;
}
const noop = () => {};
const plain = (value) => JSON.parse(JSON.stringify(value));

test("task Enter submits only after Korean composition finishes and allows Shift Enter", () => {
  const ctx = context(["submitOnEnterUnlessShift"]);
  let submitted = 0;
  let prevented = 0;
  const form = { requestSubmit: () => submitted++ };
  const key = { key: "Enter", preventDefault: () => prevented++ };
  ctx.submitOnEnterUnlessShift({ ...key, isComposing: true }, form);
  ctx.submitOnEnterUnlessShift({ ...key, keyCode: 229 }, form);
  ctx.submitOnEnterUnlessShift({ ...key, shiftKey: true }, form);
  assert.equal(submitted, 0);
  assert.equal(prevented, 0);
  ctx.submitOnEnterUnlessShift(key, form);
  assert.equal(submitted, 1);
  assert.equal(prevented, 1);
});

for (const rpcFirst of [false, true]) {
  test(`habit snapshot cannot suppress or overwrite reward (RPC first: ${rpcFirst})`, async () => {
    const row = { completed_at: null, completion_reward: 0, completion_cycle_id: null };
    let coins = 0;
    const snapshot = { groups: [], tasks: [], habits: [], habitRecords: [{
      habit_id: "habit", record_date: "2026-09-29", progress_value: 1, focus_seconds: 60,
      completed_at: "optimistic", completion_reward: 1,
      completed_with_free_pass: false, completion_cycle_id: "client-cycle",
    }] };
    const ctx = context(["syncTaskDatabaseSnapshot", "throwTaskSyncError"], {
      activeAuthUser: { id: "user" }, taskDataUserId: "user",
      productivityRealtimeMutedUntil: 0, lastTaskSyncSignature: "",
      habitRecordEditsInFlight: new Set(), habitRecordSyncSignatures: new Map(),
      pendingTaskDatabaseDeletes: new Set(), pendingHabitDatabaseDeletes: new Set(),
      pendingGroupDatabaseDeletes: new Set(), syncChangedProductivityRows: async () => {},
      supabaseClient: { from: () => ({ upsert: async (rows) => {
        Object.assign(row, plain(rows[0]));
        return { error: null };
      } }) },
    });
    // Model the server's already-completed guard and atomic reward.
    const complete = () => {
      if (row.completed_at) return;
      Object.assign(row, { completed_at: "server", completion_reward: 1,
        completion_cycle_id: "server-cycle" });
      coins += 1;
    };
    if (rpcFirst) complete();
    await ctx.syncTaskDatabaseSnapshot("user", snapshot);
    complete();
    assert.equal(coins, 1);
    assert.equal(row.completed_at, "server");
    assert.equal(row.completion_cycle_id, "server-cycle");
    assert.equal(row.focus_seconds, 60);
    // An old completed snapshot arriving after undo cannot restore completion.
    row.completed_at = null;
    row.completion_reward = 0;
    row.completion_cycle_id = null;
    ctx.habitRecordSyncSignatures.clear();
    await ctx.syncTaskDatabaseSnapshot("user", snapshot);
    assert.equal(row.completed_at, null);
    assert.equal(row.completion_reward, 0);
  });
}

test("task snapshots cannot upload optimistic completion or overwrite server completion", async () => {
  const writes = [];
  const ctx = context(["syncTaskDatabaseSnapshot"], {
    activeAuthUser: { id: "user" }, taskDataUserId: "user",
    productivityRealtimeMutedUntil: 0, lastTaskSyncSignature: "",
    habitRecordEditsInFlight: new Set(), habitRecordSyncSignatures: new Map(),
    pendingTaskDatabaseDeletes: new Set(), pendingHabitDatabaseDeletes: new Set(),
    pendingGroupDatabaseDeletes: new Set(),
    syncChangedProductivityRows: async (table, rows) => { if (table === "tasks") writes.push(...plain(rows)); },
  });
  await ctx.syncTaskDatabaseSnapshot("user", { groups: [], habits: [], habitRecords: [], tasks: [{
    id: "task", title: "task", status: "done", completed_on: "2026-09-29",
    completion_reward: 1, completed_with_free_pass: false,
    completion_cycle_id: "optimistic", archived_at: null,
  }] });
  assert.deepEqual(writes, [{ id: "task", title: "task", user_id: "user" }]);
});

test("focus reward retries the same event after a lost response", async () => {
  const seen = new Set();
  const attempts = [];
  let coins = 0;
  const ctx = context(["flushFocusTime"], {
    console: { error: noop, warn: noop },
    activeAuthUser: { id: "user" }, focusProgressApiUnavailable: false,
    focusProgressSyncPromise: null, focusProgressServerSeconds: 0,
    focusProgressEventQueue: [{ id: "event", mode: "quick", seconds: 60 }],
    stagePendingFocusEvents: noop, persistPendingFocusEvents: noop, state: { coins: 0 },
    showToast: noop, farmBonusMessage: () => "", refreshFocusProgress: noop, renderFarm: noop,
    supabaseClient: { rpc: async (name, args) => {
      assert.equal(name, "record_my_focus_time_v2");
      attempts.push(args.p_event_id);
      if (!seen.has(args.p_event_id)) {
        seen.add(args.p_event_id);
        coins += 1;
        return { error: { message: "response lost after commit" } };
      }
      return { data: { progressSeconds: 0, coinBalance: coins, awardedCoins: 0 } };
    } },
  });
  await ctx.flushFocusTime();
  assert.equal(ctx.focusProgressEventQueue.length, 1);
  await ctx.flushFocusTime();
  assert.deepEqual(attempts, ["event", "event"]);
  assert.equal(ctx.focusProgressEventQueue.length, 0);
  assert.equal(ctx.state.coins, 1);
});

test("free passes include habits registered without focus time", () => {
  const today = new Date();
  const dateString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const habit = {
    id: "no-focus", title: "물 마시기", measureType: "amount", targetValue: 1,
    weekdays: [1, 2, 3, 4, 5, 6, 7], startDate: dateString, endDate: "",
    completionDates: [], focusSecondsByDate: {},
  };
  const ctx = context([
    "isHabitScheduledOn", "isHabitScheduledToday", "getHabitTargetForDate",
    "getHabitProgress", "getHabitProgressRatio", "isHabitCompleteToday", "getFreePassTargets",
  ], {
    toLocalDateString: () => dateString,
    state: { tasks: [], habits: [
      habit,
      { ...habit, id: "timed", measureType: "time", targetValue: 30 },
      { ...habit, id: "done", completionDates: [dateString] },
      { ...habit, id: "unscheduled", weekdays: [] },
      { ...habit, id: "expired", endDate: "2000-01-01" },
    ] },
  });
  assert.deepEqual(plain(ctx.getFreePassTargets()).map(target => target.value), ["habit:no-focus", "habit:timed"]);
});

function habitDateContext(extra = {}) {
  return context(["canEditHabitRecord", "isHabitScheduledOn", "getHabitTargetForDate", "savePastHabitRecord"], {
    toLocalDateString: (date) => date
      ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
      : "2026-09-10",
    ...extra,
  });
}

const historicalHabit = {
  id: "habit", startDate: "2026-09-01", endDate: "", weekdays: [1, 2, 3, 4, 5, 6, 7],
  measureType: "count", targetValue: 3, targetByWeekday: { 3: 5 },
};

test("habit card date navigation crosses month boundaries and stops at today", () => {
  const ctx = context(["getHabitViewDate", "moveHabitDate"], {
    currentPage: "habits", selectedHabitDate: null,
    toLocalDateString: (date) => date
      ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
      : "2026-03-01",
    renderHabits: noop,
  });
  ctx.moveHabitDate(-1);
  assert.equal(ctx.getHabitViewDate(), "2026-02-28");
  ctx.moveHabitDate(1);
  assert.equal(ctx.selectedHabitDate, null);
  ctx.moveHabitDate(1);
  assert.equal(ctx.getHabitViewDate(), "2026-03-01");
  ctx.selectedHabitDate = "2026-02-27";
  ctx.currentPage = "today";
  assert.equal(ctx.getHabitViewDate(), "2026-03-01");
});

test("past habit card displays binary completion, schedule and focus", () => {
  const elements = new Map();
  const ctx = context([
    "renderHabits", "getHabitViewDate", "isHabitScheduledOn", "getHabitTargetForDate",
    "getHabitProgress", "getHabitProgressRatio", "getHabitStreak", "getHabitDailyFocusSeconds", "getHabitFocusMinutes",
  ], {
    currentPage: "habits", selectedHabitDate: "2026-09-09", habitRecordSaving: false,
    activeFocus: null, escapeHtml: String, formatHabitSchedule: () => "매일",
    formatHabitTargets: () => "", formatFocusTime: String,
    toLocalDateString: (date) => date
      ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
      : "2026-09-10",
    document: { querySelector: (selector) => {
      if (!elements.has(selector)) elements.set(selector, {});
      return elements.get(selector);
    } },
    state: { habits: [
      { ...historicalHabit, title: "물", unit: "회", completionDates: ["2026-09-10"], progressByDate: { "2026-09-09": 2, "2026-09-10": 3 } },
      { ...historicalHabit, id: "new", title: "새 습관", startDate: "2026-09-10", completionDates: [] },
      { ...historicalHabit, id: "off", title: "쉬는 습관", weekdays: [4], completionDates: [] },
      { ...historicalHabit, id: "time", title: "독서", measureType: "time", unit: "분", completionDates: [], focusSecondsByDate: { "2026-09-09": 120, "2026-09-10": 600 } },
    ] },
  });
  ctx.renderHabits();
  const html = elements.get("#habitList").innerHTML;
  assert.match(html, /미완료 · 매일/);
  assert.match(html, /집중 120/);
  assert.doesNotMatch(html, /새 습관|쉬는 습관|data-focus-habit|data-adjust-habit|habit-count-control/);
  assert.equal((html.match(/data-toggle-habit=/g) ?? []).length, 2);
  assert.equal(elements.get("#nextHabitDate").disabled, false);
  ctx.selectedHabitDate = "2026-08-31";
  ctx.renderHabits();
  assert.equal(elements.get("#habitList").innerHTML, "");
});

test("expired habits disappear after their end date but remain visible in past records", () => {
  const elements = new Map();
  const habit = { ...historicalHabit, title: "habit", completionDates: [] };
  const ctx = context(["renderHabits", "getHabitViewDate", "isHabitScheduledOn"], {
    currentPage: "habits", selectedHabitDate: null, habitRecordSaving: false,
    activeFocus: null, escapeHtml: String, formatHabitSchedule: () => "daily",
    formatFocusTime: String, getHabitProgressRatio: () => 0,
    getHabitFocusMinutes: () => 0, getHabitDailyFocusSeconds: () => 0, getHabitStreak: () => 0,
    toLocalDateString: (date) => date
      ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
      : "2026-09-10",
    document: { querySelector: (selector) => {
      if (!elements.has(selector)) elements.set(selector, {});
      return elements.get(selector);
    } },
    state: { habits: [
      { ...habit, id: "expired", endDate: "2026-09-09" },
      { ...habit, id: "ends-today", endDate: "2026-09-10" },
      { ...habit, id: "ongoing" },
      { ...habit, id: "off-day", weekdays: [1] },
    ] },
  });
  const visibleIds = () => [...elements.get("#habitList").innerHTML.matchAll(/data-habit-id="([^"]+)"/g)].map(match => match[1]);
  ctx.renderHabits();
  assert.deepEqual(visibleIds(), ["ends-today", "ongoing", "off-day"]);
  ctx.selectedHabitDate = "2026-09-09";
  ctx.renderHabits();
  assert.deepEqual(visibleIds(), ["expired", "ends-today", "ongoing"]);
  ctx.currentPage = "today";
  ctx.renderHabits();
  assert.deepEqual(visibleIds(), ["ends-today", "ongoing"]);
  assert.equal(ctx.state.habits.length, 4);
});

for (const [year, month, endedDate, boundaryDate] of [
  [2026, 9, "2026-09-30", "2026-10-01"],
  [2027, 0, "2026-12-31", "2027-01-01"],
]) {
  test(`monthly habit log hides ended habits without losing prior records (${boundaryDate})`, () => {
    const elements = new Map([
      ["#habitHeatmapGrid", { style: {} }],
      ["#habitHeatmapMonth", {}],
    ]);
    const habits = [
      { ...historicalHabit, id: "ended", title: "Ended habit", startDate: "2026-09-01", endDate: endedDate, completionDates: [endedDate] },
      { ...historicalHabit, id: "boundary", title: "Boundary habit", endDate: boundaryDate, completionDates: [boundaryDate] },
      { ...historicalHabit, id: "ongoing", title: "Ongoing habit", completionDates: [] },
    ];
    const originalHabits = plain(habits);
    const ctx = context([
      "renderHabitHeatmap", "isHabitScheduledOn", "getHabitTargetForDate",
      "getHabitProgress", "getHabitProgressRatio",
    ], {
      state: { habits }, habitCalendarDate: new Date(year, month, 15),
      lastHabitHeatmapDate: "",
      escapeHtml: String,
      renderHabitMonthlySummary: noop,
      toLocalDateString: (date = new Date(year, month, 15)) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
      document: { querySelector: (selector) => elements.get(selector) },
    });
    const renderedNames = () => [...elements.get("#habitHeatmapGrid").innerHTML.matchAll(/class="heatmap-habit-name" title="([^"]+)"/g)].map(match => match[1]);

    ctx.renderHabitHeatmap();
    assert.deepEqual(renderedNames(), ["Boundary habit", "Ongoing habit"]);
    assert.match(elements.get("#habitHeatmapGrid").innerHTML, new RegExp(`Boundary habit · ${boundaryDate} · 완료`));

    ctx.habitCalendarDate = new Date(year, month - 1, 15);
    ctx.renderHabitHeatmap();
    assert.deepEqual(renderedNames(), ["Ended habit", "Boundary habit", "Ongoing habit"]);
    assert.match(elements.get("#habitHeatmapGrid").innerHTML, new RegExp(`Ended habit · ${endedDate} · 완료`));
    assert.deepEqual(plain(ctx.state.habits), originalHabits);
  });
}

test("checking a past habit saves the displayed date even if navigation changes during the request", async () => {
  let handler;
  let finishSave;
  const calls = [];
  const ctx = vm.createContext({
    document: { querySelector: () => ({ addEventListener: (_event, callback) => { handler = callback; } }) },
    getHabitViewDate: () => "2026-09-09", toLocalDateString: () => "2026-09-10", toProductivityDateString: () => "2026-09-10",
    taskDataHydrated: true, habitRecordSaving: false,
    state: { habits: [historicalHabit] }, canEditHabitRecord: () => true,
    getHabitTargetForDate: () => 1, getHabitProgress: () => 0, getHabitProgressRatio: () => 0,
    renderHabits: noop, showToast: assert.fail,
    savePastHabitRecord: (...args) => {
      calls.push(args);
      return new Promise((resolve) => { finishSave = resolve; });
    },
  });
  const handlerSource = source.match(/document\.querySelector\("#habitList"\)\.addEventListener\("click",[^]*?^\}\);/m);
  assert.ok(handlerSource, "The habit click handler is available independently of farm controls");
  vm.runInContext(handlerSource[0], ctx);
  const button = { dataset: { toggleHabit: "habit" }, disabled: false };
  const event = { target: { closest: (selector) => selector === "[data-toggle-habit]" ? button : null } };
  const pending = handler(event);
  await handler(event);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1], "2026-09-09");
  assert.equal(calls[0][2], 1);
  ctx.getHabitViewDate = () => "2026-09-08";
  finishSave();
  await pending;
  assert.equal(ctx.habitRecordSaving, false);
});

test("past habit records allow yesterday but reject today, future and invalid dates", () => {
  const ctx = habitDateContext();
  assert.equal(ctx.canEditHabitRecord(historicalHabit, "2026-09-09"), true);
  for (const date of ["2026-09-10", "2026-09-11", "2026-08-31", "2026-02-30", "bad"]) {
    assert.equal(ctx.canEditHabitRecord(historicalHabit, date), false, date);
  }
  assert.equal(ctx.canEditHabitRecord({ ...historicalHabit, weekdays: [1] }, "2026-09-09"), false);
  assert.equal(ctx.canEditHabitRecord({ ...historicalHabit, endDate: "2026-09-08" }, "2026-09-09"), false);
});

test("legacy habit targets are normalized to one binary completion", () => {
  const ctx = habitDateContext();
  assert.equal(ctx.getHabitTargetForDate(historicalHabit, "2026-09-09"), 1);
  assert.equal(ctx.getHabitTargetForDate(historicalHabit, "2026-09-10"), 1);
});

test("saving a past record rejects invalid dates and values before writing", async () => {
  const ctx = habitDateContext({ activeAuthUser: { id: "user" } });
  await assert.rejects(ctx.savePastHabitRecord(historicalHabit, "2026-09-11", 1));
  for (const value of [-1, 0.5, 2, NaN]) {
    await assert.rejects(ctx.savePastHabitRecord(historicalHabit, "2026-09-09", value));
  }
});

for (const progress of [0, 1]) {
  test(`saving historical binary value ${progress} preserves today's completion and focus time`, async () => {
    const habit = { ...historicalHabit, completionDates: ["2026-09-10"],
      complete: true, completedDate: "2026-09-10", completionReward: 2,
      progressByDate: { "2026-09-10": 3 }, focusSecondsByDate: { "2026-09-09": 120 },
      recordMetaByDate: { "2026-09-10": { completionReward: 2 } } };
    const calls = [];
    const ctx = habitDateContext({
      activeAuthUser: { id: "user" }, state: { habits: [habit], coins: 10 },
      syncTaskDatabaseImmediately: async () => {}, taskSyncChain: Promise.resolve(),
      farmWalletMutationChain: Promise.resolve(), habitRecordEditsInFlight: new Set(),
      habitRecordSyncSignatures: new Map(), renderHabitUpdates: noop, renderSummary: noop,
      serializeTaskDatabaseState: () => JSON.stringify({ habitRecords: [{ habit_id: "habit", record_date: "2026-09-09", progress_value: progress }] }),
      supabaseClient: {
        rpc: async (name, params) => { calls.push({ name, params }); return { data: { coinBalance: 11 } }; },
        from: () => ({ upsert: (row) => {
          assert.deepEqual(plain(row), { habit_id: "habit", record_date: "2026-09-09", progress_value: progress });
          return { select: () => ({ single: async () => ({ data: {
            progress_value: progress, completed_at: progress === 1 ? "done" : null,
            completion_reward: progress === 1 ? 1 : 0,
          } }) }) };
        } }),
      },
    });
    await ctx.savePastHabitRecord(habit, "2026-09-09", progress);
    assert.equal(calls[0].name, progress === 1 ? "complete_my_habit" : "uncomplete_my_habit");
    assert.equal(calls[0].params.p_record_date, "2026-09-09");
    assert.equal(habit.completedDate, "2026-09-10");
    assert.equal(habit.completionReward, 2);
    assert.equal(habit.progressByDate["2026-09-10"], 3);
    assert.equal(habit.progressByDate["2026-09-09"], progress);
    assert.equal(habit.focusSecondsByDate["2026-09-09"], 120);
    assert.equal(ctx.habitRecordEditsInFlight.size, 0);
  });
}

function timerContext(owner = false, mode = "quick") {
  let now = 100000;
  const ctx = context([
    "advanceRunningFocusTimer", "getFocusTimerDatabasePayload",
    "normalizeFocusTimerRuntime", "applyFocusTimerDatabaseState",
    "resumeFocusTimerAfterBackground", "getHabitDailyFocusSeconds",
    "advanceHabitTimer", "refreshHabitTimerDate", "getHabitFocusMinutes",
  ], {
    Date: class extends Date { static now() { return now; } },
    isFocusTimerOwner: () => owner,
    focusLastTickAt: now,
    focusMode: mode,
    runningFocusMode: mode,
    focusRuntimeByMode: {
      quick: { seconds: 60, phase: "focus", started: true, sessionMinutes: 1 },
      linked: { seconds: 20, phase: "focus", started: true },
    },
    focusTimerOwnerId: owner ? "local" : "remote",
    focusTimerStateGeneration: 0,
    focusTimerLastUpdatedAt: "",
    focusModeUserSelected: false,
    focusProgressApiUnavailable: false,
    focusInterval: null,
    state: { settings: { quick: { focusMinutes: 1 } } },
    activeFocus: mode === "linked" ? { type: "task", id: "task" } : null,
    toLocalDateString: () => "2026-09-13",
    getFocusItem: () => null,
    getFocusFarmTarget: () => ({ plotId: null, cropInstanceId: null }),
    resolveFocusTimerRecoveryPayload: (payload) => payload,
    persistFocusTimerCheckpoint: noop,
    getFocusSettings: () => ({ focusMinutes: 1 }),
    updateActiveFocusCard: noop, updateFocusDisplay: noop,
    updateMiniFocusTimer: noop, updateFocusActionButton: noop,
    renderFocusPicker: noop, updateFocusTarget: noop, renderSummary: noop,
    clearInterval: noop, startFocusTickInterval: noop,
    closeFocusSettings: noop,
    scheduleTaskDatabaseSync: noop, scheduleFocusTimerDatabaseSync: noop,
    flushFocusTime: noop,
    scheduleFarmPushNotification: noop, renderHabits: noop,
    focusSettingsButton: {}, focusSettings: { classList: { add: noop } },
    document: { querySelectorAll: () => [] },
    rewarded: 0, alarms: 0,
  });
  ctx.addFocusSecond = (seconds) => { ctx.rewarded += seconds; };
  ctx.notifyFocusPhaseComplete = () => { ctx.alarms += 1; };
  ctx.elapse = (seconds) => { now += seconds * 1000; };
  ctx.setNow = (value) => { now = value; };
  return ctx;
}

function midnightHabitContext(owner = true) {
  const ctx = timerContext(owner, "linked");
  const start = new Date(2026, 8, 13, 23, 30).getTime();
  ctx.setNow(start);
  ctx.focusLastTickAt = start;
  ctx.toLocalDateString = (date = new Date(ctx.Date.now())) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const habit = { id: "habit", measureType: "time", targetValue: 60, focusSecondsByDate: {} };
  ctx.activeFocus = { type: "habit", id: habit.id };
  ctx.getFocusItem = () => habit;
  ctx.focusRuntimeByMode.linked = {
    seconds: 3600, countdown: true, sessionMinutes: 60,
    date: "2026-09-13", phase: "focus", started: true,
  };
  return { ctx, habit };
}

test("habits and tasks roll over to the next day at 04:00, not midnight", () => {
  const ctx = context(["toLocalDateString", "getProductivityDate", "toProductivityDateString"], { PRODUCTIVITY_DAY_START_HOUR: 4 });
  assert.equal(ctx.toProductivityDateString(new Date(2026, 9, 3, 23, 59)), "2026-10-03");
  assert.equal(ctx.toProductivityDateString(new Date(2026, 9, 4, 0, 0)), "2026-10-03");
  assert.equal(ctx.toProductivityDateString(new Date(2026, 9, 4, 3, 59)), "2026-10-03");
  assert.equal(ctx.toProductivityDateString(new Date(2026, 9, 4, 4, 0)), "2026-10-04");
  assert.equal(ctx.toLocalDateString(new Date(2026, 9, 4, 0, 30)), "2026-10-04", "Calendar dates are unchanged");
});

test("a running habit keeps its session across midnight and records the start day", () => {
  const { ctx, habit } = midnightHabitContext();
  ctx.elapse(40 * 60);
  ctx.advanceRunningFocusTimer("linked");
  assert.deepEqual(habit.focusSecondsByDate, { "2026-09-13": 2400 });
  assert.equal(ctx.focusRuntimeByMode.linked.seconds, 1200);
  assert.equal(ctx.focusRuntimeByMode.linked.date, "2026-09-13");
  assert.equal(ctx.rewarded, 2400);
});

test("pausing after midnight does not reset a session that crossed it", () => {
  const { ctx, habit } = midnightHabitContext();
  habit.targetByWeekday = { 1: 45 };
  ctx.elapse(40 * 60);
  ctx.advanceRunningFocusTimer("linked");
  ctx.runningFocusMode = null;
  assert.equal(ctx.refreshHabitTimerDate(ctx.focusRuntimeByMode.linked, habit), false);
  assert.equal(ctx.focusRuntimeByMode.linked.seconds, 1200);
  assert.equal(ctx.focusRuntimeByMode.linked.date, "2026-09-13");
});

test("once a carried-over session ends the next one uses the new day", () => {
  const { ctx, habit } = midnightHabitContext();
  ctx.elapse(40 * 60);
  ctx.advanceRunningFocusTimer("linked");
  ctx.runningFocusMode = null;
  ctx.focusRuntimeByMode.linked.started = false;
  assert.equal(ctx.refreshHabitTimerDate(ctx.focusRuntimeByMode.linked, habit), true);
  assert.equal(ctx.focusRuntimeByMode.linked.date, "2026-09-14");
  assert.equal(ctx.focusRuntimeByMode.linked.seconds, 3600);
  assert.equal(ctx.focusRuntimeByMode.linked.carryOver, false);
});

test("restoring a running habit after midnight continues the same session", () => {
  const { ctx, habit } = midnightHabitContext();
  const payload = ctx.getFocusTimerDatabasePayload();
  delete payload.runtimes.linked.date; // Older saved timers have no date.
  ctx.elapse(40 * 60);
  ctx.applyFocusTimerDatabaseState(payload);
  assert.equal(ctx.focusRuntimeByMode.linked.seconds, 1200);
  assert.equal(ctx.focusRuntimeByMode.linked.date, "2026-09-13");
  assert.deepEqual(habit.focusSecondsByDate, { "2026-09-13": 2400 });
  assert.equal(ctx.rewarded, 2400);
});

test("restoring yesterday's paused timer uses only today's saved progress", () => {
  const { ctx, habit } = midnightHabitContext();
  ctx.runningFocusMode = null;
  ctx.focusRuntimeByMode.linked.seconds = 1800;
  const payload = ctx.getFocusTimerDatabasePayload();
  habit.focusSecondsByDate = { "2026-09-13": 1800, "2026-09-14": 120 };
  ctx.elapse(40 * 60);
  ctx.applyFocusTimerDatabaseState(payload);
  assert.equal(ctx.focusRuntimeByMode.linked.seconds, 3480);
  assert.equal(ctx.rewarded, 0);
});

test("a follower keeps counting across midnight without writing records or rewards", () => {
  const { ctx, habit } = midnightHabitContext(false);
  ctx.elapse(40 * 60);
  ctx.advanceRunningFocusTimer("linked");
  assert.equal(ctx.focusRuntimeByMode.linked.seconds, 1200);
  assert.deepEqual(habit.focusSecondsByDate, {});
  assert.equal(ctx.rewarded, 0);
});

test("a countdown completed before midnight does not consume the next day's time", () => {
  const { ctx, habit } = midnightHabitContext();
  ctx.focusRuntimeByMode.linked.seconds = 600;
  habit.focusSecondsByDate["2026-09-13"] = 3000;
  let completedDate;
  ctx.finishFocusRuntime = () => { completedDate = ctx.focusRuntimeByMode.linked.date; };
  ctx.elapse(40 * 60);
  assert.equal(ctx.advanceRunningFocusTimer("linked").finished, true);
  assert.equal(completedDate, "2026-09-13");
  assert.deepEqual(habit.focusSecondsByDate, { "2026-09-13": 3600 });
  assert.equal(ctx.rewarded, 600);
});

test("recovering yesterday's completion preserves today's completion fields", () => {
  const calls = [];
  const ctx = context(["applyHabitCompletionChange"], {
    toLocalDateString: () => "2026-09-14", farmWalletHydrated: true,
    state: { coins: 0 }, productionCoinReward: () => 1, createUuid: () => "cycle",
    getHabitTargetForDate: () => 1,
    confirmHabitCompletionWithServer: (...args) => calls.push(args),
  });
  const habit = { measureType: "time", complete: false, completedDate: "",
    completionDates: [], completionReward: 0 };
  ctx.applyHabitCompletionChange(habit, false, true, "2026-09-13");
  assert.deepEqual(plain(habit.completionDates), ["2026-09-13"]);
  assert.equal(habit.complete, false);
  assert.equal(habit.completedDate, "");
  assert.equal(habit.completionReward, 0);
  assert.equal(calls[0][1], "2026-09-13");
});

test("a second device ticks without the owner's heartbeat or duplicate rewards", () => {
  const ctx = timerContext();
  ctx.elapse(12);
  ctx.advanceRunningFocusTimer("quick");
  assert.equal(ctx.focusRuntimeByMode.quick.seconds, 48);
  assert.equal(ctx.rewarded, 0);
});

test("a suspended owner recovers countdown and all overtime", () => {
  const ctx = timerContext(true);
  ctx.elapse(90);
  ctx.resumeFocusTimerAfterBackground();
  assert.equal(ctx.focusRuntimeByMode.quick.seconds, 0);
  assert.equal(ctx.focusRuntimeByMode.quick.overtimeSeconds, 30);
  assert.equal(ctx.rewarded, 90);
  assert.equal(ctx.alarms, 1);
  ctx.elapse(10);
  ctx.advanceRunningFocusTimer("quick");
  assert.equal(ctx.focusRuntimeByMode.quick.overtimeSeconds, 40);
  assert.equal(ctx.alarms, 1);
});

test("reopening on another device derives elapsed time from the saved anchor", () => {
  const ctx = timerContext();
  const payload = ctx.getFocusTimerDatabasePayload();
  ctx.elapse(90);
  ctx.applyFocusTimerDatabaseState(payload, "revision");
  assert.equal(ctx.focusRuntimeByMode.quick.overtimeSeconds, 30);
  assert.equal(ctx.rewarded, 0);
  ctx.elapse(5);
  ctx.advanceRunningFocusTimer("quick");
  assert.equal(ctx.focusRuntimeByMode.quick.overtimeSeconds, 35);
});

test("task stopwatch runs on a follower even before task data arrives", () => {
  const ctx = timerContext(false, "linked");
  ctx.elapse(25);
  ctx.advanceRunningFocusTimer("linked");
  assert.equal(ctx.focusRuntimeByMode.linked.seconds, 45);
  assert.equal(ctx.rewarded, 0);
});

test("habit focus uses saved weekday minutes with a default fallback, separate from completion", () => {
  const ctx = context(["getHabitFocusMinutes", "getHabitTargetForDate"], { toLocalDateString: () => "2026-09-14" });
  const habit = { measureType: "time", targetValue: 25, targetByWeekday: { 1: 40, 3: 15, 7: 60 } };
  assert.equal(ctx.getHabitFocusMinutes(habit, "2026-09-14"), 40);
  assert.equal(ctx.getHabitFocusMinutes(habit, "2026-09-15"), 25);
  assert.equal(ctx.getHabitFocusMinutes(habit, "2026-09-16"), 15);
  assert.equal(ctx.getHabitFocusMinutes(habit, "2026-09-20"), 60);
  assert.equal(ctx.getHabitFocusMinutes(habit, null), 25);
  assert.equal(ctx.getHabitTargetForDate(habit, "2026-09-14"), 1);
  assert.equal(ctx.getHabitFocusMinutes({ measureType: "count", targetValue: 3, targetByWeekday: { 1: 5 } }), 0);
});

test("existing habit stopwatch sessions can finish without changing timer direction", () => {
  const habit = { id: "habit", focusSecondsByDate: { "2026-09-13": 30 } };
  const ctx = timerContext(true, "linked");
  ctx.activeFocus = { type: "habit", id: "habit" };
  ctx.getFocusItem = () => habit;
  ctx.elapse(25);
  ctx.advanceRunningFocusTimer("linked");
  assert.equal(ctx.focusRuntimeByMode.linked.seconds, 45);
  assert.equal(habit.focusSecondsByDate["2026-09-13"], 55);
  assert.equal(ctx.rewarded, 25);
});

test("habit countdown stops at its target and records only the remaining seconds", () => {
  const habit = { id: "habit", focusSecondsByDate: { "2026-09-13": 30 } };
  const ctx = timerContext(true, "linked");
  ctx.activeFocus = { type: "habit", id: "habit" };
  ctx.getFocusItem = () => habit;
  ctx.focusRuntimeByMode.linked = { seconds: 30, countdown: true, sessionMinutes: 1, phase: "focus", started: true };
  let completed = 0;
  ctx.finishFocusRuntime = (mode) => { assert.equal(mode, "linked"); completed++; };
  ctx.elapse(45);
  assert.equal(ctx.advanceRunningFocusTimer("linked").finished, true);
  assert.equal(ctx.focusRuntimeByMode.linked.seconds, 0);
  assert.equal(habit.focusSecondsByDate["2026-09-13"], 60);
  assert.equal(ctx.rewarded, 30);
  assert.equal(completed, 1);
  assert.equal(ctx.alarms, 1);
});

test("habit countdown is preserved on another device without recording duplicate focus", () => {
  const ctx = timerContext(false, "linked");
  ctx.activeFocus = { type: "habit", id: "habit" };
  ctx.focusRuntimeByMode.linked = { seconds: 120, countdown: true, sessionMinutes: 5, phase: "focus", started: true };
  const payload = ctx.getFocusTimerDatabasePayload();
  ctx.elapse(45);
  ctx.applyFocusTimerDatabaseState(payload);
  assert.equal(ctx.focusRuntimeByMode.linked.countdown, true);
  assert.equal(ctx.focusRuntimeByMode.linked.seconds, 75);
  assert.equal(ctx.rewarded, 0);
});

test("reopening a habit countdown recovers elapsed focus without the old one-minute cap", () => {
  const habit = { id: "habit", focusSecondsByDate: { "2026-09-13": 120 } };
  const ctx = timerContext(true, "linked");
  ctx.activeFocus = { type: "habit", id: "habit" };
  ctx.getFocusItem = () => habit;
  ctx.focusRuntimeByMode.linked = { seconds: 180, countdown: true, sessionMinutes: 5, phase: "focus", started: true };
  const payload = ctx.getFocusTimerDatabasePayload();
  ctx.elapse(60);
  ctx.applyFocusTimerDatabaseState(payload);
  assert.equal(ctx.focusRuntimeByMode.linked.seconds, 120);
  assert.equal(habit.focusSecondsByDate["2026-09-13"], 180);
  assert.equal(ctx.rewarded, 60);
});

test("saving while suspended retains the time corresponding to the saved seconds", () => {
  const ctx = timerContext(true);
  ctx.elapse(120);
  assert.equal(Date.parse(ctx.getFocusTimerDatabasePayload().syncedAt), 100000);
});

test("a running timer survives different local duration settings and preserves overtime", () => {
  const ctx = timerContext();
  const payload = ctx.getFocusTimerDatabasePayload();
  payload.runtimes.quick = { seconds: 0, phase: "focus", started: true,
    sessionMinutes: 25, overtime: true, overtimeSeconds: 40 };
  ctx.elapse(10);
  ctx.applyFocusTimerDatabaseState(payload);
  assert.equal(ctx.runningFocusMode, "quick");
  assert.equal(ctx.focusRuntimeByMode.quick.sessionMinutes, 25);
  assert.equal(ctx.focusRuntimeByMode.quick.overtimeSeconds, 50);
});

test("editing one task writes only its changed fields", async () => {
  const writes = [];
  const ctx = context(["syncChangedProductivityRows", "throwTaskSyncError"], {
    supabaseClient: { from: (table) => ({
      update: (changes) => {
        writes.push({ table, changes });
        return { eq: () => ({ eq: async () => ({ error: null }) }) };
      },
      upsert: async (rows) => { writes.push({ table, rows }); return { error: null }; },
    }) },
  });
  const before = [
    { id: "a", title: "first", focus_seconds: 100 },
    { id: "b", title: "second", focus_seconds: 20 },
  ];
  await ctx.syncChangedProductivityRows("tasks", [
    { ...before[0], user_id: "user" },
    { ...before[1], title: "edited", user_id: "user" },
  ], before, "tasks");
  assert.deepEqual(plain(writes), [{ table: "tasks", changes: { title: "edited" } }]);
});

test("a slow task read cannot remove a task added while it was in flight", async () => {
  let resolveRead;
  let reads = 0;
  const state = { groups: [], tasks: [], habits: [] };
  const signature = () => JSON.stringify(state);
  const ctx = context(["loadTaskDataFromDatabase"], {
    activeAuthUser: { id: "user" }, taskDataUserId: "user", taskDataHydrated: true,
    taskDataLoadPromise: null, taskSyncChain: Promise.resolve(),
    lastTaskSyncSignature: signature(), state,
    serializeTaskDatabaseState: signature, serializeTaskRenderSignature: signature,
    runningFocusMode: null, activeFocus: null,
    scheduleProductivityRealtimeRefresh: noop,
    supabaseClient: { rpc: () => {
      reads += 1;
      return new Promise((resolve) => { resolveRead = resolve; });
    } },
  });
  const loading = ctx.loadTaskDataFromDatabase({ id: "user" }, { force: true });
  await new Promise(setImmediate);
  assert.equal(reads, 1);
  assert.equal(ctx.taskDataHydrated, true);
  state.tasks.push({ id: "new", title: "keep me" });
  resolveRead({ data: { groups: [], tasks: [], habits: [] }, error: null });
  await loading;
  assert.equal(state.tasks[0].title, "keep me");
});

test("failed pending writes preserve local tasks instead of reading stale server data", async () => {
  let reads = 0;
  const ctx = context(["loadTaskDataFromDatabase"], {
    console: { error: noop },
    activeAuthUser: { id: "user" }, taskDataUserId: "user", taskDataHydrated: true,
    taskDataLoadPromise: null, taskSyncChain: Promise.resolve(), lastTaskSyncSignature: "old",
    serializeTaskDatabaseState: () => "new",
    syncTaskDatabaseImmediately: async () => { throw new Error("offline"); },
    scheduleTaskDatabaseSync: noop, showToast: noop,
    supabaseClient: { rpc: () => { reads += 1; } },
  });
  await ctx.loadTaskDataFromDatabase({ id: "user" }, { force: true });
  assert.equal(reads, 0);
  assert.equal(ctx.taskDataHydrated, true);
});

test("timer writes compare server revision atomically and reload on conflict", async () => {
  const filters = [];
  let reloaded = false;
  const query = {
    eq: (key, value) => { filters.push([key, value]); return query; },
    select: () => query,
    maybeSingle: async () => ({ data: null, error: null }),
  };
  const ctx = context(["writeFocusTimerDatabase"], {
    activeAuthUser: { id: "user" }, focusTimerDatabaseHydrated: true,
    focusTimerDatabaseUnavailable: false, focusTimerLastUpdatedAt: "revision-1",
    supabaseClient: { from: () => ({ update: () => query }) },
    loadFocusTimerFromDatabase: async () => { reloaded = true; },
  });
  await ctx.writeFocusTimerDatabase("user", { runningMode: "quick" });
  assert.deepEqual(filters, [["user_id", "user"], ["updated_at", "revision-1"]]);
  assert.equal(reloaded, true);
});

test("farm reloads share one request and keep the current farm usable", async () => {
  let resolveRead;
  let reads = 0;
  const ctx = context(["loadFarmDataFromDatabase"], {
    supabaseClient: {}, farmDataLoadPending: null, farmDataHydrated: true,
    fetchFarmDataFromDatabase: () => {
      reads += 1;
      return new Promise((resolve) => { resolveRead = resolve; });
    },
  });
  const first = ctx.loadFarmDataFromDatabase({ id: "user" });
  const second = ctx.loadFarmDataFromDatabase({ id: "user" });
  assert.equal(reads, 1);
  assert.equal(ctx.farmDataHydrated, true);
  resolveRead();
  await Promise.all([first, second]);
  assert.equal(ctx.farmDataLoadPending, null);
});

test("a farm action during a slow reload prevents stale farm data from being applied", async () => {
  let resolveRead;
  const state = { farmName: "new name" };
  const ctx = context(["fetchFarmDataFromDatabase"], {
    activeAuthUser: { id: "user" }, farmDataUserId: "user", farmDataHydrated: true,
    farmDataLoadRequest: 0, farmActionChain: Promise.resolve(), state,
    farmRenderSignature: () => "current",
    supabaseClient: { rpc: () => new Promise((resolve) => { resolveRead = resolve; }) },
  });
  const loading = ctx.fetchFarmDataFromDatabase({ id: "user" });
  await new Promise(setImmediate);
  assert.equal(ctx.farmDataHydrated, true);
  ctx.farmActionChain = Promise.resolve();
  resolveRead({ data: { farm: { farmName: "old name" } }, error: null });
  await loading;
  assert.equal(state.farmName, "new name");
});

function preferencesContext(rpc) {
  const effects = { renders: 0, runtimeLoads: [], toasts: [] };
  const ctx = context(["loadUserPreferences"], {
    console: { error: noop },
    activeAuthUser: { id: "user" }, appStateUserId: "user", appStateHydrated: false,
    state: {
      settings: { quick: { focusMinutes: 25 } }, coins: 34, farmMoney: 250,
      farmName: "Current farm", farmPlots: [{ id: 0, crop: "carrot" }],
      groups: [{ id: "group" }], tasks: [{ id: "task" }], habits: [{ id: "habit" }],
    },
    supabaseClient: { rpc, from: () => assert.fail("Preferences must not read the retired app state table") },
    captureFarmState: () => ({ farmName: ctx.state.farmName, farmPlots: ctx.state.farmPlots }),
    restoreFarmState: farm => Object.assign(ctx.state, farm),
    loadState: saved => ({ settings: saved.settings, coins: 0, farmMoney: 0, groups: [], tasks: [], habits: [] }),
    applyLoadedAppStateRuntime: initial => effects.runtimeLoads.push(initial),
    render: () => effects.renders++, showToast: message => effects.toasts.push(message),
  });
  return { ctx, effects };
}

test("settings-only preferences hydrate while preserving the latest farm, wallet and productivity data", async () => {
  let finishRead;
  const settings = { linked: { focusMinutes: 45, breakEnabled: false, breakMinutes: 5 }, quick: { focusMinutes: 15, breakEnabled: true, breakMinutes: 3 } };
  const { ctx, effects } = preferencesContext(name => {
    assert.equal(name, "get_my_preferences");
    return new Promise(resolve => { finishRead = resolve; });
  });
  const loading = ctx.loadUserPreferences({ id: "user" });
  ctx.state.coins = 39;
  ctx.state.farmMoney = 280;
  const plots = [{ id: 0, crop: "strawberry" }];
  const tasks = [{ id: "new-task" }];
  const groups = ctx.state.groups;
  const habits = ctx.state.habits;
  ctx.state.farmPlots = plots;
  ctx.state.tasks = tasks;
  finishRead({ data: { settings }, error: null });
  await loading;
  assert.deepEqual(plain(ctx.state.settings), settings);
  assert.equal(ctx.state.coins, 39);
  assert.equal(ctx.state.farmMoney, 280);
  assert.equal(ctx.state.farmName, "Current farm");
  assert.equal(ctx.state.farmPlots, plots);
  assert.equal(ctx.state.tasks, tasks);
  assert.equal(ctx.state.groups, groups);
  assert.equal(ctx.state.habits, habits);
  assert.equal(ctx.appStateHydrated, true);
  assert.deepEqual(effects.runtimeLoads, [true]);
  assert.equal(effects.renders, 1);
  assert.equal("focusYoutubePlaylists" in ctx.state, false);
});

test("a preferences response from the previous account cannot replace current settings", async () => {
  let finishRead;
  const { ctx, effects } = preferencesContext(() => new Promise(resolve => { finishRead = resolve; }));
  const loading = ctx.loadUserPreferences({ id: "user" });
  ctx.activeAuthUser = { id: "next-user" };
  ctx.appStateUserId = "next-user";
  const currentState = ctx.state;
  finishRead({ data: { settings: { quick: { focusMinutes: 60 } } }, error: null });
  await loading;
  assert.equal(ctx.state, currentState);
  assert.equal(ctx.appStateHydrated, false);
  assert.equal(effects.renders, 0);
  assert.deepEqual(effects.runtimeLoads, []);
});

test("a missing preferences RPC preserves local data and does not query the retired fallback table", async () => {
  const { ctx, effects } = preferencesContext(async () => ({ data: null, error: { code: "PGRST202" } }));
  const currentState = ctx.state;
  await ctx.loadUserPreferences({ id: "user" });
  assert.equal(ctx.state, currentState);
  assert.equal(ctx.appStateHydrated, false);
  assert.equal(effects.toasts.length, 1);
  assert.equal(effects.renders, 0);
});

test("queued timer writes cannot overwrite a remote state accepted after a conflict", async () => {
  let writes = 0;
  const ctx = context(["syncFocusTimerDatabaseImmediately"], {
    activeAuthUser: { id: "user" }, focusTimerSyncTimer: null,
    focusTimerStateGeneration: 0, focusTimerWritesPending: 0,
    focusTimerWriteChain: Promise.resolve(), getFocusTimerDatabasePayload: () => ({}),
  });
  ctx.writeFocusTimerDatabase = async () => {
    writes += 1;
    ctx.focusTimerStateGeneration += 1;
  };
  await Promise.all([ctx.syncFocusTimerDatabaseImmediately(), ctx.syncFocusTimerDatabaseImmediately()]);
  assert.equal(writes, 1);
  assert.equal(ctx.focusTimerWritesPending, 0);
});
