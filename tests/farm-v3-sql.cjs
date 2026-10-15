const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createDatabase}=require('./helpers/farm-v3-db.cjs');
(async()=>{
  // Historical 095/096 compatibility checks. Current character selection is tested separately.
  const h=await createDatabase({characters:false});const {db,scalar,setUser,rpc,user,other}=h;
  const state=()=>rpc('get_my_farm_v3_state');
  const act=(action,payload={},request=randomUUID())=>rpc('perform_my_farm_v3_action',{p_action:action,p_payload:payload,p_request_id:request});
  try{
    let game=await state();
    assert.equal(game.catalog.filter(i=>i.kind==='crop').length,57);
    assert.equal(game.catalog.filter(i=>i.kind==='fish').length,8);
    assert.equal(game.catalog.filter(i=>i.kind==='outfit').length,12);
    assert.equal(game.catalog.filter(i=>i.kind==='hat').length,8);
    assert.equal(game.unlocks.filter(i=>i.kind==='crop').length,5);
    assert.equal(game.coinBalance,0);assert.equal(game.profile.plazaPublic,false);
    assert.equal((await rpc('get_my_scenery_state')).archived,true);
    assert.equal(await scalar("select has_function_privilege('authenticated','public.get_farm_leaderboard(date)','EXECUTE')"),false);
    await assert.rejects(scalar("select public.start_my_scenery_creation('tree',null,$1)",[randomUUID()]),/SCENERY_ARCHIVED/);
    const legacyId=randomUUID(),legacyRequest=randomUUID();
    await db.query("insert into public.farm_scenery_creations(id,user_id,type_id,theme_id,growth_cost,reward,progress) values($1,$2,'tree',null,20,50,7)",[legacyId,user]);
    await db.query("insert into public.farm_action_log(user_id,request_id,action,result) values($1,$2,'start_my_scenery_creation',$3::jsonb)",[user,legacyRequest,JSON.stringify({event:{creationId:legacyId,typeId:'tree'}})]);
    assert.equal((await scalar("select public.start_my_scenery_creation('tree',null,$1)",[legacyRequest])).scenery.activeCreation.progress,7);
    await assert.rejects(act('plant',{itemId:'carrot',slot:4}),/INVALID_SLOT/);
    await assert.rejects(act('plant',{itemId:'corn',slot:0}),/LOCKED/);
    await db.query('update public.farm_wallets set coin_balance=40,farm_money_balance=789 where user_id=$1',[user]);
    for(let slot=0;slot<4;slot++)await act('plant',{itemId:['carrot','potato','strawberry','tomato'][slot],slot});
    game=await state();assert.equal(game.runs.length,4);
    await assert.rejects(act('plant',{itemId:'pumpkin',slot:0}),/OCCUPIED/);
    const run=game.runs.find(r=>r.slot===0),request=randomUUID();
    const grown=await act('grow',{runId:run.id,amount:100},request);
    assert.equal(grown.event.spentCoin,3);assert.equal(grown.wallet.coinBalance,37);
    assert.equal((await act('grow',{runId:run.id,amount:100},request)).wallet.coinBalance,37);
    await assert.rejects(act('grow',{runId:run.id,amount:1}),/COMPLETE/);
    const harvestRequest=randomUUID();const harvested=await act('harvest',{runId:run.id},harvestRequest);
    assert.equal(harvested.wallet.coinBalance,37);assert.equal(harvested.wallet.farmMoneyBalance,789);
    assert.ok(harvested.game.unlocks.some(i=>i.kind==='hat'&&i.id==='straw'));
    assert.ok(harvested.game.profile.decorations.includes('sign'));
    assert.equal(harvested.game.collections.find(i=>i.id==='carrot').count,1);
    await act('harvest',{runId:run.id},harvestRequest);
    await assert.rejects(act('harvest',{runId:run.id}),/ALREADY_CLAIMED/);
    await db.query("update public.farm_action_log set created_at=now()-interval '150 days'");
    await scalar('select public.cleanup_stale_farm_actions()');
    assert.equal((await act('harvest',{runId:run.id},harvestRequest)).game.collections.find(i=>i.id==='carrot').count,1);
    await assert.rejects(act('fish_start',{itemId:'salmon'}),/LOCKED/);
    const fishing=await act('fish_start',{itemId:'minnow'});const fishRun=fishing.game.runs.find(r=>r.kind==='fish');
    await assert.rejects(act('fish_start',{itemId:'crucian'}),/OCCUPIED/);
    await assert.rejects(act('fish_claim',{runId:fishRun.id}),/NOT_COMPLETE/);
    await act('fish_grow',{runId:fishRun.id,amount:100});
    const caught=await act('fish_claim',{runId:fishRun.id});
    assert.equal(caught.wallet.coinBalance,35);assert.equal(caught.wallet.farmMoneyBalance,789);
    assert.ok(caught.game.unlocks.some(i=>i.kind==='hat'&&i.id==='bucket'));
    // Production completion reversal creates debt without rolling back collections.
    await db.query('update public.farm_wallets set coin_balance=0 where user_id=$1',[user]);
    for(let i=0;i<3;i++){
      const id=randomUUID();await db.query("insert into public.tasks(id,user_id,status,completed_on,completion_reward,completion_cycle_id) values($1,$2,'done',current_date,1,$3)",[id,user,randomUUID()]);
      await scalar("select public.uncomplete_my_task($1,'waiting')",[id]);
      await scalar("select public.uncomplete_my_task($1,'waiting')",[id]);
    }
    game=await state();assert.equal(game.coinBalance,-3);assert.equal(game.collections.find(i=>i.id==='carrot').count,1);
    const ongoing=game.runs.find(r=>r.kind==='crop');
    await assert.rejects(act('grow',{runId:ongoing.id,amount:1}),/INSUFFICIENT_COIN/);
    // A completed item remains claimable while the wallet is negative.
    await db.query('update public.farm_v3_runs set progress=growth_cost where id=$1',[ongoing.id]);
    assert.equal((await act('harvest',{runId:ongoing.id})).wallet.coinBalance,-3);
    // Clothing is server-owned and profile writes are versioned.
    game=await state();const outfit={...game.profile.avatar,gender:'female',skin:4,hair:7,style:2,outfit:'green',hat:'straw'};
    await assert.rejects(act('avatar',{version:game.profile.version,avatar:{...outfit,outfit:'festival'}}),/LOCKED/);
    const dressed=await act('avatar',{version:game.profile.version,avatar:outfit});
    assert.deepEqual(dressed.game.profile.avatar,outfit);
    await assert.rejects(act('avatar',{version:game.profile.version,avatar:outfit}),/PROFILE_CHANGED/);
    const shared=await act('plaza',{version:dressed.game.profile.version,nickname:'내 농부',public:true,pose:'sit',zone:'bench'});
    const plaza=await rpc('get_farm_v3_plaza');assert.equal(plaza.total,1);assert.equal(plaza.items[0].pose,'sit');
    assert.deepEqual(Object.keys(plaza.items[0]).sort(),['id','nickname','avatar','pose','zone','isMe'].sort());
    await setUser(other);const otherState=await state();assert.equal(otherState.profile.plazaPublic,false);
    assert.equal((await rpc('get_farm_v3_plaza')).items.length,1);
    await assert.rejects(act('grow',{runId:ongoing.id,amount:1}),/RUN_NOT_FOUND/);
    await db.exec('set role authenticated');
    assert.equal(Number(await scalar('select count(*) from public.farm_v3_profiles')),1);
    await assert.rejects(db.exec("update public.farm_v3_profiles set plaza_public=true"),/permission denied/);
    await db.exec('reset role');await setUser(user);
    await act('plaza',{version:shared.game.profile.version,nickname:'내 농부',public:false,pose:'stand',zone:'tree'});
    assert.equal((await rpc('get_farm_v3_plaza')).items.length,0);
    await assert.rejects(act('decor',{version:(await state()).profile.version,decorations:['well']}),/LOCKED/);
    game=await state();assert.equal(game.avatarPartsVersion,1);
    const mixed={...game.profile.avatar,eyes:1,nose:2,mouth:1,top:'green',bottom:'cream',shoes:null};
    const mixedResult=await act('avatar',{version:game.profile.version,avatar:mixed});
    assert.deepEqual(mixedResult.game.profile.avatar,mixed);assert.equal(mixedResult.wallet.coinBalance,-3);
    for(const [field,value] of [['eyes',4],['nose',-1],['mouth','bad'],['style',4],['top','festival'],['bottom',{}]]){
      await assert.rejects(act('avatar',{version:mixedResult.game.profile.version,avatar:{...mixed,[field]:value}}),/INVALID_AVATAR|LOCKED/);
    }
    const bare={...mixed,style:3,eyes:3,nose:3,mouth:3,top:null,bottom:null,shoes:null,hat:null};
    const bareResult=await act('avatar',{version:mixedResult.game.profile.version,avatar:bare});assert.deepEqual(bareResult.game.profile.avatar,bare);
    // Older clients omit parts: keep the saved choices when the preset is unchanged.
    const legacy={gender:'female',skin:4,hair:7,style:0,outfit:bare.outfit,hat:null};
    const legacySaved=await act('avatar',{version:bareResult.game.profile.version,avatar:legacy});
    assert.equal(legacySaved.game.profile.avatar.eyes,3);assert.equal(legacySaved.game.profile.avatar.top,null);
    const otherVersion=Number(await scalar('select version from public.farm_v3_profiles where user_id=$1',[other]));
    await db.query("update public.farm_v3_profiles set avatar=avatar-array['eyes','nose','mouth','top','bottom','shoes'] where user_id=$1",[other]);
    const beforeReapply=await state();await db.exec(h.source('095_farm_v3_world.sql'));await db.exec(h.source('096_avatar_parts.sql'));
    const backfilled=await scalar('select avatar from public.farm_v3_profiles where user_id=$1',[other]);
    assert.equal(backfilled.eyes,0);assert.equal(backfilled.top,'blue');assert.equal(backfilled.outfit,'blue');
    assert.equal(Number(await scalar('select version from public.farm_v3_profiles where user_id=$1',[other])),otherVersion+1);
    await db.exec(h.source('096_avatar_parts.sql'));
    assert.equal(Number(await scalar('select version from public.farm_v3_profiles where user_id=$1',[other])),otherVersion+1);
    assert.deepEqual(await state(),beforeReapply);
    await setUser(null);await assert.rejects(state(),/Authentication/);await assert.rejects(rpc('get_farm_v3_plaza'),/Authentication/);
    for(const name of ['ensure_farm_v3_user(uuid)','farm_v3_state_json(uuid)','farm_v3_refresh_unlocks(uuid)','farm_v3_result_json(uuid,jsonb)','farm_v3_normalize_avatar(uuid,jsonb,jsonb)'])assert.equal(await scalar("select has_function_privilege('authenticated',$1,'EXECUTE')",['public.'+name]),false);
    await db.query('delete from auth.users where id=$1',[other]);
    assert.equal(Number(await scalar('select count(*) from public.farm_v3_profiles where user_id=$1',[other])),0);
    console.log('PASS: farming/fishing, no collection currency, durable retries, real negative Coin reversals, independently saved eyes/nose/mouth/clothes, blank mannequin, locked/invalid parts rejected, legacy client compatibility and profile backfill, version conflicts, owner RLS, opt-in plaza, safe reapply and account deletion.');
  }finally{await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
