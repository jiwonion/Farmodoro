(() => {
  let rules = [], month = null, selected = null, busy = false, lastDay = null;
  let todayMonth = null, todaySelection = null;
  let calendarDrag = null, suppressClickUntil = 0;
  const $ = id => document.getElementById(id);
  const escape = value => String(value).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[ch]));
  const dateOf = value => new Date(`${value}T12:00:00Z`);
  const iso = date => date.toISOString().slice(0, 10);
  const addDays = (value, n) => { const day = dateOf(value); day.setUTCDate(day.getUTCDate() + n); return iso(day); };
  const today = () => toProductivityDateString();
  const intentKey = id => `farmodoro-recurring-intent:${id}`;
  function matches(rule, date) {
    if (!rule.active || date < rule.start_date || (rule.end_date && date > rule.end_date)) return false;
    const day = dateOf(date);
    if (rule.frequency === 'daily') return true;
    if (rule.frequency === 'weekly') return rule.weekdays.includes(day.getUTCDay() || 7);
    const last = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 0)).getUTCDate();
    return day.getUTCDate() === Math.min(rule.month_day, last);
  }
  function eventsFor(date) {
    const actual = state.tasks.filter(task => task.scheduledDate === date);
    const future = date > today() ? rules.filter(rule => matches(rule, date) &&
      !actual.some(task => task.recurrenceId === rule.id)).map(rule => ({
        id: `${rule.id}:${date}`, title: rule.title, groupId: rule.group_id || null, scheduledDate: date, recurrenceId: rule.id, planned: true,
      })) : [];
    return [...actual, ...future];
  }
  function readIntent(id) {
    try { return JSON.parse(localStorage.getItem(intentKey(id)) || 'null'); } catch { return null; }
  }
  function taskDragAttributes(event) {
    return !event.planned && productivitySchedulingAvailable
      ? `data-calendar-task-id="${escape(event.id)}" draggable="false" title="${escape(event.title)} · 끌어서 날짜 변경 · Alt+방향키로도 이동 가능"` : '';
  }
  function moveTaskDate(id, date, userId) {
    if (!taskDataHydrated || !productivitySchedulingAvailable || !activeAuthUser || activeAuthUser.id !== userId || taskDataUserId !== userId || !parseDateInputValue(date)) return false;
    const task = state.tasks.find(task => task.id === id);
    if (!task || task.scheduledDate === date) return false;
    task.scheduledDate = date;
    selected = date; month = date.slice(0, 7);
    renderTasks(); renderSummary(); render();
    scheduleTaskDatabaseSync(0);
    return true;
  }
  function clearCalendarDrag() {
    const drag = calendarDrag;
    calendarDrag = null;
    if (!drag) return;
    cancelAnimationFrame(drag.frame);
    drag.ghost?.remove();
    drag.source.classList.remove('calendar-task-dragging');
    if (drag.source.hasPointerCapture(drag.pointerId)) drag.source.releasePointerCapture(drag.pointerId);
    document.querySelectorAll('.calendar-drop-over').forEach(day => day.classList.remove('calendar-drop-over'));
    document.body.classList.remove('calendar-drag-active');
  }
  const calendarDayAt = (x, y) => document.elementFromPoint(x, y)?.closest('#taskCalendarRoot [data-calendar-date]');
  function tickCalendarDrag() {
    const drag = calendarDrag;
    if (!drag?.started) return;
    if (drag.y < 72) window.scrollBy(0, -Math.max(4, (72 - drag.y) / 5));
    else if (drag.y > innerHeight - 72) window.scrollBy(0, Math.max(4, (drag.y - innerHeight + 72) / 5));
    const target = calendarDayAt(drag.x, drag.y);
    document.querySelectorAll('.calendar-drop-over').forEach(day => { if (day !== target) day.classList.remove('calendar-drop-over'); });
    target?.classList.add('calendar-drop-over');
    const x = Math.max(8, Math.min(drag.x + 12, innerWidth - drag.ghost.offsetWidth - 8));
    const y = Math.max(8, Math.min(drag.y + 12, innerHeight - drag.ghost.offsetHeight - 8));
    drag.ghost.style.transform = `translate(${x}px, ${y}px)`;
    drag.frame = requestAnimationFrame(tickCalendarDrag);
  }
  function renderTodayCalendar() {
    const root = $('todayCalendarRoot');
    if (!root) return;
    const now = today(), date = getTaskViewDate();
    if (!todayMonth || todaySelection !== date) todayMonth = date.slice(0, 7);
    todaySelection = date;
    const first = `${todayMonth}-01`, firstDate = dateOf(first);
    const offset = firstDate.getUTCDay(), start = addDays(first, -offset);
    const daysInMonth = new Date(Date.UTC(firstDate.getUTCFullYear(), firstDate.getUTCMonth() + 1, 0)).getUTCDate();
    const cells = Math.ceil((offset + daysInMonth) / 7) * 7;
    const focused = root.contains(document.activeElement) ? document.activeElement : null;
    const focusAttribute = focused && ['data-today-calendar-date', 'data-today-calendar-move', 'data-today-calendar-reset'].find(name => focused.hasAttribute(name));
    const focusValue = focusAttribute && focused.getAttribute(focusAttribute);
    root.innerHTML = `
      <div class="today-calendar-toolbar">
        <h3 id="todayCalendarMonth" aria-live="polite">${firstDate.getUTCFullYear()}년 ${firstDate.getUTCMonth() + 1}월</h3>
        <div class="today-calendar-controls">
          <button type="button" data-today-calendar-move="-1" aria-label="이전 달">‹</button>
          <button type="button" data-today-calendar-reset>오늘</button>
          <button type="button" data-today-calendar-move="1" aria-label="다음 달">›</button>
        </div>
      </div>
      <div class="today-calendar-weekdays" aria-hidden="true">${['일','월','화','수','목','금','토'].map(day => `<span>${day}</span>`).join('')}</div>
      <div class="today-calendar-grid" role="group" aria-labelledby="todayCalendarMonth">
        ${Array.from({ length: cells }, (_, i) => {
          const day = addDays(start, i), events = eventsFor(day), done = events.filter(event => event.status === 'done').length;
          const label = `${Number(day.slice(0, 4))}년 ${Number(day.slice(5, 7))}월 ${Number(day.slice(8))}일 ${['일','월','화','수','목','금','토'][i % 7]}요일, 할 일 ${events.length}개, 완료 ${done}개`;
          return `<button type="button" data-today-calendar-date="${day}" class="today-calendar-day ${day.startsWith(todayMonth) ? '' : 'outside'} ${day === now ? 'today' : ''}" aria-pressed="${date === day}" ${day === now ? 'aria-current="date"' : ''} aria-label="${label}">
            <span>${Number(day.slice(-2))}</span>${events.length ? `<i class="today-calendar-marker ${done === events.length ? 'done' : events.every(event => event.planned) ? 'planned' : ''}" aria-hidden="true"></i>` : ''}
          </button>`;
        }).join('')}
      </div>`;
    if (focusAttribute) root.querySelector(`[${focusAttribute}="${focusValue}"]`)?.focus({ preventScroll: true });
  }
  function render() {
    clearCalendarDrag();
    if (typeof currentPage !== 'undefined' && currentPage === 'today') renderTodayCalendar();
    if (typeof currentPage === 'undefined' || currentPage !== 'calendar') return;
    const root = $('taskCalendarRoot');
    if (!root) return;
    const now = today();
    if (!month) month = now.slice(0, 7);
    if (!selected || !selected.startsWith(month)) selected = month === now.slice(0, 7) ? now : `${month}-01`;
    const first = `${month}-01`, firstDate = dateOf(first);
    const offset = firstDate.getUTCDay();
    const start = addDays(first, -offset);
    const daysInMonth = new Date(Date.UTC(firstDate.getUTCFullYear(), firstDate.getUTCMonth() + 1, 0)).getUTCDate();
    const cells = Math.ceil((offset + daysInMonth) / 7) * 7;
    const daily = eventsFor(selected);
    const pending = activeAuthUser && readIntent(activeAuthUser.id);
    root.innerHTML = `
      <div class="calendar-toolbar"><div class="calendar-month-controls">
        <button type="button" data-calendar-move="-1" aria-label="이전 달">‹</button>
        <h2>${firstDate.getUTCFullYear()}년 ${firstDate.getUTCMonth() + 1}월</h2>
        <button type="button" data-calendar-move="1" aria-label="다음 달">›</button>
        <button type="button" data-calendar-today>오늘</button></div></div>
      <div class="calendar-layout"><div class="calendar-month"><div class="calendar-weekdays">${['일','월','화','수','목','금','토'].map(day => `<span>${day}</span>`).join('')}</div>
      <div class="calendar-grid">${Array.from({ length: cells }, (_, i) => {
        const date = addDays(start, i), events = eventsFor(date), done = events.filter(event => event.status === 'done').length;
        return `<button type="button" data-calendar-date="${date}" class="calendar-day ${date.startsWith(month) ? '' : 'outside'} ${date === now ? 'today' : ''}" aria-pressed="${selected === date}" aria-label="${date}, 할 일 ${events.length}개, 완료 ${done}개">
          <span class="calendar-day-number">${Number(date.slice(-2))}</span>
          ${events.slice(0, 2).map(event => `<span class="calendar-event ${event.planned ? 'planned' : event.status === 'done' ? 'done' : ''}" ${taskDragAttributes(event)}><span class="calendar-event-title">${escape(event.title)}</span></span>`).join('')}
          ${events.length ? `<small>${events.length}개${events.length > 2 ? ` · +${events.length - 2}` : ''}</small>` : ''}</button>`;
      }).join('')}</div></div>
      <section class="calendar-day-detail" aria-label="선택한 날짜의 할 일"><h3>${selected.replaceAll('-', '. ')}</h3>
      ${daily.length ? daily.map(event => `<article class="calendar-agenda-item ${event.planned ? 'planned' : event.status === 'done' ? 'done' : ''}" ${taskDragAttributes(event)} ${!event.planned && productivitySchedulingAvailable ? `tabindex="0" aria-label="${escape(event.title)}, Alt와 방향키로 날짜 변경"` : ''}><div><strong>${escape(event.title)}</strong><small>${event.planned ? '반복 예정' : event.status === 'done' ? '완료' : '할 일'}${event.recurrenceId ? ' · 반복' : ''}</small></div>
        ${!event.planned && productivitySchedulingAvailable ? '<span class="calendar-drag-handle" data-calendar-drag-handle aria-hidden="true">⠿</span>' : ''}</article>`).join('') : '<p class="calendar-empty">할 일 없음</p>'}
      </section></div>
      <details class="recurring-manager"><summary>반복 할 일 관리 · ${rules.filter(rule => rule.active).length}개 사용 중</summary>
      ${rules.length ? rules.map(rule => `<div class="recurring-rule"><div><strong>${escape(rule.title)}</strong><small>${rule.frequency === 'daily' ? '매일' : rule.frequency === 'weekly' ? `요일별 · ${rule.weekdays.map(day => ['월','화','수','목','금','토','일'][day - 1]).join('·')}` : `매월 ${rule.month_day}일`} · ${rule.active ? '사용 중' : '중단됨'}</small></div><button type="button" data-recurring-toggle="${rule.id}" ${busy ? 'disabled' : ''}>${rule.active ? '반복 중단' : '다시 시작'}</button></div>`).join('') : '<p>반복 할 일 없음</p>'}</details>
      ${pending ? '<button class="secondary-button" type="button" data-recurring-retry>반복 할 일 저장 대기 · 다시 시도</button>' : ''}`;
  }
  function resetForm() {
    $('taskScheduledDate').value = productivitySchedulingAvailable ? (currentPage === 'today' ? getTaskViewDate() : today()) : '';
    $('taskScheduledDate').disabled = false;
    $('taskRepeatField').hidden = false;
    $('taskRepeatFrequency').value = 'none';
    $('taskRepeatEndDate').value = '';
    refreshThemedDateTrigger($('taskScheduledDate'));
    refreshThemedDateTrigger($('taskRepeatEndDate'));
    updateForm();
  }
  function editForm(task) {
    resetForm();
    $('taskScheduledDate').value = task.scheduledDate || '';
    $('taskScheduledDate').disabled = !!task.recurrenceId;
    $('taskRepeatField').hidden = true;
    refreshThemedDateTrigger($('taskScheduledDate'));
  }
  function updateForm() {
    const frequency = $('taskRepeatFrequency').value;
    $('taskRepeatWeekdays').hidden = frequency !== 'weekly';
    $('taskRepeatMonthField').hidden = frequency !== 'monthly';
    $('taskRepeatEndField').hidden = frequency === 'none';
  }
  async function commitIntent(id) {
    const intent = readIntent(id);
    if (!intent || busy || activeAuthUser?.id !== id) return false;
    busy = true;
    $('taskFormSubmit').disabled = true;
    try {
      await syncTaskDatabaseImmediately();
      if (activeAuthUser?.id !== id) return false;
      const { error } = await supabaseClient.rpc('save_my_recurring_task', intent);
      if (error) throw error;
      if (activeAuthUser?.id !== id) return false;
      localStorage.removeItem(intentKey(id));
      closeTaskCreate();
      showToast('반복 할 일 저장됨');
      await taskDataLoadPromise;
      if (activeAuthUser?.id !== id) return false;
      await loadTaskDataFromDatabase(activeAuthUser, { force: true });
      return true;
    } catch (error) {
      if (activeAuthUser?.id === id) {
        logProductivityEvent('recurrence_save_failed', { code: String(error.code || 'network') });
        showToast('반복 일정 저장 대기 중 · 연결 시 재시도');
      }
      return false;
    } finally {
      busy = false;
      $('taskFormSubmit').disabled = false;
      render();
    }
  }
  async function saveRecurringFromForm() {
    const frequency = $('taskRepeatFrequency').value;
    if (frequency === 'none') return false;
    if (busy) return true;
    if (!productivitySchedulingAvailable) { showToast('반복 일정 기능 준비 중'); return true; }
    const id = activeAuthUser?.id;
    if (!id) return true;
    if (readIntent(id)) { await commitIntent(id); return true; }
    const start = $('taskScheduledDate').value || today(), end = $('taskRepeatEndDate').value || null;
    const weekdays = [...document.querySelectorAll('[name="taskRepeatWeekday"]:checked')].map(input => Number(input.value));
    const monthDay = Number($('taskRepeatMonthDay').value);
    if (start < today() || (end && end < start) || (frequency === 'weekly' && !weekdays.length) || !Number.isInteger(monthDay) || monthDay < 1 || monthDay > 31) {
      showToast('날짜·반복 설정 확인 필요'); return true;
    }
    const intent = { p_id: crypto.randomUUID(), p_title: $('taskInput').value.trim(),
      p_group_id: $('taskGroup').value || null, p_frequency: frequency,
      p_weekdays: weekdays.length ? weekdays : [1,2,3,4,5,6,7], p_month_day: monthDay,
      p_start_date: start, p_end_date: end };
    try { localStorage.setItem(intentKey(id), JSON.stringify(intent)); }
    catch { showToast('기기 복구 사본 저장 실패'); return true; }
    await commitIntent(id);
    return true;
  }
  function applyState(data) {
    rules = Array.isArray(data.recurringTasks) ? data.recurringTasks : [];
    lastDay = today();
    render();
    if (activeAuthUser && data.schedulingVersion === 1 && readIntent(activeAuthUser.id)) void commitIntent(activeAuthUser.id);
  }
  document.addEventListener('pointerdown', event => {
    const source = event.target.closest('#taskCalendarRoot [data-calendar-task-id]');
    if (!source || event.button !== 0 || !event.isPrimary || calendarDrag || !taskDataHydrated || !activeAuthUser) return;
    if (event.pointerType !== 'mouse' && !event.target.closest('[data-calendar-drag-handle]')) return;
    if (!state.tasks.some(task => task.id === source.dataset.calendarTaskId)) return;
    calendarDrag = { id: source.dataset.calendarTaskId, userId: activeAuthUser.id, source, pointerId: event.pointerId,
      startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, started: false, frame: null, ghost: null };
    source.setPointerCapture(event.pointerId);
  });
  document.addEventListener('pointermove', event => {
    const drag = calendarDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.x = event.clientX; drag.y = event.clientY;
    if (!drag.started && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) < 6) return;
    event.preventDefault();
    if (drag.started) return;
    drag.started = true;
    drag.source.classList.add('calendar-task-dragging');
    document.body.classList.add('calendar-drag-active');
    drag.ghost = document.createElement('div');
    drag.ghost.className = 'calendar-drag-preview';
    drag.ghost.textContent = state.tasks.find(task => task.id === drag.id)?.title || '';
    drag.ghost.setAttribute('aria-hidden', 'true');
    document.body.append(drag.ghost);
    tickCalendarDrag();
  }, { passive: false });
  document.addEventListener('pointerup', event => {
    const drag = calendarDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const date = drag.started && calendarDayAt(event.clientX, event.clientY)?.dataset.calendarDate;
    if (drag.started) { event.preventDefault(); suppressClickUntil = performance.now() + 300; }
    clearCalendarDrag();
    if (date) moveTaskDate(drag.id, date, drag.userId);
  });
  for (const type of ['pointercancel', 'lostpointercapture']) document.addEventListener(type, event => {
    if (calendarDrag?.pointerId === event.pointerId) clearCalendarDrag();
  });
  window.addEventListener('blur', clearCalendarDrag);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && calendarDrag) { clearCalendarDrag(); event.preventDefault(); return; }
    const source = event.target.closest('#taskCalendarRoot .calendar-agenda-item[data-calendar-task-id]');
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
    if (!source || !event.altKey || !step) return;
    event.preventDefault();
    const id = source.dataset.calendarTaskId, task = state.tasks.find(task => task.id === id);
    if (task && moveTaskDate(id, addDays(task.scheduledDate, step), activeAuthUser?.id)) {
      document.querySelector(`#taskCalendarRoot .calendar-agenda-item[data-calendar-task-id="${id}"]`)?.focus({ preventScroll: true });
    }
  });
  document.addEventListener('click', async event => {
    const todayRoot = event.target.closest('#todayCalendarRoot');
    if (todayRoot) {
      const day = event.target.closest('[data-today-calendar-date]');
      const move = event.target.closest('[data-today-calendar-move]');
      if (day) setTaskViewDate(day.dataset.todayCalendarDate);
      if (move) {
        const date = dateOf(`${todayMonth}-01`);
        date.setUTCMonth(date.getUTCMonth() + Number(move.dataset.todayCalendarMove));
        todayMonth = iso(date).slice(0, 7); render();
      }
      if (event.target.closest('[data-today-calendar-reset]')) { todayMonth = today().slice(0, 7); setTaskViewDate(today()); }
      return;
    }
    const root = event.target.closest('#taskCalendarRoot');
    if (!root) return;
    if (performance.now() < suppressClickUntil) { event.preventDefault(); return; }
    const day = event.target.closest('[data-calendar-date]');
    const move = event.target.closest('[data-calendar-move]');
    const toggle = event.target.closest('[data-recurring-toggle]');
    if (day) { selected = day.dataset.calendarDate; month = selected.slice(0, 7); render(); }
    if (move) { const date = dateOf(`${month}-01`); date.setUTCMonth(date.getUTCMonth() + Number(move.dataset.calendarMove)); month = iso(date).slice(0, 7); render(); }
    if (event.target.closest('[data-calendar-today]')) { selected = today(); month = selected.slice(0, 7); render(); }
    if (event.target.closest('[data-recurring-retry]') && activeAuthUser) await commitIntent(activeAuthUser.id);
    if (toggle && !busy && activeAuthUser) {
      const rule = rules.find(rule => rule.id === toggle.dataset.recurringToggle), id = activeAuthUser.id;
      if (!rule) return;
      busy = true; toggle.disabled = true;
      try {
        const { error } = await supabaseClient.rpc('set_my_recurring_task_active', { p_id: rule.id, p_active: !rule.active });
        if (error) throw error;
        if (activeAuthUser?.id === id) await loadTaskDataFromDatabase(activeAuthUser, { force: true });
      } catch { if (activeAuthUser?.id === id) showToast('반복 설정 변경 실패'); }
      finally { busy = false; render(); }
    }
  });
  $('taskRepeatFrequency').addEventListener('change', updateForm);
  window.addEventListener('online', () => { if (activeAuthUser) void commitIntent(activeAuthUser.id); });
  setInterval(() => {
    if (typeof activeAuthUser !== 'undefined' && activeAuthUser && lastDay !== today()) {
      lastDay = today(); scheduleProductivityRealtimeRefresh(activeAuthUser.id);
    }
  }, 60000);
  window.TaskPlanner = { matches, eventsFor, render, resetForm, editForm, saveRecurringFromForm, applyState,
    snapshotRules: () => rules, reset: () => { clearCalendarDrag(); rules = []; month = null; selected = null; lastDay = null; todayMonth = null; todaySelection = null; } };
})();
