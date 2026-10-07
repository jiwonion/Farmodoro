/* Four progressive raster stages share one painted scale and ground anchor. */
(() => {
  "use strict";

  const root = "./assets/scenery-creations";
  const atlases = Object.freeze({
    nature: { src: `${root}/nature-v1.png`, width: 1448, height: 1086, columns: 4, rows: 3, cellWidth: 362, cellHeight: 362 },
    winter: { src: `${root}/winter-v1.png`, width: 1448, height: 1086, columns: 4, rows: 3, cellWidth: 362, cellHeight: 362 },
    fantasy: { src: `${root}/fantasy-v1.png`, width: 1448, height: 1086, columns: 4, rows: 3, cellWidth: 362, cellHeight: 362 },
    themeNature: { src: `${root}/theme-nature-v1.png`, width: 1122, height: 1402, columns: 4, rows: 5 },
    themeEvents: { src: `${root}/theme-events-v1.png`, width: 1122, height: 1402, columns: 4, rows: 5 },
    themeWeather: { src: `${root}/theme-weather-v1.png`, width: 1122, height: 1402, columns: 4, rows: 5 },
    themeFantasy: { src: `${root}/theme-fantasy-v1.png`, width: 1254, height: 1254, columns: 4, rows: 4 },
  });

  // Bounds are measured painted objects, not equal-grid frames. Each tuple is
  // [left, top, width, height]. Keep the original atlas pixels and clip precisely
  // because generated row heights vary. Legacy families retain their old art.
  const families = Object.freeze({
    tree: { atlas: "themeNature", row: 0, bounds: [[99,225,110,73],[352,122,127,174],[574,73,193,224],[813,23,283,274]] },
    cherryTree: { atlas: "themeNature", row: 1, bounds: [[90,473,130,115],[326,359,178,228],[558,348,220,241],[805,325,291,267]] },
    goldenWheat: { atlas: "themeNature", row: 2, bounds: [[85,747,131,90],[335,667,158,169],[568,642,201,197],[824,614,264,226]] },
    tulipPatch: { atlas: "themeNature", row: 3, bounds: [[80,1003,142,88],[326,894,177,201],[558,883,217,213],[814,872,272,224]] },
    lavenderPatch: { atlas: "themeNature", row: 4, bounds: [[89,1264,127,90],[326,1186,165,173],[575,1152,187,211],[830,1120,262,245]] },
    heartRose: { atlas: "themeEvents", row: 0, bounds: [[96,197,96,77],[309,107,200,168],[549,68,230,207],[813,51,278,224]] },
    jackOLantern: { atlas: "themeEvents", row: 1, bounds: [[86,428,118,99],[302,379,205,150],[565,332,217,199],[835,309,252,224]] },
    christmasTree: { atlas: "themeEvents", row: 2, bounds: [[86,694,112,124],[337,631,149,188],[578,587,206,231],[865,551,213,265]] },
    candyBouquet: { atlas: "themeEvents", row: 3, bounds: [[89,949,102,120],[330,889,154,180],[563,849,227,220],[837,829,256,245]] },
    biscuitTower: { atlas: "themeEvents", row: 4, bounds: [[84,1200,101,144],[324,1162,175,182],[578,1099,201,248],[858,1080,221,269]] },
    coral: { atlas: "themeWeather", row: 0, bounds: [[83,163,120,99],[349,116,149,148],[590,69,201,197],[852,38,232,229]] },
    bubbleFountain: { atlas: "themeWeather", row: 1, bounds: [[66,415,147,142],[347,369,152,189],[606,333,171,227],[876,308,200,254]] },
    mushroomGarden: { atlas: "themeWeather", row: 2, bounds: [[72,726,135,90],[336,682,167,135],[587,647,208,171],[855,597,240,227]] },
    snowman: { atlas: "themeWeather", row: 3, bounds: [[59,981,168,107],[325,912,191,178],[581,879,213,214],[858,852,230,237]] },
    cactus: { atlas: "themeWeather", row: 4, bounds: [[70,1258,139,111],[344,1198,151,172],[611,1136,174,233],[869,1106,217,265]] },
    volcanoCrystal: { atlas: "themeFantasy", row: 0, bounds: [[72,221,150,83],[363,161,206,148],[661,82,230,233],[964,19,270,296]] },
    galaxyPlanet: { atlas: "themeFantasy", row: 1, bounds: [[83,516,129,95],[384,475,170,138],[665,428,227,185],[938,352,302,261]] },
    auroraCrystal: { atlas: "themeFantasy", row: 2, bounds: [[71,841,152,90],[357,786,204,148],[657,705,241,232],[969,632,263,307]] },
    moonFlower: { atlas: "themeFantasy", row: 3, bounds: [[80,1124,146,101],[378,1007,175,222],[657,991,217,241],[946,950,273,280]] },
    snowRabbit: { atlas: "winter", row: 1, bounds: [[73,587,229,110],[418,502,258,196],[761,441,273,257],[1119,415,280,286]] },
    crystal: { atlas: "winter", row: 2, bounds: [[122,929,143,94],[437,871,207,157],[769,799,251,229],[1106,737,304,304]] },
    sandcastle: { atlas: "fantasy", row: 0, bounds: [[86,227,207,123],[402,207,288,144],[744,125,301,230],[1103,75,310,284]] },
    star: { atlas: "fantasy", row: 1, bounds: [[111,555,156,141],[452,519,187,182],[791,468,211,237],[1141,434,247,279]] },
    planet: { atlas: "fantasy", row: 2, bounds: [[110,884,159,138],[448,855,191,172],[755,805,274,222],[1090,781,337,259]] },
  });

  const types = Object.freeze({
    tree: { family: "tree", variant: 0, filter: "none" },
    cherryTree: { family: "cherryTree", variant: 0, filter: "none" },
    goldenWheat: { family: "goldenWheat", variant: 0, filter: "none" },
    tulipPatch: { family: "tulipPatch", variant: 0, filter: "none" },
    lavenderPatch: { family: "lavenderPatch", variant: 0, filter: "none" },
    heartRose: { family: "heartRose", variant: 0, filter: "none" },
    jackOLantern: { family: "jackOLantern", variant: 0, filter: "none" },
    christmasTree: { family: "christmasTree", variant: 0, filter: "none" },
    candyBouquet: { family: "candyBouquet", variant: 0, filter: "none" },
    biscuitTower: { family: "biscuitTower", variant: 0, filter: "none" },
    bubbleFountain: { family: "bubbleFountain", variant: 0, filter: "none" },
    mushroomGarden: { family: "mushroomGarden", variant: 0, filter: "none" },
    volcanoCrystal: { family: "volcanoCrystal", variant: 0, filter: "none" },
    galaxyPlanet: { family: "galaxyPlanet", variant: 0, filter: "none" },
    auroraCrystal: { family: "auroraCrystal", variant: 0, filter: "none" },
    moonFlower: { family: "moonFlower", variant: 0, filter: "none" },
    blossomTree: { family: "cherryTree", variant: 1, filter: "saturate(.94)" },
    goldenTree: { family: "tree", variant: 2, filter: "hue-rotate(-42deg) saturate(1.1)" },
    coral: { family: "coral", variant: 0, filter: "none" },
    pinkCoral: { family: "coral", variant: 1, filter: "hue-rotate(8deg) saturate(.9)" },
    cactus: { family: "cactus", variant: 0, filter: "none" },
    floweringCactus: { family: "cactus", variant: 1, filter: "hue-rotate(-18deg) saturate(1.15)" },
    snowman: { family: "snowman", variant: 0, filter: "none" },
    snowRabbit: { family: "snowRabbit", variant: 0, filter: "none" },
    crystal: { family: "crystal", variant: 0, filter: "none" },
    roseCrystal: { family: "crystal", variant: 1, filter: "hue-rotate(105deg) saturate(.85)" },
    sandcastle: { family: "sandcastle", variant: 0, filter: "none" },
    star: { family: "star", variant: 0, filter: "none" },
    planet: { family: "planet", variant: 0, filter: "none" },
  });

  function stage(progress = 0, growthCost = 20) {
    const amount = Number(progress);
    const cost = Number(growthCost);
    const ratio = Number.isFinite(amount) ? Math.max(0, amount) / (Number.isFinite(cost) && cost > 0 ? cost : 20) : 0;
    return ratio >= 1 ? 3 : ratio >= .6 ? 2 : ratio >= .25 ? 1 : 0;
  }

  function sprite(typeId, progress = 0, growthCost = 20) {
    const type = Object.prototype.hasOwnProperty.call(types, typeId) ? types[typeId] : null;
    if (!type) return "";
    const family = families[type.family];
    const atlas = atlases[family.atlas];
    const frame = stage(progress, growthCost);
    const [left, top, width, height] = family.bounds[frame];
    const padding = 4;
    const clip = [Math.max(0, left-padding), Math.max(0, top-padding), width+padding*2, height+padding*2];
    clip[2] = Math.min(clip[2], atlas.width-clip[0]);
    clip[3] = Math.min(clip[3], atlas.height-clip[1]);
    // A single scale for a family's four stages preserves visible growth.
    const paintedSize = Math.max(...family.bounds.flatMap((bounds) => [bounds[2]+padding*2, bounds[3]+padding*2]));
    const scale = 90 / paintedSize;
    const fittedWidth = clip[2]*scale;
    const fittedHeight = clip[3]*scale;
    const number = (value) => Number(value.toFixed(3));
    const x = number((100-fittedWidth)/2);
    const y = number(96-fittedHeight);
    const filter = type.filter === "none" ? "" : ` style="filter:${type.filter}"`;
    return `<svg class="scenery-creation-art scenery-creation-art-${type.family}" data-creation-family="${type.family}" data-creation-stage="${frame}" data-creation-variant="${type.variant}" viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true" focusable="false"${filter}><svg x="${x}" y="${y}" width="${number(fittedWidth)}" height="${number(fittedHeight)}" viewBox="${clip.join(" ")}" preserveAspectRatio="none" overflow="hidden"><image href="${atlas.src}" width="${atlas.width}" height="${atlas.height}"/></svg></svg>`;
  }

  window.SceneryCreationArt = Object.freeze({ sprite, stage, metadata: Object.freeze({ atlases, families, types }) });
})();
