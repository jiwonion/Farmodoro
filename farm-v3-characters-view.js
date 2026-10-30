(() => {
  'use strict';
  const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function render(ctx){
    const {game}=ctx,art=window.FarmV3Art,catalog=window.FarmV3Catalog;
    if(game.charactersVersion!==1)return `<div class="fv-wardrobe-controls"><section class="fv-side-card"><h3>새로운 친구들을 준비하고 있어</h3><p class="fv-help">대표 캐릭터 선택을 준비하고 있어. 농사와 낚시는 지금도 이용할 수 있어.</p></section></div>`;
    const draft=ctx.characterDraft||game.profile.characterId,entry=catalog.find('character',draft);
    const owned=id=>game.unlocks.some(item=>item.kind==='character'&&item.id===id);
    const totals=window.FarmV3Views.stats(game),characters=game.catalog.filter(item=>item.kind==='character');
    const condition=item=>[['harvests','작물 수확','회'],['fish','물고기 획득','회'],['cropTypes','작물 종류','종'],['fishTypes','어종 수집','종']].filter(([key])=>item[key]>0).map(([key,label,unit])=>`${label} ${Math.min(totals[key],item[key])} / ${item[key]}${unit}`).join(' · ');
    return `<div class="fv-wardrobe-layout"><section class="fv-dressing-preview fv-side-card"><h3>나의 대표 캐릭터</h3><div class="fv-large-avatar">${art.character(draft)}</div><h4>${e(entry?.name||'새싹 슬라임')}</h4><div class="fv-actions fv-character-save"><button type="button" class="fv-button fv-primary" data-fv-action="save_character" ${ctx.disabled||draft===game.profile.characterId?'disabled':''}>${draft===game.profile.characterId?'함께하는 중':'대표 캐릭터로 선택'}</button></div></section><div class="fv-wardrobe-controls"><section class="fv-side-card"><div class="fv-section-heading"><h3>함께할 친구</h3><span>${characters.filter(item=>owned(item.id)).length} / ${characters.length} 해금</span></div><p class="fv-help">작물을 수확하고 물고기를 모으면 새로운 친구가 찾아와.<br>해금과 캐릭터 선택에는 Coin을 추가로 쓰지 않아.</p><div class="fv-character-grid">${characters.map(item=>{
      const unlocked=owned(item.id),active=draft===item.id,current=game.profile.characterId===item.id;
      const targets=['harvests','fish','cropTypes','fishTypes'].filter(key=>item[key]>0),progress=targets.length?Math.min(...targets.map(key=>Math.min(1,totals[key]/item[key]))):1;
      return `<button type="button" class="fv-character-card${active?' is-active':''}${unlocked?'':' is-locked'}" data-fv-action="choose_character" data-item="${e(item.id)}" aria-pressed="${active}" ${ctx.disabled||!unlocked?'disabled':''} title="${e(unlocked?item.name:window.FarmV3Views.requirement(item))}">${art.character(item.id)}<strong>${e(item.name)}</strong><small>${unlocked?current?'함께하는 중':active?'선택 후 저장해줘':'해금됨':'🔒 '+e(condition(item))}</small>${!unlocked?`<span class="fv-character-progress" aria-hidden="true"><i style="width:${Math.round(progress*100)}%"></i></span>`:''}</button>`;
    }).join('')}</div></section></div></div>`;
  }
  window.FarmV3CharactersView={render};
})();
