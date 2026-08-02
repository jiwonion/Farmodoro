-- Account-owned focus backgrounds shared across devices.

alter table public.profiles
  add column if not exists focus_background_path text;

alter table public.profiles
  drop constraint if exists profiles_focus_background_path_format;
alter table public.profiles
  add constraint profiles_focus_background_path_format
  check (
    focus_background_path is null
    or focus_background_path ~ '^[0-9a-f-]{36}/focus-background\.(jpg|jpeg|png|webp)$'
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'focus-backgrounds',
  'focus-backgrounds',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can read their own focus background" on storage.objects;
create policy "Users can read their own focus background"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'focus-backgrounds'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can upload their own focus background" on storage.objects;
create policy "Users can upload their own focus background"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'focus-backgrounds'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can update their own focus background" on storage.objects;
create policy "Users can update their own focus background"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'focus-backgrounds'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'focus-backgrounds'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can delete their own focus background" on storage.objects;
create policy "Users can delete their own focus background"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'focus-backgrounds'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

comment on column public.profiles.focus_background_path is
  'Private Supabase Storage path for the user focus-page background';
