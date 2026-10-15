/* Independent raster layers: no facial features or clothing are baked into the body. */
(() => {
  'use strict';
  const root='./assets/farm-v3/',images=new Map(),frames=new Map(),cache=new Map();
  const canvas=()=>Object.assign(document.createElement('canvas'),{width:128,height:160});
  const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  // Registration coordinates are measured on the original atlases, not on a
  // resized bounding box. A ponytail must not shrink the skull or face opening.
  // Skull-to-chin box per pose. The head is a 3/4 view facing right, so the
  // face plane (right of the ear) is centred near 63% of the head width.
  const bodyHeads=[[267,122,352,307],[813,178,348,303],[1364,175,345,303]];
  const hairCells=[
    [[20,30,415,398],[436,30,392,398],[830,30,439,398]],
    [[20,439,405,388],[431,439,395,388],[828,439,441,388]],
    [[20,842,405,398],[431,842,395,398],[828,842,441,398]],
  ];
  // Centre of each wig's face opening at the bottom edge of its bangs.
  const hairAnchors=[
    [[274,295],[665,295],[1119,292]],
    [[263,674],[661,689],[1118,693]],
    [[258,1080],[655,1074],[1094,1072]],
  ];
  // Head-relative layout: [u,v] centres, plus atlas-pixel scales per head width.
  // Face parts share one scale so their authored proportions are preserved.
  const layout={faceScale:.5/351,hairScale:1.15/352,hairAt:[.63,.6],
    eyes:[.645,.74],nose:[.665,.855],mouth:[.65,.9]};
  function load(name){if(!images.has(name))images.set(name,new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>{images.delete(name);reject(Error('Avatar layer unavailable: '+name));};image.src=root+name;}));return images.get(name);}
  function frame(image,col,row,kind='grid'){
    const key=image.src+':'+col+':'+row+':'+kind;if(frames.has(key))return frames.get(key);
    const cuts=kind==='face'?[[.285,.44],[.52,.70],[.74,.91]]:kind==='clothes'?[[0,.40],[.42,.74],[.76,1]]:null;
    const columns=kind==='hat'?4:3,rows=kind==='body'?1:kind==='hat'?4:3;
    const cell=kind==='hair'?hairCells[row][col]:null;
    const x=cell?cell[0]:Math.floor(col*image.naturalWidth/columns),right=cell?x+cell[2]:Math.floor((col+1)*image.naturalWidth/columns);
    const y=cell?cell[1]:Math.floor((cuts?cuts[row][0]:row/rows)*image.naturalHeight),bottom=cell?y+cell[3]:Math.floor((cuts?cuts[row][1]:(row+1)/rows)*image.naturalHeight);
    const source=document.createElement('canvas');source.width=right-x;source.height=bottom-y;
    const ctx=source.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,x,y,source.width,source.height,0,0,source.width,source.height);
    // Hard alpha keeps pixel edges crisp and drops faint generator haze.
    const pixels=ctx.getImageData(0,0,source.width,source.height);for(let i=3;i<pixels.data.length;i+=4)pixels.data[i]=pixels.data[i]>96?255:0;ctx.putImageData(pixels,0,0);
    let l=source.width,t=source.height,r=-1,b=-1;
    for(let py=0;py<source.height;py++)for(let px=0;px<source.width;px++)if(pixels.data[(py*source.width+px)*4+3]>96){l=Math.min(l,px);r=Math.max(r,px);t=Math.min(t,py);b=Math.max(b,py);}
    if(r<l)throw Error('Empty avatar part: '+key);
    const result={source,pixels,origin:[x,y],bounds:[l,t,r-l+1,b-t+1]};frames.set(key,result);return result;
  }
  function tint(part,color,mode){
    if(!color)return part.source;
    const out=document.createElement('canvas');out.width=part.source.width;out.height=part.source.height;
    const ctx=out.getContext('2d'),data=new ImageData(new Uint8ClampedArray(part.pixels.data),out.width,out.height),target=rgb(color);
    for(let i=0;i<data.data.length;i+=4){if(data.data[i+3]<24)continue;const[r,g,b]=data.data.slice(i,i+3);
      if(mode==='blue'&&!(b>r*1.12&&b>g*1.05))continue;
      const base={skin:205,hair:95,top:190,blue:90,shoes:95}[mode]||128;
      const shade=Math.max(.18,Math.min(1.3,(r*.3+g*.5+b*.2)/base));target.forEach((v,k)=>data.data[i+k]=Math.min(255,Math.round(v*shade)));
    }ctx.putImageData(data,0,0);return out;
  }
  function draw(target,part,rect,color,mode){
    const ctx=target.getContext('2d');ctx.imageSmoothingEnabled=false;
    const[l,t,w,h]=part.bounds;let[x,y,dw,dh]=rect;
    const scale=Math.min(dw/w,dh/h);x+=(dw-w*scale)/2;y+=(dh-h*scale)/2;
    ctx.drawImage(tint(part,color,mode),l,t,w,h,Math.round(x),Math.round(y),w*scale,h*scale);
  }
  // Maps an atlas point (ax,ay) onto head-relative [u,v] at a fixed scale.
  function place(target,part,head,[u,v],scale,anchor,color,mode){
    const[l,t,w,h]=part.bounds,[ax,ay]=anchor||[part.origin[0]+l+w/2,part.origin[1]+t+h/2];
    const x=head.x+u*head.w+(part.origin[0]+l-ax)*scale,y=head.y+v*head.h+(part.origin[1]+t-ay)*scale;
    draw(target,part,[x,y,w*scale,h*scale],color,mode);
  }
  async function layers(config,pose='stand'){
    const c={eyes:0,nose:0,mouth:0,...config},catalog=window.FarmV3Catalog;
    const col=pose==='sit'?1:pose==='fish'?2:0;
    const[bodyImage,hairImage,faceImage,clothesImage,hatImage]=await Promise.all(['avatar-mannequin-v1.png','avatar-hair-parts-v1.png','avatar-face-parts-v1.png','avatar-clothes-parts-v1.png','collectibles-v1.png'].map(load));
    const base=frame(bodyImage,col,0,'body'),standing=frame(bodyImage,0,0,'body');
    const scale=120/standing.bounds[3],bh=base.bounds[3]*scale,bw=base.bounds[2]*scale,bx=(128-bw)/2,by=153-bh;
    const [hx,hy,hw,hh]=bodyHeads[col];
    const head={x:bx+(hx-base.origin[0]-base.bounds[0])*scale,y:by+(hy-base.origin[1]-base.bounds[1])*scale,w:hw*scale,h:hh*scale};
    const result=Object.fromEntries(['body','top','bottom','shoes','eyes','nose','mouth','hair','hat','tool'].map(name=>[name,canvas()]));
    draw(result.body,base,[bx,by,bw,bh],c.skin?catalog.skinColors[c.skin]:null,'skin');
    const piece=(name)=>c[name]===null?null:catalog.find('outfit',c[name]||c.outfit)||catalog.find('outfit','blue');
    const top=piece('top'),bottom=piece('bottom'),shoes=piece('shoes');
    if(top)draw(result.top,frame(clothesImage,col,0,'clothes'),[bx+bw*(col?.19:.17),by+bh*(col?.53:.49),bw*(col?.66:.70),bh*.28],top.shirt,'top');
    if(bottom)draw(result.bottom,frame(clothesImage,col,1,'clothes'),[bx+bw*(col?.15:.17),by+bh*(col?.53:.49),bw*.70,bh*(col?.36:.35)],bottom.pants,'blue');
    if(shoes)draw(result.shoes,frame(clothesImage,col,2,'clothes'),[bx+bw*(col?.35:.17),by+bh*.85,bw*.68,bh*.16],shoes.pants,'shoes');
    // Hands remain in front of the separately drawn clothes in seated poses.
    for(const [x,y,w,h] of col?[[.21,.68,.36,.10],[.63,.68,.25,.10]]:[[.09,.67,.20,.14],[.75,.67,.20,.14]]){
      for(const part of [result.top,result.bottom])part.getContext('2d').clearRect(bx+bw*x,by+bh*y,bw*w,bh*h);
    }
    const faceScale=head.w*layout.faceScale;
    if(c.eyes!==3)place(result.eyes,frame(faceImage,Math.min(2,c.eyes),0,'face'),head,layout.eyes,faceScale);
    if(c.nose!==3)place(result.nose,frame(faceImage,Math.min(2,c.nose),1,'face'),head,layout.nose,faceScale,null,c.skin?catalog.skinColors[c.skin]:null,'skin');
    if(c.mouth!==3)place(result.mouth,frame(faceImage,Math.min(2,c.mouth),2,'face'),head,layout.mouth,faceScale);
    if(c.style!==3){
      const row=Math.max(0,['male','female','neutral'].indexOf(c.gender));
      const style=Math.min(2,c.style||0),hair=frame(hairImage,style,row,'hair');
      place(result.hair,hair,head,layout.hairAt,head.w*layout.hairScale,hairAnchors[row][style],catalog.hairColors[c.hair]||catalog.hairColors[0],'hair');
    }
    const hat=catalog.find('hat',c.hat);
    if(hat){
      const part=frame(hatImage,hat.art%4,Math.floor(hat.art/4),'hat');
      const bottom=head.y+head.h*.40,size=head.w*(hat.id==='crown'?.95:1.55);
      const scale=Math.min(size/part.bounds[2],(bottom-1)/part.bounds[3]);
      const width=part.bounds[2]*scale,height=part.bounds[3]*scale;
      draw(result.hat,part,[head.x+head.w*.51-width/2,bottom-height,width,height]);
    }
    if(pose==='fish'){const ctx=result.tool.getContext('2d');ctx.strokeStyle='#725037';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(bx+bw*.82,by+bh*.73);ctx.lineTo(121,50);ctx.stroke();ctx.strokeStyle='#dce7e8';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(121,50);ctx.lineTo(126,148);ctx.stroke();}
    return result;
  }
  async function paint(config,pose='stand',part='all'){
    const key=JSON.stringify([config,pose,part]);if(cache.has(key))return cache.get(key);
    const pending=(async()=>{const stack=await layers(config,pose);if(part!=='all')return stack[part]||canvas();const out=canvas(),ctx=out.getContext('2d');for(const name of ['body','shoes','top','bottom','eyes','nose','mouth','hair','hat','tool'])ctx.drawImage(stack[name],0,0);return out;})();
    if(cache.size>=128)cache.delete(cache.keys().next().value);
    cache.set(key,pending);try{return await pending;}catch(error){cache.delete(key);throw error;}
  }
  window.FarmV3AvatarParts={layers,paint};
})();
