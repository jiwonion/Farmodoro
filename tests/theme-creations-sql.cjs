// Run with PGLITE_MODULE pointing to an installed @electric-sql/pglite package.
// Exercises the actual migration, wallet helpers and RPCs in PostgreSQL.
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const user = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
const db = new PGlite();
const source = name => fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8');
const migration = source('086_theme_creations.sql');
const priceMigration = source('087_scenery_unlock_prices.sql');
const scalar = async (sql, params) => Object.values((await db.query(sql, params)).rows[0])[0];
const number = async (sql, params) => Number(await scalar(sql, params));
const setUser = id => scalar("select set_config('app.test_user',$1,false)", [id || '']);
const state = () => scalar('select public.get_my_scenery_state()');
const start = (type = 'tree', theme = null, request = randomUUID()) => scalar(
  'select public.start_my_scenery_creation($1::text,$2::text,$3::uuid)', [type, theme, request]);
const grow = (id, amount = 1, request = randomUUID()) => scalar(
  'select public.grow_my_scenery_creation($1::uuid,$2::integer,$3::uuid)', [id, amount, request]);
const claim = (id, request = randomUUID()) => scalar(
  'select public.claim_my_scenery_creation($1::uuid,$2::uuid)', [id, request]);
const unlock = (type, request = randomUUID()) => scalar(
  'select public.unlock_my_scenery_type($1::text,$2::uuid)', [type, request]);
const wallet = async () => (await db.query('select coin_balance,farm_money_balance from public.farm_wallets where user_id=$1', [user])).rows[0];
const migrateFunction = async (file, name) => {
  const match = source(file).match(new RegExp(`create or replace function public\\.${name}\\([^]*?\\$\\$;`, 'i'));
  assert.ok(match, `Missing ${name}`);
  await db.exec(match[0]);
};
const retiredSignatures = [
  'buy_and_plant_farm_seed(smallint,text,uuid)', 'plant_farm_seed(smallint,text,uuid)',
  'water_farm_plot(smallint,uuid)', 'grow_farm_plot_with_coin(smallint,uuid)',
  'harvest_farm_plot(smallint,uuid)', 'discard_farm_plot(smallint,uuid)',
  'cook_my_farm_recipe(text,integer,uuid)', 'sell_all_my_farm_food(uuid)',
  'buy_farm_supply(text,uuid)', 'apply_farm_plot_item(smallint,text,uuid)',
  'use_farm_festival_pass(text,uuid)', 'use_farm_free_pass(text,uuid,date,integer,uuid)',
  // Historical overloads are secured too, without requiring their presence.
  'cook_farm_recipe(text[],uuid)', 'sell_farm_food(text,uuid)',
];

(async () => {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    insert into auth.users values('${user}'),('${other}');
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('app.test_user',true),'')::uuid $$;
    grant usage on schema auth to authenticated;
    create publication supabase_realtime;
    create table public.farms (user_id uuid primary key, equipped_farm_theme text, farm_name text default 'My scenery');
    create table public.farm_wallets (user_id uuid primary key,coin_balance bigint not null default 0,farm_money_balance bigint not null default 0);
    create table public.farm_wallet_idempotency (user_id uuid,currency text,reference_key text,primary key(user_id,currency,reference_key));
    create table public.farm_wallet_ledger (user_id uuid,currency text,amount bigint,balance_after bigint,reason text,reference_key text);
    create table public.farm_weekly_earnings (user_id uuid,week_start date,earned_farm_money bigint default 0,primary key(user_id,week_start));
    create table public.farm_inventory (user_id uuid,category text,item_id text,quantity integer,primary key(user_id,category,item_id));
    create table public.farm_plots (user_id uuid,plot_index smallint,crop_id text,growth smallint default 0,primary key(user_id,plot_index));
    create table public.farm_cosmetics (user_id uuid,cosmetic_type text,cosmetic_id text,primary key(user_id,cosmetic_type,cosmetic_id));
    create table public.farm_cosmetic_catalog (cosmetic_type text,cosmetic_id text,price integer,primary key(cosmetic_type,cosmetic_id));
    create table public.farm_action_log (user_id uuid references auth.users(id), request_id uuid, action text, result jsonb,
      created_at timestamptz default now(), primary key(user_id,request_id));
    create table public.farm_action_locks (user_id uuid primary key references auth.users(id));
    create table public.scheduled_push_notifications (id uuid primary key default gen_random_uuid(), user_id uuid,
      kind text, sent_at timestamptz);
    insert into public.scheduled_push_notifications(user_id,kind,sent_at) values
      ('${user}','plot_water_ready',null),('${other}','plot_water_ready',null),
      ('${user}','plot_water_ready',now()),('${user}','timer_end',null),('${other}','timer_end',now());
    create function public.farm_set_bonus_percent(p_user_id uuid,p_effect text) returns integer language sql as $$ select 10 $$;
    alter table public.farm_action_log enable row level security;
    alter table public.farm_action_locks enable row level security;
    revoke all on public.farm_action_log, public.farm_action_locks from public,anon,authenticated;
  `);
  await migrateFunction('006_farm_economy_inventory_mail.sql', 'current_farm_week_start');
  await migrateFunction('041_farm_plot_grid_reduction.sql', 'ensure_farm_user');
  await migrateFunction('037_wallet_and_farm_state_hardening.sql', 'apply_farm_wallet_change');
  for (const name of ['farm_action_begin', 'farm_action_finish']) await migrateFunction('051_farm_catalogs_and_action_log.sql', name);
  await migrateFunction('051_farm_catalogs_and_action_log.sql', 'cleanup_stale_farm_actions');
  await migrateFunction('072_diverse_cosmetic_set_effects.sql', 'farm_set_effect_triggers');
  for (const name of ['lock_my_farm_actions', 'begin_my_farm_action']) await migrateFunction('078_retire_farm_decorations.sql', name);
  await db.exec(`revoke all on function public.apply_farm_wallet_change(uuid,text,bigint,text,text),
    public.farm_action_begin(uuid,uuid,text),public.farm_action_finish(uuid,uuid,jsonb),
    public.lock_my_farm_actions(uuid),public.begin_my_farm_action(uuid,uuid,text) from public,anon,authenticated`);
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const context = vm.createContext({});
  vm.runInContext(app.match(/const FARM_THEMES = [\s\S]*?;\r?\n/)[0], context);
  const themes = vm.runInContext('FARM_THEMES.map(t=>t.id).filter(id => !["space", "tuxedoCat"].includes(id))', context);
  for (const theme of themes) await db.query("insert into public.farm_cosmetic_catalog values('farm_theme',$1,2000)", [theme]);
  for (const signature of retiredSignatures) {
    const [, name, parameters] = signature.match(/^(\w+)\(([^]*)\)$/);
    await db.exec(`create function public.${name}(${parameters}) returns jsonb language sql as $$select '{}'::jsonb$$;
      grant execute on function public.${signature} to authenticated,anon`);
  }
  // Preserve productivity RPC grants while retiring former production paths.
  await db.exec("create function public.complete_my_task(uuid,boolean) returns jsonb language sql as $$select '{}'::jsonb$$; grant execute on function public.complete_my_task(uuid,boolean) to authenticated");
  await setUser(user);
  for (const id of [user, other]) await scalar('select public.ensure_farm_user($1::uuid)', [id]);
  await db.query('update public.farm_wallets set coin_balance=200,farm_money_balance=1000 where user_id=$1', [user]);
  await db.query("insert into public.farm_inventory values($1,'food','countryStew',3),($1,'harvest','carrot',7),($1,'supply','freePass',1)", [user]);
  await db.query("update public.farm_plots set crop_id='carrot',growth=2 where user_id=$1 and plot_index=0", [user]);
  const legacyBefore = await db.query('select * from public.farm_inventory order by category,item_id');
  const plotsBefore = await db.query('select * from public.farm_plots order by user_id,plot_index');
  const walletsBefore = await db.query('select * from public.farm_wallets order by user_id');
  const timerNotificationsBefore = await db.query("select * from public.scheduled_push_notifications where kind='timer_end' order by user_id");
  const deliveredWaterBefore = await db.query("select * from public.scheduled_push_notifications where kind='plot_water_ready' and sent_at is not null");
  await db.exec(migration);
  assert.deepEqual((await db.query('select * from public.farm_inventory order by category,item_id')).rows, legacyBefore.rows);
  assert.deepEqual((await db.query('select * from public.farm_plots order by user_id,plot_index')).rows, plotsBefore.rows);
  assert.deepEqual((await db.query('select * from public.farm_wallets order by user_id')).rows, walletsBefore.rows);
  assert.equal(await number("select count(*) from public.scheduled_push_notifications where kind='plot_water_ready' and sent_at is null"), 0);
  assert.deepEqual((await db.query("select * from public.scheduled_push_notifications where kind='timer_end' order by user_id")).rows, timerNotificationsBefore.rows);
  assert.deepEqual((await db.query("select * from public.scheduled_push_notifications where kind='plot_water_ready' and sent_at is not null")).rows, deliveredWaterBefore.rows);
  for (const effect of ['focusCoinDouble','harvestDouble','saleDouble','water','wilt','cookDouble']) {
    assert.equal(await scalar('select public.farm_set_bonus_percent($1,$2)', [user,effect]), 0);
    assert.equal(await scalar('select public.farm_set_effect_triggers($1,$2)', [user,effect]), false);
  }

  const initial = await state();
  assert.equal(initial.activeCreation, null);
  assert.deepEqual(initial.completedTypes, []);
  assert.equal(initial.totalCompleted, 0);
  assert.equal(initial.catalog.length, 14);
  assert.deepEqual(initial.unlockedTypes, ['cactus', 'coral', 'crystal', 'snowman', 'star', 'tree']);
  assert.ok(initial.catalog.every(t => t.growthCost === 20 && t.reward === 50));
  assert.equal(initial.catalog.filter(t => t.unlockPrice > 0).length, 8);
  assert.ok(initial.catalog.every(t => t.unlockPrice === (initial.unlockedTypes.includes(t.id) ? 0 : 300)));
  await assert.rejects(start('unknown'), /SCENERY_UNKNOWN_TYPE/);
  await assert.rejects(start('blossomTree'), /SCENERY_TYPE_LOCKED/);
  await assert.rejects(start('coral', 'ocean'), /SCENERY_THEME_NOT_OWNED/);
  await assert.rejects(start('tree', 'unknown'), /SCENERY_THEME_NOT_OWNED/);
  await assert.rejects(start('tree', null, null), /FARM_INVALID_REQUEST_ID/);
  for (const theme of themes) await db.query("insert into public.farm_cosmetics values($1,'farm_theme',$2)", [user,theme]);
  await assert.rejects(start('tree', 'ocean'), /SCENERY_THEME_MISMATCH/);
  await assert.rejects(start('coral', null), /SCENERY_THEME_MISMATCH/);
  // A bogus historic ownership row never authorizes a nonexistent theme.
  await db.query("insert into public.farm_cosmetics values($1,'farm_theme','unknown')", [user]);
  await assert.rejects(start('tree', 'unknown'), /SCENERY_THEME_NOT_OWNED/);

  const startId = randomUUID();
  const planted = await start('coral', 'ocean', startId);
  const creation = planted.scenery.activeCreation;
  assert.equal(creation.typeId, 'coral');
  assert.equal(creation.themeId, 'ocean');
  assert.equal(creation.progress, 0);
  assert.equal(planted.wallet.coinBalance, 200);
  assert.deepEqual(await start('coral', 'ocean', startId), planted);
  await assert.rejects(unlock('pinkCoral', startId), /FARM_REQUEST_ID_REUSED/);
  await assert.rejects(start('tree'), /SCENERY_ALREADY_ACTIVE/);
  // The DB constraint remains effective for direct or future internal writers.
  await assert.rejects(db.query('insert into public.farm_scenery_creations(user_id,type_id,growth_cost,reward) values($1,$2,20,50)', [user,'tree']), /farm_scenery_one_active_per_user/);
  await assert.rejects(db.query('update public.farm_scenery_creations set progress=21 where id=$1', [creation.id]), /farm_scenery_progress_range/);
  await assert.rejects(db.query('update public.farm_scenery_creations set claimed_at=now() where id=$1', [creation.id]), /farm_scenery_claim_requires_complete/);
  await assert.rejects(claim(creation.id), /SCENERY_NOT_COMPLETE/);
  for (const amount of [null, 0, -1, 101]) await assert.rejects(grow(creation.id, amount), /SCENERY_INVALID_AMOUNT/);
  await assert.rejects(grow(randomUUID()), /SCENERY_CREATION_NOT_FOUND/);
  await assert.rejects(claim(randomUUID()), /SCENERY_CREATION_NOT_FOUND/);
  await db.query('update public.farms set equipped_farm_theme=$2 where user_id=$1', [user,'christmas']);
  assert.equal((await state()).activeCreation.themeId, 'ocean', 'An active object retains its original scenery');
  // Server catalog changes do not alter an already started creation.
  await db.exec("update public.farm_scenery_catalog set growth_cost=30,reward=70 where type_id='coral'");
  assert.equal((await state()).activeCreation.growthCost, 20);
  assert.equal((await state()).activeCreation.reward, 50);
  await db.exec("update public.farm_scenery_catalog set growth_cost=20,reward=50 where type_id='coral'");

  await db.query('update public.farm_wallets set coin_balance=0 where user_id=$1', [user]);
  const poorGrowthId = randomUUID();
  await assert.rejects(grow(creation.id, 1, poorGrowthId), /FARM_INSUFFICIENT_COIN/);
  assert.equal((await state()).activeCreation.progress, 0);
  assert.equal(await number('select count(*) from public.farm_action_log where request_id=$1', [poorGrowthId]), 0);
  await db.query('update public.farm_wallets set coin_balance=-2 where user_id=$1', [user]);
  await assert.rejects(grow(creation.id), /FARM_INSUFFICIENT_COIN/);
  await db.query('update public.farm_wallets set coin_balance=200 where user_id=$1', [user]);
  const grown = await grow(creation.id, 7, poorGrowthId);
  assert.equal(grown.event.spentCoin, 7);
  assert.equal(grown.scenery.activeCreation.progress, 7);
  assert.equal(grown.wallet.coinBalance, 193);
  assert.deepEqual(await grow(creation.id, 7, poorGrowthId), grown);
  const growthFailureId = randomUUID();
  await db.exec(`alter table public.farm_wallets add constraint test_growth_failure check(user_id<>'${user}' or (coin_balance=0 and farm_money_balance=0) or coin_balance>=193)`);
  await assert.rejects(grow(creation.id, 1, growthFailureId), /test_growth_failure/);
  assert.equal((await state()).activeCreation.progress, 7);
  await db.exec('alter table public.farm_wallets drop constraint test_growth_failure');
  assert.equal((await grow(creation.id, 1, growthFailureId)).scenery.activeCreation.progress, 8);
  const maxGrowthId = randomUUID();
  const complete = await grow(creation.id, 100, maxGrowthId);
  assert.equal(complete.event.spentCoin, 12, 'Overgrowth only charges remaining Coin');
  assert.equal(complete.event.completed, true);
  assert.equal(complete.wallet.coinBalance, 180);
  assert.deepEqual(await grow(creation.id, 100, maxGrowthId), complete);
  await assert.rejects(grow(creation.id), /SCENERY_ALREADY_COMPLETE/);

  // Cross-account guessed IDs and ownership are never accepted.
  await setUser(other);
  await assert.rejects(grow(creation.id), /SCENERY_CREATION_NOT_FOUND/);
  await assert.rejects(claim(creation.id), /SCENERY_CREATION_NOT_FOUND/);
  await assert.rejects(start('coral', 'ocean'), /SCENERY_THEME_NOT_OWNED/);
  assert.equal((await state()).activeCreation, null);
  await db.query("insert into public.farm_cosmetics values($1,'farm_theme','ocean')", [other]);
  await assert.rejects(start('pinkCoral', 'ocean'), /SCENERY_TYPE_LOCKED/);
  await db.query('update public.farm_wallets set farm_money_balance=299 where user_id=$1', [other]);
  const boundaryUnlockId = randomUUID();
  await assert.rejects(unlock('blossomTree', boundaryUnlockId), /FARM_INSUFFICIENT_FARM_MONEY/);
  await db.query('update public.farm_wallets set farm_money_balance=300 where user_id=$1', [other]);
  const boundaryUnlock = await unlock('blossomTree', boundaryUnlockId);
  assert.equal(boundaryUnlock.event.unlockPrice, 300);
  assert.equal(boundaryUnlock.wallet.farmMoneyBalance, 0);
  const otherCreation = (await start()).scenery.activeCreation.id;
  await setUser(user);
  await assert.rejects(grow(otherCreation), /SCENERY_CREATION_NOT_FOUND/);
  assert.equal((await state()).unlockedTypes.includes('blossomTree'), false, 'Another account unlock never grants this account ownership');

  // Upgrading the earlier 100 Farm Money catalog only changes future prices.
  // Owned types, both wallets and active creations survive repeated application.
  const priceUpdateBefore = {
    wallets: (await db.query('select * from public.farm_wallets order by user_id')).rows,
    unlocked: (await db.query('select * from public.farm_scenery_unlocked_types order by user_id,type_id')).rows,
    creations: (await db.query('select * from public.farm_scenery_creations order by id')).rows,
    catalog: (await db.query('select type_id,name,family,variant,growth_cost,reward from public.farm_scenery_catalog order by type_id')).rows,
  };
  await db.exec('update public.farm_scenery_catalog set unlock_price=100 where unlock_price>0');
  assert.equal(await number('select count(*) from public.farm_scenery_catalog where unlock_price=100'), 8);
  await db.exec(priceMigration);
  assert.equal(await number('select count(*) from public.farm_scenery_catalog where unlock_price=300'), 8);
  assert.equal(await number('select count(*) from public.farm_scenery_catalog where unlock_price=0'), 6);
  await db.exec(priceMigration);
  assert.deepEqual((await db.query('select * from public.farm_wallets order by user_id')).rows, priceUpdateBefore.wallets);
  assert.deepEqual((await db.query('select * from public.farm_scenery_unlocked_types order by user_id,type_id')).rows, priceUpdateBefore.unlocked);
  assert.deepEqual((await db.query('select * from public.farm_scenery_creations order by id')).rows, priceUpdateBefore.creations);
  assert.deepEqual((await db.query('select type_id,name,family,variant,growth_cost,reward from public.farm_scenery_catalog order by type_id')).rows, priceUpdateBefore.catalog);

  // Reward failure rolls back the history claim, money and UUID reservation.
  const claimId = randomUUID();
  await db.exec('alter table public.farm_wallets add constraint test_reward_failure check(farm_money_balance<=1000)');
  await assert.rejects(claim(creation.id, claimId), /test_reward_failure/);
  assert.equal((await state()).activeCreation.id, creation.id);
  assert.equal((await state()).totalCompleted, 0);
  assert.equal(await number('select count(*) from public.farm_action_log where request_id=$1', [claimId]), 0);
  await db.exec('alter table public.farm_wallets drop constraint test_reward_failure');
  const claimed = await claim(creation.id, claimId);
  assert.equal(claimed.wallet.farmMoneyBalance, 1050);
  assert.equal(claimed.weeklyFarmMoneyEarned, 50);
  assert.equal(claimed.scenery.activeCreation, null);
  assert.deepEqual(claimed.scenery.completedTypes, [{typeId:'coral',count:1}]);
  assert.equal(claimed.scenery.totalCompleted, 1);
  assert.deepEqual(await claim(creation.id, claimId), claimed);
  await assert.rejects(claim(creation.id), /SCENERY_ALREADY_CLAIMED/);
  await db.query('delete from public.farm_action_log where request_id=$1', [claimId]);
  await db.query("delete from public.farm_wallet_idempotency where reference_key=$1", [`scenery-claim:${creation.id}`]);
  await assert.rejects(claim(creation.id, claimId), /SCENERY_ALREADY_CLAIMED/);
  assert.equal(Number((await wallet()).farm_money_balance), 1050, 'Persisted creation prevents repeated rewards after log cleanup');
  await assert.rejects(grow(creation.id), /SCENERY_CREATION_NOT_FOUND/);

  // Unlock is permanent, once-only and never changes the weekly earned total.
  await assert.rejects(unlock('unknown'), /SCENERY_UNKNOWN_TYPE/);
  await db.query('update public.farm_wallets set farm_money_balance=299 where user_id=$1', [user]);
  const unlockId = randomUUID();
  await assert.rejects(unlock('pinkCoral', unlockId), /FARM_INSUFFICIENT_FARM_MONEY/);
  assert.equal((await state()).unlockedTypes.includes('pinkCoral'), false);
  await db.query('update public.farm_wallets set farm_money_balance=1000 where user_id=$1', [user]);
  await db.exec(`alter table public.farm_wallets add constraint test_unlock_failure check(user_id<>'${user}' or (coin_balance=0 and farm_money_balance=0) or farm_money_balance>=1000)`);
  await assert.rejects(unlock('pinkCoral', unlockId), /test_unlock_failure/);
  assert.equal((await state()).unlockedTypes.includes('pinkCoral'), false);
  await db.exec('alter table public.farm_wallets drop constraint test_unlock_failure');
  const unlocked = await unlock('pinkCoral', unlockId);
  assert.equal(unlocked.wallet.farmMoneyBalance, 700);
  assert.equal(unlocked.event.unlockPrice, 300);
  assert.equal(unlocked.weeklyFarmMoneyEarned, 50);
  assert.equal(unlocked.event.alreadyUnlocked, false);
  assert.equal(unlocked.scenery.unlockedTypes.includes('pinkCoral'), true);
  assert.deepEqual(await unlock('pinkCoral', unlockId), unlocked);
  assert.equal((await unlock('pinkCoral')).event.alreadyUnlocked, true);
  assert.equal(Number((await wallet()).farm_money_balance), 700);
  assert.equal((await unlock('tree')).event.unlockPrice, 0);
  const pink = (await start('pinkCoral', 'ocean')).scenery.activeCreation.id;
  await grow(pink, 100);
  const pinkClaimId = randomUUID();
  const pinkClaimed = await claim(pink, pinkClaimId);
  assert.equal((await start('pinkCoral', 'ocean')).scenery.activeCreation.typeId, 'pinkCoral', 'Purchased variants repeat without another unlock payment');
  const pinkAgain = (await state()).activeCreation.id;
  // A cached event proves the original operation already happened. Its old
  // snapshot cannot overwrite a later device's creation or wallet balances.
  const beforeReplayState = await state();
  const beforeReplayWallet = await wallet();
  const beforeReplayLedger = await number('select count(*) from public.farm_wallet_ledger');
  const beforeCleanupCount = await number("select count(*) from public.farm_action_log where action like '%scenery%'");
  await db.exec("update public.farm_action_log set created_at=now()-interval '100 days' where action like '%scenery%'");
  const staleLegacyId = randomUUID();
  const freshLegacyId = randomUUID();
  await db.query("insert into public.farm_action_log(user_id,request_id,action,result,created_at) values($1,$2,'cook_my_farm_recipe','{}',now()-interval '2 days'),($1,$3,'cook_my_farm_recipe','{}',now())", [user,staleLegacyId,freshLegacyId]);
  await scalar('select public.cleanup_stale_farm_actions()');
  assert.equal(await number("select count(*) from public.farm_action_log where action like '%scenery%'"), beforeCleanupCount, 'Scenery idempotency records survive the actual cleanup helper');
  assert.equal(await number('select count(*) from public.farm_action_log where request_id=$1', [staleLegacyId]), 0);
  assert.equal(await number('select count(*) from public.farm_action_log where request_id=$1', [freshLegacyId]), 1);
  // Even after the independent wallet dedupe entries are aged out, retained
  // action results prevent an old Coin payment from being issued again.
  await db.exec("delete from public.farm_wallet_idempotency where reference_key like 'scenery-%'");
  const cachedReplays = [
    await start('coral', 'ocean', startId),
    await grow(creation.id, 7, poorGrowthId),
    await claim(pink, pinkClaimId),
    await unlock('pinkCoral', unlockId),
  ];
  for (const replay of cachedReplays) {
    assert.deepEqual(replay.scenery, beforeReplayState);
    assert.equal(replay.wallet.coinBalance, Number(beforeReplayWallet.coin_balance));
    assert.equal(replay.wallet.farmMoneyBalance, Number(beforeReplayWallet.farm_money_balance));
    assert.equal(replay.weeklyFarmMoneyEarned, 100);
  }
  assert.deepEqual(cachedReplays.map(replay => replay.event), [planted.event, grown.event, pinkClaimed.event, unlocked.event]);
  assert.equal(await number('select count(*) from public.farm_wallet_ledger'), beforeReplayLedger);
  assert.equal(await number('select count(*) from public.farm_scenery_creations where user_id=$1 and claimed_at is null', [user]), 1);
  await grow(pinkAgain, 100);
  await claim(pinkAgain);
  assert.equal((await grow(creation.id, 7, poorGrowthId)).scenery.activeCreation, null, 'An old growth retry cannot resurrect a claimed creation');

  // Every current theme has its own free baseline; default themes use trees.
  const baseline = theme => ['ocean','bubbleField'].includes(theme) ? 'coral'
    : ['iceKingdom','christmas'].includes(theme) ? 'snowman'
    : ['galaxyNight','moonGarden'].includes(theme) ? 'star'
    : ['volcano','auroraNight'].includes(theme) ? 'crystal'
    : theme === 'desertOasis' ? 'cactus' : 'tree';
  await db.query('update public.farm_wallets set coin_balance=2000 where user_id=$1', [user]);
  for (const theme of [null, ...themes]) {
    const created = await start(baseline(theme), theme);
    assert.equal(created.scenery.activeCreation.themeId, theme);
    await grow(created.scenery.activeCreation.id, 100);
    await claim(created.scenery.activeCreation.id);
  }
  const completions = await state();
  assert.equal(completions.totalCompleted, 3 + themes.length + 1);
  assert.equal(completions.completedTypes.find(t=>t.typeId==='pinkCoral').count, 2);

  // PGlite queues calls on one engine. Promise races exercise RPC outcomes;
  // the partial unique index and FOR UPDATE helpers enforce multi-session safety.
  const racingStarts = await Promise.allSettled([start(), start()]);
  assert.equal(racingStarts.filter(r=>r.status==='fulfilled').length, 1);
  assert.match(racingStarts.find(r=>r.status==='rejected').reason.message, /SCENERY_ALREADY_ACTIVE/);
  const racingCreation = (await state()).activeCreation.id;
  await db.query('update public.farm_wallets set coin_balance=20 where user_id=$1', [user]);
  const racingGrowth = await Promise.allSettled([grow(racingCreation, 100), grow(racingCreation, 100)]);
  assert.equal(racingGrowth.filter(r=>r.status==='fulfilled').length, 1);
  assert.equal(Number((await wallet()).coin_balance), 0, 'The remaining cost, rather than the requested amount, determines affordability');
  const balanceBeforeRace = Number((await wallet()).farm_money_balance);
  const racingClaims = await Promise.allSettled([claim(racingCreation), claim(racingCreation)]);
  assert.equal(racingClaims.filter(r=>r.status==='fulfilled').length, 1);
  assert.equal(Number((await wallet()).farm_money_balance), balanceBeforeRace + 50);
  assert.match(await scalar("select pg_get_functiondef('public.lock_my_farm_actions(uuid)'::regprocedure)"), /for update/i);
  const repeatStartId = randomUUID();
  const repeatingStarts = await Promise.all([start('tree', null, repeatStartId), start('tree', null, repeatStartId)]);
  assert.deepEqual(repeatingStarts[0], repeatingStarts[1]);

  // Role checks use actual RLS: own reads work, foreign rows are hidden, and
  // clients cannot write catalog prices, progress, unlocks, or claim markers.
  await db.exec('set role authenticated');
  assert.equal(await number('select count(*) from public.farm_scenery_creations where user_id=$1', [other]), 0);
  assert.ok(await number('select count(*) from public.farm_scenery_creations where user_id=$1', [user]) > 0);
  assert.equal(await number('select count(*) from public.farm_scenery_unlocked_types where user_id=$1', [other]), 0);
  assert.equal((await state()).activeCreation.typeId, 'tree');
  await assert.rejects(db.exec('update public.farm_scenery_catalog set reward=9999'), /permission denied/);
  await assert.rejects(db.exec('update public.farm_scenery_creations set progress=growth_cost'), /permission denied/);
  await assert.rejects(db.query('insert into public.farm_scenery_unlocked_types(user_id,type_id) values($1,$2)', [user,'planet']), /permission denied/);
  await db.exec('reset role');
  for (const signature of retiredSignatures) {
    for (const role of ['anon','authenticated']) assert.equal(await scalar('select has_function_privilege($1,$2,$3)', [role,`public.${signature}`,'EXECUTE']), false, `${role} cannot call retired ${signature}`);
  }
  assert.equal(await scalar("select has_function_privilege('authenticated','public.complete_my_task(uuid,boolean)','EXECUTE')"), true);
  for (const signature of ['get_my_scenery_state()', 'start_my_scenery_creation(text,text,uuid)', 'grow_my_scenery_creation(uuid,integer,uuid)', 'claim_my_scenery_creation(uuid,uuid)', 'unlock_my_scenery_type(text,uuid)']) {
    assert.equal(await scalar('select has_function_privilege($1,$2,$3)', ['authenticated',`public.${signature}`,'EXECUTE']), true);
    assert.equal(await scalar('select has_function_privilege($1,$2,$3)', ['anon',`public.${signature}`,'EXECUTE']), false);
  }
  for (const signature of ['farm_scenery_state_json(uuid)','farm_scenery_result_json(uuid,jsonb)','farm_scenery_allowed_types(text)','lock_my_farm_actions(uuid)','begin_my_farm_action(uuid,uuid,text)']) {
    assert.equal(await scalar('select has_function_privilege($1,$2,$3)', ['authenticated',`public.${signature}`,'EXECUTE']), false);
  }
  for (const signature of ['cleanup_stale_farm_actions()', 'farm_set_bonus_percent(uuid,text)']) {
    for (const role of ['anon','authenticated']) assert.equal(await scalar('select has_function_privilege($1,$2,$3)', [role,`public.${signature}`,'EXECUTE']), false);
  }
  assert.deepEqual((await db.query("select tablename from pg_publication_tables where pubname='supabase_realtime' order by tablename")).rows.map(r=>r.tablename), ['farm_scenery_creations','farm_scenery_unlocked_types']);

  const stateBeforeReapply = await state();
  const walletBeforeReapply = await wallet();
  await db.exec(migration);
  await db.exec(priceMigration);
  assert.deepEqual(await state(), stateBeforeReapply);
  assert.deepEqual(await wallet(), walletBeforeReapply);
  assert.deepEqual((await db.query('select * from public.farm_inventory order by category,item_id')).rows, legacyBefore.rows);

  // 088 adds distinct free primaries to all 18 owned themes plus the default,
  // preserving the older catalog, ownership, wallet and actively growing IDs.
  const themeMigration = source('088_theme_specific_creations.sql');
  const primaries = {
    cherryBlossom: 'cherryTree', goldenHarvest: 'goldenWheat', springMeadow: 'tulipPatch',
    lavenderField: 'lavenderPatch', valentine: 'heartRose', halloween: 'jackOLantern',
    christmas: 'christmasTree', whiteDay: 'candyBouquet', peperoDay: 'biscuitTower',
    bubbleField: 'bubbleFountain', rainyGarden: 'mushroomGarden', volcano: 'volcanoCrystal',
    galaxyNight: 'galaxyPlanet', auroraNight: 'auroraCrystal', moonGarden: 'moonFlower',
    ocean: 'coral', iceKingdom: 'snowman', desertOasis: 'cactus',
  };
  const newNames = {
    cherryTree: '벚꽃나무', goldenWheat: '황금 이삭 무리', tulipPatch: '튤립 꽃밭',
    lavenderPatch: '라벤더 무리', heartRose: '하트 장미 덩굴', jackOLantern: '잭오랜턴',
    christmasTree: '크리스마스 트리', candyBouquet: '사탕 꽃다발', biscuitTower: '초콜릿 과자 탑',
    bubbleFountain: '거품 분수', mushroomGarden: '버섯 정원', volcanoCrystal: '용암 수정',
    galaxyPlanet: '작은 행성', auroraCrystal: '오로라 수정', moonFlower: '달빛 꽃',
  };
  assert.equal(Object.keys(primaries).length, themes.length);
  assert.equal(new Set(['tree', ...Object.values(primaries)]).size, 19);
  const oldAllowed = new Map();
  for (const theme of [null, ...themes]) oldAllowed.set(theme, await scalar('select public.farm_scenery_allowed_types($1)', [theme]));
  await db.query('update public.farm_wallets set coin_balance=5000 where user_id=$1', [user]);
  await grow((await state()).activeCreation.id, 100);
  await claim((await state()).activeCreation.id);
  const legacyTree = (await start('tree', 'cherryBlossom')).scenery.activeCreation;
  await grow(legacyTree.id, 7);
  const upgradeBefore = await state();
  const upgradeWalletBefore = await wallet();
  const upgradeRowsBefore = await db.query('select * from public.farm_scenery_creations order by user_id,id');
  const upgradeUnlocksBefore = await db.query('select * from public.farm_scenery_unlocked_types order by user_id,type_id');
  const upgradeCosmeticsBefore = await db.query('select * from public.farm_cosmetics order by user_id,cosmetic_type,cosmetic_id');
  const upgradeCatalogBefore = await db.query('select * from public.farm_scenery_catalog order by type_id');
  const upgradeLedgerBefore = await db.query('select * from public.farm_wallet_ledger order by user_id,reference_key');
  await db.exec(themeMigration);
  const upgraded = await state();
  assert.equal(upgraded.catalog.length, 29);
  assert.equal(upgraded.catalog.filter(item=>item.unlockPrice===0).length, 21);
  assert.equal(upgraded.catalog.filter(item=>item.unlockPrice===300).length, 8);
  assert.deepEqual(upgraded.activeCreation, upgradeBefore.activeCreation);
  assert.equal(upgraded.activeCreation.progress, 7);
  assert.equal(upgraded.activeCreation.typeId, 'tree', 'Old cherry-theme trees retain their original identity');
  assert.deepEqual(upgraded.completedTypes, upgradeBefore.completedTypes);
  assert.equal(upgraded.totalCompleted, upgradeBefore.totalCompleted);
  assert.deepEqual(await wallet(), upgradeWalletBefore);
  assert.deepEqual((await db.query('select * from public.farm_scenery_creations order by user_id,id')).rows, upgradeRowsBefore.rows);
  assert.deepEqual((await db.query('select * from public.farm_scenery_unlocked_types order by user_id,type_id')).rows, upgradeUnlocksBefore.rows);
  assert.deepEqual((await db.query('select * from public.farm_cosmetics order by user_id,cosmetic_type,cosmetic_id')).rows, upgradeCosmeticsBefore.rows);
  assert.deepEqual((await db.query('select * from public.farm_wallet_ledger order by user_id,reference_key')).rows, upgradeLedgerBefore.rows);
  assert.deepEqual((await db.query('select * from public.farm_scenery_catalog where not (type_id=any($1::text[])) order by type_id', [Object.keys(newNames)])).rows, upgradeCatalogBefore.rows);
  for (const [id,name] of Object.entries(newNames)) {
    const item = upgraded.catalog.find(type=>type.id===id);
    assert.deepEqual(item, {id,name,family:id,variant:0,unlockPrice:0,growthCost:20,reward:50});
    assert.ok(upgraded.unlockedTypes.includes(id), `${id} starts freely after its theme is owned`);
  }
  for (const theme of [null, ...themes]) {
    const allowed = await scalar('select public.farm_scenery_allowed_types($1)', [theme]);
    const primary = primaries[theme] || 'tree';
    assert.equal(allowed[0], primary);
    assert.equal(allowed.length, new Set(allowed).size, `${theme || 'default'} has no repeated allowed type`);
    assert.deepEqual(allowed, [primary, ...oldAllowed.get(theme).filter(id=>id!==primary)]);
  }
  await assert.rejects(start('cherryTree', 'cherryBlossom'), /SCENERY_ALREADY_ACTIVE/);
  assert.equal((await grow(legacyTree.id, 100)).event.spentCoin, 13);
  await claim(legacyTree.id);
  assert.equal((await state()).completedTypes.find(entry=>entry.typeId==='tree').count,
    upgradeBefore.completedTypes.find(entry=>entry.typeId==='tree').count + 1);
  assert.equal((await state()).completedTypes.some(entry=>entry.typeId==='cherryTree'), false,
    'Legacy tree completion is never relabeled as a new themed type');

  // New free IDs do not grant theme ownership or bypass per-theme matching.
  await setUser(other);
  await assert.rejects(start('cherryTree', 'cherryBlossom'), /SCENERY_THEME_NOT_OWNED/);
  await assert.rejects(start('cherryTree', 'ocean'), /SCENERY_THEME_MISMATCH/);
  await assert.rejects(start('cherryTree', null), /SCENERY_THEME_MISMATCH/);
  await setUser(user);
  for (const theme of [null, ...themes]) {
    const id = primaries[theme] || 'tree';
    const beforeStartWallet = await wallet();
    const created = await start(id, theme);
    assert.equal(created.scenery.activeCreation.typeId, id);
    assert.equal(created.scenery.activeCreation.themeId, theme);
    assert.deepEqual(await wallet(), beforeStartWallet, `${id} requires no upfront Coin or Farm Money`);
    assert.equal(created.scenery.activeCreation.growthCost, 20);
    assert.equal(created.scenery.activeCreation.reward, 50);
    const grown = await grow(created.scenery.activeCreation.id, 5);
    assert.equal(grown.scenery.activeCreation.progress, 5);
    assert.equal(grown.event.spentCoin, 5);
    await grow(created.scenery.activeCreation.id, 100);
    const completed = await claim(created.scenery.activeCreation.id);
    assert.equal(completed.event.reward, 50);
    assert.equal(completed.wallet.coinBalance, Number(beforeStartWallet.coin_balance) - 20);
    assert.equal(completed.wallet.farmMoneyBalance, Number(beforeStartWallet.farm_money_balance) + 50);
  }
  const newHistory = await state();
  for (const id of Object.keys(newNames)) assert.equal(newHistory.completedTypes.find(entry=>entry.typeId===id)?.count, 1);
  const newLegacyChoice = (await start('tree', 'cherryBlossom')).scenery.activeCreation.id;
  await grow(newLegacyChoice, 4);
  const themedReapplyBefore = await state();
  const themedReapplyWallet = await wallet();
  const themedReapplyUnlocks = await db.query('select * from public.farm_scenery_unlocked_types order by user_id,type_id');
  await db.exec(themeMigration);
  assert.deepEqual(await state(), themedReapplyBefore, '088 can be reapplied with an active legacy alternative without changing state');
  assert.deepEqual(await wallet(), themedReapplyWallet);
  assert.deepEqual((await db.query('select * from public.farm_scenery_unlocked_types order by user_id,type_id')).rows, themedReapplyUnlocks.rows);
  // 090 adds purchasable themes and a matching tree or cat. Upgrades and retries
  // preserve ongoing growth, balances, permanent ownership and completion logs.
  const additionsMigration = source('090_space_and_tuxedo_cat_scenery.sql');
  const ownershipBeforeAdditions = await db.query('select * from public.farm_cosmetics order by user_id,cosmetic_type,cosmetic_id');
  await db.exec(additionsMigration);
  assert.deepEqual(await wallet(), themedReapplyWallet);
  assert.deepEqual((await db.query('select * from public.farm_cosmetics order by user_id,cosmetic_type,cosmetic_id')).rows, ownershipBeforeAdditions.rows);
  const additionsState = await state();
  assert.deepEqual(additionsState.activeCreation, themedReapplyBefore.activeCreation);
  assert.deepEqual(additionsState.completedTypes, themedReapplyBefore.completedTypes);
  assert.equal(additionsState.catalog.length, 31);
  assert.equal(additionsState.catalog.filter(item => !item.unlockPrice).length, 23);
  for (const theme of [null, ...themes]) assert.deepEqual(await scalar('select public.farm_scenery_allowed_types($1)', [theme]),
    [primaries[theme] || 'tree', ...oldAllowed.get(theme).filter(id => id !== (primaries[theme] || 'tree'))]);
  await db.exec(additionsMigration);
  assert.deepEqual(await state(), additionsState, '090 can be reapplied during growth');
  await grow(newLegacyChoice, 100); await claim(newLegacyChoice);
  await migrateFunction('089_retire_legacy_farm_and_mail.sql', 'purchase_farm_cosmetic');
  await migrateFunction('089_retire_legacy_farm_and_mail.sql', 'equip_farm_cosmetic');
  await db.query('update public.farm_wallets set coin_balance=100,farm_money_balance=10000 where user_id=$1', [user]);
  for (const [theme, typeId] of [['space', 'spaceTree'], ['tuxedoCat', 'tuxedoCat']]) {
    assert.equal(await number("select price from public.farm_cosmetic_catalog where cosmetic_type='farm_theme' and cosmetic_id=$1", [theme]), 2000);
    assert.equal((await scalar('select public.farm_scenery_allowed_types($1)', [theme]))[0], typeId);
    await setUser(other);
    await assert.rejects(start(typeId, theme), /SCENERY_THEME_NOT_OWNED/);
    await setUser(user);
    const beforePurchase = await wallet();
    await assert.rejects(scalar("select public.purchase_farm_cosmetic('farm_theme',$1,1)", [theme]), /FARM_COSMETIC_PRICE_CHANGED/);
    assert.deepEqual(await wallet(), beforePurchase);
    await scalar("select public.purchase_farm_cosmetic('farm_theme',$1,2000)", [theme]);
    assert.equal(Number((await wallet()).farm_money_balance), Number(beforePurchase.farm_money_balance) - 2000);
    assert.equal(await scalar('select equipped_farm_theme from public.farms where user_id=$1', [user]), theme);
    await assert.rejects(scalar("select public.purchase_farm_cosmetic('farm_theme',$1,2000)", [theme]), /Cosmetic already owned/);
    await assert.rejects(start(typeId, 'ocean'), /SCENERY_THEME_MISMATCH/);
    const created = (await start(typeId, theme)).scenery.activeCreation;
    assert.equal(created.growthCost, 20); assert.equal(created.reward, 50);
    const beforeGrowth = await wallet();
    await scalar("select public.equip_farm_cosmetic('farm_theme','cherryBlossom')");
    assert.equal((await state()).activeCreation.themeId, theme, 'changing theme keeps the new tree background pinned');
    await grow(created.id, 5); await grow(created.id, 100);
    const claimed = await claim(created.id);
    assert.equal(claimed.scenery.completedTypes.find(item => item.typeId === typeId).count, 1);
    assert.equal(claimed.wallet.coinBalance, Number(beforeGrowth.coin_balance) - 20);
    assert.equal(claimed.wallet.farmMoneyBalance, Number(beforeGrowth.farm_money_balance) + 50);
    const beforeEquip = await wallet();
    await scalar("select public.equip_farm_cosmetic('farm_theme',$1)", [theme]);
    assert.deepEqual(await wallet(), beforeEquip, 'reapplying a permanently owned new theme is free');
  }
  // 094 opens all current themes/types and removes actual Coin spending.
  // Keep the old economy assertions above to verify upgrade behavior as well.
  const upgradeCreation = (await start('tree')).scenery.activeCreation.id;
  const oldPaidRequest = randomUUID();
  await grow(upgradeCreation, 4, oldPaidRequest);
  await db.query('update public.farm_wallets set coin_balance=0 where user_id=$1', [user]);
  const beforeFreeAccess = await state();
  const beforeFreeWallets = (await db.query('select * from public.farm_wallets order by user_id')).rows;
  const beforeFreeUserWallet = await wallet();
  const beforeFreeLedgerCount = await number('select count(*) from public.farm_wallet_ledger');
  const freeAccessMigration = source('094_free_scenery_access.sql');
  await db.exec(freeAccessMigration);
  const freeAccess = await state();
  assert.equal(freeAccess.freeGrowth, true);
  assert.deepEqual(freeAccess.activeCreation, beforeFreeAccess.activeCreation);
  assert.deepEqual(freeAccess.completedTypes, beforeFreeAccess.completedTypes);
  assert.equal(freeAccess.totalCompleted, beforeFreeAccess.totalCompleted);
  assert.equal(freeAccess.unlockedTypes.length, freeAccess.catalog.length);
  assert.deepEqual((await db.query('select * from public.farm_wallets order by user_id')).rows, beforeFreeWallets);
  assert.equal(await number('select count(*) from public.farm_wallet_ledger'), beforeFreeLedgerCount);
  const themeCount = await number("select count(*) from public.farm_cosmetic_catalog where cosmetic_type='farm_theme'");
  for (const account of [user, other]) {
    assert.equal(await number("select count(*) from public.farm_cosmetic_catalog catalog where catalog.cosmetic_type='farm_theme' and not exists(select 1 from public.farm_cosmetics owned where owned.user_id=$1 and owned.cosmetic_type=catalog.cosmetic_type and owned.cosmetic_id=catalog.cosmetic_id)", [account]), 0);
    assert.equal(await number('select count(*) from public.farm_scenery_unlocked_types where user_id=$1', [account]), freeAccess.catalog.length);
  }
  await scalar("select public.equip_farm_cosmetic('farm_theme','space')");
  assert.deepEqual(await wallet(), beforeFreeUserWallet);
  const freeRequest = randomUUID();
  const freeGrown = await grow(upgradeCreation, 5, freeRequest);
  assert.equal(freeGrown.event.spentCoin, 0);
  assert.equal(freeGrown.event.growthAdded, 5);
  assert.equal(freeGrown.scenery.activeCreation.progress, 9);
  assert.equal(freeGrown.wallet.coinBalance, 0);
  assert.equal((await grow(upgradeCreation, 5, freeRequest)).scenery.activeCreation.progress, 9);
  assert.equal((await grow(upgradeCreation, 4, oldPaidRequest)).scenery.activeCreation.progress, 9, 'pre-upgrade retries do not grow or charge again');
  for (const amount of [null, 0, -1, 101]) await assert.rejects(grow(upgradeCreation, amount), /SCENERY_INVALID_AMOUNT/);
  await setUser(other);
  await assert.rejects(grow(upgradeCreation, 1), /SCENERY_CREATION_NOT_FOUND/);
  await setUser(user);
  const freeComplete = await grow(upgradeCreation, 100);
  assert.equal(freeComplete.event.growthAdded, 11);
  assert.equal(freeComplete.scenery.activeCreation.progress, 20);
  assert.equal(await number('select count(*) from public.farm_wallet_ledger'), beforeFreeLedgerCount, 'free growth creates no wallet ledger changes');
  await assert.rejects(grow(upgradeCreation), /SCENERY_ALREADY_COMPLETE/);
  const beforeFreeClaim = await wallet();
  const freeClaimRequest = randomUUID();
  const freeClaim = await claim(upgradeCreation, freeClaimRequest);
  assert.equal(freeClaim.wallet.coinBalance, 0);
  assert.equal(freeClaim.wallet.farmMoneyBalance, Number(beforeFreeClaim.farm_money_balance) + 50);
  await claim(upgradeCreation, freeClaimRequest);
  await assert.rejects(claim(upgradeCreation), /SCENERY_ALREADY_CLAIMED/);
  assert.equal(Number((await wallet()).farm_money_balance), Number(beforeFreeClaim.farm_money_balance) + 50);
  const newcomer = '00000000-0000-0000-0000-000000000003';
  await db.query('insert into auth.users values($1)', [newcomer]);
  await setUser(newcomer);
  const newcomerState = await state();
  assert.equal(newcomerState.freeGrowth, true);
  assert.equal(newcomerState.unlockedTypes.length, newcomerState.catalog.length);
  assert.equal(await number("select count(*) from public.farm_cosmetics where user_id=$1 and cosmetic_type='farm_theme'", [newcomer]), themeCount);
  const newcomerCreation = (await start('spaceTree', 'space')).scenery.activeCreation.id;
  await grow(newcomerCreation, 5);
  assert.equal(await number('select coin_balance from public.farm_wallets where user_id=$1', [newcomer]), 0);
  const beforeFreeReapply = await state();
  const beforeFreeReapplyWallets = (await db.query('select * from public.farm_wallets order by user_id')).rows;
  await db.exec(freeAccessMigration);
  assert.deepEqual(await state(), beforeFreeReapply, 'free-access migration is safe to rerun while growing');
  assert.deepEqual((await db.query('select * from public.farm_wallets order by user_id')).rows, beforeFreeReapplyWallets);
  assert.equal(await scalar("select has_function_privilege('authenticated','public.ensure_farm_user(uuid)','EXECUTE')"), false);
  assert.equal(await scalar("select has_function_privilege('anon','public.grow_my_scenery_creation(uuid,integer,uuid)','EXECUTE')"), false);
  await setUser(user);
  assert.equal(await scalar("select has_function_privilege('authenticated','public.farm_scenery_allowed_types(text)','EXECUTE')"), false);
  assert.equal(await scalar("select has_function_privilege('anon','public.farm_scenery_allowed_types(text)','EXECUTE')"), false);
  await setUser(null);
  for (const action of [state,()=>start(),()=>grow(racingCreation),()=>claim(racingCreation),()=>unlock('pinkCoral')]) await assert.rejects(action(), /Authentication required/);
  console.log('SQL PASS: 31 types, 21 theme primaries, paid-to-free upgrade, all-account unlocks, free growth at zero Coin, preserved balances/progress/history, single active invariant, durable retries, completion rewards, safe reapply and owner-only RLS');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.close());
