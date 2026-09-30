-- Let authenticated farmers choose a leaderboard recipient in the mailbox.
-- The return type changes, so recreate the function with its existing grants.
begin;

drop function if exists public.get_farm_leaderboard(date);

create function public.get_farm_leaderboard(p_week_start date default null)
returns table (
  rank_position bigint,
  display_name text,
  avatar_url text,
  farm_name text,
  earned_farm_money bigint,
  is_me boolean,
  equipped_label_effect text,
  farm_code text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    row_number() over (
      order by earnings.earned_farm_money desc, earnings.updated_at, earnings.user_id
    ) as rank_position,
    profiles.display_name,
    profiles.avatar_url,
    farms.farm_name,
    earnings.earned_farm_money,
    earnings.user_id = auth.uid() as is_me,
    farms.equipped_label_effect,
    profiles.farm_code
  from public.farm_weekly_earnings as earnings
  join public.profiles as profiles on profiles.id = earnings.user_id
  join public.farms as farms on farms.user_id = earnings.user_id
  where earnings.week_start = coalesce(p_week_start, public.current_farm_week_start())
  order by rank_position
  limit 100;
$$;

revoke all on function public.get_farm_leaderboard(date) from public, anon;
grant execute on function public.get_farm_leaderboard(date) to authenticated;

commit;
