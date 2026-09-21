-- Each cosmetic set now has its own server-authoritative effect.
-- Apply after 071_public_recipes_and_cosmetic_sets.sql.
begin;
alter table public.farm_cosmetic_sets drop constraint farm_cosmetic_sets_effect_check;
alter table public.farm_cosmetic_sets add constraint farm_cosmetic_sets_effect_check
  check (effect in ('wilt', 'fertilizerReturn', 'cookDouble', 'ingredientSave', 'focusCoinDouble', 'harvestCoin', 'seedReturn', 'waterGrowth', 'water', 'seedDouble', 'saleDouble', 'harvestDouble'));

update public.farm_cosmetic_sets set effect = 'wilt' where set_id = 'cherry';
update public.farm_cosmetic_sets set effect = 'fertilizerReturn' where set_id = 'frost';
update public.farm_cosmetic_sets set effect = 'cookDouble' where set_id = 'valentine';
update public.farm_cosmetic_sets set effect = 'ingredientSave' where set_id = 'candy';
update public.farm_cosmetic_sets set effect = 'focusCoinDouble' where set_id = 'galaxy';
update public.farm_cosmetic_sets set effect = 'harvestCoin' where set_id = 'halloween';
update public.farm_cosmetic_sets set effect = 'seedReturn' where set_id = 'snow';
update public.farm_cosmetic_sets set effect = 'waterGrowth' where set_id = 'ocean';
update public.farm_cosmetic_sets set effect = 'water' where set_id = 'volcano';
update public.farm_cosmetic_sets set effect = 'seedDouble' where set_id = 'rainbow';
update public.farm_cosmetic_sets set effect = 'saleDouble' where set_id = 'golden';
update public.farm_cosmetic_sets set effect = 'harvestDouble' where set_id = 'garden';

-- Internal only: callers cannot supply a probability or force an outcome.
create or replace function public.farm_set_effect_triggers(p_user_id uuid, p_effect text)
returns boolean
language sql volatile security definer set search_path = ''
as $$
  select random() < public.farm_set_bonus_percent(p_user_id, p_effect) / 100.0;
$$;
revoke all on function public.farm_set_effect_triggers(uuid, text) from public, anon, authenticated;

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
  extra_quantity integer;
  coin_balance bigint;
  inventory_updates jsonb := '[]'::jsonb;
  bonuses jsonb := '[]'::jsonb;
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

  if public.farm_set_effect_triggers(current_user_id, 'harvestDouble') then
    harvest_amount := harvest_amount * 2;
    bonuses := bonuses || jsonb_build_array('harvestDouble');
  end if;
  if plot_row.fertilizer_id is not null and public.farm_set_effect_triggers(current_user_id, 'fertilizerReturn') then
    extra_quantity := public.apply_farm_inventory_delta(current_user_id, 'supply', plot_row.fertilizer_id, 1);
    inventory_updates := inventory_updates || jsonb_build_array(jsonb_build_object(
      'category', 'supply', 'itemId', plot_row.fertilizer_id, 'quantity', extra_quantity));
    bonuses := bonuses || jsonb_build_array('fertilizerReturn');
  end if;
  if public.farm_set_effect_triggers(current_user_id, 'seedReturn') then
    extra_quantity := public.apply_farm_inventory_delta(current_user_id, 'seed', harvested_crop_id, 1);
    inventory_updates := inventory_updates || jsonb_build_array(jsonb_build_object(
      'category', 'seed', 'itemId', harvested_crop_id, 'quantity', extra_quantity));
    bonuses := bonuses || jsonb_build_array('seedReturn');
  end if;
  if public.farm_set_effect_triggers(current_user_id, 'harvestCoin') then
    coin_balance := public.apply_farm_wallet_change(current_user_id, 'coin', 1, '할로윈 세트 수확 보너스', 'harvest-bonus:' || p_request_id);
    bonuses := bonuses || jsonb_build_array('harvestCoin');
  end if;

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
    'wallet', jsonb_build_object('coinBalance', coin_balance),
    'inventory', inventory_updates || jsonb_build_array(
      jsonb_build_object('category', 'harvest', 'itemId', harvested_crop_id, 'quantity', new_harvest_quantity)
    ),
    'event', jsonb_build_object(
      'cropId', harvested_crop_id, 'harvestAmount', harvest_amount, 'jackpot', is_jackpot, 'bonuses', bonuses
    )
  ));
end;
$$;

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
  bonuses jsonb := '[]'::jsonb;
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
     and plot_row.last_free_water_at > now() - interval '5 hours' * (1 - public.farm_set_bonus_percent(current_user_id, 'water') / 100.0) then
    raise exception 'FARM_WATER_COOLDOWN';
  end if;

  growth_amount := case
    when plot_row.fertilizer_id in ('moistureFertilizer', 'premiumFertilizer') then 2
    else 1
  end;

  if plot_row.growth + growth_amount < max_growth
     and public.farm_set_effect_triggers(current_user_id, 'waterGrowth') then
    growth_amount := growth_amount + 1;
    bonuses := jsonb_build_array('waterGrowth');
  end if;

  update public.farm_plots
  set growth = least(max_growth, growth + growth_amount),
      last_watered_on = (now() at time zone 'Asia/Seoul')::date,
      last_cared_at = now(),
      last_free_water_at = now()
  where user_id = current_user_id and plot_index = p_plot_index
  returning * into plot_row;

  return public.farm_action_finish(current_user_id, p_request_id, jsonb_build_object(
    'event', jsonb_build_object('bonuses', bonuses),
    'plots', jsonb_build_array(public.farm_plot_json(plot_row))
  ));
end;
$$;

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
  food_amount integer := 1;
  refund_crop_id text;
  bonuses jsonb := '[]'::jsonb;
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
    cross join lateral generate_series(1, i.quantity) as units
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

  if public.farm_set_effect_triggers(current_user_id, 'cookDouble') then
    food_amount := 2;
    bonuses := bonuses || jsonb_build_array('cookDouble');
  end if;
  if public.farm_set_effect_triggers(current_user_id, 'ingredientSave') then
    refund_crop_id := p_crop_ids[1 + floor(random() * ingredient_count)::integer];
    current_quantity := public.apply_farm_inventory_delta(current_user_id, 'harvest', refund_crop_id, 1);
    inventory_updates := inventory_updates || jsonb_build_array(jsonb_build_object(
      'category', 'harvest', 'itemId', refund_crop_id, 'quantity', current_quantity));
    bonuses := bonuses || jsonb_build_array('ingredientSave');
  end if;
  new_food_quantity := public.apply_farm_inventory_delta(current_user_id, 'food', matched_recipe_id, food_amount);
  inventory_updates := inventory_updates || jsonb_build_array(jsonb_build_object(
    'category', 'food', 'itemId', matched_recipe_id, 'quantity', new_food_quantity
  ));

  return public.farm_action_finish(current_user_id, p_request_id, jsonb_build_object(
    'inventory', inventory_updates,
    'event', jsonb_build_object(
      'matched', true, 'recipeId', matched_recipe_id, 'foodAmount', food_amount,
      'refundedCropId', refund_crop_id, 'bonuses', bonuses
    )
  ));
end;
$$;

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
  seed_amount integer := 1;
  bonuses jsonb := '[]'::jsonb;
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
  if public.farm_set_effect_triggers(current_user_id, 'seedDouble') then
    seed_amount := 2;
    bonuses := jsonb_build_array('seedDouble');
  end if;
  new_quantity := public.apply_farm_inventory_delta(current_user_id, 'seed', p_crop_id, seed_amount);

  return public.farm_action_finish(current_user_id, p_request_id, jsonb_build_object(
    'inventory', jsonb_build_array(
      jsonb_build_object('category', 'seed', 'itemId', p_crop_id, 'quantity', new_quantity)
    ),
    'wallet', jsonb_build_object('coinBalance', coin_balance),
    'event', jsonb_build_object('seedAmount', seed_amount, 'bonuses', bonuses)
  ));
end;
$$;

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
  bonuses jsonb := '[]'::jsonb;
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
  if public.farm_set_effect_triggers(current_user_id, 'saleDouble') then
    recipe_sell_price := recipe_sell_price * 2;
    bonuses := jsonb_build_array('saleDouble');
  end if;
  farm_money_balance := public.apply_farm_wallet_change(
    current_user_id, 'farm_money', recipe_sell_price, '노아 음식 판매', 'food:' || p_request_id
  );

  return public.farm_action_finish(current_user_id, p_request_id, jsonb_build_object(
    'inventory', jsonb_build_array(
      jsonb_build_object('category', 'food', 'itemId', p_recipe_id, 'quantity', new_food_quantity)
    ),
    'wallet', jsonb_build_object('farmMoneyBalance', farm_money_balance),
    'weeklyFarmMoneyEarned', coalesce((select earned_farm_money from public.farm_weekly_earnings
      where user_id = current_user_id and week_start = public.current_farm_week_start()), 0),
    'event', jsonb_build_object('saleAmount', recipe_sell_price, 'bonuses', bonuses)
  ));
end;
$$;

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
  bonuses jsonb := '[]'::jsonb;
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
  if public.farm_set_effect_triggers(current_user_id, 'saleDouble') then
    total_price := total_price * 2;
    bonuses := jsonb_build_array('saleDouble');
  end if;
  farm_money_balance := public.apply_farm_wallet_change(
    current_user_id, 'farm_money', total_price, '노아 작물 대량 판매', 'crop-bundle:' || p_request_id
  );

  return public.farm_action_finish(current_user_id, p_request_id, jsonb_build_object(
    'inventory', jsonb_build_array(
      jsonb_build_object('category', 'harvest', 'itemId', p_crop_id, 'quantity', new_harvest_quantity)
    ),
    'wallet', jsonb_build_object('farmMoneyBalance', farm_money_balance),
    'weeklyFarmMoneyEarned', coalesce((select earned_farm_money from public.farm_weekly_earnings
      where user_id = current_user_id and week_start = public.current_farm_week_start()), 0),
    'event', jsonb_build_object('saleAmount', total_price, 'bonuses', bonuses)
  ));
end;
$$;

create or replace function public.record_my_focus_time(
  p_event_id uuid,
  p_focus_mode text,
  p_elapsed_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  progress_row public.user_focus_progress%rowtype;
  next_event_ids uuid[];
  combined_seconds integer;
  completed_hours integer := 0;
  reward_per_hour integer := 1;
  awarded_coins integer := 0;
  bonuses jsonb := '[]'::jsonb;
  coin_balance bigint;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_event_id is null then
    raise exception 'Focus event id is required';
  end if;
  if p_focus_mode not in ('linked', 'quick') then
    raise exception 'Unsupported focus mode';
  end if;
  if p_elapsed_seconds not between 1 and 600 then
    raise exception 'Elapsed focus seconds must be between 1 and 600';
  end if;

  insert into public.user_focus_progress (user_id)
  values (current_user_id)
  on conflict (user_id) do nothing;

  select progress.*
  into progress_row
  from public.user_focus_progress as progress
  where progress.user_id = current_user_id
  for update;

  if not (p_event_id = any(progress_row.recent_event_ids)) then
    combined_seconds := progress_row.progress_seconds + p_elapsed_seconds;
    completed_hours := floor(combined_seconds::numeric / 3600)::integer;
    next_event_ids := array_append(progress_row.recent_event_ids, p_event_id);

    if cardinality(next_event_ids) > 128 then
      next_event_ids := next_event_ids[
        cardinality(next_event_ids) - 127:cardinality(next_event_ids)
      ];
    end if;

    update public.user_focus_progress as progress
    set progress_seconds = combined_seconds % 3600,
        recent_event_ids = next_event_ids,
        updated_at = now()
    where progress.user_id = current_user_id
    returning progress.* into progress_row;

    if completed_hours > 0 then
      perform public.ensure_farm_user(current_user_id);

      select case when farms.production_boost_until > now() then 2 else 1 end
      into reward_per_hour
      from public.farms as farms
      where farms.user_id = current_user_id;

      reward_per_hour := coalesce(reward_per_hour, 1);
      awarded_coins := completed_hours * reward_per_hour;
      if public.farm_set_effect_triggers(current_user_id, 'focusCoinDouble') then
        awarded_coins := awarded_coins * 2;
        bonuses := jsonb_build_array('focusCoinDouble');
      end if;

      update public.farm_wallets as wallets
      set coin_balance = wallets.coin_balance + awarded_coins
      where wallets.user_id = current_user_id
      returning wallets.coin_balance into coin_balance;

      insert into public.farm_wallet_ledger (
        user_id, currency, amount, balance_after, reason, reference_key
      ) values (
        current_user_id, 'coin', awarded_coins, coin_balance, '집중 시간 누적 보상', null
      );
    end if;
  end if;

  if coin_balance is null then
    perform public.ensure_farm_user(current_user_id);
    select wallets.coin_balance
    into coin_balance
    from public.farm_wallets as wallets
    where wallets.user_id = current_user_id;
  end if;

  return jsonb_build_object(
    'progressSeconds', progress_row.progress_seconds,
    'coinBalance', coin_balance,
    'awardedCoins', awarded_coins,
    'event', jsonb_build_object('bonuses', bonuses)
  );
end;
$$;

revoke all on function public.harvest_farm_plot(smallint, uuid) from public, anon;
grant execute on function public.harvest_farm_plot(smallint, uuid) to authenticated;
revoke all on function public.water_farm_plot(smallint, uuid) from public, anon;
grant execute on function public.water_farm_plot(smallint, uuid) to authenticated;
revoke all on function public.cook_farm_recipe(text[], uuid) from public, anon;
grant execute on function public.cook_farm_recipe(text[], uuid) to authenticated;
revoke all on function public.buy_farm_seed(text, uuid) from public, anon;
grant execute on function public.buy_farm_seed(text, uuid) to authenticated;
revoke all on function public.sell_farm_food(text, uuid) from public, anon;
grant execute on function public.sell_farm_food(text, uuid) to authenticated;
revoke all on function public.sell_farm_crop_bundle(text, smallint, uuid) from public, anon;
grant execute on function public.sell_farm_crop_bundle(text, smallint, uuid) to authenticated;
revoke all on function public.record_my_focus_time(uuid, text, integer) from public, anon;
grant execute on function public.record_my_focus_time(uuid, text, integer) to authenticated;

update public.farm_catalog_meta set catalog_version = catalog_version + 1 where id = true;
commit;
