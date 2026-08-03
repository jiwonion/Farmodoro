-- Persist the exact time each crop was last cared for.

alter table public.farm_plots
  add column if not exists last_cared_at timestamptz;

update public.farm_plots
set last_cared_at = now()
where crop_id is not null
  and last_cared_at is null;

create or replace function public.get_my_farm_state_v2()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  result jsonb;
  enriched_plots jsonb;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  result := public.get_my_farm_state();

  select coalesce(
    jsonb_agg(
      plot.value || jsonb_build_object('lastCaredAt', farm_plot.last_cared_at)
      order by (plot.value ->> 'id')::integer
    ),
    '[]'::jsonb
  )
  into enriched_plots
  from jsonb_array_elements(coalesce(result -> 'plots', '[]'::jsonb)) as plot(value)
  left join public.farm_plots as farm_plot
    on farm_plot.user_id = current_user_id
   and farm_plot.plot_index = (plot.value ->> 'id')::smallint;

  return jsonb_set(result, '{plots}', enriched_plots, true);
end;
$$;

create or replace function public.save_my_farm_state_v2(p_state jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  entry jsonb;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  perform public.save_my_farm_state(p_state);

  for entry in
    select value
    from jsonb_array_elements(coalesce(p_state -> 'plots', '[]'::jsonb))
  loop
    update public.farm_plots
    set last_cared_at = case
      when nullif(entry ->> 'crop', '') is null then null
      else coalesce(nullif(entry ->> 'lastCaredAt', '')::timestamptz, now())
    end
    where user_id = current_user_id
      and plot_index = (entry ->> 'id')::smallint;
  end loop;
end;
$$;

revoke all on function public.get_my_farm_state_v2() from public, anon;
revoke all on function public.save_my_farm_state_v2(jsonb) from public, anon;
grant execute on function public.get_my_farm_state_v2() to authenticated;
grant execute on function public.save_my_farm_state_v2(jsonb) to authenticated;

comment on column public.farm_plots.last_cared_at is
  'Exact timestamp used for the 24-hour crop wilt countdown';
