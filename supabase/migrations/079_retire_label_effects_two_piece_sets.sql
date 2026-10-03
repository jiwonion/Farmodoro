begin;

-- Farm-name nameplates (label effects) are retired. Sets now count only the
-- equipped farm theme and field: one piece is tier 1 (1%), both are tier 2 (5%).
create or replace function public.farm_set_bonus_percent(p_user_id uuid, p_effect text)
returns integer
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(case equipped_count when 1 then 1 when 2 then 5 else 0 end), 0)::integer
  from (
    select members.set_id, count(*) as equipped_count
    from public.farms as farm
    cross join lateral (values
      ('farm_theme', farm.equipped_farm_theme),
      ('plot_skin', farm.equipped_plot_skin)
    ) as equipped(cosmetic_type, cosmetic_id)
    join public.farm_cosmetics as owned on owned.user_id = farm.user_id
      and owned.cosmetic_type = equipped.cosmetic_type and owned.cosmetic_id = equipped.cosmetic_id
    join public.farm_cosmetic_set_members as members on members.cosmetic_type = equipped.cosmetic_type and members.cosmetic_id = equipped.cosmetic_id
    join public.farm_cosmetic_sets as sets on sets.set_id = members.set_id
    where farm.user_id = p_user_id and sets.effect = p_effect
    group by members.set_id
  ) as bonuses;
$$;
revoke all on function public.farm_set_bonus_percent(uuid, text) from public, anon, authenticated;

-- Nameplates leave the sets, the daily offers and the catalog. Ownership rows
-- are kept as purchase history but can no longer be equipped.
delete from public.farm_cosmetic_set_members where cosmetic_type = 'label_effect';
delete from public.farm_cosmetic_catalog where cosmetic_type = 'label_effect';
update public.farm_market_rotations
  set cosmetic_offer_ids = array(select offer from unnest(cosmetic_offer_ids) as offer where offer not like 'label_effect:%')
  where exists (select 1 from unnest(cosmetic_offer_ids) as offer where offer like 'label_effect:%');
update public.farms set equipped_label_effect = null where equipped_label_effect is not null;

create or replace function public.purchase_farm_cosmetic(
  p_cosmetic_type text,
  p_cosmetic_id text,
  p_price integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  catalog_price integer;
  new_balance bigint;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if p_cosmetic_type is null or p_cosmetic_type not in ('farm_theme', 'plot_skin') then
    raise exception 'Unsupported cosmetic type';
  end if;
  select price into catalog_price from public.farm_cosmetic_catalog
    where cosmetic_type = p_cosmetic_type and cosmetic_id = p_cosmetic_id;
  if catalog_price is null then raise exception 'FARM_UNKNOWN_COSMETIC'; end if;
  if p_price is distinct from catalog_price then raise exception 'FARM_COSMETIC_PRICE_CHANGED'; end if;

  perform public.ensure_farm_user(current_user_id);
  perform 1 from public.farms where user_id = current_user_id for update;
  if exists (select 1 from public.farm_cosmetics
    where user_id = current_user_id and cosmetic_type = p_cosmetic_type and cosmetic_id = p_cosmetic_id) then
    raise exception 'Cosmetic already owned';
  end if;

  new_balance := public.apply_farm_wallet_change(current_user_id, 'farm_money',
    -catalog_price::bigint, '레이첼 상점 구매', 'cosmetic:' || p_cosmetic_type || ':' || p_cosmetic_id);
  insert into public.farm_cosmetics (user_id, cosmetic_type, cosmetic_id)
    values (current_user_id, p_cosmetic_type, p_cosmetic_id);
  update public.farms set
    equipped_farm_theme = case when p_cosmetic_type = 'farm_theme' then p_cosmetic_id else equipped_farm_theme end,
    equipped_plot_skin = case when p_cosmetic_type = 'plot_skin' then p_cosmetic_id else equipped_plot_skin end
    where user_id = current_user_id;
  return jsonb_build_object('farmMoneyBalance', new_balance);
end;
$$;
revoke all on function public.purchase_farm_cosmetic(text, text, integer) from public, anon, authenticated;
grant execute on function public.purchase_farm_cosmetic(text, text, integer) to authenticated;

create or replace function public.equip_farm_cosmetic(
  p_cosmetic_type text,
  p_cosmetic_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if p_cosmetic_type is null or p_cosmetic_type not in ('farm_theme', 'plot_skin') then
    raise exception 'Unsupported cosmetic type';
  end if;
  if p_cosmetic_id is not null and not exists (
    select 1 from public.farm_cosmetics
    where user_id = current_user_id and cosmetic_type = p_cosmetic_type and cosmetic_id = p_cosmetic_id
  ) then
    raise exception 'Cosmetic not owned';
  end if;

  perform public.ensure_farm_user(current_user_id);
  update public.farms set
    equipped_farm_theme = case when p_cosmetic_type = 'farm_theme' then p_cosmetic_id else equipped_farm_theme end,
    equipped_plot_skin = case when p_cosmetic_type = 'plot_skin' then p_cosmetic_id else equipped_plot_skin end
    where user_id = current_user_id;
end;
$$;
revoke all on function public.equip_farm_cosmetic(text, text) from public, anon, authenticated;
grant execute on function public.equip_farm_cosmetic(text, text) to authenticated;

-- The leaderboard no longer exposes the nameplate column.
drop function if exists public.get_farm_leaderboard(date);
create function public.get_farm_leaderboard(p_week_start date default null)
returns table (
  rank_position bigint,
  display_name text,
  avatar_url text,
  farm_name text,
  earned_farm_money bigint,
  is_me boolean,
  farm_code text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    row_number() over (
      order by earnings.earned_farm_money desc, earnings.updated_at, earnings.user_id
    ) as rank_position,
    profiles.display_name,
    profiles.avatar_url,
    farms.farm_name,
    earnings.earned_farm_money,
    earnings.user_id = auth.uid() as is_me,
    profiles.farm_code
  from public.farm_weekly_earnings as earnings
  join public.profiles as profiles on profiles.id = earnings.user_id
  join public.farms as farms on farms.user_id = earnings.user_id
  where earnings.week_start = coalesce(p_week_start, public.current_farm_week_start())
  order by rank_position
  limit 100;
$$;
revoke all on function public.get_farm_leaderboard(date) from public, anon;
grant execute on function public.get_farm_leaderboard(date) to authenticated;

update public.farm_catalog_meta set catalog_version = catalog_version + 1 where id = true;
commit;
