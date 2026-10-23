# How to build Ebb the way Claude does (the small details)

Written 23 Oct 2026 for Doubao, so Jamie can keep building without paying for Claude tokens. Follow it literally.
Read PROGRESS.md first (what exists today), then this file. The repo is
`/Users/michiyomimi/Doubao/chats/2026-10-16/new-chat-12/ebb`, local git, branch `main`, no remote.

## 0. The five rules that matter most
1. **Prove, never assume.** Every change ends with `bash tools/check_all.sh` printing `ALL GREEN`. A change that
   "should work" is not done. If a check fails, fix it before anything else; never delete or weaken a check to pass.
2. **She must walk naturally.** Every new spot, door, bed or seat must be reachable by walking from every arrival
   point. `smoke_doors.py` proves this; add your new thing to the scene data and it is tested automatically.
3. **One coherent render beats pasting.** Rooms and places are one Seedream image each. Never paste furniture or
   people onto a plate. If a plate needs a change, re-render the whole plate.
4. **Model calls are guarded.** Seedream and Seedance run only through `tools/run_batch.py`, `tools/live_plate.py`
   and `tools/live_all.py`. They keep one lock (`art/RUN.lock`), never retry, and write `art/BLOCKED.json` on the
   first failure. If `art/BLOCKED.json` exists, STOP and ask Jamie. Never delete it yourself. Never "test" a model call.
5. **Never push, deploy or publish.** Commit locally on `main` only. Jamie decides when anything goes public.

## 1. Daily loop (copy this exactly)
```
cd /Users/michiyomimi/Doubao/chats/2026-10-16/new-chat-12/ebb
git status --short              # know what is already changed before you touch anything
# ... make one small change ...
bash tools/check_all.sh         # about 6 minutes; must end with ALL GREEN
python3 -m http.server 8096 &   # then screenshots for Jamie:
python3 tools/shot.py docs/check kitchen farm   # writes docs/check_kitchen.png etc. at phone size 390x844
git add <the exact files you changed>           # never git add -A
git commit -m "Short plain sentence of what changed"
```
Jamie judges from phone screenshots. Always look at the screenshot yourself before showing him. If anything
overlaps, floats, is cut off or looks pasted, fix it first.

## 2. How the world is built (read the code once)
- `js/ebb-world.js`: every scene as data in `EbbWorld.SCENES`. The engine never needs editing to add a place.
- `js/ebb-game.js`: the engine (walking, camera, doors, spots, sitting). Touch it only for a real engine bug.
- `js/ext/*.js`: extensions. Each one registers things through hooks: `EbbWorld.register(id, scene)`,
  `EbbWorld.addDoor(sceneId, door)`, `EbbGame.registerKind(kind, fn)`, `EbbGame.registerProps(fn)`,
  `EbbGame.registerHud(...)`, `EbbGame.registerPanel(...)`. New features go in a new extension file plus a pure
  rules file (`js/<feature>/rules.js`) that node can test. Add the `<script>` tags to `index.html`.
- Look at `js/ext/kitchen.js` + `js/kitchen/rules.js` + `tools/test-kitchen.js` + `tools/smoke_kitchen.py` as the
  model of a complete feature. Copy that shape for anything new.

### Coordinates (the detail that breaks most often)
- x runs 0 to 100 across the plate. y runs 0 to `100 * height / width` down it.
- Tall outdoor plates are 768x1344, so y is 0 to 175 (`aspect: [4,7]`). Square isometric rooms are 1024x1024,
  y 0 to 100, with `zoom: 2.2` so the camera pans on a phone.
- Read every position off the plate with the grid tool, never by guessing:
  `python3 tools/grid.py art/plates/kitchen.webp /tmp/kgrid.png` then open the png and read the numbers.
- A scene's pieces:
  - `floor`: polygon of walkable ground, points `[x,y]` going round the edge. Trace the floor, not the furniture.
  - `solids`: polygons she cannot enter (counters, fridge, beds, tree trunks, walls on the front edge). Every piece of
    furniture standing on the floor needs one, or she walks through it.
  - `doors`: `{rect:[x0,y0,x1,y1], to:'sceneId', arrive:{x,y}, label}`. Doors fire by position: no spot's stand point
    may lie inside a door rect, and `arrive` must be on the destination floor, a few units away from its own door.
  - `spots`: `{id, kind, at:{x,y}, stand:{x,y}, label}`. `at` is the object, `stand` is where her feet go (on the
    floor, outside every solid, in front of the object).
  - `fronts`: `{src, rect, base}` cut-outs drawn in front of her so she walks behind rails, lamps and counters.
- After editing a scene, `smoke_doors.py` walks to every door, spot and bed. If it says a stand is unreachable,
  move the stand or shrink the solid; never remove the check.

## 3. Making new art (Seedream), one guarded run
1. Write a jobs file `tools/jobs_<name>.json`: `[{"id":"kitchen_wide","size":"1024x1024","prompt":"..."}]`.
2. Prompt rules that worked: under 600 characters (longer prompts hit the 60 second server cutoff); say the camera
   ("isometric cut-away room, two walls and a floor like a dollhouse corner" for rooms, "tall portrait view, gentle
   top-down" for outdoor plates); say "soft clay, pastel, cute, cosy phone game"; say what must NOT appear
   ("no people, no text, no logos"); leave lots of open floor to walk on and say so.
3. Run once: `python3 tools/run_batch.py tools/jobs_<name>.json`. Results land in `art/raw/<id>.png` with a
   `.prompt.json` beside it. If it blocks, stop and ask Jamie; do not rerun.
4. Convert to the plate: WebP in `art/plates/<id>.webp` (quality 85 is fine). Keep the raw PNG for re-cuts.
5. Character poses: render a green-screen sheet, then
   `python3 tools/slice_sheet.py sheet.png art/chars/genz/<pose> --count N --ref art/chars/genz/sit.webp --match height`,
   then `python3 tools/build_clay_sets.py` to refresh `js/ebb-clay-sets.js`. Sizes must match her other strips or she
   changes size between poses.

## 4. Living plates (Seedance): only water and trees move
Jamie wants the rest of the picture perfectly still. The recipe:
1. Add a job to a jobs file: `{id, plate, mask:[["ellipse"|"rect", x0,y0,x1,y1], ...], prompt}`. The mask covers only
   what may move (water, waterfall, leaves, steam, fans), in the same 0..100 / 0..175 units as the scene.
2. Prompt: "locked static camera, only the water ripples and the leaves sway, everything else perfectly still".
3. `python3 tools/live_all.py tools/jobs_<name>.json` (one guarded run per clip, skips finished clips).
4. It prints the mean difference outside the mask: it must be about 2 (codec noise only). If it is higher, the mask
   is leaking; tighten it and recompose with `tools/live_compose.py` (no new model call needed).
5. Set `video: 'art/plates/<id>-live.mp4'` on the scene. `js/ext/live.js` plays it, uses the .webm when the browser
   has no H.264, and hides it under reduced motion.

## 5. Making her act (sit, soak, sip, fish, sleep)
- Seats are spots with kind `seat` (see `js/ext/seats.js` and `js/seats/rules.js`). The action calls
  `api.sit(at, pose)` and `api.pose(name)`; named poses are strips in `art/chars/genz/` (sip, soak, fish, stretch).
- Seat offsets: put her `at` point on the seat cushion, then screenshot and nudge by 0.5 units until her bottom sits
  on it. Check the grid, not the eye estimate.
- Every timed practice uses the timer that counts only running, visible time (copy from `js/transit/rules.js`
  `timer/advance`). A hidden tab must never count.
- Observations saved after a practice use the store's shape (see `observation()` in `js/transit/rules.js`).

## 6. Sessions, branches and merging
If you split work into parallel pieces, each piece gets its own branch and worktree. To bring one back:
```
git merge-tree --write-tree --name-only main refs/heads/<branch>   # dry run: lists conflicts, changes nothing
git merge --no-ff refs/heads/<branch>
bash tools/check_all.sh
```
- `index.html` conflicts are two features adding script tags in the same place: keep both sides.
- If the merge refuses because of untracked files the branch adds (often `art/raw/*.png`), move those files out
  of the repo first, then merge.
- Two extensions must never register the same spot kind (transit uses `ride`, seats uses `seat`).

## 7. Small details Claude checks every time
- No em dashes anywhere in text Jamie or players read. Plain, warm, short sentences.
- Place names are text; counts on the top bar are icons only.
- No wandering villagers. A shopkeeper standing still at her stall is fine.
- Sakura petals sink into the hot spring water; steam rises; she soaks inside the pool, not on top of it.
- She walks behind bridge rails and counters (fronts cut-outs), never over them.
- The image must never scroll past its edge when zooming; zoom only ever shows painted plate.
- Reduced motion: every animation and living plate has a still fallback.
- Test the "quick second action" case: do one thing, then immediately another. Today's transit bug was exactly
  that: a train ride booked right after "Just arrive" lost its trip because a quarter-second watcher had not caught
  up yet. When code runs on a timer, set its "last seen" state at the moment you act, not later.
- When a smoke fails only on a timing race, wait for the real condition (`wait_for_function`), never add a sleep.

## 8. What is next (23 Oct afternoon)
See PROGRESS.md for the live list. Open items: tint the front cut-outs at night (they stay bright), the seats
extension's kind retargeting folded into `js/ebb-world.js`, a stretch pose in the morning routine, and the real-world
nudges idea (breathe while waiting for the green man) once Jamie says go.
