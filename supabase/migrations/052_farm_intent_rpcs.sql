begin;

-- Replaces the whole-snapshot save_my_farm_state as the way every farm
-- action gets persisted. Each RPC here does exactly one thing a user did
-- (plant a seed, water a plot, buy something...), validates it against the
-- catalogs from migration 051, and returns only the rows it actually
-- changed. A stale device can no longer overwrite unrelated farm state by
-- doing something small, because there is no more "send everything" path
-- left for it to go through.
--
-- Every RPC follows the same shape:
--   1. farm_action_begin(user, request_id, action) -- replay if already done
--   2. validate against the catalog / row state (row-locked with FOR UPDATE)
--   3. apply the change via apply_farm_inventory_delta / apply_farm_wallet_change
--   4. farm_action_finish(...) -- records the result and returns it
--
-- All raise a short UPPER_SNAKE_CASE sentinel on the expected failure paths
-- (FARM_PLOT_EMPTY, FARM_WATER_COOLDOWN, ...) so the client can show a
-- specific message instead of a generic failure.

-- ---------------------------------------------------------------------
-- Shared row -> client-JSON shape helpers.
-- ---------------------------------------------------------------------

create or replace function public.farm_plot_json(p_row public.farm_plots)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'id', p_row.plot_index,
    'crop', p_row.crop_id,
    'growth', p_row.growth,
    'plantedDate', p_row.planted_on,
    'lastWateredDate', p_row.last_watered_on,
    'lastFreeWaterAt', p_row.last_free_water_at,
    'lastCaredAt', p_row.last_cared_at,
    'wilted', p_row.wilted,
    'fertilizer', p_row.fertilizer_id
  );
$$;

revoke all on function public.farm_plot_json(public.farm_plots) from public, anon, authenticated;

-- Matches the marketRotation shape get_my_farm_state_v3/v4 already produce
-- (cropSellOffers/cosmeticOffers as "type:id" strings split back into
-- objects) so the client's existing parser needs no changes.
create or replace function public.farm_market_rotation_json(p_row public.farm_market_rotations)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'date', p_row.rotation_date,
    'seedOffers', to_jsonb(coalesce(p_row.seed_offer_ids, '{}'::text[])),
    'foodOffers', to_jsonb(coalesce(p_row.food_offer_ids, '{}'::text[])),
    'cropSellOffers', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'cropId', split_part(offer, ':', 1),
        'bundleSize', split_part(offer, ':', 2)::integer
      )), '[]'::jsonb)
      from unnest(coalesce(p_row.crop_sell_offer_ids, '{}'::text[])) as offer
    ),
    'cosmeticOffers', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'type', split_part(offer, ':', 1),
        'id', split_part(offer, ':', 2)
      )), '[]'::jsonb)
      from unnest(coalesce(p_row.cosmetic_offer_ids, '{}'::text[])) as offer
    )
  );
$$;

revoke all on function public.farm_market_rotation_json(public.farm_market_rotations)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 1. buy_farm_seed
-- ---------------------------------------------------------------------

create or replace function public.buy_farm_seed(
  p_crop_id text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  cached_result jsonb;
  crop_seed_price integer;
  new_quantity integer;
  coin_balance bigint;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  perform public.ensure_farm_user(current_user_id);

  cached_result := public.farm_action_begin(current_user_id, p_request_id, 'buy_farm_seed');
  if cached_result is not null then return cached_result; end if;

  select seed_price into crop_seed_price
  from public.farm_crop_catalog where crop_id = p_crop_id;
  if crop_seed_price is null then
    raise exception 'FARM_UNKNOWN_CROP';
  end if;

  coin_balance := public.apply_farm_wallet_change(
    current_user_id, 'coin', -crop_seed_price, '씨앗 구매', 'seed:' || p_request_id
  );
  new_quantity := public.apply_farm_inventory_delta(current_user_id, 'seed', p_crop_id, 1);

  return public.farm_action_finish(current_user_id, p_request_id, jsonb_build_object(
    'inventory', jsonb_build_array(
      jsonb_build_object('category', 'seed', 'itemId', p_crop_id, 'quantity', new_quantity)
    ),
    'wallet', jsonb_build_object('coinBalance', coin_balance)
  ));
end;
$$;

revoke all on function public.buy_farm_seed(text, uuid) from public, anon;
grant execute on function public.buy_farm_seed(text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. buy_farm_supply
-- ---------------------------------------------------------------------

create or replace function public.buy_farm_supply(
  p_item_id text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  cached_result jsonb;
  item_price integer;
  new_quantity integer;
  farm_money_balance bigint;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  perform public.ensure_farm_user(current_user_id);

  cached_result := public.farm_action_begin(current_user_id, p_request_id, 'buy_farm_supply');
  if cached_result is not null then return cached_result; end if;

  select price into item_price
  from public.farm_supply_catalog where item_id = p_item_id;
  if item_price is null then
    raise exception 'FARM_UNKNOWN_ITEM';
  end if;

  farm_money_balance := public.apply_farm_wallet_change(
    current_user_id, 'farm_money', -item_price, '농장 용품 구매', 'farm-item:' || p_request_id
  );
  new_quantity := public.apply_farm_inventory_delta(current_user_id, 'supply', p_item_id, 1);

  return public.farm_action_finish(current_user_id, p_request_id, jsonb_build_object(
    'inventory', jsonb_build_array(
      jsonb_build_object('category', 'supply', 'itemId', p_item_id, 'quantity', new_quantity)
    ),
    'wallet', jsonb_build_object('farmMoneyBalance', farm_money_balance)
  ));
end;
$$;

revoke all on function public.buy_farm_supply(text, uuid) from public, anon;
grant execute on function public.buy_farm_supply(text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. apply_farm_plot_item (revivalTonic / growthTonic / fertilizers)
-- ---------------------------------------------------------------------

create or replace function public.apply_farm_plot_item(
  p_plot_index smallint,
  p_item_id text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  cached_result jsonb;
  plot_row public.farm_plots%rowtype;
  new_supply_quantity integer;
  max_growth smallint;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  perform public.ensure_farm_user(current_user_id);

  cached_result := public.farm_action_begin(current_user_id, p_request_id, 'apply_farm_plot_item');
  if cached_result is not null then return cached_result; end if;

  if not exists (
    select 1 from public.farm_supply_catalog where item_id = p_item_id and item_type = 'plot'
  ) then
    raise exception 'FARM_UNKNOWN_ITEM';
  end if;

  select * into plot_row from public.farm_plots
  where user_id = current_user_id and plot_index = p_plot_index
  for update;
  if not found or plot_row.crop_id is null then
    raise exception 'FARM_PLOT_EMPTY';
  end if;

  if p_item_id = 'revivalTonic' then
    if not plot_row.wilted then raise exception 'FARM_PLOT_NOT_WILTED'; end if;
    update public.farm_plots
    set wilted = false,
        last_watered_on = (now() at time zone 'Asia/Seoul')::date,
        last_cared_at = now()
    where user_id = current_user_id and plot_index = p_plot_index
    returning * into plot_row;
  elsif p_item_id = 'growthTonic' then
    max_growth := public.farm_plot_max_growth(plot_row.crop_id);
    if plot_row.wilted or plot_row.growth >= max_growth then
      raise exception 'FARM_PLOT_NOT_GROWABLE';
    end if;
    update public.farm_plots
    set growth = max_growth,
        last_watered_on = (now() at time zone 'Asia/Seoul')::date,
        last_cared_at = now()
    where user_id = current_user_id and plot_index = p_plot_index
    returning * into plot_row;
  else
    if plot_row.wilted or plot_row.fertilizer_id is not null then
      raise exception 'FARM_ALREADY_FERTILIZED';
    end if;
    update public.farm_plots
    set fertilizer_id = p_item_id
    where user_id = current_user_id and plot_index = p_plot_index
    returning * into plot_row;
  end if;

  new_supply_quantity := public.apply_farm_inventory_delta(current_user_id, 'supply', p_item_id, -1);

  return public.farm_action_finish(current_user_id, p_request_id, jsonb_build_object(
    'plots', jsonb_build_array(public.farm_plot_json(plot_row)),
    'inventory', jsonb_build_array(
      jsonb_build_object('category', 'supply', 'itemId', p_item_id, 'quantity', new_supply_quantity)
    )
  ));
end;
$$;

revoke all on function public.apply_farm_plot_item(smallint, text, uuid) from public, anon;
grant execute on function public.apply_farm_plot_item(smallint, text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. plant_farm_seed
-- ---------------------------------------------------------------------

create or replace function public.plant_farm_seed(
  p_plot_index smallint,
  p_crop_id text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  cached_result jsonb;
  plot_row public.farm_plots%rowtype;
  new_seed_quantity integer;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  perform public.ensure_farm_user(current_user_id);

  cached_result := public.farm_action_begin(current_user_id, p_request_id, 'plant_farm_seed');
  if cached_result is not null then return cached_result; end if;

  if not exists (select 1 from public.farm_crop_catalog where crop_id = p_crop_id) then
    raise exception 'FARM_UNKNOWN_CROP';
  end if;

  select * into plot_row from public.farm_plots
  where user_id = current_user_id and plot_index = p_plot_index
  for update;
  if not found then raise exception 'FARM_PLOT_NOT_FOUND'; end if;
  if plot_row.crop_id is not null then raise exception 'FARM_PLOT_OCCUPIED'; end if;

  new_seed_quantity := public.apply_farm_inventory_delta(current_user_id, 'seed', p_crop_id, -1);

  update public.farm_plots
  set crop_id = p_crop_id,
      growth = 0,
      planted_on = (now() at time zone 'Asia/Seoul')::date,
      last_watered_on = null,
      last_free_water_at = null,
      last_cared_at = now(),
      wilted = false,
      fertilizer_id = null
  where user_id = current_user_id and plot_index = p_plot_index
  returning * into plot_row;

  return public.farm_action_finish(current_user_id, p_request_id, jsonb_build_object(
    'plots', jsonb_build_array(public.farm_plot_json(plot_row)),
    'inventory', jsonb_build_array(
      jsonb_build_object('category', 'seed', 'itemId', p_crop_id, 'quantity', new_seed_quantity)
    )
  ));
end;
$$;

revoke all on function public.plant_farm_seed(smallint, text, uuid) from public, anon;
grant execute on function public.plant_farm_seed(smallint, text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. discard_farm_plot
-- ---------------------------------------------------------------------

create or replace function public.discard_farm_plot(
  p_plot_index smallint,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  cached_result jsonb;
  plot_row public.farm_plots%rowtype;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  perform public.ensure_farm_user(current_user_id);

  cached_result := public.farm_action_begin(current_user_id, p_request_id, 'discard_farm_plot');
  if cached_result is not null then return cached_result; end if;

  select * into plot_row from public.farm_plots
  where user_id = current_user_id and plot_index = p_plot_index
  for update;
  if not found or plot_row.crop_id is null or not plot_row.wilted then
    raise exception 'FARM_PLOT_NOT_WILTED';
  end if;

  update public.farm_plots
  set crop_id = null, growth = 0, planted_on = null, last_watered_on = null,
      last_free_water_at = null, last_cared_at = null, wilted = false, fertilizer_id = null
  where user_id = current_user_id and plot_index = p_plot_index
  returning * into plot_row;

  return public.farm_action_finish(current_user_id, p_request_id, jsonb_build_object(
    'plots', jsonb_build_array(public.farm_plot_json(plot_row))
  ));
end;
$$;

revoke all on function public.discard_farm_plot(smallint, uuid) from public, anon;
grant execute on function public.discard_farm_plot(smallint, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 6. harvest_farm_plot -- the lucky-fertilizer 2x/5%-jackpot roll moves
-- here; the client no longer rolls its own random() for this.
-- ---------------------------------------------------------------------

create or replace function public.harvest_farm_plot(
  p_plot_index smallint,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  cached_result jsonb;
  plot_row public.farm_plots%rowtype;
  max_growth smallint;
  harvested_crop_id text;
  has_luck boolean;
  is_jackpot boolean;
  harvest_amount smallint;
  new_harvest_quantity integer;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  perform public.ensure_farm_user(current_user_id);

  cached_result := public.farm_action_begin(current_user_id, p_request_id, 'harvest_farm_plot');
  if cached_result is not null then return cached_result; end if;

  select * into plot_row from public.farm_plots
  where user_id = current_user_id and plot_index = p_plot_index
  for update;
  if not found or plot_row.crop_id is null then raise exception 'FARM_PLOT_EMPTY'; end if;
  if plot_row.wilted then raise exception 'FARM_PLOT_WILTED'; end if;
  max_growth := public.farm_plot_max_growth(plot_row.crop_id);
  if plot_row.growth < max_growth then raise exception 'FARM_PLOT_NOT_READY'; end if;

  harvested_crop_id := plot_row.crop_id;
  has_luck := plot_row.fertilizer_id in ('luckyFertilizer', 'premiumFertilizer');
  is_jackpot := has_luck and random() < 0.05;
  harvest_amount := case when is_jackpot then 5 when has_luck then 2 else 1 end;

  new_harvest_quantity := public.apply_farm_inventory_delta(
    current_user_id, 'harvest', harvested_crop_id, harvest_amount
  );

  update public.farm_plots
  set crop_id = null, growth = 0, planted_on = null, last_watered_on = null,
      last_free_water_at = null, last_cared_at = null, wilted = false, fertilizer_id = null
  where user_id = current_user_id and plot_index = p_plot_index
  returning * into plot_row;

  return public.farm_action_finish(current_user_id, p_request_id, jsonb_build_object(
    'plots', jsonb_build_array(public.farm_plot_json(plot_row)),
    'inventory', jsonb_build_array(
      jsonb_build_object('category', 'harvest', 'itemId', harvested_crop_id, 'quantity', new_harvest_quantity)
    ),
    'event', jsonb_build_object(
      'cropId', harvested_crop_id, 'harvestAmount', harvest_amount, 'jackpot', is_jackpot
    )
  ));
end;
$$;

revoke all on function public.harvest_farm_plot(smallint, uuid) from public, anon;
grant execute on function public.harvest_farm_plot(smallint, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 7. water_farm_plot -- the 5h free-water cooldown is enforced here now,
-- not just in the client.
-- ---------------------------------------------------------------------

create or replace function public.water_farm_plot(
  p_plot_index smallint,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  cached_result jsonb;
  plot_row public.farm_plots%rowtype;
  max_growth smallint;
  growth_amount smallint;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  perform public.ensure_farm_user(current_user_id);

  cached_result := public.farm_action_begin(current_user_id, p_request_id, 'water_farm_plot');
  if cached_result is not null then return cached_result; end if;

  select * into plot_row from public.farm_plots
  where user_id = current_user_id and plot_index = p_plot_index
  for update;
  if not found or plot_row.crop_id is null then raise exception 'FARM_PLOT_EMPTY'; end if;
  if plot_row.wilted then raise exception 'FARM_PLOT_WILTED'; end if;
  max_growth := public.farm_plot_max_growth(plot_row.crop_id);
  if plot_row.growth >= max_growth then raise exception 'FARM_PLOT_NOT_READY'; end if;
  if plot_row.last_free_water_at is not null
     and plot_row.last_free_water_at > now() - interval '5 hours' then
    raise exception 'FARM_WATER_COOLDOWN';
  end if;

  growth_amount := case
    when plot_row.fertilizer_id in ('moistureFertilizer', 'premiumFertilizer') then 2
    else 1
  end;

  update public.farm_plots
  set growth = least(max_growth, growth + growth_amount),
      last_watered_on = (now() at time zone 'Asia/Seoul')::date,
      last_cared_at = now(),
      last_free_water_at = now()
  where user_id = current_user_id and plot_index = p_plot_index
  returning * into plot_row;

  return public.farm_action_finish(current_user_id, p_request_id, jsonb_build_object(
    'plots', jsonb_build_array(public.farm_plot_json(plot_row))
  ));
end;
$$;

revoke all on function public.water_farm_plot(smallint, uuid) from public, anon;
grant execute on function public.water_farm_plot(smallint, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 8. grow_farm_plot_with_coin
-- ---------------------------------------------------------------------

create or replace function public.grow_farm_plot_with_coin(
  p_plot_index smallint,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  cached_result jsonb;
  plot_row public.farm_plots%rowtype;
  max_growth smallint;
  growth_amount smallint;
  coin_balance bigint;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  perform public.ensure_farm_user(current_user_id);

  cached_result := public.farm_action_begin(current_user_id, p_request_id, 'grow_farm_plot_with_coin');
  if cached_result is not null then return cached_result; end if;

  select * into plot_row from public.farm_plots
  where user_id = current_user_id and plot_index = p_plot_index
  for update;
  if not found or plot_row.crop_id is null then raise exception 'FARM_PLOT_EMPTY'; end if;
  if plot_row.wilted then raise exception 'FARM_PLOT_WILTED'; end if;
  max_growth := public.farm_plot_max_growth(plot_row.crop_id);
  if plot_row.growth >= max_growth then raise exception 'FARM_PLOT_NOT_READY'; end if;

  coin_balance := public.apply_farm_wallet_change(
    current_user_id, 'coin', -1, '작물 성장', 'plot-grow:' || p_request_id
  );

  growth_amount := case
    when plot_row.fertilizer_id in ('moistureFertilizer', 'premiumFertilizer') then 2
    else 1
  end;

  update public.farm_plots
  set growth = least(max_growth, growth + growth_amount),
      last_watered_on = (now() at time zone 'Asia/Seoul')::date,
      last_cared_at = now()
  where user_id = current_user_id and plot_index = p_plot_index
  returning * into plot_row;

  return public.farm_action_finish(current_user_id, p_request_id, jsonb_build_object(
    'plots', jsonb_build_array(public.farm_plot_json(plot_row)),
    'wallet', jsonb_build_object('coinBalance', coin_balance)
  ));
end;
$$;

revoke all on function public.grow_farm_plot_with_coin(smallint, uuid) from public, anon;
grant execute on function public.grow_farm_plot_with_coin(smallint, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 9. sell_farm_food
-- ---------------------------------------------------------------------

create or replace function public.sell_farm_food(
  p_recipe_id text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  cached_result jsonb;
  today date := (now() at time zone 'Asia/Seoul')::date;
  recipe_sell_price integer;
  today_offers text[];
  new_food_quantity integer;
  farm_money_balance bigint;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  perform public.ensure_farm_user(current_user_id);

  cached_result := public.farm_action_begin(current_user_id, p_request_id, 'sell_farm_food');
  if cached_result is not null then return cached_result; end if;

  select sell_price into recipe_sell_price
  from public.farm_recipe_catalog where recipe_id = p_recipe_id;
  if recipe_sell_price is null then raise exception 'FARM_UNKNOWN_RECIPE'; end if;

  perform public.ensure_farm_market_rotation(current_user_id);
  select food_offer_ids into today_offers
  from public.farm_market_rotations
  where user_id = current_user_id and rotation_date = today;

  if not (p_recipe_id = any(coalesce(today_offers, '{}'::text[]))) then
    raise exception 'FARM_OFFER_EXPIRED';
  end if;

  new_food_quantity := public.apply_farm_inventory_delta(current_user_id, 'food', p_recipe_id, -1);
  farm_money_balance := public.apply_farm_wallet_change(
    current_user_id, 'farm_money', recipe_sell_price, '노아 음식 판매', 'food:' || p_request_id
  );

  return public.farm_action_finish(current_user_id, p_request_id, jsonb_build_object(
    'inventory', jsonb_build_array(
      jsonb_build_object('category', 'food', 'itemId', p_recipe_id, 'quantity', new_food_quantity)
    ),
    'wallet', jsonb_build_object('farmMoneyBalance', farm_money_balance)
  ));
end;
$$;

revoke all on function public.sell_farm_food(text, uuid) from public, anon;
grant execute on function public.sell_farm_food(text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 10. sell_farm_crop_bundle
-- ---------------------------------------------------------------------

create or replace function public.sell_farm_crop_bundle(
  p_crop_id text,
  p_bundle_size smallint,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  cached_result jsonb;
  today date := (now() at time zone 'Asia/Seoul')::date;
  today_offers text[];
  offer_key text := p_crop_id || ':' || p_bundle_size;
  crop_seed_price integer;
  crop_growth_cost smallint;
  total_price integer;
  new_harvest_quantity integer;
  farm_money_balance bigint;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  perform public.ensure_farm_user(current_user_id);

  cached_result := public.farm_action_begin(current_user_id, p_request_id, 'sell_farm_crop_bundle');
  if cached_result is not null then return cached_result; end if;

  if p_bundle_size not in (5, 10) then raise exception 'FARM_UNSUPPORTED_BUNDLE'; end if;

  select seed_price, growth_cost into crop_seed_price, crop_growth_cost
  from public.farm_crop_catalog where crop_id = p_crop_id;
  if crop_seed_price is null then raise exception 'FARM_UNKNOWN_CROP'; end if;

  perform public.ensure_farm_market_rotation(current_user_id);
  select crop_sell_offer_ids into today_offers
  from public.farm_market_rotations
  where user_id = current_user_id and rotation_date = today;

  if not (offer_key = any(coalesce(today_offers, '{}'::text[]))) then
    raise exception 'FARM_OFFER_EXPIRED';
  end if;

  total_price := (crop_seed_price + crop_growth_cost) * p_bundle_size + 2;

  new_harvest_quantity := public.apply_farm_inventory_delta(
    current_user_id, 'harvest', p_crop_id, -p_bundle_size
  );
  farm_money_balance := public.apply_farm_wallet_change(
    current_user_id, 'farm_money', total_price, '노아 작물 대량 판매', 'crop-bundle:' || p_request_id
  );

  return public.farm_action_finish(current_user_id, p_request_id, jsonb_build_object(
    'inventory', jsonb_build_array(
      jsonb_build_object('category', 'harvest', 'itemId', p_crop_id, 'quantity', new_harvest_quantity)
    ),
    'wallet', jsonb_build_object('farmMoneyBalance', farm_money_balance)
  ));
end;
$$;

revoke all on function public.sell_farm_crop_bundle(text, smallint, uuid) from public, anon;
grant execute on function public.sell_farm_crop_bundle(text, smallint, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 11. cook_farm_recipe -- recipe matching moves server-side (a multiset
-- comparison against farm_recipe_ingredients), same rule the client's
-- getRecipeByIngredients used (sorted-ingredient equality).
-- ---------------------------------------------------------------------

create or replace function public.cook_farm_recipe(
  p_crop_ids text[],
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  cached_result jsonb;
  ingredient_count integer := coalesce(array_length(p_crop_ids, 1), 0);
  ingredient_row record;
  matched_recipe_id text;
  new_food_quantity integer;
  first_discovery boolean;
  inventory_updates jsonb := '[]'::jsonb;
  current_quantity integer;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  perform public.ensure_farm_user(current_user_id);

  cached_result := public.farm_action_begin(current_user_id, p_request_id, 'cook_farm_recipe');
  if cached_result is not null then return cached_result; end if;

  if ingredient_count < 2 or ingredient_count > 3 then
    raise exception 'FARM_INVALID_INGREDIENTS';
  end if;

  for ingredient_row in
    select x as crop_id, count(*)::integer as qty from unnest(p_crop_ids) as x group by x
  loop
    if not exists (
      select 1 from public.farm_crop_catalog where crop_id = ingredient_row.crop_id
    ) then
      raise exception 'FARM_UNKNOWN_CROP';
    end if;
    current_quantity := public.apply_farm_inventory_delta(
      current_user_id, 'harvest', ingredient_row.crop_id, -ingredient_row.qty
    );
    inventory_updates := inventory_updates || jsonb_build_array(jsonb_build_object(
      'category', 'harvest', 'itemId', ingredient_row.crop_id, 'quantity', current_quantity
    ));
  end loop;

  select r.recipe_id into matched_recipe_id
  from public.farm_recipe_catalog as r
  where (
    select array_agg(i.crop_id order by i.crop_id)
    from public.farm_recipe_ingredients as i
    where i.recipe_id = r.recipe_id
  ) = (
    select array_agg(x order by x) from unnest(p_crop_ids) as x
  );

  if matched_recipe_id is null then
    return public.farm_action_finish(current_user_id, p_request_id, jsonb_build_object(
      'inventory', inventory_updates,
      'event', jsonb_build_object('matched', false)
    ));
  end if;

  select not exists (
    select 1 from public.farm_recipe_discoveries
    where user_id = current_user_id and recipe_id = matched_recipe_id
  ) into first_discovery;

  insert into public.farm_recipe_discoveries (user_id, recipe_id)
  values (current_user_id, matched_recipe_id)
  on conflict (user_id, recipe_id) do nothing;

  new_food_quantity := public.apply_farm_inventory_delta(current_user_id, 'food', matched_recipe_id, 1);
  inventory_updates := inventory_updates || jsonb_build_array(jsonb_build_object(
    'category', 'food', 'itemId', matched_recipe_id, 'quantity', new_food_quantity
  ));

  return public.farm_action_finish(current_user_id, p_request_id, jsonb_build_object(
    'inventory', inventory_updates,
    'discoveredRecipes', case
      when first_discovery then jsonb_build_array(matched_recipe_id)
      else '[]'::jsonb
    end,
    'event', jsonb_build_object(
      'matched', true, 'recipeId', matched_recipe_id, 'firstDiscovery', first_discovery
    )
  ));
end;
$$;

revoke all on function public.cook_farm_recipe(text[], uuid) from public, anon;
grant execute on function public.cook_farm_recipe(text[], uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 12. use_farm_market_refresh
-- ---------------------------------------------------------------------

create or replace function public.use_farm_market_refresh(
  p_item_id text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  cached_result jsonb;
  new_supply_quantity integer;
  today date := (now() at time zone 'Asia/Seoul')::date;
  rolled_seeds text[];
  rolled_foods text[];
  rolled_crop_sell text[];
  market_row public.farm_market_rotations%rowtype;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  perform public.ensure_farm_user(current_user_id);

  cached_result := public.farm_action_begin(current_user_id, p_request_id, 'use_farm_market_refresh');
  if cached_result is not null then return cached_result; end if;

  if p_item_id not in ('seedMarketRefresh', 'foodMarketRefresh') then
    raise exception 'FARM_UNKNOWN_ITEM';
  end if;

  new_supply_quantity := public.apply_farm_inventory_delta(current_user_id, 'supply', p_item_id, -1);
  perform public.ensure_farm_market_rotation(current_user_id);

  if p_item_id = 'seedMarketRefresh' then
    select array_agg(crop_id) into rolled_seeds
    from (select crop_id from public.farm_crop_catalog order by random() limit 7) as t;
    update public.farm_market_rotations set seed_offer_ids = rolled_seeds
    where user_id = current_user_id and rotation_date = today;
  else
    select array_agg(recipe_id) into rolled_foods
    from (select recipe_id from public.farm_recipe_catalog order by random() limit 4) as t;
    select array_agg(offer) into rolled_crop_sell
    from (
      select crop_id || ':' || (case when random() < 0.5 then 5 else 10 end) as offer
      from public.farm_crop_catalog order by random() limit 5
    ) as t;
    update public.farm_market_rotations
    set food_offer_ids = rolled_foods, crop_sell_offer_ids = rolled_crop_sell
    where user_id = current_user_id and rotation_date = today;
  end if;

  select * into market_row from public.farm_market_rotations
  where user_id = current_user_id and rotation_date = today;

  return public.farm_action_finish(current_user_id, p_request_id, jsonb_build_object(
    'inventory', jsonb_build_array(
      jsonb_build_object('category', 'supply', 'itemId', p_item_id, 'quantity', new_supply_quantity)
    ),
    'marketRotation', public.farm_market_rotation_json(market_row)
  ));
end;
$$;

revoke all on function public.use_farm_market_refresh(text, uuid) from public, anon;
grant execute on function public.use_farm_market_refresh(text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 13. use_farm_festival_pass
-- ---------------------------------------------------------------------

create or replace function public.use_farm_festival_pass(
  p_item_id text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  cached_result jsonb;
  new_supply_quantity integer;
  max_future timestamptz := now() + interval '90 days';
  farm_row public.farms%rowtype;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  perform public.ensure_farm_user(current_user_id);

  cached_result := public.farm_action_begin(current_user_id, p_request_id, 'use_farm_festival_pass');
  if cached_result is not null then return cached_result; end if;

  if p_item_id not in ('goldenFestivalPass', 'farmFestivalPass') then
    raise exception 'FARM_UNKNOWN_ITEM';
  end if;

  new_supply_quantity := public.apply_farm_inventory_delta(current_user_id, 'supply', p_item_id, -1);

  if p_item_id = 'goldenFestivalPass' then
    update public.farms
    set production_boost_until = least(
      greatest(now(), coalesce(production_boost_until, now())) + interval '24 hours',
      max_future
    )
    where user_id = current_user_id
    returning * into farm_row;
  else
    update public.farms
    set wilt_protection_until = least(
      greatest(now(), coalesce(wilt_protection_until, now())) + interval '24 hours',
      max_future
    )
    where user_id = current_user_id
    returning * into farm_row;
  end if;

  return public.farm_action_finish(current_user_id, p_request_id, jsonb_build_object(
    'inventory', jsonb_build_array(
      jsonb_build_object('category', 'supply', 'itemId', p_item_id, 'quantity', new_supply_quantity)
    ),
    'farm', jsonb_build_object(
      'productionBoostUntil', farm_row.production_boost_until,
      'wiltProtectionUntil', farm_row.wilt_protection_until
    )
  ));
end;
$$;

revoke all on function public.use_farm_festival_pass(text, uuid) from public, anon;
grant execute on function public.use_farm_festival_pass(text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 14. use_farm_free_pass -- decrements the pass and completes the task/
-- habit inside the same transaction (previously two separate round trips
-- that could partially fail: pass consumed but nothing completed, or vice
-- versa).
-- ---------------------------------------------------------------------

create or replace function public.use_farm_free_pass(
  p_target_type text,
  p_target_id uuid,
  p_record_date date,
  p_progress_value integer,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  cached_result jsonb;
  new_supply_quantity integer;
  completion_result jsonb;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  perform public.ensure_farm_user(current_user_id);

  cached_result := public.farm_action_begin(current_user_id, p_request_id, 'use_farm_free_pass');
  if cached_result is not null then return cached_result; end if;

  if p_target_type not in ('task', 'habit') then
    raise exception 'FARM_UNSUPPORTED_TARGET';
  end if;

  new_supply_quantity := public.apply_farm_inventory_delta(current_user_id, 'supply', 'freePass', -1);

  if p_target_type = 'task' then
    completion_result := public.complete_my_task(p_target_id, true);
  else
    completion_result := public.complete_my_habit(p_target_id, p_record_date, p_progress_value, true);
  end if;

  return public.farm_action_finish(current_user_id, p_request_id, jsonb_build_object(
    'inventory', jsonb_build_array(
      jsonb_build_object('category', 'supply', 'itemId', 'freePass', 'quantity', new_supply_quantity)
    ),
    'wallet', jsonb_build_object('coinBalance', completion_result -> 'coinBalance'),
    'event', jsonb_build_object('targetType', p_target_type, 'completion', completion_result)
  ));
end;
$$;

revoke all on function public.use_farm_free_pass(text, uuid, date, integer, uuid) from public, anon;
grant execute on function public.use_farm_free_pass(text, uuid, date, integer, uuid) to authenticated;

commit;
