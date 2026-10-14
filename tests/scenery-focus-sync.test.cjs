const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const noop = () => {};
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const event = id => ({ id, mode: 'quick', seconds: 60 });

function harness(rpc) {
  const calls = [];
  const toasts = [];
  const effects = { persisted: 0, refreshed: 0, rendered: 0 };
  const ctx = vm.createContext({
    console: { error: noop, warn: noop },
    activeAuthUser: { id: 'user-a' },
    state: { coins: 10, farmMoney: 100, tasks: [] },
    farmSessionGeneration: 1,
    farmWalletHydrated: true,
    farmWalletUserId: 'user-a',
    farmWalletMutationChain: Promise.resolve(),
    farmWalletMutationVersion: 0,
    habitCompletionRequests: new Map(),
    farmWalletRealtimeRefreshTimer: null,
    focusProgressApiUnavailable: false,
    focusProgressSyncPromise: null,
    focusProgressServerSeconds: 0,
    focusProgressEventQueue: [event('old-event')],
    pendingFocusSeconds: { linked: 0, quick: 0 },
    pendingFarmFocusBatches: [],
    focusOutboxUserId: 'user-a',
    focusRecoveryTimerCheckpoint: null,
    stagePendingFocusEvents: noop,
    persistPendingFocusEvents: () => { effects.persisted += 1; },
    refreshFocusProgress: () => { effects.refreshed += 1; },
    renderFarm: () => { effects.rendered += 1; },
    renderSummary: noop,
    renderHabits: noop,
    renderHabitUpdates: noop,
    farmBonusMessage: () => '',
    showToast: message => toasts.push(message),
    supabaseClient: { async rpc(name, args) {
      calls.push({ name, args });
      return rpc(name, args, ctx);
    } },
  });
  for (const name of ['flushFocusTime', 'loadFarmWallet',
    'confirmTaskCompletionWithServer', 'confirmTaskUncompletionWithServer', 'confirmHabitUncompletionWithServer',
    'resetFocusProgressState', 'resetFarmWalletDatabaseState']) {
    const match = source.match(new RegExp(`(?:async )?function ${name}\\([^]*?^\\}`, 'm'));
    assert.ok(match, `Missing production function: ${name}`);
    vm.runInContext(match[0], ctx);
  }
  return { ctx, calls, toasts, effects };
}

function changeSession(ctx, nextUser = 'user-b') {
  ctx.activeAuthUser = { id: nextUser };
  ctx.farmSessionGeneration += 1;
  ctx.resetFocusProgressState();
  ctx.resetFarmWalletDatabaseState();
  ctx.farmWalletHydrated = true;
  ctx.farmWalletUserId = nextUser;
  ctx.state = { coins: 81, farmMoney: 250, tasks: [] };
  ctx.focusProgressServerSeconds = 120;
  ctx.focusProgressEventQueue.push(event('new-event'));
}

for (const kind of ['task', 'habit']) {
  const undo = ctx => kind === 'task'
    ? ctx.confirmTaskUncompletionWithServer({ id: 'legacy-task' }, 'waiting', 1)
    : ctx.confirmHabitUncompletionWithServer({ id: 'legacy-habit' }, '2026-10-06', 1);
  const rpcName = kind === 'task' ? 'uncomplete_my_task' : 'uncomplete_my_habit';

  test(`${kind} undo applies authoritative Coin and Farm Money together and only announces a positive legacy pass refund`, async () => {
    const earlier = deferred();
    let responses = 0;
    const h = harness(async name => {
      assert.equal(name, rpcName);
      return { data: { coinBalance: '9', farmMoneyBalance: '700', legacyPassRefundAmount: responses++ === 0 ? 600 : 0 } };
    });
    h.ctx.farmWalletMutationChain = earlier.promise;
    undo(h.ctx);
    const operation = h.ctx.farmWalletMutationChain;
    await tick();
    assert.equal(h.calls.length, 0, 'An earlier wallet operation completes before undo reconciliation');
    assert.equal(h.ctx.state.farmMoney, 100, 'The pass refund is never credited optimistically');
    earlier.resolve();
    await operation;
    assert.equal(h.ctx.state.coins, 9);
    assert.equal(h.ctx.state.farmMoney, 700);
    assert.equal(h.toasts.length, 1);
    assert.match(h.toasts[0], /600 Farm Money/);
    undo(h.ctx);
    await h.ctx.farmWalletMutationChain;
    assert.equal(h.ctx.state.coins, 9);
    assert.equal(h.ctx.state.farmMoney, 700);
    assert.equal(h.toasts.length, 1, 'A confirmed zero refund does not announce a second credit');
  });

  test(`a late ${kind} undo response cannot credit either wallet or announce a pass refund in another account`, async () => {
    const response = deferred();
    const started = deferred();
    const h = harness(name => {
      assert.equal(name, rpcName);
      started.resolve();
      return response.promise;
    });
    undo(h.ctx);
    const operation = h.ctx.farmWalletMutationChain;
    await started.promise;
    changeSession(h.ctx);
    response.resolve({ data: { coinBalance: 9, farmMoneyBalance: 700, legacyPassRefundAmount: 600 } });
    await operation;
    assert.equal(h.ctx.state.coins, 81);
    assert.equal(h.ctx.state.farmMoney, 250);
    assert.deepEqual(h.toasts, []);
  });

  test(`a wallet read started before ${kind} undo cannot overwrite its confirmed legacy pass refund`, async () => {
    const oldRead = deferred();
    const h = harness(name => name === 'get_my_farm_wallet' ? oldRead.promise :
      { data: { coinBalance: 9, farmMoneyBalance: 700, legacyPassRefundAmount: 600 } });
    const reading = h.ctx.loadFarmWallet(h.ctx.activeAuthUser, { background: true });
    undo(h.ctx);
    await h.ctx.farmWalletMutationChain;
    assert.equal(h.ctx.state.coins, 9);
    assert.equal(h.ctx.state.farmMoney, 700);
    oldRead.resolve({ data: { coin_balance: 10, farm_money_balance: 100 } });
    await reading;
    assert.equal(h.ctx.state.coins, 9);
    assert.equal(h.ctx.state.farmMoney, 700);
  });
}

test('focus reward waits for the preceding wallet RPC before reading its authoritative balance', async () => {
  const wallet = deferred();
  const focus = deferred();
  const started = deferred();
  const h = harness(name => {
    if (name === 'complete_my_task') return wallet.promise;
    assert.equal(name, 'record_my_focus_time');
    started.resolve();
    return focus.promise;
  });
  const task = { id: 'preceding-task', completionCycleId: 'pending-cycle', completionReward: 1 };
  h.ctx.state.tasks.push(task);
  h.ctx.state.coins += 1;
  h.ctx.confirmTaskCompletionWithServer(task, 'pending-cycle', 1);
  const flush = h.ctx.flushFocusTime();
  await tick();
  assert.deepEqual(h.calls.map(call => call.name), ['complete_my_task']);
  assert.equal(h.ctx.state.coins, 11);
  assert.equal(h.ctx.focusProgressEventQueue.length, 1);
  wallet.resolve({ data: { coinBalance: 11, completionReward: 1, completionCycleId: 'confirmed-cycle' } });
  await started.promise;
  assert.deepEqual(h.calls.map(call => call.name), ['complete_my_task', 'record_my_focus_time']);
  assert.equal(h.calls[1].args.p_plot_index, undefined);
  assert.equal(h.calls[1].args.p_crop_instance_id, undefined);
  focus.resolve({ data: { progressSeconds: 0, coinBalance: 12, awardedCoins: 1 } });
  await flush;
  assert.equal(h.ctx.state.coins, 12);
  assert.equal(h.ctx.focusProgressEventQueue.length, 0);
});

test('a task reward queued during focus waits for focus and retains the later confirmed wallet balance', async () => {
  const focus = deferred();
  const focusStarted = deferred();
  const task = deferred();
  const taskStarted = deferred();
  const h = harness(name => {
    if (name === 'record_my_focus_time') {
      focusStarted.resolve();
      return focus.promise;
    }
    assert.equal(name, 'complete_my_task');
    taskStarted.resolve();
    return task.promise;
  });
  const completedTask = { id: 'task-a', completionCycleId: 'optimistic-cycle', completionReward: 1 };
  h.ctx.state.tasks.push(completedTask);
  const flush = h.ctx.flushFocusTime();
  await focusStarted.promise;
  h.ctx.state.coins += 1; // The task UI grants its reward before confirmation.
  h.ctx.confirmTaskCompletionWithServer(completedTask, 'optimistic-cycle', 1);
  await tick();
  assert.deepEqual(h.calls.map(call => call.name), ['record_my_focus_time']);
  focus.resolve({ data: { progressSeconds: 0, coinBalance: 11, awardedCoins: 1 } });
  await taskStarted.promise;
  await flush;
  assert.equal(h.ctx.state.coins, 11);
  task.resolve({ data: { coinBalance: 12, completionReward: 1, completionCycleId: 'server-cycle', completedOn: '2026-10-06' } });
  await h.ctx.farmWalletMutationChain;
  assert.equal(h.ctx.state.coins, 12);
  assert.equal(completedTask.completionCycleId, 'server-cycle');
  assert.equal(h.ctx.focusProgressEventQueue.length, 0);
});

for (const phase of ['queued', 'in-flight']) {
  for (const change of ['account', 'session']) {
    test(`an old focus ${phase} operation preserves the replacement ${change}'s wallet and events`, async () => {
      const queue = deferred();
      const response = deferred();
      const started = deferred();
      const h = harness(name => {
        assert.equal(name, 'record_my_focus_time');
        started.resolve();
        return response.promise;
      });
      if (phase === 'queued') h.ctx.farmWalletMutationChain = queue.promise;
      const flush = h.ctx.flushFocusTime();
      if (phase === 'in-flight') await started.promise;
      else await tick();
      changeSession(h.ctx, change === 'account' ? 'user-b' : 'user-a');
      if (phase === 'queued') queue.resolve();
      else response.resolve({ data: { progressSeconds: 0, coinBalance: 11, awardedCoins: 1 } });
      await flush;
      assert.equal(h.calls.length, phase === 'queued' ? 0 : 1);
      assert.equal(h.ctx.state.coins, 81);
      assert.equal(h.ctx.state.farmMoney, 250);
      assert.equal(h.ctx.focusProgressServerSeconds, 120);
      assert.equal(h.ctx.farmWalletMutationVersion, 0);
      assert.deepEqual(Array.from(h.ctx.focusProgressEventQueue, queued => queued.id), ['new-event']);
      assert.deepEqual(h.effects, { persisted: 0, refreshed: 0, rendered: 0 });
      assert.equal(h.toasts.length, 0);
    });
  }
}

test('finishing an old account flush cannot clear the replacement account active flush owner', async () => {
  const oldResponse = deferred();
  const newResponse = deferred();
  const oldStarted = deferred();
  const newStarted = deferred();
  const h = harness((name, args) => {
    assert.equal(name, 'record_my_focus_time');
    if (args.p_event_id === 'old-event') { oldStarted.resolve(); return oldResponse.promise; }
    assert.equal(args.p_event_id, 'new-event');
    newStarted.resolve();
    return newResponse.promise;
  });
  const oldFlush = h.ctx.flushFocusTime();
  await oldStarted.promise;
  changeSession(h.ctx);
  const newFlush = h.ctx.flushFocusTime();
  await newStarted.promise;
  const owner = h.ctx.focusProgressSyncPromise;
  oldResponse.resolve({ data: { progressSeconds: 0, coinBalance: 11, awardedCoins: 1 } });
  await oldFlush;
  try {
    assert.equal(h.ctx.focusProgressSyncPromise, owner, 'an old finalizer must not replace the new synchronization owner');
    assert.equal(h.ctx.state.coins, 81);
    assert.deepEqual(Array.from(h.ctx.focusProgressEventQueue, queued => queued.id), ['new-event']);
  } finally {
    newResponse.resolve({ data: { progressSeconds: 180, coinBalance: 82, awardedCoins: 1 } });
    await newFlush;
  }
  assert.equal(h.ctx.state.coins, 82);
  assert.equal(h.ctx.focusProgressEventQueue.length, 0);
});

test('both focus request and confirmed response invalidate earlier in-flight wallet snapshots', async () => {
  const beforeRequest = deferred();
  const duringRequest = deferred();
  const focusResponse = deferred();
  const focusStarted = deferred();
  let reads = 0;
  const h = harness(name => {
    if (name === 'get_my_farm_wallet') return ++reads === 1 ? beforeRequest.promise : duringRequest.promise;
    assert.equal(name, 'record_my_focus_time');
    focusStarted.resolve();
    return focusResponse.promise;
  });
  const firstRead = h.ctx.loadFarmWallet(h.ctx.activeAuthUser, { background: true });
  const initialVersion = h.ctx.farmWalletMutationVersion;
  const flush = h.ctx.flushFocusTime();
  await focusStarted.promise;
  assert.ok(h.ctx.farmWalletMutationVersion > initialVersion, 'starting the focus write invalidates reads made before the request');
  beforeRequest.resolve({ data: { coin_balance: 999, farm_money_balance: 999 } });
  await firstRead;
  assert.equal(h.ctx.state.coins, 10);
  assert.equal(h.ctx.state.farmMoney, 100);
  const versionDuringFocus = h.ctx.farmWalletMutationVersion;
  const secondRead = h.ctx.loadFarmWallet(h.ctx.activeAuthUser, { background: true });
  focusResponse.resolve({ data: { progressSeconds: 0, coinBalance: 11, awardedCoins: 1 } });
  await flush;
  assert.ok(h.ctx.farmWalletMutationVersion > versionDuringFocus, 'the confirmed focus balance invalidates reads started during the request');
  duringRequest.resolve({ data: { coin_balance: 10, farm_money_balance: 0 } });
  await secondRead;
  assert.equal(h.ctx.state.coins, 11);
  assert.equal(h.ctx.state.farmMoney, 100);
  assert.equal(h.ctx.farmWalletHydrated, true);
});
