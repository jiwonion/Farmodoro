const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const http=require('node:http');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'farmodoro-production-art-'));
const server=http.createServer((request,response)=>{
  const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
  const file=path.resolve(root,'.'+pathname);
  if(!file.startsWith(root+path.sep)){response.writeHead(403).end();return}
  try{response.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.png')?'image/png':file.endsWith('.js')?'text/javascript':'text/plain');response.end(fs.readFileSync(file))}catch{response.writeHead(404).end()}
});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let chrome,ws;
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-sandbox','--disable-crash-reporter','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
  chrome.on('error',error=>{throw error});
  const portFile=path.join(profile,'DevToolsActivePort');
  for(let i=0;i<200&&!fs.existsSync(portFile);i++)await pause(50);
  const port=fs.readFileSync(portFile,'utf8').split(/\r?\n/)[0];
  const tabs=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws=new WebSocket(tabs.find(tab=>tab.type==='page').webSocketDebuggerUrl);
  await new Promise(resolve=>ws.addEventListener('open',resolve,{once:true}));
  let sequence=0;const pending=new Map();
  ws.addEventListener('message',event=>{const message=JSON.parse(event.data);if(pending.has(message.id)){pending.get(message.id)(message);pending.delete(message.id)}});
  const call=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++sequence;const timeout=setTimeout(()=>{pending.delete(id);reject(new Error(`Timeout:${method}`))},10000);
    pending.set(id,message=>{clearTimeout(timeout);message.error?reject(new Error(JSON.stringify(message.error))):resolve(message.result)});ws.send(JSON.stringify({id,method,params}));
  });
  const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert.equal(result.exceptionDetails,undefined);return result.result.value};
  await call('Emulation.setDeviceMetricsOverride',{width:1200,height:1000,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/output/scenery-creation-art/theme-preview.html`});
  for(let i=0;i<100;i++){if(await evaluate('window.artReady===true'))break;await pause(100)}
  assert.equal(await evaluate('window.artReady'),true);
  assert.deepEqual(await evaluate('window.artErrors'),[]);
  assert.equal(await evaluate('document.querySelectorAll(".frame").length'),116);
  assert.equal(await evaluate('document.querySelectorAll(".frame > svg > svg > image").length'),116);
  assert.equal(await evaluate('new Set(Array.from(document.querySelectorAll(".frame"),frame=>frame.dataset.type)).size'),29);
  assert.equal(await evaluate('Array.from(document.querySelectorAll(".frame > svg")).every(svg=>svg.getAttribute("aria-hidden")==="true"&&svg.getAttribute("focusable")==="false"&&svg.querySelector("svg").getAttribute("overflow")==="hidden")'),true);
  await evaluate('document.fonts.ready');
  await pause(100);
  for(const [selector,filename] of [['#atlas','theme-preview.png'],['#dark','theme-dark-preview.png']]) {
    const bounds=await evaluate(`(()=>{const r=document.querySelector('${selector}').getBoundingClientRect();return{x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height,scale:1}})()`);
    const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:bounds});
    fs.writeFileSync(path.join(__dirname,filename),Buffer.from(shot.data,'base64'));
  }
  const result={status:'pass',types:29,stages:116,dimensions:await evaluate('window.artDimensions'),screenshots:['theme-preview.png','theme-dark-preview.png']};
  fs.writeFileSync(path.join(__dirname,'production-browser-validation.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
})().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>{ws?.close();chrome?.kill();server.close()});
