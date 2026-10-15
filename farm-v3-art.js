/* Raster atlas renderer. Original PNGs remain unchanged; tinting is a runtime palette effect. */
(() => {
  "use strict";
  const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function icon(index, label="") {
    return `<span class="fv-icon" role="img" aria-label="${escape(label)}" style="--icon-x:${index%4*100/3}%;--icon-y:${Math.floor(index/4)*100/3}%"></span>`;
  }
  function crop(id,progress,cost) {
    if (progress==null) return window.FarmV3CropArt?.crop(id)||"";
    const ratio=progress/Math.max(1,cost);
    return window.FarmV3CropArt?.plantedCrop(id,ratio>=1?'mature':ratio>=.6?'growing':ratio>=.25?'sprout':'seed')||"";
  }
  function character(id,extra='',pose='') {
    const entry=window.FarmV3Catalog.find('character',id)||window.FarmV3Catalog.find('character',window.FarmV3Catalog.defaultCharacter);
    const fishing=pose==='fishing';
    return `<canvas class="fv-avatar ${fishing?'fv-avatar-fishing ':''}${escape(extra)}" width="${fishing?256:128}" height="${fishing?192:160}" data-fv-character="${escape(entry.id)}" ${fishing?'data-fv-character-pose="fishing"':''} aria-label="${escape(entry.name)}${fishing?' · 낚시 중':''}" role="img"></canvas>`;
  }
  async function paintAll(scope=document) {
    await Promise.allSettled([...scope.querySelectorAll('canvas[data-fv-character]')].map(async canvas=>{
      if(canvas.dataset.painted)return;
      const image=await window.FarmV3CharacterArt.paint(canvas.dataset.fvCharacter,canvas.dataset.fvCharacterPose);
      if(!canvas.isConnected)return;
      const context=canvas.getContext('2d');context.imageSmoothingEnabled=false;context.clearRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0);canvas.dataset.painted='true';
    }));
  }
  window.FarmV3Art={icon,crop,character,paintAll};
})();
