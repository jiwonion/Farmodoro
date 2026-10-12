begin;

insert into public.farm_cosmetic_catalog (cosmetic_type, cosmetic_id, price) values
  ('farm_theme', 'space', 2000),
  ('farm_theme', 'tuxedoCat', 2000)
on conflict (cosmetic_type, cosmetic_id) do update set price = excluded.price;

-- The space tree and tuxedo cat use the same growth cost and reward as existing
-- scenery. Buying a theme does not grant progress or change ongoing creations.
insert into public.farm_scenery_catalog (type_id, name, family, variant, unlock_price, growth_cost, reward) values
  ('spaceTree', '우주 나무', 'spaceTree', 0, 0, 20, 50),
  ('tuxedoCat', '턱시도 고양이', 'tuxedoCat', 0, 0, 20, 50)
on conflict (type_id) do update set
  name = excluded.name, family = excluded.family, variant = excluded.variant,
  unlock_price = excluded.unlock_price, growth_cost = excluded.growth_cost, reward = excluded.reward;

create or replace function public.farm_scenery_allowed_types(p_theme_id text)
returns text[] language sql immutable set search_path = '' as $$
  select case
    when p_theme_id = 'space' then array['spaceTree', 'star', 'planet']
    when p_theme_id = 'tuxedoCat' then array['tuxedoCat']
    when p_theme_id = 'cherryBlossom' then array['cherryTree', 'tree', 'blossomTree', 'goldenTree']
    when p_theme_id = 'goldenHarvest' then array['goldenWheat', 'tree', 'blossomTree', 'goldenTree']
    when p_theme_id = 'springMeadow' then array['tulipPatch', 'tree', 'blossomTree', 'goldenTree']
    when p_theme_id = 'lavenderField' then array['lavenderPatch', 'tree', 'blossomTree', 'goldenTree']
    when p_theme_id = 'valentine' then array['heartRose', 'tree', 'blossomTree', 'goldenTree']
    when p_theme_id = 'halloween' then array['jackOLantern', 'tree', 'blossomTree', 'goldenTree']
    when p_theme_id = 'christmas' then array['christmasTree', 'snowman', 'snowRabbit']
    when p_theme_id = 'whiteDay' then array['candyBouquet', 'tree', 'blossomTree', 'goldenTree']
    when p_theme_id = 'peperoDay' then array['biscuitTower', 'tree', 'blossomTree', 'goldenTree']
    when p_theme_id = 'bubbleField' then array['bubbleFountain', 'coral', 'pinkCoral', 'sandcastle']
    when p_theme_id = 'rainyGarden' then array['mushroomGarden', 'tree', 'blossomTree', 'goldenTree']
    when p_theme_id = 'volcano' then array['volcanoCrystal', 'crystal', 'roseCrystal']
    when p_theme_id = 'galaxyNight' then array['galaxyPlanet', 'star', 'planet']
    when p_theme_id = 'auroraNight' then array['auroraCrystal', 'crystal', 'roseCrystal']
    when p_theme_id = 'moonGarden' then array['moonFlower', 'star', 'planet']
    when p_theme_id = 'ocean' then array['coral', 'pinkCoral', 'sandcastle']
    when p_theme_id = 'iceKingdom' then array['snowman', 'snowRabbit']
    when p_theme_id = 'desertOasis' then array['cactus', 'floweringCactus']
    else array['tree', 'blossomTree', 'goldenTree']
  end;
$$;
revoke all on function public.farm_scenery_allowed_types(text) from public, anon, authenticated;

commit;
