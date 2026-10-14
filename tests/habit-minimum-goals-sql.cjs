// Runs migrations 091/092/093 and real wallet/refund helpers in PostgreSQL/PGlite.
// PGLITE_MODULE may point to an existing @electric-sql/pglite installation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const root = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, 'supabase/migrations', file), 'utf8');
const scalar = async (sql, params) => Object.values((await db.query(sql, params)).rows[0])[0];
const user = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
const day = '2026-10-14';
const setUser = id => scalar("select set_config('app.test_user', $1, false)", [id || '']);
const migrateFunction = async (file, name) => {
  const match = source(file).match(new RegExp(`create (?:or replace )?function (?:public|private)\\.${name}\\([^]*?\\$\\$;`, 'i'));
  assert.ok(match, `Missing actual SQL function ${name}`);
  await db.exec(match[0]);
};
const complete = (id, level = 'max', date = day) => scalar(
  'select public.complete_my_habit($1::uuid, $2::date, $3::integer, $4::boolean, $5::text)',
  [id, date, 3, true, level]); // Retired free-pass input must never grant a new pass.
const undo = (id, date = day) => scalar('select public.uncomplete_my_habit($1::uuid, $2::date)', [id, date]);
const balance = () => scalar('select coin_balance::integer from public.farm_wallets where user_id = $1', [user]);
const ledgerCount = () => scalar('select count(*)::integer from public.farm_wallet_ledger where user_id = $1', [user]);
const record = async (id, date = day) => (await db.query(
  'select * from public.habit_daily_records where habit_id = $1 and record_date = $2', [id, date])).rows[0];
const addHabit = async (title, minimum = null, owner = user) => {
  const id = randomUUID();
  await db.query('insert into public.habits(id, user_id, title, minimum_title) values($1, $2, $3, $4)', [id, owner, title, minimum]);
  return id;
};
const asRole = async (role, callback) => {
  await db.exec(`set role ${role}`);
  try { return await callback(); } finally { await db.exec('reset role'); }
};

(async () => {
  await db.exec(`
    create role anon; create role authenticated; create schema auth; create schema private;
    create table auth.users(id uuid primary key);
    insert into auth.users values('${user}'), ('${other}');
    create function auth.uid() returns uuid language sql as $$
      select nullif(current_setting('app.test_user', true), '')::uuid
    $$;
    grant usage on schema auth to authenticated, anon;
    revoke all on schema private from public, anon, authenticated;
    -- Vault/pgcrypto are external dependencies. Use reversible text helpers to
    -- exercise the actual encryption trigger and decrypted state RPC locally.
    create function private.farmodoro_encrypt_text(value text) returns text language sql as $$
      select case when value is null or value like 'sv1:%' or value like 'fmd1.%' then value
        else 'sv1:' || encode(convert_to(value, 'UTF8'), 'hex') end
    $$;
    create function private.farmodoro_decrypt_text(value text) returns text language sql as $$
      select case when value like 'sv1:%' then convert_from(decode(substr(value, 5), 'hex'), 'UTF8') else value end
    $$;
  `);
  await db.exec(source('005_tasks_and_habits.sql').split('create extension if not exists pg_cron')[0]);
  await db.exec(source('006_farm_economy_inventory_mail.sql').split('create or replace function public.current_farm_week_start')[0]);
  await db.exec(source('016_allow_negative_coin.sql').split('create or replace function')[0] + '\ncommit;');
  await db.exec(source('032_wallet_idempotency.sql').split('create or replace function')[0]);
  await db.exec(`
    alter table public.tasks add column completion_cycle_id uuid;
    alter table public.habit_daily_records add column completion_cycle_id uuid;
    alter table public.habit_daily_records add column focus_seconds integer not null default 0;
    alter table public.habits add column target_by_weekday jsonb not null default '{}'::jsonb;
    alter table public.habits drop constraint habits_title_length;
    alter table public.habits add constraint habits_title_length check(char_length(title) between 1 and 1024);
    create table public.farm_legacy_pass_entitlements(user_id uuid, refund_key text, amount bigint,
      source_data jsonb, primary key(user_id, refund_key));
    create table public.farm_legacy_pass_refunds(user_id uuid, refund_key text, amount bigint,
      refunded_at timestamptz default now(), primary key(user_id, refund_key));
  `);
  await migrateFunction('006_farm_economy_inventory_mail.sql', 'current_farm_week_start');
  await migrateFunction('089_retire_legacy_farm_and_mail.sql', 'ensure_farm_user');
  await migrateFunction('037_wallet_and_farm_state_hardening.sql', 'apply_farm_wallet_change');
  await migrateFunction('089_retire_legacy_farm_and_mail.sql', 'refund_retired_farm_pass');
  await migrateFunction('089_retire_legacy_farm_and_mail.sql', 'complete_my_habit');
  await migrateFunction('019_server_managed_content_encryption.sql', 'farmodoro_encrypt_content_trigger');
  await db.exec(`create trigger habits_encrypt_content before insert or update on public.habits
    for each row execute function private.farmodoro_encrypt_content_trigger();`);
  await setUser(user);
  await scalar('select public.ensure_farm_user($1)', [user]);
  const legacy = randomUUID(), legacyPass = randomUUID(), passCycle = randomUUID();
  await db.query('insert into public.habits(id, user_id, title) values($1::uuid, $3, $1::uuid::text), ($2::uuid, $3, $2::uuid::text)', [legacy, legacyPass, user]);
  await db.query(`insert into public.habit_daily_records(habit_id, record_date, completed_at, completion_reward, completed_with_free_pass, completion_cycle_id)
    values($1, $3, now(), 1, false, gen_random_uuid()), ($2, $3, now(), 2, true, $4)`, [legacy, legacyPass, day, passCycle]);
  const passKey = `habit:${legacyPass}:${day}:${passCycle}`;
  await db.query("insert into public.farm_legacy_pass_entitlements values($1, $2, 1300, '{}'::jsonb)", [user, passKey]);
  await db.query('update public.farm_wallets set coin_balance = 3 where user_id = $1', [user]);

  const migration = source('091_habit_minimum_goals.sql');
  await db.exec(migration);
  assert.equal((await record(legacy)).completion_level, 'max');
  assert.equal((await record(legacy)).completion_reward, 1, 'Migration never retroactively grants Coin');
  assert.equal(await balance(), 3);
  const ordinary = await addHabit('Read a book');
  const tiered = await addHabit('Study English', '  Review words  ');
  const blank = await addHabit('Walk', '   ');
  assert.equal(await scalar('select minimum_title from public.habits where id = $1', [blank]), null);
  assert.match(await scalar('select minimum_title from public.habits where id = $1', [tiered]), /^sv1:/);
  await assert.rejects(addHabit('Too long', 'a'.repeat(101)), /Minimum habit title is too long/);
  await assert.rejects(complete(ordinary, 'min'), /no minimum goal/);
  await assert.rejects(complete(tiered, 'invalid'), /Unsupported habit completion level/);
  await assert.rejects(complete(tiered, null), /Unsupported habit completion level/);
  assert.equal(await ledgerCount(), 0, 'Invalid requests have no wallet side effects');

  // A missing level argument uses the old one-goal contract.
  const oldCaller = await scalar('select public.complete_my_habit($1::uuid, $2::date, 1, true)', [ordinary, day]);
  assert.equal(oldCaller.completionReward, 1);
  assert.equal(oldCaller.completionLevel, 'max');
  assert.equal((await record(ordinary)).completed_with_free_pass, false);
  const first = await complete(tiered, 'min');
  assert.equal(first.completionReward, 1);
  assert.equal(first.completionLevel, 'min');
  assert.equal(await balance(), 5);
  const cycle = first.completionCycleId;
  const beforeRepeat = await ledgerCount();
  const repeated = await Promise.all(Array.from({ length: 5 }, () => complete(tiered, 'min')));
  assert.ok(repeated.every(result => result.alreadyDone));
  assert.equal(await ledgerCount(), beforeRepeat, 'Queued duplicate requests never pay twice');

  await db.exec(migration);
  assert.equal((await record(tiered)).completion_level, 'min', 'Reapplying migration preserves new min history');
  assert.equal(await balance(), 5);
  const upgraded = await complete(tiered, 'max');
  assert.equal(upgraded.completionReward, 2);
  assert.equal(upgraded.completionCycleId, cycle);
  assert.equal(await balance(), 6, 'Min to max awards only the additional Coin');
  const downgraded = await complete(tiered, 'min');
  assert.equal(downgraded.completionReward, 1);
  assert.equal(await balance(), 5, 'Max to min returns only one Coin');
  await complete(tiered, 'max');
  assert.equal(await balance(), 6, 'A later legitimate upgrade has a new wallet reference');
  const undone = await undo(tiered);
  assert.equal(undone.completionLevel, null);
  assert.equal(await balance(), 4, 'Undo reverses the actual two-Coin reward');
  assert.equal((await record(tiered)).completion_reward, 0);
  const undoCount = await ledgerCount();
  assert.equal((await undo(tiered)).alreadyUndone, true);
  assert.equal(await ledgerCount(), undoCount);
  const again = await complete(tiered, 'min');
  assert.notEqual(again.completionCycleId, cycle, 'A new completion after undo gets a new cycle');
  await undo(tiered);
  assert.equal(await balance(), 4);

  // Changes to the optional goal leave already earned historical rewards alone.
  await db.query('update public.habits set minimum_title = $2 where id = $1', [legacy, 'Read one word']);
  assert.equal((await complete(legacy)).completionReward, 1);
  await complete(tiered, 'max');
  await db.query('update public.habits set minimum_title = null where id = $1', [tiered]);
  assert.equal((await complete(tiered)).completionReward, 2);
  assert.equal((await record(tiered)).completion_level, 'max');
  await undo(tiered);
  assert.equal((await complete(tiered)).completionReward, 1, 'A subsequent single-goal completion again earns one Coin');
  await undo(tiered);

  // Historical pass refunds retain their original cycle even after changing level.
  await db.query('update public.habits set minimum_title = $2 where id = $1', [legacyPass, 'Read one word']);
  await complete(legacyPass, 'min');
  assert.equal((await record(legacyPass)).completion_cycle_id, passCycle);
  const refund = await undo(legacyPass);
  assert.equal(refund.hadFreePass, true);
  assert.equal(refund.legacyPassRefundAmount, 1300);
  assert.equal((await undo(legacyPass)).legacyPassRefundAmount, 0);

  // A wallet failure rolls back the level, progress and completion insert too.
  await db.exec(`create function public.test_reject_habit_wallet() returns trigger language plpgsql as $$
    begin if current_setting('app.test_reject_wallet', true) = 'true' then raise exception 'test_wallet_failure'; end if; return new; end
    $$;
    create trigger reject_habit_wallet before insert on public.farm_wallet_ledger for each row
      execute function public.test_reject_habit_wallet();`);
  const rollbackHabit = await addHabit('Practice', 'One word');
  await scalar("select set_config('app.test_reject_wallet', 'true', false)");
  const beforeFailure = await balance();
  await assert.rejects(complete(rollbackHabit, 'max'), /test_wallet_failure/);
  assert.equal(await record(rollbackHabit), undefined);
  assert.equal(await balance(), beforeFailure);
  await scalar("select set_config('app.test_reject_wallet', 'false', false)");
  await complete(rollbackHabit, 'min');
  await scalar("select set_config('app.test_reject_wallet', 'true', false)");
  await assert.rejects(complete(rollbackHabit, 'max'), /test_wallet_failure/);
  assert.equal((await record(rollbackHabit)).completion_level, 'min');
  assert.equal((await record(rollbackHabit)).completion_reward, 1);
  await scalar("select set_config('app.test_reject_wallet', 'false', false)");

  // The new minimum timer is opt-in and never changes old completion history.
  await db.exec(source('021_user_focus_timer.sql'));
  const minimumFocusMigration = source('092_habit_minimum_focus_minutes.sql');
  const beforeMinimumFocusMigration = await balance();
  await db.exec(minimumFocusMigration);
  assert.equal(await balance(), beforeMinimumFocusMigration);
  assert.equal((await record(rollbackHabit)).completion_level, 'min');
  assert.equal(await scalar('select minimum_focus_minutes from public.habits where id = $1', [rollbackHabit]), null);
  const timeOnlyMigration = source('093_habit_time_only_minimum_goals.sql');
  const legacyBeforeTimeOnlyMigration = await record(legacy);
  await db.exec(timeOnlyMigration);
  assert.equal(await balance(), beforeMinimumFocusMigration, 'Time-only minimum migration never grants Coin');
  assert.deepEqual(await record(legacy), legacyBeforeTimeOnlyMigration, 'Time-only minimum migration preserves historical rewards');
  const addTimedHabit = async ({ minimum = 5, maximum = 25, weekdays = [1, 3], overrides = {}, title = 'Read one word', type = 'time' } = {}) => {
    const id = randomUUID();
    await db.query(`insert into public.habits(id, user_id, title, minimum_title,
      measure_type, target_value, minimum_focus_minutes, weekdays, target_by_weekday)
      values($1, $2, 'Study English', $3, $4, $5, $6, $7::smallint[], $8::jsonb)`,
    [id, user, title, type, maximum, minimum, weekdays, JSON.stringify(overrides)]);
    return id;
  };
  const timed = await addTimedHabit({ overrides: { 1: 15, 3: 30, 7: 2 } });
  assert.equal(await scalar('select minimum_focus_minutes from public.habits where id = $1', [timed]), 5);
  const untimedMinimum = await addTimedHabit({ minimum: null, type: 'count' });
  assert.equal(await scalar('select minimum_focus_minutes from public.habits where id = $1', [untimedMinimum]), null);
  for (const minimum of [0, -1, 10000, 25, 26]) {
    await assert.rejects(addTimedHabit({ minimum }), /habits_minimum_focus_minutes_valid/);
  }
  await addTimedHabit({ minimum: 9999, maximum: 10000 });
  const timeOnly = await addTimedHabit({ minimum: 5, title: null });
  const blankTimeOnly = await addTimedHabit({ minimum: 5, title: '   ' });
  for (const id of [timeOnly, blankTimeOnly]) {
    assert.equal(await scalar('select minimum_title from public.habits where id = $1', [id]), null);
    assert.equal(await scalar('select minimum_focus_minutes from public.habits where id = $1', [id]), 5);
  }
  await assert.rejects(addTimedHabit({ minimum: 5, type: 'count' }), /habits_minimum_focus_minutes_valid/);
  await assert.rejects(addTimedHabit({ minimum: 5, type: 'amount' }), /habits_minimum_focus_minutes_valid/);
  // Even when every scheduled weekday has a larger override, the default
  // maximum must stay above the minimum to remain safe when the schedule changes.
  await assert.rejects(addTimedHabit({ minimum: 5, maximum: 5, overrides: { 1: 20, 3: 20 } }), /habits_minimum_focus_minutes_valid/);
  await assert.rejects(addTimedHabit({ overrides: { 1: 5 } }), /below every selected weekday maximum/);
  await assert.rejects(addTimedHabit({ overrides: { 3: 4 } }), /below every selected weekday maximum/);
  await assert.rejects(addTimedHabit({ overrides: { 1: '10' } }), /weekday focus duration must be a number/);
  await addTimedHabit({ overrides: { 1: null } }); // Missing/null overrides use the default maximum.
  await assert.rejects(db.query('update public.habits set target_value = 5 where id = $1', [timed]), /habits_minimum_focus_minutes_valid/);
  await assert.rejects(db.query('update public.habits set target_by_weekday = $2 where id = $1', [timed, '{"1":4}']), /below every selected weekday maximum/);
  await assert.rejects(db.query('update public.habits set weekdays = array[1,3,7]::smallint[] where id = $1', [timed]), /below every selected weekday maximum/);
  await db.query('update public.habits set minimum_title = null where id = $1', [timed]);
  assert.equal(await scalar('select minimum_title from public.habits where id = $1', [timed]), null, 'Removing only the optional name keeps the minimum timer');
  assert.equal(await scalar('select minimum_focus_minutes from public.habits where id = $1', [timed]), 5, 'Rejected edits retain the saved minimum');
  await asRole('authenticated', () => db.query('update public.habits set minimum_focus_minutes = 6 where id = $1', [timed]));
  await db.exec(timeOnlyMigration);
  assert.equal(await scalar('select minimum_focus_minutes from public.habits where id = $1', [timed]), 6, 'Migration replay retains chosen durations');
  assert.equal((await complete(timed, 'min')).completionReward, 1);
  assert.equal((await complete(timed, 'max')).completionReward, 2);
  assert.equal((await record(timed)).completion_level, 'max');
  await undo(timed);
  await db.query('update public.habits set minimum_focus_minutes = null, minimum_title = null, measure_type = $2 where id = $1', [timed, 'count']);
  assert.equal(await scalar('select minimum_focus_minutes from public.habits where id = $1', [timed]), null, 'A single edit can disable both minimum and its timer');

  // A duration without a separate name has the same min/max wallet contract.
  const beforeTimeOnlyCompletion = await balance();
  const timeOnlyMinimum = await asRole('authenticated', () => complete(timeOnly, 'min'));
  assert.equal(timeOnlyMinimum.completionReward, 1);
  assert.equal(timeOnlyMinimum.completionLevel, 'min');
  assert.equal(await balance(), beforeTimeOnlyCompletion + 1);
  const timeOnlyLedgerCount = await ledgerCount();
  assert.ok((await Promise.all(Array.from({ length: 5 }, () => complete(timeOnly, 'min')))).every(result => result.alreadyDone));
  assert.equal(await ledgerCount(), timeOnlyLedgerCount, 'Time-only minimum retries never award twice');
  await db.exec(timeOnlyMigration);
  assert.equal((await record(timeOnly)).completion_level, 'min', 'Migration replay retains time-only minimum completions');
  assert.equal((await complete(timeOnly, 'max')).completionReward, 2);
  assert.equal((await record(timeOnly)).completion_cycle_id, timeOnlyMinimum.completionCycleId);
  assert.equal(await balance(), beforeTimeOnlyCompletion + 2, 'Time-only minimum upgrade awards one extra Coin');
  assert.equal((await complete(timeOnly, 'min')).completionReward, 1);
  assert.equal(await balance(), beforeTimeOnlyCompletion + 1, 'Time-only minimum downgrade returns one Coin');
  await undo(timeOnly);
  assert.equal(await balance(), beforeTimeOnlyCompletion, 'Undo reverses the actual time-only minimum reward');
  assert.equal((await complete(timeOnly)).completionReward, 2, 'Direct maximum earns two Coin with a time-only minimum');
  await undo(timeOnly);
  assert.equal(await balance(), beforeTimeOnlyCompletion, 'Undo reverses the actual time-only maximum reward');
  const noMinimumLedgerCount = await ledgerCount();
  await assert.rejects(complete(ordinary, 'min'), /no minimum goal/);
  await assert.rejects(complete(timed, 'min'), /no minimum goal/);
  assert.equal(await ledgerCount(), noMinimumLedgerCount, 'Minimum requests still require a name or duration');

  // Adding/removing the optional duration cannot rewrite already paid rewards.
  const converted = await addTimedHabit({ title: null, minimum: null });
  assert.equal((await complete(converted)).completionReward, 1);
  await db.query('update public.habits set minimum_focus_minutes = 5 where id = $1', [converted]);
  assert.equal((await complete(converted)).completionReward, 1, 'Existing same-tier completion keeps its original one-Coin reward');
  await undo(converted);
  assert.equal((await complete(converted)).completionReward, 2, 'A new completion uses the newly enabled time-only minimum');
  await db.query('update public.habits set minimum_focus_minutes = null where id = $1', [converted]);
  assert.equal((await complete(converted)).completionReward, 2, 'Removing the minimum preserves an already earned two-Coin reward');
  const beforeConvertedUndo = await balance();
  await undo(converted);
  assert.equal(await balance(), beforeConvertedUndo - 2, 'Undo uses the actual reward after the minimum is removed');
  await assert.rejects(complete(converted, 'min'), /no minimum goal/);
  assert.equal((await complete(converted)).completionReward, 1);

  // The real timer persistence is opaque JSONB: both the active target and
  // in-flight runtime retain their tier when another device reads them.
  for (const completionLevel of ['min', 'max']) {
    const timerState = {
      activeFocus: { type: 'habit', id: timeOnly, completionLevel },
      runtime: { kind: 'habit', targetId: timeOnly, completionLevel, durationSeconds: 300 },
    };
    await asRole('authenticated', () => db.query(`insert into public.user_focus_timer(user_id, state) values($1, $2::jsonb)
      on conflict(user_id) do update set state = excluded.state`, [user, JSON.stringify(timerState)]));
    assert.deepEqual(await asRole('authenticated', () => scalar('select state from public.user_focus_timer where user_id = $1', [user])), timerState);
  }
  await setUser(other);
  assert.equal(await asRole('authenticated', () => scalar('select count(*)::integer from public.user_focus_timer where user_id = $1', [user])), 0);
  await assert.rejects(asRole('authenticated', () => db.query('insert into public.user_focus_timer(user_id, state) values($1, $2::jsonb)', [user, '{}'])), /row-level security policy/);
  await setUser(user);

  const state = await asRole('authenticated', () => scalar('select public.get_my_productivity_state()'));
  assert.equal(state.habits.find(habit => habit.id === rollbackHabit).minimum_title, 'One word');
  assert.equal(state.habits.find(habit => habit.id === rollbackHabit).minimum_focus_minutes, null);
  const savedTimed = await addTimedHabit({ minimum: 4 });
  const timedState = await asRole('authenticated', () => scalar('select public.get_my_productivity_state()'));
  assert.equal(timedState.habits.find(habit => habit.id === savedTimed).minimum_focus_minutes, 4);
  assert.equal(timedState.habits.find(habit => habit.id === savedTimed).minimum_title, 'Read one word');
  assert.equal(timedState.habits.find(habit => habit.id === timeOnly).minimum_focus_minutes, 5);
  assert.equal(timedState.habits.find(habit => habit.id === timeOnly).minimum_title, null, 'State restores a time-only minimum without inventing a saved name');
  assert.equal(timedState.habits.find(habit => habit.id === timeOnly).title, 'Study English');
  assert.equal(state.habitRecords.find(row => row.habit_id === rollbackHabit).completion_level, 'min');
  assert.ok(state.habitRecords.every(row => Object.hasOwn(row, 'completion_cycle_id')));
  const hidden = await addHabit('Other habit', 'Other minimum', other);
  await assert.rejects(asRole('authenticated', () => complete(hidden, 'min')), /Habit not found/);
  await assert.rejects(asRole('authenticated', () => undo(hidden)), /Habit not found/);
  await asRole('authenticated', async () => {
    assert.equal(await scalar('select count(*)::integer from public.habits where id = $1', [hidden]), 0);
    assert.equal(await scalar('select count(*)::integer from public.habit_daily_records where habit_id = $1', [hidden]), 0);
  });
  await setUser(null);
  await assert.rejects(complete(ordinary), /Authentication required/);
  await assert.rejects(undo(ordinary), /Authentication required/);
  await assert.rejects(scalar('select public.get_my_productivity_state()'), /Authentication required/);
  await setUser(user);
  const signatures = (await db.query("select oid::regprocedure::text as signature from pg_proc where pronamespace = 'public'::regnamespace and proname = 'complete_my_habit'")).rows;
  assert.deepEqual(signatures.map(row => row.signature), ['complete_my_habit(uuid,date,integer,boolean,text)']);
  assert.equal(await scalar("select has_function_privilege('anon', 'public.complete_my_habit(uuid,date,integer,boolean,text)', 'execute')"), false);
  assert.equal(await scalar("select has_function_privilege('authenticated', 'public.complete_my_habit(uuid,date,integer,boolean,text)', 'execute')"), true);
  console.log('Habit minimum goals SQL PASS: legacy compatibility, encrypted state, named and time-only minima, min/max deltas, retries, undo, rollback, pass refunds, minimum focus validation, timer round-trip and ownership');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.close());
