(() => {
  'use strict';
  const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const button=(action,label,disabled=false,extra='')=>`<button type="button" class="fv-button" data-fv-action="${action}" ${extra} ${disabled?'disabled':''}>${label}</button>`;
  function render(ctx){
    const snapshot=ctx.plaza,profile=ctx.game.profile,art=window.FarmV3Art;
    const draft=ctx.plazaDraft||{nickname:profile.nickname,position:profile.position,speech:profile.speech};
    const canMove=ctx.game.plazaPositionVersion===1,canSpeak=ctx.game.plazaSpeechVersion===1,editable=canMove&&!ctx.disabled;
    const people=(snapshot?.items||[]).map(person=>person.isMe?{...person,nickname:draft.nickname,position:draft.position,speech:draft.speech}:person);
    if(!people.some(person=>person.isMe))people.push({nickname:draft.nickname,characterId:profile.characterId,position:draft.position,speech:draft.speech,isMe:true,preview:true});
    return `<div class="fv-main-layout"><div class="fv-main-column">
      <div class="fv-scene fv-scene-plaza fv-position-map" data-fv-action="plaza_position" tabindex="${editable?'0':'-1'}" role="group" aria-label="광장 위치 선택" aria-disabled="${!editable}" data-fv-position-enabled="${editable}">
        ${people.map(person=>`<div class="fv-plaza-person${person.isMe?' is-me':''}${person.preview?' is-preview':''}" data-fv-public-person="${!person.preview}" style="left:${person.position.x}%;top:${person.position.y}%;z-index:${Math.round(person.position.y*10)}" title="${e(person.nickname)}">
          ${person.isMe?'<i class="fv-position-ring" aria-hidden="true"></i>':''}
          <div class="fv-speech" ${person.speech?.trim()?'':'hidden'}>${e(person.speech?.trim()||'')}</div>
          ${art.character(person.characterId)}<span>${e(person.nickname)}${person.isMe?person.preview?' · 내 위치 미리보기':' · 나':''}</span>
        </div>`).join('')}
      </div>
      <div class="fv-under-scene"><span>저장된 광장${snapshot?' · '+Number(snapshot.total).toLocaleString()+'명 참여':''}</span><div>${button('plaza_refresh','새로고침',ctx.plazaLoading)}${snapshot?.total>12?button('plaza_page','다른 주민 보기',ctx.plazaLoading):''}</div></div>
      ${ctx.plazaError?'<p class="fv-debt-note">광장 불러오기 실패</p>':''}${ctx.plazaLoading?'<p class="fv-help" role="status">광장 불러오는 중</p>':''}
      </div><aside class="fv-sidebar"><section class="fv-side-card"><h3>내 광장 모습</h3>
      <div class="fv-plaza-avatar">${art.character(profile.characterId)}</div>
      <form data-fv-form="plaza"><label class="fv-field">공개 닉네임<input name="nickname" maxlength="24" value="${e(draft.nickname)}" autocomplete="off" required></label>
      ${canSpeak?`<label class="fv-field">캐릭터 대사<input name="speech" maxlength="160" value="${e(draft.speech)}" placeholder="대사 입력" autocomplete="off" aria-describedby="fvSpeechCount" ${ctx.disabled?'disabled':''}></label><div class="fv-speech-tools"><small id="fvSpeechCount">${Array.from(draft.speech||'').length} / 80자</small>${button('plaza_clear_speech','대사 지우기',ctx.disabled)}</div>`:''}
      <button class="fv-button fv-primary fv-position-save" type="submit" ${ctx.disabled?'disabled':''}>${canSpeak?'광장 모습 저장':canMove?'광장 위치 저장':'광장 모습 저장'}</button></form>
      </section>${button('tab','대표 캐릭터 선택',false,'data-tab="wardrobe"')}</aside></div>`;
  }
  function layoutSpeech(root){
    const map=root.querySelector?.('.fv-position-map');if(!map)return;
    const bounds=map.getBoundingClientRect();
    for(const bubble of map.querySelectorAll('.fv-speech:not([hidden])')){
      bubble.style.setProperty('--speech-shift-x','0px');bubble.style.setProperty('--speech-shift-y','0px');
      const box=bubble.getBoundingClientRect();
      const dx=Math.max(bounds.left+8-box.left,Math.min(0,bounds.right-8-box.right));
      const dy=Math.max(0,bounds.top+8-box.top);
      bubble.style.setProperty('--speech-shift-x',`${dx}px`);bubble.style.setProperty('--speech-shift-y',`${dy}px`);
    }
  }
  window.FarmV3PlazaView={render,layoutSpeech};
  window.addEventListener('resize',()=>layoutSpeech(document));
})();
