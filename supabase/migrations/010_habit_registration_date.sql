-- Record the date from which each habit should appear in the activity heatmap.

update public.habits
set start_date = (created_at at time zone 'Asia/Seoul')::date
where start_date is null;

alter table public.habits
  alter column start_date
  set default ((now() at time zone 'Asia/Seoul')::date);

notify pgrst, 'reload schema';
