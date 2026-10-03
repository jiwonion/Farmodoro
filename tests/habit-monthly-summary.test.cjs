// Run with Node 22+ and CHROME_PATH (optional on Windows).
// This runs the actual app locally, without external authentication or a service worker.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "farmodoro-monthly-summary-"));
const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const html = fs.readFileSync(path.join(root, "index.html"), "utf8")
  .replace(/<script\b[^>]*src="(?:https:[^"]*|\.\/pwa-register\.js[^"]*)"[^>]*>[\s\S]*?<\/script>/gi, "");
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  if (pathname === "/") {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(html);
    return;
  }
  const file = path.resolve(root, "." + pathname);
  if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  try {
    response.setHeader("Content-Type", file.endsWith(".css") ? "text/css" : file.endsWith(".js") ? "text/javascript" : file.endsWith(".svg") ? "image/svg+xml" : "application/octet-stream");
    response.end(fs.readFileSync(file));
  } catch { response.writeHead(404).end(); }
});

let chrome;
let ws;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  chrome = spawn(chromePath, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-sandbox", "--disable-crash-reporter", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
  let chromeError;
  chrome.on("error", (error) => { chromeError = error; });
  const portFile = path.join(profile, "DevToolsActivePort");
  for (let index = 0; index < 200 && !fs.existsSync(portFile) && !chromeError; index++) await pause(50);
  if (chromeError) throw chromeError;
  assert.ok(fs.existsSync(portFile), "Chrome debugging port must be available");
  const port = fs.readFileSync(portFile, "utf8").split(/\r?\n/)[0];
  let tabs;
  let endpointError;
  for (let index=0;index<50&&!tabs;index++) {
    try { tabs=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); }
    catch (error) { endpointError=error; await pause(50); }
  }
  if (!tabs) throw endpointError;
  ws = new WebSocket(tabs.find((tab) => tab.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  const exceptions = [];
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const next = ++id;
    const timeout = setTimeout(() => { pending.delete(next); reject(new Error(`Timeout: ${method}`)); }, 10000);
    pending.set(next, (message) => {
      clearTimeout(timeout);
      if (message.error) reject(new Error(JSON.stringify(message.error))); else resolve(message.result);
    });
    ws.send(JSON.stringify({ id: next, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await call("Runtime.evaluate", { expression, returnByValue: true });
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await call("Runtime.enable");
  await call("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/` });
  let loaded = false;
  for (let index = 0; index < 100; index++) {
    loaded = await evaluate('document.readyState === "complete" && typeof getHabitMonthlySummary === "function"');
    if (loaded) break;
    await pause(50);
  }
  assert.equal(loaded, true, "Monthly summary helper must load with the application");
  await evaluate(`
    document.documentElement.className = "";
    document.body.classList.remove("auth-gated");
    document.querySelector("#authGate").hidden = true;
    document.querySelector(".auth-boot")?.remove();
  `);

  const current = await evaluate(`(() => {
    const daily = { id:'daily', title:'Daily', weekdays:[1,2,3,4,5,6,7], startDate:'2026-01-01', completionDates:[...Array.from({length:9},(_,index)=>'2026-05-'+String(index+1).padStart(2,'0')), '2026-04-30','2026-05-15','2026-06-01'] };
    const twice = { id:'twice', title:'Twice', weekdays:[2,5], startDate:'2026-05-05', endDate:'2026-05-09', completionDates:['2026-05-01','2026-05-05','2026-05-06','2026-05-08','2026-05-12'] };
    const weekend = { id:'weekend', title:'Weekend', weekdays:[6,7], startDate:'2026-05-03', endDate:'2026-05-10', completionDates:['2026-05-02','2026-05-03','2026-05-09','2026-05-12'] };
    const later = { id:'later', title:'Later', weekdays:[1,2,3,4,5,6,7], startDate:'2026-05-20', completionDates:['2026-05-20'] };
    const ended = { id:'ended', title:'Ended', weekdays:[1,2,3,4,5,6,7], startDate:'2026-01-01', endDate:'2026-04-30', completionDates:['2026-05-01'] };
    const next = { id:'next', title:'Next month', weekdays:[1,2,3,4,5,6,7], startDate:'2026-06-01', completionDates:[] };
    const habits = [daily,twice,weekend,later,ended,next];
    const before = JSON.stringify(habits);
    const result = getHabitMonthlySummary(habits,new Date(2026,4,1),new Date(2026,4,12,0,0,0));
    return {result, unchanged:JSON.stringify(habits)===before};
  })()`);
  assert.equal(current.unchanged, true, "Summary calculation must preserve habit records");
  assert.equal(current.result.period, "current");
  assert.equal(current.result.monthStart, "2026-05-01");
  assert.equal(current.result.monthEnd, "2026-05-31");
  assert.equal(current.result.cutoffDate, "2026-05-12", "Today is included, future scheduled days are excluded");
  assert.equal(current.result.habitCount, 4, "Only habits overlapping the viewed month count");
  assert.equal(current.result.eligible, 17, "Weekdays and inclusive start/end boundaries determine the denominator");
  assert.equal(current.result.completed, 13, "Unscheduled, out-of-range and future completions must be ignored");
  assert.equal(current.result.recordedDays, 9, "Multiple completions on one date count as one recorded day");
  assert.equal(current.result.percentage, 76);
  assert.deepEqual(current.result.weeks.map(({eligible,completed,percentage}) => ({eligible,completed,percentage})), [
    {eligible:9,completed:9,percentage:100}, {eligible:8,completed:4,percentage:50},
    {eligible:0,completed:0,percentage:null}, {eligible:0,completed:0,percentage:null}, {eligible:0,completed:0,percentage:null},
  ]);
  assert.deepEqual(current.result.rankings.map(({id,eligible,completed,percentage}) => ({id,eligible,completed,percentage})), [
    {id:"twice",eligible:2,completed:2,percentage:100}, {id:"daily",eligible:12,completed:9,percentage:75},
    {id:"weekend",eligible:3,completed:2,percentage:67}, {id:"later",eligible:0,completed:0,percentage:null},
  ], "Rankings compare scheduled completion rates, rather than raw completion counts");
  console.log("Current-month cutoff, scheduling boundaries, distinct dates, weekly buckets and normalized ranking PASS");

  const periods = await evaluate(`(() => {
    const habit={id:'daily',title:'Daily',weekdays:[1,2,3,4,5,6,7],startDate:'2026-01-01',completionDates:Array.from({length:10},(_,index)=>'2026-04-'+String(index+1).padStart(2,'0')).concat('2026-05-01','2026-06-01')};
    const today=new Date(2026,4,12);
    const past=getHabitMonthlySummary([habit],new Date(2026,3,1),today);
    const future=getHabitMonthlySummary([habit],new Date(2026,5,1),today);
    const empty=getHabitMonthlySummary([],new Date(2026,4,1),today);
    const leap=getHabitMonthlySummary([{...habit,startDate:'2028-02-29',endDate:'2028-02-29',completionDates:['2028-02-29']}],new Date(2028,1,1),new Date(2028,2,1));
    return {past,future,empty,leap};
  })()`);
  assert.deepEqual([periods.past.period,periods.past.cutoffDate,periods.past.eligible,periods.past.completed,periods.past.percentage], ["past","2026-04-30",30,10,33]);
  assert.deepEqual([periods.future.period,periods.future.cutoffDate,periods.future.eligible,periods.future.completed,periods.future.percentage], ["future",null,0,0,null]);
  assert.ok(periods.future.weeks.every((week)=>week.eligible===0&&week.completed===0&&week.percentage===null));
  assert.deepEqual([periods.empty.habitCount,periods.empty.eligible,periods.empty.completed,periods.empty.percentage,periods.empty.rankings.length], [0,0,0,null,0]);
  assert.deepEqual([periods.leap.monthEnd,periods.leap.eligible,periods.leap.completed,periods.leap.percentage], ["2028-02-29",1,1,100]);
  console.log("Past/full month, future/empty states and leap-day boundaries PASS");

  // Keep the visible example and month navigation deterministic on every machine.
  await evaluate(`
    window.__summaryNativeDate=Date;
    window.__summaryToday=new Date(2026,9,12,12).getTime();
    window.Date=class extends window.__summaryNativeDate {
      constructor(...args){super(...(args.length ? args : [window.__summaryToday]));}
      static now(){return window.__summaryToday;}
    };
    taskDataHydrated=true;
    habitCalendarDate=new Date(2026,9,1);
    selectedHabitDate=null;
    state.habits=['비타민B','지각 안 하기','운동','저녁','샤워','영어 공부','명상','독서','회고','자정에 눕기','질유산균'].map((title,index)=>({
      id:'monthly-preview-'+index,title,weekdays:[1,2,3,4,5,6,7],startDate:'2026-09-01',measureType:'amount',targetValue:1,targetByWeekday:{},focusSecondsByDate:{},
      completionDates:[...Array.from({length:Math.max(2,12-index)},(_,day)=>'2026-10-'+String(day+1).padStart(2,'0')),...Array.from({length:index+1},(_,day)=>'2026-09-'+String(day+1).padStart(2,'0'))],
    }));
    applyWorkspaceTheme('white');showPage('habits');renderHabits();renderHabitHeatmap();
  `);
  assert.equal(await evaluate('Boolean(document.querySelector("#habitMonthlySummary"))'),true,"Monthly summary panel exists in actual markup");

  const nav = await evaluate(`(() => {
    const panel=document.querySelector('#habitMonthlySummary');
    const oct={text:panel.textContent,rate:panel.querySelector('.habit-summary-rate').textContent,stats:getHabitMonthlySummary()};
    document.querySelector('#previousHabitMonth').click();
    const sep={text:panel.textContent,rate:panel.querySelector('.habit-summary-rate').textContent,stats:getHabitMonthlySummary(),month:document.querySelector('#habitHeatmapMonth').textContent};
    document.querySelector('#nextHabitMonth').click();document.querySelector('#nextHabitMonth').click();
    const nov={text:panel.textContent,rate:panel.querySelector('.habit-summary-rate').textContent,empty:!!panel.querySelector('.habit-summary-empty'),stats:getHabitMonthlySummary(),month:document.querySelector('#habitHeatmapMonth').textContent};
    document.querySelector('#previousHabitMonth').click();
    return {oct,sep,nov};
  })()`);
  assert.equal(nav.oct.stats.month,10);
  assert.equal(nav.sep.stats.month,9);
  assert.equal(nav.nov.stats.month,11);
  assert.equal(nav.sep.stats.eligible,330);
  assert.equal(nav.nov.stats.percentage,null);
  assert.equal(nav.oct.rate,'58%');
  assert.equal(nav.sep.rate,'20%');
  assert.equal(nav.nov.rate,'—');
  assert.equal(nav.nov.empty,true,'Future month provides ranking guidance');
  assert.notEqual(nav.oct.text,nav.sep.text,"Previous-month click updates the visible summary");
  assert.notEqual(nav.sep.text,nav.nov.text,"Future-month click updates the visible summary");
  assert.match(nav.sep.month,/9/);
  assert.match(nav.nov.month,/11/);
  console.log("Previous/next month navigation updates summary with the heatmap PASS");

  const refresh = await evaluate(`(() => {
    const panel=document.querySelector('#habitMonthlySummary');
    state.habits[1].completionDates.push('2026-10-12');renderHabitUpdates();
    const completion={rate:panel.querySelector('.habit-summary-rate').textContent,stats:getHabitMonthlySummary()};
    state.habits[1].completionDates.pop();renderHabitUpdates();
    const restored=panel.querySelector('.habit-summary-rate').textContent;
    window.__summaryToday=new window.__summaryNativeDate(2026,9,13,3,59).getTime();refreshHabitHeatmapDay();
    const beforeFour=getHabitMonthlySummary().cutoffDate;
    window.__summaryToday=new window.__summaryNativeDate(2026,9,13,4).getTime();refreshHabitHeatmapDay();
    const rollover={rate:panel.querySelector('.habit-summary-rate').textContent,stats:getHabitMonthlySummary()};
    window.__summaryToday=new window.__summaryNativeDate(2026,9,12,12).getTime();refreshHabitHeatmapDay();
    return {completion,restored,beforeFour,rollover};
  })()`);
  assert.deepEqual([refresh.completion.stats.completed,refresh.completion.stats.eligible,refresh.completion.rate],[78,132,'59%'],'Habit completion refreshes the visible summary');
  assert.equal(refresh.restored,'58%','Undoing completion refreshes the visible summary');
  assert.equal(refresh.beforeFour,'2026-10-12','Habits still belong to the previous day before 04:00');
  assert.deepEqual([refresh.rollover.stats.cutoffDate,refresh.rollover.stats.eligible,refresh.rollover.stats.completed,refresh.rollover.rate],['2026-10-13',143,77,'54%'],'The 04:00 day rollover refreshes the denominator and visible summary');
  console.log("Completion updates, undo and local day rollover refresh the summary PASS");

  const emptyUI = await evaluate(`(() => {
    const saved=state.habits;state.habits=[];renderHabitHeatmap();
    const panel=document.querySelector('#habitMonthlySummary');
    const result={text:panel.textContent.trim(),empty:!!panel.querySelector('.habit-summary-empty'),rate:panel.querySelector('.habit-summary-rate').textContent,notNumber:/NaN|Infinity/.test(panel.textContent),stats:getHabitMonthlySummary()};
    state.habits=saved;renderHabitHeatmap();return result;
  })()`);
  assert.equal(emptyUI.notNumber,false,"Empty state must never display invalid numbers");
  assert.ok(emptyUI.text.length>0,"Empty state provides visible guidance");
  assert.equal(emptyUI.empty,true);
  assert.equal(emptyUI.rate,'—');
  assert.equal(emptyUI.stats.percentage,null);

  await evaluate(`
    window.__monthlyMaliciousTitle='<img src=x onerror="window.__monthlyInjected=true">'+('길고 긴 습관 이름 '.repeat(80));
    state.habits[0].title=window.__monthlyMaliciousTitle;
    renderHabits();renderHabitHeatmap();
  `);
  const escaping = await evaluate(`(() => {
    const panel=document.querySelector('#habitMonthlySummary');
    return {text:panel.querySelector('.habit-top-name').textContent===window.__monthlyMaliciousTitle,image:!!panel.querySelector('img'),injected:window.__monthlyInjected===true};
  })()`);
  assert.deepEqual(escaping,{text:true,image:false,injected:false},"A long HTML habit title is displayed as text without executing markup");
  console.log("Empty guidance and escaped long habit names PASS");

  await call("Runtime.evaluate",{expression:"document.fonts.ready.then(() => true)",awaitPromise:true});
  const output = path.join(root,"output");
  fs.mkdirSync(output,{recursive:true});
  for (const width of [390,768,1280,1660]) {
    await call("Emulation.setDeviceMetricsOverride",{width,height:width===390?844:1000,deviceScaleFactor:1,mobile:false});
    const themeColors=[];
    for (const theme of ["white","dark"]) {
      await evaluate(`applyWorkspaceTheme('${theme}');`);
      await pause(100);
      const layout=await evaluate(`(() => {
        const panel=document.querySelector('#habitMonthlySummary');
        const summary=panel.getBoundingClientRect();
        const grid=document.querySelector('#habitHeatmapGrid').getBoundingClientRect();
        const scroll=document.querySelector('#habitsPage .heatmap-scroll').getBoundingClientRect();
        const card=document.querySelector('#habitsPage .habit-heatmap').getBoundingClientRect();
        const style=getComputedStyle(panel);
        const progress=[...panel.querySelectorAll('[role="progressbar"]')];
        const accessibleProgress=progress.length===9&&progress.every(bar=>bar.getAttribute('aria-valuemin')==='0'&&bar.getAttribute('aria-valuemax')==='100'&&Number(bar.getAttribute('aria-valuenow'))>=0&&Number(bar.getAttribute('aria-valuenow'))<=100&&!!bar.getAttribute('aria-label'));
        return {overflow:document.documentElement.scrollWidth>innerWidth,summaryFits:summary.left>=card.left-1&&summary.right<=card.right+1,accessibleProgress,
          horizontal:summary.left>=scroll.right-1&&Math.abs(summary.top-scroll.top)<4,
          stacked:summary.top>=scroll.bottom-1,visible:summary.width>0&&summary.height>0,
          gridWidth:grid.width,scrollWidth:scroll.width,color:style.color,background:style.backgroundColor,summary:{left:summary.left,top:summary.top,right:summary.right,bottom:summary.bottom},scroll:{left:scroll.left,top:scroll.top,right:scroll.right,bottom:scroll.bottom}};
      })()`);
      assert.equal(layout.overflow,false,`${width}px ${theme}: long title must not create outer page overflow ${JSON.stringify(layout)}`);
      assert.equal(layout.visible,true,`${width}px ${theme}: summary is visible`);
      assert.equal(layout.summaryFits,true,`${width}px ${theme}: summary stays inside the monthly card`);
      assert.equal(width===1660?layout.horizontal:layout.stacked,true,`${width}px ${theme}: summary placement ${JSON.stringify(layout)}`);
      assert.equal(layout.accessibleProgress,true,`${width}px ${theme}: monthly, weekly and ranking bars provide accessible percentages`);
      assert.ok(layout.color!==layout.background,`${width}px ${theme}: summary text has distinct styling`);
      themeColors.push(layout.color);
      if (theme==="white"&&(width===390||width===1660)) {
        // Use a normal label for the review artifact after testing the untrusted long title.
        await evaluate("state.habits[0].title='비타민B';renderHabits();renderHabitHeatmap();");
        await pause(100);
        const screenshot=await call("Page.captureScreenshot",{format:"png",captureBeyondViewport:true});
        fs.writeFileSync(path.join(output,`habit-monthly-summary-${width}.png`),Buffer.from(screenshot.data,"base64"));
        await evaluate("state.habits[0].title=window.__monthlyMaliciousTitle;renderHabits();renderHabitHeatmap();");
      }
    }
    assert.notEqual(themeColors[0],themeColors[1],`${width}px summary text adapts to the dark theme`);
    console.log(`${width}px light/dark summary placement and outer bounds PASS`);
  }
  assert.deepEqual(exceptions,[],"No browser runtime exceptions");
  console.log("Monthly habit summary browser checks PASS; screenshots saved in output/");
})().catch((error) => {console.error(error);process.exitCode=1;}).finally(() => {
  ws?.close();
  chrome?.kill();
  server.close();
});
