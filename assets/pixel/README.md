# Farm pixel art

Generated with the built-in image generation tool (new image mode), 2026-09-12/13.
The PNG atlases are runtime assets, not SVG filters. CSS uses nearest-neighbor
rendering and fixed atlas positions. Keep IDs in app.js stable for existing purchases.

- crops-atlas.png: 8 × 8; 57 crops, 5 shared growth states, 2 empty slots.
- themes-atlas.png: 3 × 3; nine static farm surroundings.
- plots-atlas.png: 4 × 3; twelve static soil skins.
- farm-supplies-atlas.png: 5 × 2; ten transparent inventory item sprites.
- food-atlas.png: 8 × 5; 39 transparent cooked-food sprites and one empty slot.
- Nameplates use static CSS pixel borders/palettes; no particles, glow or animation.

Crop, theme and plot order is explicitly documented by PIXEL_CROP_IDS,
PIXEL_THEME_IDS and PIXEL_PLOT_IDS in app.js. Coordinates are independent of catalog order.
These assets were visually inspected and integrated in desktop/mobile browser tests.

## Generation prompts

### crops

Create a production-ready PIXEL ART SPRITE ATLAS PNG for a cozy 16-bit farming web game. EXACT 8 columns by 8 rows, a perfectly regular uniform grid, 1024x1024 square total, each cell 128x128. TRUE TRANSPARENT ALPHA BACKGROUND across all cells. NO drawn grid, labels, letters, numbers, cell borders or shadows outside sprites. Every sprite wholly contained within its own cell, centered in cell with generous equal 20px transparent padding on all sides, same visual scale 70-85px tall. Each icon consists of crisp square pixels in the style of hand-drawn 32x32 SNES inventory sprites enlarged exactly 3x without smoothing; limited tasteful palettes, dark colored 1 pixel outlines, flat 3-tone shading, no gradients, no glossy lighting, no sparkle effects. These are clearly recognizable detailed HARVESTED crop/vegetable inventory icons, not entire trees or landscapes. Top-to-bottom row order, left-to-right column order MUST be exactly:
Row 1: carrot, red tomato, yellow corn cob, potato, purple sweet potato, strawberry, purple eggplant, green bell pepper.
Row 2: cucumber, orange pumpkin, brown onion, white garlic, napa cabbage, broccoli, whole striped watermelon, cantaloupe melon.
Row 3: rice grain stalks, brown mushroom, sunflower, beetroot, white radish, purple-top turnip, red chili pepper, lettuce.
Row 4: spinach leaves, curly kale, celery stalks, green peas pod, red kidney beans, peanut in shell, golden wheat stalks, barley stalks.
Row 5: oat stalks, purple grapes bunch, blueberries, raspberries, red apple, yellow pear, pink peach, paired red cherries.
Row 6: lemon, orange, pineapple, halved kiwi, dark green kabocha squash, young radish greens, edamame pod, bok choy.
Row 7: chestnut, cut purple fig, purple plum, mango, halved passion fruit, white bellflower root, pale purple sweet corn, dark truffle mushroom.
Row 8: purple lavender flower stems, three planted brown seeds, tiny green seedling, growing green leafy plant, green plant with small cream blossom, wilted brown drooping plant, EMPTY TRANSPARENT CELL, EMPTY TRANSPARENT CELL.
Keep all 64 cell positions EXACT. Transparent padding never occupied by adjacent sprite. Uniform pixel-art style and scale throughout. No text anywhere.

### themes

Create a production-ready 3 by 3 PIXEL ART BACKGROUND ATLAS, square PNG 1536x1536, EXACT nine equal 512x512 square panels touching with no margins or borders, no labels, no UI text. Every panel is a beautiful static top-down 16-bit farm clearing scene with matching geometry: 75% central area calm low-contrast ground with plenty of empty space for a 3x3 interactive plot grid drawn later; scenery restricted to top 15%, left/right 8% and bottom 8% borders. Crisp square pixels, restrained mature cozy pixel game art, 3-tone flat shading, no vector curves, no blur, no particles, no floating petals, no gleam or sparkle, no lights/glow/lens effects, NO planted crop patches in the central clearing. Each panel distinctly attractive and balanced. Same scale and orthographic camera in all panels.
Row1 left: cherry blossom orchard edges with pink pixel tree canopies and sage clearing. middle: valentine rose garden borders and clay pink ground with a small rose trellis. right: halloween autumn stone garden orange pumpkin decorations at corners, dusky olive clearing.
Row2 left: christmas snow covered conifer borders, calm pale blue snowy clearing. middle: white day white-flower garden and ivory stone clearing with blue-edged low fences. right: spring meadow rich green clearing with leafy trees and daisies on the perimeter.
Row3 left: galaxy night deep indigo ground and purple-blue trees, quiet crescent moon decoration on a corner stone marker, NO twinkling stars and no glows. middle: ocean sandy clearing bordered by blue water and a little wooden jetty at the upper edge, NO watery overlay across center. right: bubble field light teal wetland garden with round lily-pad shapes at outer edge and mint stone clearing, NO floating bubbles.
The output is a usable background tilesheet, not a screenshot or poster. All panels EXACTLY equal and aligned at one-third boundaries.

### plots

Production-ready tile atlas for pixel farm soil skins. PNG 1536x1152 landscape, EXACT 4 columns by 3 rows of equal square tiles, no gaps, no text, no labels, no UI. Every tile a crisp 32x32-style hand-drawn square pixel terrain texture scaled nearest neighbor with 3-tone shading, subtle pixel edging and horizontal soil furrows. Calm empty centers so crop sprites and text can sit on top; sparse themed ornament only near corners. Static beautiful materials, NO glows, sparkles, shiny gradients, animation cues or particles. Distinct colors/materials.
Row1: pink cherry petal soil tile; icy blue frosted soil tile; rich brown chocolate-bar furrows; pale coral candy garden soil.
Row2: lavender/yellow star-candy terrain with tiny solid star-shaped corner candies (not sparkles); warm orange maple leaf soil; snowy white blue-shadowed soil; golden beige sand dune furrows.
Row3: charcoal volcanic soil with dark terracotta fissures (NO glowing lava); pale multi-color pastel striped soil with discrete muted bands; golden ochre soil with wheat detail in corner; lilac lavender soil with tiny purple flower corner.
Each tile occupies exactly one quarter of width and one third of height. Hard pixel edges, no rounded vector corners. No objects above terrain, no crops.

### farm supplies

Create exactly 10 distinct farming-game item sprites on a genuinely transparent background, arranged in a perfectly even 5 × 2 atlas. Row 1: golden lucky-fertilizer sack, blue moisture potion, purple premium-fertilizer sack, golden harvest invitation scroll, blue field-festival invitation scroll. Row 2: farmer free-pass ticket, green revival potion, orange sunlight growth potion, seed-market refresh parchment, food-market refresh parchment. Use crisp 16-bit Korean retro farming-game pixel art, chunky square pixels, dark navy outlines and a restrained blue/yellow/green/purple/orange palette. Keep one centered item per cell at identical scale. No text, labels, UI frames, glow, floating sparkles, gradients, watermark or extra objects.

### food

Create exactly 39 distinct food and drink icons in a strict 8 × 5 transparent atlas; leave the last cell empty. Use crisp 16-bit farming-RPG pixel art with dark navy outlines and readable 32px silhouettes. Row order: vegetable stew, tomato-corn soup, strawberry-melon parfait, strawberry tart, mushroom rice, pumpkin soup, apple-lemon jam, garden salad; ratatouille, farm pizza, pepper-pea fried rice, tropical punch, corn-potato chowder, gazpacho, beet-apple juice, broccoli-mushroom stir-fry; cabbage rice wrap, apple pie, blueberry-lemon cake, grape-peach punch, pumpkin porridge, spicy peanuts, carrot-orange juice, pear-kiwi smoothie; watermelon-strawberry punch, barley-mushroom pilaf, oat-blueberry porridge, kabocha curry, bok choy stir-fry, edamame tofu salad, chestnut injeolmi, fig-cheese platter; plum sorbet, mango sticky rice, passion-fruit yogurt, bellflower namul, sweet-corn cheese bake, truffle risotto, lavender milk tea, empty. One centered icon per cell, generous transparent padding, no grid, text, labels, watermark, or extra objects.
