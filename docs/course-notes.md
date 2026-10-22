# Ebb course workstream (22 Oct 2026)

An MBSR-informed eight-week course with its own practice runner. Not MBSR, not certified. Every script in
`js/course/content.js` is an original draft (`draft-1`) awaiting review by a qualified MBSR teacher. No health claims;
nothing is offered for hot flushes.

## Files
- `js/ext/course.js`: UI. Registers More > Course and the `cushion` kind. Loads the two modules below itself, so
  `index.html` needs no change (the integrator may add plain script tags for them instead; the loader skips duplicates).
- `js/course/content.js`: weeks, practices, cue captions (times are fractions of the planned length), copy.
- `js/course/core.js`: pure rules: week opening, timer, saved record, history and monthly summary.
- `js/course/voice.js`: generated map from each exact caption to Erin's clip in `art/course/voice/` (51 MP3s).
- `tools/voice_course.py`: voices the captions (guarded, no retry; `--dry` counts what is left).
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

## Erin's voice
- Every cue is voiced in Erin's cloned voice (Volcengine TTS, voice `S_PLWb4DCd2`, cluster `volcano_icl`, speed 0.88),
  made by `tools/voice_course.py` on 22 Oct 2026: 51 clips, 3.5 to 15.8 s, 7.5 MB. All 51 were transcribed offline with
  faster-whisper and match their captions. Two lines Whisper misheard were reworded and re-voiced.
- Optional: setup offers "Erin's voice" (default) or "Captions only", remembered in `state.course.voice`. Captions
  always show. One audio element is reused (first played inside the Begin tap, so phones allow the later cues). It
  pauses with Pause and while the page is hidden, and stops on End.
- Clips are keyed by exact caption text. When the teacher review changes a line, that cue plays with captions only
  until `python3 tools/voice_course.py` is run again (it voices only new lines). Delete clips no longer in the
  manifest afterwards.
- Before launch outside mainland China, check Volcengine's speech service terms: an earlier review found Volcengine's
  Doubao and Ark terms limit use to mainland China.

## For staff
- **Teacher check-in is a placeholder** (`CHECKIN.status = 'placeholder'`). No human contact is wired up. The user sees
  a neutral line and a disabled "Not available yet" button. It needs a real booking or message route before launch;
  the evidence favours courses with some human contact.

## Art: not made yet
- My own run stopped on `course_sheet` at 61.3 s (RemoteDisconnected); `art/BLOCKED.json` stays in this worktree (copy
  at `art/blocks/2026-10-22-course-sheet-timeout.json`). Main took over the course art as three 3-icon sheets plus the
  cover in its single queue, but that queue stopped at 22:50 on `map_world` (same cutoff) before reaching them.
- Until art exists the panel shows plain soft circles with week numbers and a gradient cover.
- When `course_icons_1..3.png` and `course_cover.png` exist, run `tools/course_art.sh <their art/raw dir>`. It copies
  them in, cuts each sheet with `slice_sheet.py --count 3 --height 160` into `art/course/icons_N.webp` and writes
  `art/course/cover.webp`. The panel picks each file up on its own once it loads. Check that each strip reads
  cushion, feather, cloud / mat, tea, pebbles / heart, lantern, bell; the smoke test then also checks the icons show.

## For the integrator
- `registerKind('cushion')` replaces the engine's cushion handler; the fallback reproduces it (sit at the cushion,
  `EbbUi.openPractice`, stand at the stand point).
- Checked merged onto main `2355466` (full screen, 390x844): test-core 227, test-course 134, smoke 42, all pass.
