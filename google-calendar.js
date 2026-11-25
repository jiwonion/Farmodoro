// Read-only Calendar API integration. OAuth access tokens live only in memory;
// signing out, changing Farmodoro accounts, expiry, or disconnect clears them.
(() => {
  const SCOPES = ['https://www.googleapis.com/auth/calendar.events.readonly',
    'https://www.googleapis.com/auth/calendar.calendarlist.readonly'];
  const ZONE = 'Asia/Seoul';
  const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
  const clockFormat = new Intl.DateTimeFormat('ko-KR', { timeZone: ZONE, hour: '2-digit', minute: '2-digit', hour12: false });
  const escape = value => String(value).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[ch]));
  let owner = null, generation = 0, loadSequence = 0, token = null, expiresAt = 0, expiryTimer = null;
  let calendars = [], selected = new Set(), events = [], range = null, calendarsReady = false;
  let authorizing = false, busy = false, preparing = null, preparationFailed = false, message = '';
  let controller = null, loading = null, inflightKey = '', loadedKey = '', lastLoadedAt = 0;
  const account = () => typeof activeAuthUser === 'undefined' ? null : activeAuthUser?.id || null;
  const connected = () => owner === account() && !!token && Date.now() < expiresAt;
  const notify = () => window.TaskPlanner?.render();
  const error = code => Object.assign(new Error(code), { code });
  const dateOf = value => dayFormat.format(new Date(value));
  const key = () => range ? `${range.start}/${range.end}/${[...selected].sort().join('|')}` : '';

  function selectUser(id) {
    if (owner === id) return;
    disconnect(false);
    owner = id;
  }
  function ensureUser() { selectUser(account()); }
  function disconnect(redraw = true) {
    generation++; loadSequence++;
    controller?.abort(); controller = null; loading = null;
    if (expiryTimer) clearTimeout(expiryTimer);
    expiryTimer = null; token = null; expiresAt = 0;
    calendars = []; selected = new Set(); events = []; calendarsReady = false;
    authorizing = false; busy = false; message = ''; loadedKey = ''; inflightKey = ''; lastLoadedAt = 0;
    if (redraw) notify();
  }
  async function prepare(force = false) {
    if (window.google?.accounts?.oauth2) return true;
    if (preparing) return preparing;
    if (preparationFailed && !force) return false;
    preparationFailed = false;
    preparing = Promise.resolve().then(() => loadGoogleIdentityScript())
      .then(() => {
        if (!window.google?.accounts?.oauth2) throw error('module_unavailable');
        return true;
      }).catch(() => { preparationFailed = true; return false; })
      .finally(() => { preparing = null; notify(); });
    return preparing;
  }
  function explain(code) {
    return {
      popup_closed: '연결 창을 닫았어. 연결 버튼으로 다시 시작할 수 있어.',
      popup_failed_to_open: '연결 창이 차단됐어. 팝업을 허용하고 다시 연결해줘.',
      access_denied: 'Google에서 연결을 허용하지 않았어. 권한 동의를 취소했거나 앱 접근이 제한된 계정일 수 있어. (access_denied)',
      admin_policy_enforced: '조직에서 이 앱의 연결을 제한했어. Google Workspace 관리자에게 확인해줘. (admin_policy_enforced)',
      org_internal: '이 앱은 특정 조직의 계정만 연결할 수 있도록 설정돼 있어. 앱 관리자 확인이 필요해. (org_internal)',
      origin_mismatch: '앱의 Google 연결 주소 설정이 맞지 않아. 앱 관리자 확인이 필요해. (origin_mismatch)',
      invalid_client: '앱의 Google 연결 정보가 맞지 않아. 앱 관리자 확인이 필요해. (invalid_client)',
      invalid_scope: '앱의 캘린더 권한 설정이 맞지 않아. 앱 관리자 확인이 필요해. (invalid_scope)',
      insufficient_scope: '일정과 캘린더 목록 읽기 권한을 모두 허용해줘.',
      expired: 'Google 연결 시간이 지났어. 다시 연결해서 일정을 새로 불러와줘.',
      api_disabled: 'Google Calendar API 설정이 아직 안 됐어. 앱 관리자의 설정이 필요해.',
      forbidden: '이 캘린더를 읽을 권한이 없어. Google 연결을 다시 확인해줘.',
      module_unavailable: 'Google 연결 모듈을 불러오지 못했어. 인터넷 연결을 확인해줘.',
      limit: '선택한 기간의 일정이 너무 많아. 표시할 캘린더를 줄여줘.',
      offline: 'Google 일정을 불러오지 못했어. 인터넷 연결 후 다시 불러와줘.',
      timeout: 'Google 응답이 늦어지고 있어. 잠시 후 다시 불러와줘.',
    }[code] || 'Google 일정을 불러오지 못했어. 다시 시도해줘.';
  }
  async function api(path, params, signal, accessToken) {
    const url = new URL(`https://www.googleapis.com/calendar/v3/${path}`);
    url.search = new URLSearchParams(params);
    const abort = new AbortController();
    const onAbort = () => abort.abort();
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) abort.abort();
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; abort.abort(); }, 15000);
    try {
      const response = await fetch(url.href, { headers: { Authorization: `Bearer ${accessToken}` }, signal: abort.signal });
      const body = await response.json();
      if (!response.ok) {
        const reasons = [...(body.error?.errors || []).map(item => item.reason), ...(body.error?.details || []).map(item => item.reason)];
        if (response.status === 401) throw error('expired');
        if (reasons.some(reason => ['accessNotConfigured', 'SERVICE_DISABLED'].includes(reason))) throw error('api_disabled');
        if (response.status === 403) throw error('forbidden');
        throw error('request_failed');
      }
      return body;
    } catch (failure) {
      if (signal.aborted) throw error('cancelled');
      if (timedOut) throw error('timeout');
      throw failure.code ? failure : error('offline');
    } finally {
      clearTimeout(timeout); signal.removeEventListener('abort', onAbort);
    }
  }
  async function pages(path, params, signal, accessToken) {
    let pageToken = '', items = [], count = 0;
    do {
      if (++count > 20) throw error('limit');
      const data = await api(path, { ...params, ...(pageToken ? { pageToken } : {}) }, signal, accessToken);
      items.push(...(Array.isArray(data.items) ? data.items : []));
      pageToken = data.nextPageToken || '';
    } while (pageToken);
    return items;
  }
  function safeLink(value) {
    try { const url = new URL(value); return url.protocol === 'https:' && ['calendar.google.com', 'www.google.com'].includes(url.hostname) ? url.href : ''; }
    catch { return ''; }
  }
  function normalize(item, calendar) {
    if (item.status === 'cancelled' || !item.id) return null;
    const allDay = !!item.start?.date;
    const start = allDay ? item.start.date : item.start?.dateTime;
    const end = allDay ? item.end?.date : item.end?.dateTime;
    if (!start || !end || (allDay ? !/^\d{4}-\d{2}-\d{2}$/.test(start) || end <= start : !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(end) <= Date.parse(start))) return null;
    return { id: `google:${calendar.id}:${item.id}`, title: item.summary || '제목 없는 일정', google: true,
      calendarName: calendar.summary || 'Google 캘린더', allDay, start, end,
      scheduledDate: allDay ? start : dateOf(start), href: safeLink(item.htmlLink) };
  }
  function eventsForDate(date) {
    if (owner !== account()) return [];
    const start = Date.parse(`${date}T00:00:00+09:00`), end = start + 86400000;
    return events.filter(item => item.allDay ? item.start <= date && date < item.end : Date.parse(item.start) < end && Date.parse(item.end) > start)
      .map(item => ({ ...item, timeLabel: item.allDay ? '종일' : `${dateOf(item.start) === date ? clockFormat.format(new Date(item.start)) : '이전 날부터'} · ${dateOf(item.end) === date ? clockFormat.format(new Date(item.end)) : '다음 날까지'}` }));
  }
  async function refresh(force = true) {
    ensureUser();
    if (!connected() || !range) return false;
    const requestedKey = key();
    if (busy && requestedKey === inflightKey) return loading;
    if (!force && requestedKey === loadedKey) return true;
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal, currentGeneration = generation, sequence = ++loadSequence;
    const accessToken = token, requestedRange = { ...range };
    const current = () => currentGeneration === generation && sequence === loadSequence && owner === account();
    busy = true; inflightKey = requestedKey; message = ''; notify();
    loading = (async () => {
      try {
        if (!calendarsReady) {
          const rows = await pages('users/me/calendarList', { maxResults: '250', fields: 'items(id,summary,primary,selected,accessRole),nextPageToken' }, signal, accessToken);
          if (!current()) return false;
          calendars = rows.filter(item => item.id && item.accessRole !== 'freeBusyReader' && item.accessRole !== 'none');
          selected = new Set(calendars.filter(item => item.primary || item.selected).map(item => item.id));
          if (!selected.size && calendars.length) selected.add(calendars[0].id);
          calendarsReady = true;
        }
        const nextEvents = [];
        for (const calendar of calendars.filter(item => selected.has(item.id))) {
          const rows = await pages(`calendars/${encodeURIComponent(calendar.id)}/events`, {
            timeMin: `${requestedRange.start}T00:00:00+09:00`, timeMax: `${requestedRange.end}T00:00:00+09:00`,
            timeZone: ZONE, singleEvents: 'true', orderBy: 'startTime', maxResults: '250',
            fields: 'items(id,summary,status,start,end,htmlLink),nextPageToken',
          }, signal, accessToken);
          nextEvents.push(...rows.map(item => normalize(item, calendar)).filter(Boolean));
        }
        if (!current()) return false;
        events = nextEvents; loadedKey = key(); lastLoadedAt = Date.now();
        message = selected.size ? 'Google 일정이 연결됐어. 변경 내용은 1분마다 새로 확인해.' : '표시할 캘린더를 선택해줘.';
        return true;
      } catch (failure) {
        if (!current()) return false;
        if (failure.code === 'expired') { token = null; expiresAt = 0; events = []; }
        message = explain(failure.code);
        return false;
      } finally { if (current()) { busy = false; loading = null; notify(); } }
    })();
    return loading;
  }
  async function connect() {
    ensureUser();
    if (!owner || authorizing) return false;
    const currentGeneration = generation;
    const ready = await prepare(true);
    if (generation !== currentGeneration || owner !== account()) return false;
    if (!ready) { message = explain('module_unavailable'); notify(); return false; }
    authorizing = true; message = ''; notify();
    return new Promise(resolve => {
      const fail = code => {
        if (generation === currentGeneration && owner === account()) { authorizing = false; message = explain(code); notify(); }
        resolve(false);
      };
      try {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: window.FARMODORO_CONFIG.googleClientId, scope: SCOPES.join(' '),
          include_granted_scopes: true, login_hint: activeAuthUser?.email || undefined,
          error_callback: failure => fail(failure.type || 'request_failed'),
          callback: async response => {
            if (generation !== currentGeneration || owner !== account()) { resolve(false); return; }
            if (response.error || !response.access_token) { fail(response.error || 'access_denied'); return; }
            if (!window.google.accounts.oauth2.hasGrantedAllScopes(response, ...SCOPES)) { fail('insufficient_scope'); return; }
            token = response.access_token; expiresAt = Date.now() + Math.max(0, Number(response.expires_in) - 30) * 1000;
            authorizing = false; calendarsReady = false; loadedKey = '';
            if (expiryTimer) clearTimeout(expiryTimer);
            expiryTimer = setTimeout(() => {
              if (generation !== currentGeneration) return;
              controller?.abort(); loadSequence++; busy = false; loading = null;
              token = null; events = []; message = explain('expired'); notify();
            }, Math.max(0, expiresAt - Date.now()));
            resolve(await refresh());
          },
        });
        client.requestAccessToken({ prompt: '' });
      } catch { fail('module_unavailable'); }
    });
  }
  function setRange(start, end) {
    ensureUser();
    if (range?.start === start && range?.end === end) return;
    range = { start, end };
    if (connected()) void refresh(false);
  }
  function connectionMarkup() {
    ensureUser();
    const hasConnection = connected();
    return `<section class="google-calendar-connection" aria-label="Google 캘린더 연결">
      <div><strong>Google 캘린더</strong><p role="status">${escape(authorizing ? 'Google 권한을 확인하고 있어.' : busy ? 'Google 일정을 불러오는 중이야.' : message || (preparationFailed ? explain('module_unavailable') : '계정을 연결하면 구글 일정도 이 달력에서 볼 수 있어.'))}</p></div>
      <div class="google-calendar-actions"><button type="button" class="secondary-button" data-google-connect ${authorizing || preparing ? 'disabled' : ''}>${authorizing ? '연결 중' : hasConnection ? '계정 다시 연결' : preparing ? 'Google 준비 중' : 'Google 캘린더 연결'}</button>
      ${hasConnection ? `<button type="button" class="secondary-button" data-google-refresh ${busy ? 'disabled' : ''}>새로 불러오기</button><button type="button" class="text-button" data-google-disconnect>연결 해제</button>` : ''}</div>
      ${hasConnection && calendars.length ? `<details class="google-calendar-picker"><summary>표시할 캘린더 · ${selected.size}개</summary>${calendars.map(item => `<label><input type="checkbox" data-google-calendar="${escape(item.id)}" ${selected.has(item.id) ? 'checked' : ''} />${escape(item.summary || 'Google 캘린더')}</label>`).join('')}<small>구글 일정은 읽어와서 표시해. 수정은 Google 캘린더에서 해줘.</small></details>` : ''}</section>`;
  }
  document.addEventListener('click', event => {
    if (event.target.closest('[data-google-connect]')) void connect();
    if (event.target.closest('[data-google-refresh]')) void refresh();
    if (event.target.closest('[data-google-disconnect]')) disconnect();
  });
  document.addEventListener('change', event => {
    const input = event.target.closest('[data-google-calendar]');
    if (!input || !connected()) return;
    if (input.checked) selected.add(input.dataset.googleCalendar); else selected.delete(input.dataset.googleCalendar);
    loadedKey = ''; void refresh();
  });
  const foregroundRefresh = () => {
    if (typeof currentPage !== 'undefined' && currentPage === 'calendar' && document.visibilityState !== 'hidden' && Date.now() - lastLoadedAt > 15000) void refresh();
  };
  window.addEventListener('focus', foregroundRefresh);
  document.addEventListener('visibilitychange', foregroundRefresh);
  setInterval(() => { if (typeof currentPage !== 'undefined' && currentPage === 'calendar' && document.visibilityState !== 'hidden') void refresh(); }, 60000);
  window.GoogleCalendarSync = { prepare, selectUser, connect, disconnect, refresh, setRange, connectionMarkup, eventsForDate };
})();
