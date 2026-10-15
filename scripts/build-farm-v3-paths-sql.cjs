const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'supabase/migrations');
const extract=(file,name)=>{const source=fs.readFileSync(path.join(dir,file),'utf8'),match=source.match(new RegExp(`create or replace function public\\.${name}\\([^]*?\\$\\$;`));if(!match)throw Error(name);return match[0];};
const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'farm-v3-catalog.js'),'utf8'),context);
const crops=context.window.FarmV3Catalog.items.filter(i=>i.kind==='crop');
const rows=crops.flatMap(crop=>crop.cropRequirements.map(req=>`('${crop.id}','${req.id}',${req.count})`));
const refresh=extract('097_representative_characters.sql','farm_v3_refresh_unlocks').replace(
  'and c.need_crop_types<=crop_types and c.need_fish_types<=fish_types',
  `and c.need_crop_types<=crop_types and c.need_fish_types<=fish_types
      and not exists(select 1 from public.farm_v3_crop_requirements req
        left join public.farm_v3_collections collected on collected.user_id=p_user_id and collected.kind='crop' and collected.item_id=req.crop_id
        where c.kind='crop' and req.item_id=c.item_id and coalesce(collected.total,0)<req.need_count)`);
const state=extract('099_plaza_speech.sql','farm_v3_state_json')
  .replace("'plazaSpeechVersion',1,","'plazaSpeechVersion',1,'plazaAllUsersVersion',1,'cropUnlockVersion',1,")
  .replace("'plazaPublic',p.plaza_public,","'plazaPublic',true,")
  .replace("'harvests',c.need_harvests,",`'cropRequirements',coalesce((select jsonb_agg(jsonb_build_object('id',req.crop_id,'count',req.need_count) order by req.crop_id)
        from public.farm_v3_crop_requirements req where c.kind='crop' and req.item_id=c.item_id),'[]'::jsonb),
      'harvests',c.need_harvests,`);
const action=extract('099_plaza_speech.sql','perform_my_farm_v3_action')
  .replace("if jsonb_typeof(p_payload->'public') is distinct from 'boolean' or jsonb_typeof(p_payload->'nickname') is distinct from 'string'", "if jsonb_typeof(p_payload->'nickname') is distinct from 'string'")
  .replace("plaza_public=(p_payload->>'public')::boolean,",'plaza_public=true,');
const plaza=extract('099_plaza_speech.sql','get_farm_v3_plaza').replace(' where plaza_public)',')').replace('where plaza_public order by user_id','order by user_id');
if(rows.length!==52||!refresh.includes('coalesce(collected.total,0)<req.need_count')||!state.includes('cropUnlockVersion')||!action.includes('plaza_public=true,')||plaza.includes('where plaza_public'))throw Error('Unexpected prior migration/catalog');
fs.writeFileSync(path.join(dir,'100_public_plaza_and_crop_paths.sql'),`begin;

-- All signed-in farmers participate; retain the old column for older clients.
alter table public.farm_v3_profiles alter column plaza_public set default true;
update public.farm_v3_profiles set plaza_public=true,version=version+1,updated_at=now() where not plaza_public;

create table if not exists public.farm_v3_crop_requirements (
  item_id text not null,
  crop_id text not null,
  need_count integer not null check(need_count between 1 and 1000),
  kind text not null default 'crop' check(kind='crop'),
  primary key(item_id,crop_id),
  foreign key(kind,item_id) references public.farm_v3_catalog(kind,item_id),
  foreign key(kind,crop_id) references public.farm_v3_catalog(kind,item_id),
  check(item_id<>crop_id)
);
alter table public.farm_v3_crop_requirements enable row level security;
revoke all on public.farm_v3_crop_requirements from public,anon,authenticated;
grant select on public.farm_v3_crop_requirements to authenticated;
drop policy if exists "Read crop requirements" on public.farm_v3_crop_requirements;
create policy "Read crop requirements" on public.farm_v3_crop_requirements for select to authenticated using(true);
-- Replace catalog configuration only. Acquired unlocks and collections stay.
delete from public.farm_v3_crop_requirements;
insert into public.farm_v3_crop_requirements(item_id,crop_id,need_count) values
  ${rows.join(',\n  ')};
update public.farm_v3_catalog set need_harvests=0,need_crop_types=0 where kind='crop';

${refresh}
revoke all on function public.farm_v3_refresh_unlocks(uuid) from public,anon,authenticated;

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
console.log('Generated 100: automatic plaza participation and crop-specific paths.');
require('./build-farm-v3-decor-sql.cjs');
const cropRows=crops.map(crop=>`| ${crop.name} | ${crop.cropRequirements.map(req=>`${crops.find(c=>c.id===req.id).name} ${req.count}회 수확`).join(' + ')||'기본 제공'} | ${crop.cost} Coin |`);
fs.writeFileSync(path.join(root,'docs/farm-v3-crop-paths.md'),`# 작물별 해금 경로\n\n100 마이그레이션 기준. 기존에 획득한 해금은 유지하고 이후 해금에 아래 조건을 사용한다. 총 수확 횟수로 다른 작물을 대신 해금할 수 없다. 기본 작물 5개에서 시작해 각 경로의 이전 작물을 3~8회 수확한다. 모든 작물은 도달 가능하며 자기 자신을 요구하지 않는다.\n\n| 작물 | 해금 조건 | 완성 비용 |\n| --- | --- | --- |\n${cropRows.join('\n')}\n`);
