# Ebb progress

Ebb is the separate gameplay wellness app for Dr Patrick's Ebb spec (plan: https://claude.ai/artifact/EbYrzwTvqTijxffjJqdwjW).
Written from scratch: no Rhythme code is copied (Jamie, 22 Oct 2026). Rhythme is only a behavioural reference.
Design rules: docs/AC-STUDY.md. Blueprint mapping: docs/BLUEPRINT-MAP.md. Hooks for workstreams: docs/EXTENDING.md.

## Look (settled 22 Oct; rooms widened 23 Oct)
- Dreamy Animal Crossing inspired clay, every image from Seedream 5.0 pro via tools/run_batch.py (guarded queue).
- Rooms (bedroom, bathroom, kitchen-living) are ONE isometric cut-away render each, 1024 square, shown at zoom 2.2 so
  the camera pans around them (Jamie 23 Oct: bigger rooms, not rectangles, including the room and bathroom). Floors
  are the wooden diamond minus every painted piece; y runs 0..100. The older tall empty shells survive only behind
  "Decorate this room" (the game swaps plate shape, depth and start with the shell).
- Outdoors are tall 4:7 plates (y 0..175): spacious four-bed farm, cherry-tree waterfall with a bridge, stone hot
  spring (23 Oct renders from the Doubao continuation), barn.
- The player is the original girl redrawn smooth in clay, hoodie and jeans (art/chars/genz); outfits default, lilac,
  tudung. The big-headed ac sets stay on disk, unused.
- Life layer (js/ebb-life.js): twinkling window lights, lamp glows, motes, petals, steam, mist, reaction bubbles.
  Six times of day in js/ext/sky.js.
- Live plates (js/ext/live.js, 23 Oct): the waterfall plays art/plates/waterfall-live.mp4 (webm for browsers without
  H.264), a 4.4 s seamless loop in which only the falls, the pond and the two cherry trees move. Made by
  tools/live_plate.py (one guarded Seedance 2.0 image-to-video run on the plate) plus art/live/waterfall-mask.png and
  an ffmpeg crossfade-loop and masked overlay, so every pixel outside the mask is the still painting. Reduced motion,
  Decorate mode or a refused autoplay fall back to the still plate and the drawn streams.

## Merged into main
settings/offline/export, safety/consent/onboarding, chat logging and cycle chart (pop-ups from room objects), course
with Erin's voice (Jamie approved; three short practices on the cushion before the course starts), barn/hot spring/
fishing, world map, day and night with weather, ambient and action sound, bag, today (three invitations a day, hearts).
Node suites (23 Oct): core 399, world 246, map 77, sky 64, sound 273, bag 65, log 145, safety 187, settings 75,
course 134, today 189. Browser: tools/smoke_doors.py walks every door, spot and bed (37/37); tools/smoke_today.py 27/27.

## Not on main (branch doubao/2026-10-23-overnight, the Doubao continuation's snapshot)
Villagers extension (Jamie: no NPC villagers), a second day/night overlay (sky.js already has six phases), the bells
seed-garden panel (a parallel economy beside the farm), a full-scene video plate (it moved everything).

## Side branches still open
- claude/ebb-integrate-ebfaf5: WIP smokes together + tools/run_all_tests.sh; conflicts in tools/smoke_sound.py.
- claude/ebb-occluders-c23e4a: WIP cut-outs for the OLD tall rooms; obsolete now the rooms are isometric renders.
- ebb-trees, ebb-title, ebb-seats: no commits beyond main (their sessions hit the limit); art/raw/seats.png,
  tree_stages.png, dig_items.png are rendered and unsliced.

## Next
1. Jamie's verdict on the isometric rooms (screenshots sent 23 Oct, about 03:50).
2. Occlusion in the isometric rooms if wanted (she walks behind the arch-door walls today via solids, not cut-outs).
3. Trees (Phase 3), title screen, outdoor seats: slice the rendered sheets, build on main.
4. Codex review of main; update the Ebb plan doc to the full world.

Preview: launch entry "ebb" (port 8096) in ovumind/.claude/launch.json. Phone screenshots: python3 tools/shot.py <prefix> [scenes].
