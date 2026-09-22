// Run manually with Node 22+ and CHROME_PATH (optional on Windows).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { spawn } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "farmodoro-ui-"));
const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
// Run the actual application; omit only external authentication and service worker
// scripts so this test doesn't contact accounts or depend on the network.
const html = fs.readFileSync(path.join(root, "index.html"), "utf8")
  .replace(/<script\b[^>]*src="(?:https:[^"]*|\.\/pwa-register\.js[^"]*)"[^>]*>[\s\S]*?<\/script>/gi, "");
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const file = path.resolve(root, "." + pathname);
  if (pathname === "/") { response.setHeader("Content-Type", "text/html; charset=utf-8"); response.end(html); return; }
  if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  try {
    response.setHeader("Content-Type", file.endsWith(".css") ? "text/css" : file.endsWith(".js") ? "text/javascript" : file.endsWith(".svg") ? "image/svg+xml" : "application/octet-stream");
    response.end(fs.readFileSync(file));
  } catch { response.writeHead(404).end(); }
});
let chrome;
let ws;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  chrome = spawn(chromePath, ["--headless=new", "--disable-gpu", "--no-first-run", "--remote-debugging-port=0",
    `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
  chrome.on("error", (error) => { throw error; });
  const portFile = path.join(profile, "DevToolsActivePort");
  for (let i = 0; i < 200 && !fs.existsSync(portFile); i++) await pause(50);
  const port = fs.readFileSync(portFile, "utf8").split(/\r?\n/)[0];
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(tabs.find((tab) => tab.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  const exceptions = [];
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const next = ++id;
    const timeout = setTimeout(() => reject(new Error(`Timeout: ${method}`)), 10000);
    pending.set(next, (message) => {
      clearTimeout(timeout);
      if (message.error) reject(new Error(JSON.stringify(message.error))); else resolve(message.result);
    });
    ws.send(JSON.stringify({ id: next, method, params }));
  });
  await call("Runtime.enable");
  await call("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/` });
  for (let i = 0; i < 100; i++) {
    const result = await call("Runtime.evaluate", { expression: 'document.readyState === "complete"' });
    if (result.result.value) break;
    await pause(50);
  }
  await call("Runtime.evaluate", { expression: `
    document.documentElement.className = "";
    document.body.classList.remove("auth-gated");
    document.querySelector("#authGate").hidden = true;
    document.querySelector(".auth-boot").remove();
  ` });

  const evaluate = async expression => {
    const r = await call('Runtime.evaluate', {expression, returnByValue:true, awaitPromise:true});
    assert.equal(r.exceptionDetails, undefined, JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  for (const [width, touch] of [[1440,false], [1101,false], [960,false], [640,false], [390,false], [320,false], [390,true], [320,true]]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:width===640?300:900,deviceScaleFactor:1,mobile:touch});
    await call('Emulation.setTouchEmulationEnabled',{enabled:touch});
    await evaluate(`showPage('farm'); state.farmPlots=[]; renderFarm();`);
    await pause(100);
    const result = await evaluate(`(() => {
      openCosmeticPreview('plot_skin','lavenderField');
      const plots=[...document.querySelectorAll('.cosmetic-preview-farm-scene .farm-plot')];
      const sample=plots.length===9 && plots.every(p=>p.querySelector('.crop-pixel') && p.dataset.previewPlot==='lavenderField');
      closeCosmeticPreview(); openCosmeticPreview('farm_theme','galaxyNight');
      const preview=document.querySelector('.cosmetic-farm-preview');
      const theme=!!preview.querySelector('.npc-market') && getComputedStyle(preview).getPropertyValue('--farm-bg').trim()==='#171c39';
      closeCosmeticPreview();
      state.equippedLabelEffect='goldenSparkle';
      farmLeaderboard=[{farmName:'old',displayName:'농부',score:12,isMe:true,labelEffect:null}]; renderFarmRanking();
      const label=document.querySelector('#farmRankingMyNameplate').dataset.labelEffect==='goldenSparkle' && document.querySelector('.farm-podium-farmer .farm-ranking-farm-name').dataset.labelEffect==='goldenSparkle';
      focusRuntimeByMode.quick={seconds:90,phase:'focus',started:true}; runningFocusMode='quick'; showPage('today'); updateMiniFocusTimer();
      const timer=!miniFocusTimer.hidden;
      showPage('focus');
      const hidden=miniFocusTimer.hidden;
      const card=document.querySelector('#focusCard'),copy=card.querySelector('.focus-copy');
      const focusFits=copy.getBoundingClientRect().bottom <= card.getBoundingClientRect().bottom+1;
      showPage('farm');
      const field=document.querySelector('#farmPage .farm-scene').getBoundingClientRect();
      const market=document.querySelector('#npcMarket').getBoundingClientRect();
      const marketMatches=getComputedStyle(document.querySelector('#npcMarket')).display==='none' && field.width>0;
      return {sample,theme,label,timer,hidden,focusFits,marketMatches,overflow:document.documentElement.scrollWidth>innerWidth};
    })()`);
    console.log(width, result);
    for (const key of ['sample','theme','label','timer','hidden','marketMatches']) assert.equal(result[key],true,key+' '+width);
    if(width<=700) assert.equal(result.focusFits,true,'focusFits '+width);
    assert.equal(result.overflow,false,'overflow '+width);
    await evaluate(`state.farmPlots=Array.from({length:9},(_,id)=>({id,crop:['carrot','strawberry','corn','eggplant','tomato','lavender','watermelon','sunflower','lemon'][id],growth:100,lastCaredAt:Date.now(),lastWateredAt:Date.now()})); state.dailySeedOffers=Object.keys(CROPS).slice(0,6); renderFarm(); focusRuntimeByMode.quick.started=false; runningFocusMode=null; updateMiniFocusTimer();`);
    await pause(100);
    const geometry = await evaluate(`(() => {
      const plot=document.querySelector('#farmGrid .crop-plot'), sprite=plot.querySelector('.crop-pixel');
      const p=plot.getBoundingClientRect(), s=sprite.getBoundingClientRect();
      return {soilBed:p.width>p.height*1.5, sprite:s.width, tile:p.width, overflow:document.documentElement.scrollWidth>innerWidth};
    })()`);
    console.log('crop geometry', width, geometry);
    assert.equal(geometry.soilBed,true,'foreshortened soil bed '+width);
    assert.equal(geometry.overflow,false,'populated overflow '+width);
    if(width<=700) assert.ok(geometry.sprite>=geometry.tile*0.2,'visible crop cluster '+width);
    if(process.env.FARM_SCREENSHOTS && [640,390,320].includes(width)) {
      fs.mkdirSync(process.env.FARM_SCREENSHOTS,{recursive:true});
      for(const view of ['farm','focus','preview','ranking']) {
        await evaluate(view==='preview' ? `showPage('farm'); openCosmeticPreview('farm_theme','cherryBlossom');` : view==='ranking' ? `closeCosmeticPreview(); renderFarmRanking(); farmRankingModal.classList.remove('hidden');` : `showPage('${view}');`);
        await pause(100);
        const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
        fs.writeFileSync(path.join(process.env.FARM_SCREENSHOTS,`${view}-${width}.png`),Buffer.from(shot.data,'base64'));
      }
      await evaluate(`farmRankingModal.classList.add('hidden');`);
    }
  }
  for (const width of [1440, 390, 320]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:1300,deviceScaleFactor:1,mobile:false});
    await call('Emulation.setTouchEmulationEnabled',{enabled:false});
    const themes = await evaluate('FARM_THEMES.map(theme => theme.id)');
    for (const theme of themes) {
      const decoration = await evaluate(`(() => {
        showPage('farm'); state.equippedFarmTheme=${JSON.stringify(theme)}; renderFarm();
        const farm=document.querySelector('#farmPage');
        const ornament=getComputedStyle(farm.querySelector('.farm-theme-banner > i')).backgroundImage;
        const paper=getComputedStyle(farm.querySelector('.farm-layout')).backgroundImage;
        const trim=getComputedStyle(farm.querySelector('.npc-market'),'::before').backgroundImage;
        const money=state.farmMoney, coins=state.coins;
        openCosmeticPreview('farm_theme',${JSON.stringify(theme)});
        const preview=document.querySelector('.cosmetic-farm-preview');
        return {
          matching:ornament===getComputedStyle(preview.querySelector('.farm-theme-banner > i')).backgroundImage && paper===getComputedStyle(preview.querySelector('.farm-layout')).backgroundImage && getComputedStyle(farm.querySelector('.farm-layout')).backgroundPosition===getComputedStyle(preview.querySelector('.farm-layout')).backgroundPosition && trim===getComputedStyle(preview.querySelector('.npc-market'),'::before').backgroundImage,
          decorated:ornament.includes('/farm-themes/'+${JSON.stringify(theme)}+'.svg') && trim===ornament,
          fullScenery:paper==='none' && getComputedStyle(farm.querySelector('.farm-scene-grid'),'::before').backgroundImage.includes('farm-world-atlas.png') && getComputedStyle(farm.querySelector('.farm-scene-grid'),'::before').backgroundImage===getComputedStyle(preview.querySelector('.farm-scene-grid'),'::before').backgroundImage && farm.querySelector('.farm-scene').dataset.scenery===preview.querySelector('.farm-scene').dataset.scenery,
          fits:farm.scrollWidth<=farm.clientWidth && preview.scrollWidth<=preview.clientWidth,
          noPurchase:money===state.farmMoney && coins===state.coins,
          unique:farm.querySelectorAll('.farm-theme-banner').length===1
        };
      })()`);
      assert.deepEqual(decoration,{matching:true,decorated:true,fullScenery:true,fits:true,noPurchase:true,unique:true},theme+' '+width);
      assert.equal(await evaluate(`(async () => { const art=new Image(); art.src='./assets/farm-themes/'+${JSON.stringify(theme)}+'.svg'; await art.decode(); return art.naturalWidth>0; })()`),true,'theme ornament loads');
      if (process.env.FARM_THEME_SCREENSHOTS && ['whiteDay','bubbleField'].includes(theme) && width!==320) {
        fs.mkdirSync(process.env.FARM_THEME_SCREENSHOTS,{recursive:true});
        await evaluate(`cosmeticPreviewModal.querySelector('.modal-scroll-area').style.maxHeight='none'; cosmeticPreviewModal.querySelector('.cosmetic-preview-modal-panel').style.maxHeight='none';`);
        await pause(120);
        const bounds=await evaluate(`(() => {const r=cosmeticTryonStage.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1};})()`);
        const shot=await call('Page.captureScreenshot',{format:'png',clip:bounds,captureBeyondViewport:true});
        fs.writeFileSync(path.join(process.env.FARM_THEME_SCREENSHOTS,`${theme}-preview-${width}.png`),Buffer.from(shot.data,'base64'));
        await evaluate(`cosmeticPreviewModal.querySelector('.modal-scroll-area').style.removeProperty('max-height'); cosmeticPreviewModal.querySelector('.cosmetic-preview-modal-panel').style.removeProperty('max-height');`);
        await evaluate('closeCosmeticPreview()');
        const farmBounds=await evaluate(`(() => {window.scrollTo(0,0);const r=document.querySelector('#farmPage .farm-layout').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1};})()`);
        const farmShot=await call('Page.captureScreenshot',{format:'png',clip:farmBounds,captureBeyondViewport:true});
        fs.writeFileSync(path.join(process.env.FARM_THEME_SCREENSHOTS,`${theme}-farm-${width}.png`),Buffer.from(farmShot.data,'base64'));
      }
      await evaluate('closeCosmeticPreview()');
    }
    assert.equal(await evaluate(`applyFarmTheme(null); document.querySelectorAll('#farmPage .farm-theme-banner').length`),0);
    console.log(width+'px: all themes share ornaments, backgrounds and market trims with preview; no purchase or overflow');
  }
  for (const width of [1440, 768, 390, 320]) {
    await call('Emulation.setDeviceMetricsOverride', {width, height: 1000, deviceScaleFactor: 1, mobile: false});
    const result = await evaluate(`(() => {
      showPage('farm');
      state.harvestInventory = Object.fromEntries(Object.keys(CROPS).map(id => [id, 3]));
      state.seedInventory = Object.fromEntries(Object.keys(CROPS).map(id => [id, 2]));
      selectedRecipeIngredients.fill('');
      renderFarm();
      farmKitchenModal.classList.remove('hidden');
      const allPublic = document.querySelectorAll('#recipeBook .recipe-entry').length === Object.keys(RECIPES).length && !document.querySelector('#recipeBook .locked');
      const allAvailable = document.querySelectorAll('#availableRecipes [data-select-recipe]').length === Object.keys(RECIPES).length;
      document.querySelector('#availableRecipes [data-select-recipe="cherryTart"]').click();
      const selected = selectedRecipeIngredients.join(',') === 'cherry,wheat,' && document.querySelector('#recipeIngredient1').value === 'cherry';
      const filtered = [...document.querySelectorAll('#availableRecipes [data-select-recipe]')].every(button => RECIPES[button.dataset.selectRecipe].ingredients.includes('cherry'));
      document.querySelector('#clearRecipeIngredients').click();
      const reset = selectedRecipeIngredients.every(id => !id);
      state.harvestInventory.cherry = 0; renderFarm();
      const missing = document.querySelector('#recipeBook [data-select-recipe="cherryTart"]').disabled && document.querySelector('#recipeBook [data-select-recipe="cherryTart"]').closest('article').textContent.includes('체리 1개 부족');
      const kitchenFits = farmKitchenModal.querySelector('.modal-scroll-area').scrollWidth <= farmKitchenModal.querySelector('.modal-scroll-area').clientWidth + 1;
      farmKitchenModal.classList.add('hidden');
      const namesFit = ['harvestStorageModal', 'seedStorageModal'].every(id => {
        const modal = document.getElementById(id); modal.classList.remove('hidden');
        const labels = [...modal.querySelectorAll('.storage-grid-44 strong')];
        const fits = labels.length > 0 && labels.every(label => label.scrollWidth <= label.clientWidth + 1 && label.scrollHeight <= label.clientHeight + 1 && getComputedStyle(label).whiteSpace === 'normal');
        modal.classList.add('hidden'); return fits;
      });
      openCosmeticPreview('farm_theme', 'volcano');
      const header = cosmeticPreviewModal.querySelector('header').getBoundingClientRect();
      const close = cosmeticPreviewModal.querySelector('button[data-close-cosmetic-preview]').getBoundingClientRect();
      const closeAligned = header.right - close.right <= 20 && close.top >= header.top && close.right <= header.right;
      const focusClose = document.activeElement.matches('button[data-close-cosmetic-preview]');
      closeCosmeticPreview();
      return { allPublic, allAvailable, selected, filtered, reset, missing, kitchenFits, namesFit, closeAligned, focusClose };
    })()`);
    assert.ok(Object.values(result).every(Boolean), width + 'px kitchen/storage/preview: ' + JSON.stringify(result));
    console.log(width + 'px: public recipes, ingredient selection, missing ingredients, wrapped crop names and preview close PASS');
    if (process.env.FARM_FEATURE_SCREENSHOTS && [1440, 390].includes(width)) {
      fs.mkdirSync(process.env.FARM_FEATURE_SCREENSHOTS, {recursive:true});
      for (const view of ['kitchen', 'preview', 'storage']) {
        await evaluate(view === 'kitchen' ? `farmKitchenModal.classList.remove('hidden')` : view === 'preview' ? `openCosmeticPreview('farm_theme','volcano')` : `document.querySelector('#seedStorageModal').classList.remove('hidden')`);
        const shot = await call('Page.captureScreenshot', {format:'png'});
        fs.writeFileSync(path.join(process.env.FARM_FEATURE_SCREENSHOTS, view+'-'+width+'.png'), Buffer.from(shot.data,'base64'));
        await evaluate(`farmKitchenModal.classList.add('hidden'); closeCosmeticPreview(); document.querySelector('#seedStorageModal').classList.add('hidden')`);
      }
    }
  }
  for (const [theme, skin, scenery, weather] of [
    [null, null, "meadow", "none"],
    ["springMeadow", null, "tulip", "none"],
    ["cherryBlossom", null, "cherry", "petals"],
    ["christmas", null, "snow", "snow"],
    ["galaxyNight", "lavenderField", "lavender", "none"],
    [null, "snowField", "snow", "snow"],
    [null, "cherryPetalFall", "cherry", "petals"],
    [null, null, "meadow", "none"],
  ]) {
    const result = await evaluate(`(() => {
      closeCosmeticPreview(); showPage('farm');
      state.equippedFarmTheme=${JSON.stringify(theme)};
      state.equippedPlotSkin=${JSON.stringify(skin)}; renderFarm();
      const scene=document.querySelector('#farmPage .farm-scene');
      const particles=scene.querySelector('.farm-weather');
      const first=particles.firstElementChild;
      renderFarm();
      const button=scene.querySelector('.farm-plot-select');
      button.scrollIntoView({block:'center'});
      const rect=button.getBoundingClientRect();
      const hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
      return {scenery:scene.dataset.scenery,weather:particles.dataset.weather,
        layers:scene.querySelectorAll('.farm-weather').length,
        count:particles.children.length,stable:first===particles.firstElementChild,
        clickable:hit===button || button.contains(hit)};
    })()`);
    assert.deepEqual(result,{scenery,weather,layers:1,count:weather==='none'?0:18,stable:true,clickable:true});
  }
  await evaluate("state.equippedPlotSkin='snowField'; renderFarm();");
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  assert.equal(await evaluate("getComputedStyle(document.querySelector('#farmPage .farm-weather')).display"),'none');
  await call('Emulation.setEmulatedMedia',{features:[]});
  assert.equal(await evaluate("(async () => {const art=new Image(); art.src='./assets/pixel/farm-world-atlas.png'; await art.decode(); return art.naturalWidth===1881 && art.naturalHeight===836;})()"),true);
  console.log('Scenery selection, removal, weather hit testing, stable particles and reduced motion PASS');
  const interactions = await evaluate(`(async () => {
    const originalAction=runFarmAction;
    const calls=[];
    runFarmAction=async (options) => {calls.push({rpc:options.rpc,params:options.params}); options.apply(); renderFarm(); return {event:{}};};
    try {
      state.farmPlots=Array.from({length:9},(_,id)=>({id,crop:id<2?'carrot':null,growth:0,wilted:id===1,lastCaredAt:Date.now(),lastFreeWaterAt:0}));
      state.coins=5; state.seedInventory.carrot=2;
      selectedSeed=null; selectedFarmItem=null; selectedFarmPlotId=null; renderFarm();
      const select=id=>document.querySelector('[data-select-farm-plot="'+id+'"]').click();
      const action=name=>document.querySelector('#farmPlotInspector [data-'+name+'-plot]').click();
      select(0);
      const selection=!document.querySelector('#farmPlotInspector').hidden && document.querySelector('#farmGrid [data-plot-id="0"]').classList.contains('plot-selected');
      action('grow'); await Promise.resolve();
      const growth=state.farmPlots[0].growth===1 && state.coins===4;
      action('water'); await Promise.resolve();
      const water=state.farmPlots[0].growth===2;
      selectedFarmItem='growthTonic'; state.farmItemInventory.growthTonic=1; select(0); await Promise.resolve();
      const supply=state.farmPlots[0].growth===getCropGrowthCost('carrot') && state.farmItemInventory.growthTonic===0;
      select(0); action('harvest'); await Promise.resolve();
      const harvested=!state.farmPlots[0].crop && document.querySelector('#farmPlotInspector').hidden;
      document.querySelector('[data-plant-plot="0"]').click();
      const seedsOpened=!document.querySelector('#seedStorageModal').classList.contains('hidden');
      document.querySelector('#seedStorageModal').classList.add('hidden');
      selectedSeed='carrot'; document.querySelector('[data-plant-plot="0"]').click(); await Promise.resolve();
      const planted=state.farmPlots[0].crop==='carrot' && state.seedInventory.carrot===1;
      selectedSeed=null; select(1); action('discard'); await Promise.resolve();
      const discarded=!state.farmPlots[1].crop;
      document.querySelector('[data-open-farm-market]').click();
      const marketOpen=getComputedStyle(document.querySelector('#npcMarket')).display!=='none';
      document.querySelector('[data-close-farm-market]').click();
      const marketClosed=getComputedStyle(document.querySelector('#npcMarket')).display==='none';
      select(0); document.querySelector('#farmPlotInspector').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
      const keyboardClose=document.querySelector('#farmPlotInspector').hidden && document.activeElement.dataset.selectFarmPlot==='0';
      return {selection,growth,water,supply,harvested,seedsOpened,planted,discarded,marketOpen,marketClosed,keyboardClose,calls};
    } finally {runFarmAction=originalAction;}
  })()`);
  assert.ok(Object.entries(interactions).filter(([key])=>key!=='calls').every(([,value])=>value),JSON.stringify(interactions));
  assert.deepEqual(interactions.calls.map(call=>call.rpc),['grow_farm_plot_with_coin','water_farm_plot','apply_farm_plot_item','harvest_farm_plot','plant_farm_seed','discard_farm_plot']);
  assert.ok(interactions.calls.every(call=>[0,1].includes(call.params.p_plot_index)));
  console.log('Map selection, inspector actions, supplies, seed picker, market and keyboard close PASS (local RPC stub)');
  assert.deepEqual(exceptions, []);
  console.log('Farm/mobile regression checks PASS');
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => {
  ws?.close();
  chrome?.kill();
  server.close();
});
