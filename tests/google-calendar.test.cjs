const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../google-calendar.js'), 'utf8');
const scopes = 'https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/calendar.calendarlist.readonly';
const plain = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(setImmediate);
function harness(options = {}) {
  const calls = [], authorizations = [], handlers = {}, timers = new Map();
  let timerId = 0, now = Date.parse('2026-11-25T03:00:00Z');
  const response = { access_token: 'fixture-access-token', expires_in: 3600, scope: scopes, ...options.token };
  const primary = { id: 'primary-calendar', summary: 'Personal', primary: true, accessRole: 'owner' };
  const ctx = vm.createContext({ console, URL, URLSearchParams, AbortController, Intl,
    Date: class extends Date { constructor(value) { super(value === undefined ? now : value); } static now() { return now; } },
    activeAuthUser: { id: 'user-a', email: 'owner@example.test' }, currentPage: 'calendar',
    localStorage: { getItem() { throw Error('Calendar tokens must not touch storage'); }, setItem() { throw Error('Calendar tokens must not touch storage'); } },
    document: { visibilityState: 'visible', addEventListener: (name, fn) => { handlers[name] = fn; } },
    window: { FARMODORO_CONFIG: { googleClientId: 'fixture-client' }, TaskPlanner: { render() {} },
      addEventListener: (name, fn) => { handlers[`window:${name}`] = fn; },
      google: { accounts: { oauth2: {
        hasGrantedAllScopes: (value, ...wanted) => wanted.every(scope => value.scope?.split(' ').includes(scope)),
        initTokenClient(config) { authorizations.push(config); return { requestAccessToken() {
          if (options.autoAuthorize !== false) queueMicrotask(() => { void config.callback(response); });
        } }; },
      } } },
    },
    setTimeout: (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id), setInterval() {},
    fetch: async (input, init) => {
      const url = new URL(input); calls.push({ url, init });
      const data = options.api ? await options.api(url, init) : {
        items: url.pathname.endsWith('/calendarList') ? [primary] : options.events || [],
      };
      return { ok: !data.error, status: data.status || (data.error ? 403 : 200), json: async () => data };
    },
  });
  vm.runInContext(source, ctx);
  const api = ctx.window.GoogleCalendarSync;
  api.setRange('2026-11-01', '2026-12-07');
  return { ctx, api, calls, authorizations, handlers, timers, advance: ms => { now += ms; } };
}
const event = (id, start, end, extra = {}) => ({ id, summary: id, start, end, htmlLink: `https://calendar.google.com/calendar/event?eid=${id}`, ...extra });

test('Calendar OAuth asks only for read scopes and authenticated requests never put tokens in URLs', async () => {
  const h = harness();
  assert.equal(await h.api.connect(), true);
  assert.equal(h.authorizations[0].client_id, 'fixture-client');
  assert.equal(h.authorizations[0].scope, scopes);
  assert.ok(h.calls.length >= 2);
  assert.ok(h.calls.every(({ url, init }) => url.origin === 'https://www.googleapis.com' && !url.href.includes('fixture-access-token') && init.headers.Authorization === 'Bearer fixture-access-token' && !init.method));
  assert.match(h.api.connectionMarkup(), /Google 일정이 연결/);
});

test('calendar/event pagination expands recurring instances and preserves the requested month range', async () => {
  const h = harness({ api: async url => {
    if (url.pathname.endsWith('/calendarList')) return url.searchParams.has('pageToken')
      ? { items: [{ id: 'shared', summary: 'Team', selected: true, accessRole: 'reader' }] }
      : { items: [{ id: 'primary', primary: true, accessRole: 'owner' }], nextPageToken: 'cal-page-2' };
    if (url.pathname.includes('/primary/')) return url.searchParams.has('pageToken')
      ? { items: [event('second', { date: '2026-11-25' }, { date: '2026-11-26' })] }
      : { items: [event('first', { date: '2026-11-25' }, { date: '2026-11-26' })], nextPageToken: 'event-page-2' };
    return { items: [event('shared', { date: '2026-11-25' }, { date: '2026-11-26' })] };
  } });
  assert.equal(await h.api.connect(), true);
  assert.equal(h.api.eventsForDate('2026-11-25').length, 3);
  for (const { url } of h.calls.filter(call => call.url.pathname.endsWith('/events'))) {
    assert.equal(url.searchParams.get('singleEvents'), 'true');
    assert.equal(url.searchParams.get('timeMin'), '2026-11-01T00:00:00+09:00');
    assert.equal(url.searchParams.get('timeMax'), '2026-12-07T00:00:00+09:00');
    assert.equal(url.searchParams.get('timeZone'), 'Asia/Seoul');
  }
});

test('all-day exclusive ends and timed midnight boundaries use Korean calendar days', async () => {
  const h = harness({ events: [
    event('all-day', { date: '2026-11-24' }, { date: '2026-11-26' }),
    event('cross-midnight', { dateTime: '2026-11-24T14:45:00Z' }, { dateTime: '2026-11-24T16:30:00Z' }),
    event('ends-midnight', { dateTime: '2026-11-24T22:00:00+09:00' }, { dateTime: '2026-11-25T00:00:00+09:00' }),
    event('cancelled', { date: '2026-11-25' }, { date: '2026-11-26' }, { status: 'cancelled' }),
  ] });
  await h.api.connect();
  assert.deepEqual(plain(h.api.eventsForDate('2026-11-25')).map(item => item.title), ['all-day', 'cross-midnight']);
  assert.equal(h.api.eventsForDate('2026-11-26').length, 0);
  assert.equal(h.api.eventsForDate('2026-11-24').length, 3);
  assert.match(h.api.eventsForDate('2026-11-25')[1].timeLabel, /이전 날부터/);
});

test('disconnect and account changes immediately clear personal calendar data', async () => {
  const h = harness({ events: [event('private', { date: '2026-11-25' }, { date: '2026-11-26' })] });
  await h.api.connect(); assert.equal(h.api.eventsForDate('2026-11-25').length, 1);
  h.ctx.activeAuthUser = { id: 'user-b' };
  assert.equal(h.api.eventsForDate('2026-11-25').length, 0);
  h.api.selectUser('user-b');
  assert.doesNotMatch(h.api.connectionMarkup(), /Personal|private|Google 일정이 연결/);
  assert.equal(await h.api.refresh(), false);
});

test('a late OAuth response from the previous account cannot authorize the new account', async () => {
  const h = harness({ autoAuthorize: false });
  const pending = h.api.connect(); await tick();
  h.ctx.activeAuthUser = { id: 'user-b' }; h.api.selectUser('user-b');
  await h.authorizations[0].callback({ access_token: 'old-token', expires_in: 3600, scope: scopes });
  assert.equal(await pending, false); assert.equal(h.calls.length, 0);
});

test('a month change overtakes a slow response without mixing old month events', async () => {
  let release;
  const h = harness({ api: async url => {
    if (url.pathname.endsWith('/calendarList')) return { items: [{ id: 'primary', primary: true, accessRole: 'owner' }] };
    if (url.searchParams.get('timeMin').startsWith('2026-11')) return new Promise(resolve => { release = resolve; });
    return { items: [event('december', { date: '2026-12-15' }, { date: '2026-12-16' })] };
  } });
  const first = h.api.connect(); await tick();
  h.api.setRange('2026-12-01', '2027-01-04'); await tick();
  release({ items: [event('old', { date: '2026-11-25' }, { date: '2026-11-26' })] });
  await first; await tick();
  assert.equal(h.api.eventsForDate('2026-11-25').length, 0);
  assert.equal(h.api.eventsForDate('2026-12-15')[0].title, 'december');
});

test('partial consent and popup cancellation produce useful retry states without API access', async () => {
  const partial = harness({ token: { scope: scopes.split(' ')[0] } });
  assert.equal(await partial.api.connect(), false); assert.equal(partial.calls.length, 0);
  assert.match(partial.api.connectionMarkup(), /읽기 권한을 모두/);
  const closed = harness({ autoAuthorize: false });
  const connecting = closed.api.connect(); await tick();
  closed.authorizations[0].error_callback({ type: 'popup_closed' });
  assert.equal(await connecting, false); assert.match(closed.api.connectionMarkup(), /연결 창을 닫/);
});

test('disabled API errors remain configuration messages and never expose Google error bodies', async () => {
  const h = harness({ api: async () => ({ status: 403, error: { message: 'SECRET PERSONAL TEXT', details: [{ reason: 'SERVICE_DISABLED' }] } }) });
  assert.equal(await h.api.connect(), false);
  assert.match(h.api.connectionMarkup(), /앱 관리자의 설정/);
  assert.doesNotMatch(h.api.connectionMarkup(), /SECRET PERSONAL TEXT/);
});

test('OAuth rejections distinguish access and configuration restrictions without exposing error descriptions', async () => {
  for (const [code, expected] of [
    ['access_denied', /앱 접근이 제한된 계정/],
    ['admin_policy_enforced', /조직에서 이 앱의 연결을 제한/],
    ['org_internal', /특정 조직의 계정/],
    ['origin_mismatch', /연결 주소 설정/],
    ['invalid_client', /연결 정보/],
    ['invalid_scope', /캘린더 권한 설정/],
  ]) {
    const h = harness({ autoAuthorize: false });
    const connecting = h.api.connect(); await tick();
    await h.authorizations[0].callback({ error: code, error_description: 'SECRET PERSONAL TEXT' });
    assert.equal(await connecting, false);
    assert.equal(h.calls.length, 0);
    assert.match(h.api.connectionMarkup(), expected);
    assert.ok(h.api.connectionMarkup().includes(code));
    assert.doesNotMatch(h.api.connectionMarkup(), /SECRET PERSONAL TEXT/);
    const retrying = h.api.connect(); await tick();
    await h.authorizations[1].callback({ access_token: 'retry-token', expires_in: 3600, scope: scopes });
    assert.equal(await retrying, true);
  }
});

test('token expiration clears events and requires a user-driven reconnection', async () => {
  const h = harness({ events: [event('private', { date: '2026-11-25' }, { date: '2026-11-26' })] });
  await h.api.connect();
  const expiry = [...h.timers.values()].find(timer => timer.delay > 15000);
  assert.ok(expiry); h.advance(expiry.delay); expiry.fn();
  assert.equal(h.api.eventsForDate('2026-11-25').length, 0);
  const before = h.calls.length;
  assert.equal(await h.api.refresh(), false); assert.equal(h.calls.length, before);
  assert.match(h.api.connectionMarkup(), /연결 시간이 지났/);
});

test('event links reject non-Google origins and executable URLs', async () => {
  const h = harness({ events: [event('bad', { date: '2026-11-25' }, { date: '2026-11-26' }, { htmlLink: 'javascript:alert(1)' })] });
  await h.api.connect(); assert.equal(h.api.eventsForDate('2026-11-25')[0].href, '');
});

test('a failed Google module load stays retryable without a render/reload loop', async () => {
  const h = harness(); let attempts = 0;
  h.ctx.window.google = null;
  h.ctx.loadGoogleIdentityScript = async () => { attempts++; throw Error('blocked'); };
  assert.equal(await h.api.prepare(), false);
  assert.equal(await h.api.prepare(), false);
  assert.equal(attempts, 1);
  assert.equal(await h.api.prepare(true), false);
  assert.equal(attempts, 2);
});
