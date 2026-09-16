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
    response.setHeader("Content-Type", file.endsWith(".css") ? "text/css" : file.endsWith(".js") ? "text/javascript" : "application/octet-stream");
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
  const tutorialElements = await call("Runtime.evaluate", {
    expression: 'document.querySelectorAll("#tutorialModal, #reopenTutorial, .tutorial-settings-section").length',
  });
  assert.equal(tutorialElements.result.value, 0, "tutorial UI must stay removed");
  for (const width of [1440, 768, 656, 390, 320]) {
    if (process.env.CROP_ATLAS_INSPECT && width === 1440) {
      const atlas = await call('Runtime.evaluate', {awaitPromise:true,returnByValue:true,expression:`(async()=>{
        const img=new Image(); img.src='./assets/pixel/crops-atlas.png'; await img.decode();
        const canvas=document.createElement('canvas'); canvas.width=img.width;canvas.height=img.height;
        const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);const data=ctx.getImageData(0,0,img.width,img.height).data;
        const columns=[];
        for(let col=0;col<8;col++){
          const left=Math.round(col*img.width/8),right=Math.round((col+1)*img.width/8);const bands=[];
          for(let y=0;y<img.height;y++) { let hits=0;for(let x=left;x<right;x++)if(data[(y*img.width+x)*4+3]>128)hits++;
            if(hits<4)continue;const last=bands.at(-1);if(last&&y-last[1]<=10)last[1]=y;else bands.push([y,y]);
          }
          columns.push(bands);
        }
        const rows=[];const edges=[0,175,332,499,654,807,958,1103,1254];
        for(let row=0;row<8;row++) {const bands=[];for(let x=0;x<img.width;x++){let hits=0;for(let y=edges[row];y<edges[row+1];y++)if(data[(y*img.width+x)*4+3]>128)hits++;if(hits<4)continue;const last=bands.at(-1);if(last&&x-last[1]<=4)last[1]=x;else bands.push([x,x]);}rows.push(bands);}
        return {width:img.width,height:img.height,columns,rows};
      })()`}); console.log('ATLAS '+JSON.stringify(atlas.result.value));
    }
    await call("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    if (width === 1440) {
      const bounds = await call('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{
        const img=new Image();img.src='./assets/pixel/crops-atlas.png';await img.decode();
        const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;
        const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);const rgba=ctx.getImageData(0,0,img.width,img.height).data;
        const cut=[];for(let i=0;i<62;i++){const r=pixelCropRegion(i);let hits=0;
          for(let y=r.y;y<r.y+r.height;y++)for(let x=r.x;x<r.x+r.width;x++){
            if(x!==r.x && x!==r.x+r.width-1 && y!==r.y && y!==r.y+r.height-1)continue;
            if(rgba[(y*img.width+x)*4+3]>128)hits++;
          }if(hits)cut.push({index:i,hits});
        }return {size:[img.width,img.height],cut};
      })()`});
      assert.equal(bounds.exceptionDetails,undefined,JSON.stringify(bounds.exceptionDetails));
      assert.deepEqual(bounds.result.value,{size:[1254,1254],cut:[]},'All 62 crop/stage boundaries must be transparent');
      if(process.env.CROP_SCREENSHOTS){
        await call('Runtime.evaluate',{expression:`(() => {
          const preview=document.createElement('section');preview.id='cropAtlasPreview';
          preview.style.cssText='position:fixed;inset:0;z-index:99999;background:white;padding:30px;display:grid;grid-template-columns:repeat(8,1fr);gap:10px;overflow:auto;color:black';
          const entries=[...PIXEL_CROP_IDS.map(id=>[id,'mature',CROPS[id].name]),...Object.keys(PIXEL_GROWTH_STAGES).map(stage=>['carrot',stage,stage])];
          preview.innerHTML=entries.map(([id,stage,label])=>'<div style="display:grid;justify-items:center;align-content:center;gap:8px;border:1px solid #ddd">'+cropPixel(id,stage)+'<small>'+label+'</small></div>').join('');
          document.body.append(preview);
        })()`});
        await pause(150);
        const shot=await call('Page.captureScreenshot',{format:'png'});
        fs.mkdirSync(process.env.CROP_SCREENSHOTS,{recursive:true});
        fs.writeFileSync(path.join(process.env.CROP_SCREENSHOTS,'crop-atlas-fixed.png'),Buffer.from(shot.data,'base64'));
        await call('Runtime.evaluate',{expression:'document.querySelector("#cropAtlasPreview").remove()'});
      }
    }
    for (const page of ["tasks", "habits", "focus", "farm", "today", "habits"]) {
      await call("Runtime.evaluate", { expression: `document.querySelector('[data-page="${page}"]').click()` });
      let active;
      for (let i = 0; i < 20; i++) {
        const result = await call("Runtime.evaluate", { expression: 'document.querySelector(".page-view.active")?.dataset.view' });
        active = result.result.value;
        if (active === page) break;
        await pause(25);
      }
      assert.equal(active, page, `${width}px menu ${page}: ${exceptions.join("\n")}`);
      if (["tasks", "habits", "focus", "farm"].includes(page)) {
        const heading = await call("Runtime.evaluate", { returnByValue: true, expression: `(() => {
          const view = document.querySelector('#${page}Page');
          const direct = view.querySelector(':scope > .page-header');
          return {
            hasTitle: !!direct?.querySelector('h1, .section-kicker, p'),
            titleText: direct?.querySelector('h1, .section-kicker, p')?.textContent.trim() || '',
            firstVisibleTop: [...view.children].find(el => getComputedStyle(el).display !== 'none')?.getBoundingClientRect().top || 0
          };
        })()` });
        assert.equal(heading.exceptionDetails, undefined, JSON.stringify(heading.exceptionDetails));
        assert.equal(heading.result.value.hasTitle, false, `${page} page heading copy removed`);
      }
      if (process.env.THEME_SCREENSHOTS) {
        await pause(300);
        const shot = await call('Page.captureScreenshot', {format:'png',captureBeyondViewport:true});
        fs.mkdirSync(process.env.THEME_SCREENSHOTS,{recursive:true});
        fs.writeFileSync(path.join(process.env.THEME_SCREENSHOTS,`${page}-${width}.png`),Buffer.from(shot.data,'base64'));
      }
    }
    assert.deepEqual(exceptions, [], "No application runtime errors");
    console.log(`${width}px: all menu navigation PASS`);
    const groupResult = await call("Runtime.evaluate", { returnByValue: true, expression: `(() => {
      state.groups = [{ id: "study", name: "공부", colorIndex: 0 }, { id: "work", name: "업무", colorIndex: 1 }];
      state.tasks = [
        { id: "one", title: "공부 대기", groupId: "study", status: "waiting" },
        { id: "two", title: "업무 대기", groupId: "work", status: "waiting" },
        { id: "three", title: "미분류", groupId: null, status: "waiting" },
        { id: "four", title: "보관", groupId: "study", status: "done", archived: true },
        { id: "five", title: "공부 진행", groupId: "study", status: "doing" },
        { id: "six", title: "공부 완료", groupId: "study", status: "done" }
      ];
      taskArchiveView = true;
      showPage("today");
      const visible = () => [...document.querySelectorAll("#taskBoard [data-task-id]")].map(card => card.dataset.taskId);
      document.querySelector('#todayTaskGroupFilters [data-task-group-filter="study"]').click();
      const study = visible();
      const active = document.querySelector('#todayTaskGroupFilters [aria-pressed="true"]').textContent.trim();
      document.querySelector('#todayTaskGroupFilters [data-task-group-filter="none"]').click();
      const none = visible();
      document.querySelector('#todayTaskGroupFilters [data-task-group-filter="all"]').click();
      const all = visible();
      const filters = document.querySelector("#todayTaskGroupFilters");
      const fits = filters.scrollWidth <= filters.clientWidth;
      state.tasks = []; state.groups = []; taskArchiveView = false;
      showPage("habits");
      return { study, active, none, all, fits };
    })()` });
    assert.equal(groupResult.exceptionDetails, undefined, JSON.stringify(groupResult.exceptionDetails));
    assert.deepEqual(groupResult.result.value, { study: ["one", "five", "six"], active: "공부", none: ["three"], all: ["one", "two", "three", "five", "six"], fits: true });
    console.log(`${width}px: today group filters and archive exclusion PASS`);
    const result = await call("Runtime.evaluate", { returnByValue: true, expression: `(() => {
      const style = id => { const s = getComputedStyle(document.getElementById(id)); return [s.width, s.height, s.backgroundColor, s.border, s.boxShadow, s.fontSize]; };
      const nav = document.querySelector("#habitDateNav");
      return { month: style("previousHabitMonth"), day: style("previousHabitDate"), today: style("habitDateToday"),
        fits: nav.scrollWidth <= nav.clientWidth, empty: document.querySelector("#habitList").textContent.trim(),
        modal: !!document.querySelector("#habitRecordModal") };
    })()` });
    const value = result.result.value;
    assert.deepEqual(value.day, value.month);
    assert.equal(value.today[2], "rgb(243, 207, 99)");
    assert.equal(value.fits, true);
    assert.equal(value.empty, "");
    assert.equal(value.modal, false);
    console.log(`${width}px: shared arrows, colored today button, empty list, no record modal PASS`);
    const farmResult = await call("Runtime.evaluate", { returnByValue: true, expression: `(() => {
      state.farmPlots = Array.from({length: 9}, (_, id) => {
        const crop = id === 8 ? null : ['carrot','strawberry','corn','eggplant','tomato','lavender','watermelon','sunflower'][id];
        return {id, crop, growth: id < 4 ? getCropGrowthCost(crop) : id - 4, lastCaredAt: Date.now(), lastWateredAt: 0};
      });
      state.coins = 128; state.farmMoney = 5400;
      state.dailySeedOffers = Object.keys(CROPS).slice(0, 7);
      state.dailyFoodOffers = Object.keys(RECIPES).slice(0, 6);
      state.dailyCropSellOffers = Object.keys(CROPS).slice(0, 7).map((cropId, index) => ({cropId, bundleSize:index % 2 ? 10 : 5}));
      farmLeaderboard = [
        {farmName:'별빛 농장',displayName:'농부 A',score:980,isMe:false},
        {farmName:'구름 밭',displayName:'농부 B',score:760,isMe:false},
        {farmName:'파란 정원',displayName:'농부 C',score:620,isMe:false},
        {farmName:'햇살 밭',displayName:'나',score:540,isMe:true},
        {farmName:'새싹 농장',displayName:'농부 D',score:390,isMe:false},
        {farmName:'노을 밭',displayName:'농부 E',score:210,isMe:false}
      ];
      state.equippedFarmTheme = 'springMeadow'; state.equippedPlotSkin = 'cherryPetalFall'; state.equippedLabelEffect = 'cherryDrift';
      state.ownedCosmetics = [{type:'farm_theme', id:'springMeadow'}, {type:'plot_skin', id:'cherryPetalFall'}, {type:'label_effect', id:'cherryDrift'}];
      state.dailyCosmeticOffers = [{type:'farm_theme',id:'cherryBlossom'}, {type:'plot_skin',id:'lavenderField'}, {type:'label_effect',id:'galaxySparkle'}];
      activeNpcPanel = 'rachel'; rachelActiveTab = 'offers'; showPage('farm'); renderFarm();
      const expected = Object.keys(CROPS).sort();
      const mapping = PIXEL_CROP_IDS.slice().sort();
      const allStages = Object.keys(CROPS).every(id => ['seed','sprout','growing','flower','wilted','mature'].every(stage => cropPixel(id,stage).includes('crop-pixel')));
      const cosmetics = Object.entries(COSMETIC_CATALOGS).every(([type,items]) => items.every(({id}) => cosmeticPixelPreview(type,id).includes('cosmetic-preview')));
      const foodSprites = PIXEL_FOOD_IDS.length===39 && new Set(PIXEL_FOOD_IDS.map(id=>foodPixel(id).match(/--food-position:([^\"]+)/)?.[1])).size===39;
      const tiles = [...document.querySelectorAll('#farmGrid .farm-plot')];
      const utilityButtons = [...document.querySelectorAll('.farm-header-actions > button.farm-utility-button')].filter(item => getComputedStyle(item).display !== 'none');
      const firstHeaderStyle = getComputedStyle(utilityButtons[0]);
      const firstHeaderHeight = utilityButtons[0].getBoundingClientRect().height;
      const farmMoney = document.querySelector('.farm-header-money');
      const storageButtons = [...document.querySelectorAll('.farm-storage-toolbar > button.farm-storage-button')];
      const overlaps = tiles.some((tile,i) => i > 2 && tile.getBoundingClientRect().top < tiles[i-3].getBoundingClientRect().bottom);
      const supplyModal = document.querySelector('#supplyStorageModal');
      supplyModal.classList.remove('hidden');
      const supplyRowCenters = [...document.querySelectorAll('#farmItemInventory .farm-supply-item')].map(card => {
        const parts = [card.querySelector('.farm-supply-pixel-icon'), card.querySelector('.supply-card-copy'), card.querySelector('.supply-card-actions em'), card.querySelector('.supply-card-actions button')];
        return parts.map(part => { const rect=part.getBoundingClientRect(); return rect.top+rect.height/2; });
      });
      const supplyRowsAligned = supplyRowCenters.every(centers => Math.max(...centers)-Math.min(...centers)<2);
      if (!supplyRowsAligned) throw Error('Supply row centers: '+JSON.stringify(supplyRowCenters));
      supplyModal.classList.add('hidden');
      const marketPanel = document.querySelector('#permanentMarketModal .farm-supply-modal-panel');
      const supplyPanel = document.querySelector('#supplyStorageModal .farm-supply-modal-panel');
      const marketHeader = marketPanel.querySelector('.modal-scroll-area > header');
      const supplyHeader = supplyPanel.querySelector('.modal-scroll-area > header');
      const marketBalance = marketPanel.querySelector('.modal-market-balance');
      const supplyBalance = supplyPanel.querySelector('.modal-market-balance');
      const sameStorefront = Boolean(marketPanel && supplyPanel) &&
        getComputedStyle(marketPanel).borderTopWidth===getComputedStyle(supplyPanel).borderTopWidth &&
        getComputedStyle(marketPanel).boxShadow===getComputedStyle(supplyPanel).boxShadow &&
        getComputedStyle(marketHeader).backgroundColor===getComputedStyle(supplyHeader).backgroundColor &&
        getComputedStyle(marketBalance).backgroundColor===getComputedStyle(supplyBalance).backgroundColor &&
        getComputedStyle(marketBalance).borderTopLeftRadius===getComputedStyle(supplyBalance).borderTopLeftRadius;
      return { mappingOK: JSON.stringify(expected) === JSON.stringify(mapping), allStages, cosmetics,
        plots: tiles.length, sprites: document.querySelectorAll('#farmGrid .crop-pixel').length,
        previews: document.querySelectorAll('#rachelOffersList .cosmetic-preview').length,
        bulletin: !!document.querySelector('[id*=Bulletin]'),
        noNpcProfiles: !document.querySelector('.npc-profile,.npc-avatar'),
        marketTabs: document.querySelectorAll('.market-category-tabs [data-npc-dot]').length,
        headerUtilities: !!document.querySelector('.farm-header-actions #openFarmRanking') && !!document.querySelector('.farm-header-actions #marketFarmMoneyBalance'),
        uniformHeader: utilityButtons.length===3 && utilityButtons.every(item => Math.abs(item.getBoundingClientRect().height-firstHeaderHeight)<1 && getComputedStyle(item).borderTopWidth===firstHeaderStyle.borderTopWidth && getComputedStyle(item).backgroundColor===firstHeaderStyle.backgroundColor && getComputedStyle(item).boxShadow===firstHeaderStyle.boxShadow),
        farmMoneyCompact: farmMoney.querySelector('b')?.textContent==='Farm' && !farmMoney.textContent.includes('Money') && parseFloat(getComputedStyle(farmMoney.querySelector('strong')).fontSize)<=14,
        storageInHeader: document.querySelector('.farm-header-actions > .farm-storage-toolbar')!==null && [...document.querySelector('.farm-header-actions').children].indexOf(document.querySelector('.farm-storage-toolbar')) < [...document.querySelector('.farm-header-actions').children].indexOf(document.querySelector('#openFarmMail')),
        uniformStorageButtons: storageButtons.length===3 && storageButtons.every(item => Math.abs(item.getBoundingClientRect().height-firstHeaderHeight)<1 && getComputedStyle(item).backgroundColor===firstHeaderStyle.backgroundColor && getComputedStyle(item).boxShadow===firstHeaderStyle.boxShadow),
        separateBuyMenus: !!document.querySelector('[data-npc-panel="food"] #noahBuyList') && !!document.querySelector('[data-npc-panel="crop"] #noahCropBundleList'),
        seedOffers: document.querySelectorAll('#seedShop .seed-shop-card').length,
        foodOffers: document.querySelectorAll('#noahBuyList .noah-buy-card').length,
        cropOffers: document.querySelectorAll('#noahCropBundleList .noah-buy-card').length,
        podium: document.querySelectorAll('#farmRankingPodium .farm-podium-place').length,
        rankedRows: document.querySelectorAll('#farmRankingList .farm-ranking-row:not(.farm-ranking-empty)').length,
        pixelCoin: getComputedStyle(document.querySelector('#farmPage .farm-wallet > span'),'::after').content !== 'none',
        waterStartsAtFive: formatPlotWaterCooldown(getPlotWaterRemaining({lastFreeWaterAt:Date.now()+2000})) === '5:00',
        supplyPixelIcons: document.querySelectorAll('#farmItemInventory .farm-supply-pixel-icon[data-farm-item-icon]').length === Object.keys(FARM_ITEMS).length &&
          getComputedStyle(document.querySelector('#farmItemInventory .farm-supply-pixel-icon')).backgroundImage.includes('farm-supplies-atlas.png'),
        supplyRowsAligned,sameStorefront,
        foodSprites,foodAtlas:document.querySelectorAll('#noahBuyList .food-pixel').length===6 && getComputedStyle(document.querySelector('#noahBuyList .food-pixel')).backgroundImage.includes('food-atlas.png'),
        foodMailIcon:getFarmGiftDetails('food','countryStew').icon.includes('food-pixel'),
        compactNames: !!document.querySelector('#seedInventory :is(.long-name,.very-long-name) strong') && !!document.querySelector('#farmItemInventory :is(.long-name,.very-long-name) strong'),
        overlaps, fits: document.documentElement.scrollWidth <= innerWidth,
        raster: getComputedStyle(document.querySelector('#farmGrid .crop-pixel'),'::before').backgroundImage.includes('crops-atlas.png'),
        animation: getComputedStyle(document.querySelector('#farmNameLabel')).animationName };
    })()` });
    assert.equal(farmResult.exceptionDetails, undefined, JSON.stringify(farmResult.exceptionDetails));
    assert.deepEqual(farmResult.result.value, {mappingOK:true, allStages:true, cosmetics:true, plots:9, sprites:8, previews:3, bulletin:false,noNpcProfiles:true,marketTabs:4,headerUtilities:true,uniformHeader:true,farmMoneyCompact:true,storageInHeader:true,uniformStorageButtons:true,separateBuyMenus:true,seedOffers:6,foodOffers:6,cropOffers:6,podium:3,rankedRows:3,pixelCoin:true,waterStartsAtFive:true,supplyPixelIcons:true,supplyRowsAligned:true,sameStorefront:true,foodSprites:true,foodAtlas:true,foodMailIcon:true,compactNames:true,overlaps:false, fits:true, raster:true, animation:'none'});
    assert.deepEqual(exceptions, [], "No farm runtime errors");
    const skinResult = await call('Runtime.evaluate', {returnByValue:true, expression:`(() => {
      const sameIDs = (ids, catalog) => JSON.stringify(ids.slice().sort()) === JSON.stringify(catalog.map(item => item.id).sort());
      const stateBefore = JSON.stringify([state.ownedCosmetics, state.coins, state.farmMoney, state.farmPlots]);
      const allThemes = FARM_THEMES.every(({id}) => { applyFarmTheme(id); return document.querySelector('#farmPage').dataset.farmTheme === id && getComputedStyle(document.querySelector('.farm-scene')).backgroundImage.includes('themes-atlas.png'); });
      applyFarmTheme(null);
      const defaultTheme = !document.querySelector('#farmPage').hasAttribute('data-farm-theme') && !getComputedStyle(document.querySelector('.farm-scene')).backgroundImage.includes('themes-atlas.png');
      applyFarmTheme(state.equippedFarmTheme);
      document.querySelector('[data-rachel-tab="owned"]').click();
      const owned = !document.querySelector('#rachelOwnedList').classList.contains('hidden') && document.querySelectorAll('#rachelOwnedList .cosmetic-preview').length === 3;
      document.querySelector('#rachelOwnedList [data-preview-cosmetic="plot_skin:cherryPetalFall"]').click();
      const ownedPlotPopup = !document.querySelector('#cosmeticPreviewModal').classList.contains('hidden') &&
        [...document.querySelectorAll('.cosmetic-preview-farm-scene .farm-plot')].every(plot => plot.dataset.previewPlot === 'cherryPetalFall');
      closeCosmeticPreview();
      document.querySelector('[data-rachel-tab="offers"]').click();
      document.querySelector('#rachelOffersList [data-preview-cosmetic="farm_theme:cherryBlossom"]').click();
      const popup = !document.querySelector('#cosmeticPreviewModal').classList.contains('hidden');
      const themePreview = getComputedStyle(document.querySelector('.cosmetic-preview-farm-scene')).backgroundImage.includes('themes-atlas.png');
      closeCosmeticPreview();
      openCosmeticPreview('plot_skin','lavenderField');
      const plotPreview = [...document.querySelectorAll('.cosmetic-preview-farm-scene .farm-plot')].every(plot => plot.dataset.previewPlot === 'lavenderField' && getComputedStyle(plot).backgroundImage.includes('plots-atlas.png'));
      closeCosmeticPreview();
      openCosmeticPreview('label_effect','galaxySparkle');
      const labelPreview = document.querySelector('.cosmetic-preview-nameplate').dataset.labelEffect === 'galaxySparkle' && getComputedStyle(document.querySelector('.cosmetic-preview-nameplate')).backgroundColor === 'rgb(52, 59, 101)';
      const noDuplicateIds = !document.querySelector('.cosmetic-preview-farm-scene [id]');
      closeCosmeticPreview();
      return {themeIDs: sameIDs(PIXEL_THEME_IDS,FARM_THEMES), plotIDs:sameIDs(PIXEL_PLOT_IDS,PLOT_SKINS), allThemes, defaultTheme, owned,
        popup,ownedPlotPopup,themePreview,plotPreview,labelPreview,noDuplicateIds,
        unchanged:stateBefore === JSON.stringify([state.ownedCosmetics,state.coins,state.farmMoney,state.farmPlots]),
        svgCount:document.querySelectorAll('#farmGrid svg').length};
    })()`});
    assert.equal(skinResult.exceptionDetails, undefined, JSON.stringify(skinResult.exceptionDetails));
    assert.deepEqual(skinResult.result.value,{themeIDs:true,plotIDs:true,allThemes:true,defaultTheme:true,owned:true,popup:true,ownedPlotPopup:true,themePreview:true,plotPreview:true,labelPreview:true,noDuplicateIds:true,unchanged:true,svgCount:0});
    const rewardBoxResult = await call('Runtime.evaluate',{returnByValue:true,expression:`(() => {
      const mail={id:'reward-ui-test',category:'updateBox',boxCropIds:['carrot','tomato','potato','strawberry','corn'],openedBoxIndexes:[0,2]};
      openFarmRewardBoxModal(mail);
      renderFarmRewardBoxes(mail,2);
      const panel=document.querySelector('.farm-reward-box-panel');
      const sealed=document.querySelector('.farm-reward-box.sealed');
      return {
        boxes:document.querySelectorAll('.farm-reward-box').length,
        sealed:document.querySelectorAll('.farm-reward-box.sealed .reward-chest:not(.is-open)').length,
        opened:document.querySelectorAll('.farm-reward-box.opened .reward-chest.is-open .reward-prize .crop-pixel').length,
        noGiftEmoji:!document.querySelector('#farmRewardBoxGrid').textContent.includes('🎁'),
        arcade:getComputedStyle(panel).backgroundImage!=='none',
        headerBg:getComputedStyle(panel.querySelector('header')).backgroundColor,
        idle:getComputedStyle(sealed).animationName==='reward-chest-idle',
        progress:document.querySelector('#farmRewardBoxStatus').getAttribute('aria-valuenow')==='2',
        fits:panel.scrollWidth<=panel.clientWidth
      };
    })()`});
    assert.equal(rewardBoxResult.exceptionDetails,undefined,JSON.stringify(rewardBoxResult.exceptionDetails));
    assert.deepEqual(rewardBoxResult.result.value,{boxes:5,sealed:3,opened:2,noGiftEmoji:true,arcade:true,headerBg:'rgb(255, 243, 189)',idle:true,progress:true,fits:true});
    if(process.env.FARM_SCREENSHOTS){
      await pause(180);
      const rewardShot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
      fs.mkdirSync(process.env.FARM_SCREENSHOTS,{recursive:true});
      fs.writeFileSync(path.join(process.env.FARM_SCREENSHOTS,`farm-reward-box-${width}.png`),Buffer.from(rewardShot.data,'base64'));
    }
    await call('Runtime.evaluate',{expression:'closeFarmRewardBoxModal()'});
    const kitchenResult = await call('Runtime.evaluate',{returnByValue:true,expression:`(() => {
      selectedRecipeIngredients.splice(0,3,'carrot','potato','');
      state.discoveredRecipes=Object.keys(RECIPES);
      Object.keys(state.foodInventory).forEach(id=>state.foodInventory[id]=0);
      ['countryStew','sunsetSoup','berryParfait'].forEach(id=>state.foodInventory[id]=1);
      renderFarm();
      farmKitchenModal.classList.remove('hidden');
      const cauldron=document.querySelector('#recipeCauldron');
      const panel=document.querySelector('.kitchen-modal-panel');
      const scene=document.querySelector('.witch-kitchen-scene').getBoundingClientRect();
      const containment=[...document.querySelectorAll('.witch-ingredient-rack .recipe-ingredient-select')].map(picker=>{
        const menu=picker.querySelector('.recipe-ingredient-menu');
        menu.classList.remove('hidden');
        const menuRect=menu.getBoundingClientRect();
        const icon=menu.querySelector('.recipe-ingredient-option i:not(:empty)');
        const sprite=icon?.querySelector('.crop-pixel');
        const iconRect=icon?.getBoundingClientRect();
        const spriteRect=sprite?.getBoundingClientRect();
        const result={
          menu:menuRect.top>=scene.top-1 && menuRect.bottom<=scene.bottom+1,
          icon:!!iconRect && !!spriteRect && spriteRect.left>=iconRect.left-1 && spriteRect.right<=iconRect.right+1 && spriteRect.top>=iconRect.top-1 && spriteRect.bottom<=iconRect.bottom+1
        };
        menu.classList.add('hidden');
        return result;
      });
      return {
        ingredients:document.querySelectorAll('#recipeCauldronIngredients .cauldron-ingredient').length,
        filled:cauldron.classList.contains('has-ingredients'),
        status:document.querySelector('#recipeCauldronStatus').textContent.includes('조합 준비 완료'),
        selectors:document.querySelectorAll('.witch-ingredient-rack .recipe-ingredient-select').length,
        witchScene:!!document.querySelector('.witch-kitchen-scene .witch-cauldron'),
        pickerArrows:[...document.querySelectorAll('.recipe-picker-arrow')].length===3 && [...document.querySelectorAll('.recipe-picker-arrow')].every(arrow=>arrow.textContent==='' && getComputedStyle(arrow).clipPath!=='none'),
        recipeFoodSprites:document.querySelectorAll('#recipeBook .food-pixel').length,
        storedFoodSprites:document.querySelectorAll('#foodInventory .food-pixel').length,
        menusContained:containment.every(result=>result.menu),
        ingredientIconsContained:containment.every(result=>result.icon),
        fits:panel.scrollWidth<=panel.clientWidth
      };
    })()`});
    assert.equal(kitchenResult.exceptionDetails,undefined,JSON.stringify(kitchenResult.exceptionDetails));
    assert.deepEqual(kitchenResult.result.value,{ingredients:2,filled:true,status:true,selectors:3,witchScene:true,pickerArrows:true,recipeFoodSprites:39,storedFoodSprites:3,menusContained:true,ingredientIconsContained:true,fits:true});
    await call('Runtime.evaluate', {expression:'farmKitchenModal.classList.add("hidden")'});
    const mailResult = await call('Runtime.evaluate',{returnByValue:true,expression:`(() => {
      renderFarmMail();
      farmMailModal.classList.remove('hidden');
      const panel=farmMailModal.querySelector('.farm-mail-modal-panel');
      panel.classList.add('mail-opening');
      launchFarmMailDispatch();
      const dispatch=document.querySelector('#farmMailDispatch');
      return {
        storefront:!!document.querySelector('.pixel-post-office-sign .pixel-post-mailbox'),
        awning:document.querySelectorAll('.pixel-post-awning i').length,
        opening:getComputedStyle(panel).animationName==='pixel-post-office-open',
        flag:getComputedStyle(document.querySelector('.pixel-post-mailbox i')).animationName==='pixel-mail-flag',
        dispatch:dispatch.classList.contains('dispatching') && getComputedStyle(dispatch).animationName==='pixel-mail-dispatch',
        fits:panel.scrollWidth<=panel.clientWidth
      };
    })()`});
    assert.equal(mailResult.exceptionDetails,undefined,JSON.stringify(mailResult.exceptionDetails));
    assert.deepEqual(mailResult.result.value,{storefront:true,awning:7,opening:true,flag:true,dispatch:true,fits:true});
    await call('Runtime.evaluate', {expression:'farmMailModal.querySelector(".farm-mail-modal-panel").classList.remove("mail-opening")'});
    await pause(100);
    if (process.env.FARM_SCREENSHOTS) {
      const mailShot = await call('Page.captureScreenshot', {format:'png', captureBeyondViewport:true});
      fs.mkdirSync(process.env.FARM_SCREENSHOTS, {recursive:true});
      fs.writeFileSync(path.join(process.env.FARM_SCREENSHOTS, `farm-mail-${width}.png`), Buffer.from(mailShot.data, 'base64'));
      await call('Runtime.evaluate', {expression:'farmMailModal.classList.add("hidden")'});
      await call('Runtime.evaluate', {expression:'farmKitchenModal.classList.remove("hidden")'});
      await pause(150);
      const kitchenShot = await call('Page.captureScreenshot', {format:'png', captureBeyondViewport:true});
      fs.mkdirSync(process.env.FARM_SCREENSHOTS, {recursive:true});
      fs.writeFileSync(path.join(process.env.FARM_SCREENSHOTS, `farm-kitchen-${width}.png`), Buffer.from(kitchenShot.data, 'base64'));
      await call('Runtime.evaluate', {expression:'document.querySelector(".witch-ingredient-rack .recipe-ingredient-menu").classList.remove("hidden")'});
      await pause(100);
      const kitchenPickerShot = await call('Page.captureScreenshot', {format:'png', captureBeyondViewport:true});
      fs.writeFileSync(path.join(process.env.FARM_SCREENSHOTS, `farm-kitchen-picker-${width}.png`), Buffer.from(kitchenPickerShot.data, 'base64'));
      await call('Runtime.evaluate', {expression:'farmKitchenModal.classList.add("hidden")'});
      await call('Runtime.evaluate', {expression:'activeNpcPanel="food"; renderNpcMarketCarousel()'});
      await pause(250);
      const shot = await call('Page.captureScreenshot', {format:'png', captureBeyondViewport:true});
      fs.mkdirSync(process.env.FARM_SCREENSHOTS, {recursive:true});
      fs.writeFileSync(path.join(process.env.FARM_SCREENSHOTS, `farm-${width}.png`), Buffer.from(shot.data, 'base64'));
      await call('Runtime.evaluate', {expression:'activeNpcPanel="rachel"; renderNpcMarketCarousel(); openCosmeticPreview("farm_theme","cherryBlossom")'});
      await pause(150);
      const previewShot = await call('Page.captureScreenshot', {format:'png', captureBeyondViewport:true});
      fs.writeFileSync(path.join(process.env.FARM_SCREENSHOTS, `farm-skin-preview-${width}.png`), Buffer.from(previewShot.data, 'base64'));
      await call('Runtime.evaluate', {expression:'closeCosmeticPreview()'});
      await call('Runtime.evaluate', {expression:'document.querySelector("#permanentMarketModal").classList.remove("hidden")'});
      await pause(150);
      const marketShot = await call('Page.captureScreenshot', {format:'png', captureBeyondViewport:true});
      fs.writeFileSync(path.join(process.env.FARM_SCREENSHOTS, `farm-permanent-market-${width}.png`), Buffer.from(marketShot.data, 'base64'));
      await call('Runtime.evaluate', {expression:'document.querySelector("#permanentMarketModal").classList.add("hidden")'});
      await call('Runtime.evaluate', {expression:'document.querySelector("#supplyStorageModal").classList.remove("hidden")'});
      await pause(150);
      const supplyShot = await call('Page.captureScreenshot', {format:'png', captureBeyondViewport:true});
      fs.writeFileSync(path.join(process.env.FARM_SCREENSHOTS, `farm-supplies-${width}.png`), Buffer.from(supplyShot.data, 'base64'));
      await call('Runtime.evaluate', {expression:'document.querySelector("#supplyStorageModal").classList.add("hidden")'});
      await call('Runtime.evaluate', {expression:'renderFarmRanking(); farmRankingModal.classList.remove("hidden")'});
      await pause(150);
      const rankingShot = await call('Page.captureScreenshot', {format:'png', captureBeyondViewport:true});
      fs.writeFileSync(path.join(process.env.FARM_SCREENSHOTS, `farm-ranking-${width}.png`), Buffer.from(rankingShot.data, 'base64'));
      await call('Runtime.evaluate', {expression:'farmRankingModal.classList.add("hidden")'});
    }
    await call('Runtime.evaluate', {expression:'farmMailModal.classList.add("hidden")'});
    await call('Runtime.evaluate', {expression:'selectedRecipeIngredients.fill(""); state.discoveredRecipes=[]; Object.keys(state.foodInventory).forEach(id=>state.foodInventory[id]=0); renderFarm()'});
    console.log(`${width}px: pixel farm, crop/stage mapping, cosmetic previews, static labels, no bulletin or overflow PASS`);
    const themeResult = await call('Runtime.evaluate',{returnByValue:true,expression:`(() => {
      showPage('focus');
      const stage = document.querySelector('#focusPageStage');
      const stageRect = stage.getBoundingClientRect();
      const timerRect = stage.querySelector('.timer-ring').getBoundingClientRect();
      const stageOK = getComputedStyle(stage).position === 'relative' && stageRect.height > 300 && timerRect.top >= stageRect.top && timerRect.bottom <= stageRect.bottom;
      stage.style.setProperty('--focus-background-image','url("./assets/pixel/themes-atlas.png")');
      const customBackground = getComputedStyle(stage).backgroundImage.includes('themes-atlas.png');
      stage.style.removeProperty('--focus-background-image');
      const defaultBackground = getComputedStyle(stage).backgroundImage.includes('default-focus-room.png');
      const youtubeRemoved = !document.querySelector('#toggleFocusYoutube,#focusYoutubePanel');
      const path = document.querySelector('.timer-progress-value');
      const timer = path.tagName.toLowerCase() === 'path' && Math.abs(Number(path.getAttribute('pathLength')) - 2*Math.PI*46) < .001;
      const singleTheme = !document.documentElement.hasAttribute('data-theme') && !document.querySelector('input[name="appTheme"]') && !document.querySelector('#themeSettingsTitle');
      const navPixel = getComputedStyle(document.querySelector('[data-page="today"] .nav-icon svg')).display === 'none' && getComputedStyle(document.querySelector('[data-page="today"] .nav-icon'),'::before').boxShadow !== 'none';
      showPage('habits'); openHabitModal();
      const panel = document.querySelector('#habitModal .habit-modal-panel');
      const rect = panel.getBoundingClientRect();
      const modalFits = rect.left >= 0 && rect.right <= innerWidth && rect.width > 200;
      closeHabitModal();
      showPage('today');
      setFocusMode('linked');
      const linkedSummary = document.querySelector('#summaryGrid').getBoundingClientRect();
      const linkedRow = document.querySelector('#todayPage .focus-mode-row').getBoundingClientRect();
      const modeButton = document.querySelector('#todayPage [data-focus-mode="linked"]');
      setFocusMode('quick');
      const quickSummary = document.querySelector('#summaryGrid').getBoundingClientRect();
      const quickRow = document.querySelector('#todayPage .focus-mode-row').getBoundingClientRect();
      const gear = document.querySelector('#toggleFocusSettings');
      const gearRect = gear.getBoundingClientRect();
      gear.click();
      const settingsRect = document.querySelector('#focusSettings').getBoundingClientRect();
      const backdrop = document.querySelector('#focusSettingsBackdrop');
      const backdropRect = backdrop.getBoundingClientRect();
      const modalClose = document.querySelector('#focusSettings [data-close-focus-settings]');
      const closeBefore = getComputedStyle(modalClose,'::before');
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = document.documentElement.clientHeight;
      const focusModeChecks = {
        readable:parseFloat(getComputedStyle(modeButton).fontSize) >= 12,
        compact:gearRect.width <= 26 && gearRect.height <= 26,
        stable:Math.abs(linkedSummary.height - quickSummary.height) < 1 && Math.abs(linkedRow.left - quickRow.left) < 1,
        centered:Math.abs((settingsRect.left + settingsRect.right) / 2 - viewportWidth / 2) < 2 && Math.abs((settingsRect.top + settingsRect.bottom) / 2 - viewportHeight / 2) < 2,
        panelFits:settingsRect.left >= 0 && settingsRect.right <= innerWidth,
        backdrop:backdropRect.left === 0 && backdropRect.top === 0 && backdropRect.right === viewportWidth && backdropRect.bottom === viewportHeight && getComputedStyle(backdrop).backgroundColor !== 'rgba(0, 0, 0, 0)',
        semantics:gear.getAttribute('aria-expanded') === 'true' && document.querySelector('#focusSettings').getAttribute('aria-modal') === 'true',
        closeCentered:getComputedStyle(modalClose).fontSize === '0px' && Math.abs(parseFloat(closeBefore.left)-modalClose.clientWidth/2)<1 && Math.abs(parseFloat(closeBefore.top)-modalClose.clientHeight/2)<1
      };
      const focusModeUI = Object.values(focusModeChecks).every(Boolean);
      if (!focusModeUI) throw Error('Focus settings modal: '+JSON.stringify(focusModeChecks));
      closeFocusSettings();
      setFocusMode('linked');
      return {stageOK,customBackground,defaultBackground,youtubeRemoved,timer,singleTheme,navPixel,modalFits,focusModeUI};
    })()`});
    assert.equal(themeResult.exceptionDetails,undefined,JSON.stringify(themeResult.exceptionDetails));
    assert.deepEqual(themeResult.result.value,{stageOK:true,customBackground:true,defaultBackground:true,youtubeRemoved:true,timer:true,singleTheme:true,navPixel:true,modalFits:true,focusModeUI:true});
    if (process.env.THEME_SCREENSHOTS) {
      for (const view of ['settings','habit-form','focus-settings','task-form','group-manager']) {
        const openView = view === 'settings'
          ? 'document.querySelector("#userSettingsModal").classList.remove("hidden")'
          : view === 'habit-form'
            ? 'openHabitModal()'
            : view === 'focus-settings'
              ? 'showPage("today"); setFocusMode("quick"); focusSettingsButton.click()'
              : view === 'task-form'
                ? 'showPage("today"); taskInput.value=""; taskForm.classList.remove("hidden")'
                : 'showPage("today"); taskForm.classList.remove("hidden"); document.querySelector("#toggleGroupManager").click()';
        await call('Runtime.evaluate',{expression:openView});
        await pause(100);
        const shot=await call('Page.captureScreenshot',{format:'png'});
        fs.writeFileSync(path.join(process.env.THEME_SCREENSHOTS,view+'-'+width+'.png'),Buffer.from(shot.data,'base64'));
        await call('Runtime.evaluate',{expression:'closeHabitModal(); document.querySelector("#userSettingsModal").classList.add("hidden"); closeFocusSettings(); closeGroupManager(); setFocusMode("linked"); taskForm.classList.add("hidden")'});
      }
    }
    assert.deepEqual(exceptions, [], 'No app-wide theme runtime errors');
    console.log(`${width}px: single pixel theme, compact focus button, centered settings modal, timer geometry and dialogs PASS`);
    const populated = await call('Runtime.evaluate',{returnByValue:true,expression:`(() => {
      state.groups=[{id:'study',name:'공부',colorIndex:0},{id:'life',name:'생활',colorIndex:1}];
      state.tasks=[{id:'pixel-task',title:'기획안 정리',groupId:'life',status:'waiting',focusSeconds:0},{id:'pixel-read',title:'책 20쪽 읽기',groupId:'study',status:'waiting',focusSeconds:0},{id:'pixel-done',title:'영어 단어 외우기',groupId:'study',status:'done',focusSeconds:0}];
      state.habits=[{id:'pixel-habit',title:'물 마시기',measureType:'count',targetValue:8,unit:'잔',startDate:toLocalDateString(),endDate:'',weekdays:[1,2,3,4,5,6,7],completionDates:[],progressByDate:{[toLocalDateString()]:2},focusByDate:{}},
        {id:'pixel-stretch',title:'스트레칭',measureType:'check',targetValue:1,unit:'회',startDate:toLocalDateString(),endDate:'',weekdays:[1,2,3,4,5,6,7],completionDates:[toLocalDateString()],progressByDate:{},focusByDate:{}},
        {id:'pixel-reading',title:'독서',measureType:'check',targetValue:1,unit:'회',startDate:toLocalDateString(),endDate:'',weekdays:[1,2,3,4,5,6,7],completionDates:[],progressByDate:{},focusByDate:{}}];
      document.querySelector('[data-focus-mode="quick"]').click();
      taskGroupFilter='all'; taskArchiveView=false; showPage('today'); renderTasks(); renderHabits(); renderSummary();
      const cards=[...document.querySelectorAll('#taskBoard .task-card,#habitList .habit-item')];
      return {count:cards.length, fits:cards.every(card=>{const r=card.getBoundingClientRect(); return r.left>=0 && r.right<=innerWidth;}), square:cards.every(card=>parseFloat(getComputedStyle(card).borderTopLeftRadius)<=2)};
    })()`});
    assert.equal(populated.exceptionDetails,undefined,JSON.stringify(populated.exceptionDetails));
    assert.deepEqual(populated.result.value,{count:6,fits:true,square:true});
    const referenceLayout = await call('Runtime.evaluate',{returnByValue:true,expression:`(() => {
      const rect = selector => document.querySelector(selector).getBoundingClientRect();
      const nav = [...document.querySelectorAll('.main-nav [data-page]')].map(el => el.getBoundingClientRect());
      const sideBySide = innerWidth <= 700 || Math.abs(rect('#taskSection').top-rect('#habitSection').top)<2;
      const navHorizontal = nav.every(r=>Math.abs(r.top-nav[0].top)<2 && r.right<=innerWidth);
      if (!navHorizontal) throw Error('Navigation bounds: '+JSON.stringify(nav.map(r=>({top:r.top,right:r.right,width:r.width})))+' viewport '+innerWidth);
      const summary = rect('#summaryGrid');
      const section = rect('#todayWorkspace');
      const source = document.querySelector('.today-task-check');
      const taskInput = document.querySelector('#taskInput');
      const taskProgress = document.querySelector('#stripTaskProgress');
      const coin = document.querySelector('#todayCoinDisplay');
      const farmMoney = document.querySelector('.summary-wallet .farm-money');
      const shiftEnter = new KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true,cancelable:true});
      taskInput.dispatchEvent(shiftEnter);
      taskForm.classList.remove('hidden');
      renderGroups();
      const groupManagerButton = document.querySelector('#toggleGroupManager');
      groupManagerButton.click();
      const groupManagerDialog = document.querySelector('#taskGroupManagerDialog');
      const groupManagerRect = groupManagerDialog.querySelector('.task-create-panel').getBoundingClientRect();
      const groupManagerModal = !groupManager.classList.contains('hidden') &&
        groupManager.parentElement === groupManagerDialog.querySelector('.task-create-panel') &&
        Math.abs((groupManagerRect.left+groupManagerRect.right)/2-document.documentElement.clientWidth/2)<2 &&
        groupManagerButton.getAttribute('aria-expanded')==='true' &&
        Boolean(groupManagerDialog.querySelector('#groupInput') && groupManagerDialog.querySelector('#addGroupButton'));
      const groupChip = groupManagerDialog.querySelector('.group-chip');
      const groupChipDelete = groupChip?.querySelector('[data-delete-group]');
      const groupDialogClose = groupManagerDialog.querySelector('header > [data-close-group-manager]');
      const groupControls = Boolean(groupChip && groupChipDelete && groupDialogClose) &&
        groupChip.getBoundingClientRect().height>=40 &&
        groupChipDelete.getBoundingClientRect().width>=28 && groupChipDelete.getBoundingClientRect().height>=28 &&
        groupDialogClose.getBoundingClientRect().width>=32 && groupDialogClose.getBoundingClientRect().height>=32 &&
        getComputedStyle(groupChipDelete).fontSize==='0px' && getComputedStyle(groupDialogClose).fontSize==='0px';
      if (!groupControls) throw Error('Group control geometry: '+JSON.stringify({chip:groupChip?.getBoundingClientRect().toJSON(),delete:groupChipDelete?.getBoundingClientRect().toJSON(),close:groupDialogClose?.getBoundingClientRect().toJSON(),deleteFont:groupChipDelete&&getComputedStyle(groupChipDelete).fontSize,closeFont:groupDialogClose&&getComputedStyle(groupDialogClose).fontSize}));
      const groupCountBeforeCancel = state.groups.length;
      groupManagerDialog.querySelector('[data-delete-group]')?.click();
      const groupDeleteConfirm = !document.querySelector('.group-delete-dialog').classList.contains('hidden') &&
        document.querySelector('#groupDeleteDialogMessage').textContent.includes('정말 삭제할까?');
      document.querySelector('[data-cancel-group-delete]').click();
      const groupDeleteCancel = state.groups.length===groupCountBeforeCancel;
      closeGroupManager();
      taskForm.classList.add('hidden');
      showPage('tasks');
      renderTasks();
      const taskCards = [...document.querySelectorAll('#tasksPage #taskBoard:not(.archive-view) .task-card')];
      const taskActionButtons = [...document.querySelectorAll('#tasksPage .task-actions button')];
      const taskToolbarButtons = [...document.querySelectorAll('#tasksPage .task-page-tools button')];
      const tasksToggle = !document.querySelector('[data-status="doing"]') &&
        !document.querySelector('#tasksPage .task-status-actions') &&
        !document.querySelector('#tasksPage [data-archive-task]') &&
        getComputedStyle(document.querySelector('#tasksPage .today-task-check')).display==='grid' &&
        Boolean(document.querySelector('#tasksPage [data-task-id="pixel-task"] .today-task-check[data-task-status="done"]'));
      const compactTaskCards = taskCards.every(card=>card.getBoundingClientRect().width<=422) &&
        taskActionButtons.every(button=>button.getBoundingClientRect().width>=36 && button.getBoundingClientRect().height>=36);
      const taskDelete = document.querySelector('#tasksPage .task-actions .delete-button');
      const taskDeleteBefore = getComputedStyle(taskDelete,'::before');
      const taskDeleteCentered = getComputedStyle(taskDelete).fontSize==='0px' &&
        Math.abs(parseFloat(taskDeleteBefore.left)-taskDelete.clientWidth/2)<1 &&
        Math.abs(parseFloat(taskDeleteBefore.top)-taskDelete.clientHeight/2)<1;
      const taskModalSharedClose = document.querySelector('#taskCreateModal button[data-close-task-create]').className==='pixel-close-button';
      const largeTaskToolbar = taskToolbarButtons.every(button=>button.getBoundingClientRect().height>=46 && parseFloat(getComputedStyle(button).fontSize)>=15) &&
        getComputedStyle(document.querySelector('#tasksPage .section-description')).display==='none';
      const completedTask = state.tasks.find(task=>task.id==='pixel-done');
      completedTask.archived=true; completedTask.archivedAt=new Date().toISOString(); taskArchiveView=true; renderTasks();
      const archivedCard = document.querySelector('#tasksPage [data-task-id="pixel-done"]');
      const archiveCardMatches = Boolean(archivedCard?.querySelector('.today-task-check[disabled]') && archivedCard.querySelector('[data-restore-task]')) &&
        archivedCard.getBoundingClientRect().width<=422 && getComputedStyle(archivedCard).display==='grid' &&
        !document.querySelector('#tasksPage [data-archive-task]');
      completedTask.archived=false; completedTask.archivedAt=''; taskArchiveView=false; renderTasks();
      document.querySelector('#tasksPage [data-task-id="pixel-task"] [data-edit-task]').click();
      const taskEditPanel = document.querySelector('#taskCreateModal .task-create-panel').getBoundingClientRect();
      const taskEditModal = !taskForm.classList.contains('hidden') && taskModalTitle.textContent==='할 일 수정' &&
        taskInput.value==='기획안 정리' && !taskModalFocusRow.hidden && taskFormSubmit.textContent==='수정 저장' &&
        !document.querySelector('.task-inline-edit') && taskEditPanel.left>=0 && taskEditPanel.right<=innerWidth;
      closeTaskCreate();
      showPage('habits');
      renderHabits();
      const habitCards=[...document.querySelectorAll('#habitsPage .habit-item')];
      const binaryHabits = habitCards.length===3 && !document.querySelector('#habitsPage .habit-count-control') &&
        habitCards.every(card=>card.querySelector('[data-toggle-habit]')) &&
        document.querySelectorAll('#habitsPage [data-focus-habit]').length===2 &&
        !document.querySelector('#habitMeasureType,#habitTargetValue,#habitUnit,#habitWeekdayTargetsEnabled,#habitWeekdayTargets') &&
        !document.querySelector('#habitForm .weekday-target-toggle');
      const habitVisuals = habitCards.every(card=>card.getBoundingClientRect().width<=422 && getComputedStyle(card).display==='grid') &&
        parseFloat(getComputedStyle(document.querySelector('#habitsPage .habit-copy strong')).fontSize)>=19 &&
        document.querySelector('#openHabitReset').closest('.habit-heatmap > header') &&
        getComputedStyle(document.querySelector('#previousHabitMonth')).backgroundColor==='rgb(6, 85, 255)' &&
        getComputedStyle(document.querySelector('#habitsPage .section-description')).display==='none';
      if (!habitVisuals) throw Error('Habit visual geometry: '+JSON.stringify({cards:habitCards.map(card=>({width:card.getBoundingClientRect().width,display:getComputedStyle(card).display})),font:getComputedStyle(document.querySelector('#habitsPage .habit-copy strong')).fontSize,resetNested:Boolean(document.querySelector('#openHabitReset').closest('.habit-heatmap > header')),arrow:getComputedStyle(document.querySelector('#previousHabitMonth')).backgroundColor,description:getComputedStyle(document.querySelector('#habitsPage .section-description')).display}));
      showPage('today');
      return {navTop:rect('.sidebar').bottom <= rect('.main-content').top+1, navHorizontal, sideBySide,
        flatToday:getComputedStyle(document.querySelector('#todayPage .board-column')).display==='contents',
        stripAbove:summary.bottom<=section.top,
        font:getComputedStyle(document.querySelector('#todayLabel')).fontFamily.includes('Mulmaru') && document.fonts.check('16px Mulmaru'),
        checkAction:source.dataset.taskStatus==='done',addHabit:document.querySelector('#openHabitForm').hidden,
        progress:taskProgress.children.length===10 && taskProgress.querySelectorAll('i.complete').length===3 && taskProgress.dataset.completedSegments==='3',
        cleanSummary:!document.querySelector('#todayPage .eyebrow') && !coin.querySelector('small') && farmMoney.getBoundingClientRect().top-coin.getBoundingClientRect().bottom<=6,
        groupManagerModal,groupControls,groupDeleteConfirm,groupDeleteCancel,tasksToggle,compactTaskCards,taskDeleteCentered,taskModalSharedClose,largeTaskToolbar,archiveCardMatches,taskEditModal,binaryHabits,habitVisuals,
        taskInputUI:taskInput.placeholder==='새 할 일을 입력해' &&
          getComputedStyle(taskInput,'::-webkit-scrollbar').display==='none' && !shiftEnter.defaultPrevented};
    })()`});
    assert.equal(referenceLayout.exceptionDetails,undefined,JSON.stringify(referenceLayout.exceptionDetails));
    assert.deepEqual(referenceLayout.result.value,{navTop:true,navHorizontal:true,sideBySide:true,flatToday:true,stripAbove:true,font:true,checkAction:true,addHabit:true,progress:true,cleanSummary:true,groupManagerModal:true,groupControls:true,groupDeleteConfirm:true,groupDeleteCancel:true,tasksToggle:true,compactTaskCards:true,taskDeleteCentered:true,taskModalSharedClose:true,largeTaskToolbar:true,archiveCardMatches:true,taskEditModal:true,binaryHabits:true,habitVisuals:true,taskInputUI:true});
    const miniDragSetup = await call('Runtime.evaluate',{returnByValue:true,expression:`(() => {
      showPage('tasks'); focusMode='linked'; runningFocusMode='linked'; activeFocus={type:'task',id:'pixel-task'};
      focusRuntimeByMode.linked={seconds:15,phase:'focus',started:true}; updateMiniFocusTimer();
      const r=document.querySelector('#miniFocusTimer .mini-focus-main').getBoundingClientRect();
      return {x:r.left+r.width/2,y:r.top+r.height/2,left:focusFloatingStatus.getBoundingClientRect().left,top:focusFloatingStatus.getBoundingClientRect().top};
    })()`});
    assert.equal(miniDragSetup.exceptionDetails,undefined,JSON.stringify(miniDragSetup.exceptionDetails));
    const drag = miniDragSetup.result.value;
    await call('Input.dispatchMouseEvent',{type:'mousePressed',x:drag.x,y:drag.y,button:'left',buttons:1,clickCount:1});
    await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:drag.x+42,y:drag.y-36,button:'left',buttons:1});
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:drag.x+42,y:drag.y-36,button:'left',buttons:0,clickCount:1});
    const miniDragResult = await call('Runtime.evaluate',{returnByValue:true,expression:`(() => {
      const r=focusFloatingStatus.getBoundingClientRect(); const timer=document.querySelector('#miniFocusTimer');
      const result={moved:Math.abs(r.left-${drag.left})>20||Math.abs(r.top-${drag.top})>20,saved:Boolean(localStorage.getItem(MINI_FOCUS_POSITION_KEY)),pageStayed:currentPage==='tasks',retro:getComputedStyle(timer).borderTopWidth==='3px'&&getComputedStyle(timer).borderTopLeftRadius==='2px'};
      focusRuntimeByMode.linked.started=false; runningFocusMode=null; activeFocus=null; timer.hidden=true;
      focusFloatingStatus.removeAttribute('style'); localStorage.removeItem(MINI_FOCUS_POSITION_KEY); showPage('today'); return result;
    })()`});
    assert.equal(miniDragResult.exceptionDetails,undefined,JSON.stringify(miniDragResult.exceptionDetails));
    assert.deepEqual(miniDragResult.result.value,{moved:true,saved:true,pageStayed:true,retro:true});
    console.log(`${width}px: approved mockup top navigation, timer strip, daily lists, font and live progress PASS`);
    if(process.env.THEME_SCREENSHOTS){
      await pause(350);
      const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
      fs.writeFileSync(path.join(process.env.THEME_SCREENSHOTS,'populated-'+width+'.png'),Buffer.from(shot.data,'base64'));
      await call('Runtime.evaluate',{expression:`showPage('tasks'); renderTasks();`});
      await pause(150);
      const tasksShot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
      fs.writeFileSync(path.join(process.env.THEME_SCREENSHOTS,'tasks-populated-'+width+'.png'),Buffer.from(tasksShot.data,'base64'));
      await call('Runtime.evaluate',{expression:`state.tasks.find(task=>task.id==='pixel-done').archived=true; taskArchiveView=true; renderTasks();`});
      await pause(150);
      const archiveShot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
      fs.writeFileSync(path.join(process.env.THEME_SCREENSHOTS,'tasks-archive-'+width+'.png'),Buffer.from(archiveShot.data,'base64'));
      await call('Runtime.evaluate',{expression:`state.tasks.find(task=>task.id==='pixel-done').archived=false; taskArchiveView=false; showPage('habits'); renderHabits();`});
      await pause(150);
      const habitsShot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
      fs.writeFileSync(path.join(process.env.THEME_SCREENSHOTS,'habits-populated-'+width+'.png'),Buffer.from(habitsShot.data,'base64'));
      await call('Runtime.evaluate',{expression:`focusMode='linked'; runningFocusMode='linked'; activeFocus={type:'habit',id:'pixel-habit'}; focusRuntimeByMode.linked={seconds:75,phase:'focus',started:true}; updateMiniFocusTimer();`});
      await pause(150);
      const miniTimerShot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
      fs.writeFileSync(path.join(process.env.THEME_SCREENSHOTS,'mini-timer-'+width+'.png'),Buffer.from(miniTimerShot.data,'base64'));
      await call('Runtime.evaluate',{expression:`focusRuntimeByMode.linked.started=false; runningFocusMode=null; activeFocus=null; miniFocusTimer.hidden=true;`});
      await call('Runtime.evaluate',{expression:`showPage('today'); taskForm.classList.remove('hidden'); renderGroups(); document.querySelector('#toggleGroupManager').click();`});
      await pause(150);
      const groupsShot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
      fs.writeFileSync(path.join(process.env.THEME_SCREENSHOTS,'groups-populated-'+width+'.png'),Buffer.from(groupsShot.data,'base64'));
      await call('Runtime.evaluate',{expression:`closeGroupManager(); closeTaskCreate();`});
    }
    await call('Runtime.evaluate',{expression:'state.tasks=[]; state.habits=[]; state.groups=[]; renderTasks(); renderHabits();'});
  }
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => {
  ws?.close();
  chrome?.kill();
  server.close();
});
