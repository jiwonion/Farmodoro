begin;

-- Same class of bug migration 047 fixed for the farm, still wide open for
-- user_app_state (focus YouTube playlists, background choice, timer
-- settings...). The client writes it with a plain full-document upsert, so
-- a device holding a stale copy -- a suspended PWA, a tab left open
-- overnight -- silently overwrites the whole document the moment it saves
-- for any reason. Add a playlist on the laptop, let the phone flush its
-- day-old state on exit, and the playlist is gone with no error anywhere.
--
-- Fix, mirroring 047: version the row, and route saves through an RPC that
-- refuses a write whose expected version no longer matches.

alter table public.user_app_state add column if not exists version bigint not null default 0;

create or replace function public.get_my_app_state()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  row_state jsonb;
  row_version bigint;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select app_state.state, app_state.version
  into row_state, row_version
  from public.user_app_state as app_state
  where app_state.user_id = current_user_id;

  return jsonb_build_object(
    'state', row_state,
    'version', coalesce(row_version, 0)
  );
end;
$$;

revoke all on function public.get_my_app_state() from public, anon;
grant execute on function public.get_my_app_state() to authenticated;

create or replace function public.save_my_app_state(
  p_state jsonb,
  p_expected_version bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  locked_version bigint;
  next_version bigint;
  row_found boolean;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if jsonb_typeof(p_state) <> 'object' then
    raise exception 'App state must be an object';
  end if;

  select app_state.version into locked_version
  from public.user_app_state as app_state
  where app_state.user_id = current_user_id
  for update;
  row_found := found;

  -- No row yet: the only valid expectation is "nothing was there".
  if not row_found then
    if coalesce(p_expected_version, 0) <> 0 then
      raise exception 'APP_STATE_STALE';
    end if;
    insert into public.user_app_state (user_id, state, version)
    values (current_user_id, p_state, 1)
    on conflict (user_id) do nothing;
    -- Lost the insert race against a concurrent caller.
    if not found then
      raise exception 'APP_STATE_STALE';
    end if;
    return 1;
  end if;

  if locked_version is distinct from p_expected_version then
    raise exception 'APP_STATE_STALE';
  end if;

  next_version := locked_version + 1;
  update public.user_app_state
  set state = p_state,
      version = next_version
  where user_id = current_user_id;

  return next_version;
end;
$$;

revoke all on function public.save_my_app_state(jsonb, bigint) from public, anon;
grant execute on function public.save_my_app_state(jsonb, bigint) to authenticated;

commit;
