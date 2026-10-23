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

## Singapore world (Jamie, 23 Oct 09:40 onward): what is on main
Places, all one Seedream render each, mapped on 5 percent grids, every door and stand walked by tools/smoke_doors.py:
home (bedroom, bathroom, kitchen-living isometric rooms), Garden (scene id `farm`: planter beds by an HDB block, seed
shed, dragon playground), Hawker centre (kopi, chicken rice food log, a table), Little Guilin (scene id `waterfall`:
quarry lake, offerings, bench, viewing deck), Sembawang hot spring (`spring`: she soaks in the lower pool), Merlion
Park (`merlion`: wishes to the Merlion, stone bench; living plate: spout and bay move), Bedok Jetty (`jetty`: fishing
from the jetty). Map: the clay Singapore island with seven pins. Travel loop by doors: garden, hawker, Merlion Park,
jetty, Little Guilin, hot spring. No barn, no Decorate mode (being removed), no villagers.
Living plates (Seedance through masks, tools/live_all.py with tools/jobs_live_sg.json): merlion done; hot spring, jetty,
Little Guilin, garden and hawker queued in one guarded chain. Set each scene's `video` once its loop exists.
Bedroom: Miffy lamp moved off the bathroom door; tapping the bed tucks her in (js/ext/sleep.js). Merged from the
ebb-bedroom-sleep session.

## Known defect (23 Oct, 11:10): second ride after Just arrive
tools/smoke_transit.py fails two checks on main: after "Just arrive" to Little Guilin, picking the MRT for Bedok
Jetty boards the train with no trip saved and the Arrive button still names Merlion Park (the previous trip). The
transit extension's trip state is not reset after a bypass arrival. Everything else in that smoke passes (57 of 59).

## Side sessions in flight (each on its own branch under .claude/worktrees; merge with keep-both on index.html)
ebb-ui-fixes (remove Decorate, icon-chip HUD, phone frame status bar, Codex findings), ebb-routines (personalisable
morning and evening home routines), ebb-transit (train or bus rides with on-board mindfulness or skip), ebb-flower-dome
(Flower Dome seed stall, points for logging), ebb-seats (seated actions on benches and the hawker table).
Jamie's product direction: mindfulness is anytime and everywhere; focus on home first (morning and evening routines),
then generic neighbourhood places (parks, MRT, bus stops, malls), later real-world nudges such as breathing while
waiting for the green man.

Parked renders on disk: art/raw/farm_big.png, coop_interior.png (the barn and chicken house idea was dropped),
art/raw/sg_train.png, sg_bus.png (ebb-transit), sg_flowerdome.png (ebb-flower-dome).

## Next
1. Jamie's verdict on the isometric rooms (screenshots sent 23 Oct, about 03:50).
2. Occlusion in the isometric rooms if wanted (she walks behind the arch-door walls today via solids, not cut-outs).
3. Trees (Phase 3), title screen, outdoor seats: slice the rendered sheets, build on main.
4. Codex review of main; update the Ebb plan doc to the full world.

Zoom: pinch, wheel/trackpad or + / - / 0 scale the camera between 0.75x and 2.4x of the scene's own zoom (EbbGame.api.zoom).
Phone frame for desktop viewing: phone.html (device picker, zoom buttons, reload) wraps index.html in a drawn phone.
Preview: launch entry "ebb" (port 8096) in ovumind/.claude/launch.json. Phone screenshots: python3 tools/shot.py <prefix> [scenes].
