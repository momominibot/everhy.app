/* Ebb sleep rules: the pure part of tucking into bed (js/ext/sleep.js). Where the asleep overlay goes, the two states
 * she can be in, and what each event does to them. No DOM here, so tools/test-sleep.js checks it in node. */
(function (root) {
  'use strict';

  /* the bed with her asleep under the blanket, cut from the sleep render: plate percent, same unit both ways */
  var OVERLAY = [22, 34, 56, 66];
  var STATES = { up: 'up', inBed: 'inBed' };

  /* the overlay rect for a bed spot: the cut-out is drawn where the painting's bed is, so a spot whose `at` lies
   * outside it (a rearranged room) gets none; the overlay was cut for the painted bed only */
  function overlayRect(spot) {
    if (!spot || !spot.at) return null;
    var r = OVERLAY;
    return spot.at.x >= r[0] && spot.at.x <= r[2] && spot.at.y >= r[1] && spot.at.y <= r[3] ? r.slice() : null;
  }

  /* events: tuck (she climbs in), getUp (the button), scene (she is somewhere else now), stood (the engine stood her up
   * for something else, such as Decorate). Only tuck from up and getUp/scene/stood from inBed change anything. */
  function next(state, event) {
    if (state === STATES.inBed) return event === 'getUp' || event === 'scene' || event === 'stood' ? STATES.up : STATES.inBed;
    return event === 'tuck' ? STATES.inBed : STATES.up;
  }

  /* the same spot handed to the log extension's kind: everything kept, only the kind changes */
  function logSpot(spot) {
    var s = {}; Object.keys(spot || {}).forEach(function (k) { s[k] = spot[k]; });
    s.kind = 'log'; s.topic = spot && spot.topic || 'sleep';
    return s;
  }

  /* where she lies: on the spot itself; where she stands up: the spot's stand point */
  function lieAt(spot) { return { x: spot.at.x, y: spot.at.y }; }
  function standAt(spot) { return { x: spot.stand.x, y: spot.stand.y }; }

  root.EbbSleepRules = { OVERLAY: OVERLAY, STATES: STATES, overlayRect: overlayRect, next: next, logSpot: logSpot, lieAt: lieAt, standAt: standAt };
})(typeof window !== 'undefined' ? window : this);
