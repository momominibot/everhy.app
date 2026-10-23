# Routines (morning and evening)

Files: `js/ext/routines.js` (entry, appends nothing to other files), `js/routines/rules.js` (pure), `css/ext/routines.css`,
`tools/test-routines.js` (node), `tools/smoke_routines.py` (Playwright, 390x844). index.html: one `<link>` after live.css,
one `<script>` after live.js.

## What it does
Two routines, Morning and Evening. Each is an ordered list of 3 to 6 steps from a catalogue (six each), kept under
`state.routines.lists`. Defaults: morning wake, stretch, water, sounds, intention; evening phone, warm, journal, winddown, bed.
The editor (More > the routine > Edit) moves, removes, adds and sets lengths; every change is saved at once.

Start walks her to each step's place in turn (`EbbGame.walkTo` to the spot's stand; another room through a fade, arriving
by the door that leads there) and runs the step on arrival:
- timed: a cue, a clock, Pause, Skip, Stop for now. Counts only running, visible time (the course's timer pattern).
  Wind-down breathing sits her on the cushion (`api.sit`, then `api.stand`). No breathing animation, no voice.
- text: one line, kept in the run under `notes`, never shown anywhere else.
- log: opens the pop-up log (`EbbLog.open(topic)`); the step completes when the log sheet closes.
- bed: walks to the bed and ends. Sleeping itself belongs to the bedroom-sleep session.
Each completed step saves a `mindfulness` observation through `EbbStore.addPractice` with `routine: 'morning'|'evening'`,
`step`, `practice: 'routine-<step>'`, `source: 'routine'`, so Today's "sit" invitation and the course summary count it.
Skipped steps save nothing. Stop for now keeps the run at its step.

Runs live at `state.routines.runs[date][routine]` (a snapshot of the list, index, done, skipped, notes, started, finished);
60 days are kept. A finished run shows ticks and "Done today"; "Do it again" starts a fresh one. The gentle card appears
1.5 s after boot when the hour is in a window (morning 05:00 to 10:59, evening 19:00 to 00:59), that routine is not done
today and she has not said Not now today (`state.routines.notNow[date]`). It waits while any sheet, log or onboarding is open.

## For the integrator
- sw.js: add `js/routines/rules.js`, `js/ext/routines.js`, `css/ext/routines.css` to OPTIONAL or SHELL; bump VERSION.
- The card sits at top + 118 px so it clears the Today sun button (top-left) and the toast row.
- `EbbRoutines`: `open(routine)`, `edit(routine)`, `start(routine)`, `stop()`, `prompt(hour)`, `card(routine, resume)`, `active()`.
- The bedroom-sleep session owns tapping the bed; the morning "Wake slowly" and evening "Lights down" steps only walk her to
  the bed's stand point and never tap it. If that session wants the evening routine to tuck her in, call its own
  function from a `bed` kind step (one line in `runStep`).

## Checks
`node tools/test-routines.js` (214 checks: catalogue maps to real walkable spots, defaults, edit bounds, runs per date,
prompt windows, timer, observation shape, copy without em dashes or claims). `python3 tools/smoke_routines.py [shots]`
(38 checks, 0 console errors: More labels, editor, two timed steps completed on the live page with pause, a third step in
the kitchen, Stop for now, resume after reload, the card and Not now). smoke_course "paused course: cushion back to the
simple practice" and smoke_doors "live plate" fail the same way on main 22f4261; not from this branch.
