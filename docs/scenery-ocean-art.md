# Ocean scenery background

Created 2026-10-06 (Asia/Seoul) using the built-in `image_gen` tool through the `imagegen` skill. This is a new standalone 3:2 background, not an atlas frame and not a foreground creation sprite. It replaces the ocean theme's grassy focal clearing with an empty, shallow turquoise lagoon so the separately rendered coral sits in water.

- Project asset: `assets/scenery-creations/ocean-scene-v1.png`
- Source generation: `C:/Users/wlfhd/.codex/generated_images/01a1110f-95b3-7ad0-b8c6-9611c024f4f5/exec-4b97de0f-0dd3-497f-b694-a7d39df88e80.png`
- Style/composition reference: `assets/garden-v4/fantasy-atlas.png`, top-right coastal scene only.
- Scene reference: `output/concepts/theme-creations-2026-10-06/concept-board.png`, left coastal picture only. The coral and all interface elements were excluded from the generated background.
- Original generated file is preserved. The selected output is copied directly into the project without image post-processing.
- Visual verification: one sunny coastal scene, cottage upper left, curved sandy outer shore, open shallow central lagoon, no coral, characters, UI or text. The central lower lagoon is available for the separate creation sprite.

## Exact generation prompt

```text
Use case: stylized-concept.
Asset type: ONE standalone finished raster background for a cozy pixel-painted productivity game; landscape 3:2, approximately 1536 by 1024.
Primary request: create the sunny ocean scenery from the TOP RIGHT scene of reference Image 1 as one full-canvas scene, with the broad grassy central clearing replaced by a clear shallow turquoise lagoon. Match the existing cottage, trees, stone-lined sandy shoreline and gently elevated three-quarter camera perspective. This is an empty game background; a coral sprite will be drawn separately over the middle lower lagoon.
Input images: Image 1 is the existing Farmodoro fantasy atlas; use ONLY its top-right sunny coastal scene as the style and composition reference, never reproduce its atlas grid or its other three scenes. Image 2 is the approved UI concept board; use ONLY the left coastal picture to understand the shallow-lagoon setting and empty placement area. Its coral and all UI are explicitly excluded.
Scene/backdrop: a cozy cream cottage with a deep blue tiled roof tucked into the upper-left quarter beneath green leafy trees, small white/pink flowers at the outer foliage borders. Distant bright-blue ocean and a few low islands along the upper-right horizon. A curved narrow sandy shore/path follows the outer left and bottom borders, with soft gray rounded stones separating it from the lagoon. A small unobtrusive wooden pier may enter from the extreme right edge. The lagoon occupies the broad center and lower center, roughly x 25 to 88 percent and y 33 to 95 percent, connected naturally to the sea on the right.
Focal area: keep the entire central lower lagoon clear and EMPTY, especially around x 50 percent, y 65 percent. Luminous transparent turquoise water with subtle gentle caustics and a pale sandy seabed; enough open water to place one large independently rendered coral without covering any scenery object. No central island, no central rock, no central plant, and no central grassy clearing.
Style/medium: the exact warm whimsical painterly pixel-art texture, detailed but soft, cheerful storybook game scenery, comparable pixel density and forms to Image 1. Clean readable composition, no photorealism.
Lighting/mood: bright gentle sunny daylight, warm cream sand and cottage, emerald foliage, vivid clear aquamarine shallows, tranquil.
Constraints: one seamless scene filling the entire 3:2 rectangular canvas; no panels, borders, labels, captions, UI, coins, numbers, typography, watermark, people, animals, coral, snowman, crop beds, farm plots or other foreground subjects. Preserve a large empty central lagoon and the top-left cottage so the separate creation can sit clearly in the water.
```
