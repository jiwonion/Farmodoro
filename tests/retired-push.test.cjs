const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = name => fs.readFileSync(path.join(__dirname, '../supabase/functions', name, 'index.ts'), 'utf8');

test('the retired direct-push endpoint returns 410 without sending any mail notification', async () => {
  let handler;
  vm.runInNewContext(source('send-push'), {
    Response,
    Deno: { serve: callback => { handler = callback; } },
  });
  assert.equal((await handler({ method: 'OPTIONS' })).status, 200);
  const response = await handler({ method: 'POST' });
  assert.equal(response.status, 410);
  assert.equal((await response.json()).error, 'This endpoint has been retired.');
});

test('scheduled dispatch sends a due timer while leaving retired watering entries untouched', async () => {
  const rows = [
    { id: 'timer', user_id: 'owner', kind: 'timer_end', title: 'Focus', body: 'Done', sent_at: null, fire_at: '2000-01-01' },
    { id: 'watering', user_id: 'owner', kind: 'plot_water_ready', title: 'Water', body: 'Ready', sent_at: null, fire_at: '2000-01-01' },
  ];
  const sent = [];
  const marked = [];
  const admin = {
    from(table) {
      assert.equal(table, 'scheduled_push_notifications');
      const filters = [];
      return {
        select() { return this; },
        eq(column, value) { filters.push(row => row[column] === value); return this; },
        is(column, value) { filters.push(row => row[column] === value); return this; },
        lte(column, value) { filters.push(row => row[column] <= value); return this; },
        async limit(count) { return { data: rows.filter(row => filters.every(filter => filter(row))).slice(0, count), error: null }; },
        update() { return this; },
        async in(column, ids) { assert.equal(column, 'id'); marked.push(...ids); return { error: null }; },
      };
    },
  };
  let handler;
  const code = source('dispatch-scheduled-push');
  vm.runInNewContext(code.slice(code.indexOf('Deno.serve(async')), {
    Response, Date, console,
    CRON_DISPATCH_SECRET: 'test-secret',
    createServiceRoleClient: () => admin,
    sendPushToUser: async (_admin, userId, payload) => sent.push({ userId, ...payload }),
    Deno: { serve: callback => { handler = callback; } },
  });
  const response = await handler({ headers: new Headers({ Authorization: 'Bearer test-secret' }) });
  assert.equal(response.status, 200);
  assert.deepEqual(sent, [{ userId: 'owner', title: 'Focus', body: 'Done' }]);
  assert.deepEqual(marked, ['timer']);
  assert.equal((await response.json()).dispatched, 1);
});
