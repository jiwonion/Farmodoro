/* Farm/fishing actions share the existing wallet queue and durable request IDs. */
(() => {
  "use strict";
  const PREFIX='farmodoro-v3-intent:';
  const ACTIONS=['plant','grow','harvest','fish_start','fish_grow','fish_claim','character','plaza','decor'];
  const messages={FARM_INSUFFICIENT_COIN:'Coin이 부족해. 할 일·습관·집중으로 모아봐.',FARM_V3_LOCKED:'아직 해금하지 않은 아이템이야.',FARM_V3_OCCUPIED:'이미 진행 중인 회차가 있어. 최신 상태를 불러올게.',FARM_V3_RUN_NOT_FOUND:'진행 상태가 바뀌었어. 다시 불러올게.',FARM_V3_COMPLETE:'이미 완성했어. 수집 버튼을 눌러줘.',FARM_V3_NOT_COMPLETE:'진행을 마친 뒤 받을 수 있어.',FARM_V3_ALREADY_CLAIMED:'이미 받은 기록이야. 최신 상태를 불러올게.',FARM_V3_PROFILE_CHANGED:'다른 화면에서 설정이 바뀌었어. 최신 모습에서 다시 골라줘.',FARM_V3_INVALID_PLAZA:'닉네임과 공개 여부를 다시 확인해줘.',FARM_V3_INVALID_POSITION:'광장 안에서 자리를 다시 골라줘.',FARM_V3_UNKNOWN_CHARACTER:'캐릭터 목록을 다시 불러와줘.',FARM_V3_AVATAR_RETIRED:'꾸미기가 대표 캐릭터 선택으로 바뀌었어. 새로운 친구를 골라줘.'};
  messages.FARM_V3_INVALID_SPEECH='대사는 줄바꿈 없이 80자까지 쓸 수 있어.';
  let game=null,owner=null,pending=null,busy=false,loading=false,unavailable=false,error=false,storageError=false;
  let loadRequest=0,root=null,signature='',message='',tab='farm',slot=0,collectionKind='crop';
  let characterDraft=null,characterVersion=null,plazaDraft=null,plazaVersion=null,legacyFallback=false;
  let plaza=null,plazaPage=0,plazaLoading=false,plazaError=false,plazaRequest=0;
  let renderedOwner=null,renderedTab=null,focusToRestore=null;
  const account=()=>typeof activeAuthUser!=='undefined'?activeAuthUser?.id||null:null;
  const generation=()=>typeof farmSessionGeneration!=='undefined'?farmSessionGeneration:0;
  const current=(id,session)=>id===account()&&owner===id&&session===generation();
  const coins=()=>Number(typeof state!=='undefined'?state.coins:game?.coinBalance)||0;
  const clone=value=>JSON.parse(JSON.stringify(value));
  const owned=(kind,id)=>game?.unlocks.some(item=>item.kind===kind&&item.id===id);
  const selected=(kind,id)=>game?.catalog.find(item=>item.kind===kind&&item.id===id);
  const ready=()=>!!game&&owner===account()&&!!account()&&!unavailable&&!storageError;
  const actionable=()=>ready()&&!busy&&!loading&&!pending;
  const legacyPosition=zone=>zone==='bench'?{x:22,y:38}:zone==='tree'?{x:78,y:58}:{x:50,y:65};
  const validPosition=p=>!!p&&typeof p.x==='number'&&typeof p.y==='number'&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=5&&p.x<=95&&p.y>=15&&p.y<=95;
  const validSpeech=value=>typeof value==='string'&&Array.from(value).length<=80&&!/[\x00-\x1f\x7f-\x9f]/.test(value);
  function normalize(value){
    if(!value||value.version!==1||!value.profile||!Array.isArray(value.catalog)||!Array.isArray(value.unlocks))return value;
    let next=value;
    // An older farm server still supports farming and fishing. Only the new
    // features stay unavailable; never invent server-owned character unlocks.
    if(value.charactersVersion===undefined)next={...next,charactersVersion:0,profile:{...next.profile,characterId:null},catalog:next.catalog.filter(i=>!i||!['outfit','hat'].includes(i.kind)),unlocks:next.unlocks.filter(i=>!i||!['outfit','hat'].includes(i.kind))};
    if(value.plazaPositionVersion===undefined)next={...next,plazaPositionVersion:0,profile:{...next.profile,position:legacyPosition(next.profile.zone)}};
    if(value.plazaSpeechVersion===undefined)next={...next,plazaSpeechVersion:0,profile:{...next.profile,speech:''}};
    if(value.cropUnlockVersion===undefined)next={...next,cropUnlockVersion:0,catalog:next.catalog.map(item=>item?{...item,cropRequirements:[]}:item)};
    if(value.fishUnlockVersion===undefined)next={...next,fishUnlockVersion:0,catalog:next.catalog.map(item=>item?{...item,fishRequirements:[]}:item)};
    if(value.manualDecorVersion===undefined)next={...next,manualDecorVersion:0,profile:{...next.profile,decorations:[]}};
    if(value.wateringVersion===undefined)next={...next,wateringVersion:0,runs:Array.isArray(next.runs)?next.runs.map(run=>run?{...run,waterReadyAt:null}:run):next.runs};
    return next;
  }
  function valid(value) {
    value=normalize(value);
    if(!value||value.version!==1||![0,1].includes(value.charactersVersion)||![0,1].includes(value.plazaPositionVersion)||![0,1].includes(value.plazaSpeechVersion)||![0,1].includes(value.cropUnlockVersion)||![0,1].includes(value.fishUnlockVersion)||![0,1].includes(value.manualDecorVersion)||value.coinBalance==null||!Number.isSafeInteger(Number(value.coinBalance))||!value.profile||!Array.isArray(value.catalog)||!value.catalog.length||!Array.isArray(value.runs)||!Array.isArray(value.unlocks)||!Array.isArray(value.collections))return false;
    const ids=new Set();
    if(![0,1].includes(value.wateringVersion)||value.wateringVersion===1&&(typeof value.serverNow!=='string'||!Number.isFinite(Date.parse(value.serverNow))))return false;
    for(const item of value.catalog){if(!item||!['crop','fish','character','decor'].includes(item.kind)||typeof item.id!=='string'||typeof item.name!=='string'||!Number.isSafeInteger(item.cost)||item.cost<0||(['crop','fish'].includes(item.kind)&&item.cost<1)||ids.has(item.kind+':'+item.id))return false;ids.add(item.kind+':'+item.id);}
    for(const item of value.catalog){const requirements=item.cropRequirements;if(!Array.isArray(requirements)||requirements.length>57||item.kind!=='crop'&&requirements.length)return false;const seen=new Set();for(const req of requirements){if(!req||!ids.has('crop:'+req.id)||req.id===item.id||seen.has(req.id)||!Number.isSafeInteger(req.count)||req.count<1||req.count>1000)return false;seen.add(req.id);}}
    for(const item of value.catalog){const requirements=item.fishRequirements;if(!Array.isArray(requirements)||requirements.length>24||item.kind!=='fish'&&requirements.length)return false;const seen=new Set();for(const req of requirements){if(!req||typeof req.id!=='string'||!ids.has('fish:'+req.id)||req.id===item.id||seen.has(req.id)||!Number.isSafeInteger(req.count)||req.count<1||req.count>1000)return false;seen.add(req.id);}}
    if(value.unlocks.some(i=>!i||!ids.has(i.kind+':'+i.id))||value.collections.some(i=>!i||!['crop','fish'].includes(i.kind)||!ids.has(i.kind+':'+i.id)||!Number.isSafeInteger(i.count)||i.count<1))return false;
    const occupied=new Set();
    if(value.runs.some(run=>{if(!run)return true;const key=run.kind==='fish'?'fish':'crop:'+run.slot;if(!run||typeof run.id!=='string'||!['crop','fish'].includes(run.kind)||!ids.has(run.kind+':'+run.itemId)||!Number.isSafeInteger(run.progress)||!Number.isSafeInteger(run.cost)||run.cost<1||run.progress<0||run.progress>run.cost||run.kind==='crop'&&(!Number.isInteger(run.slot)||run.slot<0||run.slot>3)||occupied.has(key))return true;occupied.add(key);return false;}))return false;
    const p=value.profile;
    if(value.runs.some(run=>run.waterReadyAt!==null&&(typeof run.waterReadyAt!=='string'||!Number.isFinite(Date.parse(run.waterReadyAt)))||run.kind==='fish'&&run.waterReadyAt!==null))return false;
    const characterValid=value.charactersVersion===1?ids.has('character:'+p.characterId)&&value.unlocks.some(i=>i.kind==='character'&&i.id===p.characterId):p.characterId===null&&!value.catalog.some(i=>i.kind==='character');
    return typeof p.nickname==='string'&&typeof p.plazaPublic==='boolean'&&validPosition(p.position)&&validSpeech(p.speech)&&Number.isSafeInteger(Number(p.version))&&Array.isArray(p.decorations)&&p.decorations.every(id=>ids.has('decor:'+id))&&characterValid;
  }
  // Retain scenes and their painted canvases while an action changes controls or progress.
  function nodeKey(node){
    if(node?.nodeType!==1)return null;
    const tag=node.localName;
    if(node.id)return tag+'#'+node.id;
    if(tag==='canvas')return [tag,...['data-fv-character','data-fv-character-pose','width','height'].map(name=>node.getAttribute(name)||'')].join(':');
    if(node.hasAttribute('data-fv-action'))return [tag,...['data-fv-action','data-field','data-value','data-item','data-slot','data-run','data-amount','data-tab','data-kind'].map(name=>node.getAttribute(name)||'')].join(':');
    if(node.hasAttribute('name'))return tag+':name:'+node.getAttribute('name');
    const className=(node.getAttribute('class')||'').trim().split(/\s+/)[0];
    return className?tag+':'+className:null;
  }
  function compatibleNode(node,next){return !!node&&node.nodeType===next.nodeType&&(node.nodeType!==1||node.localName===next.localName&&node.namespaceURI===next.namespaceURI&&nodeKey(node)===nodeKey(next));}
  function patchNode(node,next){
    if(node.isEqualNode(next))return;
    if(node.nodeType!==1){if(node.nodeValue!==next.nodeValue)node.nodeValue=next.nodeValue;return;}
    for(const attribute of [...node.attributes]){
      if(attribute.name==='style'||node.localName==='canvas'&&attribute.name==='data-painted')continue;
      if(!next.hasAttributeNS(attribute.namespaceURI,attribute.localName))node.removeAttributeNS(attribute.namespaceURI,attribute.localName);
    }
    for(const attribute of [...next.attributes]){
      if(attribute.name==='style')continue;
      // Setting an unchanged canvas width or height would erase its bitmap.
      if(node.getAttributeNS(attribute.namespaceURI,attribute.localName)!==attribute.value)node.setAttributeNS(attribute.namespaceURI,attribute.name,attribute.value);
    }
    const runtimeStyles=['--fv-fishing-art-top','--fv-fishing-contact-x','--fv-fishing-contact-y','--speech-shift-x','--speech-shift-y'];
    if(node.style&&next.style){
      for(const name of [...node.style])if(!next.style.getPropertyValue(name)&&!runtimeStyles.includes(name))node.style.removeProperty(name);
      for(const name of [...next.style])if(node.style.getPropertyValue(name)!==next.style.getPropertyValue(name)||node.style.getPropertyPriority(name)!==next.style.getPropertyPriority(name))node.style.setProperty(name,next.style.getPropertyValue(name),next.style.getPropertyPriority(name));
    }
    patchChildren(node,next);
  }
  function patchChildren(node,next){
    let cursor=node.firstChild;
    for(const desired of [...next.childNodes]){
      const key=nodeKey(desired);let match=cursor;
      if(key)while(match&&(!compatibleNode(match,desired)||nodeKey(match)!==key))match=match.nextSibling;
      if(!compatibleNode(match,desired)){node.insertBefore(desired.cloneNode(true),cursor);continue;}
      if(match!==cursor)node.insertBefore(match,cursor);
      patchNode(match,desired);cursor=match.nextSibling;
    }
    while(cursor){const nextSibling=cursor.nextSibling;cursor.remove();cursor=nextSibling;}
  }
  function render() {
    const nextRoot=document.getElementById('farmGameRoot');if(!nextRoot||!window.FarmV3Views||!window.FarmV3Art)return;
    if(root!==nextRoot){root=nextRoot;signature='';renderedOwner=null;renderedTab=null;focusToRestore=null;root.addEventListener('click',onClick);root.addEventListener('keydown',onKeydown);root.addEventListener('change',onChange);root.addEventListener('input',onChange);root.addEventListener('submit',onSubmit);}
    const mine=owner===account()?game:null;
    const html=window.FarmV3Views.render({game:mine,tab,slot,coins:coins(),disabled:!actionable(),busy,loading,pending:owner===account()&&pending,unavailable,error,storageError,message,characterDraft,plaza,plazaLoading,plazaError,plazaDraft,collectionKind});
    if(html!==signature){
      const focused=root.contains(document.activeElement)?document.activeElement:null;
      const focusKey=focused?['data-fv-action','data-field','data-value','data-item','data-slot','data-run','data-amount','data-tab','data-kind','name'].map(name=>[name,focused.getAttribute?.(name)]).filter(([,value])=>value!=null):[];
      const retain=mine&&renderedOwner===owner&&renderedTab===tab&&['farm','fish'].includes(tab)&&root.ownerDocument;
      if(retain){
        if(focused)focusToRestore=focused;
        else if(document.activeElement&&document.activeElement!==document.body)focusToRestore=null;
        const template=root.ownerDocument.createElement('template');template.innerHTML=html;patchChildren(root,template.content);
      }else{root.innerHTML=html;focusToRestore=null;}
      signature=html;renderedOwner=mine?owner:null;renderedTab=tab;
      if(focusToRestore&&root.contains(focusToRestore)){
        if(!focusToRestore.disabled&&document.activeElement!==focusToRestore)focusToRestore.focus({preventScroll:true});
      }else if(focusKey.length){const candidates=[...root.querySelectorAll('button,input,select,[tabindex]')];candidates.find(node=>focusKey.every(([key,value])=>node.getAttribute(key)===value))?.focus({preventScroll:true});}
      if(!busy&&!loading)focusToRestore=null;
      void window.FarmV3Art.paintAll(root);
      window.FarmV3PlazaView?.layoutSpeech(root);
      syncSpeechPreview();
    }
    root.setAttribute('aria-busy',String(busy||loading));
  }
  function hostRefresh(){if(typeof renderSummary==='function')renderSummary();if(typeof renderFarm==='function')renderFarm();else render();}
  function applyState(value,{wallet=false}={}) {
    if(!account()||!valid(value))return false;
    owner=account();game=clone(normalize(value));unavailable=false;error=false;document.documentElement?.classList.add("farm-v3-ready");
    if(legacyFallback){document.getElementById('farmPage')?.classList.remove('farm-v3-show-legacy');legacyFallback=false;}
    if(wallet&&typeof applyFarmActionResult==='function')applyFarmActionResult({wallet:{coinBalance:Number(value.coinBalance)}});
    render();return true;
  }
  function reset() {
    if(legacyFallback){document.getElementById('farmPage')?.classList.remove('farm-v3-show-legacy');legacyFallback=false;}
    document.documentElement?.classList.remove("farm-v3-ready");loadRequest++;plazaRequest++;game=null;owner=null;pending=null;busy=false;loading=false;unavailable=false;error=false;storageError=false;
    message='';signature='';characterDraft=null;characterVersion=null;plazaDraft=null;plazaVersion=null;plaza=null;plazaLoading=false;plazaError=false;plazaPage=0;
    render();
  }
  function readPending(id) {
    try {
      const saved=localStorage.getItem(PREFIX+id);if(!saved)return null;
      const intent=JSON.parse(saved);
      if(intent.userId!==id||(!ACTIONS.includes(intent.action)&&!['avatar','water'].includes(intent.action))||typeof intent.requestId!=='string'||!intent.requestId||!intent.payload||typeof intent.payload!=='object')throw Error('Invalid intent');
      // Retired free watering never needs a retry. The state read below retains
      // growth already committed by an older client without blocking Coin actions.
      if(intent.action==='water'){localStorage.removeItem(PREFIX+id);return null;}
      return intent;
    }catch(_){storageError=true;message='저장 중이던 작업을 읽을 수 없어. 브라우저 저장소를 확인해줘.';return null;}
  }
  function persist(intent){try{localStorage.setItem(PREFIX+intent.userId,JSON.stringify(intent));pending=intent;return true;}catch(_){storageError=true;message='브라우저에 작업을 보관할 수 없어. 저장소를 확인하고 다시 불러와줘.';render();return false;}}
  function clearPending(intent){try{localStorage.removeItem(PREFIX+intent.userId);if(pending?.requestId===intent.requestId)pending=null;}catch(_){message='작업은 끝났어. 같은 작업 다시 확인으로 저장 기록을 정리해줘.';}}
  async function load(user) {
    const id=user?.id;if(!id||id!==account())return false;
    if(owner!==id){reset();owner=id;pending=readPending(id);}else if(storageError){storageError=false;pending=readPending(id);}
    const request=++loadRequest,session=generation();loading=true;render();
    const actionChain=farmActionChain,walletChain=farmWalletMutationChain;
    try{
      await Promise.all([actionChain,walletChain]);if(!current(id,session)||request!==loadRequest)return false;
      const {data,error:rpcError}=await supabaseClient.rpc('get_my_farm_v3_state');
      if(!current(id,session)||request!==loadRequest||actionChain!==farmActionChain||walletChain!==farmWalletMutationChain)return false;
      if(rpcError)throw rpcError;if(!valid(data))throw Error('Invalid game state');
      applyState(data,{wallet:true});
      message=storageError?message:pending?'이전에 보낸 작업의 결과를 확인해줘. 같은 요청으로 다시 확인할 수 있어.':'';
      hostRefresh();return true;
    }catch(caught){if(!current(id,session)||request!==loadRequest)return false;unavailable=['PGRST202','42883'].includes(caught?.code);error=!unavailable;message='';if(unavailable&&!game){legacyFallback=true;document.getElementById('farmPage')?.classList.add('farm-v3-show-legacy');}return false;}
    finally{if(current(id,session)&&request===loadRequest){loading=false;render();}}
  }
  function actionMessage(intent,event){
    if(event.kind==='started')return `${event.name}${intent.action==='plant'?' 심었어.':' 낚시를 시작했어.'}`;
    if(event.kind==='grown')return event.completed?'완성했어! 이제 수집할 수 있어.':`${event.spentCoin} Coin으로 진행했어.`;
    if(event.kind==='collected'){
      const names=(event.unlocks||[]).filter(i=>['character','decor'].includes(i.kind)).map(i=>selected(i.kind,i.id)?.name).filter(Boolean);
      return `${event.name} ${event.itemKind==='crop'?'수확':'획득'}!${names.length?' · '+names.slice(0,3).join(', ')+' 해금':''}`;
    }
    return event.kind==='character'?'대표 캐릭터를 바꿨어.':event.kind==='avatar'?'이전 캐릭터 작업을 확인했어.':event.kind==='plaza'?'광장에 보일 모습을 저장했어.':'농장 장식을 바꿨어.';
  }
  async function runIntent(intent,recovering=false){
    if(!ready()||busy||intent.userId!==account())return null;
    const id=intent.userId,session=generation();busy=true;loading=false;loadRequest++;message='저장하고 있어…';render();
    let reload=false;
    const call=Promise.all([farmActionChain,farmWalletMutationChain]).then(async()=>{
      if(!current(id,session))return null;
      try{
        farmWalletMutationVersion++;
        let {data,error:rpcError}=await supabaseClient.rpc('perform_my_farm_v3_action',{p_action:intent.action,p_payload:intent.payload,p_request_id:intent.requestId});
        if(!current(id,session))return null;if(rpcError)throw rpcError;
        if(!data||!valid(data.game)||data.wallet?.coinBalance==null||!Number.isSafeInteger(Number(data.wallet.coinBalance)))throw Error('Invalid action result');
        if(recovering){
          const fresh=await supabaseClient.rpc('get_my_farm_v3_state');if(!current(id,session))return null;
          if(fresh.error)throw fresh.error;if(!valid(fresh.data))throw Error('Invalid recovery state');
          data={...data,game:fresh.data,wallet:{coinBalance:fresh.data.coinBalance}};
        }
        applyFarmActionResult(data);applyState(data.game);
        if(intent.action==='character'){characterDraft=null;characterVersion=null;}
        if(intent.action==='plaza'){plazaDraft=null;plazaVersion=null;}
        message=actionMessage(intent,data.event||{});clearPending(intent);
        if(typeof showToast==='function')showToast(message);
        hostRefresh();if(intent.action==='plaza'||intent.action==='character')void loadPlaza();return data;
      }catch(caught){
        if(!current(id,session))return null;
        const sentinel=Object.keys(messages).find(key=>String(caught?.message||'').includes(key));
        if(sentinel){clearPending(intent);message=messages[sentinel];reload=true;if(sentinel==='FARM_V3_PROFILE_CHANGED'){characterDraft=null;characterVersion=null;plazaDraft=null;plazaVersion=null;}}
        else{message='저장 결과를 확인하지 못했어. 같은 작업 다시 확인을 눌러줘. Coin과 수집을 중복 처리하지 않아.';}
        if(typeof showToast==='function')showToast(message);return null;
      }finally{if(current(id,session)){busy=false;render();}}
    });
    const guarded=call.catch(()=>{});farmActionChain=guarded;farmWalletMutationChain=guarded;
    const result=await call;if(reload&&current(id,session))void load(activeAuthUser);return result;
  }
  function validAction(action,payload){
    if(!actionable()||!ACTIONS.includes(action))return false;
    if(action==='plant'||action==='fish_start'){
      const kind=action==='plant'?'crop':'fish';if(!selected(kind,payload.itemId)||!owned(kind,payload.itemId))return false;
      return kind==='crop'?Number.isInteger(payload.slot)&&payload.slot>=0&&payload.slot<4&&!game.runs.some(r=>r.kind==='crop'&&r.slot===payload.slot):!game.runs.some(r=>r.kind==='fish');
    }
    if(['grow','harvest','fish_grow','fish_claim'].includes(action)){
      const kind=action.startsWith('fish_')?'fish':'crop',run=game.runs.find(r=>r.id===payload.runId&&r.kind===kind);if(!run)return false;
      return action==='grow'||action==='fish_grow'?Number.isInteger(payload.amount)&&payload.amount>=1&&payload.amount<=100&&payload.amount<=Math.min(coins(),run.cost-run.progress):run.progress===run.cost;
    }
    if(action==='character'&&(game.charactersVersion!==1||!selected('character',payload.characterId)||!owned('character',payload.characterId)))return false;
    if(action==='decor'&&game.manualDecorVersion!==1)return false;
    if(action==='plaza'&&game.plazaPositionVersion===1&&!validPosition(payload.position))return false;
    if(action==='plaza'&&game.plazaSpeechVersion===1&&!validSpeech(payload.speech))return false;
    return Number.isSafeInteger(Number(payload.version));
  }
  function act(action,payload){
    if(!validAction(action,payload))return null;
    const intent={userId:account(),requestId:createUuid(),action,payload:clone(payload)};
    return persist(intent)?runIntent(intent):null;
  }
  async function loadPlaza(page=plazaPage){
    if(!ready())return false;
    const id=account(),session=generation(),request=++plazaRequest;plazaLoading=true;plazaError=false;plazaPage=page;render();
    try{
      const {data:raw,error:rpcError}=await supabaseClient.rpc('get_farm_v3_plaza',{p_page:page});
      if(!current(id,session)||request!==plazaRequest)return false;if(rpcError)throw rpcError;
      const data=raw&&Array.isArray(raw.items)?{...raw,items:raw.items.map(p=>!p?p:{...p,...(game.charactersVersion===0?{characterId:null}:{}),...(game.plazaPositionVersion===0?{position:legacyPosition(p.zone)}:{}),...(game.plazaSpeechVersion===0?{speech:''}:{})})}:raw;
      if(!data||!Array.isArray(data.items)||data.items.length>12||!Number.isSafeInteger(Number(data.total))||data.total<0||data.items.some(p=>!p||typeof p.id!=='string'||typeof p.nickname!=='string'||(game.charactersVersion===1?!selected('character',p.characterId):p.characterId!==null)||!validPosition(p.position)||!validSpeech(p.speech)))throw Error('Invalid plaza');
      plaza=clone(data);if(!data.items.length&&data.total>0&&page>0)return loadPlaza(0);return true;
    }catch(_){if(current(id,session)&&request===plazaRequest)plazaError=true;return false;}
    finally{if(current(id,session)&&request===plazaRequest){plazaLoading=false;render();}}
  }
  function setTab(value){
    if(!['farm','fish','plaza','wardrobe','collection'].includes(value))return;
    tab=value;render();if(value==='plaza')void loadPlaza();
  }
  function chooseCharacter(id){
    if(!actionable()||!selected('character',id)||!owned('character',id))return;
    if(characterVersion==null)characterVersion=game.profile.version;
    characterDraft=id;render();
  }
  function plazaDefaults(){return{nickname:game.profile.nickname,position:clone(game.profile.position),speech:game.profile.speech};}
  function syncSpeechPreview(){
    if(!game||!root)return;
    const speech=(plazaDraft||plazaDefaults()).speech;
    const bubble=root.querySelector?.('.fv-plaza-person.is-me .fv-speech');
    if(bubble){bubble.textContent=speech.trim();bubble.hidden=!speech.trim();}
    const count=root.querySelector?.('#fvSpeechCount');if(count)count.textContent=`${Array.from(speech).length} / 80자`;
    const input=root.querySelector?.('[name="speech"]');
    input?.setCustomValidity(validSpeech(speech)?'':'대사는 줄바꿈 없이 80자까지 쓸 수 있어.');
    window.FarmV3PlazaView?.layoutSpeech(root);
  }
  function movePosition(position){
    if(!actionable()||game.plazaPositionVersion!==1)return;
    if(plazaVersion==null)plazaVersion=game.profile.version;
    const clamp=(n,min,max)=>Math.round(Math.max(min,Math.min(max,n))*100)/100;
    const next={x:clamp(position.x,5,95),y:clamp(position.y,15,95)};
    if(!validPosition(next))return;
    plazaDraft={...(plazaDraft||plazaDefaults()),position:next};render();
  }
  function onKeydown(event){
    const board=event.target.closest('[data-fv-action="plaza_position"]');if(!board||!root.contains(board)||!actionable()||game.plazaPositionVersion!==1)return;
    const position=clone((plazaDraft||plazaDefaults()).position),step=event.shiftKey?10:2;
    if(event.key==='ArrowLeft')position.x-=step;else if(event.key==='ArrowRight')position.x+=step;else if(event.key==='ArrowUp')position.y-=step;else if(event.key==='ArrowDown')position.y+=step;else return;
    event.preventDefault();movePosition(position);
  }
  function onClick(event){
    const control=event.target.closest('[data-fv-action]');if(!control||!root.contains(control)||control.disabled)return;
    const action=control.dataset.fvAction;
    if(action==='tab')return setTab(control.dataset.tab);
    if(action==='slot'){slot=Number(control.dataset.slot);return render();}
    if(action==='reload')return void load(activeAuthUser);
    if(action==='retry')return void (pending&&runIntent(pending,true));
    if(action==='legacy'){document.getElementById('farmPage')?.classList.add('farm-v3-show-legacy');return;}
    if(action==='choose_character')return chooseCharacter(control.dataset.item);
    if(action==='plaza_position'){
      if(!actionable()||game.plazaPositionVersion!==1)return;
      const box=control.getBoundingClientRect();if(!box.width||!box.height)return;
      return movePosition({x:(event.clientX-box.left)/box.width*100,y:(event.clientY-box.top)/box.height*100});
    }
    if(action==='plaza_clear_speech'){
      if(!actionable()||game.plazaSpeechVersion!==1)return;
      if(plazaVersion==null)plazaVersion=game.profile.version;
      plazaDraft={...(plazaDraft||plazaDefaults()),speech:''};return render();
    }
    if(action==='save_character')return void act('character',{characterId:characterDraft||game.profile.characterId,version:characterVersion??game.profile.version});
    if(action==='collection_kind'){collectionKind=control.dataset.kind;return render();}
    if(action==='plaza_refresh')return void loadPlaza();
    if(action==='plaza_page')return void loadPlaza(plaza&&((plazaPage+1)*12<plaza.total)?plazaPage+1:0);
    if(action==='plant'||action==='fish_start')return void act(action,{itemId:control.dataset.item,slot:action==='plant'?slot:undefined});
    if(['grow','harvest','fish_grow','fish_claim'].includes(action))return void act(action,{runId:control.dataset.run,...(control.dataset.amount?{amount:Number(control.dataset.amount)}:{})});
  }
  function readPlazaForm(form){const data=new FormData(form);return{nickname:String(data.get('nickname')||''),public:true,position:clone((plazaDraft||plazaDefaults()).position),speech:game.plazaSpeechVersion===1?String(data.get('speech')||''):game.profile.speech};}
  function onChange(event){
    const form=event.target.closest('[data-fv-form="plaza"]');
    if(form){if(plazaVersion==null)plazaVersion=game.profile.version;plazaDraft=readPlazaForm(form);syncSpeechPreview();return;}
    if(event.target.dataset.fvDecor){const ids=[...root.querySelectorAll('[data-fv-decor]:checked')].map(node=>node.dataset.fvDecor);void act('decor',{decorations:ids,version:game.profile.version});}
  }
  function onSubmit(event){const form=event.target.closest('[data-fv-form="plaza"]');if(!form)return;event.preventDefault();const old=game.plazaPositionVersion!==1?{pose:game.profile.pose||'stand',zone:game.profile.zone||'square'}:{};const {speech,...payload}=readPlazaForm(form);void act('plaza',{...payload,...(game.plazaSpeechVersion===1?{speech}:{}),...old,version:plazaVersion??game.profile.version});}
  function previewMarkup(){return owner===account()&&game?window.FarmV3Views.farmScene(game,0,false):'';}
  window.FarmV3={load,render,reset,applyState,validState:valid,snapshot:()=>owner===account()&&game?clone(game):null,previewMarkup,loadPlaza};
  document.getElementById('farmV3Return')?.addEventListener('click',()=>document.getElementById('farmPage')?.classList.remove('farm-v3-show-legacy'));
  render();if(account())void load(activeAuthUser);
})();
