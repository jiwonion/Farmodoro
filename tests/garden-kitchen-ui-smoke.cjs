// Runs the real application in Chrome with local, observable farm RPC responses.
// Node 22+; CHROME_PATH may override the Windows Chrome installation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'farmodoro-kitchen-ui-'));
const chromePath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const stub = `<script>
  window.__farmRpcCalls = [];
  window.supabase = { createClient: () => ({
    auth: { getSession: () => new Promise(() => {}) },
    rpc: async (name, params) => {
      window.__farmRpcCalls.push({ name, params });
      return window.__farmRpcHandler ? window.__farmRpcHandler(name, params) : { data: null, error: null };
    }
  }) };
</script>`;
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  .replace(/<script\b[^>]*src="(?:https:[^"]*|\.\/pwa-register\.js[^"]*)"[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace('<script src="./supabase-config.js">', stub + '<script src="./supabase-config.js">');
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const file = path.resolve(root, '.' + pathname);
  if (pathname === '/') { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html); return; }
  if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  try {
    response.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream');
    response.end(fs.readFileSync(file));
  } catch { response.writeHead(404).end(); }
});
let chrome;
let ws;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-sandbox', '--disable-crash-reporter', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  chrome.on('error', error => { throw error; });
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 200 && !fs.existsSync(portFile); i++) await pause(50);
  const port = fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0];
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  const exceptions = [];
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const next = ++id;
    const timeout = setTimeout(() => reject(new Error(`Timeout: ${method}`)), 10000);
    pending.set(next, message => {
      clearTimeout(timeout);
      if (message.error) reject(new Error(JSON.stringify(message.error))); else resolve(message.result);
    });
    ws.send(JSON.stringify({ id: next, method, params }));
  });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const settle = async predicate => {
    for (let i = 0; i < 100; i++) { if (await evaluate(predicate)) return; await pause(25); }
    assert.fail('UI did not settle: ' + predicate);
  };
  await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
  await settle('document.readyState === "complete"');
  await evaluate(`
    document.documentElement.className = '';
    document.body.classList.remove('auth-gated');
    document.querySelector('#authGate').hidden = true;
    document.querySelector('.auth-boot').remove();
    activeAuthUser = { id: 'ui-kitchen-owner' };
    farmDataHydrated = true;
    farmDataUserId = activeAuthUser.id;
    pageDataRefreshTimes.set(activeAuthUser.id + ':farm', Date.now() + 60000);
    focusTimerDatabaseUnavailable = true;
    state.farmMoney = 700;
    state.harvestInventory = { ...defaultState.harvestInventory, carrot: 4, potato: 3, wheat: 2, strawberry: 5, apple: 1, lemon: 1 };
    state.foodInventory = { ...defaultState.foodInventory };
    state.equippedFarmTheme = 'cherryBlossom';
    state.equippedPlotSkin = null;
    renderFarm(); showPage('farm'); FarmKitchen.open();
    window.__farmRpcHandler = async (name, params) => {
      if (name === 'cook_my_farm_recipe') return { data: {
        inventory: [
          { category: 'harvest', itemId: 'wheat', quantity: 0 },
          { category: 'harvest', itemId: 'strawberry', quantity: 3 },
          { category: 'food', itemId: 'berryTart', quantity: 3 },
        ],
        event: { recipeId: params.p_recipe_id, quantity: params.p_quantity, foodAmount: 3, matched: true },
      }, error: null };
      if (name === 'sell_all_my_farm_food') return { data: {
        inventory: [{ category: 'food', itemId: 'berryTart', quantity: 0 }],
        wallet: { farmMoneyBalance: 838 }, weeklyFarmMoneyEarned: 138,
        event: { soldCount: 3, saleAmount: 138 },
      }, error: null };
      return { data: null, error: null };
    };
  `);
  assert.equal(await evaluate(`!document.querySelector('#farmKitchenModal').classList.contains('hidden')`), true);
  assert.equal(await evaluate(`!document.querySelector('.kitchen-legacy,#kitchenIngredients,#kitchenCauldron,#recipeBookList')`), true, 'The replaced ingredient picker and recipe book are removed');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.kitchen-v2-panel')).backgroundColor`), 'rgb(255, 255, 255)', 'Kitchen uses the application paper color');
  await evaluate(`document.querySelector('[data-kitchen-recipe="berryTart"]').click(); document.querySelector('[data-kitchen-quantity-max]').click();`);
  assert.equal(await evaluate(`document.querySelector('#kitchenCookQuantity').value`), '2');
  assert.match(await evaluate(`document.querySelector('.kitchen-v2-required-ingredients').textContent`), /밀\s*2개/);
  await evaluate(`document.querySelector('#kitchenCookSelected').click(); document.querySelector('#kitchenCookSelected').click();`);
  await settle(`document.querySelector('#kitchenActionStatus').textContent.includes('3개를 만들었어')`);
  assert.deepEqual(await evaluate(`__farmRpcCalls.filter(call => call.name === 'cook_my_farm_recipe').map(call => ({ recipe: call.params.p_recipe_id, quantity: call.params.p_quantity }))`), [{ recipe: 'berryTart', quantity: 2 }]);
  assert.equal(await evaluate(`state.harvestInventory.strawberry`), 3);
  assert.equal(await evaluate(`state.foodInventory.berryTart`), 3, 'Server cooking bonuses reconcile into the shelf');
  assert.equal(await evaluate(`document.querySelector('#kitchenSellAllFood').disabled`), false);
  await evaluate(`document.querySelector('#kitchenSellAllFood').click();`);
  await settle(`state.foodInventory.berryTart === 0 && document.querySelector('#kitchenSellAllFood').disabled`);
  assert.equal(await evaluate(`state.farmMoney`), 838);
  assert.equal(await evaluate(`state.harvestInventory.carrot`), 4, 'Selling foods never sells raw crops');
  await evaluate(`
    window.__kitchenRetryRequests = [];
    window.__kitchenRecoveryReloads = 0;
    window.__kitchenRecoveryWalletReads = 0;
    const originalKitchenRpc = __farmRpcHandler;
    const originalKitchenReload = loadFarmDataFromDatabase;
    const originalKitchenWalletRead = loadFarmWallet;
    window.__restoreKitchenReload = () => { loadFarmDataFromDatabase = originalKitchenReload; loadFarmWallet = originalKitchenWalletRead; };
    loadFarmDataFromDatabase = async () => {
      __kitchenRecoveryReloads++;
      state.harvestInventory.carrot = 3; state.harvestInventory.potato = 2; state.foodInventory.countryStew = 1;
    };
    loadFarmWallet = async () => {
      __kitchenRecoveryWalletReads++;
      window.__kitchenMoneyBeforeWalletRead = state.farmMoney;
      state.farmMoney = 777;
    };
    window.__farmRpcHandler = async (name, params) => {
      if (name !== 'cook_my_farm_recipe' || params.p_recipe_id !== 'countryStew') return originalKitchenRpc(name, params);
      __kitchenRetryRequests.push(params.p_request_id);
      if (__kitchenRetryRequests.length === 1) return { data: null, error: { message: 'Failed to fetch' } };
      return { data: {
        inventory: [
          { category: 'harvest', itemId: 'carrot', quantity: 3 },
          { category: 'harvest', itemId: 'potato', quantity: 2 },
          { category: 'food', itemId: 'countryStew', quantity: 1 },
        ], wallet: { farmMoneyBalance: 12 }, event: { matched: true, recipeId: 'countryStew', quantity: 1, foodAmount: 1 },
      }, error: null };
    };
    document.querySelector('[data-kitchen-recipe="countryStew"]').click();
    document.querySelector('#kitchenCookSelected').click();
  `);
  await settle(`document.querySelector('#kitchenActionStatus').textContent.includes('저장 결과')`);
  assert.equal(await evaluate(`state.harvestInventory.carrot`), 4, 'An unknown response restores the local ingredient estimate');
  assert.equal(await evaluate(`document.querySelector('#kitchenCookSelected').textContent`), '이전 요리 결과 확인');
  assert.equal(await evaluate(`document.querySelector('#kitchenSellAllFood').disabled`), true, 'An unresolved cook prevents selling');
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('farmodoro-kitchen-intent:ui-kitchen-owner')).recipeId`), 'countryStew');
  await evaluate(`document.querySelector('#kitchenCookSelected').click();`);
  await settle(`document.querySelector('#kitchenActionStatus').textContent.includes('1개를 만들었어')`);
  assert.equal(await evaluate(`__kitchenRetryRequests.length === 2 && __kitchenRetryRequests[0] === __kitchenRetryRequests[1]`), true, 'Recovery reuses the same server request identity');
  assert.equal(await evaluate(`state.harvestInventory.carrot`), 3, 'Recovery consumes ingredients once');
  assert.equal(await evaluate(`__kitchenRecoveryReloads`), 1, 'Recovery refreshes current farm state after reconciling the cached action');
  assert.equal(await evaluate(`__kitchenRecoveryWalletReads`), 1, 'Recovery reads the wallet independently of crop and food data');
  assert.equal(await evaluate(`__kitchenMoneyBeforeWalletRead`), 838, 'A cached wallet snapshot never overwrites the current balance during recovery');
  assert.equal(await evaluate(`state.farmMoney`), 777, 'Recovery uses the current wallet balance');
  assert.equal(await evaluate(`localStorage.getItem('farmodoro-kitchen-intent:ui-kitchen-owner')`), null);
  await evaluate(`__restoreKitchenReload();`);
  await evaluate(`document.querySelector('#kitchenShowAllRecipes').click();`);
  assert.equal(await evaluate(`document.querySelectorAll('[data-kitchen-recipe]').length`), 43, 'Every existing recipe remains in the book');
  await evaluate(`document.querySelector('#kitchenRecipeSearch').value = '딸기'; document.querySelector('#kitchenRecipeSearch').dispatchEvent(new Event('input', { bubbles: true }));`);
  assert.equal(await evaluate(`document.querySelectorAll('[data-kitchen-recipe]').length`), 3, 'Recipe search uses actual names');
  await evaluate(`document.querySelector('#kitchenRecipeSearch').value = ''; document.querySelector('#kitchenRecipeSearch').dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('[data-kitchen-recipe="berryTart"]').click();`);
  assert.equal(await evaluate(`document.querySelector('#kitchenCookSelected').disabled`), true, 'Insufficient recipe ingredients disable cooking');
  await evaluate(`document.querySelector('#kitchenPantry').open = true;`);
  assert.equal(await evaluate(`document.querySelectorAll('#kitchenHarvestIngredients [data-sell-crop]').length`), 0);
  for (const width of [1440, 700, 390, 320]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width <= 700 });
    for (const theme of ['white', 'dark']) {
      await evaluate(`applyWorkspaceTheme('${theme}'); FarmKitchen.render();`);
      await pause(35);
      const geometry = await evaluate(`(() => { const panel = document.querySelector('.kitchen-v2-panel'); const area = panel.querySelector('.modal-scroll-area'); return { left: panel.getBoundingClientRect().left, right: panel.getBoundingClientRect().right, top: panel.getBoundingClientRect().top, bottom: panel.getBoundingClientRect().bottom, scrollOverflow: area.scrollWidth > area.clientWidth + 1 }; })()`);
      assert.ok(geometry.left >= 0 && geometry.right <= width + 1, width + 'px ' + theme + ': modal fits the viewport');
      assert.ok(geometry.top >= 0 && geometry.bottom <= 1001, width + 'px ' + theme + ': kitchen remains within the viewport height');
      assert.equal(geometry.scrollOverflow, false, width + 'px ' + theme + ': kitchen has no horizontal overflow');
    }
  }
  if (process.env.GARDEN_KITCHEN_CAPTURE === '1') {
    await evaluate(`
      applyWorkspaceTheme('white');
      state.harvestInventory = { ...defaultState.harvestInventory, carrot: 8, potato: 6, wheat: 5, strawberry: 9, tomato: 3, corn: 2, rice: 3, mushroom: 2, apple: 2, lemon: 1 };
      state.foodInventory = { ...defaultState.foodInventory, berryTart: 2, countryStew: 1 };
      state.farmMoney = 700;
      renderSummary(); renderFarm();
      document.querySelector('#kitchenShowAllRecipes').click();
      FarmKitchen.render(); document.querySelector('[data-kitchen-recipe="berryTart"]').click();
      clearTimeout(toastTimer); toast.classList.remove('show');
    `);
    fs.mkdirSync(path.join(root, 'output'), { recursive: true });
    for (const [name, width, height] of [['desktop', 1440, 1100], ['mobile', 390, 1000]]) {
      await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 700 });
      await evaluate(`document.querySelector('.kitchen-v2-panel .modal-scroll-area').scrollTop = 0;`);
      await pause(150);
      const screenshot = await call('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(root, 'output/garden-kitchen-' + name + '.png'), Buffer.from(screenshot.data, 'base64'));
    }
    console.log('Saved actual kitchen demo screenshots to output/garden-kitchen-*.png');
  }
  assert.deepEqual(exceptions, [], 'No browser runtime exceptions');
  console.log('PASS: batch cooking, server bonuses, food sale, durable uncertain-response recovery, full43recipe catalog, search, missing ingredients, pantry, responsive white/dark kitchen');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { ws?.close(); chrome?.kill(); server.close(); });
