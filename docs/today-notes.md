# Today: the daily loop (22 Oct 2026)

Three gentle invitations a day, picked from the date, each checked against state she already makes by playing. One heart
per invitation, one more when all three are done, never more than four a day, never fewer than she has. A count of days
with a heart that a missed day pauses and nothing resets. Nothing is owed; the sheet says so.

## Files
- `js/today/rules.js` (pure): `picks(date)`, `check(id, state, today, dayRecord)`, `apply(record, state, today)`,
  `status`, `line`, `greeting(date, hour, weather)`, `runLine`. Record lives in `state.daily`:
  `{ days: { 'YYYY-MM-DD': { pondStart, visits, done, hearts, bonus } }, total, run: { count, last }, greeted }`.
  Days older than 60 are pruned; `total` and `run` carry on.
- `js/ext/today.js`: More > Today, the sun button under the top bar (`#todayBtn`), the `Hearts` counter, a one-second
  loop (visible page only) that records the scene she is in, hands out new hearts, toasts after the engine's own toast
  and asks `EbbLife.react('heart')`. First open of a day shows the greeting with the date and, if `EbbSky.state()`
  reports `rain` or `clear`, the weather.
- `css/ext/today.css`; `tools/test-today.js` (189 node checks); `tools/smoke_today.py` (27 browser checks at 390x844,
  shifts only `Date` to the nearest day whose picks include watering).

## The checks
water: a bed watered today. sit: a mindfulness observation dated today (that it happened, never what was noticed).
pond: offerings above the morning's count. hens: a hen with a care date today (`state.world.barn`). walk: she stood in
the waterfall scene today. journal: a `note` observation in `state.log.obs` for today (its words are never read).
No invitation mentions bleeding, symptoms, mood or anything else from the log.

## For the integrator
- `index.html`: one link (after sound.css) and one script (after sound.js). Add `js/today/rules.js`, `js/ext/today.js`
  and `css/ext/today.css` to the service worker SHELL and bump its VERSION.
- `today.css` moves the engine toast 50 px right so it never covers the sun button.
- The More menu entry is `#panel-today`; `EbbToday.open()` and `EbbToday.tick()` are exposed for tests.
