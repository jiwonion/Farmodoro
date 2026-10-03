const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../garden-seeds.js'), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
};

function seedsContext(overrides = {}) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) {
      const classes = new Set(id === 'gardenSeedModal' ? ['hidden'] : []);
      elements.set(id, {
        id, innerHTML: '', textContent: '', value: '', handlers: {}, focusCalls: 0,
        classList: {add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value)},
        querySelector: selector => element(selector.slice(1)),
        addEventListener(type, callback) {this.handlers[type] = callback;},
        focus() {this.focusCalls++;},
      });
    }
    return elements.get(id);
  };
  const calls = []; const toasts = [];
  let uuid = 0;
  const ctx = vm.createContext({
    console, window: {},
    document: {querySelector: selector => selector.startsWith('#farmGrid ') ? element('farmPlotButton') : element(selector.slice(1))},
    state: {coins: 10, seedInventory: {carrot: 2, strawberry: 0}, farmPlots: [{id:0,crop:null},{id:1,crop:null}]},
    CROPS: {carrot: {name:'당근',seedPrice:2,growthCost:3}, strawberry: {name:'딸기',seedPrice:4,growthCost:4}},
    activeAuthUser: {id:'seed-user'}, farmDataHydrated: true,
    farmActionChain: Promise.resolve(),
    supabaseClient: {rpc: async (rpc, params) => {
      calls.push({rpc, params:plain(params)});
      return {data:{plots:[{id:params.p_plot_index,crop:params.p_crop_id}],inventory:[],wallet:{}},error:null};
    }},
    createUuid: () => `request-${++uuid}`,
    escapeHtml: value => String(value), cropPixel: () => '', getCropGrowthCost: id => ctx.CROPS[id].growthCost,
    showToast: text => toasts.push(text),
    farmActionErrorSentinel: error => String(error?.message || '').match(/FARM_[A-Z_]+/)?.[0] || '',
    FARM_ACTION_ERROR_MESSAGES: {FARM_PLOT_OCCUPIED:'이 밭은 이미 심어졌어.',FARM_INSUFFICIENT_COIN:'Coin이 부족해.'},
    renderFarm() {}, renderSummary() {},
    applyFarmActionResult: result => {
      for (const plot of result?.plots || []) Object.assign(ctx.state.farmPlots.find(entry=>entry.id===plot.id), plot);
      for (const item of result?.inventory || []) if (item.category==='seed') ctx.state.seedInventory[item.itemId] = item.quantity;
      if (Number.isFinite(result?.wallet?.coinBalance)) ctx.state.coins=result.wallet.coinBalance;
    },
    ...overrides,
  });
  vm.runInContext(source, ctx);
  const click = id => element('gardenSeedModal').handlers.click({target:{closest:selector=>selector==='[data-garden-plant]' ? {dataset:{gardenPlant:id},disabled:false} : null}});
  return {ctx,api:ctx.window.FarmSeeds,element,click,calls,toasts};
}

test('empty plot opens crop choices with owned seeds and care stages', () => {
  const {api,element} = seedsContext();
  api.open(0);
  assert.equal(element('gardenSeedModal').classList.contains('hidden'), false);
  assert.match(element('gardenSeedChoices').innerHTML, /당근/);
  assert.match(element('gardenSeedChoices').innerHTML, /보유 씨앗 2개/);
  assert.match(element('gardenSeedChoices').innerHTML, /수확까지 돌보기 3단계/);
  assert.match(element('gardenSeedChoices').innerHTML, /수확까지 돌보기 4단계/);
  assert.doesNotMatch(element('gardenSeedChoices').innerHTML, /집중\s*\d+분/);
  assert.match(element('gardenSeedChoices').innerHTML, /4 Coin/);
  assert.equal(element('gardenSeedSearch').focusCalls, 1);
});

test('occupied and nonexistent plots do not open a planting dialog', () => {
  const {ctx,api,element} = seedsContext();
  ctx.state.farmPlots[0].crop='carrot';
  api.open(0);
  api.open(10);
  assert.equal(element('gardenSeedModal').classList.contains('hidden'), true);
});

test('owned seeds can be planted with a negative Coin balance without local debit', async () => {
  const pending = deferred();
  const calls = [];
  const {ctx,api,element,click} = seedsContext({supabaseClient:{rpc:(rpc,params)=>{calls.push({rpc,params:plain(params)});return pending.promise;}}});
  ctx.state.coins=-3;
  api.open(0);
  assert.match(element('gardenSeedChoices').innerHTML, /data-garden-plant="carrot" >보유 씨앗으로 심기/);
  click('carrot');
  await tick();
  assert.equal(calls.length,1);
  assert.equal(calls[0].rpc,'buy_and_plant_farm_seed');
  assert.equal(ctx.state.coins,-3);
  assert.equal(ctx.state.seedInventory.carrot,2);
  assert.equal(ctx.state.farmPlots[0].crop,null);
  pending.resolve({data:{plots:[{id:0,crop:'carrot',focusCropInstanceId:'new-planting'}],inventory:[{category:'seed',itemId:'carrot',quantity:1}],wallet:{coinBalance:-3}},error:null});
  await tick();
  assert.equal(ctx.state.farmPlots[0].crop,'carrot');
  assert.equal(ctx.state.seedInventory.carrot,1);
  assert.equal(ctx.state.coins,-3);
  assert.equal(element('gardenSeedModal').classList.contains('hidden'),true);
});

test('purchase and planting update the wallet only after the confirmed server response', async () => {
  const pending = deferred();
  const {ctx,api,click,element,toasts} = seedsContext({supabaseClient:{rpc:()=>pending.promise}});
  api.open(1);
  click('strawberry');
  await tick();
  assert.equal(ctx.state.coins,10);
  assert.equal(ctx.state.farmPlots[1].crop,null);
  assert.equal(toasts.length,0);
  assert.equal(element('gardenSeedModal').classList.contains('hidden'),false);
  pending.resolve({data:{plots:[{id:1,crop:'strawberry'}],inventory:[{category:'seed',itemId:'strawberry',quantity:1}],wallet:{coinBalance:6},event:{bonuses:['seedDouble']}},error:null});
  await tick();
  assert.equal(ctx.state.coins,6);
  assert.equal(ctx.state.farmPlots[1].crop,'strawberry');
  assert.equal(ctx.state.seedInventory.strawberry,1);
  assert.equal(toasts.length,1);
  assert.equal(element('gardenSeedModal').classList.contains('hidden'),true);
});

test('an unaffordable new seed and unhydrated farm cannot submit a request', async () => {
  const {ctx,api,click,calls} = seedsContext();
  ctx.state.coins=3;
  api.open(0);
  click('strawberry');
  await tick();
  assert.equal(calls.length,0);
  ctx.farmDataHydrated=false;
  click('carrot');
  await tick();
  assert.equal(calls.length,0);
});

test('a failed request keeps the entire wallet, plot and seed inventory unchanged', async () => {
  const {ctx,api,click,toasts,element} = seedsContext({supabaseClient:{rpc:async()=>({data:null,error:{message:'FARM_INSUFFICIENT_COIN'}})}});
  const before=plain(ctx.state);
  api.open(1);
  click('strawberry');
  await tick();
  assert.deepEqual(plain(ctx.state),before);
  assert.equal(toasts.length,1);
  assert.equal(element('gardenSeedModal').classList.contains('hidden'),false);
  assert.doesNotMatch(element('gardenSeedChoices').innerHTML,/data-garden-plant="strawberry" disabled/);
});

test('an ambiguous transport failure retries the same plot and crop with the same request UUID', async () => {
  const calls=[];
  const {api,click,ctx} = seedsContext({supabaseClient:{rpc:async(rpc,params)=>{
    calls.push({rpc,params:plain(params)});
    if(calls.length===1) throw new Error('Network response lost');
    return {data:{plots:[{id:0,crop:'carrot'}],inventory:[{category:'seed',itemId:'carrot',quantity:1}],wallet:{coinBalance:10}},error:null};
  }}});
  api.open(0);
  click('carrot');
  await tick();
  assert.equal(ctx.state.farmPlots[0].crop,null);
  click('carrot');
  await tick();
  assert.equal(calls.length,2);
  assert.equal(calls[0].params.p_request_id,calls[1].params.p_request_id);
  assert.deepEqual(calls[0].params,calls[1].params);
  assert.equal(ctx.state.farmPlots[0].crop,'carrot');
});

test('a cached planting retry restores current farm and wallet data after that old crop was harvested', async () => {
  const rpcCalls=[]; const refreshes=[];
  const {ctx,api,click,toasts,element}=seedsContext({
    supabaseClient:{rpc:async(rpc,params)=>{
      rpcCalls.push({rpc,params:plain(params)});
      if(rpcCalls.length===1)throw new Error('Committed planting response was lost');
      return {data:{plots:[{id:0,crop:'carrot',growth:0,focusCropInstanceId:'old-planting'}],
        inventory:[{category:'seed',itemId:'carrot',quantity:1}],wallet:{coinBalance:10}},error:null};
    }},
    loadFarmDataFromDatabase:async user=>{
      refreshes.push({kind:'farm',user:user.id});
      Object.assign(ctx.state.farmPlots[0],{crop:null,growth:0,focusCropInstanceId:null});
      ctx.state.seedInventory.carrot=5;
    },
    loadFarmWallet:async user=>{refreshes.push({kind:'wallet',user:user.id});ctx.state.coins=27;},
  });
  api.open(0);click('carrot');await tick();
  // Another device harvested the committed planting, received seeds and
  // earned Coin while this device still held its ambiguous request UUID.
  ctx.state.coins=25;ctx.state.seedInventory.carrot=5;
  click('carrot');await tick();
  assert.equal(rpcCalls.length,2);
  assert.equal(rpcCalls[0].params.p_request_id,rpcCalls[1].params.p_request_id);
  assert.equal(ctx.state.farmPlots[0].crop,null,'a cached response cannot resurrect a harvested planting');
  assert.equal(ctx.state.seedInventory.carrot,5,'current seed gifts survive the cached inventory count');
  assert.equal(ctx.state.coins,27,'the authoritative wallet survives the cached Coin balance');
  assert.ok(refreshes.some(entry=>entry.kind==='farm'&&entry.user==='seed-user'));
  assert.ok(refreshes.some(entry=>entry.kind==='wallet'&&entry.user==='seed-user'));
  assert.match(toasts.at(-1),/확인/,'a replay confirms the previous save instead of announcing another planting');
  assert.equal(element('gardenSeedModal').classList.contains('hidden'),true);
});

test('an account switch during retry refresh cannot publish an old account planting confirmation', async () => {
  const refresh=deferred();let rpcCalls=0;
  const {ctx,api,click,toasts}=seedsContext({
    supabaseClient:{rpc:async()=>{
      rpcCalls++;
      if(rpcCalls===1)throw new Error('Committed planting response was lost');
      return {data:{plots:[{id:0,crop:'carrot'}],wallet:{coinBalance:10}},error:null};
    }},
    loadFarmDataFromDatabase:()=>refresh.promise,
    loadFarmWallet:async()=>{},
  });
  api.open(0);click('carrot');await tick();
  const priorToasts=toasts.length;
  click('carrot');await tick();
  ctx.activeAuthUser={id:'new-seed-user'};api.reset();ctx.state.coins=55;
  refresh.resolve();await tick();
  assert.equal(toasts.length,priorToasts);
  assert.equal(ctx.state.coins,55);
});

test('a failed authoritative refresh never replaces current data with cached planting balances', async () => {
  let calls=0;
  const {ctx,api,click}=seedsContext({
    supabaseClient:{rpc:async()=>{
      if(++calls===1)throw new Error('Committed planting response was lost');
      return {data:{plots:[{id:0,crop:'carrot',focusCropInstanceId:'old-planting'}],
        inventory:[{category:'seed',itemId:'carrot',quantity:1}],wallet:{coinBalance:10}},error:null};
    }},
    // The real readers handle network failures without throwing or mutating state.
    loadFarmDataFromDatabase:async()=>{},loadFarmWallet:async()=>{},
  });
  api.open(0);click('carrot');await tick();
  ctx.state.coins=25;ctx.state.seedInventory.carrot=5;
  click('carrot');await tick();
  assert.equal(ctx.state.coins,25);
  assert.equal(ctx.state.seedInventory.carrot,5);
  assert.equal(ctx.state.farmPlots[0].crop,null);
});

test('a definitive business failure permits a fresh request instead of replaying it', async () => {
  const calls=[];
  const {api,click} = seedsContext({supabaseClient:{rpc:async(rpc,params)=>{
    calls.push(plain(params));return {data:null,error:{message:'FARM_INSUFFICIENT_COIN'}};
  }}});
  api.open(1);
  click('strawberry'); await tick();
  click('strawberry'); await tick();
  assert.notEqual(calls[0].p_request_id,calls[1].p_request_id);
});

test('missing new RPC falls back only for already owned seeds and uses its original UUID', async () => {
  const calls=[];
  const {api,click} = seedsContext({supabaseClient:{rpc:async(rpc,params)=>{
    calls.push({rpc,params:plain(params)});
    return rpc==='buy_and_plant_farm_seed' ? {data:null,error:{code:'PGRST202'}} : {data:{plots:[{id:0,crop:'carrot'}]},error:null};
  }}});
  api.open(0);click('carrot');await tick();
  assert.deepEqual(calls.map(call=>call.rpc),['buy_and_plant_farm_seed','plant_farm_seed']);
  assert.equal(calls[0].params.p_request_id,calls[1].params.p_request_id);
  const other = seedsContext({supabaseClient:{rpc:async(rpc,params)=>{other.calls.push({rpc,params:plain(params)});return {data:null,error:{code:'PGRST202'}};}}});
  other.api.open(1);other.click('strawberry');await tick();
  assert.deepEqual(other.calls.map(call=>call.rpc),['buy_and_plant_farm_seed']);
  assert.equal(other.ctx.state.coins,10);
});

test('double clicks and closing cannot duplicate an in-flight planting', async () => {
  const pending=deferred();let calls=0;
  const {api,click,element} = seedsContext({supabaseClient:{rpc:()=>{calls++;return pending.promise;}}});
  api.open(0);click('carrot');click('carrot');api.close();await tick();
  assert.equal(calls,1);
  assert.equal(element('gardenSeedModal').classList.contains('hidden'),false);
  pending.resolve({data:{plots:[{id:0,crop:'carrot'}]},error:null});await tick();
  assert.equal(element('gardenSeedModal').classList.contains('hidden'),true);
});

test('an old account response cannot modify or announce success in the new account', async () => {
  const pending=deferred();
  const {ctx,api,click,toasts} = seedsContext({supabaseClient:{rpc:()=>pending.promise}});
  api.open(0);click('carrot');await tick();
  ctx.activeAuthUser={id:'new-seed-user'};api.reset();
  pending.resolve({data:{plots:[{id:0,crop:'carrot'}],wallet:{coinBalance:999}},error:null});await tick();
  assert.equal(ctx.state.farmPlots[0].crop,null);
  assert.equal(ctx.state.coins,10);
  assert.equal(toasts.length,0);
});

test('an old account queued intent cannot run using the next account session', async () => {
  const prior=deferred();
  const {ctx,api,click,calls} = seedsContext({farmActionChain:prior.promise});
  api.open(0);click('carrot');await tick();
  ctx.activeAuthUser={id:'new-seed-user'};api.reset();
  prior.resolve();await tick();
  assert.equal(calls.length,0,'queued planting must check its account before invoking the RPC');
  assert.equal(ctx.state.farmPlots[0].crop,null);
});

test('finishing an old account request cannot release a new account planting lock', async () => {
  const old=deferred();const current=deferred();let calls=0;
  const {ctx,api,click} = seedsContext({supabaseClient:{rpc:()=>{calls++;return calls===1 ? old.promise : current.promise;}}});
  api.open(0);click('carrot');await tick();
  ctx.activeAuthUser={id:'new-seed-user'};api.reset();
  api.open(1);click('strawberry');await tick();
  old.resolve({data:{plots:[{id:0,crop:'carrot'}]},error:null});await tick();
  click('strawberry');await tick();
  assert.equal(calls,2,'the old finally block must not unlock the current request');
  current.resolve({data:{plots:[{id:1,crop:'strawberry'}]},error:null});await tick();
  assert.equal(ctx.state.farmPlots[0].crop,null);
  assert.equal(ctx.state.farmPlots[1].crop,'strawberry');
});
