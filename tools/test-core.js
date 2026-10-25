/* Node checks for Ebb's pure modules: puppet, world, farm and store. Run: node tools/test-core.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console, Math, JSON, Date, Object, Array, String, Number, parseInt, isNaN };
ctx.globalThis = ctx;
const mem = {};
ctx.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
vm.createContext(ctx);
['ebb-puppet.js', 'ebb-clay-sets.js', 'ebb-clay.js', 'ebb-world.js', 'ebb-farm.js', 'ebb-store.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f }));
const { EbbPuppet: P, EbbClay: C, EbbClaySets: CS, EbbWorld: W, EbbFarm: F, EbbStore: S } = ctx;

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
check('clay base set is the original girl in her hoodie', C.has('genz') && C.setFor({}) === 'genz' && C.setFor({ set: 'nope' }) === 'genz' && C.setFor({ set: 'ac' }) === 'genz' && C.sets().join() === 'genz,default,lilac,tudung');
check('clay walk uses 8 frames', [0, 0.13, 0.5, 0.99].map(ph => C.pick({ action: 'walk', view: 'front', phase: ph }).frame).join() === '0,1,4,7');
check('clay walking left flips the side strip', C.pick({ action: 'walk', view: 'side', flip: true }).flip && !C.pick({ action: 'walk', view: 'front', flip: true }).flip);
check('clay idle views', ['front', 'side', 'back'].map(v => C.pick({ view: v }).frame).join() === '0,1,2');
check('clay tools', ['can', 'hoe', 'seed', 'pick'].map(t => C.pick({ action: 'work', tool: t, phase: 0.7 }).frame).join() === '0,2,3,3');
check('clay offering is the idle back view', C.pick({ action: 'work', tool: 'none', view: 'back' }).strip === 'idle');
check('clay sit', C.pick({ action: 'sit', view: 'front' }).strip === 'sit');
check('every floor fits its plate', Object.keys(W.SCENES).every(id => W.SCENES[id].floor.every(p => p[0] >= 0 && p[0] <= 100 && p[1] >= 0 && p[1] <= W.units(id))));
check('plate units follow the aspect', W.units({}) === 100 && W.units({ aspect: [4, 7] }) === 175);
check('depth: further up is smaller in every scene', Object.keys(W.SCENES).every(id => { const d = W.SCENES[id].depth || [60, 0.17, 98, 0.28]; return W.scaleAt(d[0], id) < W.scaleAt(d[2], id); }));

/* world: every start, door arrival and stand point is walkable and reachable from the start */
Object.keys(W.SCENES).forEach(id => {
  const s = W.SCENES[id];
  check(`${id} start walkable`, W.walkable(id, s.start));
  s.spots.forEach(sp => {
    check(`${id}/${sp.id} stand walkable`, W.walkable(id, sp.stand));
    check(`${id}/${sp.id} reachable`, !!W.plan(id, s.start, sp.stand));
  });
  (s.beds || []).forEach((b, i) => check(`${id} bed ${i} reachable`, W.walkable(id, W.bedStand(b)) && !!W.plan(id, s.start, W.bedStand(b))));
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

/* an older save with more beds than the painted farm: what grew in the lost beds moves to free beds, nothing is lost */
(() => {
  const n = W.SCENES.farm.beds.length, d1 = '2026-10-22';
  check('the painted farm has four beds', n === 4);
  const f = F.fresh(6); f.beds[4] = { state: 'planted', crop: 'turnip', watered: [d1] }; f.beds[5] = { state: 'tilled', crop: null, watered: [] }; f.beds[1] = { state: 'planted', crop: 'carrot', watered: [] };
  check('fitBeds reports a change', F.fitBeds(f, n) === true);
  check('four beds remain', f.beds.length === 4);
  check('the fifth bed\'s turnip moved to the first free bed with its watered days', f.beds[0].state === 'planted' && f.beds[0].crop === 'turnip' && f.beds[0].watered[0] === d1);
  check('the sixth bed\'s tilled soil took the next free bed', f.beds[2].state === 'tilled');
  check('a bed already in use is left alone', f.beds[1].crop === 'carrot' && f.beds[3].state === 'grass');
  const g = F.fresh(6); g.beds[4] = { state: 'planted', crop: 'turnip', watered: [] };
  for (let i = 0; i < 4; i++) g.beds[i] = { state: 'tilled', crop: null, watered: [] };
  F.fitBeds(g, n); check('with no free bed the extra crop is dropped rather than overwriting one', g.beds.length === 4 && g.beds.every(b => b.state === 'tilled'));
  const h = F.fresh(4); check('a save that already fits is untouched', F.fitBeds(h, n) === false && h.beds.length === 4);
  const k = F.fresh(2); check('a save with too few beds is padded with grass', F.fitBeds(k, n) === true && k.beds.length === 4 && k.beds[3].state === 'grass');
  check('a broken farm is left alone', F.fitBeds(null, n) === false && F.fitBeds({ beds: 'x' }, n) === false);
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

/* garden weeds: a grass bed draws its own rendered patch over the whole soil (art/props/weeds.webp from tools/weeds.py), never SVG strokes */
(function () {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'ebb-props.js'), 'utf8'), ctx, { filename: 'ebb-props.js' });
  const PR = ctx.EbbProps, SPW = ctx.EbbPropSprites.weeds, beds = W.SCENES.farm.beds.filter(b => b.w);
  const meta = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'art/props/weeds.json'), 'utf8'));
  check('the weeds strip ships with one frame per painted garden bed', fs.existsSync(path.join(__dirname, '..', 'art/props/weeds.webp')) && SPW && meta.frames === beds.length && SPW.frames === beds.length);
  const src = fs.readFileSync(path.join(__dirname, 'weeds.py'), 'utf8');
  check('tools/weeds.py composes patches for exactly the garden beds, in world order', JSON.stringify([...src.matchAll(/\(\((\d+), (\d+), (\d+)\), \[/g)].map(m => m.slice(1).map(Number))) === JSON.stringify(beds.map(b => [b.x, b.y, b.w])));
  beds.forEach((b, i) => {
    const out = PR.paintedBed({ state: 'grass', crop: null, watered: [] }, b.x, b.y, b.w, '2026-10-25', false);
    const cw = b.w * 1.15, ch = cw * SPW.h / SPW.w, num = re => Number((out.match(re) || [])[1]);
    check(`bed ${i} weeds: its own frame, in the cell the composer used, no SVG strokes`, /weeds\.webp/.test(out) && !/<path/.test(out) &&
      new RegExp('viewBox="' + i * SPW.w + ' 0 ').test(out) && Math.abs(num(/ x="([\d.]+)"/) - (b.x - cw / 2)) < 0.02 &&
      Math.abs(num(/ width="([\d.]+)"/) - cw) < 0.02 && Math.abs(num(/ y="([\d.]+)"/) + ch - (b.y + b.w * 0.17)) < 0.03);
    check(`bed ${i}: hoed or planted, the weeds are gone`, ['tilled', 'planted'].every(state => !/weeds\.webp/.test(PR.paintedBed({ state, crop: 'carrot', watered: [] }, b.x, b.y, b.w, '2026-10-25', false))));
  });
})();

process.on('beforeExit', () => { console.log(`${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0; });
