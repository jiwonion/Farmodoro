// Real Chrome app checks with observable local RPC fixtures; no external account access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'farmodoro-seeds-ui-'));
const chromePath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const stub = `<script>
  window.__seedRpcCalls = [];
  window.supabase = { createClient: () => ({
    auth: { getSession: () => new Promise(() => {}) },
    rpc: async (name, params) => {
      window.__seedRpcCalls.push({ name, params });
      return window.__seedRpcHandler ? window.__seedRpcHandler(name, params) : { data: null, error: null };
    }
  }) };
</script>`;
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  .replace(/<script\b[^>]*src="(?:https:[^"]*|\.\/pwa-register\.js[^"]*)"[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace('<script src="./supabase-config.js">', stub + '<script src="./supabase-config.js">');
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (pathname === '/') { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html); return; }
  const file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  try {
    response.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream');
    response.end(fs.readFileSync(file));
  } catch { response.writeHead(404).end(); }
});
let chrome; let socket;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-sandbox', '--disable-crash-reporter', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 200 && !fs.existsSync(portFile); i++) await pause(50);
  const port = fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0];
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let id = 0; const pending = new Map(); const exceptions = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const next = ++id;
    const timeout = setTimeout(() => { pending.delete(next); reject(new Error(`Timeout: ${method}`)); }, 10000);
    pending.set(next, message => { clearTimeout(timeout); if (message.error) reject(new Error(JSON.stringify(message.error))); else resolve(message.result); });
    socket.send(JSON.stringify({ id: next, method, params }));
  });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const settle = async predicate => {
    for (let i = 0; i < 100; i++) { if (await evaluate(predicate)) return; await pause(25); }
    assert.fail('UI did not settle: ' + predicate);
  };
  const click = async selector => {
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',inline:'center'});`);
    const point = await evaluate(`(() => {const rect=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:rect.left+rect.width/2,y:rect.top+rect.height/2};})()`);
    await call('Input.dispatchMouseEvent', {type:'mousePressed',...point,button:'left',clickCount:1});
    await call('Input.dispatchMouseEvent', {type:'mouseReleased',...point,button:'left',clickCount:1});
  };
  await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride', {width:390,height:1000,deviceScaleFactor:1,mobile:true});
  await call('Page.navigate', {url:`http://127.0.0.1:${server.address().port}/`});
  await settle('document.readyState === "complete"');
  await evaluate(`(async()=>{
    document.documentElement.className='';document.body.classList.remove('auth-gated');
    document.querySelector('#authGate').hidden=true;document.querySelector('.auth-boot')?.remove();
    activeAuthUser={id:'seed-ui-owner'};farmDataUserId=activeAuthUser.id;farmDataHydrated=true;
    pageDataRefreshTimes.set(activeAuthUser.id+':farm',Date.now()+60000);
    focusTimerDatabaseUnavailable=true;
    state.coins=30;state.farmMoney=500;state.seedInventory={...defaultState.seedInventory,carrot:2};
    state.farmPlots=defaultState.farmPlots.map(plot=>({...plot}));
    state.ownedCosmetics=[{type:'farm_theme',id:'springMeadow'},{type:'farm_theme',id:'cherryBlossom'}];
    state.equippedFarmTheme='springMeadow';state.equippedPlotSkin=null;
    state.harvestInventory={...defaultState.harvestInventory,carrot:4,wheat:2};
    window.__seedServer={coins:30,seeds:{carrot:2},plots:structuredClone(state.farmPlots),requests:{}};
    window.__seedMail=[{id:'seed-demo-mail',senderName:'작은 농장',senderUserId:'friendly-user',mailType:'gift',
      sentAt:new Date().toISOString(),items:[{id:'seed-mail-item',category:'seed',itemId:'carrot',quantity:2}]}];
    window.__seedRpcHandler=async(name,params)=>{
      if(name==='get_farm_leaderboard'||name==='get_my_farm_mail_contacts')return {data:[],error:null};
      if(name==='get_my_unclaimed_farm_mail_count')return {data:1,error:null};
      if(name==='get_my_farm_state_v6')return {data:{farm:{farmName:'씨앗이 자라는 작은 정원',equippedFarmTheme:'springMeadow'},
        ownedCosmetics:structuredClone(state.ownedCosmetics),plots:structuredClone(__seedServer.plots),
        inventory:[...Object.entries(__seedServer.seeds).map(([itemId,quantity])=>({category:'seed',itemId,quantity})),
          {category:'harvest',itemId:'carrot',quantity:4},{category:'harvest',itemId:'wheat',quantity:2}],inbox:structuredClone(__seedMail)},error:null};
      if(name==='buy_and_plant_farm_seed'){
        const previous=__seedServer.requests[params.p_request_id];if(previous)return {data:structuredClone(previous),error:null};
        const plot=__seedServer.plots.find(plot=>plot.id===params.p_plot_index);
        if(plot.crop)return {data:null,error:{message:'FARM_PLOT_OCCUPIED'}};
        const owned=(__seedServer.seeds[params.p_crop_id]||0)>0;
        if(owned)__seedServer.seeds[params.p_crop_id]-=1;else __seedServer.coins-=CROPS[params.p_crop_id].seedPrice;
        Object.assign(plot,{crop:params.p_crop_id,growth:0,plantedDate:toLocalDateString(),lastCaredAt:new Date().toISOString(),focusCropInstanceId:crypto.randomUUID()});
        const result={plots:[structuredClone(plot)],inventory:[{category:'seed',itemId:params.p_crop_id,quantity:__seedServer.seeds[params.p_crop_id]||0}],wallet:{coinBalance:__seedServer.coins},event:{usedOwnedSeed:owned}};
        __seedServer.requests[params.p_request_id]=structuredClone(result);return {data:result,error:null};
      }
      return {data:null,error:null};
    };
    state.farmInbox=mapFarmInboxFromDatabase(__seedMail);farmMailServerUnreadCount=1;
    renderFarm();showPage('farm');
  })()`);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('[data-open-storage="harvest"]')).display`),'none','legacy harvest building has no visible route');
  assert.equal(await evaluate(`document.querySelector('#gardenMailUnreadCount').hidden`),false);
  assert.equal(await evaluate(`document.querySelector('#gardenMailUnreadCount').textContent`),'1');
  assert.equal(await evaluate(`document.querySelectorAll('#farmThemeChoices .garden-theme-thumb').length`),19,'all eighteen themes and the default are browsable');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('#farmThemeChoices .garden-theme-thumb')).backgroundImage.includes('terrain-atlas.png')`),true,'theme thumbnails use the new terrain artwork');

  await click('#farmGrid [data-plant-plot="0"]');
  await settle(`!document.querySelector('#gardenSeedModal').classList.contains('hidden')`);
  assert.equal(await evaluate(`document.activeElement.id`),'gardenSeedSearch');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('#gardenSeedSearch').closest('.garden-seed-search,.garden-seed-tools')).display`),'flex','search and wallet share a styled row');
  assert.equal(await evaluate(`document.querySelectorAll('[data-garden-plant]').length`),await evaluate(`Object.keys(CROPS).length`));
  await evaluate(`document.querySelector('#gardenSeedSearch').value='딸기';document.querySelector('#gardenSeedSearch').dispatchEvent(new Event('input',{bubbles:true}));`);
  assert.equal(await evaluate(`!!document.querySelector('[data-garden-plant="strawberry"]')`),true);
  assert.equal(await evaluate(`[...document.querySelectorAll('.garden-seed-card strong')].every(item=>item.textContent.includes('딸기'))`),true);
  const expectedCost=await evaluate(`CROPS.strawberry.seedPrice`);
  await click('[data-garden-plant="strawberry"]');
  await settle(`state.farmPlots.find(plot=>plot.id===0).crop==='strawberry'&&document.querySelector('#gardenSeedModal').classList.contains('hidden')`);
  assert.equal(await evaluate(`state.coins`),30-expectedCost);
  assert.equal(await evaluate(`__seedRpcCalls.filter(call=>call.name==='buy_and_plant_farm_seed').length`),1);
  assert.equal(await evaluate(`state.seedInventory.strawberry`),0);
  assert.equal(await evaluate(`state.farmPlots[0].growth`),0,'a confirmed planting starts at the first care stage');
  assert.equal(await evaluate(`state.farmPlots[0].focusCropInstanceId`),undefined,'planting ignores retired focus metadata from an older server');

  await click('#farmGrid [data-plant-plot="1"]');
  await settle(`!document.querySelector('#gardenSeedModal').classList.contains('hidden')`);
  assert.match(await evaluate(`document.querySelector('[data-garden-plant="carrot"]').textContent`),/보유 씨앗으로 심기/);
  await click('[data-garden-plant="carrot"]');
  await settle(`state.farmPlots.find(plot=>plot.id===1).crop==='carrot'&&document.querySelector('#gardenSeedModal').classList.contains('hidden')`);
  assert.equal(await evaluate(`state.coins`),30-expectedCost,'owned seed planting costs no Coin');
  assert.equal(await evaluate(`state.seedInventory.carrot`),1);

  await click('#openFarmShop');
  await settle(`!document.querySelector('#farmKitchenModal').classList.contains('hidden')`);
  await evaluate(`document.querySelector('#kitchenPantry').open=true;`);
  assert.match(await evaluate(`document.querySelector('#kitchenHarvestIngredients').textContent`),/당근/);
  assert.equal(await evaluate(`!document.querySelector('#harvestStorageModal')`),true,'harvests are visible in the kitchen without a separate popup');
  await evaluate(`FarmKitchen.close();`);
  await evaluate(`document.querySelector('[data-open-storage="harvest"]').click();`);
  await settle(`!document.querySelector('#farmKitchenModal').classList.contains('hidden')`);
  assert.equal(await evaluate(`!document.querySelector('#harvestStorageModal')`),true,'the harvest facility routes to the kitchen without the retired popup');
  await evaluate(`FarmKitchen.close();`);
  await click('#openGardenMail');
  await settle(`!document.querySelector('#farmMailModal').classList.contains('hidden')`);
  assert.equal(await evaluate(`document.querySelector('#farmMailInboxList').textContent.includes('당근')`),true);
  await evaluate(`document.querySelector('#farmMailModal').classList.add('hidden');`);
  assert.equal(await evaluate(`document.querySelector('#gardenEditorPanel,#gardenDecorationLayer,#openGardenEditor') === null && window.FarmGarden === undefined`),true,'the removed decoration feature leaves no editor or scene layer');

  // Theme discovery and purchase are independent of the three daily offers.
  assert.equal(await evaluate(`['volcano','valentine','christmas','whiteDay','peperoDay','galaxyNight','auroraNight','lavenderField','rainyGarden','desertOasis','moonGarden'].every(id=>document.querySelector('#farmThemeChoices [data-preview-farm-theme="'+id+'"]'))`),true,'old and new landscapes remain discoverable without ownership');
  const themeArt = await evaluate(`['',...FARM_THEMES.map(({id})=>id)].map(id=>{const art=FarmGardenArt.theme(id);return {id,url:art.url,index:art.index,filter:art.filter};})`);
  assert.equal(new Set(themeArt.map(art=>art.url+':'+art.index)).size,19,'each theme has its own painted scene');
  assert.equal(themeArt.every(art=>art.filter==='none'),true,'theme variation uses artwork instead of tinting another theme');
  assert.equal(await evaluate(`(async()=>{for(const url of [...new Set(['',...FARM_THEMES.map(({id})=>id)].map(id=>FarmGardenArt.theme(id).url))]){const image=new Image();image.src=url;await image.decode();if(!image.naturalWidth)return false;}return true;})()`),true,'every scene atlas loads');
  const plotsBeforeTheme=await evaluate(`JSON.stringify(state.farmPlots)`);
  await evaluate(`document.querySelector('#farmThemeChoices [data-preview-farm-theme="auroraNight"]').click();`);
  assert.equal(await evaluate(`document.querySelector('#cosmeticPreviewTitle').textContent`),'오로라');
  assert.equal(await evaluate(`document.querySelector('.farm-theme-preview-actions [data-purchase-cosmetic="farm_theme:auroraNight"]').disabled`),true,'theme purchase respects the current Farm Money balance');
  await evaluate(`closeCosmeticPreview();state.farmMoney=5000;renderFarm();
    window.__themePreviousHandler=__seedRpcHandler;window.__themeMoney=5000;
    window.__seedRpcHandler=async(name,params)=>{
      if(name==='purchase_farm_cosmetic'){__themeMoney-=2000;return {data:{farmMoneyBalance:__themeMoney},error:null};}
      return __themePreviousHandler(name,params);
    };
    document.querySelector('#farmThemeChoices [data-preview-farm-theme="auroraNight"]').click();`);
  await click('.farm-theme-preview-actions [data-purchase-cosmetic="farm_theme:auroraNight"]');
  await settle(`state.equippedFarmTheme==='auroraNight'&&document.querySelector('#cosmeticPreviewModal').classList.contains('hidden')`);
  assert.equal(await evaluate(`state.farmMoney`),3000,'purchase uses the server wallet balance');
  assert.equal(await evaluate(`__seedRpcCalls.filter(call=>call.name==='purchase_farm_cosmetic'&&call.params.p_cosmetic_id==='auroraNight').length`),1);
  assert.equal(await evaluate(`document.querySelector('#farmActiveThemeLabel').textContent`),'오로라');
  assert.equal(await evaluate(`JSON.stringify(state.farmPlots)`),plotsBeforeTheme,'switching landscapes preserves planted crop state');
  assert.equal(await evaluate(`!!document.querySelector('#farmThemeChoices [data-equip-cosmetic="farm_theme:auroraNight"]')`),true,'a bought theme becomes permanently selectable');

  // Buy every field through the visible gallery and preview, using observed
  // server responses. A field purchase must never change a planted crop.
  const fields = await evaluate(`PLOT_SKINS.map(({id,name,price})=>({id,name,price}))`);
  assert.equal(fields.length,12);
  assert.equal(fields.every(field=>field.price===800),true,'the existing field prices remain 800 Farm Money');
  const coinsBeforeFields = await evaluate(`state.coins`);
  for (const width of [1440,390]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<=700});
    await evaluate(`state.ownedCosmetics=state.ownedCosmetics.filter(entry=>entry.type!=='plot_skin');state.equippedPlotSkin=null;
      state.farmMoney=0;window.__fieldMoney=12000;window.__fieldOwned=[];window.__fieldFailure=false;
      window.__seedRpcHandler=async(name,params)=>{
        if(name==='purchase_farm_cosmetic'&&params.p_cosmetic_type==='plot_skin'){
          const field=PLOT_SKINS.find(entry=>entry.id===params.p_cosmetic_id);
          if(!field||params.p_price!==field.price||window.__fieldFailure)return {data:null,error:{message:'Field purchase could not be completed'}};
          if(!__fieldOwned.includes(field.id)){__fieldMoney-=field.price;__fieldOwned.push(field.id);}
          return {data:{farmMoneyBalance:__fieldMoney},error:null};
        }
        if(name==='equip_farm_cosmetic')return {data:{},error:null};
        return __themePreviousHandler(name,params);
      };renderFarm();`);
    assert.equal(await evaluate(`document.querySelectorAll('#farmPlotSkinChoices .farm-plot-skin-choice').length`),13,`${width}px: all twelve fields and the default are visible without daily offers`);
    await evaluate(`selectFarmCollectionTab('fields')`);await click(`#farmPlotSkinChoices [data-preview-farm-plot="${fields[0].id}"]`);
    assert.equal(await evaluate(`document.querySelector('.farm-theme-preview-actions [data-purchase-cosmetic="plot_skin:${fields[0].id}"]').disabled`),true,`${width}px: insufficient Farm Money disables field purchase`);
    await evaluate(`closeCosmeticPreview();state.farmMoney=12000;renderFarm();`);
    if(width===1440){
      await evaluate(`window.__fieldFailure=true;`);
      await evaluate(`selectFarmCollectionTab('fields')`);await click(`#farmPlotSkinChoices [data-preview-farm-plot="${fields[0].id}"]`);
      await click(`.farm-theme-preview-actions [data-purchase-cosmetic="plot_skin:${fields[0].id}"]`);
      await settle(`!document.querySelector('.farm-theme-preview-actions [data-purchase-cosmetic="plot_skin:${fields[0].id}"]').disabled`);
      assert.equal(await evaluate(`state.farmMoney===12000&&state.equippedPlotSkin===null&&!state.ownedCosmetics.some(entry=>entry.type==='plot_skin')`),true,'failed field purchase grants no ownership, equip or wallet change');
      await evaluate(`window.__fieldFailure=false;closeCosmeticPreview();`);
    }
    const fieldCallsBefore = await evaluate(`__seedRpcCalls.filter(call=>call.name==='purchase_farm_cosmetic'&&call.params.p_cosmetic_type==='plot_skin').length`);
    const cropStateBefore = await evaluate(`JSON.stringify(state.farmPlots)`);
    for (let index=0;index<fields.length;index++) {
      const field=fields[index];
      await evaluate(`selectFarmCollectionTab('fields')`);await click(`#farmPlotSkinChoices [data-preview-farm-plot="${field.id}"]`);
      assert.equal(await evaluate(`document.querySelector('#cosmeticPreviewTitle').textContent`),field.name);
      assert.equal(await evaluate(`state.equippedPlotSkin`),index?fields[index-1].id:null,`${width}px ${field.id}: preview does not equip the field`);
      assert.equal(await evaluate(`document.querySelectorAll('#cosmeticPreviewModal .farm-plot').length===9&&[...document.querySelectorAll('#cosmeticPreviewModal .farm-plot')].every(plot=>plot.dataset.plotSkin===${JSON.stringify(field.id)}&&plot.querySelector('.garden-soil-art'))`),true,`${width}px ${field.id}: the preview shows all nine themed beds`);
      await click(`.farm-theme-preview-actions [data-purchase-cosmetic="plot_skin:${field.id}"]`);
      await settle(`state.equippedPlotSkin===${JSON.stringify(field.id)}&&document.querySelector('#cosmeticPreviewModal').classList.contains('hidden')`);
      assert.equal(await evaluate(`state.farmMoney`),12000-(index+1)*field.price,`${width}px ${field.id}: the server wallet balance is applied`);
      assert.equal(await evaluate(`!!document.querySelector('#farmPlotSkinChoices [data-equip-cosmetic="plot_skin:${field.id}"]')&&[...document.querySelectorAll('#farmGrid .farm-plot')].every(plot=>plot.dataset.plotSkin===${JSON.stringify(field.id)}&&plot.querySelector('.garden-soil-art'))`),true,`${width}px ${field.id}: purchased field is permanently selectable and paints actual beds`);
      assert.equal(await evaluate(`JSON.stringify(state.farmPlots)`),cropStateBefore,`${width}px ${field.id}: purchase preserves crop growth and instance IDs`);
      assert.equal(await evaluate(`document.documentElement.scrollWidth>innerWidth`),false,`${width}px ${field.id}: no page overflow`);
    }
    assert.equal(await evaluate(`__seedRpcCalls.filter(call=>call.name==='purchase_farm_cosmetic'&&call.params.p_cosmetic_type==='plot_skin').length`)-fieldCallsBefore,12,`${width}px: each field uses one actual purchase RPC`);
    const balanceBeforeEquip=await evaluate(`state.farmMoney`);
    await click('#farmPlotSkinChoices [data-equip-cosmetic="plot_skin:snowField"]');
    await settle(`state.equippedPlotSkin==='snowField'`);
    await click('#farmPlotSkinChoices [data-equip-cosmetic="plot_skin:"]');
    await settle(`state.equippedPlotSkin===null`);
    assert.equal(await evaluate(`state.farmMoney`),balanceBeforeEquip,`${width}px: switching owned fields and returning to default costs nothing`);
    assert.equal(await evaluate(`state.coins`),coinsBeforeFields,`${width}px: Farm Money field purchases spend no Coin`);
    console.log(`${width}px: all twelve fields purchased from the gallery, permanently equipped and reset; crops and Coin unchanged`);
  }

  for(const width of [1440,700,390,320]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<=700});
    for(const theme of ['white','dark']){
      await evaluate(`applyWorkspaceTheme('${theme}');renderFarm();`);
      const fieldGallery=await evaluate(`(()=>{const gallery=document.querySelector('#farmPlotSkinChoices'),field=gallery.querySelector('.farm-plot-skin-choice[aria-pressed="false"]'),reference=document.querySelector('#farmThemeChoices .farm-theme-choice[aria-pressed="false"]'),style=getComputedStyle(field);return {count:gallery.children.length,overflow:document.documentElement.scrollWidth>innerWidth||gallery.scrollWidth>gallery.clientWidth+1,background:style.backgroundColor,referenceBackground:getComputedStyle(reference).backgroundColor,shadow:style.boxShadow,radius:parseFloat(style.borderRadius),border:parseFloat(style.borderTopWidth)};})()`);
      assert.equal(fieldGallery.count,13,`${width}px ${theme}: field catalog remains complete`);
      assert.equal(fieldGallery.overflow,false,`${width}px ${theme}: farm and field catalog have no horizontal overflow`);
      assert.equal(fieldGallery.background,fieldGallery.referenceBackground,`${width}px ${theme}: fields use the same app card surface as themes`);
      assert.equal(fieldGallery.shadow,'none',`${width}px ${theme}: field cards have no legacy pixel shadow`);
      assert.ok(fieldGallery.radius>=8&&fieldGallery.border===1,`${width}px ${theme}: field cards use the app's rounded thin border`);
    }
    await evaluate(`FarmSeeds.open(2);`);
    for(const theme of ['white','dark']){
      await evaluate(`applyWorkspaceTheme('${theme}');FarmSeeds.render();`);await pause(30);
      const geometry=await evaluate(`(()=>{const panel=document.querySelector('.garden-seed-panel'),choices=document.querySelector('#gardenSeedChoices'),bounds=panel.getBoundingClientRect();return {left:bounds.left,right:bounds.right,top:bounds.top,bottom:bounds.bottom,overflow:choices.scrollWidth>choices.clientWidth+1};})()`);
      assert.ok(geometry.left>=0&&geometry.right<=width+1,`${width}px ${theme}: seed panel fits`);
      assert.ok(geometry.top>=0&&geometry.bottom<=1001,`${width}px ${theme}: seed panel height fits ${JSON.stringify(geometry)}`);
      assert.equal(geometry.overflow,false,`${width}px ${theme}: no horizontal seed list overflow`);
    }
    await evaluate(`FarmSeeds.close();`);
    for(const theme of ['white','dark'])for(const [type,id] of [['farm_theme','peperoDay'],['plot_skin','snowField']]){
      await evaluate(`applyWorkspaceTheme('${theme}');openCosmeticPreview('${type}','${id}');`);
      const previewGeometry=await evaluate(`(()=>{const panel=document.querySelector('#cosmeticPreviewModal .cosmetic-preview-modal-panel'),actions=panel.querySelector('.farm-theme-preview-actions'),button=actions.querySelector('button'),bounds=panel.getBoundingClientRect(),footer=actions.getBoundingClientRect(),cta=button.getBoundingClientRect();return {panel:{left:bounds.left,right:bounds.right,top:bounds.top,bottom:bounds.bottom},footer:{left:footer.left,right:footer.right,top:footer.top,bottom:footer.bottom},button:{top:cta.top,bottom:cta.bottom},overflow:actions.scrollWidth>actions.clientWidth+1};})()`);
      assert.ok(previewGeometry.panel.left>=0&&previewGeometry.panel.right<=width+1&&previewGeometry.panel.top>=0&&previewGeometry.panel.bottom<=1001,`${width}px ${theme} ${type}: preview panel fits ${JSON.stringify(previewGeometry)}`);
      assert.ok(previewGeometry.footer.bottom<=1001&&previewGeometry.button.top>=0&&previewGeometry.button.bottom<=previewGeometry.footer.bottom+1,`${width}px ${theme} ${type}: action button stays visible`);
      assert.equal(previewGeometry.overflow,false,`${width}px ${theme} ${type}: footer has no horizontal overflow`);
      await evaluate(`closeCosmeticPreview();`);
    }
  }
  if(process.env.GARDEN_THEMES_CAPTURE==='1'){
    fs.mkdirSync(path.join(root,'output'),{recursive:true});
    await call('Emulation.setDeviceMetricsOverride',{width:1440,height:2400,deviceScaleFactor:1,mobile:false});
    await evaluate(`applyWorkspaceTheme('white');FarmSeeds.close();FarmKitchen.close();closeCosmeticPreview();
      clearTimeout(toastTimer);toast.classList.remove('show');renderFarm();document.querySelector('.farm-theme-section').scrollIntoView({block:'start'});`);
    await pause(200);
    const gallery=await evaluate(`(()=>{const section=document.querySelector('.farm-theme-section');const r=section.getBoundingClientRect();const rectangles=[r,...[...section.querySelectorAll('.farm-theme-choice,.farm-theme-heading,.farm-theme-choice small')].map(item=>item.getBoundingClientRect())];const left=Math.floor(Math.min(...rectangles.map(rect=>rect.left))+scrollX)-8;const top=Math.floor(Math.min(...rectangles.map(rect=>rect.top))+scrollY)-8;const right=Math.ceil(Math.max(...rectangles.map(rect=>rect.right))+scrollX)+8;const bottom=Math.ceil(Math.max(...rectangles.map(rect=>rect.bottom))+scrollY)+8;return {x:Math.max(0,left),y:Math.max(0,top),width:right-Math.max(0,left),height:bottom-Math.max(0,top),scale:1};})()`);
    const galleryGeometry=await evaluate(`(()=>{const section=document.querySelector('.farm-theme-section'),r=section.getBoundingClientRect();const last=section.querySelector('.farm-theme-choice:last-child').getBoundingClientRect();const heading=section.querySelector('.farm-theme-heading').getBoundingClientRect();return {section:{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom},last:{right:last.right,bottom:last.bottom},heading:{right:heading.right},scrollX,scrollY,innerWidth,innerHeight};})()`);
    console.log('Theme gallery capture:',JSON.stringify({clip:gallery,geometry:galleryGeometry}));
    assert.ok(gallery.y+gallery.height<=2400,'the complete gallery fits within the capture viewport');
    const galleryCapture=await call('Page.captureScreenshot',{format:'png',clip:gallery,captureBeyondViewport:false});
    fs.writeFileSync(path.join(root,'output/garden-expanded-themes.png'),Buffer.from(galleryCapture.data,'base64'));
    for(const theme of ['volcano','valentine','whiteDay','peperoDay','christmas','auroraNight']){
      await evaluate(`state.equippedFarmTheme=${JSON.stringify(theme)};renderFarm();document.querySelector('#farmPage .farm-scene').scrollIntoView({block:'center'});`);
      await pause(120);
      const scene=await evaluate(`(()=>{const r=document.querySelector('#farmPage .farm-scene').getBoundingClientRect();return {x:r.left+scrollX,y:r.top+scrollY,width:r.width,height:r.height,scale:1};})()`);
      const sceneCapture=await call('Page.captureScreenshot',{format:'png',clip:scene,captureBeyondViewport:true});
      fs.writeFileSync(path.join(root,`output/garden-theme-${theme}.png`),Buffer.from(sceneCapture.data,'base64'));
    }
    for(const width of [1440,390]){
      await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<=700});
      for(const theme of ['volcano','valentine','whiteDay','peperoDay','christmas','auroraNight']){
        await evaluate(`window.scrollTo(0,0);openCosmeticPreview('farm_theme',${JSON.stringify(theme)});`);
        await pause(80);
        const panel=await evaluate(`(()=>{const r=document.querySelector('#cosmeticPreviewModal .cosmetic-preview-modal-panel').getBoundingClientRect();const left=Math.max(0,Math.floor(r.left)-6),top=Math.max(0,Math.floor(r.top)-6);return {x:left,y:top,width:Math.min(innerWidth,Math.ceil(r.right)+6)-left,height:Math.min(innerHeight,Math.ceil(r.bottom)+6)-top,scale:1};})()`);
        const modalCapture=await call('Page.captureScreenshot',{format:'png',clip:panel,captureBeyondViewport:false});
        fs.writeFileSync(path.join(root,`output/garden-theme-preview-${theme}-${width}.png`),Buffer.from(modalCapture.data,'base64'));
        await evaluate(`closeCosmeticPreview();`);
      }
    }
  }
  if(process.env.GARDEN_FIELDS_CAPTURE==='1'){
    fs.mkdirSync(path.join(root,'output'),{recursive:true});
    await evaluate(`(async()=>{FarmSeeds.close();FarmKitchen.close();closeCosmeticPreview();applyWorkspaceTheme('white');
      state.farmName='눈꽃이 내려앉은 작은 농장';state.coins=148;state.farmMoney=620;
      state.farmPlots=defaultState.farmPlots.map((plot,index)=>{const crop=['carrot','strawberry','tomato','corn','wheat','pumpkin'][index]||null;
        return {...plot,crop,growth:crop?(index<4?index:getCropGrowthCost(crop)):0,
          lastCaredAt:Date.now(),lastFreeWaterAt:Date.now(),wilted:false};});
      openFarmPlotId=null;state.equippedFarmTheme='christmas';state.equippedPlotSkin='snowField';
      state.ownedCosmetics=[{type:'farm_theme',id:'christmas'},{type:'farm_theme',id:'springMeadow'},
        {type:'plot_skin',id:'snowField'},{type:'plot_skin',id:'mapleLeaf'}];
      renderFarm();showPage('farm');clearTimeout(toastTimer);toast.classList.remove('show');
      await document.fonts.ready;const image=new Image();image.src='./assets/garden-v5/themed-plots-atlas.png';await image.decode();})()`);
    for(const [width,name] of [[1440,'desktop'],[390,'mobile']]){
      await call('Emulation.setDeviceMetricsOverride',{width,height:7000,deviceScaleFactor:1,mobile:width<700});
      await evaluate(`scrollTo(0,0);`);await pause(180);
      assert.equal(await evaluate(`document.querySelectorAll('#farmThemeChoices .farm-theme-choice').length===19&&document.querySelectorAll('#farmPlotSkinChoices .farm-plot-skin-choice').length===13&&!document.querySelector('#openGardenEditor,#gardenEditorPanel,#gardenDecorationLayer')`),true,'capture contains the complete theme and field catalogs without decoration controls');
      const bounds=await evaluate(`(()=>{const r=document.querySelector('#farmPage .farm-layout').getBoundingClientRect();const left=Math.max(0,Math.floor(r.left)-8),top=Math.max(0,Math.floor(r.top)-8);return {x:left,y:top,width:Math.min(innerWidth,Math.ceil(r.right)+8)-left,height:Math.ceil(r.bottom)+8-top,scale:1};})()`);
      assert.ok(bounds.y+bounds.height<=7000,'complete farm fits within fixed screenshot viewport');
      const screenshot=await call('Page.captureScreenshot',{format:'png',clip:bounds,captureBeyondViewport:false});
      fs.writeFileSync(path.join(root,`output/garden-fields-${name}.png`),Buffer.from(screenshot.data,'base64'));
      if(name==='desktop'){
        const gallery=await evaluate(`(()=>{const r=document.querySelector('.farm-plot-skin-section').getBoundingClientRect();const left=Math.max(0,Math.floor(r.left)-8),top=Math.max(0,Math.floor(r.top)-8);return {x:left,y:top,width:Math.min(innerWidth,Math.ceil(r.right)+8)-left,height:Math.ceil(r.bottom)+8-top,scale:1};})()`);
        const collection=await call('Page.captureScreenshot',{format:'png',clip:gallery,captureBeyondViewport:false});
        fs.writeFileSync(path.join(root,'output/garden-field-collection.png'),Buffer.from(collection.data,'base64'));
      }
    }
    console.log('Saved actual Christmas/snow field farm desktop/mobile and all thirteen field cards to output/garden-fields-*.png and garden-field-collection.png');
  }
  if(process.env.GARDEN_SEEDS_CAPTURE==='1'){
    await call('Emulation.setDeviceMetricsOverride',{width:390,height:1000,deviceScaleFactor:1,mobile:true});
    await evaluate(`applyWorkspaceTheme('white');FarmSeeds.open(2);clearTimeout(toastTimer);toast.classList.remove('show');`);
    await pause(150);
    const screenshot=await call('Page.captureScreenshot',{format:'png'});
    fs.mkdirSync(path.join(root,'output'),{recursive:true});
    fs.writeFileSync(path.join(root,'output/garden-seeds-mobile.png'),Buffer.from(screenshot.data,'base64'));
  }
  assert.deepEqual(exceptions,[],'No browser runtime exceptions');
  console.log('PASS: actual empty-plot click, search, atomic purchase/plant, owned-seed no-charge, kitchen pantry, toolbar mailbox, nineteen unique theme scenes, direct permanent theme and field purchases, crop preservation, responsive white/dark seed picker');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{socket?.close();chrome?.kill();server.close();});
