# Ebb hand-over for continuing in Doubao (updated 23 Oct 2026, 03:50 SGT)

Paste this into Doubao to continue: "Continue building Ebb at
/Users/michiyomimi/Doubao/chats/2026-10-16/new-chat-12/ebb. Read docs/HANDOVER-DOUBAO.md, PROGRESS.md,
docs/AC-STUDY.md and docs/EXTENDING.md first. Work on main; run node tools/test-core.js before every commit."

## Where things stand (main at a144c81 or later)
- The overnight Doubao session's work was found uncommitted on main and snapshotted to branch
  `doubao/2026-10-23-overnight` before anything else. Taken onto main: its spacious farm, cherry-tree waterfall and
  stone hot spring plates (geometry re-read on a 5 percent grid), the walk bob, the early cushion practices, the
  waterfall streams. Left on the branch: villagers (Jamie said no NPCs), time.js (duplicates sky.js), the bells
  garden panel, the video plate.
- Rooms are now isometric cut-away renders (bedroom-dream-wide, bathroom-dream-wide, living-dream-wide), square,
  zoom 2.2, camera pans; see PROGRESS.md "Look". Decorate mode still uses the tall shells.
- Every image from Seedream 5.0 pro through `python3 tools/run_batch.py <jobs.json>` (one guarded run, lock
  `art/RUN.lock`, no retries, stops and writes `art/BLOCKED.json` on the first failure; never delete that file yourself).
- Checks before every commit: `for t in core world map sky sound bag log safety settings course today; do node
  tools/test-$t.js | tail -1; done`, then `python3 tools/smoke_doors.py` (dev server on 8096) and `python3 tools/smoke_today.py`.
- If Playwright says browsers are missing (the nightly cleanup empties ~/Library/Caches): `python3 -m playwright install chromium`.

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
