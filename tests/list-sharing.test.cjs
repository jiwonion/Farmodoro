// Actual browser coverage of visible-list snapshots, PNG creation and file sharing.
// Run with Node 22+ and Chrome (or CHROME_PATH).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "farmodoro-sharing-"));
const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const html = fs.readFileSync(path.join(root, "index.html"), "utf8")
  .replace(/<script\b[^>]*src="(?:https:[^"]*|\.\/pwa-register\.js[^"]*)"[^>]*>[\s\S]*?<\/script>/gi, "");
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  if (pathname === "/") { response.setHeader("Content-Type", "text/html; charset=utf-8"); response.end(html); return; }
  const file = path.resolve(root, "." + pathname);
  if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  try {
    response.setHeader("Content-Type", file.endsWith(".css") ? "text/css" : file.endsWith(".js") ? "text/javascript" : file.endsWith(".svg") ? "image/svg+xml" : "application/octet-stream");
    response.end(fs.readFileSync(file));
  } catch { response.writeHead(404).end(); }
});
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let chrome;
let ws;

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  chrome = spawn(chromePath, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-sandbox", "--disable-crash-reporter", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
  let chromeError;
  chrome.on("error", (error) => { chromeError = error; });
  const portFile = path.join(profile, "DevToolsActivePort");
  for (let index = 0; index < 200 && !fs.existsSync(portFile) && !chromeError; index++) await pause(50);
  if (chromeError) throw chromeError;
  assert.ok(fs.existsSync(portFile), "Chrome debugging port is available");
  let port;
  for (let index = 0; index < 10 && !port; index++) {
    try { port = fs.readFileSync(portFile, "utf8").split(/\r?\n/)[0]; } catch { await pause(50); }
  }
  assert.ok(port, "Chrome debugging port can be read");
  let tabs;
  for (let index = 0; index < 50 && !tabs; index++) {
    try { tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch { await pause(50); }
  }
  assert.ok(tabs, "Chrome debugging endpoint is available");
  ws = new WebSocket(tabs.find((tab) => tab.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  const exceptions = [];
  const events = [];
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (message.method) events.push(message);
    if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const next = ++id;
    const timeout = setTimeout(() => { pending.delete(next); reject(new Error(`Timeout: ${method}`)); }, 15000);
    pending.set(next, (message) => { clearTimeout(timeout); if (message.error) reject(new Error(JSON.stringify(message.error))); else resolve(message.result); });
    ws.send(JSON.stringify({ id: next, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const execute = (expression) => evaluate(`(async()=>{${expression}})()`);
  await call("Runtime.enable");
  await call("Page.enable");
  await call("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/` });
  let loaded = false;
  for (let index = 0; index < 100; index++) {
    loaded = await evaluate('document.readyState === "complete" && typeof openListSharePreview === "function"');
    if (loaded) break;
    await pause(50);
  }
  assert.equal(loaded, true);
  assert.equal(await evaluate('getComputedStyle(listShareModal).display'), "none", "Closed preview never covers the application");
  await evaluate(`
    document.documentElement.className='';document.body.classList.remove('auth-gated');document.querySelector('#authGate').hidden=true;document.querySelector('.auth-boot')?.remove();
    window.__shareToday=toProductivityDateString();window.__shareWeekday=new Date(__shareToday+'T12:00:00').getDay()||7;
    state.groups=[{id:'g1',name:'공부',color:0},{id:'g2',name:'운동',color:1}];
    state.tasks=[
      {id:'t1',title:'복습하기',status:'waiting',groupId:'g1',focusSeconds:0},
      {id:'t2',title:'책 읽기',status:'done',groupId:'g1',focusSeconds:600},
      {id:'t3',title:'걷기',status:'waiting',groupId:'g2',focusSeconds:0},
      {id:'t4',title:'지난 기록',status:'done',groupId:'g1',archived:true,focusSeconds:0},
      {id:'t5',title:'개인 메모',status:'waiting',groupId:null,focusSeconds:0}
    ];
    window.__habit=(id,title,extra={})=>({id,title,weekdays:[1,2,3,4,5,6,7],startDate:'2020-01-01',completionDates:[],recordMetaByDate:{},focusSecondsByDate:{},targetByWeekday:{},...extra});
    state.habits=[
      __habit('h1','영어 공부',{minimumTitle:'영어 단어 3개',completionDates:[__shareToday],recordMetaByDate:{[__shareToday]:{completionLevel:'min'}}}),
      __habit('h2','산책',{weekdays:[__shareWeekday===7?1:__shareWeekday+1]}),
      __habit('h3','독서',{measureType:'time',targetValue:25,minimumFocusMinutes:5}),
      __habit('h4','종료된 습관',{endDate:'2020-01-02'})
    ];
    taskDataHydrated=true; taskGroupFilter='g1';taskArchiveView=false;showPage('tasks');
    Object.defineProperty(navigator,'canShare',{configurable:true,writable:true,value:({files})=>files.every(file=>file instanceof File&&file.type==='image/png')});
    Object.defineProperty(navigator,'share',{configurable:true,writable:true,value:async data=>{window.__shared=data.files;}});
  `);
  const tasks = await evaluate("getListShareSnapshot('tasks')");
  assert.deepEqual(tasks.items.map((item) => item.title), ["복습하기", "책 읽기"]);
  assert.equal(tasks.completed, 1);
  assert.equal(tasks.eligible, 2);
  assert.match(tasks.subtitle, /공부/);
  assert.equal(JSON.stringify(tasks).includes('t1'), false, "Account and internal task identifiers are excluded");
  assert.deepEqual(await evaluate("taskArchiveView=true;getListShareSnapshot('tasks').items.map(item=>item.title)"), ["지난 기록"]);
  assert.deepEqual(await evaluate("taskArchiveView=false;taskGroupFilter='none';getListShareSnapshot('tasks').items.map(item=>item.title)"), ["개인 메모"]);
  await evaluate("taskGroupFilter='g1';showPage('habits');habitTierViewLevels.set('h3:'+__shareToday,'min');");
  const habits = await evaluate("getListShareSnapshot('habits')");
  assert.deepEqual(habits.items.map((item) => item.status), ["최소 달성", "미완료"]);
  assert.equal(habits.items[0].title, "영어 단어 3개");
  assert.match(habits.items[1].detail, /목표 5분/, "Time-only minimum goals remain distinguishable in the PNG");
  assert.equal(habits.completed, 1);
  assert.equal(habits.eligible, 2);
  const past = await evaluate(`selectedHabitDate='2026-01-07';getListShareSnapshot('habits')`);
  assert.match(past.subtitle, /2026\.01\.07/);
  assert.ok(past.items.every((item) => !item.offDay));
  await evaluate("showPage('today');");
  assert.equal((await evaluate("getListShareSnapshot('habits')")).items.length, 2, "Today view shares only scheduled habits");
  console.log("Task group/archive filters and selected-date habit tiers/off-days PASS");

  await execute("showPage('tasks');await openListSharePreview('tasks',document.querySelector('#shareTasks'));");
  const png = await evaluate(`(async()=>{
    const file=listSharePages[0].file;const bytes=new Uint8Array(await file.arrayBuffer());const bitmap=await createImageBitmap(file);
    return {type:file.type,name:file.name,size:file.size,signature:[...bytes.slice(0,8)],width:bitmap.width,height:bitmap.height,shareVisible:!listShareSend.hidden,download:listShareDownload.download,alt:listShareImage.alt};
  })()`);
  assert.equal(png.type, "image/png", JSON.stringify(png));
  assert.ok(png.name.endsWith(".png") && png.size > 1000);
  assert.deepEqual(png.signature, [137,80,78,71,13,10,26,10]);
  assert.equal(png.width, 900);
  assert.ok(png.height > 500 && png.height < 14000);
  assert.equal(png.shareVisible, true);
  assert.equal(png.download, png.name);
  assert.match(png.alt, /복습하기: 미완료/);
  await evaluate("listShareSend.focus();");
  await call("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  assert.equal(await evaluate("document.activeElement.matches('button[data-close-list-share]')"), true, "Tab wraps to the preview close button");
  await call("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, modifiers: 8 });
  assert.equal(await evaluate("document.activeElement===listShareSend"), true, "Shift-Tab stays inside the preview");
  await evaluate("listShareSend.click();");
  await pause(30);
  assert.equal(await evaluate("__shared.length===1&&__shared[0] instanceof File&&__shared[0].type==='image/png'"), true, "Native share receives PNG files");
  await evaluate("navigator.share=async()=>{throw new DOMException('cancelled','AbortError')};window.__statusBefore=listShareStatus.textContent;listShareSend.click();");
  await pause(30);
  assert.equal(await evaluate("listShareStatus.textContent===__statusBefore&&!listShareSend.disabled&&!listShareModal.classList.contains('hidden')"), true, "Native cancellation preserves the preview without failure feedback");
  await evaluate("navigator.share=async()=>{throw new DOMException('blocked','NotAllowedError')};listShareSend.click();");
  await pause(30);
  assert.equal(await evaluate("listShareStatus.textContent.includes('이미지 저장')&&!listShareDownload.hidden&&!listShareSend.disabled"), true, "Rejected native share retains PNG download");

  const downloads = path.join(profile, "downloads");
  fs.mkdirSync(downloads, { recursive: true });
  await call("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads, eventsEnabled: true });
  await execute("navigator.canShare=()=>false;await openListSharePreview('tasks',document.querySelector('#shareTasks'));listShareDownload.click();");
  for (let index = 0; index < 100 && !events.some((event) => event.method === "Browser.downloadProgress" && event.params.state === "completed"); index++) await pause(30);
  assert.equal(await evaluate("listShareSend.hidden&&!listShareDownload.hidden"), true, "Unsupported file sharing exposes image save");
  const downloaded = fs.readFileSync(path.join(downloads, png.name));
  assert.deepEqual([...downloaded.subarray(0, 8)], [137,80,78,71,13,10,26,10], "Fallback downloads a valid PNG");
  const oldUrl = await evaluate("listSharePages[0].url");
  await call("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  assert.equal(await evaluate("getComputedStyle(listShareModal).display==='none'&&document.activeElement.id==='shareTasks'&&!document.body.classList.contains('list-share-open')&&!document.documentElement.classList.contains('list-share-open')"), true, "Escape closes preview and restores focus/scroll");
  assert.equal(await evaluate(`fetch(${JSON.stringify(oldUrl)}).then(()=>false,()=>true)`), true, "Closing releases image object URLs");
  console.log("PNG encoding, native file-share, cancellation, rejection and downloaded fallback PASS");

  const longList = await evaluate(`(async()=>{
    state.tasks=Array.from({length:27},(_,index)=>({id:'long-'+index,title:'긴 제목 '+index+' '+('한글 목표를 끝까지 읽을 수 있게 '.repeat(4)),status:index%2?'done':'waiting',groupId:'g1',focusSeconds:0}));
    window.__drawn=[];const original=CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText=function(text,...args){__drawn.push(text);return original.call(this,text,...args)};
    await openListSharePreview('tasks',document.querySelector('#shareTasks'));
    CanvasRenderingContext2D.prototype.fillText=original;
    const result={pages:listSharePages.length,itemCounts:listSharePages.map(page=>page.alt.split('\\n').length-1),maxHeight:Math.max(...await Promise.all(listSharePages.map(async page=>(await createImageBitmap(page.file)).height))),allTitles:state.tasks.every(task=>listSharePages.some(page=>page.alt.includes(task.title))),drawn:__drawn};
    document.querySelector('#nextListSharePage').click();result.label=document.querySelector('#listSharePageLabel').textContent;result.download=listShareDownload.download;return result;
  })()`);
  assert.equal(longList.pages, 3);
  assert.deepEqual(longList.itemCounts, [12, 12, 3]);
  assert.ok(longList.maxHeight < 14000);
  assert.equal(longList.allTitles, true, "Long lists include every complete title across pages");
  assert.equal(longList.label, "2 / 3");
  assert.match(longList.download, /-2\.png$/);
  assert.ok(longList.drawn.some((text) => text.includes("한글 목표")), "Long Korean titles are actually painted onto the image");
  await execute("navigator.canShare=()=>true;navigator.share=async data=>{window.__shared=data.files};await openListSharePreview('tasks',document.querySelector('#shareTasks'));listShareSend.click();");
  await pause(30);
  assert.equal(await evaluate("__shared.length"), 3, "Native share includes every page");

  const before = await evaluate("listShareGeneration");
  await execute("window.__pendingShare=openListSharePreview('tasks',document.querySelector('#shareTasks'));closeListSharePreview();await __pendingShare;");
  assert.equal(await evaluate("listSharePages.length===0&&getComputedStyle(listShareModal).display==='none'"), true, "Closing during async encoding cannot resurrect stale previews");
  assert.ok(await evaluate("listShareGeneration") > before);
  await execute(`window.__originalToBlob=HTMLCanvasElement.prototype.toBlob;window.__releaseShareBlob=null;
    HTMLCanvasElement.prototype.toBlob=function(callback,...args){__originalToBlob.call(this,blob=>{window.__releaseShareBlob=()=>callback(blob)},...args)};
    window.__pendingShare=openListSharePreview('tasks',document.querySelector('#shareTasks'));`);
  for (let index = 0; index < 100 && !(await evaluate("Boolean(__releaseShareBlob)")); index++) await pause(20);
  assert.equal(await evaluate("Boolean(__releaseShareBlob)"), true);
  await execute("closeListSharePreview();HTMLCanvasElement.prototype.toBlob=__originalToBlob;__releaseShareBlob();await __pendingShare;");
  assert.equal(await evaluate("listSharePages.length===0&&listShareImage.getAttribute('src')===null&&getComputedStyle(listShareModal).display==='none'"), true, "Finishing a pending encoder cannot reopen a closed preview");
  await execute("state.tasks=[];await openListSharePreview('tasks',document.querySelector('#shareTasks'));");
  assert.equal(await evaluate("getComputedStyle(listShareModal).display==='none'&&toast.textContent.includes('공유할')"), true, "Empty lists provide guidance");
  await execute("taskDataHydrated=false;await openListSharePreview('habits',document.querySelector('#shareHabits'));");
  assert.equal(await evaluate("getComputedStyle(listShareModal).display==='none'&&toast.textContent.includes('불러온')"), true, "Unloaded data is not shared");
  console.log("Long Korean titles, complete pagination and empty/loading/cancelled encoding states PASS");

  await evaluate("taskDataHydrated=true;selectedHabitDate=null;showPage('habits');toast.classList.remove('show');");
  for (const width of [320,390,768,1280]) {
    await call("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile: false });
    for (const theme of ["white","dark"]) {
      await execute(`closeListSharePreview();applyWorkspaceTheme('${theme}');await openListSharePreview('habits',document.querySelector('#shareHabits'));`);
      const layout = await evaluate(`(()=>{
        const panel=document.querySelector('.list-share-panel').getBoundingClientRect();const save=listShareDownload.getBoundingClientRect();const share=listShareSend.getBoundingClientRect();
        return {overflow:document.documentElement.scrollWidth>innerWidth,panelFits:panel.left>=0&&panel.right<=innerWidth&&panel.top>=0&&panel.bottom<=innerHeight,saveFits:save.left>=panel.left&&save.right<=panel.right&&save.bottom<=panel.bottom,shareFits:share.left>=panel.left&&share.right<=panel.right&&share.bottom<=panel.bottom,imageWidth:listShareImage.clientWidth,color:getComputedStyle(document.querySelector('.list-share-panel')).color};
      })()`);
      assert.equal(layout.overflow, false, `${width}px ${theme}: no page overflow`);
      assert.equal(layout.panelFits && layout.saveFits && layout.shareFits, true, `${width}px ${theme}: preview and controls fit ${JSON.stringify(layout)}`);
      assert.ok(layout.imageWidth > 200);
      if (width === 390 && theme === "white") {
        const screenshot=await call("Page.captureScreenshot", { format:"png" });
        fs.writeFileSync(path.join(root,"output","list-share-preview-390.png"), Buffer.from(screenshot.data,"base64"));
        fs.writeFileSync(path.join(root,"output","list-share-habits.png"), Buffer.from(await evaluate("(async()=>Array.from(new Uint8Array(await listSharePages[0].file.arrayBuffer())))()")));
      }
      await evaluate("closeListSharePreview();");
      for (const page of ["today","tasks","habits"]) {
        await evaluate(`showPage('${page}');`);
        assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"), true, `${width}px ${theme} ${page}: shared section headers fit`);
      }
    }
  }
  await execute("showPage('habits');await openListSharePreview('habits',document.querySelector('#shareHabits'));window.__beforeAuthShareGeneration=listShareGeneration;activeAuthUser={id:'old-user'};await applyAuthSession(null);");
  assert.equal(await evaluate("listSharePages.length===0&&getComputedStyle(listShareModal).display==='none'&&listShareImage.getAttribute('src')===null&&listShareDownload.getAttribute('href')===null&&listShareGeneration>__beforeAuthShareGeneration"), true, "Signing out clears prepared account images, URLs and generation");
  assert.deepEqual(exceptions, [], "No browser runtime exceptions");
  console.log("320/390/768/1280px light/dark preview and header bounds, auth cleanup PASS");
  console.log("List image sharing browser checks PASS; artifacts saved in output/");
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => { ws?.close(); chrome?.kill(); server.close(); });
