# Ebb course workstream (22 Oct 2026)

An MBSR-informed eight-week course with its own practice runner. Not MBSR, not certified. Every script in
`js/course/content.js` is an original draft (`draft-1`) awaiting review by a qualified MBSR teacher. No health claims;
nothing is offered for hot flushes.

## Files
- `js/ext/course.js`: UI. Registers More > Course and the `cushion` kind. Loads the two modules below itself, so
  `index.html` needs no change (the integrator may add plain script tags for them instead; the loader skips duplicates).
- `js/course/content.js`: weeks, practices, cue captions (times are fractions of the planned length), copy.
- `js/course/core.js`: pure rules: week opening, timer, saved record, history and monthly summary.
- `css/ext/course.css`; tests `tools/test-course.js` (node) and `tools/smoke_course.py` (Playwright, 390 px).

## Rules as built
- Weeks open by calendar and choice: the next week becomes available 7 days after she began the current one and only
  opens when she taps it. Practice counts and consecutive days are never read. Missing days closes nothing.
- Runner: 3 or 5 min by default, 10 only by choice; captions carry every cue (no audio). Pause/Resume and End are
  always visible. Time counts only while running and visible, at most 1.5 s per tick, so hidden or stalled time never
  counts. Ending never saves: "What did you notice?" (optional, Skip) then Save / Don't save / That felt hard.
- Saved via `EbbStore.addPractice`: practice id, `scriptVersion` (`draft-1`, or `draft-1/seated`), anchor, planned and
  active seconds, finished or partial, start, end, `source: 'course'`. An optional note is kept in
  `state.course.notes[recordId]`, local only.
- "That felt hard" offers pausing the course. A paused or unstarted course leaves the cushion on the engine's simple
  practice; a running course gives a picker of the open weeks' practices plus "Simple sitting".
- History lists every mindfulness observation (cushion and course). The monthly summary is off until she ticks it:
  days practised, minutes, ran to the end vs ended early, in words. No score, no streak.

## For staff
- **Teacher check-in is a placeholder** (`CHECKIN.status = 'placeholder'`). No human contact is wired up. The user sees
  a neutral line and a disabled "Not available yet" button. It needs a real booking or message route before launch;
  the evidence favours courses with some human contact.

## Art: blocked
`python3 tools/run_batch.py tools/jobs_course.json` stopped on the first image (`course_sheet`, RemoteDisconnected at
61.3 s, the known ~62 s cutoff). `art/BLOCKED.json` stays in this worktree (copy committed at
`art/blocks/2026-10-22-course-sheet-timeout.json`). No retry was made. Until art exists the UI shows soft plain circles
with the week number and a gradient cover. After Jamie approves a rerun (consider a shorter sheet prompt):

    python3 tools/slice_sheet.py art/raw/course_sheet.png art/course/icons --count 9 --height 256
    python3 -c "from PIL import Image; Image.open('art/raw/course_cover.png').convert('RGB').resize((768,768)).save('art/course/cover.webp', quality=82)"

Then check the sheet's reading order against `ICON` in `content.js` (cushion, feather, cloud, mat, tea, pebbles,
heart, lantern, bell) and fix the indices if Seedream ordered them differently. The CSS picks the files up on its own.

## For the integrator
- Engine bug seen in the smoke screenshots: `.menu { display: flex }` in `css/ebb.css` overrides the `hidden`
  attribute, so the More menu never closes. One line fixes it: `.menu[hidden] { display: none; }`.
- `registerKind('cushion')` replaces the engine's cushion handler; the fallback reproduces it (sit at the cushion,
  `EbbUi.openPractice`, stand at the stand point).
