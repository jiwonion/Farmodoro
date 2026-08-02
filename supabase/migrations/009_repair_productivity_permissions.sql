-- Reapply the authenticated grants and ownership policies used by the web app.
-- This is safe to run when 005 was already applied and repairs partial/manual runs.

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

revoke all on table public.task_groups from anon;
revoke all on table public.tasks from anon;
revoke all on table public.habits from anon;
revoke all on table public.habit_daily_records from anon;

grant select, insert, update, delete on table public.task_groups to authenticated;
grant select, insert, update, delete on table public.tasks to authenticated;
grant select, insert, update, delete on table public.habits to authenticated;
grant select, insert, update, delete on table public.habit_daily_records to authenticated;

notify pgrst, 'reload schema';
