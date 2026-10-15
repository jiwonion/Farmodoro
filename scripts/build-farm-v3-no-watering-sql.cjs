// Forward-only retirement: retain historical watering progress and action logs.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'supabase/migrations');
const extract=(file,name)=>{
  const sql=fs.readFileSync(path.join(dir,file),'utf8');
  const match=sql.match(new RegExp(`create or replace function public\\.${name}\\([^]*?\\$\\$;`));
  if(!match)throw Error(`Missing ${name} in ${file}`);
  return match[0];
};
const state=extract('103_fish_species_paths_and_friends.sql','farm_v3_state_json')
  .replace("'wateringVersion',1,","'wateringVersion',0,")
  .replace("'waterReadyAt',case when r.kind='crop' and r.last_watered_at is not null then r.last_watered_at+interval '5 hours' else null end","'waterReadyAt',null");
const action=extract('102_farm_free_watering.sql','perform_my_farm_v3_action')
  .replace("  if p_action is null or p_action not in ('plant','water','grow'",`  -- Reject before action-log lookup, including old successful and pending UUIDs.
  -- Retain their audit rows and all previously earned growth without replaying water.
  if p_action='water' then raise exception 'FARM_V3_WATERING_RETIRED'; end if;
  if p_action is null or p_action not in ('plant','grow'`)
  .replace(/  elsif p_action='water' then[^]*?(?=  elsif p_action in \('grow','fish_grow'\) then)/,'');
if(!state.includes("'wateringVersion',0,")||!state.includes("'waterReadyAt',null")||state.includes('last_watered_at')
  ||!action.includes('FARM_V3_WATERING_RETIRED')||action.includes("event:=jsonb_build_object('kind','watered'"))throw Error('Historical watering functions changed');
fs.writeFileSync(path.join(dir,'104_remove_farm_watering.sql'),`begin;

-- Retire free watering without changing free planting or Coin growth costs.
-- Keep last_watered_at and historical action logs for audit/backward compatibility;
-- no runs, progress, claims, collections, unlocks, profiles or balances are reset.

${state}
revoke all on function public.farm_v3_state_json(uuid) from public,anon,authenticated;

${action}
revoke all on function public.perform_my_farm_v3_action(text,jsonb,uuid) from public,anon;
grant execute on function public.perform_my_farm_v3_action(text,jsonb,uuid) to authenticated;

notify pgrst,'reload schema';
commit;
`);
const files=['095_farm_v3_world.sql','096_avatar_parts.sql','097_representative_characters.sql','098_plaza_positions_and_character_goals.sql','099_plaza_speech.sql','100_public_plaza_and_crop_paths.sql','101_manual_farm_decorations.sql','102_farm_free_watering.sql','103_fish_species_paths_and_friends.sql','104_remove_farm_watering.sql'];
const upgrade=files.map(name=>`-- ${name}\n`+fs.readFileSync(path.join(dir,name),'utf8').replace(/^begin;\s*/i,'').replace(/commit;\s*$/i,''));
fs.writeFileSync(path.join(root,'supabase/operations/2026-10-15-upgrade-farm-v3.sql'),`-- Apply after 094. Safe for partially upgraded farms; runs atomically.\nbegin;\n\n${upgrade.join('\n\n')}\ncommit;\n`);
console.log('Generated 104: watering retired, existing progress retained, free planting and paid growth unchanged; atomic 095-104 upgrade.');
