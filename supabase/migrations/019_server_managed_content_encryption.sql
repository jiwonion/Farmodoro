-- Transparent content encryption for task, habit, and group names.
-- The project key lives in Supabase Vault; clients never receive it.

create schema if not exists extensions;
create schema if not exists vault;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists supabase_vault with schema vault;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from vault.secrets
    where name = 'farmodoro_content_key_v1'
  ) then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'farmodoro_content_key_v1',
      'Farmodoro task, habit, and group name encryption key'
    );
  end if;
end
$$;

create or replace function private.farmodoro_content_key()
returns text
language sql
stable
security definer
set search_path = pg_catalog, vault
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'farmodoro_content_key_v1'
  limit 1;
$$;

create or replace function private.farmodoro_encrypt_text(value text)
returns text
language plpgsql
security definer
set search_path = pg_catalog, private, extensions
as $$
begin
  if value is null or value like 'sv1:%' or value like 'fmd1.%' then
    return value;
  end if;
  return 'sv1:' || encode(
    extensions.pgp_sym_encrypt(
      value,
      private.farmodoro_content_key(),
      'cipher-algo=aes256,compress-algo=0,unicode-mode=1'
    ),
    'hex'
  );
end;
$$;

create or replace function private.farmodoro_decrypt_text(value text)
returns text
language plpgsql
security definer
set search_path = pg_catalog, private, extensions
as $$
begin
  if value is null or value not like 'sv1:%' then
    return value;
  end if;
  return extensions.pgp_sym_decrypt(
    decode(substr(value, 5), 'hex'),
    private.farmodoro_content_key()
  );
end;
$$;

create or replace function private.farmodoro_encrypt_content_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
begin
  if tg_table_name = 'task_groups' then
    new.name := private.farmodoro_encrypt_text(new.name);
  elsif tg_table_name = 'tasks' then
    new.title := private.farmodoro_encrypt_text(new.title);
  elsif tg_table_name = 'habits' then
    new.title := private.farmodoro_encrypt_text(new.title);
  end if;
  return new;
end;
$$;

drop trigger if exists task_groups_encrypt_content on public.task_groups;
create trigger task_groups_encrypt_content
  before insert or update on public.task_groups
  for each row execute function private.farmodoro_encrypt_content_trigger();

drop trigger if exists tasks_encrypt_content on public.tasks;
create trigger tasks_encrypt_content
  before insert or update on public.tasks
  for each row execute function private.farmodoro_encrypt_content_trigger();

drop trigger if exists habits_encrypt_content on public.habits;
create trigger habits_encrypt_content
  before insert or update on public.habits
  for each row execute function private.farmodoro_encrypt_content_trigger();

alter table public.task_groups drop constraint if exists task_groups_name_length;
alter table public.task_groups
  add constraint task_groups_name_length check (char_length(btrim(name)) between 1 and 512);

alter table public.tasks drop constraint if exists tasks_title_length;
alter table public.tasks
  add constraint tasks_title_length check (char_length(btrim(title)) between 1 and 2048);

alter table public.habits drop constraint if exists habits_title_length;
alter table public.habits
  add constraint habits_title_length check (char_length(btrim(title)) between 1 and 1024);

update public.task_groups
set name = private.farmodoro_encrypt_text(name)
where name not like 'sv1:%' and name not like 'fmd1.%';

update public.tasks
set title = private.farmodoro_encrypt_text(title)
where title not like 'sv1:%' and title not like 'fmd1.%';

update public.habits
set title = private.farmodoro_encrypt_text(title)
where title not like 'sv1:%' and title not like 'fmd1.%';

create or replace function public.get_my_productivity_state()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  current_user_id uuid := auth.uid();
  result jsonb;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select jsonb_build_object(
    'groups', coalesce((
      select jsonb_agg(to_jsonb(group_row) order by group_row.sort_order, group_row.created_at)
      from (
        select
          g.id,
          private.farmodoro_decrypt_text(g.name) as name,
          g.color_index,
          g.sort_order,
          g.created_at
        from public.task_groups g
        where g.user_id = current_user_id
      ) group_row
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(to_jsonb(task_row) order by task_row.sort_order, task_row.created_at)
      from (
        select
          t.id,
          t.group_id,
          private.farmodoro_decrypt_text(t.title) as title,
          t.status,
          t.sort_order,
          t.focus_seconds,
          t.completion_reward,
          t.completed_with_free_pass,
          t.completed_on,
          t.archived_at,
          t.created_at
        from public.tasks t
        where t.user_id = current_user_id
      ) task_row
    ), '[]'::jsonb),
    'habits', coalesce((
      select jsonb_agg(to_jsonb(habit_row) order by habit_row.sort_order, habit_row.created_at)
      from (
        select
          h.id,
          private.farmodoro_decrypt_text(h.title) as title,
          h.measure_type,
          h.target_value,
          h.unit,
          h.weekdays,
          h.start_date,
          h.end_date,
          h.sort_order,
          h.created_at
        from public.habits h
        where h.user_id = current_user_id
      ) habit_row
    ), '[]'::jsonb),
    'habitRecords', coalesce((
      select jsonb_agg(to_jsonb(record_row) order by record_row.record_date)
      from (
        select
          r.habit_id,
          r.record_date,
          r.progress_value,
          r.focus_seconds,
          r.completed_at,
          r.completion_reward,
          r.completed_with_free_pass
        from public.habit_daily_records r
        join public.habits h on h.id = r.habit_id
        where h.user_id = current_user_id
      ) record_row
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_my_productivity_state() from public, anon;
grant execute on function public.get_my_productivity_state() to authenticated;

revoke all on all functions in schema private from public, anon, authenticated;
