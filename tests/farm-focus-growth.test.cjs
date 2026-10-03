const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
const noop = () => {};
const plain = (value) => JSON.parse(JSON.stringify(value));

function context(names, globals = {}) {
  const ctx = vm.createContext({ console, ...globals });
  for (const name of names) {
    const match = source.match(new RegExp(`(?:async )?function ${name}\\([^]*?^\\}`, "m"));
    assert.ok(match, `app.js must provide ${name}`);
    vm.runInContext(match[0], ctx);
  }
  return ctx;
}

function timerContext(phase, ownsTimer) {
  const credited = [];
  const ctx = context(["advanceRunningFocusTimer"], {
    Date: class extends Date { static now() { return 100_000; } },
    focusLastTickAt: 75_000,
    focusRuntimeByMode: {
      quick: { phase, seconds: 1_500, countdown: true, overtime: false },
    },
    isFocusTimerOwner: () => ownsTimer,
    getFocusItem: () => null,
    activeFocus: null,
    focusMode: "quick",
    focusSeconds: 1_500,
    timerPhase: phase,
    addFocusSecond: (seconds, mode) => credited.push({ seconds, mode }),
    updateActiveFocusCard: noop,
    updateFocusDisplay: noop,
    updateMiniFocusTimer: noop,
  });
  return { ctx, credited };
}

test("only the owning tab's actual focus time earns timer rewards", () => {
  const owner = timerContext("focus", true);
  owner.ctx.advanceRunningFocusTimer("quick");
  assert.deepEqual(owner.credited, [{ seconds: 25, mode: "quick" }]);

  const follower = timerContext("focus", false);
  follower.ctx.advanceRunningFocusTimer("quick");
  assert.deepEqual(follower.credited, []);
});

test("break time never earns focus rewards", () => {
  const { ctx, credited } = timerContext("break", true);
  ctx.advanceRunningFocusTimer("quick");
  assert.deepEqual(credited, []);
  assert.equal(ctx.focusRuntimeByMode.quick.seconds, 1_475);
});

test("focus batches earn rewards without using a saved crop target", () => {
  let nextId = 0;
  const ctx = context(["getPendingFocusSeconds", "addFocusSecond", "stagePendingFocusEvents"], {
    focusMode: "quick",
    focusProgressApiUnavailable: false,
    focusProgressServerSeconds: 0,
    state: { focusRewardSeconds: 0, focusFarmPlotId: 0, farmPlots: [
      { id: 0, crop: "carrot", growth: 1, focusCropInstanceId: "crop-a" },
    ] },
    pendingFocusSeconds: { linked: 0, quick: 0 },
    pendingFarmFocusBatches: [],
    focusProgressEventQueue: [],
    getFocusFarmTarget: () => assert.fail("focus rewards must not inspect the old crop target"),
    crypto: { randomUUID: () => `focus-event-${++nextId}` },
    persistPendingFocusEvents: noop,
  });
  ctx.addFocusSecond(625, "quick");
  ctx.state.focusFarmPlotId = 1;
  ctx.addFocusSecond(35, "linked", { plotId: 1, cropInstanceId: "old-recovery-target" });
  ctx.state.focusFarmPlotId = 0;
  ctx.addFocusSecond(60, "quick");
  assert.equal(ctx.getPendingFocusSeconds(), 720);

  ctx.stagePendingFocusEvents();
  const events = plain(ctx.focusProgressEventQueue);
  assert.equal(events.length, 4);
  assert.ok(events.every((event) => event.seconds <= 600 && event.seconds > 0));
  assert.ok(events.every((event) => event.plotId == null && event.cropInstanceId == null),
    "new events never carry planting identities, including a legacy recovery override");
  assert.equal(events.filter((event) => event.mode === "quick")
    .reduce((sum, event) => sum + event.seconds, 0), 685);
  assert.equal(events.filter((event) => event.mode === "linked")
    .reduce((sum, event) => sum + event.seconds, 0), 35);
  assert.deepEqual(plain(ctx.pendingFocusSeconds), { linked: 0, quick: 0 });
  assert.equal(ctx.pendingFarmFocusBatches.length, 0);
  assert.equal(ctx.getPendingFocusSeconds(), 720);

  ctx.stagePendingFocusEvents();
  assert.deepEqual(plain(ctx.focusProgressEventQueue), events,
    "retrying an already staged batch keeps its reward idempotency keys");
  assert.equal(ctx.state.farmPlots[0].growth, 1);
});

test("a legacy queued event retries with no crop target and grants its Coin reward once", async () => {
  const attempts = [];
  const seen = new Set();
  let persistedSeconds = 0;
  let serverCoins = 7;
  const plot = { id: 0, crop: "carrot", growth: 1, focusGrowthSeconds: 300,
    focusCropInstanceId: "crop-a" };
  const ctx = context(["flushFocusTime"], {
    console: { error: noop, warn: noop },
    activeAuthUser: { id: "user" },
    focusProgressApiUnavailable: false,
    focusProgressSyncPromise: null,
    focusProgressServerSeconds: 0,
    focusProgressEventQueue: [{
      id: "same-event", mode: "quick", seconds: 600,
      plotId: 0, cropInstanceId: "crop-a",
    }],
    stagePendingFocusEvents: noop,
    persistPendingFocusEvents: noop,
    state: { coins: 7, focusFarmPlotId: 0, farmPlots: [plot] },
    showToast: noop,
    farmBonusMessage: () => "",
    refreshFocusProgress: noop,
    renderFarm: noop,
    applyFocusFarmResult: noop,
    supabaseClient: { rpc: async (name, args) => {
      attempts.push({ name, ...plain(args) });
      if (!seen.has(args.p_event_id)) {
        seen.add(args.p_event_id);
        persistedSeconds += args.p_elapsed_seconds;
        serverCoins += 1;
        if (args.p_plot_index === plot.id && args.p_crop_instance_id === plot.focusCropInstanceId) {
          plot.focusGrowthSeconds += args.p_elapsed_seconds;
        }
        return { error: { message: "response lost after commit" } };
      }
      return { data: {
        progressSeconds: 500, coinBalance: serverCoins, awardedCoins: 0,
        focusFarm: { plotId: 0, todaySeconds: persistedSeconds },
      } };
    } },
  });
  await ctx.flushFocusTime();
  assert.equal(ctx.focusProgressEventQueue.length, 1);
  await ctx.flushFocusTime();
  assert.equal(ctx.focusProgressEventQueue.length, 0);
  assert.deepEqual(attempts[1], attempts[0]);
  assert.equal(attempts[0].name, "record_my_focus_time_v2");
  assert.equal(attempts[0].p_plot_index, null);
  assert.equal(attempts[0].p_crop_instance_id, null);
  assert.equal(persistedSeconds, 600);
  assert.equal(ctx.state.coins, 8);
  assert.equal(serverCoins, 8);
  assert.equal(plot.growth, 1);
  assert.equal(plot.focusGrowthSeconds, 300);
});

test("reopening preserves legacy focus seconds and event identities without crop attribution", () => {
  const storage = new Map();
  let nextId = 0;
  function recoveredContext() {
    return context(["persistPendingFocusEvents", "restorePendingFocusEvents", "stagePendingFocusEvents"], {
      activeAuthUser: { id: "user" },
      focusOutboxUserId: null,
      focusRecoveryTimerCheckpoint: null,
      FOCUS_TIMER_CLIENT_ID: "local",
      isFocusTimerOwner: () => false,
      state: { farmPlots: [{ id: 0 }, { id: 1 }] },
      pendingFocusSeconds: { quick: 0, linked: 0 },
      pendingFarmFocusBatches: [],
      focusProgressEventQueue: [],
      crypto: { randomUUID: () => `recovered-event-${++nextId}` },
      localStorage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: (key) => storage.delete(key),
      },
    });
  }
  const beforeClosing = recoveredContext();
  beforeClosing.focusProgressEventQueue.push({
    id: "unacknowledged-event", mode: "quick", seconds: 600,
    plotId: 0, cropInstanceId: "crop-a",
  });
  beforeClosing.pendingFarmFocusBatches.push({
    mode: "linked", seconds: 40, plotId: 1, cropInstanceId: "crop-b",
  });
  beforeClosing.persistPendingFocusEvents();

  const reopened = recoveredContext();
  reopened.restorePendingFocusEvents("user");
  reopened.restorePendingFocusEvents("user");
  assert.equal(reopened.focusProgressEventQueue.length, 1);
  const recoveredEvent = reopened.focusProgressEventQueue[0];
  assert.equal(recoveredEvent.id, "unacknowledged-event");
  assert.equal(recoveredEvent.mode, "quick");
  assert.equal(recoveredEvent.seconds, 600);
  assert.equal(recoveredEvent.plotId ?? null, null);
  assert.equal(recoveredEvent.cropInstanceId ?? null, null);
  assert.deepEqual(plain(reopened.pendingFocusSeconds), { quick: 0, linked: 40 });
  assert.equal(reopened.pendingFarmFocusBatches.length, 1);
  reopened.stagePendingFocusEvents();
  assert.equal(reopened.focusProgressEventQueue[0].id, "unacknowledged-event");
  assert.equal(reopened.focusProgressEventQueue[1].id, "recovered-event-1");
  assert.equal(reopened.focusProgressEventQueue[1].mode, "linked");
  assert.equal(reopened.focusProgressEventQueue[1].seconds, 40);
  assert.ok(reopened.focusProgressEventQueue.every((event) => event.plotId == null && event.cropInstanceId == null));
  const reopenedAgain = recoveredContext();
  reopenedAgain.restorePendingFocusEvents("user");
  assert.deepEqual(plain(reopenedAgain.focusProgressEventQueue), plain(reopened.focusProgressEventQueue));
  assert.equal(reopenedAgain.pendingFarmFocusBatches.length, 0);
  assert.deepEqual(plain(reopenedAgain.pendingFocusSeconds), { quick: 0, linked: 0 });
});

function recoveryFixture(itemType = null) {
  const start = Date.parse("2026-10-02T00:00:00Z");
  let now = start;
  let nextId = 0;
  const storage = new Map();
  function open(clientId = "local") {
    const item = itemType === "task"
      ? { id: "task", focusSeconds: 120 }
      : itemType === "habit"
      ? { id: "habit", measureType: "time", targetValue: 25,
        focusSecondsByDate: { "2026-10-01": 60, "2026-10-02": 120 } }
      : null;
    const mode = item ? "linked" : "quick";
    const ctx = context([
      "getFocusTimerDatabasePayload", "normalizeFocusTimerRuntime", "applyFocusTimerDatabaseState",
      "advanceRunningFocusTimer", "persistPendingFocusEvents", "restorePendingFocusEvents",
      "persistFocusTimerCheckpoint", "resolveFocusTimerRecoveryPayload", "addFocusSecond",
      "getPendingFocusSeconds", "stagePendingFocusEvents",
      "getHabitDailyFocusSeconds", "getHabitFocusMinutes", "refreshHabitTimerDate", "advanceHabitTimer",
    ], {
      Date: class extends Date { static now() { return now; } },
      activeAuthUser: { id: "user" },
      FOCUS_TIMER_CLIENT_ID: clientId,
      focusTimerOwnerId: clientId,
      focusOutboxUserId: null,
      focusRecoveryTimerCheckpoint: null,
      focusTimerStateGeneration: 0,
      focusTimerLastUpdatedAt: "",
      focusModeUserSelected: false,
      focusProgressApiUnavailable: false,
      focusProgressServerSeconds: 0,
      focusLastTickAt: start,
      focusInterval: null,
      focusMode: mode,
      runningFocusMode: mode,
      activeFocus: item ? { type: itemType, id: item.id } : null,
      focusRuntimeByMode: {
        quick: { seconds: 1_500, phase: "focus", started: true, countdown: true, sessionMinutes: 25 },
        linked: { seconds: itemType === "task" ? 120 : itemType === "habit" ? 1_380 : 0,
          phase: "focus", started: Boolean(item), countdown: itemType === "habit",
          date: itemType === "habit" ? "2026-10-02" : "", sessionMinutes: itemType === "habit" ? 25 : undefined },
      },
      state: {
        focusRewardSeconds: 0,
        focusFarmPlotId: 0,
        settings: { quick: { focusMinutes: 25 } },
        farmPlots: [{ id: 0, crop: "carrot", growth: 0, focusGrowthSeconds: 0,
          focusCropInstanceId: "original-planting", wilted: false }],
      },
      pendingFocusSeconds: { quick: 0, linked: 0 },
      pendingFarmFocusBatches: [],
      focusProgressEventQueue: [],
      crypto: { randomUUID: () => `recovery-event-${++nextId}` },
      localStorage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: (key) => storage.delete(key),
      },
      getFocusSettings: () => ({ focusMinutes: 25 }),
      getCropGrowthCost: () => 4,
      getFocusItem: () => item,
      toLocalDateString: () => "2026-10-02",
      updateActiveFocusCard: noop,
      updateFocusDisplay: noop,
      updateMiniFocusTimer: noop,
      updateFocusActionButton: noop,
      updateFocusTarget: noop,
      renderFocusPicker: noop,
      renderSummary: noop,
      clearInterval: noop,
      startFocusTickInterval: noop,
      closeFocusSettings: noop,
      scheduleTaskDatabaseSync: noop,
      scheduleFarmPushNotification: noop,
      renderHabits: noop,
      flushFocusTime: noop,
      focusSettingsButton: {},
      document: { querySelectorAll: () => [] },
    });
    ctx.isFocusTimerOwner = () => ctx.runningFocusMode && ctx.focusTimerOwnerId === clientId;
    ctx.focusItem = item;
    return ctx;
  }
  return { start, open, storage, setElapsed: (seconds) => { now = start + seconds * 1_000; } };
}

test("reopening a stale timer adds only the two seconds after eleven already pending seconds", () => {
  const fixture = recoveryFixture();
  const beforeClosing = fixture.open();
  const staleServerTimer = beforeClosing.getFocusTimerDatabasePayload();
  fixture.setElapsed(11);
  beforeClosing.advanceRunningFocusTimer("quick");
  assert.equal(beforeClosing.getPendingFocusSeconds(), 11);

  fixture.setElapsed(13);
  const reopened = fixture.open();
  reopened.restorePendingFocusEvents("user");
  reopened.applyFocusTimerDatabaseState(staleServerTimer);
  assert.equal(reopened.getPendingFocusSeconds(), 13);
  assert.equal(reopened.focusRuntimeByMode.quick.seconds, 1_487);
  assert.equal(reopened.focusLastTickAt, fixture.start + 13_000);
});

test("a drained focus outbox keeps the timer checkpoint and recovers only the uncredited gap", () => {
  const fixture = recoveryFixture();
  const beforeClosing = fixture.open();
  const staleServerTimer = beforeClosing.getFocusTimerDatabasePayload();
  fixture.setElapsed(11);
  beforeClosing.advanceRunningFocusTimer("quick");
  beforeClosing.stagePendingFocusEvents();
  assert.equal(beforeClosing.focusProgressEventQueue[0].seconds, 11);
  // Model the successful acknowledgement: all eleven seconds are on the server.
  beforeClosing.focusProgressEventQueue.length = 0;
  beforeClosing.persistPendingFocusEvents();
  const saved = JSON.parse(fixture.storage.get("farmodoro-focus-outbox:user:local"));
  assert.equal(saved.events.length, 0);
  assert.equal(saved.batches.length, 0);
  assert.equal(saved.timerCheckpoint.timer.syncedAt, new Date(fixture.start + 11_000).toISOString());

  fixture.setElapsed(13);
  const reopened = fixture.open();
  reopened.restorePendingFocusEvents("user");
  reopened.applyFocusTimerDatabaseState(staleServerTimer);
  assert.equal(reopened.getPendingFocusSeconds(), 2);
  assert.equal(11 + reopened.getPendingFocusSeconds(), 13);
  assert.equal(reopened.focusRuntimeByMode.quick.seconds, 1_487);
});

test("a different timer owner cannot recover rewards from this tab's checkpoint", () => {
  const fixture = recoveryFixture();
  const beforeClosing = fixture.open();
  const staleServerTimer = beforeClosing.getFocusTimerDatabasePayload();
  fixture.setElapsed(11);
  beforeClosing.advanceRunningFocusTimer("quick");
  beforeClosing.stagePendingFocusEvents();
  beforeClosing.focusProgressEventQueue.length = 0;
  beforeClosing.persistPendingFocusEvents();

  fixture.setElapsed(13);
  const reopened = fixture.open();
  reopened.restorePendingFocusEvents("user");
  reopened.applyFocusTimerDatabaseState({ ...staleServerTimer, ownerId: "remote" });
  assert.equal(reopened.focusTimerOwnerId, "remote");
  assert.equal(reopened.getPendingFocusSeconds(), 0);
  assert.equal(reopened.focusRuntimeByMode.quick.seconds, 1_487);
});

test("legacy timer targets cannot grow a replacement crop during recovery", () => {
  const fixture = recoveryFixture();
  const beforeClosing = fixture.open();
  const staleServerTimer = { ...plain(beforeClosing.getFocusTimerDatabasePayload()),
    farmTarget: { plotId: 0, cropInstanceId: "original-planting" } };
  fixture.setElapsed(11);
  beforeClosing.advanceRunningFocusTimer("quick");
  const saved = JSON.parse(fixture.storage.get("farmodoro-focus-outbox:user:local"));
  saved.timerCheckpoint.timer.farmTarget = staleServerTimer.farmTarget;
  saved.batches.forEach((batch) => Object.assign(batch, staleServerTimer.farmTarget));
  fixture.storage.set("farmodoro-focus-outbox:user:local", JSON.stringify(saved));

  fixture.setElapsed(13);
  const reopened = fixture.open();
  reopened.state.farmPlots[0].focusCropInstanceId = "replacement-planting";
  reopened.restorePendingFocusEvents("user");
  reopened.applyFocusTimerDatabaseState(staleServerTimer);
  assert.equal(reopened.getPendingFocusSeconds(), 13);
  assert.ok(reopened.pendingFarmFocusBatches.every((batch) => batch.plotId == null && batch.cropInstanceId == null));
  assert.equal(reopened.state.farmPlots[0].growth, 0);
  assert.equal(reopened.state.farmPlots[0].focusGrowthSeconds, 0);
  reopened.stagePendingFocusEvents();
  assert.ok(reopened.focusProgressEventQueue.every((event) => event.plotId == null && event.cropInstanceId == null));
  const payload = reopened.getFocusTimerDatabasePayload();
  assert.equal(payload.farmTarget, undefined, "new checkpoints omit the retired crop target");
});

test("an unacknowledged local timer start survives reopening from an older idle server snapshot", () => {
  const fixture = recoveryFixture();
  const beforeClosing = fixture.open();
  const idleServerTimer = { ...plain(beforeClosing.getFocusTimerDatabasePayload()), ownerId: "", runningMode: null };
  fixture.setElapsed(11);
  beforeClosing.advanceRunningFocusTimer("quick");

  fixture.setElapsed(13);
  const reopened = fixture.open();
  reopened.restorePendingFocusEvents("user");
  reopened.applyFocusTimerDatabaseState(idleServerTimer);
  assert.equal(reopened.getPendingFocusSeconds(), 13);
  assert.equal(reopened.runningFocusMode, "quick");
  assert.equal(reopened.focusTimerOwnerId, "local");
  assert.equal(reopened.focusRuntimeByMode.quick.seconds, 1_487);
});

for (const savedSeconds of [125, 200]) {
  test(`task checkpoint restores progress monotonically and rewards only the new gap (saved ${savedSeconds}s)`, () => {
    const fixture = recoveryFixture("task");
    const beforeClosing = fixture.open();
    const staleServerTimer = beforeClosing.getFocusTimerDatabasePayload();
    fixture.setElapsed(11);
    beforeClosing.advanceRunningFocusTimer("linked");
    assert.equal(beforeClosing.focusItem.focusSeconds, 131);

    fixture.setElapsed(13);
    const reopened = fixture.open();
    reopened.focusItem.focusSeconds = savedSeconds;
    reopened.restorePendingFocusEvents("user");
    reopened.applyFocusTimerDatabaseState(staleServerTimer);
    assert.equal(reopened.getPendingFocusSeconds(), 13);
    assert.equal(reopened.focusItem.focusSeconds, Math.max(savedSeconds, 133));
    assert.equal(reopened.focusRuntimeByMode.linked.seconds, 133);
  });

  test(`habit checkpoint preserves newer records and adds only the new gap (saved ${savedSeconds}s)`, () => {
    const fixture = recoveryFixture("habit");
    const beforeClosing = fixture.open();
    const staleServerTimer = beforeClosing.getFocusTimerDatabasePayload();
    fixture.setElapsed(11);
    beforeClosing.advanceRunningFocusTimer("linked");
    assert.equal(beforeClosing.focusItem.focusSecondsByDate["2026-10-02"], 131);

    fixture.setElapsed(13);
    const reopened = fixture.open();
    reopened.focusItem.focusSecondsByDate = { "2026-10-01": 80, "2026-10-02": savedSeconds };
    reopened.restorePendingFocusEvents("user");
    reopened.applyFocusTimerDatabaseState(staleServerTimer);
    assert.equal(reopened.getPendingFocusSeconds(), 13);
    assert.equal(reopened.focusItem.focusSecondsByDate["2026-10-02"], Math.max(savedSeconds, 131) + 2);
    assert.equal(reopened.focusItem.focusSecondsByDate["2026-10-01"], 80);
    assert.equal(reopened.focusRuntimeByMode.linked.seconds, 1_367);
  });
}

test("another tab cannot restore or restage this client's pending events and batches", () => {
  const fixture = recoveryFixture();
  const owner = fixture.open();
  fixture.setElapsed(11);
  owner.advanceRunningFocusTimer("quick");
  owner.stagePendingFocusEvents();
  fixture.setElapsed(13);
  owner.advanceRunningFocusTimer("quick");
  const originalStorage = fixture.storage.get("farmodoro-focus-outbox:user:local");
  const originalEvents = plain(owner.focusProgressEventQueue);
  const originalBatches = plain(owner.pendingFarmFocusBatches);

  const otherTab = fixture.open("other-tab");
  otherTab.restorePendingFocusEvents("user");
  assert.equal(otherTab.getPendingFocusSeconds(), 0);
  assert.equal(otherTab.focusProgressEventQueue.length, 0);
  assert.equal(otherTab.pendingFarmFocusBatches.length, 0);
  otherTab.stagePendingFocusEvents();
  assert.equal(fixture.storage.get("farmodoro-focus-outbox:user:local"), originalStorage);

  const reloadedOwner = fixture.open();
  reloadedOwner.restorePendingFocusEvents("user");
  assert.equal(reloadedOwner.getPendingFocusSeconds(), 13);
  assert.deepEqual(plain(reloadedOwner.focusProgressEventQueue), originalEvents);
  assert.deepEqual(plain(reloadedOwner.pendingFarmFocusBatches), originalBatches);
});
