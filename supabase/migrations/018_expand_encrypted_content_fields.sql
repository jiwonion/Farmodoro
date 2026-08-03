-- Client-side AES-GCM ciphertext is longer than the original plaintext.
-- The browser performs the actual encryption because the passphrase never reaches Supabase.

alter table public.task_groups
  drop constraint if exists task_groups_name_length;

alter table public.task_groups
  add constraint task_groups_name_length
  check (char_length(btrim(name)) between 1 and 512);

alter table public.tasks
  drop constraint if exists tasks_title_length;

alter table public.tasks
  add constraint tasks_title_length
  check (char_length(btrim(title)) between 1 and 2048);

alter table public.habits
  drop constraint if exists habits_title_length;

alter table public.habits
  add constraint habits_title_length
  check (char_length(btrim(title)) between 1 and 1024);
