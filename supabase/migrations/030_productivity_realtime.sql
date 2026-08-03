-- Keep tasks and habits in sync across simultaneously open devices.
alter table public.task_groups replica identity full;
alter table public.tasks replica identity full;
alter table public.habits replica identity full;
alter table public.habit_daily_records replica identity full;

do $realtime$
declare
  table_name text;
begin
  foreach table_name in array array[
    'task_groups',
    'tasks',
    'habits',
    'habit_daily_records'
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
