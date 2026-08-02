-- Sync each user's selected Farmodoro theme across devices.

alter table public.profiles
  add column if not exists theme text not null default 'classic';

alter table public.profiles
  drop constraint if exists profiles_theme_value;

alter table public.profiles
  add constraint profiles_theme_value
  check (theme in ('classic', 'sunset', 'sky'));

grant update (theme) on table public.profiles to authenticated;

comment on column public.profiles.theme is 'Selected Farmodoro color theme';
