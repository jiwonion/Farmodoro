begin;

create table if not exists public.user_focus_daily (
  user_id uuid not null references auth.users (id) on delete cascade,
  focus_date date not null,
  task_seconds integer not null default 0,
  quick_seconds integer not null default 0,
  rewarded_hour_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, focus_date),
  constraint user_focus_daily_task_seconds_nonnegative check (task_seconds >= 0),
  constraint user_focus_daily_quick_seconds_nonnegative check (quick_seconds >= 0),
  constraint user_focus_daily_reward_count_nonnegative check (rewarded_hour_count >= 0)
);

create table if not exists public.user_focus_daily_events (
  user_id uuid not null references auth.users (id) on delete cascade,
  event_id uuid not null,
  focus_date date not null,
  focus_mode text not null,
  elapsed_seconds integer not null,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id),
  constraint user_focus_daily_events_mode check (focus_mode in ('linked', 'quick')),
  constraint user_focus_daily_events_seconds check (elapsed_seconds between 1 and 600)
);

alter table public.user_focus_daily enable row level security;
alter table public.user_focus_daily_events enable row level security;

-- Preserve the current day's legacy Coin progress during the one-time migration.
-- Old rewardSeconds was always the remainder below one hour, so this cannot
-- duplicate an already-paid 60-minute reward.
insert into public.user_focus_daily (user_id, focus_date, quick_seconds)
select
  timer.user_id,
  (timer.updated_at at time zone 'Asia/Seoul')::date,
  least(
    3599,
    greatest(
      0,
      floor(
        case
          when coalesce(timer.state ->> 'rewardSeconds', '') ~ '^[0-9]+([.][0-9]+)?$'
            then (timer.state ->> 'rewardSeconds')::numeric
          else 0
        end
      )
    )
  )::integer
from public.user_focus_timer as timer
where (timer.updated_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date
  and coalesce(timer.state ->> 'rewardSeconds', '') ~ '^[0-9]+([.][0-9]+)?$'
on conflict (user_id, focus_date) do nothing;

create or replace function public.get_my_daily_focus_progress()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_focus_date date := (now() at time zone 'Asia/Seoul')::date;
  daily_row public.user_focus_daily%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  insert into public.user_focus_daily (user_id, focus_date)
  values (current_user_id, current_focus_date)
  on conflict (user_id, focus_date) do nothing;

  select daily.*
  into daily_row
  from public.user_focus_daily as daily
  where daily.user_id = current_user_id
    and daily.focus_date = current_focus_date;

  return jsonb_build_object(
    'focusDate', daily_row.focus_date,
    'taskSeconds', daily_row.task_seconds,
    'quickSeconds', daily_row.quick_seconds,
    'totalSeconds', daily_row.task_seconds + daily_row.quick_seconds,
    'rewardedHourCount', daily_row.rewarded_hour_count,
    'progressSeconds', (daily_row.task_seconds + daily_row.quick_seconds) % 3600
  );
end;
$$;

create or replace function public.record_my_daily_focus_time(
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
  current_focus_date date := (now() at time zone 'Asia/Seoul')::date;
  inserted_event uuid;
  daily_row public.user_focus_daily%rowtype;
  next_reward_count integer;
  newly_completed_hours integer;
  reward_per_hour integer := 1;
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

  insert into public.user_focus_daily_events (
    user_id,
    event_id,
    focus_date,
    focus_mode,
    elapsed_seconds
  )
  values (
    current_user_id,
    p_event_id,
    current_focus_date,
    p_focus_mode,
    p_elapsed_seconds
  )
  on conflict (user_id, event_id) do nothing
  returning event_id into inserted_event;

  insert into public.user_focus_daily (user_id, focus_date)
  values (current_user_id, current_focus_date)
  on conflict (user_id, focus_date) do nothing;

  select daily.*
  into daily_row
  from public.user_focus_daily as daily
  where daily.user_id = current_user_id
    and daily.focus_date = current_focus_date
  for update;

  if inserted_event is not null then
    update public.user_focus_daily as daily
    set task_seconds = daily.task_seconds +
          case when p_focus_mode = 'linked' then p_elapsed_seconds else 0 end,
        quick_seconds = daily.quick_seconds +
          case when p_focus_mode = 'quick' then p_elapsed_seconds else 0 end,
        updated_at = now()
    where daily.user_id = current_user_id
      and daily.focus_date = current_focus_date
    returning daily.* into daily_row;

    next_reward_count := floor(
      (daily_row.task_seconds + daily_row.quick_seconds)::numeric / 3600
    )::integer;
    newly_completed_hours := greatest(0, next_reward_count - daily_row.rewarded_hour_count);

    if newly_completed_hours > 0 then
      select case when farms.production_boost_until > now() then 2 else 1 end
      into reward_per_hour
      from public.farms as farms
      where farms.user_id = current_user_id;
      reward_per_hour := coalesce(reward_per_hour, 1);

      coin_balance := public.apply_farm_wallet_change(
        current_user_id,
        'coin',
        newly_completed_hours * reward_per_hour,
        'Daily focus reward',
        'daily-focus:' || current_focus_date::text || ':' || next_reward_count::text
      );

      update public.user_focus_daily as daily
      set rewarded_hour_count = next_reward_count,
          updated_at = now()
      where daily.user_id = current_user_id
        and daily.focus_date = current_focus_date
      returning daily.* into daily_row;
    end if;
  end if;

  if coin_balance is null then
    select wallets.coin_balance
    into coin_balance
    from public.farm_wallets as wallets
    where wallets.user_id = current_user_id;
  end if;

  return jsonb_build_object(
    'focusDate', daily_row.focus_date,
    'taskSeconds', daily_row.task_seconds,
    'quickSeconds', daily_row.quick_seconds,
    'totalSeconds', daily_row.task_seconds + daily_row.quick_seconds,
    'rewardedHourCount', daily_row.rewarded_hour_count,
    'progressSeconds', (daily_row.task_seconds + daily_row.quick_seconds) % 3600,
    'coinBalance', coin_balance,
    'awardedCoins', coalesce(newly_completed_hours, 0) * reward_per_hour
  );
end;
$$;

revoke all on table public.user_focus_daily from anon, authenticated;
revoke all on table public.user_focus_daily_events from anon, authenticated;
revoke all on function public.get_my_daily_focus_progress() from public, anon;
revoke all on function public.record_my_daily_focus_time(uuid, text, integer) from public, anon;
grant execute on function public.get_my_daily_focus_progress() to authenticated;
grant execute on function public.record_my_daily_focus_time(uuid, text, integer) to authenticated;

comment on table public.user_focus_daily is
  'Server-authoritative daily focus totals and rewarded 60-minute boundaries';
comment on table public.user_focus_daily_events is
  'Idempotent elapsed-time events from linked and quick focus timers';

commit;
