begin;

create table public.recurring_tasks (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  group_id uuid,
  frequency text not null check (frequency in ('daily','weekly','monthly')),
  weekdays smallint[] not null default array[1,2,3,4,5,6,7]::smallint[]
    check (cardinality(weekdays) between 1 and 7 and weekdays <@ array[1,2,3,4,5,6,7]::smallint[]),
  month_day smallint not null default 1 check (month_day between 1 and 31),
  start_date date not null,
  end_date date check (end_date is null or end_date >= start_date),
  active boolean not null default true,
  generated_through date,
  created_at timestamptz not null default now(),
  unique(user_id,id),
  foreign key(user_id,group_id) references public.task_groups(user_id,id) on delete set null (group_id)
);
alter table public.recurring_tasks enable row level security;
create policy recurring_tasks_read_own on public.recurring_tasks for select to authenticated using (user_id=(select auth.uid()));
revoke all on public.recurring_tasks from public,anon,authenticated;
grant select on public.recurring_tasks to authenticated;

alter table public.tasks add column scheduled_on date;
alter table public.tasks add column recurrence_id uuid;
alter table public.tasks add constraint tasks_recurrence_owner_fk foreign key(user_id,recurrence_id)
  references public.recurring_tasks(user_id,id) on delete no action deferrable initially deferred;
create index tasks_user_scheduled_idx on public.tasks(user_id,scheduled_on);

-- Occurrence keys outlive deleted tasks, so deleting an instance cannot
-- cause a later refresh (or another device) to recreate it.
create table public.recurring_task_occurrences (
  recurrence_id uuid not null references public.recurring_tasks(id) on delete cascade,
  scheduled_on date not null,
  task_id uuid references public.tasks(id) on delete set null,
  primary key(recurrence_id,scheduled_on)
);
alter table public.recurring_task_occurrences enable row level security;
revoke all on public.recurring_task_occurrences from public,anon,authenticated;

create or replace function private.materialize_my_recurring_tasks()
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); rule public.recurring_tasks%rowtype;
  first_day date; last_day date; day date; instance_id uuid;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,107));
  for rule in select * from public.recurring_tasks where user_id=uid and active loop
    first_day := greatest(rule.start_date,coalesce(rule.generated_through+1,rule.start_date));
    last_day := least(public.productivity_today(),coalesce(rule.end_date,public.productivity_today()),first_day+365);
    if first_day > last_day then continue; end if;
    for day in select first_day+i from generate_series(0,last_day-first_day) i loop
      if rule.frequency='weekly' and not (extract(isodow from day)::smallint=any(rule.weekdays)) then continue; end if;
      if rule.frequency='monthly' and extract(day from day)::int <> least(rule.month_day,
        extract(day from (date_trunc('month',day)+interval '1 month - 1 day'))::int) then continue; end if;
      instance_id := null;
      insert into public.recurring_task_occurrences(recurrence_id,scheduled_on)
        values(rule.id,day) on conflict do nothing returning gen_random_uuid() into instance_id;
      if instance_id is null then continue; end if;
      insert into public.tasks(id,user_id,title,group_id,scheduled_on,recurrence_id)
        values(instance_id,uid,rule.title,rule.group_id,day,rule.id);
      update public.recurring_task_occurrences set task_id=instance_id where recurrence_id=rule.id and scheduled_on=day;
    end loop;
    update public.recurring_tasks set generated_through=last_day where id=rule.id;
  end loop;
end; $$;
revoke all on function private.materialize_my_recurring_tasks() from public,anon,authenticated;

create or replace function public.save_my_recurring_task(
  p_id uuid,p_title text,p_group_id uuid,p_frequency text,p_weekdays smallint[],
  p_month_day integer,p_start_date date,p_end_date date default null
) returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_id is null or char_length(btrim(p_title)) not between 1 and 200 or p_title is null then raise exception 'Invalid title'; end if;
  if p_start_date is null or p_start_date < public.productivity_today()-366 then raise exception 'Invalid start date'; end if;
  if p_group_id is not null and not exists(select 1 from public.task_groups where user_id=uid and id=p_group_id) then raise exception 'Group not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,107));
  if exists(select 1 from public.recurring_tasks where id=p_id and user_id<>uid) then raise exception 'Not found'; end if;
  if (select count(*) from public.recurring_tasks where user_id=uid)>=100 and not exists(select 1 from public.recurring_tasks where id=p_id and user_id=uid) then raise exception 'Too many recurring tasks'; end if;
  -- A fixed client ID makes a retry after a lost response idempotent.
  insert into public.recurring_tasks(id,user_id,title,group_id,frequency,weekdays,month_day,start_date,end_date)
    values(p_id,uid,private.farmodoro_encrypt_text(btrim(p_title)),p_group_id,p_frequency,p_weekdays,p_month_day,p_start_date,p_end_date)
    on conflict(id) do nothing;
  perform private.materialize_my_recurring_tasks();
end; $$;
revoke all on function public.save_my_recurring_task(uuid,text,uuid,text,smallint[],integer,date,date) from public,anon;
grant execute on function public.save_my_recurring_task(uuid,text,uuid,text,smallint[],integer,date,date) to authenticated;

create or replace function public.set_my_recurring_task_active(p_id uuid,p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,107));
  update public.recurring_tasks set active=p_active,
    generated_through=greatest(coalesce(generated_through,start_date-1),public.productivity_today()-case when p_active then 1 else 0 end)
    where id=p_id and user_id=uid;
  if not found then raise exception 'Not found'; end if;
  perform private.materialize_my_recurring_tasks();
end; $$;
revoke all on function public.set_my_recurring_task_active(uuid,boolean) from public,anon;
grant execute on function public.set_my_recurring_task_active(uuid,boolean) to authenticated;

-- Keep the existing decryption/completion implementation behind a private
-- wrapper instead of copying its reward-sensitive fields into a second RPC.
alter function public.get_my_productivity_state() set schema private;
revoke all on function private.get_my_productivity_state() from public,anon,authenticated;
create function public.get_my_productivity_state()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb; uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'Authentication required'; end if;
  perform private.materialize_my_recurring_tasks();
  result:=private.get_my_productivity_state();
  return result || jsonb_build_object('schedulingVersion',1,
    'tasks',coalesce((select jsonb_agg(item || jsonb_build_object('scheduled_on',t.scheduled_on,'recurrence_id',t.recurrence_id) order by ord)
      from jsonb_array_elements(result->'tasks') with ordinality x(item,ord)
      join public.tasks t on t.id=(item->>'id')::uuid and t.user_id=uid),'[]'::jsonb),
    'recurringTasks',coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id,'title',private.farmodoro_decrypt_text(r.title),'group_id',r.group_id,
      'frequency',r.frequency,'weekdays',r.weekdays,'month_day',r.month_day,
      'start_date',r.start_date,'end_date',r.end_date,'active',r.active) order by r.created_at)
      from public.recurring_tasks r where r.user_id=uid),'[]'::jsonb));
end; $$;
revoke all on function public.get_my_productivity_state() from public,anon;
grant execute on function public.get_my_productivity_state() to authenticated;

do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    alter publication supabase_realtime add table public.recurring_tasks;
  end if;
end; $$;
commit;
