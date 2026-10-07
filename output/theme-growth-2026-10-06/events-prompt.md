# Event growth atlas proposal

Mode: built-in `image_gen`.

Style reference viewed: `C:/Personal Project/Farmodoro/output/concepts/theme-creations-2026-10-06/concept-board.png`.
The reference informs the style only. This is a new proposal atlas, not a runtime asset change.

Requested dimensions: 1536 × 1920 (4:5), four columns × five rows.
Final selected atlas: `events-atlas-v2.png`, copied unchanged from `C:/Users/wlfhd/.codex/generated_images/01a11186-9610-7ec0-a7e1-cfb04ea2c8a7/exec-e79eb9bc-9d63-4624-9e1f-a5016f21f596.png`.
Actual dimensions: 1122 × 1402; true alpha transparency, 1,029,262 fully transparent pixels.
Initial generated atlas retained as `events-atlas-v1.png` from `C:/Users/wlfhd/.codex/generated_images/01a11186-9610-7ec0-a7e1-cfb04ea2c8a7/exec-872297e5-ae96-48ba-a42a-57246c356345.png` (1122 × 1402).

Inspected all twenty subjects: distinct silhouettes, small beginnings, final decorations and row order are clear. The built-in generator did not maintain exact requested pixel dimensions or equal-cell margins. The proposal gallery therefore uses the twenty measured object bounds in `events-bounds.json` to isolate sprites, with one shared scale and bottom anchor per row. Metadata bounds were measured at alpha > 40. The original PNG pixels and alpha were preserved; no artistic post-processing or runtime asset changes were performed.

## Exact generation prompt

```text
Use case: stylized-concept
Asset type: proposal game sprite atlas for Farmodoro theme-specific growth gallery
Primary request: Create one NEW coherent transparent growth sprite atlas containing exactly twenty isolated sprites in four equal columns and five equal rows. The intended canvas is 1536 x 1920 pixels, portrait 4:5 aspect ratio, with square cells. Column order always represents 0%, 25%, 60%, 100% completed growth.
Style inspiration: The previously viewed Farmodoro concept board is only a visual style inspiration. Retain its soft cozy painterly pixel-art feel, visible tiny squared clusters, carefully stepped silhouettes, crisp miniature game detail, warm friendly atmosphere, and three-quarter elevated game camera. Do not retain the concept board's text, interface, scenes or layout. These are freestanding game object sprites, never UI mockups.
Scene/backdrop: Actual alpha-transparent background everywhere outside each sprite. No opaque white background, no checkerboard illustration, no scenery. Tiny object-associated soil or chocolate bases are allowed only where specifically described below.
Composition/framing: Exactly 4 equal columns x 5 equal rows, tightly regular ordering, no visible grid. Every sprite centered horizontally in its own cell, within cell x=10%-90% and y=8%-90%, with grounding baseline about y=88%. Generous transparent gutters separate all cells. Within each row, use the same camera, overall world scale and grounded baseline at all four stages. Early growth sprites remain genuinely SMALL; do not enlarge seedlings to fill cells. Complete silhouettes fit wholly within their cells. No subject crosses a cell boundary.
Rows, exact top-to-bottom order; each row has these exact four left-to-right stages:
1. Valentine HEART ROSE VINE: a small rose sprout on a tiny soil base; two curling leafy rose stems beginning a heart arch; a heart-shaped leafy rose arch with red flower buds; a full heart-shaped rose arch decorated with many red and pink roses on the same tiny soil base. Single centerpiece, no people.
2. Halloween JACK-O-LANTERN: a tiny pumpkin vine sprout; a small round green-orange pumpkin with a few leaves; a big orange pumpkin with a simple unlit carved face; a glowing carved jack-o-lantern with a stalk, curled vine and warm inner candle light. The transformation reads as physical growth plus final finishing.
3. Christmas CHRISTMAS TREE: a tiny evergreen sapling; a small triangular evergreen; a full evergreen tree with a partially hung garland; a complete evergreen Christmas tree decorated with a gold top star, red baubles and twinkling lights. No gifts.
4. White Day CANDY FLOWER BOUQUET: one small pale candy on a stem; three candy flower stems; a nearly full pastel candy and lollipop bouquet without wrap; a completed cream, pale-mint and pastel candy-flower bouquet gathered in white paper and a pale-blue ribbon. Clearly candy flowers, visually distinct from the rose vine.
5. Pepero Day CHOCOLATE BISCUIT TOWER: one chocolate-dipped biscuit stick upright on a tiny chocolate base; three or four chocolate-dipped biscuit sticks forming a small tower framework; a tall stacked architectural biscuit tower almost finished; a charming finished chocolate biscuit tower topped with chocolate drizzle, tiny sprinkles and a bow. No branding or logos.
Lighting/mood: Gentle diffuse light from upper left, miniature object volume, warm cozy finish, subtle compact object contact shadows only. Preserve readable silhouettes and distinct completion details.
Constraints: Twenty sprites total, one sprite in each cell; four stages in every row; actual transparent alpha; no text at all; no labels, captions, arrows, numbers, frames, visible grid, UI, background scenes, characters, hands, kitchen props, recipe HUD, watermark or logos. Create original artwork rather than copying the concept board.
```

## Layout correction prompt

```text
Use case: precise-object-edit
Asset type: transparent 4-column by 5-row growth sprite atlas
Primary request: Correct ONLY the layout of this atlas, preserving the existing twenty sprite subjects, four growth stages per row, style, colors and fine illustration quality. It must become a precisely regular FOUR EQUAL COLUMNS by FIVE EQUAL ROWS atlas, suitable for clipping into twenty independent rectangular cells.
Scene/backdrop: Preserve genuine alpha transparency. No background or grid.
Canvas: portrait 4:5, requested 1536 x 1920 pixels. Treat the canvas as exact equal square cells. Cell center x positions are 12.5%, 37.5%, 62.5%, 87.5% of canvas width. Row centers y positions are 10%, 30%, 50%, 70%, 90% of canvas height.
Layout correction: Center every object on its own exact cell center x. Scale the biggest complete subjects DOWN so every stage is safely inside cell x=18%-82%, y=18%-86%. Align the bottom grounding point to y=84% inside EACH CELL, including all the tiny starting stages. Leave generous fully transparent gutters on all four sides of every cell. Nothing may touch or cross a row or column boundary. Do not enlarge the small starting sprites: within a row, preserve the small beginnings and the shared world scale/camera.
Rows to preserve exactly, top to bottom: 1 heart rose vine, 2 carved Halloween pumpkin, 3 Christmas tree, 4 candy flower bouquet, 5 chocolate dipped biscuit tower.
Columns to preserve exactly, left to right: tiny beginning, small developing form, nearly finished form, full decorated completion.
Specific safety issues to correct: heart vines in row one must not spread into adjacent columns; the completed Christmas tree must stay wholly within row three; the candy bouquets must stay wholly within row four; the biscuit towers must stay wholly within row five. Apply layout padding to all twenty sprites consistently.
Constraints: Change layout and common row scale only; keep all twenty original miniature subjects distinct and clear. No text, no UI, no arrows, no labels, no grid, no scene, no new subjects. Do not create overlapping objects.
```
