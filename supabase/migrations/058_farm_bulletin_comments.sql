begin;

-- Comments on bulletin posts. This doesn't add any escrow/trust guarantee
-- to send_farm_mail (there still isn't a simultaneous-exchange mechanism in
-- this game) -- it just gives buyers/sellers a public place to coordinate
-- ("아직 팔아요?", "우편 보냈어요") before or after mailing, so at least
-- there's a visible trail if someone doesn't follow through.
create table if not exists public.farm_bulletin_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.farm_bulletin_posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now(),
  constraint farm_bulletin_comments_message_length
    check (char_length(btrim(message)) between 1 and 80)
);

create index if not exists farm_bulletin_comments_post_idx
  on public.farm_bulletin_comments (post_id, created_at asc);

alter table public.farm_bulletin_comments enable row level security;

-- Same "RLS on, no policy, RPC-only" shape as farm_bulletin_posts (056).
revoke all on table public.farm_bulletin_comments from anon, authenticated;
grant select on table public.farm_bulletin_comments to authenticated;

-- get_farm_bulletin_posts (056) needs a comment_count column added, which
-- changes its return type -- CREATE OR REPLACE can't do that, so drop first.
drop function if exists public.get_farm_bulletin_posts();

create or replace function public.get_farm_bulletin_posts()
returns table (
  id uuid,
  post_type text,
  message text,
  farm_code text,
  display_name text,
  avatar_url text,
  created_at timestamptz,
  is_mine boolean,
  comment_count bigint
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
    posts.user_id = auth.uid(),
    coalesce(comment_counts.comment_count, 0)
  from public.farm_bulletin_posts as posts
  join public.profiles on profiles.id = posts.user_id
  left join (
    select post_id, count(*) as comment_count
    from public.farm_bulletin_comments
    group by post_id
  ) as comment_counts on comment_counts.post_id = posts.id
  where posts.post_date = (now() at time zone 'Asia/Seoul')::date
  order by posts.created_at desc
  limit 200;
$$;

revoke all on function public.get_farm_bulletin_posts() from public, anon;
grant execute on function public.get_farm_bulletin_posts() to authenticated;

create or replace function public.get_farm_bulletin_comments(p_post_id uuid)
returns table (
  id uuid,
  message text,
  farm_code text,
  display_name text,
  created_at timestamptz,
  is_mine boolean
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    comments.id,
    comments.message,
    profiles.farm_code,
    profiles.display_name,
    comments.created_at,
    comments.user_id = auth.uid()
  from public.farm_bulletin_comments as comments
  join public.profiles on profiles.id = comments.user_id
  where comments.post_id = p_post_id
  order by comments.created_at asc
  limit 100;
$$;

revoke all on function public.get_farm_bulletin_comments(uuid) from public, anon;
grant execute on function public.get_farm_bulletin_comments(uuid) to authenticated;

create or replace function public.create_my_bulletin_comment(
  p_post_id uuid,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  trimmed_message text := btrim(coalesce(p_message, ''));
  new_comment_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if char_length(trimmed_message) < 1 or char_length(trimmed_message) > 80 then
    raise exception 'Invalid comment message';
  end if;
  -- Also require post_date = today, not just existence -- otherwise a
  -- comment submitted in the window after midnight but before that stale
  -- post's own cleanup pass would save successfully and then vanish out
  -- from under the user the moment cascade delete catches up to it.
  if not exists (
    select 1 from public.farm_bulletin_posts
    where id = p_post_id
      and post_date = (now() at time zone 'Asia/Seoul')::date
  ) then
    raise exception 'Post not found';
  end if;

  perform public.ensure_farm_user(current_user_id);

  insert into public.farm_bulletin_comments (post_id, user_id, message)
  values (p_post_id, current_user_id, trimmed_message)
  returning id into new_comment_id;

  return new_comment_id;
end;
$$;

revoke all on function public.create_my_bulletin_comment(uuid, text) from public, anon;
grant execute on function public.create_my_bulletin_comment(uuid, text) to authenticated;

create or replace function public.delete_my_bulletin_comment(p_comment_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.farm_bulletin_comments
  where id = p_comment_id and user_id = auth.uid();
$$;

revoke all on function public.delete_my_bulletin_comment(uuid) from public, anon;
grant execute on function public.delete_my_bulletin_comment(uuid) to authenticated;

commit;
