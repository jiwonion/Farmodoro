begin;

-- Focus rewards stay on the existing lifetime 60-minute Coin counter. Farm
-- care uses the existing watering/Coin actions; timer events never touch a
-- plot, including events buffered by a client from before this retirement.
create or replace function public.record_my_focus_time(
  p_event_id uuid,
  p_focus_mode text,
  p_elapsed_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  today date := (now() at time zone 'Asia/Seoul')::date;
  progress_row public.user_focus_progress%rowtype;
  next_event_ids uuid[];
  combined_seconds integer;
  completed_hours integer := 0;
  reward_per_hour integer := 1;
  awarded_coins integer := 0;
  bonuses jsonb := '[]'::jsonb;
  coin_balance bigint;
  accepted_event boolean := false;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if p_event_id is null then raise exception 'Focus event id is required'; end if;
  if p_focus_mode is null or p_focus_mode not in ('linked', 'quick') then
    raise exception 'Unsupported focus mode';
  end if;
  if p_elapsed_seconds is null or p_elapsed_seconds not between 1 and 600 then
    raise exception 'Elapsed focus seconds must be between 1 and 600';
  end if;

  -- Keep the existing provisioning and lock order. All versions of the
  -- focus RPC share one progress row and the same bounded retry window.
  perform public.ensure_farm_user(current_user_id);
  insert into public.user_focus_progress (user_id)
  values (current_user_id) on conflict (user_id) do nothing;

  select progress.* into progress_row
  from public.user_focus_progress as progress
  where progress.user_id = current_user_id for update;

  if not (p_event_id = any(progress_row.recent_event_ids)) then
    accepted_event := true;
    combined_seconds := progress_row.progress_seconds + p_elapsed_seconds;
    completed_hours := combined_seconds / 3600;
    next_event_ids := array_append(progress_row.recent_event_ids, p_event_id);
    if cardinality(next_event_ids) > 128 then
      next_event_ids := next_event_ids[cardinality(next_event_ids) - 127:cardinality(next_event_ids)];
    end if;

    update public.user_focus_progress as progress
    set progress_seconds = combined_seconds % 3600,
        recent_event_ids = next_event_ids,
        daily_focus_seconds = case when daily_focus_date = today
          then daily_focus_seconds + p_elapsed_seconds else p_elapsed_seconds end,
        daily_focus_date = today,
        updated_at = now()
    where progress.user_id = current_user_id returning progress.* into progress_row;

    if completed_hours > 0 then
      select case when farms.production_boost_until > now() then 2 else 1 end
      into reward_per_hour from public.farms as farms where farms.user_id = current_user_id;
      awarded_coins := completed_hours * coalesce(reward_per_hour, 1);
      if public.farm_set_effect_triggers(current_user_id, 'focusCoinDouble') then
        awarded_coins := awarded_coins * 2;
        bonuses := jsonb_build_array('focusCoinDouble');
      end if;

      update public.farm_wallets as wallets
      set coin_balance = wallets.coin_balance + awarded_coins
      where wallets.user_id = current_user_id returning wallets.coin_balance into coin_balance;
      insert into public.farm_wallet_ledger (
        user_id, currency, amount, balance_after, reason, reference_key
      ) values (
        current_user_id, 'coin', awarded_coins, coin_balance, '집중 시간 누적 보상', null
      );
    end if;
  end if;

  if coin_balance is null then
    select wallets.coin_balance into coin_balance
    from public.farm_wallets as wallets where wallets.user_id = current_user_id;
  end if;

  return jsonb_build_object(
    'progressSeconds', progress_row.progress_seconds,
    'coinBalance', coin_balance,
    'awardedCoins', awarded_coins,
    'accepted', accepted_event,
    'event', jsonb_build_object('bonuses', bonuses)
  );
end;
$$;

-- Preserve the v2 signature so queued/offline events and older open tabs
-- can still earn their Coin. Retired plot/planting arguments are ignored.
create or replace function public.record_my_focus_time_v2(
  p_event_id uuid,
  p_focus_mode text,
  p_elapsed_seconds integer,
  p_plot_index smallint,
  p_crop_instance_id uuid
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.record_my_focus_time(p_event_id, p_focus_mode, p_elapsed_seconds);
$$;

create or replace function public.get_my_focus_progress()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  progress_seconds integer;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  insert into public.user_focus_progress (user_id)
  values (current_user_id) on conflict (user_id) do nothing;
  select progress.progress_seconds into progress_seconds
  from public.user_focus_progress as progress where progress.user_id = current_user_id;
  return jsonb_build_object('progressSeconds', progress_seconds);
end;
$$;

create or replace function public.farm_plot_json(p_row public.farm_plots)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'id', p_row.plot_index,
    'crop', p_row.crop_id,
    'growth', p_row.growth,
    'plantedDate', p_row.planted_on,
    'lastWateredDate', p_row.last_watered_on,
    'lastFreeWaterAt', p_row.last_free_water_at,
    'lastCaredAt', p_row.last_cared_at,
    'wilted', p_row.wilted,
    'fertilizer', p_row.fertilizer_id
  );
$$;

create or replace function public.get_my_farm_state_v6()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  result jsonb;
  current_plots jsonb;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  perform public.ensure_farm_user(current_user_id);
  perform public.refresh_farm_wilt(current_user_id);
  perform public.ensure_farm_market_rotation(current_user_id);
  result := public.get_my_farm_state_v5();
  select coalesce(jsonb_agg(public.farm_plot_json(plots) order by plots.plot_index), '[]'::jsonb)
  into current_plots
  from public.farm_plots as plots where plots.user_id = current_user_id;
  return jsonb_set(result, '{plots}', current_plots, true);
end;
$$;

-- Reject before looking up any saved action. Old selection controls cannot
-- save a target or replay a pre-retirement selection response.
create or replace function public.select_my_focus_farm_plot(
  p_plot_index smallint,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  raise exception 'FARM_FOCUS_RETIRED';
end;
$$;

revoke all on function public.farm_plot_json(public.farm_plots),
  public.farm_focus_json(uuid), public.reset_farm_plot_focus_growth() from public, anon, authenticated;
revoke all on function public.get_my_focus_progress(), public.get_my_farm_state_v6(),
  public.record_my_focus_time(uuid, text, integer),
  public.record_my_focus_time_v2(uuid, text, integer, smallint, uuid),
  public.select_my_focus_farm_plot(smallint, uuid) from public, anon;
grant execute on function public.get_my_focus_progress(), public.get_my_farm_state_v6(),
  public.record_my_focus_time(uuid, text, integer),
  public.record_my_focus_time_v2(uuid, text, integer, smallint, uuid),
  public.select_my_focus_farm_plot(smallint, uuid) to authenticated;

-- Preserve historical target/planting metadata and saved actions in place.
-- No RPC reads them to select or grow a crop, and no client response exposes
-- them. The existing planting-reset trigger remains for the old column
-- constraints and does not grant crop growth. Daily focus totals remain
-- independent productivity history. Coin balances, accepted event IDs,
-- accumulated Coin progress and all existing growth stages are preserved.
commit;
