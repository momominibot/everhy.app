# Ebb progress

Ebb is the separate gameplay wellness app for Dr Patrick's Ebb spec (plan: https://claude.ai/artifact/EbYrzwTvqTijxffjJqdwjW).
Written from scratch: no Rhythme code is copied (Jamie, 22 Oct 2026). Rhythme is only a behavioural reference.
Design rules: docs/AC-STUDY.md. Blueprint mapping: docs/BLUEPRINT-MAP.md. Hooks for workstreams: docs/EXTENDING.md.

## Look (settled 22 Oct 2026, late evening)
- Dreamy Animal Crossing inspired clay, every image from Seedream 5.0 pro via tools/run_batch.py (guarded queue).
- Tall 4:7 plates (768x1344), full phone width, blurred fill above and below; scenes declare `aspect: [4, 7]`,
  x 0..100 and y 0..175 in one unit. Square scenes still work.
- Rooms are ONE whole render each (bedroom-dream, bathroom-dream) with fixed spots on the painted objects. The empty
  shells plus movable pieces exist only behind "Decorate this room" (More menu).
- The player is the Animal Crossing proportioned girl (art/chars/ac); lilac and tudung outfits are rendering as
  ac_lilac and ac_tudung. The older chibi sets stay on disk, hidden from the wardrobe.
- Life layer (js/ebb-life.js): twinkling lights, motes, petals, steam, mist, reaction bubbles.

## Merged into main (22 Oct 2026)
settings/offline/export, safety/consent/onboarding, chat logging and cycle chart (pop-ups from room objects), course
with Erin's voice (Jamie approved), barn/hot spring/fishing on tall plates, world map, day and night with weather,
ambient and action sound. Node suites: core 346, settings 75, safety 187, log 145, course 134, world 254, map 77,
sky 63, sound 171.

## In flight (sessions)
- ebb-integrate: make every browser smoke pass together, tools/run_all_tests.sh.
- ebb-sound: proximity ambience (waterfall swells near the pond, birds by the trees) and cute UI sounds.
- ebb-bag (Phase 2): EbbItems registry, state.bag, Bag sheet.
- ebb-trees (Phase 3): peach trees and daily dig nodes. Art: art/raw/tree_stages.png, dig_items.png (queued).
- ebb-npc was cancelled by Jamie (no wandering cat).

## Next
1. Slice ac_lilac and ac_tudung when the batch ends; `python3 tools/build_clay_sets.py`.
2. Merge integrate, sound, bag, trees when they report; run tools/run_all_tests.sh; Codex review of main.
3. Painted-room occlusion cutouts (so she can pass behind the floor lamp and plants) if Jamie wants it.
4. Update the Ebb plan doc to the full world.

Preview: launch entry "ebb" (port 8096) in ovumind/.claude/launch.json. Phone screenshots: python3 tools/shot.py <prefix> [scenes].
