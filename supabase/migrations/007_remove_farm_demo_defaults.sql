-- Replace the original development wallet seed with a clean service default.
-- Existing wallets are reset only when no economy activity has ever been recorded.

alter table public.farm_wallets
  alter column coin_balance set default 0,
  alter column farm_money_balance set default 0;

update public.farm_wallets as wallets
set coin_balance = 0,
    farm_money_balance = 0
where wallets.coin_balance = 999
  and wallets.farm_money_balance = 999
  and not exists (
    select 1
    from public.farm_wallet_ledger as ledger
    where ledger.user_id = wallets.user_id
  )
  and not exists (
    select 1
    from public.farm_inventory as inventory
    where inventory.user_id = wallets.user_id
      and inventory.quantity > 0
  )
  and not exists (
    select 1
    from public.farm_plots as plots
    where plots.user_id = wallets.user_id
      and plots.crop_id is not null
  );

comment on column public.farm_wallets.coin_balance
  is 'Current Coin balance; new accounts start at zero';
comment on column public.farm_wallets.farm_money_balance
  is 'Current Farm Money balance; new accounts start at zero';
