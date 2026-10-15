// Focused regression for Coin actions: real Chromium, an isolated real database,
// and a deferred fetch so the in-flight render can be inspected deterministically.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
const {startSandbox}=require('../scripts/farm-v3-sandbox.cjs');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let sandbox,chrome,ws;
(async()=>{
  sandbox=await startSandbox({port:0});
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'farmodoro-render-ui-'));
  chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-sandbox','--disable-crash-reporter','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
  let chromeError;chrome.on('error',error=>{chromeError=error;});
  const portFile=path.join(profile,'DevToolsActivePort');
  for(let i=0;i<200&&!fs.existsSync(portFile)&&!chromeError;i++)await pause(50);
  if(chromeError)throw chromeError;
  const port=fs.readFileSync(portFile,'utf8').split(/\r?\n/)[0];
  const tabs=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws=new WebSocket(tabs.find(tab=>tab.type==='page').webSocketDebuggerUrl);
  await new Promise(resolve=>ws.addEventListener('open',resolve,{once:true}));
  let sequence=0;const pending=new Map(),exceptions=[];
  ws.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.method==='Runtime.exceptionThrown')exceptions.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);if(pending.has(message.id)){pending.get(message.id)(message);pending.delete(message.id);}});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timeout=setTimeout(()=>{pending.delete(id);reject(Error('Timeout '+method));},15000);pending.set(id,message=>{clearTimeout(timeout);message.error?reject(Error(JSON.stringify(message.error))):resolve(message.result);});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,replMode:true});assert.equal(result.exceptionDetails,undefined,JSON.stringify(result.exceptionDetails));return result.result.value;};
  const settle=async predicate=>{for(let i=0;i<300;i++){if(await evaluate(predicate))return;await pause(25);}assert.fail('UI did not settle: '+predicate+'\n'+exceptions.join('\n'));};
  const idle=()=>settle("document.querySelector('#farmGameRoot').getAttribute('aria-busy')==='false'");
  const painted=()=>settle("Array.from(document.querySelectorAll('#farmGameRoot canvas')).every(canvas=>canvas.dataset.painted==='true')");
  const action=(name,extra='')=>`[data-fv-action="${name}"]${extra}`;
  const click=async selector=>{assert.equal(await evaluate(`!!document.querySelector(${JSON.stringify(selector)})&&!document.querySelector(${JSON.stringify(selector)}).disabled`),true,selector+' is enabled');await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);await idle();await painted();};
  const tab=name=>click(action('tab',`[data-tab="${name}"]`));
  await call('Runtime.enable');await call('Emulation.setDeviceMetricsOverride',{width:1440,height:800,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:sandbox.url+'/?account=1'});
  await settle("!!window.FarmV3?.snapshot()&&document.querySelector('#farmGameRoot').getAttribute('aria-busy')==='false'");await painted();
  await evaluate(`(()=>{
    const originalFetch=window.fetch.bind(window);window.renderActionCalls=[];
    window.fetch=async(...args)=>{
      const options=args[1],body=options?.body&&JSON.parse(options.body);
      if(body?.name!=='perform_my_farm_v3_action')return originalFetch(...args);
      window.renderActionCalls.push(body.params);
      const gate=window.renderActionGate;
      if(gate){window.renderActionGate=null;window.renderActionHeld=body.params;await new Promise(resolve=>{window.releaseRenderAction=resolve;});}
      const response=await originalFetch(...args);
      if(gate==='ambiguous'){await response.text();throw new TypeError('Test: response lost after server commit');}
      return response;
    };
    document.documentElement.style.scrollBehavior='auto';
    window.startRenderWatch=selector=>{
      const scene=document.querySelector('#farmGameRoot .fv-main-column .fv-scene'),canvas=scene.querySelector('canvas'),ripple=scene.querySelector('.fv-fishing-ripple'),button=document.querySelector(selector);
      window.scrollTo(0,Math.max(0,scene.getBoundingClientRect().top+scrollY-130));button.focus({preventScroll:true});
      const rect=scene.getBoundingClientRect(),animations=[canvas,ripple].filter(Boolean).flatMap(node=>node.getAnimations()).map(animation=>({animation,time:animation.currentTime}));
      const watch={scene,canvas,ripple,button,rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},scroll:scrollY,animations,removed:[],blank:0,dimensionResets:0};
      watch.observer=new MutationObserver(records=>{for(const record of records){if(record.type==='attributes'&&record.target===canvas)watch.dimensionResets++;for(const node of record.removedNodes)if([scene,canvas,ripple].some(target=>target&&(target===node||node.contains?.(target))))watch.removed.push(node.nodeName);}});
      watch.observer.observe(document.querySelector('#farmGameRoot'),{subtree:true,childList:true,attributes:true,attributeFilter:['width','height']});
      const frame=()=>{if(watch.stopped)return;const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let visible=false;for(let i=3;i<pixels.length;i+=4)if(pixels[i]){visible=true;break;}if(!visible)watch.blank++;watch.frame=requestAnimationFrame(frame);};
      watch.frame=requestAnimationFrame(frame);window.renderWatch=watch;
    };
    window.readRenderWatch=()=>{
      const watch=window.renderWatch,scene=document.querySelector('#farmGameRoot .fv-main-column .fv-scene'),rect=scene.getBoundingClientRect();
      return{scene:watch.scene===scene,canvas:watch.canvas===scene.querySelector('canvas'),ripple:watch.ripple===scene.querySelector('.fv-fishing-ripple'),painted:watch.canvas.dataset.painted==='true',blank:watch.blank,removed:watch.removed,dimensionResets:watch.dimensionResets,geometry:['x','y','width','height'].every(key=>Math.abs(rect[key]-watch.rect[key])<=1),scroll:Math.abs(scrollY-watch.scroll)<=1,focus:document.activeElement===watch.button,animation:watch.animations.every(({animation,time})=>watch.scene.getAnimations({subtree:true}).includes(animation)&&animation.currentTime>=time),recovery:!!document.querySelector('.fv-recovery'),busy:document.querySelector('#farmGameRoot').getAttribute('aria-busy'),controlsDisabled:Array.from(document.querySelectorAll('.fv-scene-control-actions button')).every(button=>button.disabled)};
    };
    window.stopRenderWatch=()=>{const watch=window.renderWatch;watch.stopped=true;watch.observer.disconnect();cancelAnimationFrame(watch.frame);};
  })()`);
  const stable=async(label,{animation=true,focus=false,recovery=false}={})=>{
    const result=await evaluate('readRenderWatch()');
    for(const key of ['scene','canvas','ripple','painted','geometry','scroll'])assert.equal(result[key],true,label+' '+key+' '+JSON.stringify(result));
    assert.equal(result.blank,0,label+' never clears painted art');assert.deepEqual(result.removed,[],label+' keeps scene nodes mounted');assert.equal(result.dimensionResets,0,label+' does not reset canvas dimensions');
    assert.equal(result.recovery,recovery,label+' recovery visibility');if(animation)assert.equal(result.animation,true,label+' retains animation time');if(focus)assert.equal(result.focus,true,label+' retains focused control');return result;
  };
  const gatedGrowth=async(kind,{complete=false,ambiguous=false}={})=>{
    const name=kind==='crop'?'grow':'fish_grow',selector=action(name,'[data-amount="1"]');
    const before=await evaluate(`({coins:FarmV3.snapshot().coinBalance,run:FarmV3.snapshot().runs.find(run=>run.kind==='${kind}'),calls:renderActionCalls.length})`);
    await evaluate(`startRenderWatch(${JSON.stringify(selector)});window.renderActionGate=${JSON.stringify(ambiguous?'ambiguous':'hold')};window.renderActionHeld=null;document.querySelector(${JSON.stringify(selector)}).click()`);
    await settle('!!window.renderActionHeld');await pause(70);
    const busy=await stable(kind+' in flight');assert.equal(busy.busy,'true');assert.equal(busy.controlsDisabled,true);
    assert.equal(await evaluate('FarmV3.snapshot().coinBalance'),before.coins,'Wallet waits for committed response');
    await evaluate(`renderWatch.button.click()`);assert.equal(await evaluate('renderActionCalls.length'),before.calls+1,'Repeated in-flight clicks send once');
    await evaluate('releaseRenderAction()');await idle();await painted();
    if(ambiguous){await evaluate('stopRenderWatch()');return before;}
    await stable(kind+' settled',{animation:!complete,focus:!complete});await evaluate('stopRenderWatch()');
    if(!complete){
      await evaluate("document.activeElement.blur();const previousCoins=state.coins;state.coins++;FarmV3.render();state.coins=previousCoins;FarmV3.render()");
      assert.equal(await evaluate("document.querySelector('#farmGameRoot').contains(document.activeElement)"),false,'Later wallet refreshes do not reclaim a deliberately cleared focus');
    }
    assert.equal(await evaluate('FarmV3.snapshot().coinBalance'),before.coins-1);
    assert.equal(await evaluate(`FarmV3.snapshot().runs.find(run=>run.kind==='${kind}').progress`),before.run.progress+1);
    assert.equal(await evaluate("Number(document.querySelector('.fv-wallet strong').textContent.replace(/,/g,''))"),before.coins-1,'Visible wallet updates');
    assert.ok((await evaluate("document.querySelector('.fv-scene-control-heading').textContent")).includes(`${before.run.progress+1} / ${before.run.cost}`),'Visible progress updates');
    if(kind==='fish')assert.equal(await evaluate("Number(document.querySelector('.fv-scene-controls [role=progressbar]').getAttribute('aria-valuenow'))"),before.run.progress+1);
  };
  for(const width of [1440,390,320]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:800,deviceScaleFactor:1,mobile:false});await pause(80);
    await tab('farm');await click(action('plant','[data-item="carrot"]'));
    for(const [index,stage]of ['sprout','growing','mature'].entries()){
      await gatedGrowth('crop',{complete:index===2});
      assert.equal(await evaluate(`!!document.querySelector('.fv-plot[data-slot="0"] .garden-plant-${stage}')`),true,'Crop stage updates at '+width);
    }
    assert.equal(await evaluate("!!document.querySelector('.fv-plot.is-ripe')"),true);
    await click(action('harvest'));assert.equal(await evaluate("FarmV3.snapshot().runs.some(run=>run.kind==='crop')"),false);assert.equal(await evaluate("!!document.querySelector('[data-fv-action=plant]')"),true);
    await tab('fish');await click(action('fish_start','[data-item="crucian"]'));
    assert.equal(await evaluate("document.querySelector('.fv-fisher canvas').dataset.fvCharacterPose"),'fishing');
    for(let index=0;index<3;index++)await gatedGrowth('fish',{complete:index===2});
    assert.equal(await evaluate("!!document.querySelector('.fv-fisher.is-ready')&&!!document.querySelector('[data-fv-action=fish_claim]')"),true);
    await click(action('fish_claim'));assert.equal(await evaluate("FarmV3.snapshot().runs.some(run=>run.kind==='fish')"),false);
    assert.deepEqual(await evaluate("(()=>{const canvas=document.querySelector('.fv-fisher canvas');return[canvas.width,canvas.height,canvas.dataset.painted,canvas.dataset.fvCharacterPose||''];})()"),[128,160,'true',''],'Claim repaints the idle pose');
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true,'No overflow at '+width);
  }
  // A changed character must invalidate its painted canvas rather than retaining
  // stale pixels while the incremental renderer retains surrounding elements.
  await tab('wardrobe');const oldArt=await evaluate("document.querySelector('.fv-large-avatar canvas').toDataURL()");
  await click(action('choose_character','[data-item="aqua-slime"]'));
  assert.equal(await evaluate("document.querySelector('.fv-large-avatar canvas').dataset.fvCharacter"),'aqua-slime');
  assert.notEqual(await evaluate("document.querySelector('.fv-large-avatar canvas').toDataURL()"),oldArt,'Character preview paints the selected art');
  await click(action('save_character'));await tab('farm');
  assert.equal(await evaluate("document.querySelector('.fv-farmer canvas').dataset.fvCharacter"),'aqua-slime');
  await tab('fish');await click(action('fish_start','[data-item="minnow"]'));
  assert.deepEqual(await evaluate("(()=>{const canvas=document.querySelector('.fv-fisher canvas');return[canvas.dataset.fvCharacter,canvas.dataset.fvCharacterPose,canvas.dataset.painted,canvas.width,canvas.height];})()"),['aqua-slime','fishing','true',256,192],'Start paints the fishing pose');
  // Simulate the ambiguous case: the database commits, then the response is lost.
  const before=await gatedGrowth('fish',{ambiguous:true});
  assert.equal(await evaluate("!!document.querySelector('.fv-recovery')&&!document.querySelector('[data-fv-action=retry]').disabled"),true,'Unconfirmed result offers recovery');
  assert.equal(await evaluate('FarmV3.snapshot().coinBalance'),before.coins,'An unknown response does not invent a local balance');
  const committed=await sandbox.database.rpc('get_my_farm_v3_state');assert.equal(committed.coinBalance,before.coins-1);assert.equal(committed.runs.find(run=>run.kind==='fish').progress,1);
  const firstRequest=await evaluate('renderActionCalls.at(-1).p_request_id');await click(action('retry'));
  assert.equal(await evaluate('renderActionCalls.at(-1).p_request_id'),firstRequest,'Recovery reuses the durable request ID');
  assert.equal(await evaluate('FarmV3.snapshot().coinBalance'),before.coins-1);assert.equal(await evaluate("FarmV3.snapshot().runs.find(run=>run.kind==='fish').progress"),1,'Recovery does not grow twice');
  assert.equal(await evaluate("document.querySelector('.fv-recovery')===null&&localStorage.getItem('farmodoro-v3-intent:'+activeAuthUser.id)===null"),true);
  assert.equal(Number(await sandbox.database.scalar('select count(*) from public.farm_action_log where user_id=$1 and request_id=$2',[sandbox.accounts[1].id,firstRequest])),1,'Database records one committed action');
  assert.deepEqual(exceptions,[]);
  console.log('PASS: farm/fishing Coin growth retains scene, painted canvases, ripple, animation time, focus and scroll at 1440/390/320px; controls, wallet, crop stages, completion, harvest/claim, changed characters and poses update; ordinary pending work has no recovery banner; lost-response retry commits exactly once.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{ws?.close();chrome?.kill();if(sandbox)await sandbox.close();});
