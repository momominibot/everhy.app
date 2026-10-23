/* Node checks for Ebb sound (js/ext/sound.js): which place sounds like what, which frames make a footstep or an action
 * sound, the remembered choice with broken storage, and every voice and ambience built on a strict stand-in
 * AudioContext (finite values, exponential ramps above zero, every source stopped). Levels are checked in a real
 * browser by tools/smoke_sound.py. Run: node tools/test-sound.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
function check(name, ok) { if (ok) pass++; else { fail++; console.log('FAIL', name); } }

function load(storage) {
  const ctx = { console, Math, JSON, Date, Object, Array, String, Number, Error, WeakMap, isNaN };
  ctx.globalThis = ctx;
  if (storage !== undefined) ctx.localStorage = storage;
  vm.createContext(ctx);
  ['js/ebb-world.js', 'js/ext/sound.js'].forEach(f => vm.runInContext(read(f), ctx, { filename: f }));
  return ctx;
}
const memStore = () => { const m = {}; return { m, getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; };

const ctx = load(memStore()), S = ctx.EbbSound, W = ctx.EbbWorld;
check('loads in node without a page', !!S && typeof S.events === 'function');

/* ---------- places ---------- */
check('bedroom is room tone', S.placeSound('bedroom', W.SCENES.bedroom) === 'room');
check('farm is birds and breeze', S.placeSound('farm', W.SCENES.farm) === 'meadow');
check('Little Guilin is a lakeside park', S.placeSound('waterfall', W.SCENES.waterfall) === 'meadow');
check('bathroom is room tone with drips', S.placeSound('bathroom', W.SCENES.bathroom) === 'bath');
check('an indoor scene reads as a room', S.placeSound('library', { name: 'Library', indoor: true }) === 'room');
check('hot spring is lapping water', S.placeSound('spring', { name: 'Hot spring' }) === 'spring');
check('a scene can name its sound', S.placeSound('cave', { name: 'Cave', sound: 'falls' }) === 'falls');
check('an unknown sound name is ignored', S.placeSound('kitchen', { name: 'Kitchen', sound: 'disco' }) === 'room');
check('unknown indoor names read as a room', S.placeSound('teaShop', { name: 'Tea shop' }) === 'room');
check('unknown river names read as water', S.placeSound('x1', { name: 'River bank' }) === 'falls');
check('unknown outdoor places are a meadow', S.placeSound('orchard', { name: 'Orchard' }) === 'meadow');
check('no scene at all still answers', S.placeSound(undefined, undefined) === 'meadow');
Object.keys(W.SCENES).forEach(id => {
  const a = S.placeSound(id, W.SCENES[id]), f = S.surfaceFor(id, W.SCENES[id]);
  check(`scene ${id} has a real ambience`, !!S.AMBIENCES[a]);
  check(`scene ${id} has a footstep`, !!S.VOICES['step:' + f]);
});
check('wooden floors indoors', S.surfaceFor('bedroom', W.SCENES.bedroom) === 'wood' && S.surfaceFor('living', W.SCENES.living) === 'wood');
check('tiles in the bathroom', S.surfaceFor('bathroom', W.SCENES.bathroom) === 'tile');
check('soil on the farm', S.surfaceFor('farm', W.SCENES.farm) === 'soil');
check('grass at the falls and spring', S.surfaceFor('waterfall', W.SCENES.waterfall) === 'grass' && S.surfaceFor('spring', {}) === 'grass');
check('a scene can name its floor', S.surfaceFor('farm', { surface: 'wood' }) === 'wood');
check('an unknown floor falls back', S.surfaceFor('farm', { surface: 'lava' }) === 'soil');

/* ---------- events ---------- */
const base = { scene: 'farm', surface: 'soil', action: 'idle', tool: 'none', phase: 0, fading: false, offerings: 0, gift: false };
const snap = o => Object.assign({}, base, o);
check('first frame makes no sound', S.events(null, snap({})).length === 0);
check('idle makes no sound', S.events(snap({ phase: 0.1 }), snap({ phase: 0.2 })).length === 0);
check('crossing wraps', S.crossed(0.9, 0.3, 0.25) && !S.crossed(0.9, 0.05, 0.25) && S.crossed(0.2, 0.3, 0.25) && !S.crossed(0.3, 0.7, 0.25));

/* walk at 60 frames a second with the engine's phase speed (1.3 a second) for 5 seconds */
function walkFor(secs, from, fps) {
  let a = snap({ action: 'idle', phase: from }), out = [];
  for (let i = 0; i < secs * fps; i++) {
    const b = snap({ action: 'walk', phase: (a.phase + 1.3 / fps) % 1 });
    out = out.concat(S.events(a, b)); a = b;
  }
  return out;
}
[0, 0.1, 0.24, 0.5, 0.74, 0.9].forEach(start => {
  const ev = walkFor(5, start, 60), steps = ev.filter(e => e === 'step:soil').length;
  check(`about 2.6 steps a second (start ${start}): ${steps}`, steps >= 12 && steps <= 14 && ev.length === steps);
});
check('frame rate does not change the step count', Math.abs(walkFor(5, 0.1, 30).length - walkFor(5, 0.1, 120).length) <= 1);
check('the first step comes as she sets off', S.events(snap({ phase: 0.5 }), snap({ action: 'walk', phase: 0.52 })).join() === 'step:soil');
check('no doubled first step just before a footfall', S.events(snap({ phase: 0.2 }), snap({ action: 'walk', phase: 0.22 })).length === 0);
check('step names the floor', S.events(snap({ action: 'walk', phase: 0.2, surface: 'wood' }), snap({ action: 'walk', phase: 0.3, surface: 'wood' })).join() === 'step:wood');
check('no steps during a door fade', S.events(snap({ action: 'walk', phase: 0.2, fading: true }), snap({ action: 'walk', phase: 0.3, fading: true })).length === 0);

['hoe', 'seed', 'can', 'pick'].forEach(tool => {
  check(`${tool} sounds when work starts`, S.events(snap({}), snap({ action: 'work', tool })).join() === tool);
  check(`${tool} sounds once`, S.events(snap({ action: 'work', tool, phase: 0.2 }), snap({ action: 'work', tool, phase: 0.4 })).length === 0);
});
check('a new tool mid-work sounds', S.events(snap({ action: 'work', tool: 'hoe' }), snap({ action: 'work', tool: 'seed' })).join() === 'seed');
check('work with no tool is silent', S.events(snap({}), snap({ action: 'work', tool: 'none' })).length === 0);
check('an unknown tool is silent', S.events(snap({}), snap({ action: 'work', tool: 'brush' })).length === 0);
check('sitting is silent', S.events(snap({}), snap({ action: 'sit' })).length === 0);

check('a door fade starting is a swoosh', S.events(snap({ action: 'walk', phase: 0.1 }), snap({ action: 'walk', phase: 0.12, fading: true })).join() === 'swoosh');
check('the scene changing inside the fade: only the visit', S.events(snap({ fading: true }), snap({ scene: 'waterfall', surface: 'grass', fading: false })).join() === 'visit:waterfall');
check('coming indoors adds the latch', S.events(snap({ fading: true }), snap({ scene: 'bedroom', indoor: true, surface: 'wood' })).join() === 'door,visit:bedroom');
check('going outdoors adds the latch', S.events(snap({ scene: 'bedroom', indoor: true, fading: true }), snap({ scene: 'farm' })).join() === 'door,visit:farm');
check('room to room adds the latch', S.events(snap({ scene: 'bedroom', indoor: true, fading: true }), snap({ scene: 'bathroom', indoor: true })).join() === 'door,visit:bathroom');
check('a jump with no fade is a swoosh', S.events(snap({}), snap({ scene: 'waterfall' })).join() === 'swoosh,visit:waterfall');
check('a scene change carries no stale step', S.events(snap({ action: 'walk', phase: 0.2 }), snap({ scene: 'waterfall', action: 'walk', phase: 0.3 })).join() === 'swoosh,visit:waterfall');
check('an offering chimes', S.events(snap({ offerings: 2 }), snap({ offerings: 3 })).join() === 'chime');
check('the gift has its own chime', S.events(snap({ offerings: 4 }), snap({ offerings: 5, gift: true })).join() === 'gift');
check('an old gift does not repeat', S.events(snap({ offerings: 5, gift: true }), snap({ offerings: 6, gift: true })).join() === 'chime');
check('fewer offerings (a reset) is silent', S.events(snap({ offerings: 3 }), snap({ offerings: 0 })).length === 0);
check('something in the basket sparkles', S.events(snap({ basket: 1 }), snap({ basket: 2 })).join() === 'sparkle');
check('a new heart sparkles', S.events(snap({ hearts: 2 }), snap({ hearts: 3 })).join() === 'sparkle');
check('a basket and a heart at once: one sparkle', S.events(snap({ basket: 0, hearts: 0 }), snap({ basket: 1, hearts: 1 })).join() === 'sparkle');
check('taking from the basket is silent', S.events(snap({ basket: 3 }), snap({ basket: 2 })).length === 0);
check('a harvest: pick and sparkle', S.events(snap({ basket: 0 }), snap({ action: 'work', tool: 'pick', basket: 1 })).sort().join() === 'pick,sparkle');
check('an offering out of the basket only chimes', S.events(snap({ basket: 2, offerings: 0 }), snap({ basket: 1, offerings: 1 })).join() === 'chime');

/* ---------- first times ---------- */
const seen = {};
check('the first hoe is new', S.newFirsts(['hoe'], seen).join() === 'hoe' && seen.hoe === true);
check('the second hoe is not', S.newFirsts(['hoe'], seen).length === 0);
check('steps, ticks and sparkles are never firsts', S.newFirsts(['step:soil', 'tick', 'sparkle', 'swoosh', 'door', 'gift'], seen).length === 0);
check('a first visit is new once', S.newFirsts(['swoosh', 'visit:waterfall'], seen).join() === 'visit:waterfall' && S.newFirsts(['visit:waterfall'], seen).length === 0);
check('the first offering is new', S.newFirsts(['chime'], seen).join() === 'chime');
check('seed, can and pick each count', S.newFirsts(['seed', 'can', 'pick'], seen).join() === 'seed,can,pick');

/* ---------- gaps: no sound can repeat faster than its gap ---------- */
const last = {};
check('a tick plays', S.allowed('tick', 10, last));
check('a second tick 20 ms later does not', !S.allowed('tick', 10.02, last));
check('a tick after its gap does', S.allowed('tick', 10.1, last));
check('a pop and a tick are separate', S.allowed('pop', 10.1, last));
let n = 0; for (let t = 0; t < 1; t += 1 / 60) if (S.allowed('sparkle', 20 + t, last)) n++;
check(`a sparkle asked for every frame plays at most ${Math.ceil(1 / S.GAP.sparkle)} times a second (${n})`, n <= Math.ceil(1 / S.GAP.sparkle));
check('footsteps have no gap (they follow the walk)', S.allowed('step:wood', 30, last) && S.allowed('step:wood', 30.001, last));

/* ---------- where she stands ---------- */
const fall = W.SCENES.waterfall, pond = fall.spots.find(s => s.kind === 'pond');
const wm = p => S.mixFor('falls', 'waterfall', fall, p);
check('waterfall: full at the pond', wm(pond.stand).water > 0.95);
check('waterfall: quiet at the far path', wm(fall.start).water < 0.3); /* the 23 Oct plate's path starts nearer the pond */
let mono = true, prevW = -1;
for (let i = 0; i <= 20; i++) { const p = { x: fall.start.x + (pond.stand.x - fall.start.x) * i / 20, y: fall.start.y + (pond.stand.y - fall.start.y) * i / 20 }, w = wm(p).water; if (w < prevW - 1e-9) mono = false; prevW = w; }
check('waterfall: grows steadily as she walks to the pond', mono);
check('waterfall: heard from the right when it is to her right', wm({ x: 10, y: 140 }).pan > 0 && wm({ x: 90, y: 140 }).pan < 0);
const farm = W.SCENES.farm, bm = p => S.mixFor('meadow', 'farm', farm, p).birds;
check(`farm: birds louder by the tree than by the shed (${bm({ x: 47, y: 106 }).toFixed(2)} vs ${bm({ x: 17, y: 108 }).toFixed(2)})`, bm({ x: 47, y: 106 }) > bm({ x: 17, y: 108 }) + 0.3);
check(`farm: birds louder at the top than at the bottom (${bm({ x: 70, y: 106 }).toFixed(2)} vs ${bm({ x: 70, y: 172 }).toFixed(2)})`, bm({ x: 70, y: 106 }) > bm({ x: 70, y: 172 }) + 0.2);
check('farm: birds never vanish', [[17, 108], [70, 172], [95, 172], [5, 172]].every(([x, y]) => bm({ x, y }) >= 0.1));
check('a meadow with no sources still has birds, more at the top', S.mixFor('meadow', 'orchard', { floor: [[0, 50], [100, 50], [100, 100], [0, 100]] }, { x: 50, y: 52 }).birds > S.mixFor('meadow', 'orchard', { floor: [[0, 50], [100, 50], [100, 100], [0, 100]] }, { x: 50, y: 98 }).birds);
const painted = W.SCENES.bathroom, pm = p => S.mixFor('bath', 'bathroom', painted, p).drips, tubAt = S.SOURCES.bathroom.tub;
check(`bathroom: the painted tub is above the floor, as drawn`, !W.walkable(painted, { x: tubAt[0], y: tubAt[1] }));
check(`bathroom: drips on the floor beside the painted tub (${pm({ x: 44, y: 62 }).toFixed(2)})`, W.walkable(painted, { x: 44, y: 62 }) && pm({ x: 44, y: 62 }) > 0.8);
check(`bathroom: quiet in the far corner (${pm({ x: 85, y: 170 }).toFixed(2)})`, pm({ x: 85, y: 170 }) < 0.1);
const bath = Object.assign({}, W.SCENES.bathroom, { layout: [{ item: 'bathtub', x: 36, y: 104 }] }), dm = p => S.mixFor('bath', 'bathroom', bath, p).drips;
check(`bathroom while redecorating: drips by the moved tub (${dm({ x: 36, y: 108 }).toFixed(2)})`, dm({ x: 36, y: 108 }) > 0.9);
check(`bathroom while redecorating: quiet far from it (${dm({ x: 90, y: 172 }).toFixed(2)})`, dm({ x: 90, y: 172 }) < 0.1);
const moved = Object.assign({}, bath, { layout: [{ item: 'bathtub', x: 80, y: 170 }] });
check('bathroom: the drips follow the tub when she moves it', S.mixFor('bath', 'bathroom', moved, { x: 80, y: 168 }).drips > 0.9 && S.mixFor('bath', 'bathroom', moved, { x: 36, y: 108 }).drips < 0.3);
check('a bath place with no tub: no drips', S.mixFor('bath', 'washroom', W.SCENES.bedroom, { x: 50, y: 120 }).drips === 0);
check('a room has no drips', S.mixFor('room', 'bedroom', W.SCENES.bedroom, { x: 50, y: 120 }).drips === 0);
check('bad positions give the plain mix', S.mixFor('falls', 'waterfall', fall, { x: NaN, y: 3 }).water === 1 && S.mixFor('falls', 'waterfall', null, { x: 1, y: 1 }).water === 1);
check('every mix value stays in range', [[2, 108], [50, 110], [98, 175], [-50, 400]].every(([x, y]) => ['falls', 'meadow', 'bath', 'room'].every(a => {
  const m = S.mixFor(a, a === 'falls' ? 'waterfall' : 'farm', a === 'bath' ? bath : a === 'falls' ? fall : farm, { x, y });
  return [m.water, m.birds, m.drips].every(v => v >= 0 && v <= 1) && m.pan >= -1 && m.pan <= 1;
})));

/* ---------- the remembered choice ---------- */
const st = memStore(), c2 = load(st);
check('off by default', c2.EbbSound.readPref() === false);
check('write then read on', c2.EbbSound.writePref(true) && c2.EbbSound.readPref() === true && st.m.ebb_sound_v1 === '{"on":true}');
check('write then read off', c2.EbbSound.writePref(false) && c2.EbbSound.readPref() === false);
st.m.ebb_sound_v1 = '{oops'; check('broken JSON reads as off', c2.EbbSound.readPref() === false);
st.m.ebb_sound_v1 = '"on"'; check('a stray string reads as off', c2.EbbSound.readPref() === false);
st.m.ebb_sound_v1 = '{"on":"yes"}'; check('only true turns it on', c2.EbbSound.readPref() === false);
const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); }, removeItem() { throw new Error('denied'); } };
const c3 = load(throwing);
let threw = false; try { check('read with storage that throws is off', c3.EbbSound.readPref() === false); check('write with storage that throws says no', c3.EbbSound.writePref(true) === false); } catch (e) { threw = true; }
check('storage that throws never throws out', !threw);
const c4 = load(undefined);
check('no storage at all', c4.EbbSound.readPref() === false && c4.EbbSound.writePref(true) === false);
check('the key', S.KEY === 'ebb_sound_v1');

/* ---------- every sound on a strict stand-in AudioContext ---------- */
function fakeContext() {
  const problems = [], sources = [];
  let now = 0;
  const finite = (v, what) => { if (typeof v !== 'number' || !isFinite(v)) problems.push(what + ' not finite: ' + v); };
  const param = (name, v) => ({
    _v: v, get value() { return this._v; }, set value(x) { finite(x, name + '.value'); this._v = x; },
    setValueAtTime(x, t) { finite(x, name); finite(t, name + ' time'); return this; },
    linearRampToValueAtTime(x, t) { finite(x, name); finite(t, name + ' time'); return this; },
    exponentialRampToValueAtTime(x, t) { finite(x, name); finite(t, name + ' time'); if (!(x > 0)) problems.push(name + ' exponential ramp to ' + x); return this; },
    setTargetAtTime(x, t) { finite(x, name); finite(t, name + ' time'); return this; },
    cancelScheduledValues(t) { finite(t, name + ' cancel'); return this; }
  });
  const node = extra => Object.assign({ connected: [], connect(n) { if (!n) problems.push('connect to nothing'); this.connected.push(n); return n; }, disconnect() { } }, extra);
  const source = extra => {
    const s = node(Object.assign({ started: null, stopped: null,
      start(t, off) { finite(t || 0, 'start'); if (off !== undefined) finite(off, 'offset'); if (this.started !== null) problems.push('started twice'); this.started = t || 0; if (off !== undefined && off < 0) problems.push('negative offset'); this.offset = off || 0; },
      stop(t) { finite(t, 'stop'); this.stopped = t; } }, extra));
    sources.push(s); return s;
  };
  const c = {
    sampleRate: 8000 /* checks parameters only, so a low rate keeps noise buffers cheap */, get currentTime() { return now; }, destination: node({}),
    createBuffer(ch, n, sr) { const d = new Float32Array(n); return { duration: n / sr, length: n, getChannelData: () => d }; },
    createBufferSource() { return source({ buffer: null, loop: false }); },
    createOscillator() { return source({ type: 'sine', frequency: param('osc.frequency', 440), detune: param('detune', 0) }); },
    createGain() { return node({ gain: param('gain', 1) }); },
    createBiquadFilter() { return node({ type: 'lowpass', frequency: param('filter.frequency', 350), Q: param('Q', 1), gain: param('fgain', 0) }); },
    createStereoPanner() { return node({ pan: param('pan', 0) }); },
    createDynamicsCompressor() { return node({ threshold: param('th', -24), knee: param('knee', 30), ratio: param('ratio', 12), attack: param('attack', 0.003), release: param('release', 0.25) }); }
  };
  return { c, problems, sources };
}
Object.keys(S.VOICES).forEach(name => {
  let probs = [], unstopped = 0, late = 0, n = 0, offsetsOk = true;
  for (let seed = 1; seed <= 12; seed++) {
    const f = fakeContext();
    try { S.render(f.c, name, { seed }); } catch (e) { probs.push(String(e)); }
    probs = probs.concat(f.problems); n += f.sources.length;
    f.sources.forEach(s => {
      if (s.started === null || s.stopped === null) unstopped++;
      else if (s.stopped > 0.05 + S.VOICES[name].dur + 0.03) late++;
      if (s.buffer && s.offset + (s.stopped - s.started) > s.buffer.duration + 1e-6) offsetsOk = false;
    });
  }
  check(`voice ${name} builds cleanly ${probs.slice(0, 2).join('; ')}`, probs.length === 0 && n > 0);
  check(`voice ${name}: every source starts and stops`, unstopped === 0);
  check(`voice ${name}: nothing outlasts its length (${S.VOICES[name].dur} s)`, late === 0);
  check(`voice ${name}: noise never runs past its buffer`, offsetsOk);
  check(`voice ${name}: length is short`, S.VOICES[name].dur > 0.1 && S.VOICES[name].dur <= 4);
});
Object.keys(S.AMBIENCES).forEach(name => {
  const f = fakeContext();
  let err = null; try { S.render(f.c, name, { seed: 3, seconds: 20 }); } catch (e) { err = String(e); }
  const unstoppedLoops = f.sources.filter(s => s.stopped === null).length;
  [{ water: 0, birds: 0, drips: 0, pan: -1 }, { water: 1, birds: 1, drips: 1, pan: 1 }].forEach(mix => {
    const h = fakeContext(); let e2 = null;
    try { S.render(h.c, name, { seed: 4, seconds: 8, mix }); } catch (e) { e2 = String(e); }
    check(`ambience ${name} at mix ${JSON.stringify(mix)} builds cleanly ${e2 || h.problems.slice(0, 2).join('; ')}`, !e2 && h.problems.length === 0);
  });
  check(`ambience ${name} builds cleanly ${err || f.problems.slice(0, 2).join('; ')}`, !err && f.problems.length === 0);
  check(`ambience ${name}: everything stops`, unstoppedLoops === 0);
  const g = fakeContext(), bus = S.chain(g.c), a = S.AMBIENCES[name].make(g.c, bus.amb, S.rng(5), 0);
  a.schedule(0, 1); const n1 = g.sources.length; a.schedule(0, 1); const n2 = g.sources.length;
  check(`ambience ${name}: scheduling the same window twice adds nothing`, n1 === n2);
  a.schedule(100, 101); /* after a long pause (page hidden): no burst of missed events */
  check(`ambience ${name}: a long gap does not flood`, g.sources.length - n2 <= 12);
});
['step:wood', 'step:tile', 'step:soil', 'step:grass', 'can', 'hoe', 'seed', 'pick', 'door', 'swoosh', 'tick', 'pop', 'sparkle', 'tada', 'chime', 'gift'].forEach(n => check(`has sound ${n}`, !!S.VOICES[n]));
['room', 'bath', 'meadow', 'falls', 'spring'].forEach(n => check(`has ambience ${n}`, !!S.AMBIENCES[n]));
['tick', 'pop', 'sparkle', 'swoosh', 'door', 'tada'].forEach(n => check(`${n} is short`, S.VOICES[n].dur <= 1.3));
let unknownThrows = false; try { S.render(fakeContext().c, 'trumpet'); } catch (e) { unknownThrows = true; }
check('an unknown sound name is refused', unknownThrows);
const r1 = S.rng(9), r2 = S.rng(9);
check('seeded randomness repeats', [r1(), r1(), r1()].join() === [r2(), r2(), r2()].join());

/* ---------- files: no audio files, no network, one line each in index.html, plain copy ---------- */
const js = read('js/ext/sound.js'), css = read('css/ext/sound.css'), html = read('index.html');
check('no audio files', !/\.(mp3|wav|ogg|m4a|aac|flac|webm)\b/i.test(js));
check('no network', !/fetch\(|XMLHttpRequest|https?:\/\/|new Audio\(|sendBeacon|WebSocket|import\(/.test(js));
check('no media elements', !/createElement\(['"](audio|video)/.test(js));
check('one script line', (html.match(/<script src="js\/ext\/sound\.js"><\/script>/g) || []).length === 1);
check('one stylesheet line', (html.match(/<link rel="stylesheet" href="css\/ext\/sound\.css">/g) || []).length === 1);
check('script after the engine', html.indexOf('js/ext/sound.js') > html.indexOf('js/ebb-game.js'));
[['sound.js', js], ['sound.css', css], ['test-sound.js', read('tools/test-sound.js')]].forEach(([f, t]) => {
  check(`${f} has no em or en dashes`, !/[\u2013\u2014]/.test(t));
  check(`${f} has no emoji`, !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(t));
});
check('the AudioContext is only made in ensure()', (js.match(/new AC\(/g) || []).length === 2 && js.indexOf('function ensure()') < js.indexOf('new AC('));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
