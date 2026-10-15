// Keep migration reference data and the client visual catalog in agreement.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const context = {window:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,'farm-v3-catalog.js'),'utf8'),context);
// 095 is historical. New representative characters are seeded by 097 instead.
const items = context.window.FarmV3Catalog.legacyItems;
const rows = items.map(i=>`('${i.kind}','${i.id}','${i.name.replaceAll("'","''")}',${i.cost},${i.harvests},${i.fish},${i.cropTypes},${i.fishTypes},${i.order})`);
const seed = `insert into public.farm_v3_catalog(kind,item_id,name,growth_cost,need_harvests,need_fish,need_crop_types,need_fish_types,sort_order) values\n  ${rows.join(',\n  ')}\non conflict(kind,item_id) do update set name=excluded.name,growth_cost=excluded.growth_cost,\n  need_harvests=excluded.need_harvests,need_fish=excluded.need_fish,need_crop_types=excluded.need_crop_types,\n  need_fish_types=excluded.need_fish_types,sort_order=excluded.sort_order;`;
const migrationPath = path.join(root,'supabase/migrations/095_farm_v3_world.sql');
let sql = fs.readFileSync(migrationPath,'utf8');
sql = sql.replace(/-- BEGIN GENERATED CATALOG[^]*?-- END GENERATED CATALOG/,()=>`-- BEGIN GENERATED CATALOG\n${seed}\n-- END GENERATED CATALOG`);
const old = fs.readFileSync(path.join(root,'supabase/migrations/094_free_scenery_access.sql'),'utf8');
const state = old.match(/create or replace function public\.farm_scenery_state_json\([^]*?\$\$;/)[0].replace("'freeGrowth', true,","'freeGrowth', true,\n    'archived', true,");
sql = sql.replace(/-- BEGIN ARCHIVED SCENERY STATE[^]*?-- END ARCHIVED SCENERY STATE/,()=>`-- BEGIN ARCHIVED SCENERY STATE\n${state}\nrevoke all on function public.farm_scenery_state_json(uuid) from public,anon,authenticated;\n-- END ARCHIVED SCENERY STATE`);
fs.writeFileSync(migrationPath,sql);
console.log(`Generated ${items.length} catalog rows and archived scenery state.`);
