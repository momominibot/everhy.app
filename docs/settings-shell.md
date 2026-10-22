# Settings and app shell (workstream: settings)

## What it adds
- `manifest.webmanifest` + `art/icons/` (one Seedream clay render, `tools/jobs_icons.json`, keyed by `tools/make_icons.py`
  into 192, 512, maskable 512 and a 180 apple-touch icon). The manifest link, theme colour and touch icon are injected
  by `js/ext/settings.js`, so `index.html` is unchanged.
- `sw.js`: code and pages network-first (3.5 s, then cache), art cache-first. One cache per build
  (`VERSION = 'ebb-shell-YYYY-MM-DDx'`); activate deletes older `ebb-shell-*` caches. **Bump VERSION when you merge**
  so phones pick up the new build and drop the old cache. Add new always-needed files to `SHELL`; anything else is
  cached the first time it is fetched online.
- Settings panel (More > Settings): export everything (JSON), records as CSV, records as a FHIR-style bundle (one
  Observation + one Provenance per record), nudge cap (default 1 a day) and quiet hours (default 21:00 to 08:00),
  motion and text size, a privacy note marked "Draft for legal review", and a two-step in-page delete everything
  (save, other `ebb*` keys, `ebb*` caches, the worker, `ebb*` IndexedDB databases, then reload).

## Contract for other workstreams
- Preferences: `api.state().prefs` = `{ nudgesPerDay, quietFrom, quietTo, motion, textSize, nudgeLog }`.
- Before any nudge: `if (window.EbbSettings && EbbSettings.mayNudge()) { show(); EbbSettings.noteNudge(); }`.
- Store your data under `api.state().<yourKey>` (it is exported and deleted with the save) or in a localStorage key
  starting with `ebb` (exported as `otherKeys`, deleted too). Observations in `state.observations` appear in the CSV
  and FHIR exports automatically: unknown fields become CSV columns and FHIR components. Keep `id`, `type`, `date`
  or `start`/`end`, `source` and `confirmed` on every record so provenance survives.
- `<html data-motion="reduce">` and `<html data-text="large|larger">` are set from prefs: key reduced-motion and
  text-size rules for your own CSS off those attributes.
- FHIR codes use the placeholder namespace `http://example.org/ebb/fhir/`; no LOINC or SNOMED code is claimed.

## Tests
- `node tools/test-settings.js` (prefs, nudge rule, CSV escaping and formula guard, FHIR shape and provenance, export,
  delete everything, worker install/upgrade/offline).
- `python3 tools/e2e_smoke.py [--shots DIR] [--only a,b]`: headless Chromium at 390x844, network outside localhost
  aborted. Add a check by writing `def check_<name>(page, ctx)` and adding it to `CHECKS` where its state is needed;
  helpers `tap(page, x, y)` (scene percent), `arrive(page, scene)`, `idle(page)`, `open_panel(page, id)`,
  `download(page, selector)`. 404s for other workstreams' missing entry files are expected and ignored.

## For the integrator
- `css/ebb.css` gives `.menu` `display:flex`, which overrides the `hidden` attribute, so the More menu always showed
  once a panel existed. `css/ext/settings.css` carries `.menu[hidden] { display: none; }`; move it into `css/ebb.css`.
- Delete everything reloads the page because `ebb-game.js` keeps its own reference to the old save object.
