// Run with PGLITE_MODULE pointing to an installed @electric-sql/pglite.
// Uses the real migrated RPCs against a small, isolated PostgreSQL fixture.
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const user = '00000000-0000-0000-0000-000000000001';
const db = new PGlite();
const scalar = async (sql, params) => Object.values((await db.query(sql, params)).rows[0])[0];
const source = name => fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8');
const migrateFunction = async (file, name) => {
  const sql = source(file).match(new RegExp(`create or replace function public\\.${name}\\([^]*?\\$\\$;`, 'i'));
  assert.ok(sql, `missing function ${name}`);
  await db.exec(sql[0]);
};
const plot = index => scalar('select public.farm_plot_json(p) from public.farm_plots p where plot_index=$1', [index]);
const focus = (seconds, index = null, instance = null, id = randomUUID()) => scalar(
  "select public.record_my_focus_time_v2($1::uuid,'linked',$2::integer,$3::smallint,$4::uuid)",
  [id, seconds, index, instance]
);
const choose = (index, request = randomUUID()) => scalar(
  'select public.select_my_focus_farm_plot($1::smallint,$2::uuid)', [index, request]
);
const plant = (index, crop = 'carrot') => scalar(
  'select public.plant_farm_seed($1::smallint,$2::text,$3::uuid)', [index, crop, randomUUID()]
);
const resetCrop = async index => {
  await db.query('update public.farm_plots set crop_id=null,growth=0,planted_on=null,wilted=false where plot_index=$1', [index]);
  await plant(index);
  return (await plot(index)).focusCropInstanceId;
};

(async () => {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select '${user}'::uuid $$;
    create table public.user_focus_progress (
      user_id uuid primary key, progress_seconds integer not null default 0 check(progress_seconds between 0 and 3599),
      recent_event_ids uuid[] not null default '{}' check(cardinality(recent_event_ids)<=128), updated_at timestamptz default now()
    );
    create table public.farms (
      user_id uuid primary key, production_boost_until timestamptz, wilt_protection_until timestamptz
    );
    create table public.farm_wallets (user_id uuid primary key,coin_balance bigint default 100,farm_money_balance bigint default 0);
    create table public.farm_wallet_ledger (user_id uuid,currency text,amount bigint,balance_after bigint,reason text,reference_key text);
    create table public.farm_crop_catalog (crop_id text primary key,growth_cost smallint);
    create table public.farm_inventory (
      user_id uuid,category text,item_id text,quantity integer not null check(quantity>=0),primary key(user_id,category,item_id)
    );
    create table public.farm_plots (
      user_id uuid,plot_index smallint,crop_id text,growth smallint default 0,
      planted_on date,last_watered_on date,last_free_water_at timestamptz,last_cared_at timestamptz,
      wilted boolean default false,fertilizer_id text,primary key(user_id,plot_index)
    );
    create table public.farm_action_log (
      user_id uuid,request_id uuid,action text,result jsonb,created_at timestamptz default now(),primary key(user_id,request_id)
    );
    create function public.ensure_farm_user(uuid) returns void language sql as $$ select $$;
    create function public.farm_set_bonus_percent(uuid,text) returns integer language sql as $$ select 0 $$;
    create function public.farm_set_effect_triggers(uuid,text) returns boolean language sql as $$ select false $$;
    create function public.ensure_farm_market_rotation(uuid) returns void language sql as $$ select $$;
    create function public.get_my_farm_state_v5() returns jsonb language sql as $$ select '{"farm":{"farmName":"Test farm"},"inventory":[],"wallet":{"coinBalance":100}}'::jsonb $$;
    create function public.apply_farm_wallet_change(uuid,text,bigint,text,text) returns bigint language plpgsql as $$
      declare balance bigint;
      begin update public.farm_wallets set coin_balance=coin_balance+$3 where user_id=$1 returning coin_balance into balance;
      return balance; end $$;
    insert into public.farms(user_id) values('${user}');
    insert into public.farm_wallets(user_id) values('${user}');
    insert into public.farm_crop_catalog values('carrot',3),('strawberry',4);
    insert into public.farm_inventory values('${user}','seed','carrot',100),('${user}','seed','strawberry',100);
    insert into public.farm_plots(user_id,plot_index) select '${user}',unnest(array[0,1,2,4,5,6,8,9,10]::smallint[]);
  `);
  for (const name of ['farm_action_begin', 'farm_action_finish', 'farm_plot_max_growth']) {
    await migrateFunction('051_farm_catalogs_and_action_log.sql', name);
  }
  await migrateFunction('054_farm_inventory_delta_precheck.sql', 'apply_farm_inventory_delta');
  await migrateFunction('071_public_recipes_and_cosmetic_sets.sql', 'refresh_farm_wilt');
  for (const name of ['plant_farm_seed', 'discard_farm_plot', 'grow_farm_plot_with_coin']) {
    await migrateFunction('052_farm_intent_rpcs.sql', name);
  }
  await migrateFunction('072_diverse_cosmetic_set_effects.sql', 'harvest_farm_plot');
  // Existing plantings receive identities as well, without losing growth.
  await db.exec("update public.farm_plots set crop_id='carrot',growth=1,last_cared_at=now() where plot_index=10");
  await db.exec(source('075_focus_farm_growth.sql'));
  assert.ok((await plot(10)).focusCropInstanceId);
  assert.equal((await plot(10)).growth, 1);
  const initialProgress = await scalar('select public.get_my_focus_progress()');
  assert.equal(initialProgress.focusFarm.dailyFocusSeconds, 0);
  assert.equal(initialProgress.plots.length, 9);
  assert.ok(initialProgress.plots.find(p => p.id === 10).focusCropInstanceId);
  const state = await scalar('select public.get_my_farm_state_v6()');
  assert.equal(state.plots.length, 9);
  assert.ok(state.plots.every(p => Object.hasOwn(p, 'focusGrowthSeconds')));
  assert.equal(state.focusFarm.growthSecondsPerStage, 1500);

  await plant(0);
  const instance = (await plot(0)).focusCropInstanceId;
  assert.ok(instance);
  assert.equal((await choose(0)).focusFarm.plotId, 0);
  const firstId = randomUUID();
  const first = await focus(600, 0, instance, firstId);
  assert.equal(first.event.focusGrowth.appliedSeconds, 600);
  assert.equal(first.plots[0].focusGrowthSeconds, 600);
  const replay = await focus(600, 0, instance, firstId);
  assert.equal(replay.accepted, false);
  assert.equal(replay.event.focusGrowth.appliedSeconds, 0);
  assert.equal(replay.plots[0].focusGrowthSeconds, 600);
  assert.equal(replay.plots[0].focusCropInstanceId, instance);
  assert.equal((await plot(0)).focusGrowthSeconds, 600);
  assert.equal(replay.focusFarm.dailyFocusSeconds, 600);
  await focus(600, 0, instance);
  const stage = await focus(300, 0, instance);
  assert.equal(stage.plots[0].growth, 1);
  assert.equal(stage.plots[0].focusGrowthSeconds, 0);
  assert.equal(stage.event.focusGrowth.growthAdded, 1);
  assert.equal(stage.plots[0].focusCropInstanceId, instance);
  await focus(200, 0, instance);

  // Switching preserves each crop's partial focus. A queued old-target
  // event still grows that original planting, never the newly selected one.
  await plant(1, 'strawberry');
  const other = (await plot(1)).focusCropInstanceId;
  const selectionId = randomUUID();
  const selection = await choose(1, selectionId);
  await choose(0);
  assert.deepEqual(await choose(1, selectionId), selection);
  assert.equal((await scalar('select public.get_my_focus_progress()')).focusFarm.plotId, 0);
  await choose(1);
  await focus(100, 0, instance);
  assert.equal((await plot(0)).focusGrowthSeconds, 300);
  assert.equal((await plot(1)).focusGrowthSeconds, 0);
  await focus(150, 1, other);
  assert.equal((await plot(1)).focusGrowthSeconds, 150);
  assert.equal((await plot(0)).focusGrowthSeconds, 300);

  // Existing Coin care adds its normal unit and keeps partial focus intact.
  const balanceBefore = Number(await scalar('select coin_balance from public.farm_wallets'));
  await scalar('select public.grow_farm_plot_with_coin(0::smallint,$1::uuid)', [randomUUID()]);
  assert.equal((await plot(0)).growth, 2);
  assert.equal((await plot(0)).focusGrowthSeconds, 300);
  assert.equal((await plot(0)).focusCropInstanceId, instance);
  assert.equal(Number(await scalar('select coin_balance from public.farm_wallets')), balanceBefore - 1);
  await focus(600, 0, instance);
  await focus(599, 0, instance);
  const ripe = await focus(600, 0, instance);
  assert.equal(ripe.event.focusGrowth.appliedSeconds, 1);
  assert.equal(ripe.event.focusGrowth.ready, true);
  assert.equal((await plot(0)).growth, 3);
  assert.equal((await plot(0)).focusGrowthSeconds, 0);
  assert.equal((await focus(20, 0, instance)).event.focusGrowth.appliedSeconds, 0);

  // Harvest preserves the selected slot but invalidates the old planting.
  await choose(0);
  const harvested = await scalar('select public.harvest_farm_plot(0::smallint,$1::uuid)', [randomUUID()]);
  assert.equal(harvested.event.harvestAmount, 1);
  assert.equal((await plot(0)).focusCropInstanceId, null);
  assert.equal((await scalar('select public.get_my_focus_progress()')).focusFarm.plotId, 0);
  await plant(0);
  const replacement = (await plot(0)).focusCropInstanceId;
  assert.notEqual(replacement, instance);
  const stale = await focus(250, 0, instance);
  assert.equal(stale.event.focusGrowth.status, 'stale');
  assert.equal((await plot(0)).focusGrowthSeconds, 0);
  await focus(250, 0, replacement);
  assert.equal((await plot(0)).focusGrowthSeconds, 250);
  // A lost old response must return today's planting rather than replaying
  // the original result, which would roll the client's farm backward.
  const beforeOldReplay = await scalar('select public.get_my_focus_progress()');
  const oldReplay = await focus(600, 0, instance, firstId);
  assert.equal(oldReplay.accepted, false);
  assert.equal(oldReplay.event.focusGrowth.growthAdded, 0);
  assert.equal(oldReplay.awardedCoins, 0);
  assert.equal(oldReplay.plots[0].focusCropInstanceId, replacement);
  assert.equal(oldReplay.plots[0].focusGrowthSeconds, 250);
  assert.equal(oldReplay.focusFarm.dailyFocusSeconds, beforeOldReplay.focusFarm.dailyFocusSeconds);
  assert.deepEqual(oldReplay.plots[0], beforeOldReplay.plots.find(p => p.id === 0));

  // Wilt/protection obey existing farm rules. Daily focus and Coin rewards
  // continue even when no plot can grow, and duplicate events add neither.
  await db.exec("update public.farm_plots set last_cared_at=now()-interval '25 hours' where plot_index=0");
  const wilted = await focus(100, 0, replacement);
  assert.equal(wilted.event.focusGrowth.status, 'wilted');
  assert.equal((await plot(0)).focusGrowthSeconds, 250);
  await scalar('select public.discard_farm_plot(0::smallint,$1::uuid)', [randomUUID()]);
  assert.equal((await plot(0)).focusCropInstanceId, null);
  assert.equal((await plot(0)).focusGrowthSeconds, 0);
  const protectedInstance = await resetCrop(0);
  await db.exec("update public.farm_plots set last_cared_at=now()-interval '25 hours' where plot_index=0; update public.farms set wilt_protection_until=now()+interval '1 hour'");
  assert.equal((await focus(100, 0, protectedInstance)).event.focusGrowth.status, 'growing');

  // Mature-by-manual-care clears unconsumed focus and never changes identity.
  await db.exec('update public.farm_plots set growth=3 where plot_index=0');
  assert.equal((await plot(0)).focusGrowthSeconds, 0);
  assert.equal((await plot(0)).focusCropInstanceId, protectedInstance);
  await choose(null);
  const noCrop = await focus(20);
  assert.equal(noCrop.focusFarm.plotId, null);
  assert.equal(noCrop.event.focusGrowth.appliedSeconds, 0);

  // Legacy tabs keep their Coin reward but cannot grow an arbitrary target.
  await choose(1);
  await db.exec("update public.user_focus_progress set progress_seconds=3599; update public.farms set production_boost_until=now()+interval '1 hour'");
  const legacy = await scalar("select public.record_my_focus_time($1::uuid,'quick',1)", [randomUUID()]);
  assert.equal(legacy.awardedCoins, 2);
  assert.equal((await plot(1)).focusGrowthSeconds, 150);
  assert.equal(legacy.progressSeconds, 0);
  await db.exec("create or replace function public.farm_set_effect_triggers(uuid,text) returns boolean language sql as $$ select $2='focusCoinDouble' $$; update public.user_focus_progress set progress_seconds=3599");
  const boosted = await focus(1);
  assert.equal(boosted.awardedCoins, 4);
  assert.deepEqual(boosted.event.bonuses, ['focusCoinDouble']);

  // A failure in the wallet rolls back the same event's focus/crop/daily
  // changes too; retry with its unchanged UUID can then commit once.
  await db.exec("create or replace function public.farm_set_effect_triggers(uuid,text) returns boolean language sql as $$ select false $$; update public.farms set production_boost_until=null");
  const atomicInstance = await resetCrop(2);
  await db.exec('update public.user_focus_progress set progress_seconds=3599');
  const savedProgress = await scalar('select row_to_json(p) from public.user_focus_progress p');
  const atomicId = randomUUID();
  const limit = Number(await scalar('select coin_balance from public.farm_wallets'));
  await db.exec(`alter table public.farm_wallets add constraint test_wallet_limit check(coin_balance<=${limit})`);
  await assert.rejects(focus(30, 2, atomicInstance, atomicId), /test_wallet_limit/);
  assert.deepEqual(await scalar('select row_to_json(p) from public.user_focus_progress p'), savedProgress);
  assert.equal((await plot(2)).focusGrowthSeconds, 0);
  await db.exec('alter table public.farm_wallets drop constraint test_wallet_limit');
  assert.equal((await focus(30, 2, atomicInstance, atomicId)).accepted, true);
  assert.equal((await plot(2)).focusGrowthSeconds, 30);

  // The day summary resets without awarding a Coin or changing crops, and
  // retries remain bounded using the existing 128-event protocol.
  await db.exec("update public.user_focus_progress set daily_focus_date=current_date-2,daily_focus_seconds=777");
  assert.equal((await scalar('select public.get_my_focus_progress()')).focusFarm.dailyFocusSeconds, 0);
  const nextDay = await focus(45);
  assert.equal(nextDay.focusFarm.dailyFocusSeconds, 45);
  const parallelId = randomUUID();
  const parallel = await Promise.all(Array.from({ length: 5 }, () => focus(1, null, null, parallelId)));
  assert.equal(parallel.filter(r => r.accepted).length, 1);
  for (let i = 0; i < 140; i++) await focus(1);
  assert.equal(await scalar('select cardinality(recent_event_ids) from public.user_focus_progress'), 128);
  assert.equal((await scalar('select public.get_my_focus_progress()')).focusFarm.dailyFocusSeconds, 186);
  await assert.rejects(focus(0), /Elapsed focus seconds/);
  await assert.rejects(focus(601), /Elapsed focus seconds/);
  await assert.rejects(focus(1, 3, randomUUID()), /FARM_PLOT_NOT_FOUND/);
  await assert.rejects(choose(3), /FARM_PLOT_NOT_FOUND/);
  await assert.rejects(db.query("select public.record_my_focus_time_v2(gen_random_uuid(),'break',1,null,null)"), /Unsupported focus mode/);
  await assert.rejects(db.query("update public.farm_plots set focus_growth_seconds=1500 where plot_index=1"), /farm_plots_focus_growth_seconds_range/);
  await db.exec('create or replace function auth.uid() returns uuid language sql as $$ select null::uuid $$');
  await assert.rejects(focus(1), /Authentication required/);
  await assert.rejects(choose(0), /Authentication required/);
  console.log('SQL PASS: focus stages, partial progress, target switches, planting identities, Coin/manual care, harvest, wilt, legacy clients, daily reset, retry window and atomic rollback');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.close());
