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
  return ctx;
}
const noop = () => {};
const plain = (value) => JSON.parse(JSON.stringify(value));

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

test("past habit records allow yesterday but reject today, future and invalid dates", () => {
  const ctx = habitDateContext();
  assert.equal(ctx.canEditHabitRecord(historicalHabit, "2026-09-09"), true);
  for (const date of ["2026-09-10", "2026-09-11", "2026-08-31", "2026-02-30", "bad"]) {
    assert.equal(ctx.canEditHabitRecord(historicalHabit, date), false, date);
  }
  assert.equal(ctx.canEditHabitRecord({ ...historicalHabit, weekdays: [1] }, "2026-09-09"), false);
  assert.equal(ctx.canEditHabitRecord({ ...historicalHabit, endDate: "2026-09-08" }, "2026-09-09"), false);
});

test("historical targets use the selected weekday instead of today's target", () => {
  const ctx = habitDateContext();
  assert.equal(ctx.getHabitTargetForDate(historicalHabit, "2026-09-09"), 5);
  assert.equal(ctx.getHabitTargetForDate(historicalHabit, "2026-09-10"), 3);
});

test("saving a past record rejects invalid dates and values before writing", async () => {
  const ctx = habitDateContext({ activeAuthUser: { id: "user" } });
  await assert.rejects(ctx.savePastHabitRecord(historicalHabit, "2026-09-11", 3));
  for (const value of [-1, 1.5, 6, NaN]) {
    await assert.rejects(ctx.savePastHabitRecord(historicalHabit, "2026-09-09", value));
  }
});

for (const progress of [2, 5]) {
  test(`saving historical progress ${progress} preserves today's completion and focus time`, async () => {
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
            progress_value: progress, completed_at: progress === 5 ? "done" : null,
            completion_reward: progress === 5 ? 1 : 0,
          } }) }) };
        } }),
      },
    });
    await ctx.savePastHabitRecord(habit, "2026-09-09", progress);
    assert.equal(calls[0].name, progress === 5 ? "complete_my_habit" : "uncomplete_my_habit");
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
    "resumeFocusTimerAfterBackground",
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
    getFocusItem: () => null,
    getFocusSettings: () => ({ focusMinutes: 1 }),
    updateActiveFocusCard: noop, updateFocusDisplay: noop,
    updateMiniFocusTimer: noop, updateFocusActionButton: noop,
    renderFocusPicker: noop, updateFocusTarget: noop, renderSummary: noop,
    clearInterval: noop, startFocusTickInterval: noop,
    scheduleTaskDatabaseSync: noop, scheduleFocusTimerDatabaseSync: noop,
    flushFocusTime: noop,
    focusSettingsButton: {}, focusSettings: { classList: { add: noop } },
    document: { querySelectorAll: () => [] },
    rewarded: 0, alarms: 0,
  });
  ctx.addFocusSecond = (seconds) => { ctx.rewarded += seconds; };
  ctx.notifyFocusPhaseComplete = () => { ctx.alarms += 1; };
  ctx.elapse = (seconds) => { now += seconds * 1000; };
  return ctx;
}

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
