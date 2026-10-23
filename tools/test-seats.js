/* Node checks for the seats extension: the per-seat action lists, the timer's accounting, the saved record and its
 * 20 second rule, and retargeting that touches only the three outdoor seats. Run: node tools/test-seats.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console, Math, JSON, Date, Object, Array, String, Number, parseInt, isNaN };
ctx.globalThis = ctx;
vm.createContext(ctx);
['js/ebb-world.js', 'js/seats/rules.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f }));
const { EbbWorld: W, EbbSeatRules: R } = ctx;
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

let pass = 0, fail = 0;
function check(name, ok) { if (ok) pass++; else { fail++; console.log('FAIL', name); } }
const labels = (sc, id) => R.actionsFor(sc, id).map(a => a.label);

/* ---------- retargeting: exactly the three outdoor seats, nothing else ---------- */
const before = {};
Object.keys(W.SCENES).forEach(id => { before[id] = W.SCENES[id].spots.map(s => s.id + '=' + s.kind); });
const changed = R.retarget(W.SCENES);
check('three seats retargeted', changed.length === 3 && ['hawker:table', 'waterfall:bench', 'merlion:bench'].every(k => changed.includes(k)));
Object.keys(W.SCENES).forEach(id => {
  const after = W.SCENES[id].spots.map(s => s.id + '=' + s.kind);
  const expect = before[id].map(s => R.isSeat(id, s.split('=')[0]) ? s.split('=')[0] + '=seat' : s);
  check('scene ' + id + ': only its seats changed kind', after.join() === expect.join());
});
check('the bedroom cushion stays with the course', W.SCENES.bedroom.spots.find(s => s.id === 'cushion').kind === 'cushion');
check('the living sofa and rug stay with the course', W.SCENES.living.spots.filter(s => s.kind === 'cushion').map(s => s.id).join() === 'sofa,floorcushion');
check('retargeting again changes nothing', R.retarget(W.SCENES).length === 0);
const table = W.SCENES.hawker.spots.find(s => s.id === 'table'), lake = W.SCENES.waterfall.spots.find(s => s.id === 'bench'), stone = W.SCENES.merlion.spots.find(s => s.id === 'bench');
check('each seat carries its config', table.seat === R.SEATS['hawker:table'] && lake.seat === R.SEATS['waterfall:bench'] && stone.seat === R.SEATS['merlion:bench']);
check('labels and stand points are untouched', table.label === 'Sit with your kopi a moment' && table.stand.x === 66 && lake.stand.y === 127 && stone.at.x === 41);
check('a missing scene or spot is skipped, not invented', (() => { const fake = { hawker: { spots: [{ id: 'kopi', kind: 'tea' }] } }; const c = R.retarget(fake); return c.length === 0 && fake.hawker.spots[0].kind === 'tea' && fake.hawker.spots.length === 1; })());

/* ---------- where she sits and stands ---------- */
check('she sits on the spot plus a small offset', (() => { const p = R.sitAt(table), o = table.seat.offset; return Math.abs(p.x - table.at.x - o.x) < 1e-9 && Math.abs(p.y - table.at.y - o.y) < 1e-9; })());
check('offsets stay within the painted seat, never off across the scene', Object.keys(R.SEATS).every(k => Math.abs(R.SEATS[k].offset.x) <= 8 && R.SEATS[k].offset.y >= 0 && R.SEATS[k].offset.y <= 13));
[['hawker', table], ['waterfall', lake], ['merlion', stone]].forEach(([sc, sp]) => { const q = R.sitAt(sp); check(sc + ' seat sit point lies on the plate near its spot', q.x > 0 && q.x < 100 && q.y > 0 && q.y < W.units(sc) && Math.hypot(q.x - sp.at.x, q.y - sp.at.y) < 14); });
check('a spot without a seat config sits at the engine offset', JSON.stringify(R.sitAt({ at: { x: 10, y: 20 } })) === JSON.stringify({ x: 10, y: 20.2 }));
check('she stands where the walk ended', JSON.stringify(R.standAt(lake)) === JSON.stringify(lake.stand));
[['hawker', table], ['waterfall', lake], ['merlion', stone]].forEach(([sc, sp]) => {
  check(sc + ' seat stand is walkable and reachable from the start', W.walkable(sc, sp.stand) && !!W.plan(sc, W.SCENES[sc].start, sp.stand));
});

/* ---------- the action lists ---------- */
check('hawker table: kopi, breaths, people-watch, just sit', labels('hawker', 'table').join('|') === 'Sip your kopi|Three slow breaths|People-watch|Just sit');
check('lake bench: water, breaths, listen, just sit', labels('waterfall', 'bench').join('|') === 'Watch the water|Three slow breaths|Listen|Just sit');
check('stone bench: boats, breaths, just sit', labels('merlion', 'bench').join('|') === 'Watch the boats|Three slow breaths|Just sit');
check('planned seconds as briefed', (() => { const A = R.ACTIONS; return A.sip.sec === 20 && A.breaths.sec === 30 && A.watch.sec === 45 && A.water.sec === 60 && A.listen.sec === 45 && A.boats.sec === 60 && A.still.sec === 0; })());
check('every timed action has a prompt and a kind line', Object.keys(R.ACTIONS).every(k => R.ACTIONS[k].prompt && (!R.ACTIONS[k].sec || R.ACTIONS[k].done)));
check('the noticing prompts ask for three things', /three/i.test(R.ACTIONS.watch.prompt) && /three/i.test(R.ACTIONS.listen.prompt));
check('a seat nobody knows offers nothing', R.actionsFor('bedroom', 'cushion').length === 0 && R.actionsFor('nowhere', 'x').length === 0);
check('action lists are copies', (() => { const a = R.actionsFor('hawker', 'table'); a[0].sec = 1; return R.ACTIONS.sip.sec === 20; })());
check('the kopi sip draws steam', R.ACTIONS.sip.fx === 'steam' && R.SEATS['hawker:table'].steam && typeof R.SEATS['hawker:table'].steam.x === 'number');

/* ---------- the timer: running visible time only, 1.5 s cap ---------- */
let t = R.timer(30);
check('a fresh timer has nothing', R.activeSec(t) === 0 && R.leftSec(t) === 30 && R.counting(t) && !t.ended);
R.advance(t, 1000); R.advance(t, 2000); R.advance(t, 3000);
check('three one-second ticks make two seconds (the first tick only sets the clock)', R.activeSec(t) === 2);
R.advance(t, 13000);
check('a ten second gap adds only the cap', t.activeMs === 3500);
R.pause(t, 13500); R.advance(t, 15000);
check('paused time does not count', t.activeMs === 4000 && t.paused);
R.resume(t, 20000); R.advance(t, 21000);
check('resuming starts the clock from now', t.activeMs === 5000);
R.setHidden(t, true, 21500); R.advance(t, 22500);
check('hidden time does not count', t.activeMs === 5500 && !R.counting(t));
R.setHidden(t, false, 30000); R.advance(t, 31000);
check('coming back counts again from then', t.activeMs === 6500);
check('the clock text reads minutes and seconds', R.clockText(t) === '0:24' && R.clockText(R.timer(60)) === '1:00');
for (let now = 32000; now <= 60000; now += 1000) R.advance(t, now);
check('reaching the planned length ends it, clamped', t.ended && t.activeMs === 30000 && R.finished(t) && R.leftSec(t) === 0);
R.advance(t, 90000);
check('an ended timer stays put', t.activeMs === 30000);
let s = R.timer(30); R.advance(s, 0); R.advance(s, 1000); R.end(s, 1500);
check('Skip ends early and is not finished', s.ended && !R.finished(s) && R.activeSec(s) === 1);
let u = R.timer(0); R.advance(u, 0); R.advance(u, 5000);
check('an untimed action never ends by itself and is never finished', !u.ended && !R.finished(u));

/* ---------- breaths ---------- */
let b = R.timer(30); R.advance(b, 0);
check('breath one, in, at the start', JSON.stringify(R.breathAt(R.ACTIONS.breaths, b)) === JSON.stringify({ n: 1, of: 3, phase: 'in' }));
b.activeMs = 7000; check('breath one, out, past the half', R.breathAt(R.ACTIONS.breaths, b).phase === 'out' && R.breathAt(R.ACTIONS.breaths, b).n === 1);
b.activeMs = 10500; check('breath two begins at ten seconds', R.breathAt(R.ACTIONS.breaths, b).n === 2);
b.activeMs = 29900; check('the last breath is the third', R.breathAt(R.ACTIONS.breaths, b).n === 3);
check('no count for actions without one', R.breathAt(R.ACTIONS.watch, b) === null);

/* ---------- the record and the 20 second rule ---------- */
function ran(sec, planned) { const x = R.timer(planned); x.activeMs = sec * 1000; x.last = 0; if (sec >= planned) x.ended = true; return x; }
check('19 seconds saves nothing', R.record(R.ACTIONS.watch, ran(19, 45), 'hawker', 'table', '2026-10-23T09:00:00.000Z', '2026-10-23T09:00:19.000Z') === null && !R.shouldSave(ran(19.9, 45)));
const rec = R.record(R.ACTIONS.watch, ran(20, 45), 'hawker', 'table', '2026-10-23T09:00:00.000Z', '2026-10-23T09:00:20.000Z');
check('20 seconds saves a partial mindfulness record', rec && rec.type === 'mindfulness' && rec.status === 'partial' && rec.activeSec === 20 && rec.where === 'hawker' && rec.seat === 'table' && rec.date === '2026-10-23');
check('the record names its action and planned length', rec.practice === 'seat-watch' && rec.plannedSec === 45 && rec.source === 'seat' && rec.scriptVersion === R.VERSION && rec.confirmed === true);
const fin = R.record(R.ACTIONS.breaths, ran(30, 30), 'waterfall', 'bench', '2026-10-23T09:00:00.000Z', '2026-10-23T09:00:30.000Z');
check('running to the end is finished, with the breath anchor', fin.status === 'finished' && fin.anchor === 'breath' && fin.where === 'waterfall' && fin.seat === 'bench');
check('a sip to the end is finished at 20 seconds', R.record(R.ACTIONS.sip, ran(20, 20), 'hawker', 'table', '2026-10-23T09:00:00.000Z', null).status === 'finished');
check('listening rests on sound, watching on sight', R.record(R.ACTIONS.listen, ran(45, 45), 'waterfall', 'bench', '2026-10-23T09:00:00.000Z', null).anchor === 'sound' && R.record(R.ACTIONS.boats, ran(25, 60), 'merlion', 'bench', '2026-10-23T09:00:00.000Z', null).anchor === 'sight');
check('the minimum is twenty seconds', R.MIN_SAVE_SEC === 20 && R.MAX_STEP_MS === 1500);

/* ---------- the page ---------- */
check('index loads the seats extension after sleep, with its style', (() => { const h = read('index.html'); return h.includes('css/ext/seats.css') && h.indexOf('js/ext/seats.js') > h.indexOf('js/ext/sleep.js'); })());
check('the extension registers the seat kind and loads the rules', (() => { const j = read('js/ext/seats.js'); return j.includes("registerKind('seat'") && j.includes('js/seats/rules.js') && j.includes('retarget('); })());
check('the extension leaves the integrator a note about the scene data', /integrator/i.test(read('js/seats/rules.js')));
check('no em dash in the seats copy', !/—/.test(read('js/ext/seats.js') + read('js/seats/rules.js') + read('css/ext/seats.css')));

console.log(`test-seats: ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
