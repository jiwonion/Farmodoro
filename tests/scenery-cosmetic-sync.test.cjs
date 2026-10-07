const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const purchaseButton = id => ({ disabled: false, dataset: { purchaseCosmetic: `farm_theme:${id}` } });
const equipButton = id => ({ disabled: false, dataset: { equipCosmetic: `farm_theme:${id || ''}` } });

function harness(rpc = () => ({ data: { farmMoneyBalance: 1000 }, error: null })) {
  const calls = [];
  const reconciliations = [];
  const toasts = [];
  let renders = 0;
  const ctx = vm.createContext({
    console: { error() {} },
    activeAuthUser: { id: 'user-a' }, farmSessionGeneration: 1,
    farmActionChain: Promise.resolve(), farmWalletMutationChain: Promise.resolve(), farmWalletMutationVersion: 0,
    state: { coins: 10, farmMoney: 3000, equippedFarmTheme: null, equippedPlotSkin: null, ownedCosmetics: [] },
    COSMETIC_TYPE_LABELS: { farm_theme: '테마', plot_skin: '밭' },
    getCosmeticEntry: (type, id) => type === 'farm_theme' && ['ocean','iceKingdom'].includes(id) ? { id, name: id, price: 2000 } : null,
    refreshFarmWaterReminders() {},
    showToast: message => toasts.push(message),
    render() { renders += 1; },
    async loadFarmWallet() { throw new Error('Unexpected wallet fallback'); },
    supabaseClient: { async rpc(name, params) { calls.push({ name, params: plain(params) }); return rpc(name, params); } },
  });
  ctx.isCosmeticOwned = (type, id) => ctx.state.ownedCosmetics.some(entry => entry.type === type && entry.id === id);
  ctx.applyFarmActionResult = result => {
    reconciliations.push(plain(result));
    ctx.farmWalletMutationVersion += 1;
    if (result.wallet?.farmMoneyBalance != null) ctx.state.farmMoney = result.wallet.farmMoneyBalance;
    if (result.wallet?.coinBalance != null) ctx.state.coins = result.wallet.coinBalance;
  };
  for (const name of ['runCosmeticRpc','purchaseFarmCosmetic','equipFarmCosmetic']) {
    const match = source.match(new RegExp(`async function ${name}\\([^]*?^\\}`, 'm'));
    assert.ok(match, `Missing ${name}`);
    vm.runInContext(match[0], ctx);
  }
  return { ctx, calls, reconciliations, toasts, renders: () => renders };
}

test('theme purchases wait for both scenery actions and productivity wallet changes', async () => {
  const h = harness();
  const scenery = deferred();
  const productivity = deferred();
  h.ctx.farmActionChain = scenery.promise;
  h.ctx.farmWalletMutationChain = productivity.promise;
  const promise = h.ctx.purchaseFarmCosmetic(purchaseButton('ocean'));
  await tick();
  assert.equal(h.calls.length, 0);
  scenery.resolve();
  await tick();
  assert.equal(h.calls.length, 0, 'An unresolved productivity wallet mutation still blocks purchase');
  productivity.resolve();
  assert.equal(await promise, true);
  assert.deepEqual(h.calls, [{name:'purchase_farm_cosmetic',params:{p_cosmetic_type:'farm_theme',p_cosmetic_id:'ocean',p_price:2000}}]);
  assert.equal(h.ctx.state.farmMoney, 1000);
  assert.equal(h.ctx.state.equippedFarmTheme, 'ocean');
  assert.deepEqual(plain(h.ctx.state.ownedCosmetics), [{type:'farm_theme',id:'ocean'}]);
  assert.deepEqual(h.reconciliations, [{wallet:{farmMoneyBalance:1000}}]);
  assert.equal(h.ctx.farmWalletMutationVersion, 1, 'Wallet reload guards see the authoritative purchase update');
});

test('cosmetic RPCs reserve both shared queues so later actions cannot overlap', async () => {
  const firstResponse = deferred();
  const h = harness((name) => name === 'purchase_farm_cosmetic' ? firstResponse.promise : {data:{},error:null});
  const first = h.ctx.runCosmeticRpc('purchase_farm_cosmetic', {p_cosmetic_id:'ocean'}, 'user-a', 1);
  const second = h.ctx.runCosmeticRpc('equip_farm_cosmetic', {p_cosmetic_id:'iceKingdom'}, 'user-a', 1);
  assert.equal(h.ctx.farmWalletMutationChain, h.ctx.farmActionChain);
  await tick();
  assert.deepEqual(h.calls.map(call=>call.name), ['purchase_farm_cosmetic']);
  firstResponse.resolve({data:{farmMoneyBalance:1000},error:null});
  await Promise.all([first, second]);
  assert.deepEqual(h.calls.map(call=>call.name), ['purchase_farm_cosmetic','equip_farm_cosmetic']);
});

test('queued purchases from a previous account never send a request under the new session', async () => {
  const pending = deferred();
  const h = harness();
  h.ctx.farmActionChain = pending.promise;
  const promise = h.ctx.purchaseFarmCosmetic(purchaseButton('ocean'));
  h.ctx.activeAuthUser = {id:'user-b'};
  h.ctx.farmSessionGeneration += 1;
  h.ctx.state.farmMoney = 77;
  pending.resolve();
  assert.equal(await promise, false);
  assert.equal(h.calls.length, 0);
  assert.equal(h.ctx.state.farmMoney, 77);
  assert.deepEqual(plain(h.ctx.state.ownedCosmetics), []);
  assert.equal(h.toasts.length, 0);
});

test('a late purchase response cannot modify the next account wallet, ownership or equipped theme', async () => {
  const response = deferred();
  const h = harness(() => response.promise);
  const promise = h.ctx.purchaseFarmCosmetic(purchaseButton('ocean'));
  await tick();
  assert.equal(h.calls.length, 1);
  h.ctx.activeAuthUser = {id:'user-b'};
  h.ctx.farmSessionGeneration += 1;
  h.ctx.state = {coins:7,farmMoney:77,equippedFarmTheme:'iceKingdom',equippedPlotSkin:null,ownedCosmetics:[{type:'farm_theme',id:'iceKingdom'}]};
  const before = plain(h.ctx.state);
  response.resolve({data:{farmMoneyBalance:1000},error:null});
  assert.equal(await promise, false);
  assert.deepEqual(plain(h.ctx.state), before);
  assert.equal(h.reconciliations.length, 0);
  assert.equal(h.toasts.length, 0);
  assert.equal(h.renders(), 0);
});

test('leaving and returning to the same account also invalidates an earlier purchase response', async () => {
  const response = deferred();
  const h = harness(() => response.promise);
  const promise = h.ctx.purchaseFarmCosmetic(purchaseButton('ocean'));
  await tick();
  h.ctx.farmSessionGeneration += 2;
  response.resolve({data:{farmMoneyBalance:1000},error:null});
  assert.equal(await promise, false);
  assert.equal(h.ctx.state.farmMoney, 3000);
  assert.equal(h.ctx.state.equippedFarmTheme, null);
  assert.equal(h.reconciliations.length, 0);
});

test('theme equip responses preserve account isolation and default unequip uses explicit null', async () => {
  const response = deferred();
  const h = harness(() => response.promise);
  const promise = h.ctx.equipFarmCosmetic(equipButton('ocean'));
  await tick();
  h.ctx.activeAuthUser = {id:'user-b'};
  h.ctx.farmSessionGeneration += 1;
  h.ctx.state.equippedFarmTheme = 'iceKingdom';
  response.resolve({data:{},error:null});
  await promise;
  assert.equal(h.ctx.state.equippedFarmTheme, 'iceKingdom');
  assert.equal(h.toasts.length, 0);

  const fresh = harness(() => ({data:{},error:null}));
  fresh.ctx.state.equippedFarmTheme = 'ocean';
  await fresh.ctx.equipFarmCosmetic(equipButton(null));
  assert.equal(fresh.ctx.state.equippedFarmTheme, null);
  assert.equal(fresh.calls[0].params.p_cosmetic_id, null);
  assert.equal(fresh.ctx.state.farmMoney, 3000);
  assert.equal(fresh.reconciliations.length, 0);
});

test('a purchase rejection preserves money, re-enables the control and does not poison later queued requests', async () => {
  let attempted = false;
  const h = harness(() => attempted ? {data:{farmMoneyBalance:1000},error:null} : (attempted=true, {error:{message:'Insufficient balance'}}));
  const button = purchaseButton('ocean');
  assert.equal(await h.ctx.purchaseFarmCosmetic(button), false);
  assert.equal(button.disabled, false);
  assert.equal(h.ctx.state.farmMoney, 3000);
  assert.equal(h.ctx.state.equippedFarmTheme, null);
  assert.equal(h.reconciliations.length, 0);
  assert.match(h.toasts[0], /Farm Money가 부족해/);
  assert.equal(await h.ctx.purchaseFarmCosmetic(button), true);
  assert.equal(h.calls.length, 2);
  assert.equal(h.ctx.state.farmMoney, 1000);
});

test('signed-out and disabled controls cannot initiate cosmetic RPCs', async () => {
  const h = harness();
  h.ctx.activeAuthUser = null;
  assert.equal(await h.ctx.purchaseFarmCosmetic(purchaseButton('ocean')), false);
  await h.ctx.equipFarmCosmetic(equipButton('ocean'));
  h.ctx.activeAuthUser = {id:'user-a'};
  const disabled = purchaseButton('ocean');
  disabled.disabled = true;
  assert.equal(await h.ctx.purchaseFarmCosmetic(disabled), false);
  assert.equal(h.calls.length, 0);
});
