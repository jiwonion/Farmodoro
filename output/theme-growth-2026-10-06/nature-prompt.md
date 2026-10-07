# Nature theme growth proposal atlas

Generated with the built-in `image_gen` tool on 2026-10-06. Proposal artwork; runtime game assets were not changed.

- Style reference: `output/concepts/theme-creations-2026-10-06/concept-board.png` (style only).
- Original source: `C:/Users/wlfhd/.codex/generated_images/01a11186-4425-7e91-be21-fbff5cd7b9e7/exec-ea91873d-d8ca-46cd-b2a9-506b62101d50.png`
- Workspace copy: `output/theme-growth-2026-10-06/nature-atlas-v1.png`
- Requested size: 1536 × 1920. Generated dimensions: **1122 × 1402**, `Format32bppArgb` with real transparent alpha.
- Twenty sprites: green tree, cherry blossom tree, wheat clump, tulip patch, lavender clump; four stages each.
- No artistic post-processing or resampling. Original pixels are preserved.
- Inspection: all rows and stages are legible; early stages are visibly smaller. Wheat has no tree trunk/canopy; cherry branches and blossoms differ from green tree. Tulip stage 2 already has buds and the first cherry stage includes pink buds, so the proposed stage labels should match the actual picture. Generated rows are not perfectly uniform; use measured row bounds, not an assumed equal grid, when clipping the preview.

## Full generation prompt

```text
Use case: stylized-concept.
Asset type: transparent cozy game growth sprite atlas for Farmodoro proposal comparison gallery.
Primary request: Draw EXACTLY twenty isolated growth sprites in an EXACT 4-column by 5-row atlas. Preferred output size 1536 x 1920 pixels (portrait 4:5). Every cell is equal size: 384 x 384. Each row contains FOUR stages of the SAME object left-to-right, at 0%, 25%, 60%, and 100% development.
Input image: the supplied concept-board image is STYLE REFERENCE ONLY. Borrow its soft cozy painterly pixel illustration, stepped silhouettes, gentle texture, warm sunlight, elevated three-quarter camera, and charming expressive shapes. Do not copy the UI, scenery, lettering, borders, water, cottage, or content of that board.
Scene/backdrop: TRUE ALPHA TRANSPARENCY for the entire background. Only the sprites and their tiny natural ground patches are visible. No colored sheet background, checkerboard, scenery, panels, or frames.
Style/medium: handcrafted painterly pixel art with crisp subtly stepped silhouettes, small blocklike light highlights, soft textured details, rounded friendly shapes. Not photorealistic, not flat vector, not chunky Minecraft blocks. Match the supplied warm illustrated game concept. Consistent sunlight from upper left and consistent three-quarter camera throughout.
Composition/framing: exact equal 4 x 5 atlas; no offsets, missing cells, extra cells, or variable-width rows. Center each sprite horizontally in its cell. Each cell has a shared bottom ground/contact baseline at 88% of cell height. Keep all visible pixels strictly within horizontal 10%-90% and vertical 8%-90% of its own cell with transparent padding. Avoid any sprite or leaf escaping its own cell. Small beginnings must actually be SMALL, occupying much less height/width than mature stages. Maintain a fixed camera and stable ground scale per row; do NOT zoom each stage to equal size. The subject enlarges naturally from stage to stage.
Exact rows, TOP to BOTTOM:
ROW 1 — GREEN TREE. Stage 1: tiny fresh two-leaf sprout on a very small earth patch. Stage 2: thin young sapling with one little green leaf tuft. Stage 3: branching small tree with distinct green canopy lobes and visible brown trunk. Stage 4: lush mature rounded green tree with several layered canopy lobes and strong brown trunk. Natural size progression and charming tree proportions.
ROW 2 — TRUE CHERRY BLOSSOM TREE, biologically and visually distinct from green tree. Stage 1: small bare rooted twig with one fork on earth. Stage 2: young slender brown spreading branches studded with CLOSED pink flower buds, still no round solid foliage ball. Stage 3: delicate branched tree with HALF-OPEN pink cherry blossoms in distinct clusters and visible branching trunk. Stage 4: expansive airy delicate blooming cherry tree with richly layered pale-pink blossoms, visible elegant spreading trunk, a few falling petals staying in this cell. This is NOT a pink recolor of the green tree, not a green-leaf tree.
ROW 3 — GOLDEN WHEAT CLUMP, absolutely NOT a tree. Stage 1: a few tiny green grasslike shoots on a small earth patch. Stage 2: a handful of tall narrow green grain stems with slender blades. Stage 3: amber developing grain ears appearing atop stems with some green remaining. Stage 4: a luxuriant fan-shaped clump of golden-yellow wheat ears gently bending/swaying, distinctly segmented seed heads, on a small earth patch. No tree trunk or broad canopy.
ROW 4 — SPRING TULIP PATCH. Stage 1: tiny clustered broad leaf shoots on a tiny grass patch. Stage 2: several leafy tulip stems growing upward. Stage 3: several tall CLOSED colorful pink/yellow/coral tulip buds above broad green leaves. Stage 4: lush blooming pink, yellow, coral tulip clump, open recognizable cup-shaped tulip blooms and deep green leaves, small grass patch. Not daisies or generic round flowers.
ROW 5 — LAVENDER CLUMP. Stage 1: one small grey-green leaf sprig on a tiny earth patch. Stage 2: a bush of many slender green stems with narrow leaves, no flowers yet. Stage 3: short violet lavender buds appear on stems. Stage 4: tall richly flowering violet-purple lavender bush with many slender vertical flowering spikes and grey-green foliage on tiny earth patch. Clearly distinct from the tulip row; no large cup flowers.
Text: NONE.
Constraints: Exactly 20 sprites and nothing else. All 5 themes and 4 stages must be complete and visible. Generous transparent spacing on ALL sides. No pots, planters, decorations, people, animals, letters, labels, arrows, numbers, stage text, grids, cell borders, UI, watermark, background, or horizon. Preserve TRUE TRANSPARENT ALPHA, do not paint transparency as a checkerboard.
```
