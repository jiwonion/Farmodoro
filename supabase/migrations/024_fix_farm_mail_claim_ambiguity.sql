-- The claim function returns a column named `category`, which makes an
-- ON CONFLICT column list containing `category` ambiguous inside PL/pgSQL.
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
