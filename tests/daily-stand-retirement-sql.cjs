// Run with PGLITE_MODULE pointing to an installed @electric-sql/pglite package.
// Executes 085 and checks that farm reads no longer roll or return daily offers.
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/085_retire_daily_skin_stand.sql'), 'utf8');
const user = '00000000-0000-0000-0000-000000000001';
const db = new PGlite();
const scalar = async (sql) => Object.values((await db.query(sql)).rows[0])[0];

(async () => {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select '${user}'::uuid $$;
    create publication supabase_realtime;
    create table public.farms (user_id uuid primary key, farm_name text, production_boost_until timestamptz, wilt_protection_until timestamptz,
      waste_count integer default 0, equipped_farm_theme text, equipped_plot_skin text, equipped_label_effect text);
    create table public.farm_plots (user_id uuid, plot_index smallint, crop_id text, growth integer, planted_on date, last_watered_on date,
      last_free_water_at timestamptz, wilted boolean default false, fertilizer_id text);
    create table public.farm_inventory (user_id uuid, category text, item_id text, quantity integer);
    create table public.farm_weekly_earnings (user_id uuid, week_start date, earned_farm_money bigint);
    create table public.farm_mail (id uuid, sender_user_id uuid, recipient_user_id uuid, sender_name text, mail_type text, subject text,
      sender_message text, sent_at timestamptz, expires_at timestamptz, claimed_at timestamptz);
    create table public.farm_mail_items (id uuid, mail_id uuid, item_order smallint, category text, item_id text, quantity integer,
      price_coins integer, revealed_at timestamptz, claimed_at timestamptz);
    create table public.profiles (id uuid primary key, display_name text);
    create table public.farm_cosmetics (user_id uuid, cosmetic_type text, cosmetic_id text);
    create table public.farm_market_rotations (user_id uuid, rotation_date date, seed_offer_ids text[], food_offer_ids text[],
      crop_sell_offer_ids text[], cosmetic_offer_ids text[]);
    alter publication supabase_realtime add table public.farm_market_rotations, public.farms;
    create function public.farm_market_rotation_json(p_row public.farm_market_rotations) returns jsonb language sql as $$ select '{}'::jsonb $$;
    create table public.calls (name text);
    create function public.ensure_farm_market_rotation(uuid) returns void language sql as $$ insert into public.calls values ('rotation') $$;
    create function public.ensure_farm_user(uuid) returns void language sql as $$ select $$;
    create function public.run_farm_lifecycle() returns void language sql as $$ select $$;
    create function public.refresh_farm_wilt(uuid) returns void language sql as $$ insert into public.calls values ('wilt') $$;
    create function public.current_farm_week_start() returns date language sql as $$ select current_date $$;
    create function public.farm_plot_json(public.farm_plots) returns jsonb language sql as $$ select jsonb_build_object('id', $1.plot_index) $$;
    create function public.get_my_farm_state_v2() returns jsonb language plpgsql as $$ begin return public.get_my_farm_state(); end $$;
    create function public.get_my_farm_state_v5() returns jsonb language plpgsql as $$ begin return public.get_my_farm_state_v4(); end $$;
    insert into public.farms (user_id, farm_name, equipped_farm_theme) values ('${user}', 'Sunny farm', 'ocean');
    insert into public.farm_plots (user_id, plot_index, crop_id) values ('${user}', 0, 'carrot');
    insert into public.farm_cosmetics values ('${user}', 'farm_theme', 'ocean');
    insert into public.farm_market_rotations values ('${user}', current_date, '{carrot}', '{}', '{carrot:5}', '{farm_theme:volcano}');
  `);

  for (let run = 0; run < 2; run++) await db.exec(migration);

  const state = await scalar('select public.get_my_farm_state_v6()');
  assert.equal(state.farm.farmName, 'Sunny farm');
  assert.equal(state.farm.equippedFarmTheme, 'ocean');
  assert.deepEqual(state.ownedCosmetics, [{ type: 'farm_theme', id: 'ocean' }]);
  assert.deepEqual(state.plots, [{ id: 0 }]);
  assert.equal('marketRotation' in state, false);
  assert.deepEqual((await db.query('select name from public.calls')).rows.map(row => row.name), ['wilt']);

  assert.equal(await scalar(`select to_regclass('public.farm_market_rotations') is null`), true);
  for (const name of ['ensure_farm_market_rotation', 'farm_market_rotation_json']) {
    assert.equal(await scalar(`select not exists (select 1 from pg_proc where proname = '${name}')`), true, `${name} should be dropped`);
  }
  assert.deepEqual((await db.query(`select tablename from pg_publication_tables where pubname = 'supabase_realtime'`)).rows, [{ tablename: 'farms' }]);

  console.log('SQL PASS: daily skin stand retired; farm reads keep cosmetics, plots and wilt checks without offers');
})().catch(error => { console.error(error); process.exit(1); });
