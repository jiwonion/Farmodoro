-- Make wallet mutations with a reference key safe to retry across devices.
create table if not exists public.farm_wallet_idempotency (
  user_id uuid not null references auth.users (id) on delete cascade,
  currency text not null,
  reference_key text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, currency, reference_key),
  constraint farm_wallet_idempotency_currency_value
    check (currency in ('coin', 'farm_money'))
);

alter table public.farm_wallet_idempotency enable row level security;
revoke all on table public.farm_wallet_idempotency from public, anon, authenticated;

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
  reserved_reference boolean := true;
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

  if nullif(btrim(p_reference_key), '') is not null then
    insert into public.farm_wallet_idempotency (user_id, currency, reference_key)
    values (p_user_id, p_currency, btrim(p_reference_key))
    on conflict do nothing;

    if not found then
      select case
        when p_currency = 'coin' then wallets.coin_balance
        else wallets.farm_money_balance
      end
      into new_balance
      from public.farm_wallets as wallets
      where wallets.user_id = p_user_id;
      return new_balance;
    end if;
  end if;

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
      insert into public.farm_weekly_earnings (user_id, week_start, earned_farm_money)
      values (p_user_id, public.current_farm_week_start(), p_amount)
      on conflict (user_id, week_start) do update
      set earned_farm_money =
        public.farm_weekly_earnings.earned_farm_money + excluded.earned_farm_money;
    end if;
  end if;

  if new_balance is null then
    raise exception 'Insufficient balance';
  end if;

  insert into public.farm_wallet_ledger (
    user_id, currency, amount, balance_after, reason, reference_key
  ) values (
    p_user_id, p_currency, p_amount, new_balance, btrim(p_reason), p_reference_key
  );

  return new_balance;
end;
$$;

revoke all on function public.apply_farm_wallet_change(uuid, text, bigint, text, text)
  from public, anon, authenticated;

alter table public.farm_wallets replica identity full;

do $realtime$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'farm_wallets'
  ) then
    alter publication supabase_realtime add table public.farm_wallets;
  end if;
end
$realtime$;
