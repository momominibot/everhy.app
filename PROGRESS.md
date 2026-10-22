# Ebb progress

Ebb is the separate gameplay wellness app for Dr Patrick's Ebb spec (plan: https://claude.ai/artifact/EbYrzwTvqTijxffjJqdwjW).
Written from scratch: no Rhythme code is copied (Jamie, 22 Oct 2026). Rhythme is only a behavioural reference.

## Look
Jamie chose clay (concept A) on 22 Oct, keeping the clay character turnarounds. The first slice still runs on the
flat (E) backgrounds and a flat SVG puppet while the clay art is generated.

## Done (slice 1, 22 Oct 2026)
- js/ebb-world.js: three scenes (bedroom, farm, waterfall), floor polygons, doors, spots, own A* planner.
- js/ebb-farm.js: beds grow by watered days (overnight), nothing decays, 3 free seeds a day, basket.
- js/ebb-puppet.js: flat cut-out puppet, front/back/side, walk/idle/work/sit, outfit layers, tudung hides hair.
- js/ebb-ui.js: wardrobe with live preview; 3 or 5 minute sitting practice with anchor choice, pause, end,
  save finished/partial or not, "That felt hard" path. Practice copy is a draft for teacher review.
- js/ebb-store.js: versioned local save; practices stored as observations with provenance.
- tools/test-core.js: 207 node checks pass.

## Next
1. Clay art: backgrounds failed once at 62 s (art/BLOCKED.json). Needs Jamie's OK to rerun (plan: text-only prompts).
2. Clay walk sheets (front, back, side), sit and work poses for the default outfit, then lilac and Erin.
3. Swap the flat puppet for clay sprite frames; clay props for beds, crops, cushion, Goddess.
4. Playwright smoke at 390 px; Codex review of the slice.
5. Then: Ebb's chat-first logging, cycle ring, red-flag rules, consent, per the spec mapping.

Preview: launch entry "ebb" (port 8096) in ovumind/.claude/launch.json.
