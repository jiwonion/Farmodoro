(() => {
  "use strict";
  const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const n=value=>Math.max(0,Number(value)||0).toLocaleString('ko-KR');
  const art=()=>window.FarmV3Art;
  const visual=(kind,id)=>window.FarmV3Catalog.find(kind,id);
  const item=(game,kind,id)=>game.catalog.find(c=>c.kind===kind&&c.id===id);
  const owned=(game,kind,id)=>game.unlocks.some(c=>c.kind===kind&&c.id===id);
  const count=(game,kind,id)=>game.collections.find(c=>c.kind===kind&&c.id===id)?.count||0;
  const costLabel=(game,entry)=>entry.kind==='crop'&&game.wateringVersion===1?'성장 '+entry.cost+'칸':entry.cost+' Coin';
  const btn=(action,label,disabled=false,extra='',style='')=>`<button type="button" class="fv-button ${style}" data-fv-action="${action}" ${extra}${disabled?' disabled':''}>${label}</button>`;
  const icon=entry=>entry.kind==='crop'?art().crop(entry.id):entry.kind==='fish'?(art().fish?art().fish(entry.id):art().icon(visual(entry.kind,entry.id)?.art||0,entry.name)):entry.kind==='character'?art().character(entry.id):'';
  const stats=game=>({harvests:game.collections.filter(c=>c.kind==='crop').reduce((sum,c)=>sum+c.count,0),fish:game.collections.filter(c=>c.kind==='fish').reduce((sum,c)=>sum+c.count,0),cropTypes:game.collections.filter(c=>c.kind==='crop').length,fishTypes:game.collections.filter(c=>c.kind==='fish').length});
  function requirement(entry,game) {
    if(entry.kind==='crop'&&entry.cropRequirements?.length)return entry.cropRequirements.map(req=>`${item(game||{catalog:[]},'crop',req.id)?.name||visual('crop',req.id)?.name||req.id} 수확 ${game?Math.min(count(game,'crop',req.id),req.count)+' / ':''}${req.count}회`).join(' · ');
    if(entry.kind==='fish'&&entry.fishRequirements?.length)return entry.fishRequirements.map(req=>`${item(game||{catalog:[]},'fish',req.id)?.name||visual('fish',req.id)?.name||req.id} 낚기 ${game?Math.min(count(game,'fish',req.id),req.count)+' / ':''}${req.count}회`).join(' · ');
    return [[entry.harvests,'작물 수확'],[entry.fish,'물고기 획득'],[entry.cropTypes,'작물 종류 수집'],[entry.fishTypes,'어종 수집']].filter(([value])=>value>0).map(([value,label])=>`${label} ${value}${label.includes('종')?'종':'회'}`).join(' · ')||'처음부터 사용 가능';
  }
  function decorations(game,scene) {
    if(game.manualDecorVersion!==1)return '';
    const active=game.profile.decorations||[];
    const src={sign:'noticeboard',crate:'produce-crate',well:'well',fence:'fence-horizontal'};
    return active.map(id=>{
      if(id==='lantern')return scene==='fish'?`<span class="fv-decor fv-decor-pond">${art().crop('lavender',4,4)}</span>`:'';
      if(scene!=='farm')return '';
      if(id==='flowers')return `<span class="fv-decor fv-decor-flowers">${art().crop('sunflower',4,4)}${art().crop('lavender',4,4)}</span>`;
      return src[id]?`<img class="fv-decor fv-decor-${id}" src="./assets/farm-b-v1/objects/rustic/${src[id]}.png" alt="${e(visual('decor',id)?.name||'농장 장식')}" draggable="false">`:'';
    }).join('');
  }
  function farmScene(game,selected=0,interactive=true,controls='') {
    const plots=Array.from({length:4},(_,slot)=>{
      const run=game.runs.find(r=>r.kind==='crop'&&r.slot===slot);
      const crop=run?item(game,'crop',run.itemId):null;
      const done=run&&run.progress>=run.cost;
      const tag=interactive?'button':'div';
      return `<${tag}${interactive?` type="button" data-fv-action="slot" data-slot="${slot}" aria-pressed="${slot===selected}"`:''} class="fv-plot${interactive&&slot===selected?' is-selected':''}${done?' is-ripe':''}" aria-label="${slot+1}번 밭 · ${crop?e(crop.name)+' · '+run.progress+'/'+run.cost:'비어 있음'}"><span class="fv-soil"></span>${run?`<span class="fv-planted">${art().crop(run.itemId,run.progress,run.cost)}</span>`:''}<span class="fv-plot-label">${done?'✦ 수확 가능':crop?e(crop.name):'＋ 심기'}</span>${run&&!done?`<span class="fv-plot-progress"><i style="width:${run.progress/run.cost*100}%"></i></span>`:''}</${tag}>`;
    }).join('');
    return `<div class="fv-scene fv-scene-farm${interactive?'':' fv-scene-passive'}" role="group" aria-label="2×2 네 칸 농장"><div class="fv-plots">${plots}</div>${decorations(game,'farm')}<div class="fv-farmer">${art().character(game.profile.characterId)}</div>${controls}</div>`;
  }
  function chooser(ctx,kind) {
    const entries=ctx.game.catalog.filter(c=>c.kind===kind);
    return `<div class="fv-chooser"><div class="fv-section-heading"><h3>${kind==='crop'?'심을 작물':'낚시할 물고기'} 선택</h3><span>시작은 무료 · ${kind==='crop'&&ctx.game.wateringVersion===1?'물주기·Coin으로 성장':'Coin으로 진행'}</span></div>${kind==='fish'&&ctx.game.fishUnlockVersion===1?'<p class="fv-help">표시된 물고기를 여러 번 낚으면 다음 어종이 열려.</p>':''}<div class="fv-choice-grid">${entries.map(entry=>{
      const unlocked=owned(ctx.game,kind,entry.id);
      return `<button type="button" class="fv-choice${unlocked?'':' is-locked'}" data-fv-action="${kind==='crop'?'plant':'fish_start'}" data-item="${e(entry.id)}" ${ctx.disabled||!unlocked?'disabled':''} title="${e(unlocked?costLabel(ctx.game,entry)+' 필요':requirement(entry,ctx.game))}"><span class="fv-choice-art">${icon(entry)}</span><strong>${e(entry.name)}</strong><small>${unlocked?costLabel(ctx.game,entry):'🔒 '+e(requirement(entry,ctx.game))}</small></button>`;
    }).join('')}</div></div>`;
  }
  function sceneControls(ctx,run) {
    if(!run)return '';
    const entry=item(ctx.game,run.kind,run.itemId),done=run.progress>=run.cost;
    const max=Math.max(0,Math.min(5,ctx.coins,run.cost-run.progress));
    const minutes=run.waterReadyAt?Math.max(0,Math.ceil((Date.parse(run.waterReadyAt)-(ctx.now??Date.now()))/60000)):0;
    const remaining=minutes>=60?`${Math.floor(minutes/60)}시간${minutes%60?minutes%60+'분':''}`:minutes+'분';
    const water=run.kind==='crop'&&ctx.game.wateringVersion===1&&!done?btn('water',minutes?'💧 '+remaining:'💧 물주기',ctx.disabled||minutes>0,`data-run="${run.id}" title="${minutes?'다음 물주기까지 '+remaining:'무료로 1칸 성장 · 5시간마다 가능'}" `,'fv-water-button'):'';
    const growth=done?btn(run.kind==='crop'?'harvest':'fish_claim',run.kind==='crop'?'✦ 수확하기':'✦ 물고기 받기',ctx.disabled,`data-run="${run.id}" `,'fv-primary'):water+btn(run.kind==='crop'?'grow':'fish_grow','＋1 Coin',ctx.disabled||ctx.coins<1,`data-run="${run.id}" data-amount="1" title="1 Coin으로 ${run.kind==='crop'?'키우기':'낚시 진행'}" `,'fv-primary')+(max>=2?btn(run.kind==='crop'?'grow':'fish_grow',`＋${max} Coin`,ctx.disabled,`data-run="${run.id}" data-amount="${max}" title="${max} Coin 한 번에 사용" `):'');
    return `<section class="fv-scene-controls" aria-label="선택한 ${run.kind==='crop'?'밭':'낚시'} 돌보기"><div class="fv-scene-control-heading"><strong>${e(entry.name)}</strong><span>${done?run.kind==='crop'?'수확 가능':'물고기 받기':run.kind==='crop'?'성장 중':'낚시 중'} · ${run.progress} / ${run.cost}</span></div>${run.kind==='fish'?`<div class="fv-progress" role="progressbar" aria-label="${e(entry.name)} 진행" aria-valuemin="0" aria-valuemax="${run.cost}" aria-valuenow="${run.progress}"><span style="width:${run.progress/run.cost*100}%"></span></div>`:''}<div class="fv-scene-control-actions">${growth}</div></section>`;
  }
  function sidebar(ctx) {
    const game=ctx.game,kind=ctx.tab==='fish'?'fish':'crop';
    const entries=game.catalog.filter(c=>c.kind===kind),found=game.collections.filter(c=>c.kind===kind).length;
    const totals=stats(game);
    const locked=game.catalog.filter(c=>!owned(game,c.kind,c.id)).sort((a,b)=>{
      const score=x=>Math.max(0,x.harvests-totals.harvests)+Math.max(0,x.fish-totals.fish)+Math.max(0,x.cropTypes-totals.cropTypes)*2+Math.max(0,x.fishTypes-totals.fishTypes)*2+(x.cropRequirements||[]).reduce((sum,req)=>sum+Math.max(0,req.count-count(game,'crop',req.id)),0)+(x.fishRequirements||[]).reduce((sum,req)=>sum+Math.max(0,req.count-count(game,'fish',req.id)),0);
      return score(a)-score(b);
    }).slice(0,2);
    return `<aside class="fv-sidebar"><section class="fv-side-card"><div class="fv-section-heading"><h3>${kind==='crop'?'작물':'물고기'} 도감</h3><span>${found} / ${entries.length}</span></div><div class="fv-mini-codex">${entries.slice(0,8).map(entry=>`<div class="${count(game,kind,entry.id)?'':'is-undiscovered'}" title="${e(entry.name)} · ${count(game,kind,entry.id)}회"><span>${icon(entry)}</span><small>${count(game,kind,entry.id)?e(entry.name):owned(game,kind,entry.id)?'아직 발견 전':'🔒'}</small></div>`).join('')}</div>${btn('tab','전체 도감 보기',false,'data-tab="collection" ','fv-text')}</section><section class="fv-side-card"><div class="fv-section-heading"><h3>다음 해금</h3><span>수집의 작은 보상</span></div>${locked.map(entry=>`<div class="fv-next"><span class="fv-next-art">${icon(entry)||'<span aria-hidden="true">✦</span>'}</span><div><strong>${e(entry.name)}</strong><small>${e(requirement(entry,game))}</small></div></div>`).join('')||'<p>모든 보상을 해금했어!</p>'}</section><section class="fv-side-card"><div class="fv-section-heading"><h3>내 캐릭터</h3>${btn('tab','캐릭터 선택',false,'data-tab="wardrobe" ','fv-text')}</div><div class="fv-side-avatar">${art().character(game.profile.characterId)}<div><strong>${e(game.profile.nickname)}</strong><small>${e(visual('character',game.profile.characterId)?.name||'새싹 슬라임')}</small></div></div></section></aside>`;
  }
  function farm(ctx) {
    const run=ctx.game.runs.find(r=>r.kind==='crop'&&r.slot===ctx.slot);
    return `<div class="fv-main-layout"><div class="fv-main-column">${farmScene(ctx.game,ctx.slot,true,sceneControls(ctx,run))}<div class="fv-under-scene"><span>${ctx.slot+1}번 밭</span><span>시간이 지나도 시들지 않아</span></div>${!run?chooser(ctx,'crop'):''}${ctx.coins<0&&run&&run.progress<run.cost?'<p class="fv-debt-note">Coin 잔액을 채우면 다시 쓸 수 있어. 무료 물주기로도 작물을 키울 수 있어.</p>':''}</div>${sidebar(ctx)}</div>`;
  }
  function fishing(ctx) {
    const run=ctx.game.runs.find(r=>r.kind==='fish');
    const done=!!run&&run.progress>=run.cost;
    return `<div class="fv-main-layout"><div class="fv-main-column"><div class="fv-scene fv-scene-fish" aria-label="내 캐릭터가 낚시하는 연못"><div class="fv-fisher${run?' is-fishing':''}${done?' is-ready':''}">${art().character(ctx.game.profile.characterId,'',run?'fishing':'')}${run?`<i class="fv-fishing-ripple" aria-hidden="true"></i><span class="fv-fishing-status">${done?'✦ 입질이 왔어!':'🎣 낚시 중'}</span>`:''}</div>${decorations(ctx.game,'fish')}${sceneControls(ctx,run)}</div><div class="fv-under-scene"><span>내 작은 낚시터</span><span>Coin을 쓰면 낚시가 진행돼</span></div>${!run?chooser(ctx,'fish'):''}${ctx.coins<0&&run&&!done?'<p class="fv-debt-note">Coin 잔액을 채우면 낚시를 더 진행할 수 있어.</p>':''}</div>${sidebar(ctx)}</div>`;
  }
  function wardrobe(ctx) { return window.FarmV3CharactersView.render(ctx); }
  function plaza(ctx) { return window.FarmV3PlazaView.render(ctx); }
  function collection(ctx) {
    const kind=ctx.collectionKind||'crop',game=ctx.game;
    return `<section class="fv-side-card"><div class="fv-section-heading"><h3>나의 수집 도감</h3><div class="fv-segments">${btn('collection_kind','작물',false,'data-kind="crop" aria-pressed="'+(kind==='crop')+'" ')}${btn('collection_kind','물고기',false,'data-kind="fish" aria-pressed="'+(kind==='fish')+'" ')}</div></div><div class="fv-codex-grid">${game.catalog.filter(c=>c.kind===kind).map(entry=>{
      const collected=count(game,kind,entry.id),unlocked=owned(game,kind,entry.id);
      return `<article class="fv-codex-card${collected?' is-collected':''}${unlocked?'':' is-locked'}"><span class="fv-codex-art${collected?'':' is-undiscovered'}">${icon(entry)}</span><h4>${e(entry.name)}</h4><strong>${collected?n(collected)+'회 수집':unlocked?'첫 발견을 기다리는 중':'🔒 잠겨 있어'}</strong><small>${unlocked?costLabel(game,entry)+' 필요':e(requirement(entry,game))}</small></article>`;
    }).join('')}</div></section>`;
  }
  function render(ctx) {
    const tabs=[['farm','농장'],['fish','낚시터'],['plaza','광장'],['wardrobe','캐릭터'],['collection','도감']];
    const header=`<header class="fv-header"><div><span class="fv-eyebrow">MY LITTLE WORLD</span><h2>내 농장</h2><p>오늘의 성취가 나만의 작은 세상이 돼</p></div><div class="fv-header-tools"><span class="fv-wallet${ctx.coins<0?' is-negative':''}" aria-label="보유 Coin">● <strong>${Number(ctx.coins).toLocaleString('ko-KR')}</strong> Coin</span>${btn('legacy','이전 풍경',false,'','fv-text')}</div></header><nav class="fv-tabs" aria-label="농장 안에서 이동">${tabs.map(([id,name])=>btn('tab',name,false,`data-tab="${id}" aria-current="${ctx.tab===id?'page':'false'}" `)).join('')}</nav>`;
    if(!ctx.game)return header+`<section class="fv-empty"><span class="fv-empty-sprout">🌱</span><h3>${ctx.loading?'내 작은 세상을 불러오는 중이야':'농장을 준비하고 있어'}</h3><p>${ctx.error?'연결 상태를 확인하고 다시 불러와줘.':ctx.unavailable?'서버 업데이트가 적용되면 새 농장·낚시터·광장이 열려. 이전 풍경은 계속 확인할 수 있어.':'잠시만 기다려줘.'}</p>${btn('reload','다시 불러오기',ctx.loading)}</section>`;
    const body=ctx.tab==='fish'?fishing(ctx):ctx.tab==='plaza'?plaza(ctx):ctx.tab==='wardrobe'?wardrobe(ctx):ctx.tab==='collection'?collection(ctx):farm(ctx);
    const recovery=ctx.pending&&!ctx.busy&&!ctx.loading;
    const statusIssue=recovery||ctx.error||ctx.unavailable||ctx.storageError;
    const statusMessage=ctx.message||(ctx.storageError?'브라우저 저장소를 확인하고 다시 불러와줘.':ctx.error?'연결 상태를 확인하고 다시 불러와줘.':ctx.unavailable?'농장 서버를 확인할 수 없어. 잠시 후 다시 불러와줘.':'');
    return header+`<div class="fv-status${statusIssue?'':' fv-status-quiet'}" role="status" aria-live="polite">${e(statusMessage)}${ctx.storageError?btn('reload','다시 불러오기',ctx.busy||ctx.loading):''}</div>${recovery?`<div class="fv-recovery"><span>아직 저장 결과를 확인하지 못한 작업이 있어.</span>${btn('retry','같은 작업 다시 확인')}</div>`:''}${body}`;
  }
  window.FarmV3Views={render,farmScene,stats,requirement};
})();
