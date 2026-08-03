begin;

-- One-time bridge for focus time recorded before the unified daily event ledger.
-- Prefer the old Coin remainder when present; otherwise recover today's task and
-- habit focus totals. Keep only the remainder because earlier 60-minute rewards
-- may already have been paid by the legacy client.
with current_day as (
  select (now() at time zone 'Asia/Seoul')::date as focus_date
), legacy_by_user as (
  select
    users.id as user_id,
    current_day.focus_date,
    greatest(
      coalesce(timer.reward_seconds, 0),
      mod(coalesce(tasks.focus_seconds, 0) + coalesce(habits.focus_seconds, 0), 3600)
    )::integer as recovered_seconds
  from auth.users as users
  cross join current_day
  left join lateral (
    select case
      when coalesce(focus_timer.state ->> 'rewardSeconds', '') ~ '^[0-9]+([.][0-9]+)?$'
        then least(3599, floor((focus_timer.state ->> 'rewardSeconds')::numeric))::integer
      else 0
    end as reward_seconds
    from public.user_focus_timer as focus_timer
    where focus_timer.user_id = users.id
      and (focus_timer.updated_at at time zone 'Asia/Seoul')::date = current_day.focus_date
  ) as timer on true
  left join lateral (
    select mod(coalesce(sum(task.focus_seconds), 0), 3600)::integer as focus_seconds
    from public.tasks as task
    where task.user_id = users.id
      and (task.updated_at at time zone 'Asia/Seoul')::date = current_day.focus_date
  ) as tasks on true
  left join lateral (
    select mod(coalesce(sum(record.focus_seconds), 0), 3600)::integer as focus_seconds
    from public.habit_daily_records as record
    join public.habits as habit on habit.id = record.habit_id
    where habit.user_id = users.id
      and record.record_date = current_day.focus_date
  ) as habits on true
)
insert into public.user_focus_daily (user_id, focus_date, quick_seconds)
select legacy.user_id, legacy.focus_date, legacy.recovered_seconds
from legacy_by_user as legacy
where legacy.recovered_seconds > 0
on conflict (user_id, focus_date) do update
set quick_seconds = greatest(
      public.user_focus_daily.quick_seconds,
      greatest(0, excluded.quick_seconds - public.user_focus_daily.task_seconds)
    ),
    updated_at = now();

commit;
