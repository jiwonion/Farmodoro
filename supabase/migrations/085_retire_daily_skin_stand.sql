begin;

-- Retire the daily skin stand. Themes and fields are sold permanently from the
-- garden collection, so no farm read rolls or returns daily offers any more.
-- Deploy together with the client that no longer reads marketRotation.

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
          'message', mails.sender_message,
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
                'priceCoins', items.price_coins,
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
          'message', mails.sender_message,
          'items', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'category', items.category,
                'itemId', items.item_id,
                'quantity', items.quantity,
                'priceCoins', items.price_coins
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
revoke all on function public.get_my_farm_state() from public, anon;
grant execute on function public.get_my_farm_state() to authenticated;

create or replace function public.get_my_farm_state_v3()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  return public.get_my_farm_state_v2();
end;
$$;
revoke all on function public.get_my_farm_state_v3() from public, anon;
grant execute on function public.get_my_farm_state_v3() to authenticated;

create or replace function public.get_my_farm_state_v4()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  result jsonb;
  owned_cosmetics jsonb;
  equipped jsonb;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  result := public.get_my_farm_state_v3();

  select coalesce(jsonb_agg(jsonb_build_object('type', c.cosmetic_type, 'id', c.cosmetic_id)), '[]'::jsonb)
  into owned_cosmetics
  from public.farm_cosmetics as c
  where c.user_id = current_user_id;

  select jsonb_build_object(
    'equippedFarmTheme', farms.equipped_farm_theme,
    'equippedPlotSkin', farms.equipped_plot_skin,
    'equippedLabelEffect', farms.equipped_label_effect
  )
  into equipped
  from public.farms as farms
  where farms.user_id = current_user_id;

  result := jsonb_set(result, '{farm}', coalesce(result -> 'farm', '{}'::jsonb) || coalesce(equipped, '{}'::jsonb), true);
  result := jsonb_set(result, '{ownedCosmetics}', owned_cosmetics, true);

  return result;
end;
$$;
revoke all on function public.get_my_farm_state_v4() from public, anon;
grant execute on function public.get_my_farm_state_v4() to authenticated;

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
  result := public.get_my_farm_state_v5();
  select coalesce(jsonb_agg(public.farm_plot_json(plots) order by plots.plot_index), '[]'::jsonb)
  into current_plots
  from public.farm_plots as plots where plots.user_id = current_user_id;
  return jsonb_set(result, '{plots}', current_plots, true);
end;
$$;
revoke all on function public.get_my_farm_state_v6() from public, anon;
grant execute on function public.get_my_farm_state_v6() to authenticated;

drop function if exists public.ensure_farm_market_rotation(uuid);
drop function if exists public.farm_market_rotation_json(public.farm_market_rotations);

do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'farm_market_rotations'
  ) then
    alter publication supabase_realtime drop table public.farm_market_rotations;
  end if;
end $$;

drop table if exists public.farm_market_rotations;

commit;
