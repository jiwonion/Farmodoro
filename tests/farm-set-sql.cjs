// Run with PGLITE_MODULE pointing to an installed @electric-sql/pglite package.
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const ctx = vm.createContext({});
for (const name of ['CROPS', 'RECIPES', 'FARM_THEMES', 'PLOT_SKINS', 'FARM_COSMETIC_SETS']) {
  vm.runInContext(source.match(new RegExp(`const ${name} = [\\s\\S]*?;\\r?\\n`))[0], ctx);
}
const catalog = vm.runInContext('({CROPS,RECIPES,FARM_THEMES,PLOT_SKINS,FARM_COSMETIC_SETS})', ctx);
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
  for (const [type, entries] of [['farm_theme',catalog.FARM_THEMES],['plot_skin',catalog.PLOT_SKINS]]) {
    for (const entry of entries) {
      await db.query('insert into public.farm_cosmetic_catalog values($1,$2,$3)', [type,entry.id,entry.price]);
      await db.query('insert into public.farm_cosmetics values($1,$2,$3)', [user,type,entry.id]);
    }
  }
  await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/054_farm_inventory_delta_precheck.sql'),'utf8'));
  // Historical 071 still lists the retired nameplates, as production did.
  const sets071 = fs.readFileSync(path.join(root,'supabase/migrations/071_public_recipes_and_cosmetic_sets.sql'),'utf8');
  for (const [, id] of sets071.matchAll(/\('label_effect', '(\w+)'/g)) await db.query("insert into public.farm_cosmetic_catalog values('label_effect',$1,1200) on conflict do nothing", [id]);
  await db.exec(sets071);
  await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/072_diverse_cosmetic_set_effects.sql'),'utf8'));
  // 079: sets count only the theme and field (the rest of 079 needs tables this harness does not create).
  const retire = fs.readFileSync(path.join(root,'supabase/migrations/079_retire_label_effects_two_piece_sets.sql'),'utf8');
  const setFunctionStart = retire.indexOf('create or replace function public.farm_set_bonus_percent');
  await db.exec(retire.slice(setFunctionStart, retire.indexOf('$$;', setFunctionStart) + 3));
  await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/081_harvest_double_probability.sql'),'utf8'));
  await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/082_farm_set_percentages.sql'),'utf8'));
  for (const set of catalog.FARM_COSMETIC_SETS) {
    for (let mask=0; mask<4; mask++) {
      const ids = [set.farm_theme[0],set.plot_skin[0]].map((id,i) => mask & (1<<i) ? id : null);
      await db.query('update public.farms set equipped_farm_theme=$1,equipped_plot_skin=$2',ids);
      const tiers = [0,5,10];
      assert.equal(await scalar('select public.farm_set_bonus_percent($1,$2)',[user,set.effect]), tiers[ids.filter(Boolean).length]);
    }
  }
  await db.exec("update public.farms set equipped_farm_theme='cherryBlossom',equipped_plot_skin='lava'");
  assert.equal(await scalar("select public.farm_set_bonus_percent($1,'water')",[user]),5);
  assert.equal(await scalar("select public.farm_set_bonus_percent($1,'wilt')",[user]),5);
  const harvestSet = catalog.FARM_COSMETIC_SETS.find(set => set.effect === 'harvestDouble');
  await db.query('update public.farms set equipped_farm_theme=$1,equipped_plot_skin=$2',[harvestSet.farm_theme[0],'lava']);
  assert.equal(await scalar("select public.farm_set_bonus_percent($1,'harvestDouble')",[user]),5);
  assert.equal(await scalar("select public.farm_set_bonus_percent($1,'water')",[user]),5);
  assert.equal(await scalar("select public.farm_set_bonus_percent($1,'unknown')",[user]),0);
  await db.query('update public.farms set equipped_plot_skin=$1',[harvestSet.plot_skin[0]]);
  await db.query("delete from public.farm_cosmetics where user_id=$1 and cosmetic_type='plot_skin' and cosmetic_id=$2",[user,harvestSet.plot_skin[0]]);
  assert.equal(await scalar("select public.farm_set_bonus_percent($1,'harvestDouble')",[user]),5, 'an unowned equipped field cannot contribute a second piece');
  await db.query("insert into public.farm_cosmetics values($1,'plot_skin',$2)",[user,harvestSet.plot_skin[0]]);
  assert.equal(await scalar("select public.farm_set_bonus_percent($1,'harvestDouble')",[user]),10);
  for (const role of ['public', 'anon', 'authenticated']) {
    if (role === 'public') {
      const publicGrant = await scalar("select exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid='public.farm_set_bonus_percent(uuid,text)'::regprocedure and acl.grantee=0 and acl.privilege_type='EXECUTE')");
      assert.equal(publicGrant,false, 'PUBLIC has no direct execute grant');
    } else {
      assert.equal(await scalar("select has_function_privilege($1,'public.farm_set_bonus_percent(uuid,text)','execute')",[role]),false);
    }
  }
  await db.exec("update public.farms set equipped_farm_theme='volcano',equipped_plot_skin='lava'");
  await db.exec(`insert into public.farm_plots(user_id,plot_index,crop_id,last_free_water_at,last_cared_at) values('${user}',0,'carrot',now()-interval '4 hours 29 minutes',now());`);
  await assert.rejects(db.query("select public.water_farm_plot(0::smallint,gen_random_uuid())"), /FARM_WATER_COOLDOWN/);
  await db.exec("update public.farm_plots set last_free_water_at=now()-interval '4 hours 30 minutes'");
  assert.ok(await scalar("select public.water_farm_plot(0::smallint,gen_random_uuid())"));
  assert.equal(await scalar('select growth from public.farm_plots'),1);
  await db.exec("update public.farms set equipped_farm_theme='cherryBlossom',equipped_plot_skin='cherryPetalFall'");
  await db.exec("update public.farm_plots set last_cared_at=now()-interval '26 hours 23 minutes'");
  await db.query('select public.refresh_farm_wilt($1)',[user]);
  assert.equal(await scalar('select wilted from public.farm_plots'),false);
  await db.exec("update public.farm_plots set last_cared_at=now()-interval '26 hours 24 minutes'");
  await db.query('select public.refresh_farm_wilt($1)',[user]);
  assert.equal(await scalar('select wilted from public.farm_plots'),true);
  // Losing ownership must not retain a server bonus even if an old equipped id remains.
  await db.exec("delete from public.farm_cosmetics where cosmetic_id='cherryPetalFall'");
  assert.equal(await scalar("select public.farm_set_bonus_percent($1,'wilt')",[user]),5);
  // Every set effect fires at its tier probability and never when nothing is equipped.
  for (const set of catalog.FARM_COSMETIC_SETS) {
    await db.query('update public.farms set equipped_farm_theme=$1,equipped_plot_skin=$2',[set.farm_theme[0],set.plot_skin[0]]);
    await db.exec("insert into public.farm_cosmetics select '"+user+"',t,i from (values ('farm_theme','"+set.farm_theme[0]+"'),('plot_skin','"+set.plot_skin[0]+"')) v(t,i) on conflict do nothing");
    const hits = await scalar('select count(*) from generate_series(1,4000) where public.farm_set_effect_triggers($1,$2)',[user,set.effect]);
    const [minimum, maximum] = [280, 520];
    assert.ok(Number(hits) > minimum && Number(hits) < maximum, `${set.id} full set triggered ${hits}/4000`);
  }
  await db.exec("update public.farms set equipped_farm_theme=null,equipped_plot_skin=null");
  assert.equal(await scalar("select count(*) from generate_series(1,500) where public.farm_set_effect_triggers($1,'harvestDouble')",[user]), 0);
  // Each RPC reports its bonus and applies it exactly once when the effect fires.
  const equip = async id => { const set = catalog.FARM_COSMETIC_SETS.find(s => s.id === id); await db.query('update public.farms set equipped_farm_theme=$1,equipped_plot_skin=$2',[set.farm_theme[0],set.plot_skin[0]]); };
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
  // Control only this isolated fixture's RNG to exercise the real trigger
  // and harvest RPC exactly below and at each probability threshold.
  const originalRandom = await scalar("select pg_get_functiondef('pg_catalog.random()'::regprocedure)");
  const originalTrigger = await scalar("select pg_get_functiondef('public.farm_set_effect_triggers(uuid,text)'::regprocedure)");
  await db.exec("create or replace function pg_catalog.random() returns double precision language sql volatile as $$ select current_setting('test.set_roll')::double precision $$");
  // Recreate the unchanged production definition to discard its cached
  // function plan, which otherwise retains PostgreSQL's built-in RNG.
  await db.exec(originalTrigger);
  try {
    for (const [pieces, threshold] of [[1,0.05],[2,0.10]]) {
      await db.query('update public.farms set equipped_farm_theme=$1,equipped_plot_skin=$2',[harvestSet.farm_theme[0],pieces === 2 ? harvestSet.plot_skin[0] : null]);
      for (const [roll, doubles] of [[threshold - 0.000001,true],[threshold,false],[threshold + 0.000001,false]]) {
        await db.query("select set_config('test.set_roll',$1,false)",[String(roll)]);
        assert.equal(await scalar("select public.farm_set_effect_triggers($1,'harvestDouble')",[user]),doubles,
          `${pieces} pieces: roll ${roll}, random ${await scalar('select random()')}, tier ${await scalar("select public.farm_set_bonus_percent($1,'harvestDouble')",[user])}`);
        await db.exec(`delete from public.farm_plots; insert into public.farm_plots(user_id,plot_index,crop_id,growth) values('${user}',0,'carrot',3)`);
        const request = await scalar('select gen_random_uuid()');
        const inventoryBefore = Number(await scalar("select quantity from public.farm_inventory where category='harvest' and item_id='carrot'"));
        const result = await scalar('select public.harvest_farm_plot(0::smallint,$1::uuid)',[request]);
        assert.equal(result.event.harvestAmount,doubles ? 2 : 1);
        assert.equal(result.event.bonuses.includes('harvestDouble'),doubles);
        assert.equal(Number(await scalar("select quantity from public.farm_inventory where category='harvest' and item_id='carrot'")),inventoryBefore + result.event.harvestAmount);
        assert.deepEqual(await scalar('select public.harvest_farm_plot(0::smallint,$1::uuid)',[request]),result);
        assert.equal(Number(await scalar("select quantity from public.farm_inventory where category='harvest' and item_id='carrot'")),inventoryBefore + result.event.harvestAmount, 'a replay cannot harvest twice');
      }
    }
    // All eleven other effects use the same 5%/10% thresholds.
    for (const set of catalog.FARM_COSMETIC_SETS.filter(set => set.effect !== 'harvestDouble')) {
      for (const [pieces, threshold] of [[1,0.05],[2,0.10]]) {
        await db.query('update public.farms set equipped_farm_theme=$1,equipped_plot_skin=$2',[set.farm_theme[0],pieces === 2 ? set.plot_skin[0] : null]);
        for (const [roll, triggers] of [[threshold - 0.000001,true],[threshold,false]]) {
          await db.query("select set_config('test.set_roll',$1,false)",[String(roll)]);
          assert.equal(await scalar('select public.farm_set_effect_triggers($1,$2)',[user,set.effect]),triggers, `${set.effect} ${pieces} piece threshold`);
        }
      }
    }
  } finally {
    await db.exec(originalRandom);
    await db.exec(originalTrigger);
  }
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
  console.log(`SQL PASS: 48 two-piece set combinations, mixed sets, ownership, water/wilt boundaries, ${dbRecipes.rows.length} recipes and idempotent crafting`);
})().catch(error => { console.error(error); process.exitCode=1; }).finally(() => db.close());
