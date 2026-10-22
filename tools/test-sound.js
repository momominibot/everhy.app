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
check('waterfall is running water', S.placeSound('waterfall', W.SCENES.waterfall) === 'falls');
check('bathroom is room tone', S.placeSound('bathroom', { name: 'Bathroom' }) === 'room');
check('barn has its own indoor tone', S.placeSound('barn', { name: 'Barn' }) === 'barn');
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
check('wooden floors indoors', S.surfaceFor('bedroom', W.SCENES.bedroom) === 'wood' && S.surfaceFor('barn', { name: 'Barn' }) === 'wood' && S.surfaceFor('bathroom', {}) === 'wood');
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

check('a door fade starting is a door', S.events(snap({ action: 'walk', phase: 0.1 }), snap({ action: 'walk', phase: 0.12, fading: true })).join() === 'door');
check('the scene changing inside the fade adds nothing', S.events(snap({ fading: true }), snap({ scene: 'bedroom', surface: 'wood', fading: false })).length === 0);
check('a jump with no fade is a door', S.events(snap({}), snap({ scene: 'waterfall' })).join() === 'door');
check('a scene change carries no stale step', S.events(snap({ action: 'walk', phase: 0.2 }), snap({ scene: 'waterfall', action: 'walk', phase: 0.3 })).join() === 'door');
check('an offering chimes', S.events(snap({ offerings: 2 }), snap({ offerings: 3 })).join() === 'chime');
check('the gift has its own chime', S.events(snap({ offerings: 4 }), snap({ offerings: 5, gift: true })).join() === 'gift');
check('an old gift does not repeat', S.events(snap({ offerings: 5, gift: true }), snap({ offerings: 6, gift: true })).join() === 'chime');
check('fewer offerings (a reset) is silent', S.events(snap({ offerings: 3 }), snap({ offerings: 0 })).length === 0);

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
    sampleRate: 48000, get currentTime() { return now; }, destination: node({}),
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
  for (let seed = 1; seed <= 40; seed++) {
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
  check(`ambience ${name} builds cleanly ${err || f.problems.slice(0, 2).join('; ')}`, !err && f.problems.length === 0);
  check(`ambience ${name}: everything stops`, unstoppedLoops === 0);
  const g = fakeContext(), bus = S.chain(g.c), a = S.AMBIENCES[name].make(g.c, bus.amb, S.rng(5), 0);
  a.schedule(0, 1); const n1 = g.sources.length; a.schedule(0, 1); const n2 = g.sources.length;
  check(`ambience ${name}: scheduling the same window twice adds nothing`, n1 === n2);
  a.schedule(100, 101); /* after a long pause (page hidden): no burst of missed events */
  check(`ambience ${name}: a long gap does not flood`, g.sources.length - n2 <= 12);
});
['step:wood', 'step:soil', 'step:grass', 'can', 'hoe', 'seed', 'pick', 'door', 'chime', 'gift'].forEach(n => check(`has sound ${n}`, !!S.VOICES[n]));
['room', 'barn', 'meadow', 'falls', 'spring'].forEach(n => check(`has ambience ${n}`, !!S.AMBIENCES[n]));
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
