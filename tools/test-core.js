/* Node checks for Ebb's pure modules: puppet, world, farm and store. Run: node tools/test-core.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console, Math, JSON, Date, Object, Array, String, Number, parseInt, isNaN };
ctx.globalThis = ctx;
const mem = {};
ctx.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
vm.createContext(ctx);
['ebb-puppet.js', 'ebb-clay-sets.js', 'ebb-clay.js', 'ebb-world.js', 'ebb-furniture.js', 'ebb-farm.js', 'ebb-store.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f }));
const { EbbPuppet: P, EbbClay: C, EbbClaySets: CS, EbbWorld: W, EbbFurniture: Fu, EbbFarm: F, EbbStore: S } = ctx;

let pass = 0, fail = 0;
function check(name, ok) { if (ok) pass++; else { fail++; console.log('FAIL', name); } }

/* puppet: every view, action and hairstyle draws, with no undefined or NaN in the markup */
['front', 'back', 'side'].forEach(view => ['idle', 'walk', 'work', 'sit'].forEach(action => P.HAIR_STYLES.forEach(hs => {
  [0, 0.25, 0.5, 0.75].forEach(phase => {
    const s = P.svg({ hairStyle: hs }, { view, action, phase, tool: 'hoe' });
    check(`puppet ${view}/${action}/${hs}/${phase}`, s.length > 200 && !/undefined|NaN/.test(s));
  });
})));
/* a tudung never lets the hair colour show, in any view or pose */
['front', 'back', 'side'].forEach(view => ['idle', 'walk', 'sit'].forEach(action => {
  const s = P.svg({ hair: '#123456', headwear: 'tudung' }, { view, action, phase: 0.3 });
  check(`tudung hides hair ${view}/${action}`, s.indexOf('#123456') < 0);
}));
check('stored colours are cleaned', P.svg({ top: '"><script>' }, {}).indexOf('<script>') < 0);


/* clay: every shipped set has every strip on disk with the frame count its metadata says, and pick() maps poses */
Object.keys(CS).forEach(set => Object.keys(CS[set]).forEach(strip => {
  const m = CS[set][strip], f = path.join(__dirname, '..', 'art/chars', set, strip + '.webp');
  check(`clay ${set}/${strip} file`, fs.existsSync(f));
  const b = fs.existsSync(f) ? fs.readFileSync(f) : null; /* VP8X canvas width is 24 bits at byte 24 */
  const w = b && b.toString('ascii', 12, 16) === 'VP8X' ? 1 + (b[24] | b[25] << 8 | b[26] << 16) : -1;
  check(`clay ${set}/${strip} width = frames x cell`, w === m.frames * m.w);
}));
check('clay base set is the original girl', C.has('default') && C.setFor({}) === 'default' && C.setFor({ set: 'nope' }) === 'default' && C.setFor({ set: 'ac' }) === 'default' && C.sets().join() === 'default,lilac,tudung');
check('clay walk uses 8 frames', [0, 0.13, 0.5, 0.99].map(ph => C.pick({ action: 'walk', view: 'front', phase: ph }).frame).join() === '0,1,4,7');
check('clay walking left flips the side strip', C.pick({ action: 'walk', view: 'side', flip: true }).flip && !C.pick({ action: 'walk', view: 'front', flip: true }).flip);
check('clay idle views', ['front', 'side', 'back'].map(v => C.pick({ view: v }).frame).join() === '0,1,2');
check('clay tools', ['can', 'hoe', 'seed', 'pick'].map(t => C.pick({ action: 'work', tool: t, phase: 0.7 }).frame).join() === '0,2,3,3');
check('clay offering is the idle back view', C.pick({ action: 'work', tool: 'none', view: 'back' }).strip === 'idle');
check('clay sit', C.pick({ action: 'sit', view: 'front' }).strip === 'sit');
check('every floor fits its plate', Object.keys(W.SCENES).every(id => W.SCENES[id].floor.every(p => p[0] >= 0 && p[0] <= 100 && p[1] >= 0 && p[1] <= W.units(id))));
check('plate units follow the aspect', W.units({}) === 100 && W.units({ aspect: [4, 7] }) === 175);
check('depth: further up is smaller in every scene', Object.keys(W.SCENES).every(id => { const d = W.SCENES[id].depth || [60, 0.17, 98, 0.28]; return W.scaleAt(d[0], id) < W.scaleAt(d[2], id); }));

/* furniture: every room's default arrangement fits, every piece has art, and a moved piece obeys the floor and the others */
Object.keys(Fu.DEFAULTS).forEach(id => { /* the redecorated room: the empty shell's floor plus her pieces, as the game switches it */
  const s = W.SCENES[id], fixed = { floor: s.floor, solids: s.solids.slice(), spots: s.spots.slice(), doors: s.doors };
  s.floor = s.shellFloor || s.floor; s.doors = W.shellDoors(s); s.baseSolids = []; s.baseSpots = [];
  const lay = Fu.fresh(id); Fu.apply(s, lay);
  check(`${id} furniture ids unique`, new Set(lay.map(p => p.uid)).size === lay.length);
  lay.forEach(p => check(`${id}/${p.item} fits where it starts`, Fu.canPlace(W, id, lay, p.uid, p.x, p.y)));
  s.spots.forEach(sp => check(`${id}/${sp.id} (redecorated) stand reachable`, W.walkable(id, sp.stand) && !!W.plan(id, s.start, sp.stand)));
  s.doors.forEach(d => check(`${id}/${d.id} (redecorated) door reachable`, !!W.plan(id, s.start, { x: (d.rect[0] + d.rect[2]) / 2, y: (d.rect[1] + d.rect[3]) / 2 })));
  s.floor = fixed.floor; s.doors = fixed.doors; s.solids = fixed.solids; s.spots = fixed.spots; s.layout = null; s.baseSolids = null; /* back to the painted room */
});
Object.keys(Fu.CATALOG).forEach(k => {
  const c = Fu.CATALOG[k], m = ctx.EbbPropSprites[c.sheet];
  check(`furniture ${k} has a strip and frame`, !!m && c.frame < m.frames && (!c.dir || m.dir === c.dir));
});
(() => {
  const lay = Fu.fresh('bedroom'), bed = lay.filter(p => p.item === 'bed')[0], lamp = lay.filter(p => p.item === 'lamp')[0];
  check('cannot drop a piece off the floor', !Fu.canPlace(W, 'bedroom', lay, lamp.uid, 50, 20));
  check('cannot drop a piece onto another', !Fu.canPlace(W, 'bedroom', lay, lamp.uid, bed.x, bed.y));
  check('cannot block a door', !Fu.canPlace(W, 'bedroom', lay, lamp.uid, 8, 98));
  check('can move to a clear spot', Fu.canPlace(W, 'bedroom', lay, lamp.uid, 60, 165));
  const rug = lay.filter(p => p.item === 'rug')[0];
  check('a rug may lie under other things', Fu.canPlace(W, 'bedroom', lay, rug.uid, bed.x, bed.y));
  check('stored junk is dropped, known pieces kept', Fu.clean([{ uid: 'a', item: 'bed', x: 30, y: 95 }, { uid: 'b', item: 'spaceship', x: 1, y: 1 }, { uid: 'a', item: 'lamp', x: 2, y: 2 }], 'bedroom').length === 1);
  check('a corrupt layout falls back to the default room', Fu.clean('nope', 'bedroom').length === Fu.DEFAULTS.bedroom.length);
  const spots = Fu.spotsFor(lay);
  check('furniture spots carry topics', spots.filter(s => s.kind === 'log').every(s => s.topic) && spots.some(s => s.topic === 'sleep'));
})();

/* world: every start, door arrival and stand point is walkable and reachable from the start */
Object.keys(W.SCENES).forEach(id => {
  const s = W.SCENES[id];
  check(`${id} start walkable`, W.walkable(id, s.start));
  s.spots.forEach(sp => {
    check(`${id}/${sp.id} stand walkable`, W.walkable(id, sp.stand));
    check(`${id}/${sp.id} reachable`, !!W.plan(id, s.start, sp.stand));
  });
  (s.beds || []).forEach((b, i) => check(`${id} bed ${i} reachable`, !!W.plan(id, s.start, { x: b.x, y: b.y + 4.5 })));
  s.doors.forEach(d => {
    check(`${id}/${d.id} target exists`, !!W.SCENES[d.to]);
    check(`${id}/${d.id} arrival walkable`, W.walkable(d.to, d.arrive));
    check(`${id}/${d.id} arrival not inside a door`, !W.doorAt(d.to, d.arrive));
    const mid = { x: (d.rect[0] + d.rect[2]) / 2, y: (d.rect[1] + d.rect[3]) / 2 };
    const p = W.plan(id, s.start, mid);
    check(`${id}/${d.id} door reachable`, !!p && W.doorAt(id, p[p.length - 1]) !== null || W.walkable(id, mid));
  });
});
check('plan avoids leaving the floor', (() => { const s = W.SCENES.waterfall, p = W.plan('waterfall', s.start, { x: 50, y: 90 }); return p && p.every(q => W.walkable('waterfall', q)); })());

/* farm: growth by watered days, overnight; nothing decays; three free seeds a day */
(() => {
  const f = F.fresh(2), d1 = '2026-10-22', d2 = '2026-10-23', d3 = '2026-10-24', d9 = '2026-10-30';
  check('grass hoes first', F.nextAction(f, 0, d1) === 'hoe');
  F.act(f, 0, d1);
  check('tilled needs seeds', F.nextAction(f, 0, d1) === 'needSeeds');
  check('seed from shed', F.takeSeeds(f, d1) === 'turnip');
  F.takeSeeds(f, d1); F.takeSeeds(f, d1);
  check('only three seeds a day', F.takeSeeds(f, d1) === null && F.takeSeeds(f, d2) !== null);
  check('plants turnip', F.act(f, 0, d1).crop === 'turnip');
  check('water today', F.nextAction(f, 0, d1) === 'water');
  F.act(f, 0, d1);
  check('done after watering', F.nextAction(f, 0, d1) === 'done');
  check('no growth until tomorrow', F.grown(f.beds[0], d1) === 0);
  check('grew overnight', F.grown(f.beds[0], d2) === 1);
  check('dry week does not decay', F.grown(f.beds[0], d9) === 1 && F.stage(f.beds[0], d9) !== null);
  F.act(f, 0, d2);
  check('ripe after two watered days', F.stage(f.beds[0], d3) === 'ripe');
  check('harvest into basket', F.act(f, 0, d3).action === 'harvest' && f.basket.turnip === 1 && f.beds[0].state === 'tilled');
  check('basket gives an offering', F.takeFromBasket(f) === 'turnip' && F.takeFromBasket(f) === null);
  check('watering twice in a day does not double grow', (() => { const g = F.fresh(1); F.act(g, 0, d1); g.seeds.carrot = 1; F.act(g, 0, d1); g.beds[0].watered.push(d1, d1); return F.grown(g.beds[0], d2) === 1; })());
})();

/* store: practice observations carry provenance and status is never invented */
(() => {
  S.reset();
  const r = S.addPractice({ practice: 'sitting', anchor: 'sound', plannedSec: 180, activeSec: 95.4, status: 'weird', start: '2026-10-22T10:00:00Z', source: 'cushion' });
  check('practice saved partial unless finished', r.status === 'partial' && r.activeSec === 95 && r.type === 'mindfulness');
  check('practice persisted', JSON.parse(mem[S.KEY]).observations.length === 1);
  mem[S.KEY] = '{broken';
  S.reset(); mem[S.KEY] = '{broken';
  check('corrupt save falls back to a fresh game', S.load().scene === 'bedroom');
})();

process.on('beforeExit', () => { console.log(`${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0; });
