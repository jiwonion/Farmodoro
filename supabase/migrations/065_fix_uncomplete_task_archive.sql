begin;

-- tasks_archive_only_when_done (005) requires archived_at is null whenever
-- status <> 'done'. uncomplete_my_task moved status away from 'done' without
-- clearing archived_at, so undoing completion on a task that had already
-- been archived (either the "보관함에 넣기" button, or same-day
-- maintainTaskArchive on the client) violated that constraint and made the
-- RPC itself fail server-side.
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
        completed_with_free_pass = false,
        archived_at = null
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

commit;
