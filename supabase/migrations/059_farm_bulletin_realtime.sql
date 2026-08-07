begin;

-- The bulletin unread badge only refreshed on a 5-minute poll -- register
-- both tables for realtime so a new post/comment from anyone updates it
-- right away, the same way farm mail's unread badge already does.
do $identity$
declare
  table_name text;
begin
  foreach table_name in array array['farm_bulletin_posts', 'farm_bulletin_comments']
  loop
    execute format('alter table public.%I replica identity full', table_name);
  end loop;
end
$identity$;

do $realtime$
declare
  table_name text;
begin
  foreach table_name in array array['farm_bulletin_posts', 'farm_bulletin_comments']
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

commit;
