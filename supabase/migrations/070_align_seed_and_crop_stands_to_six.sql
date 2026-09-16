-- Keep the compact farm-desk market at six visible offers per stand.

begin;

-- Existing seven-item rotations must be shortened before tightening constraints.
update public.farm_market_rotations
set seed_offer_ids = seed_offer_ids[1:6],
    crop_sell_offer_ids = crop_sell_offer_ids[1:6]
where cardinality(seed_offer_ids) > 6
   or cardinality(crop_sell_offer_ids) > 6;

alter table public.farm_market_rotations
  drop constraint if exists farm_market_seed_offer_count;
alter table public.farm_market_rotations
  add constraint farm_market_seed_offer_count
    check (cardinality(seed_offer_ids) <= 6);

alter table public.farm_market_rotations
  drop constraint if exists farm_market_crop_sell_offer_count;
alter table public.farm_market_rotations
  add constraint farm_market_crop_sell_offer_count
    check (cardinality(crop_sell_offer_ids) <= 6);

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

  if seed_count <> 6 then
    select array_agg(crop_id) into rolled_seeds
    from (select crop_id from public.farm_crop_catalog order by random() limit 6) as t;
    update public.farm_market_rotations set seed_offer_ids = rolled_seeds
    where user_id = p_user_id and rotation_date = today;
  end if;

  if food_count <> 6 then
    select array_agg(recipe_id) into rolled_foods
    from (select recipe_id from public.farm_recipe_catalog order by random() limit 6) as t;
    update public.farm_market_rotations set food_offer_ids = rolled_foods
    where user_id = p_user_id and rotation_date = today;
  end if;

  if crop_sell_count <> 6 then
    select array_agg(offer) into rolled_crop_sell
    from (
      select crop_id || ':' || (case when random() < 0.5 then 5 else 10 end) as offer
      from public.farm_crop_catalog
      order by random()
      limit 6
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
    from (select crop_id from public.farm_crop_catalog order by random() limit 6) as t;
    update public.farm_market_rotations set seed_offer_ids = rolled_seeds
    where user_id = current_user_id and rotation_date = today;
  else
    select array_agg(recipe_id) into rolled_foods
    from (select recipe_id from public.farm_recipe_catalog order by random() limit 6) as t;
    select array_agg(offer) into rolled_crop_sell
    from (
      select crop_id || ':' || (case when random() < 0.5 then 5 else 10 end) as offer
      from public.farm_crop_catalog order by random() limit 6
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

commit;
