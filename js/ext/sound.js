/* Ebb sound: every sound is made here with Web Audio, from noise and simple tones. No audio files, no network.
 * Each place has a soft ambience that crossfades when she moves and changes with where she stands, the way Animal
 * Crossing does: the waterfall grows louder and brighter as she nears the pond, birds are louder by the trees at the top
 * of the farm and quieter by the shed, the bath drips when she is near the tub, and rooms keep a soft room tone.
 * Her actions make small sounds (footsteps on wood, tile, soil or grass, the watering can, hoe, seeds and picking), and
 * the game has cute ones: a pop when a sheet opens, a tick on button taps, a sparkle when something lands in the basket
 * or a heart is earned, a tiny ta-da the first time she does something, a swoosh on door fades and a latch at indoor
 * doors, and a chime for a pond offering. Each fires on a change, never every frame, with a minimum gap per sound.
 * Sound is off until she turns it on. The AudioContext is only made inside that tap, and the choice is remembered in
 * localStorage 'ebb_sound_v1'. Everything is read from EbbGame.api each frame, so the engine needs no changes.
 * The rules (which place sounds like what, which frame makes a sound, how near a source she is) are pure and checked by
 * tools/test-sound.js; tools/smoke_sound.py renders every sound offline to keep the levels gentle and even. */
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
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /* ---------- places: which ambience and which floor ---------- */
  var PLACES = { bedroom: 'room', bathroom: 'bath', living: 'room', farm: 'meadow', waterfall: 'meadow', spring: 'spring', hawker: 'hawker', merlion: 'harbour', jetty: 'sea' }; /* each named place has its own ambience */
  var FLOORS = { room: 'wood', bath: 'tile', meadow: 'soil', falls: 'grass', spring: 'grass' };
  var INDOOR = { room: true, bath: true };
  function placeSound(id, scene) {
    if (scene && scene.sound && AMBIENCES[scene.sound]) return scene.sound; /* a scene can name its own */
    if (PLACES[id]) return PLACES[id];
    var s = (String(id || '') + ' ' + (scene && scene.name || '')).toLowerCase();
    if (/spring|onsen|pool/.test(s)) return 'spring';
    if (/bath|shower|wash/.test(s)) return 'bath';
    if (/fall|river|stream|brook/.test(s)) return 'falls';
    if (scene && scene.indoor || /room|house|home|kitchen|hall|shop|inside|barn|shed|cafe/.test(s)) return 'room';
    return 'meadow';
  }
  function surfaceFor(id, scene) {
    if (scene && scene.surface && VOICES['step:' + scene.surface]) return scene.surface;
    return FLOORS[placeSound(id, scene)] || 'soil';
  }

  /* ---------- where she stands: how near each sound source is, 0..1 ---------- */
  /* bird trees and quiet spots as [x, y, radius], and the painted tub as [x, y], in scene units; a scene can carry its
   * own soundSources */
  var SOURCES = { farm: { birds: [[45, 80, 55], [85, 90, 45]], hush: [[17, 100, 26]] }, bathroom: { tub: [36, 46] } };
  var LOUDEST = { water: 1, birds: 1, drips: 1, pan: 0 };
  function nearness(d, full, none) { return d <= full ? 1 : d >= none ? 0 : 1 - (d - full) / (none - full); }
  function sceneUnits(scene) { var a = scene && scene.aspect; return a ? 100 * a[1] / a[0] : 100; }
  function mixFor(amb, id, scene, me) {
    var m = { water: 1, birds: 1, drips: 0, pan: 0 };
    if (!scene || !me || !isFinite(me.x) || !isFinite(me.y)) return m;
    var dist = function (x, y) { return Math.hypot(x - me.x, y - me.y); };
    if (amb === 'falls') { /* the pond spot, or the falls themselves */
      var pond = (scene.spots || []).filter(function (s) { return s.kind === 'pond'; })[0];
      var src = pond ? pond.at : scene.fall ? { x: (scene.fall.x + scene.fall.x1) / 2, y: scene.fall.y1 } : null;
      if (src) { m.water = nearness(dist(src.x, src.y), 16, 85); m.pan = clamp((src.x - me.x) / 60, -0.6, 0.6) * (1 - 0.5 * m.water); }
    } else if (amb === 'meadow') {
      var S = scene.soundSources || SOURCES[id];
      var top = Math.min.apply(null, (scene.floor || [[0, 0]]).map(function (p) { return p[1]; })), bottom = sceneUnits(scene);
      var high = clamp((bottom - me.y) / Math.max(1, bottom - top), 0, 1);
      if (!S) { m.birds = 0.5 + 0.5 * high; return m; }
      var tree = 0, treeX = me.x, hush = 0;
      (S.birds || []).forEach(function (b) { var n = nearness(dist(b[0], b[1]), 8, b[2]); if (n > tree) { tree = n; treeX = b[0]; } });
      (S.hush || []).forEach(function (h) { hush = Math.max(hush, nearness(dist(h[0], h[1]), 6, h[2])); });
      m.birds = clamp(0.25 + 0.35 * high + 0.5 * tree, 0.25, 1) * (1 - 0.6 * hush);
      m.pan = clamp((treeX - me.x) / 60, -0.6, 0.6) * tree;
    } else if (amb === 'bath') { /* drips from the tub: the painted one, or wherever she has moved it while redecorating */
      var moved = (scene.layout || []).filter(function (p) { return p && p.item === 'bathtub' && isFinite(p.x) && isFinite(p.y); })[0];
      var T = scene.soundSources || SOURCES[id], tub = moved ? [moved.x, moved.y - 9] : T && T.tub;
      if (tub) { m.drips = nearness(dist(tub[0], tub[1]), 24, 80); m.pan = clamp((tub[0] - me.x) / 60, -0.7, 0.7); }
    }
    return m;
  }

  /* ---------- what happened since the last frame ---------- */
  var TOOLS = { can: 'can', hoe: 'hoe', seed: 'seed', pick: 'pick' };
  var FIRSTS = { hoe: true, seed: true, can: true, pick: true, chime: true }; /* plus 'visit:<scene>' */
  function crossed(p0, p1, x) { /* did the walk phase pass x going from p0 to p1? the phase wraps at 1 */
    if (p1 >= p0) return p0 < x && p1 >= x;
    return p0 < x || p1 >= x;
  }
  function toNext(p) { return Math.min((1.25 - p) % 1, (1.75 - p) % 1); }
  /* a and b are snapshots: { scene, indoor, surface, action, tool, phase, fading, offerings, gift, basket, hearts }.
   * Returns sound names, plus 'visit:<scene>' markers for first visits. */
  function events(a, b) {
    var out = [];
    if (!a || !b) return out;
    if (!a.fading && b.fading) out.push('swoosh'); /* she walked into a doorway: the fade starts now */
    if (a.scene !== b.scene) {
      if (!a.fading && !b.fading) out.push('swoosh'); /* a jump with no fade still gets one */
      if (a.indoor || b.indoor) out.push('door'); /* the latch as she comes in or goes out */
      out.push('visit:' + b.scene);
      return out;
    }
    if (b.offerings > a.offerings) out.push(b.gift && !a.gift ? 'gift' : 'chime');
    if (b.basket > a.basket || b.hearts > a.hearts) out.push('sparkle');
    if (b.action === 'walk' && !b.fading) {
      var step = crossed(a.phase, b.phase, 0.25) || crossed(a.phase, b.phase, 0.75);
      if (!step && a.action !== 'walk' && toNext(b.phase) > 0.15) step = true; /* the first step as she sets off */
      if (step) out.push('step:' + b.surface);
    }
    if (b.action === 'work' && TOOLS[b.tool] && (a.action !== 'work' || a.tool !== b.tool)) out.push(TOOLS[b.tool]);
    return out;
  }
  /* which of these events she has never done before; marks them in seen */
  function newFirsts(evs, seen) {
    var out = [];
    evs.forEach(function (e) { if ((FIRSTS[e] || e.indexOf('visit:') === 0) && !seen[e]) { seen[e] = true; out.push(e); } });
    return out;
  }
  /* each sound has a minimum gap, so a burst of taps or state changes can never make a stream of sound */
  var GAP = { tick: 0.06, pop: 0.25, sparkle: 0.35, tada: 0.9, swoosh: 0.3, door: 0.3, chime: 0.3, gift: 0.3 };
  function allowed(name, now, last) {
    var g = GAP[name] || 0;
    if (last[name] !== undefined && now - last[name] < g) return false;
    last[name] = now; return true;
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
    var s = ctx.createStereoPanner(); s.pan.value = clamp(p, -1, 1); s.connect(out); return s;
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
  /* a tone with a pitch glide: { type, f, to, glide, a, d, gain, pan } */
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
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.012);
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

  /* ---------- one-shot sounds: each takes (ctx, out, t, r) and lasts at most dur seconds ---------- */
  function step(o) {
    return function (ctx, out, t, r) { o(ctx, out, t, r, between(r, 0.85, 1.1), between(r, -0.15, 0.15)); };
  }
  var VOICES = {
    'step:wood': { dur: 0.2, make: step(function (ctx, out, t, r, v, p) { /* a soft knock on floorboards */
      burst(ctx, out, t, { f: between(r, 950, 1250), q: 1.3, a: 0.002, d: 0.07, gain: 0.55 * v, pan: p }, r);
      tone(ctx, out, t, { f: between(r, 130, 150), to: 75, a: 0.003, d: 0.09, gain: 0.7 * v, pan: p });
    }) },
    'step:tile': { dur: 0.15, make: step(function (ctx, out, t, r, v, p) { /* a light tap on tiles */
      burst(ctx, out, t, { f: between(r, 2000, 2500), q: 1.6, a: 0.001, d: 0.04, gain: 0.7 * v, pan: p }, r);
      tone(ctx, out, t, { f: between(r, 170, 190), to: 120, a: 0.002, d: 0.06, gain: 0.45 * v, pan: p });
    }) },
    'step:soil': { dur: 0.22, make: step(function (ctx, out, t, r, v, p) { /* a padded step on earth with a little grit */
      burst(ctx, out, t, { kind: 'pink', type: 'lowpass', f: between(r, 600, 800), q: 0.7, a: 0.008, d: 0.11, gain: 3.3 * v, pan: p }, r);
      burst(ctx, out, t + 0.01, { type: 'highpass', f: 3000, q: 0.7, a: 0.002, d: 0.045, gain: 0.36 * v, pan: p }, r);
    }) },
    'step:grass': { dur: 0.25, make: step(function (ctx, out, t, r, v, p) { /* a swish through grass */
      burst(ctx, out, t, { f: between(r, 2300, 2900), to: 1700, q: 0.8, a: 0.02, d: 0.15, gain: 2 * v, pan: p }, r);
      burst(ctx, out, t, { kind: 'pink', type: 'lowpass', f: 450, q: 0.7, a: 0.005, d: 0.07, gain: 1.8 * v, pan: p }, r);
    }) },
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
    swoosh: { dur: 0.55, make: function (ctx, out, t, r) { /* a soft breath of air as the scene fades */
      burst(ctx, out, t, { kind: 'pink', f: 380, to: 1300, q: 0.7, a: 0.2, d: 0.28, gain: 1, pan: -0.15 }, r);
      burst(ctx, out, t + 0.04, { f: 900, to: 2600, q: 1.2, a: 0.18, d: 0.22, gain: 0.16, pan: 0.15 }, r);
    } },
    door: { dur: 0.3, make: function (ctx, out, t, r) { /* the latch and a soft close at an indoor door */
      burst(ctx, out, t, { f: 2600, q: 4, a: 0.001, d: 0.025, gain: 0.28 }, r);
      tone(ctx, out, t + 0.02, { f: 120, to: 70, a: 0.004, d: 0.13, gain: 0.36 });
      burst(ctx, out, t + 0.02, { kind: 'pink', type: 'lowpass', f: 320, a: 0.004, d: 0.1, gain: 0.4 }, r);
    } },
    tick: { dur: 0.12, make: function (ctx, out, t) { /* a small wooden tick for a button tap */
      tone(ctx, out, t, { f: 1700, to: 1250, a: 0.002, d: 0.05, gain: 0.26 });
      tone(ctx, out, t, { type: 'triangle', f: 3400, to: 2600, a: 0.001, d: 0.02, gain: 0.04 });
    } },
    pop: { dur: 0.16, make: function (ctx, out, t, r) { /* a soft bubble pop as a sheet opens */
      tone(ctx, out, t, { f: 260, to: 820, glide: 0.05, a: 0.003, d: 0.08, gain: 0.4 });
      burst(ctx, out, t + 0.045, { f: 1800, q: 2, a: 0.001, d: 0.015, gain: 0.12 }, r);
    } },
    sparkle: { dur: 0.75, make: function (ctx, out, t, r) { /* a few bright pings and a shimmer */
      var notes = [2637, 3136, 3520, 3951, 4699];
      for (var i = 0; i < 5; i++) tone(ctx, out, t + i * 0.055, { f: notes[Math.floor(r() * notes.length)], a: 0.002, d: 0.28, gain: between(r, 0.06, 0.09), pan: between(r, -0.5, 0.5) });
      burst(ctx, out, t, { type: 'highpass', f: 6000, a: 0.05, d: 0.3, gain: 0.04 }, r);
    } },
    tada: { dur: 1.25, make: function (ctx, out, t) { /* two little notes, up: the first time she does something */
      tone(ctx, out, t, { f: 784, a: 0.005, d: 0.35, gain: 0.1, pan: -0.1 });
      tone(ctx, out, t, { f: 1576, a: 0.004, d: 0.2, gain: 0.025, pan: -0.1 });
      tone(ctx, out, t + 0.16, { f: 1046.5, a: 0.005, d: 0.9, gain: 0.11, pan: 0.1 });
      tone(ctx, out, t + 0.16, { f: 1318.5, a: 0.005, d: 0.8, gain: 0.05, pan: 0.1 });
      tone(ctx, out, t + 0.16, { f: 2103, a: 0.004, d: 0.4, gain: 0.025, pan: 0.1 });
    } },
    chime: { dur: 3.2, make: function (ctx, out, t) { /* three bell notes rising, for an offering */
      [1046.5, 1318.5, 1568].forEach(function (f, i) { bell(ctx, out, t + i * 0.14, f, 0.09, (i - 1) * 0.25); });
    } },
    gift: { dur: 3.6, make: function (ctx, out, t) { /* five notes, for the Goddess's gift */
      [1046.5, 1318.5, 1568, 1760, 2093].forEach(function (f, i) { bell(ctx, out, t + i * 0.13, f, 0.075, (i - 2) * 0.18); });
    } },
    gulp: { dur: 1.2, make: function (ctx, out, t, r) { /* three soft swallows of water: a low glug and a tiny bubble each */
      for (var i = 0; i < 3; i++) {
        var at = t + i * 0.34 + between(r, 0, 0.04);
        tone(ctx, out, at, { f: between(r, 230, 260), to: 120, glide: 0.09, a: 0.006, d: 0.12, gain: 0.34 });
        burst(ctx, out, at + 0.07, { f: between(r, 900, 1200), q: 3, a: 0.002, d: 0.04, gain: 0.08 }, r);
      }
    } },
    plop: { dur: 0.5, make: function (ctx, out, t, r) { /* a fingertip on still water: a small drop and its ring */
      tone(ctx, out, t, { f: between(r, 520, 620), to: 1400, glide: 0.06, a: 0.002, d: 0.09, gain: 0.26 });
      burst(ctx, out, t + 0.02, { kind: 'pink', type: 'lowpass', f: 900, a: 0.004, d: 0.18, gain: 0.12 }, r);
    } },
    heart: { dur: 2.6, make: function (ctx, out, t) { /* a reward: two bright bell notes up and a soft sparkle on top */
      bell(ctx, out, t, 1318.5, 0.09, -0.15); bell(ctx, out, t + 0.11, 1975.5, 0.08, 0.15);
      tone(ctx, out, t + 0.11, { f: 3951, a: 0.002, d: 0.2, gain: 0.02 });
    } },
    cheer: { dur: 3.0, make: function (ctx, out, t) { /* a little springy hop up, then a happy run of notes to start the day */
      tone(ctx, out, t, { f: 300, to: 760, glide: 0.12, a: 0.004, d: 0.16, gain: 0.22 });
      [1046.5, 1318.5, 1568, 2093].forEach(function (f, i) { bell(ctx, out, t + 0.16 + i * 0.09, f, 0.075, (i - 1.5) * 0.2); });
      tone(ctx, out, t + 0.52, { f: 2637, a: 0.003, d: 0.5, gain: 0.03 });
    } }
  };

  /* ---------- ambiences: make(ctx, out, r, t) -> { schedule(t0, t1), stop(t), set?(mix, now, at once) } ---------- */
  function loopNoise(ctx, kind, t) { var s = ctx.createBufferSource(); s.buffer = noise(ctx, kind); s.loop = true; s.start(t || 0, 0); return s; }
  function filt(ctx, type, f, q) { var x = ctx.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q || 0.7; return x; }
  function gain(ctx, v) { var g = ctx.createGain(); g.gain.value = v; return g; }
  function sway(ctx, param, hz, depth, t) { /* a slow wobble added to a parameter */
    var o = ctx.createOscillator(), d = gain(ctx, depth); o.frequency.value = hz; o.connect(d); d.connect(param); o.start(t || 0); return o;
  }
  function glide(param, v, now, atOnce) { if (atOnce) param.setValueAtTime(v, now); else param.setTargetAtTime(v, now, 0.12); }
  function bed(ctx, out, layers, t) { /* steady noise layers: [kind, filter chain [[type, f, q]], level, gain sway, freq sway] */
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
  function ambience(srcs, every, mix) {
    var next = null, m = Object.assign({}, LOUDEST, mix || {});
    return {
      mix: m, events: 0,
      schedule: function (t0, t1) { if (!every) return; if (next === null || next < t0) next = t0 + every.first(); while (next < t1) next += every.at(next, m, this); },
      stop: function (t) { srcs.forEach(function (s) { try { s.stop(t); } catch (e) { } }); }
    };
  }
  var ROOM = [
    ['pink', [['highpass', 140, 0.6], ['lowpass', 1100, 0.5]], 0.42, [0.05, 0.06]],
    ['brown', [['lowpass', 200, 0.7]], 0.3]
  ];
  var AMBIENCES = {
    room: { make: function (ctx, out, r, t) { /* still air in a quiet room, very slowly breathing */
      return ambience(bed(ctx, out, ROOM, t));
    } },
    bath: { make: function (ctx, out, r, t) { /* room tone, and drips from the bath tap when she is near the tub */
      var a = ambience(bed(ctx, out, ROOM, t), {
        first: function () { return between(r, 0.3, 1.2); },
        at: function (when, m, self) {
          if (m.drips > 0.05) {
            var f = between(r, 700, 1000), p = clamp(m.pan + between(r, -0.1, 0.1), -1, 1);
            tone(ctx, out, when, { f: f, to: f * 2.2, glide: 0.025, a: 0.002, d: 0.06, gain: 0.5 * m.drips, pan: p });
            burst(ctx, out, when, { type: 'highpass', f: 4000, a: 0.001, d: 0.01, gain: 0.1 * m.drips, pan: p }, r);
            self.events += 1;
          }
          return between(r, 0.7, 2.2);
        }
      });
      a.set = function (mix, now) { Object.assign(a.mix, mix); };
      return a;
    } },
    meadow: { make: function (ctx, out, r, t) { /* breeze that swells and settles, and birds, louder by the trees */
      var srcs = bed(ctx, out, [
        ['pink', [['bandpass', 700, 0.6]], 0.5, [0.08, 0.22], [0.05, 260]],
        ['brown', [['lowpass', 260, 0.7]], 0.35, [0.13, 0.12]]
      ], t);
      var a = ambience(srcs, {
        first: function () { return between(r, 0.6, 2.2); },
        at: function (when, m, self) { /* a short phrase of chirps, then quiet */
          var f = between(r, 2600, 4200), n = 2 + Math.floor(r() * 4), gap = between(r, 0.08, 0.15), lv = between(r, 0.035, 0.06) * (0.2 + 0.8 * m.birds);
          var p = clamp(m.pan + between(r, -0.35, 0.35), -0.8, 0.8);
          for (var i = 0; i < n; i++) chirp(ctx, out, when + i * gap, f * between(r, 0.94, 1.06), lv, p);
          self.events += 1;
          return n * gap + between(r, 1.8, 5.5) * (1.7 - 0.9 * m.birds);
        }
      });
      a.set = function (mix) { Object.assign(a.mix, mix); };
      return a;
    } },
    falls: { make: function (ctx, out, r, t) { /* running water: louder and brighter as she nears the pond */
      var lp = filt(ctx, 'lowpass', 7200, 0.5), lvl = gain(ctx, 1), pn = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      lp.connect(lvl); if (pn) { lvl.connect(pn); pn.connect(out); } else lvl.connect(out);
      var srcs = bed(ctx, lp, [
        ['white', [['lowpass', 2800, 0.7], ['highpass', 220, 0.7]], 0.32],
        ['brown', [['lowpass', 380, 0.7]], 0.6],
        ['pink', [['bandpass', 1150, 1.1]], 0.36, [0.21, 0.1], [0.31, 320]]
      ], t);
      var a = ambience(srcs, {
        first: function () { return between(r, 0.1, 0.5); },
        at: function (when, m, self) { /* tiny bubbles in the splash */
          tone(ctx, lp, when, { f: between(r, 600, 1300), to: between(r, 1400, 2000), a: 0.003, d: 0.03, gain: between(r, 0.015, 0.035), pan: between(r, -0.6, 0.6) });
          self.events += 1;
          return between(r, 0.12, 0.6);
        }
      });
      a.set = function (mix, now, atOnce) {
        Object.assign(a.mix, mix);
        glide(lvl.gain, 0.3 + 0.7 * a.mix.water, now, atOnce);
        glide(lp.frequency, 800 * Math.pow(9, a.mix.water), now, atOnce);
        if (pn) glide(pn.pan, a.mix.pan, now, atOnce);
      };
      a.read = function () { return { gain: lvl.gain.value, cutoff: lp.frequency.value, pan: pn ? pn.pan.value : 0 }; };
      return a;
    } },
    spring: { make: function (ctx, out, r, t) { /* warm water lapping, with slow bubbles */
      var srcs = bed(ctx, out, [
        ['pink', [['bandpass', 850, 0.9]], 0.4, [0.11, 0.12], [0.07, 150]],
        ['brown', [['lowpass', 300, 0.7]], 0.45]
      ], t);
      return ambience(srcs, {
        first: function () { return between(r, 0.2, 1); },
        at: function (when, m, self) {
          tone(ctx, out, when, { f: between(r, 280, 650), to: between(r, 700, 1200), a: 0.004, d: 0.05, gain: between(r, 0.04, 0.07), pan: between(r, -0.5, 0.5) });
          self.events += 1;
          return between(r, 0.35, 1.5);
        }
      });
    } },
    sea: { make: function (ctx, out, r, t) { /* slow sea swells, a little foam, and gulls now and then */
      var srcs = bed(ctx, out, [
        ['brown', [['lowpass', 480, 0.7]], 0.55, [0.1, 0.32]], /* the swell */
        ['pink', [['bandpass', 720, 0.6]], 0.16, [0.09, 0.1]] /* soft foam */
      ], t);
      return ambience(srcs, {
        first: function () { return between(r, 1, 3); },
        at: function (when, m, self) {
          var f = between(r, 900, 1500), n = 2 + Math.floor(r() * 2), p = between(r, -0.6, 0.6);
          for (var i = 0; i < n; i++) tone(ctx, out, when + i * 0.12, { f: f, to: f * 0.6, glide: 0.1, a: 0.01, d: 0.1, gain: 0.08, pan: p });
          self.events += 1;
          return between(r, 4, 9);
        }
      });
    } },
    hawker: { make: function (ctx, out, r, t) { /* the food centre's low chatter, with clatter and a short sizzle */
      var srcs = bed(ctx, out, [
        ['pink', [['bandpass', 600, 0.8]], 0.5, [0.09, 0.15]], /* the murmur */
        ['brown', [['lowpass', 240, 0.7]], 0.22]
      ], t);
      return ambience(srcs, {
        first: function () { return between(r, 0.4, 1.5); },
        at: function (when, m, self) {
          var p = between(r, -0.7, 0.7), i;
          if (r() < 0.5) { /* a few quick clatters */
            for (i = 0; i < 2 + Math.floor(r() * 3); i++) burst(ctx, out, when + i * 0.05, { f: between(r, 1800, 3000), q: 2, a: 0.002, d: 0.03, gain: 0.12, pan: p }, r);
          } else { /* a short sizzle */
            burst(ctx, out, when, { kind: 'white', type: 'highpass', f: 3500, a: 0.05, d: 0.5, gain: 0.1, pan: p }, r);
          }
          self.events += 1;
          return between(r, 0.8, 2.5);
        }
      });
    } },
    harbour: { make: function (ctx, out, r, t) { /* gentle harbour water, a distant city hum, and a gull now and then */
      var srcs = bed(ctx, out, [
        ['pink', [['bandpass', 800, 0.9]], 0.32, [0.1, 0.14], [0.08, 200]],
        ['brown', [['lowpass', 220, 0.7]], 0.3, [0.06, 0.08]]
      ], t);
      return ambience(srcs, {
        first: function () { return between(r, 1, 3); },
        at: function (when, m, self) {
          tone(ctx, out, when, { f: between(r, 200, 500), to: between(r, 500, 900), a: 0.004, d: 0.05, gain: 0.05, pan: between(r, -0.5, 0.5) });
          if (r() < 0.4) { var f = between(r, 900, 1400), p = between(r, -0.6, 0.6); tone(ctx, out, when + 0.2, { f: f, to: f * 0.65, glide: 0.1, a: 0.01, d: 0.1, gain: 0.06, pan: p }); }
          self.events += 1;
          return between(r, 1.5, 4);
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
  /* render one sound into any context (an OfflineAudioContext in the level check). Ambiences take opts.mix, nearest by
   * default. Returns the length in seconds. */
  function render(ctx, name, opts) {
    opts = opts || {};
    var bus = chain(ctx, opts), r = rng(opts.seed || 1), t = opts.at || 0.05;
    if (VOICES[name]) { VOICES[name].make(ctx, bus.sfx, t, r); return t + VOICES[name].dur; }
    if (AMBIENCES[name]) {
      var len = opts.seconds || 6, a = AMBIENCES[name].make(ctx, bus.amb, r, 0);
      if (a.set) a.set(Object.assign({}, LOUDEST, opts.mix || {}), 0, true);
      a.schedule(0, len); a.stop(len); return len;
    }
    throw new Error('unknown sound ' + name);
  }

  /* ---------- live: only in the page ---------- */
  var on = false, ctx = null, bus = null, layers = [], current = null, prev = null, raf = 0, made = 0, played = [], last = {};
  var mix = null, mixAt = 0;
  var live = rng((Date.now() ^ 0x5bd1e995) >>> 0);
  var G = root.EbbGame, W = root.EbbWorld, doc = root.document, btn = null;
  var DELAY = { chime: 0.25, gift: 0.25, sparkle: 0.18, tada: 0.45 };

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
    current = null;
    return true;
  }
  function stopAll() {
    if (!ctx) return;
    ramp(bus.master.gain, 0, 0.3);
    setTimeout(function () {
      if (on) return;
      setPlace(null, 0);
      try { var p = ctx.suspend(); if (p && p.catch) p.catch(function () { }); } catch (e) { }
    }, 400);
  }
  function setPlace(name, fade, m) { /* crossfade from the ambience that is playing to this one */
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
    var voice = AMBIENCES[name].make(ctx, g, live, t);
    if (voice.set && m) voice.set(m, t, true);
    layers.push({ name: name, gain: g, voice: voice, leaving: false });
  }
  function play(name, delay) {
    if (!on || !ctx || ctx.state !== 'running' || !VOICES[name]) return false;
    if (!allowed(name, Date.now() / 1000, last)) return false;
    VOICES[name].make(ctx, bus.sfx, ctx.currentTime + 0.01 + (delay || 0), live);
    played.push({ name: name, scene: G && G._ready ? G.api.scene() : null, at: Date.now() }); if (played.length > 80) played.shift();
    return true;
  }
  function sumOf(obj, fn) { var n = 0; if (obj && typeof obj === 'object') Object.keys(obj).forEach(function (k) { var v = fn(obj[k]); if (isFinite(v)) n += +v; }); return n; }
  function snapshot() {
    var api = G.api, me = api.me(), id = api.scene(), st = api.state() || {}, pond = st.pond || {}, sc = W && W.SCENES[id], el = doc.getElementById('scene');
    var amb = placeSound(id, sc), today = st.today && st.today.hearts;
    return { scene: id, amb: amb, indoor: !!(INDOOR[amb] || sc && sc.indoor), surface: surfaceFor(id, sc), action: me.action, tool: me.tool, phase: +me.phase || 0,
      x: +me.x, y: +me.y, fading: !!(el && el.classList.contains('fading')), offerings: +pond.offerings || 0, gift: !!pond.gift,
      basket: sumOf(st.farm && st.farm.basket, function (v) { return v; }),
      hearts: isFinite(+today) ? +today : 0 }; /* the Today workstream's hearts total, when it is there */
  }
  function firsts() { /* her first times, kept in the game save so Settings exports and deletes them with it */
    var st = G.api.state();
    if (!st.sound || typeof st.sound !== 'object') st.sound = {};
    if (!st.sound.firsts || typeof st.sound.firsts !== 'object') st.sound.firsts = {};
    return st.sound.firsts;
  }
  function frame() {
    raf = root.requestAnimationFrame(frame);
    if (!G || !G._ready) return;
    var snap; try { snap = snapshot(); } catch (e) { return; }
    var evs = events(prev, snap), seen = firsts(), fresh;
    if (!prev && !seen['visit:' + snap.scene]) { seen['visit:' + snap.scene] = true; G.api.save(); } /* where she starts is not a first visit */
    fresh = newFirsts(evs, seen); if (fresh.length) G.api.save(); /* kept even with sound off: a first time only happens once */
    prev = snap;
    if (!on || !ctx || ctx.state !== 'running') return;
    var sc = W && W.SCENES[snap.scene], target = mixFor(snap.amb, snap.scene, sc, snap), now = ctx.currentTime;
    if (current !== snap.amb) { mix = Object.assign({}, target); setPlace(snap.amb, undefined, mix); }
    evs.forEach(function (n) { play(n, DELAY[n] || 0); });
    if (fresh.length) play('tada', DELAY.tada);
    var t = Date.now();
    if (t - mixAt >= 100) { /* ease towards where she stands, ten times a second */
      var k = 1 - Math.exp(-(Math.min(500, t - mixAt)) / 450); mixAt = t;
      Object.keys(target).forEach(function (key) { mix[key] += (target[key] - mix[key]) * k; });
      layers.forEach(function (L) { if (!L.leaving && L.voice.set) L.voice.set(mix, now); });
    }
    layers.forEach(function (L) { if (!L.leaving) L.voice.schedule(now, now + 1.2); });
  }

  /* ---------- the toggle on the scene and in the More menu, and the game's small UI sounds ---------- */
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
  function hasDialog(n) { return n.nodeType === 1 && (n.matches && n.matches('[role="dialog"]') || n.querySelector && n.querySelector('[role="dialog"]')); }
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
        if (!ctx) start(); else if (ctx.state !== 'running') resume();
      }, true);
    });
    /* a tick for a button tap; the action button and the toggle make their own sounds */
    doc.addEventListener('click', function (e) {
      var b = e.target && e.target.closest && e.target.closest('button');
      if (b && !b.disabled && b.id !== 'prompt' && b.id !== 'soundBtn') play('tick');
    }, true);
    /* a pop when a sheet opens: every sheet in Ebb is a dialog added to the body */
    if (root.MutationObserver) new root.MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) for (var j = 0; j < list[i].addedNodes.length; j++) if (hasDialog(list[i].addedNodes[j])) { play('pop'); return; }
    }).observe(doc.body, { childList: true });
    doc.addEventListener('visibilitychange', function () {
      if (!ctx || !on) return;
      if (doc.hidden) { try { var p = ctx.suspend(); if (p && p.catch) p.catch(function () { }); } catch (e) { } }
      else resume();
    });
    if (root.requestAnimationFrame) raf = root.requestAnimationFrame(frame); /* runs with sound off too, to keep first times */
  }

  root.EbbSound = {
    KEY: KEY, PLACES: PLACES, FLOORS: FLOORS, VOICES: VOICES, AMBIENCES: AMBIENCES, TOOLS: TOOLS, SOURCES: SOURCES, GAP: GAP,
    placeSound: placeSound, surfaceFor: surfaceFor, mixFor: mixFor, events: events, newFirsts: newFirsts, allowed: allowed,
    crossed: crossed, readPref: readPref, writePref: writePref, rng: rng, chain: chain, render: render,
    play: function (name) { return play(name, 0); }, /* for other workstreams: a named sound now, if sound is on */
    duck: function (yes) { if (ctx && bus) ramp(bus.duck.gain, yes ? DUCK : 1, 0.6); }, /* lower the ambience under a voice */
    isOn: function () { return on; },
    status: function () {
      var L = layers.filter(function (x) { return !x.leaving; })[0];
      return { on: on, ctx: ctx ? ctx.state : 'none', made: made, ambience: current, layers: layers.length, played: played.slice(),
        mix: mix ? Object.assign({}, mix) : null, params: L && L.voice.read ? L.voice.read() : null, ambienceEvents: L ? L.voice.events : 0 };
    }
  };
  if (doc && doc.querySelector) { if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', wire); else wire(); }
})(typeof window !== 'undefined' ? window : globalThis);
