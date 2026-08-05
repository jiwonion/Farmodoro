begin;

-- Renaming a farm went through the same whole-snapshot save_my_farm_state
-- call as every other farm change (watering, planting, buying items). That
-- payload always carries whatever farmName happens to be sitting in the
-- browser tab's in-memory state at the time it's built. If a second
-- device/tab was already open with the *old* name in memory and it saves
-- for any unrelated reason (watering a plot, buying a seed) after the
-- rename, its stale farmName silently overwrites the fresh one -- the
-- rename appears to "revert" even though nothing touched it directly.
--
-- Fix: take farmName out of the routine snapshot save entirely and give it
-- its own tiny, targeted RPC. Renaming is a deliberate, infrequent action,
-- not continuously-changing state like plot growth or inventory counts, so
-- it doesn't belong in the "save everything" payload.

create or replace function public.update_my_farm_name(p_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  trimmed_name text := btrim(p_name);
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if char_length(trimmed_name) < 1 or char_length(trimmed_name) > 30 then
    raise exception 'Farm name must be between 1 and 30 characters';
  end if;

  perform public.ensure_farm_user(current_user_id);

  update public.farms
  set farm_name = trimmed_name
  where user_id = current_user_id;

  return trimmed_name;
end;
$$;

revoke all on function public.update_my_farm_name(text) from public, anon;
grant execute on function public.update_my_farm_name(text) to authenticated;

-- Re-declare save_my_farm_state (unchanged from migration 041) minus the
-- farm_name column, so routine autosaves can no longer clobber a rename.
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
    production_boost_until,
    wilt_protection_until,
    waste_count
  )
  values (
    current_user_id,
    case when raw_boost_until is null then null else least(raw_boost_until, max_future_boost) end,
    case when raw_wilt_until is null then null else least(raw_wilt_until, max_future_boost) end,
    greatest(0, coalesce((p_state #>> '{farm,wasteCount}')::integer, 0))
  )
  on conflict (user_id) do update
  set
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
