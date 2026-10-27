// Executes migration 106 in PostgreSQL/PGlite against ended and active habits.
// PGLITE_MODULE may point to an existing @electric-sql/pglite installation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const root = path.resolve(__dirname, '..');
const source = name => fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8');
const rows = async (sql, params) => (await db.query(sql, params)).rows;
const scalar = async (sql, params) => Object.values((await rows(sql, params))[0])[0];
const user = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
const setUser = id => scalar("select set_config('app.test_user', $1, false)", [id || '']);
const setDay = day => scalar("select set_config('app.test_day', $1, false)", [day]);
const reset = async () => {
  await db.exec('set role authenticated');
  try { await scalar('select public.reset_my_habits()'); }
  finally { await db.exec('reset role'); }
};
const habit = id => rows('select id::text, user_id::text, start_date::text, end_date::text, title from public.habits where id = $1', [id]);
const records = id => rows('select * from public.habit_daily_records where habit_id = $1 order by record_date', [id]);
const seed = async (suffix, owner, start, end) => {
  const id = `10000000-0000-0000-0000-${suffix.padStart(12, '0')}`;
  await db.query('insert into public.habits(id, user_id, title, start_date, end_date) values($1, $2, $3, $4, $5)',
    [id, owner, `habit-${suffix}`, start, end]);
  await db.query(`insert into public.habit_daily_records(habit_id, record_date, progress_value, completed_at, completion_reward, focus_seconds, completion_cycle_id)
    values ($1, $2::date, 1, '2026-10-25T10:00:00Z', 2, 120, gen_random_uuid()),
           ($1, $2::date + 1, 0, null, 0, 30, null)`, [id, start]);
  return id;
};

(async () => {
  await db.exec(`
    create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql as $$
      select nullif(current_setting('app.test_user', true), '')::uuid
    $$;
    create function public.productivity_today() returns date language sql stable as $$
      select current_setting('app.test_day')::date
    $$;
    create table public.habits (
      id uuid primary key, user_id uuid not null, title text not null,
      start_date date, end_date date,
      constraint habits_date_range check (end_date is null or start_date is null or end_date >= start_date)
    );
    create table public.habit_daily_records (
      habit_id uuid references public.habits(id), record_date date,
      progress_value numeric not null, completed_at timestamptz, completion_reward integer,
      focus_seconds integer, completion_cycle_id uuid,
      primary key(habit_id, record_date)
    );
  `);
  // Install the actual previous reset definition before upgrading it.
  const previous = source('084_productivity_day_starts_at_four.sql')
    .match(/create or replace function public\.reset_my_habits\([^]*?\$\$;/i);
  assert.ok(previous, 'The previous reset SQL definition must exist');
  await db.exec(previous[0]);
  await setUser(user);
  await setDay('2026-10-28');

  const ended = await seed('1', user, '2026-10-01', '2026-10-27');
  const unbounded = await seed('2', user, '2026-10-01', null);
  const endingToday = await seed('3', user, '2026-10-01', '2026-10-28');
  const endingLater = await seed('4', user, '2026-10-01', '2026-11-01');
  const future = await seed('5', user, '2026-11-01', '2026-11-10');
  const otherEnded = await seed('6', other, '2026-10-01', '2026-10-27');
  const otherActive = await seed('7', other, '2026-10-01', null);
  const preservedIds = [ended, otherEnded, otherActive];
  const preserved = await Promise.all(preservedIds.map(async id => ({ habit: await habit(id), records: await records(id) })));
  const beforeMigration = await rows('select * from public.habits order by id');
  const beforeRecords = await rows('select * from public.habit_daily_records order by habit_id, record_date');
  const migration = source('106_preserve_ended_habits_on_reset.sql');
  await db.exec(migration);
  assert.deepEqual(await rows('select * from public.habits order by id'), beforeMigration, 'Applying the migration never resets habits');
  assert.deepEqual(await rows('select * from public.habit_daily_records order by habit_id, record_date'), beforeRecords);

  await reset();
  for (let i = 0; i < preservedIds.length; i++) {
    const id = preservedIds[i];
    assert.deepEqual(await habit(id), preserved[i].habit, 'Ended habits and other users retain their original dates');
    assert.deepEqual(await records(id), preserved[i].records, 'Ended habit history and other users remain intact');
  }
  for (const [id, end] of [[unbounded, null], [endingToday, '2026-10-28'], [endingLater, '2026-11-01'], [future, '2026-11-10']]) {
    const [row] = await habit(id);
    assert.equal(row.start_date, '2026-10-28', 'Eligible habits restart on the productivity day');
    assert.equal(row.end_date, end, 'Eligible end dates are preserved');
    assert.deepEqual(await records(id), [], 'Eligible completion and focus history is cleared');
  }
  // Repeated resets and migration reapplication must leave completed history intact.
  await db.exec(migration);
  await reset();
  assert.deepEqual(await habit(ended), preserved[0].habit);
  assert.deepEqual(await records(ended), preserved[0].records);

  // At the 04:00 rollover, yesterday's end date becomes ineligible. A habit
  // ending on the productivity day remains eligible, matching the client.
  await setDay('2026-10-27');
  const boundary = await seed('8', user, '2026-10-01', '2026-10-27');
  await reset();
  assert.equal((await habit(boundary))[0].start_date, '2026-10-27');
  assert.deepEqual(await records(boundary), []);
  await db.query(`insert into public.habit_daily_records values($1, '2026-10-27', 1, now(), 1, 60, gen_random_uuid())`, [boundary]);
  const boundaryHabit = await habit(boundary), boundaryRecords = await records(boundary);
  await setDay('2026-10-28');
  await reset();
  assert.deepEqual(await habit(boundary), boundaryHabit);
  assert.deepEqual(await records(boundary), boundaryRecords);

  await setUser(null);
  await assert.rejects(reset(), /Authentication required/);
  assert.equal(await scalar("select has_function_privilege('anon', 'public.reset_my_habits()', 'execute')"), false);
  assert.equal(await scalar("select has_function_privilege('authenticated', 'public.reset_my_habits()', 'execute')"), true);
  assert.deepEqual(await habit(boundary), boundaryHabit, 'Rejected reset does not change ended habits');
  assert.deepEqual(await records(boundary), boundaryRecords);
  console.log('Habit reset SQL PASS: ended dates/history preserved, active and future reset, inclusive end date, productivity-day rollover, ownership, authentication and migration reapplication');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.close());
