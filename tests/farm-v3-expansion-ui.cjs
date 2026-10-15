// Expansion regression: real Chrome against a new, isolated PostgreSQL/PGlite sandbox.
// The sandbox's seeded accounts are disposable; no live accounts or services are used.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
const {startSandbox}=require('../scripts/farm-v3-sandbox.cjs');
const root=path.resolve(__dirname,'..'),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let sandbox,chrome,ws;
(async()=>{
  sandbox=await startSandbox({port:0});
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'farmodoro-expansion-ui-'));
  chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-sandbox','--disable-crash-reporter','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
  let chromeError;chrome.on('error',error=>{chromeError=error;});
  const portFile=path.join(profile,'DevToolsActivePort');
  for(let i=0;i<200&&!fs.existsSync(portFile)&&!chromeError;i++)await pause(50);
  if(chromeError)throw chromeError;
  assert.ok(fs.existsSync(portFile),'Chrome exposes its debugging port');
  const port=fs.readFileSync(portFile,'utf8').split(/\r?\n/)[0],tabs=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws=new WebSocket(tabs.find(tab=>tab.type==='page').webSocketDebuggerUrl);await new Promise(resolve=>ws.addEventListener('open',resolve,{once:true}));
  let sequence=0;const pending=new Map(),exceptions=[],failedAssets=[];
  ws.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.method==='Runtime.exceptionThrown')exceptions.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);if(message.method==='Network.responseReceived'&&message.params.response.status>=400)failedAssets.push(message.params.response.url);if(pending.has(message.id)){pending.get(message.id)(message);pending.delete(message.id);}});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timeout=setTimeout(()=>{pending.delete(id);reject(Error('Timeout '+method));},20000);pending.set(id,message=>{clearTimeout(timeout);message.error?reject(Error(JSON.stringify(message.error))):resolve(message.result);});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,replMode:true});assert.equal(result.exceptionDetails,undefined,JSON.stringify(result.exceptionDetails));return result.result.value;};
  const settle=async predicate=>{for(let i=0;i<400;i++){if(await evaluate(predicate))return;await pause(25);}assert.fail('UI did not settle: '+predicate+'\n'+exceptions.join('\n'));};
  const idle=()=>settle("document.querySelector('#farmGameRoot').getAttribute('aria-busy')==='false'");
  const painted=()=>settle("Array.from(document.querySelectorAll('#farmGameRoot canvas')).every(canvas=>canvas.dataset.painted==='true')");
  const action=(name,extra='')=>`[data-fv-action="${name}"]${extra}`;
  const click=async selector=>{assert.equal(await evaluate(`!!document.querySelector(${JSON.stringify(selector)})&&!document.querySelector(${JSON.stringify(selector)}).disabled`),true,selector+' is enabled');await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);await idle();await painted();};
  const tab=name=>click(action('tab',`[data-tab="${name}"]`));
  const viewport=async width=>{await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await pause(80);};
  const capture=async name=>{await pause(80);fs.mkdirSync(path.join(root,'output'),{recursive:true});const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(root,'output','farm-v3-expansion-'+name+'.png'),Buffer.from(shot.data,'base64'));};
  const noOverflow=async label=>{
    const geometry=await evaluate(`({viewport:innerWidth,scroll:document.documentElement.scrollWidth,cards:Array.from(document.querySelectorAll('#farmGameRoot .fv-choice,#farmGameRoot .fv-codex-card,#farmGameRoot .fv-character-card,#farmGameRoot .fv-next')).map(node=>{const r=node.getBoundingClientRect();return{x:r.x,right:r.right,width:r.width,height:r.height};})})`);
    assert.ok(geometry.scroll<=geometry.viewport+1,label+' document overflow '+JSON.stringify(geometry));
    for(const card of geometry.cards){assert.ok(card.width>20&&card.height>10,label+' usable card '+JSON.stringify(card));assert.ok(card.x>=-1&&card.right<=geometry.viewport+1,label+' card stays in viewport '+JSON.stringify(card));}
  };
  await call('Runtime.enable');await call('Network.enable');await viewport(1440);
  await call('Page.navigate',{url:sandbox.url+'/?account=2'});
  await settle("!!window.FarmV3?.snapshot()&&document.querySelector('#farmGameRoot').getAttribute('aria-busy')==='false'");await painted();
  const initial=await evaluate('FarmV3.snapshot()'),fish=initial.catalog.filter(item=>item.kind==='fish'),characters=initial.catalog.filter(item=>item.kind==='character');
  assert.equal(initial.fishUnlockVersion,1);assert.equal(fish.length,24);assert.equal(characters.length,16);
  assert.deepEqual(initial.unlocks.filter(item=>item.kind==='fish').map(item=>item.id).sort(),['crucian','minnow']);
  assert.ok(fish.every(item=>item.fish===0),'Current fish use per-species requirements');
  // Start just below the first species threshold, then reach it through real UI actions.
  const account=sandbox.accounts[2].id;
  await sandbox.database.db.query("insert into public.farm_v3_collections(user_id,kind,item_id,total) values($1,'fish','minnow',2)",[account]);
  await evaluate('await FarmV3.load(activeAuthUser)');await tab('fish');
  const expected=entry=>entry.fishRequirements.map(req=>`${fish.find(item=>item.id===req.id).name} 낚기 ${req.id==='minnow'?Math.min(2,req.count):0} / ${req.count}회`).join(' · ');
  const chooser=await evaluate(`Array.from(document.querySelectorAll('[data-fv-action=fish_start]')).map(node=>({id:node.dataset.item,disabled:node.disabled,label:node.querySelector('small').textContent}))`);
  assert.equal(chooser.length,24);
  for(const entry of fish){const card=chooser.find(item=>item.id===entry.id);assert.ok(card,entry.id+' chooser');assert.equal(card.disabled,entry.fishRequirements.length>0);assert.equal(card.label,entry.fishRequirements.length?'🔒 '+expected(entry):entry.cost+' Coin',entry.id+' specific chooser requirement');}
  assert.match(chooser.find(item=>item.id==='carp').label,/피라미 낚기 2 \/ 3회/);
  await capture('fish-chooser-desktop');
  await tab('collection');await click(action('collection_kind','[data-kind="fish"]'));
  const collection=await evaluate(`Array.from(document.querySelectorAll('.fv-codex-card')).map(node=>({name:node.querySelector('h4').textContent,label:node.querySelector('small').textContent}))`);
  assert.equal(collection.length,24);
  for(const entry of fish)assert.equal(collection.find(item=>item.name===entry.name).label,entry.fishRequirements.length?expected(entry):entry.cost+' Coin 필요',entry.id+' codex requirement');
  await capture('fish-codex-desktop');
  await tab('fish');await click(action('fish_start','[data-item="minnow"]'));await click(action('fish_grow','[data-amount="2"]'));await click(action('fish_claim'));
  assert.equal(await evaluate("FarmV3.snapshot().collections.find(item=>item.kind==='fish'&&item.id==='minnow').count"),3);
  assert.equal(await evaluate("FarmV3.snapshot().unlocks.some(item=>item.kind==='fish'&&item.id==='carp')"),true);
  assert.equal(await evaluate("FarmV3.snapshot().unlocks.some(item=>item.kind==='fish'&&item.id==='trout')"),false,'Minnow catches do not advance the crucian branch');
  assert.equal(await evaluate("document.querySelector('[data-fv-action=fish_start][data-item=carp]').disabled"),false);
  assert.equal(await evaluate("document.querySelector('[data-fv-action=fish_start][data-item=trout]').disabled"),true);
  assert.match(await evaluate("document.querySelector('[data-fv-action=fish_start][data-item=trout] small').textContent"),/붕어 낚기 0 \/ 3회/);
  const iconSources=await evaluate(`Array.from(document.querySelectorAll('[data-fv-action=fish_start]')).map(node=>{const icon=node.querySelector('.fv-icon'),style=getComputedStyle(icon),image=icon.querySelector('image'),crop=icon.querySelector('svg svg');return{id:node.dataset.item,image:image?.getAttribute('href')||style.backgroundImage,position:crop?.getAttribute('viewBox')||style.backgroundPosition};})`);
  assert.equal(iconSources.length,24);assert.equal(new Set(iconSources.map(icon=>icon.image+' '+icon.position)).size,24,'Every fish uses its own atlas cell');
  for(const [index,entry]of fish.entries()){const icon=iconSources.find(item=>item.id===entry.id);assert.ok(icon.image.includes(index<8?'collectibles-v1.png':'fish-expansion-v1.png'),entry.id+' uses a fish atlas, never a legacy hat cell');}
  // Audit raster output independently of server unlocks, including every new pose.
  const raster=await evaluate(`await (async()=>{
    const metrics=canvas=>{const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let hash=2166136261,opaque=0;for(let i=0;i<pixels.length;i++){hash=Math.imul(hash^pixels[i],16777619);if(i%4===3&&pixels[i]>96)opaque++;}return{hash:hash>>>0,opaque,width:canvas.width,height:canvas.height,corners:[pixels[3],pixels[(canvas.width-1)*4+3],pixels[(canvas.width*(canvas.height-1))*4+3],pixels[pixels.length-1]]};};
    const result=[];
    for(const entry of FarmV3Catalog.items.filter(item=>item.kind==='character'))for(const pose of ['','fishing']){
      const canvas=await FarmV3CharacterArt.paint(entry.id,pose),output={id:entry.id,pose,...metrics(canvas)};
      if(pose){const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data,red=[];for(let y=Math.floor(canvas.height*.55);y<canvas.height;y++)for(let x=Math.floor(canvas.width*.66);x<canvas.width;x++){const p=(y*canvas.width+x)*4;if(data[p+3]>160&&data[p]>150&&data[p]>data[p+1]*1.8&&data[p]>data[p+2]*1.55&&data[p+1]<145)red.push([x,y]);}const bottom=Math.max(...red.map(point=>point[1])),band=red.filter(point=>point[1]>=bottom-5),left=Math.min(...band.map(point=>point[0])),right=Math.max(...band.map(point=>point[0])),anchorX=(left+right)/2;let anchorY=bottom;for(let y=bottom;y<canvas.height;y++)for(let x=Math.floor(anchorX)-2;x<=Math.ceil(anchorX)+2;x++)if(data[(y*canvas.width+x)*4+3]>96)anchorY=Math.max(anchorY,y);output.float={x:Number(canvas.dataset.floatX),y:Number(canvas.dataset.floatY),redPixels:red.length,anchorX,anchorY};}
      result.push(output);
    }
    return result;
  })()`);
  for(const pose of ['','fishing']){const entries=raster.filter(item=>item.pose===pose);assert.equal(entries.length,16);assert.equal(new Set(entries.map(item=>item.hash)).size,16,'All '+(pose||'normal')+' mascots are distinct');for(const image of entries){assert.deepEqual([image.width,image.height],pose?[256,192]:[128,160]);assert.ok(image.opaque>1000,image.id+' '+pose+' is painted');assert.deepEqual(image.corners,[0,0,0,0],image.id+' '+pose+' keeps transparent corners');if(pose){assert.ok(image.float.redPixels>=2,image.id+' float remains visible after atlas cleanup');assert.ok(Math.abs(image.float.x/100*image.width-image.float.anchorX)<=4,image.id+' float X tracks visible pixels '+JSON.stringify(image.float));assert.ok(Math.abs(image.float.y/100*image.height-image.float.anchorY)<=4,image.id+' float Y tracks visible pixels '+JSON.stringify(image.float));}}}
  // Atlas overlays make all artwork reviewable at its actual UI rendering scale.
  async function gallery(kind,pose=''){
    await viewport(1440);
    await evaluate(`(()=>{const qa=document.createElement('section');qa.id='expansionQA';qa.style.cssText='position:fixed;inset:0;z-index:999999;background:#edf2e8;padding:24px;display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:10px;align-content:center;overflow:auto';for(const entry of FarmV3Catalog.items.filter(item=>item.kind===${JSON.stringify(kind)})){const cell=document.createElement('article');cell.style.cssText='background:#fffdf6;border:1px solid #d4ddc7;border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:175px;padding:10px;font:13px sans-serif;color:#40523a';cell.innerHTML=${kind==='fish'?'FarmV3Art.fish(entry.id)':'FarmV3Art.character(entry.id,"",'+JSON.stringify(pose)+')'}+'<strong>'+entry.name+'</strong>';const image=cell.querySelector('canvas,.fv-icon');image.style.cssText+=';'+${JSON.stringify(kind==='fish'?'width:110px;height:110px;flex:none':pose?'width:160px;height:120px;image-rendering:pixelated':'width:96px;height:120px;image-rendering:pixelated')};qa.append(cell);}document.body.append(qa);return FarmV3Art.paintAll(qa);})()`);
    await settle("Array.from(document.querySelectorAll('#expansionQA canvas')).every(canvas=>canvas.dataset.painted==='true')");await capture(kind==='fish'?'all-24-fish':pose?'all-16-fishing':'all-16-characters');await evaluate("document.querySelector('#expansionQA').remove()");
  }
  await gallery('fish');await gallery('character');await gallery('character','fishing');
  for(const width of [1440,390,320]){
    await viewport(width);
    for(const name of ['farm','fish','wardrobe','collection']){await tab(name);if(name==='collection')await click(action('collection_kind','[data-kind="fish"]'));await noOverflow(name+' '+width);await evaluate("document.querySelector('#farmGameRoot').scrollIntoView({block:'start'})");await capture(name+'-'+width);}
  }
  // Grant only test-account character ownership so every saved representative can
  // exercise the real fishing scene and its per-pose water-contact coordinates.
  await sandbox.database.db.query("insert into public.farm_v3_unlocks(user_id,kind,item_id) select $1,'character',item_id from public.farm_v3_catalog where kind='character' on conflict do nothing",[account]);
  await evaluate('await FarmV3.load(activeAuthUser)');await viewport(1440);await tab('fish');await click(action('fish_start','[data-item="minnow"]'));
  for(const character of characters){
    await tab('wardrobe');
    if(await evaluate('FarmV3.snapshot().profile.characterId')!==character.id){await click(action('choose_character',`[data-item="${character.id}"]`));await click(action('save_character'));}
    await tab('fish');
    const contact=await evaluate(`(()=>{const fisher=document.querySelector('.fv-fisher.is-fishing'),canvas=fisher.querySelector('canvas'),ripple=fisher.querySelector('.fv-fishing-ripple'),f=getComputedStyle(fisher),r=getComputedStyle(ripple),c=getComputedStyle(canvas);return{id:canvas.dataset.fvCharacter,pose:canvas.dataset.fvCharacterPose,painted:canvas.dataset.painted,x:parseFloat(f.getPropertyValue('--fv-fishing-contact-x')),y:parseFloat(f.getPropertyValue('--fv-fishing-contact-y')),left:parseFloat(r.left)/fisher.clientWidth*100,top:parseFloat(r.top)/fisher.clientHeight*100,rippleZ:Number(r.zIndex),canvasZ:Number(c.zIndex)};})()`);
    const target=raster.find(image=>image.id===character.id&&image.pose==='fishing').float;
    assert.equal(contact.id,character.id);assert.equal(contact.pose,'fishing');assert.equal(contact.painted,'true');
    assert.ok(contact.rippleZ<contact.canvasZ,character.id+' ripple is behind the fishing rod');
    assert.ok(Math.abs(contact.x-target.x)<.001&&Math.abs(contact.y-target.y)<.001,character.id+' scene uses the painted float metadata');
    assert.ok(Math.abs(contact.left-(target.x-4))<.2,character.id+' ripple is four percentage points left of float contact '+JSON.stringify(contact));
    assert.ok(Math.abs(contact.top-target.y)<.2,character.id+' ripple uses float waterline');
  }
  for(const width of [1440,390,320]){await viewport(width);await noOverflow('expanded fishing '+width);await evaluate("document.querySelector('#farmGameRoot').scrollIntoView({block:'start'})");await capture('fishing-'+width);}
  assert.deepEqual(exceptions,[]);assert.deepEqual(failedAssets.filter(url=>/\/assets\/farm-v3\//.test(url)),[],'All expansion artwork loads');
  console.log('PASS: isolated real-browser expansion covers 24 fish, 16 distinct normal/fishing characters, two starters, specific-species progress and unlocks, correct fish atlases, visible floats with contact metadata, ripple behind rods and left by 4%, and usable 1440/390/320px layouts. Screenshots: output/farm-v3-expansion-*.png');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{ws?.close();chrome?.kill();if(sandbox)await sandbox.close();});
