begin;

create or replace function public.reset_my_habits()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  reset_date date := (now() at time zone 'Asia/Seoul')::date;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  delete from public.habit_daily_records as records
  using public.habits as habits
  where records.habit_id = habits.id
    and habits.user_id = current_user_id;

  update public.habits
  set start_date = reset_date,
      end_date = case when end_date < reset_date then null else end_date end
  where user_id = current_user_id;
end;
$$;

revoke all on function public.reset_my_habits() from public, anon;
grant execute on function public.reset_my_habits() to authenticated;

commit;
