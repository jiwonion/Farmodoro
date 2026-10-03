// PGLITE_MODULE must point to an installed @electric-sql/pglite package.
// Runs the actual migration/RPCs in an isolated PostgreSQL database.
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const user = '00000000-0000-0000-0000-000000000001';
const otherUser = '00000000-0000-0000-0000-000000000002';
const db = new PGlite();
const source = name => fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8');
const scalar = async (sql, params) => Object.values((await db.query(sql, params)).rows[0])[0];
const migrateFunction = async (file, name) => {
  const sql = source(file).match(new RegExp(`create or replace function public\\.${name}\\([^]*?\\$\\$;`, 'i'));
  assert.ok(sql, `missing ${name}`);
  await db.exec(sql[0]);
};
const plant = (index, crop = 'carrot', request = randomUUID()) => scalar(
  'select public.buy_and_plant_farm_seed($1::smallint,$2::text,$3::uuid)', [index, crop, request]);
const cook = (id, quantity = 1, request = randomUUID()) => scalar(
  'select public.cook_my_farm_recipe($1::text,$2::integer,$3::uuid)', [id, quantity, request]);
const sell = (request = randomUUID()) => scalar('select public.sell_all_my_farm_food($1::uuid)', [request]);
const inventory = (category, id) => scalar(
  'select coalesce((select quantity from public.farm_inventory where user_id=$1 and category=$2 and item_id=$3),0)',
  [user, category, id]);
const setUser = id => scalar("select set_config('app.test_user',$1,false)", [id || '']);
const setQuantity = (category, id, quantity) => db.query(
  'insert into public.farm_inventory(user_id,category,item_id,quantity) values($1,$2,$3,$4) on conflict(user_id,category,item_id) do update set quantity=excluded.quantity',
  [user, category, id, quantity]);

(async () => {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    insert into auth.users values('${user}'),('${otherUser}');
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('app.test_user',true),'')::uuid $$;
    grant usage on schema auth to authenticated;
    create table public.farms (
      user_id uuid primary key, farm_name text default 'My farm', production_boost_until timestamptz,
      wilt_protection_until timestamptz, equipped_farm_theme text, equipped_plot_skin text, equipped_label_effect text
    );
    create table public.farm_wallets (user_id uuid primary key,coin_balance bigint default 0,farm_money_balance bigint default 0);
    create table public.farm_wallet_idempotency (user_id uuid,currency text,reference_key text,primary key(user_id,currency,reference_key));
    create table public.farm_wallet_ledger (user_id uuid,currency text,amount bigint,balance_after bigint,reason text,reference_key text);
    create table public.farm_weekly_earnings (user_id uuid,week_start date,earned_farm_money bigint default 0,primary key(user_id,week_start));
    create table public.farm_inventory (
      user_id uuid,category text,item_id text,quantity integer not null check(quantity>=0),primary key(user_id,category,item_id)
    );
    create table public.farm_plots (
      user_id uuid,plot_index smallint,crop_id text,growth smallint default 0,
      planted_on date,last_watered_on date,last_free_water_at timestamptz,last_cared_at timestamptz,
      wilted boolean default false,fertilizer_id text,primary key(user_id,plot_index)
    );
    create table public.farm_cosmetics (user_id uuid,cosmetic_type text,cosmetic_id text,primary key(user_id,cosmetic_type,cosmetic_id));
    create table public.farm_market_rotations (
      user_id uuid,rotation_date date,seed_offer_ids text[],food_offer_ids text[],crop_sell_offer_ids text[],cosmetic_offer_ids text[],
      primary key(user_id,rotation_date)
    );
    create table public.user_focus_progress (
      user_id uuid primary key,progress_seconds integer default 0,recent_event_ids uuid[] default '{}',updated_at timestamptz
    );
    create function public.get_my_farm_state_v5() returns jsonb language sql as $$ select '{}'::jsonb $$;
  `);
  await setUser(user);
  await migrateFunction('006_farm_economy_inventory_mail.sql', 'current_farm_week_start');
  await migrateFunction('041_farm_plot_grid_reduction.sql', 'ensure_farm_user');
  await migrateFunction('037_wallet_and_farm_state_hardening.sql', 'apply_farm_wallet_change');
  await db.exec(source('051_farm_catalogs_and_action_log.sql'));
  await db.exec(source('054_farm_inventory_delta_precheck.sql'));
  await db.exec(source('071_public_recipes_and_cosmetic_sets.sql'));
  await db.exec(source('072_diverse_cosmetic_set_effects.sql'));
  await db.exec(source('075_focus_farm_growth.sql'));
  await db.exec(source('076_garden_decorations_and_simple_kitchen.sql'));
  await db.exec(source('077_garden_theme_and_decoration_collection.sql'));
  await db.exec(source('078_retire_farm_decorations.sql'));
  await scalar('select public.ensure_farm_user($1::uuid)', [user]);
  await scalar('select public.ensure_farm_user($1::uuid)', [otherUser]);
  await db.query('update public.farm_wallets set coin_balance=100,farm_money_balance=10000 where user_id=$1', [user]);

  // Existing seeds cost no Coin; new ones are bought and planted atomically.
  await setQuantity('seed', 'carrot', 2);
  const ownedSeed = await plant(0);
  assert.equal(ownedSeed.event.usedOwnedSeed, true);
  assert.equal(ownedSeed.wallet.coinBalance, 100);
  assert.equal(await inventory('seed', 'carrot'), 1);
  assert.ok(ownedSeed.plots[0].focusCropInstanceId);
  const purchaseId = randomUUID();
  const purchasedSeed = await plant(1, 'strawberry', purchaseId);
  const strawberryPrice = await scalar("select seed_price from public.farm_crop_catalog where crop_id='strawberry'");
  assert.equal(purchasedSeed.event.usedOwnedSeed, false);
  assert.equal(purchasedSeed.wallet.coinBalance, 100 - strawberryPrice);
  assert.equal(await inventory('seed', 'strawberry'), 0);
  assert.deepEqual(await plant(1, 'strawberry', purchaseId), purchasedSeed);
  await assert.rejects(plant(1), /FARM_PLOT_OCCUPIED/);
  await assert.rejects(plant(3), /FARM_PLOT_NOT_FOUND/);
  await assert.rejects(plant(2, 'unknown'), /FARM_UNKNOWN_CROP/);
  await db.query('update public.farm_wallets set coin_balance=0 where user_id=$1', [user]);
  await assert.rejects(plant(2, 'strawberry'), /FARM_INSUFFICIENT_COIN/);
  assert.equal(await scalar('select crop_id from public.farm_plots where user_id=$1 and plot_index=2', [user]), null);
  assert.equal(await inventory('seed', 'strawberry'), 0);
  // Even a negative legacy Coin balance can use already owned seeds.
  await db.query('update public.farm_wallets set coin_balance=-1 where user_id=$1', [user]);
  await plant(2);
  assert.equal(await inventory('seed', 'carrot'), 0);
  await db.query('update public.farm_wallets set coin_balance=100 where user_id=$1', [user]);
  await db.exec("create or replace function public.farm_set_effect_triggers(p_user_id uuid,p_effect text) returns boolean language sql as $$ select $2='seedDouble' $$");
  assert.deepEqual((await plant(4, 'strawberry')).event.bonuses, ['seedDouble']);
  assert.equal(await inventory('seed', 'strawberry'), 1);
  await db.exec("create or replace function public.farm_set_effect_triggers(p_user_id uuid,p_effect text) returns boolean language sql as $$ select false $$");

  const catalog = await scalar('select public.get_farm_catalog()');
  assert.equal(Object.keys(catalog.recipes).length, 43);
  assert.equal(catalog.decorations, undefined, 'Retired decorations are absent from the public catalog');
  // All catalog recipes, including exact repeated ingredients, can be cooked.
  for (const [id, recipe] of Object.entries(catalog.recipes)) {
    for (const crop of new Set(recipe.ingredients)) await setQuantity('harvest', crop, 20);
    const cookId = randomUUID();
    const cooked = await cook(id, 3, cookId);
    assert.equal(cooked.event.recipeId, id);
    assert.equal(cooked.event.foodAmount, 3);
    assert.equal(cooked.event.quantity, 3);
    assert.deepEqual(await cook(id, 3, cookId), cooked);
    assert.equal(await inventory('food', id), 3);
    const amounts = recipe.ingredients.reduce((counts, crop) => ({...counts,[crop]:(counts[crop] || 0)+1}), {});
    for (const [crop, amount] of Object.entries(amounts)) assert.equal(await inventory('harvest', crop), 20 - amount*3);
  }
  const recipeId = Object.keys(catalog.recipes)[0];
  const recipe = catalog.recipes[recipeId];
  await assert.rejects(cook(recipeId, 1, purchaseId), /FARM_REQUEST_ID_REUSED/);
  await assert.rejects(plant(5, 'carrot', null), /FARM_INVALID_REQUEST_ID/);
  // Repeated ingredients are expanded by the catalog and consumed by count.
  const repeatedCrop = recipe.ingredients[0];
  const originalUnits = await scalar('select quantity from public.farm_recipe_ingredients where recipe_id=$1 and crop_id=$2', [recipeId,repeatedCrop]);
  await db.query('update public.farm_recipe_ingredients set quantity=quantity+1 where recipe_id=$1 and crop_id=$2', [recipeId,repeatedCrop]);
  const repeatedCatalog = await scalar('select public.get_farm_catalog()');
  assert.equal(repeatedCatalog.recipes[recipeId].ingredients.filter(c=>c===repeatedCrop).length, originalUnits + 1);
  for (const crop of new Set(recipe.ingredients)) await setQuantity('harvest', crop, 20);
  await cook(recipeId, 2);
  assert.equal(await inventory('harvest', repeatedCrop), 20 - (originalUnits+1)*2);
  await db.query('update public.farm_recipe_ingredients set quantity=$3 where recipe_id=$1 and crop_id=$2', [recipeId,repeatedCrop,originalUnits]);
  await assert.rejects(cook(recipeId, 0), /FARM_INVALID_QUANTITY/);
  await assert.rejects(cook(recipeId, 101), /FARM_INVALID_QUANTITY/);
  await assert.rejects(cook('unknown'), /FARM_UNKNOWN_RECIPE/);
  for (const crop of new Set(recipe.ingredients)) await setQuantity('harvest', crop, 10);
  await setQuantity('harvest', recipe.ingredients.at(-1), 0);
  const beforeMissing = await db.query('select * from public.farm_inventory where user_id=$1 order by category,item_id', [user]);
  const missingId = randomUUID();
  await assert.rejects(cook(recipeId, 2, missingId), /FARM_ITEM_OUT_OF_STOCK/);
  assert.deepEqual((await db.query('select * from public.farm_inventory where user_id=$1 order by category,item_id', [user])).rows, beforeMissing.rows);
  assert.equal(await scalar('select count(*) from public.farm_action_log where user_id=$1 and request_id=$2', [user,missingId]), 0);

  // Batched crafting retains independent cookDouble and ingredientSave rolls.
  for (const crop of new Set(recipe.ingredients)) await setQuantity('harvest', crop, 20);
  await setQuantity('food', recipeId, 0);
  await db.exec("create or replace function public.farm_set_effect_triggers(p_user_id uuid,p_effect text) returns boolean language sql as $$ select $2 in ('cookDouble','ingredientSave') $$");
  const bonusCook = await cook(recipeId, 4);
  assert.equal(bonusCook.event.foodAmount, 8);
  assert.equal(bonusCook.event.refundedCropIds.length, 4);
  assert.deepEqual(bonusCook.event.bonuses.sort(), ['cookDouble','ingredientSave']);
  assert.equal(await inventory('food', recipeId), 8);
  const harvestTotal = (await Promise.all([...new Set(recipe.ingredients)].map(c => inventory('harvest', c)))).reduce((a,b)=>a+b,0);
  assert.equal(harvestTotal, new Set(recipe.ingredients).size*20 - recipe.ingredients.length*4 + 4);
  await setQuantity('food', recipeId, 99999);
  const beforeOverflow = await db.query('select * from public.farm_inventory where user_id=$1 order by category,item_id', [user]);
  await assert.rejects(cook(recipeId, 1), /FARM_FOOD_INVENTORY_FULL/);
  assert.deepEqual((await db.query('select * from public.farm_inventory where user_id=$1 order by category,item_id', [user])).rows, beforeOverflow.rows);
  await db.exec("create or replace function public.farm_set_effect_triggers(p_user_id uuid,p_effect text) returns boolean language sql as $$ select false $$");

  // Kitchen sales require no rotation and credit all foods exactly once.
  await db.query("delete from public.farm_inventory where user_id=$1 and category='food'", [user]);
  const recipes = Object.entries(catalog.recipes).slice(0, 2);
  for (const [id] of recipes) await setQuantity('food', id, 3);
  const expectedSale = recipes.reduce((n,[id,r])=>n+r.sellPrice*3, 0);
  const beforeMoney = Number(await scalar('select farm_money_balance from public.farm_wallets where user_id=$1', [user]));
  const sellId = randomUUID();
  const sold = await sell(sellId);
  assert.equal(sold.event.saleAmount, expectedSale);
  assert.equal(sold.event.soldCount, 6);
  assert.equal(sold.wallet.farmMoneyBalance, beforeMoney + expectedSale);
  assert.deepEqual(await sell(sellId), sold);
  assert.equal((await db.query('select * from public.farm_market_rotations')).rows.length, 0);
  for (const [id] of recipes) assert.equal(await inventory('food', id), 0);
  await assert.rejects(sell(), /FARM_NO_FOOD_TO_SELL/);
  await assert.rejects(scalar("select public.sell_farm_crop_bundle('carrot',5::smallint,$1::uuid)", [randomUUID()]), /FARM_CROP_SALE_RETIRED/);
  // Large inventories credit through the real wallet cap and track earnings.
  await setQuantity('food', recipeId, 5000);
  await db.exec("create or replace function public.farm_set_bonus_percent(p_user_id uuid,p_effect text) returns integer language sql as $$ select case when $2='saleDouble' then 100 else 0 end $$");
  const largePrice = catalog.recipes[recipeId].sellPrice * 10000;
  const largeSale = await sell();
  assert.equal(largeSale.event.saleAmount, largePrice);
  assert.equal(largeSale.event.saleBonusFoodCount, 5000);
  assert.deepEqual(largeSale.event.bonuses, ['saleDouble']);
  assert.equal(largeSale.weeklyFarmMoneyEarned, expectedSale + largePrice);
  const saleCredits = (await db.query("select amount from public.farm_wallet_ledger where reason='주방 음식 모두 판매'")).rows;
  assert.ok(saleCredits.length > 0);
  assert.ok(saleCredits.every(row => Number(row.amount) > 0 && Number(row.amount) <= 10000));

  // A wallet failure rolls back all sold dishes and their idempotency record.
  await setQuantity('food', recipeId, 2);
  const beforeSaleBalance = Number(await scalar('select farm_money_balance from public.farm_wallets where user_id=$1', [user]));
  await db.exec(`alter table public.farm_wallets add constraint test_sale_limit check(farm_money_balance<=${beforeSaleBalance})`);
  const failedSaleId = randomUUID();
  await assert.rejects(sell(failedSaleId), /test_sale_limit/);
  assert.equal(await inventory('food', recipeId), 2);
  await db.exec('alter table public.farm_wallets drop constraint test_sale_limit');
  assert.equal((await sell(failedSaleId)).event.soldCount, 2);
  assert.equal(await inventory('food', recipeId), 0);

  await setUser(null);
  for (const action of [()=>plant(5),()=>cook(recipeId),sell]) {
    await assert.rejects(action(), /Authentication required/);
  }
  console.log('SQL PASS: atomic owned-seed-first planting, all 43 batch recipes, per-item bonuses, unrestricted food sales, wallet limits, retry deduplication and rollback');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.close());

