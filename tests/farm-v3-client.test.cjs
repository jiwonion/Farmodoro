const assert=require('node:assert/strict'),{test}=require('node:test'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../farm-v3.js'),'utf8');
const catalogContext={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../farm-v3-catalog.js'),'utf8'),catalogContext);
const catalog=JSON.parse(JSON.stringify(catalogContext.window.FarmV3Catalog.items));
const clone=value=>JSON.parse(JSON.stringify(value)),tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;return{promise:new Promise(r=>{resolve=r;}),resolve:value=>resolve(value)};};
const run=(overrides={})=>({id:'run-1',kind:'crop',itemId:'carrot',slot:0,progress:0,cost:3,...overrides});
function game(overrides={}){return{version:1,charactersVersion:1,plazaPositionVersion:1,plazaSpeechVersion:1,cropUnlockVersion:1,manualDecorVersion:1,coinBalance:10,profile:{nickname:'농부',characterId:'sprout-slime',decorations:[],plazaPublic:true,position:{x:50,y:65},speech:'',version:0},runs:[],collections:[],unlocks:catalog.filter(i=>!i.harvests&&!i.fish&&!i.cropTypes&&!i.fishTypes&&!i.cropRequirements?.length).map(({kind,id})=>({kind,id})),catalog:clone(catalog),...overrides};}
function legacyGame(){const value=game();delete value.charactersVersion;delete value.plazaPositionVersion;delete value.plazaSpeechVersion;delete value.cropUnlockVersion;delete value.profile.characterId;delete value.profile.position;delete value.profile.speech;Object.assign(value.profile,{avatar:{gender:'neutral',skin:0,hair:0,style:0,outfit:'blue',hat:null},pose:'stand',zone:'square'});value.catalog=clone(catalogContext.window.FarmV3Catalog.legacyItems);value.unlocks=value.catalog.filter(i=>!i.harvests&&!i.fish&&!i.cropTypes&&!i.fishTypes).map(({kind,id})=>({kind,id}));return value;}
const result=(value,overrides={})=>({game:value,wallet:{coinBalance:value.coinBalance,farmMoneyBalance:20},event:{kind:'grown',spentCoin:1},...overrides});
function harness({rpc,storage=new Map(),storageFailure=false,coins=10}={}){
  const calls=[],toasts=[];let uuid=0;
  const classList={add(){},remove(){}};
  const pageClasses=new Set(),farmPage={classList:{add:name=>pageClasses.add(name),remove:name=>pageClasses.delete(name),contains:name=>pageClasses.has(name)}};
  const root={innerHTML:'',attributes:{},handlers:{},contains:node=>!!node?.insideRoot,querySelectorAll:()=>[],setAttribute(name,value){this.attributes[name]=value;},addEventListener(name,callback){this.handlers[name]=callback;}};
  const ctx=vm.createContext({console,window:{FarmV3Views:{render:value=>JSON.stringify({tab:value.tab,disabled:value.disabled,message:value.message,pending:!!value.pending,game:value.game})},FarmV3Art:{paintAll:async()=>{}}},document:{documentElement:{classList},activeElement:null,getElementById:id=>id==='farmGameRoot'?root:id==='farmPage'?farmPage:null},
    FormData:class{constructor(form){this.form=form;}get(key){return this.form.fields[key]??null;}},
    localStorage:{getItem:key=>storage.get(key)||null,setItem(key,value){if(storageFailure)throw Error('quota');storage.set(key,value);},removeItem:key=>storage.delete(key)},
    activeAuthUser:null,farmSessionGeneration:1,state:{coins,farmMoney:20},farmActionChain:Promise.resolve(),farmWalletMutationChain:Promise.resolve(),farmWalletMutationVersion:0,
    createUuid:()=>`request-${++uuid}`,showToast:text=>toasts.push(text),renderFarm(){ctx.window.FarmV3.render();},renderSummary(){},
    supabaseClient:{async rpc(name,params){calls.push({name,params:params&&clone(params)});return rpc?rpc(name,params):{data:game()};}},
  });
  ctx.applyFarmActionResult=value=>{if(value.wallet?.coinBalance!=null)ctx.state.coins=Number(value.wallet.coinBalance);if(value.wallet?.farmMoneyBalance!=null)ctx.state.farmMoney=Number(value.wallet.farmMoneyBalance);};
  vm.runInContext(source,ctx);ctx.activeAuthUser={id:'user-a'};
  const api=ctx.window.FarmV3;
  const click=(action,extra={},point={})=>{const control={insideRoot:true,disabled:false,dataset:{fvAction:action,...extra},getBoundingClientRect:()=>({left:10,top:20,width:200,height:200})};root.handlers.click({target:{closest:()=>control},...point});};
  const submit=fields=>{const form={fields};root.handlers.submit({target:{closest:()=>form},preventDefault(){}});};
  const settle=async()=>{await ctx.farmActionChain;await tick();};
  return{ctx,api,root,farmPage,calls,toasts,storage,click,submit,settle};
}

test('all four slots work, locked seeds never write and rapid clicks reserve one wallet action',async()=>{
  const gate=deferred();const h=harness({rpc:()=>gate.promise});h.api.applyState(game());
  h.click('slot',{slot:'3'});h.click('plant',{item:'corn'});await tick();assert.equal(h.calls.length,0);
  h.click('plant',{item:'carrot'});h.click('plant',{item:'potato'});await tick();
  assert.equal(h.calls.length,1);assert.equal(h.calls[0].params.p_payload.slot,3);
  assert.ok(h.storage.has('farmodoro-v3-intent:user-a'));
  gate.resolve({data:result(game({runs:[run({slot:3})]}),{event:{kind:'started',name:'당근'}})});await h.settle();
  assert.equal(h.storage.size,0);assert.equal(h.ctx.state.coins,10);
});

test('growth waits for productivity wallet changes and later writes wait for growth',async()=>{
  const task=deferred(),reply=deferred();const h=harness({rpc:()=>reply.promise});h.api.applyState(game({runs:[run()]}));
  h.ctx.farmWalletMutationChain=task.promise.then(()=>{h.ctx.state.coins=12;});
  h.click('grow',{run:'run-1',amount:'1'});let later=false;
  const after=h.ctx.farmWalletMutationChain.then(()=>{later=true;h.ctx.state.coins+=2;});
  await tick();assert.equal(h.calls.length,0);task.resolve();await tick();assert.equal(h.ctx.state.coins,12);assert.equal(later,false);
  reply.resolve({data:result(game({coinBalance:11,runs:[run({progress:1})]}))});await after;await h.settle();assert.equal(h.ctx.state.coins,13);
});

test('a lost response keeps one request and retry applies the latest server state',async()=>{
  let attempts=0;const fresh=game({coinBalance:7,runs:[run({progress:3})]});
  const h=harness({rpc:(name)=>name==='get_my_farm_v3_state'?{data:fresh}:++attempts===1?{error:{message:'Connection lost'}}:{data:result(game({coinBalance:9,runs:[run({progress:1})]}))}});
  h.api.applyState(game({runs:[run()]}));h.click('grow',{run:'run-1',amount:'1'});await h.settle();
  const saved=JSON.parse(h.storage.get('farmodoro-v3-intent:user-a'));h.click('grow',{run:'run-1',amount:'1'});await h.settle();assert.equal(attempts,1);
  h.click('retry');await h.settle();
  const requests=h.calls.filter(c=>c.name==='perform_my_farm_v3_action');assert.equal(requests[1].params.p_request_id,saved.requestId);
  assert.equal(h.api.snapshot().runs[0].progress,3);assert.equal(h.ctx.state.coins,7);assert.equal(h.storage.size,0);
});

test('a durable request survives reload and blocks a second action until recovery',async()=>{
  const storage=new Map();const first=harness({storage,rpc:()=>({error:{message:'Offline'}})});first.api.applyState(game({runs:[run()]}));
  first.click('grow',{run:'run-1',amount:'1'});await first.settle();const request=JSON.parse(storage.get('farmodoro-v3-intent:user-a')).requestId;
  const committed=game({coinBalance:9,runs:[run({progress:1})]});const second=harness({storage,rpc:name=>({data:name==='get_my_farm_v3_state'?committed:result(committed)})});
  await second.api.load(second.ctx.activeAuthUser);second.click('grow',{run:'run-1',amount:'1'});await second.settle();assert.equal(second.calls.length,1);
  second.click('retry');await second.settle();assert.equal(second.calls.find(c=>c.name==='perform_my_farm_v3_action').params.p_request_id,request);assert.equal(storage.size,0);
});

for(const boundary of ['queued','inflight'])test(`old-account ${boundary} actions cannot change a new session`,async()=>{
  const gate=deferred();const h=harness({rpc:()=>gate.promise});h.api.applyState(game({runs:[run()]}));
  if(boundary==='queued')h.ctx.farmActionChain=gate.promise;
  h.click('grow',{run:'run-1',amount:'1'});await tick();
  h.ctx.activeAuthUser={id:'user-b'};h.ctx.farmSessionGeneration++;h.api.reset();h.ctx.state.coins=77;
  h.api.applyState(game({coinBalance:77}));gate.resolve({data:result(game({coinBalance:9,runs:[run({progress:1})]}))});await h.settle();
  assert.equal(h.ctx.state.coins,77);assert.equal(h.api.snapshot().coinBalance,77);assert.ok(h.storage.has('farmodoro-v3-intent:user-a'));
  if(boundary==='queued')assert.equal(h.calls.length,0);
});

test('negative Coin is valid, growth stops and completed collection remains available',async()=>{
  const h=harness({coins:-3,rpc:()=>({data:result(game({coinBalance:-3,collections:[{kind:'crop',id:'carrot',count:1}]}),{event:{kind:'collected',name:'당근',itemKind:'crop'}})})});
  assert.equal(h.api.applyState(game({coinBalance:-3,runs:[run({progress:3})]})),true);
  h.click('grow',{run:'run-1',amount:'1'});await h.settle();assert.equal(h.calls.length,0);
  h.click('harvest',{run:'run-1'});await h.settle();assert.equal(h.calls.length,1);assert.equal(h.ctx.state.coins,-3);
});

test('quota failures never send an unrecoverable write',async()=>{
  const h=harness({storageFailure:true});h.api.applyState(game({runs:[run()]}));h.click('grow',{run:'run-1',amount:'1'});await h.settle();assert.equal(h.calls.length,0);assert.equal(h.ctx.state.coins,10);
});

test('a state read overtaken by a mutation cannot roll back progress or the wallet',async()=>{
  const read=deferred();const h=harness({rpc:name=>name==='get_my_farm_v3_state'?read.promise:{data:result(game({coinBalance:9,runs:[run({progress:1})]}))}});
  h.api.applyState(game({runs:[run()]}));const loading=h.api.load(h.ctx.activeAuthUser);await tick();
  // Loads disable controls, but another shared wallet write can still happen.
  h.ctx.farmWalletMutationChain=Promise.resolve().then(()=>{h.ctx.state.coins=18;});await h.ctx.farmWalletMutationChain;
  read.resolve({data:game({coinBalance:10,runs:[run()]})});await loading;assert.equal(h.ctx.state.coins,18);
});

test('an old plaza response cannot reveal the previous account after switching',async()=>{
  const read=deferred();const h=harness({rpc:()=>read.promise});h.api.applyState(game());h.click('tab',{tab:'plaza'});await tick();
  h.ctx.activeAuthUser={id:'user-b'};h.ctx.farmSessionGeneration++;h.api.reset();h.api.applyState(game({profile:{...game().profile,nickname:'B'}}));
  read.resolve({data:{page:0,total:1,items:[{id:'secret-a',nickname:'old',characterId:'sprout-slime',pose:'stand'}]}});await tick();
  assert.equal(h.root.innerHTML.includes('secret-a'),false);assert.equal(h.api.snapshot().profile.nickname,'B');
});

test('malformed server data stays unusable and impossible slots are rejected',async()=>{
  const h=harness();assert.equal(h.api.applyState(game({runs:[null]})),false);assert.equal(h.api.applyState(game({runs:[run({slot:4})]})),false);
  assert.equal(h.api.applyState(game({coinBalance:null})),false);assert.equal(h.api.applyState(game({coinBalance:1.5})),false);h.api.applyState(game());h.click('slot',{slot:'4'});h.click('plant',{item:'carrot'});await h.settle();assert.equal(h.calls.length,0);
});

test('character previews are drafts and only owned characters can be saved without charging Coin',async()=>{
  const initial=game();initial.unlocks.push({kind:'character',id:'berry-slime'});
  const saved=game({profile:{...initial.profile,characterId:'berry-slime',version:1},unlocks:initial.unlocks});
  const h=harness({rpc:name=>({data:name==='get_farm_v3_plaza'?{total:0,page:0,items:[]}:result(saved,{event:{kind:'character'}})})});
  h.api.applyState(initial);h.click('choose_character',{item:'royal-slime'});h.click('choose_character',{item:'missing'});await tick();assert.equal(h.calls.length,0);
  h.click('choose_character',{item:'berry-slime'});assert.equal(h.api.snapshot().profile.characterId,'sprout-slime');assert.equal(h.calls.length,0);
  h.click('save_character');h.click('save_character');await h.settle();
  const writes=h.calls.filter(c=>c.name==='perform_my_farm_v3_action');assert.equal(writes.length,1);
  assert.deepEqual(writes[0].params.p_payload,{characterId:'berry-slime',version:0});assert.equal(writes[0].params.p_action,'character');
  assert.equal(h.api.snapshot().profile.characterId,'berry-slime');assert.equal(h.ctx.state.coins,10);assert.equal(h.storage.size,0);
  assert.equal(h.api.applyState({...saved,profile:{...saved.profile,characterId:'royal-slime'}}),false);
});

test('a character draft retains its starting version and conflicts reload the saved choice',async()=>{
  const initial=game();initial.unlocks.push({kind:'character',id:'berry-slime'});
  const fresh=game({profile:{...initial.profile,version:2},unlocks:initial.unlocks});
  const h=harness({rpc:name=>name==='get_my_farm_v3_state'?{data:fresh}:{error:{message:'FARM_V3_PROFILE_CHANGED'}}});
  h.api.applyState(initial);h.click('choose_character',{item:'berry-slime'});h.api.applyState(fresh);h.click('save_character');await h.settle();
  assert.equal(h.calls.find(c=>c.name==='perform_my_farm_v3_action').params.p_payload.version,0);
  assert.equal(h.api.snapshot().profile.characterId,'sprout-slime');assert.equal(h.api.snapshot().profile.version,2);assert.equal(h.storage.size,0);
});

test('retired avatar requests can be cleared through recovery without blocking the new farm',async()=>{
  const storage=new Map([['farmodoro-v3-intent:user-a',JSON.stringify({userId:'user-a',requestId:'old-avatar-request',action:'avatar',payload:{version:0,avatar:{}}})]]);
  const h=harness({storage,rpc:name=>name==='get_my_farm_v3_state'?{data:game()}:{error:{message:'FARM_V3_AVATAR_RETIRED'}}});
  await h.api.load(h.ctx.activeAuthUser);h.click('retry');await h.settle();
  assert.equal(h.calls.find(c=>c.name==='perform_my_farm_v3_action').params.p_request_id,'old-avatar-request');
  assert.equal(h.storage.size,0);assert.ok(h.api.snapshot());
});

test('095/096 servers still open the farm and accept growth without inventing character unlocks',async()=>{
  const before=legacyGame(),after=legacyGame();before.runs=[run()];after.runs=[run({progress:1})];after.coinBalance=9;
  const h=harness({rpc:name=>({data:name==='get_my_farm_v3_state'?before:result(after)})});
  assert.equal(await h.api.load(h.ctx.activeAuthUser),true);
  assert.equal(h.api.snapshot().charactersVersion,0);assert.equal(h.api.snapshot().profile.characterId,null);
  assert.equal(h.api.snapshot().catalog.some(i=>['character','outfit','hat'].includes(i.kind)),false);
  h.click('choose_character',{item:'royal-slime'});h.click('save_character');await h.settle();assert.equal(h.calls.length,1);
  h.click('grow',{run:'run-1',amount:'1'});await h.settle();assert.equal(h.api.snapshot().runs[0].progress,1);assert.equal(h.ctx.state.coins,9);
  assert.equal(h.farmPage.classList.contains('farm-v3-show-legacy'),false);
});

test('097 servers keep character selection available while new plaza positions are absent',async()=>{
  const value=game();delete value.plazaPositionVersion;delete value.profile.position;Object.assign(value.profile,{pose:'sit',zone:'bench'});
  const h=harness({rpc:()=>({data:value})});assert.equal(await h.api.load(h.ctx.activeAuthUser),true);
  assert.equal(h.api.snapshot().charactersVersion,1);assert.equal(h.api.snapshot().plazaPositionVersion,0);
  assert.deepEqual(clone(h.api.snapshot().profile.position),{x:22,y:38});
  h.click('plaza_position',{}, {clientX:170,clientY:180});await h.settle();assert.equal(h.calls.length,1);
});

test('a missing farm API opens the existing scenery panel and recovery restores the farm',async()=>{
  let missing=true;const h=harness({rpc:()=>missing?{error:{code:'PGRST202'}}:{data:game()}});
  assert.equal(await h.api.load(h.ctx.activeAuthUser),false);assert.equal(h.farmPage.classList.contains('farm-v3-show-legacy'),true);
  missing=false;assert.equal(await h.api.load(h.ctx.activeAuthUser),true);assert.equal(h.farmPage.classList.contains('farm-v3-show-legacy'),false);
});

test('plaza clicks are clamped drafts and saving sends coordinates without pose or zone',async()=>{
  const saved=game({profile:{...game().profile,position:{x:5,y:95},plazaPublic:true,version:1}});
  const h=harness({rpc:name=>({data:name==='get_farm_v3_plaza'?{page:0,total:0,items:[]}:result(saved,{event:{kind:'plaza'}})})});
  h.api.applyState(game());h.click('plaza_position',{}, {clientX:-100,clientY:900});
  assert.deepEqual(clone(h.api.snapshot().profile.position),{x:50,y:65});assert.equal(h.calls.length,0);
  h.submit({nickname:'내 자리',public:'on'});await h.settle();
  const write=h.calls.find(c=>c.name==='perform_my_farm_v3_action');assert.deepEqual(write.params.p_payload,{nickname:'내 자리',public:true,position:{x:5,y:95},speech:'',version:0});
  assert.deepEqual(clone(h.api.snapshot().profile.position),{x:5,y:95});assert.equal(h.ctx.state.coins,10);
});

test('keyboard plaza moves preserve the draft version and reject malformed server coordinates',async()=>{
  const saved=game({profile:{...game().profile,position:{x:60,y:65},version:4}});
  const h=harness({rpc:name=>({data:name==='get_farm_v3_plaza'?{page:0,total:0,items:[]}:result(saved,{event:{kind:'plaza'}})})});h.api.applyState(game());
  let prevented=false;const board={insideRoot:true};h.root.handlers.keydown({target:{closest:()=>board},key:'ArrowRight',shiftKey:true,preventDefault(){prevented=true;}});
  h.api.applyState(game({profile:{...game().profile,version:3}}));h.submit({nickname:'이동',public:'on'});await h.settle();
  assert.equal(prevented,true);assert.deepEqual(h.calls[0].params.p_payload.position,{x:60,y:65});assert.equal(h.calls[0].params.p_payload.version,0);
  for(const position of [{x:'50',y:65},{x:96,y:65},{x:5,y:14},{x:NaN,y:65},null])assert.equal(h.api.applyState(game({profile:{...game().profile,position}})),false);
});

test('speech input stays a local draft, shares profile version with moves and saves text intact',async()=>{
  const speech='말랑 🫠 <b>안녕</b>',saved=game({profile:{...game().profile,speech,position:{x:60,y:65},version:4}});
  const h=harness({rpc:name=>({data:name==='get_farm_v3_plaza'?{total:0,page:0,items:[]}:result(saved,{event:{kind:'plaza'}})})});h.api.applyState(game());
  const fields={nickname:'농부',public:'on',speech};
  h.root.handlers.input({target:{closest:()=>({fields})}});
  assert.equal(h.calls.length,0);assert.equal(h.api.snapshot().profile.speech,'');
  h.api.applyState(game({profile:{...game().profile,version:3}}));
  const board={insideRoot:true};h.root.handlers.keydown({target:{closest:()=>board},key:'ArrowRight',shiftKey:true,preventDefault(){}});
  h.submit(fields);await h.settle();
  const payload=h.calls.find(c=>c.name==='perform_my_farm_v3_action').params.p_payload;
  assert.equal(payload.speech,speech);assert.equal(payload.version,0);assert.deepEqual(payload.position,{x:60,y:65});
  assert.equal(h.api.snapshot().profile.speech,speech);assert.equal(h.storage.size,0);
});

test('098 servers keep free position saves available and omit unsupported speech',async()=>{
  const old=game();delete old.plazaSpeechVersion;delete old.profile.speech;
  const h=harness({rpc:name=>({data:name==='get_farm_v3_plaza'?{total:1,page:0,items:[{id:'someone',nickname:'이전 주민',characterId:'sprout-slime',position:{x:25,y:60}}]}:result(old)})});
  assert.equal(h.api.applyState(old),true);assert.equal(h.api.snapshot().plazaSpeechVersion,0);assert.equal(h.api.snapshot().profile.speech,'');
  assert.equal(await h.api.loadPlaza(),true);
  h.submit({nickname:'이전 주민',public:'on',speech:'지원 전 대사'});await h.settle();
  const payload=h.calls.find(c=>c.name==='perform_my_farm_v3_action').params.p_payload;
  assert.equal('speech' in payload,false);assert.deepEqual(payload.position,{x:50,y:65});
});

test('invalid speech cannot poison a current state or send a save, and 80 emoji fit',async()=>{
  const h=harness({rpc:name=>({data:name==='get_farm_v3_plaza'?{total:0,page:0,items:[]}:result(game())})});
  for(const speech of [null,12,'가'.repeat(81),'줄\n바꿈','제어\u0085']){
    assert.equal(h.api.applyState(game({profile:{...game().profile,speech}})),false);
  }
  h.api.applyState(game());h.submit({nickname:'농부',speech:'가'.repeat(81)});await h.settle();assert.equal(h.calls.length,0);
  h.submit({nickname:'농부',speech:'🫠'.repeat(80)});await h.settle();assert.equal(h.calls[0].params.p_payload.speech,'🫠'.repeat(80));
});

test('older servers cannot display or re-equip automatic props; manual placements become available after upgrade',async()=>{
  const old=game({profile:{...game().profile,decorations:['well','flowers']}});delete old.manualDecorVersion;
  const h=harness({rpc:()=>({data:result(game())})});assert.equal(h.api.applyState(old),true);
  assert.equal(h.api.snapshot().manualDecorVersion,0);assert.deepEqual(clone(h.api.snapshot().profile.decorations),[]);
  h.root.querySelectorAll=()=>[{dataset:{fvDecor:'well'}}];
  const event={target:{closest:()=>null,dataset:{fvDecor:'well'}}};h.root.handlers.change(event);await h.settle();assert.equal(h.calls.length,0);
  const upgraded=game({profile:{...game().profile,decorations:['well']},unlocks:[...game().unlocks,{kind:'decor',id:'well'}]});
  assert.equal(h.api.applyState(upgraded),true);assert.deepEqual(clone(h.api.snapshot().profile.decorations),['well']);
  h.root.querySelectorAll=()=>[];h.root.handlers.change(event);await h.settle();assert.equal(h.calls[0].params.p_action,'decor');assert.deepEqual(h.calls[0].params.p_payload.decorations,[]);
});

test('free watering uses the server clock, serializes repeated clicks and stays free with negative Coin',async()=>{
  const serverTime=Date.now()+3600000,stamp=new Date(serverTime).toISOString();
  const initial=game({wateringVersion:1,serverNow:stamp,coinBalance:-3,runs:[run({waterReadyAt:new Date(serverTime-1).toISOString()})]});
  const saved=game({wateringVersion:1,serverNow:stamp,coinBalance:-3,runs:[run({progress:1,waterReadyAt:new Date(serverTime+5*3600000).toISOString()})]});
  const gate=deferred(),h=harness({coins:-3,rpc:()=>gate.promise});assert.equal(h.api.applyState(initial),true);
  h.click('water',{run:'run-1'});h.click('water',{run:'run-1'});await tick();assert.equal(h.calls.length,1);
  assert.deepEqual(h.calls[0].params.p_payload,{runId:'run-1'});assert.equal(h.storage.size,1);
  gate.resolve({data:result(saved,{event:{kind:'watered',growth:1}})});await h.settle();assert.equal(h.ctx.state.coins,-3);assert.equal(h.api.snapshot().runs[0].progress,1);assert.equal(h.storage.size,0);
  h.click('water',{run:'run-1'});await h.settle();assert.equal(h.calls.length,1,'Cooldown blocks another send');
});

test('watering rejects missing capability, completed/fish runs and malformed clocks without blocking old farms',async()=>{
  const h=harness();h.api.applyState(game({runs:[run()]}));h.click('water',{run:'run-1'});await h.settle();assert.equal(h.calls.length,0);
  const latest=()=>game({wateringVersion:1,serverNow:new Date().toISOString(),runs:[run({waterReadyAt:null})]});
  for(const waterReadyAt of [undefined,123,'bad timestamp']){const bad=latest();bad.runs[0].waterReadyAt=waterReadyAt;assert.equal(h.api.applyState(bad),false);}
  const complete=latest();complete.runs[0].progress=3;assert.equal(h.api.applyState(complete),true);h.click('water',{run:'run-1'});await h.settle();assert.equal(h.calls.length,0);
  const fish=latest();fish.runs=[run({kind:'fish',itemId:'minnow',slot:null,waterReadyAt:null})];assert.equal(h.api.applyState(fish),true);h.click('water',{run:'run-1'});await h.settle();assert.equal(h.calls.length,0);
  const badClock=latest();badClock.serverNow='invalid';assert.equal(h.api.applyState(badClock),false);
});
