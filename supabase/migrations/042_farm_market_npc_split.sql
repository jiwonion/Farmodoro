-- Splits the single "market" NPC into Morrison (seeds), Noah (buys food and
-- crops), and Rachel (cosmetics, added in a later migration). This migration
-- adds Noah's daily crop-sell-offer rotation and layers it on top of
-- get_my_farm_state_v2/save_my_farm_state_v2 following the same thin-wrapper
-- convention those functions themselves use over the base v1 functions.

alter table public.farm_market_rotations
  add column if not exists crop_sell_offer_ids text[] not null default '{}'::text[];

alter table public.farm_market_rotations
  drop constraint if exists farm_market_crop_sell_offer_count;
alter table public.farm_market_rotations
  add constraint farm_market_crop_sell_offer_count
    check (cardinality(crop_sell_offer_ids) <= 5);

create or replace function public.get_my_farm_state_v3()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  result jsonb;
  crop_sell_offers jsonb;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  result := public.get_my_farm_state_v2();

  -- crop_sell_offer_ids entries are "{cropId}:{bundleSize}" strings.
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'cropId', split_part(offer_id, ':', 1),
      'bundleSize', split_part(offer_id, ':', 2)::integer
    )),
    '[]'::jsonb
  )
  into crop_sell_offers
  from (
    select rotations.crop_sell_offer_ids
    from public.farm_market_rotations as rotations
    where rotations.user_id = current_user_id
    order by rotations.rotation_date desc
    limit 1
  ) as latest_rotation, unnest(latest_rotation.crop_sell_offer_ids) as offer_id
  -- Defends against any stale rows saved by an earlier, pre-bundleSize
  -- version of this migration (plain "cropId" entries with no ":").
  where offer_id like '%:%';

  return jsonb_set(
    result,
    '{marketRotation,cropSellOffers}',
    coalesce(crop_sell_offers, '[]'::jsonb),
    true
  );
end;
$$;

create or replace function public.save_my_farm_state_v3(p_state jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_rotation_date date;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  perform public.save_my_farm_state_v2(p_state);

  target_rotation_date := nullif(p_state #>> '{marketRotation,date}', '')::date;
  if target_rotation_date is not null then
    update public.farm_market_rotations
    set crop_sell_offer_ids = array(
      select (entry ->> 'cropId') || ':' || (entry ->> 'bundleSize')
      from jsonb_array_elements(
        coalesce(p_state #> '{marketRotation,cropSellOffers}', '[]'::jsonb)
      ) as entry
    )
    where user_id = current_user_id
      and rotation_date = target_rotation_date;
  end if;
end;
$$;

revoke all on function public.get_my_farm_state_v3() from public, anon;
revoke all on function public.save_my_farm_state_v3(jsonb) from public, anon;
grant execute on function public.get_my_farm_state_v3() to authenticated;
grant execute on function public.save_my_farm_state_v3(jsonb) to authenticated;
