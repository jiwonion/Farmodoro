const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const ctx = vm.createContext({ state: { harvestInventory: {} } });
for (const name of ['CROPS', 'RECIPES', 'FARM_THEMES', 'PLOT_SKINS', 'LABEL_EFFECTS', 'FARM_COSMETIC_SETS', 'FARM_SET_PERCENT', 'FARM_SET_EFFECTS', 'FARM_WATER_COOLDOWN_MS', 'FARM_WILT_AFTER_MS']) {
  vm.runInContext(source.match(new RegExp(`const ${name} = [\\s\\S]*?;\\r?\\n`))[0], ctx);
}
for (const name of ['getRecipeAvailability', 'getFarmSetBonuses', 'getPlotWaterRemaining', 'getPlotWiltRemaining']) {
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

test('availability counts repeated ingredients and distinguishes seeds from harvest', () => {
  ctx.state = { harvestInventory: { carrot: 3, potato: 5 }, seedInventory: { cherry: 20 } };
  assert.equal(run('getRecipeAvailability({ingredients:["carrot","carrot","potato"]}).count'), 1);
  assert.equal(run('getRecipeAvailability(RECIPES.cherryTart).count'), 0);
  assert.equal(run('getRecipeAvailability({ingredients:["carrot","carrot"]}, {carrot:1}).missing[0]'), '당근 1개 부족');
});

test('all cosmetics belong to exactly one complete set', () => {
  for (const [type, catalog] of [['farm_theme', 'FARM_THEMES'], ['plot_skin', 'PLOT_SKINS'], ['label_effect', 'LABEL_EFFECTS']]) {
    for (const item of run(catalog)) {
      assert.equal(run(`FARM_COSMETIC_SETS.filter(set => set.${type}.includes('${item.id}')).length`), 1, item.id);
    }
    assert.ok(run(`FARM_COSMETIC_SETS.every(set => set.${type}.length > 0 && set.${type}.every(id => ${catalog}.some(item => item.id === id)))`));
  }
});

test('all slot combinations use the highest tier, regardless of equipment order', () => {
  const slots = ['equippedFarmTheme', 'equippedPlotSkin', 'equippedLabelEffect'];
  for (const set of run('FARM_COSMETIC_SETS')) {
    const members = [set.farm_theme[0], set.plot_skin[0], set.label_effect[0]];
    for (let mask = 0; mask < 8; mask++) {
      const equipment = Object.fromEntries(slots.map((slot, index) => [slot, mask & (1 << index) ? members[index] : null]));
      const count = slots.filter(slot => equipment[slot]).length;
      const result = ctx.getFarmSetBonuses(equipment);
      assert.equal(result[set.effect], [0, 1, 5, 10][count], `${set.id} mask ${mask}`);
      assert.equal(result[set.effect === 'water' ? 'wilt' : 'water'], 0);
    }
  }
});

test('mixed sets combine and actual water/wilt deadlines match the bonuses', () => {
  ctx.state = { equippedFarmTheme: 'cherryBlossom', equippedPlotSkin: 'lava', equippedLabelEffect: null };
  assert.equal(run('getFarmSetBonuses().water'), 1);
  assert.equal(run('getFarmSetBonuses().wilt'), 1);
  const now = 1800000000000;
  assert.equal(ctx.getPlotWaterRemaining({ lastFreeWaterAt: now }, now), 5 * 3600000 * .99);
  assert.equal(ctx.getPlotWiltRemaining({ crop: 'carrot', lastCaredAt: now }, now), 24 * 3600000 * 1.01);
  ctx.state = { equippedFarmTheme: 'volcano', equippedPlotSkin: 'lava', equippedLabelEffect: 'flameBorder' };
  assert.equal(ctx.getPlotWaterRemaining({ lastFreeWaterAt: now }, now), 4.5 * 3600000);
  assert.equal(ctx.getPlotWaterRemaining({ lastFreeWaterAt: now }, now + 4.5 * 3600000), 0);
  ctx.state = { equippedFarmTheme: 'ocean', equippedPlotSkin: 'lava', equippedLabelEffect: 'goldenSparkle' };
  assert.equal(run('getFarmSetBonuses().water'), 1);
  assert.equal(run('getFarmSetBonuses().waterGrowth'), 1);
  assert.equal(run('getFarmSetBonuses().saleDouble'), 1);
});

test('all twelve sets have distinct, described effects', () => {
  assert.equal(run('new Set(FARM_COSMETIC_SETS.map(set => set.effect)).size'), 12);
  assert.ok(run('FARM_COSMETIC_SETS.every(set => FARM_SET_EFFECTS[set.effect]?.name && FARM_SET_EFFECTS[set.effect]?.suffix)'));
});
