/* Complete mascot sprites. Their faces and bodies are never resized separately. */
(() => {
  'use strict';
  const frames=new Map(),cache=new Map(),images=new Map();
  const canvas=fishing=>Object.assign(document.createElement('canvas'),{width:fishing?256:128,height:fishing?192:160});
  function image(fishing,expanded){
    const key=(fishing?'fishing':'normal')+(expanded?':expanded':'');
    const filename=expanded?(fishing?'mascots-fishing-expansion-v1.png':'mascots-expansion-v1.png'):(fishing?'mascots-fishing-v1.png':'mascots-v1.png');
    if(!images.has(key))images.set(key,new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>{images.delete(key);reject(Error('Character atlas unavailable'));};img.src='./assets/farm-v3/'+filename;}));
    return images.get(key);
  }
  function cleanFishingFrame(pixels,width,height){
    const size=width*height,seen=new Uint8Array(size),queue=new Int32Array(size);let largest=[];
    for(let seed=0;seed<size;seed++){
      if(seen[seed]||pixels[seed*4+3]<=16)continue;
      let head=0,tail=1;queue[0]=seed;seen[seed]=1;
      while(head<tail){
        const point=queue[head++],x=point%width,y=Math.floor(point/width);
        for(let ny=Math.max(0,y-1);ny<=Math.min(height-1,y+1);ny++)for(let nx=Math.max(0,x-1);nx<=Math.min(width-1,x+1);nx++){
          const next=ny*width+nx;if(!seen[next]&&pixels[next*4+3]>16){seen[next]=1;queue[tail++]=next;}
        }
      }
      if(tail>largest.length)largest=queue.slice(0,tail);
    }
    // The mascot, rod, line and float form one sprite; neighboring atlas cells can leave detached marks.
    const keep=new Uint8Array(size);
    for(const point of largest){
      const x=point%width,y=Math.floor(point/width);
      for(let ny=Math.max(0,y-1);ny<=Math.min(height-1,y+1);ny++)for(let nx=Math.max(0,x-1);nx<=Math.min(width-1,x+1);nx++)keep[ny*width+nx]=1;
    }
    for(let point=0;point<size;point++)if(!keep[point])pixels[point*4+3]=0;
  }
  function floatContact(pixels,width,height,bounds){
    const [left,top,w,h]=bounds,red=[];
    // All poses cast to the right. Restrict detection to the float area so red
    // mascots, cheeks and mouths cannot become water-contact anchors.
    for(let y=Math.floor(top+h*.55);y<top+h;y++)for(let x=Math.floor(left+w*.8);x<left+w;x++){
      const offset=(y*width+x)*4,r=pixels[offset],g=pixels[offset+1],b=pixels[offset+2];
      if(pixels[offset+3]>160&&r>150&&r>g*1.8&&r>b*1.55&&g<145&&b<150)red.push([x,y]);
    }
    if(red.length<5)return null;
    // The lower red band is the float; thin atlas debris near the line is ignored.
    const bottom=Math.max(...red.map(point=>point[1])),band=red.filter(point=>point[1]>=bottom-h*.11);
    const minX=Math.min(...band.map(point=>point[0])),maxX=Math.max(...band.map(point=>point[0]));
    if(maxX-minX<3||maxX-minX>w*.2)return null;
    const x=(minX+maxX)/2;let y=bottom;
    // Include the white lower half and its outline: the water meets its bottom.
    for(let py=bottom;py<top+h;py++)for(let px=Math.max(left,Math.floor(x-w*.025));px<=Math.min(left+w-1,Math.ceil(x+w*.025));px++)if(pixels[(py*width+px)*4+3]>96)y=Math.max(y,py);
    return [x,y];
  }
  async function frame(index,fishing){
    const key=(fishing?'fishing:':'normal:')+index;if(frames.has(key))return frames.get(key);
    const expanded=index>=8,localIndex=expanded?index-8:index;
    const atlas=await image(fishing,expanded),col=localIndex%4,row=Math.floor(localIndex/4);
    // Generated feet and floats can extend a few pixels into the transparent
    // gutter. Include that gutter, then keep only this cell's connected sprite.
    const gutter=expanded?16:0;
    const x=Math.max(0,Math.floor(col*atlas.naturalWidth/4)-gutter),y=Math.max(0,Math.floor(row*atlas.naturalHeight/2)-gutter);
    const source=document.createElement('canvas');source.width=Math.min(atlas.naturalWidth,Math.floor((col+1)*atlas.naturalWidth/4)+gutter)-x;source.height=Math.min(atlas.naturalHeight,Math.floor((row+1)*atlas.naturalHeight/2)+gutter)-y;
    const ctx=source.getContext('2d',{willReadFrequently:true});ctx.drawImage(atlas,x,y,source.width,source.height,0,0,source.width,source.height);
    const bitmap=ctx.getImageData(0,0,source.width,source.height),pixels=bitmap.data;let l=source.width,t=source.height,r=-1,b=-1;
    if(expanded){cleanFishingFrame(pixels,source.width,source.height);ctx.putImageData(bitmap,0,0);}
    for(let py=0;py<source.height;py++)for(let px=0;px<source.width;px++)if(pixels[(py*source.width+px)*4+3]>96){l=Math.min(l,px);r=Math.max(r,px);t=Math.min(t,py);b=Math.max(b,py);}
    if(r<l)throw Error('Empty character frame: '+index);
    // Keep the existing bounds so clearing atlas debris does not move the float or character.
    if(fishing&&!expanded){cleanFishingFrame(pixels,source.width,source.height);ctx.putImageData(bitmap,0,0);}
    const bounds=[l,t,r-l+1,b-t+1];
    const result={source,bounds,contact:fishing?floatContact(pixels,source.width,source.height,bounds):null};frames.set(key,result);return result;
  }
  async function paint(id,pose){
    const fishing=pose==='fishing';
    const entry=window.FarmV3Catalog.find('character',id)||window.FarmV3Catalog.find('character',window.FarmV3Catalog.defaultCharacter);
    const key=entry.id+(fishing?':fishing':':normal');if(cache.has(key))return cache.get(key);
    const pending=(async()=>{
      const {source,bounds:[l,t,w,h],contact}=await frame(entry.art,fishing),out=canvas(fishing),ctx=out.getContext('2d');
      const scale=fishing?Math.min(155/w,145/h):Math.min(102/w,100/h),width=w*scale,height=h*scale;
      const drawX=Math.round((out.width-width)/2),drawY=(fishing?180:151)-height;
      ctx.imageSmoothingEnabled=false;ctx.drawImage(source,l,t,w,h,drawX,drawY,width,height);
      out.dataset.artTop=String(((fishing?180:151)-height)/out.height*100);
      if(fishing){
        out.dataset.floatX=String(contact?(drawX+(contact[0]-l)*scale)/out.width*100:76.5);
        out.dataset.floatY=String(contact?(drawY+(contact[1]-t)*scale)/out.height*100:93);
      }
      return out;
    })();cache.set(key,pending);try{return await pending;}catch(error){cache.delete(key);throw error;}
  }
  window.FarmV3CharacterArt={paint};
})();
