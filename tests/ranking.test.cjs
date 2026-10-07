const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');

function setup(rpc) {
  let renders = 0;
  const ctx = vm.createContext({
    console: { warn() {} }, activeAuthUser: { id: 'me' }, farmSessionGeneration: 1,
    supabaseClient: { rpc }, farmLeaderboard: [], farmLeaderboardStatus: 'idle',
    renderFarmRanking() { renders += 1; },
  });
  const match = source.match(/async function loadFarmLeaderboard\([^]*?^\}/m);
  assert.ok(match, 'The scenery leaderboard loader remains available');
  vm.runInContext(match[0], ctx);
  return { ctx, renders: () => renders };
}

test('ranking loads weekly scenery earnings and keeps the current user', async () => {
  const h = setup(async (name, args) => {
    assert.equal(name, 'get_farm_leaderboard');
    assert.deepEqual(JSON.parse(JSON.stringify(args)), {});
    return { data: [
      { rank_position: '1', farm_name: '내 풍경', display_name: '나', earned_farm_money: '150', is_me: true },
      { rank_position: 2, farm_name: '바다', display_name: '친구', earned_farm_money: 100, is_me: false },
    ] };
  });
  await h.ctx.loadFarmLeaderboard();
  assert.equal(h.ctx.farmLeaderboardStatus, 'ready');
  assert.deepEqual(JSON.parse(JSON.stringify(h.ctx.farmLeaderboard)).map(({ rank, farmName, displayName, score, isMe }) =>
    ({ rank, farmName, displayName, score, isMe })), [
    { rank: 1, farmName: '내 풍경', displayName: '나', score: 150, isMe: true },
    { rank: 2, farmName: '바다', displayName: '친구', score: 100, isMe: false },
  ]);
});

test('ranking recovers from a failed request without retaining a loading state', async () => {
  let attempts = 0;
  const h = setup(async () => {
    if (++attempts === 1) throw new Error('offline');
    return { data: [] };
  });
  await h.ctx.loadFarmLeaderboard();
  assert.equal(h.ctx.farmLeaderboardStatus, 'error');
  await h.ctx.loadFarmLeaderboard();
  assert.equal(h.ctx.farmLeaderboardStatus, 'ready');
  assert.equal(h.ctx.farmLeaderboard.length, 0);
});

test('a ranking response from a previous account is ignored', async () => {
  let resolve;
  const h = setup(() => new Promise(done => { resolve = done; }));
  const pending = h.ctx.loadFarmLeaderboard();
  h.ctx.activeAuthUser = { id: 'next-account' };
  h.ctx.farmSessionGeneration += 1;
  h.ctx.farmLeaderboardStatus = 'idle';
  resolve({ data: [{ rank_position: 1, earned_farm_money: 100 }] });
  await pending;
  assert.equal(h.ctx.farmLeaderboard.length, 0);
  assert.equal(h.ctx.farmLeaderboardStatus, 'idle');
});
