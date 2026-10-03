// Run with PGLITE_MODULE pointing to an installed @electric-sql/pglite.
// Executes the retirement on a real PostgreSQL fixture already using 075.
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const user = '00000000-0000-0000-0000-000000000001';
const db = new PGlite();
const source = name => fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8');
const scalar = async (sql, params) => Object.values((await db.query(sql, params)).rows[0])[0];
const migrateFunction = async (file, name) => {
  const match = source(file).match(new RegExp(`create or replace function public\\.${name}\\([^]*?\\$\\$;`, 'i'));
  assert.ok(match, `missing function ${name}`);
  await db.exec(match[0]);
};
const focus = (seconds, plot = null, instance = null, event = randomUUID(), mode = 'linked') => scalar(
  'select public.record_my_focus_time_v2($1::uuid,$2::text,$3::integer,$4::smallint,$5::uuid)',
  [event, mode, seconds, plot, instance]
);
const legacyFocus = (seconds, event = randomUUID()) => scalar(
  "select public.record_my_focus_time($1::uuid,'quick',$2::integer)", [event, seconds]
);
const choose = (plot, request = randomUUID()) => scalar(
  'select public.select_my_focus_farm_plot($1::smallint,$2::uuid)', [plot, request]
);
const plotRows = () => scalar('select jsonb_agg(to_jsonb(p) order by plot_index) from public.farm_plots p');
const progress = () => scalar('select to_jsonb(p) from public.user_focus_progress p');
const wallet = () => scalar('select to_jsonb(w) from public.farm_wallets w');
const actions = () => scalar('select jsonb_agg(to_jsonb(a) order by request_id) from public.farm_action_log a');
const plot = index => scalar('select public.farm_plot_json(p) from public.farm_plots p where plot_index=$1', [index]);
const expectCoinOnly = result => {
  assert.equal(Object.hasOwn(result, 'focusFarm'), false);
  assert.equal(Object.hasOwn(result, 'plots'), false);
  assert.equal(Object.hasOwn(result.event, 'focusGrowth'), false);
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
    create table public.farms (user_id uuid primary key, production_boost_until timestamptz, wilt_protection_until timestamptz);
    create table public.farm_wallets (user_id uuid primary key,coin_balance bigint default 100,farm_money_balance bigint default 0);
    create table public.farm_wallet_ledger (user_id uuid,currency text,amount bigint,balance_after bigint,reason text,reference_key text);
    create table public.farm_crop_catalog (crop_id text primary key,seed_price integer,growth_cost smallint);
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
    create table public.farm_action_locks (user_id uuid primary key);
    create function public.ensure_farm_user(uuid) returns void language sql as $$ select $$;
    create function public.farm_set_bonus_percent(uuid,text) returns integer language sql as $$ select 0 $$;
    create function public.farm_set_effect_triggers(uuid,text) returns boolean language sql as $$ select false $$;
    create function public.ensure_farm_market_rotation(uuid) returns void language sql as $$ select $$;
    create function public.get_my_farm_state_v5() returns jsonb language sql as $$
      select '{"farm":{"farmName":"Test farm"},"inventory":[],"wallet":{"coinBalance":100}}'::jsonb $$;
    create function public.apply_farm_wallet_change(uuid,text,bigint,text,text) returns bigint language plpgsql as $$
      declare balance bigint;
      begin update public.farm_wallets set coin_balance=coin_balance+$3 where user_id=$1 returning coin_balance into balance;
      return balance; end $$;
    insert into public.farms(user_id) values('${user}');
    insert into public.farm_wallets(user_id) values('${user}');
    insert into public.farm_crop_catalog values('carrot',1,3);
    insert into public.farm_inventory values('${user}','seed','carrot',10);
    insert into public.farm_plots(user_id,plot_index) select '${user}',unnest(array[0,1,2,4,5,6,8,9,10]::smallint[]);
  `);
  for (const name of ['farm_action_begin', 'farm_action_finish', 'farm_plot_max_growth']) {
    await migrateFunction('051_farm_catalogs_and_action_log.sql', name);
  }
  await migrateFunction('054_farm_inventory_delta_precheck.sql', 'apply_farm_inventory_delta');
  await migrateFunction('071_public_recipes_and_cosmetic_sets.sql', 'refresh_farm_wilt');
  for (const name of ['plant_farm_seed', 'grow_farm_plot_with_coin']) {
    await migrateFunction('052_farm_intent_rpcs.sql', name);
  }
  for (const name of ['water_farm_plot', 'harvest_farm_plot']) {
    await migrateFunction('072_diverse_cosmetic_set_effects.sql', name);
  }
  // 078's current planting path uses the same plot JSON helper and trigger.
  for (const name of ['lock_my_farm_actions', 'begin_my_farm_action', 'buy_and_plant_farm_seed']) {
    await migrateFunction('078_retire_farm_decorations.sql', name);
  }
  await db.exec(source('075_focus_farm_growth.sql'));
  await scalar("select public.plant_farm_seed(0::smallint,'carrot',$1::uuid)", [randomUUID()]);
  const instance = (await plot(0)).focusCropInstanceId;
  const selectionId = randomUUID();
  await choose(0, selectionId);
  const oldEvent = randomUUID();
  await focus(600, 0, instance, oldEvent);
  for (let i = 0; i < 3; i++) await focus(600, 0, instance);
  assert.equal((await plot(0)).growth, 1);
  assert.equal((await plot(0)).focusGrowthSeconds, 900);
  const before = { plots: await plotRows(), progress: await progress(), wallet: await wallet(), actions: await actions() };

  await db.exec(source('080_retire_focus_farm_growth.sql'));
  assert.deepEqual(await plotRows(), before.plots, 'retirement preserves existing growth, care and planting history');
  assert.deepEqual(await progress(), before.progress, 'Coin progress, accepted IDs, daily totals and target history survive');
  assert.deepEqual(await wallet(), before.wallet);
  assert.deepEqual(await actions(), before.actions, 'saved selection history is retained');
  assert.deepEqual(await scalar('select public.get_my_focus_progress()'), { progressSeconds: 2400 });
  const state = await scalar('select public.get_my_farm_state_v6()');
  assert.equal(Object.hasOwn(state, 'focusFarm'), false);
  assert.equal(state.plots.length, 9);
  assert.ok(state.plots.every(p => !Object.hasOwn(p, 'focusGrowthSeconds') && !Object.hasOwn(p, 'focusCropInstanceId')));
  assert.equal(state.plots[0].growth, 1);

  await assert.rejects(choose(0, selectionId), /FARM_FOCUS_RETIRED/, 'cached selections cannot be replayed');
  await assert.rejects(choose(1), /FARM_FOCUS_RETIRED/);
  await assert.rejects(choose(null), /FARM_FOCUS_RETIRED/);
  assert.deepEqual(await actions(), before.actions);
  assert.equal((await progress()).focus_plot_index, 0, 'retired selection cannot alter historical target');
  const replay = await focus(600, 0, instance, oldEvent);
  assert.equal(replay.accepted, false);
  assert.equal(replay.awardedCoins, 0);
  expectCoinOnly(replay);
  assert.deepEqual(await progress(), before.progress);

  // A target and planting snapshot from an older tab cannot add growth,
  // water/care, or trigger wilt handling through the focus endpoint.
  await db.exec("update public.farm_plots set last_cared_at=now()-interval '25 hours' where plot_index=0");
  const agedPlots = await plotRows();
  const first = await focus(600, 0, instance);
  const hour = await focus(600, 0, instance);
  assert.equal(first.awardedCoins, 0);
  assert.equal(hour.awardedCoins, 1);
  assert.equal(hour.progressSeconds, 0);
  for (const args of [[600, 0, randomUUID()], [600, 3, randomUUID()], [300, null, randomUUID()]]) {
    const result = await focus(...args);
    assert.equal(result.accepted, true, 'retired target arguments do not discard valid time');
    assert.equal(result.awardedCoins, 0);
    expectCoinOnly(result);
  }
  assert.equal((await progress()).progress_seconds, 1500);
  assert.deepEqual(await plotRows(), agedPlots, '25 minutes with any former target leaves plots untouched');

  // Both RPC signatures share the same event deduplication and hourly reward.
  await db.exec('update public.user_focus_progress set progress_seconds=3599');
  const sharedId = randomUUID();
  const legacy = await legacyFocus(1, sharedId);
  assert.equal(legacy.awardedCoins, 1);
  expectCoinOnly(legacy);
  assert.equal((await focus(1, 0, instance, sharedId)).accepted, false);
  const ledgerCount = await scalar('select count(*)::integer from public.farm_wallet_ledger');
  assert.equal(ledgerCount, 2);
  await db.exec("update public.user_focus_progress set progress_seconds=3599; update public.farms set production_boost_until=now()+interval '1 hour'");
  assert.equal((await focus(1)).awardedCoins, 2);
  await db.exec("create or replace function public.farm_set_effect_triggers(uuid,text) returns boolean language sql as $$ select $2='focusCoinDouble' $$; update public.user_focus_progress set progress_seconds=3599");
  const boosted = await legacyFocus(1);
  assert.equal(boosted.awardedCoins, 4);
  assert.deepEqual(boosted.event.bonuses, ['focusCoinDouble']);
  assert.deepEqual(await plotRows(), agedPlots);

  // A failed wallet credit does not consume the UUID or accumulated time.
  await db.exec("create or replace function public.farm_set_effect_triggers(uuid,text) returns boolean language sql as $$ select false $$; update public.farms set production_boost_until=null; update public.user_focus_progress set progress_seconds=3599");
  const atomicBefore = await progress();
  const atomicId = randomUUID();
  const balance = Number((await wallet()).coin_balance);
  await db.exec(`alter table public.farm_wallets add constraint test_wallet_limit check(coin_balance<=${balance})`);
  await assert.rejects(focus(1, 0, instance, atomicId), /test_wallet_limit/);
  assert.deepEqual(await progress(), atomicBefore);
  await db.exec('alter table public.farm_wallets drop constraint test_wallet_limit');
  assert.equal((await focus(1, 0, instance, atomicId)).accepted, true);
  assert.deepEqual(await plotRows(), agedPlots);

  // Normal Coin care, free watering, harvest and 078 planting still work.
  await db.exec('update public.farm_plots set last_cared_at=now() where plot_index=0');
  const coinBeforeCare = Number((await wallet()).coin_balance);
  const grown = await scalar('select public.grow_farm_plot_with_coin(0::smallint,$1::uuid)', [randomUUID()]);
  assert.equal(grown.plots[0].growth, 2);
  assert.equal(Number((await wallet()).coin_balance), coinBeforeCare - 1);
  const watered = await scalar('select public.water_farm_plot(0::smallint,$1::uuid)', [randomUUID()]);
  assert.equal(watered.plots[0].growth, 3);
  assert.equal(Number((await wallet()).coin_balance), coinBeforeCare - 1);
  const harvested = await scalar('select public.harvest_farm_plot(0::smallint,$1::uuid)', [randomUUID()]);
  assert.equal(harvested.plots[0].crop, null);
  const planted = await scalar("select public.buy_and_plant_farm_seed(0::smallint,'carrot',$1::uuid)", [randomUUID()]);
  assert.equal(planted.plots[0].crop, 'carrot');
  assert.equal(planted.plots[0].growth, 0);
  assert.equal(Object.hasOwn(planted.plots[0], 'focusGrowthSeconds'), false);
  assert.equal(Object.hasOwn(planted.plots[0], 'focusCropInstanceId'), false);

  await db.exec("update public.user_focus_progress set daily_focus_date=(now() at time zone 'Asia/Seoul')::date-2,daily_focus_seconds=777");
  const concurrentId = randomUUID();
  const results = await Promise.all(Array.from({ length: 5 }, () => focus(1, 0, instance, concurrentId)));
  assert.equal(results.filter(result => result.accepted).length, 1);
  assert.equal((await progress()).daily_focus_seconds, 1);
  for (let i = 0; i < 140; i++) await focus(1);
  assert.equal((await progress()).recent_event_ids.length, 128);
  assert.equal((await progress()).daily_focus_seconds, 141);
  await assert.rejects(focus(0), /Elapsed focus seconds/);
  await assert.rejects(focus(601), /Elapsed focus seconds/);
  await assert.rejects(focus(null), /Elapsed focus seconds/);
  await assert.rejects(focus(1, null, null, null), /Focus event id/);
  await assert.rejects(focus(1, null, null, randomUUID(), 'break'), /Unsupported focus mode/);
  await assert.rejects(focus(1, null, null, randomUUID(), null), /Unsupported focus mode/);
  assert.equal(await scalar("select has_function_privilege('anon','public.record_my_focus_time_v2(uuid,text,integer,smallint,uuid)','execute')"), false);
  assert.equal(await scalar("select has_function_privilege('authenticated','public.record_my_focus_time_v2(uuid,text,integer,smallint,uuid)','execute')"), true);

  await db.exec('create or replace function auth.uid() returns uuid language sql as $$ select null::uuid $$');
  await assert.rejects(focus(1), /Authentication required/);
  await assert.rejects(legacyFocus(1), /Authentication required/);
  await assert.rejects(choose(0), /Authentication required/);
  await assert.rejects(scalar('select public.get_my_focus_progress()'), /Authentication required/);
  await assert.rejects(scalar('select public.get_my_farm_state_v6()'), /Authentication required/);
  console.log('SQL PASS: retirement preserves history; old/new RPCs award Coin without crop changes; selection disabled; care, harvest, planting, retries, bonuses and rollback preserved');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.close());
