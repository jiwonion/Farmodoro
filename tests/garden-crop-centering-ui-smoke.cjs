// Browser regression: compare the actual opaque crop pixels with the opaque
// soil pixels, rather than comparing padded sprite element rectangles.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'farmodoro-crop-centering-'));
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
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, 20000);
    pending.set(id, message => { clearTimeout(timeout); if (message.error) reject(new Error(JSON.stringify(message.error))); else resolve(message.result); });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
  for (let attempt = 0; attempt < 100; attempt += 1) { if (await evaluate('document.readyState === "complete"')) break; await pause(30); }
  await evaluate(`
    document.documentElement.className = '';
    document.body.classList.remove('auth-gated');
    document.querySelector('#authGate').hidden = true;
    document.querySelector('.auth-boot')?.remove();
    focusTimerDatabaseUnavailable = true;
    state.tasks = []; state.habits = []; taskDataHydrated = true;
    state.equippedFarmTheme = 'springMeadow';
    window.__centeringStages = ['seed','sprout','growing','flower','mature','wilted','mature','mature','mature'];
    window.__centeringCrop = Object.keys(CROPS).find(id => getCropGrowthCost(id) >= 4);
    window.__fillCenteringFarm = () => {
      state.farmPlots = Array.from({length:9}, (_,index) => {
        const stage=__centeringStages[index],crop=index<6?__centeringCrop:['eggplant','lavender','watermelon'][index-6];
        const maximum=getCropGrowthCost(crop),growth={seed:0,sprout:1,growing:2,flower:maximum-1,mature:maximum,wilted:2}[stage];
        return {id:index,crop,growth,plantedDate:toLocalDateString(),lastWateredDate:toLocalDateString(),lastCaredAt:Date.now(),wilted:stage==='wilted'};
      });
      renderFarm();
    };
    window.__paintedAtlasCache = new Map();
    window.__paintedBounds = async element => {
      let url,frame,matrix;
      const image=element.querySelector('image');
      if(image) {
        url=image.getAttribute('href');
        const box=image.ownerSVGElement.viewBox.baseVal;
        frame={x:box.x,y:box.y,width:box.width,height:box.height};
        matrix=image.getScreenCTM();
      } else {
        const style=getComputedStyle(element),columns=Number(style.getPropertyValue('--garden-art-columns')),rows=Number(style.getPropertyValue('--garden-art-rows'));
        url=style.backgroundImage.match(/url\\(["']?(.*?)["']?\\)/)[1];
        frame={columns,rows,column:Math.round(parseFloat(style.getPropertyValue('--garden-art-x'))/100*(columns-1)),row:Math.round(parseFloat(style.getPropertyValue('--garden-art-y'))/100*(rows-1))};
      }
      if(!__paintedAtlasCache.has(url)) __paintedAtlasCache.set(url,(async () => {
        const source=new Image();source.src=url;await source.decode();
        const canvas=document.createElement('canvas');canvas.width=source.naturalWidth;canvas.height=source.naturalHeight;
        const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(source,0,0);
        return {width:canvas.width,height:canvas.height,pixels:context.getImageData(0,0,canvas.width,canvas.height).data};
      })());
      const atlas=await __paintedAtlasCache.get(url);
      if(!image) {
        frame={x:frame.column*atlas.width/frame.columns,y:frame.row*atlas.height/frame.rows,width:atlas.width/frame.columns,height:atlas.height/frame.rows};
        const rect=element.getBoundingClientRect();
        matrix=new DOMMatrix([rect.width/frame.width,0,0,rect.height/frame.height,rect.left-frame.x*rect.width/frame.width,rect.top-frame.y*rect.height/frame.height]);
      }
      let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
      for(let y=Math.max(0,Math.ceil(frame.y));y<Math.min(atlas.height,frame.y+frame.height);y++) {
        for(let x=Math.max(0,Math.ceil(frame.x));x<Math.min(atlas.width,frame.x+frame.width);x++) {
          if(atlas.pixels[(y*atlas.width+x)*4+3]>128) {left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);}
        }
      }
      if(!Number.isFinite(left)) throw new Error('No painted pixels in '+url);
      const start=new DOMPoint(left,top).matrixTransform(matrix),end=new DOMPoint(right,bottom).matrixTransform(matrix);
      return {x:(start.x+end.x)/2,y:(start.y+end.y)/2,width:end.x-start.x,height:end.y-start.y};
    };
    window.__centeringGeometry = async selector => Promise.all([...document.querySelectorAll(selector+' .farm-plot')].map(async (plot,index) => {
      const crop=plot.querySelector('.garden-plant-art'),soil=plot.querySelector('.garden-soil-art');
      const paintedCrop=await __paintedBounds(crop),paintedSoil=await __paintedBounds(soil);
      return {index,stage:[...crop.classList].find(name=>/^garden-plant-(seed|sprout|growing|flower|mature|wilted)$/.test(name)),dx:Math.abs(paintedCrop.x-paintedSoil.x)/paintedSoil.width,dy:Math.abs(paintedCrop.y-paintedSoil.y)/paintedSoil.height,cropWidth:paintedCrop.width,cropHeight:paintedCrop.height,soilWidth:paintedSoil.width,soilHeight:paintedSoil.height};
    }));
    __fillCenteringFarm();showPage('farm');
  `);
  await evaluate('document.fonts.ready');
  const checkGeometry = async (selector,label) => {
    const plots = await evaluate(`__centeringGeometry(${JSON.stringify(selector)})`);
    assert.equal(plots.length,9,`${label}: nine planted beds`);
    for (const plot of plots) {
      assert.ok(plot.dx < .03 && plot.dy < .03, `${label}: painted crop ${plot.index} ${plot.stage} centres on soil: ${JSON.stringify(plot)}`);
      assert.ok(plot.cropWidth > 0 && plot.cropHeight > 0 && plot.cropWidth <= plot.soilWidth*1.05 && plot.cropHeight <= plot.soilHeight*1.05,`${label}: readable crop remains within its bed: ${JSON.stringify(plot)}`);
    }
  };
  for (const width of [1440,390,320]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
    for (const skin of [null,'snowField','mapleLeaf']) {
      for (const overview of [false,true]) {
        await evaluate(`showPage('farm');state.equippedPlotSkin=${JSON.stringify(skin)};document.querySelector('#farmPage .farm-scene').classList.toggle('is-overview',${overview});__fillCenteringFarm();`);
        await pause(50);
        await checkGeometry('#farmGrid',`${width}px ${skin||'default'} ${overview?'overview':'care'}`);
      }
      await evaluate(`openCosmeticPreview('plot_skin',${JSON.stringify(skin||'lavenderField')})`);
      await pause(50);
      await checkGeometry('#cosmeticPreviewModal .farm-scene',`${width}px ${skin||'lavenderField'} preview`);
      assert.equal(await evaluate(`[...document.querySelectorAll('#cosmeticPreviewModal .crop-info')].every(element=>getComputedStyle(element).display==='none')`),true,'preview names do not cover crop artwork');
      await evaluate(`closeCosmeticPreview();showPage('focus');document.querySelector('#toggleFocusFarmBackground').setAttribute('aria-pressed','true');renderFocusFarmBackground();`);
      await pause(50);
      await checkGeometry('#focusPage .focus-farm-background',`${width}px ${skin||'default'} focus`);
    }
    console.log(`${width}px: actual crop pixels centred at all six stages in default/snow/autumn beds, care/overview/preview/focus PASS`);
  }
  const cropIds = await evaluate('Object.keys(CROPS)');
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:1000,deviceScaleFactor:1,mobile:false});
  for (let offset=0;offset<cropIds.length;offset+=9) {
    const batch=Array.from({length:9},(_,index)=>cropIds[(offset+index)%cropIds.length]);
    await evaluate(`showPage('farm');state.equippedPlotSkin='snowField';state.farmPlots=${JSON.stringify(batch)}.map((crop,id)=>({id,crop,growth:getCropGrowthCost(crop),plantedDate:toLocalDateString(),lastWateredDate:toLocalDateString(),lastCaredAt:Date.now(),wilted:false}));renderFarm();`);
    await pause(30);
    await checkGeometry('#farmGrid',`390px mature crops ${batch.join(',')}`);
  }
  console.log(`${cropIds.length} mature crop varieties: actual painted pixels centred on mobile PASS`);
  if(process.env.GARDEN_CROP_CAPTURE==='1') {
    fs.mkdirSync(path.join(root,'output'),{recursive:true});
    for(const width of [1440,390]) {
      await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
      await evaluate(`showPage('farm');state.equippedPlotSkin=null;document.querySelector('#farmPage .farm-scene').classList.add('is-overview');__fillCenteringFarm();scrollTo(0,0);`);
      await pause(100);
      const screenshot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      fs.writeFileSync(path.join(root,'output',`garden-centred-crops-${width}.png`),Buffer.from(screenshot.data,'base64'));
      if(width===1440) {
        const clip=await evaluate(`(() => {const rect=document.querySelector('#farmGrid .farm-plot:nth-child(2)').getBoundingClientRect();return {x:rect.x-4,y:rect.y-4,width:rect.width+8,height:rect.height+8,scale:3};})()`);
        const sprout=await call('Page.captureScreenshot',{format:'png',clip,captureBeyondViewport:false});
        fs.writeFileSync(path.join(root,'output','garden-centred-sprout.png'),Buffer.from(sprout.data,'base64'));
      }
      await evaluate(`openCosmeticPreview('plot_skin','snowField')`);
      await pause(80);
      const preview=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      fs.writeFileSync(path.join(root,'output',`garden-centred-preview-${width}.png`),Buffer.from(preview.data,'base64'));
      await evaluate('closeCosmeticPreview()');
    }
  }
  assert.deepEqual(exceptions,[],'No runtime exceptions');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{socket?.close();chrome?.kill();server.close();});
