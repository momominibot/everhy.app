/* Node checks for the bag: the item registry, add and take on state.bag, live bridging to the farm's seeds, basket and
 * the pond gift, kind grouping, the action registry, and that no count ever goes below zero. Run: node tools/test-bag.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console, Math, JSON, Date, Object, Array, String, Number, parseInt, isNaN, isFinite };
ctx.globalThis = ctx;
vm.createContext(ctx);
['js/ebb-farm.js', 'js/bag/items.js', 'js/bag/core.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f }));
const { EbbFarm: F, EbbItems: I, EbbBag: B } = ctx;

let pass = 0, fail = 0;
function check(name, ok) { if (ok) pass++; else { fail++; console.log('FAIL', name); } }
function fresh() { return { farm: F.fresh(6), pond: { offerings: 0, gift: false } }; }
const snap = o => JSON.stringify(o);

/* ---------- registry ---------- */
check('kinds in order', I.KINDS.map(k => k.id).join() === 'seed,crop,find,gift,tool');
Object.keys(F.CROPS).forEach(c => {
  check(`${c} crop registered`, I.get(c) && I.get(c).kind === 'crop' && I.get(c).name === F.CROPS[c].name);
  check(`${c} seed registered`, I.get(I.seedId(c)) && I.get(I.seedId(c)).kind === 'seed' && I.get(I.seedId(c)).icon.strip === 'icons');
});
check('crop icon is the ripe frame of its own strip', I.get('turnip').icon.strip === 'turnip' && I.get('turnip').icon.frame === 4);
['egg', 'milk', 'spaEgg', 'fishSmall', 'fishMedium', 'fishLarge'].forEach(id => check(`${id} is a find`, I.get(id) && I.get(id).kind === 'find' && I.get(id).icon.strip === 'items'));
check('moon pearl is a gift', I.get('moonPearl') && I.get('moonPearl').kind === 'gift');
check('unknown id is null', I.get('nothing') === null);
check('define refuses a taken id', I.define({ id: 'turnip', name: 'Again', kind: 'crop' }) === null);
check('define refuses an unknown kind', I.define({ id: 'x1', name: 'X', kind: 'potion' }) === null);
check('define refuses a missing name', I.define({ id: 'x2', kind: 'tool' }) === null);
const shovel = I.define({ id: 'shovel', name: 'Shovel', kind: 'tool', icon: { strip: 'bag', frame: 1 }, about: 'Digs.' });
check('a later phase can add a tool', shovel && I.get('shovel') === shovel && I.byKind('tool').length === 1 && shovel.stack === true);
check('every kind has a label, an about line and an empty line', I.KINDS.every(k => k.label && k.about && k.empty));
check('every defined item has an about line', I.all().every(it => it.about.length > 0));
check('stub names an unknown thing without hiding it', I.stub('sea_shell').name === 'Sea shell' && I.stub('honeyJar').name === 'Honey jar' && I.stub('x').kind === 'find');
const kept = I.all().length;
check('EbbItems does not touch strips of the engine', I.STRIPS.items.src === 'art/world/items.webp' && I.STRIPS.bag.src === 'art/bag/items.webp');

/* ---------- add and take on state.bag ---------- */
{
  const st = fresh();
  check('ensure makes an empty bag', snap(B.ensure(st)) === '{}' && st.bag && typeof st.bag === 'object');
  check('add returns the new count', B.add(st, 'shovel') === 1 && B.add(st, 'seashell', 2) === 2 && B.add(st, 'seashell') === 3);
  check('count reads own items', B.count(st, 'seashell') === 3 && B.own(st, 'shovel') === 1);
  check('add ignores zero, negatives and junk', B.add(st, 'seashell', 0) === null && B.add(st, 'seashell', -4) === null && B.add(st, 'seashell', 'lots') === null && B.add(st, '', 1) === null && B.count(st, 'seashell') === 3);
  check('add floors fractions', B.add(st, 'acorn', 2.9) === 2 && B.count(st, 'acorn') === 2);
  check('take succeeds when held', B.take(st, 'seashell', 2) === true && B.count(st, 'seashell') === 1);
  check('take refuses more than held, nothing changes', B.take(st, 'seashell', 2) === false && B.count(st, 'seashell') === 1);
  check('take of the last one removes the key', B.take(st, 'seashell') === true && B.count(st, 'seashell') === 0 && !('seashell' in st.bag));
  check('take of something absent is false', B.take(st, 'pearl') === false && B.count(st, 'pearl') === 0);
  check('take refuses zero and negatives', B.take(st, 'shovel', 0) === false && B.take(st, 'shovel', -1) === false && B.count(st, 'shovel') === 1);
  check('no count is ever negative', Object.values(st.bag).every(v => v >= 1));
  const broken = { bag: { a: -3, b: 0, c: 'x', d: 2.5, e: 4 } };
  B.ensure(broken);
  check('ensure repairs a broken bag without inventing anything', snap(broken.bag) === '{"d":2,"e":4}');
  const arr = { bag: [1, 2] }; B.ensure(arr);
  check('ensure replaces a bag that is not an object', snap(arr.bag) === '{}');
  check('ensure on no state is harmless', snap(B.ensure(null)) === '{}');
}

/* ---------- bridging to the farm: read live, never copied ---------- */
{
  const st = fresh(), day = '2026-10-22';
  check('fresh farm: bag lists nothing', B.list(st).length === 0 && B.total(st) === 0);
  const g0 = B.grouped(st);
  check('grouped shows every kind with its empty line', g0.length === 5 && g0.every(g => g.items.length === 0 && g.kind.empty));
  F.takeSeeds(st.farm, day); F.takeSeeds(st.farm, day); /* turnip, carrot */
  check('seeds from the shed show as seed items', B.count(st, 'seed-turnip') === 1 && B.count(st, 'seed-carrot') === 1 && B.count(st, 'seed-sunflower') === 0);
  const before = snap(st.farm);
  const l1 = B.list(st);
  check('listed with the farm as source', l1.length === 2 && l1.every(e => e.item.kind === 'seed' && e.source === 'farm.seeds' && e.bridged));
  check('listing does not copy or change farm state', snap(st.farm) === before && !('seed-turnip' in st.bag));
  st.farm.seeds.turnip = 3;
  check('a later farm change shows at once (read live)', B.count(st, 'seed-turnip') === 3);
  check('take refuses a bridged item and leaves the farm alone', B.take(st, 'seed-turnip') === false && st.farm.seeds.turnip === 3);
  st.farm.basket.turnip = 2; st.farm.basket.egg = 1; st.farm.basket.fishLarge = 1; st.farm.basket.mystery = 1;
  const l2 = B.list(st);
  const ids = l2.map(e => e.id);
  check('basket crops and finds show, kinds in order', ids.join() === 'seed-turnip,seed-carrot,turnip,egg,fishLarge,mystery');
  check('an unknown basket key is shown as a find, not dropped', l2.find(e => e.id === 'mystery')?.item.stub === true && l2.find(e => e.id === 'mystery')?.item.name === 'Mystery');
  check('total adds every count', B.total(st) === 3 + 1 + 2 + 1 + 1 + 1);
  st.pond.gift = true;
  check('the moon pearl appears once the Goddess gave it', B.count(st, 'moonPearl') === 1 && B.list(st).some(e => e.id === 'moonPearl' && e.source === 'pond.gift'));
  st.farm.basket.egg = 0; st.farm.seeds.carrot = 0;
  check('zero counts are not listed', !B.list(st).some(e => e.id === 'egg' || e.id === 'seed-carrot'));
  B.add(st, 'egg', 2); st.farm.basket.egg = 1;
  check('own and basket counts of the same id add up', B.count(st, 'egg') === 3 && B.list(st).find(e => e.id === 'egg')?.count === 3);
  check('take only takes the owned part', B.take(st, 'egg', 3) === false && B.take(st, 'egg', 2) === true && B.count(st, 'egg') === 1 && st.farm.basket.egg === 1);
  const g = B.grouped(st);
  check('grouped keeps kind order and puts each item under its kind', g.map(x => x.kind.id).join() === 'seed,crop,find,gift,tool' && g[1].items.every(e => e.item.kind === 'crop') && g[3].items[0]?.id === 'moonPearl');
  check('a farm without a seeds map is harmless', B.count({ farm: { basket: null } }, 'seed-turnip') === 0 && B.list({}).length === 0);
  const strange = fresh(); strange.farm.seeds.turnip = -2; strange.farm.basket.egg = 'two';
  check('bad farm numbers never show as negative or NaN', B.count(strange, 'seed-turnip') === 0 && B.count(strange, 'egg') === 0 && B.list(strange).length === 0);
}

/* ---------- a later phase bridges its own store ---------- */
{
  const st = fresh(); st.dig = { finds: { seashell: 2 } };
  B.registerBridge('dig.finds', s => (s.dig && s.dig.finds) || {});
  check('a registered bridge is read live', B.count(st, 'seashell') === 2 && B.list(st).find(e => e.id === 'seashell')?.source === 'dig.finds');
  st.dig.finds.seashell = 5;
  check('and follows later changes', B.count(st, 'seashell') === 5);
  B.registerBridge('bad', () => { throw new Error('boom'); });
  check('a failing bridge is ignored', B.count(st, 'seashell') === 5);
}

/* ---------- actions ---------- */
{
  const calls = [];
  check('registerAction needs id, label and run', B.registerAction({ id: 'x' }) === false && B.registerAction({ label: 'y', run() { } }) === false);
  check('registerAction accepts a full action', B.registerAction({ id: 'give', label: 'Give', kinds: ['crop', 'find'], when: c => c.scene === 'plaza', run: c => calls.push(c.entry.id) }) === true);
  check('and refuses the same id twice', B.registerAction({ id: 'give', label: 'Give again', run() { } }) === false);
  const st = fresh(); st.farm.basket.turnip = 1; st.farm.seeds.carrot = 1;
  const crop = B.list(st).find(e => e.id === 'turnip'), seed = B.list(st).find(e => e.id === 'seed-carrot');
  check('actionsFor matches kind and when()', B.actionsFor(crop, { scene: 'plaza' }).length === 1 && B.actionsFor(crop, { scene: 'farm' }).length === 0 && B.actionsFor(seed, { scene: 'plaza' }).length === 0);
  B.actionsFor(crop, { scene: 'plaza' })[0].run({ entry: crop });
  check('run receives the entry', calls.join() === 'turnip');
  B.registerAction({ id: 'any', label: 'Any', when: () => { throw new Error('no'); }, run() { } });
  check('a throwing when() hides the action instead of breaking the sheet', !B.actionsFor(crop, {}).some(a => a.id === 'any'));
}
check('registry unchanged by bag rules', I.all().length === kept);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
