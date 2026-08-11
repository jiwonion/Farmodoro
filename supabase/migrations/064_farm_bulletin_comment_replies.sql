begin;

-- One level of replies on bulletin comments. A reply's parent must itself be
-- a top-level comment (enforced in create_my_bulletin_comment below) --
-- no reply-to-a-reply threads, keeping the UI a flat "comment + its replies"
-- list instead of arbitrary nesting.
alter table public.farm_bulletin_comments
  add column if not exists parent_comment_id uuid
  references public.farm_bulletin_comments (id) on delete cascade;

create index if not exists farm_bulletin_comments_parent_idx
  on public.farm_bulletin_comments (parent_comment_id)
  where parent_comment_id is not null;

-- Adding a return column changes get_farm_bulletin_comments' row type, which
-- create or replace can't do -- drop first, same as 058 did for
-- get_farm_bulletin_posts when its comment_count column was added.
drop function if exists public.get_farm_bulletin_comments(uuid);

create or replace function public.get_farm_bulletin_comments(p_post_id uuid)
returns table (
  id uuid,
  message text,
  farm_code text,
  display_name text,
  created_at timestamptz,
  is_mine boolean,
  parent_comment_id uuid
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
    comments.user_id = auth.uid(),
    comments.parent_comment_id
  from public.farm_bulletin_comments as comments
  join public.profiles on profiles.id = comments.user_id
  where comments.post_id = p_post_id
  order by comments.created_at asc
  limit 100;
$$;

revoke all on function public.get_farm_bulletin_comments(uuid) from public, anon;
grant execute on function public.get_farm_bulletin_comments(uuid) to authenticated;

-- Return type (uuid) is unchanged, but a new parameter means a new distinct
-- overload as far as Postgres is concerned -- drop the old 2-arg signature
-- first so calls can't ambiguously (or silently) resolve to it instead of
-- the 3-arg version below, same as send_farm_mail's pattern in 060/061.
drop function if exists public.create_my_bulletin_comment(uuid, text);

create or replace function public.create_my_bulletin_comment(
  p_post_id uuid,
  p_message text,
  p_parent_comment_id uuid default null
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
  if not exists (
    select 1 from public.farm_bulletin_posts
    where id = p_post_id
      and post_date = (now() at time zone 'Asia/Seoul')::date
  ) then
    raise exception 'Post not found';
  end if;

  if p_parent_comment_id is not null and not exists (
    select 1 from public.farm_bulletin_comments
    where id = p_parent_comment_id
      and post_id = p_post_id
      and parent_comment_id is null
  ) then
    raise exception 'Invalid reply target';
  end if;

  perform public.ensure_farm_user(current_user_id);

  insert into public.farm_bulletin_comments (post_id, user_id, message, parent_comment_id)
  values (p_post_id, current_user_id, trimmed_message, p_parent_comment_id)
  returning id into new_comment_id;

  return new_comment_id;
end;
$$;

revoke all on function public.create_my_bulletin_comment(uuid, text, uuid) from public, anon;
grant execute on function public.create_my_bulletin_comment(uuid, text, uuid) to authenticated;

commit;
