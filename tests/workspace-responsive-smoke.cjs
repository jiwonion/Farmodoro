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
  chrome = spawn(chromePath, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-sandbox", "--disable-crash-reporter", "--remote-debugging-port=0",
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

  const evaluate = async (expression) => {
    const result = await call('Runtime.evaluate', {expression, returnByValue:true});
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await evaluate(`if (!document.querySelector('link[href^="./workspace-responsive.css"]')) {const link=document.createElement('link');link.rel='stylesheet';link.href='./workspace-responsive.css';document.head.append(link);}`);
  await pause(100);
  await evaluate(`state.groups=[{id:'work',name:'업무',colorIndex:0}];
    state.tasks=[{id:'task-0',title:'회의 자료 정리',groupId:'work',status:'waiting',focusSeconds:0}];
    state.habits=[];taskDataHydrated=true;
    state.farmPlots=state.farmPlots.map((plot,i)=>({...plot,crop:i<4?Object.keys(CROPS)[i]:null,growth:i===3?4:1,plantedDate:toLocalDateString(),lastWateredDate:toLocalDateString(),lastCaredAt:Date.now(),wilted:false}));
    render();`);
  await call('Runtime.evaluate',{expression:'document.fonts.ready.then(() => true)',awaitPromise:true});
  fs.mkdirSync(path.join(root,'docs/previews/workspace'),{recursive:true});
  const dimensions=[];
  for (const [width,height] of [[2560,1440],[1920,1080],[1366,768],[1280,720],[1093,614],[1024,640],[768,1024],[390,844],[320,700]]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    for (const theme of ['white','dark']) {
      await evaluate(`applyWorkspaceTheme('${theme}');showPage('focus');`);
      await pause(120);
      const focus=await evaluate(`(() => {
        const rect=(selector)=>document.querySelector(selector).getBoundingClientRect();
        const stage=rect('#focusPageStage'),toolbar=rect('#focusPage .focus-stage-toolbar'),visual=rect('#focusPage .focus-visual'),copy=rect('#focusPage .focus-copy'),button=rect('#focusButton');
        return {overflow:document.documentElement.scrollWidth>innerWidth,
          frameFits:stage.left>=0&&stage.right<=innerWidth+1&&(innerWidth<=700||stage.bottom<=innerHeight+1),
          order:visual.bottom<=copy.top+1&&toolbar.bottom<=visual.top+1,
          copyFits:copy.left>=stage.left&&copy.right<=stage.right+1,
          controlsFit:button.left>=stage.left&&button.right<=stage.right+1&&button.bottom<=stage.bottom+1,
          frameHeight:stage.height,timerSize:visual.width,stageBottom:stage.bottom,toolbarHeight:toolbar.height,visualTop:visual.top,copyTop:copy.top,copyHeight:copy.height,buttonBottom:button.bottom};
      })()`);
      assert.equal(focus.overflow,false,`${width} ${height} ${theme} focus overflow`);
      assert.equal(focus.frameFits,true,`${width} ${height} ${theme} focus frame bounds ${JSON.stringify(focus)}`);
      assert.equal(focus.order,true,`${width} ${height} ${theme} focus control overlap ${JSON.stringify(focus)}`);
      assert.equal(focus.copyFits,true,`${width} ${height} ${theme} focus copy bounds`);
      assert.equal(focus.controlsFit,true,`${width} ${height} ${theme} focus control bounds ${JSON.stringify(focus)}`);
      if(theme==='white') dimensions.push({width,height,focusHeight:focus.frameHeight,timer:focus.timerSize});
      if (theme==='white'||width===1024) {
        const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
        fs.writeFileSync(path.join(root,'docs/previews/workspace',`focus-${theme}-${width}.png`),Buffer.from(shot.data,'base64'));
      }
      await evaluate(`showPage('farm')`);
      await pause(120);
      const farm=await evaluate(`(() => {
        const layout=document.querySelector('#farmPage .farm-layout').getBoundingClientRect(),scene=document.querySelector('#farmPage .farm-scene').getBoundingClientRect(),map=document.querySelector('#farmPage .farm-scene-grid').getBoundingClientRect();
        return {overflow:document.documentElement.scrollWidth>innerWidth,
          frameFits:layout.left>=0&&layout.right<=innerWidth+1,
          mapFits:map.width<=scene.width+1&&map.height<=scene.height+1,
          fillsWidth:Math.abs(map.width-scene.width)<1,
          ratio:Math.abs(map.width/map.height-1.5)<.01,
          tiles:document.querySelectorAll('#farmGrid .farm-plot').length,mapWidth:map.width,mapHeight:map.height};
      })()`);
      assert.equal(farm.overflow,false,`${width} ${height} ${theme} farm page overflow`);
      assert.equal(farm.frameFits,true,`${width} ${height} ${theme} farm frame bounds ${JSON.stringify(farm)}`);
      if(width>700) {
        assert.equal(farm.mapFits,true,`${width} ${height} ${theme} farm map fit ${JSON.stringify(farm)}`);
        assert.equal(farm.fillsWidth,true,`${width} ${height} ${theme} farm has no side gutters ${JSON.stringify(farm)}`);
      }
      assert.equal(farm.ratio,true,`${width} ${height} ${theme} undistorted map`);
      assert.equal(farm.tiles,9);
      if(theme==='white') Object.assign(dimensions.at(-1),{farmWidth:farm.mapWidth,farmHeight:farm.mapHeight});
      if(width<=700) {
        await evaluate(`if (!document.querySelector('#farmPage .farm-scene').classList.contains('is-overview')) document.querySelector('#toggleFarmOverview').click()`);
        await pause(60);
        assert.equal(await evaluate(`(() => { const scene=document.querySelector('#farmPage .farm-scene'),map=scene.querySelector('.farm-scene-grid');return map.getBoundingClientRect().width<=scene.clientWidth+1})()`),true,`${width} mobile farm overview fits`);
      }
      if (theme==='white'||width===1024) {
        const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
        fs.writeFileSync(path.join(root,'docs/previews/workspace',`farm-${theme}-${width}.png`),Buffer.from(shot.data,'base64'));
      }
      if(width<=700) await evaluate(`if (document.querySelector('#farmPage .farm-scene').classList.contains('is-overview')) document.querySelector('#toggleFarmOverview').click()`);
    }
    console.log(`${width}x${height} white/dark focus & farm responsive PASS`);
  }
  console.log(JSON.stringify(dimensions));
  const monitor=dimensions.find(({width})=>width===1920),laptop=dimensions.find(({width})=>width===1366);
  assert.ok(monitor.timer>laptop.timer,'Monitor timer scales larger than laptop');
  assert.ok(monitor.farmWidth>laptop.farmWidth,'Monitor farm scales larger than laptop');
  await call('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});
  for (const terrain of ['whiteDay','galaxyNight','volcano']) {
    await evaluate(`state.equippedFarmTheme='${terrain}';renderFarm();showPage('farm');`);
    await pause(80);
    const geometry=await evaluate(`(() => {
      const map=document.querySelector('#farmPage .farm-scene-grid').getBoundingClientRect(),grid=document.querySelector('#farmGrid').getBoundingClientRect();
      return {ratio:Math.abs(map.width/map.height-1.5)<.01,gridFits:grid.left>=map.left&&grid.right<=map.right&&grid.top>=map.top&&grid.bottom<=map.bottom,overflow:document.documentElement.scrollWidth>innerWidth};
    })()`);
    assert.deepEqual(geometry,{ratio:true,gridFits:true,overflow:false},`${terrain} terrain coordinates preserved`);
  }
  await evaluate(`showPage('focus');document.querySelector('#toggleFocusFarmBackground').click();`);
  await pause(80);
  assert.equal(await evaluate(`!!document.querySelector('#focusPage .focus-farm-background')`),true,'Farm focus background still renders');
  assert.equal(await evaluate(`document.documentElement.scrollWidth>innerWidth`),false,'Farm focus background has no page overflow');
  await evaluate(`document.querySelector('#toggleFocusFarmBackground').click()`);
  assert.deepEqual(exceptions,[],'No browser runtime exceptions');
  console.log('Monitor/laptop scaling, terrain coordinates, farm focus background PASS');
})().catch((error)=>{console.error(error);process.exitCode=1;}).finally(()=>{ws?.close();chrome?.kill();server.close();});
