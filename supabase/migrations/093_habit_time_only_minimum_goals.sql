begin;

-- A shorter focus duration is itself a minimum goal. A separate encrypted
-- name remains optional; the client uses the main habit name when it is absent.
alter table public.habits
  drop constraint if exists habits_minimum_focus_minutes_valid;
alter table public.habits
  add constraint habits_minimum_focus_minutes_valid
  check (
    minimum_focus_minutes is null
    or (
      minimum_focus_minutes between 1 and 9999
      and measure_type = 'time'
      and minimum_focus_minutes < target_value
    )
  );

-- Keep the 092 selected-weekday validation trigger. Only the optional-name
-- requirement changes; default and scheduled maximums must still be larger.
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
  has_minimum boolean;
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

  -- Preserve the definition/record lock order used by undo and goal edits.
  select * into habit_row from public.habits
    where id = p_habit_id and user_id = current_user_id for update;
  if not found then raise exception 'Habit not found'; end if;
  has_minimum := nullif(btrim(habit_row.minimum_title), '') is not null
    or habit_row.minimum_focus_minutes is not null;
  if p_completion_level = 'min' and not has_minimum then
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
    reward := case when has_minimum and p_completion_level = 'max' then 2 else 1 end;
    reward_change := reward - case when record_row.completed_at is not null
      then greatest(0, coalesce(record_row.completion_reward, 1)) else 0 end;

    if record_row.completed_at is null then
      record_row.completion_cycle_id := gen_random_uuid();
      record_row.completed_with_free_pass := false;
      reference_key := 'habit:' || p_habit_id || ':' || p_record_date || ':complete:' || record_row.completion_cycle_id;
    else
      -- Keep historical pass-refund cycles and unique references per actual
      -- transition. Same-tier retries return above without awarding again.
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

comment on column public.habits.minimum_title is
  'Optional encrypted fallback goal name; a minimum focus duration can define the minimum goal without a separate name';
comment on column public.habits.minimum_focus_minutes is
  'Optional minimum-goal focus duration, independent of its name, strictly below default and selected weekday maximum durations';

notify pgrst, 'reload schema';
commit;
