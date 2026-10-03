begin;

-- Shared action locks keep seed purchases, cooking and food sales atomic.
create table public.farm_action_locks (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.farm_action_locks enable row level security;
revoke all on public.farm_action_locks from public, anon, authenticated;

-- Serialize concurrent kitchen and planting requests without taking a farm
-- row lock, preserving the existing focus/plot lock order.
create or replace function public.lock_my_farm_actions(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.farm_action_locks (user_id) values (p_user_id) on conflict do nothing;
  perform 1 from public.farm_action_locks where user_id = p_user_id for update;
end;
$$;
revoke all on function public.lock_my_farm_actions(uuid) from public, anon, authenticated;

create or replace function public.begin_my_farm_action(p_user_id uuid, p_request_id uuid, p_action text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare saved_action text; cached_result jsonb;
begin
  if p_request_id is null then raise exception 'FARM_INVALID_REQUEST_ID'; end if;
  -- Check the action after farm_action_begin acquires its request-row lock,
  -- including when an older RPC raced to reserve this UUID first.
  cached_result := public.farm_action_begin(p_user_id, p_request_id, p_action);
  select action into saved_action from public.farm_action_log
    where user_id = p_user_id and request_id = p_request_id;
  if saved_action is not null and saved_action <> p_action then
    raise exception 'FARM_REQUEST_ID_REUSED';
  end if;
  return cached_result;
end;
$$;
revoke all on function public.begin_my_farm_action(uuid, uuid, text) from public, anon, authenticated;

-- Empty plots use already owned seeds first. Otherwise buying and planting
-- happen in one transaction, with no seed store or half-completed purchase.
-- The existing seedDouble set can still leave a spare purchased seed.
create or replace function public.buy_and_plant_farm_seed(p_plot_index smallint, p_crop_id text, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid(); cached_result jsonb;
  plot_row public.farm_plots%rowtype; seed_quantity integer;
  seed_price integer; seed_amount integer := 1; coin_balance bigint;
  used_owned_seed boolean; bonuses jsonb := '[]'::jsonb;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  perform public.ensure_farm_user(current_user_id);
  perform public.lock_my_farm_actions(current_user_id);
  cached_result := public.begin_my_farm_action(current_user_id, p_request_id, 'buy_and_plant_farm_seed');
  if cached_result is not null then return cached_result; end if;
  select catalog.seed_price into seed_price from public.farm_crop_catalog catalog where crop_id = p_crop_id;
  if seed_price is null then raise exception 'FARM_UNKNOWN_CROP'; end if;
  select * into plot_row from public.farm_plots
    where user_id = current_user_id and plot_index = p_plot_index for update;
  if not found then raise exception 'FARM_PLOT_NOT_FOUND'; end if;
  if plot_row.crop_id is not null then raise exception 'FARM_PLOT_OCCUPIED'; end if;
  -- Match existing seed purchase's wallet -> inventory ordering.
  select wallets.coin_balance into coin_balance from public.farm_wallets wallets
    where user_id = current_user_id for update;
  select quantity into seed_quantity from public.farm_inventory
    where user_id = current_user_id and category = 'seed' and item_id = p_crop_id for update;
  used_owned_seed := coalesce(seed_quantity, 0) > 0;
  if not used_owned_seed then
    if coin_balance < seed_price then raise exception 'FARM_INSUFFICIENT_COIN'; end if;
    if seed_price > 0 then
      coin_balance := public.apply_farm_wallet_change(current_user_id, 'coin', -seed_price,
        '씨앗 구매 후 심기', 'plant-seed:' || p_request_id);
    end if;
    if public.farm_set_effect_triggers(current_user_id, 'seedDouble') then
      seed_amount := 2; bonuses := jsonb_build_array('seedDouble');
    end if;
    seed_quantity := public.apply_farm_inventory_delta(current_user_id, 'seed', p_crop_id, seed_amount);
  end if;
  seed_quantity := public.apply_farm_inventory_delta(current_user_id, 'seed', p_crop_id, -1);
  update public.farm_plots set crop_id = p_crop_id, growth = 0,
    planted_on = (now() at time zone 'Asia/Seoul')::date, last_watered_on = null,
    last_free_water_at = null, last_cared_at = now(), wilted = false, fertilizer_id = null
    where user_id = current_user_id and plot_index = p_plot_index returning * into plot_row;
  return public.farm_action_finish(current_user_id, p_request_id, jsonb_build_object(
    'plots', jsonb_build_array(public.farm_plot_json(plot_row)),
    'inventory', jsonb_build_array(jsonb_build_object('category', 'seed', 'itemId', p_crop_id, 'quantity', seed_quantity)),
    'wallet', jsonb_build_object('coinBalance', coin_balance),
    'event', jsonb_build_object('cropId', p_crop_id, 'usedOwnedSeed', used_owned_seed,
      'purchaseAmount', case when used_owned_seed then 0 else seed_price end, 'bonuses', bonuses)));
end;
$$;
revoke all on function public.buy_and_plant_farm_seed(smallint, text, uuid) from public, anon;
grant execute on function public.buy_and_plant_farm_seed(smallint, text, uuid) to authenticated;

-- Public recipes replace manual ingredient guessing. Validate the full
-- batch before consumption, then roll the same existing per-portion set
-- effects. Any error rolls back every ingredient and produced dish.
create or replace function public.cook_my_farm_recipe(p_recipe_id text, p_quantity integer, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid(); cached_result jsonb; ingredient record;
  ingredients text[]; ingredient_count integer; current_quantity integer;
  food_quantity integer; food_amount integer := 0; batch_index integer;
  refund_crop_id text; refunded_crop_ids text[] := '{}'::text[];
  bonuses jsonb := '[]'::jsonb; inventory_updates jsonb := '[]'::jsonb;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  perform public.ensure_farm_user(current_user_id);
  perform public.lock_my_farm_actions(current_user_id);
  cached_result := public.begin_my_farm_action(current_user_id, p_request_id, 'cook_my_farm_recipe');
  if cached_result is not null then return cached_result; end if;
  if p_quantity is null or p_quantity not between 1 and 100 then raise exception 'FARM_INVALID_QUANTITY'; end if;
  if not exists (select 1 from public.farm_recipe_catalog where recipe_id = p_recipe_id) then
    raise exception 'FARM_UNKNOWN_RECIPE';
  end if;
  select array_agg(recipe.crop_id order by recipe.crop_id) into ingredients
    from public.farm_recipe_ingredients recipe cross join lateral generate_series(1, recipe.quantity) unit
    where recipe.recipe_id = p_recipe_id;
  ingredient_count := coalesce(cardinality(ingredients), 0);
  if ingredient_count = 0 then raise exception 'FARM_INVALID_RECIPE'; end if;
  for ingredient in select crop_id, quantity from public.farm_recipe_ingredients
    where recipe_id = p_recipe_id order by crop_id loop
    current_quantity := public.apply_farm_inventory_delta(current_user_id, 'harvest',
      ingredient.crop_id, -ingredient.quantity * p_quantity);
    inventory_updates := inventory_updates || jsonb_build_array(jsonb_build_object(
      'category', 'harvest', 'itemId', ingredient.crop_id, 'quantity', current_quantity));
  end loop;
  for batch_index in 1..p_quantity loop
    food_amount := food_amount + 1;
    if public.farm_set_effect_triggers(current_user_id, 'cookDouble') then
      food_amount := food_amount + 1;
      if not bonuses ? 'cookDouble' then bonuses := bonuses || jsonb_build_array('cookDouble'); end if;
    end if;
    if public.farm_set_effect_triggers(current_user_id, 'ingredientSave') then
      refund_crop_id := ingredients[1 + floor(random() * ingredient_count)::integer];
      refunded_crop_ids := array_append(refunded_crop_ids, refund_crop_id);
      if not bonuses ? 'ingredientSave' then bonuses := bonuses || jsonb_build_array('ingredientSave'); end if;
    end if;
  end loop;
  for ingredient in select crop_id, count(*)::integer as quantity
    from unnest(refunded_crop_ids) crop_id group by crop_id order by crop_id loop
    current_quantity := public.apply_farm_inventory_delta(current_user_id, 'harvest', ingredient.crop_id, ingredient.quantity);
    inventory_updates := inventory_updates || jsonb_build_array(jsonb_build_object(
      'category', 'harvest', 'itemId', ingredient.crop_id, 'quantity', current_quantity));
  end loop;
  select quantity into food_quantity from public.farm_inventory
    where user_id = current_user_id and category = 'food' and item_id = p_recipe_id for update;
  if coalesce(food_quantity, 0) + food_amount > 100000 then raise exception 'FARM_FOOD_INVENTORY_FULL'; end if;
  food_quantity := public.apply_farm_inventory_delta(current_user_id, 'food', p_recipe_id, food_amount);
  inventory_updates := inventory_updates || jsonb_build_array(jsonb_build_object(
    'category', 'food', 'itemId', p_recipe_id, 'quantity', food_quantity));
  return public.farm_action_finish(current_user_id, p_request_id, jsonb_build_object(
    'inventory', inventory_updates,
    'event', jsonb_build_object('matched', true, 'recipeId', p_recipe_id,
      'quantity', p_quantity, 'foodAmount', food_amount, 'refundedCropIds', to_jsonb(refunded_crop_ids), 'bonuses', bonuses)));
end;
$$;
revoke all on function public.cook_my_farm_recipe(text, integer, uuid) from public, anon;
grant execute on function public.cook_my_farm_recipe(text, integer, uuid) to authenticated;

-- All finished dishes can be sold from the kitchen, regardless of daily
-- market rotation. Roll saleDouble independently for each dish, as before.
-- Wallet credits use bounded chunks so an honest large inventory does not
-- hit the existing generic 10,000-per-change security cap.
create or replace function public.sell_all_my_farm_food(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid(); cached_result jsonb; dish record;
  sold_count bigint := 0; bonus_count integer; total_bonus_count bigint := 0;
  total_price bigint := 0; remaining_credit bigint; credit_chunk bigint;
  credit_index integer := 0; money_balance bigint; bonus_percent integer;
  inventory_updates jsonb := '[]'::jsonb;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  perform public.ensure_farm_user(current_user_id);
  perform public.lock_my_farm_actions(current_user_id);
  cached_result := public.begin_my_farm_action(current_user_id, p_request_id, 'sell_all_my_farm_food');
  if cached_result is not null then return cached_result; end if;
  bonus_percent := public.farm_set_bonus_percent(current_user_id, 'saleDouble');
  for dish in
    select inventory.item_id, inventory.quantity, catalog.sell_price
      from public.farm_inventory inventory
      left join public.farm_recipe_catalog catalog on catalog.recipe_id = inventory.item_id
      where inventory.user_id = current_user_id and inventory.category = 'food' and inventory.quantity > 0
      order by inventory.item_id for update of inventory
  loop
    if dish.sell_price is null then raise exception 'FARM_UNKNOWN_RECIPE'; end if;
    bonus_count := 0;
    if bonus_percent > 0 then
      select count(*) into bonus_count from generate_series(1, dish.quantity)
        where random() < bonus_percent / 100.0;
    end if;
    sold_count := sold_count + dish.quantity;
    total_bonus_count := total_bonus_count + bonus_count;
    total_price := total_price + dish.sell_price::bigint * (dish.quantity + bonus_count);
    perform public.apply_farm_inventory_delta(current_user_id, 'food', dish.item_id, -dish.quantity);
    inventory_updates := inventory_updates || jsonb_build_array(jsonb_build_object(
      'category', 'food', 'itemId', dish.item_id, 'quantity', 0));
  end loop;
  if sold_count = 0 then raise exception 'FARM_NO_FOOD_TO_SELL'; end if;
  remaining_credit := total_price;
  while remaining_credit > 0 loop
    credit_chunk := least(10000::bigint, remaining_credit);
    credit_index := credit_index + 1;
    money_balance := public.apply_farm_wallet_change(current_user_id, 'farm_money', credit_chunk,
      '주방 음식 모두 판매', 'kitchen-food:' || p_request_id || ':' || credit_index);
    remaining_credit := remaining_credit - credit_chunk;
  end loop;
  if money_balance is null then
    select farm_money_balance into money_balance from public.farm_wallets where user_id = current_user_id;
  end if;
  return public.farm_action_finish(current_user_id, p_request_id, jsonb_build_object(
    'inventory', inventory_updates, 'wallet', jsonb_build_object('farmMoneyBalance', money_balance),
    'weeklyFarmMoneyEarned', coalesce((select earned_farm_money from public.farm_weekly_earnings
      where user_id = current_user_id and week_start = public.current_farm_week_start()), 0),
    'event', jsonb_build_object('saleAmount', total_price, 'soldCount', sold_count,
      'saleBonusFoodCount', total_bonus_count,
      'bonuses', case when total_bonus_count > 0 then jsonb_build_array('saleDouble') else '[]'::jsonb end)));
end;
$$;
revoke all on function public.sell_all_my_farm_food(uuid) from public, anon;
grant execute on function public.sell_all_my_farm_food(uuid) to authenticated;

-- Crops are ingredients now. Retain a clear failure for old clients rather
-- than leaving a hidden direct-sale path available outside the new UI.
create or replace function public.sell_farm_crop_bundle(p_crop_id text, p_bundle_size smallint, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  raise exception 'FARM_CROP_SALE_RETIRED';
end;
$$;
revoke all on function public.sell_farm_crop_bundle(text, smallint, uuid) from public, anon;
grant execute on function public.sell_farm_crop_bundle(text, smallint, uuid) to authenticated;

-- Extend the public catalog without changing the existing client shapes.
-- Ingredient arrays contain one entry per required unit, including repeats.
create or replace function public.get_farm_catalog()
returns jsonb language sql security definer set search_path = '' stable as $$
  select jsonb_build_object(
    'version', (select catalog_version from public.farm_catalog_meta where id = true),
    'crops', (select coalesce(jsonb_object_agg(crop_id, jsonb_build_object(
      'seedPrice', seed_price, 'sellPrice', sell_price, 'growthCost', growth_cost)), '{}'::jsonb)
      from public.farm_crop_catalog),
    'recipes', (select coalesce(jsonb_object_agg(recipe.recipe_id, jsonb_build_object(
      'sellPrice', recipe.sell_price, 'ingredients', (
        select coalesce(jsonb_agg(ingredient.crop_id order by ingredient.crop_id), '[]'::jsonb)
        from public.farm_recipe_ingredients ingredient cross join lateral generate_series(1, ingredient.quantity) unit
        where ingredient.recipe_id = recipe.recipe_id))), '{}'::jsonb) from public.farm_recipe_catalog recipe),
    'supplies', (select coalesce(jsonb_object_agg(item_id, jsonb_build_object('price', price, 'type', item_type)), '{}'::jsonb)
      from public.farm_supply_catalog)
  );
$$;
revoke all on function public.get_farm_catalog() from public, anon;
grant execute on function public.get_farm_catalog() to authenticated;

update public.farm_catalog_meta set catalog_version = catalog_version + 1 where id = true;
commit;
