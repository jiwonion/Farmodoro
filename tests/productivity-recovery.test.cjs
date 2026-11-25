const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const window = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../productivity-recovery.js'), 'utf8'), { window });
const recover = (server, checkpoint) => JSON.parse(JSON.stringify(window.ProductivityRecovery.recover(server, checkpoint)));
const empty = () => ({ groups: [], tasks: [], habits: [], habitRecords: [] });

test('mobile add survives a fresh runtime and merges with tasks from another device', () => {
  const base = empty();
  const snapshot = { ...empty(), tasks: [{ id: 'mobile', title: 'new', status: 'waiting' }] };
  const saved = JSON.parse(JSON.stringify({ base, snapshot }));
  const result = recover({ ...empty(), tasks: [{ id: 'desktop', title: 'other', status: 'done', completion_reward: 1 }] }, saved);
  assert.deepEqual(result.tasks.map(row => row.id), ['desktop', 'mobile']);
  assert.equal(result.tasks[0].completion_reward, 1);
});

test('recovery merges only edited fields and preserves remote completion/rewards', () => {
  const task = { id: 'a', title: 'old', group_id: null, status: 'waiting', focus_seconds: 0 };
  const base = { ...empty(), tasks: [task] };
  const snapshot = { ...empty(), tasks: [{ ...task, title: 'edit', status: 'done', completion_reward: 1 }] };
  const remote = { ...task, status: 'done', completion_reward: 2, focus_seconds: 120 };
  const result = recover({ ...empty(), tasks: [remote] }, { base, snapshot });
  assert.deepEqual(result.tasks, [{ ...remote, title: 'edit' }]);
});

test('remote deletions are not resurrected and persisted local deletes are replayed', () => {
  const old = { id: 'old', title: 'old' }, other = { id: 'other', title: 'other' };
  const base = { ...empty(), tasks: [old, other] };
  const snapshot = { ...empty(), tasks: [{ ...old, title: 'edited' }] };
  const result = recover({ ...empty(), tasks: [other] }, { base, snapshot, deletes: { tasks: ['other'] } });
  assert.deepEqual(result.tasks, []);
});

test('new pending tasks never receive unconfirmed completion, archive or recurrence metadata', () => {
  const snapshot = { ...empty(), tasks: [{ id: 'new', title: 'new', status: 'done', completion_reward: 50, archived_at: 'now', recurrence_id: 'forged' }] };
  assert.deepEqual(recover(empty(), { base: empty(), snapshot }).tasks,
    [{ id: 'new', title: 'new', status: 'waiting', focus_seconds: 0 }]);
});

test('habit completion stays server-owned and orphaned records are removed', () => {
  const base = { ...empty(), habits: [{ id: 'h' }], habitRecords: [{ habit_id: 'h', record_date: '2026-11-25', focus_seconds: 0 }] };
  const snapshot = { ...base, habitRecords: [{ ...base.habitRecords[0], focus_seconds: 60, completed_at: 'fake', completion_reward: 3 }] };
  assert.deepEqual(recover(base, { base, snapshot }).habitRecords, [{ ...base.habitRecords[0], focus_seconds: 60 }]);
  assert.deepEqual(recover(empty(), { base, snapshot }).habitRecords, []);
});
