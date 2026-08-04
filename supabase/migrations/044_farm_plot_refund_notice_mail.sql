-- Migration 041 refunded users for crops lost when the farm grid shrank
-- 4x4 -> 3x3, but that refund was a silent direct wallet credit with no
-- mail, so the user had no visibility into what happened. This is a
-- one-time backfill that sends each refunded user a notice mail summarizing
-- the total Coin they got back, reusing the 'system' mail_type + one small
-- token harvest item pattern from 022_farm_update_mail.sql (the mail UI has
-- no path to render a mail with zero items). Safe to re-run: skips any
-- recipient who already has a matching-subject mail.

do $$
declare
  refund_row record;
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
  for refund_row in
    select ledger.user_id, sum(ledger.amount) as total_refund
    from public.farm_wallet_ledger as ledger
    where ledger.reference_key like 'plot-reduction-041:%'
    group by ledger.user_id
  loop
    if exists (
      select 1 from public.farm_mail as mail
      where mail.recipient_user_id = refund_row.user_id
        and mail.subject like '밭 개편 환불 안내%'
    ) then
      continue;
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
      refund_row.user_id,
      'Farmodoro 운영국',
      'system',
      '밭 개편 환불 안내 · 밭이 3x3으로 개편되며 없어진 칸에 있던 작물 값 ' ||
        refund_row.total_refund || ' Coin을 돌려드렸어요'
    )
    returning id into new_mail_id;

    insert into public.farm_mail_items (
      mail_id, item_order, category, item_id, quantity
    )
    values (
      new_mail_id, 0, 'harvest',
      crop_ids[1 + floor(random() * cardinality(crop_ids))::integer],
      1
    );
  end loop;
end;
$$;
