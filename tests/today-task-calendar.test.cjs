const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const today = '2026-11-25';
function harness(extra = {}) {
  const state = { tasks: [
    { id: 'past', scheduledDate: '2026-11-24', status: 'waiting', groupId: 'work' },
    { id: 'today', scheduledDate: today, status: 'waiting', groupId: 'work' },
    { id: 'future', scheduledDate: '2026-11-26', status: 'waiting', groupId: 'work' },
    { id: 'undated', scheduledDate: '', status: 'waiting', groupId: null },
    { id: 'past-archived', scheduledDate: '2026-11-24', status: 'done', archived: true, groupId: 'work' },
    { id: 'undated-archived', scheduledDate: '', status: 'done', archived: true, groupId: null },
  ] };
  const ctx = vm.createContext({ state, selectedTaskDate: null, currentPage: 'today', taskArchiveView: false,
    taskGroupFilter: 'all', toProductivityDateString: () => today, window: {}, ...extra });
  for (const name of ['getTaskViewDate', 'getVisibleTasks']) {
    vm.runInContext(source.match(new RegExp(`function ${name}\\([^]*?^\\}`, 'm'))[0], ctx);
  }
  return ctx;
}
const ids = (ctx, status = 'waiting') => Array.from(ctx.getVisibleTasks(status), task => task.id);

test('Today shows the calendar date and undated tasks, excluding overdue and future dates', () => {
  const ctx = harness();
  assert.deepEqual(ids(ctx), ['today', 'undated']);
  assert.deepEqual(ids(ctx, 'done'), []);
});

test('a past date includes its archived completion without restoring it or undated archives', () => {
  const ctx = harness({ selectedTaskDate: '2026-11-24' });
  const before = JSON.stringify(ctx.state);
  assert.deepEqual(ids(ctx), ['past', 'undated']);
  assert.deepEqual(ids(ctx, 'done'), ['past-archived']);
  assert.equal(JSON.stringify(ctx.state), before);
});

test('future recurrence previews belong to the selected date and never enter saved tasks', () => {
  const calls = [];
  const ctx = harness({ selectedTaskDate: '2026-11-26', window: { TaskPlanner: {
    eventsFor(date) { calls.push(date); return [{ id: 'recurrence:' + date, scheduledDate: date, groupId: 'work', planned: true }]; },
  } } });
  const before = JSON.stringify(ctx.state);
  assert.deepEqual(ids(ctx), ['future', 'undated', 'recurrence:2026-11-26']);
  assert.deepEqual(ids(ctx, 'done'), []);
  assert.ok(calls.every(date => date === '2026-11-26'));
  assert.equal(JSON.stringify(ctx.state), before);
});

test('group filters apply equally to selected-date tasks, undated tasks and recurrence previews', () => {
  const ctx = harness({ selectedTaskDate: '2026-11-26', window: { TaskPlanner: {
    eventsFor: date => [{ id: 'planned', scheduledDate: date, groupId: 'work', planned: true }],
  } } });
  ctx.taskGroupFilter = 'work';
  assert.deepEqual(ids(ctx), ['future', 'planned']);
  ctx.taskGroupFilter = 'none';
  assert.deepEqual(ids(ctx), ['undated']);
});

test('the all-tasks menu keeps its archive behavior independently of the Today date', () => {
  const ctx = harness({ currentPage: 'tasks', selectedTaskDate: '2026-11-26' });
  assert.deepEqual(ids(ctx), ['past', 'today', 'future', 'undated']);
  ctx.taskArchiveView = true;
  assert.deepEqual(ids(ctx, 'done'), ['past-archived', 'undated-archived']);
});

test('the default view follows the productivity day while a chosen date stays fixed', () => {
  const ctx = harness();
  assert.equal(ctx.getTaskViewDate(), today);
  ctx.toProductivityDateString = () => '2026-11-26';
  assert.equal(ctx.getTaskViewDate(), '2026-11-26');
  ctx.selectedTaskDate = '2026-11-24';
  assert.equal(ctx.getTaskViewDate(), '2026-11-24');
});
