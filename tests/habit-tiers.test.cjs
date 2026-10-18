const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
const today = "2026-10-14";
const yesterday = "2026-10-13";
const noop = () => {};
const plain = (value) => JSON.parse(JSON.stringify(value));

function context(names, globals = {}) {
  const ctx = vm.createContext({ console, habitCompletionRequests: new Map(), toProductivityDateString: () => today, ...globals });
  for (const name of new Set(["hasHabitMinimum", "getHabitGoalTitle", "getHabitDistinctMinimumTitle", ...names])) {
    const match = source.match(new RegExp(`(?:async )?function ${name}\\([^]*?^\\}`, "m"));
    assert.ok(match, `Application function ${name} exists`);
    vm.runInContext(match[0], ctx);
  }
  return ctx;
}

const databaseHabit = {
  id: "english", title: "영어 공부하기", minimum_title: "영어 단어 보기",
  measure_type: "amount", target_value: 1, target_by_weekday: {}, unit: "완료",
  weekdays: [1, 2, 3, 4, 5, 6, 7], start_date: "2026-10-01", end_date: null,
};

function record(date, level, reward) {
  return {
    habit_id: "english", record_date: date, progress_value: level ? 1 : 0,
    focus_seconds: date === today ? 120 : 60,
    completed_at: level ? `${date}T12:00:00+09:00` : null,
    completion_reward: reward, completion_level: level,
    completed_with_free_pass: false, completion_cycle_id: level ? `${date}-cycle` : null,
  };
}

test("minimum and maximum habit records retain their level and coin reward through a database round trip", () => {
  const ctx = context(["mapDatabaseHabit", "serializeTaskDatabaseState"], {
    state: { groups: [], tasks: [], habits: [] }, getHabitTargetForDate: () => 1,
  });
  const rows = [record(yesterday, "min", 1), record(today, "max", 2), record("2026-10-12", null, 0)];
  const habit = ctx.mapDatabaseHabit(databaseHabit, rows);
  assert.equal(habit.minimumTitle, "영어 단어 보기");
  assert.deepEqual(plain(habit.completionDates), [yesterday, today], "Both levels count as a completed habit day");
  assert.equal(habit.recordMetaByDate[yesterday].completionLevel, "min");
  assert.equal(habit.recordMetaByDate[today].completionLevel, "max");
  assert.equal(habit.completionReward, 2);
  ctx.state.habits.push(habit);
  const snapshot = JSON.parse(ctx.serializeTaskDatabaseState());
  assert.equal(snapshot.habits[0].minimum_title, databaseHabit.minimum_title);
  for (const row of rows) {
    const serialized = snapshot.habitRecords.find((entry) => entry.record_date === row.record_date);
    assert.equal(serialized.completion_level, row.completion_level, row.record_date);
    assert.equal(serialized.completion_reward, row.completion_reward, row.record_date);
    assert.equal(serialized.progress_value, row.progress_value, row.record_date);
    assert.equal(serialized.focus_seconds, row.focus_seconds, "Focus history remains independent of completion level");
  }
  const restored = ctx.mapDatabaseHabit(snapshot.habits[0], snapshot.habitRecords);
  assert.equal(restored.minimumTitle, habit.minimumTitle);
  assert.deepEqual(plain(restored.recordMetaByDate), plain(habit.recordMetaByDate));
});

test("a legacy habit keeps its one-coin completion without acquiring a minimum goal", () => {
  const ctx = context(["mapDatabaseHabit", "serializeTaskDatabaseState"], {
    state: { groups: [], tasks: [], habits: [] }, getHabitTargetForDate: () => 1,
  });
  const { minimum_title, ...legacyRow } = databaseHabit;
  const { completion_level, ...legacyRecord } = record(today, "max", 1);
  const habit = ctx.mapDatabaseHabit(legacyRow, [legacyRecord]);
  assert.ok(!habit.minimumTitle);
  assert.equal(habit.complete, true);
  assert.equal(habit.completionReward, 1);
  ctx.state.habits.push(habit);
  const snapshot = JSON.parse(ctx.serializeTaskDatabaseState());
  assert.equal(snapshot.habits[0].minimum_title, null);
  assert.equal(snapshot.habitRecords[0].completion_reward, 1);
});

test("minimum focus minutes persist separately from the maximum and weekday targets", () => {
  const ctx = context(["mapDatabaseHabit", "serializeTaskDatabaseState", "getHabitFocusMinutes"], {
    state: { groups: [], tasks: [], habits: [] }, getHabitTargetForDate: () => 1,
  });
  const row = { ...databaseHabit, measure_type: "time", target_value: 30,
    target_by_weekday: { 3: 45 }, minimum_focus_minutes: 5 };
  const habit = ctx.mapDatabaseHabit(row, [record(today, "min", 1)]);
  assert.equal(habit.minimumFocusMinutes, 5);
  assert.equal(ctx.getHabitFocusMinutes(habit, today, "min"), 5);
  assert.equal(ctx.getHabitFocusMinutes(habit, today, "max"), 45);
  assert.equal(ctx.getHabitFocusMinutes(habit, null, "max"), 30);
  ctx.state.habits.push(habit);
  const saved = JSON.parse(ctx.serializeTaskDatabaseState());
  assert.equal(saved.habits[0].minimum_focus_minutes, 5);
  assert.equal(saved.habits[0].target_value, 30);
  assert.deepEqual(saved.habits[0].target_by_weekday, { 3: 45 });
  const restored = ctx.mapDatabaseHabit(saved.habits[0], saved.habitRecords);
  assert.equal(ctx.getHabitFocusMinutes(restored, today, "min"), 5);
  assert.equal(restored.focusSecondsByDate[today], 120, "A target is separate from recorded focus");
  assert.equal(restored.recordMetaByDate[today].completionLevel, "min");
});

test("minimum focus stays optional for legacy and untimed goals, while a name is optional for timed minima", () => {
  const ctx = context(["mapDatabaseHabit", "serializeTaskDatabaseState", "getHabitFocusMinutes"], {
    state: { groups: [], tasks: [], habits: [] }, getHabitTargetForDate: () => 1,
  });
  const habit = ctx.mapDatabaseHabit({ ...databaseHabit, measure_type: "time", target_value: 30 }, []);
  assert.equal(ctx.getHabitFocusMinutes(habit, today, "min"), 0);
  assert.equal(ctx.getHabitFocusMinutes(habit, today), 30, "Legacy calls still select the maximum target");
  ctx.state.habits.push(habit);
  assert.equal(JSON.parse(ctx.serializeTaskDatabaseState()).habits[0].minimum_focus_minutes, null);
  assert.equal(ctx.getHabitFocusMinutes({ ...habit, minimumFocusMinutes: 5, measureType: "amount" }, today, "min"), 0);
  assert.equal(ctx.getHabitFocusMinutes({ ...habit, minimumFocusMinutes: 5, minimumTitle: "" }, today, "min"), 5);
});

test("a time-only minimum survives database round trips without inventing a second goal name", () => {
  const ctx = context(["mapDatabaseHabit", "serializeTaskDatabaseState", "getHabitFocusMinutes"], {
    state: { groups: [], tasks: [], habits: [] }, getHabitTargetForDate: () => 1,
  });
  const habit = ctx.mapDatabaseHabit({ ...databaseHabit, minimum_title: null,
    measure_type: "time", target_value: 25, minimum_focus_minutes: 5 }, [record(today, "min", 1)]);
  assert.equal(ctx.hasHabitMinimum(habit), true);
  assert.equal(ctx.getHabitGoalTitle(habit, "min"), habit.title);
  assert.equal(ctx.getHabitFocusMinutes(habit, today, "min"), 5);
  assert.equal(ctx.getHabitFocusMinutes(habit, today, "max"), 25);
  assert.equal(habit.recordMetaByDate[today].completionLevel, "min");
  ctx.state.habits.push(habit);
  const snapshot = JSON.parse(ctx.serializeTaskDatabaseState());
  assert.equal(snapshot.habits[0].minimum_title, null);
  assert.equal(snapshot.habits[0].minimum_focus_minutes, 5);
  const restored = ctx.mapDatabaseHabit(snapshot.habits[0], snapshot.habitRecords);
  assert.equal(ctx.hasHabitMinimum(restored), true);
  assert.equal(ctx.getHabitGoalTitle(restored, "min"), habit.title);
  assert.equal(ctx.getHabitFocusMinutes(restored, today, "min"), 5);
  assert.equal(restored.recordMetaByDate[today].completionLevel, "min");
  assert.equal(restored.completionReward, 1);
});

test("a minimum goal needs a name or a valid timed duration", () => {
  const ctx = context([]);
  assert.equal(ctx.hasHabitMinimum({ minimumTitle: "   ", measureType: "time" }), false);
  assert.equal(ctx.hasHabitMinimum({ minimumTitle: "Read one word" }), true);
  for (const invalid of [null, "", 0, -1, 2.5, 10000, "abc"]) {
    assert.equal(ctx.hasHabitMinimum({ minimumTitle: "", measureType: "time", minimumFocusMinutes: invalid }), false, String(invalid));
  }
  assert.equal(ctx.hasHabitMinimum({ minimumTitle: "", measureType: "time", minimumFocusMinutes: 5 }), true);
  assert.equal(ctx.hasHabitMinimum({ minimumTitle: "", measureType: "amount", minimumFocusMinutes: 5 }), false);
});

test("ordinary habit snapshots cannot set or overwrite the server's rewarded completion level", async () => {
  const writes = [];
  const ctx = context(["syncTaskDatabaseSnapshot", "throwTaskSyncError"], {
    activeAuthUser: { id: "user" }, taskDataUserId: "user", productivityRealtimeMutedUntil: 0,
    lastTaskSyncSignature: "", habitRecordEditsInFlight: new Set(), habitRecordSyncSignatures: new Map(),
    pendingTaskDatabaseDeletes: new Set(), pendingHabitDatabaseDeletes: new Set(), pendingGroupDatabaseDeletes: new Set(),
    syncChangedProductivityRows: async () => {},
    supabaseClient: { from: () => ({ upsert: async (rows) => { writes.push(...plain(rows)); return { error: null }; } }) },
  });
  await ctx.syncTaskDatabaseSnapshot("user", {
    groups: [], tasks: [], habits: [], habitRecords: [record(today, "max", 2)],
  });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].focus_seconds, 120);
  for (const protectedColumn of ["completion_level", "completion_reward", "completed_at", "completion_cycle_id"]) {
    assert.equal(protectedColumn in writes[0], false, `${protectedColumn} must be written by the atomic reward RPC`);
  }
});

function completionContext(habit, extra = {}) {
  const confirmations = [];
  const ctx = context([
    "getHabitCompletionLevel", "getHabitCompletionReward", "applyHabitCompletionChange", "toggleHabit",
  ], {
    state: { habits: [habit], coins: 0 }, farmWalletHydrated: true,
    productionCoinReward: () => 1, createUuid: () => "client-cycle",
    isHabitScheduledToday: () => true,
    isHabitCompleteToday: (currentHabit) => currentHabit.completionDates.includes(today),
    getHabitTargetForDate: () => 1,
    confirmHabitCompletionWithServer: (...args) => confirmations.push({ action: "complete", args }),
    confirmHabitUncompletionWithServer: (...args) => confirmations.push({ action: "undo", args }),
    renderHabitUpdates: noop, renderHabits: noop, scheduleTaskDatabaseSync: noop, showToast: noop,
    ...extra,
  });
  return { ctx, confirmations };
}

function emptyHabit(minimumTitle = "영어 단어 보기") {
  return {
    id: "english", title: "영어 공부하기", minimumTitle, measureType: "amount", targetValue: 1,
    completionDates: [], progressByDate: {}, focusSecondsByDate: {}, recordMetaByDate: {},
    complete: false, completedDate: "", completionReward: 0,
  };
}

test("minimum, maximum and tier changes share one coin, which undo returns for the same habit day", () => {
  const habit = emptyHabit();
  const { ctx, confirmations } = completionContext(habit);
  const check = (level, coins, reward) => {
    assert.equal(ctx.getHabitCompletionLevel(habit, today), level);
    assert.equal(ctx.state.coins, coins);
    assert.equal(habit.completionReward, reward);
    assert.deepEqual(plain(habit.completionDates), level ? [today] : []);
    assert.equal(habit.complete, Boolean(level));
    assert.equal(habit.completedDate, level ? today : "");
  };
  ctx.toggleHabit(habit.id, "min");
  check("min", 1, 1);
  ctx.toggleHabit(habit.id, "max");
  check("max", 1, 1);
  ctx.toggleHabit(habit.id, "min");
  check("min", 1, 1);
  ctx.toggleHabit(habit.id, "min");
  check(null, 0, 0);
  assert.deepEqual(confirmations.map(({ action }) => action), ["complete", "complete", "complete", "undo"]);
});

test("completing the maximum first awards one coin, and tier changes never award it twice", () => {
  const habit = emptyHabit();
  const { ctx } = completionContext(habit);
  ctx.toggleHabit(habit.id, "max");
  assert.equal(ctx.getHabitCompletionLevel(habit), "max");
  assert.equal(ctx.state.coins, 1);
  assert.equal(habit.completionReward, 1);
  ctx.toggleHabit(habit.id, "min");
  ctx.toggleHabit(habit.id, "max");
  assert.equal(ctx.state.coins, 1);
  assert.equal(habit.recordMetaByDate[today].completionReward, 1);
  ctx.toggleHabit(habit.id, "max");
  assert.equal(ctx.state.coins, 0);
  assert.equal(habit.complete, false);
});

test("an existing two-coin maximum keeps its awarded amount across tier changes and returns it on undo", () => {
  const habit = emptyHabit();
  Object.assign(habit, {
    complete: true, completedDate: today, completionDates: [today], completionReward: 2,
    recordMetaByDate: { [today]: {
      completionLevel: "max", completionReward: 2, completionCycleId: "historical-cycle",
      completedAt: `${today}T12:00:00+09:00`, completedWithFreePass: false,
    } },
  });
  const { ctx } = completionContext(habit);
  ctx.state.coins = 12;
  ctx.toggleHabit(habit.id, "min");
  assert.equal(ctx.getHabitCompletionLevel(habit), "min");
  assert.equal(ctx.state.coins, 12);
  assert.equal(habit.completionReward, 2);
  ctx.toggleHabit(habit.id, "min");
  assert.equal(ctx.state.coins, 10);
  assert.equal(habit.completionReward, 0);
  assert.equal(habit.complete, false);
});

test("habits without a minimum goal retain one coin and a single completion toggle", () => {
  const habit = emptyHabit("");
  const { ctx } = completionContext(habit);
  ctx.toggleHabit(habit.id);
  assert.equal(ctx.state.coins, 1);
  assert.equal(habit.completionReward, 1);
  assert.equal(habit.complete, true);
  ctx.toggleHabit(habit.id);
  assert.equal(ctx.state.coins, 0);
  assert.equal(habit.complete, false);
});

test("changing a historical level preserves today's completion and refunds the historical reward", () => {
  const habit = emptyHabit();
  const { ctx } = completionContext(habit);
  ctx.toggleHabit(habit.id, "max");
  ctx.applyHabitCompletionChange(habit, false, true, yesterday, "min");
  assert.equal(ctx.state.coins, 2);
  assert.equal(habit.completionReward, 1);
  assert.equal(habit.completedDate, today);
  assert.equal(habit.recordMetaByDate[yesterday].completionReward, 1);
  ctx.applyHabitCompletionChange(habit, true, false, yesterday, "min");
  assert.equal(ctx.state.coins, 1, "Undo refunds yesterday's minimum reward, without taking today's maximum reward");
  assert.equal(habit.completionReward, 1);
  assert.equal(habit.complete, true);
  assert.equal(habit.completedDate, today);
  assert.deepEqual(plain(habit.completionDates), [today]);
});

test("minimum completion cannot change records or award coins before the wallet is ready", () => {
  const habit = emptyHabit();
  const { ctx, confirmations } = completionContext(habit, { farmWalletHydrated: false });
  const before = plain(habit);
  ctx.toggleHabit(habit.id, "min");
  assert.equal(ctx.state.coins, 0);
  assert.deepEqual(plain(habit), before);
  assert.deepEqual(confirmations, []);
});

function useServerConfirmation(ctx, rpc) {
  Object.assign(ctx, {
    console: { error: noop }, activeAuthUser: { id: "user" }, farmWalletUserId: "user",
    farmWalletMutationVersion: 0, farmWalletMutationChain: Promise.resolve(),
    syncTaskDatabaseImmediately: async () => {}, renderSummary: noop, renderFarm: noop,
    recoverHabitCompletionFailure: async () => {},
    supabaseClient: { rpc },
  });
  for (const name of ["confirmHabitCompletionWithServer", "confirmHabitUncompletionWithServer"]) {
    vm.runInContext(source.match(new RegExp(`function ${name}\\([^]*?^\\}`, "m"))[0], ctx);
  }
}

for (const level of ["min", "max", "legacy"]) {
  test(`${level} completion sends the correct server level and accepts its canonical reward`, async () => {
    const habit = emptyHabit(level === "legacy" ? "" : undefined);
    const { ctx } = completionContext(habit);
    const calls = [];
    const requestedLevel = level === "legacy" ? "max" : level;
    const reward = 1;
    useServerConfirmation(ctx, async (name, params) => {
      calls.push({ name, params: plain(params) });
      return { data: {
        coinBalance: 20 + reward, completionReward: reward,
        completionCycleId: "server-cycle", completionLevel: requestedLevel,
        completedAt: "2026-10-14T12:00:00+09:00",
      } };
    });
    ctx.toggleHabit(habit.id, requestedLevel);
    await ctx.farmWalletMutationChain;
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, "complete_my_habit");
    assert.equal(calls[0].params.p_record_date, today);
    assert.equal(calls[0].params.p_progress_value, 1);
    if (level === "legacy") assert.equal("p_completion_level" in calls[0].params, false);
    else assert.equal(calls[0].params.p_completion_level, requestedLevel);
    assert.equal(ctx.state.coins, 20 + reward);
    assert.equal(habit.completionReward, reward);
    assert.equal(habit.recordMetaByDate[today].completionCycleId, "server-cycle");
    assert.equal(habit.recordMetaByDate[today].completionLevel, requestedLevel);
  });
}

for (const [previous, requested] of [[null, "min"], ["min", "max"], ["max", "min"], ["min", "min"]]) {
  test(`failed ${previous || "incomplete"} to ${requested} change restores the previous habit, streak and coin state`, async () => {
    const habit = emptyHabit();
    const { ctx } = completionContext(habit);
    if (previous) ctx.toggleHabit(habit.id, previous);
    const before = plain(habit);
    const previousCoins = ctx.state.coins;
    useServerConfirmation(ctx, async () => ({ error: { message: "Connection lost" } }));
    ctx.toggleHabit(habit.id, requested);
    await ctx.farmWalletMutationChain;
    assert.equal(ctx.state.coins, previousCoins);
    assert.equal(ctx.getHabitCompletionLevel(habit), previous);
    assert.deepEqual(plain(habit), before);
  });
}

test("a late minimum completion response cannot change the next account's wallet or habits", async () => {
  const habit = emptyHabit();
  const { ctx } = completionContext(habit);
  let release;
  let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  useServerConfirmation(ctx, () => {
    markStarted();
    return new Promise((resolve) => { release = resolve; });
  });
  ctx.toggleHabit(habit.id, "min");
  await started;
  ctx.activeAuthUser = { id: "next-user" };
  ctx.farmWalletUserId = "next-user";
  ctx.state = { habits: [], coins: 87 };
  release({ data: { coinBalance: 1, completionReward: 1, completionCycleId: "old-user-cycle", completionLevel: "min" } });
  await ctx.farmWalletMutationChain;
  assert.equal(ctx.state.coins, 87);
  assert.deepEqual(plain(ctx.state.habits), []);
  assert.equal(habit.recordMetaByDate[today].completionCycleId, "client-cycle");
});

test("historical minimum, maximum and undo save the selected date and level while preserving today's record", async () => {
  const habit = emptyHabit();
  Object.assign(habit, {
    complete: true, completedDate: today, completionDates: [today], completionReward: 2,
    focusSecondsByDate: { [yesterday]: 240 },
    recordMetaByDate: { [today]: {
      completionLevel: "max", completionReward: 2, completionCycleId: "today-cycle",
      completedAt: `${today}T12:00:00+09:00`, completedWithFreePass: false,
    } },
  });
  const todayMeta = plain(habit.recordMetaByDate[today]);
  const calls = [];
  let savedLevel = null;
  const ctx = context(["savePastHabitRecord", "serializeTaskDatabaseState"], {
    activeAuthUser: { id: "user" }, state: { groups: [], tasks: [], habits: [habit], coins: 10 },
    canEditHabitRecord: (_habit, date) => date === yesterday, getHabitTargetForDate: () => 1,
    syncTaskDatabaseImmediately: async () => {}, taskSyncChain: Promise.resolve(),
    farmWalletMutationChain: Promise.resolve(), farmWalletMutationVersion: 0,
    habitRecordEditsInFlight: new Set(), habitRecordSyncSignatures: new Map(),
    renderHabitUpdates: noop, renderSummary: noop, showToast: noop,
    supabaseClient: {
      rpc: async (name, params) => {
        calls.push({ name, params: plain(params) });
        savedLevel = name === "uncomplete_my_habit" ? null : params.p_completion_level;
        return { data: { coinBalance: 10 + (savedLevel ? 1 : 0) } };
      },
      from: () => ({ upsert: (row) => {
        assert.deepEqual(plain(row), { habit_id: habit.id, record_date: yesterday, progress_value: savedLevel ? 1 : 0 });
        return { select: () => ({ single: async () => ({ data: record(yesterday, savedLevel, savedLevel ? 1 : 0) }) }) };
      } }),
    },
  });
  for (const level of ["min", "max", "min", null]) {
    await ctx.savePastHabitRecord(habit, yesterday, level ? 1 : 0, level || "max");
    const last = calls.at(-1);
    assert.equal(last.params.p_record_date, yesterday);
    assert.equal(last.name, level ? "complete_my_habit" : "uncomplete_my_habit");
    if (level) assert.equal(last.params.p_completion_level, level);
    assert.equal(habit.recordMetaByDate[yesterday].completionLevel, level);
    assert.equal(habit.recordMetaByDate[yesterday].completionReward, level ? 1 : 0);
    assert.deepEqual(plain(habit.recordMetaByDate[today]), todayMeta);
    assert.equal(habit.completionReward, 2);
    assert.equal(habit.completedDate, today);
    assert.equal(habit.focusSecondsByDate[yesterday], 240);
    assert.equal(ctx.state.coins, 10 + (level ? 1 : 0));
    assert.equal(ctx.habitRecordEditsInFlight.size, 0);
  }
});

test("repeated tier clicks wait for the pending completion, so a failed request cannot leave a false streak", async () => {
  const habit = emptyHabit();
  const { ctx } = completionContext(habit);
  let release;
  let started;
  let calls = 0;
  const ready = new Promise((resolve) => { started = resolve; });
  useServerConfirmation(ctx, () => {
    calls += 1;
    started();
    return new Promise((resolve) => { release = resolve; });
  });
  ctx.toggleHabit(habit.id, "min");
  await ready;
  assert.equal(ctx.habitCompletionRequests.has(`${habit.id}:${today}`), true);
  const pendingState = plain(habit);
  ctx.toggleHabit(habit.id, "max");
  ctx.toggleHabit(habit.id, "min");
  assert.deepEqual(plain(habit), pendingState);
  assert.equal(ctx.state.coins, 1);
  assert.equal(calls, 1);
  release({ error: { message: "Connection lost" } });
  await ctx.farmWalletMutationChain;
  assert.equal(ctx.getHabitCompletionLevel(habit), null);
  assert.equal(habit.complete, false);
  assert.equal(ctx.state.coins, 0);
  assert.equal(ctx.habitCompletionRequests.size, 0);
});

test("habit data preparation starts before joining a blocked wallet queue and the RPC waits for both", async () => {
  const habit = emptyHabit();
  const { ctx } = completionContext(habit);
  let releaseWallet;
  let releasePreparation;
  const events = [];
  useServerConfirmation(ctx, async () => {
    events.push("rpc");
    return { data: { coinBalance: 1, completionReward: 1, completionLevel: "min" } };
  });
  ctx.farmWalletMutationChain = new Promise((resolve) => { releaseWallet = resolve; });
  ctx.syncTaskDatabaseImmediately = () => {
    events.push("prepare");
    return new Promise((resolve) => { releasePreparation = resolve; });
  };
  ctx.toggleHabit(habit.id, "min");
  assert.deepEqual(events, ["prepare"], "Preparation cannot be queued behind the wallet request it must unblock");
  releaseWallet();
  await Promise.resolve();
  assert.deepEqual(events, ["prepare"], "The RPC waits until the habit itself has been saved");
  releasePreparation();
  await ctx.farmWalletMutationChain;
  assert.deepEqual(events, ["prepare", "rpc"]);
});

function useFocusFinish(ctx, habit, completionLevel) {
  Object.assign(ctx, {
    focusRuntimeByMode: { linked: { date: today, seconds: 0, phase: "focus", started: true } },
    getFocusItem: () => habit, focusInterval: null, focusLastTickAt: 1, runningFocusMode: "linked",
    activeFocus: { type: "habit", id: habit.id, ...(completionLevel ? { completionLevel } : {}) }, focusMode: "linked",
    clearInterval: noop, hideFocusAlertBanner: noop, cancelFarmPushNotification: noop,
    updateFocusActionButton: noop, updateFocusDisplay: noop, updateFocusTarget: noop,
    render: noop, scheduleFocusTimerDatabaseSync: noop, flushFocusTime: async () => {},
  });
  if (completionLevel) ctx.focusRuntimeByMode.linked.completionLevel = completionLevel;
  vm.runInContext(source.match(/function finishFocusRuntime\([^]*?^\}/m)[0], ctx);
}

test("finishing minimum and maximum timers awards one coin total for the habit day", () => {
  const habit = emptyHabit();
  Object.assign(habit, { measureType: "time", targetValue: 30, minimumFocusMinutes: 5 });
  const { ctx, confirmations } = completionContext(habit);
  useFocusFinish(ctx, habit, "min");
  ctx.finishFocusRuntime("linked");
  assert.equal(ctx.getHabitCompletionLevel(habit), "min");
  assert.equal(ctx.state.coins, 1);
  assert.equal(habit.completionReward, 1);
  assert.deepEqual(plain(habit.completionDates), [today]);
  useFocusFinish(ctx, habit, "max");
  ctx.finishFocusRuntime("linked");
  assert.equal(ctx.getHabitCompletionLevel(habit), "max");
  assert.equal(ctx.state.coins, 1);
  assert.equal(habit.completionReward, 1);
  assert.equal(confirmations.length, 2);
});

test("time-only minimum and maximum timers share one coin, using the tier-aware server RPC", async () => {
  const habit = emptyHabit("");
  Object.assign(habit, { measureType: "time", targetValue: 25, minimumFocusMinutes: 5 });
  const { ctx } = completionContext(habit);
  const calls = [];
  useServerConfirmation(ctx, async (name, params) => {
    calls.push({ name, params: plain(params) });
    const reward = 1;
    return { data: { coinBalance: reward, completionReward: reward,
      completionLevel: params.p_completion_level, completionCycleId: "time-only-" + params.p_completion_level } };
  });
  useFocusFinish(ctx, habit, "min");
  ctx.finishFocusRuntime("linked");
  await ctx.farmWalletMutationChain;
  assert.equal(ctx.getHabitCompletionLevel(habit), "min");
  assert.equal(ctx.state.coins, 1);
  assert.equal(habit.recordMetaByDate[today].completionReward, 1);
  assert.deepEqual(plain(habit.completionDates), [today]);
  useFocusFinish(ctx, habit, "max");
  ctx.finishFocusRuntime("linked");
  await ctx.farmWalletMutationChain;
  assert.equal(ctx.getHabitCompletionLevel(habit), "max");
  assert.equal(ctx.state.coins, 1);
  assert.equal(habit.recordMetaByDate[today].completionReward, 1);
  assert.deepEqual(calls.map(({ name, params }) => [name, params.p_completion_level]),
    [["complete_my_habit", "min"], ["complete_my_habit", "max"]]);
});

test("a minimum timer finishing after a maximum completion cannot downgrade it", () => {
  const habit = emptyHabit();
  const { ctx, confirmations } = completionContext(habit);
  ctx.toggleHabit(habit.id, "max");
  useFocusFinish(ctx, habit, "min");
  ctx.finishFocusRuntime("linked");
  assert.equal(ctx.getHabitCompletionLevel(habit), "max");
  assert.equal(ctx.state.coins, 1);
  assert.equal(confirmations.length, 1);
});

test("finishing a minimum timer during a pending minimum reward does not upgrade or reward it twice", async () => {
  const habit = emptyHabit();
  const { ctx } = completionContext(habit);
  let release;
  let started;
  const ready = new Promise((resolve) => { started = resolve; });
  const calls = [];
  useServerConfirmation(ctx, (_name, params) => {
    calls.push(params.p_completion_level);
    started();
    return new Promise((resolve) => { release = resolve; });
  });
  ctx.toggleHabit(habit.id, "min");
  await ready;
  useFocusFinish(ctx, habit, "min");
  ctx.finishFocusRuntime("linked");
  release({ data: { coinBalance: 1, completionReward: 1, completionLevel: "min", completionCycleId: "server-min" } });
  await ctx.farmWalletMutationChain;
  await Promise.resolve();
  await ctx.farmWalletMutationChain;
  assert.deepEqual(calls, ["min"]);
  assert.equal(ctx.getHabitCompletionLevel(habit), "min");
  assert.equal(ctx.state.coins, 1);
});

test("finishing a focus target upgrades an already completed minimum habit without an additional coin", () => {
  const habit = emptyHabit();
  const { ctx } = completionContext(habit);
  ctx.toggleHabit(habit.id, "min");
  useFocusFinish(ctx, habit);
  ctx.finishFocusRuntime("linked");
  assert.equal(ctx.getHabitCompletionLevel(habit), "max");
  assert.equal(ctx.state.coins, 1);
  assert.equal(habit.completionReward, 1);
  assert.deepEqual(plain(habit.completionDates), [today]);
  assert.equal(ctx.activeFocus, null);
  assert.equal(ctx.runningFocusMode, null);
});

test("a focus target reached during a pending minimum request upgrades after that request is confirmed", async () => {
  const habit = emptyHabit();
  const { ctx } = completionContext(habit);
  let releaseMinimum;
  let started;
  const calls = [];
  const ready = new Promise((resolve) => { started = resolve; });
  useServerConfirmation(ctx, (_name, params) => {
    calls.push(params.p_completion_level);
    if (params.p_completion_level === "min") {
      started();
      return new Promise((resolve) => { releaseMinimum = resolve; });
    }
    return { data: { coinBalance: 1, completionReward: 1, completionLevel: "max", completionCycleId: "server-max" } };
  });
  ctx.toggleHabit(habit.id, "min");
  await ready;
  useFocusFinish(ctx, habit);
  ctx.finishFocusRuntime("linked");
  assert.equal(ctx.getHabitCompletionLevel(habit), "min", "Timer completion waits for the pending minimum RPC");
  releaseMinimum({ data: { coinBalance: 1, completionReward: 1, completionLevel: "min", completionCycleId: "server-min" } });
  await ctx.farmWalletMutationChain;
  await Promise.resolve();
  await ctx.farmWalletMutationChain;
  assert.deepEqual(calls, ["min", "max"]);
  assert.equal(ctx.getHabitCompletionLevel(habit), "max");
  assert.equal(ctx.state.coins, 1);
  assert.equal(habit.recordMetaByDate[today].completionCycleId, "server-max");
});

test("habit tier rewards and undo preserve an existing negative coin balance exactly", () => {
  const habit = emptyHabit();
  const { ctx } = completionContext(habit);
  ctx.state.coins = -5;
  ctx.toggleHabit(habit.id, "min");
  assert.equal(ctx.state.coins, -4);
  ctx.toggleHabit(habit.id, "max");
  assert.equal(ctx.state.coins, -4);
  ctx.toggleHabit(habit.id, "min");
  assert.equal(ctx.state.coins, -4);
  ctx.toggleHabit(habit.id, "min");
  assert.equal(ctx.state.coins, -5);
});

test("a failed minimum completion restores a negative coin balance instead of clamping it", async () => {
  const habit = emptyHabit();
  const { ctx } = completionContext(habit);
  ctx.state.coins = -5;
  useServerConfirmation(ctx, async (name) => name === "get_my_farm_wallet"
    ? { data: { coin_balance: -5, farm_money_balance: 0 } }
    : { error: { message: "Connection lost" } });
  ctx.toggleHabit(habit.id, "min");
  assert.equal(ctx.state.coins, -4);
  await ctx.farmWalletMutationChain;
  assert.equal(ctx.state.coins, -5);
  assert.equal(ctx.getHabitCompletionLevel(habit), null);
});

test("removing a minimum goal leaves the completed habit's single control ready to undo on its first click", () => {
  const habit = emptyHabit();
  const { ctx, confirmations } = completionContext(habit);
  ctx.toggleHabit(habit.id, "min");
  habit.minimumTitle = "";
  ctx.toggleHabit(habit.id);
  assert.equal(habit.complete, false);
  assert.equal(ctx.getHabitCompletionLevel(habit), null);
  assert.equal(ctx.state.coins, 0);
  assert.deepEqual(confirmations.map(({ action }) => action), ["complete", "undo"]);
});

test("a failed historical tier change queued behind another habit's success retains the authoritative wallet balance", async () => {
  const habitA = emptyHabit();
  habitA.id = "habit-a";
  const habitB = emptyHabit();
  habitB.id = "habit-b";
  Object.assign(habitB, {
    complete: true, completedDate: today, completionDates: [today], completionReward: 2,
    recordMetaByDate: { [today]: {
      completionLevel: "max", completionReward: 2, completionCycleId: "historical-b-cycle",
      completedAt: `${today}T12:00:00+09:00`, completedWithFreePass: false,
    } },
  });
  const { ctx } = completionContext(habitB);
  ctx.state.habits.push(habitA);
  ctx.state.coins = 10;
  let releaseFirst;
  let started;
  const ready = new Promise((resolve) => { started = resolve; });
  useServerConfirmation(ctx, (name, params) => {
    if (name === "get_my_farm_wallet") return { data: { coin_balance: 11, farm_money_balance: 0 } };
    if (params.p_habit_id === habitA.id) {
      started();
      return new Promise((resolve) => { releaseFirst = resolve; });
    }
    return { error: { message: "Downgrade failed" } };
  });
  useFailureRecovery(ctx, () => ({ ...record(today, "max", 2), habit_id: habitB.id }));
  ctx.toggleHabit(habitA.id, "min");
  await ready;
  assert.equal(ctx.state.coins, 11);
  ctx.toggleHabit(habitB.id, "min");
  assert.equal(ctx.state.coins, 11, "Changing a historical tier preserves its previously awarded two coins");
  releaseFirst({ data: { coinBalance: 11, completionReward: 1, completionLevel: "min", completionCycleId: "server-a" } });
  await ctx.farmWalletMutationChain;
  assert.equal(ctx.state.coins, 11, "Failed B must retain A's canonical balance");
  assert.equal(ctx.getHabitCompletionLevel(habitA), "min");
  assert.equal(ctx.getHabitCompletionLevel(habitB), "max");
  assert.equal(habitB.completionReward, 2);
});

function useFailureRecovery(ctx, readRecord) {
  ctx.farmSessionGeneration = 1;
  ctx.supabaseClient.from = () => ({
    select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: readRecord() }) }) }) }),
  });
  for (const name of ["loadFarmWallet", "recoverHabitCompletionFailure"]) {
    const match = source.match(new RegExp(`async function ${name}\\([^]*?^\\}`, "m"));
    assert.ok(match, `${name} is available for authoritative failure recovery`);
    vm.runInContext(match[0], ctx);
  }
}

test("a lost completion reply rereads the committed minimum record and wallet instead of leaving the habit undone", async () => {
  const habit = emptyHabit();
  const { ctx } = completionContext(habit);
  const committed = { ...record(today, "min", 1), completion_cycle_id: "server-committed" };
  useServerConfirmation(ctx, (name) => name === "get_my_farm_wallet"
    ? { data: { coin_balance: 1, farm_money_balance: 0 } }
    : { error: { message: "Response lost after commit" } });
  useFailureRecovery(ctx, () => committed);
  ctx.toggleHabit(habit.id, "min");
  await ctx.farmWalletMutationChain;
  assert.equal(ctx.state.coins, 1);
  assert.equal(ctx.getHabitCompletionLevel(habit), "min");
  assert.equal(habit.complete, true);
  assert.equal(habit.completionReward, 1);
  assert.deepEqual(plain(habit.completionDates), [today]);
  assert.equal(habit.recordMetaByDate[today].completionCycleId, "server-committed");
});
