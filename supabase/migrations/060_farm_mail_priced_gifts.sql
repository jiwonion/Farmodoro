begin;

-- Let a sender attach a Coin price to a gift mail item, turning send_farm_mail
-- into a real (if trust-optional) sale: the recipient pays Coin at claim time
-- and the item + payment move atomically in claim_farm_mail_item, instead of
-- relying purely on the bulletin board's honor system (058).

alter table public.farm_mail_items
  add column if not exists price_coins integer;

alter table public.farm_mail_items
  drop constraint if exists farm_mail_items_price_coins_range;
alter table public.farm_mail_items
  add constraint farm_mail_items_price_coins_range
  check (price_coins is null or price_coins between 1 and 200);

drop function if exists public.send_farm_mail(text, text, text, integer);

create or replace function public.send_farm_mail(
  p_recipient_farm_code text,
  p_category text,
  p_item_id text,
  p_quantity integer default 1,
  p_price_coins integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  sender_id uuid := auth.uid();
  recipient_id uuid;
  sender_display_name text;
  available_quantity integer;
  sent_today integer;
  new_mail_id uuid;
  today_start timestamptz;
  tomorrow_start timestamptz;
begin
  if sender_id is null then
    raise exception 'Authentication required';
  end if;
  if p_category not in ('seed', 'harvest', 'supply', 'food') then
    raise exception 'Unsupported gift category';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 5 then
    raise exception 'Invalid gift quantity';
  end if;
  if p_price_coins is not null and p_price_coins not between 1 and 200 then
    raise exception 'Invalid gift price';
  end if;

  perform public.ensure_farm_user(sender_id);

  -- Serialize sends from one account so simultaneous requests cannot exceed 3/day.
  perform 1
  from public.farm_wallets
  where user_id = sender_id
  for update;

  select profiles.id
  into recipient_id
  from public.profiles
  where profiles.farm_code = upper(btrim(p_recipient_farm_code));

  if recipient_id is null then
    raise exception 'Recipient not found';
  end if;
  if recipient_id = sender_id then
    raise exception 'Cannot send mail to yourself';
  end if;

  select profiles.display_name
  into sender_display_name
  from public.profiles
  where profiles.id = sender_id;

  today_start := ((now() at time zone 'Asia/Seoul')::date::timestamp
    at time zone 'Asia/Seoul');
  tomorrow_start := today_start + interval '1 day';

  select count(*)::integer
  into sent_today
  from public.farm_mail
  where sender_user_id = sender_id
    and mail_type = 'gift'
    and sent_at >= today_start
    and sent_at < tomorrow_start;

  if sent_today >= 3 then
    raise exception 'Daily farm mail limit reached';
  end if;

  select quantity
  into available_quantity
  from public.farm_inventory
  where user_id = sender_id
    and category = p_category
    and item_id = p_item_id
  for update;

  if coalesce(available_quantity, 0) < p_quantity then
    raise exception 'Gift item is out of stock';
  end if;

  update public.farm_inventory
  set quantity = quantity - p_quantity
  where user_id = sender_id
    and category = p_category
    and item_id = p_item_id;

  insert into public.farm_mail (
    sender_user_id,
    recipient_user_id,
    sender_name,
    mail_type,
    subject
  )
  values (
    sender_id,
    recipient_id,
    sender_display_name,
    'gift',
    '농장 선물'
  )
  returning id into new_mail_id;

  insert into public.farm_mail_items (
    mail_id,
    item_order,
    category,
    item_id,
    quantity,
    price_coins,
    revealed_at
  )
  values (new_mail_id, 0, p_category, p_item_id, p_quantity, p_price_coins, now());

  return new_mail_id;
end;
$$;

revoke all on function public.send_farm_mail(text, text, text, integer, integer) from public, anon;
grant execute on function public.send_farm_mail(text, text, text, integer, integer) to authenticated;

create or replace function public.claim_farm_mail_item(p_mail_item_id uuid)
returns table (
  category text,
  item_id text,
  quantity integer,
  mail_claimed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient_id uuid := auth.uid();
  selected_item public.farm_mail_items%rowtype;
  selected_mail public.farm_mail%rowtype;
  all_claimed boolean;
  buyer_balance bigint;
  seller_balance bigint;
begin
  if recipient_id is null then
    raise exception 'Authentication required';
  end if;

  select mail_items.*
  into selected_item
  from public.farm_mail_items as mail_items
  where mail_items.id = p_mail_item_id
  for update;

  if selected_item.id is null then
    raise exception 'Mail item not found';
  end if;

  select mails.*
  into selected_mail
  from public.farm_mail as mails
  where mails.id = selected_item.mail_id
  for update;

  if selected_mail.recipient_user_id <> recipient_id then
    raise exception 'Mail does not belong to this user';
  end if;
  if selected_mail.expires_at <= now() then
    raise exception 'Mail has expired';
  end if;
  if selected_item.claimed_at is not null then
    raise exception 'Mail item was already claimed';
  end if;

  if selected_item.price_coins is not null and selected_item.price_coins > 0 then
    if selected_mail.sender_user_id is null then
      raise exception 'Priced mail requires a sender';
    end if;

    select wallets.coin_balance
    into buyer_balance
    from public.farm_wallets as wallets
    where wallets.user_id = recipient_id
    for update;

    if coalesce(buyer_balance, 0) < selected_item.price_coins then
      raise exception 'Insufficient coin balance';
    end if;

    perform public.ensure_farm_user(selected_mail.sender_user_id);

    update public.farm_wallets
    set coin_balance = coin_balance - selected_item.price_coins
    where user_id = recipient_id
    returning coin_balance into buyer_balance;

    insert into public.farm_wallet_ledger (
      user_id, currency, amount, balance_after, reason, reference_key
    ) values (
      recipient_id,
      'coin',
      -selected_item.price_coins,
      buyer_balance,
      '농장 우편 구매',
      'farm_mail_purchase:' || selected_item.id
    );

    update public.farm_wallets
    set coin_balance = coin_balance + selected_item.price_coins
    where user_id = selected_mail.sender_user_id
    returning coin_balance into seller_balance;

    insert into public.farm_wallet_ledger (
      user_id, currency, amount, balance_after, reason, reference_key
    ) values (
      selected_mail.sender_user_id,
      'coin',
      selected_item.price_coins,
      seller_balance,
      '농장 우편 판매',
      'farm_mail_sale:' || selected_item.id
    );
  end if;

  insert into public.farm_inventory (user_id, category, item_id, quantity)
  values (
    recipient_id,
    selected_item.category,
    selected_item.item_id,
    selected_item.quantity
  )
  on conflict on constraint farm_inventory_pkey do update
  set quantity = public.farm_inventory.quantity + excluded.quantity;

  update public.farm_mail_items
  set revealed_at = coalesce(revealed_at, now()),
      claimed_at = now()
  where id = selected_item.id;

  select not exists (
    select 1
    from public.farm_mail_items
    where farm_mail_items.mail_id = selected_item.mail_id
      and farm_mail_items.claimed_at is null
  )
  into all_claimed;

  if all_claimed then
    update public.farm_mail
    set claimed_at = now()
    where id = selected_item.mail_id;
  end if;

  return query
  select
    selected_item.category,
    selected_item.item_id,
    selected_item.quantity,
    all_claimed;
end;
$$;

revoke all on function public.claim_farm_mail_item(uuid) from public, anon;
grant execute on function public.claim_farm_mail_item(uuid) to authenticated;

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

commit;
