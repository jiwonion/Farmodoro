-- Coin may become negative when a completion reward is reversed.
-- Farm Money remains nonnegative, and purchases are still guarded by the app.

alter table public.farm_wallets
  drop constraint if exists farm_wallets_coin_nonnegative;

alter table public.farm_wallet_ledger
  drop constraint if exists farm_wallet_ledger_balance_nonnegative;
alter table public.farm_wallet_ledger
  drop constraint if exists farm_wallet_ledger_balance_valid;
alter table public.farm_wallet_ledger
  add constraint farm_wallet_ledger_balance_valid
  check (currency = 'coin' or balance_after >= 0);

create or replace function public.apply_farm_wallet_change(
  p_user_id uuid,
  p_currency text,
  p_amount bigint,
  p_reason text,
  p_reference_key text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_balance bigint;
begin
  if p_currency not in ('coin', 'farm_money') then
    raise exception 'Unsupported currency';
  end if;
  if p_amount = 0 then
    raise exception 'Wallet change cannot be zero';
  end if;
  if char_length(btrim(p_reason)) not between 1 and 80 then
    raise exception 'Wallet reason is invalid';
  end if;

  perform public.ensure_farm_user(p_user_id);

  if p_currency = 'coin' then
    update public.farm_wallets
    set coin_balance = coin_balance + p_amount
    where user_id = p_user_id
    returning coin_balance into new_balance;
  else
    update public.farm_wallets
    set farm_money_balance = farm_money_balance + p_amount
    where user_id = p_user_id
      and farm_money_balance + p_amount >= 0
    returning farm_money_balance into new_balance;

    if p_amount > 0 then
      insert into public.farm_weekly_earnings (
        user_id,
        week_start,
        earned_farm_money
      )
      values (
        p_user_id,
        public.current_farm_week_start(),
        p_amount
      )
      on conflict (user_id, week_start) do update
      set earned_farm_money =
        public.farm_weekly_earnings.earned_farm_money + excluded.earned_farm_money;
    end if;
  end if;

  if new_balance is null then
    raise exception 'Insufficient balance';
  end if;

  insert into public.farm_wallet_ledger (
    user_id,
    currency,
    amount,
    balance_after,
    reason,
    reference_key
  )
  values (
    p_user_id,
    p_currency,
    p_amount,
    new_balance,
    btrim(p_reason),
    p_reference_key
  );

  return new_balance;
end;
$$;

comment on column public.farm_wallets.coin_balance is
  'Current Coin balance; completion reversals may make it negative';
