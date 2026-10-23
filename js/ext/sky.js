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
  /* six looks across the day: sunrise 05:30, morning 07:30, noon 11:30, afternoon 15:00, sunset 17:30, night 19:30 */
  var BOUNDS = [[330, 'sunrise'], [450, 'morning'], [690, 'noon'], [900, 'afternoon'], [1050, 'sunset'], [1170, 'night']];
  var PHASES = ['sunrise', 'morning', 'noon', 'afternoon', 'sunset', 'night'];
  var IN_NIGHT = [196, 182, 202]; /* what a room is multiplied by at full night: soft and a little cool, the lamps warm it back */
  var LABELS = { sunrise: 'Sunrise', morning: 'Morning', noon: 'Midday', afternoon: 'Afternoon', sunset: 'Sunset', night: 'Night' };
  var EASE = 20; /* each change of phase fades over 40 minutes, centred on its start time */
  /* shade: what the plate is multiplied by (white = untouched). glow: soft light from the sky, screened, rgb + alpha.
   * pool: the warm light around her outdoors. lamp: how much indoor lamps are on. */
  var LOOKS = {
    night: { shade: [112, 126, 180], glow: [120, 140, 220, 0], pool: 1, lamp: 1 },
    sunrise: { shade: [255, 218, 214], glow: [255, 190, 160, 0.3], pool: 0.2, lamp: 0.3 },
    morning: { shade: [255, 250, 240], glow: [255, 244, 214, 0.1], pool: 0, lamp: 0 },
    noon: { shade: [255, 255, 255], glow: [255, 255, 255, 0], pool: 0, lamp: 0 },
    afternoon: { shade: [255, 246, 226], glow: [255, 226, 170, 0.08], pool: 0, lamp: 0 },
    sunset: { shade: [255, 204, 168], glow: [255, 150, 100, 0.28], pool: 0.4, lamp: 0.5 },
    /* older names some code may still ask for */
    dawn: { shade: [255, 218, 214], glow: [255, 190, 160, 0.3], pool: 0.2, lamp: 0.3 },
    day: { shade: [255, 255, 255], glow: [255, 255, 255, 0], pool: 0, lamp: 0 },
    golden: { shade: [255, 246, 226], glow: [255, 226, 170, 0.08], pool: 0, lamp: 0 },
    dusk: { shade: [255, 204, 168], glow: [255, 150, 100, 0.28], pool: 0.4, lamp: 0.5 }
  };
  var RAIN_SHADE = [214, 220, 230], RAIN_PER_MILLE = 200; /* about one day in five */
  var INDOOR_IDS = ['bedroom', 'bathroom', 'living', 'hawker']; /* barn: the world workstream's roofed room, so rain stays outside */

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
    /* indoors: no sky colour, but the room dims gently as the lamps come on, so a night room is not lit like noon */
    if (o.indoor) return { phase: l.phase, shade: IN_NIGHT.map(function (v) { return 255 - (255 - v) * l.lamp; }), glow: [l.glow[0], l.glow[1], l.glow[2], 0], pool: 0, lamp: l.lamp };
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
  /* live Singapore weather: NEA's two-hour forecast from data.gov.sg (public, no key). Each place reads its own area;
   * places without one read the island-wide majority. Rain when the forecast says rain or showers, clear otherwise. */
  var AREAS = { merlion: 'City', jetty: 'Bedok', waterfall: 'Bukit Batok', spring: 'Sembawang', dome: 'City', hawker: 'Toa Payoh', farm: 'Toa Payoh' };
  var LIVE_MAX_MS = 3 * 3600 * 1000; /* older than three hours: not trusted, the sky is simply clear */
  function wet(text) { return /rain|shower/i.test(String(text || '')); }
  function liveWeather(live, sceneId, nowMs) {
    if (!live || !live.at || !Array.isArray(live.areas) || nowMs - live.at > LIVE_MAX_MS) return null;
    var name = AREAS[sceneId], hit = live.areas.filter(function (a) { return a.area === name; })[0];
    if (hit) return wet(hit.forecast) ? 'rain' : 'clear';
    var n = live.areas.filter(function (a) { return wet(a.forecast); }).length;
    return live.areas.length && n * 2 > live.areas.length ? 'rain' : 'clear';
  }
  function parseForecast(json, nowMs) { /* the API's answer -> { at, areas: [{ area, forecast }] }, or null */
    try { var it = json.data.items[0]; return { at: nowMs, issued: it.update_timestamp || null, areas: it.forecasts.map(function (f) { return { area: String(f.area), forecast: String(f.forecast) }; }) }; }
    catch (e) { return null; }
  }

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
  root.EbbSky = { vignetteAt: vignetteAt, cutMatrix: cutMatrix, PHASES: PHASES, LABELS: LABELS, now: function () { var m = minuteOf(new Date()); return { phase: phaseAt(m), label: LABELS[phaseAt(m)] }; }, BOUNDS: BOUNDS, LOOKS: LOOKS, phaseAt: phaseAt, look: look, paint: paint, minuteOf: minuteOf,
    dateKey: dateKey, weatherFor: weatherFor, weatherAt: weatherAt, liveWeather: liveWeather, parseForecast: parseForecast, AREAS: AREAS, isIndoor: isIndoor, effects: effects,
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
  var LIVE_KEY = 'ebb_weather_v1', FORECAST = 'https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast', live = null;
  try { live = JSON.parse(root.localStorage.getItem(LIVE_KEY) || 'null'); } catch (e) { live = null; }
  function fetchLive() { /* every 30 minutes while open; offline or refused simply keeps the last answer (and clear sky once stale) */
    if (fixedWeather || !root.fetch || (live && Date.now() - live.at < 25 * 60 * 1000)) return;
    root.fetch(FORECAST, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      var got = j && parseForecast(j, Date.now()); if (!got || !got.areas.length) return;
      live = got; try { root.localStorage.setItem(LIVE_KEY, JSON.stringify(live)); } catch (e) { }
      update(true, true);
    }).catch(function () { });
  }
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
    /* cut-outs of the painting (the arch door she walks behind) sit in the SVG layer above the tint, so they get the same
     * multiply through a filter: one colour matrix, updated with the sky */
    var svg = layer || doc.getElementById('layer'), NS = 'http://www.w3.org/2000/svg';
    if (svg && !doc.getElementById('skyCut')) {
      var defs = svg.querySelector('defs') || svg.insertBefore(doc.createElementNS(NS, 'defs'), svg.firstChild);
      var f = doc.createElementNS(NS, 'filter'); f.setAttribute('id', 'skyCut'); f.setAttribute('color-interpolation-filters', 'sRGB');
      f.setAttribute('x', '0'); f.setAttribute('y', '0'); f.setAttribute('width', '1'); f.setAttribute('height', '1');
      els.cut = doc.createElementNS(NS, 'feColorMatrix'); els.cut.setAttribute('type', 'matrix'); els.cut.setAttribute('values', cutMatrix([1, 1, 1]));
      f.appendChild(els.cut); defs.appendChild(f);
    }
    return true;
  }
  function cutMatrix(k) { return k[0].toFixed(4) + ' 0 0 0 0  0 ' + k[1].toFixed(4) + ' 0 0 0  0 0 ' + k[2].toFixed(4) + ' 0 0  0 0 0 1 0'; }
  /* the vignette's colour at a point of the stage (percent), as css/ext/sky.css draws it: an ellipse 72% x 66% at the
   * centre, (255 240 222) at the middle, (252 226 202) at 52%, (196 166 172) at the edge */
  var VIG = [[0, [255, 240, 222]], [0.52, [252, 226, 202]], [1, [196, 166, 172]]];
  function vignetteAt(x, y) {
    var d = Math.min(1, Math.sqrt(Math.pow((x - 50) / 72, 2) + Math.pow((y - 50) / 66, 2)));
    var a = d <= VIG[1][0] ? VIG[0] : VIG[1], b = d <= VIG[1][0] ? VIG[1] : VIG[2], t = (d - a[0]) / (b[0] - a[0]);
    return a[1].map(function (v, i) { return v + (b[1][i] - v) * t; });
  }
  /* what the plate is multiplied by under the cut-outs of this scene, per channel 0..1 */
  function cutFactor(p, indoor, sc) {
    var k = p.shade.map(function (v) { return v / 255; }), fr = sc.fronts || [];
    if (indoor && p.lamp >= 0.004 && fr.length) {
      var units = W && W.units ? W.units(sceneId) : 100, x = 0, y = 0;
      fr.forEach(function (f) { x += (f.rect[0] + f.rect[2]) / 2; y += (f.rect[1] + f.rect[3]) / 2; });
      var v = vignetteAt(x / fr.length, (y / fr.length) / units * 100);
      k = k.map(function (c, i) { return c * (1 - p.lamp + p.lamp * v[i] / 255); });
    }
    return k;
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
    var weather = fixedWeather || liveWeather(live, id, Date.now()) || 'clear', p = paint(m, { indoor: indoor, weather: weather });
    var fx = effects({ phase: p.phase, indoor: indoor, weather: weather, fireflies: !!(sc.fireflies || FLIES[id]), reduced: reduced() });
    if (snap) els.sky.classList.add('snap');
    if (id !== sceneId || force) { sceneId = id; rebuild(id, sc, indoor); }
    var white = p.shade.every(function (v) { return v > 254.5; });
    els.shade.hidden = white; els.shade.style.backgroundColor = rgb(p.shade);
    if (els.cut) els.cut.setAttribute('values', cutMatrix(cutFactor(p, indoor, sc)));
    els.glow.hidden = p.glow[3] < 0.004; els.glow.style.opacity = p.glow[3].toFixed(3);
    els.glow.style.setProperty('--sky-glow', p.glow.slice(0, 3).map(Math.round).join(' '));
    var light = indoor ? p.lamp : p.pool;
    els.vignette.hidden = !indoor || p.lamp < 0.004; els.vignette.style.opacity = p.lamp.toFixed(3);
    els.windows.hidden = !indoor || p.lamp < 0.004; els.windows.style.setProperty('--sky-lamp', p.lamp.toFixed(3));
    els.lights.hidden = light < 0.004; els.lights.style.setProperty('--sky-lamp', light.toFixed(3));
    els.flies.hidden = !fx.flies; els.rain.hidden = !fx.rain;
    els.sky.dataset.phase = p.phase; els.sky.dataset.place = indoor ? 'in' : 'out'; els.sky.dataset.weather = weather;
    /* the whole interface follows the clock too: a soft warm night palette after dark (css/ext/sky.css) */
    if (doc.documentElement.dataset.daylight !== (p.phase === 'night' ? 'night' : 'day')) doc.documentElement.dataset.daylight = p.phase === 'night' ? 'night' : 'day';
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
    fetchLive(); root.setInterval(fetchLive, 30 * 60 * 1000);
    doc.addEventListener('visibilitychange', function () { if (!doc.hidden) update(true); });
    if (mq) { var on = function () { update(true); }; if (mq.addEventListener) mq.addEventListener('change', on); else if (mq.addListener) mq.addListener(on); }
    if (root.MutationObserver) new MutationObserver(function () { update(true); }).observe(doc.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
  }
  doc.addEventListener('ebb:ready', function (e) { start(e.detail || root.EbbGame && root.EbbGame.api); });
  if (root.EbbGame && root.EbbGame._ready) start(root.EbbGame.api);
})(typeof window !== 'undefined' ? window : globalThis);
