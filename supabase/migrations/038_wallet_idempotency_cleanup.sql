-- farm_wallet_idempotency rows only need to live long enough to catch a
-- near-simultaneous retry or multi-device race (a matter of seconds to
-- minutes in practice). Unlike every other table with this kind of
-- deduplication/audit role in this schema (farm_mail has an hourly expiry
-- cleanup, user_focus_progress.recent_event_ids is hard-capped at 128),
-- this table had no retention policy and would grow forever. Purge rows
-- older than 90 days -- far past any realistic retry window -- on the
-- existing hourly farm-lifecycle job.

create index if not exists farm_wallet_idempotency_created_at_idx
  on public.farm_wallet_idempotency (created_at);

create or replace function public.cleanup_stale_wallet_idempotency()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.farm_wallet_idempotency where created_at < now() - interval '90 days';
$$;

revoke all on function public.cleanup_stale_wallet_idempotency()
  from public, anon, authenticated;

create or replace function public.run_farm_lifecycle()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.finalize_previous_farm_week();
  perform public.cleanup_expired_farm_mail();
  perform public.cleanup_stale_wallet_idempotency();
end;
$$;

revoke all on function public.run_farm_lifecycle() from public, anon, authenticated;
