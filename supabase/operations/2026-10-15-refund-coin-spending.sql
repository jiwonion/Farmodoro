-- Run the entire script in the Supabase SQL Editor as an administrator.
-- Refund actual Coin spending on 2026-10-15, Asia/Seoul, up to execution time.
-- Task/habit reversals, Farm Money and free growth are not spending refunds.
-- Re-running credits each original debit only once; later same-day debits
-- are eligible on a later run. Does not require migration 095.
begin;

-- Serialize concurrent executions of this operation.
select pg_advisory_xact_lock(hashtextextended('farmodoro:coin-spend-refund:2026-10-15', 0));

with targets as materialized (
  select l.id, l.user_id, (-l.amount::numeric)::bigint as refund_coin,
    'coin-spend-refund:ledger:' || l.id as refund_key
  from public.farm_wallet_ledger l
  join public.farm_wallets w on w.user_id = l.user_id
  where l.currency = 'coin'
    and l.amount < 0
    and l.created_at >= timestamptz '2026-10-15 00:00:00+09'
    and l.created_at < least(timestamptz '2026-10-16 00:00:00+09', transaction_timestamp())
    and (
      split_part(l.reference_key, ':', 1) in (
        'seed', 'plant-seed', 'plot-grow', 'scenery-grow',
        'farm-v3-grow', 'farm_mail_purchase'
      )
      or l.reason in (
        '씨앗 구매', '씨앗 구매 후 심기', '작물 성장',
        '내 풍경 성장', '농장·낚시 Coin 사용', '농장 우편 구매'
      )
    )
    and not exists (
      select 1 from public.farm_wallet_idempotency i
      where i.user_id = l.user_id and i.currency = 'coin'
        and i.reference_key = 'coin-spend-refund:ledger:' || l.id
    )
  order by w.user_id, l.id
  for update of w
), reserved as (
  insert into public.farm_wallet_idempotency (user_id, currency, reference_key)
  select user_id, 'coin', refund_key from targets
  on conflict do nothing
  returning user_id, reference_key
), refunds as (
  select t.user_id, sum(t.refund_coin)::bigint as refund_coin,
    min(t.id) as first_source_ledger_id, count(*) as debit_count
  from targets t
  join reserved r on r.user_id = t.user_id and r.reference_key = t.refund_key
  group by t.user_id
), credited as (
  update public.farm_wallets w
  set coin_balance = w.coin_balance + r.refund_coin
  from refunds r
  where w.user_id = r.user_id
  returning w.user_id, w.coin_balance, r.refund_coin,
    r.first_source_ledger_id, r.debit_count
), audited as (
  insert into public.farm_wallet_ledger (
    user_id, currency, amount, balance_after, reason, reference_key
  )
  select user_id, 'coin', refund_coin, coin_balance,
    '2026-10-15 Coin 사용 환불',
    'coin-spend-refund-batch:2026-10-15:' || first_source_ledger_id
  from credited
  returning user_id, amount, balance_after
)
select count(*) as refunded_users,
  coalesce(sum(amount), 0) as refunded_coin,
  coalesce((select sum(debit_count) from credited), 0) as refunded_transactions,
  coalesce(jsonb_agg(jsonb_build_object(
    'userId', user_id, 'refundedCoin', amount, 'coinBalance', balance_after
  ) order by user_id), '[]'::jsonb) as details
from audited;

commit;
