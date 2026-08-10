begin;

-- Let a sender attach a short note to a gift mail, same idea as the price
-- tag in 060 -- a farm-code-targeted mail already reads like a DM, this just
-- lets it carry one line of text along with the item.

alter table public.farm_mail
  add column if not exists sender_message text;

alter table public.farm_mail
  drop constraint if exists farm_mail_sender_message_length;
alter table public.farm_mail
  add constraint farm_mail_sender_message_length
  check (sender_message is null or char_length(sender_message) between 1 and 80);

drop function if exists public.send_farm_mail(text, text, text, integer, integer);

create or replace function public.send_farm_mail(
  p_recipient_farm_code text,
  p_category text,
  p_item_id text,
  p_quantity integer default 1,
  p_price_coins integer default null,
  p_message text default null
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
  trimmed_message text := nullif(btrim(coalesce(p_message, '')), '');
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
  if trimmed_message is not null and char_length(trimmed_message) > 80 then
    raise exception 'Invalid gift message';
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
    subject,
    sender_message
  )
  values (
    sender_id,
    recipient_id,
    sender_display_name,
    'gift',
    '농장 선물',
    trimmed_message
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

revoke all on function public.send_farm_mail(text, text, text, integer, integer, text) from public, anon;
grant execute on function public.send_farm_mail(text, text, text, integer, integer, text) to authenticated;

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

commit;
