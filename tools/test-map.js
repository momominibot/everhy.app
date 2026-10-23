/* Node checks for the map: every pin names a scene or is coming soon, travel closes the sheet before it calls enter with
 * a known scene, and a pin opens up once its place registers. Run: node tools/test-map.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

let pass = 0, fail = 0;
function check(name, ok) { if (ok) pass++; else { fail++; console.log('FAIL', name); } }

function world() { /* a fresh copy of the core world plus the map module, with no page */
  const ctx = { console, Math, JSON, Object, Array, String, Number };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  ['js/ebb-world.js', 'js/ext/map.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f }));
  return ctx;
}
/* what the world workstream adds (js/ext/world.js): the hot spring and a fishing spot by the pond */
function addWorld(W) {
  W.register('spring', { name: 'Hot spring', plate: '', floor: [[2, 56], [12, 58], [16, 76], [98, 76], [98, 98], [2, 98]], start: { x: 12, y: 82 } });
  W.SCENES.jetty.spots.push({ id: 'fishing', kind: 'fish', at: { x: 80, y: 88 }, stand: { x: 76, y: 92 }, label: 'Fish from the jetty' });
}
/* a stand-in for EbbGame.api that records calls in order */
function fakeApi(scene, log) {
  return { scene: () => scene, enter: (id, at) => { log.push(['enter', id, at]); scene = id; } };
}

(() => {
  const { EbbMap: M, EbbWorld: W } = world();
  const ids = M.PINS.map(p => p.id);
  check('pin ids are unique', new Set(ids).size === ids.length);
  check('the seven places are on the map', ['home', 'farm', 'hawker', 'waterfall', 'spring', 'merlion', 'pier'].every(id => ids.includes(id)));
  M.PINS.forEach(p => {
    check(`${p.id} has a label and a scene id`, typeof p.label === 'string' && p.label.length > 0 && typeof p.scene === 'string' && p.scene.length > 0);
    check(`${p.id} sits on the map`, p.x >= 4 && p.x <= 96 && p.y >= 8 && p.y <= 94);
    const st = M.status(p, W.SCENES, 'bedroom');
    check(`${p.id} names a scene or is coming soon`, (W.SCENES[p.scene] && st !== 'soon') || st === 'soon');
    check(`${p.id} copy has no em dash`, !/—/.test(p.label + (p.note || '')));
  });
  check('home is the bedroom', M.pin('home').scene === 'bedroom');
  check('home counts the bathroom as home', M.status(M.pin('home'), W.SCENES, 'bathroom') === 'here');
  check('pins keep apart on the map', M.PINS.every((a, i) => M.PINS.every((b, j) => j <= i || Math.hypot(a.x - b.x, a.y - b.y) >= 9)));

  /* the core world: home, farm and waterfall open; the rest wait for their workstream */
  const at = id => M.status(M.pin(id), W.SCENES, 'farm');
  check('core places open', at('home') === 'open' && at('waterfall') === 'open');
  check('her place is highlighted', at('farm') === 'here');
  check('spring and pier are coming soon', at('spring') === 'soon' && at('pier') === 'soon');

  /* travel: the sheet closes first, then enter with a known scene */
  let log = [];
  const close = () => log.push(['close']);
  check('travel to the waterfall', M.travel(M.pin('waterfall'), fakeApi('farm', log), close) === 'went');
  check('closed before enter', log.length === 2 && log[0][0] === 'close' && log[1][0] === 'enter');
  check('enter names a known scene', !!W.SCENES[log[1][1]] && log[1][1] === 'waterfall');
  check('scene pins arrive at the scene start', log[1][2] === undefined);

  log = [];
  let later = null;
  M.travel(M.pin('home'), fakeApi('farm', log), close, fn => { later = fn; });
  check('a fade waits: closed now, enter after', log.length === 1 && log[0][0] === 'close' && typeof later === 'function');
  later();
  check('enter after the fade', log.length === 2 && log[1][0] === 'enter' && log[1][1] === 'bedroom');

  log = [];
  check('coming soon does nothing', M.travel(M.pin('spring'), fakeApi('farm', log), close) === 'soon' && log.length === 0);
  check('coming soon pier does nothing', M.travel(M.pin('pier'), fakeApi('farm', log), close) === 'soon' && log.length === 0);
  log = [];
  check('her own place just closes', M.travel(M.pin('farm'), fakeApi('farm', log), close) === 'here' && log.length === 1 && log[0][0] === 'close');

  /* once the world workstream registers its places, the same pins open and every arrival is walkable */
  addWorld(W);
  check('spring opens', M.status(M.pin('spring'), W.SCENES, 'farm') === 'open');
  check('pier opens', M.status(M.pin('pier'), W.SCENES, 'farm') === 'open');
  check('pier is never "here", even by the waterfall', M.status(M.pin('pier'), W.SCENES, 'waterfall') === 'open');
  M.PINS.forEach(p => {
    const lg = [], res = M.travel(p, fakeApi('nowhere', lg), () => lg.push(['close']));
    check(`${p.id} travels when open`, res === 'went' && lg[0][0] === 'close' && lg[1][0] === 'enter' && !!W.SCENES[lg[1][1]]);
    const s = W.SCENES[p.scene], arrive = lg[1] && lg[1][2] || s.start;
    check(`${p.id} arrives on the floor`, W.walkable(p.scene, arrive));
  });
  log = [];
  M.travel(M.pin('pier'), fakeApi('farm', log), close);
  const arr = log[1] && log[1][0] === 'enter' ? log[1][2] : null;
  const fishSpot = W.SCENES.jetty.spots.filter(sp => sp.id === 'fishing')[0];
  check('pier arrives at the fishing stand point', !!arr && !!fishSpot && log[1][1] === 'jetty' && arr.x === fishSpot.stand.x && arr.y === fishSpot.stand.y);
  if (arr) arr.x = 0;
  check('arrival is a copy, not the spot itself', W.SCENES.jetty.spots.filter(s => s.id === 'fishing')[0].stand.x === 76);
  check('travel reads the world at tap time', M.status(M.pin('spring'), W.SCENES, 'spring') === 'here');
})();

/* art: once a picture is set it exists on disk; until then the placeholder island is used */
(() => {
  const { EbbMap: M } = world();
  const art = M.art();
  check('map art is unset or on disk', art === null || fs.existsSync(path.join(__dirname, '..', art)));
})();

/* with the real world workstream loaded, its spring and fishing spot open the same pins */
(() => {
  const f = path.join(__dirname, '..', 'js/ext/world.js');
  if (!fs.existsSync(f)) { console.log('note: js/ext/world.js not here, real-world check skipped'); return; }
  const ctx = world();
  vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: 'world.js' });
  const { EbbMap: M, EbbWorld: W } = ctx;
  M.PINS.forEach(p => {
    check(`${p.id} opens with the real world`, M.status(p, W.SCENES, 'nowhere') === 'open');
    const lg = [];
    M.travel(p, fakeApi('nowhere', lg), () => lg.push(['close']));
    const arrive = lg[1] && lg[1][2] || W.SCENES[p.scene].start;
    check(`${p.id} arrives on the real floor`, W.walkable(p.scene, arrive));
  });
})();

/* the page part leaves the engine's own files alone: the map adds exactly one script and one stylesheet line */
(() => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  check('index loads map.js once', html.split('js/ext/map.js').length === 2);
  check('index loads map.css once', html.split('css/ext/map.css').length === 2);
  check('map.js loads after the engine', html.indexOf('js/ext/map.js') > html.indexOf('js/ebb-game.js'));
  const src = fs.readFileSync(path.join(__dirname, '..', 'js/ext/map.js'), 'utf8');
  check('map copy has no em dash', !/—/.test(src));
})();

process.on('beforeExit', () => { console.log(`${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0; });
