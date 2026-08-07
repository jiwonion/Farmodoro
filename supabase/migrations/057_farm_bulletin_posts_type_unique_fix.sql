begin;

-- 056 originally shipped with a column-level "unique(user_id)" (one post
-- per person, any type). It was then edited in place to
-- "unique(user_id, post_type)" so someone could have a buy post and a sell
-- post at once, and create_my_bulletin_post was updated to
-- "on conflict (user_id, post_type)" -- but if 056 had already been applied
-- with the old constraint by the time that edit landed, re-running the
-- edited file was a no-op on the table: `create table if not exists`
-- doesn't pick up column/constraint changes on a table that already
-- exists. The live table kept the old single-post constraint while the
-- function's conflict target no longer matched any unique index on it, so
-- every create_my_bulletin_post call failed with
-- "42P10 no unique or exclusion constraint matching the ON CONFLICT
-- specification" -- posting silently/consistently failed regardless of
-- content. Fix the table itself via ALTER TABLE instead of relying on
-- re-running 056.

alter table public.farm_bulletin_posts
  drop constraint if exists farm_bulletin_posts_user_id_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'farm_bulletin_posts_user_type_unique'
      and conrelid = 'public.farm_bulletin_posts'::regclass
  ) then
    alter table public.farm_bulletin_posts
      add constraint farm_bulletin_posts_user_type_unique unique (user_id, post_type);
  end if;
end $$;

commit;
