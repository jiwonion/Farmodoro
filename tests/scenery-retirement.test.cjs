const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function setup(storage = new Map()) {
  const ctx = vm.createContext({
    structuredClone,
    GROUP_COLOR_COUNT: 8,
    getStableGroupColorIndex: () => 0,
    toProductivityDateString: () => '2026-10-07',
    normalizeFocusSettings: settings => settings || { linked: { focusMinutes: 25 }, quick: { focusMinutes: 25 } },
    localStorage: {
      get length() { return storage.size; },
      key: index => [...storage.keys()][index],
      removeItem: key => storage.delete(key),
    },
  });
  for (const name of ['FARM_THEMES', 'defaultState']) {
    const match = source.match(new RegExp(`const ${name} = [^]*?;\\r?\\n`));
    assert.ok(match, `Missing ${name}`);
    vm.runInContext(match[0], ctx);
  }
  const match = source.match(/function loadState\([^]*?^\}/m);
  assert.ok(match, 'Missing persisted-state migration');
  vm.runInContext(match[0], ctx);
  return ctx;
}

test('retiring production preserves productivity, wallets and owned themes while removing old local resources', () => {
  const ctx = setup();
  const tasks = [{ id: 'task', title: '기록 유지', status: 'done', completedDate: '2026-10-01', focusSeconds: 7200, completionReward: 2, completionCycleId: 'cycle' }];
  const habits = [{ id: 'habit', title: '기록 유지', completionDates: ['2026-10-01'], progressByDate: { '2026-10-01': 1 }, focusSecondsByDate: { '2026-10-01': 1800 } }];
  const old = {
    schemaVersion: 46, coins: -5, farmMoney: 1234, farmName: '나의 풍경', focusRewardSeconds: 123,
    tasks, habits, ownedCosmetics: [{ type: 'farm_theme', id: 'ocean' }, { type: 'plot_skin', id: 'snowField' }],
    equippedFarmTheme: 'ocean', equippedPlotSkin: 'snowField',
    farmPlots: [{ id: 0, crop: 'carrot' }], seedInventory: { carrot: 5 }, harvestInventory: { carrot: 2 },
    foodInventory: { countryStew: 3 }, farmItemInventory: { freePass: 1 }, farmInbox: [{ id: 'old-mail' }],
    productionBoostUntil: Date.now() + 100000,
    legacySettlement: { version: 1, coinRefund: 99999, farmMoneyRefund: 99999 },
  };
  const migrated = plain(ctx.loadState(old));
  assert.equal(migrated.schemaVersion, 47);
  assert.equal(migrated.coins, -5);
  assert.equal(migrated.farmMoney, 1234);
  assert.equal(migrated.focusRewardSeconds, 123);
  assert.equal(migrated.tasks[0].completionCycleId, 'cycle');
  assert.equal(migrated.tasks[0].focusSeconds, 7200);
  assert.deepEqual(migrated.habits[0].completionDates, ['2026-10-01']);
  assert.deepEqual(migrated.habits[0].focusSecondsByDate, { '2026-10-01': 1800 });
  assert.deepEqual(migrated.ownedCosmetics, [{ type: 'farm_theme', id: 'ocean' }]);
  assert.equal(migrated.equippedFarmTheme, 'ocean');
  for (const key of ['farmPlots', 'seedInventory', 'harvestInventory', 'foodInventory', 'farmItemInventory', 'farmInbox', 'equippedPlotSkin', 'productionBoostUntil']) {
    assert.equal(Object.hasOwn(migrated, key), false, `${key} cannot remain in current app state`);
  }
  assert.equal(migrated.legacySettlement, null, 'Compensation is read from the server, never granted from local cached values');
  assert.deepEqual(old.tasks, tasks, 'Migration does not mutate the input task records');
});

test('local state migration preserves current scenery recovery while clearing retired placement requests', () => {
  const storage = new Map([
    ['farmodoro-garden-pending:user', 'retired request'],
    ['farmodoro-scenery-intent:user', 'current scenery request'],
    ['farmodoro-focus-outbox:user:tab', 'unacknowledged focus rewards'],
  ]);
  setup(storage).loadState({ coins: 0, farmMoney: 0 });
  assert.equal(storage.has('farmodoro-garden-pending:user'), false);
  assert.equal(storage.get('farmodoro-scenery-intent:user'), 'current scenery request');
  assert.equal(storage.get('farmodoro-focus-outbox:user:tab'), 'unacknowledged focus rewards');
});
