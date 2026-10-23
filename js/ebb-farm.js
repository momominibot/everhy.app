/* Ebb farm rules, pure. A bed goes grass -> tilled -> planted -> ripe -> (harvest) -> tilled. A planted bed grows one
 * stage for each real day it was watered before today, so water shows the next morning; a dry day simply adds nothing,
 * and nothing ever wilts, dies or is taken away. Seeds come free from the shed, three a day. Days are 'YYYY-MM-DD'
 * strings passed in by the caller, so tests can move the calendar. */
(function (root) {
  'use strict';

  var CROPS = {
    turnip: { name: 'Turnip', days: 2, colour: '#f3e6ef', leaf: '#7fae7a' },
    carrot: { name: 'Carrot', days: 3, colour: '#f08a4b', leaf: '#6f9f63' },
    sunflower: { name: 'Sunflower', days: 4, colour: '#f2c14e', leaf: '#5f8f5a' }
  };
  var SEEDS_PER_DAY = 3;

  function fresh(n) {
    var beds = [];
    for (var i = 0; i < n; i++) beds.push({ state: 'grass', crop: null, watered: [] });
    return { beds: beds, seedDay: null, seedsLeft: 0, basket: {}, seeds: {} };
  }

  function grown(bed, today) { /* stages earned: distinct watered days before today */
    if (bed.state !== 'planted') return 0;
    var seen = {};
    bed.watered.forEach(function (d) { if (d < today) seen[d] = true; });
    return Object.keys(seen).length;
  }
  function stage(bed, today) { /* 0 seed, 1 sprout, 2 young, 3 grown, 'ripe' */
    if (bed.state !== 'planted') return null;
    var c = CROPS[bed.crop], n = grown(bed, today);
    if (n >= c.days) return 'ripe';
    return Math.min(3, Math.floor(n / c.days * 3));
  }
  function wateredToday(bed, today) { return bed.watered.indexOf(today) >= 0; }

  /* what a tap on the bed would do now */
  function nextAction(farm, i, today) {
    var b = farm.beds[i];
    if (!b) return null;
    if (b.state === 'grass') return 'hoe';
    if (b.state === 'tilled') return Object.keys(farm.seeds).some(function (k) { return farm.seeds[k] > 0; }) ? 'plant' : 'needSeeds';
    if (stage(b, today) === 'ripe') return 'harvest';
    return wateredToday(b, today) ? 'done' : 'water';
  }

  function takeSeeds(farm, today) { /* free seeds: up to three a day, one of each crop in turn */
    if (farm.seedDay !== today) { farm.seedDay = today; farm.seedsLeft = SEEDS_PER_DAY; }
    if (farm.seedsLeft <= 0) return null;
    var kinds = Object.keys(CROPS), given = kinds[(SEEDS_PER_DAY - farm.seedsLeft) % kinds.length];
    farm.seedsLeft -= 1;
    farm.seeds[given] = (farm.seeds[given] || 0) + 1;
    return given;
  }

  function act(farm, i, today) { /* applies the next action; returns what happened */
    var b = farm.beds[i], a = nextAction(farm, i, today);
    if (a === 'hoe') { b.state = 'tilled'; }
    else if (a === 'plant') {
      var kind = Object.keys(CROPS).filter(function (k) { return farm.seeds[k] > 0; })[0];
      farm.seeds[kind] -= 1; b.state = 'planted'; b.crop = kind; b.watered = [];
      return { action: a, crop: kind };
    }
    else if (a === 'water') { b.watered.push(today); }
    else if (a === 'harvest') {
      var crop = b.crop;
      farm.basket[crop] = (farm.basket[crop] || 0) + 1;
      b.state = 'tilled'; b.crop = null; b.watered = [];
      return { action: a, crop: crop };
    }
    return { action: a, crop: b.crop };
  }

  function takeFromBasket(farm) { /* one item for an offering, most plentiful first */
    var k = Object.keys(farm.basket).filter(function (c) { return farm.basket[c] > 0; })
      .sort(function (x, y) { return farm.basket[y] - farm.basket[x]; })[0];
    if (!k) return null;
    farm.basket[k] -= 1;
    return k;
  }

  /* an older save may hold more beds than the painted farm shows (or fewer): anything tilled or growing in a bed that is
   * gone moves to the first bed still grass, crop and watered days intact; missing beds are grass. True when changed */
  function fitBeds(farm, n) {
    if (!farm || !Array.isArray(farm.beds) || !(n > 0)) return false;
    var beds = farm.beds, changed = false;
    for (var i = n; i < beds.length; i++) {
      var b = beds[i]; if (!b || b.state === 'grass') continue;
      for (var j = 0; j < n; j++) if (!beds[j] || beds[j].state === 'grass') { beds[j] = b; break; }
    }
    if (beds.length > n) { beds.length = n; changed = true; }
    for (var k = 0; k < n; k++) if (!beds[k]) { beds[k] = { state: 'grass', crop: null, watered: [] }; changed = true; }
    return changed;
  }

  root.EbbFarm = { CROPS: CROPS, SEEDS_PER_DAY: SEEDS_PER_DAY, fresh: fresh, fitBeds: fitBeds, stage: stage, grown: grown,
    nextAction: nextAction, act: act, takeSeeds: takeSeeds, takeFromBasket: takeFromBasket, wateredToday: wateredToday };
})(typeof window !== 'undefined' ? window : globalThis);
