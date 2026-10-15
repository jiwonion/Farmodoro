const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createDatabase}=require('./helpers/farm-v3-db.cjs');
const stable=game=>{game=JSON.parse(JSON.stringify(game));delete game.serverNow;return game;};
(async()=>{
  const h=await createDatabase({fishPaths:false}),{db,scalar,setUser,rpc,user,other}=h;
  const state=()=>rpc('get_my_farm_v3_state');
  const act=(action,payload={},request=randomUUID())=>rpc('perform_my_farm_v3_action',{p_action:action,p_payload:payload,p_request_id:request});
  const collected=async(kind,id,count)=>db.query('insert into public.farm_v3_collections(user_id,kind,item_id,total) values($1,$2,$3,$4) on conflict(user_id,kind,item_id) do update set total=excluded.total',[other,kind,id,count]);
  const owned=(game,kind,id)=>game.unlocks.some(item=>item.kind===kind&&item.id===id);
  try{
    // Upgrade a farmer who already unlocked every legacy fish by total catches.
    let game=await state();assert.equal(game.fishUnlockVersion,undefined);assert.equal(game.catalog.filter(item=>item.kind==='fish').length,8);
    await db.query("insert into public.farm_v3_collections(user_id,kind,item_id,total) values($1,'fish','minnow',500)",[user]);
    await db.query('update public.farm_wallets set coin_balance=20,farm_money_balance=789 where user_id=$1',[user]);
    game=await state();const started=await act('fish_start',{itemId:'minnow'}),existingRun=started.game.runs.find(run=>run.kind==='fish');
    await act('fish_grow',{runId:existingRun.id,amount:1});
    game=(await act('character',{version:game.profile.version,characterId:'aqua-slime'})).game;
    await db.query('update public.farm_wallets set coin_balance=-3 where user_id=$1',[user]);
    const before=await state(),walletBefore=await scalar('select to_jsonb(w) from public.farm_wallets w where user_id=$1',[user]);
    const ledgerBefore=await scalar('select jsonb_agg(to_jsonb(l)) from public.farm_wallet_ledger l where user_id=$1',[user]);
    assert.equal(before.unlocks.filter(item=>item.kind==='fish').length,8);
    await db.exec(h.source('103_fish_species_paths_and_friends.sql'));game=await state();
    assert.equal(game.fishUnlockVersion,1);assert.equal(game.cropUnlockVersion,1);assert.equal(game.wateringVersion,1);assert.equal(game.manualDecorVersion,1);
    assert.deepEqual(game.profile,before.profile);assert.deepEqual(game.runs,before.runs);assert.deepEqual(game.collections,before.collections);
    assert.deepEqual(game.unlocks,before.unlocks,'Previously acquired unlocks remain owned even without new prerequisites');
    assert.deepEqual(await scalar('select to_jsonb(w) from public.farm_wallets w where user_id=$1',[user]),walletBefore);
    assert.deepEqual(await scalar('select jsonb_agg(to_jsonb(l)) from public.farm_wallet_ledger l where user_id=$1',[user]),ledgerBefore);
    assert.equal(game.catalog.filter(item=>item.kind==='fish').length,24);assert.equal(game.catalog.filter(item=>item.kind==='character').length,16);
    const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../farm-v3-catalog.js'),'utf8'),context);
    const canonical=JSON.parse(JSON.stringify(context.window.FarmV3Catalog.items));
    for(const item of canonical){
      const actual=game.catalog.find(entry=>entry.kind===item.kind&&entry.id===item.id);
      assert.ok(actual,`${item.kind}:${item.id} is included in server catalog`);
      for(const key of ['name','cost','harvests','fish','cropTypes','fishTypes','cropRequirements','fishRequirements'])assert.deepEqual(actual[key],item[key],`${item.id}.${key}`);
    }
    // A fresh farmer gets two starters. Requirements come from the server.
    await setUser(other);game=await state();assert.deepEqual(game.unlocks.filter(item=>item.kind==='fish').map(item=>item.id),['crucian','minnow']);
    const fish=game.catalog.filter(item=>item.kind==='fish'),characters=game.catalog.filter(item=>item.kind==='character');
    assert.equal(fish.every(item=>item.harvests===0&&item.fish===0&&item.cropTypes===0&&item.fishTypes===0),true);
    const reachable=new Set(fish.filter(item=>!item.fishRequirements.length).map(item=>item.id));
    for(let pass=0;pass<fish.length;pass++)for(const item of fish)if(item.fishRequirements.every(req=>reachable.has(req.id)))reachable.add(item.id);
    assert.equal(reachable.size,24,'All fish paths are reachable without dead ends or cycles');
    assert.deepEqual(fish.find(item=>item.id==='carp').fishRequirements,[{id:'minnow',count:3}]);
    assert.deepEqual(fish.find(item=>item.id==='trout').fishRequirements,[{id:'crucian',count:3}]);
    assert.deepEqual(fish.find(item=>item.id==='catfish').fishRequirements,[{id:'carp',count:4}]);
    await assert.rejects(act('fish_start',{itemId:'carp',fishRequirements:[],fish:0,unlocked:true}),/LOCKED/);
    await assert.rejects(act('character',{version:game.profile.version,characterId:'dragon-sprout'}),/LOCKED/);
    await assert.rejects(act('character',{version:game.profile.version,characterId:'unknown-friend'}),/UNKNOWN_CHARACTER/);
    await assert.rejects(act('fish_grow',{runId:existingRun.id,amount:1,userId:user}),/RUN_NOT_FOUND/);
    await db.query('update public.farm_wallets set coin_balance=100 where user_id=$1',[other]);
    await collected('fish','minnow',2);game=await state();assert.equal(owned(game,'fish','carp'),false);
    let run=(await act('fish_start',{itemId:'minnow'})).game.runs.find(item=>item.kind==='fish');
    const growRequest=randomUUID();await act('fish_grow',{runId:run.id,amount:2},growRequest);await act('fish_grow',{runId:run.id,amount:2},growRequest);
    const claimRequest=randomUUID(),caught=await act('fish_claim',{runId:run.id},claimRequest);game=caught.game;
    assert.equal(game.coinBalance,98);assert.equal(game.collections.find(item=>item.kind==='fish'&&item.id==='minnow').count,3);
    assert.ok(caught.event.unlocks.some(item=>item.kind==='fish'&&item.id==='carp'),'The catch that completes a species prerequisite returns its unlock');
    assert.equal(owned(game,'fish','trout'),false);assert.equal(owned(game,'fish','catfish'),false);
    await act('fish_claim',{runId:run.id},claimRequest);assert.equal((await state()).collections.find(item=>item.kind==='fish'&&item.id==='minnow').count,3);
    await assert.rejects(act('fish_claim',{runId:run.id}),/ALREADY_CLAIMED/);
    await collected('fish','carp',3);run=(await act('fish_start',{itemId:'carp'})).game.runs.find(item=>item.kind==='fish');
    await act('fish_grow',{runId:run.id,amount:4});game=(await act('fish_claim',{runId:run.id})).game;
    assert.equal(owned(game,'fish','catfish'),true);assert.equal(owned(game,'fish','trout'),false);
    await collected('fish','minnow',500);game=await state();
    for(const id of ['trout','koi','loach','smelt','blueTang','sturgeon'])assert.equal(owned(game,'fish',id),false,`Unrelated catches must not unlock ${id}`);
    assert.equal(owned(game,'character','lotus-slime'),false);assert.equal(owned(game,'character','crystal-slime'),false);
    // Species diversity is an additional AND condition for the new friends.
    for(let index=0;index<fish.length;index++){
      const item=fish[index];assert.equal(owned(await state(),'fish',item.id),true,`${item.id} can be caught along its path`);
      if(item.id!=='minnow')await collected('fish',item.id,8);
      game=await state();
      if(index===6)assert.equal(owned(game,'character','lotus-slime'),false);
      if(index===7)assert.equal(owned(game,'character','lotus-slime'),true);
      if(index===14)assert.equal(owned(game,'character','crystal-slime'),false);
      if(index===15)assert.equal(owned(game,'character','crystal-slime'),true);
    }
    assert.equal(game.unlocks.filter(item=>item.kind==='fish').length,24);
    assert.equal(owned(game,'character','peach-slime'),false);assert.equal(owned(game,'character','dragon-sprout'),false);
    const crops=game.catalog.filter(item=>item.kind==='crop');
    await collected('crop',crops[0].id,450);game=await state();
    assert.equal(owned(game,'character','peach-slime'),false,'Harvest total alone cannot bypass diversity');
    assert.equal(owned(game,'character','dragon-sprout'),false);
    for(let index=1;index<40;index++){
      await collected('crop',crops[index].id,1);game=await state();
      if(index===6)assert.equal(owned(game,'character','peach-slime'),false);
      if(index===7)assert.equal(owned(game,'character','peach-slime'),true);
      if(index===38)assert.equal(owned(game,'character','dragon-sprout'),false);
    }
    assert.equal(game.unlocks.filter(item=>item.kind==='character').length,16);
    assert.equal(characters.every(item=>owned(game,'character',item.id)),true);
    await db.query('update public.farm_wallets set coin_balance=-5 where user_id=$1',[other]);
    const chooseRequest=randomUUID(),chosen=await act('character',{version:game.profile.version,characterId:'dragon-sprout'},chooseRequest);
    assert.equal(chosen.game.profile.characterId,'dragon-sprout');assert.equal(chosen.wallet.coinBalance,-5);
    assert.equal((await act('character',{version:game.profile.version,characterId:'dragon-sprout'},chooseRequest)).game.profile.version,chosen.game.profile.version);
    await assert.rejects(act('character',{version:game.profile.version,characterId:'peach-slime'}),/PROFILE_CHANGED/);
    await setUser(user);assert.equal((await rpc('get_farm_v3_plaza')).items.find(item=>item.id===other).characterId,'dragon-sprout');
    // Read-only configuration and private grants preserve the RPC boundary.
    await db.exec('set role authenticated');assert.equal(Number(await scalar('select count(*) from public.farm_v3_fish_requirements')),22);
    await assert.rejects(db.exec('update public.farm_v3_fish_requirements set need_count=1'),/permission denied/);
    await assert.rejects(db.exec("insert into public.farm_v3_unlocks(user_id,kind,item_id) values('"+user+"','fish','tuna')"),/permission denied/);
    assert.equal(await scalar("select has_function_privilege('authenticated','public.farm_v3_refresh_unlocks(uuid)','EXECUTE')"),false);
    assert.equal(await scalar("select has_function_privilege('authenticated','public.farm_v3_state_json(uuid)','EXECUTE')"),false);
    await db.exec('reset role');
    const final=stable(await state());await db.exec(h.source('103_fish_species_paths_and_friends.sql'));assert.deepEqual(stable(await state()),final);
    await db.exec(h.source('104_remove_farm_watering.sql'));const current=stable(await state());assert.equal(current.wateringVersion,0);
    const expected=JSON.parse(JSON.stringify(final));expected.wateringVersion=0;for(const run of expected.runs)run.waterReadyAt=null;assert.deepEqual(current,expected);
    await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/operations/2026-10-15-upgrade-farm-v3.sql'),'utf8'));assert.deepEqual(stable(await state()),current);
    await setUser(other);assert.equal((await state()).profile.characterId,'dragon-sprout');
    await setUser(null);await assert.rejects(state(),/Authentication/);await assert.rejects(act('fish_start',{itemId:'minnow'}),/Authentication/);
    console.log('PASS: 24 authoritative species paths and 16 friends, two starter fish, canonical catalog parity, exact per-species catch unlocks, unrelated-catch rejection, preserved legacy ownership/runs/profile/wallets, retries, diversity thresholds, new representative selection/plaza, RLS and individual/atomic upgrade reapply.');
  }finally{await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
