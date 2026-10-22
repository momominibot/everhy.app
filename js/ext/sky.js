/* Ebb sky: light that follows the phone's clock, and gentle weather.
 * Outdoors the painted plate gets a tint for dawn, day, golden hour, dusk and night; indoors only a warm lamp glow at
 * night. Some days have light rain, picked from the date so it holds all day, and fireflies come out by the waterfall
 * on clear nights. Nothing is repainted: an overlay sits in #stage between the plate and the SVG layer, so she and the
 * props are never dimmed. Rain is one viewport-sized layer in #scene, so only the visible area is ever drawn.
 *
 * The rules (time to phase, minute to look, date to weather) are pure and checked by tools/test-sky.js.
 * ?time=HH:MM fixes the clock and ?weather=rain|clear fixes the weather, for screenshots. Both are read only here. */
(function (root) {
  'use strict';

  /* ---------- pure rules ---------- */
  var DAY = 1440;
  /* phase start times in minutes after midnight; night runs from 20:00 until dawn. Close to Singapore's sun all year
   * (sunrise about 07:00, sunset about 19:10) and gentle enough anywhere else. */
  var BOUNDS = [[375, 'dawn'], [465, 'day'], [1050, 'golden'], [1140, 'dusk'], [1200, 'night']];
  var PHASES = ['dawn', 'day', 'golden', 'dusk', 'night'];
  var EASE = 20; /* each change of phase fades over 40 minutes, centred on its start time */
  /* shade: what the plate is multiplied by (white = untouched). glow: soft light from the sky, screened, rgb + alpha.
   * pool: the warm light around her outdoors. lamp: how much indoor lamps are on. */
  var LOOKS = {
    night: { shade: [112, 126, 180], glow: [120, 140, 220, 0], pool: 1, lamp: 1 },
    dawn: { shade: [255, 224, 228], glow: [255, 198, 172, 0.24], pool: 0, lamp: 0 },
    day: { shade: [255, 255, 255], glow: [255, 236, 210, 0], pool: 0, lamp: 0 },
    golden: { shade: [255, 222, 180], glow: [255, 174, 98, 0.2], pool: 0, lamp: 0 },
    dusk: { shade: [186, 166, 210], glow: [255, 152, 126, 0.16], pool: 0.6, lamp: 0.6 }
  };
  var RAIN_SHADE = [214, 220, 230], RAIN_PER_MILLE = 200; /* about one day in five */
  var INDOOR_IDS = ['bedroom', 'bathroom', 'barn']; /* barn: the world workstream's roofed room, so rain stays outside */

  function wrap(m) { return ((m % DAY) + DAY) % DAY; }
  function circ(d) { return wrap(d + DAY / 2) - DAY / 2; } /* signed distance in minutes, -720..720 */
  function minuteOf(d) { return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; }
  function phaseAt(m) {
    m = wrap(m);
    var p = 'night';
    for (var i = 0; i < BOUNDS.length; i++) if (m >= BOUNDS[i][0]) p = BOUNDS[i][1];
    return p;
  }
  function smooth(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function mixLook(a, b, t) {
    return { shade: a.shade.map(function (v, i) { return lerp(v, b.shade[i], t); }),
      glow: a.glow.map(function (v, i) { return lerp(v, b.glow[i], t); }),
      pool: lerp(a.pool, b.pool, t), lamp: lerp(a.lamp, b.lamp, t) };
  }
  /* the look at a minute of the day, blended across each phase change */
  function look(m) {
    m = wrap(m);
    var out = null;
    for (var i = 0; i < BOUNDS.length && !out; i++) {
      var d = circ(m - BOUNDS[i][0]);
      if (Math.abs(d) < EASE) {
        var prev = BOUNDS[(i + BOUNDS.length - 1) % BOUNDS.length][1];
        out = mixLook(LOOKS[prev], LOOKS[BOUNDS[i][1]], smooth((d + EASE) / (2 * EASE)));
      }
    }
    out = out || mixLook(LOOKS[phaseAt(m)], LOOKS[phaseAt(m)], 0);
    out.phase = phaseAt(m);
    return out;
  }
  /* what to paint for a place: outdoors gets the tint (greyer and softer when it rains), indoors only the lamps */
  function paint(m, o) {
    o = o || {};
    var l = look(m);
    if (o.indoor) return { phase: l.phase, shade: [255, 255, 255], glow: [l.glow[0], l.glow[1], l.glow[2], 0], pool: 0, lamp: l.lamp };
    var rain = o.weather === 'rain';
    return { phase: l.phase,
      shade: l.shade.map(function (v, i) { return rain ? v * RAIN_SHADE[i] / 255 : v; }),
      glow: [l.glow[0], l.glow[1], l.glow[2], rain ? l.glow[3] * 0.4 : l.glow[3]], pool: l.pool, lamp: 0 };
  }

  function dateKey(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function hash(s) { /* FNV-1a, then a murmur finaliser so neighbouring dates land far apart */
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return h >>> 0;
  }
  function weatherFor(key) { return hash('ebb-sky|' + key) % 1000 < RAIN_PER_MILLE ? 'rain' : 'clear'; }
  function weatherAt(d) { return weatherFor(dateKey(d)); }

  function isIndoor(id, scene) {
    if (scene && typeof scene.indoor === 'boolean') return scene.indoor;
    return INDOOR_IDS.indexOf(id) >= 0;
  }
  /* rain falls outdoors; fireflies need night, a place that has them and a dry evening. Reduced motion: neither. */
  function effects(o) {
    var out = !o.indoor && !o.reduced;
    return { rain: out && o.weather === 'rain', flies: out && o.phase === 'night' && !!o.fireflies && o.weather !== 'rain' };
  }
  function param(search, name) {
    var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(search || '');
    try { return m ? decodeURIComponent(m[1]) : null; } catch (e) { return null; }
  }
  function parseTime(search) { /* ?time=HH:MM -> minutes after midnight, or null */
    var v = param(search, 'time'), m = v && /^(\d{1,2}):(\d{2})$/.exec(v);
    if (!m || +m[1] > 23 || +m[2] > 59) return null;
    return +m[1] * 60 + +m[2];
  }
  function parseWeather(search) { var v = param(search, 'weather'); return v === 'rain' || v === 'clear' ? v : null; }

  var api = null, lampHooks = {}, current = {};
  root.EbbSky = { PHASES: PHASES, BOUNDS: BOUNDS, LOOKS: LOOKS, phaseAt: phaseAt, look: look, paint: paint, minuteOf: minuteOf,
    dateKey: dateKey, weatherFor: weatherFor, weatherAt: weatherAt, isIndoor: isIndoor, effects: effects,
    parseTime: parseTime, parseWeather: parseWeather,
    /* other modules: where the lamps are in a room, e.g. from its furniture. fn(api) -> [{ x, y }] in scene percent */
    setLamps: function (sceneId, fn) { lampHooks[sceneId] = fn; if (api) update(true, true); },
    state: function () { return current; } };

  /* ---------- the page ---------- */
  var doc = root.document;
  if (!doc) return;
  var W = root.EbbWorld;
  var search = root.location ? root.location.search : '';
  var fixedMinute = parseTime(search), fixedWeather = parseWeather(search);
  var mq = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : null;
  /* per plate, for the art that shipped without lamp or window positions; a scene's own lamps/windows always win */
  var PLATE_HINTS = {
    'art/plates/bedroom-birdseye.webp': { lamps: [{ x: 37, y: 16 }, { x: 65, y: 21 }], windows: [{ x: 51.6, y: 26, rx: 8.4, ry: 9.6 }] }
  };
  var FLIES = { waterfall: [[8, 52], [14, 60], [24, 47], [33, 58], [40, 45], [64, 47], [72, 58], [80, 50], [90, 57], [86, 66], [18, 70], [58, 64]] };
  var els = null, sceneId = null, her = null, herAt = { x: -1, y: -1, s: -1 };

  function now() {
    var d = new Date();
    if (fixedMinute !== null) d.setHours(Math.floor(fixedMinute / 60), fixedMinute % 60, 0, 0);
    return d;
  }
  function reduced() { return !!(mq && mq.matches) || doc.documentElement.getAttribute('data-motion') === 'reduce'; }
  function rgb(c) { return 'rgb(' + c.slice(0, 3).map(function (v) { return Math.round(v); }).join(' ') + ')'; }
  function el(tag, cls, parent) { var e = doc.createElement(tag); e.className = cls; if (parent) parent.appendChild(e); return e; }
  function pct(e, x, y, w, h) { e.style.left = x + '%'; e.style.top = y + '%'; if (w) e.style.width = w + '%'; if (h) e.style.height = h + '%'; }

  function build() {
    var stage = doc.getElementById('stage'), scene = doc.getElementById('scene');
    if (!stage || !scene) return false;
    var sky = el('div', 'sky'); sky.setAttribute('aria-hidden', 'true');
    els = { sky: sky, shade: el('div', 'sky-shade', sky), glow: el('div', 'sky-glow', sky), vignette: el('div', 'sky-vignette', sky),
      windows: el('div', 'sky-windows', sky), lights: el('div', 'sky-lights', sky), flies: el('div', 'sky-flies', sky) };
    /* between the plate and the SVG layer, wherever the engine keeps them */
    var layer = stage.querySelector('svg'), plate = doc.getElementById('plate');
    stage.insertBefore(sky, layer && layer.parentNode === stage ? layer : plate && plate.parentNode === stage ? plate.nextSibling : stage.firstChild);
    els.rain = el('div', 'sky-rain'); els.rain.setAttribute('aria-hidden', 'true'); els.rain.hidden = true;
    el('i', 'far', els.rain); el('i', 'near', els.rain);
    scene.insertBefore(els.rain, stage.nextSibling);
    return true;
  }

  function hints(sc) { return sc && PLATE_HINTS[sc.plate] || {}; }
  function lampsFor(id, sc) {
    var list = null;
    if (lampHooks[id]) { try { list = lampHooks[id](api); } catch (e) { list = null; } }
    list = list || sc.lamps || hints(sc).lamps || [{ x: 50, y: 30, r: 46 }]; /* a room with no lamps known: one soft light */
    return list.filter(function (l) { return l && isFinite(l.x) && isFinite(l.y); });
  }
  function rebuild(id, sc, indoor) {
    els.windows.innerHTML = els.lights.innerHTML = els.flies.innerHTML = ''; her = null; herAt = { x: -1, y: -1, s: -1 };
    if (indoor) {
      lampsFor(id, sc).forEach(function (l) { var r = l.r || 32; pct(el('i', 'sky-light lamp', els.lights), l.x, l.y, r, r); });
      (sc.windows || hints(sc).windows || []).forEach(function (w) { pct(el('i', 'sky-window', els.windows), w.x, w.y, w.rx * 2, w.ry * 2); });
    } else {
      her = el('i', 'sky-light her', els.lights);
      (sc.fireflies || FLIES[id] || []).forEach(function (f, i) {
        var b = el('i', 'fly f' + (i % 3), els.flies);
        pct(b, f[0], f[1]);
        b.style.animationDuration = (6 + (i * 1.7) % 5).toFixed(1) + 's, ' + (2.4 + (i * 0.9) % 2.2).toFixed(1) + 's';
        b.style.animationDelay = (-(i * 2.3) % 7).toFixed(1) + 's, ' + (-(i * 1.1) % 3).toFixed(1) + 's';
      });
    }
  }
  function placeHer() { /* the warm pool of light at her feet, sized by depth like she is */
    if (!her || !api) return;
    var m = api.me(), s = W && W.scaleAt ? W.scaleAt(m.y, sceneId) : 0.15;
    if (Math.abs(m.x - herAt.x) < 0.1 && Math.abs(m.y - herAt.y) < 0.1 && Math.abs(s - herAt.s) < 0.003) return;
    herAt = { x: m.x, y: m.y, s: s };
    pct(her, m.x.toFixed(2), (m.y - 1).toFixed(2), (s * 160).toFixed(1), (s * 88).toFixed(1));
  }

  function update(snap, force) {
    if (!api || !els) return;
    var d = now(), m = minuteOf(d), id = api.scene(), sc = W && W.SCENES[id] || {}, indoor = isIndoor(id, sc);
    var weather = fixedWeather || weatherAt(d), p = paint(m, { indoor: indoor, weather: weather });
    var fx = effects({ phase: p.phase, indoor: indoor, weather: weather, fireflies: !!(sc.fireflies || FLIES[id]), reduced: reduced() });
    if (snap) els.sky.classList.add('snap');
    if (id !== sceneId || force) { sceneId = id; rebuild(id, sc, indoor); }
    var white = p.shade.every(function (v) { return v > 254.5; });
    els.shade.hidden = white; els.shade.style.backgroundColor = rgb(p.shade);
    els.glow.hidden = p.glow[3] < 0.004; els.glow.style.opacity = p.glow[3].toFixed(3);
    els.glow.style.setProperty('--sky-glow', p.glow.slice(0, 3).map(Math.round).join(' '));
    var light = indoor ? p.lamp : p.pool;
    els.vignette.hidden = !indoor || p.lamp < 0.004; els.vignette.style.opacity = p.lamp.toFixed(3);
    els.windows.hidden = !indoor || p.lamp < 0.004; els.windows.style.setProperty('--sky-lamp', p.lamp.toFixed(3));
    els.lights.hidden = light < 0.004; els.lights.style.setProperty('--sky-lamp', light.toFixed(3));
    els.flies.hidden = !fx.flies; els.rain.hidden = !fx.rain;
    els.sky.dataset.phase = p.phase; els.sky.dataset.place = indoor ? 'in' : 'out'; els.sky.dataset.weather = weather;
    placeHer();
    if (snap) root.requestAnimationFrame(function () { root.requestAnimationFrame(function () { els.sky.classList.remove('snap'); }); });
    var next = { phase: p.phase, weather: weather, indoor: indoor, scene: id, rain: fx.rain, fireflies: fx.flies };
    if (JSON.stringify(next) !== JSON.stringify(current)) {
      current = next;
      try { doc.dispatchEvent(new CustomEvent('ebb:sky', { detail: next })); } catch (e) { }
    }
  }

  function frame() {
    if (api && api.scene() !== sceneId) update(true);
    else placeHer();
    root.requestAnimationFrame(frame);
  }
  function start(a) {
    if (api || !a || !build()) return;
    api = a;
    update(true);
    root.requestAnimationFrame(frame);
    root.setInterval(function () { update(false); }, 30000);
    doc.addEventListener('visibilitychange', function () { if (!doc.hidden) update(true); });
    if (mq) { var on = function () { update(true); }; if (mq.addEventListener) mq.addEventListener('change', on); else if (mq.addListener) mq.addListener(on); }
    if (root.MutationObserver) new MutationObserver(function () { update(true); }).observe(doc.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
  }
  doc.addEventListener('ebb:ready', function (e) { start(e.detail || root.EbbGame && root.EbbGame.api); });
  if (root.EbbGame && root.EbbGame._ready) start(root.EbbGame.api);
})(typeof window !== 'undefined' ? window : globalThis);
