begin;

create table if not exists public.user_focus_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  progress_seconds integer not null default 0,
  recent_event_ids uuid[] not null default '{}'::uuid[],
  updated_at timestamptz not null default now(),
  constraint user_focus_progress_seconds_range
    check (progress_seconds between 0 and 3599),
  constraint user_focus_progress_recent_events_limit
    check (cardinality(recent_event_ids) <= 128)
);

alter table public.user_focus_progress enable row level security;

drop policy if exists "Users can read their own focus progress"
  on public.user_focus_progress;
create policy "Users can read their own focus progress"
  on public.user_focus_progress for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.user_focus_progress from public, anon, authenticated;
grant select on table public.user_focus_progress to authenticated;

-- Carry over only the progress that was visible before this migration.
-- Older daily totals and per-flush events are intentionally discarded.
insert into public.user_focus_progress (user_id, progress_seconds)
select
  daily.user_id,
  ((daily.task_seconds + daily.quick_seconds) % 3600)::integer
from public.user_focus_daily as daily
where daily.focus_date = (now() at time zone 'Asia/Seoul')::date
on conflict (user_id) do nothing;

delete from public.user_focus_daily;
drop table if exists public.user_focus_daily_events;

create or replace function public.get_my_focus_progress()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  progress_row public.user_focus_progress%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  insert into public.user_focus_progress (user_id)
  values (current_user_id)
  on conflict (user_id) do nothing;

  select progress.*
  into progress_row
  from public.user_focus_progress as progress
  where progress.user_id = current_user_id;

  return jsonb_build_object(
    'progressSeconds', progress_row.progress_seconds
  );
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

      -- Focus rewards change only the current balance. They do not create
      -- session history, ledger rows, or unbounded idempotency rows.
      update public.farm_wallets as wallets
      set coin_balance = wallets.coin_balance + awarded_coins
      where wallets.user_id = current_user_id
      returning wallets.coin_balance into coin_balance;
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
    'awardedCoins', awarded_coins
  );
end;
$$;

-- Compatibility for an already-open tab while the new service worker activates.
create or replace function public.get_my_daily_focus_progress()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.get_my_focus_progress();
$$;

create or replace function public.record_my_daily_focus_time(
  p_event_id uuid,
  p_focus_mode text,
  p_elapsed_seconds integer
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.record_my_focus_time(p_event_id, p_focus_mode, p_elapsed_seconds);
$$;

revoke all on function public.get_my_focus_progress() from public, anon;
revoke all on function public.record_my_focus_time(uuid, text, integer) from public, anon;
revoke all on function public.get_my_daily_focus_progress() from public, anon;
revoke all on function public.record_my_daily_focus_time(uuid, text, integer) from public, anon;
grant execute on function public.get_my_focus_progress() to authenticated;
grant execute on function public.record_my_focus_time(uuid, text, integer) to authenticated;
grant execute on function public.get_my_daily_focus_progress() to authenticated;
grant execute on function public.record_my_daily_focus_time(uuid, text, integer) to authenticated;

alter table public.user_focus_progress replica identity full;

do $realtime$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_focus_progress'
  ) then
    alter publication supabase_realtime add table public.user_focus_progress;
  end if;
end
$realtime$;

comment on table public.user_focus_progress is
  'One bounded lifetime Coin progress row per user';
comment on column public.user_focus_progress.recent_event_ids is
  'Bounded retry-deduplication window; not a focus session history';
comment on table public.user_focus_daily is
  'Deprecated compatibility table; kept empty after lifetime focus migration';

commit;
