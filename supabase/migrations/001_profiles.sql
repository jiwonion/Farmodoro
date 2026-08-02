-- Farmodoro account profile foundation
-- Authentication credentials remain in Supabase Auth (auth.users).

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  avatar_url text,
  farm_code text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length
    check (char_length(btrim(display_name)) between 1 and 30),
  constraint profiles_farm_code_format
    check (farm_code ~ '^FARM-[A-F0-9]{4}-[A-F0-9]{4}$')
);

comment on table public.profiles is 'Public-facing Farmodoro account information';
comment on column public.profiles.farm_code is 'Private address used to find a recipient when sending farm mail';

create or replace function public.generate_farm_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  token text;
  candidate text;
begin
  loop
    token := upper(replace(gen_random_uuid()::text, '-', ''));
    candidate := 'FARM-' || substr(token, 1, 4) || '-' || substr(token, 5, 4);
    exit when not exists (
      select 1
      from public.profiles
      where farm_code = candidate
    );
  end loop;

  return candidate;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_name text;
  profile_avatar text;
begin
  profile_name := left(
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(new.email, '@', 1), ''),
      '새싹 농부'
    ),
    30
  );

  profile_avatar := coalesce(
    nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
    nullif(new.raw_user_meta_data ->> 'picture', '')
  );

  insert into public.profiles (id, display_name, avatar_url, farm_code)
  values (new.id, profile_name, profile_avatar, public.generate_farm_code())
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.set_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists on_profile_updated on public.profiles;
create trigger on_profile_updated
  before update on public.profiles
  for each row execute procedure public.set_profile_updated_at();

-- Create a profile for users who signed in before this migration was installed.
insert into public.profiles (id, display_name, avatar_url, farm_code, created_at)
select
  users.id,
  left(
    coalesce(
      nullif(btrim(users.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(users.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(users.email, '@', 1), ''),
      '새싹 농부'
    ),
    30
  ),
  coalesce(
    nullif(users.raw_user_meta_data ->> 'avatar_url', ''),
    nullif(users.raw_user_meta_data ->> 'picture', '')
  ),
  public.generate_farm_code(),
  users.created_at
from auth.users as users
on conflict (id) do nothing;

alter table public.profiles enable row level security;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (display_name, avatar_url) on table public.profiles to authenticated;

revoke all on function public.generate_farm_code() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.set_profile_updated_at() from public, anon, authenticated;
