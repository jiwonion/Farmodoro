begin;

-- One creation at a time, tied to the theme selected when it was started.
-- Existing wallets, cosmetics, crops, inventory and ledger history are kept.
create table if not exists public.farm_scenery_catalog (
  type_id text primary key,
  name text not null,
  family text not null,
  variant smallint not null default 0 check (variant >= 0),
  unlock_price integer not null check (unlock_price between 0 and 10000),
  growth_cost integer not null check (growth_cost between 1 and 10000),
  reward integer not null check (reward between 1 and 10000)
);

insert into public.farm_scenery_catalog (type_id, name, family, variant, unlock_price, growth_cost, reward) values
  ('tree', '초록 나무', 'tree', 0, 0, 20, 50),
  ('blossomTree', '벚꽃 나무', 'tree', 1, 300, 20, 50),
  ('goldenTree', '황금 나무', 'tree', 2, 300, 20, 50),
  ('coral', '산호', 'coral', 0, 0, 20, 50),
  ('pinkCoral', '분홍 산호', 'coral', 1, 300, 20, 50),
  ('sandcastle', '모래성', 'sandcastle', 0, 300, 20, 50),
  ('snowman', '눈사람', 'snowman', 0, 0, 20, 50),
  ('snowRabbit', '눈토끼', 'snowRabbit', 0, 300, 20, 50),
  ('star', '별', 'star', 0, 0, 20, 50),
  ('planet', '작은 행성', 'planet', 0, 300, 20, 50),
  ('crystal', '수정', 'crystal', 0, 0, 20, 50),
  ('roseCrystal', '장미 수정', 'crystal', 1, 300, 20, 50),
  ('cactus', '선인장', 'cactus', 0, 0, 20, 50),
  ('floweringCactus', '꽃 선인장', 'cactus', 1, 300, 20, 50)
on conflict (type_id) do update set
  name = excluded.name, family = excluded.family, variant = excluded.variant,
  unlock_price = excluded.unlock_price, growth_cost = excluded.growth_cost, reward = excluded.reward;

create table if not exists public.farm_scenery_unlocked_types (
  user_id uuid not null references auth.users (id) on delete cascade,
  type_id text not null references public.farm_scenery_catalog (type_id),
  unlocked_at timestamptz not null default now(),
  primary key (user_id, type_id)
);

create table if not exists public.farm_scenery_creations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type_id text not null references public.farm_scenery_catalog (type_id),
  theme_id text,
  progress integer not null default 0,
  -- Freeze the economy for each creation if the catalog changes later.
  growth_cost integer not null check (growth_cost between 1 and 10000),
  reward integer not null check (reward between 1 and 10000),
  started_at timestamptz not null default now(),
  claimed_at timestamptz,
  constraint farm_scenery_progress_range check (progress between 0 and growth_cost),
  constraint farm_scenery_claim_requires_complete check (claimed_at is null or progress = growth_cost)
);
-- Independently enforces the invariant even if another writer omits the RPC lock.
create unique index if not exists farm_scenery_one_active_per_user
  on public.farm_scenery_creations (user_id) where claimed_at is null;
create index if not exists farm_scenery_user_history
  on public.farm_scenery_creations (user_id, type_id) where claimed_at is not null;

alter table public.farm_scenery_catalog enable row level security;
alter table public.farm_scenery_unlocked_types enable row level security;
alter table public.farm_scenery_creations enable row level security;
drop policy if exists "Authenticated read scenery catalog" on public.farm_scenery_catalog;
create policy "Authenticated read scenery catalog" on public.farm_scenery_catalog
  for select to authenticated using (true);
drop policy if exists "Read own scenery unlocks" on public.farm_scenery_unlocked_types;
create policy "Read own scenery unlocks" on public.farm_scenery_unlocked_types
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Read own scenery creations" on public.farm_scenery_creations;
create policy "Read own scenery creations" on public.farm_scenery_creations
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.farm_scenery_catalog, public.farm_scenery_unlocked_types,
  public.farm_scenery_creations from public, anon, authenticated;
grant select on public.farm_scenery_catalog, public.farm_scenery_unlocked_types,
  public.farm_scenery_creations to authenticated;

create or replace function public.farm_scenery_allowed_types(p_theme_id text)
returns text[] language sql immutable set search_path = '' as $$
  select case
    when p_theme_id in ('ocean', 'bubbleField') then array['coral', 'pinkCoral', 'sandcastle']
    when p_theme_id in ('iceKingdom', 'christmas') then array['snowman', 'snowRabbit']
    when p_theme_id in ('galaxyNight', 'moonGarden') then array['star', 'planet']
    when p_theme_id in ('volcano', 'auroraNight') then array['crystal', 'roseCrystal']
    when p_theme_id = 'desertOasis' then array['cactus', 'floweringCactus']
    else array['tree', 'blossomTree', 'goldenTree']
  end;
$$;
revoke all on function public.farm_scenery_allowed_types(text) from public, anon, authenticated;

create or replace function public.farm_scenery_state_json(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
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
        select 1 from public.farm_scenery_unlocked_types u where u.user_id = p_user_id and u.type_id = c.type_id
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

create or replace function public.farm_scenery_result_json(p_user_id uuid, p_event jsonb)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'scenery', public.farm_scenery_state_json(p_user_id),
    'wallet', (select jsonb_build_object('coinBalance', w.coin_balance,
      'farmMoneyBalance', w.farm_money_balance) from public.farm_wallets w where w.user_id = p_user_id),
    'weeklyFarmMoneyEarned', coalesce((select e.earned_farm_money from public.farm_weekly_earnings e
      where e.user_id = p_user_id and e.week_start = public.current_farm_week_start()), 0),
    'event', p_event
  );
$$;
revoke all on function public.farm_scenery_result_json(uuid, jsonb) from public, anon, authenticated;

create or replace function public.get_my_scenery_state()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_user_id uuid := auth.uid();
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  perform public.ensure_farm_user(current_user_id);
  return public.farm_scenery_state_json(current_user_id);
end;
$$;

create or replace function public.start_my_scenery_creation(p_type_id text, p_theme_id text, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid(); cached_result jsonb;
  selected_type public.farm_scenery_catalog%rowtype; creation_id uuid;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  perform public.ensure_farm_user(current_user_id);
  perform public.lock_my_farm_actions(current_user_id);
  cached_result := public.begin_my_farm_action(current_user_id, p_request_id, 'start_my_scenery_creation');
  if cached_result is not null then
    return public.farm_scenery_result_json(current_user_id, cached_result -> 'event');
  end if;
  select * into selected_type from public.farm_scenery_catalog where type_id = p_type_id;
  if not found then raise exception 'SCENERY_UNKNOWN_TYPE'; end if;
  if p_theme_id is not null and not exists (
    select 1 from public.farm_cosmetics owned
    join public.farm_cosmetic_catalog catalog on catalog.cosmetic_type = owned.cosmetic_type
      and catalog.cosmetic_id = owned.cosmetic_id
    where owned.user_id = current_user_id and owned.cosmetic_type = 'farm_theme' and owned.cosmetic_id = p_theme_id
  ) then raise exception 'SCENERY_THEME_NOT_OWNED'; end if;
  if not (p_type_id = any(public.farm_scenery_allowed_types(p_theme_id))) then
    raise exception 'SCENERY_THEME_MISMATCH';
  end if;
  if selected_type.unlock_price > 0 and not exists (
    select 1 from public.farm_scenery_unlocked_types where user_id = current_user_id and type_id = p_type_id
  ) then raise exception 'SCENERY_TYPE_LOCKED'; end if;
  if exists (select 1 from public.farm_scenery_creations where user_id = current_user_id and claimed_at is null) then
    raise exception 'SCENERY_ALREADY_ACTIVE';
  end if;
  insert into public.farm_scenery_creations (user_id, type_id, theme_id, growth_cost, reward)
  values (current_user_id, p_type_id, p_theme_id, selected_type.growth_cost, selected_type.reward)
  returning id into creation_id;
  return public.farm_action_finish(current_user_id, p_request_id,
    public.farm_scenery_result_json(current_user_id, jsonb_build_object('creationId', creation_id, 'typeId', p_type_id)));
end;
$$;

create or replace function public.grow_my_scenery_creation(p_creation_id uuid, p_amount integer, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid(); cached_result jsonb;
  creation public.farm_scenery_creations%rowtype; spent_coin integer; coin_balance bigint;
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
  spent_coin := least(p_amount, creation.growth_cost - creation.progress);
  -- Coin balances may be negative historically; never permit new growth debt.
  select w.coin_balance into coin_balance from public.farm_wallets w
    where w.user_id = current_user_id for update;
  if coin_balance < spent_coin then raise exception 'FARM_INSUFFICIENT_COIN'; end if;
  perform public.apply_farm_wallet_change(current_user_id, 'coin', -spent_coin,
    '내 풍경 성장', 'scenery-grow:' || p_request_id);
  update public.farm_scenery_creations set progress = progress + spent_coin
    where id = creation.id returning * into creation;
  return public.farm_action_finish(current_user_id, p_request_id,
    public.farm_scenery_result_json(current_user_id, jsonb_build_object(
      'creationId', creation.id, 'spentCoin', spent_coin, 'progress', creation.progress,
      'completed', creation.progress = creation.growth_cost)));
end;
$$;

create or replace function public.claim_my_scenery_creation(p_creation_id uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid(); cached_result jsonb;
  creation public.farm_scenery_creations%rowtype;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  perform public.ensure_farm_user(current_user_id);
  perform public.lock_my_farm_actions(current_user_id);
  cached_result := public.begin_my_farm_action(current_user_id, p_request_id, 'claim_my_scenery_creation');
  if cached_result is not null then
    return public.farm_scenery_result_json(current_user_id, cached_result -> 'event');
  end if;
  select * into creation from public.farm_scenery_creations
    where id = p_creation_id and user_id = current_user_id for update;
  if not found then raise exception 'SCENERY_CREATION_NOT_FOUND'; end if;
  if creation.claimed_at is not null then raise exception 'SCENERY_ALREADY_CLAIMED'; end if;
  if creation.progress < creation.growth_cost then raise exception 'SCENERY_NOT_COMPLETE'; end if;
  -- This immutable history row prevents rewards being claimed again with a
  -- fresh request UUID, including after the shared action log is cleaned up.
  update public.farm_scenery_creations set claimed_at = now() where id = creation.id;
  perform public.apply_farm_wallet_change(current_user_id, 'farm_money', creation.reward,
    '내 풍경 완성 보상', 'scenery-claim:' || creation.id);
  return public.farm_action_finish(current_user_id, p_request_id,
    public.farm_scenery_result_json(current_user_id, jsonb_build_object(
      'creationId', creation.id, 'typeId', creation.type_id, 'reward', creation.reward)));
end;
$$;

create or replace function public.unlock_my_scenery_type(p_type_id text, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid(); cached_result jsonb;
  selected_type public.farm_scenery_catalog%rowtype; money_balance bigint; already_unlocked boolean;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  perform public.ensure_farm_user(current_user_id);
  perform public.lock_my_farm_actions(current_user_id);
  cached_result := public.begin_my_farm_action(current_user_id, p_request_id, 'unlock_my_scenery_type');
  if cached_result is not null then
    return public.farm_scenery_result_json(current_user_id, cached_result -> 'event');
  end if;
  select * into selected_type from public.farm_scenery_catalog where type_id = p_type_id;
  if not found then raise exception 'SCENERY_UNKNOWN_TYPE'; end if;
  already_unlocked := selected_type.unlock_price = 0 or exists (
    select 1 from public.farm_scenery_unlocked_types where user_id = current_user_id and type_id = p_type_id
  );
  if not already_unlocked then
    select w.farm_money_balance into money_balance from public.farm_wallets w
      where w.user_id = current_user_id for update;
    if money_balance < selected_type.unlock_price then raise exception 'FARM_INSUFFICIENT_FARM_MONEY'; end if;
    perform public.apply_farm_wallet_change(current_user_id, 'farm_money', -selected_type.unlock_price,
      '내 풍경 종류 해금', 'scenery-unlock:' || p_type_id);
    insert into public.farm_scenery_unlocked_types (user_id, type_id) values (current_user_id, p_type_id);
  end if;
  return public.farm_action_finish(current_user_id, p_request_id,
    public.farm_scenery_result_json(current_user_id, jsonb_build_object(
      'typeId', p_type_id, 'alreadyUnlocked', already_unlocked,
      'unlockPrice', case when already_unlocked then 0 else selected_type.unlock_price end)));
end;
$$;

revoke all on function public.get_my_scenery_state(),
  public.start_my_scenery_creation(text, text, uuid),
  public.grow_my_scenery_creation(uuid, integer, uuid),
  public.claim_my_scenery_creation(uuid, uuid),
  public.unlock_my_scenery_type(text, uuid) from public, anon;
grant execute on function public.get_my_scenery_state(),
  public.start_my_scenery_creation(text, text, uuid),
  public.grow_my_scenery_creation(uuid, integer, uuid),
  public.claim_my_scenery_creation(uuid, uuid),
  public.unlock_my_scenery_type(text, uuid) to authenticated;

-- Browser recovery intents can survive for weeks. Keep their result records
-- for the account's lifetime so an old grow/start retry cannot charge or start
-- again after the legacy action log's 24-hour cleanup window.
create or replace function public.cleanup_stale_farm_actions()
returns void language sql security definer set search_path = '' as $$
  delete from public.farm_action_log
  where created_at < now() - interval '24 hours'
    and action not in ('start_my_scenery_creation', 'grow_my_scenery_creation',
      'claim_my_scenery_creation', 'unlock_my_scenery_type');
$$;
revoke all on function public.cleanup_stale_farm_actions() from public, anon, authenticated;

-- Every scenery theme now has the same efficiency. Old theme/field purchases
-- remain owned, but cannot grant an invisible focus reward multiplier.
create or replace function public.farm_set_bonus_percent(p_user_id uuid, p_effect text)
returns integer language sql stable security definer set search_path = '' as $$
  select 0;
$$;
revoke all on function public.farm_set_bonus_percent(uuid, text) from public, anon, authenticated;

-- Stop already scheduled watering reminders; preserve timer notifications and
-- the history of reminders that have already been delivered.
do $retire_watering_reminders$
begin
  if to_regclass('public.scheduled_push_notifications') is not null then
    delete from public.scheduled_push_notifications where kind = 'plot_water_ready' and sent_at is null;
  end if;
end;
$retire_watering_reminders$;

-- Disable production paths from older clients while preserving their data.
-- Enumerating overloads also covers installations with older RPC signatures.
do $retire_production$
declare retired_function regprocedure;
begin
  for retired_function in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any(array[
      'buy_farm_seed', 'buy_and_plant_farm_seed', 'plant_farm_seed',
      'water_farm_plot', 'grow_farm_plot_with_coin', 'harvest_farm_plot', 'discard_farm_plot',
      'cook_farm_recipe', 'cook_my_farm_recipe', 'sell_farm_food', 'sell_all_my_farm_food', 'sell_farm_crop_bundle',
      'buy_farm_supply', 'apply_farm_plot_item', 'use_farm_market_refresh', 'use_farm_festival_pass', 'use_farm_free_pass'
    ])
  loop
    execute format('revoke all on function %s from public, anon, authenticated', retired_function);
  end loop;
end;
$retire_production$;

do $scenery_realtime$
declare table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array['farm_scenery_creations', 'farm_scenery_unlocked_types'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
        and schemaname = 'public' and tablename = table_name) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end;
$scenery_realtime$;

commit;
