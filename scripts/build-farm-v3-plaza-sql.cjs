const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'supabase/migrations');
const source=fs.readFileSync(path.join(dir,'097_representative_characters.sql'),'utf8');
const extract=name=>{const match=source.match(new RegExp(`create or replace function public\\.${name}\\([^]*?\\$\\$;`));if(!match)throw Error(name);return match[0];};
const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'farm-v3-catalog.js'),'utf8'),context);
// 098 is historical. The additional friends are introduced by 103.
const rows=context.window.FarmV3Catalog.items.filter(i=>i.kind==='character').slice(0,8).map((i,index)=>`('character','${i.id}','${i.name.replaceAll("'","''")}',0,${i.harvests},${i.fish},${i.cropTypes},${i.fishTypes},${91+index})`);
const state=extract('farm_v3_state_json').replace("'charactersVersion',1,","'charactersVersion',1,'plazaPositionVersion',1,").replace("'pose',p.plaza_pose,'zone',p.plaza_zone,","'position',jsonb_build_object('x',p.plaza_x,'y',p.plaza_y),'pose',p.plaza_pose,'zone',p.plaza_zone,");
const action=extract('perform_my_farm_v3_action')
  .replace('appearance jsonb; decor_ids text[];','appearance jsonb; decor_ids text[]; next_x numeric; next_y numeric;')
  .replace(/elsif p_action='plaza' then[^]*?event:=jsonb_build_object\('kind','plaza'\);/,`elsif p_action='plaza' then
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
      event:=jsonb_build_object('kind','plaza');`);
// Deprecated pose/zone fields remain readable for already-open older clients;
// current clients use positions only, and old forms cannot reset positions.
const plaza=extract('get_farm_v3_plaza').replace("'pose',p.plaza_pose,'zone',p.plaza_zone,","'position',jsonb_build_object('x',p.plaza_x,'y',p.plaza_y),'pose',p.plaza_pose,'zone',p.plaza_zone,").replace('select user_id,nickname,character_id,plaza_pose,plaza_zone','select user_id,nickname,character_id,plaza_x,plaza_y,plaza_pose,plaza_zone');
if(!state.includes('plazaPositionVersion')||!action.includes("if p_payload ? 'position' then")||!plaza.includes('plaza_x,plaza_y'))throw Error('097 source changed');
fs.writeFileSync(path.join(dir,'098_plaza_positions_and_character_goals.sql'),`begin;

-- Harder future unlocks. Existing ownership is permanent and is not revoked.
insert into public.farm_v3_catalog(kind,item_id,name,growth_cost,need_harvests,need_fish,need_crop_types,need_fish_types,sort_order) values
  ${rows.join(',\n  ')}
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

${state}
revoke all on function public.farm_v3_state_json(uuid) from public,anon,authenticated;

${action}
revoke all on function public.perform_my_farm_v3_action(text,jsonb,uuid) from public,anon;
grant execute on function public.perform_my_farm_v3_action(text,jsonb,uuid) to authenticated;

${plaza}
revoke all on function public.get_farm_v3_plaza(integer) from public,anon;
grant execute on function public.get_farm_v3_plaza(integer) to authenticated;

notify pgrst,'reload schema';
commit;
`);
console.log('Generated 098: harder goals and saved plaza positions.');
require('./build-farm-v3-speech-sql.cjs');
