# Pixel farm release

## Included

- PNG pixel crop atlas: all 57 crop IDs and seed/sprout/growing/flower/wilted stages.
- Nine farm theme and twelve plot-skin raster previews; ten static nameplates.
- Blue, square-edged farm UI; mobile field before shop; no cosmetic particles.
- Existing cosmetic IDs, prices, ownership, crop growth rules and RPCs retained.
- Bulletin UI, client handlers/polling and bulletin-comment push event removed.
- Wilt protection remains functional, with a static status label replacing confetti.

## Deployment (not performed by this change)

Deploy index.html, app.js, styles.css, pixel-theme.css, pixel-layout.css,
farm-pixel.css, sw.js, manifest.webmanifest, assets/fonts/Mulmaru.woff2 and
assets/pixel/*.png together. Service-worker cache version
is 190; the retired SVG sprite bundle is
no longer loaded or precached. Original SVG files can remain as unused source.

Deploy supabase/functions/send-push/index.ts and apply migration
068_retire_farm_bulletin.sql. It revokes app-role access to bulletin functions and
tables and removes their realtime publication membership. It does not drop tables
or delete historical posts/comments. Existing migration history is retained.
The migration and Edge Function deployment have not been tested against a live
Supabase project in this task. Mail notifications remain supported.

## Verification

- `node --test tests/sync.test.cjs`: habit history and synchronization regressions.
- `node tests/habits-ui-smoke.cjs`: real headless Chrome at 1440/768/390/320px,
  page navigation, today group filtering, habit controls, all crop/stage mappings,
  all theme/plot IDs, raster rendering, cosmetic tabs, default theme fallback,
  unchanged ownership/balances and no farm-grid SVGs or layout overlap/overflow.
- Optional `FARM_SCREENSHOTS` directory captures screenshots with seeded test
  crops and cosmetics. Tests omit external authentication and do not purchase,
  plant or modify a real account. Purchase/equip server transactions still require
  a staging-account end-to-end check before production deployment.
- Generation mode and source prompts: assets/pixel/README.md.

## App-wide theme follow-up

pixel-theme.css extends the same fixed design system to Today, Tasks, Habits, Focus,
navigation, login, settings, forms, dialogs and date pickers. The screen-theme
selector and profile theme loading/saving were retired; Rachel's farm cosmetics
remain separate and unchanged. Navigation glyphs are hand-set 8x8 CSS pixels. The timer outline is a stepped path
whose normalized pathLength preserves the existing circular progress calculation.
Custom focus-background uploads still override the default backdrop.

Browser smoke checks now assert the single pixel theme, the absence of screen-theme
settings, populated task/habit cards, modal bounds, pixel navigation glyphs,
focus-stage/timer containment and custom background overrides. THEME_SCREENSHOTS
optionally captures pages and dialogs.

## Approved mockup alignment (176)

The user reattached exec-a6dceab6-cd16-4ff3-a21a-ef079ae1ad60.png as the design
reference. pixel-layout.css now applies its actual composition, not only colors:
horizontal top navigation; two welcome panels; a white horizontal timer/status
strip; paired Today task/habit lists; black frames with yellow corner details.
Mobile retains top navigation with a brand/profile row and stacks the daily lists.
The Mulmaru pixel font is self-hosted.

Today completion checkboxes use the existing data-task-status handler. The Tasks
page retains its status-based kanban and existing drag/drop controls. Habit add is
available on Today as shown in the reference. Summary bars use live task/habit
values, not mockup numbers. Unit tests still cover past-date habit rendering.
UI smoke tests assert top navigation placement, equal-height paired list starts
on wide screens, flat Today lists, summary order, pixel font and live progress.
