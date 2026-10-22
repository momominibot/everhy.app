# Ebb safety layer: contract for other workstreams

Entry `js/ext/safety.js` exposes `window.EbbSafety`. Modules live in `js/safety/` (rules, crisis, consent, ui).
Tests: `node tools/test-safety.js` (187 checks). Nothing here is generated: every message and action is pre-written.

## Calling it from logging
```js
const alerts = EbbSafety.check(newObs, allObs, EbbGame.state().profile); // most urgent first
EbbSafety.showAlerts(alerts);  // crisis: the help card only; the other alerts wait in alerts[0].deferred
```
- `check` runs the crisis language check on each new observation's `text`, `note`, `notes`, `raw` or `said`.
  If it fires, the list holds only `{ ruleId: 'C-CRISIS', crisis: true, deferred: [...] }`.
- `EbbSafety.crisis(text)` for free text before it becomes an observation (for example a chat turn). A hit also opens the help card (once), because the log shows nothing for crisis messages; pass `{ silent: true }` to only test.
- Ignored by every rule: `negated: true`, `retracted`, `confirmed === false`. Bleeding value `period` (no flow given) is a period day, not heavy. Pain side may sit in `location` (left or right).
- Medium alerts with the same `key` are not shown again for 30 days; urgent and high always show.
- Every shown alert is logged on the device under `state.safety.shown` (rule id, version, key, time).

## Observation vocabulary the rules read
| type | value | extra fields |
|---|---|---|
| `bleeding` | `spotting` `light` `medium` `heavy` `very_heavy` `soaking` (or 0 to 4) | `context`: `period` (default) `between` `after_sex`; `soakEveryH` (pad or tampon soaked every N hours); `forHours` |
| `pain` | 0 to 10 | `side`: `left` `right` `one_side` `both` `middle`; `disrupts: true` when it stopped daily activities |
| `symptom` | `fainted` (lost consciousness) or `faint` `dizzy` `lightheaded` (felt faint) | |
| `mood` | 0 to 10 severity (or `severe`) | `premenstrual: true` if she says so |
| `test` | `positive` `negative` | `kind: 'pregnancy'` |

All need `start` (ISO date or datetime). `confirmed === false` (she said the reading was wrong) is never used.
Urgent and high rules also use readings still waiting for confirmation; medium pattern rules use confirmed ones (or
confidence 0.7+).

## Profile (`state.profile`, written by onboarding)
`lastPeriodStart` (YYYY-MM-DD or null), `lastPeriodNote` (`not_sure` `none`), `cycleLength` (23/28/33 or null),
`cycleLengthNote` (`varies` `not_sure`), `goal`, `lifeStage` (`cycling` `teen` `pregnant` `postpartum` `perimenopause`
`menopause` `unknown`), `age` (lower bound of the band) and `ageBand`, `contraception`, `flags` (`pcos`
`endometriosis` `fibroids` `thyroid` `hrt`), `tone`, `nudges`, `quietHours {from, to}`, optional `pregnant: true`.

## Consent (`state.consent.events`, dated, never edited)
Purposes `core` (keep health notes on this phone), `physiology`, `research`, `partner`, `course`.
`EbbSafety.consented('core')` must be true before saving health observations. Nothing is on by default.
The event `ebb:onboarded` fires on the document when the first-run chat ends (detail: `{ profile, skipped }`).

## Rules (table `ebb-safety-rules-2026-10-22.1`; thresholds are starting points for the clinical panel)
R-PREG-EMERG (urgent), R-BLEED-SAMEDAY (high), R-MENO-BLEED (high), R-UNEXPECTED-BLEED, R-LONG-PERIOD,
R-CYCLE-LENGTH, R-NO-PERIOD-90, R-PAIN-CYCLES, R-PMS-MOOD (medium). Exact thresholds are in `js/safety/rules.js`
and listed in the in-app Safety and privacy panel.

## Help numbers (checked on the organisations' own pages, 22 Oct 2026)
SOS 1767 and CareText WhatsApp 9151 1767 (sos.org.sg); 995 emergency ambulance (scdf.gov.sg); national mindline
1771, WhatsApp 6669 1771, webchat mindline.sg (moh.gov.sg, launched 18 Jun 2025). The IMH helpline 6389 2222 was
retired when mindline launched (NHG news, from a search result; the page itself returned 429), so it is left out.
