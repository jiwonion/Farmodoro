begin;

-- Permanent unlocks take six completions at the current 50 Farm Money reward.
-- Also upgrades installations that used the original 100 Farm Money catalog.
-- Existing ownership, active creations and wallet balances are kept.
update public.farm_scenery_catalog
set unlock_price = 300
where type_id in (
  'blossomTree', 'goldenTree', 'pinkCoral', 'sandcastle',
  'snowRabbit', 'planet', 'roseCrystal', 'floweringCactus'
);

commit;
