begin;

-- save_my_farm_state (and its v2/v3/v4 thin wrappers) always overwrite the
-- whole farm -- plots, inventory, market rotation, everything -- with
-- whatever the calling client's local `state` object happens to contain.
-- That's fine for a single active session, but a second device/tab that
-- has been sitting backgrounded (a PWA is commonly suspended rather than
-- torn down, so re-opening it doesn't refetch anything on its own) is
-- holding a stale snapshot. The moment *it* saves for any reason -- even
-- something unrelated to what changed elsewhere -- its outdated snapshot
-- silently overwrites every change made in the meantime: a harvest, a
-- purchase, a renamed farm, all reverted with no error and no trace.
--
-- Fix: give public.farms a version counter. Every save has to state which
-- version it *read*; if that no longer matches the row's current version
-- (someone else saved first), the write is rejected outright instead of
-- being applied over the newer data. The client then reloads the fresh
-- state and asks the user to redo whatever they just did, rather than
-- silently losing someone else's changes.

alter table public.farms add column if not exists version bigint not null default 0;

create or replace function public.get_my_farm_state_v5()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  result jsonb;
  current_version bigint;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  perform public.ensure_farm_user(current_user_id);

  result := public.get_my_farm_state_v4();

  select farms.version into current_version
  from public.farms as farms
  where farms.user_id = current_user_id;

  return jsonb_set(result, '{farm,version}', to_jsonb(coalesce(current_version, 0)), true);
end;
$$;

revoke all on function public.get_my_farm_state_v5() from public, anon;
grant execute on function public.get_my_farm_state_v5() to authenticated;

create or replace function public.save_my_farm_state_v5(
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
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  perform public.ensure_farm_user(current_user_id);

  select farms.version into locked_version
  from public.farms as farms
  where farms.user_id = current_user_id
  for update;

  if locked_version is distinct from p_expected_version then
    raise exception 'FARM_STATE_STALE';
  end if;

  perform public.save_my_farm_state_v4(p_state);

  next_version := locked_version + 1;
  update public.farms
  set version = next_version
  where user_id = current_user_id;

  return next_version;
end;
$$;

revoke all on function public.save_my_farm_state_v5(jsonb, bigint) from public, anon;
grant execute on function public.save_my_farm_state_v5(jsonb, bigint) to authenticated;

commit;
