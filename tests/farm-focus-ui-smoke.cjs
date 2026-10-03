// Runs the real application in Chrome with local, observable farm RPC responses.
// Node 22+; CHROME_PATH may override the Windows Chrome installation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'farmodoro-focus-ui-'));
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
    activeAuthUser = { id: 'ui-farm-owner' };
    farmDataHydrated = true;
    farmDataUserId = activeAuthUser.id;
    pageDataRefreshTimes.set(activeAuthUser.id + ':farm', Date.now() + 60000);
    pageDataRefreshTimes.set(activeAuthUser.id + ':focus', Date.now() + 60000);
    focusTimerDatabaseUnavailable = true;
    state.coins = 12; state.farmMoney = 120;
    state.farmPlots = defaultState.farmPlots.map((plot, index) => ({ ...plot,
      crop: index < 2 ? ['carrot', 'strawberry'][index] : null, growth: index < 2 ? 1 : 0,
      focusGrowthSeconds: index === 0 ? 300 : 0, focusCropInstanceId: index < 2 ? 'crop-instance-' + plot.id : null,
      lastCaredAt: Date.now(), lastFreeWaterAt: Date.now(), wilted: false,
    }));
    // Old saved state and outstanding events must never reactivate crop growth.
    state.focusFarmPlotId = 0;
    focusProgressEventQueue.push({ id: 'legacy-focus-event', mode: 'quick', seconds: 600,
      plotId: 0, cropInstanceId: 'crop-instance-0' });
    state.tasks = [{ id: 'done-today', title: '자료 정리', status: 'done', completedDate: getFarmDashboardDate(), groupId: 'work', focusSeconds: 0 }];
    state.habits = [mapDatabaseHabit({ id: 'habit-today', title: '독서', measure_type: 'check', target_value: 1, weekdays: [1, 2, 3, 4, 5, 6, 7], unit: '회' }, [{ record_date: getFarmDashboardDate(), completed_at: new Date().toISOString(), progress_value: 1, focus_seconds: 0 }])];
    state.ownedCosmetics = [{ type: 'farm_theme', id: 'springMeadow' }];
    state.equippedFarmTheme = null;
    state.dailyCosmeticOffers = [{ type: 'farm_theme', id: 'cherryBlossom' }, { type: 'plot_skin', id: 'cherryPetalFall' }];
    window.__farmServer = { plots: structuredClone(state.farmPlots), selected: 0, dailySeconds: 0,
      coins: 12, harvests: state.harvestInventory.carrot ?? 0 };
    window.__farmRpcHandler = async (name, params) => {
      const model = window.__farmServer;
      const plot = model.plots.find(entry => entry.id === params?.p_plot_index);
      const resultPlot = entry => ({ ...entry, lastCaredAt: new Date(entry.lastCaredAt).toISOString(), lastFreeWaterAt: new Date(entry.lastFreeWaterAt).toISOString() });
      const focusFarm = () => ({ plotId: model.selected, dailyFocusDate: getFarmDashboardDate(), dailyFocusSeconds: model.dailySeconds });
      if (name === 'record_my_focus_time_v2') {
        const seconds = params.p_elapsed_seconds;
        const awardedCoins = Math.floor((model.dailySeconds + seconds) / 3600) - Math.floor(model.dailySeconds / 3600);
        model.dailySeconds += seconds;
        model.coins += awardedCoins;
        // Model a server still running 075: an explicit crop target would grow it.
        if (plot && params.p_crop_instance_id === plot.focusCropInstanceId) {
          const total = plot.focusGrowthSeconds + seconds;
          plot.growth = Math.min(getCropGrowthCost(plot.crop), plot.growth + Math.floor(total / 1500));
          plot.focusGrowthSeconds = plot.growth >= getCropGrowthCost(plot.crop) ? 0 : total % 1500;
        }
        return { data: { focusFarm: focusFarm(), plots: plot ? [resultPlot(plot)] : [], progressSeconds: model.dailySeconds % 3600, coinBalance: model.coins, awardedCoins }, error: null };
      }
      if (name === 'grow_farm_plot_with_coin') {
        model.coins -= 1; plot.growth += 1;
        if (plot.growth >= getCropGrowthCost(plot.crop)) plot.focusGrowthSeconds = 0;
        return { data: { plots: [resultPlot(plot)], wallet: { coinBalance: model.coins } }, error: null };
      }
      if (name === 'water_farm_plot') {
        plot.growth += 1; plot.lastFreeWaterAt = Date.now(); plot.lastCaredAt = Date.now();
        return { data: { plots: [resultPlot(plot)] }, error: null };
      }
      if (name === 'harvest_farm_plot') {
        plot.crop = null; plot.growth = 0; model.harvests += 1;
        return { data: { plots: [resultPlot(plot)], inventory: [
          { category: 'harvest', itemId: 'carrot', quantity: model.harvests },
        ], event: { harvestAmount: 1 } }, error: null };
      }
      return { data: {}, error: null };
    };
    renderFarm(); showPage('farm');
  `);
  assert.equal(await evaluate(`getFarmDashboardDate(new Date('2026-10-01T15:30:00Z'))`), '2026-10-02', 'The dashboard uses the Korean day');
  assert.equal(await evaluate(`document.querySelector('.farm-growth-sidebar,#farmDailyGrowthSummary') === null`), true, 'The daily focus sidebar is removed');
  await evaluate(`document.querySelector('[data-select-plot="0"]').click();`);
  assert.equal(await evaluate(`openFarmPlotId === 0 && document.querySelector('[data-focus-farm-plot],.is-focus-target,.farm-focus-growth-summary,.farm-focus-target-marker') === null`), true, 'Opening a crop has no focus action, target marker, or focus growth summary');
  assert.equal(await evaluate(`document.querySelector('#farmGrid').textContent.includes('집중으로 키우기')`), false, 'The retired action is not shown even with a saved target');
  await evaluate(`addFocusSecond(90, 'quick');`);
  assert.equal(await evaluate(`state.farmPlots[0].growth === 1 && pendingFarmFocusBatches.length + focusProgressEventQueue.length > 0`), true, 'Pending seconds are queued before the save');
  await evaluate(`flushFocusTime()`);
  assert.equal(await evaluate(`state.farmPlots[0].growth === 1 && window.__farmServer.plots[0].growth === 1 && window.__farmServer.plots[0].focusGrowthSeconds === 300 && window.__farmServer.dailySeconds === 690`), true, 'Old queued time and new focus time are recorded without growing the saved target');
  await evaluate(`document.querySelector('[data-grow-plot="0"]').click();`);
  await settle('state.coins === 11 && state.farmPlots[0].growth === 2');
  await evaluate(`(async () => { addFocusSecond(810, 'quick'); await flushFocusTime(); })()`);
  assert.equal(await evaluate(`state.farmPlots[0].growth === 2 && window.__farmServer.plots[0].growth === 2 && state.coins === 11`), true, 'A complete 25-minute focus unit does not grow a crop');
  await evaluate(`(async () => { addFocusSecond(2100, 'quick'); await flushFocusTime(); })()`);
  assert.equal(await evaluate(`state.coins === 12 && window.__farmServer.dailySeconds === 3600 && state.farmPlots[0].growth === 2 && window.__farmServer.plots[0].growth === 2`), true, 'A full hour still awards Coin without crop growth');
  assert.equal(await evaluate(`window.__farmRpcCalls.filter(call => call.name === 'record_my_focus_time_v2').every(call => call.params.p_plot_index === null && call.params.p_crop_instance_id === null)`), true, 'All focus requests explicitly disable crop attribution, including the legacy event');
  assert.equal(await evaluate(`window.__farmRpcCalls.some(call => call.name === 'select_my_focus_farm_plot')`), false, 'Farm interaction never selects a focus target');
  await evaluate(`state.farmPlots[0].lastFreeWaterAt = 0; window.__farmServer.plots[0].lastFreeWaterAt = 0; renderFarm(); document.querySelector('[data-water-plot="0"]').click();`);
  await settle('state.farmPlots[0].growth === 3 && window.__farmServer.plots[0].growth === 3');
  assert.equal(await evaluate(`state.coins === 12 && getPlotWaterRemaining(state.farmPlots[0]) > 0`), true, 'Free water grows one stage without Coin and records its cooldown');
  assert.equal(await evaluate(`!!document.querySelector('[data-harvest-plot="0"]')`), true, 'A crop grown with care can be harvested');
  await evaluate(`document.querySelector('[data-harvest-plot="0"]').click();`);
  await settle('state.farmPlots[0].crop === null && state.harvestInventory.carrot === window.__farmServer.harvests');
  assert.equal(await evaluate(`state.harvestInventory.carrot > 0 && window.__farmRpcCalls.some(call => call.name === 'harvest_farm_plot')`), true, 'Harvest puts the crop in inventory through the existing RPC');
  await evaluate(`document.querySelector('[data-plant-plot="0"]').click();`);
  assert.equal(await evaluate(`document.querySelector('#gardenSeedModal').textContent.includes('수확까지 돌보기') && !/집중\\s*\\d+분/.test(document.querySelector('#gardenSeedModal').textContent)`), true, 'Seed choices explain care stages without a focus duration');
  await evaluate(`FarmSeeds.close();`);
  assert.equal(await evaluate(`document.querySelector('#farmCustomizationGoal,.farm-goal-card') === null`), true, 'The field purchase goal card is removed');
  const goalField = await evaluate(`document.querySelector('#farmPlotSkinChoices [data-preview-farm-plot]').dataset.previewFarmPlot`);
  await evaluate(`document.querySelector('#farmPlotSkinChoices [data-preview-farm-plot]').click();`);
  assert.equal(await evaluate(`!document.querySelector('#cosmeticPreviewModal').classList.contains('hidden') && !!document.querySelector('.farm-theme-preview-actions [data-purchase-cosmetic="plot_skin:${goalField}"]')`), true, 'An unowned field opens its actual purchase preview');
  await evaluate(`closeCosmeticPreview(); document.querySelector('#farmThemeChoices [data-equip-cosmetic="farm_theme:springMeadow"]').click();`);
  await settle(`state.equippedFarmTheme === 'springMeadow'`);
  assert.equal(await evaluate(`window.__farmRpcCalls.some(call => call.name === 'equip_farm_cosmetic' && call.params.p_cosmetic_id === 'springMeadow') && document.querySelector('#farmActiveThemeLabel').textContent === '봄날 들판'`), true, 'Owned theme uses the existing equip RPC');
  await evaluate(`document.querySelector('#farmThemeChoices [data-preview-farm-theme="galaxyNight"]').click();`);
  assert.equal(await evaluate(`!document.querySelector('#cosmeticPreviewModal').classList.contains('hidden') && document.querySelector('#cosmeticPreviewTitle').textContent === '은하수 밤' && state.equippedFarmTheme === 'springMeadow'`), true, 'Unowned theme previews without equipping it');
  await evaluate(`closeCosmeticPreview(); state.equippedFarmTheme = 'cherryBlossom'; state.equippedPlotSkin = 'lavenderField'; renderFarm();`);
  assert.equal(await evaluate(`document.querySelector('#farmPage .farm-scene').dataset.terrain === 'cherryBlossom' && document.querySelector('#farmGrid [data-plot-id="0"]').dataset.plotSkin === 'lavenderField' && document.querySelector('#farmGrid [data-plot-id="0"] .garden-soil-art image')?.getAttribute('href').includes('themed-plots-atlas.png')`), true, 'The equipped theme chooses the landscape while the plot keeps its own themed bed');
  await evaluate(`state.equippedFarmTheme = 'springMeadow'; state.equippedPlotSkin = null; renderFarm();`);
  await evaluate(`closeCosmeticPreview(); document.querySelector('#openFarmShop').click();`);
  assert.equal(await evaluate(`!document.querySelector('#farmKitchenModal').classList.contains('hidden') && !!document.querySelector('#kitchenHarvestIngredients')`), true, 'The kitchen toolbar opens cooking and harvest ingredients');
  await evaluate(`FarmKitchen.close(); document.querySelector('#openFarmStorage').click();`);
  assert.equal(await evaluate(`!document.querySelector('#supplyStorageModal').classList.contains('hidden')`), true, 'The supply toolbar opens farm supplies');
  await evaluate(`document.querySelector('#supplyStorageModal').classList.add('hidden'); renderFarm();`);
  for (const width of [1440, 1100, 960, 390, 320]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width <= 700 });
    for (const theme of ['white', 'dark']) {
      await evaluate(`applyWorkspaceTheme('${theme}'); showPage('farm');`);
      await pause(50);
      assert.equal(await evaluate(`document.documentElement.scrollWidth > innerWidth`), false, `${width}px ${theme}: no page overflow`);
      const geometry = await evaluate(`(() => { const scene = document.querySelector('.farm-scene').getBoundingClientRect(), map = document.querySelector('.farm-scene-grid').getBoundingClientRect(); return { ratio: map.width / map.height, fills: Math.abs(map.width - scene.width) < 1 }; })()`);
      assert.ok(Math.abs(geometry.ratio - 1.5) < .01, `${width}px artwork proportions`);
      if (width > 700) assert.equal(geometry.fills, true, `${width}px: farm fills the map panel`);
      if (width <= 700) {
        await evaluate(`document.querySelector('#toggleFarmOverview').click();`);
        assert.equal(await evaluate(`document.querySelector('.farm-scene-grid').getBoundingClientRect().width <= document.querySelector('.farm-scene').clientWidth + 1`), true, 'Mobile overview fits');
        await evaluate(`document.querySelector('#toggleFarmOverview').click();`);
      }
    }
  }
  if (process.env.FARM_FOCUS_CAPTURE === '1') {
    await evaluate(`
      applyWorkspaceTheme('white'); state.farmName = '벚꽃 아래 작은 농장';
      clearTimeout(toastTimer); toast.classList.remove('show');
      state.coins = 148; state.farmMoney = 620;
      state.farmPlots = defaultState.farmPlots.map((plot, index) => ({ ...plot,
        crop: index < 4 ? ['carrot', 'strawberry', 'tomato', 'corn'][index] : null,
        growth: index === 0 ? 0 : index === 1 ? 2 : index === 2 ? getCropGrowthCost('tomato') - 1 : index === 3 ? getCropGrowthCost('corn') : 0,
        lastCaredAt: Date.now(), lastFreeWaterAt: Date.now(), wilted: false,
      }));
      openFarmPlotId = null;
      state.equippedFarmTheme = 'cherryBlossom'; state.equippedPlotSkin = null;
      state.ownedCosmetics = [{ type: 'farm_theme', id: 'springMeadow' }, { type: 'farm_theme', id: 'cherryBlossom' }];
      state.dailyCosmeticOffers = [{ type: 'plot_skin', id: 'cherryPetalFall' }, { type: 'farm_theme', id: 'galaxyNight' }];
      renderFarm(); showPage('farm');
    `);
    fs.mkdirSync(path.join(root, 'output'), { recursive: true });
    await call('Emulation.setDeviceMetricsOverride', { width: 1660, height: 1000, deviceScaleFactor: 1, mobile: false });
    await evaluate('document.fonts.ready');
    await pause(150);
    const desktop = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    fs.writeFileSync(path.join(root, 'output/farm-focus-growth-desktop.png'), Buffer.from(desktop.data, 'base64'));
    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await evaluate(`document.querySelector('#toggleFarmOverview').click();`);
    await pause(150);
    const fullHeight = await evaluate('document.documentElement.scrollHeight');
    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: fullHeight, deviceScaleFactor: 1, mobile: true });
    await pause(100);
    const mobile = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    fs.writeFileSync(path.join(root, 'output/farm-focus-growth-mobile.png'), Buffer.from(mobile.data, 'base64'));
    fs.writeFileSync(path.join(root, 'output/farm-focus-growth-preview.md'),
      '실제 앱을 로컬 Chrome에서 실행한 화면입니다. 화면 확인을 위한 시연 데이터를 사용했고, 계정이나 실제 서버에 데이터를 쓰지 않았습니다.\n\n' +
      '시연 값: Coin 148, Farm Money 620, 벚꽃 테마, 돌보기 성장 단계가 서로 다른 작물 4개. 집중 작물 성장과 대상 선택은 제공하지 않습니다.\n\n' +
      '다시 만들기: FARM_FOCUS_CAPTURE=1 환경 변수와 함께 tests/farm-focus-ui-smoke.cjs를 실행합니다.\n');
    console.log('Saved desktop and full-page mobile demo screenshots to output/farm-focus-growth-*.png');
  }
  await evaluate(`showPage('focus');`);
  assert.equal(await evaluate(`currentPage`), 'focus', 'The focus page opens');
  for (const [width, height] of [[1440, 1000], [390, 844]]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 700 });
    for (const theme of ['white', 'dark']) {
      await evaluate(`applyWorkspaceTheme('${theme}'); showPage('focus');`);
      const focus = await evaluate(`(() => {
        const rect = selector => document.querySelector(selector).getBoundingClientRect();
        const card = rect('#focusPage .focus-card.standalone');
        const visual = rect('#focusPage .focus-visual'), copy = rect('#focusPage .focus-copy');
        const picker = document.querySelector('#focusPage .focus-item-picker');
        const foreground = getComputedStyle(picker.querySelector(':scope > span')).color.match(/[0-9.]+/g).map(Number);
        const background = getComputedStyle(picker).backgroundColor.match(/[0-9.]+/g).map(Number);
        const luminance = channels => channels.slice(0, 3).map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
        const lighter = Math.max(luminance(foreground), luminance(background)), darker = Math.min(luminance(foreground), luminance(background));
        return { groupCenterOffset: Math.abs((visual.top + copy.bottom) / 2 - (card.top + card.bottom) / 2), contrast: (lighter + .05) / (darker + .05), opaque: background.length < 4 || background[3] === 1, overlap: visual.bottom > copy.top + 1 };
      })()`);
      assert.equal(focus.opaque, true, `${width}px ${theme}: focus item uses an opaque readable surface`);
      assert.ok(focus.contrast >= 4.5, `${width}px ${theme}: focus item label contrast ${focus.contrast}`);
      assert.equal(focus.overlap, false, `${width}px ${theme}: timer and controls do not overlap`);
      assert.ok(focus.groupCenterOffset <= 6, `${width}px ${theme}: timer and controls stay centered ${focus.groupCenterOffset}px`);
    }
  }
  assert.deepEqual(exceptions, [], 'No browser runtime exceptions');
  console.log('PASS: focus Coin rewards without crop growth, legacy saved targets, care/water/harvest, seed stage guidance, theme equip/preview, toolbars, desktop/mobile white/dark');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { ws?.close(); chrome?.kill(); server.close(); });
