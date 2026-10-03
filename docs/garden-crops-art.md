# Crop artwork completion

Generated with the built-in `image_gen` tool on 2026-10-03. The existing 12 harvested crops and 12 mature plants are retained. These eight new transparent atlases supply both views for every remaining crop, bringing the catalog to 57 unique crops in each view. No catalog crop uses a legacy pixel fallback or a generic mature plant.

The original generated PNG files remain under Codex's generated_images directory; selected PNGs were copied to `assets/garden-v6/` without changing their alpha channel. Harvested art uses `assets/garden-v2/crop-atlas.png` as a style reference. Mature plants use `assets/garden-v3/plants-atlas.png` as a style reference.

Each atlas is four columns by three rows. The final special group uses only the first nine cells. `garden-art.js` uses measured painted-object bounds, clips the atlas before fitting it to a square, and retains native aspect ratios. Growth-stage sprites use the same treatment. The farm map positions their painted centres on the centre of the soil. UI-only SVG viewports display the raster assets; the artwork itself remains generated PNGs.

## vegetables

Row-major crop IDs: `sweetPotato`, `eggplant`, `pepper`, `cucumber`, `garlic`, `cabbage`, `broccoli`, `beet`, `radish`, `turnip`, `chili`, `lettuce`.

### crop-vegetables

Saved asset: [crop-vegetables.png](../assets/garden-v6/crop-vegetables.png).

Final prompt:

```text
Use case: stylized-concept. Asset type: production crop inventory sprite atlas for Farmodoro. Image 1 is STYLE REFERENCE ONLY: match its cozy, cute warm pixel illustration, subtle shaded volumes, crisp stepped pixel edges and restrained dark outlines. Create NEW harvested produce, not the reference subjects. Transparent RGBA background, no checkerboard painted into image. Landscape 4:3 canvas, an exact invisible grid of FOUR columns and THREE rows with equal square cells. One isolated crop sprite per cell in the exact row-major order below; all sprites centered inside their cell, approximately 65–72% of cell width/height with ample transparent margins. Nothing may cross a cell boundary. Consistent icon scale. Row 1: orange-fleshed purple sweet potato pair with one cut face; glossy purple eggplant; plump green bell pepper; dark green cucumbers. Row 2: garlic bulbs; tall Korean Napa cabbage; broccoli crown; red beet with a few leaves. Row 3: long thick white Korean radish with green shoulders; round purple-top turnip; slender red chili peppers; soft green lettuce head. The crops must be botanically recognizable and distinct. No pots, soil patches, seed packets, baskets, names, labels, lettering, grid lines, shadows spanning cells, scenery, watermark or extra objects. Preserve the soft cute pixel style of the reference.
```

### plants-vegetables

Saved asset: [plants-vegetables.png](../assets/garden-v6/plants-vegetables.png).

Final prompt:

```text
Use case: stylized-concept. Asset type: production MATURE PLANTED crop sprite atlas for Farmodoro, shown centered on a separately rendered garden bed. Image 1 is STYLE REFERENCE ONLY: match its soft cute warm pixel illustration, stepped pixel outlines, gentle shaded volumes and overhead/three-quarter garden view. Generate NEW plant subjects, not the reference subjects. Genuine transparent RGBA background. Landscape 4:3 canvas with an exact invisible FOUR-column THREE-row grid of equal square cells. One complete compact rooted plant in each cell, exact row-major order below. Center the FULL visible silhouette vertically and horizontally in its cell, approximate 65–72% cell extent, generous transparent margins, no boundary crossing. Plants have distinguishable foliage and clearly visible ripe fruit/vegetables; show roots/stems naturally with at most a tiny brown root-base mark. Row 1: sweet potato vine with heart-shaped leaves and a few orange-purple tubers peeking at its root; compact eggplant bush bearing purple eggplants; small green bell-pepper plant; cucumber vine on its own short stems with two dark green cucumbers. Row 2: garlic clump with upright narrow leaves and bulbs at the base; large Korean Napa cabbage; broccoli plant with a central crown and broad leaves; beet with red root and leafy top. Row 3: mature white Korean radish with green shoulders and upright leaves; round purple-top turnip with leaves; red chili pepper plant; lettuce head growing low. All are charming compact game sprites that fit one field. Keep fruit trees dwarf and foliage modest so fruit reads at small sizes. No baskets, pots, full soil beds, seed packets, trellises, furniture, labels, numbers, text, checkerboard, backdrop, grid lines, watermark, or extra sprites. Do not substitute harvested inventory piles for rooted plants.
```

## grains

Row-major crop IDs: `spinach`, `kale`, `celery`, `pea`, `bean`, `peanut`, `barley`, `oat`, `daikon`, `edamame`, `bokchoy`, `sweetCorn`.

### crop-grains

Saved asset: [crop-grains.png](../assets/garden-v6/crop-grains.png).

Final prompt:

```text
Use case: stylized-concept. Asset type: production crop inventory sprite atlas for Farmodoro. Image 1 is STYLE REFERENCE ONLY: match its cozy, cute warm pixel illustration, subtle shaded volumes, crisp stepped pixel edges and restrained dark outlines. Create NEW harvested produce, not the reference subjects. Transparent RGBA background, no checkerboard painted into image. Landscape 4:3 canvas, an exact invisible grid of FOUR columns and THREE rows with equal square cells. One isolated crop sprite per cell in the exact row-major order below; all sprites centered inside their cell, approximately 65–72% of cell width/height with ample transparent margins. Nothing may cross a cell boundary. Consistent icon scale. Row 1: bunch of spinach leaves; curly dark green kale; celery stalks; peas with one open green pod. Row 2: red kidney beans with a ripe bean pod; peanuts in shells; tied barley ears with long awns; tied oat panicles with dangling grains. Row 3: young Korean yeolmu radish, small white roots with abundant tender leaves; fuzzy green edamame soybean pods; small bok choy with white stems; Korean waxy corn ears with cream and purple kernels, distinct from yellow corn. The crops must be botanically recognizable and distinct. No pots, soil patches, seed packets, baskets, names, labels, lettering, grid lines, shadows spanning cells, scenery, watermark or extra objects. Preserve the soft cute pixel style of the reference.
```

### plants-grains

Saved asset: [plants-grains.png](../assets/garden-v6/plants-grains.png).

Final prompt:

```text
Use case: stylized-concept. Asset type: production MATURE PLANTED crop sprite atlas for Farmodoro, shown centered on a separately rendered garden bed. Image 1 is STYLE REFERENCE ONLY: match its soft cute warm pixel illustration, stepped pixel outlines, gentle shaded volumes and overhead/three-quarter garden view. Generate NEW plant subjects, not the reference subjects. Genuine transparent RGBA background. Landscape 4:3 canvas with an exact invisible FOUR-column THREE-row grid of equal square cells. One complete compact rooted plant in each cell, exact row-major order below. Center the FULL visible silhouette vertically and horizontally in its cell, approximate 65–72% cell extent, generous transparent margins, no boundary crossing. Plants have distinguishable foliage and clearly visible ripe fruit/vegetables; show roots/stems naturally with at most a tiny brown root-base mark. Row 1: spinach clump; curly kale plant; celery stalk clump; short pea vine with hanging pods. Row 2: short kidney bean plant with reddish pods; peanut plant with tiny peanuts visible at its root; golden barley stalks with long awns; golden oat stalks with hanging panicles. Row 3: tender young Korean yeolmu radish with small thin white roots and lush tender leaves; green soybean plant bearing fuzzy edamame pods; bok choy growing low with white stems; Korean waxy corn stalk with cream-purple ripe corn ears, distinct from yellow corn. All are charming compact game sprites that fit one field. Keep fruit trees dwarf and foliage modest so fruit reads at small sizes. No baskets, pots, full soil beds, seed packets, trellises, furniture, labels, numbers, text, checkerboard, backdrop, grid lines, watermark, or extra sprites. Do not substitute harvested inventory piles for rooted plants.
```

## fruits

Row-major crop IDs: `watermelon`, `melon`, `grape`, `blueberry`, `raspberry`, `pear`, `peach`, `cherry`, `orange`, `pineapple`, `kiwi`, `chestnut`.

### crop-fruits

Saved asset: [crop-fruits.png](../assets/garden-v6/crop-fruits.png).

Final prompt:

```text
Use case: stylized-concept. Asset type: production crop inventory sprite atlas for Farmodoro. Image 1 is STYLE REFERENCE ONLY: match its cozy, cute warm pixel illustration, subtle shaded volumes, crisp stepped pixel edges and restrained dark outlines. Create NEW harvested produce, not the reference subjects. Transparent RGBA background, no checkerboard painted into image. Landscape 4:3 canvas, an exact invisible grid of FOUR columns and THREE rows with equal square cells. One isolated crop sprite per cell in the exact row-major order below; all sprites centered inside their cell, approximately 65–72% of cell width/height with ample transparent margins. Nothing may cross a cell boundary. Consistent icon scale. Row 1: striped green watermelon with a small red wedge; pale netted melon; purple grape cluster; blue blueberries with a small leaf. Row 2: red raspberries; round golden Korean pear; pink peach; pair of red cherries. Row 3: orange fruit with a small cut face; pineapple with green crown; brown kiwifruit with a green cut face; warm brown chestnuts with one prickly husk. The crops must be botanically recognizable and distinct. No pots, soil patches, seed packets, baskets, names, labels, lettering, grid lines, shadows spanning cells, scenery, watermark or extra objects. Preserve the soft cute pixel style of the reference.
```

### plants-fruits

Saved asset: [plants-fruits.png](../assets/garden-v6/plants-fruits.png).

Final prompt:

```text
Use case: stylized-concept. Asset type: production MATURE PLANTED crop sprite atlas for Farmodoro, shown centered on a separately rendered garden bed. Image 1 is STYLE REFERENCE ONLY: match its soft cute warm pixel illustration, stepped pixel outlines, gentle shaded volumes and overhead/three-quarter garden view. Generate NEW plant subjects, not the reference subjects. Genuine transparent RGBA background. Landscape 4:3 canvas with an exact invisible FOUR-column THREE-row grid of equal square cells. One complete compact rooted plant in each cell, exact row-major order below. Center the FULL visible silhouette vertically and horizontally in its cell, approximate 65–72% cell extent, generous transparent margins, no boundary crossing. Plants have distinguishable foliage and clearly visible ripe fruit/vegetables; show roots/stems naturally with at most a tiny brown root-base mark. Row 1: watermelon vine with one striped green watermelon; melon vine with one pale netted melon; compact grape vine with purple grape bunches; blueberry bush dotted with blue fruit. Row 2: raspberry bush with red berries; compact dwarf pear tree bearing golden round Korean pears; compact dwarf peach tree with pink peaches; compact dwarf cherry tree with red cherries. Row 3: compact dwarf orange tree with orange fruit; pineapple growing at the center of a spiky green leaf rosette; compact kiwifruit vine bearing brown kiwis; compact dwarf chestnut tree with a few brown chestnuts and green prickly husks. All are charming compact game sprites that fit one field. Keep fruit trees dwarf and foliage modest so fruit reads at small sizes. No baskets, pots, full soil beds, seed packets, trellises, furniture, labels, numbers, text, checkerboard, backdrop, grid lines, watermark, or extra sprites. Do not substitute harvested inventory piles for rooted plants.
```

## special

Row-major crop IDs: `fig`, `plum`, `mango`, `passionFruit`, `pumpkinSquash`, `sunflower`, `bellFlower`, `truffle`, `lavender`.

### crop-special

Saved asset: [crop-special.png](../assets/garden-v6/crop-special.png).

Final prompt:

```text
Use case: stylized-concept. Asset type: production crop inventory sprite atlas for Farmodoro. Image 1 is STYLE REFERENCE ONLY: match its cozy, cute warm pixel illustration, subtle shaded volumes, crisp stepped pixel edges and restrained dark outlines. Create NEW harvested produce, not the reference subjects. Transparent RGBA background, no checkerboard painted into image. Landscape 4:3 canvas, an exact invisible grid of FOUR columns and THREE rows with equal square cells. One isolated crop sprite per cell in the exact row-major order below; all sprites centered inside their cell, approximately 65–72% of cell width/height with ample transparent margins. Nothing may cross a cell boundary. Consistent icon scale. Row 1: purple figs, one cut to reveal pink interior; purple plums; golden mango with one orange cut face; purple passionfruit with one yellow-seeded cut face. Row 2: squat deep green kabocha squash, one small orange slice; a yellow sunflower head and a few seeds; Korean balloon-flower doraji white branching edible roots with one tiny purple flower; dark brown lumpy textured truffles. Row 3: tied lavender sprigs in first cell; leave cells 2, 3 and 4 fully empty transparent. The crops must be botanically recognizable and distinct. No pots, soil patches, seed packets, baskets, names, labels, lettering, grid lines, shadows spanning cells, scenery, watermark or extra objects. Preserve the soft cute pixel style of the reference.
```

### plants-special

Saved asset: [plants-special.png](../assets/garden-v6/plants-special.png).

Final prompt:

```text
Use case: stylized-concept. Asset type: production MATURE PLANTED crop sprite atlas for Farmodoro, shown centered on a separately rendered garden bed. Image 1 is STYLE REFERENCE ONLY: match its soft cute warm pixel illustration, stepped pixel outlines, gentle shaded volumes and overhead/three-quarter garden view. Generate NEW plant subjects, not the reference subjects. Genuine transparent RGBA background. Landscape 4:3 canvas with an exact invisible FOUR-column THREE-row grid of equal square cells. One complete compact rooted plant in each cell, exact row-major order below. Center the FULL visible silhouette vertically and horizontally in its cell, approximate 65–72% cell extent, generous transparent margins, no boundary crossing. Plants have distinguishable foliage and clearly visible ripe fruit/vegetables; show roots/stems naturally with at most a tiny brown root-base mark. Row 1: compact dwarf fig tree with purple figs and broad lobed leaves; compact dwarf plum tree with purple plums; compact dwarf mango tree with golden mangoes and narrow leaves; short passionfruit vine with purple fruit. Row 2: low kabocha squash vine with squat deep green squash; one rooted yellow sunflower with leaves; Korean balloon-flower doraji plant with purple balloon/star blossoms and hints of a pale root at base; tiny low oak sapling and two dark lumpy truffles peeking at its roots. Row 3: rooted lavender clump with purple flower spikes in cell 1; leave cells 2, 3 and 4 fully empty transparent. All are charming compact game sprites that fit one field. Keep fruit trees dwarf and foliage modest so fruit reads at small sizes. No baskets, pots, full soil beds, seed packets, trellises, furniture, labels, numbers, text, checkerboard, backdrop, grid lines, watermark, or extra sprites. Do not substitute harvested inventory piles for rooted plants.
```

## Verification

- `tests/garden-crop-centering-ui-smoke.cjs`: painted crop and soil alpha bounds across six stages, all 57 mature crops, purchased fields, farm previews, and focus backgrounds at desktop and mobile sizes.
- `tests/garden-mail-art-ui-smoke.cjs`: all 57 seed and harvest artworks in mail composition, inbox gifts, crop rewards, seed selection, and kitchen ingredients; send and claim preserve crop IDs, quantities, and Coin charges.
- Existing farm, focus-cover, and responsive regressions remain in place.

## Final measured bounds

Coordinates are `[x, y, width, height]` in the original PNG, in the crop ID order above. A three-pixel transparent margin is applied during rendering; the alpha audit verified it cannot include a neighboring crop.

```json
[
  {
    "file": "crop-fruits.png",
    "width": 1448,
    "height": 1086,
    "bounds": [
      [
        62,
        52,
        318,
        333
      ],
      [
        425,
        68,
        278,
        305
      ],
      [
        764,
        61,
        310,
        322
      ],
      [
        1100,
        113,
        292,
        253
      ],
      [
        49,
        426,
        332,
        277
      ],
      [
        411,
        410,
        310,
        286
      ],
      [
        760,
        410,
        307,
        290
      ],
      [
        1105,
        406,
        303,
        294
      ],
      [
        43,
        731,
        329,
        299
      ],
      [
        415,
        703,
        287,
        349
      ],
      [
        743,
        764,
        319,
        262
      ],
      [
        1095,
        743,
        324,
        288
      ]
    ]
  },
  {
    "file": "crop-grains.png",
    "width": 1448,
    "height": 1086,
    "bounds": [
      [
        43,
        43,
        328,
        324
      ],
      [
        393,
        55,
        331,
        312
      ],
      [
        770,
        34,
        302,
        333
      ],
      [
        1094,
        62,
        314,
        292
      ],
      [
        35,
        398,
        330,
        287
      ],
      [
        424,
        413,
        283,
        273
      ],
      [
        763,
        371,
        324,
        325
      ],
      [
        1104,
        395,
        307,
        300
      ],
      [
        42,
        709,
        336,
        340
      ],
      [
        401,
        735,
        320,
        304
      ],
      [
        739,
        707,
        335,
        338
      ],
      [
        1109,
        715,
        323,
        337
      ]
    ]
  },
  {
    "file": "crop-special.png",
    "width": 1448,
    "height": 1086,
    "bounds": [
      [
        49,
        101,
        314,
        287
      ],
      [
        419,
        102,
        277,
        289
      ],
      [
        748,
        91,
        304,
        297
      ],
      [
        1110,
        103,
        298,
        285
      ],
      [
        41,
        429,
        328,
        283
      ],
      [
        402,
        412,
        312,
        316
      ],
      [
        748,
        407,
        313,
        326
      ],
      [
        1102,
        450,
        312,
        254
      ],
      [
        49,
        735,
        320,
        319
      ]
    ]
  },
  {
    "file": "crop-vegetables.png",
    "width": 1448,
    "height": 1086,
    "bounds": [
      [
        32,
        80,
        333,
        270
      ],
      [
        421,
        43,
        280,
        309
      ],
      [
        771,
        50,
        258,
        298
      ],
      [
        1108,
        66,
        308,
        285
      ],
      [
        40,
        411,
        328,
        283
      ],
      [
        432,
        367,
        259,
        346
      ],
      [
        728,
        383,
        335,
        320
      ],
      [
        1115,
        367,
        305,
        350
      ],
      [
        29,
        710,
        363,
        339
      ],
      [
        429,
        721,
        278,
        320
      ],
      [
        729,
        725,
        312,
        317
      ],
      [
        1094,
        739,
        328,
        299
      ]
    ]
  },
  {
    "file": "plants-fruits.png",
    "width": 1448,
    "height": 1086,
    "bounds": [
      [
        27,
        79,
        340,
        287
      ],
      [
        403,
        88,
        316,
        281
      ],
      [
        764,
        51,
        311,
        316
      ],
      [
        1105,
        72,
        318,
        297
      ],
      [
        33,
        398,
        315,
        301
      ],
      [
        396,
        390,
        319,
        308
      ],
      [
        753,
        388,
        327,
        314
      ],
      [
        1106,
        387,
        319,
        312
      ],
      [
        31,
        714,
        330,
        324
      ],
      [
        387,
        719,
        335,
        323
      ],
      [
        749,
        722,
        321,
        314
      ],
      [
        1112,
        714,
        307,
        323
      ]
    ]
  },
  {
    "file": "plants-grains.png",
    "width": 1448,
    "height": 1086,
    "bounds": [
      [
        30,
        100,
        331,
        277
      ],
      [
        389,
        75,
        346,
        301
      ],
      [
        758,
        58,
        286,
        319
      ],
      [
        1098,
        77,
        324,
        299
      ],
      [
        33,
        405,
        331,
        295
      ],
      [
        397,
        415,
        334,
        285
      ],
      [
        753,
        385,
        307,
        314
      ],
      [
        1108,
        401,
        317,
        298
      ],
      [
        30,
        716,
        336,
        315
      ],
      [
        405,
        722,
        321,
        307
      ],
      [
        745,
        729,
        321,
        302
      ],
      [
        1099,
        709,
        328,
        322
      ]
    ]
  },
  {
    "file": "plants-special.png",
    "width": 1448,
    "height": 1086,
    "bounds": [
      [
        31,
        50,
        329,
        334
      ],
      [
        387,
        46,
        329,
        338
      ],
      [
        749,
        33,
        320,
        351
      ],
      [
        1105,
        65,
        319,
        325
      ],
      [
        26,
        458,
        359,
        283
      ],
      [
        417,
        412,
        283,
        327
      ],
      [
        755,
        437,
        296,
        305
      ],
      [
        1118,
        435,
        297,
        303
      ],
      [
        26,
        765,
        324,
        290
      ]
    ]
  },
  {
    "file": "plants-vegetables.png",
    "width": 1448,
    "height": 1086,
    "bounds": [
      [
        28,
        63,
        331,
        299
      ],
      [
        392,
        46,
        320,
        316
      ],
      [
        743,
        46,
        313,
        316
      ],
      [
        1099,
        57,
        322,
        304
      ],
      [
        37,
        385,
        319,
        311
      ],
      [
        383,
        385,
        329,
        307
      ],
      [
        738,
        405,
        340,
        292
      ],
      [
        1098,
        379,
        325,
        316
      ],
      [
        28,
        706,
        328,
        333
      ],
      [
        392,
        709,
        321,
        327
      ],
      [
        743,
        718,
        324,
        317
      ],
      [
        1097,
        762,
        326,
        273
      ]
    ]
  }
]
```


