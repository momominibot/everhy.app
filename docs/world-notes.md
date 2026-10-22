# World extension: barn, hot spring, fishing (22 Oct 2026)

Files: `js/ext/world.js` (entry), `js/world/rules.js` (pure rules), `css/ext/world.css`, `art/world/*`,
`tools/test-world.js` (254 node checks), `tools/smoke_world.py` (24 headless checks at 390 px), `tools/jobs_world.json`.

## What she can do
- Farm -> Barn: a "‹ Barn" signpost at the open left edge of the clay farm. The barn is a bird's-eye room (Jamie's
  camera rule for indoor rooms): plank floor, table and pots as solids, doorway in the left wall. Two hens (Pip,
  Clover) and a cow (Mochi), sized against her height at their depth.
  Feed, chat or brush. Only the first kind act of a day counts as a day of care; a heart every 3 days, up to 10.
  A fed hen leaves an egg in the nest the next morning, and it waits there however long she is away. The cow can be
  milked once on any day she has been cared for. Eggs and milk go to `state().farm.basket` (`egg`, `milk`).
- Waterfall -> Hot spring: a "Hot spring" signpost at the right edge. She sits in the water (`api.sit`) for as long as
  she likes. Lowering an egg in makes a spa-boiled egg (`spaEgg`), the small secret.
- Fishing at the pond edge (left of the Goddess's spot): the float bobs on the real pond in the scene and a small card
  holds the words and the Reel in button; wait for a nibble, reel in while the float dips. Too soon or too
  late it just swims off. Small, medium or large fish (`fishSmall`, `fishMedium`, `fishLarge`); timing near the middle
  of the dip makes bigger fish likelier.
- Nothing gets sick, hungry, wilts or dies. Skipped days add nothing and take nothing away. No health data anywhere.
- Saved under `state().world` (`barn`, `fish`, `spaEggFound`); old or broken saves are repaired by `ensureBarn`.

## Full screen
Works under main's full-screen follow camera (2355466). Every world card (animals, hot spring, fishing) is a compact
floating card with no dimming, so the world stays in view. tools/smoke_world.py taps like a player: when a target is
off screen it taps toward it, lets her walk and the camera follow, then taps it.

## For the integrator
1. The engine's `offer()` names an item with `EbbFarm.CROPS[item].name`, which would throw for eggs, milk or fish.
   `world.js` adds those items to `CROPS` as non-enumerable entries on load, so seeds, planting and every
   `Object.keys(CROPS)` loop are unchanged. A shared item-name table in the engine would replace this shim.
2. There is no `addSpot` hook: `world.js` appends the fishing spot to `SCENES.waterfall.spots` after the pond, so
   `spots[0]` stays the pond.
3. `index.html` loads only the entry file, so `world.js` adds `js/world/rules.js` as a script (async false); the load
   event waits for it. A `<script src="js/world/rules.js">` before `js/ext/world.js` would make that unnecessary.
4. Taps during the 0.6 s door fade are ignored by the engine (by design); smoke tests must wait after a scene change.
5. Jamie wants the full mobile screen with a camera that moves as she explores (main 2355466 does this; this branch
   has it merged and every world check passes under it).

## Depth
Every scene this workstream owns has `depth: [yFar, scaleFar, yNear, scaleNear]`: barn [45, 0.19, 95, 0.23] (same camera
as the bird's-eye bedroom), hot spring [56, 0.125, 98, 0.19]. Animals and the hot spring water are sized from
`EbbWorld.scaleAt(y, scene)`.

## Art (Seedream 5.0 pro via tools/run_batch.py, 6 images in two guarded runs, all ok, 47-68 s each)
`world_barn_top` (bird's-eye barn, `art/world/barn-birdseye.webp`; the earlier side-on `world_barn` is kept in art/raw
only), `world_spring` (1024 text-only backgrounds), `world_hen` (4 poses), `world_cow` (3 poses),
`world_items` (egg, milk, three fish, spa egg), keyed and sized with `tools/slice_sheet.py`. Floors, doors and stand
points were read from each background on a 10% grid.
