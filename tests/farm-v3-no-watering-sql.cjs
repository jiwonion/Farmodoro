const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {createDatabase}=require('./helpers/farm-v3-db.cjs');
const stable=game=>{game=JSON.parse(JSON.stringify(game));delete game.serverNow;return game;};
const retiredShape=game=>{game=stable(game);game.wateringVersion=0;for(const run of game.runs)run.waterReadyAt=null;return game;};
(async()=>{
  const h=await createDatabase({removeWatering:false}),{db,scalar,setUser,rpc,user,other}=h;
  const state=()=>rpc('get_my_farm_v3_state');
  const act=(action,payload={},request=randomUUID())=>rpc('perform_my_farm_v3_action',{p_action:action,p_payload:payload,p_request_id:request});
  const raw=async()=>{
    const result={};
    for(const table of ['farm_v3_runs','farm_v3_collections','farm_v3_unlocks','farm_v3_profiles','farm_wallets','farm_wallet_ledger','farm_wallet_idempotency','farm_action_log'])
      result[table]=await scalar(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from public.${table} t`);
    return result;
  };
  try{
    // Build real 103 activity, including free growth, paid growth, completed crops,
    // active fishing and a durable pending request before applying the new migration.
    let game=await state();assert.equal(game.wateringVersion,1);
    await db.query('update public.farm_wallets set coin_balance=50,farm_money_balance=789 where user_id=$1',[user]);
    let planted=await act('plant',{itemId:'carrot',slot:0});const cropId=planted.game.runs.find(run=>run.slot===0).id;
    assert.equal(planted.game.coinBalance,50,'Planting remains free before retirement');
    const waterRequest=randomUUID();await act('water',{runId:cropId},waterRequest);
    const growRequest=randomUUID();await act('grow',{runId:cropId,amount:1},growRequest);
    planted=await act('plant',{itemId:'potato',slot:1});const secondId=planted.game.runs.find(run=>run.slot===1).id;
    await act('water',{runId:secondId});
    planted=await act('plant',{itemId:'strawberry',slot:2});const completedId=planted.game.runs.find(run=>run.slot===2).id;
    await act('grow',{runId:completedId,amount:100});
    const fishing=await act('fish_start',{itemId:'minnow'}),fishId=fishing.game.runs.find(run=>run.kind==='fish').id;
    await act('fish_grow',{runId:fishId,amount:1});
    game=await state();await act('plaza',{version:game.profile.version,nickname:'보존할 농부',speech:'그대로 유지',position:{x:42,y:63}});
    await db.query("insert into public.farm_v3_collections(user_id,kind,item_id,total) values($1,'fish','minnow',2)",[user]);
    const pendingWater=randomUUID();await db.query("insert into public.farm_action_log(user_id,request_id,action,result) values($1,$2,'farm_v3:water',null)",[user,pendingWater]);
    await setUser(other);await state();await db.query('update public.farm_wallets set coin_balance=-3,farm_money_balance=456 where user_id=$1',[other]);
    const otherPlant=await act('plant',{itemId:'carrot',slot:0}),otherRun=otherPlant.game.runs[0].id;
    await setUser(user);const before=await state(),beforeRaw=await raw();
    assert.ok(before.runs.some(run=>run.waterReadyAt));
    await db.exec(h.source('104_remove_farm_watering.sql'));game=await state();
    assert.deepEqual(stable(game),retiredShape(before));
    assert.deepEqual(await raw(),beforeRaw,'Forward migration changes no player data or historical request logs');
    assert.equal(game.fishUnlockVersion,1);assert.equal(game.catalog.filter(item=>item.kind==='fish').length,24);assert.equal(game.catalog.filter(item=>item.kind==='character').length,16);
    assert.ok(game.runs.every(run=>run.waterReadyAt===null));
    // Old, new, pending, invalid and other-user watering requests all stop before
    // ensure/locks/log reservation. Even an old cached success cannot replay water.
    const rejectedBefore=await raw();
    for(const [payload,request] of [[{runId:cropId},randomUUID()],[{runId:cropId},waterRequest],[{runId:secondId},pendingWater],[{runId:otherRun,userId:other},randomUUID()],[{runId:completedId,amount:100},randomUUID()],[null,null]])
      await assert.rejects(act('water',payload,request),/FARM_V3_WATERING_RETIRED/);
    assert.deepEqual(await raw(),rejectedBefore,'Rejected water cannot alter progress, wallets or request logs');
    await assert.rejects(act('grow',{runId:cropId,amount:1},waterRequest),/FARM_REQUEST_ID_REUSED/);
    await assert.rejects(act('grow',{runId:cropId,amount:1},pendingWater),/FARM_REQUEST_ID_REUSED/);
    // Existing Coin retries still reconstruct the latest state without charging twice.
    const paidRetryBefore=await raw(),retried=await act('grow',{runId:cropId,amount:1},growRequest);
    assert.equal(retried.game.wateringVersion,0);assert.equal(retried.game.runs.find(run=>run.id===cropId).progress,2);
    assert.deepEqual(await raw(),paidRetryBefore);
    await assert.rejects(act('grow',{runId:otherRun,amount:1,userId:other}),/RUN_NOT_FOUND/);
    const balance=game.coinBalance,grown=await act('grow',{runId:cropId,amount:100});
    assert.equal(grown.event.spentCoin,1);assert.equal(grown.game.coinBalance,balance-1,'Only remaining growth spends Coin');
    const claimRequest=randomUUID(),harvest=await act('harvest',{runId:cropId},claimRequest);
    assert.equal(harvest.game.collections.find(item=>item.kind==='crop'&&item.id==='carrot').count,1);
    await act('harvest',{runId:cropId},claimRequest);assert.equal((await state()).collections.find(item=>item.kind==='crop'&&item.id==='carrot').count,1);
    await assert.rejects(act('harvest',{runId:cropId}),/ALREADY_CLAIMED/);
    await assert.rejects(act('water',{runId:cropId},waterRequest),/FARM_V3_WATERING_RETIRED/);
    const freeBefore=await scalar('select to_jsonb(w) from public.farm_wallets w where user_id=$1',[user]);
    const freeRequest=randomUUID();await act('plant',{itemId:'carrot',slot:0},freeRequest);await act('plant',{itemId:'carrot',slot:0},freeRequest);
    assert.deepEqual(await scalar('select to_jsonb(w) from public.farm_wallets w where user_id=$1',[user]),freeBefore,'Free seed planting remains free and retry-safe');
    const fishBalance=(await state()).coinBalance;await act('fish_grow',{runId:fishId,amount:100});
    const caught=await act('fish_claim',{runId:fishId});
    assert.equal(caught.game.coinBalance,fishBalance-1);assert.ok(caught.event.unlocks.some(item=>item.kind==='fish'&&item.id==='carp'),'Species-specific unlocks still happen on the exact catch');
    await setUser(other);assert.equal((await state()).coinBalance,-3);const negativeBefore=await raw();
    await assert.rejects(act('grow',{runId:otherRun,amount:1}),/INSUFFICIENT_COIN/);
    await assert.rejects(act('water',{runId:otherRun}),/FARM_V3_WATERING_RETIRED/);assert.deepEqual(await raw(),negativeBefore);
    const zeroPlant=await act('plant',{itemId:'potato',slot:1});assert.equal(zeroPlant.game.coinBalance,-3,'Planting is free even with a negative balance');
    await db.query("update public.farm_v3_runs set started_at=now()-interval '90 days',last_watered_at=now()-interval '90 days' where id=$1",[otherRun]);
    assert.equal((await state()).runs.find(run=>run.id===otherRun).progress,0,'No passive growth or withering appears after removal');
    await db.exec('set role authenticated');
    await assert.rejects(db.exec('update public.farm_v3_runs set progress=growth_cost'),/permission denied/);
    assert.equal(await scalar("select has_function_privilege('authenticated','public.perform_my_farm_v3_action(text,jsonb,uuid)','EXECUTE')"),true);
    assert.equal(await scalar("select has_function_privilege('anon','public.perform_my_farm_v3_action(text,jsonb,uuid)','EXECUTE')"),false);
    assert.equal(await scalar("select has_function_privilege('authenticated','public.farm_v3_state_json(uuid)','EXECUTE')"),false);
    await assert.rejects(act('water',{runId:otherRun}),/FARM_V3_WATERING_RETIRED/);await db.exec('reset role');
    await setUser(user);const final=stable(await state()),finalRaw=await raw();
    await db.exec(h.source('104_remove_farm_watering.sql'));assert.deepEqual(stable(await state()),final);assert.deepEqual(await raw(),finalRaw);
    const upgrade=fs.readFileSync(path.join(__dirname,'../supabase/operations/2026-10-15-upgrade-farm-v3.sql'),'utf8');
    assert.equal((upgrade.match(/^begin;$/gm)||[]).length,1);assert.equal((upgrade.match(/^commit;$/gm)||[]).length,1);assert.ok(upgrade.includes('-- 104_remove_farm_watering.sql'));
    await db.exec(upgrade);assert.deepEqual(stable(await state()),final);assert.deepEqual(await raw(),finalRaw,'Atomic095-104 reapply preserves all player rows');
    await assert.rejects(act('water',{runId:secondId},pendingWater),/FARM_V3_WATERING_RETIRED/);
    await setUser(null);await assert.rejects(state(),/Authentication/);await assert.rejects(act('water',{runId:cropId}),/Authentication/);
    console.log('PASS: 104 retains old free/paid growth, runs, profiles, ownership, wallets and logs; rejects new/cached/pending water without mutation; free planting and Coin-only grow/harvest/fishing/retries remain valid; species unlocks, negative balances, RLS and individual/atomic reapply.');
  }finally{await db.close();}
  // The default fixture now mirrors current installations from a fresh account.
  const fresh=await createDatabase();try{const game=await fresh.rpc('get_my_farm_v3_state');assert.equal(game.wateringVersion,0);assert.equal(game.fishUnlockVersion,1);}finally{await fresh.db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
