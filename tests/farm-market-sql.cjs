// PGLITE_MODULE may point to a local @electric-sql/pglite installation.
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const db = new PGlite();
const user = '00000000-0000-0000-0000-000000000001';
const row = async () => (await db.query('select * from farm_market_rotations')).rows[0];
const checkOffers = record => {
  for (const field of ['seed_offer_ids', 'food_offer_ids', 'crop_sell_offer_ids']) {
    assert.equal(record[field].length, 7, field);
    assert.equal(new Set(record[field].map(id => id.split(':')[0])).size, 7, field + ' unique');
  }
  assert.equal(record.cosmetic_offer_ids.length, 3);
};
(async () => {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$select '${user}'::uuid$$;
    create table farm_market_rotations(user_id uuid, rotation_date date,
      seed_offer_ids text[] default '{}', food_offer_ids text[] default '{}',
      crop_sell_offer_ids text[] default '{}', cosmetic_offer_ids text[] default '{}',
      primary key(user_id, rotation_date),
      constraint farm_market_seed_offer_count check(cardinality(seed_offer_ids)<=6),
      constraint farm_market_food_offer_count check(cardinality(food_offer_ids)<=6),
      constraint farm_market_crop_sell_offer_count check(cardinality(crop_sell_offer_ids)<=6));
    create table farm_crop_catalog(crop_id text primary key);
    create table farm_recipe_catalog(recipe_id text primary key);
    create table farm_cosmetic_catalog(cosmetic_type text, cosmetic_id text);
    create table farm_cosmetics(user_id uuid, cosmetic_type text, cosmetic_id text);
    insert into farm_crop_catalog select 'crop' || n from generate_series(1,12) n;
    insert into farm_recipe_catalog select 'recipe' || n from generate_series(1,12) n;
    insert into farm_cosmetic_catalog select 'farm_theme', 'theme' || n from generate_series(1,5) n;
    create table test_actions(user_id uuid, request_id uuid, result jsonb, primary key(user_id,request_id));
    create table test_inventory(quantity int check(quantity>=0));
    insert into test_inventory values(3);
    create function ensure_farm_user(uuid) returns void language sql as $$select$$;
    create function farm_action_begin(uuid,uuid,text) returns jsonb language sql as $$select result from public.test_actions where user_id=$1 and request_id=$2$$;
    create function farm_action_finish(uuid,uuid,jsonb) returns jsonb language plpgsql as $$begin insert into public.test_actions values($1,$2,$3); return $3; end$$;
    create function apply_farm_inventory_delta(uuid,text,text,int) returns int language plpgsql as $$declare q int; begin update public.test_inventory set quantity=quantity+$4 returning quantity into q; return q; end$$;
    create function farm_market_rotation_json(farm_market_rotations) returns jsonb language sql as $$select to_jsonb($1)$$;
    insert into farm_market_rotations values('${user}',(now() at time zone 'Asia/Seoul')::date,
      array(select crop_id from farm_crop_catalog limit 6),
      array(select recipe_id from farm_recipe_catalog limit 6),
      array(select crop_id || ':5' from farm_crop_catalog limit 6),'{}');
  `);
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/073_seven_market_offers.sql'),'utf8'));
  // Migration leaves existing stock untouched until the next authenticated read.
  assert.equal((await row()).seed_offer_ids.length, 6);
  await db.query('select ensure_farm_market_rotation($1)',[user]);
  const initial = await row(); checkOffers(initial);
  await db.query('select ensure_farm_market_rotation($1)',[user]);
  assert.deepEqual(await row(),initial,'reading again must not reroll');
  const request = '00000000-0000-0000-0000-000000000002';
  await db.query("select use_farm_market_refresh('seedMarketRefresh',$1)",[request]);
  const refreshed = await row(); checkOffers(refreshed);
  assert.deepEqual(refreshed.food_offer_ids,initial.food_offer_ids);
  await db.query("select use_farm_market_refresh('seedMarketRefresh',$1)",[request]);
  assert.deepEqual(await row(),refreshed,'retry must not reroll');
  await db.query("select use_farm_market_refresh('foodMarketRefresh',gen_random_uuid())");
  const foodRefresh = await row(); checkOffers(foodRefresh);
  assert.deepEqual(foodRefresh.seed_offer_ids,refreshed.seed_offer_ids);
  assert.equal((await db.query('select quantity from test_inventory')).rows[0].quantity,1);
  for (const field of ['seed_offer_ids','food_offer_ids','crop_sell_offer_ids']) {
    await assert.rejects(db.exec(`update farm_market_rotations set ${field}=array_fill('x'::text,array[8])`), /check constraint/);
  }
  console.log('Seven unique offers, six-to-seven upgrade, stable reads, both refresh tickets, idempotency and limits PASS');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>db.close());
