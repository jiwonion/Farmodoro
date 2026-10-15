const fs=require('node:fs'),path=require('node:path');
const target=path.resolve(__dirname,'../supabase/migrations');
const source=fs.readFileSync(path.join(target,'095_farm_v3_world.sql'),'utf8');
const extract=name=>{const fn=source.match(new RegExp(`create or replace function public\\.${name}\\([^]*?\\$\\$;`));if(!fn)throw Error(name);return fn[0];};
const action=extract('perform_my_farm_v3_action').replace(/appearance:=p_payload->'avatar';[^]*?event:=jsonb_build_object\('kind','avatar'\);/,`appearance:=public.farm_v3_normalize_avatar(current_user_id,p_payload->'avatar',profile_row.avatar);
      update public.farm_v3_profiles set avatar=appearance where user_id=current_user_id;
      event:=jsonb_build_object('kind','avatar');`);
const state=extract('farm_v3_state_json').replace("'version',1,","'version',1,'avatarPartsVersion',1,");
if(!action.includes('farm_v3_normalize_avatar')||!state.includes('avatarPartsVersion'))throw Error('Source migration changed');
const sql=`begin;

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

${state}
revoke all on function public.farm_v3_state_json(uuid) from public,anon,authenticated;

${action}
revoke all on function public.perform_my_farm_v3_action(text,jsonb,uuid) from public,anon;
grant execute on function public.perform_my_farm_v3_action(text,jsonb,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
`;
fs.writeFileSync(path.join(target,'096_avatar_parts.sql'),sql);
console.log('Generated 096 avatar parts migration.');
