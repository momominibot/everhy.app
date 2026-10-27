/* Node checks for the world extension: the hot spring egg, fishing
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
const NEW = ['spring'], TOUCHED = ['farm', 'waterfall', 'spring', 'jetty'];
NEW.forEach(id => check(`${id} registered`, !!W.SCENES[id]));
check('waterfall has a door to the hot spring', W.SCENES.waterfall.doors.some(d => d.to === 'spring'));
check('hot spring has a door to the waterfall', W.SCENES.spring.doors.some(d => d.to === 'waterfall'));
check('fishing spot on the jetty', W.SCENES.jetty.spots.some(s => s.kind === 'fish'));
check('engine spot order kept (pond first)', W.SCENES.waterfall.spots[0].id === 'pond');
check('register refuses a second spring', W.register('spring', { floor: [] }) === false);

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
      const p = W.plan(id, e.pt, W.bedStand(b));
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
/* round trip: waterfall -> spring -> waterfall lands where a walk can continue */
[['waterfall', 'spring']].forEach(([a, b]) => {
  const there = W.SCENES[a].doors.find(d => d.to === b), back = W.SCENES[b].doors.find(d => d.to === a);
  check(`${a} -> ${b} -> ${a}: back door reachable from arrival`, !!W.plan(b, there.arrive, { x: (back.rect[0] + back.rect[2]) / 2, y: (back.rect[1] + back.rect[3]) / 2 }));
  check(`${a} -> ${b} -> ${a}: onward door reachable from return`, !!W.plan(a, back.arrive, { x: (there.rect[0] + there.rect[2]) / 2, y: (there.rect[1] + there.rect[3]) / 2 }));
});

/* ---------- basket and the hot spring egg ---------- */
(() => {
  const f = F.fresh(1);
  check('no egg, nothing boils', R.boilEgg(f) === false && !f.basket.spaEgg);
  R.addToBasket(f, 'egg', 2);
  check('an egg becomes a spa-boiled egg', R.boilEgg(f) && f.basket.egg === 1 && f.basket.spaEgg === 1);
  check('world items never become seeds', Object.keys(F.CROPS).every(k => !R.ITEMS[k]));
  check('the pond can take a world item', (() => { R.addToBasket(f, 'fishSmall', 3); return F.takeFromBasket(f) === 'fishSmall'; })());
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

  /* the catch bar: stop the marker in the middle zone */
  check('outside the zone it got away', [0, 0.1, 0.36, 0.64, 0.9, 1].every(p => R.catchAt(p, 0.5).result === 'away'));
  check('inside the zone it lands a fish', [0.37, 0.45, 0.5, 0.55, 0.63].every(p => R.catchAt(p, 0.9).result === 'caught'));
  check('a catch is small, medium or large', [0.37, 0.5, 0.63].every(p => R.SIZES.indexOf(R.catchAt(p, 0.4).size) >= 0));
  check('dead centre, low roll: a large fish', R.catchAt(0.5, 0.01).size === 'fishLarge');
  check('high roll: a small fish', R.catchAt(0.5, 0.99).size === 'fishSmall');
  check('closeness is 1 at the centre and 0 at the edge', R.catchAt(0.5, 0.5).closeness === 1 && R.catchAt(0.37, 0.5).closeness === 0);
  const winShare = (p, size) => { let n = 0; for (let i = 0; i < 1000; i++) if (R.catchAt(p, i / 1000).size === size) n++; return n / 1000; };
  check('the middle gives bigger fish more often', winShare(0.5, 'fishLarge') > winShare(0.38, 'fishLarge'));
})();

process.on('beforeExit', () => { console.log(`${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0; });
