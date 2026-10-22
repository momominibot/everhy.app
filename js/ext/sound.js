/* Ebb sound: every sound is made here with Web Audio, from noise and simple tones. No audio files, no network.
 * Each place has a soft ambience (room tone indoors, birds and breeze on the farm, running water at the falls) that
 * crossfades when she moves, and her actions make small sounds: footsteps on wood, soil or grass, the watering can,
 * the hoe, seeds, picking, doors and a chime for a pond offering.
 * Sound is off until she turns it on. The AudioContext is only made inside that tap, and the choice is remembered in
 * localStorage 'ebb_sound_v1'. Actions are read from EbbGame.api.me() each frame, so the engine needs no changes.
 * The rules (which place sounds like what, which frame makes a footstep) are pure and checked by tools/test-sound.js;
 * tools/smoke_sound.py renders every sound offline to keep the levels gentle and even. */
(function (root) {
  'use strict';
  var KEY = 'ebb_sound_v1';
  var MASTER = 0.9, SFX = 0.55, AMB = 0.16, FADE = 1.6, DUCK = 0.35; /* levels set by tools/smoke_sound.py --levels */

  /* ---------- small helpers ---------- */
  function rng(seed) { /* mulberry32: the same seed gives the same sounds, so offline renders can be compared */
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0; var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function between(r, lo, hi) { return lo + (hi - lo) * r(); }

  /* ---------- places: which ambience and which floor ---------- */
  var PLACES = { bedroom: 'room', bathroom: 'room', barn: 'barn', farm: 'meadow', waterfall: 'falls', spring: 'spring' };
  var FLOORS = { room: 'wood', barn: 'wood', meadow: 'soil', falls: 'grass', spring: 'grass' };
  function placeSound(id, scene) {
    if (scene && scene.sound && AMBIENCES[scene.sound]) return scene.sound; /* a scene can name its own */
    if (PLACES[id]) return PLACES[id];
    var s = (String(id || '') + ' ' + (scene && scene.name || '')).toLowerCase();
    if (/spring|onsen|pool/.test(s)) return 'spring';
    if (/fall|river|stream|brook/.test(s)) return 'falls';
    if (/room|house|home|kitchen|hall|shop|inside|barn|shed|cafe/.test(s)) return 'room';
    return 'meadow';
  }
  function surfaceFor(id, scene) {
    if (scene && scene.surface && VOICES['step:' + scene.surface]) return scene.surface;
    return FLOORS[placeSound(id, scene)] || 'soil';
  }

  /* ---------- what happened since the last frame ---------- */
  var TOOLS = { can: 'can', hoe: 'hoe', seed: 'seed', pick: 'pick' };
  function crossed(p0, p1, x) { /* did the walk phase pass x going from p0 to p1? the phase wraps at 1 */
    if (p1 >= p0) return p0 < x && p1 >= x;
    return p0 < x || p1 >= x;
  }
  function toNext(p) { return Math.min((1.25 - p) % 1, (1.75 - p) % 1); }
  /* a and b are snapshots: { scene, surface, action, tool, phase, fading, offerings, gift }. Returns sound names. */
  function events(a, b) {
    var out = [];
    if (!a || !b) return out;
    if (!a.fading && b.fading) out.push('door'); /* she walked into a doorway: the fade starts now */
    if (a.scene !== b.scene) { if (!a.fading && !b.fading) out.push('door'); return out; } /* a jump with no fade still gets a door */
    if (b.offerings > a.offerings) out.push(b.gift && !a.gift ? 'gift' : 'chime');
    if (b.action === 'walk' && !b.fading) {
      var step = crossed(a.phase, b.phase, 0.25) || crossed(a.phase, b.phase, 0.75);
      if (!step && a.action !== 'walk' && toNext(b.phase) > 0.15) step = true; /* the first step as she sets off */
      if (step) out.push('step:' + b.surface);
    }
    if (b.action === 'work' && TOOLS[b.tool] && (a.action !== 'work' || a.tool !== b.tool)) out.push(TOOLS[b.tool]);
    return out;
  }

  /* ---------- the choice, remembered on this device ---------- */
  function readPref() {
    try {
      var raw = root.localStorage && root.localStorage.getItem(KEY), v = raw ? JSON.parse(raw) : null;
      return !!(v && v.on === true);
    } catch (e) { return false; }
  }
  function writePref(on) {
    try { if (!root.localStorage) return false; root.localStorage.setItem(KEY, JSON.stringify({ on: !!on })); return true; } catch (e) { return false; }
  }

  /* ---------- building blocks ---------- */
  var buffers = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function noise(ctx, kind) { /* 4 s of looped noise, levelled to the same loudness; ends meet so the loop never clicks */
    var m = buffers && buffers.get(ctx);
    if (!m) { m = {}; if (buffers) buffers.set(ctx, m); }
    if (m[kind]) return m[kind];
    var n = Math.round(ctx.sampleRate * 4), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0), r = rng(kind.length * 977 + 13);
    var b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, last = 0, i, w;
    for (i = 0; i < n; i++) {
      w = r() * 2 - 1;
      if (kind === 'white') d[i] = w;
      else if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last; }
      else { /* pink, Paul Kellet's filter */
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = b0 + b1 + b2 + b3 + b4 + b5 + w * 0.5362;
      }
    }
    var first = d[0], end = d[n - 1], sum = 0;
    for (i = 0; i < n; i++) { d[i] -= first + (end - first) * i / (n - 1); sum += d[i] * d[i]; }
    var k = 0.25 / Math.sqrt(sum / n || 1);
    for (i = 0; i < n; i++) d[i] *= k;
    m[kind] = buf; return buf;
  }
  function panTo(ctx, out, p) {
    if (!p || !ctx.createStereoPanner) return out;
    var s = ctx.createStereoPanner(); s.pan.value = Math.max(-1, Math.min(1, p)); s.connect(out); return s;
  }
  function envelope(ctx, t, a, peak, d) { /* quick rise, smooth exponential fall */
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    g.gain.setValueAtTime(0, t + a + d + 0.005);
    return g;
  }
  /* filtered noise: { kind, type, f, to, q, a, d, gain, pan } */
  function burst(ctx, out, t, o, r) {
    var src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), end = t + o.a + o.d;
    src.buffer = noise(ctx, o.kind || 'white');
    f.type = o.type || 'bandpass'; f.Q.value = o.q || 0.8;
    f.frequency.setValueAtTime(o.f, t); if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, end);
    var g = envelope(ctx, t, o.a, o.gain, o.d);
    src.connect(f); f.connect(g); g.connect(panTo(ctx, out, o.pan));
    src.start(t, between(r, 0, Math.max(0, 3.9 - o.a - o.d))); src.stop(end + 0.02); /* the 4 s buffer never runs out mid-sound */
  }
  /* a tone with a pitch glide: { type, f, to, a, d, gain, pan } */
  function tone(ctx, out, t, o) {
    var osc = ctx.createOscillator(), end = t + o.a + o.d;
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t); if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.glide || o.a + o.d));
    var g = envelope(ctx, t, o.a, o.gain, o.d);
    osc.connect(g); g.connect(panTo(ctx, out, o.pan));
    osc.start(t); osc.stop(end + 0.02);
  }
  function chirp(ctx, out, t, f, gain, pan) { /* a small bird note: up, then a little down */
    var osc = ctx.createOscillator(), g = ctx.createGain();
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.linearRampToValueAtTime(f * 1.32, t + 0.035);
    osc.frequency.linearRampToValueAtTime(f * 0.92, t + 0.085);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    g.gain.setValueAtTime(0, t + 0.095);
    osc.connect(g); g.connect(panTo(ctx, out, pan));
    osc.start(t); osc.stop(t + 0.1);
  }
  function bell(ctx, out, t, f, gain, pan) { /* a soft bell: a few partials that fade at different speeds */
    [[1, 1, 2.4], [1.004, 0.35, 2.2], [2.01, 0.22, 1.1], [3.02, 0.08, 0.6]].forEach(function (p) {
      tone(ctx, out, t, { f: f * p[0], a: 0.006, d: p[2], gain: gain * p[1], pan: pan });
    });
  }

  /* ---------- action sounds: each takes (ctx, out, t, r) and lasts at most dur seconds ---------- */
  var VOICES = {
    'step:wood': { dur: 0.2, make: function (ctx, out, t, r) { /* a soft knock on floorboards */
      var v = between(r, 0.85, 1.1), p = between(r, -0.15, 0.15);
      burst(ctx, out, t, { f: between(r, 950, 1250), q: 1.3, a: 0.002, d: 0.07, gain: 0.55 * v, pan: p }, r);
      tone(ctx, out, t, { f: between(r, 130, 150), to: 75, a: 0.003, d: 0.09, gain: 0.7 * v, pan: p });
    } },
    'step:soil': { dur: 0.22, make: function (ctx, out, t, r) { /* a padded step on earth with a little grit */
      var v = between(r, 0.85, 1.1), p = between(r, -0.15, 0.15);
      burst(ctx, out, t, { kind: 'pink', type: 'lowpass', f: between(r, 600, 800), q: 0.7, a: 0.008, d: 0.11, gain: 3.3 * v, pan: p }, r);
      burst(ctx, out, t + 0.01, { type: 'highpass', f: 3000, q: 0.7, a: 0.002, d: 0.045, gain: 0.36 * v, pan: p }, r);
    } },
    'step:grass': { dur: 0.25, make: function (ctx, out, t, r) { /* a swish through grass */
      var v = between(r, 0.85, 1.1), p = between(r, -0.15, 0.15);
      burst(ctx, out, t, { f: between(r, 2300, 2900), to: 1700, q: 0.8, a: 0.02, d: 0.15, gain: 2 * v, pan: p }, r);
      burst(ctx, out, t, { kind: 'pink', type: 'lowpass', f: 450, q: 0.7, a: 0.005, d: 0.07, gain: 1.8 * v, pan: p }, r);
    } },
    can: { dur: 1.05, make: function (ctx, out, t, r) { /* a pour: many tiny splashes over a hiss, then drips */
      burst(ctx, out, t, { f: 1600, q: 1.5, a: 0.12, d: 0.6, gain: 1, pan: 0.1 }, r);
      for (var i = 0; i < 26; i++) burst(ctx, out, t + 0.05 + i * 0.024, { f: between(r, 1100, 2400), q: 3, a: 0.004, d: 0.045, gain: between(r, 0.45, 0.9), pan: between(r, -0.1, 0.3) }, r);
      for (var j = 0; j < 4; j++) tone(ctx, out, t + between(r, 0.62, 0.9), { f: between(r, 1200, 1600), to: 650, a: 0.002, d: 0.05, gain: 0.3, pan: between(r, -0.2, 0.3) });
    } },
    hoe: { dur: 0.75, make: function (ctx, out, t, r) { /* two soft strikes into soil, then a little scatter */
      [0, 0.3].forEach(function (dt, k) {
        var v = k ? 0.6 : 0.7;
        burst(ctx, out, t + dt, { kind: 'pink', type: 'lowpass', f: 480, q: 0.8, a: 0.004, d: 0.13, gain: 1.15 * v }, r);
        tone(ctx, out, t + dt, { f: 100, to: 55, a: 0.004, d: 0.11, gain: 0.55 * v });
        burst(ctx, out, t + dt + 0.005, { f: 2200, q: 2.5, a: 0.006, d: 0.07, gain: 0.12 * v }, r);
      });
      for (var i = 0; i < 5; i++) burst(ctx, out, t + between(r, 0.38, 0.6), { type: 'highpass', f: 3200, a: 0.001, d: 0.02, gain: 0.12, pan: between(r, -0.4, 0.4) }, r);
    } },
    seed: { dur: 0.55, make: function (ctx, out, t, r) { /* seeds pattering into the soil, then a pat */
      for (var i = 0; i < 5; i++) burst(ctx, out, t + between(r, 0, 0.28), { type: 'highpass', f: 3500, a: 0.001, d: 0.022, gain: between(r, 0.32, 0.54), pan: between(r, -0.3, 0.3) }, r);
      burst(ctx, out, t + 0.34, { kind: 'pink', type: 'lowpass', f: 650, q: 0.7, a: 0.006, d: 0.08, gain: 1.4 }, r);
    } },
    pick: { dur: 0.4, make: function (ctx, out, t, r) { /* a rustle of leaves and a soft pop as it comes up */
      burst(ctx, out, t, { f: 3000, to: 1500, q: 0.7, a: 0.03, d: 0.12, gain: 0.3 }, r);
      tone(ctx, out, t + 0.12, { f: 520, to: 260, a: 0.002, d: 0.1, gain: 0.5 });
      tone(ctx, out, t + 0.12, { type: 'triangle', f: 900, to: 700, a: 0.002, d: 0.05, gain: 0.08 });
    } },
    door: { dur: 0.75, make: function (ctx, out, t, r) { /* a swing of air, the latch, a soft close */
      burst(ctx, out, t, { kind: 'pink', f: 550, to: 250, q: 0.8, a: 0.15, d: 0.25, gain: 0.45 }, r);
      burst(ctx, out, t + 0.3, { f: 2600, q: 4, a: 0.001, d: 0.025, gain: 0.28 }, r);
      tone(ctx, out, t + 0.32, { f: 120, to: 70, a: 0.004, d: 0.13, gain: 0.36 });
      burst(ctx, out, t + 0.32, { kind: 'pink', type: 'lowpass', f: 320, a: 0.004, d: 0.1, gain: 0.4 }, r);
    } },
    chime: { dur: 3.2, make: function (ctx, out, t) { /* three bell notes rising, for an offering */
      [1046.5, 1318.5, 1568].forEach(function (f, i) { bell(ctx, out, t + i * 0.14, f, 0.09, (i - 1) * 0.25); });
    } },
    gift: { dur: 3.6, make: function (ctx, out, t) { /* five notes, for the Goddess's gift */
      [1046.5, 1318.5, 1568, 1760, 2093].forEach(function (f, i) { bell(ctx, out, t + i * 0.13, f, 0.075, (i - 2) * 0.18); });
    } }
  };

  /* ---------- ambiences: make(ctx, out, r) -> { schedule(t0, t1), stop(t) } ---------- */
  function loopNoise(ctx, kind, t) { var s = ctx.createBufferSource(); s.buffer = noise(ctx, kind); s.loop = true; s.start(t || 0, 0); return s; }
  function filt(ctx, type, f, q) { var x = ctx.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q || 0.7; return x; }
  function gain(ctx, v) { var g = ctx.createGain(); g.gain.value = v; return g; }
  function sway(ctx, param, hz, depth, t) { /* a slow wobble added to a parameter */
    var o = ctx.createOscillator(), d = gain(ctx, depth); o.frequency.value = hz; o.connect(d); d.connect(param); o.start(t || 0); return o;
  }
  function bed(ctx, out, layers, t) { /* steady noise layers: [kind, filter chain [[type, f, q]], level] */
    var srcs = [];
    layers.forEach(function (L) {
      var s = loopNoise(ctx, L[0], t), node = s;
      L[1].forEach(function (fq) { var x = filt(ctx, fq[0], fq[1], fq[2]); node.connect(x); node = x; });
      var g = gain(ctx, L[2]); node.connect(g); g.connect(out);
      if (L[3]) srcs.push(sway(ctx, g.gain, L[3][0], L[3][1], t));
      if (L[4]) srcs.push(sway(ctx, node.frequency, L[4][0], L[4][1], t));
      srcs.push(s);
    });
    return srcs;
  }
  function ambience(srcs, every) {
    var next = null;
    return {
      schedule: function (t0, t1) { if (!every) return; if (next === null || next < t0) next = t0 + every.first(); while (next < t1) next += every.at(next); },
      stop: function (t) { srcs.forEach(function (s) { try { s.stop(t); } catch (e) { } }); }
    };
  }
  var AMBIENCES = {
    room: { make: function (ctx, out, r, t) { /* still air in a quiet room, very slowly breathing */
      return ambience(bed(ctx, out, [
        ['pink', [['highpass', 140, 0.6], ['lowpass', 1100, 0.5]], 0.42, [0.05, 0.06]],
        ['brown', [['lowpass', 200, 0.7]], 0.3]
      ], t));
    } },
    barn: { make: function (ctx, out, r, t) { /* room tone with a little wind through the boards */
      return ambience(bed(ctx, out, [
        ['pink', [['highpass', 140, 0.6], ['lowpass', 1100, 0.5]], 0.38, [0.05, 0.06]],
        ['brown', [['lowpass', 200, 0.7]], 0.28],
        ['pink', [['bandpass', 750, 0.6]], 0.16, [0.09, 0.08], [0.06, 220]]
      ], t));
    } },
    meadow: { make: function (ctx, out, r, t) { /* breeze that swells and settles, and birds now and then */
      var srcs = bed(ctx, out, [
        ['pink', [['bandpass', 700, 0.6]], 0.5, [0.08, 0.22], [0.05, 260]],
        ['brown', [['lowpass', 260, 0.7]], 0.35, [0.13, 0.12]]
      ], t);
      return ambience(srcs, {
        first: function () { return between(r, 0.6, 2.2); },
        at: function (when) { /* a short phrase of chirps, then quiet */
          var f = between(r, 2600, 4200), n = 2 + Math.floor(r() * 4), gap = between(r, 0.08, 0.15), p = between(r, -0.7, 0.7), lv = between(r, 0.035, 0.06);
          for (var i = 0; i < n; i++) chirp(ctx, out, when + i * gap, f * between(r, 0.94, 1.06), lv, p);
          return n * gap + between(r, 1.8, 5.5);
        }
      });
    } },
    falls: { make: function (ctx, out, r, t) { /* running water: a hiss, a low rumble and a churning middle */
      var srcs = bed(ctx, out, [
        ['white', [['lowpass', 2800, 0.7], ['highpass', 220, 0.7]], 0.32],
        ['brown', [['lowpass', 380, 0.7]], 0.6],
        ['pink', [['bandpass', 1150, 1.1]], 0.36, [0.21, 0.1], [0.31, 320]]
      ], t);
      return ambience(srcs, {
        first: function () { return between(r, 0.1, 0.5); },
        at: function (when) { /* tiny bubbles in the splash */
          tone(ctx, out, when, { f: between(r, 600, 1300), to: between(r, 1400, 2000), a: 0.003, d: 0.03, gain: between(r, 0.015, 0.035), pan: between(r, -0.6, 0.6) });
          return between(r, 0.12, 0.6);
        }
      });
    } },
    spring: { make: function (ctx, out, r, t) { /* warm water lapping, with slow bubbles */
      var srcs = bed(ctx, out, [
        ['pink', [['bandpass', 850, 0.9]], 0.4, [0.11, 0.12], [0.07, 150]],
        ['brown', [['lowpass', 300, 0.7]], 0.45]
      ], t);
      return ambience(srcs, {
        first: function () { return between(r, 0.2, 1); },
        at: function (when) {
          tone(ctx, out, when, { f: between(r, 280, 650), to: between(r, 700, 1200), a: 0.004, d: 0.05, gain: between(r, 0.04, 0.07), pan: between(r, -0.5, 0.5) });
          return between(r, 0.35, 1.5);
        }
      });
    } }
  };

  /* ---------- the mix: sounds and ambience into one gentle bus, with a limiter as a last guard ---------- */
  function chain(ctx, opts) {
    opts = opts || {};
    var master = gain(ctx, opts.master === undefined ? MASTER : opts.master), out = master;
    if (opts.limiter !== false && ctx.createDynamicsCompressor) {
      var lim = ctx.createDynamicsCompressor();
      lim.threshold.value = -4; lim.knee.value = 3; lim.ratio.value = 12; lim.attack.value = 0.003; lim.release.value = 0.25;
      master.connect(lim); out = lim;
    }
    out.connect(ctx.destination);
    var sfx = gain(ctx, SFX), amb = gain(ctx, AMB), duck = gain(ctx, 1);
    sfx.connect(master); amb.connect(duck); duck.connect(master);
    return { master: master, sfx: sfx, amb: amb, duck: duck };
  }
  /* render one sound into any context (an OfflineAudioContext in the level check). Returns its length in seconds. */
  function render(ctx, name, opts) {
    opts = opts || {};
    var bus = chain(ctx, opts), r = rng(opts.seed || 1), t = opts.at || 0.05;
    if (VOICES[name]) { VOICES[name].make(ctx, bus.sfx, t, r); return t + VOICES[name].dur; }
    if (AMBIENCES[name]) { var len = opts.seconds || 6, a = AMBIENCES[name].make(ctx, bus.amb, r, 0); a.schedule(0, len); a.stop(len); return len; }
    throw new Error('unknown sound ' + name);
  }

  /* ---------- live: only in the page ---------- */
  var on = false, ctx = null, bus = null, layers = [], current = null, prev = null, raf = 0, made = 0, played = [];
  var live = rng((Date.now() ^ 0x5bd1e995) >>> 0);
  var G = root.EbbGame, W = root.EbbWorld, doc = root.document, btn = null;

  function ensure() {
    if (ctx) return ctx;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { try { ctx = new AC(); } catch (e2) { return null; } }
    made += 1;
    bus = chain(ctx); bus.master.gain.value = 0;
    return ctx;
  }
  function resume() {
    if (!ctx || ctx.state === 'running') return;
    try { var p = ctx.resume(); if (p && p.catch) p.catch(function () { }); } catch (e) { }
  }
  function ramp(param, to, secs) {
    var t = ctx.currentTime; param.cancelScheduledValues(t); param.setValueAtTime(param.value, t); param.linearRampToValueAtTime(to, t + secs);
  }
  function start() { /* only ever called from a tap */
    if (!ensure()) return false;
    resume(); ramp(bus.master.gain, MASTER, 0.5);
    prev = null; current = null;
    if (!raf && root.requestAnimationFrame) raf = root.requestAnimationFrame(frame);
    return true;
  }
  function stopAll() {
    if (raf && root.cancelAnimationFrame) root.cancelAnimationFrame(raf);
    raf = 0;
    if (!ctx) return;
    ramp(bus.master.gain, 0, 0.3);
    setTimeout(function () {
      if (on) return;
      setPlace(null, 0);
      try { var p = ctx.suspend(); if (p && p.catch) p.catch(function () { }); } catch (e) { }
    }, 400);
  }
  function setPlace(name, fade) { /* crossfade from the ambience that is playing to this one */
    if (current === name) return;
    var t = ctx.currentTime, f = fade === undefined ? FADE : fade;
    layers.forEach(function (L) {
      if (L.leaving) return;
      L.leaving = true;
      L.gain.gain.cancelScheduledValues(t); L.gain.gain.setValueAtTime(L.gain.gain.value, t); L.gain.gain.linearRampToValueAtTime(0, t + f);
      L.voice.stop(t + f + 0.05);
      setTimeout(function () { try { L.gain.disconnect(); } catch (e) { } layers = layers.filter(function (x) { return x !== L; }); }, (f + 0.3) * 1000);
    });
    current = name;
    if (!name || !AMBIENCES[name]) return;
    var g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + f); g.connect(bus.amb);
    layers.push({ name: name, gain: g, voice: AMBIENCES[name].make(ctx, g, live, t), leaving: false });
  }
  function play(name, delay) {
    if (!on || !ctx || ctx.state !== 'running' || !VOICES[name]) return false;
    VOICES[name].make(ctx, bus.sfx, ctx.currentTime + 0.01 + (delay || 0), live);
    played.push({ name: name, scene: G && G.api.scene(), at: Date.now() }); if (played.length > 60) played.shift();
    return true;
  }
  function snapshot() {
    var api = G.api, me = api.me(), id = api.scene(), st = api.state() || {}, pond = st.pond || {}, sc = W && W.SCENES[id], el = doc.getElementById('scene');
    return { scene: id, amb: placeSound(id, sc), surface: surfaceFor(id, sc), action: me.action, tool: me.tool, phase: +me.phase || 0,
      fading: !!(el && el.classList.contains('fading')), offerings: +pond.offerings || 0, gift: !!pond.gift };
  }
  function frame() {
    raf = root.requestAnimationFrame(frame);
    if (!G || !G._ready) return;
    var snap; try { snap = snapshot(); } catch (e) { return; }
    var evs = events(prev, snap); prev = snap;
    if (!ctx || ctx.state !== 'running') return;
    if (current !== snap.amb) setPlace(snap.amb);
    evs.forEach(function (n) { play(n, n === 'chime' || n === 'gift' ? 0.25 : 0); });
    layers.forEach(function (L) { if (!L.leaving) L.voice.schedule(ctx.currentTime, ctx.currentTime + 1.2); });
  }

  /* ---------- the toggle on the scene and in the More menu ---------- */
  function icon(isOn) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 9.5h3.2L11.5 6v12l-4.3-3.5H4z" fill="currentColor"/>' +
      (isOn ? '<path d="M14.8 9.3a3.8 3.8 0 0 1 0 5.4M17.4 6.9a7.2 7.2 0 0 1 0 10.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'
        : '<path d="M15.2 9.6l4.8 4.8m0-4.8l-4.8 4.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>') + '</svg>';
  }
  function paint() {
    if (btn) {
      btn.setAttribute('aria-pressed', String(on));
      btn.setAttribute('aria-label', on ? 'Sound is on. Turn sound off' : 'Sound is off. Turn sound on');
      btn.title = on ? 'Sound on' : 'Sound off';
      btn.innerHTML = icon(on);
    }
    var item = doc && doc.getElementById('panel-sound');
    if (item) item.textContent = on ? 'Sound: on' : 'Sound: off';
  }
  function set(v, fromTap) {
    on = !!v; writePref(on); paint();
    if (on) { if (fromTap && !start()) { on = false; writePref(false); paint(); if (G && G._ready) G.api.toast('Sound isn’t available in this browser'); return; } }
    else stopAll();
    if (fromTap && G && G._ready) G.api.toast(on ? 'Sound on' : 'Sound off', 1200);
  }
  function wire() {
    var app = doc.querySelector('.app') || doc.body;
    btn = doc.createElement('button'); btn.type = 'button'; btn.id = 'soundBtn'; btn.className = 'snd-toggle';
    btn.addEventListener('click', function (e) { e.stopPropagation(); set(!on, true); });
    btn.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }); /* the engine's Enter would also use the nearest spot */
    app.appendChild(btn);
    if (G && G.registerPanel) G.registerPanel({ id: 'sound', label: 'Sound: off', open: function () { set(!on, true); } });
    on = readPref(); paint();
    /* remembered as on: the browser still needs a tap before it plays, so the first tap anywhere starts it */
    ['click', 'touchend', 'keydown'].forEach(function (type) {
      doc.addEventListener(type, function (e) {
        if (!on || e.target && e.target.closest && e.target.closest('#soundBtn, #panel-sound')) return;
        if (!ctx) start(); else if (ctx.state !== 'running') { resume(); if (!raf) start(); }
      }, true);
    });
    doc.addEventListener('visibilitychange', function () {
      if (!ctx || !on) return;
      if (doc.hidden) { try { var p = ctx.suspend(); if (p && p.catch) p.catch(function () { }); } catch (e) { } }
      else resume();
    });
  }

  root.EbbSound = {
    KEY: KEY, PLACES: PLACES, FLOORS: FLOORS, VOICES: VOICES, AMBIENCES: AMBIENCES, TOOLS: TOOLS,
    placeSound: placeSound, surfaceFor: surfaceFor, events: events, crossed: crossed, readPref: readPref, writePref: writePref,
    rng: rng, chain: chain, render: render,
    play: function (name) { return play(name, 0); }, /* for other workstreams: a named sound now, if sound is on */
    duck: function (yes) { if (ctx && bus) ramp(bus.duck.gain, yes ? DUCK : 1, 0.6); }, /* lower the ambience under a voice */
    isOn: function () { return on; },
    status: function () { return { on: on, ctx: ctx ? ctx.state : 'none', made: made, ambience: current, layers: layers.length, played: played.slice() }; }
  };
  if (doc && doc.querySelector) { if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', wire); else wire(); }
})(typeof window !== 'undefined' ? window : globalThis);
