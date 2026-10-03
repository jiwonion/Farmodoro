// Real mailbox, seed picker and kitchen checks with local RPC fixtures.
// Node 22+; no external accounts or databases are contacted.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'farmodoro-mail-art-'));
const chromePath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const stub = `<script>
  window.__mailRpcCalls = [];
  window.supabase = { createClient: () => ({
    auth: { getSession: () => new Promise(() => {}) },
    rpc: async (name, params) => {
      __mailRpcCalls.push({ name, params });
      return window.__mailRpcHandler ? __mailRpcHandler(name, params) : { data: null, error: null };
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
    const type = file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.png') ? 'image/png' : 'application/octet-stream';
    response.setHeader('Content-Type', type);
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
    for (let i = 0; i < 120; i++) { if (await evaluate(predicate)) return; await pause(25); }
    assert.fail('UI did not settle: ' + predicate);
  };
  await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride', {width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate', {url:`http://127.0.0.1:${server.address().port}/`});
  await settle('document.readyState === "complete"');
  await evaluate(`(() => {
    document.documentElement.className='';document.body.classList.remove('auth-gated');
    document.querySelector('#authGate').hidden=true;document.querySelector('.auth-boot')?.remove();
    activeAuthUser={id:'mail-art-owner'};farmDataUserId=activeAuthUser.id;farmDataHydrated=true;
    pageDataRefreshTimes.set(activeAuthUser.id+':farm',Date.now()+60000);
    focusTimerDatabaseUnavailable=true;
    state.coins=100;state.farmMoney=500;state.farmMailDate=toLocalDateString();state.farmMailSentCount=0;
    state.farmMailHistory=[];farmMailView='send';selectedMailCategory='harvest';
    selectedMailFriendCode='FARM-AAAA-1111';selectedMailItemId=null;
    __mailServer={
      farm:{farmName:'같은 그림으로 자라는 작은 농장'},
      plots:structuredClone(defaultState.farmPlots),
      inventory:Object.keys(CROPS).flatMap(itemId=>[
        {category:'seed',itemId,quantity:3},{category:'harvest',itemId,quantity:3}
      ]),
      inbox:[{id:'all-crop-gifts',senderName:'친구 농장',senderUserId:'friend',mailType:'gift',sentAt:new Date().toISOString(),
        items:Object.keys(CROPS).flatMap(itemId=>[
          {id:'mail-harvest-'+itemId,category:'harvest',itemId,quantity:2},
          {id:'mail-seed-'+itemId,category:'seed',itemId,quantity:1}
        ])}],
      sentToday:[],ownedCosmetics:[],marketRotation:{}
    };
    __mailRpcHandler=async(name,params)=>{
      if(name==='get_my_farm_state_v6')return {data:structuredClone(__mailServer),error:null};
      if(name==='get_farm_leaderboard'||name==='get_my_farm_mail_contacts')return {data:[],error:null};
      if(name==='get_my_unclaimed_farm_mail_count')return {data:__mailServer.inbox[0].items.filter(item=>!item.claimedAt).length,error:null};
      if(name==='send_farm_mail'){
        const entry=__mailServer.inventory.find(item=>item.category===params.p_category&&item.itemId===params.p_item_id);
        entry.quantity-=params.p_quantity;
        __mailServer.sentToday.unshift({id:'sent-mail',recipientName:'친구 농장',sentAt:new Date().toISOString(),message:params.p_message,
          items:[{category:params.p_category,itemId:params.p_item_id,quantity:params.p_quantity,priceCoins:params.p_price_coins}]});
        return {data:null,error:null};
      }
      if(name==='claim_farm_mail_item'){
        const gift=__mailServer.inbox[0].items.find(item=>item.id===params.p_mail_item_id);
        gift.claimedAt=new Date().toISOString();
        __mailServer.inventory.find(item=>item.category===gift.category&&item.itemId===gift.itemId).quantity+=gift.quantity;
        return {data:null,error:null};
      }
      return {data:null,error:null};
    };
    showPage('farm');renderFarm();document.querySelector('#openGardenMail').click();
  })()`);
  await settle(`!document.querySelector('#farmMailModal').classList.contains('hidden') && document.querySelectorAll('#farmMailItemList [data-mail-item]').length === 57`);
  const sources = await evaluate(`(async()=>{
    const urls=[...new Set([...document.querySelectorAll('#farmMailItemList .garden-crop-art image')].map(image=>image.getAttribute('href')))];
    await Promise.all(urls.map(async url=>{const image=new Image();image.src=url;await image.decode();}));
    return {count:Object.keys(CROPS).length,urls};
  })()`);
  assert.equal(sources.count,57,'All production crop IDs are present');
  assert.ok(sources.urls.length,'Mailbox uses the new raster crop artwork through clipped SVGs');
  assert.ok(sources.urls.every(url=>!url.includes('pixel-crops')),'No legacy harvest atlas remains');

  for (const width of [1440,390,320]) {
    await call('Emulation.setDeviceMetricsOverride', {width,height:1100,deviceScaleFactor:1,mobile:width<700});
    for (const category of ['harvest','seed']) {
      await evaluate(`farmMailView='send';document.querySelector('[data-mail-category="${category}"]').click();renderFarmMail();`);
      const cards=await evaluate(`(()=>{
        const items=[...document.querySelectorAll('#farmMailItemList [data-mail-item]')];
        return items.map(item=>{const art=item.querySelector('svg.garden-crop-art'),rect=art?.getBoundingClientRect();return {
          id:item.dataset.mailItem,art:!!art,legacy:!!item.querySelector('.crop-pixel'),width:rect?.width,height:rect?.height,
          background:art&&getComputedStyle(art).backgroundImage,label:item.querySelector('strong').textContent,
          owned:item.querySelector('small').textContent
        };});
      })()`);
      assert.equal(cards.length,57,`${width}px ${category}: all crop gifts remain selectable`);
      for (const card of cards) {
        assert.equal(card.art,true,`${width}px ${category} ${card.id}: generated crop icon`);
        assert.equal(card.legacy,false,`${width}px ${category} ${card.id}: no old icon`);
        assert.ok(Math.abs(card.width-40)<1 && Math.abs(card.height-40)<1,`${width}px ${category} ${card.id}: icon fits the card`);
        assert.equal(card.background,'none',`${width}px ${category} ${card.id}: clipped artwork is not repeated behind SVG`);
        assert.equal(card.owned,'3개 보유');
        if(category==='seed')assert.ok(card.label.endsWith(' 씨앗'));
      }
      if(process.env.MAIL_ART_CAPTURE==='1' && category==='harvest'){
        fs.mkdirSync(path.join(root,'output'),{recursive:true});
        await evaluate(`applyWorkspaceTheme('white');document.querySelector('#farmMailItemList').scrollTop=0;`);
        await pause(100);
        const screenshot=await call('Page.captureScreenshot',{format:'png'});
        fs.writeFileSync(path.join(root,`output/garden-mail-new-crops-${width}.png`),Buffer.from(screenshot.data,'base64'));
      }
    }
    await evaluate(`document.querySelector('[data-mail-view="inbox"]').click();`);
    const inbox=await evaluate(`(()=>{const list=document.querySelector('#farmMailInboxList');return {
      rows:list.querySelectorAll('[data-claim-farm-mail]').length,art:list.querySelectorAll('svg.garden-crop-art').length,
      legacy:list.querySelectorAll('.crop-pixel').length,oversized:[...list.querySelectorAll('.garden-crop-art')].some(art=>art.getBoundingClientRect().width>41),
      overflow:document.documentElement.scrollWidth>innerWidth+1
    };})()`);
    assert.deepEqual(inbox,{rows:114,art:114,legacy:0,oversized:false,overflow:false});
    console.log(`${width}px: all 57 seed/harvest compose gifts and 114 historical inbox items use new artwork`);
  }

  // Sending keeps quantity, optional price and message; receiving reconciles
  // the existing authoritative inventory and continues showing the same icon.
  await evaluate(`document.querySelector('[data-mail-view="send"]').click();document.querySelector('[data-mail-category="seed"]').click();
    document.querySelector('[data-mail-item="truffle"]').click();document.querySelector('#farmMailQuantityPlus').click();
    const price=document.querySelector('#farmMailPriceInput');price.value='17';price.dispatchEvent(new Event('input',{bubbles:true}));
    const message=document.querySelector('#farmMailMessageInput');message.value='새 그림으로 키워 봐';message.dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelector('#sendFarmMail').click();`);
  await settle(`state.farmMailSentCount===1 && state.seedInventory.truffle===1`);
  assert.deepEqual(await evaluate(`__mailRpcCalls.filter(call=>call.name==='send_farm_mail').map(call=>call.params)`),[{
    p_recipient_farm_code:'FARM-AAAA-1111',p_category:'seed',p_item_id:'truffle',p_quantity:2,p_price_coins:17,p_message:'새 그림으로 키워 봐'
  }]);
  assert.deepEqual(await evaluate(`(()=>{const mail=state.farmMailHistory[0];return {category:mail.category,itemId:mail.itemId,quantity:mail.quantity,price:mail.priceCoins,message:mail.message};})()`),
    {category:'seed',itemId:'truffle',quantity:2,price:17,message:'새 그림으로 키워 봐'});
  assert.match(await evaluate(`document.querySelector('#farmMailHistory').textContent`),/17 Coin/);
  await evaluate(`document.querySelector('[data-mail-view="inbox"]').click();document.querySelector('[data-claim-farm-mail="mail-harvest-truffle"]').click();`);
  await settle(`state.harvestInventory.truffle===5 && state.farmInbox.find(mail=>mail.id==='mail-harvest-truffle').claimed`);
  assert.deepEqual(await evaluate(`__mailRpcCalls.filter(call=>call.name==='claim_farm_mail_item').map(call=>call.params)`),[{p_mail_item_id:'mail-harvest-truffle'}]);
  assert.equal(await evaluate(`document.querySelector('[data-claim-farm-mail="mail-harvest-truffle"]').disabled`),true);
  assert.equal(await evaluate(`document.querySelector('[data-claim-farm-mail="mail-harvest-truffle"]').closest('article').querySelectorAll('svg.garden-crop-art').length`),1);

  // The opened reward boxes use this same renderer, including the 45 crop IDs
  // which previously silently fell back to the old sheet.
  assert.deepEqual(await evaluate(`(()=>{
    const cropIds=Object.keys(CROPS),mail={id:'art-reward',category:'updateBox',boxCropIds:cropIds,openedBoxIndexes:cropIds.map((_,index)=>index),claimed:true};
    renderFarmRewardBoxes(mail);const grid=document.querySelector('#farmRewardBoxGrid');
    return {art:grid.querySelectorAll('svg.garden-crop-art').length,legacy:grid.querySelectorAll('.crop-pixel').length};
  })()`),{art:57,legacy:0});

  await evaluate(`farmMailModal.classList.add('hidden');FarmSeeds.open(0);`);
  assert.deepEqual(await evaluate(`(()=>{const list=document.querySelector('#gardenSeedChoices');return {cards:list.querySelectorAll('[data-garden-plant]').length,art:list.querySelectorAll('svg.garden-crop-art').length,legacy:list.querySelectorAll('.crop-pixel').length};})()`),{cards:57,art:57,legacy:0});
  await evaluate(`FarmSeeds.close();FarmKitchen.open();`);
  assert.deepEqual(await evaluate(`(()=>{const pantry=document.querySelector('.kitchen-v2-pantry');return {art:pantry.querySelectorAll('svg.garden-crop-art').length,legacy:pantry.querySelectorAll('.crop-pixel').length};})()`),{art:57,legacy:0});
  assert.deepEqual(exceptions,[],'No runtime errors in artwork or mail actions');
  console.log('PASS: new artwork across all 57 mailbox crops, seed picker, pantry and opened rewards; gift send/claim/price/quantity/history contracts preserved');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{socket?.close();chrome?.kill();server.close();});
