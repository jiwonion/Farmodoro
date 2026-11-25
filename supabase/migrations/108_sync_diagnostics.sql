begin;
create table public.sync_diagnostics (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null,
  received_at timestamptz not null default now(),
  event text not null,
  metadata jsonb not null,
  primary key(user_id,event_id)
);
create index sync_diagnostics_user_time_idx on public.sync_diagnostics(user_id,received_at desc);
alter table public.sync_diagnostics enable row level security;
create policy sync_diagnostics_read_own on public.sync_diagnostics for select to authenticated using (user_id=(select auth.uid()));
revoke all on public.sync_diagnostics from public,anon,authenticated;
grant select on public.sync_diagnostics to authenticated;

create function public.log_my_sync_events(p_events jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); item jsonb; meta jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events)>20 or octet_length(p_events::text)>24000 then raise exception 'Invalid diagnostics batch'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,108));
  for item in select * from jsonb_array_elements(p_events) loop
    if (item->>'event') not in ('checkpoint_read_failed','checkpoint_write_failed','checkpoint_recovered',
      'productivity_loaded','productivity_load_failed','productivity_saved','productivity_save_failed',
      'app_ready','realtime_unavailable','realtime_connected','network_online','network_offline','recurrence_save_failed','client_error','unhandled_rejection') then continue; end if;
    select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into meta from jsonb_each(item)
      where key in ('at','deviceId','code','scope','durationMs','count','attempt','online','version')
      and jsonb_typeof(value) in ('string','number','boolean') and length(value::text)<=100;
    insert into public.sync_diagnostics(user_id,event_id,event,metadata)
      values(uid,(item->>'id')::uuid,item->>'event',meta) on conflict do nothing;
  end loop;
  -- Per-user bounded storage; no cron/service key or extra logging service.
  delete from public.sync_diagnostics where user_id=uid and (received_at < now()-interval '14 days'
    or event_id in (select event_id from public.sync_diagnostics where user_id=uid order by received_at desc,event_id offset 500));
end; $$;
revoke all on function public.log_my_sync_events(jsonb) from public,anon;
grant execute on function public.log_my_sync_events(jsonb) to authenticated;
comment on table public.sync_diagnostics is 'Allowlisted sync metadata, max 500 events per account, pruned on upload after 14 days. No task content or credentials.';
commit;
