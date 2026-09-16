-- Retire bulletin access, preserving historical posts/comments for recovery.
-- Deploy together with the client and send-push function that remove bulletin UI/events.
begin;

do $$
declare
  target record;
begin
  for target in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like '%bulletin%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', target.signature);
  end loop;

  for target in
    select tablename from pg_tables
    where schemaname = 'public'
      and tablename in ('farm_bulletin_posts', 'farm_bulletin_comments')
  loop
    execute format('revoke all on table public.%I from public, anon, authenticated', target.tablename);
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
        and tablename = target.tablename
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', target.tablename);
    end if;
  end loop;
end $$;

commit;
