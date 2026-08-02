-- Farmodoro task and habit persistence.
-- Task lifecycle: completed tasks are archived the next day (Asia/Seoul),
-- then permanently deleted 30 days after entering the archive.

create table if not exists public.task_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  color_index smallint not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_groups_name_length
    check (char_length(btrim(name)) between 1 and 30),
  constraint task_groups_color_index_range
    check (color_index between 0 and 7),
  constraint task_groups_user_name_unique
    unique (user_id, name),
  constraint task_groups_user_id_id_unique
    unique (user_id, id)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  group_id uuid,
  title text not null,
  status text not null default 'waiting',
  sort_order integer not null default 0,
  focus_seconds integer not null default 0,
  completion_reward integer not null default 0,
  completed_with_free_pass boolean not null default false,
  completed_on date,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_title_length
    check (char_length(btrim(title)) between 1 and 200),
  constraint tasks_status_value
    check (status in ('waiting', 'doing', 'done')),
  constraint tasks_focus_seconds_nonnegative
    check (focus_seconds >= 0),
  constraint tasks_completion_reward_nonnegative
    check (completion_reward >= 0),
  constraint tasks_archive_only_when_done
    check (archived_at is null or status = 'done'),
  constraint tasks_group_owner_fk
    foreign key (user_id, group_id)
    references public.task_groups (user_id, id)
    on delete restrict
);

create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  measure_type text not null default 'count',
  target_value numeric(12, 2) not null default 1,
  unit text not null default '회',
  weekdays smallint[] not null default array[1, 2, 3, 4, 5, 6, 7]::smallint[],
  start_date date,
  end_date date,
  sort_order integer not null default 0,
  focus_seconds integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint habits_title_length
    check (char_length(btrim(title)) between 1 and 100),
  constraint habits_measure_type_value
    check (measure_type in ('count', 'time', 'amount')),
  constraint habits_target_value_positive
    check (target_value > 0),
  constraint habits_unit_length
    check (char_length(btrim(unit)) between 1 and 20),
  constraint habits_weekdays_value
    check (
      cardinality(weekdays) > 0
      and weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
    ),
  constraint habits_date_range
    check (end_date is null or start_date is null or end_date >= start_date),
  constraint habits_focus_seconds_nonnegative
    check (focus_seconds >= 0)
);

create table if not exists public.habit_daily_records (
  habit_id uuid not null references public.habits (id) on delete cascade,
  record_date date not null,
  progress_value numeric(12, 2) not null default 0,
  completed_at timestamptz,
  completion_reward integer not null default 0,
  completed_with_free_pass boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (habit_id, record_date),
  constraint habit_daily_records_progress_nonnegative
    check (progress_value >= 0),
  constraint habit_daily_records_reward_nonnegative
    check (completion_reward >= 0)
);

create index if not exists task_groups_user_sort_idx
  on public.task_groups (user_id, sort_order, created_at);

create index if not exists tasks_user_status_sort_idx
  on public.tasks (user_id, status, sort_order, created_at);

create index if not exists tasks_user_archived_at_idx
  on public.tasks (user_id, archived_at)
  where archived_at is not null;

create index if not exists habits_user_sort_idx
  on public.habits (user_id, sort_order, created_at);

create index if not exists habit_daily_records_date_idx
  on public.habit_daily_records (record_date, habit_id);

create or replace function public.set_row_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists task_groups_set_updated_at on public.task_groups;
create trigger task_groups_set_updated_at
  before update on public.task_groups
  for each row execute procedure public.set_row_updated_at();

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute procedure public.set_row_updated_at();

drop trigger if exists habits_set_updated_at on public.habits;
create trigger habits_set_updated_at
  before update on public.habits
  for each row execute procedure public.set_row_updated_at();

drop trigger if exists habit_daily_records_set_updated_at on public.habit_daily_records;
create trigger habit_daily_records_set_updated_at
  before update on public.habit_daily_records
  for each row execute procedure public.set_row_updated_at();

alter table public.task_groups enable row level security;
alter table public.tasks enable row level security;
alter table public.habits enable row level security;
alter table public.habit_daily_records enable row level security;

drop policy if exists "Users can manage their own task groups" on public.task_groups;
create policy "Users can manage their own task groups"
  on public.task_groups
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can manage their own tasks" on public.tasks;
create policy "Users can manage their own tasks"
  on public.tasks
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can manage their own habits" on public.habits;
create policy "Users can manage their own habits"
  on public.habits
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can manage their own habit records" on public.habit_daily_records;
create policy "Users can manage their own habit records"
  on public.habit_daily_records
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.habits
      where habits.id = habit_daily_records.habit_id
        and habits.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.habits
      where habits.id = habit_daily_records.habit_id
        and habits.user_id = (select auth.uid())
    )
  );

revoke all on table public.task_groups from anon, authenticated;
revoke all on table public.tasks from anon, authenticated;
revoke all on table public.habits from anon, authenticated;
revoke all on table public.habit_daily_records from anon, authenticated;

grant select, insert, update, delete on table public.task_groups to authenticated;
grant select, insert, update, delete on table public.tasks to authenticated;
grant select, insert, update, delete on table public.habits to authenticated;
grant select, insert, update, delete on table public.habit_daily_records to authenticated;

-- Runs hourly and compares dates in Asia/Seoul, avoiding Cron timezone assumptions.
-- 1) Yesterday's completed tasks enter the archive.
-- 2) Tasks that have spent 30 days in the archive are permanently deleted.
create or replace function public.run_task_lifecycle()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.tasks
  set archived_at = now()
  where status = 'done'
    and archived_at is null
    and completed_on is not null
    and completed_on < (now() at time zone 'Asia/Seoul')::date;

  delete from public.tasks
  where archived_at is not null
    and archived_at <= now() - interval '30 days';
end;
$$;

revoke all on function public.set_row_updated_at() from public, anon, authenticated;
revoke all on function public.run_task_lifecycle() from public, anon, authenticated;

create extension if not exists pg_cron;

select cron.schedule(
  'farmodoro-task-lifecycle',
  '5 * * * *',
  'select public.run_task_lifecycle();'
);

comment on table public.tasks is 'User tasks; archived rows are permanently deleted after 30 days';
comment on table public.habits is 'Habit definitions and schedules';
comment on table public.habit_daily_records is 'Per-day habit progress and completion history';
