// Actual Chrome acceptance check: the inert farm fills the normal and fullscreen
// focus frame while the complete map (including purchased fields) scales evenly.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'farmodoro-focus-cover-'));
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  .replace(/<script\b[^>]*src="(?:https:[^"]*|\.\/pwa-register\.js[^"]*)"[^>]*>[\s\S]*?<\/script>/gi, '');
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (pathname === '/') { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html); return; }
  const file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  try {
    response.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
    response.end(fs.readFileSync(file));
  } catch { response.writeHead(404).end(); }
});
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
let chrome;
let socket;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-sandbox', '--disable-crash-reporter',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'
  ], { windowsHide: true, stdio: 'ignore' });
  chrome.on('error', error => { throw error; });
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 200 && !fs.existsSync(portFile); attempt += 1) await pause(50);
  const port = fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0];
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let sequence = 0;
  const pending = new Map();
  const exceptions = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, 10000);
    pending.set(id, message => { clearTimeout(timeout); if (message.error) reject(new Error(JSON.stringify(message.error))); else resolve(message.result); });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const settle = async expression => {
    for (let attempt = 0; attempt < 100; attempt += 1) { if (await evaluate(expression)) return; await pause(30); }
    assert.fail(`UI did not settle: ${expression}`);
  };
  await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
  await settle('document.readyState === "complete"');
  await evaluate(`
    document.documentElement.className = '';
    document.body.classList.remove('auth-gated');
    document.querySelector('#authGate').hidden = true;
    document.querySelector('.auth-boot')?.remove();
    focusTimerDatabaseUnavailable = true;
    state.tasks = [{id:'cover-task',title:'농장과 함께 집중하기',groupId:null,status:'waiting',focusSeconds:0}];
    state.habits = []; taskDataHydrated = true;
    state.equippedFarmTheme = 'christmas'; state.equippedPlotSkin = 'snowField';
    state.ownedCosmetics = [{type:'farm_theme',id:'christmas'},{type:'plot_skin',id:'snowField'}];
    state.farmPlots = defaultState.farmPlots.map((plot,index) => ({...plot,crop:index<6?Object.keys(CROPS)[index]:null,growth:index%4+1,plantedDate:toLocalDateString(),lastWateredDate:toLocalDateString(),lastCaredAt:Date.now(),wilted:false}));
    render(); showPage('focus');
    document.querySelector('#toggleFocusFarmBackground').setAttribute('aria-pressed','true');
    renderFocusFarmBackground();
  `);
  await evaluate('document.fonts.ready');
  fs.mkdirSync(path.join(root, 'output'), { recursive: true });
  for (const [width, height] of [[1440,900], [1920,1080], [2560,1080], [390,844], [320,700]]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    for (const fullscreen of [false, true]) {
      if (fullscreen) {
        const point = await evaluate(`(() => {const box=document.querySelector('#toggleFocusFullscreen').getBoundingClientRect();return {x:box.left+box.width/2,y:box.top+box.height/2}})()`);
        await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
        await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
        await settle('document.fullscreenElement === document.querySelector("#focusPageStage")');
      }
      await pause(100);
      const geometry = await evaluate(`(() => {
        const stage=document.querySelector('#focusPageStage');
        const background=stage.querySelector('.focus-farm-background');
        const scene=background.querySelector('.farm-scene');
        const map=scene.querySelector('.farm-scene-grid');
        const rect=element=>element.getBoundingClientRect();
        const b=rect(background),s=rect(scene),m=rect(map),frame=rect(stage),timer=rect(stage.querySelector('.focus-visual')),button=rect(document.querySelector('#focusButton'));
        const grids=map.querySelectorAll('.farm-plot');
        const sourceFields=document.querySelectorAll('#farmGrid .farm-plot');
        const field=rect(map.querySelector('.farm-grid'));
        return {
          covers:s.left<=b.left+.5&&s.top<=b.top+.5&&s.right>=b.right-.5&&s.bottom>=b.bottom-.5,
          terrainCovers:m.left<=b.left+.5&&m.top<=b.top+.5&&m.right>=b.right-.5&&m.bottom>=b.bottom-.5,
          undistorted:Math.abs(m.width/m.height-1.5)<.001,
          uniformScale:Math.abs(m.width/100-m.height/(200/3))<.01,
          fieldRatio:{left:(field.left-m.left)/m.width,top:(field.top-m.top)/m.height,width:field.width/m.width,height:field.height/m.height},
          nineFields:grids.length===9,
          theme:scene.dataset.terrain,
          purchasedFieldRetained:[...grids].every((plot,index)=>plot.style.getPropertyValue('--plot-src')===sourceFields[index].style.getPropertyValue('--plot-src'))&&[...sourceFields].every(plot=>plot.dataset.plotSkin==='snowField'),
          purchasedFieldArtworkRetained:[...grids].every((plot,index)=>plot.querySelector('.garden-soil-art')?.outerHTML===sourceFields[index].querySelector('.garden-soil-art')?.outerHTML)&&map.querySelectorAll('.garden-soil-svg image[href="./assets/garden-v5/themed-plots-atlas.png"]').length===9,
          fieldSkinAttributesRetained:[...grids].every(plot=>plot.dataset.plotSkin==='snowField'),
          inert:background.inert&&background.getAttribute('aria-hidden')==='true'&&getComputedStyle(background).pointerEvents==='none',
          passive:!background.querySelector('button,input,select,textarea,[id],.plot-hit,.plot-growth-actions,.focus-plot-button,.plot-focus-marker'),
          timerFits:timer.left>=frame.left&&timer.right<=frame.right+.5&&timer.top>=frame.top&&timer.bottom<=frame.bottom+.5,
          controlsFit:button.left>=frame.left&&button.right<=frame.right+.5&&button.top>=frame.top&&button.bottom<=frame.bottom+.5,
          noPageOverflow:document.documentElement.scrollWidth<=innerWidth,
          fullscreenFillsWidth:!document.fullscreenElement||Math.abs(b.width-innerWidth)<1,
          background:{width:b.width,height:b.height},scene:{width:s.width,height:s.height}
        };
      })()`);
      const label=`${width}x${height} ${fullscreen?'fullscreen':'normal'}`;
      for (const property of ['covers','terrainCovers','undistorted','uniformScale','nineFields','purchasedFieldRetained','purchasedFieldArtworkRetained','fieldSkinAttributesRetained','inert','passive','timerFits','controlsFit','noPageOverflow','fullscreenFillsWidth']) assert.equal(geometry[property], true, `${label} ${property}: ${JSON.stringify(geometry)}`);
      assert.equal(geometry.theme, 'christmas', `${label} preserves the actual farm theme`);
      assert.ok(Math.abs(geometry.fieldRatio.left-.14)<.001 && Math.abs(geometry.fieldRatio.width-.405)<.001, `${label} field coordinates retained`);
      console.log(`${label} cover, aligned fields, inert clone and controls PASS (${Math.round(geometry.scene.width)}x${Math.round(geometry.scene.height)} map in ${Math.round(geometry.background.width)}x${Math.round(geometry.background.height)} frame)`);
      if (process.env.FOCUS_FARM_CAPTURE==='1' && [1440,390,320].includes(width)) {
        await evaluate('scrollTo(0,0)');
        const screenshot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
        fs.writeFileSync(path.join(root,'output',`focus-farm-cover-${width}${fullscreen?'-fullscreen':''}.png`),Buffer.from(screenshot.data,'base64'));
      }
      if (fullscreen) await evaluate('document.exitFullscreen()');
    }
  }
  await evaluate("document.querySelector('#toggleFocusFarmBackground').click()");
  assert.equal(await evaluate("document.querySelector('.focus-farm-background')===null"), true, 'turning off the farm background removes its scaled clone');
  assert.deepEqual(exceptions, [], 'No runtime exceptions');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{socket?.close();chrome?.kill();server.close();});
