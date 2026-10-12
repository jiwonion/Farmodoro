const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../scenery-creations.js'), 'utf8');
const presetSource = fs.readFileSync(path.join(__dirname, '../scenery-theme-presets.js'), 'utf8');
const artSource = fs.readFileSync(path.join(__dirname, '../scenery-creation-art.js'), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(complete => { resolve = complete; }); return { promise, resolve }; };
const catalog = [
  ['tree', '작은 나무', 0], ['blossomTree', '벚꽃나무', 300], ['goldenTree', '황금 나무', 300],
  ['coral', '기본 산호', 0], ['pinkCoral', '분홍 산호', 300], ['sandcastle', '모래성', 300],
  ['snowman', '눈사람', 0], ['snowRabbit', '눈토끼', 300],
].map(([id, name, unlockPrice]) => ({ id, name, unlockPrice, growthCost: 20, reward: 50 }));
const serverState = (overrides = {}) => ({
  activeCreation: null, unlockedTypes: ['tree', 'coral', 'snowman'], completedTypes: [], totalCompleted: 0,
  catalog: plain(catalog), ...overrides,
});
const creation = (overrides = {}) => ({ id: 'creation-1', typeId: 'tree', themeId: null, progress: 0, growthCost: 20, reward: 50, ...overrides });
const result = (scenery, overrides = {}) => ({ scenery, wallet: { coinBalance: 9, farmMoneyBalance: 100 }, weeklyFarmMoneyEarned: 50, event: {}, ...overrides });
const intentKey = id => `farmodoro-scenery-intent:${id}`;

function harness({ rpc, storage = new Map(), userId = 'user-a', state = {}, storageFailure = false, withPresets = false } = {}) {
  const calls = [];
  const toasts = [];
  let uuid = 0;
  const root = {
    innerHTML: '', attributes: {}, handlers: {}, contains: value => !!value?.insideRoot,
    addEventListener(type, handler) { this.handlers[type] = handler; },
    setAttribute(name, value) { this.attributes[name] = value; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
  const ctx = vm.createContext({
    console, window: {}, document: { activeElement: null, getElementById: id => id === 'sceneryCreationRoot' ? root : null },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem(key, value) { if (storageFailure) throw new Error('quota'); storage.set(key, value); },
      removeItem: key => storage.delete(key),
    },
    state: { coins: 10, farmMoney: 100, equippedFarmTheme: null, ...state },
    activeAuthUser: { id: userId }, farmSessionGeneration: 1, farmDataHydrated: true, farmActionChain: Promise.resolve(), farmWalletMutationChain: Promise.resolve(),
    createUuid: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}`,
    showToast: message => toasts.push(message), renderSummary() {},
    supabaseClient: { async rpc(name, params) { calls.push({ name, params: params && plain(params) }); return rpc ? rpc(name, params) : { data: serverState(), error: null }; } },
  });
  ctx.applyFarmActionResult = value => {
    if (value.wallet?.coinBalance != null) ctx.state.coins = value.wallet.coinBalance;
    if (value.wallet?.farmMoneyBalance != null) ctx.state.farmMoney = value.wallet.farmMoneyBalance;
    if (value.weeklyFarmMoneyEarned != null) ctx.state.weeklyFarmMoneyEarned = value.weeklyFarmMoneyEarned;
  };
  ctx.window.FarmGardenArt = { theme: id => ({ url: `./${id || 'default'}.png`, x: 0, y: 0, size: '200% auto' }) };
  vm.runInContext(artSource, ctx);
  ctx.window.SceneryCreationArt = { ...ctx.window.SceneryCreationArt, sprite: (id, progress, cost) => `<svg data-art="${id}-${progress}-${cost}"></svg>` };
  if (withPresets) vm.runInContext(presetSource, ctx);
  vm.runInContext(source, ctx);
  const api = ctx.window.SceneryCreations;
  function click(action, type, amount) {
    const control = { insideRoot: true, disabled: false, dataset: { sceneryAction: action, sceneryType: type, sceneryAmount: amount } };
    root.handlers.click({ target: { closest: () => control } });
  }
  async function settle() { await ctx.farmActionChain; await tick(); }
  return { ctx, api, root, storage, calls, toasts, click, settle };
}

test('server catalog and permanent unlocks determine valid starts; the active scenery keeps its original theme', async () => {
  const gate = deferred();
  const h = harness({ state: { equippedFarmTheme: 'ocean' }, rpc: (name, params) => name === 'get_my_scenery_state' ? { data: serverState() } : gate.promise });
  await h.api.load(h.ctx.activeAuthUser);
  h.click('start', 'tree');
  h.click('start', 'pinkCoral');
  await tick();
  assert.equal(h.calls.length, 1, 'unmatched or locked types never send a write');
  h.click('start', 'coral');
  await tick();
  assert.equal(h.calls[1].name, 'start_my_scenery_creation');
  assert.equal(h.calls[1].params.p_type_id, 'coral');
  assert.equal(h.calls[1].params.p_theme_id, 'ocean');
  gate.resolve({ data: result(serverState({ activeCreation: creation({ typeId: 'coral', themeId: 'ocean' }) })) });
  await h.settle();
  h.ctx.state.equippedFarmTheme = 'iceKingdom';
  h.api.render();
  assert.match(h.root.innerHTML, /background-image:url\('\.\/ocean\.png'\)/);
  assert.match(h.root.innerHTML, /눈의 왕국에서 만들기/);
  assert.match(h.root.innerHTML, /새 테마는 다음 풍경부터 적용돼/);
  assert.equal(h.api.snapshot().activeCreation.themeId, 'ocean');
});

test('rapid growth clicks send one durable action, wait for the shared action queue, and spend only after confirmation', async () => {
  const queue = deferred();
  const response = deferred();
  const h = harness({ state: { farmMoney: 300 }, rpc: () => response.promise });
  h.api.applyState(serverState({ activeCreation: creation() }));
  h.ctx.farmActionChain = queue.promise;
  h.click('grow', undefined, '5');
  h.click('grow', undefined, '1');
  h.click('unlock', 'blossomTree');
  assert.equal(h.ctx.state.coins, 10);
  assert.equal(h.api.snapshot().activeCreation.progress, 0);
  assert.equal(h.calls.length, 0);
  const pending = JSON.parse(h.storage.get(intentKey('user-a')));
  assert.equal(pending.params.p_amount, 5);
  queue.resolve();
  await tick();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].name, 'grow_my_scenery_creation');
  assert.equal(h.calls[0].params.p_request_id, pending.requestId);
  response.resolve({ data: result(serverState({ activeCreation: creation({ progress: 5 }) }), { wallet: { coinBalance: 5, farmMoneyBalance: 100 }, event: { spentCoin: 5 } }) });
  await h.settle();
  assert.equal(h.ctx.state.coins, 5);
  assert.equal(h.api.snapshot().activeCreation.progress, 5);
  assert.equal(h.storage.has(intentKey('user-a')), false);
});

test('a lost response retains its request id and prevents another action until the same intent is confirmed', async () => {
  let attempts = 0;
  const progressed = serverState({ activeCreation: creation({ progress: 1 }) });
  const h = harness({ state: { farmMoney: 300 }, rpc: name => {
    if (name === 'get_my_scenery_state') return { data: progressed };
    if (name === 'get_my_farm_wallet') return { data: { coin_balance: 9, farm_money_balance: 100 } };
    return ++attempts === 1 ? { error: { message: 'Failed to fetch' } } : { data: result(progressed, { event: { spentCoin: 1 } }) };
  } });
  h.api.applyState(serverState({ activeCreation: creation() }));
  h.click('grow', undefined, '1');
  await h.settle();
  const saved = h.storage.get(intentKey('user-a'));
  assert.ok(saved);
  assert.equal(h.ctx.state.coins, 10);
  assert.match(h.root.innerHTML, /같은 작업 다시 확인/);
  h.click('unlock', 'blossomTree');
  h.click('grow', undefined, '5');
  await h.settle();
  assert.equal(h.calls.length, 1);
  h.click('retry');
  await h.settle();
  assert.equal(h.calls.filter(call => call.name === 'grow_my_scenery_creation').length, 2);
  assert.deepEqual(h.calls[1], h.calls[0]);
  assert.equal(h.ctx.state.coins, 9);
  assert.equal(h.storage.has(intentKey('user-a')), false);
});

test('pending intent survives a browser reload even when the server already committed the spend', async () => {
  const storage = new Map();
  const first = harness({ storage, rpc: () => ({ error: { message: 'Response interrupted after commit' } }) });
  first.api.applyState(serverState({ activeCreation: creation() }));
  first.click('grow', undefined, '1');
  await first.settle();
  const saved = JSON.parse(storage.get(intentKey('user-a')));
  const committed = serverState({ activeCreation: creation({ progress: 1 }) });
  const second = harness({ storage, state: { coins: 9 }, rpc: name => ({ data: name === 'get_my_scenery_state' ? committed : name === 'get_my_farm_wallet' ? { coin_balance: 9, farm_money_balance: 100 } : result(committed) }) });
  await second.api.load(second.ctx.activeAuthUser);
  assert.match(second.root.innerHTML, /이전에 보낸 작업/);
  second.click('grow', undefined, '1');
  assert.equal(second.calls.length, 1);
  second.click('retry');
  await second.settle();
  assert.equal(second.calls[1].params.p_request_id, saved.requestId);
  assert.equal(second.ctx.state.coins, 9);
  assert.equal(second.api.snapshot().activeCreation.progress, 1);
});

test('an in-flight response from a previous account cannot touch the next account or delete its recovery intent', async () => {
  const gate = deferred();
  const h = harness({ rpc: name => name === 'get_my_scenery_state' ? { data: serverState({ activeCreation: creation({ id: 'user-b-creation', progress: 4 }) }) } : gate.promise });
  h.api.applyState(serverState({ activeCreation: creation() }));
  h.click('grow', undefined, '1');
  await tick();
  const oldChain = h.ctx.farmActionChain;
  h.ctx.activeAuthUser = { id: 'user-b' };
  h.ctx.farmSessionGeneration += 1;
  h.ctx.farmActionChain = Promise.resolve();
  h.ctx.state.coins = 77;
  h.api.reset();
  await h.api.load(h.ctx.activeAuthUser);
  gate.resolve({ data: result(serverState({ activeCreation: creation({ progress: 1 }) })) });
  await oldChain;
  assert.equal(h.ctx.state.coins, 77);
  assert.equal(h.api.snapshot().activeCreation.id, 'user-b-creation');
  assert.ok(h.storage.has(intentKey('user-a')), 'previous account can recover its result after signing in again');
  assert.equal(h.storage.has(intentKey('user-b')), false);
});

test('a superseded load cannot overwrite the newer server state', async () => {
  const first = deferred();
  const second = deferred();
  let reads = 0;
  const h = harness({ rpc: () => ++reads === 1 ? first.promise : second.promise });
  const firstLoad = h.api.load(h.ctx.activeAuthUser);
  await tick();
  const secondLoad = h.api.load(h.ctx.activeAuthUser);
  await tick();
  second.resolve({ data: serverState({ activeCreation: creation({ progress: 8 }) }) });
  assert.equal(await secondLoad, true);
  first.resolve({ data: serverState({ activeCreation: creation({ progress: 2 }) }) });
  assert.equal(await firstLoad, false);
  assert.equal(h.api.snapshot().activeCreation.progress, 8);
});

test('a refresh started before a confirmed mutation cannot roll back progress or the wallet', async () => {
  const read = deferred();
  const h = harness({ rpc: name => name === 'get_my_scenery_state' ? read.promise : { data: result(serverState({ activeCreation: creation({ progress: 5 }) }), { wallet: { coinBalance: 5, farmMoneyBalance: 100 } }) } });
  h.api.applyState(serverState({ activeCreation: creation() }));
  const loading = h.api.load(h.ctx.activeAuthUser);
  await tick();
  h.click('grow', undefined, '5');
  await h.settle();
  read.resolve({ data: serverState({ activeCreation: creation({ progress: 0 }) }) });
  assert.equal(await loading, false);
  assert.equal(h.api.snapshot().activeCreation.progress, 5);
  assert.equal(h.ctx.state.coins, 5);
});

test('a missing server migration renders a useful unavailable state and sends no local gameplay writes', async () => {
  const h = harness({ state: { farmMoney: 300 }, rpc: () => ({ error: { code: 'PGRST202', message: 'Could not find the function public.get_my_scenery_state in the schema cache' } }) });
  assert.equal(await h.api.load(h.ctx.activeAuthUser), false);
  h.click('start', 'tree');
  h.click('grow', undefined, '1');
  h.click('unlock', 'blossomTree');
  await h.settle();
  assert.equal(h.calls.length, 1);
  assert.equal(h.api.snapshot(), null);
  assert.equal(h.ctx.state.coins, 10);
  assert.match(h.root.innerHTML, /서버 업데이트가 적용되면/);
  assert.match(h.root.innerHTML, /다시 불러오기/);
});

test('a storage failure blocks outbound spending so a recoverable request is always saved first', async () => {
  const h = harness({ storageFailure: true });
  h.api.applyState(serverState({ activeCreation: creation() }));
  h.click('grow', undefined, '1');
  await h.settle();
  assert.equal(h.calls.length, 0);
  assert.equal(h.ctx.state.coins, 10);
  assert.match(h.root.innerHTML, /브라우저에 작업을 저장할 수 없어/);
});

test('business rejections clear the intent and refresh authoritative progress without spending locally', async () => {
  const h = harness({ rpc: name => name === 'get_my_scenery_state' ? { data: serverState({ activeCreation: creation({ progress: 20 }) }) } : { error: { code: 'P0001', message: 'SCENERY_ALREADY_COMPLETE' } } });
  h.api.applyState(serverState({ activeCreation: creation({ progress: 19 }) }));
  h.click('grow', undefined, '1');
  await h.settle();
  assert.equal(h.storage.has(intentKey('user-a')), false);
  assert.equal(h.ctx.state.coins, 10);
  assert.equal(h.api.snapshot().activeCreation.progress, 20);
  assert.match(h.root.innerHTML, /보상 받기/);
});

test('claiming credits the server wallet and retains completed counts while repeated clicks are blocked', async () => {
  const gate = deferred();
  const h = harness({ rpc: () => gate.promise });
  h.api.applyState(serverState({ activeCreation: creation({ progress: 20 }) }));
  h.click('claim');
  h.click('claim');
  await tick();
  assert.equal(h.calls.length, 1);
  assert.equal(h.ctx.state.farmMoney, 100);
  gate.resolve({ data: result(serverState({ completedTypes: [{ typeId: 'tree', count: 1 }], totalCompleted: 1 }), { wallet: { coinBalance: 10, farmMoneyBalance: 150 }, event: { reward: 50 } }) });
  await h.settle();
  assert.equal(h.ctx.state.farmMoney, 150);
  assert.equal(h.ctx.state.weeklyFarmMoneyEarned, 50);
  assert.equal(h.api.snapshot().activeCreation, null);
  assert.match(h.root.innerHTML, /총 1회 완성/);
  assert.match(h.root.innerHTML, /작은 나무/);
});

test('unlocking is permanent, does not start an extra creation, and uses the authoritative price', async () => {
  const h = harness({ state: { farmMoney: 299 }, rpc: () => ({ data: result(serverState({ activeCreation: creation(), unlockedTypes: ['tree', 'coral', 'snowman', 'blossomTree'] }), { wallet: { coinBalance: 10, farmMoneyBalance: 0 }, event: { unlockPrice: 300 } }) }) });
  h.api.applyState(serverState({ activeCreation: creation() }));
  assert.match(h.root.innerHTML, /해금 · 300 Farm Money/);
  h.click('unlock', 'blossomTree');
  await h.settle();
  assert.equal(h.calls.length, 0, '299 Farm Money cannot unlock a 300 Farm Money type');
  h.ctx.state.farmMoney = 300;
  h.api.render();
  h.click('unlock', 'blossomTree');
  await h.settle();
  assert.equal(h.calls[0].name, 'unlock_my_scenery_type');
  assert.equal(h.calls[0].params.p_type_id, 'blossomTree');
  assert.equal(h.api.snapshot().activeCreation.id, 'creation-1');
  assert.equal(h.ctx.state.farmMoney, 0);
  h.click('unlock', 'blossomTree');
  assert.equal(h.calls.length, 1);
});

test('invalid server shapes remain non-actionable and names are escaped in the UI', async () => {
  const h = harness();
  assert.equal(h.api.applyState(serverState({ activeCreation: creation({ progress: 21 }) })), false);
  assert.equal(h.api.applyState(serverState({ catalog: [{ id: 'tree', name: 'test', growthCost: 0, unlockPrice: 0, reward: 50 }] })), false);
  const named = serverState();
  named.catalog[0].name = '<img src=x onerror=alert(1)>';
  assert.equal(h.api.applyState(named), true);
  assert.match(h.root.innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(h.root.innerHTML, /<img src=x/);
});

test('a task wallet confirmation completes before scenery spends, and later wallet writes wait behind scenery', async () => {
  const task = deferred();
  const spend = deferred();
  const h = harness({ rpc: () => spend.promise });
  h.api.applyState(serverState({ activeCreation: creation() }));
  h.ctx.farmWalletMutationChain = task.promise.then(() => { h.ctx.state.coins = 15; });
  h.click('grow', undefined, '5');
  let laterWalletWrite = false;
  const later = h.ctx.farmWalletMutationChain.then(() => { laterWalletWrite = true; h.ctx.state.coins += 2; });
  await tick();
  assert.equal(h.calls.length, 0, 'spending waits for the task wallet confirmation');
  task.resolve();
  await tick();
  assert.equal(h.ctx.state.coins, 15);
  assert.equal(h.calls.length, 1);
  assert.equal(laterWalletWrite, false, 'a later wallet confirmation cannot race the scenery response');
  spend.resolve({ data: result(serverState({ activeCreation: creation({ progress: 5 }) }), { wallet: { coinBalance: 10, farmMoneyBalance: 100 } }) });
  await later;
  assert.equal(h.ctx.state.coins, 12);
  assert.equal(h.api.snapshot().activeCreation.progress, 5);
});

test('recovery applies the current creation and wallet, and retains the intent when a fresh read fails', async () => {
  let failRead = true;
  let attempts = 0;
  const h = harness({ rpc: name => {
    if (name === 'get_my_scenery_state') return failRead ? { error: { message: 'Read interrupted' } } : { data: serverState({ activeCreation: creation({ progress: 12 }) }) };
    if (name === 'get_my_farm_wallet') return { data: { coin_balance: 88, farm_money_balance: 450 } };
    return ++attempts === 1 ? { error: { message: 'Original response lost' } } : { data: result(serverState({ activeCreation: creation({ progress: 1 }) }), { wallet: { coinBalance: 9, farmMoneyBalance: 100 } }) };
  } });
  h.api.applyState(serverState({ activeCreation: creation() }));
  h.click('grow', undefined, '1'); await h.settle();
  const request = JSON.parse(h.storage.get(intentKey('user-a'))).requestId;
  h.click('retry'); await h.settle();
  assert.equal(h.ctx.state.coins, 10, 'cached wallet is not applied when recovery cannot read the current state');
  assert.equal(h.api.snapshot().activeCreation.progress, 0);
  assert.equal(JSON.parse(h.storage.get(intentKey('user-a'))).requestId, request);
  failRead = false;
  h.click('retry'); await h.settle();
  assert.equal(h.ctx.state.coins, 88);
  assert.equal(h.ctx.state.farmMoney, 450);
  assert.equal(h.api.snapshot().activeCreation.progress, 12);
  assert.equal(h.storage.has(intentKey('user-a')), false);
  assert.equal(h.calls.filter(call => call.name === 'grow_my_scenery_creation').every(call => call.params.p_request_id === request), true);
});

test('growth metrics follow the four artwork stages and preserve exact Coin progress', () => {
  const h = harness();
  for (const [progress, stage] of [[0, 0], [4, 0], [5, 1], [11, 1], [12, 2], [19, 2], [20, 3]]) {
    const info = plain(h.api.progressInfo(creation({ progress })));
    assert.equal(info.progress, progress);
    assert.equal(info.cost, 20);
    assert.equal(info.percent, progress * 5);
    assert.equal(info.remaining, 20 - progress);
    assert.equal(info.stage, stage, 'stage boundary at ' + progress + ' Coin');
    assert.deepEqual(info.stageProgress, [0, 5, 12, 20]);
  }
  assert.deepEqual(plain(h.api.progressInfo(creation({ progress: 14 }))), {
    progress: 14, cost: 20, percent: 70, remaining: 6, stage: 2, stageName: '거의 완성', stageProgress: [0, 5, 12, 20],
  });
  assert.deepEqual(plain(h.api.progressInfo(creation({ progress: 9, growthCost: 30 }))).stageProgress, [0, 8, 18, 30]);
});

test('current scenery shows truthful metrics and current art beside completed examples', () => {
  const h = harness();
  h.api.applyState(serverState({ activeCreation: creation({ progress: 14 }) }));
  assert.match(h.root.innerHTML, /70% 성장/);
  assert.match(h.root.innerHTML, /<b>14 \/ 20<\/b> Coin 사용/);
  assert.match(h.root.innerHTML, /완성까지 <b>6 Coin<\/b>/);
  assert.match(h.root.innerHTML, /3 \/ 4단계 · 거의 완성/);
  assert.match(h.root.innerHTML, /aria-valuetext="70% · 14 \/ 20 Coin 사용 · 6 Coin 남음"/);
  assert.equal((h.root.innerHTML.match(/aria-current="step"/g) || []).length, 1);
  assert.match(h.root.innerHTML, /data-scenery-stage="2" aria-current="step"/);
  const activeCard = h.root.innerHTML.match(/<article class="scenery-type-card is-current"[\s\S]*?<\/article>/)[0];
  assert.match(activeCard, /data-art="tree-14-20"/);
  assert.match(activeCard, /현재 성장 · 70%/);
  assert.match(activeCard, /14 \/ 20 Coin 사용 · 6 Coin 남음/);
  const otherCard = h.root.innerHTML.match(/<article class="scenery-type-card" data-scenery-card="blossomTree"[\s\S]*?<\/article>/)[0];
  assert.match(otherCard, /data-art="blossomTree-20-20"/);
  assert.match(otherCard, /완성 예시/);
});

test('idle scenery uses labelled completed previews without inventing growth progress', () => {
  const h = harness();
  h.api.applyState(serverState());
  assert.match(h.root.innerHTML, /성장 모습 미리보기/);
  assert.match(h.root.innerHTML, /완성 모습 미리보기/);
  assert.equal((h.root.innerHTML.match(/data-scenery-stage="/g) || []).length, 4);
  assert.doesNotMatch(h.root.innerHTML, /aria-current="step"|Coin 사용|role="progressbar"/);
});

test('all 21 theme presets select distinct primary objects without removing old choices', () => {
  const h = harness({ withPresets: true });
  const presets = h.ctx.window.SceneryThemePresets;
  const sql = fs.readFileSync(path.join(__dirname, '../supabase/migrations/086_theme_creations.sql'), 'utf8');
  const legacy = [...sql.matchAll(/\('([^']+)', '([^']+)', '([^']+)', (\d+), (\d+), (\d+), (\d+)\)/g)].map(([, id, name, family, variant, unlockPrice, growthCost, reward]) => ({ id, name, family, variant: +variant, unlockPrice: +unlockPrice, growthCost: +growthCost, reward: +reward }));
  const fullCatalog = legacy.concat(plain(presets.newTypes));
  assert.equal(fullCatalog.length, 31);
  assert.equal(presets.themes.length, 21);
  assert.equal(new Set(presets.themes.map(theme => h.api.defaultType(theme.id))).size, 21);
  for (const theme of presets.themes) {
    h.ctx.state.equippedFarmTheme = theme.id;
    assert.deepEqual(plain(h.api.themeTypes(theme.id)), plain(theme.types));
    assert.equal(h.api.defaultType(theme.id), theme.defaultType);
    h.api.applyState(serverState({ catalog: fullCatalog, unlockedTypes: fullCatalog.filter(item => !item.unlockPrice).map(item => item.id) }));
    assert.match(h.root.innerHTML, new RegExp('data-art="' + theme.defaultType + '-20-20"'));
    assert.match(h.root.innerHTML, new RegExp('data-scenery-type="' + theme.defaultType + '"'));
    assert.doesNotMatch(h.root.innerHTML, /서버 준비 중/);
  }
  assert.deepEqual(plain(h.api.themeTypes('goldenHarvest')), ['goldenWheat', 'tree', 'blossomTree', 'goldenTree']);
  assert.equal(h.api.defaultType('tuxedoCat'), 'tuxedoCat');
  assert.deepEqual(plain(h.api.themeTypes('tuxedoCat')), ['tuxedoCat']);
  assert.equal(presets.theme('tuxedoCat').subject, '턱시도 고양이');
  assert.ok(presets.theme('tuxedoCat').stageLabels.every(label => label.includes('고양이')));
  assert.ok(!presets.theme('tuxedoCat').subject.includes('나무'));
});

test('a missing new primary stays a disabled preview while an old pinned creation remains growable', async () => {
  const oldState = serverState({ activeCreation: creation({ themeId: 'cherryBlossom', progress: 14 }) });
  const h = harness({ withPresets: true, state: { equippedFarmTheme: 'cherryBlossom' }, rpc: () => ({ data: result(serverState({ activeCreation: creation({ themeId: 'cherryBlossom', progress: 15 }) })) }) });
  h.api.applyState(serverState());
  const newCard = h.root.innerHTML.match(/<article class="scenery-type-card" data-scenery-card="cherryTree"[\s\S]*?<\/article>/)[0];
  assert.match(newCard, /data-art="cherryTree-20-20"/);
  assert.match(newCard, /서버 준비 중/);
  assert.match(newCard, /data-scenery-action="start"[\s\S]*? disabled>준비 중/);
  h.click('start', 'cherryTree');
  await h.settle();
  assert.equal(h.calls.length, 0, 'a preview cannot invent server ownership or send a start');
  h.api.applyState(oldState);
  assert.match(h.root.innerHTML, /data-art="tree-14-20"/);
  assert.match(h.root.innerHTML, /만들던 풍경은 계속 키울 수 있어/);
  h.click('grow', undefined, '1');
  await h.settle();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].name, 'grow_my_scenery_creation');
  assert.equal(h.api.snapshot().activeCreation.typeId, 'tree');
  assert.equal(h.api.snapshot().activeCreation.progress, 15);
});
