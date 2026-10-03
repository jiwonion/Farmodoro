begin;

-- Habits and tasks roll over at 04:00 Korea time instead of midnight, matching
-- the client: work done before 04:00 belongs to the previous day, and done
-- tasks move to the archive after 04:00. Farm and focus Coin days still use
-- midnight.
create or replace function public.productivity_today()
returns date
language sql
stable
set search_path = ''
as $$
  select ((now() at time zone 'Asia/Seoul') - interval '4 hours')::date;
$$;
revoke all on function public.productivity_today() from public, anon;
grant execute on function public.productivity_today() to authenticated;

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
        completed_on = public.productivity_today(),
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

create or replace function public.run_task_lifecycle()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.tasks
  set archived_at = now()
  where status = 'done'
    and archived_at is null
    and completed_on is not null
    and completed_on < public.productivity_today();

  delete from public.tasks
  where archived_at is not null
    and archived_at <= now() - interval '30 days';
end;
$$;
revoke all on function public.run_task_lifecycle() from public, anon, authenticated;

create or replace function public.reset_my_habits()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  reset_date date := public.productivity_today();
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  delete from public.habit_daily_records as records
  using public.habits as habits
  where records.habit_id = habits.id
    and habits.user_id = current_user_id;

  update public.habits
  set start_date = reset_date,
      end_date = case when end_date < reset_date then null else end_date end
  where user_id = current_user_id;
end;
$$;
revoke all on function public.reset_my_habits() from public, anon;
grant execute on function public.reset_my_habits() to authenticated;

alter table public.habits
  alter column start_date set default public.productivity_today();

commit;
