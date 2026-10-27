/* Ebb world rules, pure: the hot spring egg and fishing. Days are 'YYYY-MM-DD' strings passed in by the
 * caller and randomness is passed in as a number, so the node harness can move the calendar and fix every roll.
 * Nothing here gets sick, hungry, sad or dies. A skipped day adds nothing and takes nothing away. */
(function (root) {
  'use strict';

  /* ---------- basket: the farm's basket holds crops, eggs and fish alike ---------- */
  var ITEMS = {
    egg: { name: 'Egg' }, spaEgg: { name: 'Spa-boiled egg' },
    fishSmall: { name: 'Small fish' }, fishMedium: { name: 'Medium fish' }, fishLarge: { name: 'Large fish' },
    rice: { name: 'Rice' }, ginger: { name: 'Ginger' }, chilli: { name: 'Chilli' } /* the provision shop's pantry (js/ext/grocer.js) */
  };
  function addToBasket(farm, key, n) { farm.basket[key] = (farm.basket[key] || 0) + (n || 1); return farm.basket[key]; }

  /* ---------- hot spring: an egg dropped in the warm water comes out spa-boiled ---------- */
  function boilEgg(farm) {
    if (!farm.basket.egg) return false;
    farm.basket.egg -= 1; addToBasket(farm, 'spaEgg'); return true;
  }

  /* ---------- fishing: a cast, a nibble, then the catch game ----------
   * A cast waits waitMs for a nibble. When it bites, the catch bar opens: a marker runs back and forth and she stops it
   * (catchAt). Inside the centered zone it lands a fish; the closer to the middle, the better the chance of a bigger
   * one. Stopping outside the zone, or leaving it too long, and it simply got away. reel is the plain timing window
   * used by the node harness and any older call sites. */
  var SIZES = ['fishSmall', 'fishMedium', 'fishLarge'];
  var ZONE_HALF = 0.13; /* the catch zone is the middle 26% of the bar, from 0.37 to 0.63 */
  function cast(r1, r2) { return { waitMs: Math.round(1800 + r1 * 3200), windowMs: Math.round(1300 + r2 * 400) }; }
  function sizeFor(closeness, roll) { /* closeness 0 at the zone edge, 1 dead centre; returns a fish size key */
    var large = 0.06 + 0.22 * closeness, medium = 0.3 + 0.1 * closeness;
    return roll < large ? 'fishLarge' : roll < large + medium ? 'fishMedium' : 'fishSmall';
  }
  function catchAt(pos, roll) { /* pos is the stopped marker, 0..1 across the bar */
    var dist = Math.abs(pos - 0.5);
    if (dist > ZONE_HALF) return { result: 'away', closeness: 0 };
    var closeness = 1 - dist / ZONE_HALF; /* 0 at the edge, 1 dead centre */
    return { result: 'caught', size: sizeFor(closeness, roll), closeness: closeness };
  }
  function reel(c, tapMs, roll) {
    if (tapMs < c.waitMs) return { result: 'early' };
    if (tapMs > c.waitMs + c.windowMs) return { result: 'away' };
    var mid = c.waitMs + c.windowMs / 2, closeness = 1 - Math.abs(tapMs - mid) / (c.windowMs / 2); /* 0 at the edges, 1 dead centre */
    return { result: 'caught', size: sizeFor(closeness, roll), closeness: closeness };
  }

  root.EbbWorldRules = { ITEMS: ITEMS, SIZES: SIZES, ZONE_HALF: ZONE_HALF, addToBasket: addToBasket, boilEgg: boilEgg, cast: cast, sizeFor: sizeFor, catchAt: catchAt, reel: reel };
})(typeof window !== 'undefined' ? window : globalThis);
