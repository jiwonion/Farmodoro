begin;

-- user_app_state is one JSON blob per user, written wholesale on every save.
-- Of its 6 keys, only 4 are real: tutorialCompleted, settings, and the
-- YouTube playlists (focusYoutubePlaylists/focusYoutubeUrl). The other two
-- (schemaVersion, focusRewardSeconds) were already stripped from the save
-- payload client-side. This migration gives the 4 real ones their own
-- tables so a save can never again clobber the whole document -- renaming a
-- playlist can no longer touch tutorialCompleted, and vice versa.

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  tutorial_completed boolean not null default false,
  linked_focus_minutes smallint not null default 25
    check (linked_focus_minutes between 5 and 120),
  linked_break_enabled boolean not null default true,
  linked_break_minutes smallint not null default 5
    check (linked_break_minutes between 1 and 60),
  quick_focus_minutes smallint not null default 25
    check (quick_focus_minutes between 5 and 120),
  quick_break_enabled boolean not null default true,
  quick_break_minutes smallint not null default 5
    check (quick_break_minutes between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists user_preferences_set_updated_at on public.user_preferences;
create trigger user_preferences_set_updated_at
  before update on public.user_preferences
  for each row execute procedure public.set_row_updated_at();

alter table public.user_preferences enable row level security;
drop policy if exists "Users can read their own preferences" on public.user_preferences;
create policy "Users can read their own preferences"
  on public.user_preferences for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on table public.user_preferences from anon, authenticated;
grant select on table public.user_preferences to authenticated;

create table if not exists public.user_focus_playlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 30),
  url text not null check (char_length(btrim(url)) between 1 and 500),
  sort_order smallint not null default 0,
  last_played_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, url)
);

create index if not exists user_focus_playlists_user_sort_idx
  on public.user_focus_playlists (user_id, sort_order, created_at);

drop trigger if exists user_focus_playlists_set_updated_at on public.user_focus_playlists;
create trigger user_focus_playlists_set_updated_at
  before update on public.user_focus_playlists
  for each row execute procedure public.set_row_updated_at();

alter table public.user_focus_playlists enable row level security;
drop policy if exists "Users can read their own playlists" on public.user_focus_playlists;
create policy "Users can read their own playlists"
  on public.user_focus_playlists for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on table public.user_focus_playlists from anon, authenticated;
grant select on table public.user_focus_playlists to authenticated;

alter table public.user_preferences replica identity full;
alter table public.user_focus_playlists replica identity full;

do $realtime$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'user_preferences'
  ) then
    alter publication supabase_realtime add table public.user_preferences;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'user_focus_playlists'
  ) then
    alter publication supabase_realtime add table public.user_focus_playlists;
  end if;
end
$realtime$;

-- Reads (creates the row on first touch so a brand-new user isn't a
-- special case for the client).

create or replace function public.get_my_preferences()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  prefs public.user_preferences%rowtype;
  playlists jsonb;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  insert into public.user_preferences (user_id)
  values (current_user_id)
  on conflict (user_id) do nothing;

  select * into prefs
  from public.user_preferences
  where user_id = current_user_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'title', p.title,
        'url', p.url,
        'sortOrder', p.sort_order,
        'lastPlayedAt', p.last_played_at
      )
      order by p.sort_order, p.created_at
    ),
    '[]'::jsonb
  )
  into playlists
  from public.user_focus_playlists as p
  where p.user_id = current_user_id;

  return jsonb_build_object(
    'tutorialCompleted', prefs.tutorial_completed,
    'settings', jsonb_build_object(
      'linked', jsonb_build_object(
        'focusMinutes', prefs.linked_focus_minutes,
        'breakEnabled', prefs.linked_break_enabled,
        'breakMinutes', prefs.linked_break_minutes
      ),
      'quick', jsonb_build_object(
        'focusMinutes', prefs.quick_focus_minutes,
        'breakEnabled', prefs.quick_break_enabled,
        'breakMinutes', prefs.quick_break_minutes
      )
    ),
    'playlists', playlists
  );
end;
$$;

revoke all on function public.get_my_preferences() from public, anon;
grant execute on function public.get_my_preferences() to authenticated;

-- Writes: one targeted RPC per user-facing action, none of them touching
-- more than the row(s) that action actually means to change.

create or replace function public.complete_my_tutorial()
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
  insert into public.user_preferences (user_id, tutorial_completed)
  values (current_user_id, true)
  on conflict (user_id) do update set tutorial_completed = true;
end;
$$;

revoke all on function public.complete_my_tutorial() from public, anon;
grant execute on function public.complete_my_tutorial() to authenticated;

create or replace function public.save_my_focus_settings(
  p_mode text,
  p_focus_minutes integer,
  p_break_enabled boolean,
  p_break_minutes integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  clamped_focus smallint := least(120, greatest(5, coalesce(p_focus_minutes, 25)));
  clamped_break smallint := least(60, greatest(1, coalesce(p_break_minutes, 5)));
  result_row public.user_preferences%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_mode not in ('linked', 'quick') then
    raise exception 'Unsupported focus mode';
  end if;

  insert into public.user_preferences (user_id)
  values (current_user_id)
  on conflict (user_id) do nothing;

  if p_mode = 'linked' then
    update public.user_preferences
    set linked_focus_minutes = clamped_focus,
        linked_break_enabled = coalesce(p_break_enabled, true),
        linked_break_minutes = clamped_break
    where user_id = current_user_id
    returning * into result_row;
  else
    update public.user_preferences
    set quick_focus_minutes = clamped_focus,
        quick_break_enabled = coalesce(p_break_enabled, true),
        quick_break_minutes = clamped_break
    where user_id = current_user_id
    returning * into result_row;
  end if;

  return jsonb_build_object(
    'linked', jsonb_build_object(
      'focusMinutes', result_row.linked_focus_minutes,
      'breakEnabled', result_row.linked_break_enabled,
      'breakMinutes', result_row.linked_break_minutes
    ),
    'quick', jsonb_build_object(
      'focusMinutes', result_row.quick_focus_minutes,
      'breakEnabled', result_row.quick_break_enabled,
      'breakMinutes', result_row.quick_break_minutes
    )
  );
end;
$$;

revoke all on function public.save_my_focus_settings(text, integer, boolean, integer)
  from public, anon;
grant execute on function public.save_my_focus_settings(text, integer, boolean, integer)
  to authenticated;

-- p_id null: this is a fresh add (or a rename-in-place if the url already
-- exists, mirroring the client's current dedupe-by-url behavior). p_id set:
-- this is an edit of that specific row.
create or replace function public.upsert_my_focus_playlist(
  p_id uuid,
  p_title text,
  p_url text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  trimmed_url text := btrim(coalesce(p_url, ''));
  target_id uuid;
  existing_count integer;
  fallback_title text;
  final_title text;
  result_row public.user_focus_playlists%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if trimmed_url = '' then
    raise exception 'Playlist url required';
  end if;

  if p_id is not null then
    select id into target_id
    from public.user_focus_playlists
    where user_id = current_user_id and id = p_id
    for update;
    if target_id is null then
      raise exception 'PLAYLIST_NOT_FOUND';
    end if;
  else
    select id into target_id
    from public.user_focus_playlists
    where user_id = current_user_id and url = trimmed_url
    for update;
  end if;

  select count(*) into existing_count
  from public.user_focus_playlists
  where user_id = current_user_id;

  fallback_title := '플레이리스트 ' || (
    case when target_id is null then existing_count + 1 else existing_count end
  );
  final_title := left(coalesce(nullif(btrim(p_title), ''), fallback_title), 30);

  if target_id is not null then
    update public.user_focus_playlists
    set title = final_title,
        url = trimmed_url
    where id = target_id
    returning * into result_row;
  else
    if existing_count >= 5 then
      raise exception 'PLAYLIST_LIMIT';
    end if;
    insert into public.user_focus_playlists (user_id, title, url, sort_order)
    values (current_user_id, final_title, trimmed_url, existing_count)
    returning * into result_row;
  end if;

  return jsonb_build_object(
    'id', result_row.id,
    'title', result_row.title,
    'url', result_row.url,
    'sortOrder', result_row.sort_order,
    'lastPlayedAt', result_row.last_played_at
  );
end;
$$;

revoke all on function public.upsert_my_focus_playlist(uuid, text, text) from public, anon;
grant execute on function public.upsert_my_focus_playlist(uuid, text, text) to authenticated;

create or replace function public.delete_my_focus_playlist(p_id uuid)
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
  delete from public.user_focus_playlists
  where user_id = current_user_id and id = p_id;
end;
$$;

revoke all on function public.delete_my_focus_playlist(uuid) from public, anon;
grant execute on function public.delete_my_focus_playlist(uuid) to authenticated;

create or replace function public.touch_my_focus_playlist(p_id uuid)
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
  update public.user_focus_playlists
  set last_played_at = now()
  where user_id = current_user_id and id = p_id;
end;
$$;

revoke all on function public.touch_my_focus_playlist(uuid) from public, anon;
grant execute on function public.touch_my_focus_playlist(uuid) to authenticated;

-- Backfill from the existing user_app_state blob. Re-runnable (every insert
-- is on conflict do nothing) and wrapped per-user so one malformed blob
-- can't abort the migration for everyone else.

do $preferences_backfill$
declare
  rec record;
begin
  for rec in select user_id, state from public.user_app_state loop
    begin
      insert into public.user_preferences (
        user_id, tutorial_completed,
        linked_focus_minutes, linked_break_enabled, linked_break_minutes,
        quick_focus_minutes, quick_break_enabled, quick_break_minutes
      )
      values (
        rec.user_id,
        coalesce(nullif(rec.state ->> 'tutorialCompleted', '')::boolean, false),
        least(120, greatest(5,
          coalesce(nullif(rec.state #>> '{settings,linked,focusMinutes}', '')::int, 25))),
        coalesce(nullif(rec.state #>> '{settings,linked,breakEnabled}', '')::boolean, true),
        least(60, greatest(1,
          coalesce(nullif(rec.state #>> '{settings,linked,breakMinutes}', '')::int, 5))),
        least(120, greatest(5,
          coalesce(nullif(rec.state #>> '{settings,quick,focusMinutes}', '')::int, 25))),
        coalesce(nullif(rec.state #>> '{settings,quick,breakEnabled}', '')::boolean, true),
        least(60, greatest(1,
          coalesce(nullif(rec.state #>> '{settings,quick,breakMinutes}', '')::int, 5)))
      )
      on conflict (user_id) do nothing;
    exception when others then
      raise notice 'Skipped preferences backfill for %: %', rec.user_id, sqlerrm;
    end;
  end loop;
end
$preferences_backfill$;

-- Users with no user_app_state row at all still get a defaults row.
insert into public.user_preferences (user_id)
select id from auth.users
on conflict (user_id) do nothing;

do $playlist_backfill$
declare
  rec record;
  entry jsonb;
  idx integer;
  computed_title text;
  computed_url text;
begin
  for rec in select user_id, state from public.user_app_state loop
    begin
      if jsonb_typeof(rec.state -> 'focusYoutubePlaylists') = 'array' then
        idx := 0;
        for entry in select value from jsonb_array_elements(rec.state -> 'focusYoutubePlaylists') loop
          idx := idx + 1;
          exit when idx > 5;
          computed_url := btrim(coalesce(entry ->> 'url', ''));
          continue when computed_url = '';
          computed_title := left(
            coalesce(nullif(btrim(entry ->> 'title'), ''), '플레이리스트 ' || idx),
            30
          );
          insert into public.user_focus_playlists (user_id, title, url, sort_order, last_played_at)
          values (
            rec.user_id,
            computed_title,
            computed_url,
            idx - 1,
            case
              when computed_url = btrim(coalesce(rec.state ->> 'focusYoutubeUrl', ''))
              then now()
            end
          )
          on conflict (user_id, url) do nothing;
        end loop;
      elsif nullif(btrim(coalesce(rec.state ->> 'focusYoutubeUrl', '')), '') is not null then
        insert into public.user_focus_playlists (user_id, title, url, sort_order, last_played_at)
        values (rec.user_id, '내 집중 음악', btrim(rec.state ->> 'focusYoutubeUrl'), 0, now())
        on conflict (user_id, url) do nothing;
      end if;
    exception when others then
      raise notice 'Skipped playlist backfill for %: %', rec.user_id, sqlerrm;
    end;
  end loop;
end
$playlist_backfill$;

commit;

-- Verification (run manually after applying): every row here means a
-- playlist that existed in the old blob didn't make it into the new table.
-- Expected: zero rows.
--
-- select s.user_id,
--        jsonb_array_length(coalesce(s.state -> 'focusYoutubePlaylists', '[]'::jsonb)) as blob_count,
--        (select count(*) from public.user_focus_playlists p where p.user_id = s.user_id) as migrated_count
-- from public.user_app_state s
-- where jsonb_array_length(coalesce(s.state -> 'focusYoutubePlaylists', '[]'::jsonb))
--       <> (select count(*) from public.user_focus_playlists p where p.user_id = s.user_id);
