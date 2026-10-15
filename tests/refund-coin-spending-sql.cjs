const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createDatabase } = require('./helpers/farm-v3-db.cjs');

(async () => {
  const h = await createDatabase();
  const { db, scalar, rpc, setUser, user, other } = h;
  // Freeze execution time; the operation itself uses its real transaction time.
  const operation = fs.readFileSync(path.join(__dirname,
    '../supabase/operations/2026-10-15-refund-coin-spending.sql'), 'utf8')
    .replace('transaction_timestamp()', "timestamptz '2026-10-15 12:00:00+09'");
  const run = async sql => (await db.exec(sql)).find(result => result.rows?.[0]?.refunded_users !== undefined)?.rows[0];
  const insert = (owner, amount, currency, reason, key, time) => db.query(`
    insert into public.farm_wallet_ledger(user_id,currency,amount,balance_after,reason,reference_key,created_at)
    values($1,$2,$3,0,$4,$5,$6)`, [owner, currency, amount, reason, key, time]);
  try {
    await rpc('get_my_farm_v3_state'); await setUser(other); await rpc('get_my_farm_v3_state'); await setUser(user);
    await db.exec(`alter table public.farm_wallet_ledger add column id bigint generated always as identity primary key;
      alter table public.farm_wallet_ledger add column created_at timestamptz not null default now();`);
    await db.query('update public.farm_wallets set coin_balance=-7,farm_money_balance=555 where user_id=$1', [user]);
    await db.query('update public.farm_wallets set coin_balance=10,farm_money_balance=777 where user_id=$1', [other]);
    for (const row of [
      [user,-19,'coin','내 풍경 성장','scenery-grow:yesterday','2026-10-14 23:59:59.999+09'],
      [user,-3,'coin','내 풍경 성장','scenery-grow:midnight','2026-10-15 00:00:00+09'],
      [user,-5,'coin','작물 성장','plot-grow:old','2026-10-15 05:00:00+09'],
      [user,-10000,'coin','내 풍경 성장','scenery-grow:large','2026-10-15 05:20:00+09'],
      [user,-15000,'coin','농장·낚시 Coin 사용','farm-v3-grow:large','2026-10-15 05:30:00+09'],
      [user,-1,'coin','Task completion cancellation','task:t:undo:cycle','2026-10-15 06:00:00+09'],
      [user,-2,'coin','Habit completion cancellation','habit:h:undo:cycle','2026-10-15 06:10:00+09'],
      [user,-1,'coin','Habit completion level change','habit:h:downgrade:cycle','2026-10-15 06:20:00+09'],
      [user,-900,'farm_money','내 풍경 성장','scenery-grow:money','2026-10-15 06:30:00+09'],
      [user,25,'coin','내 풍경 성장','scenery-grow:positive','2026-10-15 07:00:00+09'],
      [user,-2,'coin','내 풍경 성장',null,'2026-10-15 08:00:00+09'],
      [user,-8,'coin','Manual adjustment','admin:adjust','2026-10-15 10:50:00+09'],
      [user,-7,'coin','내 풍경 성장','scenery-grow:cutoff','2026-10-15 12:00:00+09'],
      [user,-29,'coin','내 풍경 성장','scenery-grow:tomorrow','2026-10-16 00:00:00+09'],
      [other,-4,'coin','농장·낚시 Coin 사용','farm-v3-grow:other','2026-10-15 09:00:00+09'],
      [other,-6,'coin','씨앗 구매','seed:other','2026-10-15 10:00:00+09'],
    ]) await insert(...row);

    const before = await rpc('get_my_farm_v3_state');
    const stripTransaction = operation.replace(/^begin;\s*/m, '').replace(/^commit;\s*$/m, '');
    await db.exec('begin');
    assert.equal(Number((await run(stripTransaction)).refunded_coin), 25020);
    await db.exec('rollback');
    assert.equal(Number(await scalar('select coin_balance from public.farm_wallets where user_id=$1', [user])), -7);
    assert.equal(Number(await scalar("select count(*) from public.farm_wallet_idempotency where reference_key like 'coin-spend-refund:%'")), 0);

    const first = await run(operation);
    assert.equal(Number(first.refunded_users), 2);
    assert.equal(Number(first.refunded_coin), 25020);
    assert.equal(Number(first.refunded_transactions), 7);
    assert.deepEqual(first.details.map(i => [i.userId, i.refundedCoin, i.coinBalance]),
      [[user,25010,25003], [other,10,20]]);
    const second = await run(operation);
    assert.equal(Number(second.refunded_users), 0); assert.equal(Number(second.refunded_coin), 0);
    await insert(user,-1,'coin','내 풍경 성장','scenery-grow:later','2026-10-15 11:00:00+09');
    await db.query('update public.farm_wallets set coin_balance=coin_balance-1 where user_id=$1', [user]);
    assert.equal(Number((await run(operation)).refunded_coin), 1);
    assert.equal(Number(await scalar("select sum(amount) from public.farm_wallet_ledger where reason='2026-10-15 Coin 사용 환불'")), 25021);
    assert.equal(Number(await scalar('select farm_money_balance from public.farm_wallets where user_id=$1', [user])), 555);
    const after = await rpc('get_my_farm_v3_state');
    assert.deepEqual({...after,coinBalance:before.coinBalance,serverNow:before.serverNow}, before);
    console.log('PASS: KST boundaries and execution cutoff, actual spending only, both users, negative starting balance, refunds over 10,000 Coin, repeat safety, newly added spending, rollback, audit trail, unchanged Farm Money and game state.');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
