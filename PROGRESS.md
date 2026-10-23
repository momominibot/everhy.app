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

## Fixed (23 Oct, afternoon): second ride after Just arrive
board() in js/ext/transit.js now records the current scene before the trip begins. Before, the quarter-second watch
had not yet seen her arrive by "Just arrive", read the next scene change as leaving the carriage, and wiped the new
trip. smoke_transit 59/59. Kitchen session merged (8e0377d). All 17 node suites, smoke_doors 81/81, smoke_kitchen 35/35.

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

## 23 Oct, late afternoon: everything green in one command
`bash tools/check_all.sh` runs all 17 node suites and 16 browser smokes and ends with ALL GREEN (each judged by its exit
code). Six older smokes still expected the pre-Singapore world (barn, hens, tall bathroom, the old waterfall, six map
pins) and were brought up to date. Real fixes found on the way: map name tags covered other places (Hawker centre was
hidden under the Flower Dome pin): tags now pick a free side and the Dome pin sits at Gardens by the Bay; long action
labels ran 2 px under the Map button; focus was lost after the transit sheet closed; bathroom footsteps were tile on a
painted plank floor. `tools/grid.py` draws the game's coordinate grid on any plate. docs/DOUBAO-PLAYBOOK.md holds the
step by step build guide for when Jamie hands work to Doubao (later).

## Jamie's queue (23 Oct, evening), in working order
Done tonight: cut-outs tinted at night (filter #skyCut), standing stretch on the rug in the morning routine, camera keeps
her above any open bottom sheet, Points chip has its own flower, she is 1.5x bigger in the three home rooms (the basin
and island now reach her waist), the whole interface goes to a warm night palette after dark (html[data-daylight]) and
rooms dim gently with the lamps.
Next:
1. One currency: logging and finished practices give hearts; hearts are spent at the Flower Dome on seeds (today the
   dome keeps separate "points"). Each reward shows a little heart above her with a cute chime.
2. Clickable things get a small yellow diamond sparkle, so players know what to tap; logging lives in the house.
3. Sound: a cute optional melody; Merlion Park has the Merlion's water near the statue; birds in nature places.
4. Bathroom: a bathtub soak with a mindful practice (soak pose exists from the hot spring).
5. Wardrobe: the bedroom cabinet opens outfits: a tudung set, and cabin-crew uniforms in the Ebb clay style in blue,
   green and red (check the real rank colours first; confirm the collaboration's licence before anything ships).
Added by Jamie later the same evening (23 Oct):
6. Outfits are worn at the bedroom wardrobe, not the cabinet.
7. Every seat: she just sits first. Then a small inline choice, "Just sit" or "A mindful moment", never a pop-up that
   greys the screen. People sit to take a picture.
8. MRT carriage feels too wide. Bus: make the interior like a real Singapore double-decker (paired seats), cute style.
   Choose a seat first, then offer the mindful option.
9. From home, the Garden is next door: no MRT or bus offer for home to Garden.
10. The shed's "pick seeds" is wrong: seeds are bought at the Flower Dome; the shed only holds what she bought.
11. Weather: follow live Singapore weather (rain when it rains, sun when it's clear), not a random rainy day.
12. Hawker centre: she can't sit on the chairs. Make it much bigger (the camera follows, no phone-size limit), with
    five stalls (Singapore hawker classics, Chinese, Western, Malay, Indian), a stallholder behind each, a cute menu
    to order from with hearts, each dish showing calories, protein, fibre and so on for one standard serving.
Blocked: every new picture (bus interior, bigger hawker, stallholders, food pictures, outfits, drink and victory poses)
waits on the image key; ~/.config/volcengine/api_key changed 23 Oct 15:17 and returns 401. art/BLOCKED.json stays
until Jamie says the key is fixed and to rerun.
Done in the evening batch: home to Garden needs no ride; the shed is now her seed box (seeds only from the Flower
Dome); live NEA two-hour forecast per place (rain only when it rains); no fishing rod at Little Guilin (NParks: "Do not
fish" at Bukit Batok Town Park); tap ripples on the Little Guilin lake; every seat sits first with small chips (Just
sit, A mindful moment, Get up), no grey sheet.
Still to do, from Jamie's later notes:
13. Little Guilin: Erin speaks more there, on nature and noticing when you zone out. The bench should face the lake
    with her seen from behind (needs the plate re-rendered with the bench turned, and a back-view seated pose).
14. Merlion Park: the boat sailing across in a loop (Seedance); a choice of the stone bench or the wooden bench; an
    ice cream cart (matcha and others) where she buys one and eats it on the spot, holding it (poses needed).
15. Flower Dome: the monstera bonsai bigger; shop items as square cards; plants detailed and cute; buy as many as
    she likes into an inventory, place one at a single home spot for now (decorating comes later).
16. Garden: plant bought seeds, water daily, see the plot change every day, ready to pick on day 3 or 4.
17. Bedok Jetty: a fishing mission; caught fish go in the bag; cook them in the home kitchen; a FairPrice-style grocer
    for garlic and spices, cooking as in Rhythme.
18. Map: the whole of Singapore including Sentosa, with its iconic buildings, and our places hidden until tapped
    (a tap reveals the place with a prompt to go there). Needs a new map render.
