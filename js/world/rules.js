/* Ebb world rules, pure: the barn animals, the hot spring egg and fishing. Days are 'YYYY-MM-DD' strings passed in by the
 * caller and randomness is passed in as a number, so the node harness can move the calendar and fix every roll.
 * Nothing here gets sick, hungry, sad or dies. A skipped day adds nothing and takes nothing away. */
(function (root) {
  'use strict';

  /* ---------- barn ---------- */
  var ANIMALS = [
    { id: 'hen1', kind: 'hen', name: 'Pip' },
    { id: 'hen2', kind: 'hen', name: 'Clover' },
    { id: 'cow', kind: 'cow', name: 'Mochi' }
  ];
  var ACTS = ['feed', 'talk', 'brush'];
  var HEART_EVERY = 3, HEART_MAX = 10, KEEP_DATES = 40;

  function freshBarn() {
    var animals = {};
    ANIMALS.forEach(function (a) {
      animals[a.id] = { kind: a.kind, name: a.name, careDates: [], careBase: 0, lastAct: null, fed: [], nest: 0, milkDay: null };
    });
    return { animals: animals };
  }
  /* repairs an old or partial save without losing anything that is there */
  function ensureBarn(barn) {
    var b = barn && typeof barn === 'object' ? barn : freshBarn(), blank = freshBarn();
    if (!b.animals || typeof b.animals !== 'object') b.animals = {};
    Object.keys(blank.animals).forEach(function (id) {
      var a = b.animals[id];
      if (!a || typeof a !== 'object') { b.animals[id] = blank.animals[id]; return; }
      if (!Array.isArray(a.careDates)) a.careDates = [];
      if (!Array.isArray(a.fed)) a.fed = [];
      if (typeof a.careBase !== 'number' || a.careBase < 0) a.careBase = 0;
      if (typeof a.nest !== 'number' || a.nest < 0) a.nest = 0;
      a.kind = blank.animals[id].kind; a.name = a.name || blank.animals[id].name;
    });
    return b;
  }

  function careDays(a) { return a.careBase + a.careDates.length; }
  function hearts(a) { return Math.min(HEART_MAX, Math.floor(careDays(a) / HEART_EVERY)); }
  function caredOn(a, day) { return a.careDates.indexOf(day) >= 0; }
  function fedOn(a, day) { return a.fed.indexOf(day) >= 0; }

  /* a hen fed on an earlier day has laid that egg in the nest; it waits there until collected, however long */
  function settle(barn, today) {
    Object.keys(barn.animals).forEach(function (id) {
      var a = barn.animals[id];
      if (a.kind !== 'hen') return;
      var keep = [];
      a.fed.forEach(function (d) { if (d < today) a.nest += 1; else keep.push(d); });
      a.fed = keep;
    });
    return barn;
  }

  /* feed, talk or brush. Only the first kind act of a day counts as a day of care. Feeding a hen also means an egg
   * tomorrow, and a hen is only fed once a day. Returns { counted, heart, fed, already } and never removes anything. */
  function care(barn, id, act, today) {
    var a = barn.animals[id];
    if (!a || ACTS.indexOf(act) < 0) return { counted: false, error: 'unknown' };
    settle(barn, today);
    var before = hearts(a), counted = false, fed = false;
    if (!caredOn(a, today)) {
      a.careDates.push(today); counted = true; a.lastAct = act;
      if (a.careDates.length > KEEP_DATES) { a.careDates.sort(); a.careDates.shift(); a.careBase += 1; }
    }
    if (act === 'feed' && a.kind === 'hen' && !fedOn(a, today)) { a.fed.push(today); fed = true; }
    return { counted: counted, heart: hearts(a) > before, fed: fed, already: !counted };
  }

  function collectEggs(barn, id, today) { /* returns how many eggs were picked up */
    settle(barn, today);
    var a = barn.animals[id];
    if (!a || a.kind !== 'hen' || a.nest <= 0) return 0;
    var n = a.nest; a.nest = 0; return n;
  }

  /* the cow gives milk once a day, on a day she has been cared for */
  function canMilk(barn, id, today) { var a = barn.animals[id]; return !!a && a.kind === 'cow' && caredOn(a, today) && a.milkDay !== today; }
  function milk(barn, id, today) {
    if (!canMilk(barn, id, today)) return false;
    barn.animals[id].milkDay = today; return true;
  }

  /* ---------- basket: the farm's basket holds crops, eggs, milk and fish alike ---------- */
  var ITEMS = {
    egg: { name: 'Egg' }, milk: { name: 'Milk' }, spaEgg: { name: 'Spa-boiled egg' },
    fishSmall: { name: 'Small fish' }, fishMedium: { name: 'Medium fish' }, fishLarge: { name: 'Large fish' }
  };
  function addToBasket(farm, key, n) { farm.basket[key] = (farm.basket[key] || 0) + (n || 1); return farm.basket[key]; }

  /* ---------- hot spring: an egg dropped in the warm water comes out spa-boiled ---------- */
  function boilEgg(farm) {
    if (!farm.basket.egg) return false;
    farm.basket.egg -= 1; addToBasket(farm, 'spaEgg'); return true;
  }

  /* ---------- fishing: a calm timing game ----------
   * A cast waits waitMs for a nibble, then the float dips for windowMs. Reeling in while it dips lands a fish; the closer
   * to the middle of the dip, the better the chance of a bigger one. Too early or too late, it simply got away. */
  var SIZES = ['fishSmall', 'fishMedium', 'fishLarge'];
  function cast(r1, r2) { return { waitMs: Math.round(1800 + r1 * 3200), windowMs: Math.round(1300 + r2 * 400) }; }
  function reel(c, tapMs, roll) {
    if (tapMs < c.waitMs) return { result: 'early' };
    if (tapMs > c.waitMs + c.windowMs) return { result: 'away' };
    var mid = c.waitMs + c.windowMs / 2, closeness = 1 - Math.abs(tapMs - mid) / (c.windowMs / 2); /* 0 at the edges, 1 dead centre */
    var large = 0.06 + 0.22 * closeness, medium = 0.3 + 0.1 * closeness;
    var size = roll < large ? 'fishLarge' : roll < large + medium ? 'fishMedium' : 'fishSmall';
    return { result: 'caught', size: size, closeness: closeness };
  }

  root.EbbWorldRules = {
    ANIMALS: ANIMALS, ACTS: ACTS, HEART_EVERY: HEART_EVERY, HEART_MAX: HEART_MAX, ITEMS: ITEMS, SIZES: SIZES,
    freshBarn: freshBarn, ensureBarn: ensureBarn, settle: settle, care: care, hearts: hearts, careDays: careDays,
    caredOn: caredOn, fedOn: fedOn, collectEggs: collectEggs, canMilk: canMilk, milk: milk,
    addToBasket: addToBasket, boilEgg: boilEgg, cast: cast, reel: reel
  };
})(typeof window !== 'undefined' ? window : globalThis);
