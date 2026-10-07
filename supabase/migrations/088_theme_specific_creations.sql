begin;

-- Each existing theme gets a distinct free primary creation. Keep the previous
-- types as alternatives so owned variants, active creations and their history
-- retain their original identities. No wallet or ownership rows are changed.
insert into public.farm_scenery_catalog (type_id, name, family, variant, unlock_price, growth_cost, reward) values
  ('cherryTree', '벚꽃나무', 'cherryTree', 0, 0, 20, 50),
  ('goldenWheat', '황금 이삭 무리', 'goldenWheat', 0, 0, 20, 50),
  ('tulipPatch', '튤립 꽃밭', 'tulipPatch', 0, 0, 20, 50),
  ('lavenderPatch', '라벤더 무리', 'lavenderPatch', 0, 0, 20, 50),
  ('heartRose', '하트 장미 덩굴', 'heartRose', 0, 0, 20, 50),
  ('jackOLantern', '잭오랜턴', 'jackOLantern', 0, 0, 20, 50),
  ('christmasTree', '크리스마스 트리', 'christmasTree', 0, 0, 20, 50),
  ('candyBouquet', '사탕 꽃다발', 'candyBouquet', 0, 0, 20, 50),
  ('biscuitTower', '초콜릿 과자 탑', 'biscuitTower', 0, 0, 20, 50),
  ('bubbleFountain', '거품 분수', 'bubbleFountain', 0, 0, 20, 50),
  ('mushroomGarden', '버섯 정원', 'mushroomGarden', 0, 0, 20, 50),
  ('volcanoCrystal', '용암 수정', 'volcanoCrystal', 0, 0, 20, 50),
  ('galaxyPlanet', '작은 행성', 'galaxyPlanet', 0, 0, 20, 50),
  ('auroraCrystal', '오로라 수정', 'auroraCrystal', 0, 0, 20, 50),
  ('moonFlower', '달빛 꽃', 'moonFlower', 0, 0, 20, 50)
on conflict (type_id) do update set
  name = excluded.name, family = excluded.family, variant = excluded.variant,
  unlock_price = excluded.unlock_price, growth_cost = excluded.growth_cost, reward = excluded.reward;

create or replace function public.farm_scenery_allowed_types(p_theme_id text)
returns text[] language sql immutable set search_path = '' as $$
  select case
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
