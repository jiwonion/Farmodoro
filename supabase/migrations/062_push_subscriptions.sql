begin;

-- Web Push subscription storage. RLS on, no policies -- same "RPC-only"
-- shape as farm_bulletin_comments (058): the client can only reach this
-- table through the two RPCs below, and the send-push/dispatch-scheduled-push
-- Edge Functions read it directly with the service role, which bypasses RLS.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique (endpoint)
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

revoke all on table public.push_subscriptions from anon, authenticated;

create or replace function public.save_my_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text
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
  if nullif(btrim(coalesce(p_endpoint, '')), '') is null then
    raise exception 'Invalid push endpoint';
  end if;
  if nullif(btrim(coalesce(p_p256dh, '')), '') is null
    or nullif(btrim(coalesce(p_auth, '')), '') is null then
    raise exception 'Invalid push keys';
  end if;

  -- An endpoint is a browser-generated, unguessable push-service URL tied to
  -- one device's subscription, not a user-chosen identifier -- so a second
  -- account logging in on the same device and re-subscribing legitimately
  -- transfers ownership here rather than being treated as a hijack attempt.
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (current_user_id, btrim(p_endpoint), btrim(p_p256dh), btrim(p_auth))
  on conflict (endpoint) do update
  set user_id = excluded.user_id,
      p256dh = excluded.p256dh,
      auth = excluded.auth;
end;
$$;

revoke all on function public.save_my_push_subscription(text, text, text) from public, anon;
grant execute on function public.save_my_push_subscription(text, text, text) to authenticated;

create or replace function public.delete_my_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions
  where endpoint = p_endpoint and user_id = auth.uid();
$$;

revoke all on function public.delete_my_push_subscription(text) from public, anon;
grant execute on function public.delete_my_push_subscription(text) to authenticated;

commit;
