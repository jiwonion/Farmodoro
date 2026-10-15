// Real browser + real PostgreSQL/PGlite RPCs. Auth is the only application stub.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {spawn}=require('node:child_process');
const {createDatabase}=require('./helpers/farm-v3-db.cjs');
const root=path.resolve(__dirname,'..'),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const serverMode=process.env.FARM_V3_SERVER||'current';
let chrome,ws,server,database;const exceptions=[],calls=[];
(async()=>{
  database=await createDatabase({characters:['current','characters','positions'].includes(serverMode),positions:['current','positions'].includes(serverMode),speech:serverMode==='current'});const {db,user,other}=database;
  await database.rpc('get_my_farm_v3_state');
  await db.query('update public.farm_wallets set coin_balance=30 where user_id=$1',[user]);
  if(serverMode==='current')await db.query("insert into public.farm_v3_collections(user_id,kind,item_id,total) values($1,'crop','carrot',22),($1,'fish','minnow',9)",[user]);
  await database.setUser(other);await database.rpc('get_my_farm_v3_state');
  await db.query("update public.farm_v3_profiles set nickname='나무 그늘 농부',plaza_public=true,plaza_pose='sit' where user_id=$1",[other]);
  if(serverMode==='current')await db.query('update public.farm_v3_profiles set plaza_x=78,plaza_y=58 where user_id=$1',[other]);
  if(serverMode==='current')await db.query("update public.farm_v3_profiles set plaza_message='햇살 좋다… 말랑 🫠' where user_id=$1",[other]);
  await database.setUser(user);
  if(serverMode==='missing')await db.exec('drop function public.get_my_farm_v3_state()');
  const stub=`<script>window.supabase={createClient:()=>({auth:{getSession:()=>new Promise(()=>{})},rpc:async(name,params)=>fetch('/__rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,params})}).then(r=>r.json())})};</script>`;
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script\b[^>]*src="(?:https:[^"]*|\.\/pwa-register\.js[^"]*)"[^>]*>[\s\S]*?<\/script>/gi,'').replace('<script src="./supabase-config.js">',stub+'<script src="./supabase-config.js">');
  let rpcChain=Promise.resolve();
  server=http.createServer(async(request,response)=>{
    const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
    if(pathname==='/__rpc'){
      let text='';for await(const chunk of request)text+=chunk;
      const {name,params}=JSON.parse(text);calls.push(name);
      const operation=rpcChain.then(async()=>{try{return{data:await database.rpc(name,params),error:null};}catch(error){return{data:null,error:{message:error.message,code:error.code}};}});
      rpcChain=operation.catch(()=>{});response.setHeader('Content-Type','application/json');response.end(JSON.stringify(await operation));return;
    }
    if(pathname==='/'){response.setHeader('Content-Type','text/html; charset=utf-8');response.end(html);return;}
    const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep)){response.writeHead(403).end();return;}
    try{response.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':file.endsWith('.png')?'image/png':file.endsWith('.woff2')?'font/woff2':'application/octet-stream');response.end(fs.readFileSync(file));}catch(_){response.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'farmodoro-v3-ui-'));
  chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-sandbox','--disable-crash-reporter','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
  chrome.on('error',error=>{throw error;});const portFile=path.join(profile,'DevToolsActivePort');
  for(let i=0;i<200&&!fs.existsSync(portFile);i++)await pause(50);
  const port=fs.readFileSync(portFile,'utf8').split(/\r?\n/)[0];const tabs=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws=new WebSocket(tabs.find(tab=>tab.type==='page').webSocketDebuggerUrl);await new Promise(resolve=>ws.addEventListener('open',resolve,{once:true}));
  let sequence=0;const pending=new Map();
  ws.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.method==='Runtime.exceptionThrown')exceptions.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);if(pending.has(message.id)){pending.get(message.id)(message);pending.delete(message.id);}});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;const timeout=setTimeout(()=>{pending.delete(id);reject(Error('Timeout '+method));},15000);pending.set(id,message=>{clearTimeout(timeout);message.error?reject(Error(JSON.stringify(message.error))):resolve(message.result);});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,replMode:true});assert.equal(result.exceptionDetails,undefined,JSON.stringify(result.exceptionDetails));return result.result.value;};
  const settle=async predicate=>{for(let i=0;i<300;i++){if(await evaluate(predicate))return;await pause(25);}assert.fail('UI did not settle: '+predicate);};
  const click=async selector=>{assert.equal(await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`),true,selector);assert.equal(await evaluate(`document.querySelector(${JSON.stringify(selector)}).disabled`),false,selector+' enabled');await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);await settle(`document.querySelector('#farmGameRoot').getAttribute('aria-busy') === 'false'`);};
  const action=name=>`[data-fv-action="${name}"]`;
  const tab=name=>click(`[data-fv-action="tab"][data-tab="${name}"]`);
  const view=async(width,theme='white')=>{await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});await evaluate(`applyWorkspaceTheme('${theme}');`);await pause(80);const geometry=await evaluate(`({width:innerWidth,scroll:document.documentElement.scrollWidth,root:document.querySelector('#farmGameRoot').getBoundingClientRect().width,scenes:Array.from(document.querySelectorAll('#farmGameRoot .fv-scene')).map(node=>{const r=node.getBoundingClientRect();return{w:r.width,h:r.height};})})`);assert.ok(geometry.scroll<=width+1,JSON.stringify(geometry));assert.ok(geometry.root>0);for(const scene of geometry.scenes){assert.ok(Math.abs(scene.w-scene.h)<1,JSON.stringify({width,...scene}));assert.ok(scene.w<=724.5,JSON.stringify(scene));}};
  const capture=async name=>{await pause(100);const image=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(root,'output','farm-v3-'+name+'.png'),Buffer.from(image.data,'base64'));};
  const checkFishingStatus=async()=>{
    const gap=await evaluate(`(()=>{const fisher=document.querySelector('.fv-fisher.is-fishing'),canvas=fisher.querySelector('canvas'),label=fisher.querySelector('.fv-fishing-status');if(!label)return null;const box=canvas.getBoundingClientRect(),pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let top=canvas.height;for(let y=0;y<canvas.height&&top===canvas.height;y++)for(let x=0;x<canvas.width;x++)if(pixels[(y*canvas.width+x)*4+3]>96){top=y;break;}return box.top+top/canvas.height*box.height-label.getBoundingClientRect().bottom;})()`);
    assert.ok(gap!==null&&gap>=2&&gap<=12,'Fishing status stays just above the painted sprite: '+gap);
  };
  await call('Runtime.enable');await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});await settle('document.readyState === "complete"');
  await evaluate(`window.mascotDrawChecks=[];const originalMascotDraw=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(...args){if(this.canvas.width===128&&this.canvas.height===160&&args.length===9)window.mascotDrawChecks.push(Math.abs((args[7]/args[3])/(args[8]/args[4])-1));return originalMascotDraw.apply(this,args);};`);
  await evaluate(`document.documentElement.className='';document.body.classList.remove('auth-gated');document.querySelector('#authGate').hidden=true;document.querySelector('.auth-boot')?.remove();activeAuthUser={id:'${user}'};farmDataHydrated=true;farmDataUserId=activeAuthUser.id;farmWalletHydrated=true;farmWalletUserId=activeAuthUser.id;taskDataHydrated=true;state.tasks=[];state.habits=[];focusTimerDatabaseUnavailable=true;for(const page of ['farm','today','focus','tasks','habits'])pageDataRefreshTimes.set(activeAuthUser.id+':'+page,Date.now()+3600000);await FarmV3.load(activeAuthUser);await SceneryCreations.load(activeAuthUser);showPage('farm');`);
  if(serverMode==='missing'){
    assert.equal(await evaluate("document.querySelector('#farmPage').classList.contains('farm-v3-show-legacy')"),true);
    assert.equal(await evaluate("getComputedStyle(document.querySelector('#farmLegacyPanel')).display!=='none'"),true);
    await capture('legacy-missing-api');assert.deepEqual(exceptions,[]);console.log('PASS: missing farm API opens existing scenery instead of blocking entry.');return;
  }
  await settle('!!FarmV3.snapshot()');assert.equal(await evaluate(`document.querySelectorAll('#farmGameRoot .fv-plot').length`),4);
  for(const [slot,crop]of [[0,'carrot'],[1,'potato'],[2,'strawberry']]){
    await click(`[data-fv-action="slot"][data-slot="${slot}"]`);await click(`[data-fv-action="plant"][data-item="${crop}"]`);
    let growth=crop==='strawberry'?4:3;
    if(serverMode==='current'&&slot===0){
      const balance=await evaluate('state.coins');await click(action('water'));growth--;
      assert.equal(await evaluate('state.coins'),balance);assert.equal(await evaluate('FarmV3.snapshot().runs[0].progress'),1);
      const readyAt=await evaluate('FarmV3.snapshot().runs[0].waterReadyAt');assert.ok(readyAt);
      assert.equal(await evaluate("document.querySelector('[data-fv-action=water]').disabled"),true);
      await evaluate('await FarmV3.load(activeAuthUser)');assert.equal(await evaluate('FarmV3.snapshot().runs[0].waterReadyAt'),readyAt);
      await capture('farm-watered');
    }
    await click(action('grow')+'[data-amount="'+growth+'"]');await click(action('harvest'));
  }
  assert.equal(await evaluate("FarmV3.snapshot().collections.filter(item=>item.kind==='crop').length"),3);
  assert.equal(await evaluate(`FarmV3.snapshot().unlocks.some(item=>item.kind==='decor'&&item.id==='flowers')`),true);
  assert.deepEqual(await evaluate('FarmV3.snapshot().profile.decorations'),[]);
  assert.equal(await evaluate("document.querySelectorAll('#farmGameRoot .fv-decor').length"),0);
  await tab('fish');await click(action('fish_start')+'[data-item="minnow"]');
  await settle("!!document.querySelector('[data-fv-character-pose=fishing][data-painted=true]')");
  await checkFishingStatus();
  assert.equal(await evaluate("!!document.querySelector('.fv-scene-fish [data-fv-action=fish_grow]')"),true);
  await capture('fishing-active-desktop');await click(action('fish_grow')+'[data-amount="2"]');
  assert.equal(await evaluate("!!document.querySelector('.fv-scene-fish [data-fv-action=fish_claim]')"),true);
  await capture('fishing-ready-desktop');await click(action('fish_claim'));
  assert.equal(await evaluate(`FarmV3.snapshot().collections.find(item=>item.id==='minnow').count`),serverMode==='current'?10:1);
  const afterFishing=await evaluate('state.coins');assert.equal(afterFishing,serverMode==='current'?19:18);
  if(serverMode!=='current'){
    await tab('farm');await capture('compat-'+serverMode+'-farm');
    assert.equal(await evaluate('FarmV3.snapshot().plazaPositionVersion'),serverMode==='positions'?1:0);
    assert.equal(await evaluate('FarmV3.snapshot().plazaSpeechVersion'),0);
    await tab('wardrobe');assert.equal(await evaluate("document.querySelectorAll('[data-fv-action=preview_pose]').length"),0);
    if(serverMode==='parts'){assert.equal(await evaluate('FarmV3.snapshot().charactersVersion'),0);assert.equal(await evaluate("document.querySelectorAll('.fv-character-card').length"),0);}
    else{assert.equal(await evaluate("document.querySelectorAll('.fv-character-card').length"),8);if(serverMode==='characters'){await click(action('choose_character')+'[data-item="berry-slime"]');await click(action('save_character'));}}
    await tab('plaza');await settle(`!document.querySelector('#farmGameRoot').textContent.includes('광장을 불러오는 중')`);
    assert.equal(await evaluate("document.querySelector('[data-fv-action=plaza_position]').getAttribute('aria-disabled')"),serverMode==='positions'?'false':'true');
    assert.equal(await evaluate("document.querySelector('[name=speech]')===null"),true);
    assert.equal(await evaluate("document.querySelectorAll('[name=pose],[name=zone]').length"),0);
    await evaluate(`(() => {const form=document.querySelector('[data-fv-form="plaza"]');form.elements.nickname.value='이전 서버 주민';form.dispatchEvent(new Event('change',{bubbles:true}));form.requestSubmit();})()`);
    await settle('FarmV3.snapshot().profile.plazaPublic===true');await capture('compat-'+serverMode+'-plaza');
    assert.deepEqual(exceptions,[]);console.log('PASS: '+serverMode+' server opens farm/fishing and saved plaza without requiring newer features.');return;
  }
  await tab('wardrobe');
  assert.equal(await evaluate("document.querySelectorAll('.fv-character-card').length"),16);
  assert.equal(await evaluate("document.querySelectorAll('[data-fv-action=appearance]').length"),0);
  assert.equal(await evaluate("typeof window.FarmV3AvatarParts"),'undefined');
  assert.equal(await evaluate("document.querySelector('[data-fv-action=choose_character][data-item=royal-slime]').disabled"),true);
  const beforeSelection=await evaluate('FarmV3.snapshot().profile'),callsBeforeSelection=calls.length;
  await click(action('choose_character')+'[data-item="aqua-slime"]');
  assert.deepEqual(await evaluate('FarmV3.snapshot().profile'),beforeSelection,'Preview is a draft');
  assert.equal(calls.length,callsBeforeSelection);
  await click(action('save_character'));
  assert.equal(await evaluate('FarmV3.snapshot().profile.characterId'),'aqua-slime');
  await evaluate('await FarmV3.load(activeAuthUser)');
  assert.equal(await evaluate('FarmV3.snapshot().profile.characterId'),'aqua-slime');
  await click(action('choose_character')+'[data-item="berry-slime"]');
  assert.equal(await evaluate("document.querySelector('[data-fv-action=reset_character]')===null"),true);
  assert.equal(await evaluate("document.querySelector('.fv-dressing-preview p')===null"),true);
  await click(action('save_character'));
  assert.equal(await evaluate('FarmV3.snapshot().profile.characterId'),'berry-slime');
  assert.equal(await evaluate('state.coins'),afterFishing,'Character selection is free');
  const fishingArt=await evaluate(`await Promise.all(FarmV3Catalog.items.filter(i=>i.kind==='character').map(async item=>{const c=await FarmV3CharacterArt.paint(item.id,'fishing'),p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let hash=2166136261,opaque=0;for(let i=0;i<p.length;i++){hash=Math.imul(hash^p[i],16777619);if(i%4===3&&p[i]>96)opaque++;}return{hash:hash>>>0,opaque,w:c.width,h:c.height,corners:[p[3],p[(c.width-1)*4+3],p[p.length-1]]};}))`);
  assert.ok(Array.isArray(fishingArt),JSON.stringify(fishingArt));
  assert.equal(new Set(fishingArt.map(i=>i.hash)).size,16);for(const art of fishingArt){assert.deepEqual([art.w,art.h],[256,192]);assert.ok(art.opaque>1000);assert.deepEqual(art.corners,[0,0,0]);}
  assert.equal(await evaluate(`await (async()=>{const c=await FarmV3CharacterArt.paint('berry-slime','fishing'),p=c.getContext('2d').getImageData(0,0,256,192).data;let alpha=0;for(let y=120;y<145;y++)for(let x=202;x<208;x++)alpha+=p[(y*256+x)*4+3];return alpha;})()`),0,'The strawberry fishing sprite has no neighboring mushroom fragment');
  await settle(`Array.from(document.querySelectorAll('#farmGameRoot canvas[data-fv-character]')).every(canvas=>canvas.dataset.painted==='true')`);
  await capture('characters-desktop');
  await evaluate(`(() => {const qa=document.createElement('div');qa.id='characterQA';qa.style.cssText='position:fixed;inset:0;z-index:999999;background:#f1eee4;padding:24px;display:grid;grid-template-columns:repeat(8,1fr);gap:8px;align-content:center';for(const character of FarmV3Catalog.items.filter(item=>item.kind==='character')){const cell=document.createElement('div');cell.style.cssText='background:white;border-radius:10px;text-align:center;padding:10px;font:12px sans-serif';cell.innerHTML=FarmV3Art.character(character.id)+'<span>'+character.name+'</span>';cell.querySelector('canvas').style.cssText='width:100px;height:125px;margin:auto;image-rendering:pixelated';qa.append(cell);}document.body.append(qa);void FarmV3Art.paintAll(qa);})()`);
  await settle(`Array.from(document.querySelectorAll('#characterQA canvas')).every(canvas=>canvas.dataset.painted==='true')`);
  const mascotPixels=await evaluate(`Array.from(document.querySelectorAll('#characterQA canvas')).map(canvas=>{const p=canvas.getContext('2d').getImageData(0,0,128,160).data;let hash=2166136261,opaque=0;for(let i=0;i<p.length;i++){hash=Math.imul(hash^p[i],16777619);if(i%4===3&&p[i]>96)opaque++;}return{hash:hash>>>0,opaque,corners:[p[3],p[(128-1)*4+3],p[(128*159)*4+3],p[p.length-1]]};})`);
  assert.equal(new Set(mascotPixels.map(p=>p.hash)).size,16,'Each atlas cell must show a distinct mascot');
  for(const pixels of mascotPixels){assert.ok(pixels.opaque>1000,JSON.stringify(pixels));assert.deepEqual(pixels.corners,[0,0,0,0],'Sprites keep their transparent background');}
  const drawChecks=await evaluate('window.mascotDrawChecks');assert.ok(drawChecks.length>=16);assert.ok(drawChecks.every(error=>error<1e-10),'Whole characters preserve source aspect ratios');
  await capture('characters-all');await evaluate("document.querySelector('#characterQA').remove()");
  assert.equal(await evaluate("document.querySelector('[data-fv-decor=well]').checked"),false);
  await click('[data-fv-decor=well]');await tab('farm');assert.equal(await evaluate("document.querySelectorAll('#farmGameRoot .fv-decor-well').length"),1);
  await tab('wardrobe');await click('[data-fv-decor=well]');await tab('farm');assert.equal(await evaluate("document.querySelectorAll('#farmGameRoot .fv-decor').length"),0);
  await tab('plaza');await settle(`!document.querySelector('#farmGameRoot').textContent.includes('광장을 불러오는 중')`);
  assert.equal(await evaluate('FarmV3.snapshot().profile.plazaPublic'),true);
  assert.equal(await evaluate("document.querySelectorAll('[name=public],[data-fv-action=plaza_center],.fv-position-status,.fv-public-toggle').length"),0);
  assert.equal(await evaluate("document.querySelectorAll('[name=pose],[name=zone],[data-fv-action=preview_pose]').length"),0);
  assert.equal(await evaluate("document.querySelector('.fv-plaza-person:not(.is-me) .fv-speech').textContent"),'햇살 좋다… 말랑 🫠');
  const speech='오늘도 천천히, 말랑하게! 🌱';
  const callsBeforeSpeech=calls.length;
  await evaluate("window.speechInput=document.querySelector('[name=speech]');window.speechInput.focus()");
  await call('Input.insertText',{text:speech});
  assert.equal(await evaluate("document.querySelector('[name=speech]')===window.speechInput"),true,'Typing must preserve the input and IME composition');
  assert.equal(await evaluate("document.querySelector('.fv-plaza-person.is-me .fv-speech').textContent"),speech);
  assert.equal(await evaluate('FarmV3.snapshot().profile.speech'),'');assert.equal(calls.length,callsBeforeSpeech,'Typing stays local until saved');
  const originalPosition=await evaluate('FarmV3.snapshot().profile.position'),callsBeforePosition=calls.length;
  const plazaBox=await evaluate(`(() => {const r=document.querySelector('[data-fv-action=plaza_position]').getBoundingClientRect();return{x:r.x+r.width*.67,y:r.y+r.height*.72};})()`);
  await call('Input.dispatchMouseEvent',{type:'mousePressed',...plazaBox,button:'left',clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',...plazaBox,button:'left',clickCount:1});
  assert.deepEqual(await evaluate('FarmV3.snapshot().profile.position'),originalPosition,'Moving is a draft until saved');
  await evaluate("document.querySelector('[data-fv-action=plaza_position]').focus()");
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
  const previewPosition=await evaluate(`(() => {const marker=document.querySelector('.fv-plaza-person.is-me');return{x:parseFloat(marker.style.left),y:parseFloat(marker.style.top)};})()`);
  assert.ok(Math.abs(previewPosition.x-69)<.2&&Math.abs(previewPosition.y-72)<.2,JSON.stringify(previewPosition));assert.equal(calls.length,callsBeforePosition);
  await evaluate(`(() => {const form=document.querySelector('[data-fv-form="plaza"]');form.elements.nickname.value='내 작은 농부';form.dispatchEvent(new Event('change',{bubbles:true}));form.requestSubmit();})()`);
  await settle(`FarmV3.snapshot().profile.plazaPublic===true && document.querySelectorAll('.fv-plaza-person').length===2`);
  assert.equal(await evaluate(`document.querySelector('.fv-plaza-person.is-me canvas').dataset.fvCharacter`),'berry-slime');
  assert.deepEqual(await evaluate('FarmV3.snapshot().profile.position'),previewPosition);
  assert.equal(await evaluate('FarmV3.snapshot().profile.speech'),speech);
  await evaluate('await FarmV3.load(activeAuthUser)');assert.deepEqual(await evaluate('FarmV3.snapshot().profile.position'),previewPosition);
  assert.equal(await evaluate('FarmV3.snapshot().profile.speech'),speech);
  await database.setUser(other);assert.equal((await database.rpc('get_farm_v3_plaza')).items.find(p=>p.id===user).speech,speech);await database.setUser(user);
  await capture('plaza-desktop');
  // HTML-looking speech stays plain text in both the preview and a fresh snapshot.
  await evaluate(`(() => {const input=document.querySelector('[name=speech]');input.value='<img src=x onerror=alert(1)>';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  assert.equal(await evaluate("document.querySelector('.fv-plaza-person.is-me .fv-speech img')===null"),true);
  assert.equal(await evaluate("document.querySelector('.fv-plaza-person.is-me .fv-speech').textContent"),'<img src=x onerror=alert(1)>');
  await click(action('plaza_clear_speech'));assert.equal(await evaluate("document.querySelector('.fv-plaza-person.is-me .fv-speech').hidden"),true);
  await evaluate("document.querySelector('[data-fv-form=plaza]').requestSubmit()");await settle("FarmV3.snapshot().profile.speech===''");
  await evaluate('await FarmV3.load(activeAuthUser)');assert.equal(await evaluate("document.querySelector('.fv-plaza-person.is-me .fv-speech').hidden"),true);
  const longSpeech='말랑말랑'.repeat(20);
  await evaluate(`(() => {const input=document.querySelector('[name=speech]');input.value=${JSON.stringify(longSpeech)};input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  for(const width of [1440,320]){
    await view(width);
    for(const position of [{x:5,y:15},{x:95,y:95}]){
      await evaluate(`(() => {const map=document.querySelector('[data-fv-action=plaza_position]'),r=map.getBoundingClientRect();map.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:r.left+r.width*${position.x}/100,clientY:r.top+r.height*${position.y}/100}));})()`);
      const bounds=await evaluate(`(() => {const map=document.querySelector('.fv-position-map').getBoundingClientRect(),bubble=document.querySelector('.is-me .fv-speech').getBoundingClientRect();return{left:bubble.left-map.left,right:map.right-bubble.right,top:bubble.top-map.top,bottom:map.bottom-bubble.bottom};})()`);
      assert.ok(Object.values(bounds).every(n=>n>=6),JSON.stringify({width,position,bounds}));
    }
  }
  await view(1440);
  await evaluate(`(() => {const input=document.querySelector('[name=speech]');input.value=${JSON.stringify(speech)};input.dispatchEvent(new Event('input',{bubbles:true}));const map=document.querySelector('[data-fv-action=plaza_position]'),r=map.getBoundingClientRect();map.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:r.left+r.width*${previewPosition.x}/100,clientY:r.top+r.height*${previewPosition.y}/100}));document.querySelector('[data-fv-form=plaza]').requestSubmit();})()`);
  await settle(`FarmV3.snapshot().profile.speech===${JSON.stringify(speech)}`);
  assert.equal(await evaluate(`document.querySelector('#farmRankingModal')===null`),true);
  assert.equal(calls.includes('get_farm_leaderboard'),false);
  await tab('farm');
  for(const[slot,crop,amount]of [[0,'carrot',1],[1,'strawberry',3],[2,'corn',4],[3,'pumpkin',0]]){
    await click(`[data-fv-action="slot"][data-slot="${slot}"]`);await click(action('plant')+`[data-item="${crop}"]`);
    for(let step=0;step<amount;step++)await click(action('grow')+'[data-amount="1"]');
  }
  await click('[data-fv-action="slot"][data-slot="0"]');
  assert.equal(await evaluate("document.querySelectorAll('.fv-main-column>.fv-action-panel').length"),0);
  assert.equal(await evaluate("!!document.querySelector('.fv-scene-farm [data-fv-action=grow]')"),true);
  const border=await evaluate(`(()=>{const plot=document.querySelector('.fv-plot.is-selected'),r=plot.getBoundingClientRect(),s=getComputedStyle(plot,'::after'),label=plot.querySelector('.fv-plot-label').getBoundingClientRect();return{delta:parseFloat(s.left)+parseFloat(s.width)/2-(label.left+label.width/2-r.left),outline:getComputedStyle(plot).outlineWidth};})()`);
  assert.ok(Math.abs(border.delta)<.1,JSON.stringify(border));assert.equal(border.outline,'0px');
  assert.equal(await evaluate("document.querySelector('.fv-farmer canvas').dataset.fvCharacter"),'berry-slime');
  await settle(`Array.from(document.querySelectorAll('#farmGameRoot canvas[data-fv-character]')).every(canvas=>canvas.dataset.painted==='true')`);
  for(const width of [2560,1920,1440,1024,850,768])await view(width);
  await view(1440);
  await capture('farm-desktop');
  for(const width of [390,320]){
    await view(width);const sizes=await evaluate(`Array.from(document.querySelectorAll('#farmGameRoot .fv-plot')).map(node=>({w:node.getBoundingClientRect().width,h:node.getBoundingClientRect().height}))`);assert.ok(sizes.every(s=>s.w>=44&&s.h>=44),JSON.stringify(sizes));await capture('farm-'+width);
    for(const name of ['fish','plaza','wardrobe','collection']){await tab(name);if(name==='fish'&&!(await evaluate("FarmV3.snapshot().runs.some(r=>r.kind==='fish')")))await click(action('fish_start')+'[data-item="minnow"]');await view(width);if(name==='fish'){await settle("!!document.querySelector('[data-fv-character-pose=fishing][data-painted=true]')");await checkFishingStatus();}await capture(name+'-'+width);}
    await tab('farm');
  }
  await view(1440,'dark');await capture('farm-dark');await view(1440,'white');
  await evaluate(`showPage('today');renderTodayFarmPreview();`);assert.equal(await evaluate(`document.querySelectorAll('#todayFarmPlots .fv-plot').length`),4);
  assert.equal(await evaluate(`document.querySelector('#todayFarmPlots .fv-farmer canvas').dataset.fvCharacter`),'berry-slime');
  assert.equal(await evaluate(`(() => {const r=document.querySelector('#todayFarmPlots .fv-scene').getBoundingClientRect();return r.width>0&&Math.abs(r.width-r.height)<1;})()`),true);
  await capture('today-preview');
  await evaluate(`showPage('focus');document.querySelector('#toggleFocusFarmBackground').setAttribute('aria-pressed','true');renderFocusFarmBackground();`);
  assert.equal(await evaluate(`document.querySelectorAll('.focus-farm-background [data-fv-action]').length`),0);
  assert.equal(await evaluate(`document.querySelectorAll('.focus-farm-background .fv-plot').length`),4);
  assert.equal(await evaluate(`(() => {const r=document.querySelector('.fv-focus-background .fv-scene').getBoundingClientRect();return r.width>0&&Math.abs(r.width-r.height)<1;})()`),true);
  await capture('focus-preview');
  await db.query('update public.farm_wallets set coin_balance=-3 where user_id=$1',[user]);
  await evaluate(`await FarmV3.load(activeAuthUser);showPage('farm');`);
  assert.match(await evaluate(`document.querySelector('.fv-wallet').textContent`),/-3/);
  assert.equal(await evaluate(`document.querySelector('[data-fv-action="grow"]').disabled`),true);
  assert.equal(await evaluate(`document.querySelector('.fv-debt-note')!==null`),true);
  assert.equal(await evaluate("document.querySelector('[data-fv-action=water]').disabled"),false);
  await tab('plaza');await settle(`document.querySelectorAll('[data-fv-public-person="true"]').length===2`);
  assert.deepEqual(exceptions,[]);
  console.log('PASS: real RPC watering/cooldown persistence, free growth, sixteen whole fishing sprites, in-scene Coin/harvest/claim controls, centred selection/focus border, desktop/mobile, negative Coin watering, collections, characters/plaza and older-server compatibility. Screenshots: output/farm-v3-*.png');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{ws?.close();chrome?.kill();server?.close();await database?.db.close();});
