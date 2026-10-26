/* Ebb seat rules: the pure part of sitting down somewhere out in the world (js/ext/seats.js). Which painted seats are
 * seats, what she can do on each, how a timed action counts its seconds, and what gets saved. No DOM here, so
 * tools/test-seats.js checks it in node. Nothing is scored; a skipped or short action saves nothing and loses nothing. */
(function (root) {
  'use strict';

  var MAX_STEP_MS = 1500; /* a hidden or stalled tab never adds more than this per tick (the course timer's rule) */
  var MIN_SAVE_SEC = 20;  /* a timed action is kept only when at least this much ran */
  var VERSION = 'seats-1';

  /* ---------- what can be done on a seat ----------
   * sec: planned seconds (0 means untimed). prompt: shown while it runs. done: the kind line after. */
  var ACTIONS = {
    sip: { id: 'sip', pose: 'sip', label: 'Sip your kopi', sec: 20, prompt: 'Both hands round the cup. Notice the warmth, the smell, the first slow sip.', done: 'A small pause in a busy place. That counts.', fx: 'steam' },
    breaths: { id: 'breaths', label: 'Three slow breaths', sec: 30, prompt: 'In through the nose, out a little longer. Three, at your own pace.', done: 'Three breaths, taken on purpose.', count: 3 },
    watch: { id: 'watch', label: 'People-watch', sec: 45, prompt: 'Look around. Name three things you can see, quietly, to yourself.', done: 'Three things noticed. Nothing to do with them.' },
    water: { id: 'water', label: 'Watch the water', sec: 60, prompt: 'Rest your eyes on the lake. Let it move; you do not have to.', done: 'A minute with the water. Enough.' },
    listen: { id: 'listen', label: 'Listen', sec: 45, prompt: 'Close your eyes if you like. Name three sounds, near or far.', done: 'Three sounds, heard. The world kept going.' },
    boats: { id: 'boats', label: 'Watch the boats', sec: 60, prompt: 'Follow one boat across the bay until it is gone. Then another.', done: 'A minute by the bay. The boats carried on without you.' },
    soak: { id: 'soak', pose: 'soak', label: 'A warm soak', sec: 120, prompt: 'Let the warm water hold you. Notice where it touches: your back, your shoulders, your hands. Breathe in the steam, and let each breath out be a little slower.', done: 'Two warm minutes, noticed. A gentle way to end the day.' },
    warmth: { id: 'warmth', pose: 'soak', label: 'Feel the warmth', sec: 60, prompt: 'Rest your hands on the water. Feel warm, then a little warmer. With each breath out, let your shoulders drop a little more.', done: 'A minute of warmth, on purpose.' },
    eat: { id: 'eat', label: 'Eat slowly', sec: 60, uses: 'dish', prompt: 'Look at your food first: the colours, the steam. Small bites. Put your spoon down between them and taste each one.', done: 'A meal eaten slowly, on purpose.' },
    still: { id: 'still', label: 'Just sit', sec: 0, prompt: 'Sitting. Nothing to do. Get up whenever you like.', done: '' }
  };

  /* ---------- the seats: painted seats in the world that take these actions ----------
   * key is scene:spot. offset moves her from the spot's `at` (the table top, the bench's tap target) onto the painted
   * seat itself: the stool in front of the hawker table, the seat of each bench (read off a 5 unit grid at 390 px).
   * steam is where the kopi cup is, relative to `at`.
   * TODO integrator: fold `kind: 'seat'` and this config into the scene data in js/ebb-world.js; the extension only
   * retargets these three spots at load because another workstream owns that file. */
  var SEATS = {
    'hawker:table': { title: 'At the kopi table', line: 'A marble table, a stool, a kopi going cold slowly.', offset: { x: -6.5, y: 11.5 }, pose: 'sip', actions: ['sip', 'breaths', 'watch', 'still'], steam: { x: -1.8, y: -1.2 } },
    'hawker:stool1': { title: 'At a hawker table', line: 'A stool, a marble table, the hum of the centre around you.', offset: { x: 0, y: 1.5 }, pose: 'sip', actions: ['sip', 'breaths', 'watch', 'still'], steam: { x: 5, y: -9 } },
    'hawker:stool2': { title: 'At a hawker table', line: 'A stool, a marble table, the hum of the centre around you.', offset: { x: 0, y: 1.5 }, pose: 'sip', actions: ['sip', 'breaths', 'watch', 'still'], steam: { x: -6, y: -9 } },
    'hawker:stool3': { title: 'At a hawker table', line: 'A stool, a marble table, the hum of the centre around you.', offset: { x: 0, y: 1.5 }, pose: 'sip', actions: ['sip', 'breaths', 'watch', 'still'], steam: { x: 4, y: -10 } },
    'hawker:stool4': { title: 'At a hawker table', line: 'A stool, a marble table, the hum of the centre around you.', offset: { x: 0, y: 1.5 }, pose: 'sip', actions: ['sip', 'breaths', 'watch', 'still'], steam: { x: -8, y: -12 } },
    'waterfall:bench': { title: 'On the lake bench', line: 'The quarry lake, the cliff in it upside down.', offset: { x: -2, y: 11 }, pose: 'ride_back', actions: ['water', 'breaths', 'listen', 'still'] },
    'bathroom:bath': { title: 'In the bath', line: 'Warm water, soft bubbles, the day nearly done.', offset: { x: 0, y: 9 }, pose: 'soak', cover: 'bubbles', actions: ['soak', 'warmth', 'breaths', 'still'] },
    'kitchen:dining': { title: 'At the table', line: 'Your own table, at home.', offset: { x: -6, y: 8 }, actions: ['eat', 'breaths', 'still'] },
    'merlion:bench': { title: 'On the stone bench', line: 'The bay, the spout, the boats going by.', offset: { x: 5, y: 8 }, actions: ['boats', 'breaths', 'still'] }
  };

  function key(sceneId, spotId) { return sceneId + ':' + spotId; }
  function seatFor(sceneId, spotId) { return SEATS[key(sceneId, spotId)] || null; }
  function isSeat(sceneId, spotId) { return !!seatFor(sceneId, spotId); }
  /* the actions a seat offers, in order, as full action objects (copies, so callers cannot change the catalog) */
  function actionsFor(sceneId, spotId) {
    var s = seatFor(sceneId, spotId); if (!s) return [];
    return s.actions.map(function (id) { return Object.assign({}, ACTIONS[id]); });
  }

  /* retarget the listed spots to the seat kind, in place, without touching anything else. Returns the keys changed.
   * Idempotent: a spot already a seat is left as it is. A missing scene or spot is skipped (another workstream may
   * have renamed it), never invented. */
  function retarget(scenes) {
    var changed = [];
    Object.keys(SEATS).forEach(function (k) {
      var parts = k.split(':'), sc = scenes && scenes[parts[0]]; if (!sc || !sc.spots) return;
      sc.spots.forEach(function (sp) {
        if (sp.id !== parts[1]) return;
        if (sp.kind === 'seat' && sp.seat) return;
        sp.kind = 'seat'; sp.seat = SEATS[k]; changed.push(k);
      });
    });
    return changed;
  }

  /* where she is drawn when seated: the spot's `at` plus the seat's small offset */
  function sitAt(spot) {
    var o = spot && spot.seat && spot.seat.offset || { x: 0, y: 0.2 };
    return { x: spot.at.x + (o.x || 0), y: spot.at.y + (o.y || 0) };
  }
  function standAt(spot) { return { x: spot.stand.x, y: spot.stand.y }; }

  /* ---------- the timer: counts only running, visible time, never more than MAX_STEP_MS per tick ---------- */
  function timer(plannedSec) { return { planned: plannedSec, activeMs: 0, paused: false, hidden: false, ended: false, last: null }; }
  function counting(t) { return !t.paused && !t.hidden && !t.ended; }
  function advance(t, now) {
    if (counting(t) && t.last !== null) t.activeMs += Math.max(0, Math.min(MAX_STEP_MS, now - t.last));
    t.last = now;
    if (t.planned > 0 && t.activeMs >= t.planned * 1000) { t.activeMs = t.planned * 1000; t.ended = true; }
    return t;
  }
  function pause(t, now) { advance(t, now); t.paused = true; return t; }
  function resume(t, now) { t.paused = false; t.last = now; return t; }
  function setHidden(t, hidden, now) { advance(t, now); t.hidden = !!hidden; t.last = now; return t; }
  function end(t, now) { advance(t, now); t.ended = true; return t; }
  function activeSec(t) { return Math.floor(t.activeMs / 1000); }
  function finished(t) { return t.planned > 0 && t.activeMs >= t.planned * 1000 - 999; }
  function leftSec(t) { return Math.max(0, t.planned - activeSec(t)); }
  function clockText(t) { var s = leftSec(t); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

  /* the breath count for an action with `count`: which breath she is on (1-based) and whether it is the in or out half */
  function breathAt(action, t) {
    if (!action || !action.count || !t.planned) return null;
    var each = t.planned / action.count, sec = t.activeMs / 1000, n = Math.min(action.count, Math.floor(sec / each) + 1);
    var within = sec - (n - 1) * each;
    return { n: n, of: action.count, phase: within < each / 2 ? 'in' : 'out' };
  }

  /* ---------- the saved observation: only when enough ran ---------- */
  function shouldSave(t) { return activeSec(t) >= MIN_SAVE_SEC; }
  function record(action, t, where, seat, startIso, endIso) {
    if (!shouldSave(t)) return null;
    var date = String(startIso || endIso || '').slice(0, 10);
    return {
      type: 'mindfulness', date: date, activeSec: activeSec(t), status: finished(t) ? 'finished' : 'partial',
      where: where, seat: seat, practice: 'seat-' + action.id, anchor: action.id === 'breaths' ? 'breath' : action.id === 'listen' ? 'sound' : 'sight',
      scriptVersion: VERSION, plannedSec: t.planned, start: startIso || null, end: endIso || null, source: 'seat', confirmed: true
    };
  }

  root.EbbSeatRules = {
    VERSION: VERSION, MAX_STEP_MS: MAX_STEP_MS, MIN_SAVE_SEC: MIN_SAVE_SEC, ACTIONS: ACTIONS, SEATS: SEATS,
    key: key, seatFor: seatFor, isSeat: isSeat, actionsFor: actionsFor, retarget: retarget, sitAt: sitAt, standAt: standAt,
    timer: timer, counting: counting, advance: advance, pause: pause, resume: resume, setHidden: setHidden, end: end,
    activeSec: activeSec, finished: finished, leftSec: leftSec, clockText: clockText, breathAt: breathAt, shouldSave: shouldSave, record: record
  };
})(typeof window !== 'undefined' ? window : this);
