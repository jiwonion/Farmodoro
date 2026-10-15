# Farm V3 expansion artwork

Generated with the built-in `image_gen.imagegen` tool in transparent-background mode. Existing eight mascot sprites and the original collectibles atlas remain unchanged.

## Saved assets

| Workspace asset | Layout | Catalog art indexes | Source generated file |
| --- | --- | --- | --- |
| `assets/farm-v3/fish-expansion-v1.png` | 4 columns × 4 rows; 16 fish | 8–23 | `C:/Users/wlfhd/.codex/generated_images/01a13f1a-557d-7433-9663-8e2998a2ea83/exec-1abdb753-805b-49ef-926d-cb0a33652bdd.png` |
| `assets/farm-v3/mascots-expansion-v1.png` | 4 columns × 2 rows; 8 mascots | 8–15 | `C:/Users/wlfhd/.codex/generated_images/01a13f1a-557d-7433-9663-8e2998a2ea83/exec-65d8df48-271b-4c93-bfd3-480d42af9f30.png` |
| `assets/farm-v3/mascots-fishing-expansion-v1.png` | 4 columns × 2 rows; 8 fishing poses | 8–15 | `C:/Users/wlfhd/.codex/generated_images/01a13f1a-557d-7433-9663-8e2998a2ea83/exec-87b1acec-1b8a-4e3d-be7e-b07194ab6495.png` |

Every generated output was visually inspected and copied into the workspace before being referenced by the renderer. All backgrounds use actual PNG transparency. Fish and normal mascot generation used the existing collectibles and mascot atlases as style references. The fishing pose used the new normal mascot atlas to preserve identities and the original fishing atlas to match equipment and layout.

## Runtime use

`FarmV3Art.fish(id)` selects the original atlas for indexes 0–7 and the expansion atlas for indexes 8–23. New fish use measured individual connected-component bounds in nested SVG viewports around the original raster, preserving bills and tails that cross an equal-cell boundary. `FarmV3CharacterArt.paint(id, pose)` selects the matching 8-character atlas bank while keeping the existing 128×160 normal and 256×192 fishing output sizes.

The existing character render placement is preserved. New frames include a 16-pixel gutter around their source cells, then remove detached atlas debris before measuring their visible bounds. This retains feet and floats that extend a few pixels past a grid boundary without retaining neighboring sprites. All fishing frames retain the connected mascot, rod, line and bobber. The lower-right red bobber band supplies an anchor; the white lower half and outline determine the water contact height. The output canvas stores `dataset.floatX`, `dataset.floatY` and `dataset.artTop` as percentage numbers. `paintAll` applies these to the parent as `--fv-fishing-contact-x`, `--fv-fishing-contact-y` and `--fv-fishing-art-top`.

## Final prompts

### Fish atlas

```text
Use case: stylized-concept
Asset type: production transparent fish inventory sprite atlas for a Korean cozy pixel-art fishing game
Primary request: create a NEW transparent fish sprite atlas, matching the detailed outlined pixel-art fish style in input Image 1 (reference for style ONLY). Produce exactly 16 distinct fish, one per equal cell in a strict 4 columns by 4 rows grid. The output should be a square transparent PNG (1024x1024 ideal). Each fish must be centered entirely within its own 256x256 cell, with at least 18px transparent margins, no crossing cell boundaries.
Input images: Image 1 is style reference; do NOT copy the hats or the old fish.
Subject order left to right then top to bottom:
Row 1: loach (slender brown speckled pond loach with tiny barbels); smelt (small slender translucent silver fish); bluegill (deep green-blue round body and blue gill patch); sweetfish (sleek silver ayu with olive back and small gold cheek).
Row 2: eel (long brown freshwater eel curled compactly); snakehead (long mottled olive fish with large head and long dorsal fin); largemouth bass (green fish with dark lateral stripe and large mouth); blue tang (cobalt blue oval reef fish, black markings and bright yellow tail).
Row 3: clownfish (orange reef fish with three white bands); pufferfish (round cream spotted puffer with short spines); sea bream (deep oval rose-pink fish with tall dorsal fin); flounder (flat mottled sand-brown fish with both eyes visible on upper side).
Row 4: mackerel (silver fish with blue-green striped back); tuna (stocky deep blue tuna with yellow finlets); swordfish (sleek blue swordfish with long pointed bill facing left); sturgeon (long slate-grey fish with distinct bony scutes and pointed snout).
Style/medium: crisp retro pixel art with dark brown/navy pixel outlines, rich hand-shaded clustered pixels, charming but recognizable species anatomy, subtle highlights, same game quality as reference.
Composition/framing: all fish face left, consistent visual scale as inventory icons, roomy transparent separation between all sprites.
Constraints: exactly sixteen fish, actual transparent alpha background, no labels, no text, no watermark, no shadow outside fish, no hats, no grid lines, no scene, no water, no extra decorative objects. Every fish entirely in its own equal grid cell.
```

### Normal mascot atlas

```text
Use case: stylized-concept
Asset type: production transparent mascot sprite atlas for a Korean cozy pixel-art farm game
Primary request: create a NEW atlas of eight cute collectible characters, matching the warm, detailed, outlined pixel-art style and small rounded body proportions of input Image 1. Image 1 is a style reference only; produce these eight NEW identities in exact row-major order.
Composition: transparent rectangular PNG with precisely 4 columns and 2 equal rows, each cell equally sized; 1536x768 ideal, wide2:1. Each full mascot entirely centered in its own cell, front facing, feet resting at a consistent baseline about86% down the cell. Keep generous clean transparent padding (10% minimum) around each sprite so no pixels cross any grid cell. Body sizes visually consistent.
Row1, from left to right:
1) peach jelly: round pastel peach-pink jelly with subtle peach cleft, two small green leaves on top, little blob arms/feet, shiny happy face;
2) fox friend: round fluffy orange fox with large pointed ears, white face/chest, a single visible bushy white-tipped tail curled to its left, seated tiny paws;
3) lotus slime: rounded mint green jelly wearing a small pink blooming lotus on top with a green leaf accent, little blob arms/feet;
4) moon bunny: fluffy ivory rabbit with two long upright ears, pastel lavender ear interiors, small gold crescent moon resting beside one ear, seated paws.
Row2, from left to right:
5) honey bear: plump honey-golden bear with rounded ears, cream muzzle/chest, small amber honey-drop motif on its forehead, seated paws;
6) crystal slime: rounded aqua-lilac transparent jelly with a few faceted pastel crystal points atop its head, shiny chubby small arms/feet;
7) snow penguin: round baby penguin with navy blue back/head, fluffy white face/belly, little orange beak and feet, a tiny snowflake accent on its forehead;
8) sprout dragon: chubby mint-green baby dragon, tiny cream horns, little folded wings, cream belly, leaf sprout on its head and curled tail.
Style: crisp retro pixel art, dark warm pixel outlines, rich colored clustered pixel shading, glossy highlights, black dot eyes, pink blush, cheerful tiny smiling mouths. Match the reference character family closely.
Constraints: exactly eight independent full sprites, actual transparent alpha, no text, no labels, no watermark, no gridlines, no scene, no ground, no cast shadow, no fishing equipment, no extra decorative items.
```

### Fishing mascot atlas

```text
Use case: identity-preserve
Asset type: production transparent fishing-pose mascot sprite atlas, matching another game atlas exactly
Primary request: create a fishing version of the eight exact mascots from Image1. Preserve every mascot identity, colors, proportions, face, head ornaments, and row-major order. Image2 is a reference ONLY for fishing rod, connected line, bobber, pose and strict 4-by-2 atlas arrangement.
Output: transparent rectangular PNG, 4 columns by 2 equal rows, 1536x768 ideal. Exactly one entire mascot with fishing equipment per equal cell; all pixels must stay inside their own cell with at least12px clear transparent gutter on each cell boundary. No background.
Each character: same cute front-facing seated/chubby character, holding a small brown wooden fishing rod diagonally from the body's lower-right side to the upper-right area, with a single slender pale tan line hanging almost vertically down from the rod tip, connected continuously to a round red-and-white float at the lower-right. The character, rod, line and float must visually form ONE physically connected complete sprite. Rod handle touches paw/body, rod tip touches line, line touches float. Float must be fully contained, away from cell edges, and at the same baseline as the mascot feet. The rod/float layout should closely match Image2, leaving enough space beside each mascot to show the whole fishing equipment without overlap with neighbors. Keep each character's full face visible.
Row1 exact order from Image1: peach jelly with two green leaves; orange fox with white face/chest/tail; mint lotus slime with pink lotus; ivory moon bunny with long ears and gold crescent.
Row2 exact order from Image1: golden honey bear with honey drop; aqua-lilac crystal slime; navy/white snow penguin with snowflake; mint sprout baby dragon.
Style: same crisp detailed pixel art, warm dark outlines, clustered pixel shading, glossy highlights, black dot eyes, pink cheeks, cheerful tiny mouths as both references.
Constraints: preserve all eight identities from Image1. Exactly eight independent complete fishing sprites. Actual transparent alpha background. No water, no ripples, no text, no labels, no gridlines, no ground, no shadows, no scene, no additional objects. No disconnected dots, no missing floats, no broken fishing lines.
```
