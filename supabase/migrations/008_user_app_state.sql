-- Transitional persistence for Farmodoro features that are not yet backed by
-- their normalized tables. Tasks, groups, habits, profiles, and themes are
-- deliberately excluded from this JSON document and use dedicated tables.

create table if not exists public.user_app_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_app_state_object_only check (jsonb_typeof(state) = 'object')
);

drop trigger if exists user_app_state_set_updated_at on public.user_app_state;
create trigger user_app_state_set_updated_at
  before update on public.user_app_state
  for each row execute procedure public.set_row_updated_at();

alter table public.user_app_state enable row level security;

drop policy if exists "Users can manage their own app state" on public.user_app_state;
create policy "Users can manage their own app state"
  on public.user_app_state
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.user_app_state from anon, authenticated;
grant select, insert, update, delete on table public.user_app_state to authenticated;

comment on table public.user_app_state is
  'Temporary JSON persistence for non-productivity UI/farm runtime state; replace with normalized tables incrementally';
