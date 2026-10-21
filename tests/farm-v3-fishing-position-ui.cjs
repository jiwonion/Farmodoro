// Render the production shell, views and art in Chromium without an auth/database dependency.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const captureOnly=process.argv.includes('--capture-only'),label=process.argv.find(arg=>arg.startsWith('--label='))?.slice(8)||'after';
let server,chrome,ws;
(async()=>{
  const shell=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
  const scripts=['farm-v3-catalog.js','farm-v3-crop-art.js','farm-v3-character-art.js','farm-v3-art.js','farm-v3-views.js'].map(file=>`<script src="./${file}"></script>`).join('');
  const fixture=`${scripts}<script>
    document.documentElement.className='';document.body.classList.remove('auth-gated');document.querySelector('#authGate').hidden=true;document.querySelector('.auth-boot')?.remove();
    for(const page of document.querySelectorAll('.page-view'))page.classList.toggle('active',page.id==='farmPage');
    document.body.classList.add('farm-v3-ready');
    window.renderFishing=async(id='sprout-slime',active=false)=>{
      const game={catalog:FarmV3Catalog.items,unlocks:FarmV3Catalog.items,collections:[],profile:{characterId:id,nickname:'낚시 위치 확인',decorations:[]},runs:active?[{id:'fish-position',kind:'fish',itemId:'minnow',progress:0,cost:2}]:[]};
      const root=document.querySelector('#farmGameRoot');root.innerHTML=FarmV3Views.render({game,tab:'fish',coins:30});await FarmV3Art.paintAll(root);
    };
    renderFishing().then(()=>document.body.dataset.ready='true');
  </script>`;
  const page=shell.replace('</body>',fixture+'</body>');
  server=http.createServer((request,response)=>{
    const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
    if(pathname==='/'){response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(page);return;}
    const file=path.resolve(root,'.'+pathname),ext=path.extname(file);
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!['.js','.css','.png','.woff2','.ico','.json','.svg','.gif','.webmanifest'].includes(ext)){response.writeHead(404).end();return;}
    response.writeHead(200,{'Content-Type':({'.js':'text/javascript','.css':'text/css','.png':'image/png','.woff2':'font/woff2','.svg':'image/svg+xml'})[ext]||'application/octet-stream'}).end(fs.readFileSync(file));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'farmodoro-fishing-position-ui-'));
  chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-sandbox','--disable-crash-reporter','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
  let chromeError;chrome.on('error',error=>{chromeError=error;});
  const portFile=path.join(profile,'DevToolsActivePort');
  for(let i=0;i<200&&!fs.existsSync(portFile)&&!chromeError;i++)await pause(50);
  if(chromeError)throw chromeError;
  const port=fs.readFileSync(portFile,'utf8').split(/\r?\n/)[0],tabs=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws=new WebSocket(tabs.find(tab=>tab.type==='page').webSocketDebuggerUrl);await new Promise(resolve=>ws.addEventListener('open',resolve,{once:true}));
  let sequence=0;const pending=new Map(),exceptions=[];
  ws.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.method==='Runtime.exceptionThrown')exceptions.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);if(pending.has(message.id)){pending.get(message.id)(message);pending.delete(message.id);}});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timeout=setTimeout(()=>{pending.delete(id);reject(Error('Timeout '+method));},15000);pending.set(id,message=>{clearTimeout(timeout);message.error?reject(Error(JSON.stringify(message.error))):resolve(message.result);});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert.equal(result.exceptionDetails,undefined,JSON.stringify(result.exceptionDetails));return result.result.value;};
  const capture=async name=>{await evaluate("document.querySelector('.fv-scene-fish').scrollIntoView({block:'center'})");await pause(60);const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.mkdirSync(path.join(root,'output'),{recursive:true});fs.writeFileSync(path.join(root,'output',`farm-v3-fishing-position-${label}-${name}.png`),Buffer.from(shot.data,'base64'));};
  await call('Runtime.enable');await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});
  for(let i=0;i<300&&!(await evaluate("document.body.dataset.ready==='true'"));i++)await pause(25);
  assert.equal(await evaluate("document.body.dataset.ready"),'true','Fishing fixture renders');
  const characters=await evaluate("FarmV3Catalog.items.filter(item=>item.kind==='character').map(item=>item.id)"),measurements=[];
  for(const width of [1440,850,600,535,390,375,320]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<=600});
    await pause(30);
    for(const id of characters){
      await evaluate(`renderFishing(${JSON.stringify(id)})`);
      const geometry=await evaluate(`(()=>{const scene=document.querySelector('.fv-scene-fish').getBoundingClientRect(),canvas=document.querySelector('.fv-fisher canvas'),box=canvas.getBoundingClientRect(),pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let bottom=0;for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(pixels[(y*canvas.width+x)*4+3]>96)bottom=Math.max(bottom,y+1);return{footX:(box.left+box.width/2-scene.left)/scene.width,footY:(box.top+bottom/canvas.height*box.height-scene.top)/scene.height,scale:box.width/scene.width,painted:canvas.dataset.painted,pose:canvas.dataset.fvCharacterPose||'',overflow:document.documentElement.scrollWidth>innerWidth+1};})()`);
      measurements.push({width,id,...geometry});
      if(!captureOnly){
        // The pier decking occupies roughly x=10..49%, y=49..60% of the atlas.
        assert.ok(geometry.footX>.28&&geometry.footX<.34,id+' feet stay inside the pier at '+width);
        assert.ok(geometry.footY>.55&&geometry.footY<.59,id+' feet stay on the decking at '+width+' '+JSON.stringify(geometry));
        const desktop=measurements.find(item=>item.width===1440&&item.id===id);
        assert.ok(Math.abs(geometry.scale-desktop.scale)<.001,id+' keeps the desktop scene scale at '+width);
        assert.equal(geometry.painted,'true');assert.equal(geometry.pose,'');assert.equal(geometry.overflow,false,'No overflow at '+width);
      }
      if(id==='sprout-slime'&&[1440,390,320].includes(width))await capture('idle-'+width);
    }
    // Starting and claiming a catch must return to the same idle anchor.
    await evaluate("renderFishing('sprout-slime',true)");
    const active=await evaluate(`(()=>{const scene=document.querySelector('.fv-scene-fish').getBoundingClientRect(),fisher=document.querySelector('.fv-fisher'),box=fisher.getBoundingClientRect(),canvas=fisher.querySelector('canvas'),ripple=fisher.querySelector('.fv-fishing-ripple'),css=getComputedStyle(fisher),r=getComputedStyle(ripple);return{left:(box.left-scene.left)/scene.width,top:(box.top-scene.top)/scene.height,width:box.width/scene.width,pose:canvas.dataset.fvCharacterPose,painted:canvas.dataset.painted,contactX:parseFloat(css.getPropertyValue('--fv-fishing-contact-x')),contactY:parseFloat(css.getPropertyValue('--fv-fishing-contact-y')),rippleLeft:parseFloat(r.left)/box.width*100,rippleTop:parseFloat(r.top)/box.height*100};})()`);
    assert.ok(Math.abs(active.left-.34)<.001&&Math.abs(active.top-.36)<.001&&Math.abs(active.width-.28)<.001,'Active anchoring is preserved at '+width);
    assert.equal(active.pose,'fishing');assert.equal(active.painted,'true');
    assert.ok(Math.abs(active.rippleLeft-(active.contactX-4))<.1&&Math.abs(active.rippleTop-active.contactY)<.1,'Ripple follows the float at '+width);
    if([1440,390,320].includes(width))await capture('active-'+width);
    await evaluate("renderFishing('sprout-slime')");
  }
  assert.deepEqual(exceptions,[]);
  console.log(JSON.stringify(measurements.filter(item=>item.id==='sprout-slime')));
  console.log(captureOnly?'Captured idle/active baseline screenshots and scene geometry.':'PASS: all 16 idle mascots stay on the pier across 1440/850/600/535/390/375/320px; active pose, anchoring and float ripple remain correct. Screenshots: output/farm-v3-fishing-position-*.png');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{ws?.close();chrome?.kill();if(server)await new Promise(resolve=>server.close(resolve));});
