begin;

-- Migration 052's intent RPCs replace the client's per-render
-- ensureDailyMarket()/updateWiltedCrops() for the actions that touch them
-- (selling, market-refresh items), but a user who only plants/waters/
-- harvests never calls any of those -- without this, removing the client's
-- local reroll (as planned) would leave the market panel empty forever for
-- that user, since nothing would ever call ensure_farm_market_rotation.
--
-- get_my_farm_state_v6 wraps v5 and runs both lifecycle checks on every
-- farm load, exactly the way get_my_farm_state (014) already runs
-- run_farm_lifecycle() on every load for the wallet/mail side.

create or replace function public.get_my_farm_state_v6()
returns jsonb
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

  perform public.refresh_farm_wilt(current_user_id);
  perform public.ensure_farm_market_rotation(current_user_id);

  return public.get_my_farm_state_v5();
end;
$$;

revoke all on function public.get_my_farm_state_v6() from public, anon;
grant execute on function public.get_my_farm_state_v6() to authenticated;

commit;
