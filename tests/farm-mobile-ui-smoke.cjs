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
      const marketMatches=innerWidth<=1100 || Math.abs(field.height-market.height)<2;
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
      return {square:Math.abs(p.width-p.height)<2, sprite:s.width, tile:p.width, overflow:document.documentElement.scrollWidth>innerWidth};
    })()`);
    console.log('crop geometry', width, geometry);
    assert.equal(geometry.square,true,'square plot '+width);
    assert.equal(geometry.overflow,false,'populated overflow '+width);
    if(width<=700) assert.ok(geometry.sprite>=geometry.tile*0.55,'visible crop '+width);
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
    const themes = await evaluate('PIXEL_THEME_IDS');
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
          matching:ornament===getComputedStyle(preview.querySelector('.farm-theme-banner > i')).backgroundImage && paper===getComputedStyle(preview.querySelector('.farm-layout')).backgroundImage && trim===getComputedStyle(preview.querySelector('.npc-market'),'::before').backgroundImage,
          decorated:ornament.includes('/farm-themes/'+${JSON.stringify(theme)}+'.svg') && trim===ornament,
          fits:farm.scrollWidth<=farm.clientWidth && preview.scrollWidth<=preview.clientWidth,
          noPurchase:money===state.farmMoney && coins===state.coins,
          unique:farm.querySelectorAll('.farm-theme-banner').length===1
        };
      })()`);
      assert.deepEqual(decoration,{matching:true,decorated:true,fits:true,noPurchase:true,unique:true},theme+' '+width);
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
    console.log(width+'px: all nine themes share ornaments, backgrounds and market trims with preview; no purchase or overflow');
  }
  console.log('Farm/mobile regression checks PASS');
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => {
  ws?.close();
  chrome?.kill();
  server.close();
});
