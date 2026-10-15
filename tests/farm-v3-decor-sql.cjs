const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {createDatabase}=require('./helpers/farm-v3-db.cjs');
(async()=>{
  const h=await createDatabase({decor:false}),{db,scalar,setUser,rpc,user,other}=h;
  const state=()=>rpc('get_my_farm_v3_state');
  const act=(action,payload={},request=randomUUID())=>rpc('perform_my_farm_v3_action',{p_action:action,p_payload:payload,p_request_id:request});
  try{
    await state();
    await db.query("insert into public.farm_v3_collections(user_id,kind,item_id,total) values($1,'crop','carrot',8),($1,'crop','potato',3),($1,'crop','pumpkin',3),($1,'fish','minnow',8)",[user]);
    let game=await state();assert.equal(game.profile.decorations.length,6,'Reproduces the old automatic placement');
    await db.query('update public.farm_wallets set coin_balance=20,farm_money_balance=123 where user_id=$1',[user]);
    await db.query("update public.farm_v3_profiles set plaza_x=34,plaza_y=71,plaza_message='말랑한 하루' where user_id=$1",[user]);
    const planted=await act('plant',{itemId:'carrot',slot:0});await act('grow',{runId:planted.game.runs[0].id,amount:1});
    const before=await state();await db.exec(h.source('101_manual_farm_decorations.sql'));
    game=await state();assert.equal(game.manualDecorVersion,1);assert.deepEqual(game.profile.decorations,[]);assert.equal(game.profile.version,before.profile.version+1);
    for(const key of ['coinBalance','runs','collections','unlocks','catalog'])assert.deepEqual(game[key],before[key],key);
    for(const key of ['characterId','position','speech','nickname'])assert.deepEqual(game.profile[key],before.profile[key],key);
    const request=randomUUID(),payload={version:game.profile.version,decorations:['well','flowers']};
    const manual=await act('decor',payload,request);assert.deepEqual([...manual.game.profile.decorations].sort(),['flowers','well']);assert.equal(manual.wallet.coinBalance,19);assert.equal(manual.wallet.farmMoneyBalance,123);
    assert.equal((await act('decor',payload,request)).game.profile.version,manual.game.profile.version);
    await assert.rejects(act('decor',payload),/PROFILE_CHANGED/);
    await db.exec(h.source('101_manual_farm_decorations.sql'));assert.deepEqual(await state(),manual.game,'Manual placements survive reapply');
    await setUser(other);game=await state();assert.deepEqual(game.profile.decorations,[]);assert.equal(await scalar('select decor_manual_ready from public.farm_v3_profiles where user_id=$1',[other]),true);
    await assert.rejects(act('decor',{version:game.profile.version,decorations:['well']}),/LOCKED/);
    await db.query('update public.farm_wallets set coin_balance=10 where user_id=$1',[other]);
    const start=await act('plant',{itemId:'carrot',slot:0});await act('grow',{runId:start.game.runs[0].id,amount:3});
    const claimRequest=randomUUID(),harvest=await act('harvest',{runId:start.game.runs[0].id},claimRequest);
    assert.ok(harvest.event.unlocks.some(i=>i.kind==='decor'&&i.id==='sign'));assert.deepEqual(harvest.game.profile.decorations,[]);assert.equal(harvest.game.profile.version,game.profile.version);
    assert.deepEqual((await act('harvest',{runId:start.game.runs[0].id},claimRequest)).game.profile.decorations,[]);
    const selected=await act('decor',{version:harvest.game.profile.version,decorations:['sign']});assert.deepEqual(selected.game.profile.decorations,['sign']);
    await setUser(user);assert.deepEqual([...((await state()).profile.decorations)].sort(),['flowers','well']);
    await db.exec('set role authenticated');await assert.rejects(db.exec('update public.farm_v3_profiles set decor_manual_ready=false'),/permission denied/);await db.exec('reset role');
    console.log('PASS: reproduces old auto props, one-time placement cleanup, preserved ownership/wallet/run/character/plaza, real harvest unlock without equipping, explicit free selection, locked items and conflicts, durable retries, owner-only writes and atomic reapply preserving manual choices.');
  }finally{await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
