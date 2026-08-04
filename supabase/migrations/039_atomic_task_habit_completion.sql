begin;

-- Task/habit completion used to be decided entirely client-side: each
-- device checked its own (possibly stale) copy of the task/habit, and if it
-- looked "not done yet" it granted a reward with a reference key it made up
-- on the spot. Two devices completing the same task/habit before either one
-- has seen the other's change independently pass that check and each mint a
-- reward with a different reference key, so the wallet's idempotency table
-- (032) never sees a collision and both payments go through.
--
-- These functions move the "is this already done" decision into a single
-- row lock inside Postgres, so the second caller -- regardless of which
-- device or how close in time -- always sees the first caller's write and
-- skips granting a second reward.

create or replace function public.complete_my_task(
  p_task_id uuid,
  p_used_free_pass boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  task_row public.tasks%rowtype;
  reward integer;
  coin_balance bigint;
  already_done boolean := false;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into task_row
  from public.tasks
  where id = p_task_id and user_id = current_user_id
  for update;

  if not found then
    raise exception 'Task not found';
  end if;

  if task_row.status = 'done' then
    already_done := true;
  else
    perform public.ensure_farm_user(current_user_id);

    select case when farms.production_boost_until > now() then 2 else 1 end
    into reward
    from public.farms as farms
    where farms.user_id = current_user_id;
    reward := coalesce(reward, 1);

    update public.tasks
    set status = 'done',
        completed_on = (now() at time zone 'Asia/Seoul')::date,
        completion_reward = reward,
        completed_with_free_pass = p_used_free_pass,
        completion_cycle_id = gen_random_uuid()
    where id = p_task_id
    returning * into task_row;

    coin_balance := public.apply_farm_wallet_change(
      current_user_id,
      'coin',
      reward,
      case when p_used_free_pass then '농부의 프리패스 보상' else '할 일 완료' end,
      'task:' || p_task_id || ':' || task_row.completed_on || ':complete:' || task_row.completion_cycle_id
    );
  end if;

  if coin_balance is null then
    select wallets.coin_balance into coin_balance
    from public.farm_wallets as wallets
    where wallets.user_id = current_user_id;
  end if;

  return jsonb_build_object(
    'alreadyDone', already_done,
    'status', task_row.status,
    'completedOn', task_row.completed_on,
    'completionReward', task_row.completion_reward,
    'completionCycleId', task_row.completion_cycle_id,
    'coinBalance', coin_balance
  );
end;
$$;

revoke all on function public.complete_my_task(uuid, boolean) from public, anon;
grant execute on function public.complete_my_task(uuid, boolean) to authenticated;

create or replace function public.uncomplete_my_task(
  p_task_id uuid,
  p_next_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  task_row public.tasks%rowtype;
  refund integer;
  coin_balance bigint;
  already_undone boolean := false;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_next_status not in ('waiting', 'doing') then
    raise exception 'Unsupported status';
  end if;

  select * into task_row
  from public.tasks
  where id = p_task_id and user_id = current_user_id
  for update;

  if not found then
    raise exception 'Task not found';
  end if;

  if task_row.status <> 'done' then
    already_undone := true;
  else
    refund := greatest(0, coalesce(task_row.completion_reward, 1));
    coin_balance := public.apply_farm_wallet_change(
      current_user_id,
      'coin',
      -refund,
      '할 일 완료 취소',
      'task:' || p_task_id || ':' || coalesce(task_row.completed_on::text, 'legacy') ||
        ':undo:' || coalesce(task_row.completion_cycle_id::text, 'legacy')
    );

    update public.tasks
    set status = p_next_status,
        completed_on = null,
        completion_reward = 0,
        completed_with_free_pass = false
    where id = p_task_id
    returning * into task_row;
  end if;

  if coin_balance is null then
    select wallets.coin_balance into coin_balance
    from public.farm_wallets as wallets
    where wallets.user_id = current_user_id;
  end if;

  return jsonb_build_object(
    'alreadyUndone', already_undone,
    'status', task_row.status,
    'coinBalance', coin_balance
  );
end;
$$;

revoke all on function public.uncomplete_my_task(uuid, text) from public, anon;
grant execute on function public.uncomplete_my_task(uuid, text) to authenticated;

create or replace function public.complete_my_habit(
  p_habit_id uuid,
  p_record_date date,
  p_progress_value integer,
  p_used_free_pass boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  record_row public.habit_daily_records%rowtype;
  reward integer;
  coin_balance bigint;
  already_done boolean := false;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.habits where id = p_habit_id and user_id = current_user_id
  ) then
    raise exception 'Habit not found';
  end if;

  insert into public.habit_daily_records (habit_id, record_date, progress_value)
  values (p_habit_id, p_record_date, greatest(0, coalesce(p_progress_value, 0)))
  on conflict (habit_id, record_date) do nothing;

  select * into record_row
  from public.habit_daily_records
  where habit_id = p_habit_id and record_date = p_record_date
  for update;

  if record_row.completed_at is not null then
    already_done := true;
  else
    perform public.ensure_farm_user(current_user_id);

    select case when farms.production_boost_until > now() then 2 else 1 end
    into reward
    from public.farms as farms
    where farms.user_id = current_user_id;
    reward := coalesce(reward, 1);

    update public.habit_daily_records
    set progress_value = greatest(0, coalesce(p_progress_value, progress_value)),
        completed_at = now(),
        completion_reward = reward,
        completed_with_free_pass = p_used_free_pass,
        completion_cycle_id = gen_random_uuid()
    where habit_id = p_habit_id and record_date = p_record_date
    returning * into record_row;

    coin_balance := public.apply_farm_wallet_change(
      current_user_id,
      'coin',
      reward,
      case when p_used_free_pass then '농부의 프리패스 보상' else '습관 완료' end,
      'habit:' || p_habit_id || ':' || p_record_date || ':complete:' || record_row.completion_cycle_id
    );
  end if;

  if coin_balance is null then
    select wallets.coin_balance into coin_balance
    from public.farm_wallets as wallets
    where wallets.user_id = current_user_id;
  end if;

  return jsonb_build_object(
    'alreadyDone', already_done,
    'progressValue', record_row.progress_value,
    'completedAt', record_row.completed_at,
    'completionReward', record_row.completion_reward,
    'completionCycleId', record_row.completion_cycle_id,
    'coinBalance', coin_balance
  );
end;
$$;

revoke all on function public.complete_my_habit(uuid, date, integer, boolean) from public, anon;
grant execute on function public.complete_my_habit(uuid, date, integer, boolean) to authenticated;

create or replace function public.uncomplete_my_habit(
  p_habit_id uuid,
  p_record_date date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  record_row public.habit_daily_records%rowtype;
  refund integer;
  coin_balance bigint;
  already_undone boolean := false;
  had_free_pass boolean := false;
  row_found boolean;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.habits where id = p_habit_id and user_id = current_user_id
  ) then
    raise exception 'Habit not found';
  end if;

  select * into record_row
  from public.habit_daily_records
  where habit_id = p_habit_id and record_date = p_record_date
  for update;
  row_found := found;

  if not row_found or record_row.completed_at is null then
    already_undone := true;
  else
    had_free_pass := record_row.completed_with_free_pass;
    refund := greatest(0, coalesce(record_row.completion_reward, 1));
    coin_balance := public.apply_farm_wallet_change(
      current_user_id,
      'coin',
      -refund,
      '습관 완료 취소',
      'habit:' || p_habit_id || ':' || p_record_date || ':undo:' ||
        coalesce(record_row.completion_cycle_id::text, 'legacy')
    );

    update public.habit_daily_records
    set completed_at = null,
        completion_reward = 0,
        completed_with_free_pass = false
    where habit_id = p_habit_id and record_date = p_record_date
    returning * into record_row;
  end if;

  if coin_balance is null then
    select wallets.coin_balance into coin_balance
    from public.farm_wallets as wallets
    where wallets.user_id = current_user_id;
  end if;

  return jsonb_build_object(
    'alreadyUndone', already_undone,
    'progressValue', coalesce(record_row.progress_value, 0),
    'hadFreePass', had_free_pass,
    'coinBalance', coin_balance
  );
end;
$$;

revoke all on function public.uncomplete_my_habit(uuid, date) from public, anon;
grant execute on function public.uncomplete_my_habit(uuid, date) to authenticated;

commit;
