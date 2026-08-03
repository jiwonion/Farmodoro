create table if not exists public.farm_update_mail_deliveries (
  user_id uuid not null references auth.users (id) on delete cascade,
  app_version text not null,
  mail_id uuid not null unique references public.farm_mail (id) on delete cascade,
  delivered_at timestamptz not null default now(),
  primary key (user_id, app_version)
);

alter table public.farm_update_mail_deliveries enable row level security;

create or replace function public.deliver_farm_update_mail(
  p_recipient_user_id uuid,
  p_app_version text,
  p_subject text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_mail_id uuid;
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
  if p_recipient_user_id is null or nullif(btrim(p_app_version), '') is null then
    raise exception 'Recipient and app version are required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_recipient_user_id::text || ':' || p_app_version, 0)
  );

  select deliveries.mail_id
  into new_mail_id
  from public.farm_update_mail_deliveries as deliveries
  where deliveries.user_id = p_recipient_user_id
    and deliveries.app_version = p_app_version;

  if new_mail_id is not null then
    return null;
  end if;

  insert into public.farm_mail (
    sender_user_id,
    recipient_user_id,
    sender_name,
    mail_type,
    subject
  )
  values (
    null,
    p_recipient_user_id,
    'Farmodoro 업데이트',
    'system',
    left(coalesce(nullif(btrim(p_subject), ''), p_app_version || ' 업데이트'), 500)
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

  insert into public.farm_update_mail_deliveries (
    user_id,
    app_version,
    mail_id
  )
  values (
    p_recipient_user_id,
    p_app_version,
    new_mail_id
  );

  return new_mail_id;
end;
$$;

revoke all on function public.deliver_farm_update_mail(uuid, text, text)
  from public, anon, authenticated;

create or replace function public.ensure_my_farm_update_mail(
  p_app_version text,
  p_subject text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  return public.deliver_farm_update_mail(
    current_user_id,
    p_app_version,
    p_subject
  ) is not null;
end;
$$;

revoke all on function public.ensure_my_farm_update_mail(text, text)
  from public, anon;
grant execute on function public.ensure_my_farm_update_mail(text, text)
  to authenticated;

do $$
declare
  account record;
begin
  for account in select users.id from auth.users as users loop
    perform public.deliver_farm_update_mail(
      account.id,
      'v43',
      'v43 업데이트 · 업데이트 노트 자동 우편과 랜덤 박스 추가 · 태블릿 가로 화면 프로필 접근 개선'
    );
  end loop;
end;
$$;

comment on table public.farm_update_mail_deliveries is
  'One Farmodoro update-note reward mail per user and cache version';
