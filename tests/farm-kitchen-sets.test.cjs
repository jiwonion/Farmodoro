const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const ctx = vm.createContext({ state: { harvestInventory: {} } });
for (const name of ['CROPS', 'RECIPES', 'FARM_THEMES', 'PLOT_SKINS', 'COSMETIC_CATALOGS', 'FARM_COSMETIC_SETS', 'FARM_SET_PERCENT', 'FARM_SET_EFFECTS', 'FARM_WATER_COOLDOWN_MS', 'FARM_WILT_AFTER_MS']) {
  vm.runInContext(source.match(new RegExp(`const ${name} = [\\s\\S]*?;\\r?\\n`))[0], ctx);
}
for (const name of ['getFarmSetBonuses', 'farmSetEffectText', 'getCosmeticSetDescription', 'getPlotWaterRemaining', 'getPlotWiltRemaining']) {
  vm.runInContext(source.match(new RegExp(`function ${name}\\([^]*?^\\}`, 'm'))[0], ctx);
}
const run = expression => vm.runInContext(expression, ctx);

test('every crop is used; recipes have unique ingredient combinations and valid prices', () => {
  const missing = run('Object.keys(CROPS).filter(id => !Object.values(RECIPES).some(r => r.ingredients.includes(id)))');
  assert.equal(JSON.stringify(missing), '[]');
  const recipes = run('Object.values(RECIPES)');
  const keys = recipes.map(r => [...r.ingredients].sort().join(','));
  assert.equal(new Set(keys).size, keys.length);
  for (const recipe of recipes) {
    assert.ok(recipe.ingredients.length >= 2 && recipe.ingredients.length <= 3);
    assert.ok(recipe.ingredients.every(id => run(`Boolean(CROPS[${JSON.stringify(id)}])`)));
    assert.ok(recipe.sellPrice > 0);
  }
});

test('all cosmetics belong to exactly one complete set', () => {
  for (const [type, catalog] of [['farm_theme', 'FARM_THEMES'], ['plot_skin', 'PLOT_SKINS']]) {
    for (const item of run(catalog)) {
      assert.equal(run(`FARM_COSMETIC_SETS.filter(set => set.${type}.includes('${item.id}')).length`), 1, item.id);
    }
    assert.ok(run(`FARM_COSMETIC_SETS.every(set => set.${type}.length > 0 && set.${type}.every(id => ${catalog}.some(item => item.id === id)))`));
  }
});

test('nameplates are retired and sets count only the theme and field', () => {
  assert.ok(!/LABEL_EFFECTS|label_effect|labelEffect/.test(source));
  assert.equal(run('Object.keys(COSMETIC_CATALOGS).join()'), 'farm_theme,plot_skin');
  assert.ok(run('FARM_COSMETIC_SETS.every(set => !("label_effect" in set))'));
  assert.ok(run('FARM_COSMETIC_SETS.every(set => getCosmeticSetDescription("farm_theme", set.farm_theme[0]).endsWith("5%/10%"))'));
  assert.ok(run('FARM_COSMETIC_SETS.every(set => getCosmeticSetDescription("plot_skin", set.plot_skin[0]).endsWith("5%/10%"))'));
});

test('one piece is tier 1 and both pieces are tier 2, regardless of equipment order', () => {
  const slots = ['equippedFarmTheme', 'equippedPlotSkin'];
  for (const set of run('FARM_COSMETIC_SETS')) {
    const members = [set.farm_theme[0], set.plot_skin[0]];
    for (let mask = 0; mask < 4; mask++) {
      const equipment = Object.fromEntries(slots.map((slot, index) => [slot, mask & (1 << index) ? members[index] : null]));
      const count = slots.filter(slot => equipment[slot]).length;
      const result = ctx.getFarmSetBonuses(equipment);
      assert.equal(result[set.effect], [0, 5, 10][count], `${set.id} mask ${mask}`);
      assert.equal(result[set.effect === 'water' ? 'wilt' : 'water'], 0);
    }
  }
});

test('mixed sets combine and actual water/wilt deadlines match the bonuses', () => {
  const mixed = ctx.getFarmSetBonuses({ equippedFarmTheme: 'springMeadow', equippedPlotSkin: 'mapleLeaf' });
  assert.equal(mixed.harvestDouble, 5);
  assert.equal(mixed.harvestCoin, 5);
  ctx.state = { equippedFarmTheme: 'cherryBlossom', equippedPlotSkin: 'lava' };
  assert.equal(run('getFarmSetBonuses().water'), 5);
  assert.equal(run('getFarmSetBonuses().wilt'), 5);
  const now = 1800000000000;
  assert.equal(ctx.getPlotWaterRemaining({ lastFreeWaterAt: now }, now), 5 * 3600000 * .95);
  assert.equal(ctx.getPlotWiltRemaining({ crop: 'carrot', lastCaredAt: now }, now), 24 * 3600000 * 1.05);
  ctx.state = { equippedFarmTheme: 'volcano', equippedPlotSkin: 'lava' };
  assert.equal(ctx.getPlotWaterRemaining({ lastFreeWaterAt: now }, now), 4.5 * 3600000);
  assert.equal(ctx.getPlotWaterRemaining({ lastFreeWaterAt: now }, now + 4.5 * 3600000), 0);
  ctx.state = { equippedFarmTheme: 'ocean', equippedPlotSkin: 'lava' };
  assert.equal(run('getFarmSetBonuses().water'), 5);
  assert.equal(run('getFarmSetBonuses().waterGrowth'), 5);
  assert.equal(run('getFarmSetBonuses().saleDouble'), 0);
});

test('all twelve sets have distinct, described effects', () => {
  assert.equal(run('new Set(FARM_COSMETIC_SETS.map(set => set.effect)).size'), 12);
  assert.ok(run('FARM_COSMETIC_SETS.every(set => FARM_SET_EFFECTS[set.effect]?.name && FARM_SET_EFFECTS[set.effect]?.suffix)'));
});
