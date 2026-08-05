begin;

-- apply_farm_inventory_delta (051) only checked `next_quantity < 0` AFTER
-- already trying to write it, via `insert ... on conflict do update
-- ... returning`. That write hits farm_inventory's own
-- farm_inventory_quantity_nonnegative check constraint before the
-- function's own "if next_quantity < 0" guard ever runs, so any intent RPC
-- that would overdraw inventory (planting a seed you're actually out of,
-- buying a supply item past what you can afford to hold, etc.) failed with
-- a raw Postgres check-violation (23514) instead of the friendly
-- FARM_ITEM_OUT_OF_STOCK sentinel the client already maps to "보유 수량이
-- 부족해." -- runFarmAction's catch just showed the generic fallback
-- message and reverted, which read as planting silently doing nothing.
--
-- Fix: read (and lock) the current quantity first, validate the delta
-- against it, and only write once it's known to be safe -- the same
-- validate-then-write order every other intent RPC in 052 already follows.
create or replace function public.apply_farm_inventory_delta(
  p_user_id uuid,
  p_category text,
  p_item_id text,
  p_delta integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_quantity integer;
  next_quantity integer;
begin
  select quantity into current_quantity
  from public.farm_inventory
  where user_id = p_user_id and category = p_category and item_id = p_item_id
  for update;

  next_quantity := coalesce(current_quantity, 0) + p_delta;

  if next_quantity < 0 then
    raise exception 'FARM_ITEM_OUT_OF_STOCK';
  end if;

  if next_quantity > 100000 then
    next_quantity := 100000;
  end if;

  insert into public.farm_inventory (user_id, category, item_id, quantity)
  values (p_user_id, p_category, p_item_id, next_quantity)
  on conflict (user_id, category, item_id) do update
  set quantity = excluded.quantity;

  return next_quantity;
end;
$$;

revoke all on function public.apply_farm_inventory_delta(uuid, text, text, integer)
  from public, anon, authenticated;

commit;
