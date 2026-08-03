-- Realtime coverage for every user-visible farm and focus state domain.
do $identity$
declare
  table_name text;
begin
  foreach table_name in array array[
    'farms',
    'farm_plots',
    'farm_inventory',
    'farm_recipe_discoveries',
    'farm_market_rotations',
    'farm_weekly_earnings',
    'user_focus_timer',
    'user_focus_daily'
  ]
  loop
    execute format('alter table public.%I replica identity full', table_name);
  end loop;
end
$identity$;

do $realtime$
declare
  table_name text;
begin
  foreach table_name in array array[
    'farms',
    'farm_plots',
    'farm_inventory',
    'farm_recipe_discoveries',
    'farm_market_rotations',
    'farm_weekly_earnings',
    'user_focus_timer',
    'user_focus_daily'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end
$realtime$;

drop policy if exists "Users can read their own daily focus" on public.user_focus_daily;
create policy "Users can read their own daily focus"
  on public.user_focus_daily for select to authenticated
  using ((select auth.uid()) = user_id);
grant select on table public.user_focus_daily to authenticated;
