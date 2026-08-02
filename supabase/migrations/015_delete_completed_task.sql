-- Atomically deduct the completion reward and delete one completed task.

create or replace function public.delete_my_completed_task(p_task_id uuid)
returns table (deducted_coin integer, coin_balance bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  reward integer;
  next_balance bigint;
  completed_on date;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select greatest(0, coalesce(tasks.completion_reward, 0)), tasks.completed_on
  into reward, completed_on
  from public.tasks as tasks
  where tasks.id = p_task_id
    and tasks.user_id = current_user_id
    and tasks.status = 'done'
  for update;

  if not found then
    raise exception 'Completed task not found';
  end if;

  if reward > 0 then
    next_balance := public.apply_farm_wallet_change(
      current_user_id,
      'coin',
      -reward,
      '완료한 할 일 삭제',
      'task:' || p_task_id::text || ':' || coalesce(completed_on::text, 'done') || ':delete'
    );
  else
    select wallets.coin_balance
    into next_balance
    from public.farm_wallets as wallets
    where wallets.user_id = current_user_id;
  end if;

  delete from public.tasks
  where id = p_task_id
    and user_id = current_user_id;

  return query select reward, next_balance;
end;
$$;

revoke all on function public.delete_my_completed_task(uuid) from public, anon;
grant execute on function public.delete_my_completed_task(uuid) to authenticated;

comment on function public.delete_my_completed_task(uuid) is
  'Deletes a completed task and deducts its recorded Coin reward in one transaction';
