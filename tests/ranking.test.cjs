const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('the retired leaderboard has no screen, loader or subscription', () => {
  const app = read('app.js');
  const html = read('index.html');
  assert.doesNotMatch(app, /loadFarmLeaderboard|renderFarmRanking|rpc\(["']get_farm_leaderboard/);
  assert.doesNotMatch(html, /id=["'](?:farmRankingModal|openFarmRanking|farmRankingList)/);
  assert.doesNotMatch(app, /table:\s*["']farm_weekly_earnings["']/);
});

test('public social interaction uses an opt-in snapshot plaza', () => {
  const sql = read('supabase/migrations/095_farm_v3_world.sql');
  assert.match(sql, /revoke all on function public\.get_farm_leaderboard\(date\) from public,anon,authenticated/);
  assert.match(sql, /plaza_public boolean not null default false/);
  assert.match(sql, /where plaza_public order by user_id limit 12/);
  assert.match(read('farm-v3.js'), /rpc\('get_farm_v3_plaza'/);
});
