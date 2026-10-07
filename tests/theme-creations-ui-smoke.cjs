// Real index/app/modules in Chrome. Only auth and server RPC replies are fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'farmodoro-scenery-ui-'));
const sql = ['086_theme_creations.sql', '088_theme_specific_creations.sql'].map(file => fs.readFileSync(path.join(root, 'supabase/migrations', file), 'utf8')).join('\n');
const catalog = [...new Map([...sql.matchAll(/\('([^']+)', '([^']+)', '([^']+)', (\d+), (\d+), (\d+), (\d+)\)/g)].map(([, id, name, family, variant, unlockPrice, growthCost, reward]) => [id, { id, name, family, variant: +variant, unlockPrice: +unlockPrice, growthCost: +growthCost, reward: +reward }])).values()];
assert.equal(catalog.length, 29, 'browser fixture follows the original and theme-specific server catalogs');
const stub = `<script>
  window.__sceneryRpcCalls = [];
  window.supabase = { createClient: () => ({
    auth: { getSession: () => new Promise(() => {}) },
    rpc: async (name, params) => {
      __sceneryRpcCalls.push({ name, params });
      return __sceneryRpcHandler ? __sceneryRpcHandler(name, params) : { data: null, error: null };
    }
  }) };
</script>`;
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  .replace(/<script\b[^>]*src="(?:https:[^"]*|\.\/pwa-register\.js[^"]*)"[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace('<script src="./supabase-config.js">', stub + '<script src="./supabase-config.js">');
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (pathname === '/') { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html); return; }
  const file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  try {
    response.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.png') ? 'image/png' : 'application/octet-stream');
    response.end(fs.readFileSync(file));
  } catch { response.writeHead(404).end(); }
});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let chrome;
let ws;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-sandbox', '--disable-crash-reporter',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'
  ], { windowsHide: true, stdio: 'ignore' });
  chrome.on('error', error => { throw error; });
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 200 && !fs.existsSync(portFile); i++) await pause(50);
  const port = fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0];
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  let sequence = 0;
  const pending = new Map();
  const exceptions = [];
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, 15000);
    pending.set(id, message => { clearTimeout(timeout); if (message.error) reject(new Error(JSON.stringify(message.error))); else resolve(message.result); });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    assert.equal(result.exceptionDetails, undefined, JSON.stringify({ evaluation: result.exceptionDetails, runtime: exceptions }));
    return result.result.value;
  };
  const settle = async predicate => {
    for (let i = 0; i < 160; i++) { if (await evaluate(predicate)) return; await pause(25); }
    assert.fail('UI did not settle: ' + predicate);
  };
  const click = async selector => {
    assert.equal(await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`), true, 'control exists: ' + selector);
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).click();`);
    await settle(`document.querySelector('#sceneryCreationRoot').getAttribute('aria-busy') === 'false'`);
  };
  const action = (kind, type) => `[data-scenery-action="${kind}"]${type ? `[data-scenery-type="${type}"]` : ''}`;
  await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
  await settle('document.readyState === "complete"');
  await evaluate(`
    document.documentElement.className = '';
    document.body.classList.remove('auth-gated');
    document.querySelector('#authGate').hidden = true;
    document.querySelector('.auth-boot')?.remove();
    activeAuthUser = { id: 'scenery-ui-owner' };
    farmDataHydrated = true; farmDataUserId = activeAuthUser.id;
    farmWalletHydrated = true; farmWalletUserId = activeAuthUser.id;
    taskDataHydrated = true; habitDataHydrated = true;
    state.tasks = []; state.habits = [];
    focusTimerDatabaseUnavailable = true;
    pageDataRefreshTimes.set(activeAuthUser.id + ':farm', Date.now() + 3600000);
    pageDataRefreshTimes.set(activeAuthUser.id + ':focus', Date.now() + 3600000);
    state.coins = 100; state.farmMoney = 350; state.equippedFarmTheme = 'ocean';
    state.ownedCosmetics = [{ type: 'farm_theme', id: 'ocean' }, { type: 'farm_theme', id: 'iceKingdom' }];
    state.legacySettlement = {version:1,coinRefund:10,farmMoneyRefund:3070,settledAt:'2026-10-07T00:00:00Z',items:[
      {category:'seed',itemId:'carrot',quantity:3,currency:'coin',amount:6},
      {category:'planted',itemId:'wheat',quantity:1,currency:'coin',amount:4},
      {category:'harvest',itemId:'carrot',quantity:4,currency:'farm_money',amount:10},
      {category:'food',itemId:'countryStew',quantity:2,currency:'farm_money',amount:40},
      {category:'supply',itemId:'growthTonic',quantity:1,currency:'farm_money',amount:20},
      {category:'plot_skin',itemId:'cherryPetalFall',quantity:1,currency:'farm_money',amount:3000}
    ]};
    window.__sceneryFixture = { activeCreation: null, unlockedTypes: ${JSON.stringify(catalog.filter(item => !item.unlockPrice).map(item => item.id))}, completedTypes: [], totalCompleted: 0, catalog: ${JSON.stringify(catalog)} };
    window.__serverCoins = 100; window.__serverMoney = 350; window.__serverWeekly = 0; window.__creationSequence = 0;
    window.__cachedEvents = new Map();
    window.__missingScenery = false; window.__loseGrowResponse = false;
    window.__sceneryResult = event => ({ scenery: structuredClone(__sceneryFixture), wallet: { coinBalance: __serverCoins, farmMoneyBalance: __serverMoney }, weeklyFarmMoneyEarned: __serverWeekly, event });
    window.__sceneryRpcHandler = async (name, params) => {
      if (name === 'get_my_scenery_state') return __missingScenery ? { error: { code: 'PGRST202', message: 'Function is missing from schema cache' } } : { data: structuredClone(__sceneryFixture) };
      if (name === 'get_my_farm_wallet') return { data: { coin_balance: __serverCoins, farm_money_balance: __serverMoney } };
      if (name === 'equip_farm_cosmetic') return { data: {} };
      if (!name.includes('_scenery_')) return { data: null, error: null };
      if (__cachedEvents.has(params.p_request_id)) return { data: __sceneryResult(__cachedEvents.get(params.p_request_id)) };
      let event = {};
      if (name === 'start_my_scenery_creation') {
        if (__sceneryFixture.activeCreation) return { error: { message: 'SCENERY_ALREADY_ACTIVE' } };
        const type = __sceneryFixture.catalog.find(item => item.id === params.p_type_id);
        __sceneryFixture.activeCreation = { id: 'scenery-ui-' + ++__creationSequence, typeId: type.id, themeId: params.p_theme_id, progress: 0, growthCost: type.growthCost, reward: type.reward };
        event = { typeId: type.id };
      } else if (name === 'grow_my_scenery_creation') {
        if (window.__growGate) await __growGate;
        const creation = __sceneryFixture.activeCreation;
        const amount = Math.min(params.p_amount, creation.growthCost - creation.progress);
        creation.progress += amount; __serverCoins -= amount;
        event = { spentCoin: amount, progress: creation.progress, completed: creation.progress === creation.growthCost };
      } else if (name === 'claim_my_scenery_creation') {
        const creation = __sceneryFixture.activeCreation;
        __serverMoney += creation.reward; __serverWeekly += creation.reward;
        let completed = __sceneryFixture.completedTypes.find(item => item.typeId === creation.typeId);
        if (!completed) { completed = { typeId: creation.typeId, count: 0 }; __sceneryFixture.completedTypes.push(completed); }
        completed.count++; __sceneryFixture.totalCompleted++; __sceneryFixture.activeCreation = null;
        event = { reward: creation.reward };
      } else if (name === 'unlock_my_scenery_type') {
        const type = __sceneryFixture.catalog.find(item => item.id === params.p_type_id);
        __serverMoney -= type.unlockPrice; __sceneryFixture.unlockedTypes.push(type.id);
        event = { unlockPrice: type.unlockPrice, alreadyUnlocked: false };
      }
      __cachedEvents.set(params.p_request_id, event);
      if (name === 'grow_my_scenery_creation' && __loseGrowResponse) { __loseGrowResponse = false; return { error: { message: 'Failed to fetch after commit' } }; }
      const response = __sceneryResult(event);
      if (window.__responseGate) await __responseGate;
      return { data: response };
    };
    applyWorkspaceTheme('white'); renderSummary(); renderFarm(); showPage('farm');
    SceneryCreations.load(activeAuthUser);
  `);
  await settle(`SceneryCreations.snapshot() !== null && document.querySelector('#sceneryCreationRoot').getAttribute('aria-busy') === 'false'`);
  await evaluate('document.fonts.ready');
  assert.equal(await evaluate(`Number(document.querySelector('#marketFarmMoneyBalance').textContent.replaceAll(',', ''))`), 350, 'navigation shows the authoritative Farm Money balance');
  assert.match(await evaluate(`document.querySelector('[data-scenery-settlement]').textContent`), /10 Coin/);
  assert.match(await evaluate(`document.querySelector('[data-scenery-settlement]').textContent`), /3,070 Farm Money/);
  assert.equal(await evaluate(`document.querySelectorAll('[data-scenery-settlement] tbody tr').length`), 6, 'all six retired asset groups appear in the settlement');
  const settlementWallet = await evaluate('({coins:state.coins,money:state.farmMoney,calls:__sceneryRpcCalls.length})');
  await evaluate(`document.querySelector('[data-scenery-settlement] summary').click();`);
  assert.equal(await evaluate(`document.querySelector('[data-scenery-settlement]').open`), true, 'settlement details can be reviewed');
  assert.deepEqual(await evaluate('({coins:state.coins,money:state.farmMoney,calls:__sceneryRpcCalls.length})'), settlementWallet, 'reviewing settled amounts sends no wallet or refund mutation');
  assert.equal(await evaluate(`document.querySelectorAll('#sceneryCreationScene .scenery-centerpiece').length`), 1, 'one focal creation slot');
  assert.equal(await evaluate(`['#farmGrid','#openFarmKitchen','#openFarmStorage','#openFarmShop','#openFarmMail','#farmMailModal','#farmKitchenModal','#seedStorageModal','#supplyStorageModal','#farmRewardBoxModal','#freePassTargetModal'].every(selector => document.querySelector(selector) === null)`), true, 'retired production and mailbox controls are removed from the DOM');
  assert.equal(await evaluate(`document.querySelectorAll('#sceneryCreationRoot [data-scenery-action="start"]:not(:disabled)').length`), 1, 'one free starter for ocean');
  assert.match(await evaluate(`document.querySelector('[data-scenery-action="unlock"][data-scenery-type="pinkCoral"]').textContent`), /300 Farm Money/);
  await evaluate(`state.farmMoney = 299; SceneryCreations.render();`);
  assert.equal(await evaluate(`document.querySelector('[data-scenery-action="unlock"][data-scenery-type="pinkCoral"]').disabled`), true, '299 Farm Money cannot unlock a 300 Farm Money type');
  await evaluate(`state.farmMoney = 300; SceneryCreations.render();`);
  assert.equal(await evaluate(`document.querySelector('[data-scenery-action="unlock"][data-scenery-type="pinkCoral"]').disabled`), false, '300 Farm Money enables the permanent unlock');
  await evaluate(`state.farmMoney = 350; SceneryCreations.render();`);
  await click(action('start', 'coral'));
  await evaluate(`document.querySelector('[data-scenery-focus="grow-1"]').focus();`);
  await click('[data-scenery-action="grow"][data-scenery-amount="1"]');
  assert.equal(await evaluate(`document.activeElement.dataset.sceneryFocus`), 'grow-1', 'keyboard focus stays on the growth control after a rerender');
  assert.equal(await evaluate('state.coins'), 99);
  assert.equal(await evaluate(`Number(document.querySelector('#marketFarmMoneyBalance').textContent.replaceAll(',', '')) === state.farmMoney`), true, 'wallet confirmation keeps the navigation Farm Money balance current');
  assert.equal(await evaluate('SceneryCreations.snapshot().activeCreation.progress'), 1);
  assert.equal(await evaluate(`document.querySelector('[data-scenery-settlement]').open`), true, 'a confirmed growth rerender preserves the open settlement details');
  // Cosmetic equip shares the same queue; active scenery remains pinned after it.
  await evaluate(`window.__growGate = new Promise(resolve => { window.__releaseGrow = resolve; }); document.querySelector('[data-scenery-action="grow"][data-scenery-amount="5"]').click(); document.querySelector('[data-scenery-action="grow"][data-scenery-amount="1"]').click(); document.querySelector('[data-equip-cosmetic="farm_theme:iceKingdom"]').click();`);
  await pause(60);
  assert.equal(await evaluate(`__sceneryRpcCalls.filter(call => call.name === 'equip_farm_cosmetic').length`), 0, 'equip waits for growth');
  assert.equal(await evaluate('state.coins'), 99, 'the busy action does not spend optimistically');
  await evaluate('__releaseGrow();');
  await settle(`state.equippedFarmTheme === 'iceKingdom' && SceneryCreations.snapshot().activeCreation.progress === 6`);
  await evaluate('window.__growGate = null;');
  assert.equal(await evaluate(`__sceneryRpcCalls.filter(call => call.name === 'grow_my_scenery_creation').length`), 2, 'double growth click is blocked');
  assert.equal(await evaluate(`SceneryCreations.snapshot().activeCreation.themeId`), 'ocean');
  assert.match(await evaluate(`document.querySelector('#sceneryCreationScene .garden-terrain').style.backgroundImage`), /ocean-scene-v1/);
  assert.match(await evaluate(`document.querySelector('.today-farm-landscape').style.backgroundImage`), /ocean-scene-v1/, 'today preview keeps the active ocean even after choosing ice for the next scenery');
  assert.equal(await evaluate(`document.querySelector('#todaySceneryProgress').getAttribute('aria-valuenow')`), '6');
  assert.match(await evaluate(`document.querySelector('#sceneryPickerTitle').textContent`), /얼음|눈/);
  assert.match(await evaluate(`document.querySelector('.scenery-theme-note').textContent`), /다음 풍경/);
  await evaluate(`openCosmeticPreview('farm_theme','ocean');`);
  assert.equal(await evaluate(`document.querySelector('.scenery-theme-preview').dataset.previewProgress`), '6');
  await click('[data-scenery-focus="grow-1"]');
  assert.equal(await evaluate(`document.querySelector('.scenery-theme-preview').dataset.previewProgress`), '7', 'an open current preview follows confirmed growth');
  assert.match(await evaluate(`document.querySelector('#cosmeticPreviewProgress').textContent`), /7 \/ 20 Coin · 35%/);
  await evaluate('closeCosmeticPreview();');
  for (let i = 0; i < 3; i++) await click('[data-scenery-action="grow"]');
  // Above uses the 1 Coin button; finish with the batch control until complete.
  while (await evaluate('SceneryCreations.snapshot().activeCreation.progress < 20')) await click('[data-scenery-focus="grow-5"]:not(:disabled), [data-scenery-focus="grow-1"]:not(:disabled)');
  assert.equal(await evaluate('state.coins'), 80);
  assert.match(await evaluate(`document.querySelector('[data-scenery-action="claim"]').textContent`), /50 Farm Money/);
  await evaluate(`document.querySelector('[data-scenery-action="claim"]').focus();`);
  await click(action('claim'));
  assert.equal(await evaluate(`document.activeElement.dataset.sceneryFocus`), 'picker-title', 'claiming moves keyboard focus to the next creation picker');
  assert.equal(await evaluate('state.farmMoney'), 400);
  assert.equal(await evaluate('SceneryCreations.snapshot().totalCompleted'), 1);
  await evaluate(`document.querySelector('[data-equip-cosmetic="farm_theme:ocean"]').click();`);
  await settle(`state.equippedFarmTheme === 'ocean'`);
  await click(action('unlock', 'pinkCoral'));
  assert.equal(await evaluate('state.farmMoney'), 100);
  await click(action('start', 'pinkCoral'));
  for (let i = 0; i < 4; i++) await click('[data-scenery-focus="grow-5"]');
  await click(action('claim'));
  await click(action('start', 'pinkCoral'));
  assert.equal(await evaluate('state.farmMoney'), 150, 'repeat starts are free after a permanent unlock');
  assert.equal(await evaluate(`__sceneryRpcCalls.filter(call => call.name === 'unlock_my_scenery_type' && call.params.p_type_id === 'pinkCoral').length`), 1);
  // Lost reply: the committed action is recovered with the same request identity.
  await evaluate(`window.__loseGrowResponse = true; document.querySelector('[data-scenery-focus="grow-1"]').click();`);
  await settle(`!!document.querySelector('[data-scenery-action="retry"]:not(:disabled)')`);
  assert.equal(await evaluate('state.coins'), 60);
  await click(action('retry'));
  assert.equal(await evaluate('state.coins'), 59);
  assert.equal(await evaluate(`(() => { const grow = __sceneryRpcCalls.filter(call => call.name === 'grow_my_scenery_creation'); return grow[grow.length - 1].params.p_request_id === grow[grow.length - 2].params.p_request_id; })()`), true);
  for (let i = 0; i < 2; i++) await click('[data-scenery-focus="grow-5"]');
  for (let i = 0; i < 3; i++) await click('[data-scenery-focus="grow-1"]');
  assert.equal(await evaluate('SceneryCreations.snapshot().activeCreation.progress'), 14);
  assert.match(await evaluate(`document.querySelector('.scenery-growth-copy strong').textContent`), /70% 성장/);
  assert.match(await evaluate(`document.querySelector('.scenery-growth-numbers').textContent`), /14 \/ 20 Coin 사용.*6 Coin/);
  assert.equal(await evaluate(`document.querySelector('.scenery-growth-timeline [aria-current="step"]').dataset.sceneryStage`), '2');
  assert.equal(await evaluate(`document.querySelector('.scenery-growth-timeline').querySelectorAll('[data-scenery-stage]').length`), 4);
  assert.equal(await evaluate(`document.querySelector('[data-scenery-card="pinkCoral"] .scenery-type-preview [data-creation-stage]').dataset.creationStage`), '2', 'the current kind card shows current growth');
  assert.match(await evaluate(`document.querySelector('[data-scenery-card="pinkCoral"] .scenery-type-preview-caption').textContent`), /현재 성장 · 70%/);
  assert.equal(await evaluate(`document.querySelector('[data-scenery-card="coral"] .scenery-type-preview [data-creation-stage]').dataset.creationStage`), '3', 'other kind cards explicitly show the completed example');
  assert.match(await evaluate(`document.querySelector('[data-scenery-card="coral"] .scenery-type-preview-caption').textContent`), /완성 예시/);
  assert.match(await evaluate(`document.querySelector('#todayFarmStatus').textContent`), /14 \/ 20 Coin.*70%/);
  assert.equal(await evaluate(`document.querySelector('#todaySceneryProgress').getAttribute('aria-valuenow')`), '14');
  assert.equal(await evaluate(`document.querySelector('#todayFarmPlots [data-creation-stage]').dataset.creationStage`), '2');
  // Opening the current theme shows the actual variant and current growth.
  // Stage examples keep those numbers visible and never mutate the wallet.
  await evaluate(`openCosmeticPreview('farm_theme','ocean');`);
  assert.equal(await evaluate(`document.querySelector('.scenery-theme-preview').dataset.previewType`), 'pinkCoral');
  assert.equal(await evaluate(`document.querySelector('.scenery-theme-preview').dataset.previewProgress`), '14');
  assert.equal(await evaluate(`document.querySelector('.scenery-theme-preview').dataset.previewMode`), 'current');
  assert.match(await evaluate(`document.querySelector('#cosmeticPreviewProgress').textContent`), /14 \/ 20 Coin · 70%.*6 Coin/);
  const previewWallet = await evaluate('({coins:state.coins,money:state.farmMoney,calls:__sceneryRpcCalls.length})');
  await evaluate(`document.querySelector('[data-scenery-preview-stage="3"]').focus(); document.querySelector('[data-scenery-preview-stage="3"]').click();`);
  assert.equal(await evaluate(`document.activeElement.dataset.sceneryPreviewStage`), '3', 'preview stage focus survives rerenders');
  assert.equal(await evaluate(`document.querySelector('.scenery-theme-preview').dataset.previewProgress`), '20');
  assert.equal(await evaluate(`document.querySelector('.scenery-theme-preview').dataset.previewMode`), 'sample');
  assert.match(await evaluate(`document.querySelector('#cosmeticPreviewProgress').textContent`), /14 \/ 20 Coin · 70%/);
  await evaluate(`document.querySelector('[data-scenery-preview-stage="current"]').click();`);
  assert.equal(await evaluate(`document.querySelector('.scenery-theme-preview').dataset.previewProgress`), '14');
  assert.deepEqual(await evaluate('({coins:state.coins,money:state.farmMoney,calls:__sceneryRpcCalls.length})'), previewWallet, 'previewing stages never sends a wallet mutation');
  await evaluate('closeCosmeticPreview();');

  const verifyGeometry = async (width, theme) => {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 1100, deviceScaleFactor: 1, mobile: false });
    await evaluate(`applyWorkspaceTheme('${theme}'); renderFarm(); scrollTo(0, 0);`);
    await pause(100);
    const geometry = await evaluate(`(() => { const scene = document.querySelector('#sceneryCreationScene'), card = document.querySelector('.scenery-main-card'), sprite = scene.querySelector('.scenery-centerpiece'), controls = [...document.querySelectorAll('#sceneryCreationRoot button:not(:disabled)')]; return { overflow: document.documentElement.scrollWidth > innerWidth + 1, sceneRatio: scene.clientWidth / scene.clientHeight, cardRight: card.getBoundingClientRect().right, sceneWidth: scene.clientWidth, spriteWidth: sprite.clientWidth, clippedControls: controls.filter(button => { const r = button.getBoundingClientRect(); return r.width <= 0 || r.left < -1 || r.right > innerWidth + 1; }).map(button => button.textContent) }; })()`);
    assert.equal(geometry.overflow, false, width + 'px ' + theme + ': no page overflow');
    assert.ok(Math.abs(geometry.sceneRatio - 1.5) < .015, 'atlas quadrants retain their ratio');
    assert.ok(geometry.spriteWidth > 100 && geometry.spriteWidth < geometry.sceneWidth, 'single object stays readable inside the scene');
    assert.deepEqual(geometry.clippedControls, [], width + 'px ' + theme + ': all controls fit');
    const sources = await evaluate(`(async () => { const sources = [...new Set([...document.querySelectorAll('#sceneryCreationRoot image')].map(image => image.getAttribute('href')).concat([...document.querySelectorAll('#sceneryCreationRoot .garden-terrain')].map(element => getComputedStyle(element).backgroundImage.match(/url\\(["']?(.*?)["']?\\)/)[1])))]; return Promise.all(sources.map(async source => { const image = new Image(); image.src = source; await image.decode(); return { source, width: image.naturalWidth, height: image.naturalHeight }; })); })()`);
    assert.ok(sources.length >= 2 && sources.every(source => source.width > 0 && source.height > 0), 'creation and terrain artwork loads');
  };
  fs.mkdirSync(path.join(root, 'output'), { recursive: true });
  const capture = async name => {
    await evaluate(`clearTimeout(toastTimer); toast.classList.remove('show'); scrollTo(0, 0);`);
    await pause(350);
    const screenshot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(root, 'output', 'scenery-creations-' + name + '.png'), Buffer.from(screenshot.data, 'base64'));
  };
  const verifyTreeBounds = async (selector = '#sceneryCreationScene') => {
    const geometry = await evaluate(`(() => { const scene = document.querySelector(${JSON.stringify(selector)}), art = scene.querySelector('.scenery-centerpiece > svg'), frame = art.querySelector('svg'), bounds = scene.getBoundingClientRect(), box = art.getBoundingClientRect(), clip = frame.viewBox.baseVal, matrix = frame.getScreenCTM(); const start = new DOMPoint(clip.x, clip.y).matrixTransform(matrix), end = new DOMPoint(clip.x + clip.width, clip.y + clip.height).matrixTransform(matrix); return { left: start.x - bounds.left, top: start.y - bounds.top, right: bounds.right - end.x, bottom: bounds.bottom - end.y, spriteWidth: box.width, paintedWidth: end.x - start.x, paintedHeight: end.y - start.y, rootClipped: start.x < box.left - 1 || start.y < box.top - 1 || end.x > box.right + 1 || end.y > box.bottom + 1 }; })()`);
    assert.ok(['left', 'top', 'right', 'bottom'].every(edge => geometry[edge] >= -1), 'tree crown and base fit within ' + selector + ': ' + JSON.stringify(geometry));
    assert.equal(geometry.rootClipped, false, 'the artwork fits its own SVG viewport');
    return geometry;
  };
  await verifyGeometry(1440, 'white'); await capture('desktop');
  await verifyGeometry(390, 'white'); await capture('mobile');
  await verifyGeometry(390, 'dark');
  await verifyGeometry(1440, 'dark'); await capture('dark');
  await verifyGeometry(320, 'white');
  // Focus clone is a passive backdrop with no duplicate IDs or controls.
  await evaluate(`document.querySelector('#toggleFocusFarmBackground').setAttribute('aria-pressed', 'true'); showPage('focus'); renderFocusFarmBackground();`);
  assert.equal(await evaluate(`(() => { const backdrop = document.querySelector('.focus-farm-background'); return backdrop.inert && backdrop.getAttribute('aria-hidden') === 'true' && !backdrop.querySelector('button,[id],[data-scenery-action]') && backdrop.querySelectorAll('.scenery-centerpiece').length === 1; })()`), true);
  await evaluate(`showPage('farm');`);
  while (await evaluate('SceneryCreations.snapshot().activeCreation.progress < 20')) await click('[data-scenery-focus="grow-5"]:not(:disabled), [data-scenery-focus="grow-1"]:not(:disabled)');
  await click(action('claim'));
  await evaluate(`document.querySelector('[data-equip-cosmetic="farm_theme:iceKingdom"]').click();`);
  await settle(`state.equippedFarmTheme === 'iceKingdom'`);
  await click(action('start', 'snowman'));
  for (let i = 0; i < 4; i++) await click('[data-scenery-focus="grow-5"]');
  await verifyGeometry(1440, 'white'); await capture('snow');
  assert.equal(await evaluate('SceneryCreations.snapshot().activeCreation.progress'), 20);
  assert.equal(await evaluate(`document.querySelectorAll('#sceneryCreationScene .scenery-centerpiece').length`), 1);
  // Missing migration: no local-only creation, clear status, disabled writes.
  await evaluate(`window.__missingScenery = true; SceneryCreations.reset(); SceneryCreations.load(activeAuthUser);`);
  await settle(`document.querySelector('#sceneryActionStatus').textContent.includes('서버 업데이트')`);
  assert.equal(await evaluate(`[...document.querySelectorAll('#sceneryCreationRoot [data-scenery-action]')].filter(button => ['start','grow','claim','unlock'].includes(button.dataset.sceneryAction)).every(button => button.disabled)`), true);
  // Restoring the state proves unavailable can recover without reloading the page.
  await evaluate(`window.__missingScenery = false; SceneryCreations.load(activeAuthUser);`);
  await settle(`!!document.querySelector('[data-scenery-action="claim"]:not(:disabled)')`);
  // A completed request from an old account leaves its recovery record and
  // cannot reconcile its wallet into the newly selected account.
  await evaluate(`openCosmeticPreview('farm_theme','iceKingdom'); window.__responseGate = new Promise(resolve => { window.__releaseResponse = resolve; }); document.querySelector('[data-scenery-action="claim"]').click();`);
  await settle(`__sceneryFixture.activeCreation === null`);
  await evaluate(`
    activeAuthUser = { id: 'scenery-ui-next-owner' }; farmSessionGeneration++;
    resetFarmDataDatabaseState(); farmDataHydrated = true;
    farmDataUserId = activeAuthUser.id; farmWalletUserId = activeAuthUser.id;
    farmActionChain = Promise.resolve(); farmWalletMutationChain = Promise.resolve();
    pageDataRefreshTimes.set(activeAuthUser.id + ':farm', Date.now() + 3600000);
    state.coins = 700; state.farmMoney = 800; __serverCoins = 700; __serverMoney = 800;
    __sceneryFixture.activeCreation = null; __sceneryFixture.completedTypes = []; __sceneryFixture.totalCompleted = 0;
    __sceneryFixture.unlockedTypes = __sceneryFixture.catalog.filter(item => item.unlockPrice === 0).map(item => item.id);
    SceneryCreations.reset(); SceneryCreations.load(activeAuthUser); renderFarm();
  `);
  await settle(`SceneryCreations.snapshot() !== null && document.querySelector('#sceneryCreationRoot').getAttribute('aria-busy') === 'false'`);
  await evaluate(`__releaseResponse(); window.__responseGate = null;`);
  await pause(60);
  assert.equal(await evaluate('state.coins'), 700);
  assert.equal(await evaluate('state.farmMoney'), 800);
  assert.equal(await evaluate(`Number(document.querySelector('#marketFarmMoneyBalance').textContent.replaceAll(',', ''))`), 800, 'account change updates the visible navigation wallet');
  assert.equal(await evaluate('SceneryCreations.snapshot().totalCompleted'), 0);
  assert.equal(await evaluate(`document.querySelector('[data-scenery-settlement]') === null`), true, 'account reset removes the previous owner settlement');
  assert.equal(await evaluate(`document.querySelector('#cosmeticPreviewModal').classList.contains('hidden')`), true, 'an old account preview closes when the owner changes');
  assert.equal(await evaluate(`!!localStorage.getItem('farmodoro-scenery-intent:scenery-ui-owner')`), true, 'old account recovery record is retained');
  // Every themed primary is a real startable server type, with all four stages
  // agreeing between the scene, current card and progress timeline.
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await evaluate(`state.ownedCosmetics = SceneryThemePresets.themes.filter(theme => theme.id).map(theme => ({type:'farm_theme',id:theme.id}));`);
  const themes = await evaluate('SceneryThemePresets.themes.map(theme => ({id:theme.id,typeId:theme.defaultType,name:theme.name}))');
  assert.equal(themes.length, 19);
  assert.equal(new Set(themes.map(theme => theme.typeId)).size, 19);
  for (const theme of themes) {
    await evaluate(`state.equippedFarmTheme = ${JSON.stringify(theme.id)}; renderFarm();`);
    const thumbSelector = theme.id ? `[data-equip-cosmetic="farm_theme:${theme.id}"] .garden-theme-thumb` : '[data-equip-cosmetic="farm_theme:"] .garden-theme-thumb';
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(thumbSelector)}).dataset.previewType`), theme.typeId, theme.name + ': sidebar thumbnail uses its own primary');
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(thumbSelector)} + ' [data-creation-stage]').dataset.creationStage`), '3');
    {
      await evaluate(`openCosmeticPreview('farm_theme',${JSON.stringify(theme.id)});`);
      assert.equal(await evaluate(`document.querySelector('.scenery-theme-preview').dataset.previewType`), theme.typeId, theme.name + ': modal previews the distinct primary');
      assert.equal(await evaluate(`document.querySelectorAll('[data-scenery-preview-stage]').length`), 4);
      if (theme.id === null) {
        assert.equal(await evaluate(`document.querySelector('#cosmeticPreviewModal [data-purchase-cosmetic="farm_theme:"]') === null`), true, 'the default garden is already owned');
        assert.equal(await evaluate(`document.querySelector('#cosmeticPreviewModal [data-equip-cosmetic="farm_theme:"]').disabled`), true, 'the equipped null default has a disabled correctly normalized equip control');
      }
      const balance = await evaluate('({coins:state.coins,money:state.farmMoney,calls:__sceneryRpcCalls.length})');
      for (const [stage, progress] of [[0, 0], [1, 5], [2, 12], [3, 20]]) {
        await evaluate(`document.querySelector('[data-scenery-preview-stage="${stage}"]').click();`);
        assert.equal(await evaluate(`document.querySelector('.scenery-theme-preview').dataset.previewProgress`), String(progress));
        assert.equal(await evaluate(`document.querySelector('.scenery-theme-preview [data-creation-stage]').dataset.creationStage`), String(stage));
      }
      assert.deepEqual(await evaluate('({coins:state.coins,money:state.farmMoney,calls:__sceneryRpcCalls.length})'), balance, theme.name + ': stage previews keep the wallet and server unchanged');
      if (theme.id === 'cherryBlossom') await capture('theme-preview');
      if (['tree', 'cherryTree', 'christmasTree'].includes(theme.typeId)) {
        await verifyTreeBounds('.scenery-theme-preview');
        await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 1100, deviceScaleFactor: 1, mobile: false });
        await verifyTreeBounds('.scenery-theme-preview');
        await call('Emulation.setDeviceMetricsOverride', { width: 320, height: 1100, deviceScaleFactor: 1, mobile: false });
        await verifyTreeBounds('.scenery-theme-preview');
        await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
      }
      await evaluate('closeCosmeticPreview();');
    }
    assert.equal(await evaluate(`document.querySelector('#sceneryCreationScene [data-creation-stage]').dataset.creationStage`), '3', theme.name + ': idle scene is a labelled completed preview');
    await click(action('start', theme.typeId));
    assert.equal(await evaluate('SceneryCreations.snapshot().activeCreation.typeId'), theme.typeId);
    for (const [target, expectedStage] of [[0, 0], [5, 1], [12, 2], [20, 3]]) {
      while (await evaluate('SceneryCreations.snapshot().activeCreation.progress') < target) {
        const progress = await evaluate('SceneryCreations.snapshot().activeCreation.progress');
        await click(target - progress >= 5 ? '[data-scenery-focus="grow-5"]' : '[data-scenery-focus="grow-1"]');
      }
      assert.equal(await evaluate(`document.querySelector('#sceneryCreationScene [data-creation-stage]').dataset.creationStage`), String(expectedStage), theme.name + ': scene stage ' + target);
      assert.equal(await evaluate(`document.querySelector('.scenery-growth-timeline [aria-current="step"]').dataset.sceneryStage`), String(expectedStage), theme.name + ': timeline stage ' + target);
      assert.equal(await evaluate(`document.querySelector('[data-scenery-card="${theme.typeId}"] [data-creation-stage]').dataset.creationStage`), String(expectedStage), theme.name + ': current card stage ' + target);
      assert.equal(await evaluate(`document.querySelector('.scenery-progress').getAttribute('aria-valuenow')`), String(target));
      if (['tree', 'cherryTree', 'christmasTree'].includes(theme.typeId)) {
        for (const width of [1440, 390, 320]) {
          await verifyGeometry(width, 'white');
          await verifyTreeBounds();
          if (target === 20 && width !== 320) {
            await capture(theme.typeId + '-large' + (width === 390 ? '-mobile' : ''));
          }
        }
        await verifyGeometry(1440, 'white');
        if (target === 20) {
          await evaluate(`document.querySelector('#toggleFocusFarmBackground').setAttribute('aria-pressed', 'true'); showPage('focus'); renderFocusFarmBackground();`);
          for (const [width, height] of [[1000, 350], [300, 800]]) {
            await evaluate(`(() => { const stage = document.querySelector('#focusPageStage'); for (const [property, value] of Object.entries({width:'${width}px',height:'${height}px',minHeight:'0',minWidth:'0',maxWidth:'none',maxHeight:'none'})) stage.style.setProperty(property.replace(/[A-Z]/g,letter => '-' + letter.toLowerCase()),value,'important'); })()`);
            await verifyTreeBounds('.focus-farm-background');
          }
          await evaluate(`document.querySelector('#focusPageStage').removeAttribute('style'); showPage('farm');`);
        }
      }
      if (theme.id === 'goldenHarvest' && target === 12) {
        await click('[data-scenery-focus="grow-1"]'); await click('[data-scenery-focus="grow-1"]');
        assert.equal(await evaluate('SceneryCreations.snapshot().activeCreation.progress'), 14);
        assert.match(await evaluate(`document.querySelector('.scenery-growth-numbers').textContent`), /14 \/ 20 Coin 사용.*6 Coin/);
        await verifyGeometry(1440, 'white'); await capture('golden-progress');
      }
      if (theme.id === 'cherryBlossom' && target === 5) { await verifyGeometry(390, 'white'); await capture('cherry-progress'); await verifyGeometry(1440, 'white'); }
    }
    await click(action('claim'));
  }
  assert.equal(await evaluate('SceneryCreations.snapshot().totalCompleted'), 19, 'all 19 distinct theme defaults complete and retain their records');
  // A paid, previously permitted alternative keeps its identity even when the
  // free default modal entry is addressed by either null or an empty string.
  await evaluate('state.equippedFarmTheme = null; renderFarm();');
  await click(action('unlock', 'blossomTree')); await click(action('start', 'blossomTree'));
  await click('[data-scenery-focus="grow-5"]');
  for (const defaultId of [null, '']) {
    await evaluate(`openCosmeticPreview('farm_theme',${JSON.stringify(defaultId)});`);
    assert.equal(await evaluate(`document.querySelector('.scenery-theme-preview').dataset.previewType`), 'blossomTree');
    assert.equal(await evaluate(`document.querySelector('.scenery-theme-preview').dataset.previewProgress`), '5');
    assert.equal(await evaluate(`document.querySelector('.scenery-theme-preview').dataset.previewMode`), 'current');
    assert.match(await evaluate(`document.querySelector('#cosmeticPreviewProgress').textContent`), /5 \/ 20 Coin · 25%/);
    assert.equal(await evaluate(`document.querySelector('#cosmeticPreviewModal [data-purchase-cosmetic="farm_theme:"]') === null`), true);
    await evaluate('closeCosmeticPreview();');
  }
  assert.deepEqual(exceptions, [], 'no browser runtime exceptions');
  console.log('PASS: all 19 themed primaries start/grow/claim and retain intrinsic identities; all 19 theme modal and sidebar previews, four consistent growth stages, honest Coin/percentage/remaining metrics, current versus completed card previews, retired farm controls, permanent unlock/repeat, durable recovery, account isolation, queued cosmetics/theme pinning, stable keyboard focus, loaded art, desktop/mobile/dark geometry, passive focus clone, missing-migration recovery. Enlarged tree/cherry/Christmas art stays within its SVG and scene at every stage on 1440/390/320px, in theme modals and wide/tall focus frames. Actual screenshots: output/scenery-creations-*.png');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { ws?.close(); chrome?.kill(); server.close(); });
