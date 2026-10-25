# EveRhy hand-over to Doubao (25 Oct 2026, evening SGT; deadline Wednesday 28 Oct)

Paste this into Doubao to start:

> Continue building EveRhy (the folder is still called ebb) at
> /Users/michiyomimi/Doubao/chats/2026-10-16/new-chat-12/ebb. Read docs/HANDOVER-DOUBAO.md top to bottom first, then
> docs/DOUBAO-PLAYBOOK.md and PROGRESS.md. Work on main. Run `bash tools/check_all.sh` before every commit and commit
> only when it prints ALL GREEN. Never push. Ask Jamie before merging any branch listed under "Waiting for Jamie".

EveRhy is Dr Patrick's mindfulness and cycle wellness app as a cosy clay Singapore life game (a phone web app, plain
HTML/CSS/JS, no build step). Open it with `python3 tools/devserver.py 8096` and http://localhost:8096 at phone size
(390 x 844). The 3D test page is http://localhost:8096/proto/avatar3d.html (on the 3D branch, see below).

## 1. Where main is (25 Oct)

main = everything up to 24 Oct + the garden weeds:
- `8d17509` Garden weeds: Seedream clay tufts cover every grass bed (art/props/weeds.webp, tools/weeds.py, drawn by
  paintedBed() in js/ebb-props.js). Hoeing clears them.
- The bag is shorter (Jamie: "I don't like too wordy"): empty sections hidden, an empty bag is one line, no explainer
  under each heading (js/ext/bag.js, tools/smoke_bag.py). Committed right after this note was written; check `git log`.
- Everything listed in PROGRESS.md as merged (rooms, garden, hawker, Little Guilin, hot spring, Merlion, jetty, map,
  MRT and bus rides, Flower Dome, kitchen, seats, bath soak with towel tube, journal look-back, night pictures, sound,
  today's invitations, safety, settings, export, Erin's voiced course).

## 2. Waiting for Jamie (on branches, NOT on main; merge only when he says so)

Jamie asked on 25 Oct to take items 1 and 3 off main ("extract 1 & 3 out"). They are kept whole on branches:

| Branch | What it holds | Merge note |
|---|---|---|
| `claude/mrt-skin` (02dc479) | MRT and bus as two picture tiles, "Teleport" instead of "Just arrive", one sparkle per carriage, her new legs-down `ride` pose with per-seat sit points (bottom on the cushion, feet on the floor), bus keeps only its back bench; skin a little fairer (tone B, which Jamie chose) on every outfit via tools/fairer.py | Built on the old main; merge with `git merge --no-ff refs/heads/claude/mrt-skin`. Expect conflicts in sw.js (take a NEW version string) and js/ebb-clay-sets.js (regenerate with `python3 tools/build_clay_sets.py`, it must list both `ride` and `weeds`). Then check_all. |
| `claude/avatar-3d-sage` (8d17e7d) | The 3D girl in outfit 1 (sage sleeveless top, cream linen trousers), her own 2D face, tone B, ten moves; stands upright in her own rest pose (no slouch); test page only, NOT wired into the game | Touches only proto/, tools/ and art/meshy. Merges cleanly. |
| `claude/standalone-tools` (34b7e0d) | EveRhy's own Seedream client (tools/seedream.py), its own weight tool (tools/avatar_weights.py replacing tools/fix_weights.py, identical output), the other app's name removed from notes, Dr Patrick's chat-flow design in docs/design-source/ | One-line conflict in tools/build_avatar_pub.py (a docstring). |
| `backup/main-before-extract-1025` | main as it was before the extraction | Safety copy only. |

Old WIP branches (claude/ebb-integrate-*, claude/ebb-occluders-*, doubao/2026-10-23-overnight) are not needed.

## 3. What Jamie decided (keep to these)

- The player is the 2D clay hoodie girl (art/chars/genz). Jamie: "this character is sweeter". Skin tone B (fairer, on
  `claude/mrt-skin`). For a 3D version he chose outfit 1 (sage top, linen trousers).
- 3D: she must never slouch, lean or look "distorted". Meshy's library idle (Idle_7) slouches on her body; the branch
  uses her own upright rest pose instead. Check every new move from the front AND the side before showing him.
- Short words everywhere ("too wordy"). No em dashes in anything he or users read.
- Fewer hints: one sparkle per carriage, not one per seat.
- Seated means seated: bottom on the seat, feet on the floor; never floating over a bench. No food or drink on the MRT.
- Night: a separate night picture per place, never a tint or patch over the day art.
- Tudung outfits never show hair, and never fall back to a hair pose.
- Never mention the other app (Rhythme) to Dr Patrick or in EveRhy text.

## 4. Suggested order to Wednesday (confirm with Jamie first)

1. Ask Jamie which branches to merge (section 2). If yes: merge `claude/mrt-skin`, then `claude/standalone-tools`,
   then `claude/avatar-3d-sage`; check_all after each.
2. If he likes the upright 3D girl on his phone: put her into the game in place of the 2D sprite, bedroom first (the
   test page already walks her round the furniture with EbbWorld.plan and draws the arch door over her). The seated
   moves (chair, kopi) need a seat under her and a cup prop; keep the 2D sprite as the fallback.
3. The open NEXT items at the end of PROGRESS.md (admin dashboard data, standing fishing pose, Erin voice for bath and
   eating on his OK).
4. Final pass at phone size: every place, every sheet, light and dark, no console errors, check_all ALL GREEN.

## 5. How to check and how to make art

- `bash tools/check_all.sh` (about 8 minutes): all node suites plus every browser smoke plus the smoothness gate. If
  only "smoothness OVER BUDGET" fails, look at `uptime`: above about 15 it is machine load; rerun when quiet.
- Browsers for the smokes live in `~/Library/Application Support/ms-playwright` (the nightly cleanup empties
  ~/Library/Caches). For your own scripts: `export PLAYWRIGHT_BROWSERS_PATH="$HOME/Library/Application Support/ms-playwright"`
  or `p.chromium.launch(channel="chrome")`.
- Images (Seedream 5.0 pro), one guarded run (lock, no retry, stops and writes art/BLOCKED.json on the first failure;
  delete BLOCKED.json only on Jamie's OK):
  `ARK_API_KEY="$(grep '^VOLCENGINE_ARK_API_KEY=' ~/.hermes/.env | sed 's/^[^=]*=//' | tr -d '"\n')" python3 tools/run_batch.py tools/<jobs>.json`
  Jobs are `[{id, size: "1024x1024", prompt, ref?: [paths]}]`, output art/raw/<id>.png. Keep prompts under about 650
  characters (renders die near 62 s). Green #00FF00 key for people, magenta #FF00FF for anything green.
  Never print the key. ~/.config/volcengine/api_key is dead (401).
- Sprite strips: `python3 tools/slice_sheet.py art/raw/<sheet>.png art/chars/genz/<pose> --count 2 --scale <s>`
  (match a new pose to an old one by FACE width, not height), then `python3 tools/build_clay_sets.py`.
- Skin tone on any strip or sheet: `python3 tools/fairer.py <dir> <dir> --amount 0.6` (tone B). It saves WebP q92.
- 3D (Meshy, key in ~/.config/meshy/api_key, about 7,800 credits left): `python3 tools/meshy_run.py tools/jobs_meshy_<x>.json`
  (model 30, rig 5, up to ten moves at 3 each), then the weight repair (tools/fix_weights.py on main, or
  tools/avatar_weights.py on claude/standalone-tools), then the test page `proto/avatar3d.html?skin=<folder>`.
  Motion library ids: scratchpad lib.json was copied to docs/meshy-library.json (if missing, GET /openapi/v1/animations).
- Phone screenshots: Playwright at 390 x 844, device_scale_factor 3, judge at full size, not thumbnails.

## 6. Things that bit us (so they do not bite you)

- three.js: a one-key clip (a still pose) is written to the bones once, then never again, so any per-frame bend you add
  piles up (she bent backwards). Put the bones back by hand every frame (holdRest in proto/avatar3d.html).
- The path planner rounds the goal to a grid cell; when the goal sits on a furniture edge that cell is inside the
  furniture. Fixed in js/ebb-world.js plan(); keep the fix.
- A seat's `at` is where you tap, not where she sits. Seated poses anchor at the feet: sit point = cushion front edge +
  her hip height. Read positions off a 1-unit grid drawn over the plate.
- Lossless WebP triples sprite size; use quality 92.
- A shared checkout with another agent: stage explicit paths only, never `git add -A`, never switch branches there.
- Doors fire by position: no stand point may sit inside a door rectangle.

## 7. Rules (Jamie's, non-negotiable)

Never push or deploy without Jamie's word. Model calls only through the guarded runners: one run, no retries, stop on
the first failure and keep BLOCKED.json, rerun only on his OK. Never print keys. Personal health data never leaves
the phone. No MiniMax. check_all ALL GREEN before every commit; never edit files while it runs.
