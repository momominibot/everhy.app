/* Node checks for the Flower Dome: the points ledger (recomputed from the data, never twice, capped by day, spent and
 * refused), the seed stall's grant shape, the place's stands and doors, the map pin and the page wiring.
 * Run: node tools/test-dome.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console, Math, JSON, Date, Object, Array, String, Number, parseInt, isNaN, RegExp };
ctx.globalThis = ctx;
vm.createContext(ctx);
['js/ebb-world.js', 'js/ebb-farm.js', 'js/ext/world.js', 'js/ext/map.js', 'js/ext/dome.js', 'js/dome/rules.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f }));
const { EbbWorld: W, EbbFarm: F, EbbDomeRules: R, EbbMap: M } = ctx;

let pass = 0, fail = 0;
function check(name, ok) { if (ok) pass++; else { fail++; console.log('FAIL', name); } }
function day(n) { const d = new Date(2026, 9, 1 + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function iso(date, h) { return new Date(date + 'T' + String(h || 9).padStart(2, '0') + ':00:00').toISOString(); } /* a local-time stamp of that day, as the log saves it */
function blank() { return { farm: F.fresh(6), pond: { offerings: 0, gift: false }, observations: [], log: { v: 1, obs: [], thread: [], batches: [] }, daily: { total: 3, days: { [day(0)]: { hearts: 3 } } } }; }
let seq = 0;
function logObs(date, extra) { return Object.assign({ id: 'o' + (++seq), type: 'mood', value: 'ok', start: date, end: date, created: iso(date, 8 + (seq % 10)), confirmed: true }, extra || {}); }
function practice(date, status) { return { id: 'p' + (++seq), type: 'mindfulness', date: date, status: status || 'finished', activeSec: 300, end: iso(date, 20) }; }
const T = day(5);

/* ---------- the ledger ---------- */
{
  const st = blank();
  let r = R.recompute(st, T);
  check('nothing saved: no points', r.gained === 0 && r.balance === 0 && st.points && st.points.total === 0 && st.points.spent === 0 && st.points.entries.length === 0);
  st.log.obs.push(logObs(T), logObs(T), logObs(T, { confirmed: false }));
  r = R.recompute(st, T);
  check('two confirmed entries: 20, the unconfirmed one nothing', r.gained === 20 && r.balance === 20 && st.points.entries.length === 2);
  check('entries carry id, date, source and n', st.points.entries.every(e => typeof e.id === 'string' && e.date === T && e.source === 'log' && e.n === 10));
  const snap = JSON.stringify(st.points);
  r = R.recompute(st, T);
  check('recompute again: nothing changes', r.gained === 0 && r.added.length === 0 && JSON.stringify(st.points) === snap);
  r = R.recompute(st, day(6));
  check('recompute on another day: still nothing', r.gained === 0 && JSON.stringify(st.points) === snap);
  st.log.obs[0].retracted = iso(T, 12);
  r = R.recompute(st, T);
  check('an undone entry keeps the points it earned (points never fall)', r.gained === 0 && R.balance(st.points) === 20);
  st.log.obs[0].value = 'edited'; st.log.obs[0].history = [{}];
  check('an edited entry is not paid twice', R.recompute(st, T).gained === 0 && R.balance(st.points) === 20);
  st.observations.push(practice(T, 'finished'), practice(T, 'partial'));
  r = R.recompute(st, T);
  check('a finished practice: 15, a partial one nothing', r.gained === 15 && R.balance(st.points) === 35 && r.added[0].source === 'practice');
  st.observations.push({ id: 'b1', type: 'bleeding', date: T, status: 'finished' });
  check('a body observation is not a practice', R.recompute(st, T).gained === 0);
  st.log.obs.push({ type: 'mood', value: 'x', start: T, confirmed: true }, null, 'nope', { id: 7, confirmed: true, start: T });
  check('entries without a string id earn nothing and break nothing', R.recompute(st, T).gained === 0 && R.balance(st.points) === 35);
}
/* the daily cap: 60 on the day the entry was saved, counted across logs and practices */
{
  const st = blank();
  for (let i = 0; i < 7; i++) st.log.obs.push(logObs(T));
  let r = R.recompute(st, T);
  check('seven entries in a day: 60, not 70', r.gained === 60 && R.balance(st.points) === 60);
  check('the seventh entry is remembered with nothing earned', st.points.entries.length === 7 && st.points.entries[6].n === 0);
  st.observations.push(practice(T));
  check('a practice past the cap earns nothing that day', R.recompute(st, T).gained === 0 && st.points.entries.length === 8);
  st.log.obs.push(logObs(day(6)));
  check('the next day starts fresh', R.recompute(st, day(6)).gained === 10 && R.balance(st.points) === 70);
  const st2 = blank();
  for (let i = 0; i < 4; i++) st2.observations.push(practice(T));
  st2.log.obs.push(logObs(T));
  r = R.recompute(st2, T);
  check('four practices and a log in a day: 60 with the cap on the last', r.gained === 60 && st2.points.entries.map(e => e.n).join() === '10,15,15,15,5');
  check('a day cap counts the day the entry was saved, not the day it describes', (() => {
    const s = blank(); s.log.obs.push(logObs(day(1), { created: iso(day(3)) }));
    R.recompute(s, day(3)); return s.points.entries[0].date === day(3);
  })());
  check('a record without a stamp falls back to its own date, then today', (() => {
    const s = blank(); s.log.obs.push({ id: 'a', confirmed: true, start: day(2) }, { id: 'b', confirmed: true });
    R.recompute(s, day(4)); return s.points.entries[0].date === day(2) && s.points.entries[1].date === day(4);
  })());
  check('a mangled ledger repairs itself from its entries', (() => {
    const s = blank(); s.points = { total: 999, spent: -5, entries: [{ id: 'x', date: T, source: 'log', n: 10 }, { bad: true }, null, { id: 'y', date: T, source: 'seed:turnip', n: -20 }] };
    R.recompute(s, T); return s.points.total === 10 && s.points.spent === 20 && s.points.entries.length === 2;
  })());
}
/* ---------- spending ---------- */
{
  const st = blank();
  for (let i = 0; i < 5; i++) st.log.obs.push(logObs(T));
  R.recompute(st, T);
  check('fifty points to spend', R.balance(st.points) === 50);
  check('prices: turnip 20, carrot 30, sunflower 40, anything else 30', R.price('turnip') === 20 && R.price('carrot') === 30 && R.price('sunflower') === 40 && R.price('mystery') === 30);
  const shelf = R.catalog(F.CROPS);
  check('the shelf lists the farm crops only', shelf.map(s => s.crop).join() === 'turnip,carrot,sunflower' && shelf.every(s => s.name && s.price > 0));
  const hearts = JSON.stringify(st.daily);
  let b = R.buy(st, 'sunflower', T, F.CROPS);
  check('buy a sunflower seed: 40 spent', b.ok && b.price === 40 && b.balance === 10 && st.points.spent === 40 && R.balance(st.points) === 10);
  check('the seed is in the farm the way the shed puts it', st.farm.seeds.sunflower === 1 && Object.keys(st.farm.seeds).join() === 'sunflower');
  check('the spend is its own entry', st.points.entries[st.points.entries.length - 1].n === -40 && /seed:sunflower/.test(st.points.entries[st.points.entries.length - 1].source));
  b = R.buy(st, 'carrot', T, F.CROPS);
  check('a carrot at 30 with 10 left is refused with how many more', !b.ok && b.reason === 'short' && b.need === 20 && R.balance(st.points) === 10 && !st.farm.seeds.carrot);
  check('a crop the farm does not grow is refused', !R.buy(st, 'moonPearl', T, F.CROPS).ok && !R.buy(st, 'constructor', T, F.CROPS).ok);
  check('buying never touches hearts', JSON.stringify(st.daily) === hearts);
  check('spend refuses zero, fractions and more than she has', !R.spend(st.points, 0, 's', T) && !R.spend(st.points, 2.5, 's', T) && !R.spend(st.points, 11, 's', T) && R.spend(st.points, 10, 'test', T) && R.balance(st.points) === 0);
  check('recompute after spending changes nothing', R.recompute(st, T).gained === 0 && R.balance(st.points) === 0 && st.points.total === 50 && st.points.spent === 50);
  const farm = F.fresh(6); st.farm = farm; st.log.obs.push(logObs(day(7)), logObs(day(7))); R.recompute(st, day(7));
  R.buy(st, 'turnip', day(7), F.CROPS);
  check('the shed still gives its three free seeds a day beside a bought one', F.takeSeeds(farm, day(7)) === 'turnip' && farm.seeds.turnip === 2 && F.takeSeeds(farm, day(7)) === 'carrot' && F.takeSeeds(farm, day(7)) === 'sunflower' && F.takeSeeds(farm, day(7)) === null);
  check('a bought seed plants like any other', (() => { farm.beds[0].state = 'tilled'; const r = F.act(farm, 0, day(7)); return r.action === 'plant' && farm.seeds[r.crop] === (r.crop === 'turnip' ? 1 : 0); })());
  check('buying into a save without a seeds map makes one', (() => { const s = blank(); delete s.farm.seeds; s.log.obs.push(logObs(T), logObs(T)); R.recompute(s, T); return R.buy(s, 'turnip', T, F.CROPS).ok && s.farm.seeds.turnip === 1; })());
}
/* ---------- plants for the home ---------- */
{
  const names = Object.keys(R.PLANTS);
  check('six plants: orchid, monstera, bonsai, tulips, pothos, cactus', names.join() === 'orchid,monstera,bonsai,tulips,pothos,cactus');
  check('every plant costs 40 to 80 points and has a frame and a line', names.every(k => R.PLANTS[k].price >= 40 && R.PLANTS[k].price <= 80 && typeof R.PLANTS[k].frame === 'number' && R.PLANTS[k].line));
  check('frames match the keyed strip in reading order', names.map(k => R.PLANTS[k].frame).join() === '0,1,2,3,4,5' && JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'art/dome/plants.json'), 'utf8')).frames === 6);
  check('keeper and plant strips are on disk', ['art/dome/keeper.webp', 'art/dome/keeper.json', 'art/dome/plants.webp'].every(f => fs.existsSync(path.join(__dirname, '..', f))));
  const spots = Object.keys(R.HOME_SPOTS);
  check('four places across the three rooms, one or two each', spots.length === 4 && ['bedroom', 'living', 'bathroom'].every(r => { const n = spots.filter(k => R.HOME_SPOTS[k].scene === r).length; return n >= 1 && n <= 2; }));
  check('every place names a room the engine has and sits on its square plate', spots.every(k => { const sp = R.HOME_SPOTS[k]; return W.SCENES[sp.scene] && !W.SCENES[sp.scene].aspect && sp.x > 0 && sp.x < 100 && sp.y > 0 && sp.y < 100 && sp.label; }));
  check('a place is on a surface, not on the walkable floor', spots.every(k => { const sp = R.HOME_SPOTS[k]; return !W.walkable(sp.scene, { x: sp.x, y: sp.y }); }));
  const st = blank();
  for (let i = 0; i < 6; i++) st.log.obs.push(logObs(day(1)), logObs(day(2)), logObs(day(3)));
  R.recompute(st, day(3));
  check('180 points to garden with', R.balance(st.points) === 180);
  const hearts = JSON.stringify(st.daily);
  let b = R.buyPlant(st, 'orchid', day(2), 'bedroom.window');
  check('buy an orchid for the window seat: 60 spent, it stands there', b.ok && b.price === 60 && b.balance === 120 && st.homePlants.plants.length === 1 && st.homePlants.plants[0].plant === 'orchid' && st.homePlants.plants[0].spot === 'bedroom.window');
  check('the plant is drawn in the bedroom only', R.plantsIn(st.homePlants, 'bedroom').length === 1 && R.plantsIn(st.homePlants, 'bedroom')[0].x === 61 && R.plantsIn(st.homePlants, 'living').length === 0);
  check('the spend is a plant entry', st.points.entries[st.points.entries.length - 1].n === -60 && /plant:orchid/.test(st.points.entries[st.points.entries.length - 1].source));
  b = R.buyPlant(st, 'cactus', day(2), 'bedroom.window');
  check('a cactus in the same place puts the orchid away', b.ok && R.occupant(st.homePlants, 'bedroom.window').plant === 'cactus' && st.homePlants.plants[0].spot === null && R.balance(st.points) === 80);
  check('the list shows the place taken and the orchid put away', R.spotList(st.homePlants).find(s => s.spot === 'bedroom.window').occupantName === 'Cactus' && R.spotList(st.homePlants).filter(s => s.occupant).length === 1);
  check('move the orchid to the bathroom shelf', R.place(st.homePlants, st.homePlants.plants[0].id, 'bathroom.shelf') && R.plantsIn(st.homePlants, 'bathroom').length === 1);
  check('put the cactus away', R.place(st.homePlants, st.homePlants.plants[1].id, null) && R.plantsIn(st.homePlants, 'bedroom').length === 0 && st.homePlants.plants[1].spot === null);
  check('a place that does not exist is refused', !R.place(st.homePlants, st.homePlants.plants[0].id, 'attic.window') && !R.buyPlant(st, 'tulips', day(2), 'attic.window').ok && R.balance(st.points) === 80);
  check('an unknown plant or id is refused', !R.buyPlant(st, 'triffid', day(2), null).ok && !R.place(st.homePlants, 'nope', null));
  b = R.buyPlant(st, 'monstera', day(2), null);
  check('buy a monstera and keep it for later', b.ok && b.spot === null && st.homePlants.plants[2].spot === null && R.balance(st.points) === 10);
  b = R.buyPlant(st, 'bonsai', day(2), 'living.sill');
  check('a bonsai at 80 with 10 left is refused and nothing changes', !b.ok && b.reason === 'short' && b.need === 70 && st.homePlants.plants.length === 3 && !R.occupant(st.homePlants, 'living.sill'));
  check('ids are unique', new Set(st.homePlants.plants.map(p => p.id)).size === 3);
  check('buying plants never touches hearts or seeds', JSON.stringify(st.daily) === hearts && Object.keys(st.farm.seeds).length === 0);
  check('recompute after plants changes nothing', R.recompute(st, day(3)).gained === 0 && R.balance(st.points) === 10);
  const broken = R.ensureHome({ plants: [{ id: 'a', plant: 'orchid', spot: 'living.sill' }, { id: 'b', plant: 'orchid', spot: 'living.sill' }, { id: 'c', plant: 'weed', spot: null }, null, { id: 'd', plant: 'cactus', spot: 'nowhere' }] });
  check('a mangled plant list is repaired: one per place, unknown plants dropped, unknown places put away', broken.plants.length === 3 && broken.plants[0].spot === 'living.sill' && broken.plants[1].spot === null && broken.plants[2].spot === null);
  check('the keeper has a line for every day, none with an em dash', [day(0), day(1), day(2), day(3), 'x'].every(d => typeof R.keeperLine(d) === 'string' && R.keeperLine(d).length > 0) && R.KEEPER_LINES.every(l => !/—/.test(l)));
  check('plant copy has no em dash', names.every(k => !/—/.test(R.PLANTS[k].line + R.PLANTS[k].name)) && spots.every(k => !/—/.test(R.HOME_SPOTS[k].label)));
}

/* ---------- the rules never read what she wrote ---------- */
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'js/dome/rules.js'), 'utf8');
  check('rules never read a note\'s value, text or type of log entry', !/\.value\b|sourceText|\.text\b/.test(src));
  check('rules never read hearts', !/daily|hearts/.test(src));
  [R.EARN_LINE, R.shortLine(1), R.shortLine(12)].forEach((s, i) => check(`copy ${i} has no em dash`, !/—/.test(s)));
  check('short line counts', R.shortLine(1) === 'One more point and this is yours.' && /^12 more points/.test(R.shortLine(12)));
}

/* ---------- the place: every stand and door reachable, from the start and from every arrival ---------- */
check('dome registered', !!W.SCENES.dome && W.SCENES.dome.indoor === true);
check('the stall is a seedshop spot', W.SCENES.dome.spots.some(s => s.kind === 'seedshop' && s.id === 'stall'));
check('merlion has a door to the dome', W.SCENES.merlion.doors.some(d => d.to === 'dome' && d.id === 'toDome'));
check('the dome has a door to merlion', W.SCENES.dome.doors.some(d => d.to === 'merlion'));
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
/* the dome in full; on Merlion Park only the door this extension adds (the park's own doors belong to the engine) */
['dome', 'merlion'].forEach(id => {
  const s = Object.assign({}, W.SCENES[id], { doors: W.SCENES[id].doors.filter(d => id === 'dome' || d.id === 'toDome') });
  entries(id).forEach(e => {
    check(`${id} ${e.name} walkable`, W.walkable(id, e.pt));
    check(`${id} ${e.name} not inside a door`, !W.doorAt(id, e.pt));
    s.spots.forEach(sp => {
      check(`${id}/${sp.id} stand walkable`, W.walkable(id, sp.stand));
      check(`${id}/${sp.id} stand not inside a door`, !W.doorAt(id, sp.stand));
      const p = W.plan(id, e.pt, sp.stand);
      check(`${id}/${sp.id} reachable ${e.name}`, !!p && legsAvoidDoors(id, e.pt, p, null));
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
    check(`${id}/${d.id} rect is on the floor`, W.inFloor(id, { x: (d.rect[0] + d.rect[2]) / 2, y: (d.rect[1] + d.rect[3]) / 2 }));
  });
  check(`${id} start is not inside a solid`, W.walkable(id, s.start));
});
check('the bench stand is beside the bench, the stall stand below the stall', (() => { const s = W.SCENES.dome, b = s.spots.find(x => x.id === 'bench'), st = s.spots.find(x => x.id === 'stall'); return Math.hypot(b.stand.x - b.at.x, b.stand.y - b.at.y) < 12 && st.stand.y > st.at.y && Math.abs(st.stand.x - st.at.x) < 14; })());
check('the dome\'s floor stays inside the plate', W.SCENES.dome.floor.every(p => p[0] >= 0 && p[0] <= 100 && p[1] >= 0 && p[1] <= W.units('dome')));

/* ---------- the map pin ---------- */
check('the map has a dome pin on the dome scene', !!M.pin('dome') && M.pin('dome').scene === 'dome' && M.pin('dome').icon === 'dome');
check('the dome pin opens and travels to the dome start', M.status(M.pin('dome'), W.SCENES, 'farm') === 'open' && M.status(M.pin('dome'), W.SCENES, 'dome') === 'here' && M.arrival(M.pin('dome'), W.SCENES) === undefined);
check('the pin keeps apart from the others', M.PINS.every(p => p.id === 'dome' || Math.hypot(p.x - M.pin('dome').x, p.y - M.pin('dome').y) >= 9));

/* ---------- the page ---------- */
{
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  check('index loads dome.js once, after the engine', html.split('js/ext/dome.js').length === 2 && html.indexOf('js/ext/dome.js') > html.indexOf('js/ebb-game.js'));
  check('index loads dome.css once', html.split('css/ext/dome.css').length === 2);
  check('the plate is on disk', fs.existsSync(path.join(__dirname, '..', W.SCENES.dome.plate)));
  ['js/ext/dome.js', 'js/dome/rules.js', 'css/ext/dome.css', 'tools/smoke_dome.py'].forEach(f => check(`${f} has no em dash`, !/—/.test(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'))));
  const ext = fs.readFileSync(path.join(__dirname, '..', 'js/ext/dome.js'), 'utf8');
  check('the extension never reads hearts or the daily record', !/\.daily\b|hearts/i.test(ext.replace(/\/\*[\s\S]*?\*\//g, '')));
  check('the map icon exists', /dome: '<path/.test(fs.readFileSync(path.join(__dirname, '..', 'js/ext/map.js'), 'utf8')));
  check('the keeper is a still prop beside the stall, never a walker', /registerProps\('dome'/.test(ext) && !/walkTo|setInterval\([^)]*keeper/i.test(ext.replace(/\/\*[\s\S]*?\*\//g, '').replace(/pollTimer = setInterval[^;]*;/, '')));
  check('plants are drawn in the three rooms', /\['bedroom', 'living', 'bathroom'\]\.forEach/.test(ext));
}

process.on('beforeExit', () => { console.log(`test-dome: ${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0; });
