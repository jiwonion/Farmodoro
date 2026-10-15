// Focused visual regression runner: real Chrome canvas, no account/database required.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let chrome,ws,server;
(async()=>{
  const html=`<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#eef3eb;font:14px sans-serif;color:#49372d}h1{font-size:20px;margin:20px}main{display:grid;grid-template-columns:repeat(9,1fr);gap:10px;padding:20px}article{background:white;text-align:center;border-radius:12px;padding:12px 0}canvas{display:block;width:128px;height:160px;margin:auto;image-rendering:pixelated}p{margin:8px 0 0;font-size:12px}</style><script src="farm-v3-catalog.js"></script><script src="farm-v3-avatar.js"></script><h1>농부 부품 정렬 확인</h1><main></main>`;
  server=http.createServer((req,res)=>{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(name==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);return;}const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.png')?'image/png':'text/plain');res.end(fs.readFileSync(file));}catch(_){res.writeHead(404).end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'farmodoro-avatar-'));
  chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-sandbox','--disable-crash-reporter','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
  const portFile=path.join(profile,'DevToolsActivePort');for(let i=0;i<200&&!fs.existsSync(portFile);i++)await pause(50);
  const port=fs.readFileSync(portFile,'utf8').split(/\r?\n/)[0],tabs=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws=new WebSocket(tabs.find(tab=>tab.type==='page').webSocketDebuggerUrl);await new Promise(resolve=>ws.addEventListener('open',resolve,{once:true}));
  let seq=0;const pending=new Map();ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timeout=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out'));},20000);pending.set(id,m=>{clearTimeout(timeout);m.error?reject(Error(JSON.stringify(m.error))):resolve(m.result);});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert.equal(result.exceptionDetails,undefined,JSON.stringify(result.exceptionDetails));return result.result.value;};
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:850,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});
  for(let i=0;i<100;i++){if(await evaluate('!!window.FarmV3AvatarParts'))break;await pause(30);}
  const results=await evaluate(`(async()=>{
    const ratios=[],original=CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage=function(...a){if(a.length===9&&a[3]>0&&a[4]>0)ratios.push({source:[a[3],a[4]],target:[a[7],a[8]],error:Math.abs((a[7]/a[3])/(a[8]/a[4])-1)});return original.apply(this,a);};
    const configs=[];for(const pose of ['stand','sit','fish'])for(const gender of ['male','female','neutral'])for(let style=0;style<3;style++)configs.push({pose,gender,style});
    for(const {pose,gender,style} of configs){const c={...FarmV3Catalog.recommendedAvatar,gender,style};const image=await FarmV3AvatarParts.paint(c,pose);const cell=document.createElement('article');cell.append(image.cloneNode());cell.firstChild.getContext('2d').drawImage(image,0,0);const label=document.createElement('p');label.textContent=gender+' '+style+' / '+pose;cell.append(label);document.querySelector('main').append(cell);}
    CanvasRenderingContext2D.prototype.drawImage=original;
    return {distorted:ratios.filter(r=>r.error>.015),count:configs.length};
  })()`);
  await pause(50);const screenshot=await call('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync(path.join(root,'output','farm-v3-avatar-registration.png'),Buffer.from(screenshot.data,'base64'));
  assert.deepEqual(results.distorted,[],'Every part must preserve its source aspect ratio');
  assert.equal(results.count,27);
  const visibility=await evaluate(`(async()=>{
    const result=[];
    for(const pose of ['stand','sit','fish'])for(const gender of ['male','female','neutral'])for(let style=0;style<3;style++){
      const stack=await FarmV3AvatarParts.layers({...FarmV3Catalog.recommendedAvatar,gender,style},pose);
      const pixels=name=>stack[name].getContext('2d').getImageData(0,0,128,160).data;
      const body=pixels('body'),hair=pixels('hair');
      for(const name of ['eyes','nose','mouth']){const part=pixels(name);let total=0,onSkin=0,visible=0;for(let i=3;i<part.length;i+=4)if(part[i]>96){total++;if(body[i]>96)onSkin++;if(hair[i]<96)visible++;}result.push({pose,gender,style,part:name,total,onSkin:total?onSkin/total:0,visible:total?visible/total:0});}
    }
    return result;
  })()`);
  for(const feature of visibility){assert.ok(feature.total>0,JSON.stringify(feature));assert.ok(feature.onSkin>.95,'Facial part must stay on the head: '+JSON.stringify(feature));assert.ok(feature.visible>.45,'Hair must leave the facial part visible: '+JSON.stringify(feature));}
  await call('Emulation.setDeviceMetricsOverride',{width:1000,height:480,deviceScaleFactor:1,mobile:false});
  await evaluate(`(async()=>{
    document.querySelector('h1').textContent='부품 비율 · 얼굴 정렬 수정';
    const main=document.querySelector('main');main.replaceChildren();main.style.gridTemplateColumns='repeat(3,1fr)';
    for(const [style,label]of [[1,'단발·웨이브'],[2,'묶은 머리 (C)'],[0,'짧은 머리']]){const image=await FarmV3AvatarParts.paint({...FarmV3Catalog.recommendedAvatar,style});const cell=document.createElement('article'),canvas=image.cloneNode();canvas.style.width='256px';canvas.style.height='320px';canvas.getContext('2d').drawImage(image,0,0);cell.append(canvas);const title=document.createElement('p');title.textContent=label;cell.append(title);main.append(cell);}
  })()`);
  const corrected=await call('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync(path.join(root,'output','farm-v3-avatar-corrected.png'),Buffer.from(corrected.data,'base64'));
  console.log('PASS: 27 gender/style/pose combinations preserve part aspect ratios and keep facial features on the head and visible. Screenshots: output/farm-v3-avatar-registration.png, output/farm-v3-avatar-corrected.png');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{ws?.close();chrome?.kill();server?.close();});
