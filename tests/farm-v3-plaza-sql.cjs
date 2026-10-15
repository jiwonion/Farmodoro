const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {createDatabase}=require('./helpers/farm-v3-db.cjs');
(async()=>{
  const h=await createDatabase({positions:false}),{db,scalar,setUser,rpc,user,other}=h;
  const state=()=>rpc('get_my_farm_v3_state');
  const act=(action,payload={},request=randomUUID())=>rpc('perform_my_farm_v3_action',{p_action:action,p_payload:payload,p_request_id:request});
  try{
    let old=await state();await db.query("update public.farm_v3_profiles set plaza_zone='bench',plaza_pose='sit' where user_id=$1",[user]);
    // One legitimately acquired friend must survive a later difficulty increase.
    await db.query("insert into public.farm_v3_collections(user_id,kind,item_id,total) values($1,'fish','minnow',1)",[user]);
    old=await state();assert.ok(old.unlocks.some(i=>i.id==='aqua-slime'));
    const oldVersion=old.profile.version,oldAvatar=await scalar('select avatar from public.farm_v3_profiles where user_id=$1',[user]);
    await db.exec(h.source('098_plaza_positions_and_character_goals.sql'));
    let game=await state();assert.equal(game.plazaPositionVersion,1);assert.deepEqual(game.profile.position,{x:22,y:41});assert.equal(game.profile.version,oldVersion+1);
    assert.equal(game.profile.pose,'sit');assert.equal(game.profile.zone,'bench');assert.ok(game.unlocks.some(i=>i.id==='aqua-slime'));
    const goals=Object.fromEntries(game.catalog.filter(i=>i.kind==='character').map(i=>[i.id,[i.harvests,i.fish]]));
    assert.deepEqual(goals,{'sprout-slime':[0,0],'aqua-slime':[0,10],'berry-slime':[25,0],mushroom:[60,0],'jelly-cat':[120,0],'cloud-puff':[100,60],'star-slime':[0,150],'royal-slime':[300,200]});
    await db.query('update public.farm_wallets set coin_balance=-9,farm_money_balance=123 where user_id=$1',[user]);
    const payload={version:game.profile.version,nickname:'내 자리',public:true,position:{x:68.123,y:72.568}},request=randomUUID();
    const moved=await act('plaza',payload,request);assert.deepEqual(moved.game.profile.position,{x:68.12,y:72.57});assert.equal(moved.wallet.coinBalance,-9);assert.equal(moved.wallet.farmMoneyBalance,123);
    assert.equal((await act('plaza',payload,request)).game.profile.version,moved.game.profile.version);
    await assert.rejects(act('plaza',payload),/PROFILE_CHANGED/);
    for(const position of [null,[],{x:'50',y:65},{x:50},{x:4.99,y:65},{x:95.01,y:65},{x:50,y:14.99},{x:50,y:95.01},{x:{},y:65}]){
      await assert.rejects(act('plaza',{...payload,version:moved.game.profile.version,position}),/INVALID_POSITION/);
    }
    let plaza=await rpc('get_farm_v3_plaza');assert.equal(plaza.total,1);assert.deepEqual(plaza.items[0].position,{x:68.12,y:72.57});
    assert.deepEqual(Object.keys(plaza.items[0]).sort(),['id','nickname','characterId','position','pose','zone','isMe'].sort());
    // Older forms may update nickname/public status without resetting coordinates.
    const legacy=await act('plaza',{version:moved.game.profile.version,nickname:'옛 화면',public:true,pose:'stand',zone:'tree'});
    assert.deepEqual(legacy.game.profile.position,{x:68.12,y:72.57});
    await setUser(other);game=await state();assert.equal(game.profile.plazaPublic,false);assert.deepEqual(game.profile.position,{x:50,y:65});
    await assert.rejects(act('character',{version:game.profile.version,characterId:'aqua-slime'}),/LOCKED/);
    const mine=await act('plaza',{version:game.profile.version,nickname:'나만 이동',public:false,position:{x:5,y:95},userId:user});
    assert.deepEqual(mine.game.profile.position,{x:5,y:95});plaza=await rpc('get_farm_v3_plaza');assert.equal(plaza.total,1);assert.deepEqual(plaza.items[0].position,{x:68.12,y:72.57});
    await db.exec('set role authenticated');assert.equal(Number(await scalar('select count(*) from public.farm_v3_profiles')),1);
    await assert.rejects(db.exec('update public.farm_v3_profiles set plaza_x=50'),/permission denied/);await db.exec('reset role');
    // Updated requirements use the same lifetime counters and require both goals.
    await db.query("insert into public.farm_v3_collections(user_id,kind,item_id,total) values($1,'crop','carrot',24),($1,'fish','minnow',9)",[other]);
    game=await state();assert.equal(game.unlocks.some(i=>i.id==='berry-slime'||i.id==='aqua-slime'),false);
    await db.query("update public.farm_v3_collections set total=case when kind='crop' then 25 else 10 end where user_id=$1",[other]);
    game=await state();assert.ok(game.unlocks.some(i=>i.id==='berry-slime'));assert.ok(game.unlocks.some(i=>i.id==='aqua-slime'));
    await db.query("update public.farm_v3_collections set total=case when kind='crop' then 299 else 200 end where user_id=$1",[other]);game=await state();assert.equal(game.unlocks.some(i=>i.id==='royal-slime'),false);
    await db.query("update public.farm_v3_collections set total=300 where user_id=$1 and kind='crop'",[other]);game=await state();assert.equal(game.unlocks.filter(i=>i.kind==='character').length,8);
    const beforeReapply=await state();await db.exec(h.source('098_plaza_positions_and_character_goals.sql'));assert.deepEqual(await state(),beforeReapply);
    assert.deepEqual(await scalar('select avatar from public.farm_v3_profiles where user_id=$1',[user]),oldAvatar);
    await setUser(user);game=await state();await act('plaza',{version:game.profile.version,nickname:'숨기기',public:false,position:game.profile.position});assert.equal((await rpc('get_farm_v3_plaza')).total,0);
    await setUser(null);await assert.rejects(state(),/Authentication/);await assert.rejects(rpc('get_farm_v3_plaza'),/Authentication/);
    console.log('PASS: harder thresholds, permanent ownership, free saved positions, coordinate bounds/types, durable retries, version conflicts, own-user writes, opt-in public coordinates, legacy read/forms compatibility, atomic upgrade and safe reapply, preserved avatars/wallets.');
  }finally{await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
