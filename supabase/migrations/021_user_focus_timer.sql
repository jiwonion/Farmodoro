create table if not exists public.user_focus_timer (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_focus_timer_state_object check (jsonb_typeof(state) = 'object')
);

drop trigger if exists user_focus_timer_set_updated_at on public.user_focus_timer;
create trigger user_focus_timer_set_updated_at
  before update on public.user_focus_timer
  for each row execute procedure public.set_row_updated_at();

alter table public.user_focus_timer enable row level security;

drop policy if exists "Users can manage their own focus timer" on public.user_focus_timer;
create policy "Users can manage their own focus timer"
  on public.user_focus_timer
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.user_focus_timer from anon, authenticated;
grant select, insert, update, delete on table public.user_focus_timer to authenticated;

comment on table public.user_focus_timer is
  'Cross-device focus timer runtime for each authenticated user';
