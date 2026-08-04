-- farms.equipped_farm_theme / equipped_plot_skin / equipped_label_effect hold
-- plain text ids, not references into farm_cosmetics, so deleting an
-- ownership row left the cosmetic equipped: it kept rendering on the farm
-- (and, for label effects, on everyone else's ranking board) while the owned
-- list had nothing left to unequip it with.
--
-- Clearing the slot on delete keeps the two in step. The client also refuses
-- to apply an equipped id it does not own, so an already-broken farm repairs
-- itself on the next load even before this migration runs.

create or replace function public.clear_unowned_farm_cosmetic()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.farms
  set
    equipped_farm_theme = case
      when old.cosmetic_type = 'farm_theme' and equipped_farm_theme = old.cosmetic_id
        then null else equipped_farm_theme end,
    equipped_plot_skin = case
      when old.cosmetic_type = 'plot_skin' and equipped_plot_skin = old.cosmetic_id
        then null else equipped_plot_skin end,
    equipped_label_effect = case
      when old.cosmetic_type = 'label_effect' and equipped_label_effect = old.cosmetic_id
        then null else equipped_label_effect end
  where user_id = old.user_id;

  return old;
end;
$$;

drop trigger if exists farm_cosmetics_clear_equipped on public.farm_cosmetics;
create trigger farm_cosmetics_clear_equipped
  after delete on public.farm_cosmetics
  for each row
  execute function public.clear_unowned_farm_cosmetic();

-- Repair rows that already lost their ownership before the trigger existed.
update public.farms as f
set
  equipped_farm_theme = case
    when f.equipped_farm_theme is not null and not exists (
      select 1 from public.farm_cosmetics as c
      where c.user_id = f.user_id
        and c.cosmetic_type = 'farm_theme'
        and c.cosmetic_id = f.equipped_farm_theme
    ) then null else f.equipped_farm_theme end,
  equipped_plot_skin = case
    when f.equipped_plot_skin is not null and not exists (
      select 1 from public.farm_cosmetics as c
      where c.user_id = f.user_id
        and c.cosmetic_type = 'plot_skin'
        and c.cosmetic_id = f.equipped_plot_skin
    ) then null else f.equipped_plot_skin end,
  equipped_label_effect = case
    when f.equipped_label_effect is not null and not exists (
      select 1 from public.farm_cosmetics as c
      where c.user_id = f.user_id
        and c.cosmetic_type = 'label_effect'
        and c.cosmetic_id = f.equipped_label_effect
    ) then null else f.equipped_label_effect end
where f.equipped_farm_theme is not null
   or f.equipped_plot_skin is not null
   or f.equipped_label_effect is not null;
