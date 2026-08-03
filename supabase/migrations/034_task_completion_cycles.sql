-- Persist a completion-cycle token so complete/undo wallet mutations are idempotent per cycle.
alter table public.tasks
  add column if not exists completion_cycle_id uuid;

create or replace function public.get_my_productivity_state()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
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
        from public.task_groups g
        where g.user_id = current_user_id
      ) group_row
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(to_jsonb(task_row) order by task_row.sort_order, task_row.created_at)
      from (
        select t.id, t.group_id, private.farmodoro_decrypt_text(t.title) as title,
          t.status, t.sort_order, t.focus_seconds, t.completion_reward,
          t.completed_with_free_pass, t.completed_on, t.completion_cycle_id,
          t.archived_at, t.created_at
        from public.tasks t
        where t.user_id = current_user_id
      ) task_row
    ), '[]'::jsonb),
    'habits', coalesce((
      select jsonb_agg(to_jsonb(habit_row) order by habit_row.sort_order, habit_row.created_at)
      from (
        select h.id, private.farmodoro_decrypt_text(h.title) as title,
          h.measure_type, h.target_value, h.unit, h.weekdays, h.start_date,
          h.end_date, h.sort_order, h.created_at
        from public.habits h
        where h.user_id = current_user_id
      ) habit_row
    ), '[]'::jsonb),
    'habitRecords', coalesce((
      select jsonb_agg(to_jsonb(record_row) order by record_row.record_date)
      from (
        select r.habit_id, r.record_date, r.progress_value, r.focus_seconds,
          r.completed_at, r.completion_reward, r.completed_with_free_pass
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
