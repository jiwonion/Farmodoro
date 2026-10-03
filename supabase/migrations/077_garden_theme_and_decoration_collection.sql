begin;

-- Keep every previously sold theme and add six new landscapes. Daily Rachel
-- offers remain recommendations; buying a known theme is available year-round.
insert into public.farm_cosmetic_catalog (cosmetic_type, cosmetic_id, price) values
  ('farm_theme', 'peperoDay', 2000), ('farm_theme', 'auroraNight', 2000),
  ('farm_theme', 'lavenderField', 2000), ('farm_theme', 'rainyGarden', 2000),
  ('farm_theme', 'desertOasis', 2000), ('farm_theme', 'moonGarden', 2000)
on conflict (cosmetic_type, cosmetic_id) do update set price = excluded.price;

-- New landscapes are alternate members of the existing sets. Equipping one
-- still occupies just one theme slot; the twelve effects and tiers are unchanged.
insert into public.farm_cosmetic_set_members (cosmetic_type, cosmetic_id, set_id) values
  ('farm_theme', 'peperoDay', 'valentine'),
  ('farm_theme', 'auroraNight', 'galaxy'),
  ('farm_theme', 'moonGarden', 'galaxy'),
  ('farm_theme', 'lavenderField', 'garden'),
  ('farm_theme', 'rainyGarden', 'garden'),
  ('farm_theme', 'desertOasis', 'ocean')
on conflict (cosmetic_type, cosmetic_id) do update set set_id = excluded.set_id;

-- Preserve the purchase signature used by existing clients. The catalog owns
-- the charge; p_price only detects a stale displayed price. A farm row lock
-- serializes two purchase attempts so permanent ownership is charged once.
create or replace function public.purchase_farm_cosmetic(
  p_cosmetic_type text,
  p_cosmetic_id text,
  p_price integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  catalog_price integer;
  new_balance bigint;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if p_cosmetic_type is null or p_cosmetic_type not in ('farm_theme', 'plot_skin', 'label_effect') then
    raise exception 'Unsupported cosmetic type';
  end if;
  select price into catalog_price from public.farm_cosmetic_catalog
    where cosmetic_type = p_cosmetic_type and cosmetic_id = p_cosmetic_id;
  if catalog_price is null then raise exception 'FARM_UNKNOWN_COSMETIC'; end if;
  if p_price is distinct from catalog_price then raise exception 'FARM_COSMETIC_PRICE_CHANGED'; end if;

  perform public.ensure_farm_user(current_user_id);
  perform 1 from public.farms where user_id = current_user_id for update;
  if exists (select 1 from public.farm_cosmetics
    where user_id = current_user_id and cosmetic_type = p_cosmetic_type and cosmetic_id = p_cosmetic_id) then
    raise exception 'Cosmetic already owned';
  end if;

  new_balance := public.apply_farm_wallet_change(current_user_id, 'farm_money',
    -catalog_price::bigint, '레이첼 상점 구매', 'cosmetic:' || p_cosmetic_type || ':' || p_cosmetic_id);
  insert into public.farm_cosmetics (user_id, cosmetic_type, cosmetic_id)
    values (current_user_id, p_cosmetic_type, p_cosmetic_id);
  update public.farms set
    equipped_farm_theme = case when p_cosmetic_type = 'farm_theme' then p_cosmetic_id else equipped_farm_theme end,
    equipped_plot_skin = case when p_cosmetic_type = 'plot_skin' then p_cosmetic_id else equipped_plot_skin end,
    equipped_label_effect = case when p_cosmetic_type = 'label_effect' then p_cosmetic_id else equipped_label_effect end
    where user_id = current_user_id;
  return jsonb_build_object('farmMoneyBalance', new_balance);
end;
$$;
revoke all on function public.purchase_farm_cosmetic(text, text, integer) from public, anon, authenticated;
grant execute on function public.purchase_farm_cosmetic(text, text, integer) to authenticated;

update public.farm_catalog_meta set catalog_version = catalog_version + 1 where id = true;
commit;
