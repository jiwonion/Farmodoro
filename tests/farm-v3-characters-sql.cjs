const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createDatabase}=require('./helpers/farm-v3-db.cjs');
(async()=>{
  const h=await createDatabase({characters:false}),{db,scalar,setUser,rpc,user,other}=h;
  const state=()=>rpc('get_my_farm_v3_state');
  const act=(action,payload={},request=randomUUID())=>rpc('perform_my_farm_v3_action',{p_action:action,p_payload:payload,p_request_id:request});
  try{
    // Upgrade a real pre-existing avatar. Its JSON, outfits and wallet are history.
    const old=await state(),oldAvatar={...old.profile.avatar,gender:'female',outfit:'green',top:'green',bottom:'green',shoes:'cream',eyes:1};
    await db.query('update public.farm_v3_profiles set avatar=$1::jsonb where user_id=$2',[JSON.stringify(oldAvatar),user]);
    await db.query('update public.farm_wallets set coin_balance=-3,farm_money_balance=789 where user_id=$1',[user]);
    const ownedBefore=await scalar("select jsonb_agg(to_jsonb(u) order by kind,item_id) from public.farm_v3_unlocks u where user_id=$1",[user]);
    const versionBefore=old.profile.version;await db.exec(h.source('097_representative_characters.sql'));
    assert.equal(Number(await scalar('select version from public.farm_v3_profiles where user_id=$1',[user])),versionBefore+1);
    let game=await state();assert.equal(game.charactersVersion,1);assert.equal(game.profile.characterId,'sprout-slime');assert.equal(game.coinBalance,-3);
    assert.equal(game.profile.avatar,undefined);assert.deepEqual(await scalar('select avatar from public.farm_v3_profiles where user_id=$1',[user]),oldAvatar);
    assert.deepEqual(await scalar("select jsonb_agg(to_jsonb(u) order by kind,item_id) from public.farm_v3_unlocks u where user_id=$1 and kind<>'character'",[user]),ownedBefore);
    assert.equal(game.catalog.filter(i=>i.kind==='character').length,8);assert.equal(game.catalog.some(i=>['hat','outfit'].includes(i.kind)),false);
    assert.deepEqual(game.unlocks.filter(i=>i.kind==='character').map(i=>i.id),['sprout-slime']);
    for(const id of ['berry-slime','royal-slime'])await assert.rejects(act('character',{version:game.profile.version,characterId:id}),/LOCKED/);
    for(const id of ['missing',null,{},'blue'])await assert.rejects(act('character',{version:game.profile.version,characterId:id}),/UNKNOWN_CHARACTER/);
    // Selection is free even with a negative Coin balance; retries never rewrite it.
    const request=randomUUID(),chosen=await act('character',{version:game.profile.version,characterId:'sprout-slime'},request);
    assert.equal(chosen.wallet.coinBalance,-3);assert.equal(chosen.wallet.farmMoneyBalance,789);
    assert.equal((await act('character',{version:game.profile.version,characterId:'sprout-slime'},request)).game.profile.version,chosen.game.profile.version);
    await assert.rejects(act('character',{version:game.profile.version,characterId:'sprout-slime'}),/PROFILE_CHANGED/);
    await assert.rejects(act('avatar',{version:chosen.game.profile.version,avatar:oldAvatar}),/AVATAR_RETIRED/);
    // The first actual catch grants the water mascot. It is not a client flag.
    await db.query('update public.farm_wallets set coin_balance=30 where user_id=$1',[user]);
    let run=(await act('fish_start',{itemId:'minnow'})).game.runs.find(r=>r.kind==='fish');
    await act('fish_grow',{runId:run.id,amount:2});const caught=await act('fish_claim',{runId:run.id});
    assert.ok(caught.event.unlocks.some(i=>i.kind==='character'&&i.id==='aqua-slime'));
    let selected=await act('character',{version:caught.game.profile.version,characterId:'aqua-slime'});assert.equal(selected.wallet.coinBalance,28);
    assert.equal((await act('character',{version:game.profile.version,characterId:'sprout-slime'},request)).game.profile.characterId,'aqua-slime','An old retry must not restore an old choice');
    // Reach a threshold through harvesting and include the unlock in that response.
    await db.query("insert into public.farm_v3_collections(user_id,kind,item_id,total) values($1,'crop','carrot',2)",[user]);
    run=(await act('plant',{itemId:'carrot',slot:0})).game.runs.find(r=>r.kind==='crop');
    await act('grow',{runId:run.id,amount:3});const harvested=await act('harvest',{runId:run.id});
    assert.ok(harvested.event.unlocks.some(i=>i.kind==='character'&&i.id==='berry-slime'));
    selected=await act('character',{version:harvested.game.profile.version,characterId:'berry-slime'});assert.equal(selected.wallet.coinBalance,25);
    const publicResult=await act('plaza',{version:selected.game.profile.version,nickname:'딸기 주민',public:true,pose:'sit',zone:'bench'});
    let plaza=await rpc('get_farm_v3_plaza');assert.equal(plaza.total,1);assert.equal(plaza.items[0].characterId,'berry-slime');
    assert.deepEqual(Object.keys(plaza.items[0]).sort(),['id','nickname','characterId','pose','zone','isMe'].sort());
    await setUser(other);game=await state();assert.equal(game.profile.characterId,'sprout-slime');assert.equal(game.profile.plazaPublic,false);
    await assert.rejects(act('character',{version:game.profile.version,characterId:'berry-slime'}),/LOCKED/);
    assert.equal((await rpc('get_farm_v3_plaza')).items.length,1);
    await db.exec('set role authenticated');assert.equal(Number(await scalar('select count(*) from public.farm_v3_profiles')),1);
    await assert.rejects(db.exec("update public.farm_v3_profiles set character_id='royal-slime'"),/permission denied/);await db.exec('reset role');await setUser(user);
    // Combined thresholds require both totals. Previously collected items count.
    await db.query("update public.farm_v3_collections set total=24 where user_id=$1 and kind='crop'",[user]);
    await db.query("update public.farm_v3_collections set total=20 where user_id=$1 and kind='fish'",[user]);
    game=await state();assert.ok(game.unlocks.some(i=>i.id==='cloud-puff'));assert.ok(game.unlocks.some(i=>i.id==='star-slime'));
    assert.equal(game.unlocks.some(i=>i.id==='royal-slime'),false);
    await db.query("update public.farm_v3_collections set total=25 where user_id=$1 and kind='crop'",[user]);
    game=await state();assert.equal(game.unlocks.filter(i=>i.kind==='character').length,8);
    const crowned=await act('character',{version:game.profile.version,characterId:'royal-slime'});assert.equal(crowned.wallet.coinBalance,25);
    assert.equal((await rpc('get_farm_v3_plaza')).items[0].characterId,'royal-slime');
    const beforeReapply=await state();await db.exec(h.source('097_representative_characters.sql'));assert.deepEqual(await state(),beforeReapply);
    for(const migration of ['095_farm_v3_world.sql','096_avatar_parts.sql','097_representative_characters.sql'])await db.exec(h.source(migration));
    assert.deepEqual(await state(),beforeReapply);assert.deepEqual(await scalar('select avatar from public.farm_v3_profiles where user_id=$1',[user]),oldAvatar);
    assert.equal(Number(await scalar("select count(*) from public.farm_v3_catalog where kind in ('outfit','hat')")),20);
    for(const name of ['farm_v3_refresh_unlocks(uuid)','farm_v3_state_json(uuid)','farm_v3_normalize_avatar(uuid,jsonb,jsonb)'])assert.equal(await scalar("select has_function_privilege('authenticated',$1,'EXECUTE')",['public.'+name]),false);
    await setUser(null);await assert.rejects(state(),/Authentication/);await assert.rejects(rpc('get_farm_v3_plaza'),/Authentication/);
    await db.query('delete from auth.users where id=$1',[other]);assert.equal(Number(await scalar('select count(*) from public.farm_v3_profiles where user_id=$1',[other])),0);
    console.log('PASS: eight server-owned character unlocks, real catch/harvest rewards, free durable selection, version conflicts, unknown/locked/other-user rejection, saved opt-in plaza, preserved legacy avatars/outfits/wallets, safe migration reapply and RLS.');
  }finally{await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
