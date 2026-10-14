begin;

-- Existing minimum goals keep their manual completion behavior until a user
-- chooses a separate focus duration for them.
alter table public.habits
  add column if not exists minimum_focus_minutes integer;
alter table public.habits
  drop constraint if exists habits_minimum_focus_minutes_valid;
alter table public.habits
  add constraint habits_minimum_focus_minutes_valid
  check (
    minimum_focus_minutes is null
    or (
      minimum_focus_minutes between 1 and 9999
      and minimum_title is not null
      and measure_type = 'time'
      and minimum_focus_minutes < target_value
    )
  );

-- A minimum duration must also be below every selected weekday's override.
-- Recheck on any definition change so changing a maximum or weekday cannot
-- silently turn a saved minimum duration into the larger goal.
create or replace function private.farmodoro_validate_habit_minimum_focus_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  weekday smallint;
  weekday_target jsonb;
begin
  if new.minimum_focus_minutes is null then return new; end if;
  foreach weekday in array new.weekdays loop
    weekday_target := new.target_by_weekday -> weekday::text;
    if weekday_target is not null and jsonb_typeof(weekday_target) <> 'null' then
      if jsonb_typeof(weekday_target) <> 'number' then
        raise exception 'Habit weekday focus duration must be a number';
      end if;
      if new.minimum_focus_minutes >= (weekday_target #>> '{}')::numeric then
        raise exception 'Minimum focus duration must be below every selected weekday maximum';
      end if;
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function private.farmodoro_validate_habit_minimum_focus_trigger() from public, anon, authenticated;

drop trigger if exists habits_validate_minimum_focus on public.habits;
create trigger habits_validate_minimum_focus
  before insert or update on public.habits
  for each row execute function private.farmodoro_validate_habit_minimum_focus_trigger();

create or replace function public.get_my_productivity_state()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  result jsonb;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select jsonb_build_object(
    'groups', coalesce((
      select jsonb_agg(to_jsonb(group_row) order by group_row.sort_order, group_row.created_at)
      from (
        select g.id, private.farmodoro_decrypt_text(g.name) as name,
          g.color_index, g.sort_order, g.created_at
        from public.task_groups g where g.user_id = current_user_id
      ) group_row
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(to_jsonb(task_row) order by task_row.sort_order, task_row.created_at)
      from (
        select t.id, t.group_id, private.farmodoro_decrypt_text(t.title) as title,
          t.status, t.sort_order, t.focus_seconds, t.completion_reward,
          t.completed_with_free_pass, t.completed_on, t.completion_cycle_id,
          t.archived_at, t.created_at
        from public.tasks t where t.user_id = current_user_id
      ) task_row
    ), '[]'::jsonb),
    'habits', coalesce((
      select jsonb_agg(to_jsonb(habit_row) order by habit_row.sort_order, habit_row.created_at)
      from (
        select h.id, private.farmodoro_decrypt_text(h.title) as title,
          private.farmodoro_decrypt_text(h.minimum_title) as minimum_title,
          h.minimum_focus_minutes,
          h.measure_type, h.target_value, h.target_by_weekday, h.unit,
          h.weekdays, h.start_date, h.end_date, h.sort_order, h.created_at
        from public.habits h where h.user_id = current_user_id
      ) habit_row
    ), '[]'::jsonb),
    'habitRecords', coalesce((
      select jsonb_agg(to_jsonb(record_row) order by record_row.record_date)
      from (
        select r.habit_id, r.record_date, r.progress_value, r.focus_seconds,
          r.completed_at, r.completion_reward, r.completed_with_free_pass,
          r.completion_cycle_id, r.completion_level
        from public.habit_daily_records r
        join public.habits h on h.id = r.habit_id
        where h.user_id = current_user_id
      ) record_row
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.get_my_productivity_state() from public, anon;
grant execute on function public.get_my_productivity_state() to authenticated;

-- user_focus_timer.state is intentionally an opaque JSON object. The existing
-- table accepts runtime.completionLevel and activeFocus.completionLevel without
-- a new RPC or normalizer, preserving the chosen goal across devices.
comment on column public.habits.minimum_focus_minutes is
  'Optional minimum-goal focus duration in minutes, strictly below the default and selected weekday maximum durations';

notify pgrst, 'reload schema';
commit;
