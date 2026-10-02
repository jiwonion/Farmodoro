// Run manually with Node 22+ and CHROME_PATH (optional on Windows).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { spawn } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "farmodoro-ui-"));
const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
// Run the actual application; omit only external authentication and service worker
// scripts so this test doesn't contact accounts or depend on the network.
const html = fs.readFileSync(path.join(root, "index.html"), "utf8")
  .replace(/<script\b[^>]*src="(?:https:[^"]*|\.\/pwa-register\.js[^"]*)"[^>]*>[\s\S]*?<\/script>/gi, "");
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const file = path.resolve(root, "." + pathname);
  if (pathname === "/") { response.setHeader("Content-Type", "text/html; charset=utf-8"); response.end(html); return; }
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
  chrome = spawn(chromePath, ["--headless=new", "--disable-gpu", "--no-first-run", "--remote-debugging-port=0",
    `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
  chrome.on("error", (error) => { throw error; });
  const portFile = path.join(profile, "DevToolsActivePort");
  for (let i = 0; i < 200 && !fs.existsSync(portFile); i++) await pause(50);
  const port = fs.readFileSync(portFile, "utf8").split(/\r?\n/)[0];
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
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
    const timeout = setTimeout(() => reject(new Error(`Timeout: ${method}`)), 10000);
    pending.set(next, (message) => {
      clearTimeout(timeout);
      if (message.error) reject(new Error(JSON.stringify(message.error))); else resolve(message.result);
    });
    ws.send(JSON.stringify({ id: next, method, params }));
  });
  await call("Runtime.enable");
  await call("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/` });
  for (let i = 0; i < 100; i++) {
    const result = await call("Runtime.evaluate", { expression: 'document.readyState === "complete"' });
    if (result.result.value) break;
    await pause(50);
  }
  await call("Runtime.evaluate", { expression: `
    document.documentElement.className = "";
    document.body.classList.remove("auth-gated");
    document.querySelector("#authGate").hidden = true;
    document.querySelector(".auth-boot").remove();
  ` });

  const evaluate = async (expression) => {
    const result = await call('Runtime.evaluate', {expression, returnByValue:true});
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await evaluate(`state.groups=[{id:'work',name:'\uC5C5\uBB34',colorIndex:0}];
    const titles=['주간 보고서 작성','회의 자료 정리','미래도약계좌 우대금리 확인','장보기','공과금 납부','의자 폐기로 버리기 → 경비실에 신고','보증 보험 환급 신청','이메일 확인','책상 정리','저녁 준비','독서','산책'];
    state.tasks=titles.map((title,i)=>({id:'task-'+i,title,groupId:'work',status:i>9?'done':'waiting',focusSeconds:0}));
    state.tasks.push({id:'archived-task',title:'지난주 보고서 정리',groupId:'work',status:'done',archived:true,archivedAt:Date.now(),completedDate:toLocalDateString(),focusSeconds:1800});
    state.habits=[{id:'habit-1',title:'운동',measureType:'time',targetValue:50,unit:'분',startDate:toLocalDateString(),endDate:'',weekdays:[1,2,3,4,5,6,7],completionDates:[],progressByDate:{},focusByDate:{}},
      {id:'habit-2',title:'비타민B',measureType:'check',targetValue:1,unit:'회',startDate:toLocalDateString(),endDate:'',weekdays:[1,2,3,4,5,6,7],completionDates:[],progressByDate:{},focusByDate:{}}];
    taskDataHydrated=true; render(); showPage('today');`);
  await call('Runtime.evaluate',{expression:'document.fonts.ready.then(() => true)',awaitPromise:true});
  assert.equal(await evaluate(`document.fonts.check('500 15px "Pretendard Variable"','한글')`),true);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.task-card h4')).fontFamily.startsWith('"Pretendard Variable"')`),true);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.brand')).fontFamily.includes('Mulmaru')`),true);
  fs.mkdirSync(path.join(root,'docs/previews/workspace'),{recursive:true});
  for (const width of [1440,1024,768,390,320]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
    for(const theme of ['white','dark']) {
      await evaluate(`applyWorkspaceTheme('${theme}'); showPage('today');`);
      await pause(150);
      const layout=await evaluate(`(() => {
        const task=taskSection.getBoundingClientRect(), habit=habitSection.getBoundingClientRect(), focus=summaryGrid.getBoundingClientRect();
        const nav=document.querySelector('.sidebar').getBoundingClientRect();
        return {overflow:document.documentElement.scrollWidth>innerWidth,side:innerWidth>700?nav.left===0&&nav.width<230:nav.bottom===innerHeight,
          panelsFit:[task,habit,focus].every(r=>r.left>=0&&r.right<=innerWidth),
          desktop:innerWidth>1100?habit.left>task.right&&focus.left>task.right:true,
          rows:document.querySelectorAll('#taskBoard .task-card').length,
          rowHeight:document.querySelector('#taskBoard .task-card').getBoundingClientRect().height,
          foreground:getComputedStyle(document.body).color,background:getComputedStyle(document.body).backgroundColor};
      })()`);
      assert.equal(layout.overflow,false,`${width} ${theme} overflow`);
      assert.equal(layout.side,true,`${width} navigation`);
      assert.equal(layout.panelsFit,true,`${width} panel bounds`);
      assert.equal(layout.desktop,true,`${width} desktop columns`);
      assert.equal(layout.rows,12);
      assert.ok(layout.rowHeight <= (width>1100?56:76), `${width} dense task rows`);
      const splitterState=await evaluate(`(() => {
        const splitter=document.querySelector('#todaySplitter');
        return {visible:getComputedStyle(splitter).display!=='none',value:Number(splitter.getAttribute('aria-valuenow'))};
      })()`);
      assert.equal(splitterState.visible,width>700,`${width} splitter visibility`);
      if (width>=1100) assert.equal(splitterState.value,30,`${width} default right width`);
      const checkHabitFocusPosition = async () => {
        const result=await evaluate(`(() => {
          const row=document.querySelector('[data-habit-id="habit-1"]'),copy=row.querySelector('.habit-copy'),button=row.querySelector('[data-focus-habit]');
          const r=row.getBoundingClientRect(),c=copy.getBoundingClientRect(),b=button.getBoundingClientRect();
          const task=document.querySelector('#taskBoard .task-card');
          const expected='${theme === 'white' ? 'rgb(185, 198, 216)' : 'rgb(74, 90, 115)'}';
          return {right:b.left>=c.right-1,centered:Math.abs((b.top+b.height/2)-(r.top+r.height/2))<2,
            fits:b.right<=r.right,readable:b.width>70,action:button.parentElement.classList.contains('habit-actions'),
            habitDivider:getComputedStyle(row).borderBottomColor===expected,
            taskDivider:getComputedStyle(task).borderBottomColor===expected};
        })()`);
        assert.deepEqual(result,{right:true,centered:true,fits:true,readable:true,action:true,habitDivider:true,taskDivider:true},`${width} ${theme} habit focus and row boundaries`);
      };
      await checkHabitFocusPosition();
      for(const page of ['tasks','habits','focus','farm']) {
        await evaluate(`showPage('${page}')`);
        const overflow=await evaluate('document.documentElement.scrollWidth > innerWidth');
        assert.equal(overflow,false,`${width} ${theme} ${page} overflow`);
        if (page === 'habits') {
          await checkHabitFocusPosition();
          const navigationStyle=await evaluate(`(() => {
            const button=getComputedStyle(document.querySelector('#previousHabitMonth'));
            const reset=getComputedStyle(document.querySelector('#openHabitReset'));
            return {rounded:parseFloat(button.borderRadius)>=7,flat:button.boxShadow==='none'&&reset.boxShadow==='none',
              themed:button.backgroundColor==='${theme==='white'?'rgb(255, 255, 255)':'rgb(27, 34, 48)'}',
              reset:reset.color==='${theme==='white'?'rgb(181, 54, 69)':'rgb(255, 141, 150)'}'};
          })()`);
          assert.deepEqual(navigationStyle,{rounded:true,flat:true,themed:true,reset:true},`${width} ${theme} minor button theme`);
          if ([1440,390].includes(width)) {
            const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
            fs.writeFileSync(path.join(root,'docs/previews/workspace',`habits-${theme}-${width}.png`),Buffer.from(shot.data,'base64'));
          }
        }
        if (page === 'tasks') {
          for (const archived of [false,true]) {
            if (archived) await evaluate(`document.querySelector('#toggleArchiveView').click()`);
            const rows = await evaluate(`(() => {
              const section=taskSection.getBoundingClientRect();
              const cards=[...document.querySelectorAll('#taskBoard .task-card')];
              const toggle=document.querySelector('#toggleArchiveView');
              return {count:cards.length,fullWidth:cards.every(card=>Math.abs(card.getBoundingClientRect().width-section.width)<2),
                flat:cards.every(card=>{const s=getComputedStyle(card);return s.borderTopWidth==='0px'&&s.borderLeftWidth==='0px'&&s.boxShadow==='none'}),
                aligned:cards.every(card=>{const r=card.getBoundingClientRect();return r.left>=section.left&&r.right<=section.right+1}),
                compact:cards.every(card=>card.getBoundingClientRect().height<=${archived ? '120' : 'Math.max(76,card.querySelector("h4").getBoundingClientRect().height+48)'}),
                archiveStyled:getComputedStyle(toggle).boxShadow==='none'&&parseFloat(getComputedStyle(toggle).borderRadius)>=6,
                archived:taskArchiveView};
            })()`);
            assert.deepEqual(rows,{count:archived?1:12,fullWidth:true,flat:true,aligned:true,compact:true,archiveStyled:true,archived},`${width} ${theme} task/archive layout`);
            assert.equal(await evaluate(`taskSection.querySelector('.section-header h2').textContent`),archived?'보관함':'전체 할 일');
            assert.equal(await evaluate(`document.querySelector('#toggleArchiveView').getAttribute('aria-pressed')`),String(archived));
            if ([1440,390].includes(width)) {
              const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
              fs.writeFileSync(path.join(root,'docs/previews/workspace',`${archived?'archive':'tasks'}-${theme}-${width}.png`),Buffer.from(shot.data,'base64'));
            }
            if (archived) await evaluate(`document.querySelector('#toggleArchiveView').click()`);
          }
        }
      }
      await evaluate(`showPage('today')`);
      if([1440,768,390].includes(width)) {
        const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
        fs.writeFileSync(path.join(root,'docs/previews/workspace',`${theme}-${width}.png`),Buffer.from(shot.data,'base64'));
      }
      await evaluate(`document.querySelector('#openTaskForm').click(); document.querySelector('#toggleGroupManager').click()`);
      const inlineEditors=await evaluate(`(() => {
        const panel=document.querySelector('#taskCreateModal'),group=document.querySelector('#groupManager');
        const p=panel.getBoundingClientRect(),g=group.getBoundingClientRect(),b=document.querySelector('#taskBoard').getBoundingClientRect();
        return {task:panel.closest('#taskSection')!==null,group:group.closest('#taskSection')!==null,
          flow:getComputedStyle(panel).position==='static'&&getComputedStyle(group).position==='static'&&p.bottom<=g.top+1&&g.bottom<=b.top+1,
          fits:[p,g].every(r=>r.left>=0&&r.right<=innerWidth),dialog:!!document.querySelector('[aria-modal="true"]:not(.hidden):not(.task-group-dialog)'),
          expanded:document.querySelector('#openTaskForm').getAttribute('aria-expanded')==='true'};
      })()`);
      assert.deepEqual(inlineEditors,{task:true,group:true,flow:true,fits:true,dialog:false,expanded:true},`${width} ${theme} inline task/group editors`);
      if ([1440,390].includes(width)) {
        const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
        fs.writeFileSync(path.join(root,'docs/previews/workspace',`add-task-${theme}-${width}.png`),Buffer.from(shot.data,'base64'));
      }
      await evaluate(`groupInput.value='화면 등록 그룹';groupInput.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true}))`);
      assert.equal(await evaluate(`state.groups.some(g=>g.name==='화면 등록 그룹')`),false,'Korean composition Enter does not create group');
      await evaluate(`document.querySelector('#addGroupButton').click()`);
      const newGroupId=await evaluate(`state.groups.find(g=>g.name==='화면 등록 그룹').id`);
      assert.equal(await evaluate(`taskGroup.value`),newGroupId,'Inline group registration selects new group');
      await evaluate(`taskGroupTrigger.click()`);
      assert.equal(await evaluate(`taskGroupMenu.closest('#taskCreateModal')!==null&&getComputedStyle(taskGroupMenu).position==='static'`),true,'Group selection stays in editor');
      await evaluate(`taskGroupTrigger.focus();taskGroupTrigger.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}))`);
      assert.equal(await evaluate(`document.activeElement.dataset.taskGroupValue`),newGroupId,'ArrowUp from group trigger focuses last option');
      await evaluate(`taskGroupMenu.querySelector('[data-task-group-value=""]').click();taskInput.value='화면에서 추가한 할 일';taskInput.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true}))`);
      assert.equal(await evaluate(`state.tasks.some(t=>t.title==='화면에서 추가한 할 일')`),false,'Korean composition Enter does not submit task');
      await evaluate(`taskFormSubmit.click()`);
      assert.equal(await evaluate(`state.tasks.some(t=>t.title==='화면에서 추가한 할 일'&&t.groupId===null)`),true,'Inline task registration submits');
      await evaluate(`openHabitFormButton.click();habitInput.value='화면에서 추가한 습관';habitFocusEnabled.checked=true;habitFocusEnabled.dispatchEvent(new Event('change',{bubbles:true}));habitFocusMinutes.value='30';habitForm.querySelector('[data-habit-focus-weekday="1"]').value='45'`);
      assert.equal(await evaluate(`habitModal.closest('#habitSection')!==null&&getComputedStyle(habitModal).position==='static'&&!habitModal.hasAttribute('aria-modal')`),true,`${width} ${theme} inline habit editor`);
      assert.equal(await evaluate(`document.documentElement.scrollWidth>innerWidth`),false,`${width} ${theme} expanded habit editor fits`);
      if ([1440,390].includes(width)) {
        const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
        fs.writeFileSync(path.join(root,'docs/previews/workspace',`add-habit-${theme}-${width}.png`),Buffer.from(shot.data,'base64'));
      }
      await evaluate(`habitSubmitButton.click()`);
      assert.equal(await evaluate(`state.habits.some(h=>h.title==='화면에서 추가한 습관'&&h.measureType==='time'&&h.targetByWeekday[1]===45)`),true,'Inline habit registration retains weekday targets');
      await evaluate(`state.tasks=state.tasks.filter(t=>t.title!=='화면에서 추가한 할 일');state.habits=state.habits.filter(h=>h.title!=='화면에서 추가한 습관');state.groups=state.groups.filter(g=>g.id!=='${newGroupId}');render();`);
      console.log(`${width}px ${theme}: navigation, 12 tasks, all page bounds PASS`);
    }
  }
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await evaluate(`showPage('today')`);
  await pause(100);
  const handle=await evaluate(`(() => {const r=document.querySelector('#todaySplitter').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+120}})()`);
  await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:handle.x,y:handle.y});
  await call('Input.dispatchMouseEvent',{type:'mousePressed',x:handle.x,y:handle.y,button:'left',clickCount:1});
  await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:handle.x-120,y:handle.y,button:'left',buttons:1});
  await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:handle.x-120,y:handle.y,button:'left',clickCount:1});
  assert.ok(await evaluate(`Number(document.querySelector('#todaySplitter').getAttribute('aria-valuenow'))>38`),'Dragging widens right area');
  assert.equal(await evaluate(`document.body.classList.contains('resizing-today')`),false);
  const draggedSplit=await evaluate(`Number(localStorage.getItem('farmodoro-today-right-percent'))`);
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight'});
  const savedSplit=await evaluate(`Number(localStorage.getItem('farmodoro-today-right-percent'))`);
  assert.ok(Math.abs(savedSplit-(draggedSplit-2))<.001,'Keyboard adjusts right area by 2%');
  await call('Emulation.setDeviceMetricsOverride',{width:768,height:1000,deviceScaleFactor:1,mobile:false});
  await pause(100);
  assert.ok(await evaluate(`Number(document.querySelector('#todaySplitter').getAttribute('aria-valuenow'))>${savedSplit}`),'Narrow screen keeps right pane readable');
  assert.equal(await evaluate(`Number(localStorage.getItem('farmodoro-today-right-percent'))`),savedSplit,'Resize preserves preferred width');
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await pause(100);
  assert.ok(await evaluate(`Math.abs(Number(document.querySelector('#todaySplitter').getAttribute('aria-valuenow'))-${savedSplit})<.1`),'Wide screen restores preferred width');
  await evaluate(`showPage('tasks'); showPage('today')`);
  await pause(100);
  const cancelHandle=await evaluate(`(() => {const r=document.querySelector('#todaySplitter').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+120}})()`);
  await call('Input.dispatchMouseEvent',{type:'mousePressed',x:cancelHandle.x,y:cancelHandle.y,button:'left',clickCount:1});
  await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:cancelHandle.x-80,y:cancelHandle.y,button:'left',buttons:1});
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});
  await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:cancelHandle.x-80,y:cancelHandle.y,button:'left',clickCount:1});
  assert.equal(await evaluate(`document.body.classList.contains('resizing-today')`),false,'Escape ends drag');
  assert.ok(await evaluate(`Math.abs(Number(document.querySelector('#todaySplitter').getAttribute('aria-valuenow'))-${savedSplit})<.1`),'Escape restores width');
  assert.equal(await evaluate(`Number(localStorage.getItem('farmodoro-today-right-percent'))`),savedSplit,'Cancelled drag does not save width');
  await call('Page.reload');
  await pause(700);
  await evaluate(`document.documentElement.className='';document.body.classList.remove('auth-gated');document.querySelector('#authGate').hidden=true;showPage('today');`);
  await pause(100);
  assert.ok(await evaluate(`Math.abs(Number(document.querySelector('#todaySplitter').getAttribute('aria-valuenow'))-${savedSplit})<.1`),'Width persists after reload');
  await evaluate(`document.querySelector('#todaySplitter').focus()`);
  for (const [key,bound] of [['Home','aria-valuemin'],['End','aria-valuemax']]) {
    await call('Input.dispatchKeyEvent',{type:'keyDown',key,code:key});
    assert.ok(await evaluate(`Math.abs(Number(document.querySelector('#todaySplitter').getAttribute('aria-valuenow'))-Number(document.querySelector('#todaySplitter').getAttribute('${bound}')))<.1`),`${key} respects width limit`);
  }
  await evaluate(`state.groups=[{id:'work',name:'업무와생활을함께정리하는긴그룹',colorIndex:0}];state.tasks=[{id:'long-task',title:'분기별 업무 보고서 작성 및 다음 주 일정 확인',groupId:'work',status:'waiting',focusSeconds:36000}];taskDataHydrated=true;render();showPage('today');`);
  for (const width of [1101,1200,1440]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
    await pause(100);
    await evaluate(`document.querySelector('#todaySplitter').focus()`);
    await call('Input.dispatchKeyEvent',{type:'keyDown',key:'End',code:'End'});
    const narrowTask=await evaluate(`(() => {
      const row=document.querySelector('#taskBoard .task-card'),r=row.getBoundingClientRect();
      return {titleWidth:row.querySelector('h4').getBoundingClientRect().width,
        fits:[...row.querySelectorAll('.task-top,.task-meta,.task-actions')].every(el=>{const b=el.getBoundingClientRect();return b.left>=r.left-1&&b.right<=r.right+1}),
        overflow:document.documentElement.scrollWidth>innerWidth};
    })()`);
    assert.ok(narrowTask.titleWidth>=80,`${width} resizable task keeps title readable`);
    assert.equal(narrowTask.fits,true,`${width} resizable task contents fit`);
    assert.equal(narrowTask.overflow,false,`${width} resizable task does not overflow`);
  }
  await evaluate(`document.querySelector('#todaySplitter').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);
  assert.equal(await evaluate(`Number(document.querySelector('#todaySplitter').getAttribute('aria-valuenow'))`),30);
  assert.equal(await evaluate(`localStorage.getItem('farmodoro-today-right-percent')`),'30');
  await evaluate(`state.groups=[{id:'work',name:'업무',colorIndex:0}];state.tasks=[{id:'task-0',title:'보고서',groupId:'work',status:'waiting',focusSeconds:0}];state.habits=[{id:'habit-1',title:'운동',measureType:'time',targetValue:50,weekdays:[1,2,3,4,5,6,7],startDate:toLocalDateString(),endDate:'',completionDates:[],progressByDate:{},focusByDate:{}}];taskDataHydrated=true;render();showPage('today');`);
  await evaluate(`showPage('today'); document.querySelector('[data-focus-task="task-0"]').click()`);
  assert.equal(await evaluate(`activeFocus.id`),'task-0');
  await evaluate(`document.querySelector('[data-edit-task="task-0"]').click()`);
  assert.equal(await evaluate(`!taskForm.classList.contains('hidden') && editingTaskId === 'task-0'`),true);
  await evaluate(`closeTaskInlineEdit()`);
  await evaluate(`document.querySelector('[data-focus-habit="habit-1"]').click()`);
  assert.equal(await evaluate(`activeFocus.type + ':' + activeFocus.id`),'habit:habit-1');
  const toggle=await evaluate(`applyWorkspaceTheme('white'); document.querySelector('#themeToggle').click();
    ({theme:document.documentElement.dataset.theme,saved:localStorage.getItem('farmodoro-ui-theme'),pressed:document.querySelector('#themeToggle').getAttribute('aria-pressed')})`);
  assert.deepEqual(toggle,{theme:'dark',saved:'dark',pressed:'true'});
  await call('Page.reload');
  await pause(700);
  assert.equal(await evaluate('document.documentElement.dataset.theme'),'dark');
  await evaluate(`document.documentElement.className='';document.body.classList.remove('auth-gated');document.querySelector('#authGate').hidden=true;showPage('today');`);
  await evaluate(`document.querySelector('#openTaskForm').click()`);
  assert.equal(await evaluate(`!taskForm.classList.contains('hidden')`),true);
  await evaluate(`closeTaskCreate(); showPage('habits'); document.querySelector('#openHabitForm').click();`);
  assert.equal(await evaluate(`!habitModal.classList.contains('hidden')`),true);
  await evaluate(`closeHabitModal(); showPage('today');document.querySelector('[data-focus-mode="quick"]').click();`);
  assert.equal(await evaluate(`document.querySelector('#focusButton').disabled`),false);
  assert.deepEqual(exceptions,[], 'No browser runtime exceptions');
  console.log('Inline task/habit/group registration, Korean input, theme controls, splitter and dialogs PASS');
})().catch((error)=>{console.error(error);process.exitCode=1;}).finally(()=>{ws?.close();chrome?.kill();server.close();});
