begin;

-- Security hardening: the wallet and farm-state RPCs previously trusted whatever
-- amount/quantity/timestamp the client sent, with no server-side plausibility
-- check. An authenticated user could call these RPCs directly (bypassing the
-- app UI) to mint unlimited Coin/Farm Money, grant themselves a permanent
-- production boost, or fabricate inventory that gets mailed to other users.
-- Every real transaction in this app (task/habit rewards, market prices,
-- focus rewards) is small (low hundreds at most), so these caps are set far
-- above any legitimate value while blocking blatant abuse.

create or replace function public.apply_farm_wallet_change(
  p_user_id uuid,
  p_currency text,
  p_amount bigint,
  p_reason text,
  p_reference_key text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_balance bigint;
  reserved_reference boolean := true;
begin
  if p_currency not in ('coin', 'farm_money') then
    raise exception 'Unsupported currency';
  end if;
  if p_amount = 0 then
    raise exception 'Wallet change cannot be zero';
  end if;
  if abs(p_amount) > 10000 then
    raise exception 'Wallet change amount is out of allowed range';
  end if;
  if char_length(btrim(p_reason)) not between 1 and 80 then
    raise exception 'Wallet reason is invalid';
  end if;

  perform public.ensure_farm_user(p_user_id);

  if nullif(btrim(p_reference_key), '') is not null then
    insert into public.farm_wallet_idempotency (user_id, currency, reference_key)
    values (p_user_id, p_currency, btrim(p_reference_key))
    on conflict do nothing;

    if not found then
      select case
        when p_currency = 'coin' then wallets.coin_balance
        else wallets.farm_money_balance
      end
      into new_balance
      from public.farm_wallets as wallets
      where wallets.user_id = p_user_id;
      return new_balance;
    end if;
  end if;

  if p_currency = 'coin' then
    update public.farm_wallets
    set coin_balance = coin_balance + p_amount
    where user_id = p_user_id
    returning coin_balance into new_balance;
  else
    update public.farm_wallets
    set farm_money_balance = farm_money_balance + p_amount
    where user_id = p_user_id
      and farm_money_balance + p_amount >= 0
    returning farm_money_balance into new_balance;

    if p_amount > 0 then
      insert into public.farm_weekly_earnings (user_id, week_start, earned_farm_money)
      values (p_user_id, public.current_farm_week_start(), p_amount)
      on conflict (user_id, week_start) do update
      set earned_farm_money =
        public.farm_weekly_earnings.earned_farm_money + excluded.earned_farm_money;
    end if;
  end if;

  if new_balance is null then
    raise exception 'Insufficient balance';
  end if;

  insert into public.farm_wallet_ledger (
    user_id, currency, amount, balance_after, reason, reference_key
  ) values (
    p_user_id, p_currency, p_amount, new_balance, btrim(p_reason), p_reference_key
  );

  return new_balance;
end;
$$;

revoke all on function public.apply_farm_wallet_change(uuid, text, bigint, text, text)
  from public, anon, authenticated;

-- save_my_farm_state: cap inventory quantities and boost timestamps so a
-- client can no longer fabricate an arbitrary stockpile or a permanent
-- production boost by editing the saved-state payload directly.
create or replace function public.save_my_farm_state(p_state jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  entry jsonb;
  rotation_date date;
  raw_boost_until timestamptz;
  raw_wilt_until timestamptz;
  max_future_boost timestamptz := now() + interval '90 days';
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if jsonb_typeof(p_state) <> 'object' then
    raise exception 'Farm state must be an object';
  end if;

  perform public.ensure_farm_user(current_user_id);

  raw_boost_until := nullif(p_state #>> '{farm,productionBoostUntil}', '')::timestamptz;
  raw_wilt_until := nullif(p_state #>> '{farm,wiltProtectionUntil}', '')::timestamptz;

  insert into public.farms (
    user_id,
    farm_name,
    production_boost_until,
    wilt_protection_until,
    waste_count
  )
  values (
    current_user_id,
    coalesce(nullif(btrim(p_state #>> '{farm,farmName}'), ''), '햇살 밭'),
    case when raw_boost_until is null then null else least(raw_boost_until, max_future_boost) end,
    case when raw_wilt_until is null then null else least(raw_wilt_until, max_future_boost) end,
    greatest(0, coalesce((p_state #>> '{farm,wasteCount}')::integer, 0))
  )
  on conflict (user_id) do update
  set
    farm_name = excluded.farm_name,
    production_boost_until = excluded.production_boost_until,
    wilt_protection_until = excluded.wilt_protection_until,
    waste_count = excluded.waste_count;

  for entry in select value from jsonb_array_elements(coalesce(p_state -> 'plots', '[]'::jsonb)) loop
    insert into public.farm_plots (
      user_id,
      plot_index,
      crop_id,
      growth,
      planted_on,
      last_watered_on,
      last_free_water_at,
      wilted,
      fertilizer_id
    )
    values (
      current_user_id,
      (entry ->> 'id')::smallint,
      nullif(entry ->> 'crop', ''),
      greatest(0, coalesce((entry ->> 'growth')::smallint, 0)),
      nullif(entry ->> 'plantedDate', '')::date,
      nullif(entry ->> 'lastWateredDate', '')::date,
      nullif(entry ->> 'lastFreeWaterAt', '')::timestamptz,
      coalesce((entry ->> 'wilted')::boolean, false),
      nullif(entry ->> 'fertilizer', '')
    )
    on conflict (user_id, plot_index) do update
    set
      crop_id = excluded.crop_id,
      growth = excluded.growth,
      planted_on = excluded.planted_on,
      last_watered_on = excluded.last_watered_on,
      last_free_water_at = excluded.last_free_water_at,
      wilted = excluded.wilted,
      fertilizer_id = excluded.fertilizer_id;
  end loop;

  for entry in select value from jsonb_array_elements(coalesce(p_state -> 'inventory', '[]'::jsonb)) loop
    insert into public.farm_inventory (user_id, category, item_id, quantity)
    values (
      current_user_id,
      entry ->> 'category',
      entry ->> 'itemId',
      least(100000, greatest(0, coalesce((entry ->> 'quantity')::integer, 0)))
    )
    on conflict (user_id, category, item_id) do update
    set quantity = excluded.quantity;
  end loop;

  delete from public.farm_recipe_discoveries
  where user_id = current_user_id;
  insert into public.farm_recipe_discoveries (user_id, recipe_id)
  select current_user_id, recipes.recipe_id
  from jsonb_array_elements_text(coalesce(p_state -> 'discoveredRecipes', '[]'::jsonb)) as recipes(recipe_id)
  on conflict (user_id, recipe_id) do nothing;

  rotation_date := nullif(p_state #>> '{marketRotation,date}', '')::date;
  if rotation_date is not null then
    insert into public.farm_market_rotations (
      user_id,
      rotation_date,
      seed_offer_ids,
      food_offer_ids
    )
    values (
      current_user_id,
      rotation_date,
      array(select jsonb_array_elements_text(coalesce(p_state #> '{marketRotation,seedOffers}', '[]'::jsonb))),
      array(select jsonb_array_elements_text(coalesce(p_state #> '{marketRotation,foodOffers}', '[]'::jsonb)))
    )
    on conflict on constraint farm_market_rotations_pkey do update
    set
      seed_offer_ids = excluded.seed_offer_ids,
      food_offer_ids = excluded.food_offer_ids;
  end if;
end;
$$;

revoke all on function public.save_my_farm_state(jsonb) from public, anon;
grant execute on function public.save_my_farm_state(jsonb) to authenticated;

-- record_my_focus_time: give focus-reward Coin credits a ledger row too, so
-- the user's transaction history doesn't silently omit them. This does NOT
-- go through apply_farm_wallet_change/farm_wallet_idempotency on purpose --
-- that table would gain one permanent row per hourly reward with no cleanup
-- path, and the recent_event_ids array on user_focus_progress already
-- de-duplicates this exact event. Ledger inserts have no such growth
-- problem (see farm_wallet_ledger's existing role as an append-only log).
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
  progress_row public.user_focus_progress%rowtype;
  next_event_ids uuid[];
  combined_seconds integer;
  completed_hours integer := 0;
  reward_per_hour integer := 1;
  awarded_coins integer := 0;
  coin_balance bigint;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_event_id is null then
    raise exception 'Focus event id is required';
  end if;
  if p_focus_mode not in ('linked', 'quick') then
    raise exception 'Unsupported focus mode';
  end if;
  if p_elapsed_seconds not between 1 and 600 then
    raise exception 'Elapsed focus seconds must be between 1 and 600';
  end if;

  insert into public.user_focus_progress (user_id)
  values (current_user_id)
  on conflict (user_id) do nothing;

  select progress.*
  into progress_row
  from public.user_focus_progress as progress
  where progress.user_id = current_user_id
  for update;

  if not (p_event_id = any(progress_row.recent_event_ids)) then
    combined_seconds := progress_row.progress_seconds + p_elapsed_seconds;
    completed_hours := floor(combined_seconds::numeric / 3600)::integer;
    next_event_ids := array_append(progress_row.recent_event_ids, p_event_id);

    if cardinality(next_event_ids) > 128 then
      next_event_ids := next_event_ids[
        cardinality(next_event_ids) - 127:cardinality(next_event_ids)
      ];
    end if;

    update public.user_focus_progress as progress
    set progress_seconds = combined_seconds % 3600,
        recent_event_ids = next_event_ids,
        updated_at = now()
    where progress.user_id = current_user_id
    returning progress.* into progress_row;

    if completed_hours > 0 then
      perform public.ensure_farm_user(current_user_id);

      select case when farms.production_boost_until > now() then 2 else 1 end
      into reward_per_hour
      from public.farms as farms
      where farms.user_id = current_user_id;

      reward_per_hour := coalesce(reward_per_hour, 1);
      awarded_coins := completed_hours * reward_per_hour;

      update public.farm_wallets as wallets
      set coin_balance = wallets.coin_balance + awarded_coins
      where wallets.user_id = current_user_id
      returning wallets.coin_balance into coin_balance;

      insert into public.farm_wallet_ledger (
        user_id, currency, amount, balance_after, reason, reference_key
      ) values (
        current_user_id, 'coin', awarded_coins, coin_balance, '집중 시간 누적 보상', null
      );
    end if;
  end if;

  if coin_balance is null then
    perform public.ensure_farm_user(current_user_id);
    select wallets.coin_balance
    into coin_balance
    from public.farm_wallets as wallets
    where wallets.user_id = current_user_id;
  end if;

  return jsonb_build_object(
    'progressSeconds', progress_row.progress_seconds,
    'coinBalance', coin_balance,
    'awardedCoins', awarded_coins
  );
end;
$$;

revoke all on function public.record_my_focus_time(uuid, text, integer) from public, anon;
grant execute on function public.record_my_focus_time(uuid, text, integer) to authenticated;

-- Give habit completion the same stable per-completion idempotency token
-- tasks already have (tasks.completion_cycle_id), so a retried or
-- near-simultaneous complete/undo pair reuses the same wallet reference key
-- instead of a fresh random one every time.
alter table public.habit_daily_records
  add column if not exists completion_cycle_id uuid;

create or replace function public.get_my_productivity_state()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  result jsonb;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select jsonb_build_object(
    'groups', coalesce((
      select jsonb_agg(to_jsonb(group_row) order by group_row.sort_order, group_row.created_at)
      from (
        select g.id, private.farmodoro_decrypt_text(g.name) as name,
          g.color_index, g.sort_order, g.created_at
        from public.task_groups g
        where g.user_id = current_user_id
      ) group_row
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(to_jsonb(task_row) order by task_row.sort_order, task_row.created_at)
      from (
        select t.id, t.group_id, private.farmodoro_decrypt_text(t.title) as title,
          t.status, t.sort_order, t.focus_seconds, t.completion_reward,
          t.completed_with_free_pass, t.completed_on, t.completion_cycle_id,
          t.archived_at, t.created_at
        from public.tasks t
        where t.user_id = current_user_id
      ) task_row
    ), '[]'::jsonb),
    'habits', coalesce((
      select jsonb_agg(to_jsonb(habit_row) order by habit_row.sort_order, habit_row.created_at)
      from (
        select h.id, private.farmodoro_decrypt_text(h.title) as title,
          h.measure_type, h.target_value, h.target_by_weekday, h.unit,
          h.weekdays, h.start_date, h.end_date, h.sort_order, h.created_at
        from public.habits h
        where h.user_id = current_user_id
      ) habit_row
    ), '[]'::jsonb),
    'habitRecords', coalesce((
      select jsonb_agg(to_jsonb(record_row) order by record_row.record_date)
      from (
        select r.habit_id, r.record_date, r.progress_value, r.focus_seconds,
          r.completed_at, r.completion_reward, r.completed_with_free_pass,
          r.completion_cycle_id
        from public.habit_daily_records r
        join public.habits h on h.id = r.habit_id
        where h.user_id = current_user_id
      ) record_row
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_my_productivity_state() from public, anon;
grant execute on function public.get_my_productivity_state() to authenticated;

-- Migration hygiene: user_focus_daily was emptied and deprecated by 036 but
-- left behind as a dead table. Drop it for real now (cascades its policies,
-- grants, and realtime publication membership).
drop table if exists public.user_focus_daily cascade;

-- Make the task-lifecycle cron job idempotent to (re)schedule, matching the
-- pattern the farm-lifecycle job already uses, so replaying/adjusting this
-- job later can't create a duplicate.
do $$
declare
  existing_job_id bigint;
begin
  for existing_job_id in
    select jobid
    from cron.job
    where jobname = 'farmodoro-task-lifecycle'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;

  perform cron.schedule(
    'farmodoro-task-lifecycle',
    '5 * * * *',
    'select public.run_task_lifecycle();'
  );
end;
$$;

commit;
