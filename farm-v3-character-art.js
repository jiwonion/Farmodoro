/* Complete mascot sprites. Their faces and bodies are never resized separately. */
(() => {
  'use strict';
  const frames=new Map(),cache=new Map(),images=new Map();
  const canvas=fishing=>Object.assign(document.createElement('canvas'),{width:fishing?256:128,height:fishing?192:160});
  function image(fishing){
    const key=fishing?'fishing':'normal';
    if(!images.has(key))images.set(key,new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>{images.delete(key);reject(Error('Character atlas unavailable'));};img.src=fishing?'./assets/farm-v3/mascots-fishing-v1.png':'./assets/farm-v3/mascots-v1.png';}));
    return images.get(key);
  }
  async function frame(index,fishing){
    const key=(fishing?'fishing:':'normal:')+index;if(frames.has(key))return frames.get(key);
    const atlas=await image(fishing),col=index%4,row=Math.floor(index/4);
    const x=Math.floor(col*atlas.naturalWidth/4),y=Math.floor(row*atlas.naturalHeight/2);
    const source=document.createElement('canvas');source.width=Math.floor((col+1)*atlas.naturalWidth/4)-x;source.height=Math.floor((row+1)*atlas.naturalHeight/2)-y;
    const ctx=source.getContext('2d',{willReadFrequently:true});ctx.drawImage(atlas,x,y,source.width,source.height,0,0,source.width,source.height);
    const pixels=ctx.getImageData(0,0,source.width,source.height).data;let l=source.width,t=source.height,r=-1,b=-1;
    for(let py=0;py<source.height;py++)for(let px=0;px<source.width;px++)if(pixels[(py*source.width+px)*4+3]>96){l=Math.min(l,px);r=Math.max(r,px);t=Math.min(t,py);b=Math.max(b,py);}
    if(r<l)throw Error('Empty character frame: '+index);
    const result={source,bounds:[l,t,r-l+1,b-t+1]};frames.set(key,result);return result;
  }
  async function paint(id,pose){
    const fishing=pose==='fishing';
    const entry=window.FarmV3Catalog.find('character',id)||window.FarmV3Catalog.find('character',window.FarmV3Catalog.defaultCharacter);
    const key=entry.id+(fishing?':fishing':':normal');if(cache.has(key))return cache.get(key);
    const pending=(async()=>{
      const {source,bounds:[l,t,w,h]}=await frame(entry.art,fishing),out=canvas(fishing),ctx=out.getContext('2d');
      const scale=fishing?Math.min(155/w,145/h):Math.min(102/w,100/h),width=w*scale,height=h*scale;
      ctx.imageSmoothingEnabled=false;ctx.drawImage(source,l,t,w,h,Math.round((out.width-width)/2),(fishing?180:151)-height,width,height);
      return out;
    })();cache.set(key,pending);try{return await pending;}catch(error){cache.delete(key);throw error;}
  }
  window.FarmV3CharacterArt={paint};
})();
