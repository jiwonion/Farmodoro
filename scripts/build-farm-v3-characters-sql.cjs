// 097 extends the existing farm RPCs without rewriting historical migrations.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),migrations=path.join(root,'supabase/migrations');
const base=fs.readFileSync(path.join(migrations,'095_farm_v3_world.sql'),'utf8');
const parts=fs.readFileSync(path.join(migrations,'096_avatar_parts.sql'),'utf8');
const extract=(source,name)=>{const match=source.match(new RegExp(`create or replace function public\\.${name}\\([^]*?\\$\\$;`));if(!match)throw Error(name);return match[0];};
const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'farm-v3-catalog.js'),'utf8'),context);
// 097 is historical. Later difficulty changes are written by 098.
const initialRequirements=[[0,0],[0,1],[3,0],[6,0],[10,0],[5,5],[0,12],[25,20]];
const characters=context.window.FarmV3Catalog.items.filter(item=>item.kind==='character').slice(0,8).map((item,index)=>({...item,harvests:initialRequirements[index][0],fish:initialRequirements[index][1],order:91+index}));
const rows=characters.map(i=>`('character','${i.id}','${i.name.replaceAll("'","''")}',0,${i.harvests},${i.fish},${i.cropTypes},${i.fishTypes},${i.order})`);
const active="('crop','fish','decor','character')";
const refresh=extract(base,'farm_v3_refresh_unlocks').replace('where c.need_harvests',`where c.kind in ${active} and c.need_harvests`);
const state=extract(base,'farm_v3_state_json')
  .replace("'version',1,","'version',1,'charactersVersion',1,")
  .replace("'avatar',p.avatar","'characterId',p.character_id")
  .replace('from public.farm_v3_unlocks u where u.user_id=p_user_id',`from public.farm_v3_unlocks u where u.user_id=p_user_id and u.kind in ${active}`)
  .replace('from public.farm_v3_catalog c)',`from public.farm_v3_catalog c where c.kind in ${active})`);
const action=extract(parts,'perform_my_farm_v3_action')
  .replace("'fish_claim','avatar','plaza'","'fish_claim','character','avatar','plaza'")
  .replace(/if p_action='avatar' then[^]*?elsif p_action='plaza' then/,`if p_action='character' then
      if jsonb_typeof(p_payload->'characterId') is distinct from 'string' then raise exception 'FARM_V3_UNKNOWN_CHARACTER'; end if;
      select * into selected from public.farm_v3_catalog where kind='character' and item_id=p_payload->>'characterId';
      if not found then raise exception 'FARM_V3_UNKNOWN_CHARACTER'; end if;
      if not exists(select 1 from public.farm_v3_unlocks where user_id=current_user_id and kind='character' and item_id=selected.item_id)
        then raise exception 'FARM_V3_LOCKED'; end if;
      update public.farm_v3_profiles set character_id=selected.item_id where user_id=current_user_id;
      event:=jsonb_build_object('kind','character','characterId',selected.item_id,'name',selected.name);
    elsif p_action='avatar' then
      raise exception 'FARM_V3_AVATAR_RETIRED';
    elsif p_action='plaza' then`);
const plaza=extract(base,'get_farm_v3_plaza').replace("'avatar',p.avatar","'characterId',p.character_id").replace('select user_id,nickname,avatar,plaza_pose','select user_id,nickname,character_id,plaza_pose');
if(!state.includes('charactersVersion')||!action.includes("if p_action='character'")||!plaza.includes('select user_id,nickname,character_id'))throw Error('Source functions changed');
const privateFunction=(sql,signature)=>`${sql}\nrevoke all on function public.${signature} from public,anon,authenticated;`;
fs.writeFileSync(path.join(migrations,'097_representative_characters.sql'),`begin;

-- Keep old outfits, hats and avatar JSON as history. They no longer appear in
-- the active catalog or receive new unlocks. No wallet or collection changes.
alter table public.farm_v3_catalog drop constraint if exists farm_v3_catalog_kind_check;
alter table public.farm_v3_catalog add constraint farm_v3_catalog_kind_check
  check(kind in ('crop','fish','outfit','hat','decor','character'));
insert into public.farm_v3_catalog(kind,item_id,name,growth_cost,need_harvests,need_fish,need_crop_types,need_fish_types,sort_order) values
  ${rows.join(',\n  ')}
on conflict(kind,item_id) do update set name=excluded.name,growth_cost=excluded.growth_cost,
  need_harvests=excluded.need_harvests,need_fish=excluded.need_fish,
  need_crop_types=excluded.need_crop_types,need_fish_types=excluded.need_fish_types,sort_order=excluded.sort_order;

alter table public.farm_v3_profiles add column if not exists character_id text;
update public.farm_v3_profiles set character_id='sprout-slime',version=version+1,updated_at=now() where character_id is null;
alter table public.farm_v3_profiles alter column character_id set default 'sprout-slime';
alter table public.farm_v3_profiles alter column character_id set not null;

${privateFunction(refresh,'farm_v3_refresh_unlocks(uuid)')}

${privateFunction(state,'farm_v3_state_json(uuid)')}

${action}
revoke all on function public.perform_my_farm_v3_action(text,jsonb,uuid) from public,anon;
grant execute on function public.perform_my_farm_v3_action(text,jsonb,uuid) to authenticated;

${plaza}
revoke all on function public.get_farm_v3_plaza(integer) from public,anon;
grant execute on function public.get_farm_v3_plaza(integer) to authenticated;

notify pgrst,'reload schema';
commit;
`);
console.log(`Generated 097 with ${characters.length} representative characters.`);
