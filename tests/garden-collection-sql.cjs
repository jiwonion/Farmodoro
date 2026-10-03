// Actual PostgreSQL checks for permanent theme/field purchases and retirement.
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const db = new PGlite();
const user = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
const source = name => fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const context = vm.createContext({});
for (const name of ['FARM_THEMES', 'PLOT_SKINS', 'FARM_COSMETIC_SETS']) {
  vm.runInContext(app.match(new RegExp(`const ${name} = [\\s\\S]*?;\\r?\\n`))[0], context);
}
const catalog = vm.runInContext('({FARM_THEMES,PLOT_SKINS,FARM_COSMETIC_SETS})', context);
// Retired nameplates as production had them before 079 (id -> set).
const historicLabels = [...source('071_public_recipes_and_cosmetic_sets.sql').matchAll(/\('label_effect', '(\w+)', '(\w+)'\)/g)].map(([, id, setId]) => ({ id, setId }));
const labelOf = setId => historicLabels.find(label => label.setId === setId).id;
const newThemes = ['peperoDay', 'auroraNight', 'lavenderField', 'rainyGarden', 'desertOasis', 'moonGarden'];
const scalar = async (sql, params) => Object.values((await db.query(sql, params)).rows[0])[0];
const setUser = id => scalar("select set_config('app.test_user',$1,false)", [id || '']);
const migrateFunction = async (file, name) => {
  const match = source(file).match(new RegExp(`create or replace function public\\.${name}\\([^]*?\\$\\$;`, 'i'));
  assert.ok(match, `Missing ${name}`); await db.exec(match[0]);
};
const buy = (type, id, price) => scalar('select public.purchase_farm_cosmetic($1,$2,$3::integer)', [type, id, price]);
const equip = (type, id) => scalar('select public.equip_farm_cosmetic($1,$2)', [type, id]);

(async () => {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    insert into auth.users values('${user}'),('${other}');
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('app.test_user',true),'')::uuid$$;
    grant usage on schema auth to authenticated;
    create table public.farms (user_id uuid primary key,equipped_farm_theme text,equipped_plot_skin text,equipped_label_effect text);
    create table public.farm_wallets (user_id uuid primary key,coin_balance bigint default 0,farm_money_balance bigint default 0);
    create table public.farm_wallet_idempotency (user_id uuid,currency text,reference_key text,primary key(user_id,currency,reference_key));
    create table public.farm_wallet_ledger (user_id uuid,currency text,amount bigint,balance_after bigint,reason text,reference_key text);
    create table public.farm_weekly_earnings (user_id uuid,week_start date,earned_farm_money bigint default 0,primary key(user_id,week_start));
    create table public.farm_cosmetic_catalog (cosmetic_type text,cosmetic_id text,price integer,primary key(cosmetic_type,cosmetic_id));
    create table public.farm_cosmetics (user_id uuid,cosmetic_type text,cosmetic_id text,primary key(user_id,cosmetic_type,cosmetic_id));
    create table public.farm_cosmetic_sets (set_id text primary key,effect text);
    create table public.farm_cosmetic_set_members (cosmetic_type text,cosmetic_id text,set_id text references public.farm_cosmetic_sets,primary key(cosmetic_type,cosmetic_id));
    create table public.farm_catalog_meta (id boolean primary key,catalog_version integer);
    insert into public.farm_catalog_meta values(true,4);
    create table public.farm_action_log (user_id uuid,request_id uuid,action text,result jsonb,primary key(user_id,request_id));
    create table public.farm_crop_catalog (crop_id text primary key,seed_price integer,sell_price integer,growth_cost smallint);
    create table public.farm_recipe_catalog (recipe_id text primary key,sell_price integer);
    create table public.farm_recipe_ingredients (recipe_id text,crop_id text,quantity smallint);
    create table public.farm_supply_catalog (item_id text primary key,price integer,item_type text);
    create table public.farm_plots (user_id uuid,plot_index smallint,crop_id text,growth smallint,primary key(user_id,plot_index));
    create function public.ensure_farm_user(p_id uuid) returns void language plpgsql as $$begin
      insert into public.farms(user_id) values(p_id) on conflict do nothing;
      insert into public.farm_wallets(user_id) values(p_id) on conflict do nothing;
    end$$;
  `);
  await setUser(user);
  await scalar('select public.ensure_farm_user($1::uuid)', [user]);
  await scalar('select public.ensure_farm_user($1::uuid)', [other]);
  await db.query('update public.farm_wallets set farm_money_balance=100000 where user_id=$1', [user]);
  await migrateFunction('006_farm_economy_inventory_mail.sql', 'current_farm_week_start');
  await migrateFunction('037_wallet_and_farm_state_hardening.sql', 'apply_farm_wallet_change');
  await migrateFunction('051_farm_catalogs_and_action_log.sql', 'farm_action_begin');
  await migrateFunction('051_farm_catalogs_and_action_log.sql', 'farm_action_finish');
  await migrateFunction('043_farm_cosmetics_shop.sql', 'equip_farm_cosmetic');
  await migrateFunction('071_public_recipes_and_cosmetic_sets.sql', 'farm_set_bonus_percent');
  for (const [type, entries] of [['farm_theme', catalog.FARM_THEMES], ['plot_skin', catalog.PLOT_SKINS], ['label_effect', historicLabels.map(({ id }) => ({ id, price: 1200 }))]]) {
    for (const entry of entries) {
      if (type === 'farm_theme' && newThemes.includes(entry.id)) continue;
      await db.query('insert into public.farm_cosmetic_catalog values($1,$2,$3)', [type, entry.id, entry.price]);
    }
  }
  for (const set of catalog.FARM_COSMETIC_SETS) {
    await db.query('insert into public.farm_cosmetic_sets values($1,$2)', [set.id, set.effect]);
    for (const type of ['farm_theme', 'plot_skin']) for (const id of set[type]) {
      if (type === 'farm_theme' && newThemes.includes(id)) continue;
      await db.query('insert into public.farm_cosmetic_set_members values($1,$2,$3)', [type, id, set.id]);
    }
    for (const label of historicLabels.filter(({ setId }) => setId === set.id)) {
      await db.query("insert into public.farm_cosmetic_set_members values('label_effect',$1,$2)", [label.id, set.id]);
    }
  }
  await db.query("insert into public.farm_cosmetics values($1,'farm_theme','cherryBlossom'),($1,'plot_skin','cherryPetalFall'),($1,'label_effect','cherryDrift')", [user]);
  await db.query("update public.farms set equipped_farm_theme='cherryBlossom',equipped_plot_skin='cherryPetalFall',equipped_label_effect='cherryDrift' where user_id=$1", [user]);
  await db.exec(source('077_garden_theme_and_decoration_collection.sql'));
  assert.equal(Number(await scalar('select catalog_version from public.farm_catalog_meta')), 5);
  assert.equal(Number(await scalar("select count(*) from public.farm_cosmetic_catalog where cosmetic_type='farm_theme'")), 18);
  assert.equal(Number(await scalar("select count(*) from public.farm_cosmetic_catalog where cosmetic_type='plot_skin'")), 12);
  await assert.rejects(buy('farm_theme', 'inventedTheme', 2000), /FARM_UNKNOWN_COSMETIC/);
  await assert.rejects(buy('plot_skin', 'inventedField', 800), /FARM_UNKNOWN_COSMETIC/);
  await assert.rejects(buy('plot_skin', 'snowField', 1), /FARM_COSMETIC_PRICE_CHANGED/);
  await assert.rejects(buy('plot_skin', 'snowField', null), /FARM_COSMETIC_PRICE_CHANGED/);
  assert.equal(Number(await scalar('select farm_money_balance from public.farm_wallets where user_id=$1', [user])), 100000);
  for (const [type, entries, column, alreadyOwned] of [
    ['farm_theme', catalog.FARM_THEMES, 'equipped_farm_theme', 'cherryBlossom'],
    ['plot_skin', catalog.PLOT_SKINS, 'equipped_plot_skin', 'cherryPetalFall']
  ]) {
    for (const entry of entries) {
      if (entry.id === alreadyOwned) continue;
      const balanceBefore = Number(await scalar('select farm_money_balance from public.farm_wallets where user_id=$1', [user]));
      const bought = await buy(type, entry.id, entry.price);
      assert.equal(bought.farmMoneyBalance, balanceBefore - entry.price);
      assert.equal(await scalar(`select ${column} from public.farms where user_id=$1`, [user]), entry.id);
      await assert.rejects(buy(type, entry.id, entry.price), /Cosmetic already owned/);
      assert.equal(Number(await scalar('select farm_money_balance from public.farm_wallets where user_id=$1', [user])), bought.farmMoneyBalance);
    }
  }
  await equip('plot_skin', 'snowField');
  await equip('farm_theme', 'christmas');
  assert.equal(await scalar('select equipped_plot_skin from public.farms where user_id=$1', [user]), 'snowField', 'Changing theme preserves the independently purchased field');
  await equip('plot_skin', 'mapleLeaf');
  await equip('plot_skin', null);
  assert.equal(await scalar('select equipped_plot_skin from public.farms where user_id=$1', [user]), null);
  assert.equal(Number(await scalar("select count(*) from public.farm_cosmetics where user_id=$1 and cosmetic_type='plot_skin'", [user])), 12, 'Switching to default keeps permanent field ownership');
  await setUser(other);
  await assert.rejects(equip('plot_skin', 'snowField'), /Cosmetic not owned/);
  await assert.rejects(buy('plot_skin', 'snowField', 800), /Insufficient balance/);
  assert.equal(Number(await scalar('select count(*) from public.farm_cosmetics where user_id=$1', [other])), 0);
  await setUser(user);
  for (const set of catalog.FARM_COSMETIC_SETS) {
    for (const id of set.plot_skin) await db.query("insert into public.farm_cosmetics values($1,'plot_skin',$2) on conflict do nothing", [user, id]);
    await db.query("insert into public.farm_cosmetics values($1,'label_effect',$2) on conflict do nothing", [user, labelOf(set.id)]);
    for (const theme of set.farm_theme) for (const count of [1, 2, 3]) {
      await db.query('update public.farms set equipped_farm_theme=$2,equipped_plot_skin=$3,equipped_label_effect=$4 where user_id=$1', [user, theme, count >= 2 ? set.plot_skin[0] : null, count === 3 ? labelOf(set.id) : null]);
      assert.equal(await scalar('select public.farm_set_bonus_percent($1,$2)', [user, set.effect]), [0, 1, 5, 10][count], `${theme} keeps the ${set.id} tier`);
    }
  }
  // Exercise the forward migration against an older applied decoration branch.
  const staleRequest = randomUUID();
  const liveRequest = randomUUID();
  await db.exec(`
    create table public.farm_garden_locks (user_id uuid primary key);
    create table public.farm_decoration_catalog (decoration_id text primary key,price integer);
    create table public.farm_owned_decorations (user_id uuid,decoration_id text references public.farm_decoration_catalog,quantity integer,primary key(user_id,decoration_id));
    create table public.farm_decoration_placements (id uuid primary key,user_id uuid,decoration_id text,foreign key(user_id,decoration_id) references public.farm_owned_decorations);
    insert into public.farm_decoration_catalog values('woodBench',240);
    insert into public.farm_owned_decorations values('${user}','woodBench',2);
    insert into public.farm_decoration_placements values('${randomUUID()}','${user}','woodBench');
    create function public.farm_garden_json(uuid) returns jsonb language sql as $$select jsonb_build_object('decorations',(select count(*) from public.farm_decoration_placements))$$;
    create function public.get_my_garden_state() returns jsonb language sql as $$select public.farm_garden_json(auth.uid())$$;
    create function public.buy_my_farm_decoration(text,integer,uuid) returns jsonb language sql as $$select '{}'::jsonb$$;
    create function public.save_my_farm_decoration(uuid,text,smallint,smallint,smallint,uuid) returns jsonb language sql as $$select '{}'::jsonb$$;
    create function public.remove_my_farm_decoration(uuid,uuid) returns jsonb language sql as $$select '{}'::jsonb$$;
    create function public.lock_my_farm_garden(uuid) returns void language sql as $$select$$;
    create function public.begin_my_garden_action(uuid,uuid,text) returns jsonb language sql as $$select '{}'::jsonb$$;
    insert into public.farm_action_log values('${user}','${staleRequest}','buy_my_farm_decoration','{}'),('${user}','${liveRequest}','cook_my_farm_recipe','{}');
  `);
  const walletBefore = await db.query('select * from public.farm_wallets order by user_id');
  const cosmeticsBefore = await db.query('select * from public.farm_cosmetics order by user_id,cosmetic_type,cosmetic_id');
  const equipmentBefore = await db.query('select * from public.farms order by user_id');
  await db.exec(source('078_retire_farm_decorations.sql'));
  for (const table of ['farm_garden_locks', 'farm_decoration_catalog', 'farm_owned_decorations', 'farm_decoration_placements']) {
    assert.equal(await scalar('select to_regclass($1)::text', [`public.${table}`]), null, `${table} is deleted`);
  }
  for (const signature of ['farm_garden_json(uuid)', 'get_my_garden_state()', 'buy_my_farm_decoration(text,integer,uuid)', 'save_my_farm_decoration(uuid,text,smallint,smallint,smallint,uuid)', 'remove_my_farm_decoration(uuid,uuid)', 'lock_my_farm_garden(uuid)', 'begin_my_garden_action(uuid,uuid,text)']) {
    assert.equal(await scalar('select to_regprocedure($1)::text', [`public.${signature}`]), null, `${signature} is retired`);
  }
  assert.deepEqual((await db.query('select * from public.farm_wallets order by user_id')).rows, walletBefore.rows);
  assert.deepEqual((await db.query('select * from public.farm_cosmetics order by user_id,cosmetic_type,cosmetic_id')).rows, cosmeticsBefore.rows);
  assert.deepEqual((await db.query('select * from public.farms order by user_id')).rows, equipmentBefore.rows);
  assert.equal(Number(await scalar('select count(*) from public.farm_action_log where request_id=$1', [staleRequest])), 0);
  assert.equal(Number(await scalar('select count(*) from public.farm_action_log where request_id=$1', [liveRequest])), 1);
  assert.equal((await scalar('select public.get_farm_catalog()')).decorations, undefined);
  await db.exec(source('078_retire_farm_decorations.sql'));
  assert.deepEqual((await db.query('select * from public.farm_wallets order by user_id')).rows, walletBefore.rows, 'Retirement can be retried without changing balances');
  await equip('plot_skin', 'snowField');
  assert.equal(await scalar('select equipped_plot_skin from public.farms where user_id=$1', [user]), 'snowField');
  assert.equal(await scalar("select has_function_privilege('anon','public.purchase_farm_cosmetic(text,text,integer)','EXECUTE')"), false);
  assert.equal(await scalar("select has_function_privilege('authenticated','public.purchase_farm_cosmetic(text,text,integer)','EXECUTE')"), true);
  assert.equal(await scalar("select has_function_privilege('authenticated','public.lock_my_farm_actions(uuid)','EXECUTE')"), false);
  assert.equal(await scalar("select has_function_privilege('authenticated','public.begin_my_farm_action(uuid,uuid,text)','EXECUTE')"), false);
  // 079: nameplates retire and sets count only the equipped theme and field.
  await db.exec(`
    alter table public.farm_weekly_earnings add column updated_at timestamptz default now();
    alter table public.farms add column farm_name text;
    create table public.profiles (id uuid primary key, display_name text, avatar_url text, farm_code text);
    create table public.farm_market_rotations (user_id uuid, rotation_date date, cosmetic_offer_ids text[], primary key(user_id, rotation_date));
    insert into public.farm_market_rotations values('${user}', current_date, array['label_effect:galaxySparkle','farm_theme:volcano']);
    update public.farms set equipped_label_effect='cherryDrift' where user_id='${user}';
  `);
  const labelOwnership = Number(await scalar("select count(*) from public.farm_cosmetics where cosmetic_type='label_effect'"));
  for (let run = 0; run < 2; run++) await db.exec(source('079_retire_label_effects_two_piece_sets.sql'));
  assert.equal(Number(await scalar("select count(*) from public.farm_cosmetic_catalog where cosmetic_type='label_effect'")), 0, 'Nameplates leave the catalog');
  assert.equal(Number(await scalar("select count(*) from public.farm_cosmetic_set_members where cosmetic_type='label_effect'")), 0, 'Nameplates leave every set');
  assert.equal(Number(await scalar("select count(*) from public.farms where equipped_label_effect is not null")), 0, 'Equipped nameplates are cleared');
  assert.equal(Number(await scalar("select count(*) from public.farm_cosmetics where cosmetic_type='label_effect'")), labelOwnership, 'Purchase history is kept');
  assert.deepEqual(await scalar("select cosmetic_offer_ids from public.farm_market_rotations"), ['farm_theme:volcano']);
  assert.equal(String(await scalar("select pg_get_function_result('public.get_farm_leaderboard(date)'::regprocedure)")).includes('label'), false);
  await assert.rejects(buy('label_effect', 'cherryDrift', 1200), /Unsupported cosmetic type/);
  await assert.rejects(equip('label_effect', 'cherryDrift'), /Unsupported cosmetic type/);
  for (const set of catalog.FARM_COSMETIC_SETS) {
    for (const theme of set.farm_theme) for (const count of [1, 2]) {
      await db.query('update public.farms set equipped_farm_theme=$2,equipped_plot_skin=$3,equipped_label_effect=$4 where user_id=$1', [user, theme, count === 2 ? set.plot_skin[0] : null, labelOf(set.id)]);
      assert.equal(await scalar('select public.farm_set_bonus_percent($1,$2)', [user, set.effect]), [0, 1, 5][count], `${theme} is a ${count}-piece ${set.id} set`);
    }
  }
  await setUser(null);
  await assert.rejects(buy('plot_skin', 'snowField', 800), /Authentication required/);
  console.log('SQL PASS: 18 themes, 12 purchasable fields, server prices, permanent ownership, independent equip/default, two-piece theme/field sets with nameplates retired, complete decoration retirement with wallets/ownership preserved, private shared action helpers');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.close());
