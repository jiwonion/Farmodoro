drop function if exists public.broadcast_farm_update_mail(text, text);

create or replace function public.broadcast_farm_update_mail(
  p_title text,
  p_message text,
  p_box_count integer default 1
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
  box_index integer;
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
  if coalesce(p_box_count, 1) not between 1 and 20 then
    raise exception 'Box count must be between 1 and 20';
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

    for box_index in 0..p_box_count - 1 loop
      insert into public.farm_mail_items (
        mail_id,
        item_order,
        category,
        item_id,
        quantity
      )
      values (
        new_mail_id,
        box_index,
        'harvest',
        crop_ids[1 + floor(random() * cardinality(crop_ids))::integer],
        1
      );
    end loop;

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

revoke all on function public.broadcast_farm_update_mail(text, text, integer) from public, anon;
grant execute on function public.broadcast_farm_update_mail(text, text, integer) to authenticated;
