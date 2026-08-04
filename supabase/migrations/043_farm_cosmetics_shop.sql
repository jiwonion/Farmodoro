-- Rachel's cosmetics shop: farm themes, plot skins, and farm-name label
-- effects. All three are purchased with Farm Money, owned permanently once
-- bought, and freely re-equippable afterward. Purchase/equip go through
-- dedicated security-definer RPCs (not the generic save_my_farm_state_vN
-- payload) so a client can't equip an unowned cosmetic by editing the save
-- payload -- the same rationale migration 037 used for wallet/inventory caps.

create table if not exists public.farm_cosmetics (
  user_id uuid not null references auth.users (id) on delete cascade,
  cosmetic_type text not null,
  cosmetic_id text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, cosmetic_type, cosmetic_id),
  constraint farm_cosmetics_type_value
    check (cosmetic_type in ('farm_theme', 'plot_skin', 'label_effect')),
  constraint farm_cosmetics_id_format
    check (cosmetic_id ~ '^[A-Za-z][A-Za-z0-9]{0,49}$')
);

alter table public.farm_cosmetics enable row level security;

drop policy if exists "Users can read their own cosmetics" on public.farm_cosmetics;
create policy "Users can read their own cosmetics"
  on public.farm_cosmetics for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.farm_cosmetics from anon, authenticated;
grant select on table public.farm_cosmetics to authenticated;

alter table public.farms
  add column if not exists equipped_farm_theme text,
  add column if not exists equipped_plot_skin text,
  add column if not exists equipped_label_effect text;

alter table public.farm_market_rotations
  add column if not exists cosmetic_offer_ids text[] not null default '{}'::text[];
alter table public.farm_market_rotations
  drop constraint if exists farm_market_cosmetic_offer_count;
alter table public.farm_market_rotations
  add constraint farm_market_cosmetic_offer_count
    check (cardinality(cosmetic_offer_ids) <= 3);

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
  new_balance bigint;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_cosmetic_type not in ('farm_theme', 'plot_skin', 'label_effect') then
    raise exception 'Unsupported cosmetic type';
  end if;
  if p_price not between 1 and 10000 then
    raise exception 'Cosmetic price is out of allowed range';
  end if;

  perform public.ensure_farm_user(current_user_id);

  if exists (
    select 1 from public.farm_cosmetics
    where user_id = current_user_id
      and cosmetic_type = p_cosmetic_type
      and cosmetic_id = p_cosmetic_id
  ) then
    raise exception 'Cosmetic already owned';
  end if;

  new_balance := public.apply_farm_wallet_change(
    current_user_id,
    'farm_money',
    -p_price,
    '레이첼 상점 구매',
    'cosmetic:' || p_cosmetic_type || ':' || p_cosmetic_id
  );

  insert into public.farm_cosmetics (user_id, cosmetic_type, cosmetic_id)
  values (current_user_id, p_cosmetic_type, p_cosmetic_id)
  on conflict (user_id, cosmetic_type, cosmetic_id) do nothing;

  update public.farms
  set
    equipped_farm_theme = case when p_cosmetic_type = 'farm_theme' then p_cosmetic_id else equipped_farm_theme end,
    equipped_plot_skin = case when p_cosmetic_type = 'plot_skin' then p_cosmetic_id else equipped_plot_skin end,
    equipped_label_effect = case when p_cosmetic_type = 'label_effect' then p_cosmetic_id else equipped_label_effect end
  where user_id = current_user_id;

  return jsonb_build_object('farmMoneyBalance', new_balance);
end;
$$;

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
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_cosmetic_type not in ('farm_theme', 'plot_skin', 'label_effect') then
    raise exception 'Unsupported cosmetic type';
  end if;
  if p_cosmetic_id is not null and not exists (
    select 1 from public.farm_cosmetics
    where user_id = current_user_id
      and cosmetic_type = p_cosmetic_type
      and cosmetic_id = p_cosmetic_id
  ) then
    raise exception 'Cosmetic not owned';
  end if;

  perform public.ensure_farm_user(current_user_id);

  update public.farms
  set
    equipped_farm_theme = case when p_cosmetic_type = 'farm_theme' then p_cosmetic_id else equipped_farm_theme end,
    equipped_plot_skin = case when p_cosmetic_type = 'plot_skin' then p_cosmetic_id else equipped_plot_skin end,
    equipped_label_effect = case when p_cosmetic_type = 'label_effect' then p_cosmetic_id else equipped_label_effect end
  where user_id = current_user_id;
end;
$$;

revoke all on function public.purchase_farm_cosmetic(text, text, integer) from public, anon, authenticated;
revoke all on function public.equip_farm_cosmetic(text, text) from public, anon, authenticated;
grant execute on function public.purchase_farm_cosmetic(text, text, integer) to authenticated;
grant execute on function public.equip_farm_cosmetic(text, text) to authenticated;

-- get_my_farm_state_v4: layer owned cosmetics + equipped ids on top of v3.
create or replace function public.get_my_farm_state_v4()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  result jsonb;
  owned_cosmetics jsonb;
  equipped jsonb;
  cosmetic_offers jsonb;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  result := public.get_my_farm_state_v3();

  select coalesce(jsonb_agg(jsonb_build_object('type', c.cosmetic_type, 'id', c.cosmetic_id)), '[]'::jsonb)
  into owned_cosmetics
  from public.farm_cosmetics as c
  where c.user_id = current_user_id;

  select jsonb_build_object(
    'equippedFarmTheme', farms.equipped_farm_theme,
    'equippedPlotSkin', farms.equipped_plot_skin,
    'equippedLabelEffect', farms.equipped_label_effect
  )
  into equipped
  from public.farms as farms
  where farms.user_id = current_user_id;

  select coalesce(
    jsonb_agg(jsonb_build_object(
      'type', split_part(offer_id, ':', 1),
      'id', split_part(offer_id, ':', 2)
    )),
    '[]'::jsonb
  )
  into cosmetic_offers
  from (
    select rotations.cosmetic_offer_ids
    from public.farm_market_rotations as rotations
    where rotations.user_id = current_user_id
    order by rotations.rotation_date desc
    limit 1
  ) as latest_rotation, unnest(latest_rotation.cosmetic_offer_ids) as offer_id;

  result := jsonb_set(result, '{farm}', coalesce(result -> 'farm', '{}'::jsonb) || coalesce(equipped, '{}'::jsonb), true);
  result := jsonb_set(result, '{ownedCosmetics}', owned_cosmetics, true);
  result := jsonb_set(result, '{marketRotation,cosmeticOffers}', coalesce(cosmetic_offers, '[]'::jsonb), true);

  return result;
end;
$$;

revoke all on function public.get_my_farm_state_v4() from public, anon;
grant execute on function public.get_my_farm_state_v4() to authenticated;

create or replace function public.save_my_farm_state_v4(p_state jsonb)
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

  perform public.save_my_farm_state_v3(p_state);

  target_rotation_date := nullif(p_state #>> '{marketRotation,date}', '')::date;
  if target_rotation_date is not null then
    update public.farm_market_rotations
    set cosmetic_offer_ids = array(
      select (entry ->> 'type') || ':' || (entry ->> 'id')
      from jsonb_array_elements(
        coalesce(p_state #> '{marketRotation,cosmeticOffers}', '[]'::jsonb)
      ) as entry
    )
    where user_id = current_user_id
      and rotation_date = target_rotation_date;
  end if;
end;
$$;

revoke all on function public.save_my_farm_state_v4(jsonb) from public, anon;
grant execute on function public.save_my_farm_state_v4(jsonb) to authenticated;

-- Leaderboard: expose the equipped label effect so ranking rows can render it.
-- create or replace cannot change a `returns table (...)` function's row
-- shape (we're adding equipped_label_effect as a new output column), so the
-- old signature has to be dropped first.
drop function if exists public.get_farm_leaderboard(date);

create or replace function public.get_farm_leaderboard(
  p_week_start date default null
)
returns table (
  rank_position bigint,
  display_name text,
  avatar_url text,
  farm_name text,
  earned_farm_money bigint,
  is_me boolean,
  equipped_label_effect text
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
    farms.equipped_label_effect
  from public.farm_weekly_earnings as earnings
  join public.profiles as profiles on profiles.id = earnings.user_id
  join public.farms as farms on farms.user_id = earnings.user_id
  where earnings.week_start = coalesce(p_week_start, public.current_farm_week_start())
  order by rank_position
  limit 100;
$$;

revoke all on function public.get_farm_leaderboard(date) from public, anon;
grant execute on function public.get_farm_leaderboard(date) to authenticated;
