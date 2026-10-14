begin;

-- A habit may offer a smaller fallback goal. Existing habits and completion
-- rewards stay as they were; new two-goal completions earn 1 / 2 Coin.
alter table public.habits
  add column if not exists minimum_title text;
alter table public.habits
  drop constraint if exists habits_minimum_title_length;
alter table public.habits
  add constraint habits_minimum_title_length
  check (minimum_title is null or char_length(btrim(minimum_title)) between 1 and 1024);

alter table public.habit_daily_records
  add column if not exists completion_level text;
alter table public.habit_daily_records
  drop constraint if exists habit_daily_records_completion_level_value;
alter table public.habit_daily_records
  add constraint habit_daily_records_completion_level_value
  check (completion_level is null or completion_level in ('min', 'max'));
update public.habit_daily_records
set completion_level = 'max'
where completed_at is not null and completion_level is null;

-- Keep fallback goal text under the same server-managed encryption as titles.
create or replace function private.farmodoro_encrypt_content_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
begin
  if tg_table_name = 'task_groups' then
    new.name := private.farmodoro_encrypt_text(new.name);
  elsif tg_table_name = 'tasks' then
    new.title := private.farmodoro_encrypt_text(new.title);
  elsif tg_table_name = 'habits' then
    new.title := private.farmodoro_encrypt_text(new.title);
    new.minimum_title := nullif(btrim(new.minimum_title), '');
    if new.minimum_title is not null
      and new.minimum_title not like 'sv1:%'
      and new.minimum_title not like 'fmd1.%'
      and char_length(new.minimum_title) > 100 then
      raise exception 'Minimum habit title is too long';
    end if;
    new.minimum_title := private.farmodoro_encrypt_text(new.minimum_title);
  end if;
  return new;
end;
$$;
revoke all on function private.farmodoro_encrypt_content_trigger() from public, anon, authenticated;

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

-- One signature with trailing defaults supports old callers without creating
-- an ambiguous PostgREST overload when they omit the new level argument.
drop function if exists public.complete_my_habit(uuid, date, integer, boolean);
create or replace function public.complete_my_habit(
  p_habit_id uuid,
  p_record_date date,
  p_progress_value integer,
  p_used_free_pass boolean default false,
  p_completion_level text default 'max'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  habit_row public.habits%rowtype;
  record_row public.habit_daily_records%rowtype;
  reward integer;
  reward_change integer;
  reference_key text;
  coin_balance bigint;
  already_done boolean := false;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if p_record_date is null then raise exception 'Habit record date is required'; end if;
  if p_completion_level is null or p_completion_level not in ('min', 'max') then
    raise exception 'Unsupported habit completion level';
  end if;

  -- Lock the definition before its daily record, including the initially absent
  -- record. Completion, undo and concurrent goal edits observe the same order.
  select * into habit_row from public.habits
    where id = p_habit_id and user_id = current_user_id for update;
  if not found then raise exception 'Habit not found'; end if;
  if p_completion_level = 'min' and habit_row.minimum_title is null then
    raise exception 'This habit has no minimum goal';
  end if;

  insert into public.habit_daily_records (habit_id, record_date, progress_value)
    values (p_habit_id, p_record_date, greatest(0, coalesce(p_progress_value, 0)))
    on conflict (habit_id, record_date) do nothing;
  select * into record_row from public.habit_daily_records
    where habit_id = p_habit_id and record_date = p_record_date for update;
  perform public.ensure_farm_user(current_user_id);

  if record_row.completed_at is not null
    and coalesce(record_row.completion_level, 'max') = p_completion_level then
    already_done := true;
  else
    reward := case when habit_row.minimum_title is not null and p_completion_level = 'max' then 2 else 1 end;
    reward_change := reward - case when record_row.completed_at is not null
      then greatest(0, coalesce(record_row.completion_reward, 1)) else 0 end;

    if record_row.completed_at is null then
      record_row.completion_cycle_id := gen_random_uuid();
      record_row.completed_with_free_pass := false;
      reference_key := 'habit:' || p_habit_id || ':' || p_record_date || ':complete:' || record_row.completion_cycle_id;
    else
      -- Keep the cycle used by historical pass refund entitlements. Each real
      -- tier transition gets a distinct wallet reference; repeated requests
      -- for the current tier are rejected above while holding the row lock.
      reference_key := 'habit:' || p_habit_id || ':' || p_record_date || ':level:' || gen_random_uuid();
    end if;

    update public.habit_daily_records
    set progress_value = greatest(0, coalesce(p_progress_value, progress_value)),
        completed_at = coalesce(completed_at, now()),
        completion_reward = reward,
        completion_level = p_completion_level,
        completed_with_free_pass = record_row.completed_with_free_pass,
        completion_cycle_id = record_row.completion_cycle_id
    where habit_id = p_habit_id and record_date = p_record_date
    returning * into record_row;

    if reward_change <> 0 then
      coin_balance := public.apply_farm_wallet_change(current_user_id, 'coin', reward_change,
        'Habit completion', reference_key);
    end if;
  end if;

  if coin_balance is null then
    select w.coin_balance into coin_balance from public.farm_wallets w where user_id = current_user_id;
  end if;
  return jsonb_build_object('alreadyDone', already_done, 'progressValue', record_row.progress_value,
    'completedAt', record_row.completed_at, 'completionReward', record_row.completion_reward,
    'completionCycleId', record_row.completion_cycle_id, 'completionLevel', record_row.completion_level,
    'coinBalance', coin_balance);
end;
$$;
revoke all on function public.complete_my_habit(uuid, date, integer, boolean, text) from public, anon;
grant execute on function public.complete_my_habit(uuid, date, integer, boolean, text) to authenticated;

create or replace function public.uncomplete_my_habit(p_habit_id uuid, p_record_date date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  record_row public.habit_daily_records%rowtype;
  reversal integer;
  coin_balance bigint;
  money_balance bigint;
  pass_refund bigint := 0;
  already_undone boolean := false;
  had_free_pass boolean := false;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  perform 1 from public.habits where id = p_habit_id and user_id = current_user_id for update;
  if not found then raise exception 'Habit not found'; end if;
  select * into record_row from public.habit_daily_records
    where habit_id = p_habit_id and record_date = p_record_date for update;
  perform public.ensure_farm_user(current_user_id);
  pass_refund := public.refund_retired_farm_pass(current_user_id,
    'habit:' || p_habit_id || ':' || p_record_date || ':' || coalesce(record_row.completion_cycle_id::text, 'legacy'));
  if record_row.completed_at is null then
    already_undone := true;
  else
    had_free_pass := coalesce(record_row.completed_with_free_pass, false);
    reversal := greatest(0, coalesce(record_row.completion_reward, 1));
    if reversal > 0 then
      coin_balance := public.apply_farm_wallet_change(current_user_id, 'coin', -reversal,
        'Habit completion cancellation',
        'habit:' || p_habit_id || ':' || p_record_date || ':undo:' || coalesce(record_row.completion_cycle_id::text, 'legacy'));
    end if;
    update public.habit_daily_records
    set completed_at = null, completion_reward = 0, completed_with_free_pass = false, completion_level = null
    where habit_id = p_habit_id and record_date = p_record_date
    returning * into record_row;
  end if;
  select w.coin_balance, w.farm_money_balance into coin_balance, money_balance
    from public.farm_wallets w where user_id = current_user_id;
  return jsonb_build_object('alreadyUndone', already_undone, 'progressValue', coalesce(record_row.progress_value, 0),
    'completionLevel', record_row.completion_level, 'hadFreePass', had_free_pass,
    'coinBalance', coin_balance, 'farmMoneyBalance', money_balance, 'legacyPassRefundAmount', pass_refund);
end;
$$;
revoke all on function public.uncomplete_my_habit(uuid, date) from public, anon;
grant execute on function public.uncomplete_my_habit(uuid, date) to authenticated;

comment on column public.habits.minimum_title is 'Optional encrypted fallback habit goal; its completion earns 1 Coin, full goal earns 2';
comment on column public.habit_daily_records.completion_level is 'Completed goal: min or max; null while incomplete';

notify pgrst, 'reload schema';
commit;
