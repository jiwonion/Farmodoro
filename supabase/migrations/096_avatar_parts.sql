begin;

-- Paper-doll avatar parts. Existing balances, collections and outfits remain.
create or replace function public.farm_v3_normalize_avatar(p_user_id uuid,p_avatar jsonb,p_previous jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; field text; value text; piece jsonb; preset text:=p_avatar->>'outfit';
begin
  if jsonb_typeof(p_avatar) is distinct from 'object'
    or coalesce(p_avatar->>'gender','') not in ('male','female','neutral')
    or coalesce(p_avatar->>'skin','') !~ '^[0-4]$'
    or coalesce(p_avatar->>'hair','') !~ '^[0-7]$'
    or coalesce(p_avatar->>'style','') !~ '^[0-3]$' then raise exception 'FARM_V3_INVALID_AVATAR'; end if;
  if not exists(select 1 from public.farm_v3_unlocks where user_id=p_user_id and kind='outfit' and item_id=preset)
    then raise exception 'FARM_V3_LOCKED'; end if;
  if nullif(p_avatar->>'hat','') is not null and not exists(select 1 from public.farm_v3_unlocks where user_id=p_user_id and kind='hat' and item_id=p_avatar->>'hat')
    then raise exception 'FARM_V3_LOCKED'; end if;
  result:=jsonb_build_object('gender',p_avatar->>'gender','skin',(p_avatar->>'skin')::integer,
    'hair',(p_avatar->>'hair')::integer,'style',(p_avatar->>'style')::integer,'outfit',preset,'hat',nullif(p_avatar->>'hat',''));
  foreach field in array array['eyes','nose','mouth'] loop
    value:=coalesce(p_avatar->>field,p_previous->>field,'0');
    if value !~ '^[0-3]$' then raise exception 'FARM_V3_INVALID_AVATAR'; end if;
    result:=result||jsonb_build_object(field,value::integer);
  end loop;
  foreach field in array array['top','bottom','shoes'] loop
    if p_avatar ? field then piece:=p_avatar->field;
    elsif preset is distinct from p_previous->>'outfit' then piece:=to_jsonb(preset);
    else piece:=coalesce(p_previous->field,to_jsonb(preset)); end if;
    if piece<>'null'::jsonb and (jsonb_typeof(piece)<>'string' or not exists(
      select 1 from public.farm_v3_unlocks where user_id=p_user_id and kind='outfit' and item_id=piece#>>'{}'))
      then raise exception 'FARM_V3_LOCKED'; end if;
    result:=result||jsonb_build_object(field,piece);
  end loop;
  return result;
end;
$$;
revoke all on function public.farm_v3_normalize_avatar(uuid,jsonb,jsonb) from public,anon,authenticated;

alter table public.farm_v3_profiles alter column avatar set default
  '{"gender":"neutral","skin":0,"hair":0,"style":0,"eyes":0,"nose":0,"mouth":0,"outfit":"blue","top":"blue","bottom":"blue","shoes":"blue","hat":null}'::jsonb;
update public.farm_v3_profiles set avatar=jsonb_build_object('eyes',0,'nose',0,'mouth',0,
  'top',avatar->>'outfit','bottom',avatar->>'outfit','shoes',avatar->>'outfit')||avatar,
  version=version+1,updated_at=now()
where not (avatar ?& array['eyes','nose','mouth','top','bottom','shoes']);

create or replace function public.farm_v3_state_json(p_user_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'version',1,'avatarPartsVersion',1,
    'coinBalance',(select coin_balance from public.farm_wallets where user_id=p_user_id),
    'profile',(select jsonb_build_object('nickname',p.nickname,'avatar',p.avatar,'decorations',p.decorations,
      'plazaPublic',p.plaza_public,'pose',p.plaza_pose,'zone',p.plaza_zone,'version',p.version) from public.farm_v3_profiles p where p.user_id=p_user_id),
    'runs',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'kind',r.kind,'itemId',r.item_id,'slot',r.slot,
      'progress',r.progress,'cost',r.growth_cost) order by r.kind,r.slot) from public.farm_v3_runs r where r.user_id=p_user_id and r.claimed_at is null),'[]'::jsonb),
    'collections',coalesce((select jsonb_agg(jsonb_build_object('kind',c.kind,'id',c.item_id,'count',c.total,'firstAt',c.first_at) order by c.kind,c.item_id)
      from public.farm_v3_collections c where c.user_id=p_user_id),'[]'::jsonb),
    'unlocks',coalesce((select jsonb_agg(jsonb_build_object('kind',u.kind,'id',u.item_id) order by u.kind,u.item_id)
      from public.farm_v3_unlocks u where u.user_id=p_user_id),'[]'::jsonb),
    'catalog',coalesce((select jsonb_agg(jsonb_build_object('kind',c.kind,'id',c.item_id,'name',c.name,'cost',c.growth_cost,
      'harvests',c.need_harvests,'fish',c.need_fish,'cropTypes',c.need_crop_types,'fishTypes',c.need_fish_types) order by c.sort_order)
      from public.farm_v3_catalog c),'[]'::jsonb)
  );
$$;
revoke all on function public.farm_v3_state_json(uuid) from public,anon,authenticated;

create or replace function public.perform_my_farm_v3_action(p_action text,p_payload jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  current_user_id uuid:=auth.uid(); cached jsonb; selected public.farm_v3_catalog%rowtype;
  run_row public.farm_v3_runs%rowtype; profile_row public.farm_v3_profiles%rowtype;
  item_kind text; selected_slot integer; amount integer; spent integer; balance bigint;
  event jsonb:='{}'::jsonb; new_unlocks jsonb; appearance jsonb; decor_ids text[];
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if p_action is null or p_action not in ('plant','grow','harvest','fish_start','fish_grow','fish_claim','avatar','plaza','decor') then raise exception 'FARM_V3_UNKNOWN_ACTION'; end if;
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
    if p_action='avatar' then
      appearance:=public.farm_v3_normalize_avatar(current_user_id,p_payload->'avatar',profile_row.avatar);
      update public.farm_v3_profiles set avatar=appearance where user_id=current_user_id;
      event:=jsonb_build_object('kind','avatar');
    elsif p_action='plaza' then
      if jsonb_typeof(p_payload->'public') is distinct from 'boolean' or char_length(btrim(coalesce(p_payload->>'nickname',''))) not between 1 and 24
        or (p_payload->>'nickname')~'[[:cntrl:]]' or coalesce(p_payload->>'pose','') not in ('stand','sit')
        or coalesce(p_payload->>'zone','') not in ('square','bench','tree') then raise exception 'FARM_V3_INVALID_PLAZA'; end if;
      update public.farm_v3_profiles set nickname=btrim(p_payload->>'nickname'),plaza_public=(p_payload->>'public')::boolean,
        plaza_pose=p_payload->>'pose',plaza_zone=p_payload->>'zone' where user_id=current_user_id;
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
notify pgrst,'reload schema';
commit;
