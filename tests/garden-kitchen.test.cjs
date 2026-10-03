const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../garden-kitchen.js'), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function kitchenContext(overrides = {}) {
  const elements = new Map();
  const storage = new Map();
  let uuidNumber = 0;
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      id, innerHTML: '', textContent: '', disabled: false, handlers: {},
      classList: { contains: () => true, add() {}, remove() {} },
      addEventListener(type, handler) { this.handlers[type] = handler; },
      setAttribute() {}, contains: () => false, querySelector: () => null,
    });
    return elements.get(id);
  };
  const ctx = vm.createContext({
    console, window: {},
    document: { getElementById: element, activeElement: null },
    MutationObserver: class { observe() {} },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    createUuid: () => `00000000-0000-4000-8000-${String(++uuidNumber).padStart(12, '0')}`,
    state: { farmMoney: 20, weeklyFarmMoneyEarned: 3, harvestInventory: { carrot: 7, potato: 3, wheat: 9, strawberry: 2 }, foodInventory: { stew: 0, tart: 0 } },
    RECIPES: {
      stew: { name: '채소 스튜', ingredients: ['carrot', 'potato'], sellPrice: 34 },
      tart: { name: '딸기 타르트', ingredients: ['wheat', 'strawberry'], sellPrice: 46 },
      repeated: { name: '당근 요리', ingredients: ['carrot', 'carrot', 'potato'], sellPrice: 50 },
    },
    CROPS: { carrot: { name: '당근' }, potato: { name: '감자' }, wheat: { name: '밀' }, strawberry: { name: '딸기' } },
    escapeHtml: value => String(value), foodPixel: () => '', cropPixel: () => '',
    activeAuthUser: { id: 'kitchen-test-user' }, farmDataHydrated: true,
    showToast() {}, farmBonusMessage: () => '',
    loadFarmDataFromDatabase: async () => {}, loadFarmWallet: async () => {},
    runFarmAction: async action => { action.apply(); return { event: {} }; },
    ...overrides,
  });
  vm.runInContext(source, ctx);
  const click = selector => {
    element('farmKitchenModal').handlers.click({ target: { closest: value => value === selector ? { dataset: {} } : null } });
  };
  return { ctx, api: ctx.window.FarmKitchen, element, click, storage };
}

test('quantity counts repeated harvested ingredients and never substitutes owned seeds', () => {
  const { api, ctx } = kitchenContext();
  const model = plain(api.recipeModel('repeated'));
  assert.equal(model.available, 3);
  assert.deepEqual(model.ingredients, [
    { cropId: 'carrot', amount: 2, owned: 7 },
    { cropId: 'potato', amount: 1, owned: 3 },
  ]);
  assert.equal(api.recipeModel('missing'), null);
  assert.equal(api.recipeModel('stew', { carrot: 12, potato: 0 }).available, 0);
  assert.equal(api.recipeModel('repeated', { carrot: 1, potato: 10 }).available, 0);
  ctx.state.seedInventory = { carrot: 20, potato: 20 };
  ctx.state.harvestInventory = { carrot: 0, potato: 3 };
  assert.equal(api.recipeModel('stew').available, 0);
});

test('batch quantity is bounded, integer, and remains one for unavailable recipes', () => {
  const { api } = kitchenContext();
  assert.equal(api.recipeModel('stew', { carrot: 300, potato: 90 }).maxQuantity, 50);
  assert.equal(api.clampQuantity(999, 3), 3);
  assert.equal(api.clampQuantity(2.9, 9), 2);
  assert.equal(api.clampQuantity(-5, 9), 1);
  assert.equal(api.clampQuantity('bad', 0), 1);
});

test('food sale totals preserve every known food and ignore unrelated inventory keys', () => {
  const { api } = kitchenContext();
  const sale = api.saleModel({ stew: 2, tart: 3, removedRecipe: 50, repeated: -4 });
  assert.equal(sale.count, 5);
  assert.equal(sale.amount, 206);
  assert.deepEqual(plain(sale.foods.map(food => [food.recipeId, food.count])), [['stew', 2], ['tart', 3]]);
});

test('batch cooking sends the selected recipe and consumes quantities without manual ingredient selection', async () => {
  let seen;
  const { ctx, click, element } = kitchenContext({ runFarmAction: async action => { seen = action; action.apply(); return { event: { foodAmount: 3 } }; } });
  click('[data-kitchen-quantity-max]');
  click('#kitchenCookSelected');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(seen.rpc, 'cook_my_farm_recipe');
  assert.deepEqual(plain(seen.params), { p_recipe_id: 'stew', p_quantity: 3 });
  assert.equal(ctx.state.harvestInventory.carrot, 4);
  assert.equal(ctx.state.harvestInventory.potato, 0);
  assert.equal(ctx.state.foodInventory.stew, 3);
  assert.match(element('kitchenActionStatus').textContent, /3개를 만들었어/);
});

test('failed batch cooking restores only the recipe ingredients and finished food', async () => {
  const { ctx, click, element } = kitchenContext({ runFarmAction: async action => { action.apply(); action.onError({ code: 'P0001', message: 'FARM_NOT_ENOUGH_INGREDIENTS' }); action.revert(); return null; } });
  click('#kitchenCookSelected');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(plain(ctx.state.harvestInventory), { carrot: 7, potato: 3, wheat: 9, strawberry: 2 });
  assert.equal(ctx.state.foodInventory.stew, 0);
  assert.match(element('kitchenActionStatus').textContent, /그대로/);
});

test('one pending kitchen action blocks double clicks and selling during cooking', async () => {
  let release;
  let calls = 0;
  const { click, element } = kitchenContext({ runFarmAction: action => { calls++; action.apply(); return new Promise(resolve => { release = resolve; }); } });
  click('#kitchenCookSelected');
  click('#kitchenCookSelected');
  click('#kitchenSellAllFood');
  assert.equal(calls, 1);
  assert.equal(element('kitchenSellAllFood').disabled, true);
  release({ event: {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(element('kitchenSellAllFood').disabled, false);
});

test('selling all food credits the combined value and restores inventory on failure', async () => {
  let seen;
  const { ctx, click } = kitchenContext({ runFarmAction: async action => { seen = action; action.apply(); action.onError({ code: 'P0001', message: 'FARM_NO_FOOD_TO_SELL' }); action.revert(); return null; } });
  ctx.state.foodInventory.stew = 2;
  ctx.state.foodInventory.tart = 3;
  click('#kitchenSellAllFood');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(seen.rpc, 'sell_all_my_farm_food');
  assert.deepEqual(plain(seen.params), {});
  assert.equal(ctx.state.foodInventory.stew, 2);
  assert.equal(ctx.state.foodInventory.tart, 3);
  assert.equal(ctx.state.farmMoney, 20);
  assert.equal(ctx.state.weeklyFarmMoneyEarned, 3);
});

test('successful food sale updates Farm Money and the weekly total without selling harvest ingredients', async () => {
  const { ctx, click, element } = kitchenContext({ runFarmAction: async action => { action.apply(); return { event: { soldCount: 5, saleAmount: 206 } }; } });
  ctx.state.foodInventory.stew = 2;
  ctx.state.foodInventory.tart = 3;
  click('#kitchenSellAllFood');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ctx.state.foodInventory.stew, 0);
  assert.equal(ctx.state.foodInventory.tart, 0);
  assert.equal(ctx.state.farmMoney, 226);
  assert.equal(ctx.state.weeklyFarmMoneyEarned, 209);
  assert.equal(ctx.state.harvestInventory.carrot, 7);
  assert.match(element('kitchenActionStatus').textContent, /206 Farm Money/);
});

test('an old account action cannot announce a success in a new account', async () => {
  let release;
  let toasts = 0;
  const { ctx, click, element } = kitchenContext({ showToast: () => { toasts++; }, runFarmAction: () => new Promise(resolve => { release = resolve; }) });
  click('#kitchenCookSelected');
  ctx.activeAuthUser = { id: 'another-account' };
  release({ event: { foodAmount: 1 } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(toasts, 0);
  assert.equal(element('kitchenActionStatus').textContent, '');
});

test('farm hydration and authentication guard cooking and selling', async () => {
  let calls = 0;
  for (const guards of [{ farmDataHydrated: false }, { activeAuthUser: null }]) {
    const { click } = kitchenContext({ ...guards, runFarmAction: async () => { calls++; } });
    click('#kitchenCookSelected');
    click('#kitchenSellAllFood');
  }
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 0);
});

test('empty and missing ingredient states do not allow cooking and pantry has no raw crop selling action', () => {
  const { element } = kitchenContext({ state: { farmMoney: 0, harvestInventory: {}, foodInventory: {} } });
  assert.match(element('kitchenRecipeCards').innerHTML, /아직 만들 수 있는 요리/);
  assert.match(element('kitchenSelectedRecipe').innerHTML, /재료가 부족해/);
  assert.match(element('kitchenSelectedRecipe').innerHTML, /id="kitchenCookSelected"[^>]*disabled/);
  assert.match(element('kitchenHarvestIngredients').innerHTML, /수확한 작물이 아직 없어/);
  assert.doesNotMatch(source, /sell_my_farm_crop|data-sell-crop/);
});

test('a lost cooking response retains one request identity and blocks a different kitchen action until recovery', async () => {
  const requests = [];
  let kitchen;
  kitchen = kitchenContext({ runFarmAction: async action => {
    requests.push(action.requestId);
    action.apply();
    if (requests.length === 1) {
      action.onError({ message: 'Failed to fetch' });
      action.revert();
      return null;
    }
    assert.equal(kitchen.ctx.state.harvestInventory.carrot, 7, 'retry does not deduct ingredients twice');
    kitchen.ctx.state.harvestInventory.carrot = 6;
    kitchen.ctx.state.harvestInventory.potato = 2;
    kitchen.ctx.state.foodInventory.stew = 1;
    return { event: { foodAmount: 1 } };
  } });
  kitchen.click('#kitchenCookSelected');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(kitchen.storage.size, 1);
  assert.match(kitchen.element('kitchenSelectedRecipe').innerHTML, /이전 요리 결과 확인/);
  kitchen.ctx.state.foodInventory.tart = 2;
  kitchen.click('#kitchenSellAllFood');
  assert.equal(requests.length, 1);
  kitchen.click('#kitchenCookSelected');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests.length, 2);
  assert.equal(requests[0], requests[1]);
  assert.equal(kitchen.storage.size, 0);
});

test('reload recovery retries the saved batch even when the server already consumed all ingredients', async () => {
  const saved = { userId: 'kitchen-test-user', kind: 'cook', requestId: '6f930590-3c6e-4c2e-869c-2b658a4b05c1', recipeId: 'stew', quantity: 3 };
  const storage = new Map([['farmodoro-kitchen-intent:kitchen-test-user', JSON.stringify(saved)]]);
  let seen;
  const { click, element, ctx } = kitchenContext({
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    state: { farmMoney: 20, harvestInventory: {}, foodInventory: { stew: 3 } },
    runFarmAction: async action => { seen = action; action.apply(); return { event: { foodAmount: 3 } }; },
  });
  assert.match(element('kitchenSelectedRecipe').innerHTML, /value="3"/);
  assert.match(element('kitchenSelectedRecipe').innerHTML, /이전 요리 결과 확인/);
  click('#kitchenCookSelected');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(seen.requestId, saved.requestId);
  assert.deepEqual(plain(seen.params), { p_recipe_id: 'stew', p_quantity: 3 });
  assert.deepEqual(plain(ctx.state.harvestInventory), {});
  assert.equal(ctx.state.foodInventory.stew, 3);
  assert.equal(storage.size, 0);
});

test('a known database failure clears the recovery intent so the next action has a fresh identity', async () => {
  const requests = [];
  const { click, storage } = kitchenContext({ runFarmAction: async action => {
    requests.push(action.requestId);
    action.apply();
    action.onError({ code: 'P0001', message: 'FARM_NOT_ENOUGH_INGREDIENTS' });
    action.revert();
    return null;
  } });
  click('#kitchenCookSelected');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(storage.size, 0);
  click('#kitchenCookSelected');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests.length, 2);
  assert.notEqual(requests[0], requests[1]);
});

test('an uncertain food sale can be recovered after reload with an empty food shelf', async () => {
  const saved = { userId: 'kitchen-test-user', kind: 'sell', requestId: '962a52bc-c945-488d-8c10-7ac2f08e1339' };
  const storage = new Map([['farmodoro-kitchen-intent:kitchen-test-user', JSON.stringify(saved)]]);
  let seen;
  const { click, element, ctx } = kitchenContext({
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    state: { farmMoney: 226, weeklyFarmMoneyEarned: 209, harvestInventory: {}, foodInventory: {} },
    runFarmAction: async action => { seen = action; action.apply(); return { event: { soldCount: 5, saleAmount: 206 } }; },
  });
  assert.equal(element('kitchenSellAllFood').disabled, false);
  assert.match(element('kitchenSellAllFood').textContent, /이전 판매/);
  click('#kitchenSellAllFood');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(seen.requestId, saved.requestId);
  assert.equal(ctx.state.farmMoney, 226, 'recovery does not credit the same sale optimistically again');
  assert.equal(ctx.state.weeklyFarmMoneyEarned, 209);
  assert.equal(storage.size, 0);
});

test('a reset prevents an old cooking finally from unlocking a fresh account action', async () => {
  const requests = [];
  const releases = [];
  const { ctx, api, click, element, storage } = kitchenContext({ runFarmAction: action => {
    requests.push(action);
    return new Promise(resolve => releases.push(resolve));
  } });
  click('#kitchenCookSelected');
  ctx.activeAuthUser = { id: 'new-kitchen-account' };
  api.reset();
  click('#kitchenCookSelected');
  assert.equal(requests.length, 2);
  releases[0]({ event: { foodAmount: 1 } });
  await new Promise(resolve => setImmediate(resolve));
  assert.match(element('kitchenSelectedRecipe').innerHTML, /id="kitchenCookSelected"[^>]*disabled[^>]*aria-busy="true"/);
  click('#kitchenCookSelected');
  assert.equal(requests.length, 2, 'the new request stays locked until its own response');
  assert.equal(storage.size, 2, 'old and new user intents remain separate');
  releases[1]({ event: { foodAmount: 1 } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(storage.size, 1, 'finishing the new request preserves the old user recovery intent');
});

test('logout and login as the same user ignores a late success and preserves its recovery identity', async () => {
  let release;
  let toasts = 0;
  let request;
  const { api, click, element, storage } = kitchenContext({ showToast: () => { toasts++; }, runFarmAction: action => {
    request = action;
    return new Promise(resolve => { release = resolve; });
  } });
  click('#kitchenCookSelected');
  api.reset();
  release({ event: { foodAmount: 1 } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(toasts, 0);
  assert.match(element('kitchenActionStatus').textContent, /저장 결과/);
  assert.equal(JSON.parse(storage.get('farmodoro-kitchen-intent:kitchen-test-user')).requestId, request.requestId);
});

test('old sale callbacks and finally cannot mutate or unlock a fresh cooking session', async () => {
  const requests = [];
  const releases = [];
  const { ctx, api, click, element } = kitchenContext({ runFarmAction: action => {
    requests.push(action);
    return new Promise(resolve => releases.push(resolve));
  } });
  ctx.state.foodInventory.stew = 2;
  click('#kitchenSellAllFood');
  ctx.activeAuthUser = { id: 'another-sale-account' };
  ctx.state.farmMoney = 77;
  ctx.state.foodInventory.stew = 5;
  api.reset();
  click('#kitchenCookSelected');
  requests[0].apply();
  requests[0].revert();
  assert.equal(ctx.state.farmMoney, 77);
  assert.equal(ctx.state.foodInventory.stew, 5);
  releases[0]({ event: { soldCount: 2, saleAmount: 68 } });
  await new Promise(resolve => setImmediate(resolve));
  assert.match(element('kitchenSelectedRecipe').innerHTML, /id="kitchenCookSelected"[^>]*disabled[^>]*aria-busy="true"/);
  releases[1]({ event: { foodAmount: 1 } });
  await new Promise(resolve => setImmediate(resolve));
});

test('recovered sales skip cached snapshots and await a separate current wallet read before clearing their intent', async () => {
  const saved = { userId: 'kitchen-test-user', kind: 'sell', requestId: '962a52bc-c945-488d-8c10-7ac2f08e1339' };
  const storage = new Map([['farmodoro-kitchen-intent:kitchen-test-user', JSON.stringify(saved)]]);
  const reads = [];
  let releaseWallet;
  let kitchen;
  kitchen = kitchenContext({
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    state: { farmMoney: 500, weeklyFarmMoneyEarned: 209, harvestInventory: {}, foodInventory: {} },
    runFarmAction: async action => {
      assert.equal(action.skipReconciliation, true);
      action.apply();
      return { wallet: { farmMoneyBalance: 226 }, event: { soldCount: 5, saleAmount: 206 } };
    },
    loadFarmDataFromDatabase: async user => { assert.equal(user.id, saved.userId); reads.push('farm'); },
    loadFarmWallet: async user => {
      assert.equal(user.id, saved.userId);
      assert.equal(kitchen.ctx.state.farmMoney, 500, 'cached sale value is never applied to the current wallet');
      reads.push('wallet');
      await new Promise(resolve => { releaseWallet = resolve; });
      kitchen.ctx.state.farmMoney = 615;
    },
  });
  kitchen.click('#kitchenSellAllFood');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(reads, ['farm', 'wallet']);
  assert.equal(storage.size, 1, 'intent remains recoverable until both reads finish');
  assert.equal(kitchen.element('kitchenSellAllFood').disabled, true);
  releaseWallet();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(kitchen.ctx.state.farmMoney, 615);
  assert.equal(storage.size, 0);
});

test('normal cooking reconciles its first response without an additional recovery wallet read', async () => {
  let refreshes = 0;
  const { click } = kitchenContext({
    runFarmAction: async action => { assert.equal(action.skipReconciliation, false); action.apply(); return { event: { foodAmount: 1 } }; },
    loadFarmDataFromDatabase: async () => { refreshes++; }, loadFarmWallet: async () => { refreshes++; },
  });
  click('#kitchenCookSelected');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(refreshes, 0);
});

test('a session reset during recovery farm refresh stops the old wallet read and keeps its intent', async () => {
  const saved = { userId: 'kitchen-test-user', kind: 'cook', requestId: '6f930590-3c6e-4c2e-869c-2b658a4b05c1', recipeId: 'stew', quantity: 1 };
  const storage = new Map([['farmodoro-kitchen-intent:kitchen-test-user', JSON.stringify(saved)]]);
  let releaseFarm;
  let wallets = 0;
  let toasts = 0;
  const { api, click } = kitchenContext({
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    showToast: () => { toasts++; },
    runFarmAction: async action => { assert.equal(action.skipReconciliation, true); return { event: { foodAmount: 1 } }; },
    loadFarmDataFromDatabase: () => new Promise(resolve => { releaseFarm = resolve; }),
    loadFarmWallet: async () => { wallets++; },
  });
  click('#kitchenCookSelected');
  await new Promise(resolve => setImmediate(resolve));
  api.reset();
  releaseFarm();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(wallets, 0);
  assert.equal(toasts, 0);
  assert.equal(storage.size, 1);
});
