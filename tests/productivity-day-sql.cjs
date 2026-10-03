// Run with PGLITE_MODULE pointing to an installed @electric-sql/pglite package.
// Executes 084 and checks the 04:00 Korea-time day used by tasks and habits.
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/084_productivity_day_starts_at_four.sql'), 'utf8');
const user = '00000000-0000-0000-0000-000000000001';
const db = new PGlite();
const rows = async (sql, params) => (await db.query(sql, params)).rows;
const scalar = async (sql, params) => Object.values((await rows(sql, params))[0])[0];
const iso = date => date.toISOString().slice(0, 10);

(async () => {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select '${user}'::uuid $$;
    create table public.farms (user_id uuid primary key, production_boost_until timestamptz);
    create table public.tasks (id uuid primary key default gen_random_uuid(), user_id uuid, status text, completed_on date,
      completion_reward integer, completed_with_free_pass boolean, completion_cycle_id uuid, archived_at timestamptz);
    create table public.habits (id uuid primary key default gen_random_uuid(), user_id uuid, start_date date, end_date date);
    create table public.habit_daily_records (habit_id uuid, record_date date);
    create function public.ensure_farm_user(uuid) returns void language sql as $$ select $$;
    create function public.apply_farm_wallet_change(uuid, text, bigint, text, text) returns bigint language sql as $$ select 7::bigint $$;
  `);
  await db.exec(migration);

  // Korea is UTC+9 without DST: the productivity day is UTC time + 5 hours.
  const expected = iso(new Date(Date.now() + 5 * 60 * 60 * 1000));
  const today = await scalar(`select public.productivity_today()::text`);
  assert.equal(today, expected);

  await db.exec(`insert into public.tasks (id, user_id, status) values ('10000000-0000-0000-0000-000000000001', '${user}', 'waiting')`);
  const completed = await scalar(`select public.complete_my_task('10000000-0000-0000-0000-000000000001')`);
  assert.equal(completed.completedOn, today);

  await db.exec(`
    insert into public.tasks (id, user_id, status, completed_on) values
      ('10000000-0000-0000-0000-000000000002', '${user}', 'done', public.productivity_today() - 1),
      ('10000000-0000-0000-0000-000000000003', '${user}', 'done', public.productivity_today());
    select public.run_task_lifecycle();
  `);
  assert.deepEqual((await rows(`select id::text, archived_at is not null as archived from public.tasks where status = 'done' order by id`)).map(row => [row.id.slice(-1), row.archived]),
    [['1', false], ['2', true], ['3', false]]);

  await db.exec(`insert into public.habits (user_id) values ('${user}')`);
  assert.equal(await scalar(`select start_date::text from public.habits`), today);
  await db.exec(`update public.habits set start_date = date '2020-01-01'; select public.reset_my_habits();`);
  assert.equal(await scalar(`select start_date::text from public.habits`), today);

  console.log(`SQL PASS: tasks complete, archive and habits start on the 04:00 Korea day (${today})`);
})().catch(error => { console.error(error); process.exit(1); });
