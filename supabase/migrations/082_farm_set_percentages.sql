begin;

-- All set effects share the tiers shown in cosmetic descriptions:
-- 5% for one owned, equipped theme or field, and 10% for both.
create or replace function public.farm_set_bonus_percent(p_user_id uuid, p_effect text)
returns integer
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(case equipped_count
    when 1 then 5
    when 2 then 10
    else 0
  end), 0)::integer
  from (
    select members.set_id, count(*) as equipped_count
    from public.farms as farm
    cross join lateral (values
      ('farm_theme', farm.equipped_farm_theme),
      ('plot_skin', farm.equipped_plot_skin)
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

commit;
