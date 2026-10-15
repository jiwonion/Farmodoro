const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'supabase/migrations');
const extract=(file,name)=>{const sql=fs.readFileSync(path.join(dir,file),'utf8'),match=sql.match(new RegExp(`create or replace function public\\.${name}\\([^]*?\\$\\$;`));if(!match)throw Error(name);return match[0];};
const state=extract('101_manual_farm_decorations.sql','farm_v3_state_json')
  .replace("'manualDecorVersion',1,","'manualDecorVersion',1,'wateringVersion',1,'serverNow',now(),")
  .replace("'progress',r.progress,'cost',r.growth_cost)","'progress',r.progress,'cost',r.growth_cost,'waterReadyAt',case when r.kind='crop' and r.last_watered_at is not null then r.last_watered_at+interval '5 hours' else null end)");
const action=extract('100_public_plaza_and_crop_paths.sql','perform_my_farm_v3_action')
  .replace("('plant','grow','harvest'","('plant','water','grow','harvest'")
  .replace("  elsif p_action in ('grow','fish_grow') then",`  elsif p_action='water' then
    select * into run_row from public.farm_v3_runs where id=(p_payload->>'runId')::uuid
      and user_id=current_user_id and kind='crop' for update;
    if not found or run_row.claimed_at is not null then raise exception 'FARM_V3_RUN_NOT_FOUND'; end if;
    if run_row.progress>=run_row.growth_cost then raise exception 'FARM_V3_COMPLETE'; end if;
    if run_row.last_watered_at is not null and run_row.last_watered_at>now()-interval '5 hours'
      then raise exception 'FARM_V3_WATER_COOLDOWN'; end if;
    update public.farm_v3_runs set progress=least(growth_cost,progress+1),last_watered_at=now()
      where id=run_row.id returning * into run_row;
    event:=jsonb_build_object('kind','watered','runId',run_row.id,'growth',1,
      'completed',run_row.progress=run_row.growth_cost,'nextWaterAt',run_row.last_watered_at+interval '5 hours');
  elsif p_action in ('grow','fish_grow') then`);
if(!state.includes('waterReadyAt')||!action.includes("p_action='water' then"))throw Error('Prior migration changed');
fs.writeFileSync(path.join(dir,'102_farm_free_watering.sql'),`begin;

-- Each newly planted crop can be watered immediately, then every five hours.
-- Water adds one growth point for free. No time growth or withering is added.
alter table public.farm_v3_runs add column if not exists last_watered_at timestamptz;

${state}
revoke all on function public.farm_v3_state_json(uuid) from public,anon,authenticated;

${action}
revoke all on function public.perform_my_farm_v3_action(text,jsonb,uuid) from public,anon;
grant execute on function public.perform_my_farm_v3_action(text,jsonb,uuid) to authenticated;

notify pgrst,'reload schema';
commit;
`);
const files=['095_farm_v3_world.sql','096_avatar_parts.sql','097_representative_characters.sql','098_plaza_positions_and_character_goals.sql','099_plaza_speech.sql','100_public_plaza_and_crop_paths.sql','101_manual_farm_decorations.sql','102_farm_free_watering.sql'];
const upgrade=files.map(name=>`-- ${name}\n`+fs.readFileSync(path.join(dir,name),'utf8').replace(/^begin;\s*/i,'').replace(/commit;\s*$/i,''));
fs.writeFileSync(path.join(root,'supabase/operations/2026-10-15-upgrade-farm-v3.sql'),`-- Apply after 094. Safe for partially upgraded farms; runs atomically.\nbegin;\n\n${upgrade.join('\n\n')}\ncommit;\n`);
console.log('Generated 102: free five-hour watering and atomic 095-102 upgrade.');
require('./build-farm-v3-fish-sql.cjs');
