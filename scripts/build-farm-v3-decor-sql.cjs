const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'supabase/migrations');
const source=fs.readFileSync(path.join(dir,'100_public_plaza_and_crop_paths.sql'),'utf8').replace(/\r\n/g,'\n');
const extract=name=>{const match=source.match(new RegExp(`create or replace function public\\.${name}\\([^]*?\\$\\$;`));if(!match)throw Error(name);return match[0];};
const refresh=extract('farm_v3_refresh_unlocks')
  .replace('result jsonb; new_decor text[];','result jsonb;')
  .replace(/\n  select array_agg\(entry->>'id'\) into new_decor[^]*?\n  end if;\n  return result;/,'\n  return result;');
const state=extract('farm_v3_state_json').replace("'cropUnlockVersion',1,","'cropUnlockVersion',1,'manualDecorVersion',1,");
if(refresh.includes('new_decor')||refresh.includes('set decorations=')||!state.includes('manualDecorVersion'))throw Error('100 source changed');
fs.writeFileSync(path.join(dir,'101_manual_farm_decorations.sql'),`begin;

-- Previously every unlocked prop was equipped automatically. Clear the old
-- placements once; ownership, crops, wallets, character and plaza stay intact.
-- The marker ensures rerunning this migration preserves later manual choices.
alter table public.farm_v3_profiles add column if not exists decor_manual_ready boolean not null default false;
update public.farm_v3_profiles set decorations='{}'::text[],decor_manual_ready=true,
  version=version+case when cardinality(decorations)>0 then 1 else 0 end,
  updated_at=case when cardinality(decorations)>0 then now() else updated_at end
  where not decor_manual_ready;
alter table public.farm_v3_profiles alter column decor_manual_ready set default true;

${refresh}
revoke all on function public.farm_v3_refresh_unlocks(uuid) from public,anon,authenticated;

${state}
revoke all on function public.farm_v3_state_json(uuid) from public,anon,authenticated;

notify pgrst,'reload schema';
commit;
`);
console.log('Generated 101: unlocks without auto-equipping and one-time old prop cleanup.');
require('./build-farm-v3-watering-sql.cjs');
