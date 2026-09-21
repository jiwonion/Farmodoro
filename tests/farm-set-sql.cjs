// Run with PGLITE_MODULE pointing to an installed @electric-sql/pglite package.
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const ctx = vm.createContext({});
for (const name of ['CROPS', 'RECIPES', 'FARM_THEMES', 'PLOT_SKINS', 'LABEL_EFFECTS', 'FARM_COSMETIC_SETS']) {
  vm.runInContext(source.match(new RegExp(`const ${name} = [\\s\\S]*?;\\r?\\n`))[0], ctx);
}
const catalog = vm.runInContext('({CROPS,RECIPES,FARM_THEMES,PLOT_SKINS,LABEL_EFFECTS,FARM_COSMETIC_SETS})', ctx);
const user = '00000000-0000-0000-0000-000000000001';
const db = new PGlite();
const scalar = async (sql, params) => Object.values((await db.query(sql, params)).rows[0])[0];
(async () => {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select '${user}'::uuid $$;
    create table public.farms (user_id uuid primary key, equipped_farm_theme text, equipped_plot_skin text, equipped_label_effect text, wilt_protection_until timestamptz);
    create table public.farm_cosmetic_catalog (cosmetic_type text, cosmetic_id text, price integer, primary key(cosmetic_type, cosmetic_id));
    create table public.farm_cosmetics (user_id uuid, cosmetic_type text, cosmetic_id text, primary key(user_id, cosmetic_type, cosmetic_id));
    create table public.farm_crop_catalog (crop_id text primary key, seed_price integer default 1, growth_cost smallint default 1);
    create table public.farm_recipe_catalog (recipe_id text primary key, sell_price integer);
    create table public.farm_recipe_ingredients (recipe_id text references public.farm_recipe_catalog, crop_id text references public.farm_crop_catalog, quantity integer default 1, primary key(recipe_id, crop_id));
    create table public.farm_catalog_meta (id boolean primary key, catalog_version integer);
    insert into public.farm_catalog_meta values(true, 1);
    create table public.farm_inventory (user_id uuid, category text, item_id text, quantity integer check(quantity >= 0), primary key(user_id,category,item_id));
    create table public.farm_plots (user_id uuid, plot_index smallint, crop_id text, growth smallint default 0, fertilizer_id text, wilted boolean default false, last_free_water_at timestamptz, last_cared_at timestamptz, last_watered_on date, planted_on date, primary key(user_id,plot_index));
    create table public.test_actions (user_id uuid, request_id uuid, result jsonb, primary key(user_id,request_id));
    create function public.ensure_farm_user(uuid) returns void language sql as $$ select $$;
    create function public.farm_action_begin(uuid, uuid, text) returns jsonb language sql as $$ select result from public.test_actions where user_id=$1 and request_id=$2 $$;
    create function public.farm_action_finish(uuid, uuid, jsonb) returns jsonb language plpgsql as $$ begin insert into public.test_actions values($1,$2,$3); return $3; end $$;
    create function public.farm_plot_max_growth(text) returns smallint language sql as $$ select 3::smallint $$;
    create function public.farm_plot_json(public.farm_plots) returns jsonb language sql as $$ select to_jsonb($1) $$;
    create table public.user_focus_progress (user_id uuid primary key, progress_seconds integer default 0, recent_event_ids uuid[] default '{}', updated_at timestamptz);
    create table public.farm_wallets (user_id uuid primary key, coin_balance bigint default 0);
    create table public.farm_wallet_ledger (user_id uuid, currency text, amount bigint, balance_after bigint, reason text, reference_key text);
    create function public.apply_farm_wallet_change(uuid, text, bigint, text, text) returns bigint language plpgsql as $$ declare b bigint; begin update public.farm_wallets set coin_balance = coin_balance + $3 where user_id=$1 returning coin_balance into b; if b < 0 then raise exception 'FARM_INSUFFICIENT_COIN'; end if; return b; end $$;
    insert into public.farms(user_id) values('${user}');
    insert into public.farm_wallets values('${user}', 1000);
  `);
  for (const id of Object.keys(catalog.CROPS)) await db.query('insert into public.farm_crop_catalog values($1)', [id]);
  for (const [type, entries] of [['farm_theme',catalog.FARM_THEMES],['plot_skin',catalog.PLOT_SKINS],['label_effect',catalog.LABEL_EFFECTS]]) {
    for (const entry of entries) {
      await db.query('insert into public.farm_cosmetic_catalog values($1,$2,$3)', [type,entry.id,entry.price]);
      await db.query('insert into public.farm_cosmetics values($1,$2,$3)', [user,type,entry.id]);
    }
  }
  await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/054_farm_inventory_delta_precheck.sql'),'utf8'));
  await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/071_public_recipes_and_cosmetic_sets.sql'),'utf8'));
  await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/072_diverse_cosmetic_set_effects.sql'),'utf8'));
  for (const set of catalog.FARM_COSMETIC_SETS) {
    for (let mask=0; mask<8; mask++) {
      const ids = [set.farm_theme[0],set.plot_skin[0],set.label_effect[0]].map((id,i) => mask & (1<<i) ? id : null);
      await db.query('update public.farms set equipped_farm_theme=$1,equipped_plot_skin=$2,equipped_label_effect=$3',ids);
      assert.equal(await scalar('select public.farm_set_bonus_percent($1,$2)',[user,set.effect]), [0,1,5,10][ids.filter(Boolean).length]);
    }
  }
  await db.exec("update public.farms set equipped_farm_theme='cherryBlossom',equipped_plot_skin='lava',equipped_label_effect=null");
  assert.equal(await scalar("select public.farm_set_bonus_percent($1,'water')",[user]),1);
  assert.equal(await scalar("select public.farm_set_bonus_percent($1,'wilt')",[user]),1);
  await db.exec("update public.farms set equipped_farm_theme='volcano',equipped_plot_skin='lava',equipped_label_effect='flameBorder'");
  await db.exec(`insert into public.farm_plots(user_id,plot_index,crop_id,last_free_water_at,last_cared_at) values('${user}',0,'carrot',now()-interval '4 hours 29 minutes',now());`);
  await assert.rejects(db.query("select public.water_farm_plot(0::smallint,gen_random_uuid())"), /FARM_WATER_COOLDOWN/);
  await db.exec("update public.farm_plots set last_free_water_at=now()-interval '4 hours 30 minutes'");
  assert.ok(await scalar("select public.water_farm_plot(0::smallint,gen_random_uuid())"));
  assert.equal(await scalar('select growth from public.farm_plots'),1);
  await db.exec("update public.farms set equipped_farm_theme='cherryBlossom',equipped_plot_skin='cherryPetalFall',equipped_label_effect='cherryDrift'");
  await db.exec("update public.farm_plots set last_cared_at=now()-interval '26 hours 23 minutes'");
  await db.query('select public.refresh_farm_wilt($1)',[user]);
  assert.equal(await scalar('select wilted from public.farm_plots'),false);
  await db.exec("update public.farm_plots set last_cared_at=now()-interval '26 hours 24 minutes'");
  await db.query('select public.refresh_farm_wilt($1)',[user]);
  assert.equal(await scalar('select wilted from public.farm_plots'),true);
  // Losing ownership must not retain a server bonus even if an old equipped id remains.
  await db.exec("delete from public.farm_cosmetics where cosmetic_id='cherryDrift'");
  assert.equal(await scalar("select public.farm_set_bonus_percent($1,'wilt')",[user]),5);
  // Every set effect fires at its tier probability and never when nothing is equipped.
  for (const set of catalog.FARM_COSMETIC_SETS) {
    await db.query('update public.farms set equipped_farm_theme=$1,equipped_plot_skin=$2,equipped_label_effect=$3',[set.farm_theme[0],set.plot_skin[0],set.label_effect[0]]);
    await db.exec("insert into public.farm_cosmetics select '"+user+"',t,i from (values ('farm_theme','"+set.farm_theme[0]+"'),('plot_skin','"+set.plot_skin[0]+"'),('label_effect','"+set.label_effect[0]+"')) v(t,i) on conflict do nothing");
    const hits = await scalar('select count(*) from generate_series(1,4000) where public.farm_set_effect_triggers($1,$2)',[user,set.effect]);
    assert.ok(Number(hits) > 250 && Number(hits) < 600, `${set.id} full set triggered ${hits}/4000`);
  }
  await db.exec("update public.farms set equipped_farm_theme=null,equipped_plot_skin=null,equipped_label_effect=null");
  assert.equal(await scalar("select count(*) from generate_series(1,500) where public.farm_set_effect_triggers($1,'harvestDouble')",[user]), 0);
  // Each RPC reports its bonus and applies it exactly once when the effect fires.
  const equip = async id => { const set = catalog.FARM_COSMETIC_SETS.find(s => s.id === id); await db.query('update public.farms set equipped_farm_theme=$1,equipped_plot_skin=$2,equipped_label_effect=$3',[set.farm_theme[0],set.plot_skin[0],set.label_effect[0]]); };
  const until = async (sql, params, bonus, prepare) => {
    for (let i = 0; i < 400; i++) {
      if (prepare) await prepare();
      const r = await scalar(sql, [await scalar('select gen_random_uuid()'), ...params]);
      if (r.event.bonuses.includes(bonus)) return r;
    }
    assert.fail(`${bonus} never fired`);
  };
  await db.exec("insert into public.farm_inventory values('"+user+"','harvest','carrot',10000),('"+user+"','harvest','wheat',10000),('"+user+"','seed','carrot',0),('"+user+"','supply','luckyFertilizer',0) on conflict(user_id,category,item_id) do nothing");
  const plant = () => db.exec(`delete from public.farm_plots; insert into public.farm_plots(user_id,plot_index,crop_id,growth,fertilizer_id) values('${user}',0,'carrot',3,'luckyFertilizer')`);
  await equip('garden');
  let r = await until('select public.harvest_farm_plot(0::smallint,$1::uuid)', [], 'harvestDouble', plant);
  assert.ok(r.event.harvestAmount >= 4);
  await equip('frost');
  const before = Number(await scalar("select quantity from public.farm_inventory where category='supply' and item_id='luckyFertilizer'"));
  await until('select public.harvest_farm_plot(0::smallint,$1::uuid)', [], 'fertilizerReturn', plant);
  assert.ok(Number(await scalar("select quantity from public.farm_inventory where category='supply' and item_id='luckyFertilizer'")) > before);
  await equip('snow');
  await until('select public.harvest_farm_plot(0::smallint,$1::uuid)', [], 'seedReturn', plant);
  assert.ok(Number(await scalar("select quantity from public.farm_inventory where category='seed' and item_id='carrot'")) > 0);
  await equip('halloween');
  const coins = Number(await scalar('select coin_balance from public.farm_wallets'));
  await until('select public.harvest_farm_plot(0::smallint,$1::uuid)', [], 'harvestCoin', plant);
  assert.ok(Number(await scalar('select coin_balance from public.farm_wallets')) > coins);
  await equip('ocean');
  r = await until('select public.water_farm_plot(0::smallint,$1::uuid)', [], 'waterGrowth', () => db.exec(`delete from public.farm_plots; insert into public.farm_plots(user_id,plot_index,crop_id,growth) values('${user}',0,'carrot',0)`));
  assert.equal(r.plots[0].growth, 2);
  const recipeIngredients = Object.values(catalog.RECIPES)[0].ingredients;
  for (const id of recipeIngredients) await db.query("insert into public.farm_inventory values($1,'harvest',$2,10000) on conflict(user_id,category,item_id) do update set quantity=10000",[user,id]);
  await equip('valentine');
  r = await until("select public.cook_farm_recipe($2::text[],$1::uuid)", [recipeIngredients], 'cookDouble');
  assert.equal(r.event.foodAmount, 2);
  await equip('candy');
  r = await until("select public.cook_farm_recipe($2::text[],$1::uuid)", [recipeIngredients], 'ingredientSave');
  assert.ok(recipeIngredients.includes(r.event.refundedCropId));
  await equip('rainbow');
  r = await until("select public.buy_farm_seed('carrot',$1::uuid)", [], 'seedDouble');
  assert.equal(r.event.seedAmount, 2);
  console.log('SQL effects PASS: 12 effect probabilities and 9 RPC bonus paths');
  await db.exec("delete from public.farm_inventory where category='food'");
  const dbRecipes = await db.query('select recipe_id,sell_price from public.farm_recipe_catalog');
  assert.equal(dbRecipes.rows.length,Object.keys(catalog.RECIPES).length);
  for (const [id,recipe] of Object.entries(catalog.RECIPES)) {
    assert.equal(dbRecipes.rows.find(r=>r.recipe_id===id).sell_price,recipe.sellPrice);
    for (const crop of recipe.ingredients) await db.query("insert into public.farm_inventory values($1,'harvest',$2,3) on conflict(user_id,category,item_id) do update set quantity=3",[user,crop]);
    const request = await scalar('select gen_random_uuid()');
    const result = await scalar('select public.cook_farm_recipe($1::text[],$2::uuid)',[recipe.ingredients,request]);
    assert.equal(result.event.recipeId,id);
    assert.equal(result.event.firstDiscovery,undefined);
    assert.equal(result.discoveredRecipes,undefined);
    assert.deepEqual(await scalar('select public.cook_farm_recipe($1::text[],$2::uuid)',[recipe.ingredients,request]),result);
    assert.equal(await scalar("select quantity from public.farm_inventory where category='food' and item_id=$1",[id]),1);
  }
  await db.exec("update public.farm_inventory set quantity=0 where category='harvest' and item_id='cherry'");
  await assert.rejects(db.query("select public.cook_farm_recipe(array['cherry','wheat'],gen_random_uuid())"),/FARM_ITEM_OUT_OF_STOCK/);
  console.log(`SQL PASS: 96 set combinations, mixed sets, ownership, water/wilt boundaries, ${dbRecipes.rows.length} recipes and idempotent crafting`);
})().catch(error => { console.error(error); process.exitCode=1; }).finally(() => db.close());
