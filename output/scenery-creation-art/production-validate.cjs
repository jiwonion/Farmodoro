const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'scenery-creation-art.js'), 'utf8'), context);
const art = context.window.SceneryCreationArt;
const proposals = {
  themeNature: { file: 'nature-atlas-v1.png', bounds: 'nature-bounds.json', families: ['tree','cherryTree','goldenWheat','tulipPatch','lavenderPatch'] },
  themeEvents: { file: 'events-atlas-v2.png', bounds: 'events-bounds.json', families: ['heartRose','jackOLantern','christmasTree','candyBouquet','biscuitTower'] },
  themeWeather: { file: 'weather-atlas-v2.png', bounds: 'weather-bounds.json', families: ['coral','bubbleFountain','mushroomGarden','snowman','cactus'] },
  themeFantasy: { file: 'fantasy-atlas-v1.png', bounds: 'fantasy-bounds.json', families: ['volcanoCrystal','galaxyPlanet','auroraCrystal','moonFlower'] },
};
assert.equal(Object.keys(art.metadata.types).length, 29);
assert.equal(Object.keys(art.metadata.families).length, 24);
assert.deepEqual([0,4,5,11,12,19,20,21].map(progress => art.stage(progress,20)),[0,0,1,1,2,2,3,3]);
assert.equal(art.stage(NaN,20),0);
assert.equal(art.stage(-10,20),0);
assert.equal(art.stage(12,0),2);
for (const id of ['unknown','constructor','__proto__','toString']) assert.equal(art.sprite(id),'');
let checks = 0;
for (const [key,atlas] of Object.entries(art.metadata.atlases)) {
  const png = fs.readFileSync(path.join(root, atlas.src));
  assert.equal(png.readUInt32BE(16), atlas.width);
  assert.equal(png.readUInt32BE(20), atlas.height);
  assert.equal(png[25], 6, 'RGBA atlas: '+key);
  if (proposals[key]) {
    const proposal = proposals[key];
    const source = fs.readFileSync(path.join(root,'output/theme-growth-2026-10-06',proposal.file));
    const hash = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
    assert.equal(hash(png),hash(source),'unchanged source pixels: '+key);
    const bounds = JSON.parse(fs.readFileSync(path.join(root,'output/theme-growth-2026-10-06',proposal.bounds),'utf8').replace(/^\uFEFF/,''));
    proposal.families.forEach((family,row) => {
      for (let stage=0;stage<4;stage++) {
        const measured = bounds[row*4+stage];
        assert.deepEqual(Array.from(art.metadata.families[family].bounds[stage]),[measured.left,measured.top,measured.width,measured.height],family+' '+stage);
        checks++;
      }
    });
  }
}
for (const id of Object.keys(art.metadata.types)) {
  for (const progress of [0,5,12,20]) {
    const html = art.sprite(id,progress,20);
    assert.match(html,/overflow="hidden"/);
    assert.match(html,/aria-hidden="true" focusable="false"/);
    assert.match(html,new RegExp('data-creation-stage="'+art.stage(progress,20)+'"'));
    assert.doesNotMatch(html,/NaN|undefined/);
    checks++;
  }
}
for (const [selectedFamily,source] of Object.entries(art.metadata.families)) {
  const maxSize = Math.max(...source.bounds.flatMap(frame=>[frame[2]+8,frame[3]+8]));
  assert.ok(source.bounds[0][3] < source.bounds[3][3], selectedFamily+' visibly grows');
  for (let stage=0;stage<4;stage++) {
    const b=source.bounds[stage], a=[b[0]-4,b[1]-4,b[0]+b[2]+4,b[1]+b[3]+4];
    const html=art.sprite(selectedFamily,[0,5,12,20][stage],20);
    const [,x,y,w,h]=html.match(/<svg x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/);
    assert.ok(Math.abs(Number(h)-(b[3]+8)*90/maxSize)<.001,'shared row scale: '+selectedFamily+' '+stage);
    assert.ok(Math.abs(Number(y)+Number(h)-96)<.0011,'shared baseline: '+selectedFamily+' '+stage);
    assert.ok(Math.abs(Number(x)*2+Number(w)-100)<.0011,'centered: '+selectedFamily+' '+stage);
    for (const [otherFamily,other] of Object.entries(art.metadata.families)) {
      if(other.atlas!==source.atlas) continue;
      for(let otherStage=0;otherStage<4;otherStage++) {
        if(selectedFamily===otherFamily&&stage===otherStage)continue;
        const q=other.bounds[otherStage];
        assert.ok(!(a[0]<q[0]+q[2]&&a[2]>q[0]&&a[1]<q[1]+q[3]&&a[3]>q[1]),selectedFamily+' '+stage+' overlaps '+otherFamily+' '+otherStage);
        checks++;
      }
    }
  }
}
console.log(JSON.stringify({status:'pass',types:29,stages:116,families:24,atlases:7,checks,sourcePixelsUnchanged:true}));
