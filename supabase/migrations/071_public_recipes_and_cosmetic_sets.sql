-- Public recipes and equipped cosmetic sets. Apply with the matching app release.
begin;

insert into public.farm_recipe_catalog (recipe_id, sell_price) values
  ('countryStew', 34),
  ('sunsetSoup', 38),
  ('berryParfait', 60),
  ('berryTart', 46),
  ('mushroomRice', 44),
  ('pumpkinSoup', 50),
  ('appleJam', 74),
  ('gardenSalad', 54),
  ('ratatouille', 62),
  ('farmPizza', 66),
  ('friedRice', 60),
  ('tropicalPunch', 94),
  ('cornChowder', 58),
  ('gazpacho', 56),
  ('beetAppleJuice', 62),
  ('broccoliMushroom', 46),
  ('cabbageRiceRoll', 44),
  ('applePie', 70),
  ('blueberryCake', 90),
  ('grapePeachPunch', 76),
  ('pumpkinPorridge', 52),
  ('spicyPeanut', 50),
  ('carrotOrangeJuice', 60),
  ('pearKiwiSmoothie', 82),
  ('watermelonBerryPunch', 72),
  ('barleyMushroomPilaf', 60),
  ('oatBlueberryPorridge', 66),
  ('kabochaCurry', 48),
  ('bokchoyStirFry', 36),
  ('edamameSalad', 38),
  ('chestnutRiceCake', 58),
  ('figCheesePlatter', 76),
  ('plumSorbet', 68),
  ('mangoSticky', 86),
  ('passionYogurt', 78),
  ('bellFlowerNamul', 46),
  ('sweetCornCheeseBake', 52),
  ('truffleRisotto', 96),
  ('lavenderTea', 50),
  ('cherryTart', 74),
  ('sweetPotatoSalad', 62),
  ('rootVegetableSoup', 50),
  ('greenBeanStew', 58)
on conflict (recipe_id) do update set sell_price = excluded.sell_price;

insert into public.farm_recipe_ingredients (recipe_id, crop_id, quantity) values
  ('countryStew', 'carrot', 1),
  ('countryStew', 'potato', 1),
  ('sunsetSoup', 'tomato', 1),
  ('sunsetSoup', 'corn', 1),
  ('berryParfait', 'strawberry', 1),
  ('berryParfait', 'melon', 1),
  ('berryTart', 'wheat', 1),
  ('berryTart', 'strawberry', 1),
  ('mushroomRice', 'rice', 1),
  ('mushroomRice', 'mushroom', 1),
  ('pumpkinSoup', 'pumpkin', 1),
  ('pumpkinSoup', 'onion', 1),
  ('appleJam', 'apple', 1),
  ('appleJam', 'lemon', 1),
  ('gardenSalad', 'cabbage', 1),
  ('gardenSalad', 'carrot', 1),
  ('gardenSalad', 'cucumber', 1),
  ('ratatouille', 'eggplant', 1),
  ('ratatouille', 'tomato', 1),
  ('ratatouille', 'pepper', 1),
  ('farmPizza', 'wheat', 1),
  ('farmPizza', 'tomato', 1),
  ('farmPizza', 'corn', 1),
  ('friedRice', 'rice', 1),
  ('friedRice', 'pepper', 1),
  ('friedRice', 'pea', 1),
  ('tropicalPunch', 'pineapple', 1),
  ('tropicalPunch', 'orange', 1),
  ('tropicalPunch', 'kiwi', 1),
  ('cornChowder', 'corn', 1),
  ('cornChowder', 'potato', 1),
  ('cornChowder', 'onion', 1),
  ('gazpacho', 'tomato', 1),
  ('gazpacho', 'cucumber', 1),
  ('gazpacho', 'pepper', 1),
  ('beetAppleJuice', 'beet', 1),
  ('beetAppleJuice', 'apple', 1),
  ('broccoliMushroom', 'broccoli', 1),
  ('broccoliMushroom', 'mushroom', 1),
  ('cabbageRiceRoll', 'cabbage', 1),
  ('cabbageRiceRoll', 'rice', 1),
  ('applePie', 'wheat', 1),
  ('applePie', 'apple', 1),
  ('blueberryCake', 'wheat', 1),
  ('blueberryCake', 'blueberry', 1),
  ('blueberryCake', 'lemon', 1),
  ('grapePeachPunch', 'grape', 1),
  ('grapePeachPunch', 'peach', 1),
  ('pumpkinPorridge', 'pumpkin', 1),
  ('pumpkinPorridge', 'rice', 1),
  ('spicyPeanut', 'peanut', 1),
  ('spicyPeanut', 'chili', 1),
  ('carrotOrangeJuice', 'carrot', 1),
  ('carrotOrangeJuice', 'orange', 1),
  ('pearKiwiSmoothie', 'pear', 1),
  ('pearKiwiSmoothie', 'kiwi', 1),
  ('watermelonBerryPunch', 'watermelon', 1),
  ('watermelonBerryPunch', 'strawberry', 1),
  ('barleyMushroomPilaf', 'barley', 1),
  ('barleyMushroomPilaf', 'mushroom', 1),
  ('barleyMushroomPilaf', 'onion', 1),
  ('oatBlueberryPorridge', 'oat', 1),
  ('oatBlueberryPorridge', 'blueberry', 1),
  ('kabochaCurry', 'pumpkinSquash', 1),
  ('kabochaCurry', 'onion', 1),
  ('bokchoyStirFry', 'bokchoy', 1),
  ('bokchoyStirFry', 'garlic', 1),
  ('edamameSalad', 'edamame', 1),
  ('edamameSalad', 'cucumber', 1),
  ('chestnutRiceCake', 'chestnut', 1),
  ('chestnutRiceCake', 'rice', 1),
  ('figCheesePlatter', 'fig', 1),
  ('figCheesePlatter', 'raspberry', 1),
  ('plumSorbet', 'plum', 1),
  ('plumSorbet', 'lemon', 1),
  ('mangoSticky', 'mango', 1),
  ('mangoSticky', 'sweetCorn', 1),
  ('passionYogurt', 'passionFruit', 1),
  ('passionYogurt', 'blueberry', 1),
  ('bellFlowerNamul', 'bellFlower', 1),
  ('bellFlowerNamul', 'spinach', 1),
  ('sweetCornCheeseBake', 'sweetCorn', 1),
  ('sweetCornCheeseBake', 'pepper', 1),
  ('truffleRisotto', 'truffle', 1),
  ('truffleRisotto', 'rice', 1),
  ('truffleRisotto', 'mushroom', 1),
  ('lavenderTea', 'lavender', 1),
  ('lavenderTea', 'oat', 1),
  ('cherryTart', 'cherry', 1),
  ('cherryTart', 'wheat', 1),
  ('sweetPotatoSalad', 'sweetPotato', 1),
  ('sweetPotatoSalad', 'sunflower', 1),
  ('sweetPotatoSalad', 'lettuce', 1),
  ('rootVegetableSoup', 'radish', 1),
  ('rootVegetableSoup', 'turnip', 1),
  ('rootVegetableSoup', 'daikon', 1),
  ('greenBeanStew', 'kale', 1),
  ('greenBeanStew', 'celery', 1),
  ('greenBeanStew', 'bean', 1)
on conflict (recipe_id, crop_id) do update set quantity = excluded.quantity;

insert into public.farm_cosmetic_catalog (cosmetic_type, cosmetic_id, price) values
  ('farm_theme', 'volcano', 2000),
  ('farm_theme', 'iceKingdom', 2000),
  ('farm_theme', 'goldenHarvest', 2000),
  ('label_effect', 'iceCrystal', 1200),
  ('label_effect', 'candyRibbon', 1200),
  ('label_effect', 'pumpkinLantern', 1200),
  ('label_effect', 'pearlShell', 1200)
on conflict (cosmetic_type, cosmetic_id) do update set price = excluded.price;

create table if not exists public.farm_cosmetic_sets (
  set_id text primary key,
  effect text not null check (effect in ('water', 'wilt'))
);
create table if not exists public.farm_cosmetic_set_members (
  cosmetic_type text not null,
  cosmetic_id text not null,
  set_id text not null references public.farm_cosmetic_sets(set_id),
  primary key (cosmetic_type, cosmetic_id),
  foreign key (cosmetic_type, cosmetic_id) references public.farm_cosmetic_catalog(cosmetic_type, cosmetic_id)
);
alter table public.farm_cosmetic_sets enable row level security;
alter table public.farm_cosmetic_set_members enable row level security;
revoke all on public.farm_cosmetic_sets, public.farm_cosmetic_set_members from public, anon, authenticated;
grant select on public.farm_cosmetic_sets, public.farm_cosmetic_set_members to authenticated;
create policy "Read cosmetic sets" on public.farm_cosmetic_sets for select to authenticated using (true);
create policy "Read cosmetic set members" on public.farm_cosmetic_set_members for select to authenticated using (true);

insert into public.farm_cosmetic_sets (set_id, effect) values
  ('cherry', 'wilt'),
  ('frost', 'wilt'),
  ('valentine', 'wilt'),
  ('candy', 'water'),
  ('galaxy', 'water'),
  ('halloween', 'wilt'),
  ('snow', 'wilt'),
  ('ocean', 'water'),
  ('volcano', 'water'),
  ('rainbow', 'water'),
  ('golden', 'water'),
  ('garden', 'wilt')
on conflict (set_id) do update set effect = excluded.effect;

insert into public.farm_cosmetic_set_members (cosmetic_type, cosmetic_id, set_id) values
  ('farm_theme', 'cherryBlossom', 'cherry'),
  ('plot_skin', 'cherryPetalFall', 'cherry'),
  ('label_effect', 'cherryDrift', 'cherry'),
  ('farm_theme', 'iceKingdom', 'frost'),
  ('plot_skin', 'frostbite', 'frost'),
  ('label_effect', 'iceCrystal', 'frost'),
  ('farm_theme', 'valentine', 'valentine'),
  ('plot_skin', 'chocolate', 'valentine'),
  ('label_effect', 'heartPop', 'valentine'),
  ('farm_theme', 'whiteDay', 'candy'),
  ('plot_skin', 'candy', 'candy'),
  ('label_effect', 'candyRibbon', 'candy'),
  ('farm_theme', 'galaxyNight', 'galaxy'),
  ('plot_skin', 'starCandy', 'galaxy'),
  ('label_effect', 'starAurora', 'galaxy'),
  ('label_effect', 'galaxySparkle', 'galaxy'),
  ('farm_theme', 'halloween', 'halloween'),
  ('plot_skin', 'mapleLeaf', 'halloween'),
  ('label_effect', 'pumpkinLantern', 'halloween'),
  ('farm_theme', 'christmas', 'snow'),
  ('plot_skin', 'snowField', 'snow'),
  ('label_effect', 'snowSparkle', 'snow'),
  ('farm_theme', 'ocean', 'ocean'),
  ('plot_skin', 'sandDune', 'ocean'),
  ('label_effect', 'pearlShell', 'ocean'),
  ('farm_theme', 'volcano', 'volcano'),
  ('plot_skin', 'lava', 'volcano'),
  ('label_effect', 'flameBorder', 'volcano'),
  ('farm_theme', 'bubbleField', 'rainbow'),
  ('plot_skin', 'rainbow', 'rainbow'),
  ('label_effect', 'rainbowGradient', 'rainbow'),
  ('label_effect', 'confetti', 'rainbow'),
  ('farm_theme', 'goldenHarvest', 'golden'),
  ('plot_skin', 'golden', 'golden'),
  ('label_effect', 'goldenSparkle', 'golden'),
  ('farm_theme', 'springMeadow', 'garden'),
  ('plot_skin', 'lavenderField', 'garden'),
  ('label_effect', 'butterflyFlutter', 'garden')
on conflict (cosmetic_type, cosmetic_id) do update set set_id = excluded.set_id;

-- Each equipped slot counts once; owned but unequipped items do not count.
create or replace function public.farm_set_bonus_percent(p_user_id uuid, p_effect text)
returns integer
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(case equipped_count when 1 then 1 when 2 then 5 when 3 then 10 else 0 end), 0)::integer
  from (
    select members.set_id, count(*) as equipped_count
    from public.farms as farm
    cross join lateral (values
      ('farm_theme', farm.equipped_farm_theme),
      ('plot_skin', farm.equipped_plot_skin),
      ('label_effect', farm.equipped_label_effect)
    ) as equipped(cosmetic_type, cosmetic_id)
    join public.farm_cosmetics as owned on owned.user_id = farm.user_id
      and owned.cosmetic_type = equipped.cosmetic_type and owned.cosmetic_id = equipped.cosmetic_id
    join public.farm_cosmetic_set_members as members on members.cosmetic_type = equipped.cosmetic_type and members.cosmetic_id = equipped.cosmetic_id
    join public.farm_cosmetic_sets as sets on sets.set_id = members.set_id
    where farm.user_id = p_user_id and sets.effect = p_effect
    group by members.set_id
  ) as bonuses;
$$;
revoke all on function public.farm_set_bonus_percent(uuid, text) from public, anon, authenticated;

create or replace function public.water_farm_plot(
  p_plot_index smallint,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  cached_result jsonb;
  plot_row public.farm_plots%rowtype;
  max_growth smallint;
  growth_amount smallint;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  perform public.ensure_farm_user(current_user_id);

  cached_result := public.farm_action_begin(current_user_id, p_request_id, 'water_farm_plot');
  if cached_result is not null then return cached_result; end if;

  select * into plot_row from public.farm_plots
  where user_id = current_user_id and plot_index = p_plot_index
  for update;
  if not found or plot_row.crop_id is null then raise exception 'FARM_PLOT_EMPTY'; end if;
  if plot_row.wilted then raise exception 'FARM_PLOT_WILTED'; end if;
  max_growth := public.farm_plot_max_growth(plot_row.crop_id);
  if plot_row.growth >= max_growth then raise exception 'FARM_PLOT_NOT_READY'; end if;
  if plot_row.last_free_water_at is not null
     and plot_row.last_free_water_at > now() - interval '5 hours' * (1 - public.farm_set_bonus_percent(current_user_id, 'water') / 100.0) then
    raise exception 'FARM_WATER_COOLDOWN';
  end if;

  growth_amount := case
    when plot_row.fertilizer_id in ('moistureFertilizer', 'premiumFertilizer') then 2
    else 1
  end;

  update public.farm_plots
  set growth = least(max_growth, growth + growth_amount),
      last_watered_on = (now() at time zone 'Asia/Seoul')::date,
      last_cared_at = now(),
      last_free_water_at = now()
  where user_id = current_user_id and plot_index = p_plot_index
  returning * into plot_row;

  return public.farm_action_finish(current_user_id, p_request_id, jsonb_build_object(
    'plots', jsonb_build_array(public.farm_plot_json(plot_row))
  ));
end;
$$;

create or replace function public.refresh_farm_wilt(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  protected_until timestamptz;
begin
  select wilt_protection_until into protected_until
  from public.farms where user_id = p_user_id;

  if protected_until is not null and protected_until > now() then
    return;
  end if;

  update public.farm_plots
  set wilted = true
  where user_id = p_user_id
    and crop_id is not null
    and wilted = false
    and last_cared_at is not null
    and last_cared_at <= now() - interval '24 hours' * (1 + public.farm_set_bonus_percent(p_user_id, 'wilt') / 100.0);
end;
$$;

create or replace function public.cook_farm_recipe(
  p_crop_ids text[],
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  cached_result jsonb;
  ingredient_count integer := coalesce(array_length(p_crop_ids, 1), 0);
  ingredient_row record;
  matched_recipe_id text;
  new_food_quantity integer;
  inventory_updates jsonb := '[]'::jsonb;
  current_quantity integer;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  perform public.ensure_farm_user(current_user_id);

  cached_result := public.farm_action_begin(current_user_id, p_request_id, 'cook_farm_recipe');
  if cached_result is not null then return cached_result; end if;

  if ingredient_count < 2 or ingredient_count > 3 then
    raise exception 'FARM_INVALID_INGREDIENTS';
  end if;

  for ingredient_row in
    select x as crop_id, count(*)::integer as qty from unnest(p_crop_ids) as x group by x
  loop
    if not exists (
      select 1 from public.farm_crop_catalog where crop_id = ingredient_row.crop_id
    ) then
      raise exception 'FARM_UNKNOWN_CROP';
    end if;
    current_quantity := public.apply_farm_inventory_delta(
      current_user_id, 'harvest', ingredient_row.crop_id, -ingredient_row.qty
    );
    inventory_updates := inventory_updates || jsonb_build_array(jsonb_build_object(
      'category', 'harvest', 'itemId', ingredient_row.crop_id, 'quantity', current_quantity
    ));
  end loop;

  select r.recipe_id into matched_recipe_id
  from public.farm_recipe_catalog as r
  where (
    select array_agg(i.crop_id order by i.crop_id)
    from public.farm_recipe_ingredients as i
    cross join lateral generate_series(1, i.quantity) as units
    where i.recipe_id = r.recipe_id
  ) = (
    select array_agg(x order by x) from unnest(p_crop_ids) as x
  );

  if matched_recipe_id is null then
    return public.farm_action_finish(current_user_id, p_request_id, jsonb_build_object(
      'inventory', inventory_updates,
      'event', jsonb_build_object('matched', false)
    ));
  end if;

  new_food_quantity := public.apply_farm_inventory_delta(current_user_id, 'food', matched_recipe_id, 1);
  inventory_updates := inventory_updates || jsonb_build_array(jsonb_build_object(
    'category', 'food', 'itemId', matched_recipe_id, 'quantity', new_food_quantity
  ));

  return public.farm_action_finish(current_user_id, p_request_id, jsonb_build_object(
    'inventory', inventory_updates,
    'event', jsonb_build_object(
      'matched', true, 'recipeId', matched_recipe_id
    )
  ));
end;
$$;

revoke all on function public.water_farm_plot(smallint, uuid) from public, anon;
grant execute on function public.water_farm_plot(smallint, uuid) to authenticated;
revoke all on function public.refresh_farm_wilt(uuid) from public, anon, authenticated;
revoke all on function public.cook_farm_recipe(text[], uuid) from public, anon;
grant execute on function public.cook_farm_recipe(text[], uuid) to authenticated;

-- Legacy discovery rows are retained for old state RPC compatibility only.
-- Cooking no longer reads or writes them; the current client has no discovery state.
update public.farm_catalog_meta set catalog_version = catalog_version + 1 where id = true;
commit;
