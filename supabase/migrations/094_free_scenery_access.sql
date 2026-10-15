begin;

-- Open the current scenery system to every account during the redesign.
-- Preserve catalog prices, existing wallet balances, active progress and history.
-- Themes and creation types are granted permanently; retired plot skins are not
-- part of the current scenery UI.
insert into public.farm_cosmetics (user_id, cosmetic_type, cosmetic_id)
select account.id, catalog.cosmetic_type, catalog.cosmetic_id
from auth.users account
cross join public.farm_cosmetic_catalog catalog
where catalog.cosmetic_type = 'farm_theme'
on conflict (user_id, cosmetic_type, cosmetic_id) do nothing;

insert into public.farm_scenery_unlocked_types (user_id, type_id)
select account.id, catalog.type_id
from auth.users account
cross join public.farm_scenery_catalog catalog
where true
on conflict (user_id, type_id) do nothing;

-- New accounts and later catalog additions receive the same access when the
-- farm is first read or used. The existing initialization contract is retained.
create or replace function public.ensure_farm_user(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.farm_wallets(user_id) values(p_user_id) on conflict do nothing;
  insert into public.farms(user_id) values(p_user_id) on conflict do nothing;
  insert into public.farm_weekly_earnings(user_id, week_start)
    values(p_user_id, public.current_farm_week_start()) on conflict do nothing;
  insert into public.farm_cosmetics(user_id, cosmetic_type, cosmetic_id)
    select p_user_id, catalog.cosmetic_type, catalog.cosmetic_id
    from public.farm_cosmetic_catalog catalog
    where catalog.cosmetic_type = 'farm_theme'
      and not exists (select 1 from public.farm_cosmetics owned
        where owned.user_id = p_user_id and owned.cosmetic_type = catalog.cosmetic_type
          and owned.cosmetic_id = catalog.cosmetic_id)
    on conflict (user_id, cosmetic_type, cosmetic_id) do nothing;
  insert into public.farm_scenery_unlocked_types(user_id, type_id)
    select p_user_id, catalog.type_id from public.farm_scenery_catalog catalog
    where not exists (select 1 from public.farm_scenery_unlocked_types owned
      where owned.user_id = p_user_id and owned.type_id = catalog.type_id)
    on conflict (user_id, type_id) do nothing;
end;
$$;
revoke all on function public.ensure_farm_user(uuid) from public, anon, authenticated;

-- Report the server's growth mode to clients. Older databases omit this field,
-- so the updated client continues to enforce their original Coin rules.
create or replace function public.farm_scenery_state_json(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'freeGrowth', true,
    'activeCreation', (
      select jsonb_build_object('id', c.id, 'typeId', c.type_id, 'themeId', c.theme_id,
        'progress', c.progress, 'growthCost', c.growth_cost, 'reward', c.reward)
      from public.farm_scenery_creations c
      where c.user_id = p_user_id and c.claimed_at is null
    ),
    'unlockedTypes', (
      select coalesce(jsonb_agg(c.type_id order by c.type_id), '[]'::jsonb)
      from public.farm_scenery_catalog c
      where c.unlock_price = 0 or exists (
        select 1 from public.farm_scenery_unlocked_types u
        where u.user_id = p_user_id and u.type_id = c.type_id
      )
    ),
    'completedTypes', (
      select coalesce(jsonb_agg(jsonb_build_object('typeId', history.type_id, 'count', history.completed_count)
        order by history.type_id), '[]'::jsonb)
      from (
        select c.type_id, count(*) as completed_count from public.farm_scenery_creations c
        where c.user_id = p_user_id and c.claimed_at is not null group by c.type_id
      ) history
    ),
    'totalCompleted', (select count(*) from public.farm_scenery_creations c
      where c.user_id = p_user_id and c.claimed_at is not null),
    'catalog', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.type_id, 'name', c.name, 'family', c.family, 'variant', c.variant,
      'unlockPrice', c.unlock_price, 'growthCost', c.growth_cost, 'reward', c.reward)
      order by c.type_id), '[]'::jsonb) from public.farm_scenery_catalog c)
  );
$$;
revoke all on function public.farm_scenery_state_json(uuid) from public, anon, authenticated;

create or replace function public.grow_my_scenery_creation(p_creation_id uuid, p_amount integer, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid(); cached_result jsonb;
  creation public.farm_scenery_creations%rowtype; growth_added integer;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  perform public.ensure_farm_user(current_user_id);
  perform public.lock_my_farm_actions(current_user_id);
  cached_result := public.begin_my_farm_action(current_user_id, p_request_id, 'grow_my_scenery_creation');
  if cached_result is not null then
    return public.farm_scenery_result_json(current_user_id, cached_result -> 'event');
  end if;
  if p_amount is null or p_amount not between 1 and 100 then raise exception 'SCENERY_INVALID_AMOUNT'; end if;
  select * into creation from public.farm_scenery_creations
    where id = p_creation_id and user_id = current_user_id for update;
  if not found or creation.claimed_at is not null then raise exception 'SCENERY_CREATION_NOT_FOUND'; end if;
  if creation.progress = creation.growth_cost then raise exception 'SCENERY_ALREADY_COMPLETE'; end if;
  growth_added := least(p_amount, creation.growth_cost - creation.progress);
  -- Growth is now button driven. Never charge, credit or fabricate Coin.
  update public.farm_scenery_creations set progress = progress + growth_added
    where id = creation.id returning * into creation;
  return public.farm_action_finish(current_user_id, p_request_id,
    public.farm_scenery_result_json(current_user_id, jsonb_build_object(
      'creationId', creation.id, 'spentCoin', 0, 'growthAdded', growth_added,
      'progress', creation.progress, 'completed', creation.progress = creation.growth_cost)));
end;
$$;
revoke all on function public.grow_my_scenery_creation(uuid, integer, uuid) from public, anon;
grant execute on function public.grow_my_scenery_creation(uuid, integer, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
