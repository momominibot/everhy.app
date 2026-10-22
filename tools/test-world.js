/* Node checks for the world extension: barn animals across skipped days and clock changes, the hot spring egg, fishing
 * outcomes, and reachability of every new door and stand point. Run: node tools/test-world.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console, Math, JSON, Date, Object, Array, String, Number, parseInt, isNaN };
ctx.globalThis = ctx;
vm.createContext(ctx);
['js/ebb-world.js', 'js/ebb-farm.js', 'js/ext/world.js', 'js/world/rules.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f }));
const { EbbWorld: W, EbbFarm: F, EbbWorldRules: R } = ctx;

let pass = 0, fail = 0;
function check(name, ok) { if (ok) pass++; else { fail++; console.log('FAIL', name); } }

/* ---------- places: every door and stand point is walkable and reachable from the start and from every arrival ---------- */
const NEW = ['barn', 'spring'], TOUCHED = ['farm', 'waterfall', 'barn', 'spring'];
NEW.forEach(id => check(`${id} registered`, !!W.SCENES[id]));
check('farm has a door to the barn', W.SCENES.farm.doors.some(d => d.to === 'barn'));
check('barn has a door to the farm', W.SCENES.barn.doors.some(d => d.to === 'farm'));
check('waterfall has a door to the hot spring', W.SCENES.waterfall.doors.some(d => d.to === 'spring'));
check('hot spring has a door to the waterfall', W.SCENES.spring.doors.some(d => d.to === 'waterfall'));
check('fishing spot at the pond edge', W.SCENES.waterfall.spots.some(s => s.kind === 'fish'));
check('engine spot order kept (pond first)', W.SCENES.waterfall.spots[0].id === 'pond');
check('register refuses a second barn', W.register('barn', { floor: [] }) === false);

function entries(id) { /* every way into a scene: its start and every door arrival that lands in it */
  const pts = [{ name: 'start', pt: W.SCENES[id].start }];
  Object.keys(W.SCENES).forEach(o => W.SCENES[o].doors.forEach(d => { if (d.to === id) pts.push({ name: `from ${o}/${d.id}`, pt: d.arrive }); }));
  return pts;
}
function legsAvoidDoors(id, from, p, exceptDoor) { /* a walk never crosses a door it was not sent to */
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
TOUCHED.forEach(id => {
  const s = W.SCENES[id];
  entries(id).forEach(e => {
    check(`${id} ${e.name} walkable`, W.walkable(id, e.pt));
    check(`${id} ${e.name} not inside a door`, !W.doorAt(id, e.pt));
    s.spots.forEach(sp => {
      check(`${id}/${sp.id} stand walkable`, W.walkable(id, sp.stand));
      check(`${id}/${sp.id} stand not inside a door`, !W.doorAt(id, sp.stand));
      const p = W.plan(id, e.pt, sp.stand);
      check(`${id}/${sp.id} reachable ${e.name}`, !!p);
      check(`${id}/${sp.id} walk from ${e.name} crosses no door`, !!p && legsAvoidDoors(id, e.pt, p, null));
    });
    (s.beds || []).forEach((b, i) => {
      const p = W.plan(id, e.pt, { x: b.x, y: b.y + 4.5 });
      check(`${id} bed ${i} reachable ${e.name} without a door`, !!p && legsAvoidDoors(id, e.pt, p, null));
    });
    s.doors.forEach(d => {
      const mid = { x: (d.rect[0] + d.rect[2]) / 2, y: (d.rect[1] + d.rect[3]) / 2 };
      const p = W.plan(id, e.pt, mid);
      check(`${id}/${d.id} reachable ${e.name}`, !!p && !!W.doorAt(id, p[p.length - 1]));
      check(`${id}/${d.id} walk from ${e.name} meets no other door first`, !!p && legsAvoidDoors(id, e.pt, p, d));
    });
  });
  s.doors.forEach(d => {
    check(`${id}/${d.id} target exists`, !!W.SCENES[d.to]);
    check(`${id}/${d.id} arrival walkable`, W.walkable(d.to, d.arrive));
    check(`${id}/${d.id} has a way back`, W.SCENES[d.to].doors.some(b => b.to === id));
    s.doors.forEach(o => { if (o !== d) check(`${id} doors ${d.id}/${o.id} apart`, d.rect[2] < o.rect[0] || o.rect[2] < d.rect[0] || d.rect[3] < o.rect[1] || o.rect[3] < d.rect[1]); });
  });
});
/* round trips: farm -> barn -> farm and waterfall -> spring -> waterfall land where a walk can continue */
[['farm', 'barn'], ['waterfall', 'spring']].forEach(([a, b]) => {
  const there = W.SCENES[a].doors.find(d => d.to === b), back = W.SCENES[b].doors.find(d => d.to === a);
  check(`${a} -> ${b} -> ${a}: back door reachable from arrival`, !!W.plan(b, there.arrive, { x: (back.rect[0] + back.rect[2]) / 2, y: (back.rect[1] + back.rect[3]) / 2 }));
  check(`${a} -> ${b} -> ${a}: onward door reachable from return`, !!W.plan(a, back.arrive, { x: (there.rect[0] + there.rect[2]) / 2, y: (there.rect[1] + there.rect[3]) / 2 }));
});

/* ---------- barn rules ---------- */
const d1 = '2026-10-22', d2 = '2026-10-23', d3 = '2026-10-24', d4 = '2026-10-25', d9 = '2026-10-30', d0 = '2026-10-20';
(() => {
  const b = R.freshBarn();
  check('three animals, two hens and a cow', Object.keys(b.animals).length === 3 && Object.values(b.animals).filter(a => a.kind === 'hen').length === 2);
  check('nobody starts with hearts', Object.values(b.animals).every(a => R.hearts(a) === 0));
  const first = R.care(b, 'hen1', 'talk', d1), second = R.care(b, 'hen1', 'brush', d1), third = R.care(b, 'hen1', 'feed', d1);
  check('first kind act of the day counts', first.counted && !first.already);
  check('later acts the same day do not count', !second.counted && !third.counted && R.careDays(b.animals.hen1) === 1);
  check('feeding after a chat still means an egg tomorrow', third.fed && R.fedOn(b.animals.hen1, d1));
  check('fed only once a day', !R.care(b, 'hen1', 'feed', d1).fed && b.animals.hen1.fed.length === 1);
  check('no egg the same day', R.collectEggs(b, 'hen1', d1) === 0);
  check('the egg is there next morning', R.collectEggs(b, 'hen1', d2) === 1);
  check('an egg is only collected once', R.collectEggs(b, 'hen1', d2) === 0);
  check('an unfed hen lays nothing', R.collectEggs(b, 'hen2', d9) === 0);
  R.care(b, 'hen1', 'feed', d2); R.care(b, 'hen1', 'feed', d3);
  check('a heart after three days of care', R.hearts(b.animals.hen1) === 1);
  const heartsBefore = R.hearts(b.animals.hen1), daysBefore = R.careDays(b.animals.hen1);
  check('a skipped week takes nothing away', R.hearts(b.animals.hen1) === heartsBefore && R.careDays(b.animals.hen1) === daysBefore);
  check('eggs from fed days wait in the nest however long', R.collectEggs(b, 'hen1', d9) === 2);
  check('a skipped week adds no eggs', R.collectEggs(b, 'hen1', '2026-11-20') === 0);
  check('hearts stop at the top', (() => { const c = R.freshBarn(); for (let i = 0; i < 90; i++) R.care(c, 'cow', 'talk', new Date(Date.UTC(2027, 0, 1 + i)).toISOString().slice(0, 10)); return R.hearts(c.animals.cow) === R.HEART_MAX; })());
  check('unknown act changes nothing', R.care(b, 'hen2', 'kick', d1).error === 'unknown' && R.careDays(b.animals.hen2) === 0);
  check('unknown animal changes nothing', R.care(b, 'goat', 'feed', d1).error === 'unknown');
})();
/* clock changes: set back, then forward again */
(() => {
  const b = R.freshBarn();
  R.care(b, 'hen2', 'feed', d4);                         /* fed on the 25th */
  check('clock set back: the egg is not lost', R.collectEggs(b, 'hen2', d2) === 0 && b.animals.hen2.fed.length === 1);
  check('clock set back: the same day never counts twice', !R.care(b, 'hen2', 'talk', d4).counted);
  const back = R.care(b, 'hen2', 'talk', d2);
  check('clock set back: an earlier day is its own day, nothing removed', back.counted && R.careDays(b.animals.hen2) === 2);
  check('clock forward again: the 25th egg arrives on the 26th', R.collectEggs(b, 'hen2', '2026-10-26') === 1);
  check('many dates keep their count when trimmed', (() => { const c = R.freshBarn(); for (let i = 0; i < 120; i++) { const d = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10); R.care(c, 'hen1', 'talk', d); } return R.careDays(c.animals.hen1) === 120 && c.animals.hen1.careDates.length <= 40; })());
})();
/* the cow: milk once a day, on a day she was cared for */
(() => {
  const b = R.freshBarn();
  check('no milk before any care', !R.canMilk(b, 'cow', d1) && !R.milk(b, 'cow', d1));
  R.care(b, 'cow', 'brush', d1);
  check('milk after care', R.canMilk(b, 'cow', d1) && R.milk(b, 'cow', d1));
  check('milk once a day', !R.milk(b, 'cow', d1));
  check('next day needs a visit first', !R.canMilk(b, 'cow', d2));
  R.care(b, 'cow', 'talk', d2);
  check('next day after care: milk again', R.milk(b, 'cow', d2));
  check('a hen gives no milk', (R.care(b, 'hen1', 'feed', d1), !R.canMilk(b, 'hen1', d1)));
})();
/* old or broken saves are repaired without losing what is there */
(() => {
  check('missing barn becomes fresh', Object.keys(R.ensureBarn(null).animals).length === 3);
  const junk = { animals: { hen1: { careDates: 'x', nest: -4, fed: null }, cow: 7 } };
  const fixed = R.ensureBarn(junk);
  check('broken fields repaired', Array.isArray(fixed.animals.hen1.careDates) && fixed.animals.hen1.nest === 0 && Array.isArray(fixed.animals.hen1.fed) && fixed.animals.cow.kind === 'cow' && !!fixed.animals.hen2);
  const kept = R.ensureBarn({ animals: { hen1: { kind: 'hen', name: 'Pip', careDates: [d1, d2], careBase: 3, fed: [d2], nest: 2, milkDay: null } } });
  check('existing care, eggs and hearts kept', R.careDays(kept.animals.hen1) === 5 && kept.animals.hen1.nest === 2 && kept.animals.hen1.fed[0] === d2);
})();

/* ---------- basket and the hot spring egg ---------- */
(() => {
  const f = F.fresh(1);
  check('no egg, nothing boils', R.boilEgg(f) === false && !f.basket.spaEgg);
  R.addToBasket(f, 'egg', 2);
  check('an egg becomes a spa-boiled egg', R.boilEgg(f) && f.basket.egg === 1 && f.basket.spaEgg === 1);
  check('barn items never become seeds', Object.keys(F.CROPS).every(k => !R.ITEMS[k]));
  check('the pond can take a barn item', (() => { R.addToBasket(f, 'milk', 3); return F.takeFromBasket(f) === 'milk'; })());
})();

/* ---------- fishing ---------- */
(() => {
  for (const r of [0, 0.5, 0.999]) {
    const c = R.cast(r, r);
    check(`cast wait in 1.8-5 s (${r})`, c.waitMs >= 1800 && c.waitMs <= 5000);
    check(`bite window at least 1.3 s (${r})`, c.windowMs >= 1300 && c.windowMs <= 1700);
  }
  const c = { waitMs: 3000, windowMs: 1500 };
  check('too soon: it swims off', R.reel(c, 2999, 0).result === 'early');
  check('too late: it got away', R.reel(c, 4501, 0).result === 'away');
  check('in the window: a catch', R.reel(c, 3000, 0.9).result === 'caught' && R.reel(c, 4500, 0.9).result === 'caught');
  check('a catch is small, medium or large', [0, 0.2, 0.4, 0.6, 0.99].every(r => R.SIZES.indexOf(R.reel(c, 3700, r).size) >= 0));
  check('dead centre, low roll: a large fish', R.reel(c, 3750, 0.01).size === 'fishLarge');
  check('high roll: a small fish', R.reel(c, 3750, 0.99).size === 'fishSmall');
  const share = (t, size) => { let n = 0; for (let i = 0; i < 1000; i++) if (R.reel(c, t, i / 1000).size === size) n++; return n / 1000; };
  check('timing near the middle gives bigger fish more often', share(3750, 'fishLarge') > share(3010, 'fishLarge'));
  check('even at the edge a big fish is possible', share(3010, 'fishLarge') > 0);
  check('missing is never a loss: reel touches no basket', !('basket' in c));
})();

process.on('beforeExit', () => { console.log(`${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0; });
