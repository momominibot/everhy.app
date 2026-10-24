/* Ebb kitchen rules, pure: what the hob, oven and Thermomix can make from the basket, what each dish uses, the cook
 * timer (running visible time only, like the course), the meal record and the basin's mindful hand-washing record.
 * Crop and item ids come in from the caller (EbbFarm.CROPS, EbbWorldRules.ITEMS), so nothing is named twice. Days are
 * 'YYYY-MM-DD' strings passed in. Nothing is scored, nothing counts calories, nothing spoils and nothing is owed. */
(function (root) {
  'use strict';
  var VERSION = 'kitchen-1', MAX_STEP_MS = 1500, WASH_SECS = 20;

  var STATIONS = {
    cook: { name: 'Hob', secs: 20, ask: 'Something warm from the basket?', verb: 'cooking', done: 'Cooked' },
    bake: { name: 'Oven', secs: 30, ask: 'Something from the oven?', verb: 'baking', done: 'Baked' },
    blend: { name: 'Thermomix', secs: 15, ask: 'A smoothie from one thing in the basket?', verb: 'blending', done: 'Blended' }
  };
  /* needs: exact counts of basket ids. anyFish: one fish of any size. anyCrop: one of the farm's crops. */
  var RECIPES = [
    { id: 'turnipSoup', station: 'cook', name: 'Turnip soup', needs: { turnip: 2 }, line: 'Soft turnip, a pinch of pepper, steam on the window.' },
    { id: 'carrotStirFry', station: 'cook', name: 'Carrot stir-fry', needs: { carrot: 2 }, line: 'Bright ribbons of carrot, a little sesame.' },
    { id: 'sunflowerSnack', station: 'cook', name: 'Toasted sunflower seeds', needs: { sunflower: 1 }, line: 'Seeds tossed in the pan until they smell nutty.' },
    { id: 'friedEgg', station: 'cook', name: 'Fried egg', needs: { egg: 1 }, line: 'Crisp edges, a soft middle.' },
    { id: 'grilledFish', station: 'cook', name: 'Grilled fish', anyFish: true, line: 'A squeeze of lime, a little salt.' },
    { id: 'carrotCake', station: 'bake', name: 'Carrot cake', needs: { carrot: 2, egg: 1 }, line: 'The whole room smells of cinnamon.' },
    /* with the provision shop's pantry (eggs, rice, ginger, chilli from the hawker centre) */
    { id: 'eggFriedRice', station: 'cook', name: 'Egg fried rice', needs: { rice: 1, egg: 1 }, line: 'Rice tossed hot with egg, the wok smell filling the kitchen.' },
    { id: 'gingerFish', station: 'cook', name: 'Steamed fish with ginger', needs: { ginger: 1 }, anyFish: true, line: 'Fish steamed soft, thin ginger on top, a little soy.' },
    { id: 'sambalTurnip', station: 'cook', name: 'Sambal turnip', needs: { turnip: 1, chilli: 1 }, line: 'Turnip in a gentle homemade sambal. Warm, not fiery.' },
    { id: 'sunflowerBread', station: 'bake', name: 'Sunflower seed bread', needs: { sunflower: 1 }, line: 'A small loaf, seeds on the crust.' },
    { id: 'smoothie', station: 'blend', name: 'Smoothie', anyCrop: true, line: 'Cold and bright, drunk slowly.' }
  ];
  var WASH_CUES = [
    [0, 'Warm water over your hands. Just feel it for a moment.'],
    [0.3, 'A slow breath in. A slow breath out.'],
    [0.6, 'Another breath. Soap, water, the warmth. Nothing else to do.'],
    [0.85, 'One last breath. Then dry your hands, slowly too.']
  ];

  /* ---------- saved kitchen state ---------- */
  function ensure(k) {
    var out = k && typeof k === 'object' ? k : {};
    out.v = 1;
    if (!Array.isArray(out.meals)) out.meals = [];
    out.meals = out.meals.filter(function (m) { return m && typeof m === 'object' && typeof m.date === 'string' && typeof m.dish === 'string'; });
    return out;
  }
  function uid() { return 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /* ---------- recipes against the basket ---------- */
  function byStation(station) { return RECIPES.filter(function (r) { return r.station === station; }); }
  function recipe(id) { return RECIPES.filter(function (r) { return r.id === id; })[0] || null; }
  /* the sets of ingredients that would make a recipe: one exact set, or one small set per fish or crop. ids is
   * { crops: [...], fish: [...] } from the farm and world modules */
  function options(r, ids) {
    var list = r.anyFish ? ids.fish : r.anyCrop ? ids.crops : null;
    if (!list) return r.needs ? [Object.assign({}, r.needs)] : [];
    return list.map(function (k) { var o = Object.assign({}, r.needs || {}); o[k] = (o[k] || 0) + 1; return o; }); /* any one fish (or crop), plus what else it needs */
  }
  function covers(basket, set) { return Object.keys(set).every(function (k) { return (basket[k] || 0) >= set[k]; }); }
  /* the first ingredient set the basket covers, or null when short */
  function pick(r, basket, ids) {
    var sets = options(r, ids);
    for (var i = 0; i < sets.length; i++) if (covers(basket, sets[i])) return sets[i];
    return null;
  }
  function canMake(r, basket, ids) { return !!pick(r, basket, ids); }
  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }
  /* what a recipe wants, in words: "2 turnips", "2 carrots and 1 egg", "a fish of any size", "any one crop" */
  function needText(r, ids, nameOf) {
    var extra = r.needs ? Object.keys(r.needs).map(function (k) { return plural(r.needs[k], String(nameOf(k) || k).toLowerCase()); }).join(' and ') : '';
    if (r.anyFish) return 'a fish of any size' + (extra ? ' and ' + extra : '');
    if (r.anyCrop) return 'any one crop' + (extra ? ' and ' + extra : '');
    return Object.keys(r.needs).map(function (k) { return plural(r.needs[k], String(nameOf(k) || k).toLowerCase()); }).join(' and ');
  }
  /* what was used, in words: "2 turnips" */
  function usedText(set, nameOf) { return Object.keys(set).map(function (k) { return plural(set[k], String(nameOf(k) || k).toLowerCase()); }).join(' and '); }
  /* the dish's name once an ingredient is chosen: a smoothie takes its crop's name */
  function dishName(r, set, nameOf) {
    if (r.anyCrop && set) { var k = Object.keys(set)[0]; return String(nameOf(k) || k) + ' smoothie'; }
    return r.name;
  }
  /* the station's menu: every recipe of the station, whether the basket covers it, what it wants or will use */
  function menu(station, basket, ids, nameOf) {
    return byStation(station).map(function (r) {
      var set = pick(r, basket, ids);
      return { id: r.id, recipe: r, can: !!set, uses: set, name: dishName(r, set, nameOf), need: needText(r, ids, nameOf), used: set ? usedText(set, nameOf) : '' };
    });
  }
  /* how many dishes a basket could make right now, across every station */
  function makeable(basket, ids) { return RECIPES.filter(function (r) { return canMake(r, basket, ids); }).length; }

  /* ---------- using the basket ---------- */
  /* takes an ingredient set out of the basket; refuses (basket untouched, returns null) when anything is short */
  function consume(basket, set) {
    if (!set || !covers(basket, set)) return null;
    Object.keys(set).forEach(function (k) { basket[k] -= set[k]; if (basket[k] <= 0) delete basket[k]; });
    return Object.assign({}, set);
  }
  /* cooks: the ingredients leave the basket and a meal is remembered. null when the basket is short */
  function make(k, basket, r, date, ids, nameOf, at) {
    var set = pick(r, basket, ids); if (!set) return null;
    var used = consume(basket, set);
    var meal = { id: uid(), date: date, dish: r.id, name: dishName(r, set, nameOf), station: r.station, used: used, at: at || null };
    k.meals.push(meal);
    return meal;
  }
  function mealsOn(k, date) { return k.meals.filter(function (m) { return m.date === date; }); }
  /* ---------- eating: a cooked dish waits, ready to eat, until she eats it slowly at the table ---------- */
  function ready(k) { return ensure(k).meals.filter(function (m) { return !m.eaten; }); } /* oldest first */
  function eat(k, at) { var m = ready(k)[0]; if (!m) return null; m.eaten = true; m.eatenAt = at || null; return m; }

  /* ---------- the timer: counts only running, visible time (same rule as the course) ---------- */
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
  function clockText(t) { var l = leftSec(t); return Math.floor(l / 60) + ':' + String(l % 60).padStart(2, '0') + ' left' + (t.paused ? ', paused' : ''); }
  function cueAt(cues, t) {
    var f = t.planned ? t.activeMs / 1000 / t.planned : 0, i = 0;
    cues.forEach(function (c, k) { if (c[0] <= f) i = k; });
    return i;
  }

  /* ---------- the basin: a mindful pause, saved like a practice ---------- */
  function washRecord(t, date, startIso, endIso) {
    return {
      type: 'mindfulness', date: date, practice: 'handwash', anchor: 'touch', scriptVersion: VERSION,
      plannedSec: t.planned, activeSec: activeSec(t), status: finished(t) ? 'finished' : 'partial',
      start: startIso, end: endIso, source: 'kitchen', where: 'kitchen'
    };
  }
  /* a stopped wash shorter than this is not saved at all; she just dried her hands */
  function worthSaving(t) { return t.ended && activeSec(t) >= 5; }

  root.EbbKitchenRules = {
    VERSION: VERSION, MAX_STEP_MS: MAX_STEP_MS, WASH_SECS: WASH_SECS, STATIONS: STATIONS, RECIPES: RECIPES, WASH_CUES: WASH_CUES,
    ensure: ensure, byStation: byStation, recipe: recipe, options: options, covers: covers, pick: pick, canMake: canMake, needText: needText,
    usedText: usedText, dishName: dishName, menu: menu, makeable: makeable, consume: consume, make: make, mealsOn: mealsOn, ready: ready, eat: eat,
    timer: timer, counting: counting, advance: advance, pause: pause, resume: resume, setHidden: setHidden, end: end, activeSec: activeSec,
    leftSec: leftSec, finished: finished, clockText: clockText, cueAt: cueAt, washRecord: washRecord, worthSaving: worthSaving
  };
})(typeof window !== 'undefined' ? window : globalThis);
