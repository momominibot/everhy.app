# Ebb hand-over for continuing in Doubao (updated 23 Oct 2026, 03:50 SGT)

Paste this into Doubao to continue: "Continue building Ebb at
/Users/michiyomimi/Doubao/chats/2026-10-16/new-chat-12/ebb. Read docs/HANDOVER-DOUBAO.md, PROGRESS.md,
docs/AC-STUDY.md and docs/EXTENDING.md first. Work on main; run node tools/test-core.js before every commit."

## Where things stand (23 Oct, midday)
- The world is a cute clay Singapore: home (three isometric rooms), Garden (`farm`), Hawker (`hawker`), Little Guilin
  (`waterfall`), Sembawang hot spring (`spring`, in `js/ext/world.js`), Merlion Park (`merlion`), Bedok Jetty (`jetty`),
  the clay island map (`art/map/world.webp`). Decorate mode, the barn and the villagers are gone. The top bar shows
  icon chips. She tucks into bed (`js/ext/sleep.js`); morning and evening routines live in `js/ext/routines.js`.
- Side branches still being built or merged: ebb-transit (MRT or bus rides), ebb-flower-dome (seed and plant stall,
  points for logging, shopkeeper NPC), ebb-seats (seated actions), ebb-kitchen (the big kitchen scene with working
  appliances). Merge each with `git merge --no-ff`, keep both sides on `index.html` conflicts, then run every
  `tools/test-*.js`, `python3 tools/smoke_doors.py` and the branch's own smoke.
- Living plates: `tools/live_all.py tools/jobs_live_sg.json` animates the Singapore plates one guarded Seedance run
  at a time (merlion, hot spring and jetty done; guilin, garden, hawker in progress) and `video:` on each scene points
  at `art/plates/<id>-live.mp4`.
- Checks before every commit: `for t in core world map sky sound bag log safety settings course today sleep routines;
  do node tools/test-$t.js | tail -1; done`, then `python3 tools/smoke_doors.py` with the dev server on 8096.

## Live plates (animated scenery)
Jamie wants only the water and trees to move. Recipe that worked (23 Oct): `python3 tools/live_plate.py art/raw/<plate>.png art/live/<name>-seedance.mp4 "<prompt: locked static camera, only X moves, everything else perfectly still>"`
(one guarded Seedance run, writes art/BLOCKED.json on any failure), then a soft mask of the moving regions and the
ffmpeg crossfade loop plus `alphamerge` + `overlay` onto the still plate (see the 23 Oct commit for the exact filters),
then `video: 'art/plates/<name>-live.mp4'` on the scene. Seedance moves the whole frame a little, so the mask is what
keeps the rest still; measure mean diff outside the mask (should be about 2, codec only) before shipping.

## Rendered but not yet used
`art/raw/seats.png` (bench, rock, cushion on magenta), `tree_stages.png`, `dig_items.png`: slice with
`tools/slice_sheet.py`, for the seats and trees workstreams.

## Side branches (each under .claude/worktrees)
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
