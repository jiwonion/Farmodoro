const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
const today = "2026-10-28";
const yesterday = "2026-10-27";
const plain = (value) => JSON.parse(JSON.stringify(value));

function habit(id, endDate = "") {
  return {
    id, title: id, startDate: "2026-10-01", endDate,
    weekdays: [1, 2, 3, 4, 5, 6, 7], measureType: "amount", targetValue: 1,
    complete: true, completedDate: yesterday, completionDates: [yesterday],
    progressByDate: { [yesterday]: 1 },
    focusSecondsByDate: { [yesterday]: 360 },
    recordMetaByDate: { [yesterday]: {
      completedAt: `${yesterday}T12:00:00+09:00`, completionReward: 1,
      completedWithFreePass: true, completionCycleId: `${id}-cycle`, completionLevel: "min",
    } },
    completionReward: 1, completedWithFreePass: true,
  };
}

function resetContext(habits, globals = {}) {
  let handler;
  const effects = { syncs: 0, rpcs: [], reloads: [], renders: 0, closes: 0, toasts: [] };
  const button = {
    disabled: false,
    addEventListener: (event, callback) => {
      assert.equal(event, "click");
      handler = callback;
    },
  };
  const signatures = new Map([["existing-record", "synced"]]);
  const ctx = vm.createContext({
    console: { error: () => {} }, confirmHabitReset: button,
    state: { groups: [], tasks: [], habits }, taskDataHydrated: true,
    activeAuthUser: { id: "user" }, activeFocus: null,
    habitRecordSyncSignatures: signatures,
    toProductivityDateString: () => today,
    // Before 04:00, the calendar date is already tomorrow while the productivity day is still today.
    toLocalDateString: () => "2026-10-29",
    syncTaskDatabaseImmediately: async () => { effects.syncs += 1; },
    supabaseClient: { rpc: async (name) => { effects.rpcs.push(name); return { error: null }; } },
    loadTaskDataFromDatabase: async (user, options) => {
      effects.reloads.push({ user: plain(user), options: plain(options), snapshot: JSON.parse(ctx.serializeTaskDatabaseState()) });
    },
    closeHabitResetModal: () => { effects.closes += 1; },
    render: () => { effects.renders += 1; },
    showToast: (message) => effects.toasts.push(message),
    ...globals,
  });
  for (const name of ["getHabitTargetForDate", "serializeTaskDatabaseState"]) {
    const match = source.match(new RegExp(`function ${name}\\([^]*?^\\}`, "m"));
    assert.ok(match, `Application function ${name} exists`);
    vm.runInContext(match[0], ctx);
  }
  const match = source.match(/confirmHabitReset\.addEventListener\("click", async \(\) => \{[^]*?^\}\);/m);
  assert.ok(match, "The habit reset confirmation handler exists");
  vm.runInContext(match[0], ctx);
  return { ctx, effects, button, signatures, reset: () => handler() };
}

test("habit reset preserves ended habits and their saved history while restarting current habits", async () => {
  const expired = habit("expired", yesterday);
  const originals = [expired, habit("ends-today", today), habit("ends-later", "2026-11-01"), habit("ongoing")];
  const before = plain(originals);
  const { ctx, effects, button, signatures, reset } = resetContext(originals);
  const savedBefore = JSON.parse(ctx.serializeTaskDatabaseState());

  await reset();

  assert.deepEqual(plain(ctx.state.habits[0]), before[0], "An ended habit keeps its dates, completion and focus history");
  for (let index = 1; index < originals.length; index += 1) {
    assert.deepEqual(plain(ctx.state.habits[index]), {
      ...before[index], startDate: today, complete: false, completedDate: "", completionDates: [],
      progressByDate: {}, focusSecondsByDate: {}, recordMetaByDate: {},
      completionReward: 0, completedWithFreePass: false,
    });
  }
  const savedAfter = effects.reloads[0].snapshot;
  assert.deepEqual(savedAfter.habits[0], savedBefore.habits[0], "The next sync cannot move an ended habit's start date beyond its end date");
  assert.deepEqual(savedAfter.habitRecords, savedBefore.habitRecords.filter((record) => record.habit_id === expired.id));
  assert.equal(savedAfter.habits.length, 4, "Reset retains ended habits for their historical records");
  assert.deepEqual(effects.rpcs, ["reset_my_habits"]);
  assert.equal(effects.syncs, 1);
  assert.deepEqual(effects.reloads[0].user, { id: "user" });
  assert.deepEqual(effects.reloads[0].options, { force: true });
  assert.equal(effects.closes, 1);
  assert.equal(effects.renders, 1);
  assert.notEqual(ctx.habitRecordSyncSignatures, signatures);
  assert.equal(ctx.habitRecordSyncSignatures.size, 0);
  assert.equal(button.disabled, false);
});

test("habit reset waits for server confirmation before clearing local records", async () => {
  let finishReset;
  let startedReset;
  const resetStarted = new Promise((resolve) => { startedReset = resolve; });
  const original = habit("current");
  const before = plain(original);
  const { ctx, effects, button, reset } = resetContext([original], {
    supabaseClient: { rpc: () => new Promise((resolve) => { finishReset = resolve; startedReset(); }) },
  });
  const pending = reset();
  await resetStarted;
  assert.equal(button.disabled, true);
  assert.deepEqual(plain(ctx.state.habits[0]), before);
  assert.equal(effects.reloads.length, 0);
  finishReset({ error: null });
  await pending;
  assert.deepEqual(plain(ctx.state.habits[0].completionDates), []);
  assert.equal(button.disabled, false);
});

for (const failure of ["pending sync", "reset RPC"]) {
  test(`a failed ${failure} preserves habit history and restores the reset button`, async () => {
    const habits = [habit("expired", yesterday), habit("current")];
    const before = plain(habits);
    const overrides = failure === "pending sync"
      ? { syncTaskDatabaseImmediately: async () => { throw new Error("offline"); } }
      : { supabaseClient: { rpc: async () => ({ error: { message: "offline" } }) } };
    const { ctx, effects, button, signatures, reset } = resetContext(habits, overrides);
    await reset();
    assert.deepEqual(plain(ctx.state.habits), before);
    assert.equal(ctx.habitRecordSyncSignatures, signatures);
    assert.equal(button.disabled, false);
    assert.equal(effects.reloads.length, 0);
    assert.equal(effects.renders, 0);
    assert.equal(effects.closes, 0);
    assert.equal(effects.toasts.length, 1);
    assert.match(effects.toasts[0], /offline/);
    if (failure === "pending sync") assert.deepEqual(effects.rpcs, []);
  });
}

for (const unavailable of [{ taskDataHydrated: false }, { activeAuthUser: null }]) {
  test(`habit reset requires loaded data and an authenticated user (${Object.keys(unavailable)[0]})`, async () => {
    const original = habit("current");
    const before = plain(original);
    const { ctx, effects, button, reset } = resetContext([original], unavailable);
    await reset();
    assert.deepEqual(plain(ctx.state.habits[0]), before);
    assert.equal(effects.syncs, 0);
    assert.deepEqual(effects.rpcs, []);
    assert.equal(effects.reloads.length, 0);
    assert.equal(button.disabled, false);
    assert.equal(effects.toasts.length, 1);
  });
}
