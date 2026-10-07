const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
function setup(rpc) {
  const context = vm.createContext({
    console: { error() {} }, activeAuthUser: { id: 'alice' }, farmSessionGeneration: 0,
    farmWalletMutationVersion: 0, farmWalletHydrated: true, farmWalletUserId: 'alice',
    state: { coins: 30, farmMoney: 300 }, window: {}, supabaseClient: { rpc },
    renderFarm() {}, renderSummary() {}, showToast() {},
  });
  return context;
}

test('a late wallet read cannot overwrite a newly confirmed garden purchase', async () => {
  let release;
  const context = setup(() => new Promise(resolve => { release = resolve; }));
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
  const context = setup(() => new Promise(resolve => { release = resolve; }));
  vm.runInContext(source.match(/async function loadFarmWallet\([^]*?^\}/m)[0], context);
  const pending = context.loadFarmWallet({ id: 'alice' });
  context.farmSessionGeneration += 2;
  context.state.coins = 80;
  release({ data: { coin_balance: 1, farm_money_balance: 10 } });
  await pending;
  assert.equal(context.state.coins, 80);
  assert.equal(context.state.farmMoney, 300);
});
