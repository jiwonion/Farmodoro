drop function if exists public.ensure_my_farm_update_mail(text, text);
drop function if exists public.deliver_farm_update_mail(uuid, text, text);
drop table if exists public.farm_update_mail_deliveries;

create table if not exists public.farm_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  granted_at timestamptz not null default now()
);

create table if not exists public.farm_admin_broadcasts (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.farm_admins (user_id) on delete restrict,
  title text not null,
  message text not null,
  recipient_count integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.farm_admins enable row level security;
alter table public.farm_admin_broadcasts enable row level security;

insert into public.farm_admins (user_id)
select users.id
from auth.users as users
where lower(users.email) = 'wlfhddl23@gmail.com'
on conflict (user_id) do nothing;

create or replace function public.is_farm_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.farm_admins as admins
    where admins.user_id = auth.uid()
  );
$$;

create or replace function public.broadcast_farm_update_mail(
  p_title text,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  broadcast_id uuid;
  recipient record;
  new_mail_id uuid;
  delivered_count integer := 0;
  mail_subject text;
  crop_ids text[] := array[
    'carrot', 'tomato', 'corn', 'potato', 'sweetPotato', 'strawberry',
    'eggplant', 'pepper', 'cucumber', 'pumpkin', 'onion', 'garlic',
    'cabbage', 'broccoli', 'watermelon', 'melon', 'rice', 'mushroom',
    'sunflower', 'beet', 'radish', 'turnip', 'chili', 'lettuce',
    'spinach', 'kale', 'celery', 'pea', 'bean', 'peanut', 'wheat',
    'barley', 'oat', 'grape', 'blueberry', 'raspberry', 'apple', 'pear',
    'peach', 'cherry', 'lemon', 'orange', 'pineapple', 'kiwi'
  ];
begin
  if current_user_id is null or not public.is_farm_admin() then
    raise exception 'Administrator permission required' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 60 then
    raise exception 'Title must be between 1 and 60 characters';
  end if;
  if char_length(btrim(coalesce(p_message, ''))) not between 1 and 1000 then
    raise exception 'Message must be between 1 and 1000 characters';
  end if;

  insert into public.farm_admin_broadcasts (
    created_by,
    title,
    message
  )
  values (
    current_user_id,
    btrim(p_title),
    btrim(p_message)
  )
  returning id into broadcast_id;

  mail_subject := left(
    btrim(p_title) || ' · ' || regexp_replace(btrim(p_message), '[[:space:]]+', ' ', 'g'),
    500
  );

  for recipient in select users.id from auth.users as users loop
    insert into public.farm_mail (
      sender_user_id,
      recipient_user_id,
      sender_name,
      mail_type,
      subject
    )
    values (
      null,
      recipient.id,
      'Farmodoro 업데이트',
      'system',
      mail_subject
    )
    returning id into new_mail_id;

    insert into public.farm_mail_items (
      mail_id,
      item_order,
      category,
      item_id,
      quantity
    )
    values (
      new_mail_id,
      0,
      'harvest',
      crop_ids[1 + floor(random() * cardinality(crop_ids))::integer],
      1
    );

    delivered_count := delivered_count + 1;
  end loop;

  update public.farm_admin_broadcasts
  set recipient_count = delivered_count
  where id = broadcast_id;

  return jsonb_build_object(
    'broadcastId', broadcast_id,
    'recipientCount', delivered_count
  );
end;
$$;

revoke all on table public.farm_admins from anon, authenticated;
revoke all on table public.farm_admin_broadcasts from anon, authenticated;
revoke all on function public.is_farm_admin() from public, anon;
revoke all on function public.broadcast_farm_update_mail(text, text) from public, anon;
grant execute on function public.is_farm_admin() to authenticated;
grant execute on function public.broadcast_farm_update_mail(text, text) to authenticated;

comment on table public.farm_admins is
  'Accounts allowed to send Farmodoro system mail broadcasts';
