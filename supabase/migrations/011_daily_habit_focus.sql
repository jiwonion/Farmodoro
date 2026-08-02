begin;

alter table public.habit_daily_records
  add column if not exists focus_seconds integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'habit_daily_records_focus_seconds_nonnegative'
      and conrelid = 'public.habit_daily_records'::regclass
  ) then
    alter table public.habit_daily_records
      add constraint habit_daily_records_focus_seconds_nonnegative
      check (focus_seconds >= 0);
  end if;
end
$$;

-- Earlier builds stored time-habit focus progress as minutes in progress_value.
-- Preserve those records as explicit per-day seconds before separating the fields.
update public.habit_daily_records as records
set focus_seconds = greatest(0, round(records.progress_value * 60)::integer)
from public.habits as habits
where habits.id = records.habit_id
  and habits.measure_type = 'time'
  and records.focus_seconds = 0
  and records.progress_value > 0;

alter table public.habits
  drop constraint if exists habits_focus_seconds_nonnegative;

alter table public.habits
  drop column if exists focus_seconds;

comment on column public.habit_daily_records.focus_seconds is
  'Focus time accumulated for this habit on this record date, in seconds';

commit;
