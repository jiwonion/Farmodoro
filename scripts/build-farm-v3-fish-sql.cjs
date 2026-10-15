// 103 extends the current game without rewriting historical catalog seeds.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'supabase/migrations');
const extract=(file,name)=>{
  const source=fs.readFileSync(path.join(dir,file),'utf8');
  const match=source.match(new RegExp(`create or replace function public\\.${name}\\([^]*?\\$\\$;`));
  if(!match)throw Error(`Missing ${name} in ${file}`);
  return match[0];
};
const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'farm-v3-catalog.js'),'utf8'),context);
const fish=context.window.FarmV3Catalog.items.filter(item=>item.kind==='fish');
const characters=context.window.FarmV3Catalog.items.filter(item=>item.kind==='character');
if(fish.length!==24||characters.length!==16)throw Error('103 expects 24 fish and 16 characters');
const reachable=new Set(fish.filter(item=>!item.fishRequirements.length).map(item=>item.id));
for(let pass=0;pass<fish.length;pass++)for(const item of fish){
  if(item.fishRequirements.every(req=>reachable.has(req.id)))reachable.add(item.id);
}
if(reachable.size!==fish.length||fish.filter(item=>!item.fishRequirements.length).length!==2)throw Error('Fish paths must all be reachable from two starters');
const quote=value=>`'${String(value).replaceAll("'","''")}'`;
const catalogRows=[...fish,...characters].map(item=>`(${[item.kind,item.id,item.name].map(quote).join(',')},${[item.cost,item.harvests,item.fish,item.cropTypes,item.fishTypes,item.order].join(',')})`);
const requirementRows=fish.flatMap(item=>item.fishRequirements.map(req=>{
  if(req.id===item.id||!fish.some(other=>other.id===req.id)||!Number.isInteger(req.count)||req.count<1||req.count>1000)throw Error(`Invalid fish requirement for ${item.id}`);
  return `(${quote(item.id)},${quote(req.id)},${req.count})`;
}));
const refresh=extract('101_manual_farm_decorations.sql','farm_v3_refresh_unlocks').replace(
  '    on conflict(user_id,kind,item_id)',
  `      and not exists(select 1 from public.farm_v3_fish_requirements req
        left join public.farm_v3_collections collected on collected.user_id=p_user_id and collected.kind='fish' and collected.item_id=req.fish_id
        where c.kind='fish' and req.item_id=c.item_id and coalesce(collected.total,0)<req.need_count)
    on conflict(user_id,kind,item_id)`);
const state=extract('102_farm_free_watering.sql','farm_v3_state_json')
  .replace("'cropUnlockVersion',1,","'cropUnlockVersion',1,'fishUnlockVersion',1,")
  .replace("      'harvests',c.need_harvests,",`      'fishRequirements',coalesce((select jsonb_agg(jsonb_build_object('id',req.fish_id,'count',req.need_count) order by req.fish_id)
        from public.farm_v3_fish_requirements req where c.kind='fish' and req.item_id=c.item_id),'[]'::jsonb),
      'harvests',c.need_harvests,`);
if(requirementRows.length!==22||!refresh.includes("collected.kind='fish'")||!state.includes("'fishRequirements'"))throw Error('Prior migration/catalog changed');
fs.writeFileSync(path.join(dir,'103_fish_species_paths_and_friends.sql'),`begin;

-- Configuration only. Existing unlocks, collections, active runs, profiles,
-- wallets and ledger entries are retained, including old total-based unlocks.
insert into public.farm_v3_catalog(kind,item_id,name,growth_cost,need_harvests,need_fish,need_crop_types,need_fish_types,sort_order) values
  ${catalogRows.join(',\n  ')}
on conflict(kind,item_id) do update set name=excluded.name,growth_cost=excluded.growth_cost,
  need_harvests=excluded.need_harvests,need_fish=excluded.need_fish,
  need_crop_types=excluded.need_crop_types,need_fish_types=excluded.need_fish_types,sort_order=excluded.sort_order;

create table if not exists public.farm_v3_fish_requirements (
  item_id text not null,
  fish_id text not null,
  need_count integer not null check(need_count between 1 and 1000),
  kind text not null default 'fish' check(kind='fish'),
  primary key(item_id,fish_id),
  foreign key(kind,item_id) references public.farm_v3_catalog(kind,item_id),
  foreign key(kind,fish_id) references public.farm_v3_catalog(kind,item_id),
  check(item_id<>fish_id)
);
alter table public.farm_v3_fish_requirements enable row level security;
revoke all on public.farm_v3_fish_requirements from public,anon,authenticated;
grant select on public.farm_v3_fish_requirements to authenticated;
drop policy if exists "Read fish requirements" on public.farm_v3_fish_requirements;
create policy "Read fish requirements" on public.farm_v3_fish_requirements for select to authenticated using(true);
delete from public.farm_v3_fish_requirements;
insert into public.farm_v3_fish_requirements(item_id,fish_id,need_count) values
  ${requirementRows.join(',\n  ')};

${refresh}
revoke all on function public.farm_v3_refresh_unlocks(uuid) from public,anon,authenticated;

${state}
revoke all on function public.farm_v3_state_json(uuid) from public,anon,authenticated;

-- Existing state/action RPCs call ensure_farm_v3_user and refresh_unlocks.
-- Catch claims increment the matching species before refreshing these paths;
-- fish starts and representative selection retain server ownership checks.
notify pgrst,'reload schema';
commit;
`);
const files=['095_farm_v3_world.sql','096_avatar_parts.sql','097_representative_characters.sql','098_plaza_positions_and_character_goals.sql','099_plaza_speech.sql','100_public_plaza_and_crop_paths.sql','101_manual_farm_decorations.sql','102_farm_free_watering.sql','103_fish_species_paths_and_friends.sql'];
const upgrade=files.map(name=>`-- ${name}\n`+fs.readFileSync(path.join(dir,name),'utf8').replace(/^begin;\s*/i,'').replace(/commit;\s*$/i,''));
fs.writeFileSync(path.join(root,'supabase/operations/2026-10-15-upgrade-farm-v3.sql'),`-- Apply after 094. Safe for partially upgraded farms; runs atomically.\nbegin;\n\n${upgrade.join('\n\n')}\ncommit;\n`);
const fishRows=fish.map(item=>`| ${item.name} | ${item.fishRequirements.map(req=>`${fish.find(other=>other.id===req.id).name} ${req.count}마리`).join(' + ')||'기본 제공'} | ${item.cost} Coin |`);
const characterRows=characters.map(item=>`| ${item.name} | ${[item.harvests?`작물 수확 ${item.harvests}회`:null,item.fish?`물고기 획득 ${item.fish}회`:null,item.cropTypes?`작물 ${item.cropTypes}종 수집`:null,item.fishTypes?`물고기 ${item.fishTypes}종 수집`:null].filter(Boolean).join(' + ')||'기본 제공'} |`);
fs.writeFileSync(path.join(root,'docs/farm-v3-fish-paths.md'),`# 물고기별 해금과 추가 친구\n\n2026-10-15. 103 마이그레이션은 물고기를 24종, 대표 캐릭터를 16종으로 확장한다. 물고기는 전체 포획 횟수 대신 특정 어종의 누적 수집 수량으로 해금한다. 피라미·붕어 두 시작 어종에서 모든 물고기에 도달할 수 있고, 각 경로는 앞선 어종 3~8마리를 요구한다. 기존 해금·도감·진행·대표 선택·Coin·Farm Money는 보존한다.\n\n| 물고기 | 해금 조건 | 한 마리 완성 비용 |\n| --- | --- | --- |\n${fishRows.join('\n')}\n\n| 대표 캐릭터 | 해금 조건 (모두 충족) |\n| --- | --- |\n${characterRows.join('\n')}\n\n물고기 도감과 선택 목록은 서버가 반환한 \`fishRequirements: [{id,count}]\` 및 \`fishUnlockVersion:1\`을 사용한다. 서버는 물고기 획득 직후 해당 어종의 도감 수량을 올리고 새 해금을 응답한다. 요구 어종과 무관한 물고기를 많이 잡아도 다른 경로를 열 수 없다. 이미 소유한 물고기는 새 조건에 미달해도 유지한다. 대표 친구의 횟수·종류 조건도 서버에서 검증하며 대표 선택은 무료다.\n\n## 적용\n\n기존 102까지 적용된 DB에는 [103 SQL](../supabase/migrations/103_fish_species_paths_and_friends.sql)을 적용한다. 094 이후 통합 업그레이드는 [095~103 SQL](../supabase/operations/2026-10-15-upgrade-farm-v3.sql)을 사용한다. 이 작업은 로컬 격리 DB에서만 실행했으며 운영 DB에는 적용하지 않았다.\n\n생성: \`node scripts/build-farm-v3-fish-sql.cjs\`. 현재 카탈로그만 읽고 역사적 095~102의 시드는 변경하지 않는다. 102 생성기를 실행해도 마지막에 103 생성기를 호출해 통합 SQL이 최신 상태를 유지한다.\n\n검증: \`node tests/farm-v3-fish-sql.cjs\`. 실제 PGlite PostgreSQL에서 기존 기록 보존, 새 계정의 두 시작 어종, 종별 경로와 도달성, 실제 획득 직후 해금, 중복·다른 사용자·잠긴 어종 거부, 새 대표의 복합 조건·선택·광장 반영, RLS, 개별·통합 SQL 재적용을 확인한다.\n`);
console.log('Generated 103: 24 species with fish-specific paths, 16 friends and atomic 095-103 upgrade.');
