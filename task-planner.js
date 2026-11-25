(() => {
  let rules = [], month = null, selected = null, busy = false, lastDay = null;
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
        id: `${rule.id}:${date}`, title: rule.title, scheduledDate: date, recurrenceId: rule.id, planned: true,
      })) : [];
    return [...actual, ...future];
  }
  function readIntent(id) {
    try { return JSON.parse(localStorage.getItem(intentKey(id)) || 'null'); } catch { return null; }
  }
  function render() {
    if (typeof currentPage === 'undefined' || currentPage !== 'calendar') return;
    const root = $('taskCalendarRoot');
    if (!root) return;
    const now = today();
    if (!month) month = now.slice(0, 7);
    if (!selected || !selected.startsWith(month)) selected = `${month}-01`;
    const first = `${month}-01`, firstDate = dateOf(first);
    const start = addDays(first, -((firstDate.getUTCDay() + 6) % 7));
    const next = new Date(Date.UTC(firstDate.getUTCFullYear(), firstDate.getUTCMonth() + 1, 1));
    const daysInMonth = (next - firstDate) / 86400000;
    const cells = Math.ceil((((firstDate.getUTCDay() + 6) % 7) + daysInMonth) / 7) * 7;
    const daily = eventsFor(selected);
    const pending = activeAuthUser && readIntent(activeAuthUser.id);
    root.innerHTML = `
      <div class="calendar-toolbar"><div class="calendar-month-controls">
        <button type="button" data-calendar-move="-1" aria-label="이전 달">‹</button>
        <h2>${firstDate.getUTCFullYear()}년 ${firstDate.getUTCMonth() + 1}월</h2>
        <button type="button" data-calendar-move="1" aria-label="다음 달">›</button>
        <button type="button" data-calendar-today>오늘</button></div></div>
      <p class="calendar-hint">미래의 반복 항목은 예정이야. 날짜가 되면 완료할 수 있는 할 일로 생겨.</p>
      <div class="calendar-layout"><div class="calendar-month"><div class="calendar-weekdays">${['월','화','수','목','금','토','일'].map(day => `<span>${day}</span>`).join('')}</div>
      <div class="calendar-grid">${Array.from({ length: cells }, (_, i) => {
        const date = addDays(start, i), events = eventsFor(date), done = events.filter(event => event.status === 'done').length;
        return `<button type="button" data-calendar-date="${date}" class="calendar-day ${date.startsWith(month) ? '' : 'outside'} ${date === now ? 'today' : ''}" aria-pressed="${selected === date}" aria-label="${date}, 할 일 ${events.length}개, 완료 ${done}개">
          <span class="calendar-day-number">${Number(date.slice(-2))}</span>
          ${events.slice(0, 2).map(event => `<span class="calendar-event ${event.planned ? 'planned' : event.status === 'done' ? 'done' : ''}">${escape(event.title)}</span>`).join('')}
          ${events.length ? `<small>${events.length}개${events.length > 2 ? ` · +${events.length - 2}` : ''}</small>` : ''}</button>`;
      }).join('')}</div></div>
      <section class="calendar-day-detail" aria-label="선택한 날짜의 할 일"><h3>${selected.replaceAll('-', '. ')}</h3>
      ${daily.length ? daily.map(event => `<article class="calendar-agenda-item"><div><strong>${escape(event.title)}</strong><small>${event.planned ? '반복 예정' : event.status === 'done' ? '완료' : '할 일'}${event.recurrenceId ? ' · 반복' : ''}</small></div>
        ${!event.planned ? `<button type="button" data-calendar-edit="${event.id}">수정</button>` : ''}</article>`).join('') : '<p class="calendar-empty">이날 등록된 할 일이 없어.</p>'}
      </section></div>
      <details class="recurring-manager"><summary>반복 할 일 관리 · ${rules.filter(rule => rule.active).length}개 사용 중</summary>
      ${rules.length ? rules.map(rule => `<div class="recurring-rule"><div><strong>${escape(rule.title)}</strong><small>${rule.frequency === 'daily' ? '매일' : rule.frequency === 'weekly' ? `요일별 · ${rule.weekdays.map(day => ['월','화','수','목','금','토','일'][day - 1]).join('·')}` : `매월 ${rule.month_day}일`} · ${rule.active ? '사용 중' : '중단됨'}</small></div><button type="button" data-recurring-toggle="${rule.id}" ${busy ? 'disabled' : ''}>${rule.active ? '반복 중단' : '다시 시작'}</button></div>`).join('') : '<p>할 일 메뉴에서 새 할 일의 반복 일정을 정할 수 있어.</p>'}
      <p>반복을 중단해도 이미 만들어진 할 일은 남아. 수정은 날짜별 항목에 적용돼.</p></details>
      ${pending ? '<button class="secondary-button" type="button" data-recurring-retry>반복 할 일 저장 대기 · 다시 시도</button>' : ''}
      <p class="calendar-hint">날짜 없는 할 일은 할 일 메뉴에서 볼 수 있어. 지난 항목은 기존 보관 정책을 따라.</p>`;
  }
  function resetForm() {
    $('taskScheduledDate').value = '';
    $('taskScheduledDate').disabled = false;
    $('taskRepeatField').hidden = false;
    $('taskRepeatFrequency').value = 'none';
    $('taskRepeatEndDate').value = '';
    updateForm();
  }
  function editForm(task) {
    resetForm();
    $('taskScheduledDate').value = task.scheduledDate || '';
    $('taskScheduledDate').disabled = !!task.recurrenceId;
    $('taskRepeatField').hidden = true;
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
      showToast('반복 할 일을 저장했어');
      await taskDataLoadPromise;
      if (activeAuthUser?.id !== id) return false;
      await loadTaskDataFromDatabase(activeAuthUser, { force: true });
      return true;
    } catch (error) {
      if (activeAuthUser?.id === id) {
        logProductivityEvent('recurrence_save_failed', { code: String(error.code || 'network') });
        showToast('반복 일정을 아직 저장하지 못했어. 연결되면 다시 시도할게');
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
    if (!productivitySchedulingAvailable) { showToast('반복 일정 기능을 준비 중이야. 서버 업데이트 후 다시 시도해줘'); return true; }
    const id = activeAuthUser?.id;
    if (!id) return true;
    if (readIntent(id)) { await commitIntent(id); return true; }
    const start = $('taskScheduledDate').value || today(), end = $('taskRepeatEndDate').value || null;
    const weekdays = [...document.querySelectorAll('[name="taskRepeatWeekday"]:checked')].map(input => Number(input.value));
    const monthDay = Number($('taskRepeatMonthDay').value);
    if (start < today() || (end && end < start) || (frequency === 'weekly' && !weekdays.length) || !Number.isInteger(monthDay) || monthDay < 1 || monthDay > 31) {
      showToast('시작·종료일과 반복 요일 또는 날짜를 확인해'); return true;
    }
    const intent = { p_id: crypto.randomUUID(), p_title: $('taskInput').value.trim(),
      p_group_id: $('taskGroup').value || null, p_frequency: frequency,
      p_weekdays: weekdays.length ? weekdays : [1,2,3,4,5,6,7], p_month_day: monthDay,
      p_start_date: start, p_end_date: end };
    try { localStorage.setItem(intentKey(id), JSON.stringify(intent)); }
    catch { showToast('기기에 복구 사본을 저장하지 못했어. 저장 공간을 확인해줘'); return true; }
    await commitIntent(id);
    return true;
  }
  function applyState(data) {
    rules = Array.isArray(data.recurringTasks) ? data.recurringTasks : [];
    lastDay = today();
    render();
    if (activeAuthUser && data.schedulingVersion === 1 && readIntent(activeAuthUser.id)) void commitIntent(activeAuthUser.id);
  }
  document.addEventListener('click', async event => {
    const root = event.target.closest('#taskCalendarRoot');
    if (!root) return;
    const day = event.target.closest('[data-calendar-date]');
    const move = event.target.closest('[data-calendar-move]');
    const edit = event.target.closest('[data-calendar-edit]');
    const toggle = event.target.closest('[data-recurring-toggle]');
    if (day) { selected = day.dataset.calendarDate; month = selected.slice(0, 7); render(); }
    if (move) { const date = dateOf(`${month}-01`); date.setUTCMonth(date.getUTCMonth() + Number(move.dataset.calendarMove)); month = iso(date).slice(0, 7); render(); }
    if (event.target.closest('[data-calendar-today]')) { selected = today(); month = selected.slice(0, 7); render(); }
    if (edit) { const task = state.tasks.find(task => task.id === edit.dataset.calendarEdit); if (task) { showPage('tasks'); location.hash = 'tasks'; openTaskInlineEdit(task); } }
    if (event.target.closest('[data-recurring-retry]') && activeAuthUser) await commitIntent(activeAuthUser.id);
    if (toggle && !busy && activeAuthUser) {
      const rule = rules.find(rule => rule.id === toggle.dataset.recurringToggle), id = activeAuthUser.id;
      if (!rule) return;
      busy = true; toggle.disabled = true;
      try {
        const { error } = await supabaseClient.rpc('set_my_recurring_task_active', { p_id: rule.id, p_active: !rule.active });
        if (error) throw error;
        if (activeAuthUser?.id === id) await loadTaskDataFromDatabase(activeAuthUser, { force: true });
      } catch { if (activeAuthUser?.id === id) showToast('반복 설정을 바꾸지 못했어. 다시 시도해줘'); }
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
    snapshotRules: () => rules, reset: () => { rules = []; month = null; selected = null; lastDay = null; } };
})();
