const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const actionSource = source.match(/async function runFarmAction\([^]*?^\}/m)[0];
function setup(rpc) {
  const effects = { reconciled: [], errors: [], toasts: [], rendered: 0 };
  const context = vm.createContext({
    console: { error() {} },
    activeAuthUser: { id: 'alice' }, farmDataHydrated: true,
    farmSessionGeneration: 0, farmActionChain: Promise.resolve(),
    farmWalletMutationVersion: 0, farmWalletHydrated: true, farmWalletUserId: 'alice',
    state: { coins: 30, farmMoney: 300 }, window: {},
    applyServerFarmPlot() {}, applyServerFarmInventoryEntry() {},
    supabaseClient: { rpc }, createUuid: () => 'new-request',
    applyFarmActionResult: result => effects.reconciled.push(result),
    renderFarm: () => effects.rendered++, renderSummary() {},
    showToast: message => effects.toasts.push(message),
    farmActionErrorSentinel: error => error.message.includes('FARM_PLOT_OCCUPIED') ? 'FARM_PLOT_OCCUPIED' : null,
    FARM_ACTION_ERROR_MESSAGES: { FARM_PLOT_OCCUPIED: 'occupied' },
    loadFarmDataFromDatabase() {},
  });
  vm.runInContext(actionSource, context);
  const action = overrides => context.runFarmAction({ rpc: 'cook', params: {}, apply() {}, revert() {}, failureMessage: 'failed', ...overrides });
  return { context, effects, action };
}

test('an old queued farm action cannot execute with the next account token', async () => {
  let calls = 0, release;
  const { context, effects, action } = setup(async () => { calls++; return { data: {} }; });
  context.farmActionChain = new Promise(resolve => { release = resolve; });
  const pending = action();
  context.activeAuthUser = { id: 'bob' };
  context.farmSessionGeneration++;
  release();
  assert.equal(await pending, null);
  assert.equal(calls, 0);
  assert.deepEqual(effects.reconciled, []);
  assert.deepEqual(effects.toasts, []);
});

test('relogin to the same account invalidates old successful responses', async () => {
  let release;
  const { context, effects, action } = setup(() => new Promise(resolve => { release = resolve; }));
  const pending = action();
  await Promise.resolve();
  context.farmSessionGeneration += 2;
  release({ data: { wallet: { coinBalance: 2 } } });
  await pending;
  assert.deepEqual(effects.reconciled, []);
  assert.equal(effects.rendered, 1, 'only the original optimistic render occurs');
});

test('relogin to the same account prevents stale rollback and error callbacks', async () => {
  let release, reverted = 0, onError = 0;
  const { context, effects, action } = setup(() => new Promise(resolve => { release = resolve; }));
  const pending = action({ revert() { reverted++; }, onError() { onError++; } });
  await Promise.resolve();
  context.farmSessionGeneration += 2;
  release({ error: { message: 'network failed' } });
  assert.equal(await pending, null);
  assert.equal(reverted, 0);
  assert.equal(onError, 0);
  assert.deepEqual(effects.toasts, []);
});

test('a recovery intent preserves its UUID and exposes errors before rollback', async () => {
  const requests = [], order = [];
  let attempt = 0;
  const { effects, action } = setup(async (rpc, params) => {
    requests.push(params.p_request_id);
    return ++attempt === 1 ? { error: { message: 'response lost' } } : { data: { event: { foodAmount: 2 } } };
  });
  const intent = { requestId: 'existing-intent', onError() { order.push('error'); }, revert() { order.push('revert'); } };
  assert.equal(await action(intent), null);
  assert.ok(await action(intent));
  assert.deepEqual(order, ['error', 'revert']);
  assert.deepEqual(requests, ['existing-intent', 'existing-intent']);
  assert.equal(effects.reconciled.length, 1);
});

test('cached recovery results can be confirmed without replacing the current wallet and farm', async () => {
  const { effects, action } = setup(async () => ({ data: { wallet: { coinBalance: 1 }, plots: [{ crop: 'old-crop' }] } }));
  assert.ok(await action({ skipReconciliation: true }));
  assert.deepEqual(effects.reconciled, []);
});

test('a late wallet read cannot overwrite a newly confirmed garden purchase', async () => {
  let release;
  const { context } = setup(() => new Promise(resolve => { release = resolve; }));
  vm.runInContext(source.match(/async function loadFarmWallet\([^]*?^\}/m)[0], context);
  vm.runInContext(source.match(/function applyFarmActionResult\([^]*?^\}/m)[0], context);
  const pending = context.loadFarmWallet({ id: 'alice' });
  context.applyFarmActionResult({ wallet: { farmMoneyBalance: 60 } });
  release({ data: { coin_balance: 30, farm_money_balance: 300 } });
  await pending;
  assert.equal(context.state.farmMoney, 60);
  assert.equal(context.farmWalletHydrated, true);
});

test('a late wallet read cannot hydrate a new session of the same account', async () => {
  let release;
  const { context } = setup(() => new Promise(resolve => { release = resolve; }));
  vm.runInContext(source.match(/async function loadFarmWallet\([^]*?^\}/m)[0], context);
  const pending = context.loadFarmWallet({ id: 'alice' });
  context.farmSessionGeneration += 2;
  context.state.coins = 80;
  release({ data: { coin_balance: 1, farm_money_balance: 10 } });
  await pending;
  assert.equal(context.state.coins, 80);
  assert.equal(context.state.farmMoney, 300);
});
