# Ebb hand-over for continuing in Doubao (23 Oct 2026, 00:10 SGT)

Paste this into Doubao to continue: "Continue building Ebb at
/Users/michiyomimi/Doubao/chats/2026-10-16/new-chat-12/ebb. Read docs/HANDOVER-DOUBAO.md, PROGRESS.md,
docs/AC-STUDY.md and docs/EXTENDING.md first. Work on main; run node tools/test-core.js before every commit."

## Where things stand (main at 6efa3f3 or later)
- Dreamy Animal Crossing style world, every image from Seedream 5.0 pro through `python3 tools/run_batch.py
  <jobs.json>` (one guarded run, lock `art/RUN.lock`, no retries, stops and writes `art/BLOCKED.json` on the first
  failure; never delete that file yourself; a blocked run needs Jamie's OK to rerun).
- Rooms are single renders with fixed spots (`js/ebb-world.js`): bedroom-dream, bathroom-dream, living-dream (tall
  4:7, y to 175), farm-garden (crops drawn into the painted beds), waterfall-tall; barn and spring from `js/ext/world.js`.
- Player: `art/chars/genz` (hoodie and jeans, Jamie's pick), outfits `default`, `lilac`, `tudung`; `ac*` sets unused.
- Camera: plate at phone width times `zoom` (rooms 1.12, outdoors 1.3), follows her; blurred backdrop fills gaps.
- Six times of day in `js/ext/sky.js` (sunrise, morning, noon, afternoon, sunset, night); `EbbSky.now()`.
- Merged workstreams: settings, safety, log (pop-ups from room objects), course (Erin's voice), world, map, sky,
  sound (proximity ambience and UI sounds), bag. Node suites all pass (core 400, world 250, map 77, sky 64, sound 273,
  bag 65, log 145, safety 187, course 134, settings 75).

## Rendered but not yet mapped (do these first)
1. `art/raw/dream_living_wide.png` (1024 square, L-shaped open-plan kitchen and living room): convert to
   `art/plates/living-dream-wide.webp`, read floor/solids/spots/doors on a 5 percent grid (grid image at
   scratchpad grid_living_wide.jpg was made; regenerate with the snippet in `tools/shot.py` history), replace the
   `living` scene in `js/ebb-world.js` (square scene: no `aspect`, y 0..100, zoom 1.3). Spots: kettle (kind `tea`),
   fridge (`log` topic `food`), table (`log` topic `mood`), sofa and floor cushion (`cushion`). Doors: left to
   bedroom, right to farm. Keep every painted object solid with a margin above it.
2. `art/raw/dream_bedroom_wide.png` and `dream_bathroom_wide.png` are rendering (queue started 00:05; check
   `art/run.log`). Same treatment: replace the bedroom and bathroom scenes with the wide square plates. Keep the
   shells (`bedroom-tall`, `bathroom-tall`) only for Decorate mode, or drop Decorate for these rooms if the shell
   no longer matches.
3. `art/raw/seats.png` (bench, rock, cushion on magenta) belongs to the ebb-seats session; `tree_stages.png` and
   `dig_items.png` to ebb-trees.

## Sessions still running when the limit hit (each on its own branch under .claude/worktrees)
ebb-integrate (all browser smokes together, `tools/run_all_tests.sh`), ebb-trees (Phase 3), ebb-occluders
(cut-outs so she walks behind the lamp and plants, proposes new solids), ebb-today (daily invitations and hearts),
ebb-title (title screen), ebb-seats (outdoor seats). When a branch reports done: `git merge-tree --write-tree
--name-only main refs/heads/<branch>` to check, `git merge --no-ff refs/heads/<branch>`; if `index.html` conflicts it
is two sessions appending lines in the same place: keep both. Then run every `tools/test-*.js` and the smokes.
ebb-npc was cancelled (no wandering cat); its empty worktree can be removed.

## Jamie's standing decisions
Whole-room renders, never pasted sprites. Full phone screen, moving camera. Original girl (smooth clay of Aung's
character), Gen Z outfit default. No NPC villagers. Nothing walked through or over. Cute, dreamy, animated. Sounds
positional. Sunrise to night. Never push, deploy or publish without his word.
