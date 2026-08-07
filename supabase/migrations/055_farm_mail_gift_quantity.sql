begin;

-- send_farm_mail only ever sent exactly 1 of an item per mail. Let a sender
-- pick 1-5 in one send so gifting a stack of crops doesn't cost multiple
-- daily mail sends. claim_farm_mail_item (006) already credits the full
-- farm_mail_items.quantity on claim, not a hardcoded 1, so nothing on the
-- receiving side needs to change.
drop function if exists public.send_farm_mail(text, text, text);

create or replace function public.send_farm_mail(
  p_recipient_farm_code text,
  p_category text,
  p_item_id text,
  p_quantity integer default 1
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
    revealed_at
  )
  values (new_mail_id, 0, p_category, p_item_id, p_quantity, now());

  return new_mail_id;
end;
$$;

revoke all on function public.send_farm_mail(text, text, text, integer) from public, anon;
grant execute on function public.send_farm_mail(text, text, text, integer) to authenticated;

commit;
