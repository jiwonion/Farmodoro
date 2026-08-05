begin;

-- Groundwork for migration 052 (per-action farm RPCs, replacing the
-- whole-snapshot save_my_farm_state). Two things a per-action RPC needs
-- that the snapshot save never did: (1) server-side prices/costs to
-- validate against, instead of trusting whatever the client's local CROPS/
-- RECIPES/FARM_ITEMS constants say the price was; (2) per-action
-- idempotency, since apply_farm_wallet_change's idempotency table (032)
-- only protects the wallet half of an action -- a retried "harvest" call
-- could still double the inventory even though it can't double the coins.

-- ---------------------------------------------------------------------
-- Catalogs: the server's own copy of what app.js's CROPS/RECIPES/
-- FARM_ITEMS/COSMETIC_CATALOGS constants already say. Reference data, not
-- user data -- every authenticated user can read all of it.
-- ---------------------------------------------------------------------

create table if not exists public.farm_crop_catalog (
  crop_id text primary key,
  seed_price integer not null check (seed_price >= 0),
  sell_price integer not null check (sell_price >= 0),
  growth_cost smallint not null check (growth_cost > 0)
);

create table if not exists public.farm_recipe_catalog (
  recipe_id text primary key,
  sell_price integer not null check (sell_price >= 0)
);

create table if not exists public.farm_recipe_ingredients (
  recipe_id text not null references public.farm_recipe_catalog (recipe_id) on delete cascade,
  crop_id text not null references public.farm_crop_catalog (crop_id),
  quantity smallint not null default 1 check (quantity > 0),
  primary key (recipe_id, crop_id)
);

create table if not exists public.farm_supply_catalog (
  item_id text primary key,
  price integer not null check (price >= 0),
  item_type text not null check (item_type in ('plot', 'instant', 'target', 'market'))
);

create table if not exists public.farm_cosmetic_catalog (
  cosmetic_type text not null check (cosmetic_type in ('farm_theme', 'plot_skin', 'label_effect')),
  cosmetic_id text not null,
  price integer not null check (price >= 0),
  primary key (cosmetic_type, cosmetic_id)
);

create table if not exists public.farm_catalog_meta (
  id boolean primary key default true check (id),
  catalog_version integer not null default 1
);

do $catalog_rls$
declare
  table_name text;
begin
  foreach table_name in array array[
    'farm_crop_catalog', 'farm_recipe_catalog', 'farm_recipe_ingredients',
    'farm_supply_catalog', 'farm_cosmetic_catalog', 'farm_catalog_meta'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format(
      'drop policy if exists "Authenticated users can read %s" on public.%I',
      table_name, table_name
    );
    execute format(
      'create policy "Authenticated users can read %s" on public.%I for select to authenticated using (true)',
      table_name, table_name
    );
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    execute format('grant select on table public.%I to authenticated', table_name);
  end loop;
end
$catalog_rls$;

-- Seed data, mirroring app.js's CROPS / CROP_GROWTH_COSTS exactly.
insert into public.farm_crop_catalog (crop_id, seed_price, sell_price, growth_cost) values
  ('carrot', 1, 5, 3), ('tomato', 2, 9, 4), ('corn', 3, 12, 4), ('potato', 2, 8, 3),
  ('sweetPotato', 3, 11, 4), ('strawberry', 3, 13, 4), ('eggplant', 3, 12, 4),
  ('pepper', 3, 12, 4), ('cucumber', 2, 10, 4), ('pumpkin', 4, 16, 5),
  ('onion', 2, 9, 3), ('garlic', 2, 9, 3), ('cabbage', 3, 11, 3), ('broccoli', 3, 13, 3),
  ('watermelon', 5, 20, 5), ('melon', 5, 20, 5), ('rice', 3, 14, 3),
  ('mushroom', 4, 15, 2), ('sunflower', 4, 15, 4), ('beet', 3, 12, 3),
  ('radish', 2, 9, 2), ('turnip', 3, 11, 3), ('chili', 3, 13, 4), ('lettuce', 2, 8, 2),
  ('spinach', 2, 9, 2), ('kale', 3, 11, 3), ('celery', 3, 12, 3), ('pea', 3, 12, 2),
  ('bean', 3, 12, 4), ('peanut', 3, 13, 4), ('wheat', 3, 13, 3), ('barley', 3, 13, 3),
  ('oat', 3, 14, 3), ('grape', 5, 21, 5), ('blueberry', 5, 21, 5), ('raspberry', 5, 22, 5),
  ('apple', 6, 25, 6), ('pear', 6, 25, 6), ('peach', 6, 26, 6), ('cherry', 6, 26, 6),
  ('lemon', 6, 25, 6), ('orange', 6, 25, 6), ('pineapple', 7, 29, 5), ('kiwi', 6, 27, 6),
  ('pumpkinSquash', 4, 17, 4), ('daikon', 2, 9, 2), ('edamame', 3, 13, 4),
  ('bokchoy', 2, 8, 2), ('chestnut', 6, 26, 6), ('fig', 6, 25, 6), ('plum', 5, 21, 5),
  ('mango', 7, 30, 5), ('passionFruit', 6, 26, 5), ('bellFlower', 3, 13, 3),
  ('sweetCorn', 4, 17, 4), ('truffle', 6, 27, 3), ('lavender', 4, 16, 3)
on conflict (crop_id) do update
  set seed_price = excluded.seed_price,
      sell_price = excluded.sell_price,
      growth_cost = excluded.growth_cost;

-- Mirrors app.js's RECIPES.
insert into public.farm_recipe_catalog (recipe_id, sell_price) values
  ('countryStew', 34), ('sunsetSoup', 38), ('berryParfait', 60), ('berryTart', 46),
  ('mushroomRice', 44), ('pumpkinSoup', 50), ('appleJam', 74), ('gardenSalad', 54),
  ('ratatouille', 62), ('farmPizza', 66), ('friedRice', 60), ('tropicalPunch', 94),
  ('cornChowder', 58), ('gazpacho', 56), ('beetAppleJuice', 62), ('broccoliMushroom', 46),
  ('cabbageRiceRoll', 44), ('applePie', 70), ('blueberryCake', 90), ('grapePeachPunch', 76),
  ('pumpkinPorridge', 52), ('spicyPeanut', 50), ('carrotOrangeJuice', 60),
  ('pearKiwiSmoothie', 82), ('watermelonBerryPunch', 72), ('barleyMushroomPilaf', 60),
  ('oatBlueberryPorridge', 66), ('kabochaCurry', 48), ('bokchoyStirFry', 36),
  ('edamameSalad', 38), ('chestnutRiceCake', 58), ('figCheesePlatter', 76),
  ('plumSorbet', 68), ('mangoSticky', 86), ('passionYogurt', 78), ('bellFlowerNamul', 46),
  ('sweetCornCheeseBake', 52), ('truffleRisotto', 96), ('lavenderTea', 50)
on conflict (recipe_id) do update set sell_price = excluded.sell_price;

insert into public.farm_recipe_ingredients (recipe_id, crop_id) values
  ('countryStew', 'carrot'), ('countryStew', 'potato'),
  ('sunsetSoup', 'tomato'), ('sunsetSoup', 'corn'),
  ('berryParfait', 'strawberry'), ('berryParfait', 'melon'),
  ('berryTart', 'wheat'), ('berryTart', 'strawberry'),
  ('mushroomRice', 'rice'), ('mushroomRice', 'mushroom'),
  ('pumpkinSoup', 'pumpkin'), ('pumpkinSoup', 'onion'),
  ('appleJam', 'apple'), ('appleJam', 'lemon'),
  ('gardenSalad', 'cabbage'), ('gardenSalad', 'carrot'), ('gardenSalad', 'cucumber'),
  ('ratatouille', 'eggplant'), ('ratatouille', 'tomato'), ('ratatouille', 'pepper'),
  ('farmPizza', 'wheat'), ('farmPizza', 'tomato'), ('farmPizza', 'corn'),
  ('friedRice', 'rice'), ('friedRice', 'pepper'), ('friedRice', 'pea'),
  ('tropicalPunch', 'pineapple'), ('tropicalPunch', 'orange'), ('tropicalPunch', 'kiwi'),
  ('cornChowder', 'corn'), ('cornChowder', 'potato'), ('cornChowder', 'onion'),
  ('gazpacho', 'tomato'), ('gazpacho', 'cucumber'), ('gazpacho', 'pepper'),
  ('beetAppleJuice', 'beet'), ('beetAppleJuice', 'apple'),
  ('broccoliMushroom', 'broccoli'), ('broccoliMushroom', 'mushroom'),
  ('cabbageRiceRoll', 'cabbage'), ('cabbageRiceRoll', 'rice'),
  ('applePie', 'wheat'), ('applePie', 'apple'),
  ('blueberryCake', 'wheat'), ('blueberryCake', 'blueberry'), ('blueberryCake', 'lemon'),
  ('grapePeachPunch', 'grape'), ('grapePeachPunch', 'peach'),
  ('pumpkinPorridge', 'pumpkin'), ('pumpkinPorridge', 'rice'),
  ('spicyPeanut', 'peanut'), ('spicyPeanut', 'chili'),
  ('carrotOrangeJuice', 'carrot'), ('carrotOrangeJuice', 'orange'),
  ('pearKiwiSmoothie', 'pear'), ('pearKiwiSmoothie', 'kiwi'),
  ('watermelonBerryPunch', 'watermelon'), ('watermelonBerryPunch', 'strawberry'),
  ('barleyMushroomPilaf', 'barley'), ('barleyMushroomPilaf', 'mushroom'), ('barleyMushroomPilaf', 'onion'),
  ('oatBlueberryPorridge', 'oat'), ('oatBlueberryPorridge', 'blueberry'),
  ('kabochaCurry', 'pumpkinSquash'), ('kabochaCurry', 'onion'),
  ('bokchoyStirFry', 'bokchoy'), ('bokchoyStirFry', 'garlic'),
  ('edamameSalad', 'edamame'), ('edamameSalad', 'cucumber'),
  ('chestnutRiceCake', 'chestnut'), ('chestnutRiceCake', 'rice'),
  ('figCheesePlatter', 'fig'), ('figCheesePlatter', 'raspberry'),
  ('plumSorbet', 'plum'), ('plumSorbet', 'lemon'),
  ('mangoSticky', 'mango'), ('mangoSticky', 'sweetCorn'),
  ('passionYogurt', 'passionFruit'), ('passionYogurt', 'blueberry'),
  ('bellFlowerNamul', 'bellFlower'), ('bellFlowerNamul', 'spinach'),
  ('sweetCornCheeseBake', 'sweetCorn'), ('sweetCornCheeseBake', 'pepper'),
  ('truffleRisotto', 'truffle'), ('truffleRisotto', 'rice'), ('truffleRisotto', 'mushroom'),
  ('lavenderTea', 'lavender'), ('lavenderTea', 'oat')
on conflict (recipe_id, crop_id) do update set quantity = excluded.quantity;

-- Mirrors app.js's FARM_ITEMS.
insert into public.farm_supply_catalog (item_id, price, item_type) values
  ('luckyFertilizer', 70, 'plot'),
  ('moistureFertilizer', 55, 'plot'),
  ('premiumFertilizer', 110, 'plot'),
  ('goldenFestivalPass', 190, 'instant'),
  ('farmFestivalPass', 130, 'instant'),
  ('freePass', 120, 'target'),
  ('revivalTonic', 50, 'plot'),
  ('growthTonic', 220, 'plot'),
  ('seedMarketRefresh', 40, 'market'),
  ('foodMarketRefresh', 55, 'market')
on conflict (item_id) do update set price = excluded.price, item_type = excluded.item_type;

-- Mirrors app.js's FARM_THEMES / PLOT_SKINS / LABEL_EFFECTS (COSMETIC_CATALOGS).
-- Only used server-side for the daily market's cosmetic rotation (below) --
-- purchase_farm_cosmetic (043) still takes its price from the client and is
-- unrelated to this migration's scope, not touched here.
insert into public.farm_cosmetic_catalog (cosmetic_type, cosmetic_id, price) values
  ('farm_theme', 'cherryBlossom', 2000), ('farm_theme', 'valentine', 2000),
  ('farm_theme', 'halloween', 2000), ('farm_theme', 'christmas', 2000),
  ('farm_theme', 'whiteDay', 2000), ('farm_theme', 'springMeadow', 2000),
  ('farm_theme', 'galaxyNight', 2000), ('farm_theme', 'ocean', 2000),
  ('farm_theme', 'bubbleField', 2000),
  ('plot_skin', 'cherryPetalFall', 800), ('plot_skin', 'frostbite', 800),
  ('plot_skin', 'chocolate', 800), ('plot_skin', 'candy', 800),
  ('plot_skin', 'starCandy', 800), ('plot_skin', 'mapleLeaf', 800),
  ('plot_skin', 'snowField', 800), ('plot_skin', 'sandDune', 800),
  ('plot_skin', 'lava', 800), ('plot_skin', 'rainbow', 800),
  ('plot_skin', 'golden', 800), ('plot_skin', 'lavenderField', 800),
  ('label_effect', 'goldenSparkle', 1200), ('label_effect', 'confetti', 1200),
  ('label_effect', 'cherryDrift', 1200), ('label_effect', 'snowSparkle', 1200),
  ('label_effect', 'rainbowGradient', 1200), ('label_effect', 'starAurora', 1200),
  ('label_effect', 'heartPop', 1200), ('label_effect', 'flameBorder', 1200),
  ('label_effect', 'butterflyFlutter', 1200), ('label_effect', 'galaxySparkle', 1200)
on conflict (cosmetic_type, cosmetic_id) do update set price = excluded.price;

insert into public.farm_catalog_meta (id, catalog_version) values (true, 1)
on conflict (id) do nothing;

create or replace function public.get_farm_catalog()
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'version', (select catalog_version from public.farm_catalog_meta),
    'crops', (
      select coalesce(jsonb_object_agg(crop_id, jsonb_build_object(
        'seedPrice', seed_price, 'sellPrice', sell_price, 'growthCost', growth_cost
      )), '{}'::jsonb)
      from public.farm_crop_catalog
    ),
    'recipes', (
      select coalesce(jsonb_object_agg(r.recipe_id, jsonb_build_object(
        'sellPrice', r.sell_price,
        'ingredients', (
          select coalesce(jsonb_agg(i.crop_id order by i.crop_id), '[]'::jsonb)
          from public.farm_recipe_ingredients as i
          where i.recipe_id = r.recipe_id
        )
      )), '{}'::jsonb)
      from public.farm_recipe_catalog as r
    ),
    'supplies', (
      select coalesce(jsonb_object_agg(item_id, jsonb_build_object(
        'price', price, 'type', item_type
      )), '{}'::jsonb)
      from public.farm_supply_catalog
    )
  );
$$;

revoke all on function public.get_farm_catalog() from public, anon;
grant execute on function public.get_farm_catalog() to authenticated;

-- ---------------------------------------------------------------------
-- Per-action idempotency. apply_farm_wallet_change's idempotency table
-- (032) only covers the wallet half of an action -- a retried "harvest"
-- call could still double the inventory even though it can't double the
-- coins. Every intent RPC in migration 052 checks/records here first.
-- ---------------------------------------------------------------------

create table if not exists public.farm_action_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  request_id uuid not null,
  action text not null,
  -- null while the action that reserved this request_id is still running;
  -- see farm_action_begin/farm_action_finish for why this can't be not null.
  result jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, request_id)
);

create index if not exists farm_action_log_created_at_idx
  on public.farm_action_log (created_at);

alter table public.farm_action_log enable row level security;
revoke all on table public.farm_action_log from anon, authenticated;
-- No policy, no grant: only security-definer RPCs touch this table, exactly
-- like farm_wallet_idempotency (032) -- no client role should read or write
-- it directly.

create or replace function public.cleanup_stale_farm_actions()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.farm_action_log where created_at < now() - interval '24 hours';
$$;

revoke all on function public.cleanup_stale_farm_actions() from public, anon, authenticated;

create or replace function public.run_farm_lifecycle()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.finalize_previous_farm_week();
  perform public.cleanup_expired_farm_mail();
  perform public.cleanup_stale_wallet_idempotency();
  perform public.cleanup_stale_farm_actions();
end;
$$;

revoke all on function public.run_farm_lifecycle() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Shared internal helpers for migration 052's intent RPCs. All revoked
-- from authenticated -- callable only from inside another security
-- definer function, same convention as apply_farm_wallet_change (037).
-- ---------------------------------------------------------------------

-- Applies an inventory delta atomically and returns the new quantity.
-- Negative deltas that would take a row below zero abort the whole calling
-- transaction (FARM_ITEM_OUT_OF_STOCK) instead of silently clamping to
-- zero -- clamping would hide "you tried to spend more than you have" as
-- if it succeeded.
create or replace function public.apply_farm_inventory_delta(
  p_user_id uuid,
  p_category text,
  p_item_id text,
  p_delta integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_quantity integer;
begin
  insert into public.farm_inventory (user_id, category, item_id, quantity)
  values (p_user_id, p_category, p_item_id, p_delta)
  on conflict (user_id, category, item_id) do update
  set quantity = public.farm_inventory.quantity + excluded.quantity
  returning quantity into next_quantity;

  if next_quantity < 0 then
    raise exception 'FARM_ITEM_OUT_OF_STOCK';
  end if;

  if next_quantity > 100000 then
    next_quantity := 100000;
    update public.farm_inventory set quantity = next_quantity
    where user_id = p_user_id and category = p_category and item_id = p_item_id;
  end if;

  return next_quantity;
end;
$$;

revoke all on function public.apply_farm_inventory_delta(uuid, text, text, integer)
  from public, anon, authenticated;

create or replace function public.farm_plot_max_growth(p_crop_id text)
returns smallint
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(
    (select growth_cost from public.farm_crop_catalog where crop_id = p_crop_id),
    4
  );
$$;

revoke all on function public.farm_plot_max_growth(text) from public, anon, authenticated;

-- Server-side latch for the 24h wilt rule (previously only ever set by the
-- client's own 1-second interval, so a plot that had wilted locally could
-- get silently un-wilted by a stale device's reload). Idempotent: touches
-- zero rows on every call except the moment a plot first crosses the line.
create or replace function public.refresh_farm_wilt(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  protected_until timestamptz;
begin
  select wilt_protection_until into protected_until
  from public.farms where user_id = p_user_id;

  if protected_until is not null and protected_until > now() then
    return;
  end if;

  update public.farm_plots
  set wilted = true
  where user_id = p_user_id
    and crop_id is not null
    and wilted = false
    and last_cared_at is not null
    and last_cared_at <= now() - interval '24 hours';
end;
$$;

revoke all on function public.refresh_farm_wilt(uuid) from public, anon, authenticated;

-- Rolls today's market once, server-side, so two devices can no longer
-- race each other into re-rolling it repeatedly (ensureDailyMarket() used
-- to run on every client render). Idempotent per category: only rerolls a
-- category whose offer count doesn't match the expected count yet.
create or replace function public.ensure_farm_market_rotation(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Seoul')::date;
  seed_count integer;
  food_count integer;
  crop_sell_count integer;
  cosmetic_count integer;
  expected_cosmetic_count integer;
  rolled_seeds text[];
  rolled_foods text[];
  rolled_crop_sell text[];
  rolled_cosmetics text[];
begin
  insert into public.farm_market_rotations (user_id, rotation_date)
  values (p_user_id, today)
  on conflict (user_id, rotation_date) do nothing;

  select
    coalesce(array_length(seed_offer_ids, 1), 0),
    coalesce(array_length(food_offer_ids, 1), 0),
    coalesce(array_length(crop_sell_offer_ids, 1), 0),
    coalesce(array_length(cosmetic_offer_ids, 1), 0)
  into seed_count, food_count, crop_sell_count, cosmetic_count
  from public.farm_market_rotations
  where user_id = p_user_id and rotation_date = today;

  if seed_count <> 7 then
    select array_agg(crop_id) into rolled_seeds
    from (select crop_id from public.farm_crop_catalog order by random() limit 7) as t;
    update public.farm_market_rotations set seed_offer_ids = rolled_seeds
    where user_id = p_user_id and rotation_date = today;
  end if;

  if food_count <> 4 then
    select array_agg(recipe_id) into rolled_foods
    from (select recipe_id from public.farm_recipe_catalog order by random() limit 4) as t;
    update public.farm_market_rotations set food_offer_ids = rolled_foods
    where user_id = p_user_id and rotation_date = today;
  end if;

  if crop_sell_count <> 5 then
    select array_agg(offer) into rolled_crop_sell
    from (
      select crop_id || ':' || (case when random() < 0.5 then 5 else 10 end) as offer
      from public.farm_crop_catalog
      order by random()
      limit 5
    ) as t;
    update public.farm_market_rotations set crop_sell_offer_ids = rolled_crop_sell
    where user_id = p_user_id and rotation_date = today;
  end if;

  select least(3, count(*)) into expected_cosmetic_count
  from public.farm_cosmetic_catalog as c
  where not exists (
    select 1 from public.farm_cosmetics as owned
    where owned.user_id = p_user_id
      and owned.cosmetic_type = c.cosmetic_type
      and owned.cosmetic_id = c.cosmetic_id
  );

  if cosmetic_count <> expected_cosmetic_count then
    select array_agg(offer) into rolled_cosmetics
    from (
      select c.cosmetic_type || ':' || c.cosmetic_id as offer
      from public.farm_cosmetic_catalog as c
      where not exists (
        select 1 from public.farm_cosmetics as owned
        where owned.user_id = p_user_id
          and owned.cosmetic_type = c.cosmetic_type
          and owned.cosmetic_id = c.cosmetic_id
      )
      order by random()
      limit expected_cosmetic_count
    ) as t;
    update public.farm_market_rotations set cosmetic_offer_ids = coalesce(rolled_cosmetics, '{}')
    where user_id = p_user_id and rotation_date = today;
  end if;
end;
$$;

revoke all on function public.ensure_farm_market_rotation(uuid) from public, anon, authenticated;

-- Reserves (user_id, request_id) and returns null if this call just claimed
-- it (proceed with the action), or the previously recorded result if it was
-- already claimed (skip the action, replay this instead).
--
-- The "for update" is what makes concurrent calls with the *same*
-- request_id race-free rather than just usually-fine: a second call that
-- loses the insert race blocks on that lock until the first call's
-- transaction commits, then reads back whatever farm_action_finish just
-- wrote -- instead of both calls reading null and both doing the work.
create or replace function public.farm_action_begin(
  p_user_id uuid,
  p_request_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_result jsonb;
begin
  insert into public.farm_action_log (user_id, request_id, action, result)
  values (p_user_id, p_request_id, p_action, null)
  on conflict (user_id, request_id) do nothing;

  select result into existing_result
  from public.farm_action_log
  where user_id = p_user_id and request_id = p_request_id
  for update;

  return existing_result;
end;
$$;

revoke all on function public.farm_action_begin(uuid, uuid, text) from public, anon, authenticated;

-- Fills in the result reserved by farm_action_begin. Must run in the same
-- transaction (same row lock) as the matching farm_action_begin call.
create or replace function public.farm_action_finish(
  p_user_id uuid,
  p_request_id uuid,
  p_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.farm_action_log
  set result = p_result
  where user_id = p_user_id and request_id = p_request_id;
  return p_result;
end;
$$;

revoke all on function public.farm_action_finish(uuid, uuid, jsonb)
  from public, anon, authenticated;

commit;
