begin;

create or replace function public.get_my_farm_wallet()
returns table (coin_balance bigint, farm_money_balance bigint)
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

  perform public.ensure_farm_user(current_user_id);

  return query
  select wallets.coin_balance, wallets.farm_money_balance
  from public.farm_wallets as wallets
  where wallets.user_id = current_user_id;
end;
$$;

create or replace function public.change_my_farm_wallet(
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
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  return public.apply_farm_wallet_change(
    current_user_id,
    p_currency,
    p_amount,
    p_reason,
    p_reference_key
  );
end;
$$;

revoke all on function public.change_my_farm_wallet(text, bigint, text, text)
  from public, anon;
revoke all on function public.get_my_farm_wallet() from public, anon;
grant execute on function public.change_my_farm_wallet(text, bigint, text, text)
  to authenticated;
grant execute on function public.get_my_farm_wallet() to authenticated;

comment on function public.change_my_farm_wallet(text, bigint, text, text) is
  'Applies an authenticated user wallet change and records it in the wallet ledger';
comment on function public.get_my_farm_wallet() is
  'Returns the authenticated user Coin and Farm Money balances';

commit;
