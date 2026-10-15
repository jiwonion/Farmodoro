const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {createDatabase}=require('./helpers/farm-v3-db.cjs');
(async()=>{
  const h=await createDatabase({speech:false}),{db,scalar,setUser,rpc,user,other}=h;
  const state=()=>rpc('get_my_farm_v3_state');
  const act=(payload,request=randomUUID())=>rpc('perform_my_farm_v3_action',{p_action:'plaza',p_payload:payload,p_request_id:request});
  try{
    const before=await state();assert.equal(before.plazaSpeechVersion,undefined);
    await db.exec(h.source('099_plaza_speech.sql'));
    let game=await state();assert.equal(game.plazaSpeechVersion,1);assert.equal(game.profile.speech,'');
    assert.equal(game.profile.version,before.profile.version);assert.deepEqual(game.profile.position,before.profile.position);
    await db.query('update public.farm_wallets set coin_balance=-7,farm_money_balance=234 where user_id=$1',[user]);
    const speech='안녕! 오늘도 말랑하게 🫠 <b>쉬자</b>',request=randomUUID();
    const payload={version:game.profile.version,nickname:'말랑 농부',public:true,position:{x:31.25,y:70},speech:'  '+speech+'  '};
    let saved=await act(payload,request);assert.equal(saved.game.profile.speech,speech);assert.equal(saved.wallet.coinBalance,-7);assert.equal(saved.wallet.farmMoneyBalance,234);
    assert.equal((await act(payload,request)).game.profile.version,saved.game.profile.version);
    await assert.rejects(act(payload),/PROFILE_CHANGED/);
    const base=()=>({version:saved.game.profile.version,nickname:'말랑 농부',public:true});
    for(const bad of [null,12,{},[],true,'가'.repeat(81),'🫠'.repeat(81),'줄\n바꿈','탭\t문자','지움\x7f','숨김\u0085']){
      await assert.rejects(act({...base(),speech:bad}),/INVALID_SPEECH/);
    }
    assert.equal((await state()).profile.speech,speech,'Rejected writes retain the saved line');
    saved=await act({...base(),speech:'🫠'.repeat(80)});assert.equal(Array.from(saved.game.profile.speech).length,80);
    saved=await act({...base(),speech});
    // Already-open 098 and older forms cannot erase speech or move the user.
    saved=await act({...base(),nickname:'옛 화면',pose:'sit',zone:'bench'});
    assert.equal(saved.game.profile.speech,speech);assert.deepEqual(saved.game.profile.position,{x:31.25,y:70});
    await setUser(other);game=await state();assert.equal(game.profile.speech,'');
    let plaza=await rpc('get_farm_v3_plaza');assert.equal(plaza.total,1);assert.equal(plaza.items[0].speech,speech);assert.equal(plaza.items[0].isMe,false);
    const own=await act({version:game.profile.version,nickname:'나만의 대사',public:false,speech:'내 화면에만',userId:user});
    assert.equal(own.game.profile.speech,'내 화면에만');assert.equal((await rpc('get_farm_v3_plaza')).items.length,1);
    await db.exec('set role authenticated');assert.equal(Number(await scalar('select count(*) from public.farm_v3_profiles')),1);
    await assert.rejects(db.exec("update public.farm_v3_profiles set plaza_message='직접 변경'"),/permission denied/);await db.exec('reset role');
    await setUser(user);game=await state();assert.equal(game.profile.speech,speech);
    saved=await act({version:game.profile.version,nickname:game.profile.nickname,public:false,speech});assert.equal((await rpc('get_farm_v3_plaza')).total,0);
    saved=await act({...base(),speech:'   '});assert.equal(saved.game.profile.speech,'');assert.equal((await rpc('get_farm_v3_plaza')).items[0].speech,'');
    saved=await act({...base(),speech:'다음에 또 보자!'});
    const final=await state();await db.exec(h.source('099_plaza_speech.sql'));assert.deepEqual(await state(),final);
    await setUser(other);plaza=await rpc('get_farm_v3_plaza');assert.equal(plaza.items[0].speech,'다음에 또 보자!');
    await setUser(null);await assert.rejects(rpc('get_farm_v3_plaza'),/Authentication/);await assert.rejects(act({}),/Authentication/);
    console.log('PASS: speech upgrade, other-user visibility, opt-in privacy, 80 Unicode characters, empty clear, type/control/length validation, text-only payload, old forms preserve speech/position, version conflicts, idempotent retries, own-user writes, free with negative Coin, atomic reapply.');
  }finally{await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
