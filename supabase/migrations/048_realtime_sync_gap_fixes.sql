begin;

-- user_app_state (settings, focus YouTube playlist, background choice, etc.)
-- was never added to the realtime publication, so unlike tasks/habits/farm
-- data it never propagated to other open devices at all -- only a fresh
-- cold-start load ever picked it up.
alter table public.user_app_state replica identity full;

do $realtime$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_app_state'
  ) then
    alter publication supabase_realtime add table public.user_app_state;
  end if;
end
$realtime$;

commit;
