# Scenery creation sprites

## Current theme-specific artwork

The production renderer now supports **19 theme-specific representative creations** and all **14 original type IDs**, for **29 unique type IDs** and **24 painted families**. The four approved growth-proposal atlases were copied into sibling production filenames without resampling or artistic post-processing. Generated transparency is preserved. All artwork was generated with the built-in `image_gen` tool, using the approved concept board as a style reference only.

| Production atlas | Actual dimensions | Families | Source and full generation prompt |
| --- | --- | --- | --- |
| `assets/scenery-creations/theme-nature-v1.png` | 1122 × 1402 | tree, cherryTree, goldenWheat, tulipPatch, lavenderPatch | [nature proposal provenance](../output/theme-growth-2026-10-06/nature-prompt.md), copied from `nature-atlas-v1.png` |
| `assets/scenery-creations/theme-events-v1.png` | 1122 × 1402 | heartRose, jackOLantern, christmasTree, candyBouquet, biscuitTower | [events proposal provenance](../output/theme-growth-2026-10-06/events-prompt.md), copied from the final `events-atlas-v2.png` |
| `assets/scenery-creations/theme-weather-v1.png` | 1122 × 1402 | coral, bubbleFountain, mushroomGarden, snowman, cactus | [weather proposal provenance](../output/theme-growth-2026-10-06/weather-prompt.md), copied from the final `weather-atlas-v2.png` |
| `assets/scenery-creations/theme-fantasy-v1.png` | 1254 × 1254 | volcanoCrystal, galaxyPlanet, auroraCrystal, moonFlower | [fantasy proposal provenance](../output/theme-growth-2026-10-06/fantasy-prompt.md), copied from `fantasy-atlas-v1.png` |

Each row has four meaningful stages at **0%, 25%, 60%, and 100%**. The renderer uses the actual per-object alpha bounds in the [proposal bounds files](../output/theme-growth-2026-10-06/), adds **four pixels of padding**, and keeps one scale and one bottom anchor per family. Early stages therefore remain smaller than the completed object. Generated row spacing is irregular, so equal-grid clipping is not used. The final candy bouquet explicitly uses `[837,829,256,245]`, ending at y=1073; this prevents its bottom from showing the neighbouring biscuit tower.

The API remains `SceneryCreationArt.sprite(typeId, progress, growthCost)`, with `stage()` and `metadata`. New representatives have their own IDs and intrinsic painted shapes: true cherry branches and blossoms, wheat ears, tulips, lavender, heart-shaped roses, carved pumpkin, decorated Christmas tree, candy bouquet, biscuit tower, bubble fountain, mushrooms, lava crystal, planet, aurora crystal, and moonlight flower. No theme parameter or runtime recolour is needed for these new representatives.

Legacy IDs retain their historical identity. `blossomTree` uses the true cherry-tree family with a subtle saturation filter; `goldenTree` remains a gold-filtered green tree, while the new golden-harvest representative is `goldenWheat`. `pinkCoral` and `floweringCactus` use filtered versions of the new corresponding coral and cactus families. `snowRabbit`, `star`, `planet`, `crystal`, `roseCrystal`, and `sandcastle` keep the original atlas artwork. The old three PNGs remain available for existing records.

The SVG remains decorative (`aria-hidden`, `focusable=false`). Callers provide the accessible creation name and progress on the surrounding element. Unknown and inherited property IDs return an empty string.

### Current artwork validation

[Production validation](../output/scenery-creation-art/production-validate.cjs) passes **1760 checks**: all 29 IDs across four stages, stage boundaries and invalid input guards, exact measured bounds, fixed per-family scale and baseline, and no padded clip overlapping a neighbouring object's painted bounds. All seven atlases have their declared dimensions and RGBA PNG format. SHA-256 comparisons confirm the four production copies preserve their source pixels exactly.

Actual Chrome rendering passes all **116 type/stage frames** and loads all seven atlases at their exact dimensions. The [complete production preview](../output/scenery-creation-art/theme-preview.png) and [dark-background alpha preview](../output/scenery-creation-art/theme-dark-preview.png) were visually inspected: true transparency, readable growth, and complete sprite silhouettes are preserved. [Browser verification results](../output/scenery-creation-art/production-browser-validation.json) and the [preview runner](../output/scenery-creation-art/render-production-preview.cjs) are retained as review artifacts. Node syntax validation also passes.

## Original atlas generation archive

The following records describe the original 14-type artwork and generation prompts. Current mappings and clipping use the theme-specific artwork above.

Generated on 2026-10-06 with the built-in `image_gen.imagegen` tool. The approved [concept board](../output/concepts/theme-creations-2026-10-06/concept-board.png) was used as a style reference only. No API/CLI fallback or additional package installation was used. Generated alpha is preserved; the original generated PNGs were copied, without artistic post-processing, to the project.

## Project assets and source outputs

| Atlas | Source generated PNG | Family rows |
| --- | --- | --- |
| `assets/scenery-creations/nature-v1.png` | `C:/Users/wlfhd/.codex/generated_images/01a110e1-73b2-79a1-8613-58d71e9b5265/exec-d5e00ee7-d08e-4ce2-9222-2f82bbf20256.png` | tree, coral, cactus |
| `assets/scenery-creations/winter-v1.png` | `C:/Users/wlfhd/.codex/generated_images/01a110e1-73b2-79a1-8613-58d71e9b5265/exec-3721a93f-2e6a-4291-9f15-51dd305f3a6d.png` | snowman, snowRabbit, crystal |
| `assets/scenery-creations/fantasy-v1.png` | `C:/Users/wlfhd/.codex/generated_images/01a110e1-73b2-79a1-8613-58d71e9b5265/exec-8eae51a9-6bd2-42cc-a423-221f2b156524.png` | sandcastle, star, planet |

Each actual output is **1448 × 1086**, a 4-column × 3-row atlas with nominal **362 × 362** cells. Columns are four meaningful stages: started, growing/assembling, nearly complete, complete. The generator returned 1448 × 1086 rather than the requested 1536 × 1152; metadata uses the actual dimensions.

## Runtime API

```js
SceneryCreationArt.sprite("coral", 12, 20); // HTML string: clipped SVG
SceneryCreationArt.stage(12, 20); // 2
SceneryCreationArt.metadata; // atlases, families with bounds, type variants
```

Stages change at 0%, 25%, 60%, and 100%. Unknown type IDs return an empty string. The runtime applies one shared image scale per family and a shared bottom anchor so early stages remain smaller. Measured object bounds, with five pixels of padding, clip each sprite before positioning it in the outer 100 × 100 SVG. The generated tree and snowman bases extend slightly beyond the nominal first row, so equal-grid clipping would trim their base. The renderer uses measured bounds instead.

Type mapping: tree/blossomTree/goldenTree share the tree row; coral/pinkCoral share coral; cactus/floweringCactus share cactus; crystal/roseCrystal share crystal. Snowman, snowRabbit, sandcastle, star and planet use their own rows. Variants use a small runtime CSS filter declaration; they share the same silhouettes and progressive art. The base cactus already has one flower in its final stage, while floweringCactus provides a warmer, more saturated palette rather than a separate flower silhouette.

The SVG uses the class `scenery-creation-art`, sets `aria-hidden="true"`, and exposes `data-creation-family`, `data-creation-stage`, and `data-creation-variant`. A caller should put the accessible creation name/progress on the surrounding element.

## Validation

The three assets were visually inspected after copying into the workspace. Native System.Drawing alpha inspection confirmed real transparency and measured foreground bounds. Atlas-level metrics are recorded in [atlas-inspection.json](../output/scenery-creation-art/atlas-inspection.json). The [browser preview](../output/scenery-creation-art/preview.png) includes all nine families at every stage, all five palette variants, and a dark-background alpha review; it is a review artifact, not a runtime asset.

Chrome checks passed for all 14 type IDs across all four stages, stage thresholds, unknown-ID guards, SVG clipping, and all three loaded atlas dimensions. Node syntax validation passed. [Bounds validation](../output/scenery-creation-art/validate.cjs) passed 452 render and neighbouring-sprite checks: a selected sprite's padded clip never intersects another sprite's painted bounds. Palette review confirmed pink blossom foliage, golden tree highlights, pink coral, and rose-pink crystals.

## Final prompt set

The shared instructions below were included in each built-in call; the board was passed as the sole referenced image and `transparent_background` was true.

### Nature

```text
Use case: stylized-concept.
Asset type: production game sprite atlas with a genuinely transparent background, generated as a new artwork asset.
Input Image 1 is STYLE REFERENCE ONLY, the approved Farmodoro concept board. Match its soft cozy painterly pixel-art: clearly visible small squared pixel clusters and stepped outlines, pastel highlights, detailed but readable silhouettes, three-quarter slightly elevated game camera. No interface, no lettering.
Canvas target: 1536 x 1152 pixels, aspect ratio 4:3. Exactly FOUR equal-width columns and THREE equal-height rows, 12 sprites total, regular invisible 384-pixel-square cells. Do NOT draw gridlines. Each object is horizontally centered in its own cell, shared base baseline at 88 percent cell height. Maintain exactly the SAME camera, whole-object scale and anchor across the four columns. Object progress grows from small beginning to complete; do not scale the small stage up to fill the cell.
Every cell has generous fully transparent empty margins, object contained strictly within its cell: x from 12% to 88%, y from 9% to 89%. No artwork touches adjacent cell. Include only tiny family-appropriate ground base directly below the object, never background/scenery/environment/card/shadow outside the object base. The four columns are chronological stages at 0%, 25%, 60%, 100%. Stage zero must already show a small visible beginning, never an empty cell. Column 3 nearly complete but visibly simpler than column 4. Column 4 richly detailed full object.
True alpha transparency everywhere outside the 12 isolated objects. No solid background, no checkerboard drawn into the image, no text, labels, numbers, arrows, borders, cell dividers, interface, duplicate extras.
Rows in EXACT order:
ROW 1 TREE: same friendly green deciduous tree on a tiny earthen/grass root patch. Column 1 tiny rooted sprout with two leaves; column 2 young thin trunk with a small foliage tuft; column 3 medium trunk with branching rounded green canopy; column 4 lush mature rounded leafy tree, warm brown trunk and roots.
ROW 2 CORAL: same beautiful blue-violet branching coral based on the large focal branching pink coral in reference, but default palette ocean blue/lavender. Tiny pale smooth rock base. Column 1 tiny coral nub with two short branches; column 2 low cluster of five branches; column 3 branching medium fan; column 4 large intricate coral fan with many blue/lilac branches and pale glowing tips, contained within cell and no underwater scenery.
ROW 3 CACTUS: same green saguaro cactus on a very small warm sand/root patch. Column 1 small green rooted nub; column 2 straight short cactus with one tiny emerging arm; column 3 tall cactus with two arms, clear ribbing; column 4 full branched cactus with several arms, delicate pale spines, tiny warm pink flower at one arm, no pots.
```

### Winter

```text
Use case: stylized-concept.
Asset type: production game sprite atlas with a genuinely transparent background, generated as a new artwork asset.
Input Image 1 is STYLE REFERENCE ONLY, the approved Farmodoro concept board. Match its soft cozy painterly pixel-art: clearly visible small squared pixel clusters and stepped outlines, pastel highlights, detailed but readable silhouettes, three-quarter slightly elevated game camera. No interface, no lettering.
Canvas target: 1536 x 1152 pixels, aspect ratio 4:3. Exactly FOUR equal-width columns and THREE equal-height rows, 12 sprites total, regular invisible 384-pixel-square cells. Do NOT draw gridlines. Each object is horizontally centered in its own cell, shared base baseline at 88 percent cell height. Maintain exactly the SAME camera, whole-object scale and anchor across the four columns. Object progress grows from small beginning to complete; do not scale the small stage up to fill the cell.
Every cell has generous fully transparent empty margins, object contained strictly within its cell: x from 12% to 88%, y from 9% to 89%. No artwork touches adjacent cell. Include only tiny family-appropriate ground base directly below the object, never background/scenery/environment/card/shadow outside the object base. The four columns are chronological stages at 0%, 25%, 60%, 100%. Stage zero must already show a small visible beginning, never an empty cell. Column 3 nearly complete but visibly simpler than column 4. Column 4 richly detailed full object.
True alpha transparency everywhere outside the 12 isolated objects. No solid background, no checkerboard drawn into the image, no text, labels, numbers, arrows, borders, cell dividers, interface, duplicate extras.
Rows in EXACT order:
ROW 1 SNOWMAN: match the large friendly snowman in the reference with softly faceted blue-white snow, orange carrot nose, navy-blue check scarf, twig arms and two brown buttons. Snow base only. Column 1 small rolled snowball; column 2 large lower snowball plus a smaller head being assembled, no accessories; column 3 two-ball snowman with face and two buttons, one twig arm and short partly wrapped blue scarf; column 4 fully complete round happy snowman with two twig arms, carrot nose, smile, buttons and long blue scarf. No hat.
ROW 2 SNOW RABBIT: Japanese-style sculpted snow rabbit on small snow patch. Column 1 small oval snow mound; column 2 recognizable white oval rabbit body with short half-built ears; column 3 cute plump rabbit with long upright snow ears and red berry eyes but plain; column 4 completed elegant round snow rabbit with long upright leaf-shaped snow ears, red berry eyes, tiny pink nose and a pair of tiny green leaf decorations. No human clothing.
ROW 3 CRYSTAL: beautiful blue-cyan ice crystal cluster on minimal frosty rock base. Column 1 tiny two-point blue crystal bud; column 2 three short translucent crystals; column 3 medium angular crystal spires; column 4 tall blue-cyan crystal cluster with five to seven faceted tapered spires and delicate frost highlights. Crystal is opaque enough to read well against backgrounds, only outside object is transparent.
```

### Fantasy

```text
Use case: stylized-concept.
Asset type: production game sprite atlas with a genuinely transparent background, generated as a new artwork asset.
Input Image 1 is STYLE REFERENCE ONLY, the approved Farmodoro concept board. Match its soft cozy painterly pixel-art: clearly visible small squared pixel clusters and stepped outlines, pastel highlights, detailed but readable silhouettes, three-quarter slightly elevated game camera. No interface, no lettering.
Canvas target: 1536 x 1152 pixels, aspect ratio 4:3. Exactly FOUR equal-width columns and THREE equal-height rows, 12 sprites total, regular invisible 384-pixel-square cells. Do NOT draw gridlines. Each object is horizontally centered in its own cell, shared base baseline at 88 percent cell height. Maintain exactly the SAME camera, whole-object scale and anchor across the four columns. Object progress grows from small beginning to complete; do not scale the small stage up to fill the cell.
Every cell has generous fully transparent empty margins, object contained strictly within its cell: x from 12% to 88%, y from 9% to 89%. No artwork touches adjacent cell. Include only tiny family-appropriate ground base directly below the object, never background/scenery/environment/card/shadow outside the object base. The four columns are chronological stages at 0%, 25%, 60%, 100%. Stage zero must already show a small visible beginning, never an empty cell. Column 3 nearly complete but visibly simpler than column 4. Column 4 richly detailed full object.
True alpha transparency everywhere outside the 12 isolated objects. No solid background, no checkerboard drawn into the image, no text, labels, numbers, arrows, borders, cell dividers, interface, duplicate extras.
Rows in EXACT order:
ROW 1 SANDCASTLE: warm cream-gold sand castle on a tiny sand foundation. Column 1 small mound with one low turret; column 2 low square wall and two modest turrets; column 3 recognizable castle with three towers, doorway and crenellations, no flag; column 4 richly complete cute sandcastle with central tower, four small corner towers, arched door, crenellations and one small coral-red flag, a couple of tiny shell details on base.
ROW 2 STAR: a handmade luminous five-point golden star, upright above a tiny crescent cloud pedestal. Not a face/character. Column 1 a small golden seed-like star spark just above the cloud; column 2 small simple five-point golden star; column 3 medium full five-point warm yellow star with a softly faceted surface; column 4 large beautiful golden star with honey/cream faceted pixel highlights and a few tiny contained blue-gold sparkles immediately beside it. No big halo, no distant stars or background.
ROW 3 PLANET: a small dreamy lavender-blue Saturn-like planet sitting visually just above a tiny wispy cloud pedestal. Column 1 tiny spherical seed with a thin partial orbit; column 2 small lavender sphere with a short half ring; column 3 medium lavender-blue sphere with almost complete warm lavender ring; column 4 full beautiful lavender-blue planet, luminous soft surface bands and a broad tilted lavender/rose ring, a few tiny close-contained sparkles. No faces, no solar system or background.
```
