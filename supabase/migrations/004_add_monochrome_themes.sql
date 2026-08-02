-- Allow the white and black themes added after the initial theme migration.

alter table public.profiles
  drop constraint if exists profiles_theme_value;

alter table public.profiles
  add constraint profiles_theme_value
  check (theme in ('white', 'classic', 'sunset', 'sky', 'dark'));
