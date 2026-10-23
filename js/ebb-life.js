/* Ebb life: the small motion that makes a place feel inhabited, Animal Crossing style. Ambient layers per scene (twinkling
 * fairy lights, drifting motes and petals, steam off the bath, mist at the falls) and reaction bubbles above her head when
 * she does something (a note while watering, a sparkle at a harvest, a heart when she sits). Everything is SVG with CSS
 * animation, drawn in scene units, and goes still under prefers-reduced-motion. Owns nothing in the save. */
(function (root) {
  'use strict';
  var doc = root.document;
  if (!doc || !root.EbbGame) return;
  var W = root.EbbWorld, G = root.EbbGame;
  var reduced = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- ambient ---------- */
  function ring(cx, cy, r, n, cls) { /* n twinkling points on a circle */
    var out = '';
    for (var i = 0; i < n; i++) {
      var a = i / n * Math.PI * 2;
      out += '<circle class="' + cls + '" cx="' + (cx + Math.cos(a) * r).toFixed(1) + '" cy="' + (cy + Math.sin(a) * r).toFixed(1) + '" r="0.9" style="animation-delay:-' + (i * 0.37 % 2.3).toFixed(2) + 's"/>';
    }
    return out;
  }
  function motes(x0, y0, x1, y1, n, cls) {
    var out = '', seed = 7;
    function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
    for (var i = 0; i < n; i++) {
      out += '<circle class="' + (cls || 'life-mote') + '" cx="' + (x0 + rnd() * (x1 - x0)).toFixed(1) + '" cy="' + (y0 + rnd() * (y1 - y0)).toFixed(1) + '" r="' + (0.5 + rnd() * 0.5).toFixed(2) +
        '" style="animation-duration:' + (7 + rnd() * 6).toFixed(1) + 's;animation-delay:-' + (rnd() * 10).toFixed(1) + 's"/>';
    }
    return out;
  }
  function petals(x, y, n) {
    var out = '';
    for (var i = 0; i < n; i++) out += '<ellipse class="life-petal" cx="' + (x + (i % 4) * 5 - 7) + '" cy="' + y + '" rx="1.1" ry="0.7" style="animation-duration:' + (6 + i * 0.7) + 's;animation-delay:-' + (i * 1.3) + 's"/>';
    return out;
  }
  function steam(x, y, n) {
    var out = '';
    for (var i = 0; i < n; i++) out += '<ellipse class="life-steam" cx="' + (x + i * 3 - 6) + '" cy="' + y + '" rx="3.2" ry="2.1" style="animation-delay:-' + (i * 0.9) + 's"/>';
    return out;
  }
  function glow(x, y, r) { return '<circle class="life-glow" cx="' + x + '" cy="' + y + '" r="' + r + '" fill="url(#lifeGlow)"/>'; }
  /* sakura that drift down from a crown and sink where they meet the water: pool is an ellipse [cx, cy, rx, ry] */
  function sinkPetals(x0, x1, yTop, pool, n) {
    var out = '', seed = 31;
    function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
    for (var i = 0; i < n; i++) {
      var x = x0 + rnd() * (x1 - x0), drift = -3 - rnd() * 5, xw = Math.max(pool[0] - pool[2] + 2, Math.min(pool[0] + pool[2] - 2, x + drift));
      var span = pool[3] * Math.sqrt(Math.max(0, 1 - Math.pow((xw - pool[0]) / pool[2], 2))), yw = pool[1] - span + rnd() * 2 * span;
      out += '<ellipse class="life-sakura" cx="' + x.toFixed(1) + '" cy="' + yTop.toFixed(1) + '" rx="1.1" ry="0.7" style="--drift:' + drift.toFixed(1) + 'px;--fall:' + (yw - yTop).toFixed(1) + 'px;animation-duration:' + (8 + rnd() * 5).toFixed(1) + 's;animation-delay:-' + (rnd() * 12).toFixed(1) + 's"/>';
    }
    return out;
  }

  var AMBIENT = {
    /* the isometric rooms (23 Oct): round window with its fairy lights, the lamps, motes over the floor */
    bedroom: function () { return glow(37, 24, 12) + ring(37, 24, 8.5, 12, 'life-twinkle') + glow(38, 33, 4) + glow(66.5, 59, 6) + motes(20, 45, 90, 88, 10); },
    bathroom: function () { return steam(36, 44, 4) + glow(36, 21, 10) + glow(8, 37, 2.5) + glow(26, 38, 2) + glow(46, 80, 2) + motes(10, 50, 90, 86, 7); },
    living: function () { return glow(28, 25, 9) + ring(28, 25, 8, 10, 'life-twinkle') + glow(65, 25, 6) + glow(33, 22, 4) + glow(73, 64, 4) + motes(20, 48, 92, 90, 9); },
    farm: function () { return petals(16, 60, 6) + motes(5, 112, 95, 170, 8, 'life-pollen'); }, /* the rain tree sheds a little */
    hawker: function () { return glow(18, 86, 5) + glow(48, 86, 5) + glow(78, 86, 5) + motes(6, 114, 94, 170, 6); },
    merlion: function () { return motes(40, 84, 64, 104, 10, 'life-mist') + motes(6, 108, 94, 170, 6, 'life-pollen'); }, /* spray at the spout */
    jetty: function () { return motes(10, 90, 90, 104, 10, 'life-mist'); },
    waterfall: function () { return motes(4, 74, 96, 92, 16, 'life-mist'); }, /* Little Guilin: mist over the lake */
    spring: function () { return sinkPetals(2, 24, 56, [52, 88, 30, 14], 7) + steam(52, 78, 5); } /* frangipani petals onto the foot bath */
    , kitchen: function () { return glow(42, 27, 9) + ring(42, 27, 7, 10, 'life-twinkle') + glow(32, 37, 4) + glow(69, 42, 3) + motes(20, 50, 92, 88, 9); } /* the window over the sink, the hood light, the fridge panel (js/ext/kitchen.js) */
  };
  var layer = doc.getElementById('layer'), meG = doc.getElementById('me');
  var amb = doc.createElementNS('http://www.w3.org/2000/svg', 'g'); amb.setAttribute('id', 'life');
  var defs = layer.querySelector('defs');
  defs.insertAdjacentHTML('beforeend', '<radialGradient id="lifeGlow"><stop offset="0" stop-color="#fff1c9" stop-opacity="0.55"/><stop offset="1" stop-color="#fff1c9" stop-opacity="0"/></radialGradient>');
  layer.insertBefore(amb, meG);
  var emote = doc.createElementNS('http://www.w3.org/2000/svg', 'g'); emote.setAttribute('id', 'emote');
  layer.appendChild(emote);

  var shown = '';
  function paintAmbient() {
    var id = G.api.scene(), key = id + (reduced ? ':still' : '');
    if (key === shown) return; shown = key;
    var fn = AMBIENT[id] || function () { return motes(5, 60, 95, 170, 6); };
    amb.innerHTML = reduced ? '' : fn(); /* still mode shows nothing rather than frozen dust */
  }

  /* ---------- reactions ---------- */
  var SHAPES = {
    note: '<path d="M-1.6 2.2 v-5.2 l3.6 -0.9 v4.6" fill="none" stroke="#5a7fa8" stroke-width="0.8" stroke-linecap="round"/><circle cx="-2.4" cy="2.2" r="1.1" fill="#5a7fa8"/><circle cx="1.2" cy="1.3" r="1.1" fill="#5a7fa8"/>',
    sparkle: '<path d="M0 -3.4 L0.9 -0.9 L3.4 0 L0.9 0.9 L0 3.4 L-0.9 0.9 L-3.4 0 L-0.9 -0.9 Z" fill="#f2c14e"/>',
    heart: '<path d="M0 2.6 C-3.2 0.4 -3.2 -2.4 -1.5 -2.6 C-0.7 -2.7 0 -2 0 -1.4 C0 -2 0.7 -2.7 1.5 -2.6 C3.2 -2.4 3.2 0.4 0 2.6 Z" fill="#ee8a9a"/>',
    drop: '<path d="M0 -3 C1.8 -0.6 2.4 0.6 2.4 1.4 A2.4 2.4 0 0 1 -2.4 1.4 C-2.4 0.6 -1.8 -0.6 0 -3 Z" fill="#8fc3e6"/>',
    leaf: '<path d="M-2.6 2.4 C-2.6 -1 0.2 -3 3 -3 C3 0 1.2 2.6 -2.6 2.4 Z" fill="#7fae7a"/><path d="M-2.2 2.2 L2.2 -2.2" stroke="#5f8f5a" stroke-width="0.5"/>',
    bang: '<path d="M-0.8 -3.2 h1.6 l-0.4 4.4 h-0.8 Z" fill="#e8836f"/><circle cx="0" cy="2.6" r="0.8" fill="#e8836f"/>',
    zz: '<text x="-2.2" y="1.4" font-size="4.2" font-weight="800" fill="#7f8fb0" font-family="Nunito, sans-serif">zz</text>'
  };
  var until = 0, lastAction = '', lastScene = '';
  function react(kind, ms) {
    if (!SHAPES[kind]) return;
    emote.innerHTML = '<g class="life-pop"><path d="M-5 -6.5 h10 a2 2 0 0 1 2 2 v5.5 a2 2 0 0 1 -2 2 h-3 l-2 2.4 l-2 -2.4 h-3 a2 2 0 0 1 -2 -2 v-5.5 a2 2 0 0 1 2 -2 Z" fill="#fffaf3" stroke="rgba(60,40,40,0.18)" stroke-width="0.4"/><g transform="translate(0 -1.2)">' + SHAPES[kind] + '</g></g>';
    until = Date.now() + (ms || 1500);
  }
  function tick() {
    paintAmbient();
    var me = G.api.me(), sc = G.api.scene(), s = W.SCENES[sc];
    if (sc !== lastScene) { lastScene = sc; if (lastAction) react('bang', 900); }
    var a = me.action + ':' + (me.action === 'work' ? me.tool : '');
    if (a !== lastAction) {
      lastAction = a;
      if (me.action === 'work') react({ can: 'drop', hoe: 'leaf', seed: 'sparkle', pick: 'heart', none: 'sparkle' }[me.tool] || 'sparkle', 1400);
      else if (me.action === 'sit') react('heart', 1600);
    }
    if (Date.now() < until) {
      var k = W.scaleAt(me.y, sc), top = me.y - 104 * k - 7 * k * 1.1;
      emote.setAttribute('transform', 'translate(' + me.x.toFixed(2) + ' ' + top.toFixed(2) + ') scale(' + (k * 1.1).toFixed(3) + ')');
      emote.style.display = '';
    } else emote.style.display = 'none';
    root.requestAnimationFrame(tick);
  }
  function start() { root.requestAnimationFrame(tick); }
  if (G._ready) start(); else doc.addEventListener('ebb:ready', start); /* the game boots on load; nothing to read before then */
  root.EbbLife = { react: react, SHAPES: Object.keys(SHAPES) };
})(window);
