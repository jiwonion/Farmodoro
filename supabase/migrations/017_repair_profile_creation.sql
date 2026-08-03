-- Restore profile creation for existing and future Supabase Auth users.

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
where not exists (
  select 1
  from public.profiles
  where profiles.id = users.id
);

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
  for each row execute function public.handle_new_user();

revoke all on function public.generate_farm_code() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (display_name, avatar_url, theme, focus_background_path)
  on table public.profiles to authenticated;

notify pgrst, 'reload schema';
