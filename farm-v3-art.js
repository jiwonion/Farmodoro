/* Raster atlas renderer. Original PNGs remain unchanged; tinting is a runtime palette effect. */
(() => {
  "use strict";
  const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function icon(index, label="") {
    return `<span class="fv-icon" role="img" aria-label="${escape(label)}" style="--icon-x:${index%4*100/3}%;--icon-y:${Math.floor(index/4)*100/3}%"></span>`;
  }
  // Individual sprite bounds retain long fins and bills that extend beyond an
  // equal atlas cell, while excluding neighboring fish and detached alpha noise.
  const fishBounds=[
    [12,141,303,117],[336,118,277,139],[642,76,282,215],[952,107,291,155],
    [24,370,275,237],[316,419,307,143],[636,391,300,186],[964,397,276,190],
    [16,688,284,194],[342,680,268,220],[635,670,316,231],[965,691,284,205],
    [9,1004,308,152],[320,979,298,195],[620,989,326,174],[948,1013,296,145]
  ];
  function fish(id,label="") {
    const entry=window.FarmV3Catalog.find('fish',id);
    if(!entry)return '';
    if(entry.art<8)return icon(entry.art,label||entry.name);
    const bounds=fishBounds[entry.art-8];if(!bounds)return '';
    return `<span class="fv-icon fv-fish-icon" data-fv-fish="${escape(entry.id)}" role="img" aria-label="${escape(label||entry.name)}" style="background-image:none"><svg width="100%" height="100%" viewBox="0 0 128 128" aria-hidden="true"><svg x="8" y="8" width="112" height="112" style="width:87.5%;height:87.5%" viewBox="${bounds.join(' ')}" preserveAspectRatio="xMidYMid meet" overflow="hidden"><image href="./assets/farm-v3/fish-expansion-v1.png" width="1254" height="1254"/></svg></svg></span>`;
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
      if(canvas.dataset.fvCharacterPose==='fishing'){
        canvas.parentElement.style.setProperty('--fv-fishing-art-top',image.dataset.artTop+'%');
        canvas.parentElement.style.setProperty('--fv-fishing-contact-x',image.dataset.floatX+'%');
        canvas.parentElement.style.setProperty('--fv-fishing-contact-y',image.dataset.floatY+'%');
      }
      const context=canvas.getContext('2d');context.imageSmoothingEnabled=false;context.clearRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0);canvas.dataset.painted='true';
    }));
  }
  window.FarmV3Art={icon,fish,crop,character,paintAll};
})();
