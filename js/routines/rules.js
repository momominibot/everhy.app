/* Ebb routines, pure rules: a morning and an evening routine, each a short ordered list of steps she picks from a
 * catalogue and can reorder, remove and add (3 to 6 steps). Every step happens somewhere in her home, so the game
 * walks her there. A run is remembered per date, resumes where it stopped, and a finished one shows a small mark.
 * The timer counts only running, visible time (the course's pattern). Nothing here reads what she logged about her
 * body, nothing is scored, and a routine left alone costs nothing. */
(function (root) {
  'use strict';
  var MIN = 3, MAX = 6, KEEP_DAYS = 60, MAX_STEP_MS = 1500, SECS_MIN = 5, SECS_MAX = 600, NOTE_MAX = 140;

  /* kind: timed (a visible timer with pause and skip), text (one private line), log (opens the pop-up log at the
   * spot), bed (walks to the bed and ends). scene null means wherever she is. cues are [fraction, caption]. */
  var CATALOG = {
    wake: { routine: 'morning', label: 'Wake slowly', where: 'In bed', scene: 'bedroom', spot: 'bed', kind: 'timed', secs: 30, options: [30, 45, 60],
      blurb: 'Three slow breaths before your feet touch the floor.',
      cues: [[0, 'Stay where you are for a moment. One slow breath in, and let it go.'], [0.34, 'A second breath. Feel the weight of the bed under you.'], [0.67, 'A third. Then, when you are ready, up you get.']] },
    stretch: { routine: 'morning', label: 'Stretch by the window', where: 'Bedroom', scene: 'bedroom', spot: 'cushion', kind: 'timed', secs: 60, options: [45, 60, 90], pose: 'stretch', poseAt: { x: 65, y: 75 }, /* she stands on the rug beside the cushion and reaches up (art/chars/genz/stretch) */
      blurb: 'A gentle reach, a roll of the shoulders, nothing that pulls.',
      cues: [[0, 'Stand easy. Reach both arms up, slowly, and let them float down.'], [0.25, 'Roll your shoulders back a few times. Let the jaw soften.'], [0.5, 'Lean a little to one side, then the other. Only as far as feels good.'], [0.75, 'Let your head hang forward for a breath. Then come back up tall.']] },
    water: { routine: 'morning', label: 'A glass of water', where: 'Kitchen table', scene: 'living', spot: 'table', kind: 'timed', secs: 20, options: [20, 30],
      sit: true, pose: 'sip', /* she sits at the table and sips (art/chars/genz/sip); a standing drink pose is waiting on a render */
      blurb: 'A full glass, drunk slowly, before anything else.',
      cues: [[0, 'Pour a glass of water and hold it a moment before you drink.'], [0.5, 'Drink it slowly. Notice the cool of it. That is the whole step.', 'gulp']] },
    sounds: { routine: 'morning', label: 'Notice three sounds', where: 'Any room', scene: null, spot: null, kind: 'timed', secs: 45, options: [30, 45, 60],
      blurb: 'Listen for three sounds, near or far. No need to name them.',
      cues: [[0, 'Let your attention rest on listening. What is the first sound you notice?'], [0.34, 'And a second, maybe further away.'], [0.67, 'A third. Let them all come and go, without holding on.']] },
    intention: { routine: 'morning', label: 'One kind intention', where: 'Bedroom desk', scene: 'bedroom', spot: 'desk', kind: 'text', secs: 0,
      blurb: 'One line for the day ahead. Only you ever see it.', placeholder: 'Today I would like to…' },
    sleeplog: { routine: 'morning', label: 'How did you sleep', where: 'In bed', scene: 'bedroom', spot: 'bed', kind: 'log', topic: 'sleep', secs: 0,
      blurb: 'A tap is enough, or tell the log more.' },

    phone: { routine: 'evening', label: 'Phone face down', where: 'Kitchen table', scene: 'living', spot: 'table', kind: 'timed', secs: 15, options: [15, 30],
      blurb: 'Put it down, screen to the table, and leave it there a moment.',
      cues: [[0, 'Turn the phone over and set it down. Take your hands off it.'], [0.5, 'Let the evening be quieter from here.']] },
    warm: { routine: 'evening', label: 'A warm drink', where: 'Kitchen', scene: 'living', spot: 'kettle', kind: 'timed', secs: 20, options: [20, 30],
      blurb: 'Something warm, held with both hands.',
      cues: [[0, 'Fill the kettle and wait for it. Nothing to do while it heats.'], [0.5, 'Hold the cup with both hands. One slow sip, then another.']] },
    journal: { routine: 'evening', label: 'A line in the journal', where: 'Bedroom desk', scene: 'bedroom', spot: 'desk', kind: 'log', topic: 'mood', secs: 0,
      blurb: 'How the day was, in a line or two.' },
    winddown: { routine: 'evening', label: 'Wind-down breathing', where: 'Bedroom cushion', scene: 'bedroom', spot: 'cushion', kind: 'timed', secs: 120, options: [120, 180], sit: true,
      blurb: 'Two or three minutes of slow breathing, eyes open or closed.',
      cues: [[0, 'Settle on the cushion. Let the breath find its own pace.'], [0.2, 'Breathe in gently. Let the out-breath take a little longer than the in-breath.'], [0.45, 'If the mind drifts to the day, that is fine. Come back to the next breath.'], [0.7, 'Let the shoulders drop. Let the face soften.'], [0.9, 'A last few breaths. Then let the practice end on its own.']] },
    gratitude: { routine: 'evening', label: 'One good thing', where: 'Bedside', scene: 'bedroom', spot: 'bedside', kind: 'text', secs: 0,
      blurb: 'One good thing from today, however small. Only you ever see it.', placeholder: 'One good thing today was…' },
    bed: { routine: 'evening', label: 'Lights down, to bed', where: 'In bed', scene: 'bedroom', spot: 'bed', kind: 'bed', secs: 0,
      blurb: 'The routine ends here. Goodnight.' },
    meditate_am: { routine: 'morning', label: 'A short meditation', where: 'Any room', scene: null, spot: null, kind: 'meditate', secs: 0,
      blurb: 'A few quiet minutes, picked from the meditation library.' },
    meditate_pm: { routine: 'evening', label: 'A short meditation', where: 'Any room', scene: null, spot: null, kind: 'meditate', secs: 0,
      blurb: 'A few quiet minutes, picked from the meditation library.' }
  };
  var ROUTINES = {
    morning: { label: 'Morning routine', short: 'Morning', hours: [5, 11], defaults: ['wake', 'stretch', 'water', 'sounds', 'intention'],
      intro: 'A few small things in order. Start the day as you mean to go on, gently.', done: 'That is your morning. Carry a little of it with you.' },
    evening: { label: 'Evening routine', short: 'Evening', hours: [19, 1], defaults: ['phone', 'warm', 'journal', 'winddown', 'bed'],
      intro: 'A few small things that tell the day it is over.', done: 'That is your evening. Rest well.' }
  };
  function catalog(routine) { return Object.keys(CATALOG).filter(function (id) { return CATALOG[id].routine === routine; }); }

  /* ---------- her record ---------- */
  function clampSecs(id, secs) { var c = CATALOG[id]; if (!c || c.kind !== 'timed') return 0; var n = Math.round(Number(secs)); return n >= SECS_MIN && n <= SECS_MAX ? n : c.secs; }
  function defaults(routine) { return ROUTINES[routine].defaults.map(function (id) { return { id: id, secs: CATALOG[id].secs }; }); }
  function cleanList(list, routine) {
    var out = [], seen = {};
    (Array.isArray(list) ? list : []).forEach(function (s) {
      var id = s && typeof s === 'object' ? s.id : s;
      if (!CATALOG[id] || CATALOG[id].routine !== routine || seen[id] || out.length >= MAX) return;
      seen[id] = true; out.push({ id: id, secs: clampSecs(id, s && s.secs) });
    });
    return out.length >= MIN ? out : defaults(routine);
  }
  function ensure(r) {
    if (!r || typeof r !== 'object') r = {};
    r.v = 1;
    if (!r.lists || typeof r.lists !== 'object') r.lists = {};
    Object.keys(ROUTINES).forEach(function (k) { /* cleaned in place, so an open editor keeps the same array */
      var c = cleanList(r.lists[k], k);
      if (Array.isArray(r.lists[k])) { r.lists[k].length = 0; c.forEach(function (s) { r.lists[k].push(s); }); } else r.lists[k] = c;
    });
    if (!r.runs || typeof r.runs !== 'object') r.runs = {};
    if (!r.notNow || typeof r.notNow !== 'object') r.notNow = {};
    return r;
  }

  /* ---------- editing: pure on the list, saved by the caller; bounds keep 3 to 6 steps and no repeats ---------- */
  function canAdd(list, id) { return !!CATALOG[id] && list.length < MAX && !list.some(function (s) { return s.id === id; }); }
  function addStep(list, id) { if (!canAdd(list, id)) return false; list.push({ id: id, secs: CATALOG[id].secs }); return true; }
  function removeStep(list, i) { if (list.length <= MIN || i < 0 || i >= list.length) return false; list.splice(i, 1); return true; }
  function moveStep(list, i, dir) {
    var j = i + dir; if (i < 0 || i >= list.length || j < 0 || j >= list.length) return false;
    var t = list[i]; list[i] = list[j]; list[j] = t; return true;
  }
  function setSecs(list, i, secs) { var s = list[i]; if (!s || CATALOG[s.id].kind !== 'timed') return false; s.secs = clampSecs(s.id, secs); return true; }
  function addable(routine, list) { return catalog(routine).filter(function (id) { return canAdd(list, id); }); }
  function panelLabel(routine, list) { return ROUTINES[routine].label + ' (' + list.length + ' steps)'; }
  function totalSecs(list) { return list.reduce(function (n, s) { return n + (s.secs || 0); }, 0); }
  function minutesText(sec) { return sec < 60 ? 'under a minute' : 'about ' + Math.round(sec / 60) + ' min'; }

  /* ---------- runs: one per routine per date, resumed where it stopped ---------- */
  function run(r, routine, date) { return r.runs[date] ? r.runs[date][routine] || null : null; }
  function startRun(r, routine, date, nowIso) {
    ensure(r);
    var cur = run(r, routine, date);
    if (cur) return cur; /* carries on where she stopped; a finished one stays finished until restart() */
    if (!r.runs[date]) r.runs[date] = {};
    var keys = Object.keys(r.runs).sort(); while (keys.length > KEEP_DAYS) delete r.runs[keys.shift()];
    r.runs[date][routine] = { routine: routine, date: date, steps: r.lists[routine].map(function (s) { return { id: s.id, secs: s.secs }; }), index: 0, done: {}, skipped: {}, notes: {}, started: nowIso || null, finished: null };
    return r.runs[date][routine];
  }
  function current(rn) { return rn && !rn.finished && rn.index < rn.steps.length ? rn.steps[rn.index] : null; }
  /* the current step is over: done or skipped; the run finishes after its last step */
  function advance(rn, status, nowIso) {
    var s = current(rn); if (!s) return false;
    if (status === 'skipped') rn.skipped[s.id] = true; else rn.done[s.id] = true;
    rn.index += 1;
    if (rn.index >= rn.steps.length) rn.finished = nowIso || 'done';
    return true;
  }
  function setNote(rn, id, text) { rn.notes[id] = String(text || '').replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX); return rn.notes[id]; }
  function restart(r, routine, date, nowIso) { if (r.runs[date]) delete r.runs[date][routine]; return startRun(r, routine, date, nowIso); }
  function isDone(r, routine, date) { var rn = run(r, routine, date); return !!(rn && rn.finished); }
  function statusLine(rn) {
    if (!rn) return 'Ready when you are.';
    if (rn.finished) { var n = Object.keys(rn.done).length; return 'Done today. ' + (n === rn.steps.length ? 'Every step.' : n + ' of ' + rn.steps.length + ' steps, and that is plenty.'); }
    return rn.index === 0 ? 'Ready when you are.' : 'Paused at step ' + (rn.index + 1) + ' of ' + rn.steps.length + '. Carry on whenever you like.';
  }

  /* ---------- the gentle prompt: a morning window and an evening window, once a day, remembered when she says not now ---------- */
  function inWindow(routine, hour) {
    var h = ROUTINES[routine].hours, a = h[0], b = h[1];
    return a < b ? hour >= a && hour < b : hour >= a || hour < b;
  }
  function promptFor(r, date, hour) {
    ensure(r);
    var ids = Object.keys(ROUTINES).filter(function (k) { return inWindow(k, hour); });
    for (var i = 0; i < ids.length; i++) {
      var k = ids[i], rn = run(r, k, date);
      if (rn && rn.finished) continue;
      if (r.notNow[date] && r.notNow[date][k]) continue;
      return { routine: k, resume: !!(rn && rn.index > 0) };
    }
    return null;
  }
  function notNow(r, date, routine) { ensure(r); if (!r.notNow[date]) r.notNow[date] = {}; r.notNow[date][routine] = true; var keys = Object.keys(r.notNow).sort(); while (keys.length > KEEP_DAYS) delete r.notNow[keys.shift()]; return r; }
  function promptLine(routine, resume) {
    if (resume) return 'Your ' + ROUTINES[routine].short.toLowerCase() + ' routine is waiting where you left it.';
    return routine === 'morning' ? 'Good morning. Shall we start the day gently, with your morning routine?' : 'Good evening. Shall we wind down together before bed?';
  }

  /* ---------- timer: counts only running, visible time ---------- */
  function timer(plannedSec) { return { planned: plannedSec, activeMs: 0, paused: false, hidden: false, ended: false, last: null }; }
  function counting(t) { return !t.paused && !t.hidden && !t.ended; }
  function tick(t, now) {
    if (counting(t) && t.last !== null) t.activeMs += Math.max(0, Math.min(MAX_STEP_MS, now - t.last));
    t.last = now;
    if (t.activeMs >= t.planned * 1000) { t.activeMs = t.planned * 1000; t.ended = true; }
    return t;
  }
  function pause(t, now) { tick(t, now); t.paused = true; return t; }
  function resume(t, now) { t.paused = false; t.last = now; return t; }
  function setHidden(t, hidden, now) { tick(t, now); t.hidden = !!hidden; t.last = now; return t; }
  function end(t, now) { tick(t, now); t.ended = true; return t; }
  function activeSec(t) { return Math.floor(t.activeMs / 1000); }
  function finished(t) { return t.activeMs >= t.planned * 1000 - 999; }
  function leftSec(t) { return Math.max(0, t.planned - activeSec(t)); }
  function clockText(t) { var l = leftSec(t); return Math.floor(l / 60) + ':' + String(l % 60).padStart(2, '0') + ' left' + (t.paused ? ', paused' : ''); }
  function cueAt(cues, t) { var f = t.planned ? t.activeMs / 1000 / t.planned : 0, i = 0; (cues || []).forEach(function (c, k) { if (c[0] <= f) i = k; }); return i; }

  /* ---------- the saved observation: the course's shape plus which routine it belonged to ---------- */
  function observation(routine, step, t, startIso, endIso) {
    var c = CATALOG[step.id], planned = t ? t.planned : 0, active = t ? activeSec(t) : 0;
    return { practice: 'routine-' + step.id, anchor: c.kind === 'timed' && c.sit ? 'breath' : 'routine', scriptVersion: 'routines-1',
      plannedSec: planned, activeSec: active, status: !t || finished(t) ? 'finished' : 'partial',
      start: startIso, end: endIso, source: 'routine', routine: routine, step: step.id };
  }

  root.EbbRoutineRules = { CATALOG: CATALOG, ROUTINES: ROUTINES, MIN: MIN, MAX: MAX, KEEP_DAYS: KEEP_DAYS, SECS_MIN: SECS_MIN, SECS_MAX: SECS_MAX, NOTE_MAX: NOTE_MAX, MAX_STEP_MS: MAX_STEP_MS,
    catalog: catalog, defaults: defaults, cleanList: cleanList, ensure: ensure, clampSecs: clampSecs,
    canAdd: canAdd, addStep: addStep, removeStep: removeStep, moveStep: moveStep, setSecs: setSecs, addable: addable, panelLabel: panelLabel, totalSecs: totalSecs, minutesText: minutesText,
    run: run, startRun: startRun, current: current, advance: advance, setNote: setNote, restart: restart, isDone: isDone, statusLine: statusLine,
    inWindow: inWindow, promptFor: promptFor, notNow: notNow, promptLine: promptLine,
    timer: timer, counting: counting, tick: tick, pause: pause, resume: resume, setHidden: setHidden, end: end, activeSec: activeSec, finished: finished, leftSec: leftSec, clockText: clockText, cueAt: cueAt,
    observation: observation };
})(typeof window !== 'undefined' ? window : globalThis);
