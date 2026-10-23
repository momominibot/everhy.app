/* Ebb transit rules, pure and testable in node: when a map trip offers the MRT or the bus, what a trip remembers,
 * how it ends, and the short seat practices on board. A trip is only a way to get somewhere: nothing is scored,
 * nothing is owed, and leaving the carriage by any other route simply forgets the trip. */
(function (root) {
  'use strict';
  var VERSION = 'transit-1', MAX_STEP_MS = 1500;
  var HOME = ['bedroom', 'bathroom', 'living']; /* her home: no train runs between her own rooms */
  var MODES = {
    train: { scene: 'train', label: 'Take the MRT', note: 'A quiet carriage ride', toast: 'The doors close softly. Next stop: ', verb: 'train' },
    bus: { scene: 'bus', label: 'Take the bus', note: 'Upstairs on the double-decker', toast: 'The bus pulls away. Next stop: ', verb: 'bus' }
  };
  var SEAT_OPTIONS = [
    { id: 'breathe', label: 'Sit and breathe for the ride', note: 'A counted breath with a timer, 60 or 90 seconds', secs: [60, 90] },
    { id: 'notice', label: 'Notice five things', note: 'One sense at a time, 45 seconds', secs: [45] },
    { id: 'sit', label: 'Just sit', note: 'Nothing timed, nothing saved' }
  ];
  /* a counted breath: in for four, out for six, the count shown on the sheet */
  var BREATH = [['Breathe in', 4], ['Breathe out', 6]];
  var NOTICE = [
    'One thing you can see. Let your eyes rest on it.',
    'One thing you can hear. The hum, a voice, the rails.',
    'One thing you can feel. The seat holding you up.',
    'One thing you can smell, or the air on your face.',
    'One breath, just as it is. Nothing to change.'
  ];

  function isTransitScene(id) { return Object.keys(MODES).some(function (m) { return MODES[m].scene === id; }); }
  function spotIn(scene, id) { for (var i = 0; i < scene.spots.length; i++) if (scene.spots[i].id === id) return scene.spots[i]; return null; }

  /* when the map's travel should ask how she gets there: the place must exist, be away from where she is, and not be
   * her home; and she cannot board from on board. Returns the trip's destination, or null for the plain walk. */
  function offerFor(pin, scenes, current) {
    if (!pin || !pin.scene || !scenes[pin.scene]) return null;
    var s = scenes[pin.scene], sp = pin.spot ? spotIn(s, pin.spot) : null;
    if (pin.spot && !sp) return null;
    if (pin.id === 'home' || HOME.indexOf(pin.scene) >= 0) return null;
    if (!pin.spot && (pin.here || [pin.scene]).indexOf(current) >= 0) return null;
    if (isTransitScene(current)) return null;
    if (pin.scene === 'farm' && HOME.indexOf(current) >= 0) return null; /* the Garden is next door to her home: she walks out of the door */
    return { to: pin.scene, arrive: sp ? { x: sp.stand.x, y: sp.stand.y } : null, label: pin.label || s.name };
  }

  /* ---------- the trip in the save ---------- */
  function ensure(st) {
    if (!st.transit || typeof st.transit !== 'object') st.transit = { trip: null };
    var t = st.transit.trip;
    if (!t || typeof t !== 'object' || !MODES[t.mode] || typeof t.to !== 'string' || !t.to) st.transit.trip = null;
    else if (t.arrive && (typeof t.arrive.x !== 'number' || typeof t.arrive.y !== 'number')) t.arrive = null;
    return st.transit;
  }
  function trip(st) { return ensure(st).trip; }
  function begin(st, mode, to, arrive, now) {
    if (!MODES[mode] || !to) return null;
    var t = { to: String(to), arrive: arrive && typeof arrive.x === 'number' ? { x: arrive.x, y: arrive.y } : null, mode: mode, startedAt: now || Date.now() };
    ensure(st).trip = t; return t;
  }
  function clear(st) { ensure(st).trip = null; }
  /* where the ride ends: the destination and its arrival point; clears the trip */
  function arrival(st) {
    var t = trip(st); if (!t) return null;
    var out = { scene: t.to, at: t.arrive || undefined, mode: t.mode };
    clear(st); return out;
  }
  /* what to do when the scene changes while a trip is remembered: on board stays, the destination arrives,
   * anywhere else forgets the trip */
  function onScene(st, sceneId) {
    var t = trip(st); if (!t) return 'none';
    if (sceneId === MODES[t.mode].scene) return 'riding';
    clear(st);
    return sceneId === t.to ? 'arrived' : 'left';
  }
  /* the exit door of a carriage points where the trip goes; without a trip, somewhere sensible */
  function exitFor(st, mode) {
    var t = trip(st);
    if (t && t.mode === mode) return { to: t.to, arrive: t.arrive || undefined };
    return mode === 'bus' ? { to: 'hawker', arrive: undefined } : { to: 'merlion', arrive: undefined };
  }

  /* ---------- the seat timer: counts only running, visible time ---------- */
  function timer(plannedSec) { return { planned: plannedSec, activeMs: 0, paused: false, hidden: false, ended: false, last: null }; }
  function counting(t) { return !t.paused && !t.hidden && !t.ended; }
  function advance(t, now) {
    if (counting(t) && t.last !== null) t.activeMs += Math.max(0, Math.min(MAX_STEP_MS, now - t.last));
    t.last = now;
    if (t.activeMs >= t.planned * 1000) { t.activeMs = t.planned * 1000; t.ended = true; }
    return t;
  }
  function pause(t, now) { advance(t, now); t.paused = true; return t; }
  function resume(t, now) { t.paused = false; t.last = now; return t; }
  function setHidden(t, hidden, now) { advance(t, now); t.hidden = !!hidden; t.last = now; return t; }
  function end(t, now) { advance(t, now); t.ended = true; return t; }
  function activeSec(t) { return Math.floor(t.activeMs / 1000); }
  function leftSec(t) { return Math.max(0, t.planned - activeSec(t)); }
  function finished(t) { return t.activeMs >= t.planned * 1000 - 999; }
  function clock(t) { var l = leftSec(t); return Math.floor(l / 60) + ':' + String(l % 60).padStart(2, '0'); }

  /* the breath cue for a moment in the practice: which phase, and the count within it (1-based) */
  function breathAt(t) {
    var s = t.activeMs / 1000, cycle = BREATH[0][1] + BREATH[1][1], into = s % cycle;
    var phase = into < BREATH[0][1] ? 0 : 1, start = phase ? BREATH[0][1] : 0;
    return { text: BREATH[phase][0], count: Math.min(BREATH[phase][1], Math.floor(into - start) + 1), of: BREATH[phase][1] };
  }
  /* which of the five things: evenly through the planned time, the last one held to the end */
  function noticeAt(t) {
    var i = Math.floor(t.activeMs / 1000 / (t.planned / NOTICE.length));
    return { index: Math.min(NOTICE.length - 1, i), text: NOTICE[Math.min(NOTICE.length - 1, i)] };
  }

  /* ---------- the saved observation: the store's own practice shape plus where it happened ---------- */
  function observation(kind, mode, t, startIso, endIso, id) {
    var day = String(startIso || '').slice(0, 10);
    return {
      id: id || 'p' + Date.now().toString(36), type: 'mindfulness', date: day,
      practice: 'transit-' + kind, anchor: kind === 'notice' ? 'senses' : 'breath', scriptVersion: VERSION,
      plannedSec: Math.max(0, Math.round(t.planned)), activeSec: activeSec(t), status: finished(t) ? 'finished' : 'partial',
      start: startIso || null, end: endIso || null, source: 'transit', where: MODES[mode] ? mode : 'train', confirmed: true
    };
  }
  /* a practice is worth keeping once it had a few real seconds in it */
  function worthSaving(t) { return activeSec(t) >= 5; }

  root.EbbTransitRules = {
    VERSION: VERSION, MAX_STEP_MS: MAX_STEP_MS, HOME: HOME.slice(), MODES: MODES, SEAT_OPTIONS: SEAT_OPTIONS, BREATH: BREATH, NOTICE: NOTICE,
    isTransitScene: isTransitScene, offerFor: offerFor, ensure: ensure, trip: trip, begin: begin, clear: clear, arrival: arrival, onScene: onScene, exitFor: exitFor,
    timer: timer, counting: counting, advance: advance, pause: pause, resume: resume, setHidden: setHidden, end: end, activeSec: activeSec, leftSec: leftSec,
    finished: finished, clock: clock, breathAt: breathAt, noticeAt: noticeAt, observation: observation, worthSaving: worthSaving
  };
})(typeof window !== 'undefined' ? window : globalThis);
