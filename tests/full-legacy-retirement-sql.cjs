// Runs the actual 089 migration and retained RPCs in local PostgreSQL/PGlite.
// PGLITE_MODULE can point at an existing @electric-sql/pglite package.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const user = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
const newcomer = '00000000-0000-0000-0000-000000000003';
const root = path.resolve(__dirname, '..');
const source = name => fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8');
const scalar = async (sql, params) => Object.values((await db.query(sql, params)).rows[0])[0];
const number = async (sql, params) => Number(await scalar(sql, params));
const setUser = id => scalar("select set_config('app.test_user',$1,false)", [id || '']);
const migration = source('089_retire_legacy_farm_and_mail.sql');
const migrateFunction = async (file, name) => {
  const match = source(file).match(new RegExp(`create (?:or replace )?function public\\.${name}\\([^]*?\\$\\$;`, 'i'));
  assert.ok(match, `Missing actual SQL function ${name}`);
  await db.exec(match[0]);
};
const state = () => scalar('select public.get_my_farm_state()');
const balances = async (id = user) => (await db.query('select coin_balance,farm_money_balance from public.farm_wallets where user_id=$1', [id])).rows[0];
const call = (name, signature, params) => scalar(`select public.${name}(${signature})`, params);
const asRole = async (role, callback) => {
  await db.exec(`set role ${role}`);
  try { return await callback(); } finally { await db.exec('reset role'); }
};

(async () => {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    insert into auth.users values('${user}'),('${other}');
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('app.test_user',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon;
    create publication supabase_realtime;
    create table public.profiles(id uuid primary key,display_name text,avatar_url text,farm_code text);
    insert into public.profiles values('${user}','Owner',null,'OWNER'),('${other}','Other',null,'OTHER');`);
  await db.exec(source('005_tasks_and_habits.sql').split('create extension if not exists pg_cron')[0]);
  await db.exec(source('006_farm_economy_inventory_mail.sql').split('create or replace function public.current_farm_week_start')[0]);
  await db.exec(source('016_allow_negative_coin.sql').split('create or replace function')[0] + '\ncommit;');
  await db.exec(source('032_wallet_idempotency.sql').split('create or replace function')[0]);
  await db.exec(source('043_farm_cosmetics_shop.sql').split('alter table public.farm_market_rotations')[0]);
  await db.exec(`alter table public.tasks add column completion_cycle_id uuid;
    alter table public.habit_daily_records add column completion_cycle_id uuid;
    alter table public.farm_mail_items add column price_coins integer not null default 0;
    alter table public.farm_mail add column sender_message text;
    create table public.user_focus_progress(user_id uuid primary key references auth.users(id) on delete cascade,
      progress_seconds integer default 0 check(progress_seconds between 0 and 3599),recent_event_ids uuid[] default '{}',
      focus_plot_index smallint,daily_focus_date date,daily_focus_seconds integer default 0,updated_at timestamptz default now());
    alter table public.user_focus_progress enable row level security;
    create policy own_focus on public.user_focus_progress for select to authenticated using(user_id=auth.uid());
    grant select on public.user_focus_progress to authenticated;
    create table public.farm_admins(user_id uuid primary key);
    create table public.farm_admin_broadcasts(id uuid primary key default gen_random_uuid(),sender_user_id uuid);
    create table public.farm_update_mail_deliveries(user_id uuid,version integer);
    create table public.farm_bulletin_posts(id uuid primary key default gen_random_uuid(),user_id uuid,body text);
    create table public.farm_bulletin_comments(id uuid primary key default gen_random_uuid(),user_id uuid,body text);
    create table public.farm_action_locks(user_id uuid primary key references auth.users(id) on delete cascade);
    alter table public.farms enable row level security;
    create policy own_farm on public.farms for select to authenticated using(user_id=auth.uid());
    grant select on public.farms to authenticated;
    -- Deliberately include PUBLIC and independent column grants to test both.
    grant select on public.farm_inventory,public.farm_plots,public.farm_mail,public.farm_mail_items to public,authenticated;
    grant select(item_id),update(quantity) on public.farm_inventory to public,anon,authenticated;
    alter table public.farm_inventory enable row level security;
    create policy legacy_inventory_owner on public.farm_inventory for all to authenticated
      using(user_id=auth.uid()) with check(user_id=auth.uid());
    grant select(production_boost_until) on public.farms to public,authenticated;
    alter publication supabase_realtime add table public.farms,public.farm_wallets,public.farm_weekly_earnings,
      public.farm_inventory,public.farm_plots,public.farm_mail,public.farm_mail_items,public.farm_cosmetics;
  `);
  await migrateFunction('006_farm_economy_inventory_mail.sql', 'current_farm_week_start');
  await migrateFunction('041_farm_plot_grid_reduction.sql', 'ensure_farm_user');
  await migrateFunction('037_wallet_and_farm_state_hardening.sql', 'apply_farm_wallet_change');
  await migrateFunction('038_wallet_idempotency_cleanup.sql', 'cleanup_stale_wallet_idempotency');
  await db.exec(source('051_farm_catalogs_and_action_log.sql'));
  await db.exec(source('071_public_recipes_and_cosmetic_sets.sql'));
  for (const name of ['lock_my_farm_actions', 'begin_my_farm_action']) await migrateFunction('078_retire_farm_decorations.sql', name);
  await migrateFunction('072_diverse_cosmetic_set_effects.sql', 'farm_set_effect_triggers');
  await db.exec(source('063_scheduled_push_notifications.sql').split('-- pg_cron/pg_net')[0] + '\ncommit;');
  for (const name of ['send_farm_mail', 'get_my_farm_state']) await migrateFunction('061_farm_mail_message.sql', name);
  await migrateFunction('060_farm_mail_priced_gifts.sql', 'claim_farm_mail_item');
  await migrateFunction('026_farm_mail_contacts.sql', 'get_my_farm_mail_contacts');
  await migrateFunction('029_farm_mail_unread_count.sql', 'get_my_unclaimed_farm_mail_count');
  await migrateFunction('079_retire_label_effects_two_piece_sets.sql', 'get_farm_leaderboard');
  await migrateFunction('084_productivity_day_starts_at_four.sql', 'productivity_today');
  await db.exec(source('039_atomic_task_habit_completion.sql'));
  await migrateFunction('080_retire_focus_farm_growth.sql', 'record_my_focus_time');
  await migrateFunction('080_retire_focus_farm_growth.sql', 'get_my_focus_progress');
  await migrateFunction('012_connect_farm_wallet.sql', 'get_my_farm_wallet');
  await db.exec('grant execute on function public.get_my_focus_progress(),public.get_my_farm_wallet() to authenticated; revoke all on function public.get_my_focus_progress(),public.get_my_farm_wallet() from public,anon');
  // Simulate leftover old overloads from a differently upgraded deployment.
  const signatures = ['get_my_farm_state_v2()', 'get_my_farm_state_v6()', 'save_my_farm_state(jsonb)',
    'broadcast_farm_update_mail(text,integer)', 'is_farm_admin(uuid)', 'get_farm_bulletin_posts(integer)',
    'plant_farm_seed(smallint,text,uuid)', 'cook_my_farm_recipe(text,integer,uuid)', 'use_farm_free_pass(text,uuid,date,integer,uuid)',
    'record_my_focus_time_v2(uuid,text,integer,smallint,uuid)', 'finalize_previous_farm_week()', 'cleanup_expired_farm_mail()'];
  for (const signature of signatures) {
    await db.exec(`create function public.${signature} returns jsonb language sql security definer as $$select '{}'::jsonb$$;
      grant execute on function public.${signature} to authenticated,anon;`);
  }
  await setUser(user);
  for (const id of [user, other]) await scalar('select public.ensure_farm_user($1::uuid)', [id]);
  await db.exec(source('086_theme_creations.sql'));
  await db.exec(source('087_scenery_unlock_prices.sql'));
  await db.exec(source('088_theme_specific_creations.sql'));
  const historicalTask = randomUUID(), ordinaryTask = randomUUID(), forgedTask = randomUUID();
  const historicalHabit = randomUUID(), ordinaryHabit = randomUUID();
  const taskCycle = randomUUID(), habitCycle = randomUUID();
  await db.query(`insert into public.tasks(id,user_id,title,status,completed_on,completion_reward,completed_with_free_pass,completion_cycle_id,archived_at)
    values($1,$2,'Past pass task','done',current_date-1,2,true,$3,now())`, [historicalTask,user,taskCycle]);
  for (const id of [ordinaryTask,forgedTask]) await db.query('insert into public.tasks(id,user_id,title) values($1,$2,$3)', [id,user,id]);
  for (const id of [historicalHabit,ordinaryHabit]) await db.query('insert into public.habits(id,user_id,title) values($1,$2,$3)', [id,user,id]);
  await db.query(`insert into public.habit_daily_records(habit_id,record_date,progress_value,completed_at,completion_reward,completed_with_free_pass,completion_cycle_id)
    values($1,current_date-1,5,now(),2,true,$2)`, [historicalHabit,habitCycle]);
  await db.query('update public.farm_wallets set coin_balance=100,farm_money_balance=5000 where user_id=$1', [user]);
  await db.query('update public.farm_weekly_earnings set earned_farm_money=777 where user_id=$1', [user]);
  await db.query("update public.farms set farm_name='Retained garden',equipped_farm_theme='ocean',equipped_plot_skin='cherryPetalFall',production_boost_until=now()+interval '20 days' where user_id=$1", [user]);
  await db.query("insert into public.farm_cosmetics(user_id,cosmetic_type,cosmetic_id) values($1,'farm_theme','ocean'),($1,'plot_skin','cherryPetalFall')", [user]);
  await db.query("insert into public.farm_inventory(user_id,category,item_id,quantity) values($1,'seed','carrot',2),($1,'harvest','carrot',7),($1,'food','countryStew',400),($1,'supply','freePass',2),($1,'supply','luckyFertilizer',1)", [user]);
  await db.query("insert into public.farm_inventory(user_id,category,item_id,quantity) values($1,'seed','tomato',3)", [other]);
  await db.query("update public.farm_plots set crop_id='carrot',growth=2 where user_id=$1 and plot_index=0", [user]);
  await db.query("insert into public.farm_wallet_ledger(user_id,currency,amount,balance_after,reason,reference_key) values($1,'farm_money',-650,4350,'Discount skin purchase','cosmetic:plot_skin:cherryPetalFall'),($1,'farm_money',-800,3550,'Past skin purchase','cosmetic:plot_skin:golden')", [user]);
  const pendingMail = randomUUID(), expiredMail = randomUUID(), claimedMail = randomUUID();
  const sentMail = randomUUID(), sentItem = randomUUID();
  await db.query("insert into public.farm_mail(id,sender_user_id,recipient_user_id,sender_name,sender_message,claimed_at) values($1,$2,$3,'Sender personal name','Private sender text',now())",[sentMail,user,other]);
  await db.query("insert into public.farm_mail_items(id,mail_id,category,item_id,quantity,claimed_at) values($1,$2,'seed','carrot',1,now())",[sentItem,sentMail]);
  await db.query(`insert into public.farm_mail(id,recipient_user_id,sender_name,sent_at,expires_at,claimed_at) values
    ($1,$4,'Mail',now()-interval '1 day',now()+interval '6 days',null),
    ($2,$4,'Expired',now()-interval '8 days',now()-interval '1 day',null),
    ($3,$4,'Claimed',now()-interval '1 day',now()+interval '6 days',now())`, [pendingMail,expiredMail,claimedMail,user]);
  await db.query(`insert into public.farm_mail_items(mail_id,item_order,category,item_id,quantity,price_coins,revealed_at,claimed_at) values
    ($1,0,'seed','tomato',3,999,null,null),($1,1,'harvest','carrot',2,999,null,null),
    ($1,2,'food','countryStew',1,999,now(),null),($1,3,'supply','freePass',1,999,null,null),
    ($1,4,'harvest','carrot',7,0,now(),now()),($2,0,'harvest','tomato',1,0,null,null),
    ($3,0,'harvest','carrot',8,0,null,null)`, [pendingMail,expiredMail,claimedMail]);
  await db.query("insert into public.scheduled_push_notifications(user_id,kind,subject_key,fire_at,title,body) values($1,'plot_water_ready','0',now()+interval '1 day','Water','Ready'),($1,'timer_end','focus',now()+interval '1 day','Focus','Done')", [user]);
  const active = (await call('start_my_scenery_creation','$1::text,$2::text,$3::uuid',['coral','ocean',randomUUID()])).scenery.activeCreation;
  await call('grow_my_scenery_creation','$1::uuid,$2::integer,$3::uuid',[active.id,4,randomUUID()]);
  const historyBefore = (await db.query('select * from public.farm_scenery_creations order by id')).rows;
  const originalsBefore = {};
  for (const table of ['farm_inventory','farm_plots','farm_mail','farm_mail_items','farm_cosmetics']) originalsBefore[table] = (await db.query(`select * from public.${table} order by 1,2`)).rows;
  const before = await balances();
  // Catalog gaps abort the complete transaction, with original access/rows intact.
  await db.query("insert into public.farm_inventory(user_id,category,item_id,quantity) values($1,'food','missingRecipe',1)", [other]);
  await assert.rejects(db.exec(migration), /LEGACY_SETTLEMENT_UNVALUED_ASSET/);
  await db.exec('rollback');
  assert.deepEqual(await balances(), before);
  assert.equal(await scalar("select to_regclass('public.farm_legacy_settlements')"), null);
  assert.equal(await scalar("select has_table_privilege('authenticated','public.farm_inventory','select')"), true);
  await db.query("update public.farm_inventory set quantity=0 where user_id=$1 and item_id='missingRecipe'", [other]);
  await db.query("update public.farm_mail_items set item_id='missingCrop' where mail_id=$1 and item_order=0",[pendingMail]);
  await assert.rejects(db.exec(migration),/LEGACY_SETTLEMENT_UNVALUED_ASSET/);
  await db.exec('rollback');
  assert.deepEqual(await balances(),before);
  await db.query("update public.farm_mail_items set item_id='tomato' where mail_id=$1 and item_order=0",[pendingMail]);
  // A wallet rejection rolls back credits, permanent journals and ACL changes.
  await db.exec('alter table public.farm_wallets add constraint test_reject_settlement check(farm_money_balance<=5000)');
  await assert.rejects(db.exec(migration), /test_reject_settlement/);
  await db.exec('rollback');
  assert.deepEqual(await balances(), before);
  assert.equal(await scalar("select to_regclass('public.farm_legacy_settlements')"), null);
  await db.exec('alter table public.farm_wallets drop constraint test_reject_settlement');
  await db.exec(migration);
  const settlement = (await state()).legacySettlement;
  // Coin: 2 seeds + 1+2 planted growth + 3*2 pending seeds = 11.
  // FM: 7*4 harvest + 400*34 food + 2*120 pass + 70 fertilizer +
  // 650+800 actual skin payments + 2*4+34+120 pending mail + 6 expired harvest.
  const expectedMoney = 28+13600+240+70+1450+8+34+120+6;
  assert.equal(settlement.coinRefund,11);
  assert.equal(settlement.farmMoneyRefund,expectedMoney);
  assert.deepEqual(await balances(),{coin_balance:Number(before.coin_balance)+11,farm_money_balance:Number(before.farm_money_balance)+expectedMoney});
  assert.equal((await state()).weeklyFarmMoneyEarned,777);
  assert.deepEqual((await state()).farm,{farmName:'Retained garden',equippedFarmTheme:'ocean'});
  assert.deepEqual((await state()).ownedCosmetics,[{type:'farm_theme',id:'ocean'}]);
  assert.ok(!('inventory' in await state()) && !('mail' in await state()));
  assert.equal(settlement.items.find(i=>i.category==='plot_skin' && i.itemId==='cherryPetalFall').amount,650);
  assert.equal(settlement.items.find(i=>i.category==='harvest' && i.itemId==='carrot').quantity,9,'Claimed mail is excluded');
  const audit = await scalar('select source_data from public.farm_legacy_settlements where user_id=$1',[user]);
  assert.equal(audit.wallet.coin_balance,Number(before.coin_balance));
  assert.equal(audit.wallet.farm_money_balance,Number(before.farm_money_balance));
  assert.equal(audit.weeklyEarnings[0].earned_farm_money,777);
  assert.equal(audit.inventory.length,5);
  assert.equal(audit.mailItems.length,7);
  assert.equal(audit.valuationLines.filter(i=>i.source==='unclaimed_mail').length,5);
  assert.equal(audit.valuationLines.find(i=>i.source==='plot').growth,2);
  for (const [table,rows] of Object.entries(originalsBefore)) {
    const after = (await db.query(`select * from public.${table} order by 1,2`)).rows;
    if(table==='farm_inventory') assert.deepEqual(after.filter(i=>i.item_id!=='missingRecipe'),rows);
    else assert.deepEqual(after,rows);
  }
  assert.deepEqual((await db.query('select * from public.farm_scenery_creations order by id')).rows,historyBefore);
  const settlementBefore = (await db.query('select * from public.farm_legacy_settlements order by user_id')).rows;
  const credited = await balances();
  await db.exec(migration);
  await scalar('select public.cleanup_stale_wallet_idempotency()');
  await scalar('select public.cleanup_stale_farm_actions()');
  await db.exec(migration);
  assert.deepEqual(await balances(),credited);
  assert.deepEqual((await db.query('select * from public.farm_legacy_settlements order by user_id')).rows,settlementBefore);
  assert.equal(await number("select count(*) from public.farm_wallet_ledger where reference_key like 'legacy-settlement-089:%' and user_id=$1",[user]),2);
  assert.equal(await number('select count(*) from public.farm_legacy_pass_entitlements'),2);

  const privateTables = ['farm_inventory','farm_plots','farm_mail','farm_mail_items','farm_weekly_rewards','farm_market_rotations',
    'farm_recipe_discoveries','farm_crop_catalog','farm_recipe_catalog','farm_recipe_ingredients','farm_supply_catalog',
    'farm_cosmetic_sets','farm_cosmetic_set_members','farm_catalog_meta','farm_admins','farm_admin_broadcasts',
    'farm_update_mail_deliveries','farm_bulletin_posts','farm_bulletin_comments','farm_legacy_settlements',
    'farm_legacy_retirement_meta','farm_legacy_pass_refunds','farm_legacy_pass_entitlements'];
  for (const table of privateTables) {
    for (const role of ['anon','authenticated']) {
      assert.equal(await scalar("select has_table_privilege($1,$2,'select')",[role,`public.${table}`]),false,`${role} cannot read ${table}`);
      assert.equal(await scalar("select has_any_column_privilege($1,$2,'select')",[role,`public.${table}`]),false,`${role} column reads blocked ${table}`);
    }
    await asRole('authenticated',()=>assert.rejects(db.exec(`select * from public.${table}`),/permission denied/));
  }
  const retired = [...signatures,'get_farm_catalog()','send_farm_mail(text,text,text,integer,integer,text)',
    'claim_farm_mail_item(uuid)','get_my_farm_mail_contacts()','get_my_unclaimed_farm_mail_count()',
    'farm_set_bonus_percent(uuid,text)','farm_set_effect_triggers(uuid,text)'];
  for (const signature of retired) for(const role of ['anon','authenticated'])
    assert.equal(await scalar("select has_function_privilege($1,$2,'execute')",[role,`public.${signature}`]),false,`${signature} revoked from ${role}`);
  await asRole('authenticated',()=>assert.rejects(scalar('select public.get_farm_catalog()'),/permission denied/));
  // A separate inherited reader-role grant cannot bypass retirement RLS.
  await db.exec('create role legacy_reader; grant select on public.farm_inventory to legacy_reader; grant legacy_reader to authenticated');
  await asRole('authenticated',async()=>assert.equal((await db.query('select * from public.farm_inventory')).rows.length,0));
  await db.exec('revoke legacy_reader from authenticated');
  // A custom inherited SECURITY DEFINER execute grant must abort retirement,
  // because table RLS cannot restrict a definer's existing legacy API.
  await db.exec('grant execute on function public.get_farm_catalog() to legacy_reader; grant legacy_reader to authenticated');
  await assert.rejects(db.exec(migration),/LEGACY_RPC_GRANT_REMAINS/);
  await db.exec('rollback');
  assert.deepEqual(await balances(),credited);
  await db.exec('revoke execute on function public.get_farm_catalog() from legacy_reader; revoke legacy_reader from authenticated');
  const publications = (await db.query("select tablename from pg_publication_tables where pubname='supabase_realtime'")).rows.map(r=>r.tablename);
  assert.ok(!privateTables.some(t=>publications.includes(t)));
  assert.ok(publications.includes('farm_scenery_creations') && publications.includes('farm_wallets'));
  assert.equal(await scalar("select has_column_privilege('authenticated','public.farms','production_boost_until','select')"),false);
  assert.equal(await scalar("select has_column_privilege('authenticated','public.user_focus_progress','focus_plot_index','select')"),false);
  const expectedWallet=await balances();
  await asRole('authenticated',async()=>{
    const ownWallet=(await db.query('select * from public.get_my_farm_wallet()')).rows[0];
    assert.deepEqual(ownWallet,expectedWallet);
    assert.equal((await scalar('select public.get_my_focus_progress()')).progressSeconds,0);
    assert.equal((await db.query('select * from public.farm_cosmetics')).rows.length,1);
    assert.ok((await db.query('select * from public.farm_cosmetic_catalog')).rows.every(c=>c.cosmetic_type==='farm_theme'));
    assert.equal((await db.query('select farm_name,equipped_farm_theme from public.farms')).rows.length,1);
    await assert.rejects(db.exec('select production_boost_until from public.farms'),/permission denied/);
    await assert.rejects(call('purchase_farm_cosmetic','$1,$2,$3',['plot_skin','golden',800]),/Unsupported cosmetic type/);
    await assert.rejects(call('equip_farm_cosmetic','$1,$2',['plot_skin',null]),/Unsupported cosmetic type/);
    await assert.rejects(call('purchase_farm_cosmetic','$1,$2,$3',['farm_theme','christmas',1]),/PRICE_CHANGED/);
  });
  await setUser(other);
  await asRole('authenticated',async()=>{
    assert.equal((await state()).legacySettlement.coinRefund,6);
    assert.equal((await state()).legacySettlement.farmMoneyRefund,0);
    assert.equal((await db.query('select * from public.farm_cosmetics')).rows.length,0);
    await assert.rejects(call('uncomplete_my_task','$1::uuid,$2',[historicalTask,'waiting']),/Task not found/);
    await assert.rejects(call('grow_my_scenery_creation','$1::uuid,$2::integer,$3::uuid',[active.id,1,randomUUID()]),/CREATION_NOT_FOUND/);
  });
  await setUser(null);
  await assert.rejects(state(),/Authentication required/);
  await assert.rejects(call('complete_my_task','$1::uuid,$2::boolean',[ordinaryTask,false]),/Authentication required/);
  await asRole('anon',()=>assert.rejects(state(),/permission denied/));
  await setUser(user);
  // New scenery, themes, score and wallet RPCs keep working after retirement.
  await asRole('authenticated',async()=>{
    await call('grow_my_scenery_creation','$1::uuid,$2::integer,$3::uuid',[active.id,100,randomUUID()]);
    const claimed=await call('claim_my_scenery_creation','$1::uuid,$2::uuid',[active.id,randomUUID()]);
    assert.equal(claimed.scenery.totalCompleted,1);
    assert.equal(claimed.weeklyFarmMoneyEarned,827);
    const beforeTheme = await state();
    await call('purchase_farm_cosmetic','$1,$2,$3',['farm_theme','christmas',2000]);
    assert.equal((await state()).farm.equippedFarmTheme,'christmas');
    await call('equip_farm_cosmetic','$1,$2',['farm_theme',null]);
    assert.equal((await state()).farm.equippedFarmTheme,null);
    assert.equal((await state()).weeklyFarmMoneyEarned,beforeTheme.weeklyFarmMoneyEarned);
    assert.ok((await db.query('select * from public.get_farm_leaderboard()')).rows.some(r=>r.farm_code==='OWNER'));
  });
  // Historical pass cancellation has no inventory writes and never adds score.
  const beforeUndo = await balances();
  // An earlier optimistic save can clear the flag. Frozen cycle ownership
  // still preserves the pass right, including an already-undone habit row.
  await asRole('authenticated',()=>db.query('update public.tasks set completed_with_free_pass=false where id=$1',[historicalTask]));
  const oldTaskUndo = await call('uncomplete_my_task','$1::uuid,$2',[historicalTask,'waiting']);
  assert.equal(oldTaskUndo.legacyPassRefundAmount,120);
  assert.equal(oldTaskUndo.coinBalance,Number(beforeUndo.coin_balance)-2);
  assert.equal(oldTaskUndo.farmMoneyBalance,Number(beforeUndo.farm_money_balance)+120);
  assert.equal(await scalar('select archived_at from public.tasks where id=$1',[historicalTask]),null);
  assert.equal((await call('uncomplete_my_task','$1::uuid,$2',[historicalTask,'waiting'])).legacyPassRefundAmount,0);
  await asRole('authenticated',()=>db.query('update public.habit_daily_records set completed_at=null,completed_with_free_pass=false where habit_id=$1',[historicalHabit]));
  const oldHabitUndo = await call('uncomplete_my_habit','$1::uuid,current_date-1',[historicalHabit]);
  assert.equal(oldHabitUndo.legacyPassRefundAmount,120);
  assert.equal(oldHabitUndo.alreadyUndone,true);
  assert.equal((await call('uncomplete_my_habit','$1::uuid,current_date-1',[historicalHabit])).legacyPassRefundAmount,0);
  assert.equal((await state()).weeklyFarmMoneyEarned,827);
  await scalar('select public.cleanup_stale_wallet_idempotency()');
  await db.exec(migration);
  assert.equal(await number('select count(*) from public.farm_legacy_pass_refunds'),2);
  await asRole('authenticated',()=>db.query("update public.tasks set status='done',completed_with_free_pass=true,completion_cycle_id=gen_random_uuid(),completion_reward=0 where id=$1",[forgedTask]));
  assert.equal((await call('uncomplete_my_task','$1::uuid,$2',[forgedTask,'waiting'])).legacyPassRefundAmount,0,'Forged flags/cycles have no frozen entitlement');
  const taskDone = await call('complete_my_task','$1::uuid,$2::boolean',[ordinaryTask,true]);
  assert.equal(taskDone.completionReward,1,'Retired boost cannot affect new completions');
  assert.equal(await scalar('select completed_with_free_pass from public.tasks where id=$1',[ordinaryTask]),false);
  assert.equal((await call('complete_my_task','$1::uuid,$2::boolean',[ordinaryTask,true])).alreadyDone,true);
  assert.equal((await call('uncomplete_my_task','$1::uuid,$2',[ordinaryTask,'waiting'])).legacyPassRefundAmount,0);
  const habitDone=await call('complete_my_habit','$1::uuid,current_date,$2::integer,$3::boolean',[ordinaryHabit,3,true]);
  assert.equal(habitDone.completionReward,1);
  assert.equal(await scalar('select completed_with_free_pass from public.habit_daily_records where habit_id=$1 and record_date=current_date',[ordinaryHabit]),false);
  assert.equal((await call('uncomplete_my_habit','$1::uuid,current_date',[ordinaryHabit])).legacyPassRefundAmount,0);
  await db.query('insert into public.user_focus_progress(user_id,progress_seconds) values($1,3590) on conflict(user_id) do update set progress_seconds=3590',[user]);
  const focusId=randomUUID();
  const focus=await call('record_my_focus_time','$1::uuid,$2,$3::integer',[focusId,'linked',20]);
  assert.equal(focus.awardedCoins,1);
  assert.equal(focus.progressSeconds,10);
  assert.deepEqual(focus.event.bonuses,[]);
  assert.equal((await call('record_my_focus_time','$1::uuid,$2,$3::integer',[focusId,'linked',20])).awardedCoins,0);
  await assert.rejects(call('record_my_focus_time','$1::uuid,$2,$3::integer',[randomUUID(),'quick',601]),/between 1 and 600/);
  await assert.rejects(call('schedule_my_push_notification','$1,$2,now()+interval \'1 hour\',$3,$4',['plot_water_ready','0','Water','Ready']),/Unsupported notification kind/);
  await call('schedule_my_push_notification','$1,$2,now()+interval \'1 hour\',$3,$4',['timer_end','focus','Focus','Done']);
  assert.equal(await number("select count(*) from public.scheduled_push_notifications where kind='plot_water_ready' and sent_at is null"),0);
  assert.equal(await number("select count(*) from public.scheduled_push_notifications where kind='timer_end' and sent_at is null"),1);
  await db.query('insert into auth.users values($1)',[newcomer]);
  await setUser(newcomer);
  assert.equal((await state()).legacySettlement,null);
  assert.equal(await number('select count(*) from public.farm_plots where user_id=$1',[newcomer]),0);
  assert.equal(await number('select count(*) from public.farm_inventory where user_id=$1',[newcomer]),0);
  assert.equal(await number('select count(*) from public.farm_mail where recipient_user_id=$1',[newcomer]),0);
  await db.exec(migration);
  assert.equal((await state()).legacySettlement,null,'Reapplying does not settle post-retirement users');
  // Deleting an account preserves recipients' money while removing copied
  // sender/message content and every owned settlement/refund/scenery row.
  const recipientAuditBefore=await scalar('select source_data from public.farm_legacy_settlements where user_id=$1',[other]);
  assert.equal(recipientAuditBefore.mail.find(m=>m.id===sentMail).sender_message,'Private sender text');
  const recipientBalance=await balances(other);
  const recipientSummary=await scalar('select items from public.farm_legacy_settlements where user_id=$1',[other]);
  await setUser(null);
  await assert.rejects(scalar('select public.delete_my_account()'),/Authentication required/);
  await setUser(user);
  await asRole('authenticated',()=>scalar('select public.delete_my_account()'));
  assert.equal(await number('select count(*) from auth.users where id=$1',[user]),0);
  assert.equal(await number('select count(*) from public.farm_mail where id=$1',[sentMail]),0);
  for(const table of ['farm_legacy_settlements','farm_legacy_pass_entitlements','farm_legacy_pass_refunds','farm_scenery_creations','farm_wallet_ledger'])
    assert.equal(await number(`select count(*) from public.${table} where user_id=$1`,[user]),0);
  const recipientAuditAfter=await scalar('select source_data from public.farm_legacy_settlements where user_id=$1',[other]);
  assert.ok(!recipientAuditAfter.mail.some(m=>m.id===sentMail));
  assert.ok(!recipientAuditAfter.mailItems.some(i=>i.id===sentItem));
  assert.ok(!JSON.stringify(recipientAuditAfter).includes('Private sender text'));
  assert.deepEqual(await balances(other),recipientBalance);
  assert.deepEqual(await scalar('select items from public.farm_legacy_settlements where user_id=$1',[other]),recipientSummary);
  console.log('Actual SQL retirement tests passed: settlement valuation/rollback/durability, private legacy access, scenery/theme/ranking continuity, pass entitlements, flat focus/productivity, timer-only push.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>db.close());
