// Run with PGLITE_MODULE pointing to an installed @electric-sql/pglite package.
// Executes 083 on a PostgreSQL fixture holding every retired surface.
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/083_retire_legacy_farm_and_app_state.sql'), 'utf8');
const [me, friend, legacy] = ['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003'];
const db = new PGlite();
const scalar = async (sql, params) => Object.values((await db.query(sql, params)).rows[0])[0];
const exists = (kind, name) => scalar(kind === 'table'
  ? `select to_regclass('public.${name}') is not null`
  : `select exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = '${name}')`);

(async () => {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql as $$ select '${me}'::uuid $$;
    insert into auth.users values ('${me}'), ('${friend}'), ('${legacy}');
    create publication supabase_realtime;

    create table public.calls (name text);
    create function public.ensure_farm_user(uuid) returns void language sql as $$ select $$;
    create function public.current_farm_week_start() returns date language sql as $$ select date '2026-09-28' $$;
    create function public.finalize_previous_farm_week() returns void language sql as $$ insert into public.calls values ('week') $$;
    create function public.cleanup_expired_farm_mail() returns void language sql as $$ insert into public.calls values ('mail') $$;
    create function public.cleanup_stale_wallet_idempotency() returns void language sql as $$ insert into public.calls values ('wallet') $$;
    create function public.cleanup_stale_farm_actions() returns void language sql as $$ insert into public.calls values ('actions') $$;
    create function public.cleanup_stale_bulletin_posts() returns void language sql as $$ insert into public.calls values ('bulletin') $$;

    create table public.farms (user_id uuid primary key, farm_name text, production_boost_until timestamptz, wilt_protection_until timestamptz, waste_count integer default 0);
    create table public.farm_plots (user_id uuid, plot_index smallint, crop_id text, growth integer, planted_on date, last_watered_on date, last_free_water_at timestamptz, wilted boolean, fertilizer_id text);
    create table public.farm_market_rotations (user_id uuid, rotation_date date, seed_offer_ids text[], food_offer_ids text[]);
    create table public.farm_weekly_earnings (user_id uuid, week_start date, earned_farm_money bigint, primary key (user_id, week_start));
    create table public.profiles (id uuid primary key, display_name text);
    create table public.farm_wallets (user_id uuid primary key, coin_balance bigint not null default 0, farm_money_balance bigint not null default 0);
    create table public.farm_wallet_ledger (id bigint generated always as identity, user_id uuid, currency text, amount bigint, balance_after bigint, reason text, reference_key text);
    create table public.farm_action_log (user_id uuid, request_id uuid, action text, result jsonb);
    create table public.farm_supply_catalog (item_id text primary key, price integer not null, item_type text not null check (item_type in ('plot', 'instant', 'target', 'market')));
    create table public.farm_inventory (user_id uuid, category text, item_id text, quantity integer, primary key (user_id, category, item_id));
    create table public.farm_mail (id uuid primary key, sender_user_id uuid, recipient_user_id uuid, sender_name text default 'x', mail_type text, subject text, sender_message text, sent_at timestamptz default now(), expires_at timestamptz, claimed_at timestamptz);
    create table public.farm_mail_items (id uuid primary key default gen_random_uuid(), mail_id uuid references public.farm_mail on delete cascade, item_order smallint, category text, item_id text, quantity integer, price_coins integer, revealed_at timestamptz, claimed_at timestamptz);
    create table public.farm_recipe_discoveries (user_id uuid, recipe_id text, discovered_at timestamptz default now());
    create table public.user_preferences (user_id uuid primary key, tutorial_completed boolean not null default false,
      linked_focus_minutes smallint not null default 25, linked_break_enabled boolean not null default true, linked_break_minutes smallint not null default 5,
      quick_focus_minutes smallint not null default 25, quick_break_enabled boolean not null default true, quick_break_minutes smallint not null default 5);
    create table public.user_app_state (user_id uuid primary key, state jsonb not null default '{}');
    create table public.user_focus_playlists (id uuid primary key default gen_random_uuid(), user_id uuid, title text, url text);
    alter publication supabase_realtime add table public.user_app_state, public.user_focus_playlists, public.farm_recipe_discoveries, public.user_preferences;

    create function public.save_my_farm_state(jsonb) returns void language sql as $$ select $$;
    create function public.save_my_farm_state_v2(jsonb) returns void language sql as $$ select $$;
    create function public.save_my_farm_state_v3(jsonb) returns void language sql as $$ select $$;
    create function public.save_my_farm_state_v4(jsonb) returns void language sql as $$ select $$;
    create function public.save_my_farm_state_v5(jsonb, bigint) returns void language sql as $$ select $$;
    create function public.buy_farm_seed(text, uuid) returns jsonb language sql as $$ select '{}'::jsonb $$;
    create function public.sell_farm_food(text, uuid) returns jsonb language sql as $$ select '{}'::jsonb $$;
    create function public.sell_farm_crop_bundle(text, smallint, uuid) returns jsonb language sql as $$ select '{}'::jsonb $$;
    create function public.cook_farm_recipe(text[], uuid) returns jsonb language sql as $$ select '{}'::jsonb $$;
    create function public.use_farm_market_refresh(text, uuid) returns jsonb language sql as $$ select '{}'::jsonb $$;
    create function public.upsert_my_focus_playlist(uuid, text, text) returns jsonb language sql as $$ select '{}'::jsonb $$;
    create function public.delete_my_focus_playlist(uuid) returns void language sql as $$ select $$;
    create function public.touch_my_focus_playlist(uuid) returns void language sql as $$ select $$;
    create function public.get_my_app_state() returns jsonb language sql as $$ select '{}'::jsonb $$;
    create function public.save_my_app_state(jsonb, bigint) returns jsonb language sql as $$ select '{}'::jsonb $$;

    insert into public.farms (user_id, farm_name) values ('${me}', 'Sunny farm');
    insert into public.farm_supply_catalog values ('seedMarketRefresh', 40, 'market'), ('foodMarketRefresh', 55, 'market'), ('freePass', 120, 'target');
    insert into public.farm_wallets values ('${me}', 10, 100), ('${friend}', 0, 0);
    insert into public.farm_weekly_earnings values ('${me}', date '2026-09-28', 70);
    insert into public.farm_inventory values
      ('${me}', 'supply', 'seedMarketRefresh', 2), ('${me}', 'supply', 'foodMarketRefresh', 1),
      ('${me}', 'supply', 'freePass', 3), ('${legacy}', 'supply', 'foodMarketRefresh', 4);
    insert into public.farm_mail (id, sender_user_id, recipient_user_id, mail_type, sender_message, expires_at, claimed_at) values
      ('10000000-0000-0000-0000-000000000001', '${me}', '${friend}', 'gift', null, now() + interval '1 day', null),
      ('10000000-0000-0000-0000-000000000002', '${me}', '${friend}', 'gift', null, now() + interval '1 day', null),
      ('10000000-0000-0000-0000-000000000003', null, '${friend}', 'gift', null, now() - interval '1 day', null);
    insert into public.farm_mail_items (mail_id, item_order, category, item_id, quantity) values
      ('10000000-0000-0000-0000-000000000001', 0, 'supply', 'seedMarketRefresh', 3),
      ('10000000-0000-0000-0000-000000000002', 0, 'supply', 'foodMarketRefresh', 1),
      ('10000000-0000-0000-0000-000000000002', 1, 'supply', 'freePass', 1),
      ('10000000-0000-0000-0000-000000000003', 0, 'supply', 'foodMarketRefresh', 9);
    insert into public.farm_action_log values ('${me}', gen_random_uuid(), 'sell_farm_food', '{}'), ('${me}', gen_random_uuid(), 'buy_farm_supply', '{}');
    insert into public.farm_recipe_discoveries (user_id, recipe_id) values ('${me}', 'carrotSoup');
    insert into public.user_preferences (user_id, quick_focus_minutes) values ('${me}', 40);
    insert into public.user_app_state values
      ('${me}', '{"settings":{"quick":{"focusMinutes":15}}}'),
      ('${legacy}', '{"tutorialCompleted":true,"settings":{"linked":{"focusMinutes":50,"breakEnabled":false,"breakMinutes":"bad"},"quick":{"focusMinutes":500}}}');
  `);

  await db.exec(migration);

  // Vouchers: held stock and still-claimable mail are refunded at catalog price.
  assert.equal(await scalar(`select farm_money_balance from public.farm_wallets where user_id = '${me}'`), 235);
  assert.equal(await scalar(`select farm_money_balance from public.farm_wallets where user_id = '${friend}'`), 175);
  assert.equal(await scalar(`select farm_money_balance from public.farm_wallets where user_id = '${legacy}'`), 220);
  assert.equal(await scalar(`select earned_farm_money from public.farm_weekly_earnings where user_id = '${me}'`), 70);
  assert.equal(await scalar(`select count(*) from public.farm_weekly_earnings`), 1);
  assert.deepEqual((await db.query(`select user_id::text, amount::int, balance_after::int, reference_key from public.farm_wallet_ledger order by user_id`)).rows, [
    { user_id: me, amount: 135, balance_after: 235, reference_key: 'retired-market-vouchers' },
    { user_id: friend, amount: 175, balance_after: 175, reference_key: 'retired-market-vouchers' },
    { user_id: legacy, amount: 220, balance_after: 220, reference_key: 'retired-market-vouchers' },
  ]);
  assert.deepEqual((await db.query(`select item_id, quantity from public.farm_inventory order by user_id, item_id`)).rows, [{ item_id: 'freePass', quantity: 3 }]);
  assert.deepEqual((await db.query(`select item_id from public.farm_supply_catalog`)).rows, [{ item_id: 'freePass' }]);
  await assert.rejects(db.exec(`insert into public.farm_supply_catalog values ('newTicket', 1, 'market')`), /item_type_check/);
  assert.deepEqual((await db.query(`select mail_id::text, item_id from public.farm_mail_items order by mail_id`)).rows,
    [{ mail_id: '10000000-0000-0000-0000-000000000002', item_id: 'freePass' }]);
  assert.equal(await scalar(`select count(*) from public.farm_mail`), 1);

  // Retired RPCs, tables and replayable actions are gone.
  for (const name of ['save_my_farm_state', 'save_my_farm_state_v2', 'save_my_farm_state_v3', 'save_my_farm_state_v4', 'save_my_farm_state_v5',
    'buy_farm_seed', 'sell_farm_food', 'sell_farm_crop_bundle', 'cook_farm_recipe', 'use_farm_market_refresh',
    'upsert_my_focus_playlist', 'delete_my_focus_playlist', 'touch_my_focus_playlist', 'get_my_app_state', 'save_my_app_state',
    'cleanup_stale_bulletin_posts']) {
    assert.equal(await exists('function', name), false, `${name} should be dropped`);
  }
  for (const name of ['user_focus_playlists', 'user_app_state', 'farm_recipe_discoveries']) {
    assert.equal(await exists('table', name), false, `${name} should be dropped`);
  }
  assert.deepEqual((await db.query(`select action from public.farm_action_log`)).rows, [{ action: 'buy_farm_supply' }]);
  assert.deepEqual((await db.query(`select tablename from pg_publication_tables where pubname = 'supabase_realtime'`)).rows, [{ tablename: 'user_preferences' }]);

  // Saved settings survive: existing rows win, missing rows are backfilled and clamped.
  assert.equal(await scalar(`select quick_focus_minutes from public.user_preferences where user_id = '${me}'`), 40);
  assert.deepEqual((await db.query(`select tutorial_completed, linked_focus_minutes, linked_break_enabled, linked_break_minutes, quick_focus_minutes, quick_break_enabled
    from public.user_preferences where user_id = '${legacy}'`)).rows[0], {
    tutorial_completed: true, linked_focus_minutes: 50, linked_break_enabled: false, linked_break_minutes: 5, quick_focus_minutes: 120, quick_break_enabled: true,
  });
  assert.equal(await scalar(`select count(*) from public.user_preferences where user_id = '${friend}'`), 0);
  const preferences = await scalar('select public.get_my_preferences()');
  assert.equal('playlists' in preferences, false);
  assert.equal(preferences.settings.quick.focusMinutes, 40);

  // Farm reads still work without discoveries; the lifecycle no longer deletes bulletin posts.
  const farm = await scalar('select public.get_my_farm_state()');
  assert.equal(farm.farm.farmName, 'Sunny farm');
  assert.equal('discoveredRecipes' in farm, false);
  assert.deepEqual((await db.query(`select name from public.calls`)).rows.map(row => row.name), ['week', 'mail', 'wallet', 'actions']);

  // A second run is a no-op and refunds nothing twice.
  await db.exec(migration);
  assert.equal(await scalar(`select count(*) from public.farm_wallet_ledger`), 3);
  assert.equal(await scalar(`select farm_money_balance from public.farm_wallets where user_id = '${me}'`), 235);

  console.log('SQL PASS: legacy saves, old stands, voucher refunds, playlists, app state, discoveries and bulletin cleanup retired');
})().catch(error => { console.error(error); process.exit(1); });
