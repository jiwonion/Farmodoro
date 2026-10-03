begin;

-- Remove retired server surfaces. Deploy together with the client that no
-- longer calls them. Wallet balances, inventories other than the retired
-- vouchers, bulletin history and productivity data are preserved.

-- 1. Whole-snapshot farm saves. Every farm change uses a per-action RPC (052).
drop function if exists public.save_my_farm_state_v5(jsonb, bigint);
drop function if exists public.save_my_farm_state_v4(jsonb);
drop function if exists public.save_my_farm_state_v3(jsonb);
drop function if exists public.save_my_farm_state_v2(jsonb);
drop function if exists public.save_my_farm_state(jsonb);

-- 2. Old kitchen and market stands. The simple kitchen (076/078) cooks and
-- sells; seeds are bought while planting. Replayable actions go with them.
drop function if exists public.buy_farm_seed(text, uuid);
drop function if exists public.sell_farm_food(text, uuid);
drop function if exists public.sell_farm_crop_bundle(text, smallint, uuid);
drop function if exists public.cook_farm_recipe(text[], uuid);
drop function if exists public.use_farm_market_refresh(text, uuid);
delete from public.farm_action_log where action in (
  'buy_farm_seed', 'sell_farm_food', 'sell_farm_crop_bundle',
  'cook_farm_recipe', 'use_farm_market_refresh'
);

-- 3. Market vouchers. Held and still-pending mailed vouchers are refunded at
-- their catalog price. The refund is not weekly earnings, so it bypasses
-- apply_farm_wallet_change and records its own ledger entry.
create temporary table retired_voucher_refunds on commit drop as
with vouchers as (
  select item_id, price from public.farm_supply_catalog
  where item_id in ('seedMarketRefresh', 'foodMarketRefresh')
), held as (
  select inventory.user_id, inventory.quantity::bigint * vouchers.price as amount
  from public.farm_inventory as inventory
  join vouchers on vouchers.item_id = inventory.item_id
  where inventory.category = 'supply' and inventory.quantity > 0
  union all
  select mails.recipient_user_id, items.quantity::bigint * vouchers.price
  from public.farm_mail_items as items
  join public.farm_mail as mails on mails.id = items.mail_id
  join vouchers on vouchers.item_id = items.item_id
  where items.category = 'supply' and items.claimed_at is null
    and mails.expires_at > now()
)
select user_id, sum(amount)::bigint as amount
from held group by user_id having sum(amount) > 0;

insert into public.farm_wallets (user_id)
select user_id from retired_voucher_refunds
on conflict (user_id) do nothing;

with refunded as (
  update public.farm_wallets as wallets
  set farm_money_balance = wallets.farm_money_balance + refunds.amount
  from retired_voucher_refunds as refunds
  where wallets.user_id = refunds.user_id
  returning wallets.user_id, refunds.amount, wallets.farm_money_balance
)
insert into public.farm_wallet_ledger (user_id, currency, amount, balance_after, reason, reference_key)
select user_id, 'farm_money', amount, farm_money_balance, '교환권 판매 종료 환불', 'retired-market-vouchers'
from refunded;

-- Gifts holding only vouchers would be left empty, so they go entirely.
delete from public.farm_mail as mails
where mails.mail_type = 'gift'
  and exists (select 1 from public.farm_mail_items as items where items.mail_id = mails.id)
  and not exists (
    select 1 from public.farm_mail_items as items
    where items.mail_id = mails.id
      and not (items.category = 'supply' and items.item_id in ('seedMarketRefresh', 'foodMarketRefresh'))
  );
delete from public.farm_mail_items
where category = 'supply' and item_id in ('seedMarketRefresh', 'foodMarketRefresh');

delete from public.farm_inventory
where category = 'supply' and item_id in ('seedMarketRefresh', 'foodMarketRefresh');
delete from public.farm_supply_catalog
where item_id in ('seedMarketRefresh', 'foodMarketRefresh');

alter table public.farm_supply_catalog drop constraint if exists farm_supply_catalog_item_type_check;
alter table public.farm_supply_catalog add constraint farm_supply_catalog_item_type_check
  check (item_type in ('plot', 'instant', 'target'));

-- 4. Focus YouTube playlists.
create or replace function public.get_my_preferences()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  prefs public.user_preferences%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  insert into public.user_preferences (user_id)
  values (current_user_id)
  on conflict (user_id) do nothing;

  select * into prefs
  from public.user_preferences
  where user_id = current_user_id;

  return jsonb_build_object(
    'tutorialCompleted', prefs.tutorial_completed,
    'settings', jsonb_build_object(
      'linked', jsonb_build_object(
        'focusMinutes', prefs.linked_focus_minutes,
        'breakEnabled', prefs.linked_break_enabled,
        'breakMinutes', prefs.linked_break_minutes
      ),
      'quick', jsonb_build_object(
        'focusMinutes', prefs.quick_focus_minutes,
        'breakEnabled', prefs.quick_break_enabled,
        'breakMinutes', prefs.quick_break_minutes
      )
    )
  );
end;
$$;

revoke all on function public.get_my_preferences() from public, anon;
grant execute on function public.get_my_preferences() to authenticated;

drop function if exists public.upsert_my_focus_playlist(uuid, text, text);
drop function if exists public.delete_my_focus_playlist(uuid);
drop function if exists public.touch_my_focus_playlist(uuid);

-- 5. Legacy data tables. Recipes are public (071), so discoveries are unused;
-- user_app_state was split into user_preferences by 050.
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

-- Anyone whose preferences row is still missing keeps their saved settings.
do $$
begin
  if to_regclass('public.user_app_state') is not null then
    insert into public.user_preferences (
      user_id, tutorial_completed,
      linked_focus_minutes, linked_break_enabled, linked_break_minutes,
      quick_focus_minutes, quick_break_enabled, quick_break_minutes
    )
    select
      app_state.user_id,
      coalesce((app_state.state ->> 'tutorialCompleted') = 'true', false),
      least(120, greatest(5, coalesce(case when app_state.state #>> '{settings,linked,focusMinutes}' ~ '^\d{1,3}$'
        then (app_state.state #>> '{settings,linked,focusMinutes}')::int end, 25))),
      coalesce((app_state.state #>> '{settings,linked,breakEnabled}') <> 'false', true),
      least(60, greatest(1, coalesce(case when app_state.state #>> '{settings,linked,breakMinutes}' ~ '^\d{1,3}$'
        then (app_state.state #>> '{settings,linked,breakMinutes}')::int end, 5))),
      least(120, greatest(5, coalesce(case when app_state.state #>> '{settings,quick,focusMinutes}' ~ '^\d{1,3}$'
        then (app_state.state #>> '{settings,quick,focusMinutes}')::int end, 25))),
      coalesce((app_state.state #>> '{settings,quick,breakEnabled}') <> 'false', true),
      least(60, greatest(1, coalesce(case when app_state.state #>> '{settings,quick,breakMinutes}' ~ '^\d{1,3}$'
        then (app_state.state #>> '{settings,quick,breakMinutes}')::int end, 5)))
    from public.user_app_state as app_state
    on conflict (user_id) do nothing;
  end if;
end $$;

drop function if exists public.get_my_app_state();
drop function if exists public.save_my_app_state(jsonb, bigint);

do $$
declare
  target text;
begin
  foreach target in array array['user_focus_playlists', 'user_app_state', 'farm_recipe_discoveries'] loop
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = target
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', target);
    end if;
  end loop;
end $$;

drop table if exists public.user_focus_playlists;
drop table if exists public.user_app_state;
drop table if exists public.farm_recipe_discoveries;

-- 6. The retired bulletin (068) keeps its history; stop the daily deletion.
create or replace function public.run_farm_lifecycle()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.finalize_previous_farm_week();
  perform public.cleanup_expired_farm_mail();
  perform public.cleanup_stale_wallet_idempotency();
  perform public.cleanup_stale_farm_actions();
end;
$$;

revoke all on function public.run_farm_lifecycle() from public, anon, authenticated;
drop function if exists public.cleanup_stale_bulletin_posts();

commit;
