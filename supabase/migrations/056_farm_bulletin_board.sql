begin;

-- Farm bulletin board ("농장 대자보"): a public, self-service classifieds
-- board so players can advertise "사요/팔아요" requests and post their own
-- farm code for others to mail. This never touches the economy directly --
-- it's pure discovery that feeds into the existing send_farm_mail flow, so
-- no new validation surface around prices/inventory is needed.
--
-- One live post per user PER TYPE (new post replaces the old one of that
-- same type via upsert) keeps the board from being spammable while still
-- letting someone advertise a "buy" and a "sell" at the same time, and the
-- whole board resets at 00:00 Asia/Seoul -- the same boundary
-- farm_market_rotations already uses -- rather than a per-post rolling
-- expiry, so it stays in lockstep with the rest of the daily farm cycle.
create table if not exists public.farm_bulletin_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  post_type text not null,
  message text not null,
  post_date date not null,
  created_at timestamptz not null default now(),
  constraint farm_bulletin_posts_type check (post_type in ('buy', 'sell')),
  constraint farm_bulletin_posts_message_length
    check (char_length(btrim(message)) between 1 and 60),
  constraint farm_bulletin_posts_user_type_unique unique (user_id, post_type)
);

create index if not exists farm_bulletin_posts_date_idx
  on public.farm_bulletin_posts (post_date, created_at desc);

alter table public.farm_bulletin_posts enable row level security;

-- No policy is defined on purpose -- this is a cross-user public board, so
-- reads/writes only happen through the security-definer RPCs below (same
-- "RLS on, no policy, RPC-only" shape farm_weekly_earnings already uses for
-- get_farm_leaderboard). The grant is vestigial defense-in-depth, matching
-- that same precedent, since RLS with zero policies denies direct access
-- either way.
revoke all on table public.farm_bulletin_posts from anon, authenticated;
grant select on table public.farm_bulletin_posts to authenticated;

create or replace function public.get_farm_bulletin_posts()
returns table (
  id uuid,
  post_type text,
  message text,
  farm_code text,
  display_name text,
  avatar_url text,
  created_at timestamptz,
  is_mine boolean
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    posts.id,
    posts.post_type,
    posts.message,
    profiles.farm_code,
    profiles.display_name,
    profiles.avatar_url,
    posts.created_at,
    posts.user_id = auth.uid()
  from public.farm_bulletin_posts as posts
  join public.profiles on profiles.id = posts.user_id
  where posts.post_date = (now() at time zone 'Asia/Seoul')::date
  order by posts.created_at desc
  limit 200;
$$;

revoke all on function public.get_farm_bulletin_posts() from public, anon;
grant execute on function public.get_farm_bulletin_posts() to authenticated;

create or replace function public.create_my_bulletin_post(
  p_post_type text,
  p_message text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  trimmed_message text := btrim(coalesce(p_message, ''));
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_post_type not in ('buy', 'sell') then
    raise exception 'Invalid post type';
  end if;
  if char_length(trimmed_message) < 1 or char_length(trimmed_message) > 60 then
    raise exception 'Invalid post message';
  end if;

  perform public.ensure_farm_user(current_user_id);

  insert into public.farm_bulletin_posts (user_id, post_type, message, post_date)
  values (current_user_id, p_post_type, trimmed_message, (now() at time zone 'Asia/Seoul')::date)
  on conflict (user_id, post_type) do update
  set message = excluded.message,
      post_date = excluded.post_date,
      created_at = now();
end;
$$;

revoke all on function public.create_my_bulletin_post(text, text) from public, anon;
grant execute on function public.create_my_bulletin_post(text, text) to authenticated;

create or replace function public.delete_my_bulletin_post(p_post_type text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_post_type not in ('buy', 'sell') then
    raise exception 'Invalid post type';
  end if;
  delete from public.farm_bulletin_posts
  where user_id = auth.uid() and post_type = p_post_type;
end;
$$;

revoke all on function public.delete_my_bulletin_post(text) from public, anon;
grant execute on function public.delete_my_bulletin_post(text) to authenticated;

create or replace function public.cleanup_stale_bulletin_posts()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.farm_bulletin_posts
  where post_date < (now() at time zone 'Asia/Seoul')::date;
$$;

revoke all on function public.cleanup_stale_bulletin_posts() from public, anon, authenticated;

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
  perform public.cleanup_stale_farm_actions();
  perform public.cleanup_stale_bulletin_posts();
end;
$$;

revoke all on function public.run_farm_lifecycle() from public, anon, authenticated;

commit;
