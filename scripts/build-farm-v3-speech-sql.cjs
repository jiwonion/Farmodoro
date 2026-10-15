const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'supabase/migrations');
const source=fs.readFileSync(path.join(dir,'098_plaza_positions_and_character_goals.sql'),'utf8');
const extract=name=>{const match=source.match(new RegExp(`create or replace function public\\.${name}\\([^]*?\\$\\$;`));if(!match)throw Error(name);return match[0];};
const state=extract('farm_v3_state_json')
  .replace("'plazaPositionVersion',1,","'plazaPositionVersion',1,'plazaSpeechVersion',1,")
  .replace("'plazaPublic',p.plaza_public,","'plazaPublic',p.plaza_public,'speech',p.plaza_message,");
const action=extract('perform_my_farm_v3_action')
  .replace('next_x numeric; next_y numeric;','next_x numeric; next_y numeric; next_speech text;')
  .replace('next_x:=profile_row.plaza_x; next_y:=profile_row.plaza_y;',`next_speech:=profile_row.plaza_message;
      if p_payload ? 'speech' then
        if jsonb_typeof(p_payload->'speech') is distinct from 'string'
          or char_length(p_payload->>'speech')>80 or (p_payload->>'speech')~'[[:cntrl:]]' or (p_payload->>'speech')~U&'[\\007F-\\009F]'
          then raise exception 'FARM_V3_INVALID_SPEECH'; end if;
        next_speech:=btrim(p_payload->>'speech');
      end if;
      next_x:=profile_row.plaza_x; next_y:=profile_row.plaza_y;`)
  .replace('plaza_x=round(next_x,2),plaza_y=round(next_y,2) where user_id=current_user_id;',
    'plaza_x=round(next_x,2),plaza_y=round(next_y,2),plaza_message=next_speech where user_id=current_user_id;');
const plaza=extract('get_farm_v3_plaza')
  .replace("'nickname',p.nickname,","'nickname',p.nickname,'speech',p.plaza_message,")
  .replace('select user_id,nickname,character_id,','select user_id,nickname,plaza_message,character_id,');
if(!state.includes('plazaSpeechVersion')||!action.includes('plaza_message=next_speech')||!plaza.includes('nickname,plaza_message,character_id'))throw Error('098 source changed');
fs.writeFileSync(path.join(dir,'099_plaza_speech.sql'),`begin;

-- One saved line per villager. Older forms omit speech and retain the last line.
alter table public.farm_v3_profiles add column if not exists plaza_message text not null default '';
alter table public.farm_v3_profiles drop constraint if exists farm_v3_plaza_message_check;
alter table public.farm_v3_profiles add constraint farm_v3_plaza_message_check
  check(char_length(plaza_message)<=80 and plaza_message !~ '[[:cntrl:]]' and plaza_message !~ U&'[\\007F-\\009F]');

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
console.log('Generated 099: saved plaza speech.');
require('./build-farm-v3-paths-sql.cjs');
