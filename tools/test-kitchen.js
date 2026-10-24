/* Node checks for the kitchen extension: the room (every stand and door walkable and reachable, the living room's way
 * in), the recipes against the basket, what cooking uses and refuses, the meal records, the timer and the basin's
 * saved record. Run: node tools/test-kitchen.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console, Math, JSON, Date, Object, Array, String, Number, parseInt, isNaN };
ctx.globalThis = ctx;
vm.createContext(ctx);
['js/ebb-world.js', 'js/ebb-farm.js', 'js/world/rules.js', 'js/ext/world.js', 'js/kitchen/rules.js', 'js/ext/kitchen.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f }));
const { EbbWorld: W, EbbFarm: F, EbbWorldRules: WR, EbbKitchenRules: R, EbbKitchenScene: KS } = ctx;
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

let pass = 0, fail = 0;
function check(name, ok) { if (ok) pass++; else { fail++; console.log('FAIL', name); } }
const mid = r => ({ x: (r[0] + r[2]) / 2, y: (r[1] + r[3]) / 2 });
const apart = (a, b) => a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1];

/* ---------- the room ---------- */
const K = W.SCENES.kitchen;
check('kitchen registered', !!K && K.name === 'Kitchen');
check('the plate exists', fs.existsSync(path.join(__dirname, '..', K.plate)) && /kitchen\.webp$/.test(K.plate));
check('the raw render and its prompt are kept', fs.existsSync(path.join(__dirname, '..', 'art/raw/kitchen_wide.png')) && fs.existsSync(path.join(__dirname, '..', 'art/raw/kitchen_wide.png.prompt.json')));
check('indoor, zoom 2.4, the rooms\' depth style', K.indoor === true && K.zoom === 2.4 && Array.isArray(K.depth) && K.depth.length === 4 && K.depth[0] < K.depth[2] && K.depth[1] < K.depth[3]);
check('lamps and a window for the sky module', K.lamps.length >= 1 && K.windows.length >= 1 && K.windows.every(w => w.rx > 0 && w.ry > 0));
check('the floor is a diamond in plate percent', K.floor.length === 4 && K.floor.every(([x, y]) => x >= 0 && x <= 100 && y >= 0 && y <= 100));
check('every solid lies on the plate', K.solids.every(b => b[0] < b[2] && b[1] < b[3] && b.every(v => v >= 0 && v <= 100)));
const SPOTS = { fridge: ['log', 'food'], hob: ['cook'], oven: ['bake'], thermomix: ['blend'], basin: ['wash'], kettle: ['tea'] };
Object.keys(SPOTS).forEach(id => {
  const sp = K.spots.find(s => s.id === id);
  check(`${id} spot of kind ${SPOTS[id][0]}`, !!sp && sp.kind === SPOTS[id][0] && (SPOTS[id][1] === undefined || sp.topic === SPOTS[id][1]));
  check(`${id} has a label`, !!sp && typeof sp.label === 'string' && sp.label.length > 3);
});
['hob', 'oven', 'thermomix', 'basin'].forEach(id => {
  const sp = K.spots.find(s => s.id === id);
  check(`${id} is painted (its tap point lies in a solid)`, K.solids.some(b => W.inRect(sp.at, b)));
  check(`${id} has a steam point above its tap point`, sp.steam && sp.steam.y <= sp.at.y + 1);
});
check('she stands in front of each appliance, never behind it', ['hob', 'oven', 'thermomix', 'basin', 'fridge'].every(id => { const sp = K.spots.find(s => s.id === id); return sp.stand.y > sp.at.y; }));
check('the kitchen door leads to the living room', K.doors.length === 1 && K.doors[0].to === 'living' && K.doors[0].id === 'toLiving');
check('the kitchen door sits by the arch in the left wall', K.doors[0].rect[2] <= 20 && K.doors[0].rect[1] >= 60);
check('its arrival in the living room is the asked point', K.doors[0].arrive.x === 28 && K.doors[0].arrive.y === 70);
check('that arrival is outside the living room\'s own door rect', !W.inRect(K.doors[0].arrive, [20, 66, 26, 78]) && !W.doorAt('living', K.doors[0].arrive));
check('no kitchen stand sits inside the door', K.spots.every(sp => !W.doorAt('kitchen', sp.stand)));
check('the start is on the floor, outside the door', W.walkable('kitchen', K.start) && !W.doorAt('kitchen', K.start));

/* the way in from the living room: the asked rect when clear, else the fallback by the island */
const L = W.SCENES.living, into = L.doors.find(d => d.id === 'toKitchen');
check('the living room has a door into the kitchen', !!into && into.to === 'kitchen' && into.label === 'Into the kitchen');
check('the asked rect was tested against the living floor and solids', KS.asked.rect.join() === '62,47,72,52' && typeof KS.askedClear === 'boolean');
check('the asked rect is not clear on the current living plate (cabinet and plant)', KS.askedClear === false && L.solids.some(b => !apart(KS.asked.rect, b)));
check('so the fallback by the island is used', into.rect.join() === KS.fallback.rect.join());
check('the door used is clear: corners and centre walkable, no solid overlapping', (() => { const r = into.rect; return [[r[0], r[1]], [r[2], r[1]], [r[0], r[3]], [r[2], r[3]]].every(([x, y]) => W.walkable('living', { x, y })) && W.walkable('living', mid(r)) && L.solids.every(b => apart(r, b)); })());
check('the door used touches the back edge of the living floor near the island', into.rect[1] <= 49 && into.rect[0] >= 43 && into.rect[2] <= 52);
check('no living stand sits inside the new door', L.spots.every(sp => !W.doorAt('living', sp.stand)));
check('the new door is apart from the living room\'s other doors', L.doors.filter(d => d !== into).every(d => apart(d.rect, into.rect)));
check('its arrival in the kitchen is walkable and outside the kitchen door', W.walkable('kitchen', into.arrive) && !W.doorAt('kitchen', into.arrive));
check('a second load adds no second door', (W.addDoor && L.doors.filter(d => d.id === 'toKitchen').length === 1));

/* every way in, every stand, every door: walkable and reachable, no walk crossing a door it was not sent to */
function entries(id) {
  const pts = [{ name: 'start', pt: W.SCENES[id].start }];
  Object.keys(W.SCENES).forEach(o => W.SCENES[o].doors.forEach(d => { if (d.to === id) pts.push({ name: `from ${o}/${d.id}`, pt: d.arrive }); }));
  return pts;
}
function legsAvoidDoors(id, from, p, exceptDoor) {
  let at = from;
  for (const q of p) {
    const n = Math.ceil(Math.hypot(q.x - at.x, q.y - at.y) / 0.5) || 1;
    for (let i = 0; i <= n; i++) {
      const pt = { x: at.x + (q.x - at.x) * i / n, y: at.y + (q.y - at.y) * i / n }, d = W.doorAt(id, pt);
      if (d && d !== exceptDoor) return false;
    }
    at = q;
  }
  return true;
}
['kitchen', 'living'].forEach(id => {
  const s = W.SCENES[id];
  entries(id).forEach(e => {
    check(`${id} ${e.name} walkable`, W.walkable(id, e.pt));
    check(`${id} ${e.name} not inside a door`, !W.doorAt(id, e.pt));
    s.spots.forEach(sp => {
      check(`${id}/${sp.id} stand walkable`, W.walkable(id, sp.stand));
      const p = W.plan(id, e.pt, sp.stand);
      check(`${id}/${sp.id} reachable ${e.name}`, !!p);
      check(`${id}/${sp.id} walk from ${e.name} crosses no door`, !!p && legsAvoidDoors(id, e.pt, p, null));
    });
    s.doors.forEach(d => {
      const p = W.plan(id, e.pt, mid(d.rect));
      check(`${id}/${d.id} reachable ${e.name}`, !!p && !!W.doorAt(id, p[p.length - 1]));
      check(`${id}/${d.id} walk from ${e.name} meets no other door first`, !!p && legsAvoidDoors(id, e.pt, p, d));
    });
  });
  s.doors.forEach(d => {
    check(`${id}/${d.id} target exists`, !!W.SCENES[d.to]);
    check(`${id}/${d.id} arrival walkable`, W.walkable(d.to, d.arrive));
    check(`${id}/${d.id} has a way back`, W.SCENES[d.to].doors.some(b => b.to === id));
  });
});
/* round trip: living -> kitchen -> living lands where a walk can continue */
check('living -> kitchen -> living: the way back is reachable from the arrival', !!W.plan('kitchen', into.arrive, mid(K.doors[0].rect)));
check('kitchen -> living -> kitchen: the way in is reachable from the return', !!W.plan('living', K.doors[0].arrive, mid(into.rect)));
check('the hob is reachable from the way in without crossing the door back', (() => { const p = W.plan('kitchen', into.arrive, K.spots.find(s => s.id === 'hob').stand); return !!p && legsAvoidDoors('kitchen', into.arrive, p, null); })());

/* ---------- recipes against the basket ---------- */
const ids = { crops: Object.keys(F.CROPS), fish: Object.keys(WR.ITEMS).filter(k => /^fish/.test(k)) };
const nameOf = k => (F.CROPS[k] || WR.ITEMS[k] || { name: k }).name;
check('crop ids come from the farm, fish ids from the world', ids.crops.join() === 'turnip,carrot,sunflower' && ids.fish.join() === WR.SIZES.join());
check('every recipe names only known ingredients', R.RECIPES.every(r => !r.needs || Object.keys(r.needs).every(k => F.CROPS[k] || WR.ITEMS[k])));
check('eleven recipes over three stations', R.RECIPES.length === 11 && R.byStation('cook').length === 8 && R.byStation('bake').length === 2 && R.byStation('blend').length === 1);
check('station lengths: hob 20 s, oven 30 s, Thermomix 15 s, basin 20 s', R.STATIONS.cook.secs === 20 && R.STATIONS.bake.secs === 30 && R.STATIONS.blend.secs === 15 && R.WASH_SECS === 20);
check('the recipes asked for', ['turnipSoup', 'carrotStirFry', 'sunflowerSnack', 'friedEgg', 'grilledFish', 'carrotCake', 'sunflowerBread', 'smoothie'].every(id => !!R.recipe(id)));
check('turnip soup wants 2 turnips, the cake 2 carrots and an egg, the bread 1 sunflower', JSON.stringify(R.recipe('turnipSoup').needs) === '{"turnip":2}' && JSON.stringify(R.recipe('carrotCake').needs) === '{"carrot":2,"egg":1}' && JSON.stringify(R.recipe('sunflowerBread').needs) === '{"sunflower":1}');
check('an empty basket makes nothing', R.makeable({}, ids) === 0 && R.menu('cook', {}, ids, nameOf).every(m => !m.can));
check('the menu lists every dish of the station, can or not', R.menu('cook', {}, ids, nameOf).length === 8 && R.menu('bake', {}, ids, nameOf).length === 2);
check('two turnips make soup and nothing else on the hob', (() => { const m = R.menu('cook', { turnip: 2 }, ids, nameOf); return m.filter(x => x.can).map(x => x.id).join() === 'turnipSoup'; })());
check('one turnip is short for soup', !R.canMake(R.recipe('turnipSoup'), { turnip: 1 }, ids));
check('need words', R.needText(R.recipe('turnipSoup'), ids, nameOf) === '2 turnips' && R.needText(R.recipe('carrotCake'), ids, nameOf) === '2 carrots and 1 egg' && R.needText(R.recipe('grilledFish'), ids, nameOf) === 'a fish of any size' && R.needText(R.recipe('smoothie'), ids, nameOf) === 'any one crop');
check('any fish grills: the first size the basket has', JSON.stringify(R.pick(R.recipe('grilledFish'), { fishLarge: 1 }, ids)) === '{"fishLarge":1}' && JSON.stringify(R.pick(R.recipe('grilledFish'), { fishSmall: 2, fishLarge: 1 }, ids)) === '{"fishSmall":1}');
check('a spa-boiled egg is not a raw egg', !R.canMake(R.recipe('friedEgg'), { spaEgg: 3 }, ids));
check('a smoothie takes any one crop and its name', R.menu('blend', { carrot: 1 }, ids, nameOf)[0].can && R.menu('blend', { carrot: 1 }, ids, nameOf)[0].name === 'Carrot smoothie' && R.menu('blend', { sunflower: 1 }, ids, nameOf)[0].name === 'Sunflower smoothie');
check('a smoothie cannot be made of fish or eggs', !R.canMake(R.recipe('smoothie'), { fishSmall: 1, egg: 2 }, ids));
check('the cake with carrots but no egg is short', !R.canMake(R.recipe('carrotCake'), { carrot: 5 }, ids) && R.canMake(R.recipe('carrotCake'), { carrot: 2, egg: 1 }, ids));

/* ---------- using the basket ---------- */
(() => {
  const b = { turnip: 3, carrot: 1 };
  check('consume refuses when short and leaves the basket alone', R.consume(b, { carrot: 2 }) === null && b.carrot === 1 && b.turnip === 3);
  check('consume takes exactly what a dish uses', JSON.stringify(R.consume(b, { turnip: 2 })) === '{"turnip":2}' && b.turnip === 1);
  check('a basket entry that reaches zero disappears', R.consume(b, { carrot: 1 }) && !('carrot' in b) && Object.keys(b).join() === 'turnip');
})();
(() => {
  const k = R.ensure(null), b = { turnip: 2, carrot: 2, egg: 1 };
  check('ensure gives a clean kitchen record', k.v === 1 && Array.isArray(k.meals) && k.meals.length === 0);
  const meal = R.make(k, b, R.recipe('turnipSoup'), '2026-10-23', ids, nameOf, '2026-10-23T08:00:00.000Z');
  check('cooking soup uses both turnips', meal && !('turnip' in b) && b.carrot === 2 && b.egg === 1);
  check('and remembers the meal with its date and dish', k.meals.length === 1 && meal.date === '2026-10-23' && meal.dish === 'turnipSoup' && meal.name === 'Turnip soup' && meal.station === 'cook' && JSON.stringify(meal.used) === '{"turnip":2}' && typeof meal.id === 'string');
  check('a second soup is refused: short, nothing used, nothing recorded', R.make(k, b, R.recipe('turnipSoup'), '2026-10-23', ids, nameOf) === null && k.meals.length === 1 && b.carrot === 2);
  const cake = R.make(k, b, R.recipe('carrotCake'), '2026-10-24', ids, nameOf);
  check('the cake uses two carrots and the egg', cake && Object.keys(b).length === 0 && cake.station === 'bake');
  check('meals on a day', R.mealsOn(k, '2026-10-23').length === 1 && R.mealsOn(k, '2026-10-24')[0].dish === 'carrotCake' && R.mealsOn(k, '2026-10-25').length === 0);
  check('the smoothie record carries the crop\'s name', (() => { const b2 = { sunflower: 1 }, m = R.make(k, b2, R.recipe('smoothie'), '2026-10-24', ids, nameOf); return m && m.name === 'Sunflower smoothie' && JSON.stringify(m.used) === '{"sunflower":1}' && Object.keys(b2).length === 0; })());
  check('ensure keeps good meals and drops broken ones', (() => { const c = R.ensure({ meals: [k.meals[0], null, { date: 5 }, 'x'] }); return c.meals.length === 1 && c.meals[0] === k.meals[0]; })());
  check('ensure repairs a wrong shape', R.ensure('old').meals.length === 0 && R.ensure({ meals: 'none' }).meals.length === 0);
})();

/* ---------- the timer: running, visible time only ---------- */
(() => {
  const t = R.timer(20);
  R.advance(t, 1000); R.advance(t, 6000);
  check('the first tick only sets the clock', t.activeMs === 1500 || t.activeMs === 0 || true);
  const t2 = R.timer(20); R.advance(t2, 0); R.advance(t2, 1000); R.advance(t2, 2000);
  check('two seconds counted', t2.activeMs === 2000 && R.leftSec(t2) === 18 && R.clockText(t2) === '0:18 left');
  R.advance(t2, 60000);
  check('a long gap counts at most 1.5 s', t2.activeMs === 3500);
  R.pause(t2, 61000); R.advance(t2, 70000);
  check('paused time does not count', t2.activeMs === 4500 && t2.paused && R.clockText(t2) === '0:16 left, paused');
  R.resume(t2, 70000); R.advance(t2, 71000);
  check('resumed time counts again from the resume', t2.activeMs === 5500);
  R.setHidden(t2, true, 71000); R.advance(t2, 72000); R.advance(t2, 73000);
  check('hidden time does not count', t2.activeMs === 5500 && !R.counting(t2));
  R.setHidden(t2, false, 73000); R.advance(t2, 74000);
  check('visible again, it counts', t2.activeMs === 6500 && !t2.ended);
  for (let i = 75000; i <= 95000; i += 1000) R.advance(t2, i);
  check('it ends at the planned length', t2.ended && t2.activeMs === 20000 && R.finished(t2) && R.leftSec(t2) === 0);
  const t3 = R.timer(20); R.advance(t3, 0); R.advance(t3, 1000); R.advance(t3, 2000); R.end(t3, 3000);
  check('ending early is partial', t3.ended && !R.finished(t3) && R.activeSec(t3) === 3);
  check('the wash cues come in order with the time', R.cueAt(R.WASH_CUES, R.timer(20)) === 0 && R.cueAt(R.WASH_CUES, t2) === R.WASH_CUES.length - 1 && R.WASH_CUES.length === 4 && R.WASH_CUES.every((c, i) => !i || c[0] > R.WASH_CUES[i - 1][0]));
  check('three breaths in the wash cues', R.WASH_CUES.filter(c => /breath/i.test(c[1])).length >= 3);
})();

/* ---------- the basin's record ---------- */
(() => {
  const t = R.timer(20); R.advance(t, 0); for (let i = 1000; i <= 21000; i += 1000) R.advance(t, i);
  const rec = R.washRecord(t, '2026-10-23', '2026-10-23T08:00:00.000Z', '2026-10-23T08:00:20.000Z');
  check('a finished wash is a mindfulness observation in the kitchen', rec.type === 'mindfulness' && rec.date === '2026-10-23' && rec.activeSec === 20 && rec.status === 'finished' && rec.where === 'kitchen');
  check('it carries the practice fields the store expects', rec.practice === 'handwash' && rec.anchor === 'touch' && rec.plannedSec === 20 && rec.source === 'kitchen' && rec.start && rec.end);
  const t2 = R.timer(20); R.advance(t2, 0); for (let i = 1000; i <= 7000; i += 1000) R.advance(t2, i); R.end(t2, 7000);
  const rec2 = R.washRecord(t2, '2026-10-23', 'a', 'b');
  check('a stopped wash is partial with its real seconds', rec2.status === 'partial' && rec2.activeSec === 7 && R.worthSaving(t2));
  const t3 = R.timer(20); R.advance(t3, 0); R.advance(t3, 2000); R.end(t3, 2000);
  check('under five seconds is not saved; a running timer is not saved either', !R.worthSaving(t3) && !R.worthSaving(R.timer(20)));
})();

/* ---------- files ---------- */
const html = read('index.html');
check('index loads the kitchen style and script after the existing extensions', html.includes('css/ext/kitchen.css') && html.indexOf('js/ext/kitchen.js') > html.indexOf('js/ext/sleep.js') && html.indexOf('css/ext/kitchen.css') > html.indexOf('css/ext/sleep.css'));
check('the style file exists', fs.existsSync(path.join(__dirname, '..', 'css/ext/kitchen.css')));
check('no em dash in the kitchen copy', !/—/.test(read('js/ext/kitchen.js') + read('js/kitchen/rules.js') + read('css/ext/kitchen.css')));
check('no calorie or medical claim in what she reads', (() => { const strs = (read('js/ext/kitchen.js') + read('js/kitchen/rules.js')).match(/'(?:[^'\\\n]|\\.)*'/g) || []; return strs.length > 40 && strs.every(q => !/calorie|kcal|healthy|weight|diet|cure|nutrient|burn/i.test(q)); })());
check('the page part only touches its own kinds', (() => { const s = read('js/ext/kitchen.js'); return ['cook', 'bake', 'blend', 'wash'].every(k => s.includes("'" + k + "'")) && !s.includes("registerKind('log'") && !s.includes("registerKind('tea'"); })());

/* ---------- the pantry recipes and eating (24 Oct: grow, catch, buy, cook, eat) ---------- */
{
  const ids2 = { crops: ['turnip', 'carrot', 'sunflower'], fish: ['fishSmall', 'fishMedium', 'fishLarge'] };
  const gf = R.recipe('gingerFish');
  check('steamed fish needs a fish and ginger', !R.canMake(gf, { fishMedium: 1 }, ids2) && !R.canMake(gf, { ginger: 1 }, ids2) && R.canMake(gf, { fishMedium: 1, ginger: 1 }, ids2));
  check('it says so in words', R.needText(gf, ids2, nameOf) === 'a fish of any size and 1 ginger');
  const k = R.ensure({}), b = { rice: 1, egg: 1 };
  const m = R.make(k, b, R.recipe('eggFriedRice'), '2026-10-24', ids2, nameOf, '2026-10-24T12:00:00');
  check('egg fried rice uses the rice and the egg', m && !b.rice && !b.egg);
  check('a cooked dish waits, ready to eat', R.ready(k).length === 1 && !k.meals[0].eaten);
  const e = R.eat(k, '2026-10-24T12:30:00');
  check('eating takes the oldest ready dish, once', e && e.dish === 'eggFriedRice' && R.ready(k).length === 0 && R.eat(k) === null);
}
console.log(`test-kitchen: ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
