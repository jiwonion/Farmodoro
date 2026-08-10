begin;

-- Notifications that need to fire at a future time (focus/break timer end,
-- watering cooldown) instead of right now (mail/comment, handled by the
-- send-push Edge Function called directly from the client in 062). A user
-- can only ever have one pending row per (kind, subject_key): starting a
-- timer or watering a plot again just moves fire_at forward on the same row
-- instead of piling up duplicates.
create table if not exists public.scheduled_push_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  subject_key text not null default '',
  fire_at timestamptz not null,
  title text not null,
  body text not null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint scheduled_push_notifications_kind_value
    check (kind in ('timer_end', 'plot_water_ready')),
  constraint scheduled_push_notifications_title_length
    check (char_length(title) between 1 and 60),
  constraint scheduled_push_notifications_body_length
    check (char_length(body) between 1 and 120),
  unique (user_id, kind, subject_key)
);

create index if not exists scheduled_push_notifications_due_idx
  on public.scheduled_push_notifications (fire_at)
  where sent_at is null;

alter table public.scheduled_push_notifications enable row level security;

-- Same "RLS on, no policy, RPC-only" shape as push_subscriptions (062) --
-- dispatch-scheduled-push reads/writes this table with the service role.
revoke all on table public.scheduled_push_notifications from anon, authenticated;

create or replace function public.schedule_my_push_notification(
  p_kind text,
  p_subject_key text,
  p_fire_at timestamptz,
  p_title text,
  p_body text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_kind not in ('timer_end', 'plot_water_ready') then
    raise exception 'Unsupported notification kind';
  end if;
  if p_fire_at is null or p_fire_at <= now() then
    raise exception 'Invalid fire time';
  end if;
  if char_length(coalesce(p_title, '')) not between 1 and 60 then
    raise exception 'Invalid notification title';
  end if;
  if char_length(coalesce(p_body, '')) not between 1 and 120 then
    raise exception 'Invalid notification body';
  end if;

  insert into public.scheduled_push_notifications (
    user_id, kind, subject_key, fire_at, title, body
  )
  values (
    current_user_id, p_kind, coalesce(p_subject_key, ''), p_fire_at, p_title, p_body
  )
  on conflict (user_id, kind, subject_key) do update
  set fire_at = excluded.fire_at,
      title = excluded.title,
      body = excluded.body,
      sent_at = null;
end;
$$;

revoke all on function public.schedule_my_push_notification(text, text, timestamptz, text, text)
  from public, anon;
grant execute on function public.schedule_my_push_notification(text, text, timestamptz, text, text)
  to authenticated;

create or replace function public.cancel_my_push_notification(
  p_kind text,
  p_subject_key text
)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.scheduled_push_notifications
  where user_id = auth.uid()
    and kind = p_kind
    and subject_key = coalesce(p_subject_key, '');
$$;

revoke all on function public.cancel_my_push_notification(text, text) from public, anon;
grant execute on function public.cancel_my_push_notification(text, text) to authenticated;

-- pg_cron/pg_net power the minutely dispatch tick. Both are Supabase-managed
-- extensions; if this fails on your instance, enable them from the
-- Dashboard (Database > Extensions) and re-run just this block.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Re-running this migration shouldn't create a second cron job under the
-- same name -- cron.schedule() would just overwrite it, but unscheduling
-- first keeps this block obviously idempotent either way.
select cron.unschedule(jobid)
from cron.job
where jobname = 'dispatch-scheduled-push-notifications';

select cron.schedule(
  'dispatch-scheduled-push-notifications',
  '* * * * *',
  $cron$
  select net.http_post(
    -- The full invoke URL (copied as-is from the deployed function's page in
    -- the Dashboard) is stored whole in Vault, so this SQL never has to
    -- guess or reconstruct Supabase's URL format.
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'dispatch_push_url'),
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_dispatch_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $cron$
);

commit;
