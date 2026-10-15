begin;

-- Harder future unlocks. Existing ownership is permanent and is not revoked.
insert into public.farm_v3_catalog(kind,item_id,name,growth_cost,need_harvests,need_fish,need_crop_types,need_fish_types,sort_order) values
  ('character','sprout-slime','새싹 슬라임',0,0,0,0,0,91),
  ('character','aqua-slime','물방울 슬라임',0,0,10,0,0,92),
  ('character','berry-slime','딸기 젤리',0,25,0,0,0,93),
  ('character','mushroom','버섯 친구',0,60,0,0,0,94),
  ('character','jelly-cat','젤리 고양이',0,120,0,0,0,95),
  ('character','cloud-puff','구름 친구',0,100,60,0,0,96),
  ('character','star-slime','별빛 슬라임',0,0,150,0,0,97),
  ('character','royal-slime','왕관 슬라임',0,300,200,0,0,98)
on conflict(kind,item_id) do update set name=excluded.name,need_harvests=excluded.need_harvests,
  need_fish=excluded.need_fish,need_crop_types=excluded.need_crop_types,need_fish_types=excluded.need_fish_types;

alter table public.farm_v3_profiles add column if not exists plaza_x numeric(5,2);
alter table public.farm_v3_profiles add column if not exists plaza_y numeric(5,2);
-- Retain roughly the previous area and spread existing villagers across it.
update public.farm_v3_profiles set
  plaza_x=case plaza_zone when 'bench' then 22 when 'tree' then 78 else 25+get_byte(decode(md5(user_id::text),'hex'),0)%51 end,
  plaza_y=case plaza_zone when 'bench' then 41 when 'tree' then 58 else 50+get_byte(decode(md5(user_id::text),'hex'),1)%31 end,
  version=version+1,updated_at=now() where plaza_x is null or plaza_y is null;
alter table public.farm_v3_profiles alter column plaza_x set default 50;
alter table public.farm_v3_profiles alter column plaza_y set default 65;
alter table public.farm_v3_profiles alter column plaza_x set not null;
alter table public.farm_v3_profiles alter column plaza_y set not null;
alter table public.farm_v3_profiles drop constraint if exists farm_v3_plaza_position_check;
alter table public.farm_v3_profiles add constraint farm_v3_plaza_position_check check(plaza_x between 5 and 95 and plaza_y between 15 and 95);

create or replace function public.farm_v3_state_json(p_user_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'version',1,'charactersVersion',1,'plazaPositionVersion',1,
    'coinBalance',(select coin_balance from public.farm_wallets where user_id=p_user_id),
    'profile',(select jsonb_build_object('nickname',p.nickname,'characterId',p.character_id,'decorations',p.decorations,
      'plazaPublic',p.plaza_public,'position',jsonb_build_object('x',p.plaza_x,'y',p.plaza_y),'pose',p.plaza_pose,'zone',p.plaza_zone,'version',p.version) from public.farm_v3_profiles p where p.user_id=p_user_id),
    'runs',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'kind',r.kind,'itemId',r.item_id,'slot',r.slot,
      'progress',r.progress,'cost',r.growth_cost) order by r.kind,r.slot) from public.farm_v3_runs r where r.user_id=p_user_id and r.claimed_at is null),'[]'::jsonb),
    'collections',coalesce((select jsonb_agg(jsonb_build_object('kind',c.kind,'id',c.item_id,'count',c.total,'firstAt',c.first_at) order by c.kind,c.item_id)
      from public.farm_v3_collections c where c.user_id=p_user_id),'[]'::jsonb),
    'unlocks',coalesce((select jsonb_agg(jsonb_build_object('kind',u.kind,'id',u.item_id) order by u.kind,u.item_id)
      from public.farm_v3_unlocks u where u.user_id=p_user_id and u.kind in ('crop','fish','decor','character')),'[]'::jsonb),
    'catalog',coalesce((select jsonb_agg(jsonb_build_object('kind',c.kind,'id',c.item_id,'name',c.name,'cost',c.growth_cost,
      'harvests',c.need_harvests,'fish',c.need_fish,'cropTypes',c.need_crop_types,'fishTypes',c.need_fish_types) order by c.sort_order)
      from public.farm_v3_catalog c where c.kind in ('crop','fish','decor','character')),'[]'::jsonb)
  );
$$;
revoke all on function public.farm_v3_state_json(uuid) from public,anon,authenticated;

create or replace function public.perform_my_farm_v3_action(p_action text,p_payload jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  current_user_id uuid:=auth.uid(); cached jsonb; selected public.farm_v3_catalog%rowtype;
  run_row public.farm_v3_runs%rowtype; profile_row public.farm_v3_profiles%rowtype;
  item_kind text; selected_slot integer; amount integer; spent integer; balance bigint;
  event jsonb:='{}'::jsonb; new_unlocks jsonb; appearance jsonb; decor_ids text[]; next_x numeric; next_y numeric;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if p_action is null or p_action not in ('plant','grow','harvest','fish_start','fish_grow','fish_claim','character','avatar','plaza','decor') then raise exception 'FARM_V3_UNKNOWN_ACTION'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'FARM_V3_INVALID_INPUT'; end if;
  perform public.ensure_farm_v3_user(current_user_id);
  perform public.lock_my_farm_actions(current_user_id);
  cached:=public.begin_my_farm_action(current_user_id,p_request_id,'farm_v3:'||p_action);
  if cached is not null then return public.farm_v3_result_json(current_user_id,cached->'event'); end if;

  if p_action in ('plant','fish_start') then
    item_kind:=case when p_action='plant' then 'crop' else 'fish' end;
    select * into selected from public.farm_v3_catalog where kind=item_kind and item_id=p_payload->>'itemId';
    if not found then raise exception 'FARM_V3_UNKNOWN_ITEM'; end if;
    if not exists(select 1 from public.farm_v3_unlocks where user_id=current_user_id and kind=item_kind and item_id=selected.item_id) then raise exception 'FARM_V3_LOCKED'; end if;
    if item_kind='crop' then
      if coalesce(p_payload->>'slot','') !~ '^[0-3]$' then raise exception 'FARM_V3_INVALID_SLOT'; end if;
      selected_slot:=(p_payload->>'slot')::integer;
    end if;
    if exists(select 1 from public.farm_v3_runs where user_id=current_user_id and kind=item_kind
      and (item_kind='fish' or slot=selected_slot) and claimed_at is null) then raise exception 'FARM_V3_OCCUPIED'; end if;
    insert into public.farm_v3_runs(user_id,kind,item_id,slot,growth_cost)
      values(current_user_id,item_kind,selected.item_id,selected_slot,selected.growth_cost) returning * into run_row;
    event:=jsonb_build_object('kind','started','name',selected.name,'runId',run_row.id);
  elsif p_action in ('grow','fish_grow') then
    item_kind:=case when p_action='grow' then 'crop' else 'fish' end;
    if coalesce(p_payload->>'amount','') !~ '^[0-9]{1,3}$' then raise exception 'FARM_V3_INVALID_AMOUNT'; end if;
    amount:=(p_payload->>'amount')::integer;
    if amount not between 1 and 100 then raise exception 'FARM_V3_INVALID_AMOUNT'; end if;
    select * into run_row from public.farm_v3_runs where id=(p_payload->>'runId')::uuid
      and user_id=current_user_id and kind=item_kind for update;
    if not found or run_row.claimed_at is not null then raise exception 'FARM_V3_RUN_NOT_FOUND'; end if;
    if run_row.progress>=run_row.growth_cost then raise exception 'FARM_V3_COMPLETE'; end if;
    select coin_balance into balance from public.farm_wallets where user_id=current_user_id for update;
    if balance<1 then raise exception 'FARM_INSUFFICIENT_COIN'; end if;
    spent:=least(amount,run_row.growth_cost-run_row.progress,balance)::integer;
    perform public.apply_farm_wallet_change(current_user_id,'coin',-spent,'농장·낚시 Coin 사용','farm-v3-grow:'||p_request_id);
    update public.farm_v3_runs set progress=progress+spent where id=run_row.id returning * into run_row;
    event:=jsonb_build_object('kind','grown','spentCoin',spent,'runId',run_row.id,'completed',run_row.progress=run_row.growth_cost);
  elsif p_action in ('harvest','fish_claim') then
    item_kind:=case when p_action='harvest' then 'crop' else 'fish' end;
    select * into run_row from public.farm_v3_runs where id=(p_payload->>'runId')::uuid
      and user_id=current_user_id and kind=item_kind for update;
    if not found then raise exception 'FARM_V3_RUN_NOT_FOUND'; end if;
    if run_row.claimed_at is not null then raise exception 'FARM_V3_ALREADY_CLAIMED'; end if;
    if run_row.progress<run_row.growth_cost then raise exception 'FARM_V3_NOT_COMPLETE'; end if;
    update public.farm_v3_runs set claimed_at=now() where id=run_row.id;
    insert into public.farm_v3_collections(user_id,kind,item_id) values(current_user_id,item_kind,run_row.item_id)
      on conflict(user_id,kind,item_id) do update set total=public.farm_v3_collections.total+1;
    select * into selected from public.farm_v3_catalog where kind=item_kind and item_id=run_row.item_id;
    event:=jsonb_build_object('kind','collected','name',selected.name,'itemKind',item_kind,'itemId',run_row.item_id);
  else
    select * into profile_row from public.farm_v3_profiles where user_id=current_user_id for update;
    if coalesce(p_payload->>'version','') !~ '^[0-9]{1,18}$' or (p_payload->>'version')::bigint<>profile_row.version then raise exception 'FARM_V3_PROFILE_CHANGED'; end if;
    if p_action='character' then
      if jsonb_typeof(p_payload->'characterId') is distinct from 'string' then raise exception 'FARM_V3_UNKNOWN_CHARACTER'; end if;
      select * into selected from public.farm_v3_catalog where kind='character' and item_id=p_payload->>'characterId';
      if not found then raise exception 'FARM_V3_UNKNOWN_CHARACTER'; end if;
      if not exists(select 1 from public.farm_v3_unlocks where user_id=current_user_id and kind='character' and item_id=selected.item_id)
        then raise exception 'FARM_V3_LOCKED'; end if;
      update public.farm_v3_profiles set character_id=selected.item_id where user_id=current_user_id;
      event:=jsonb_build_object('kind','character','characterId',selected.item_id,'name',selected.name);
    elsif p_action='avatar' then
      raise exception 'FARM_V3_AVATAR_RETIRED';
    elsif p_action='plaza' then
      if jsonb_typeof(p_payload->'public') is distinct from 'boolean' or jsonb_typeof(p_payload->'nickname') is distinct from 'string'
        or char_length(btrim(coalesce(p_payload->>'nickname',''))) not between 1 and 24 or (p_payload->>'nickname')~'[[:cntrl:]]'
        then raise exception 'FARM_V3_INVALID_PLAZA'; end if;
      next_x:=profile_row.plaza_x; next_y:=profile_row.plaza_y;
      if p_payload ? 'position' then
        if jsonb_typeof(p_payload->'position') is distinct from 'object'
          or jsonb_typeof(p_payload->'position'->'x') is distinct from 'number'
          or jsonb_typeof(p_payload->'position'->'y') is distinct from 'number'
          then raise exception 'FARM_V3_INVALID_POSITION'; end if;
        next_x:=(p_payload->'position'->>'x')::numeric; next_y:=(p_payload->'position'->>'y')::numeric;
        if next_x not between 5 and 95 or next_y not between 15 and 95 then raise exception 'FARM_V3_INVALID_POSITION'; end if;
      end if;
      update public.farm_v3_profiles set nickname=btrim(p_payload->>'nickname'),plaza_public=(p_payload->>'public')::boolean,
        plaza_x=round(next_x,2),plaza_y=round(next_y,2) where user_id=current_user_id;
      event:=jsonb_build_object('kind','plaza');
    else
      if jsonb_typeof(p_payload->'decorations') is distinct from 'array' or jsonb_array_length(p_payload->'decorations')>6 then raise exception 'FARM_V3_INVALID_DECOR'; end if;
      select coalesce(array_agg(distinct id),'{}'::text[]) into decor_ids from jsonb_array_elements_text(p_payload->'decorations') id;
      if exists(select 1 from unnest(decor_ids) id where not exists(select 1 from public.farm_v3_unlocks u
        where u.user_id=current_user_id and u.kind='decor' and u.item_id=id)) then raise exception 'FARM_V3_LOCKED'; end if;
      update public.farm_v3_profiles set decorations=decor_ids where user_id=current_user_id;
      event:=jsonb_build_object('kind','decor');
    end if;
    update public.farm_v3_profiles set version=version+1,updated_at=now() where user_id=current_user_id;
  end if;
  new_unlocks:=public.farm_v3_refresh_unlocks(current_user_id);
  event:=event||jsonb_build_object('unlocks',new_unlocks);
  -- Only immutable event facts need permanent storage. Rebuild the current
  -- state on retries instead of retaining a full catalog snapshot per Coin.
  perform public.farm_action_finish(current_user_id,p_request_id,jsonb_build_object('event',event));
  return public.farm_v3_result_json(current_user_id,event);
end;
$$;
revoke all on function public.perform_my_farm_v3_action(text,jsonb,uuid) from public,anon;
grant execute on function public.perform_my_farm_v3_action(text,jsonb,uuid) to authenticated;

create or replace function public.get_farm_v3_plaza(p_page integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_page is null or p_page not between 0 and 100000 then raise exception 'FARM_V3_INVALID_PAGE'; end if;
  select jsonb_build_object('snapshotAt',now(),'page',p_page,
    'total',(select count(*) from public.farm_v3_profiles where plaza_public),
    'items',coalesce(jsonb_agg(jsonb_build_object('id',p.user_id,'nickname',p.nickname,'characterId',p.character_id,'position',jsonb_build_object('x',p.plaza_x,'y',p.plaza_y),'pose',p.plaza_pose,'zone',p.plaza_zone,'isMe',p.user_id=auth.uid()) order by p.user_id),'[]'::jsonb))
    into result from (select user_id,nickname,character_id,plaza_x,plaza_y,plaza_pose,plaza_zone from public.farm_v3_profiles
      where plaza_public order by user_id limit 12 offset p_page*12) p;
  return result;
end;
$$;
revoke all on function public.get_farm_v3_plaza(integer) from public,anon;
grant execute on function public.get_farm_v3_plaza(integer) to authenticated;

notify pgrst,'reload schema';
commit;
