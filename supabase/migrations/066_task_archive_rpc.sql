begin;

-- archived_at is no longer part of the bulk task snapshot upload
-- (syncTaskDatabaseSnapshot in app.js) -- tasks_archive_only_when_done
-- requires it stay null whenever status <> 'done', and that bulk upsert
-- never reliably knows the row's true current status for every task in the
-- batch at once. This RPC is the one place archived_at gets written from
-- now on, checking status itself instead of trusting whatever the client
-- last saw.
create or replace function public.set_my_task_archived(
  p_task_id uuid,
  p_archived boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_archived then
    update public.tasks
    set archived_at = coalesce(archived_at, now())
    where id = p_task_id
      and user_id = current_user_id
      and status = 'done';
  else
    update public.tasks
    set archived_at = null
    where id = p_task_id
      and user_id = current_user_id;
  end if;
end;
$$;

revoke all on function public.set_my_task_archived(uuid, boolean) from public, anon;
grant execute on function public.set_my_task_archived(uuid, boolean) to authenticated;

commit;
