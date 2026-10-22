# Ebb Log: chat-first logging and the cycle chart

Branch `claude/ebb-log-ef5d9d`, 22 Oct 2026. Written from scratch; no Rhythme code.

## Files
- `js/ext/log.js`: the Log panel (More menu). Loads the three pure modules below from `js/log/` at start.
- `js/log/parse.js` (`EbbLogParse`): deterministic English parser, no model, no network.
- `js/log/cycle.js` (`EbbCycle`): pure cycle engine and ask-the-chart answers.
- `js/log/model.js` (`EbbLogModel`): observation records under `api.state().log` (`obs`, `thread`, `batches`).
- `css/ext/log.css`: panel styles, using the engine's colour tokens (light and dark).
- `art/log/*.webp`: four clay chip icons cut from one Seedream image (`tools/jobs_log_icons.json`, run once through
  `tools/run_batch.py`, 48 s, then `tools/cut_log_icons.py`).
- Checks: `node tools/test-log.js` (107), `python3 tools/smoke_log.py [shot.png]` (headless Chromium at 390 px, 30).

## What works (spec IDs)
- LG-1: chat thread, her own words, English. Plain chat with nothing to log gets a friendly reply, never an error.
- LG-2/LG-4: bleeding none/spotting/light/medium/heavy (+ "period, flow not given"), clots, pain 0-10 with location
  (word ratings like "mild" become "about 3/10", marked estimated), 15 symptoms, mood, energy, sleep hours and
  quality. Negation per clause ("cramps but no headache") and hedging ("maybe a bit bloated") stored as `negated`,
  `hedged` and `confidence`.
- LG-3: today, this morning, yesterday, last night (sleep spans the night), the day before yesterday, N days ago,
  a couple/few days ago, weekdays, "since Tuesday" (a range), "18 Oct". Several dates in one message work
  ("yesterday heavy flow, today light").
- LG-5: every write goes through an editable card (Save, Edit, Don't save, remove a row). Saying "undo" retracts
  the last card for 24 hours; older cards say to use the calendar. Edits keep `history`.
- Principle 2: at most one clarify question, only for bleeding of unclear kind when no period is logged in the two
  days before it ("spotting, or is your period starting?" with Spotting / Period starting / Not sure).
- LG-6: chips Bleeding, Symptoms, All good, Not sure, Same as yesterday. All good and Not sure save a check-in.
- Provenance on every observation: type, value, unit, start, end, timezone, confidence, source (chat/chip/calendar),
  source text, confirmed, created, history, retracted.
- PR-1 / principle 4: episodes from period bleeding only (spotting never starts a cycle; one unlogged day is bridged,
  a day she called dry is not). No range with one period, wide range (min-5 to max+5) with 1-2 cycle lengths,
  10th-90th percentile range from 3 cycles (widened by 2 days under 6 cycles) with a plain label. Gaps over 90 days
  are listed but not used for the range.
- PR-4: a late period is described as "past the range I estimated", with no assumptions and no pregnancy wording.
- CH-1: cycle ring pinned at the top of the panel: cycle day, rough phase name, next-period range. Once there is a
  range, the line under the ring says it is an estimate and not for contraception. Not put in the top-bar HUD, so the cycle day is not on the game screen.
- CH-2: month calendar (period shading by flow, spotting ring, estimated range, today); tap a past day to set or clear
  bleeding. Each edit is echoed in the thread.
- CH-5: "how long were my last 6 cycles?", "how long are my periods?", "when is my next period?", "what day of my
  cycle is it?", "when did my last period start?", "how many cycles?".
- Safety: `EbbSafety.crisis(text)` before parsing (truthy: nothing from logging, not even her message in the thread);
  `EbbSafety.check(obs, allObs, profile)` once per new observation after every confirmed write, then `showAlert` per
  alert. Works when EbbSafety is absent. Contract left in the shared notes folder (`log-session-contract.md`).
- No rewards: logging never touches seeds, basket, pond or any game counter (smoke check).

## Stubbed or not covered
- English only; no other languages yet.
- Calendar edits change one day's bleeding only (symptoms and pain are edited from the chat card before saving).
  Calendar edits are not covered by "undo"; tap the day again instead.
- Confirmed entries cannot yet be edited from the thread after saving, except bleeding via the calendar.
- No ovulation, fertile-window or contraception features (by design). Phase names are dates-only guesses.
- Thread text is kept locally in the save (last 300 lines); no export or delete-all control yet (settings session).
- Parser is rule-based; unusual phrasings will be missed. Every miss is visible on the card before saving.
