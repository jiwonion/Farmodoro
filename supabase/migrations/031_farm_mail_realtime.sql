-- Broadcast incoming and claimed farm mail changes to the recipient's other devices.
alter table public.farm_mail replica identity full;
alter table public.farm_mail_items replica identity full;

do $realtime$
declare
  table_name text;
begin
  foreach table_name in array array['farm_mail', 'farm_mail_items']
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
