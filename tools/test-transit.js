/* Node checks for transit: both carriages are mapped so every seat and the exit can be reached, the map only offers a
 * ride for a place that is away from her and not her home, a trip is remembered and ends or is forgotten the right way,
 * the seat timer counts only running visible time, and the saved observation carries where it happened.
 * Run: node tools/test-transit.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
function check(name, ok) { if (ok) pass++; else { fail++; console.log('FAIL', name); } }
const DASH = new RegExp(String.fromCharCode(0x2014));
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
function world(files) {
  const ctx = { console, Math, JSON, Date, Object, Array, String, Number, parseInt, isNaN };
  ctx.globalThis = ctx; vm.createContext(ctx);
  files.forEach(f => vm.runInContext(read(f), ctx, { filename: f }));
  return ctx;
}
const FILES = ['js/ebb-world.js', 'js/ext/world.js', 'js/ext/map.js', 'js/ext/transit.js', 'js/transit/rules.js'];

/* ---------- the carriages ---------- */
(() => {
  const { EbbWorld: W, EbbTransitRules: R } = world(FILES);
  ['train', 'bus'].forEach(id => {
    const s = W.SCENES[id];
    check(`${id} registered`, !!s);
    check(`${id} is a tall indoor plate on disk`, s.aspect[0] === 4 && s.aspect[1] === 7 && s.indoor === true && fs.existsSync(path.join(__dirname, '..', s.plate)));
    check(`${id} names an indoor room tone`, s.sound === 'room');
    check(`${id} start is walkable`, W.walkable(id, s.start));
    check(`${id} has seats and an exit`, s.spots.length >= (id === 'train' ? 6 : 1) && s.spots.every(sp => sp.kind === 'ride') && s.doors.length >= 1); /* the bus keeps only its back bench: the side seats hid behind each other (25 Oct) */
    check(`${id}: every seat has its own sit point, feet below the cushion`, s.spots.every(sp => sp.sit && sp.sit.y > sp.at.y && Math.abs(sp.sit.x - sp.at.x) < 3));
    check(`${id}: one sparkle, not one per seat`, s.spots.filter(sp => !sp.quiet).length === 1);
    const entries = [s.start].concat(Object.keys(W.SCENES).flatMap(o => W.SCENES[o].doors.filter(d => d.to === id).map(d => d.arrive)).filter(Boolean));
    s.spots.forEach(sp => {
      check(`${id}/${sp.id} stand is walkable`, W.walkable(id, sp.stand));
      check(`${id}/${sp.id} stand is outside every door`, !W.doorAt(id, sp.stand));
      entries.forEach((e, i) => check(`${id}/${sp.id} reachable from entry ${i}`, !!W.plan(id, e, sp.stand)));
      s.spots.forEach(o => { if (o !== sp) check(`${id}/${sp.id} to ${o.id}`, !!W.plan(id, sp.stand, o.stand)); });
    });
    s.doors.forEach(d => {
      const c = { x: (d.rect[0] + d.rect[2]) / 2, y: (d.rect[1] + d.rect[3]) / 2 }, p = W.plan(id, s.start, c);
      check(`${id}/${d.id} reachable from the start`, !!p);
      check(`${id}/${d.id} the walk ends inside the door`, !!p && !!W.doorAt(id, p[p.length - 1]));
      s.spots.forEach(sp => check(`${id}/${d.id} reachable from ${sp.id}`, !!W.plan(id, sp.stand, c)));
      check(`${id}/${d.id} default target exists and is walkable`, !!W.SCENES[d.to] && W.walkable(d.to, d.arrive || W.SCENES[d.to].start));
    });
    const scaleNear = W.scaleAt(s.depth[2], id), scaleFar = W.scaleAt(s.depth[0], id);
    check(`${id} depth grows toward the camera`, scaleNear > scaleFar && scaleFar > 0.15 && scaleNear < 0.4);
  });
  check('map does not list the carriages as places', !root(FILES).EbbMap.PINS.some(p => p.scene === 'train' || p.scene === 'bus'));
  function root(files) { return world(files); }
  check('the carriages are transit scenes, the park is not', R.isTransitScene('train') && R.isTransitScene('bus') && !R.isTransitScene('merlion'));
})();

/* ---------- when the map offers a ride ---------- */
(() => {
  const { EbbWorld: W, EbbMap: M, EbbTransitRules: R } = world(FILES);
  const pin = id => M.pin(id);
  check('a park away from the farm is offered', !!R.offerFor(pin('merlion'), W.SCENES, 'farm') && R.offerFor(pin('merlion'), W.SCENES, 'farm').to === 'merlion');
  check('the offer names the place', R.offerFor(pin('merlion'), W.SCENES, 'farm').label === 'Merlion Park');
  check('home is never a ride', R.offerFor(pin('home'), W.SCENES, 'farm') === null);
  check('the Garden from home is next door, no ride', R.offerFor(pin('farm'), W.SCENES, 'living') === null && R.offerFor(pin('farm'), W.SCENES, 'bedroom') === null);
  check('the Garden from elsewhere is still a ride', !!R.offerFor(pin('farm'), W.SCENES, 'merlion'));
  check('a home room by scene id is never a ride', R.offerFor({ id: 'x', scene: 'living' }, W.SCENES, 'farm') === null);
  check('her own place is not a ride', R.offerFor(pin('farm'), W.SCENES, 'farm') === null);
  check('home counts every home room as here', R.offerFor(pin('home'), W.SCENES, 'bathroom') === null);
  check('an unregistered place is not a ride', R.offerFor({ id: 'z', scene: 'nowhere' }, W.SCENES, 'farm') === null);
  check('a missing spot is not a ride', R.offerFor({ id: 'z', scene: 'jetty', spot: 'nope' }, W.SCENES, 'farm') === null);
  const pier = R.offerFor(pin('pier'), W.SCENES, 'farm'), fishing = W.SCENES.jetty.spots.filter(s => s.id === 'fishing')[0];
  check('a spot pin arrives at its stand point', !!pier && pier.to === 'jetty' && pier.arrive.x === fishing.stand.x && pier.arrive.y === fishing.stand.y);
  pier.arrive.x = 0; check('the arrival is a copy', fishing.stand.x !== 0);
  check('a scene pin arrives at the scene start', R.offerFor(pin('hawker'), W.SCENES, 'farm').arrive === null);
  check('no boarding from on board', R.offerFor(pin('merlion'), W.SCENES, 'train') === null && R.offerFor(pin('merlion'), W.SCENES, 'bus') === null);
  check('from home every outside place but the Garden next door is offered', ['hawker', 'waterfall', 'spring', 'merlion', 'pier'].every(id => !!R.offerFor(pin(id), W.SCENES, 'bedroom')));
  check('copy has no em dash', !DASH.test(JSON.stringify(R.MODES) + JSON.stringify(R.SEAT_OPTIONS) + R.NOTICE.join('') + JSON.stringify(R.BREATH)));
})();

/* ---------- the trip in the save ---------- */
(() => {
  const { EbbTransitRules: R } = world(FILES);
  let st = {};
  check('ensure makes an empty trip', R.ensure(st).trip === null && R.trip(st) === null);
  st = { transit: { trip: { mode: 'rocket', to: 'merlion' } } }; check('an unknown mode is dropped', R.trip(st) === null);
  st = { transit: { trip: { mode: 'bus', to: '' } } }; check('an empty destination is dropped', R.trip(st) === null);
  st = { transit: { trip: { mode: 'bus', to: 'merlion', arrive: { x: 'a' } } } }; check('a broken arrival is dropped, the trip kept', R.trip(st).arrive === null && R.trip(st).to === 'merlion');
  st = {};
  const t = R.begin(st, 'train', 'merlion', { x: 54, y: 114 }, 1000);
  check('begin remembers the trip', t && R.trip(st) === t && t.to === 'merlion' && t.mode === 'train' && t.startedAt === 1000 && t.arrive.x === 54);
  check('begin refuses an unknown mode', R.begin(st, 'tram', 'merlion') === null && R.trip(st) === t);
  check('on board the trip rides', R.onScene(st, 'train') === 'riding' && R.trip(st) === t);
  check('the exit door points at the destination', R.exitFor(st, 'train').to === 'merlion' && R.exitFor(st, 'train').arrive.x === 54);
  check('the other carriage keeps its default exit', R.exitFor(st, 'bus').to === 'hawker');
  const a = R.arrival(st);
  check('arrival hands over the destination and clears', a.scene === 'merlion' && a.at.x === 54 && a.mode === 'train' && R.trip(st) === null);
  check('arrival with no trip is null', R.arrival(st) === null);
  check('exit without a trip is the default stop', R.exitFor(st, 'train').to === 'merlion' && R.exitFor(st, 'train').arrive === undefined);
  R.begin(st, 'bus', 'hawker', null, 2);
  check('a scene-start arrival is undefined for enter', R.exitFor(st, 'bus').arrive === undefined);
  check('reaching the destination by the door arrives', R.onScene(st, 'hawker') === 'arrived' && R.trip(st) === null);
  R.begin(st, 'bus', 'hawker', null, 3);
  check('leaving by any other route forgets the trip', R.onScene(st, 'farm') === 'left' && R.trip(st) === null);
  check('no trip, nothing happens', R.onScene(st, 'farm') === 'none');
  R.begin(st, 'train', 'jetty', null, 4); R.clear(st); check('clear empties the trip', R.trip(st) === null);
  const saved = JSON.parse(JSON.stringify((R.begin(st, 'train', 'merlion', null, 5), st)));
  check('a reload keeps the ride', R.onScene(saved, 'train') === 'riding' && R.trip(saved).to === 'merlion');
})();

/* ---------- the seat timer counts only running, visible time ---------- */
(() => {
  const { EbbTransitRules: R } = world(FILES);
  const t = R.timer(60);
  R.advance(t, 0); R.advance(t, 1000); check('one second counts', R.activeSec(t) === 1 && R.leftSec(t) === 59 && R.clock(t) === '0:59');
  R.advance(t, 11000); check('a long gap counts at most one step', t.activeMs === 1000 + R.MAX_STEP_MS);
  R.pause(t, 12000); R.advance(t, 20000); check('paused time does not count', t.activeMs === 2500 + 1000 && t.paused);
  R.resume(t, 20000); R.advance(t, 21000); check('resumed time counts again', t.activeMs === 4500);
  R.setHidden(t, true, 21000); R.advance(t, 22000); check('hidden time does not count', t.activeMs === 4500);
  R.setHidden(t, false, 22000); R.advance(t, 23000); check('visible again counts', t.activeMs === 5500);
  check('not finished early', !R.finished(t) && R.worthSaving(t));
  R.end(t, 23500); check('end stops the clock', t.ended && !R.counting(t) && t.activeMs === 6000);
  R.advance(t, 30000); check('nothing counts after the end', t.activeMs === 6000);
  const f = R.timer(45); R.advance(f, 0); for (let i = 1; i <= 46; i++) R.advance(f, i * 1000);
  check('the planned time ends it, capped', f.ended && f.activeMs === 45000 && R.finished(f) && R.clock(f) === '0:00');
  const short = R.timer(60); R.advance(short, 0); R.advance(short, 3000); check('a few seconds are not worth saving', !R.worthSaving(short));
  /* cues */
  const b = R.timer(60); R.advance(b, 0);
  check('breath starts with in, count 1 of 4', R.breathAt(b).text === 'Breathe in' && R.breathAt(b).count === 1 && R.breathAt(b).of === 4);
  R.advance(b, 1000); R.advance(b, 2000); R.advance(b, 3000); R.advance(b, 4000); check('after four seconds: out, count 1 of 6', R.breathAt(b).text === 'Breathe out' && R.breathAt(b).count === 1 && R.breathAt(b).of === 6);
  for (let s = 5; s <= 10; s++) R.advance(b, s * 1000); check('the cycle repeats every ten seconds', R.breathAt(b).text === 'Breathe in' && R.breathAt(b).count === 1);
  const n = R.timer(45); R.advance(n, 0); check('notice starts with seeing', R.noticeAt(n).index === 0);
  for (let s = 1; s <= 9; s++) R.advance(n, s * 1000); check('nine seconds in, hearing', R.noticeAt(n).index === 1);
  for (let s = 10; s <= 44; s++) R.advance(n, s * 1000); check('the last thing is the breath', R.noticeAt(n).index === 4 && /breath/.test(R.noticeAt(n).text));
  check('five things, none with an em dash', R.NOTICE.length === 5 && R.NOTICE.every(x => !DASH.test(x)));
})();

/* ---------- the saved observation ---------- */
(() => {
  const { EbbTransitRules: R } = world(FILES);
  const t = R.timer(60); R.advance(t, 0); for (let s = 1; s <= 60; s++) R.advance(t, s * 1000);
  const o = R.observation('breathe', 'train', t, '2026-10-23T09:00:00.000Z', '2026-10-23T09:01:02.000Z', 'pabc');
  check('a mindfulness observation', o.type === 'mindfulness' && o.date === '2026-10-23' && o.id === 'pabc' && o.confirmed === true);
  check('it says where', o.where === 'train' && o.source === 'transit');
  check('the breath practice on the breath', o.practice === 'transit-breathe' && o.anchor === 'breath' && o.scriptVersion === R.VERSION);
  check('finished with its seconds', o.status === 'finished' && o.plannedSec === 60 && o.activeSec === 60 && o.start && o.end);
  const p = R.timer(45); R.advance(p, 0); for (let s = 1; s <= 12; s++) R.advance(p, s * 1000); R.end(p, 12500);
  const q = R.observation('notice', 'bus', p, '2026-10-23T09:00:00.000Z', '2026-10-23T09:00:13.000Z');
  check('a skipped notice is partial, on the bus, on the senses', q.status === 'partial' && q.where === 'bus' && q.anchor === 'senses' && q.activeSec === 12 && q.practice === 'transit-notice');
  check('an unknown place falls back to the train', R.observation('breathe', 'ferry', p, '', '').where === 'train');
  const keys = ['id', 'type', 'date', 'practice', 'anchor', 'scriptVersion', 'plannedSec', 'activeSec', 'status', 'start', 'end', 'source', 'where', 'confirmed'];
  check('the store shape plus where, nothing else', Object.keys(o).sort().join() === keys.slice().sort().join());
})();

/* ---------- the map hook ---------- */
(() => {
  const ctx = world(['js/ebb-world.js', 'js/ext/world.js', 'js/ext/map.js']);
  const { EbbMap: M } = ctx;
  const fakeApi = (scene, log) => ({ scene: () => scene, enter: (id, at) => log.push(['enter', id, at]) });
  let log = [];
  check('without transit, travel goes as before', M.travel(M.pin('merlion'), fakeApi('farm', log), () => log.push(['close'])) === 'went' && log.length === 2);
  let calls = [];
  ctx.EbbTransit = { offer: (pin, api, close) => { calls.push([pin.id, api.scene(), typeof close]); return true; } };
  log = [];
  check('with transit, the offer takes over', M.travel(M.pin('merlion'), fakeApi('farm', log), () => log.push(['close'])) === 'offered');
  check('the offer gets the pin, the api and close', calls.length === 1 && calls[0][0] === 'merlion' && calls[0][1] === 'farm' && calls[0][2] === 'function');
  check('the map neither closes nor enters by itself', log.length === 0);
  calls = []; log = [];
  check('her own place never asks', M.travel(M.pin('farm'), fakeApi('farm', log), () => log.push(['close'])) === 'here' && calls.length === 0 && log.length === 1);
  check('a place that is not here yet never asks', M.travel({ id: 'zz', scene: 'nowhere', label: 'x' }, fakeApi('farm', log), () => log.push(['close'])) === 'soon' && calls.length === 0);
  ctx.EbbTransit = { offer: () => false };
  log = [];
  check('when transit declines, travel goes as before', M.travel(M.pin('merlion'), fakeApi('farm', log), () => log.push(['close'])) === 'went' && log[0][0] === 'close' && log[1][0] === 'enter' && log[1][1] === 'merlion');
  const real = world(FILES);
  check('in node the page part of transit stays off, so the old path holds', real.EbbTransit === undefined);
})();

/* ---------- the page files ---------- */
(() => {
  const html = read('index.html');
  check('index loads transit.js once, after the engine and the map', html.split('js/ext/transit.js').length === 2 && html.indexOf('js/ext/transit.js') > html.indexOf('js/ext/map.js'));
  check('index loads transit.css once', html.split('css/ext/transit.css').length === 2);
  ['js/ext/transit.js', 'js/transit/rules.js', 'css/ext/transit.css', 'tools/test-transit.js'].forEach(f => check(`${f} has no em dash`, !DASH.test(read(f))));
  check('map.js calls the hook before enter', /EbbTransit\.offer\(pin, api, close\)/.test(read('js/ext/map.js')));
})();

process.on('beforeExit', () => { console.log(`${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0; });
