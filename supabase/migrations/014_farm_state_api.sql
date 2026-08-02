-- Connect the farm UI to the normalized farm tables created by migration 006.

create or replace function public.get_my_farm_state()
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

  perform public.ensure_farm_user(current_user_id);
  perform public.run_farm_lifecycle();

  select jsonb_build_object(
    'farm', jsonb_build_object(
      'farmName', farms.farm_name,
      'productionBoostUntil', farms.production_boost_until,
      'wiltProtectionUntil', farms.wilt_protection_until,
      'wasteCount', farms.waste_count
    ),
    'plots', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', plots.plot_index,
          'crop', plots.crop_id,
          'growth', plots.growth,
          'plantedDate', plots.planted_on,
          'lastWateredDate', plots.last_watered_on,
          'lastFreeWaterAt', plots.last_free_water_at,
          'wilted', plots.wilted,
          'fertilizer', plots.fertilizer_id
        ) order by plots.plot_index
      )
      from public.farm_plots as plots
      where plots.user_id = current_user_id
    ), '[]'::jsonb),
    'inventory', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'category', inventory.category,
          'itemId', inventory.item_id,
          'quantity', inventory.quantity
        ) order by inventory.category, inventory.item_id
      )
      from public.farm_inventory as inventory
      where inventory.user_id = current_user_id
    ), '[]'::jsonb),
    'discoveredRecipes', coalesce((
      select jsonb_agg(discoveries.recipe_id order by discoveries.discovered_at)
      from public.farm_recipe_discoveries as discoveries
      where discoveries.user_id = current_user_id
    ), '[]'::jsonb),
    'marketRotation', coalesce((
      select jsonb_build_object(
        'date', rotations.rotation_date,
        'seedOffers', rotations.seed_offer_ids,
        'foodOffers', rotations.food_offer_ids
      )
      from public.farm_market_rotations as rotations
      where rotations.user_id = current_user_id
      order by rotations.rotation_date desc
      limit 1
    ), '{}'::jsonb),
    'weeklyFarmMoneyEarned', coalesce((
      select earnings.earned_farm_money
      from public.farm_weekly_earnings as earnings
      where earnings.user_id = current_user_id
        and earnings.week_start = public.current_farm_week_start()
    ), 0),
    'inbox', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', mails.id,
          'senderUserId', mails.sender_user_id,
          'senderName', mails.sender_name,
          'mailType', mails.mail_type,
          'subject', mails.subject,
          'sentAt', mails.sent_at,
          'expiresAt', mails.expires_at,
          'claimedAt', mails.claimed_at,
          'items', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', items.id,
                'category', items.category,
                'itemId', items.item_id,
                'quantity', items.quantity,
                'revealedAt', items.revealed_at,
                'claimedAt', items.claimed_at
              ) order by items.item_order
            )
            from public.farm_mail_items as items
            where items.mail_id = mails.id
          ), '[]'::jsonb)
        ) order by mails.sent_at desc
      )
      from public.farm_mail as mails
      where mails.recipient_user_id = current_user_id
        and mails.expires_at > now()
    ), '[]'::jsonb),
    'sentToday', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', mails.id,
          'recipientName', coalesce(profiles.display_name, '농부'),
          'sentAt', mails.sent_at,
          'items', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'category', items.category,
                'itemId', items.item_id,
                'quantity', items.quantity
              ) order by items.item_order
            )
            from public.farm_mail_items as items
            where items.mail_id = mails.id
          ), '[]'::jsonb)
        ) order by mails.sent_at desc
      )
      from public.farm_mail as mails
      left join public.profiles as profiles on profiles.id = mails.recipient_user_id
      where mails.sender_user_id = current_user_id
        and mails.mail_type = 'gift'
        and mails.sent_at >= ((now() at time zone 'Asia/Seoul')::date::timestamp at time zone 'Asia/Seoul')
        and mails.sent_at < (((now() at time zone 'Asia/Seoul')::date + 1)::timestamp at time zone 'Asia/Seoul')
    ), '[]'::jsonb)
  )
  into result
  from public.farms as farms
  where farms.user_id = current_user_id;

  return coalesce(result, '{}'::jsonb);
end;
$$;

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
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if jsonb_typeof(p_state) <> 'object' then
    raise exception 'Farm state must be an object';
  end if;

  perform public.ensure_farm_user(current_user_id);

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
    nullif(p_state #>> '{farm,productionBoostUntil}', '')::timestamptz,
    nullif(p_state #>> '{farm,wiltProtectionUntil}', '')::timestamptz,
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
      greatest(0, coalesce((entry ->> 'quantity')::integer, 0))
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

revoke all on function public.get_my_farm_state() from public, anon;
revoke all on function public.save_my_farm_state(jsonb) from public, anon;
grant execute on function public.get_my_farm_state() to authenticated;
grant execute on function public.save_my_farm_state(jsonb) to authenticated;

comment on function public.get_my_farm_state() is
  'Loads the authenticated user farm, plots, inventory, recipes, market rotation, and mail';
comment on function public.save_my_farm_state(jsonb) is
  'Persists the authenticated user farm, plots, inventory, recipes, and market rotation';
