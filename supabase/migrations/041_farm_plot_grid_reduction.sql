begin;

-- Shrinks the farm grid from 4x4 (16 plots, index 0-15) to 3x3 (9 plots).
-- Kept plot indexes are the top-left 3x3 block of the old row-major grid:
-- {0,1,2,4,5,6,8,9,10}. Removed: {3,7,11,12,13,14,15}.
--
-- Anyone with a crop planted in a removed plot is refunded Coin for the
-- seed price plus 1 Coin per growth step already invested (growth cost is
-- indistinguishable from free watering in current data, so this refunds
-- the generous upper bound rather than risk shortchanging players).

-- 1-2. Refund every user for occupied plots about to be removed. The
--    crop_id -> seedPrice lookup (mirrored from CROPS[...].seedPrice in
--    app.js) is kept as a local jsonb constant inside this single do-block,
--    rather than a separate temp table: some SQL runners execute each
--    top-level statement in its own auto-committed transaction even when
--    the script wraps everything in an explicit begin/commit, which would
--    drop an `on commit drop` temp table before this block ever ran it.
do $$
declare
  seed_prices jsonb := '{
    "carrot": 1, "tomato": 2, "corn": 3, "potato": 2, "sweetPotato": 3,
    "strawberry": 3, "eggplant": 3, "pepper": 3, "cucumber": 2, "pumpkin": 4,
    "onion": 2, "garlic": 2, "cabbage": 3, "broccoli": 3, "watermelon": 5,
    "melon": 5, "rice": 3, "mushroom": 4, "sunflower": 4, "beet": 3,
    "radish": 2, "turnip": 3, "chili": 3, "lettuce": 2, "spinach": 2,
    "kale": 3, "celery": 3, "pea": 3, "bean": 3, "peanut": 3, "wheat": 3,
    "barley": 3, "oat": 3, "grape": 5, "blueberry": 5, "raspberry": 5,
    "apple": 6, "pear": 6, "peach": 6, "cherry": 6, "lemon": 6, "orange": 6,
    "pineapple": 7, "kiwi": 6
  }'::jsonb;
  removed_plot record;
  refund_amount bigint;
begin
  for removed_plot in
    select plots.user_id, plots.plot_index, plots.crop_id, plots.growth
    from public.farm_plots as plots
    where plots.plot_index in (3, 7, 11, 12, 13, 14, 15)
      and plots.crop_id is not null
  loop
    refund_amount := coalesce((seed_prices ->> removed_plot.crop_id)::integer, 3) + removed_plot.growth;

    perform public.apply_farm_wallet_change(
      removed_plot.user_id,
      'coin',
      refund_amount,
      '농장 밭 개편 환불',
      'plot-reduction-041:' || removed_plot.user_id || ':' || removed_plot.plot_index
    );
  end loop;
end;
$$;

-- 3. Remove the plot rows outside the kept 3x3 block.
delete from public.farm_plots where plot_index in (3, 7, 11, 12, 13, 14, 15);

-- 4. Tighten the index range to the 9 kept plots.
alter table public.farm_plots drop constraint if exists farm_plots_index_range;
alter table public.farm_plots
  add constraint farm_plots_index_range check (plot_index in (0, 1, 2, 4, 5, 6, 8, 9, 10));

-- 5. New-user provisioning now creates exactly the 9 kept plots.
create or replace function public.ensure_farm_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.farm_wallets (user_id) values (p_user_id) on conflict (user_id) do nothing;
  insert into public.farms (user_id) values (p_user_id) on conflict (user_id) do nothing;

  insert into public.farm_plots (user_id, plot_index)
  select p_user_id, plot_index
  from unnest(array[0, 1, 2, 4, 5, 6, 8, 9, 10]::smallint[]) as plot_index
  on conflict (user_id, plot_index) do nothing;

  insert into public.farm_weekly_earnings (user_id, week_start)
  values (p_user_id, public.current_farm_week_start())
  on conflict (user_id, week_start) do nothing;
end;
$$;

comment on table public.farm_plots is 'Nine persistent crop plots per user (top-left 3x3 of the legacy 4x4 grid)';

-- 6. During rollout, a browser tab that hasn't picked up the new app.js yet
--    may still submit plot indexes 3/7/11-15. Skip those rows instead of
--    letting the constraint violation abort the whole save_my_farm_state
--    call (which would otherwise also block saving the other 9 plots,
--    inventory, and recipe discoveries in the same payload).
create or replace function public.save_my_farm_state(p_state jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  entry jsonb;
  rotation_date date;
  raw_boost_until timestamptz;
  raw_wilt_until timestamptz;
  max_future_boost timestamptz := now() + interval '90 days';
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if jsonb_typeof(p_state) <> 'object' then
    raise exception 'Farm state must be an object';
  end if;

  perform public.ensure_farm_user(current_user_id);

  raw_boost_until := nullif(p_state #>> '{farm,productionBoostUntil}', '')::timestamptz;
  raw_wilt_until := nullif(p_state #>> '{farm,wiltProtectionUntil}', '')::timestamptz;

  insert into public.farms (
    user_id,
    farm_name,
    production_boost_until,
    wilt_protection_until,
    waste_count
  )
  values (
    current_user_id,
    coalesce(nullif(btrim(p_state #>> '{farm,farmName}'), ''), '햇살 밭'),
    case when raw_boost_until is null then null else least(raw_boost_until, max_future_boost) end,
    case when raw_wilt_until is null then null else least(raw_wilt_until, max_future_boost) end,
    greatest(0, coalesce((p_state #>> '{farm,wasteCount}')::integer, 0))
  )
  on conflict (user_id) do update
  set
    farm_name = excluded.farm_name,
    production_boost_until = excluded.production_boost_until,
    wilt_protection_until = excluded.wilt_protection_until,
    waste_count = excluded.waste_count;

  for entry in select value from jsonb_array_elements(coalesce(p_state -> 'plots', '[]'::jsonb)) loop
    if (entry ->> 'id')::smallint not in (0, 1, 2, 4, 5, 6, 8, 9, 10) then
      continue;
    end if;

    insert into public.farm_plots (
      user_id,
      plot_index,
      crop_id,
      growth,
      planted_on,
      last_watered_on,
      last_free_water_at,
      wilted,
      fertilizer_id
    )
    values (
      current_user_id,
      (entry ->> 'id')::smallint,
      nullif(entry ->> 'crop', ''),
      greatest(0, coalesce((entry ->> 'growth')::smallint, 0)),
      nullif(entry ->> 'plantedDate', '')::date,
      nullif(entry ->> 'lastWateredDate', '')::date,
      nullif(entry ->> 'lastFreeWaterAt', '')::timestamptz,
      coalesce((entry ->> 'wilted')::boolean, false),
      nullif(entry ->> 'fertilizer', '')
    )
    on conflict (user_id, plot_index) do update
    set
      crop_id = excluded.crop_id,
      growth = excluded.growth,
      planted_on = excluded.planted_on,
      last_watered_on = excluded.last_watered_on,
      last_free_water_at = excluded.last_free_water_at,
      wilted = excluded.wilted,
      fertilizer_id = excluded.fertilizer_id;
  end loop;

  for entry in select value from jsonb_array_elements(coalesce(p_state -> 'inventory', '[]'::jsonb)) loop
    insert into public.farm_inventory (user_id, category, item_id, quantity)
    values (
      current_user_id,
      entry ->> 'category',
      entry ->> 'itemId',
      least(100000, greatest(0, coalesce((entry ->> 'quantity')::integer, 0)))
    )
    on conflict (user_id, category, item_id) do update
    set quantity = excluded.quantity;
  end loop;

  delete from public.farm_recipe_discoveries
  where user_id = current_user_id;
  insert into public.farm_recipe_discoveries (user_id, recipe_id)
  select current_user_id, recipes.recipe_id
  from jsonb_array_elements_text(coalesce(p_state -> 'discoveredRecipes', '[]'::jsonb)) as recipes(recipe_id)
  on conflict (user_id, recipe_id) do nothing;

  rotation_date := nullif(p_state #>> '{marketRotation,date}', '')::date;
  if rotation_date is not null then
    insert into public.farm_market_rotations (
      user_id,
      rotation_date,
      seed_offer_ids,
      food_offer_ids
    )
    values (
      current_user_id,
      rotation_date,
      array(select jsonb_array_elements_text(coalesce(p_state #> '{marketRotation,seedOffers}', '[]'::jsonb))),
      array(select jsonb_array_elements_text(coalesce(p_state #> '{marketRotation,foodOffers}', '[]'::jsonb)))
    )
    on conflict on constraint farm_market_rotations_pkey do update
    set
      seed_offer_ids = excluded.seed_offer_ids,
      food_offer_ids = excluded.food_offer_ids;
  end if;
end;
$$;

revoke all on function public.save_my_farm_state(jsonb) from public, anon;
grant execute on function public.save_my_farm_state(jsonb) to authenticated;

commit;
