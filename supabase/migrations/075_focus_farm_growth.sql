begin;

-- Focus keeps its existing Coin reward and retry window. New clients also
-- send the plot and planting they were focusing on, so delayed/offline time
-- cannot accidentally grow a replacement crop or another device's target.
alter table public.user_focus_progress
  add column if not exists focus_plot_index smallint,
  add column if not exists daily_focus_date date,
  add column if not exists daily_focus_seconds integer not null default 0;
alter table public.user_focus_progress
  add constraint user_focus_progress_plot_index
    check (focus_plot_index is null or focus_plot_index in (0, 1, 2, 4, 5, 6, 8, 9, 10)),
  add constraint user_focus_progress_daily_seconds_nonnegative
    check (daily_focus_seconds >= 0);

alter table public.farm_plots
  add column if not exists focus_growth_seconds integer not null default 0,
  add column if not exists focus_crop_instance_id uuid;

update public.farm_plots
set focus_crop_instance_id = gen_random_uuid()
where crop_id is not null and focus_crop_instance_id is null;

alter table public.farm_plots
  add constraint farm_plots_focus_growth_seconds_range
    check (focus_growth_seconds between 0 and 1499),
  add constraint farm_plots_focus_crop_instance
    check (
      (crop_id is null and focus_crop_instance_id is null and focus_growth_seconds = 0)
      or (crop_id is not null and focus_crop_instance_id is not null)
    );

-- Existing plant/harvest/discard RPCs need no copies: the planting boundary
-- resets the remainder and rotates its identity for every way of changing it.
-- Manual watering/Coin growth preserve the remainder until the crop is ripe.
create or replace function public.reset_farm_plot_focus_growth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.crop_id is null then
    new.focus_growth_seconds := 0;
    new.focus_crop_instance_id := null;
  elsif tg_op = 'INSERT' then
    new.focus_growth_seconds := 0;
    new.focus_crop_instance_id := gen_random_uuid();
  elsif new.crop_id is distinct from old.crop_id
     or new.planted_on is distinct from old.planted_on then
    new.focus_growth_seconds := 0;
    new.focus_crop_instance_id := gen_random_uuid();
  elsif new.focus_crop_instance_id is null then
    new.focus_crop_instance_id := gen_random_uuid();
  end if;

  if new.crop_id is not null and new.growth >= public.farm_plot_max_growth(new.crop_id) then
    new.focus_growth_seconds := 0;
  end if;
  return new;
end;
$$;

revoke all on function public.reset_farm_plot_focus_growth() from public, anon, authenticated;
create trigger farm_plots_reset_focus_growth
  before insert or update on public.farm_plots
  for each row execute function public.reset_farm_plot_focus_growth();

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
    'fertilizer', p_row.fertilizer_id,
    'focusGrowthSeconds', p_row.focus_growth_seconds,
    'focusCropInstanceId', p_row.focus_crop_instance_id
  );
$$;
revoke all on function public.farm_plot_json(public.farm_plots) from public, anon, authenticated;

create or replace function public.farm_focus_json(p_user_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'plotId', progress.focus_plot_index,
    'growthSecondsPerStage', 1500,
    'dailyFocusDate', (now() at time zone 'Asia/Seoul')::date,
    'dailyFocusSeconds', case
      when progress.daily_focus_date = (now() at time zone 'Asia/Seoul')::date
        then coalesce(progress.daily_focus_seconds, 0)
      else 0
    end
  )
  from (select 1) as seed
  left join public.user_focus_progress as progress on progress.user_id = p_user_id;
$$;
revoke all on function public.farm_focus_json(uuid) from public, anon, authenticated;

create or replace function public.get_my_focus_progress()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  progress_seconds integer;
  current_plots jsonb;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  insert into public.user_focus_progress (user_id)
  values (current_user_id) on conflict (user_id) do nothing;

  select progress.progress_seconds into progress_seconds
  from public.user_focus_progress as progress where progress.user_id = current_user_id;

  select coalesce(jsonb_agg(public.farm_plot_json(plots) order by plots.plot_index), '[]'::jsonb)
  into current_plots
  from public.farm_plots as plots where plots.user_id = current_user_id;

  return jsonb_build_object(
    'progressSeconds', progress_seconds,
    'focusFarm', public.farm_focus_json(current_user_id),
    'plots', current_plots
  );
end;
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
  enriched_plots jsonb;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  perform public.ensure_farm_user(current_user_id);
  perform public.refresh_farm_wilt(current_user_id);
  perform public.ensure_farm_market_rotation(current_user_id);

  result := public.get_my_farm_state_v5();
  select coalesce(jsonb_agg(public.farm_plot_json(plots) order by plots.plot_index), '[]'::jsonb)
  into enriched_plots
  from public.farm_plots as plots where plots.user_id = current_user_id;

  return jsonb_set(result, '{plots}', enriched_plots, true)
    || jsonb_build_object('focusFarm', public.farm_focus_json(current_user_id));
end;
$$;

create or replace function public.select_my_focus_farm_plot(
  p_plot_index smallint,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  cached_result jsonb;
  selected_plot public.farm_plots%rowtype;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if p_request_id is null then raise exception 'Farm request id is required'; end if;
  perform public.ensure_farm_user(current_user_id);

  cached_result := public.farm_action_begin(current_user_id, p_request_id, 'select_my_focus_farm_plot');
  if cached_result is not null then return cached_result; end if;

  insert into public.user_focus_progress (user_id)
  values (current_user_id) on conflict (user_id) do nothing;
  perform 1 from public.user_focus_progress
  where user_id = current_user_id for update;

  if p_plot_index is not null then
    select * into selected_plot from public.farm_plots
    where user_id = current_user_id and plot_index = p_plot_index;
    if not found then raise exception 'FARM_PLOT_NOT_FOUND'; end if;
  end if;

  update public.user_focus_progress
  set focus_plot_index = p_plot_index, updated_at = now()
  where user_id = current_user_id;

  return public.farm_action_finish(current_user_id, p_request_id, jsonb_build_object(
    'focusFarm', public.farm_focus_json(current_user_id),
    'plots', case when p_plot_index is null then '[]'::jsonb
      else jsonb_build_array(public.farm_plot_json(selected_plot)) end
  ));
end;
$$;

create or replace function public.record_my_focus_time_v2(
  p_event_id uuid,
  p_focus_mode text,
  p_elapsed_seconds integer,
  p_plot_index smallint,
  p_crop_instance_id uuid
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
  plot_row public.farm_plots%rowtype;
  next_event_ids uuid[];
  combined_seconds integer;
  completed_hours integer := 0;
  reward_per_hour integer := 1;
  awarded_coins integer := 0;
  bonuses jsonb := '[]'::jsonb;
  coin_balance bigint;
  applied_seconds integer := 0;
  growth_added integer := 0;
  max_growth smallint;
  previous_growth smallint;
  remaining_seconds integer;
  protected_until timestamptz;
  plot_updates jsonb := '[]'::jsonb;
  growth_status text := 'none';
  crop_ready boolean := false;
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
  if p_plot_index is not null and p_plot_index not in (0, 1, 2, 4, 5, 6, 8, 9, 10) then
    raise exception 'FARM_PLOT_NOT_FOUND';
  end if;
  if p_plot_index is null and p_crop_instance_id is not null then
    raise exception 'FARM_FOCUS_TARGET_REQUIRED';
  end if;

  -- Provision before taking locks. Focus/target changes share only the
  -- progress-row lock; plot actions already lock plot before their wallet.
  -- Never lock the farms row here: cosmetic purchases lock wallet then farm.
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

    -- The crop identity belongs to the first focused second in the buffered
    -- event. It may differ from the currently selected plot after a switch.
    if p_plot_index is not null and p_crop_instance_id is not null then
      select * into plot_row from public.farm_plots
      where user_id = current_user_id and plot_index = p_plot_index for update;

      if not found or plot_row.crop_id is null
         or plot_row.focus_crop_instance_id is distinct from p_crop_instance_id then
        growth_status := 'stale';
      else
        max_growth := public.farm_plot_max_growth(plot_row.crop_id);
        select wilt_protection_until into protected_until
        from public.farms where user_id = current_user_id;

        -- Same deadline as refresh_farm_wilt, checked under the target lock.
        if not plot_row.wilted
           and (protected_until is null or protected_until <= now())
           and plot_row.last_cared_at is not null
           and plot_row.last_cared_at <= now() - interval '24 hours'
             * (1 + public.farm_set_bonus_percent(current_user_id, 'wilt') / 100.0) then
          update public.farm_plots set wilted = true
          where user_id = current_user_id and plot_index = p_plot_index
          returning * into plot_row;
        end if;

        if plot_row.wilted then
          growth_status := 'wilted';
        elsif plot_row.growth >= max_growth then
          growth_status := 'ready';
        else
          previous_growth := plot_row.growth;
          remaining_seconds := (max_growth - previous_growth) * 1500 - plot_row.focus_growth_seconds;
          applied_seconds := least(p_elapsed_seconds, remaining_seconds);
          combined_seconds := plot_row.focus_growth_seconds + applied_seconds;
          growth_added := combined_seconds / 1500;

          update public.farm_plots
          set growth = least(max_growth, growth + growth_added),
              focus_growth_seconds = case when previous_growth + growth_added >= max_growth
                then 0 else combined_seconds % 1500 end,
              last_watered_on = today,
              last_cared_at = now()
          where user_id = current_user_id and plot_index = p_plot_index
          returning * into plot_row;

          crop_ready := plot_row.growth >= max_growth;
          growth_status := case when crop_ready then 'ready' else 'growing' end;
        end if;
      end if;
      if plot_row.user_id is not null then
        plot_updates := jsonb_build_array(public.farm_plot_json(plot_row));
      end if;
    end if;

    -- Existing focus Coin and cosmetic effects are independent of whether a
    -- plot is selected/growable. They commit atomically with crop progress.
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

  -- A request can have committed even if its response was lost. Replays
  -- carry the current plot snapshot without reapplying any growth or reward,
  -- allowing the recovering client to reconcile its stale local farm.
  if not accepted_event and p_plot_index is not null then
    select * into plot_row from public.farm_plots
    where user_id = current_user_id and plot_index = p_plot_index;
    if found then
      plot_updates := jsonb_build_array(public.farm_plot_json(plot_row));
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
    'focusFarm', public.farm_focus_json(current_user_id),
    'plots', plot_updates,
    'event', jsonb_build_object(
      'bonuses', bonuses,
      'focusGrowth', jsonb_build_object(
        'plotId', p_plot_index,
        'cropId', plot_row.crop_id,
        'appliedSeconds', applied_seconds,
        'growthAdded', growth_added,
        'ready', crop_ready,
        'status', growth_status
      )
    )
  );
end;
$$;

-- Older open tabs have no planting snapshot; keep their Coin behavior and
-- daily productivity summary, without assigning growth to an unknown crop.
create or replace function public.record_my_focus_time(
  p_event_id uuid,
  p_focus_mode text,
  p_elapsed_seconds integer
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.record_my_focus_time_v2(p_event_id, p_focus_mode, p_elapsed_seconds, null, null);
$$;

revoke all on function public.get_my_focus_progress() from public, anon;
revoke all on function public.get_my_farm_state_v6() from public, anon;
revoke all on function public.select_my_focus_farm_plot(smallint, uuid) from public, anon;
revoke all on function public.record_my_focus_time_v2(uuid, text, integer, smallint, uuid) from public, anon;
revoke all on function public.record_my_focus_time(uuid, text, integer) from public, anon;
grant execute on function public.get_my_focus_progress() to authenticated;
grant execute on function public.get_my_farm_state_v6() to authenticated;
grant execute on function public.select_my_focus_farm_plot(smallint, uuid) to authenticated;
grant execute on function public.record_my_focus_time_v2(uuid, text, integer, smallint, uuid) to authenticated;
grant execute on function public.record_my_focus_time(uuid, text, integer) to authenticated;

comment on column public.user_focus_progress.focus_plot_index is
  'Selected focus target; serialized with focus events, not a client-only preference';
comment on column public.farm_plots.focus_growth_seconds is
  'Unconsumed focus seconds for this planting; 1500 seconds adds one existing growth unit';
comment on column public.farm_plots.focus_crop_instance_id is
  'Server-generated planting identity; prevents buffered time from growing a replacement crop';

commit;
