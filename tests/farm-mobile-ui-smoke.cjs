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
      const plot=document.querySelector('#farmGrid .crop-plot'), sprite=plot.querySelector('.field-crop');
      const p=plot.getBoundingClientRect(), s=sprite.getBoundingClientRect();
      return {soilBed:p.width>p.height*1.5, sprite:s.width, tile:p.width, overflow:document.documentElement.scrollWidth>innerWidth};
    })()`);
    console.log('crop geometry', width, geometry);
    assert.equal(geometry.soilBed,true,'foreshortened soil bed '+width);
    assert.equal(geometry.overflow,false,'populated overflow '+width);
    if(width<=700) assert.ok(geometry.sprite>=18,'visible crop cluster '+width);
    const inlineStatus = await evaluate(`(() => {
      const tile=document.querySelector('#farmGrid .crop-plot');
      const parts=['.crop-visual','.plot-status'].map(selector=>tile.querySelector(selector));
      const visible=parts.every(element=>getComputedStyle(element).display!=='none' && element.getBoundingClientRect().height>0);
      const rects=parts.map(element=>element.getBoundingClientRect());
      return {visible,noOverlap:rects.every((rect,index)=>index===0 || rect.top>=rects[index-1].bottom-2),noInspector:!document.querySelector('#farmPlotInspector,.farm-plot-select'),noToolbar:!document.querySelector('#farmPage .farm-header-actions,#farmPage .farm-storage-toolbar')};
    })()`);
    assert.ok(Object.values(inlineStatus).every(Boolean),width+'px inline status: '+JSON.stringify(inlineStatus));
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
          fullScenery:paper==='none' && getComputedStyle(farm.querySelector('.farm-scene-grid'),'::before').backgroundImage.includes('/farm-b-v1/terrain/') && getComputedStyle(farm.querySelector('.farm-scene-grid'),'::before').backgroundImage===getComputedStyle(preview.querySelector('.farm-scene-grid'),'::before').backgroundImage && farm.querySelector('.farm-scene').dataset.scenery===preview.querySelector('.farm-scene').dataset.scenery,
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
    ["galaxyNight", "lavenderField", "lavender", "lavender"],
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
      openFarmPlotId=state.farmPlots.find(plot=>plot.crop && !plot.wilted).id; renderFarm();
      const button=scene.querySelector('.is-open .harvest-button, .is-open [data-grow-plot]');
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
  assert.equal(await evaluate("(async () => {const art=new Image(); art.src='./assets/pixel/farm-world-facilities-atlas.png'; await art.decode(); return art.naturalWidth===1881 && art.naturalHeight===836;})()"),true);
  console.log('Scenery selection, removal, weather hit testing, stable particles and reduced motion PASS');
  for (const width of [1440, 390, 320]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
    for (const [selector,modalId] of [
      ['.facility-harvest','harvestStorageModal'],['.facility-seed','seedStorageModal'],['.facility-supply','supplyStorageModal'],
      ['.facility-mail','farmMailModal'],['.facility-kitchen','farmKitchenModal'],['.facility-ranking','farmRankingModal'],
    ]) {
      const result=await evaluate(`(async () => {
        const facility=document.querySelector(${JSON.stringify(selector)});
        facility.scrollIntoView({block:'center',inline:'center'});
        await new Promise(resolve=>requestAnimationFrame(resolve));
        const rect=facility.getBoundingClientRect();
        const hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
        const clickable=hit===facility || facility.contains(hit);
        facility.click(); await Promise.resolve();
        const modal=document.getElementById(${JSON.stringify(modalId)});
        const opens=!modal.classList.contains('hidden');
        modal.classList.add('hidden');
        return {clickable,opens,inMap:!!facility.closest('.farm-scene-grid'),sized:rect.width>=44 && rect.height>=44};
      })()`);
      assert.ok(Object.values(result).every(Boolean),width+'px '+selector+': '+JSON.stringify(result));
    }
  }
  console.log('All six farm facilities open their own panels at desktop and mobile sizes PASS');
  await evaluate(`state.dailySeedOffers=Object.keys(CROPS).slice(0,7); state.dailyFoodOffers=Object.keys(RECIPES).slice(0,7); state.dailyCropSellOffers=Object.keys(CROPS).slice(0,7).map(cropId=>({cropId,bundleSize:5})); renderFarm();`);
  assert.deepEqual(await evaluate(`[document.querySelectorAll('#seedShop .seed-shop-card').length,document.querySelectorAll('#noahBuyList .noah-buy-card').length,document.querySelectorAll('#noahCropBundleList .noah-buy-card').length]`),[7,7,7]);
  for (const width of [1440, 390, 320]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
    for (const theme of [null, 'springMeadow', 'cherryBlossom', 'christmas', 'iceKingdom', 'galaxyNight', 'halloween', 'valentine', 'whiteDay', 'bubbleField', 'volcano', 'ocean', 'goldenHarvest', 'lavender']) {
      await evaluate(`state.equippedFarmTheme=${JSON.stringify(theme)}; state.equippedPlotSkin=null; renderFarm();`);
      await evaluate(`renderFarmRewardBoxes({boxCropIds:['carrot','corn','tomato'],openedBoxIndexes:[0]});`);
      for (const id of ['farmKitchenModal','farmMailModal','harvestStorageModal','seedStorageModal','supplyStorageModal','farmRankingModal','farmRewardBoxModal','cosmeticPreviewModal','freePassTargetModal']) {
        const result=await evaluate(`(() => {
          const modal=document.getElementById(${JSON.stringify(id)}); modal.classList.remove('hidden');
          const scroll=modal.querySelector('.modal-scroll-area'), panel=modal.querySelector('.market-modal-panel');
          const r=panel.getBoundingClientRect();
          const actionsFit=[...modal.querySelectorAll('.supply-card-actions')].every(actions=>{
            const parts=[...actions.children].map(e=>e.getBoundingClientRect());
            return parts.every((r,i)=>i===0 || r.left>=parts[i-1].right+3);
          });
          return {actionsFit,palette:modal.dataset.rpgTheme===${JSON.stringify(theme || 'meadow')}, fits:scroll.scrollWidth<=scroll.clientWidth+1, onScreen:r.left>=0 && r.right<=innerWidth+1 && r.top>=0 && r.bottom<=innerHeight+1};
        })()`);
        assert.ok(Object.values(result).every(Boolean),`${width}px ${theme} ${id}: ${JSON.stringify(result)}`);
        if (process.env.FARM_RPG_SCREENSHOTS && width!==320 && [null,'cherryBlossom','galaxyNight'].includes(theme)) {
          fs.mkdirSync(process.env.FARM_RPG_SCREENSHOTS,{recursive:true});
          await pause(100);
          const shot=await call('Page.captureScreenshot',{format:'png'});
          fs.writeFileSync(path.join(process.env.FARM_RPG_SCREENSHOTS,`${id}-${theme || 'meadow'}-${width}.png`),Buffer.from(shot.data,'base64'));
        }
        await evaluate(`document.getElementById(${JSON.stringify(id)}).classList.add('hidden')`);
      }
      await evaluate(`setFarmMarketOpen(true)`);
      assert.equal(await evaluate(`(() => {const market=document.querySelector('#npcMarket'); return market.dataset.rpgTheme===${JSON.stringify(theme || 'meadow')} && market.scrollWidth<=market.clientWidth+1;})()`),true);
      if(process.env.FARM_RPG_SCREENSHOTS && width!==320 && [null,'galaxyNight'].includes(theme)) {
        const shot=await call('Page.captureScreenshot',{format:'png'});
        fs.writeFileSync(path.join(process.env.FARM_RPG_SCREENSHOTS,`market-${theme || 'meadow'}-${width}.png`),Buffer.from(shot.data,'base64'));
      }
      await evaluate(`setFarmMarketOpen(false)`);
    }
    await evaluate(`state.equippedFarmTheme=null; state.farmPlots=Array.from({length:9},(_,id)=>({id,crop:'carrot',growth:id===0?0:3,wilted:id===3,lastCaredAt:Date.now()-(id===2?23:0)*3600000,lastFreeWaterAt:0})); renderFarm();`);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-plot-status]')].slice(0,4).map(e=>e.dataset.urgency)`),['water','harvest','urgent','wilted']);
    await evaluate(`document.querySelector('#toggleFarmOverview').click()`);
    await pause(100);
    assert.equal(await evaluate(`(() => {const scene=document.querySelector('#farmPage .farm-scene'); return scene.scrollWidth<=scene.clientWidth+1 && document.querySelector('#toggleFarmOverview').getAttribute('aria-pressed')==='true';})()`),true);
    if(process.env.FARM_RPG_SCREENSHOTS) {
      const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
      fs.writeFileSync(path.join(process.env.FARM_RPG_SCREENSHOTS,`overview-${width}.png`),Buffer.from(shot.data,'base64'));
    }
    await evaluate(`document.querySelector('#farmGrid .plot-hit').click()`);
    await pause(100);
    assert.equal(await evaluate(`!document.querySelector('#farmPage .farm-scene').classList.contains('is-overview') && !!document.querySelector('#farmGrid .is-open')`),true);
  }
  await evaluate(`state.equippedFarmTheme='galaxyNight'; state.equippedPlotSkin='snowField'; renderFarm();`);
  assert.equal(await evaluate(`document.querySelector('#farmMailModal').dataset.rpgTheme`),'christmas');
  await evaluate(`openCosmeticPreview('farm_theme','volcano')`);
  assert.equal(await evaluate(`document.querySelector('#farmMailModal').dataset.rpgTheme`),'christmas');
  await evaluate(`closeCosmeticPreview(); state.equippedPlotSkin=null; state.equippedFarmTheme=null; renderFarm();`);
  console.log('RPG popup palettes, 9 dialogs and market across 14 terrains, skin overrides, status priorities and overview navigation PASS');
  const supplyPurchase = await evaluate(`(async () => {
    const originalAction=runFarmAction, calls=[];
    runFarmAction=async options=>{calls.push(options.rpc); options.apply(); renderFarm(); return {event:{}};};
    try {
      selectedFarmItem=null; state.farmMoney=500; state.farmItemInventory.growthTonic=0;
      state.farmItemInventory.farmFestivalPass=0; state.wiltProtectionUntil=0; renderFarm();
      const modal=document.querySelector('#supplyStorageModal'); modal.classList.remove('hidden');
      const removed=!document.querySelector('#permanentMarketModal,#openPermanentMarket,#farmItemShop');
      const button=()=>modal.querySelector('[data-buy-farm-item="growthTonic"]');
      const use=()=>modal.querySelector('[data-use-farm-item="growthTonic"]');
      const initial=use().disabled && !button().disabled;
      button().click(); await Promise.resolve();
      const bought=state.farmItemInventory.growthTonic===1 && state.farmMoney===500-FARM_ITEMS.growthTonic.price && !use().disabled && !modal.classList.contains('hidden') && document.querySelector('#supplyFarmMoneyBalance').textContent===String(state.farmMoney);
      use().click(); await Promise.resolve();
      const selected=selectedFarmItem==='growthTonic' && modal.classList.contains('hidden') && state.farmItemInventory.growthTonic===1;
      modal.classList.remove('hidden');
      modal.querySelector('[data-buy-farm-item="farmFestivalPass"]').click(); await Promise.resolve();
      modal.querySelector('[data-use-farm-item="farmFestivalPass"]').click(); await Promise.resolve();
      const used=state.farmItemInventory.farmFestivalPass===0 && state.wiltProtectionUntil>Date.now();
      state.farmMoney=0; renderFarm(); const before=calls.length;
      button().click(); await Promise.resolve();
      const insufficient=button().disabled && calls.length===before && state.farmMoney===0;
      state.farmMoney=500; renderFarm();
      runFarmAction=async options=>{options.apply(); options.revert(); renderFarm(); return null;};
      button().click(); await Promise.resolve();
      const rollback=state.farmMoney===500 && state.farmItemInventory.growthTonic===1;
      modal.classList.add('hidden'); selectedFarmItem=null; state.wiltProtectionUntil=0;
      return {removed,initial,bought,selected,used,insufficient,rollback,calls};
    } finally {runFarmAction=originalAction;}
  })()`);
  assert.ok(Object.entries(supplyPurchase).filter(([key])=>key!=='calls').every(([,value])=>value),JSON.stringify(supplyPurchase));
  assert.deepEqual(supplyPurchase.calls,['buy_farm_supply','buy_farm_supply','use_farm_festival_pass']);
  console.log('Unified supplies purchase, balance, target selection, immediate use, insufficient funds and rollback PASS (local RPC stub)');
  const interactions = await evaluate(`(async () => {
    const originalAction=runFarmAction;
    const calls=[];
    runFarmAction=async (options) => {calls.push({rpc:options.rpc,params:options.params}); options.apply(); renderFarm(); return {event:{}};};
    try {
      state.farmPlots=Array.from({length:9},(_,id)=>({id,crop:id<2?'carrot':null,growth:0,wilted:id===1,lastCaredAt:Date.now(),lastFreeWaterAt:0}));
      state.coins=5; state.seedInventory.carrot=2;
      selectedSeed=null; selectedFarmItem=null; openFarmPlotId=null; renderFarm();
      const action=(name,id=0)=>document.querySelector('#farmGrid [data-'+name+'-plot="'+id+'"]').click();
      document.querySelector('#farmGrid [data-select-plot="0"]').click();
      const tile=document.querySelector('#farmGrid [data-plot-id="0"]');
      const selection=!document.querySelector('#farmPlotInspector, .farm-plot-select') && getComputedStyle(tile.querySelector('.crop-info')).display!=='none' && getComputedStyle(tile.querySelector('.crop-wilt-countdown')).display!=='none';
      tile.querySelector('[data-grow-plot]').focus();
      action('grow'); await Promise.resolve();
      const growth=state.farmPlots[0].growth===1 && state.coins===4 && document.activeElement.dataset.growPlot==='0';
      action('water'); await Promise.resolve();
      const water=state.farmPlots[0].growth===2;
      selectedFarmItem='growthTonic'; state.farmItemInventory.growthTonic=1; renderFarm(); document.querySelector('#farmGrid [data-plot-id="0"] .farm-apply-item').click(); await Promise.resolve();
      const supply=state.farmPlots[0].growth===getCropGrowthCost('carrot') && state.farmItemInventory.growthTonic===0;
      action('harvest'); await Promise.resolve();
      const harvested=!state.farmPlots[0].crop && !document.querySelector('#farmPlotInspector');
      document.querySelector('[data-plant-plot="0"]').click();
      const seedsOpened=!document.querySelector('#seedStorageModal').classList.contains('hidden');
      document.querySelector('#seedStorageModal').classList.add('hidden');
      selectedSeed='carrot'; document.querySelector('[data-plant-plot="0"]').click(); await Promise.resolve();
      const planted=state.farmPlots[0].crop==='carrot' && state.seedInventory.carrot===1;
      selectedSeed=null; action('discard',1); await Promise.resolve();
      const discarded=!state.farmPlots[1].crop;
      document.querySelector('[data-open-farm-market]').click();
      const marketOpen=getComputedStyle(document.querySelector('#npcMarket')).display!=='none';
      document.querySelector('[data-close-farm-market]').click();
      const marketClosed=getComputedStyle(document.querySelector('#npcMarket')).display==='none';
      document.querySelector('[data-open-farm-market]').click();
      document.querySelector('#npcMarket').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
      const keyboardClose=!document.querySelector('#farmPage').classList.contains('farm-market-open') && document.activeElement.id==='toggleFarmMarket';
      return {selection,growth,water,supply,harvested,seedsOpened,planted,discarded,marketOpen,marketClosed,keyboardClose,calls};
    } finally {runFarmAction=originalAction;}
  })()`);
  assert.ok(Object.entries(interactions).filter(([key])=>key!=='calls').every(([,value])=>value),JSON.stringify(interactions));
  assert.deepEqual(interactions.calls.map(call=>call.rpc),['grow_farm_plot_with_coin','water_farm_plot','apply_farm_plot_item','harvest_farm_plot','plant_farm_seed','discard_farm_plot']);
  assert.ok(interactions.calls.every(call=>[0,1].includes(call.params.p_plot_index)));
  console.log('Visible plot status, direct actions, supplies, seed picker, market and keyboard close PASS (local RPC stub)');
  assert.deepEqual(exceptions, []);
  console.log('Farm/mobile regression checks PASS');
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => {
  ws?.close();
  chrome?.kill();
  server.close();
});
