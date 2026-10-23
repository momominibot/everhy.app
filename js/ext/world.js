/* Ebb world extension: the hot spring, and fishing from the Little Guilin deck
 * edge. Places register with EbbWorld (pure, so the node harness checks every door and stand point); the page part
 * below only runs in a browser. Rules live in js/world/rules.js. Floors and spots were read from each plate on a 10%
 * grid (tall 4:7 plates: x 0..100 across, y 0..175 down). Nothing here gets sick, wilts or dies, and nothing asks about health. */
(function (root) {
  'use strict';
  var W = root.EbbWorld;
  if (!W) return;

  /* ---------- places ---------- */
  W.register('spring', { /* Sembawang hot spring park (23 Oct render): the two-tier stone foot bath steaming in the upper middle, the egg-cooking station with pails on the left, benches, a pinwheel and a notice board on the right, the plaza below */
    name: 'Hot spring', plate: 'art/plates/hotspring.webp', aspect: [4, 7], depth: [100, 0.22, 175, 0.33], water: '#9fd0e0', surface: 'tile',
    floor: [[4, 100], [20, 100], [20, 106], [84, 106], [84, 100], [96, 100], [96, 175], [4, 175]],
    solids: [[20, 66, 84, 106], [4, 80, 33, 118], [84, 86, 100, 110], [78, 106, 92, 126], [10, 120, 28, 136], [84, 122, 92, 136]], /* pool and rim, egg station, pinwheel, notice board, bench, stone */
    doors: [{ id: 'toFalls', rect: [34, 170, 64, 175], to: 'waterfall', arrive: { x: 66, y: 166 }, label: 'Back to Little Guilin' }],
    spots: [{ id: 'soak', kind: 'soak', at: { x: 52, y: 93 }, stand: { x: 52, y: 110 }, label: 'Slip into the warm water' }],
    start: { x: 50, y: 160 }
  });
  W.addDoor('waterfall', { id: 'toSpring', rect: [57, 170, 78, 175], to: 'spring', arrive: { x: 48, y: 160 }, label: 'Path to the hot spring' }); /* the right half of the stone path */
  /* no addSpot hook yet: appended after the pond, so the engine's own spots keep their order */
  var FISH_SCENE = W.SCENES.jetty ? 'jetty' : 'waterfall'; /* Bedok Jetty when the core has it, else the lake deck */
  if (W.SCENES[FISH_SCENE] && !W.SCENES[FISH_SCENE].spots.some(function (s) { return s.id === 'fishing'; })) {
    W.SCENES[FISH_SCENE].spots.push(FISH_SCENE === 'jetty'
      ? { id: 'fishing', kind: 'fish', at: { x: 80, y: 88 }, stand: { x: 76, y: 92 }, float: { x: 66, y: 98 }, label: 'Fish from the jetty' }
      : { id: 'fishing', kind: 'fish', at: { x: 80, y: 103 }, stand: { x: 80, y: 109 }, float: { x: 66, y: 88 }, label: 'Fish from the deck' });
  }
  var SIT_IN_WATER = { x: 52, y: 93 }; /* in the lower pool, the water drawn over her legs */

  var doc = root.document;
  if (!doc || !root.EbbGame) return; /* the node harness stops here */

  /* rules load as their own file; the load event waits for them, and nothing below needs them until a tap */
  if (!root.EbbWorldRules) { var sc = doc.createElement('script'); sc.src = 'js/world/rules.js'; sc.async = false; doc.head.appendChild(sc); }
  function R() { return root.EbbWorldRules; }
  function data(api) {
    var st = api.state();
    st.world = st.world && typeof st.world === 'object' ? st.world : {};
    return st.world;
  }
  function itemName(key) {
    var r = R(), F = root.EbbFarm;
    return (r && r.ITEMS[key] ? r.ITEMS[key].name : F && F.CROPS[key] ? F.CROPS[key].name : key).toLowerCase();
  }
  /* the engine's pond names an offering from EbbFarm.CROPS. World and fishing items are added as non-enumerable entries,
   * so seeds, planting and every Object.keys(CROPS) loop stay exactly as they were. (Integrator: a shared item-name table
   * in the engine would replace this.) */
  function nameItemsForPond() {
    var F = root.EbbFarm, r = R(); if (!F || !r) return;
    Object.keys(r.ITEMS).forEach(function (k) {
      if (!Object.prototype.hasOwnProperty.call(F.CROPS, k)) Object.defineProperty(F.CROPS, k, { value: { name: r.ITEMS[k].name }, enumerable: false });
    });
  }
  root.addEventListener('load', nameItemsForPond);

  /* ---------- sprites (Seedream clay, keyed and sized by tools/slice_sheet.py) ---------- */
  var SPR = {
    items: { src: 'art/world/items.webp', frames: 6, w: 195, h: 189 }
  };
  var ITEM_FRAME = { egg: 0, milk: 1, fishSmall: 2, fishMedium: 3, fishLarge: 4, spaEgg: 5 };
  Object.keys(SPR).forEach(function (k) { /* frame sizes come from the slicer's json */
    if (!root.fetch) return;
    root.fetch(SPR[k].src.replace('.webp', '.json')).then(function (r) { return r.json(); }).then(function (j) {
      SPR[k].frames = j.frames; SPR[k].w = j.w; SPR[k].h = j.h; if (root.EbbGame._ready) root.EbbGame.api.refresh();
    }).catch(function () { });
  });
  /* one frame of a strip, feet at (x, y), height h scene units, optionally facing right */
  function sprite(name, frame, x, y, h, flip, cls) {
    var s = SPR[name], w = h * s.w / s.h, x0 = x - w / 2, y0 = y - h;
    var inner = '<svg x="' + x0.toFixed(2) + '" y="' + y0.toFixed(2) + '" width="' + w.toFixed(2) + '" height="' + h + '" viewBox="' + (frame * s.w) + ' 0 ' + s.w + ' ' + s.h + '" preserveAspectRatio="none">' +
      '<image href="' + s.src + '" width="' + (s.w * s.frames) + '" height="' + s.h + '"/></svg>';
    return '<g' + (cls ? ' class="' + cls + '"' : '') + (flip ? ' transform="translate(' + (2 * x).toFixed(2) + ' 0) scale(-1 1)"' : '') + '>' + inner + '</g>';
  }
  function her(y, scene) { return 104 * W.scaleAt(y, scene); } /* her standing height in scene units at depth y */
  function shadow(x, y, rx) { return '<ellipse cx="' + x + '" cy="' + y + '" rx="' + rx + '" ry="' + (rx * 0.28).toFixed(2) + '" fill="rgba(60,40,20,0.18)"/>'; }
  function heartsRow(x, y, n) {
    var out = '', show = Math.max(1, Math.min(5, n));
    for (var i = 0; i < show; i++) {
      var hx = x + (i - (show - 1) / 2) * 2.4, on = i < n;
      out += '<path d="M' + hx + ' ' + (y + 0.9) + ' l-1 -1 a0.6 0.6 0 0 1 1 -0.8 a0.6 0.6 0 0 1 1 0.8 z" fill="' + (on ? '#f08fa0' : 'rgba(255,255,255,0.7)') + '"/>';
    }
    return out;
  }
  function ring(x, y, rx) { return '<ellipse cx="' + x + '" cy="' + y + '" rx="' + rx + '" ry="' + (rx * 0.35).toFixed(2) + '" fill="none" stroke="#fff6e8" stroke-width="0.45" stroke-dasharray="1.1 0.9"/>'; }
  function sign(x, y, text, flip) {
    var w = text.length * 1.35 + 4;
    return '<g class="world-sign"><rect x="' + (x - 0.4) + '" y="' + (y - 1) + '" width="0.8" height="7" fill="#9a7552"/>' +
      '<rect x="' + (x - w / 2) + '" y="' + (y - 3.6) + '" width="' + w + '" height="3.6" rx="0.9" fill="#d9b37a" stroke="#9a7552" stroke-width="0.3"/>' +
      '<text x="' + x + '" y="' + (y - 1.15) + '" font-size="2.2" font-weight="700" text-anchor="middle" fill="#5a3f2a">' + (flip ? '‹ ' + text : text + ' ›') + '</text></g>';
  }

  /* ---------- a small sheet (same look as the engine's) ---------- */
  var openSheet = null;
  function sheet(title, build, onClose, extra) {
    if (openSheet) openSheet();
    var wrap = doc.createElement('div'); wrap.className = 'sheet-wrap world-sheet' + (extra ? ' ' + extra : '');
    wrap.innerHTML = '<section class="sheet" role="dialog" aria-modal="true" aria-label="' + title + '"><h2>' + title + '</h2><div class="sheet-body"></div><div class="sheet-actions"></div></section>';
    var body = wrap.querySelector('.sheet-body'), acts = wrap.querySelector('.sheet-actions');
    function close() { if (!wrap.parentNode) return; wrap.remove(); openSheet = null; if (onClose) onClose(); }
    function buttons(list) {
      acts.innerHTML = '';
      list.forEach(function (a) {
        var b = doc.createElement('button'); b.type = 'button'; b.textContent = a.label; b.className = a.primary ? 'btn primary' : 'btn';
        if (a.id) b.id = a.id;
        b.addEventListener('click', a.fn); acts.appendChild(b);
      });
      var first = acts.querySelector('.btn.primary') || acts.querySelector('button'); if (first) first.focus();
    }
    /* keys stay inside the sheet so Enter on a button never reaches the game's own key handler */
    wrap.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Escape') close(); });
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    doc.body.appendChild(wrap); openSheet = close;
    build(body, buttons, close);
    return close;
  }
  function p(text, cls) { var el = doc.createElement('p'); el.textContent = text; if (cls) el.className = cls; return el; }

  /* ---------- hot spring ---------- */
  var soaking = false;
  function waterOver() { /* the pool surface drawn over her lower half so she sits in the water */
    var x = SIT_IN_WATER.x, y = SIT_IN_WATER.y, sc = W.scaleAt(y, 'spring'), h = 247 * 104 / 300 * sc, w = 169 * 104 / 300 * sc;
    var f = function (v) { return v.toFixed(2); };
    return '<g class="world-water"><ellipse cx="' + x + '" cy="' + f(y - h * 0.2) + '" rx="' + f(w * 0.8) + '" ry="' + f(h * 0.25) + '" fill="' + (W.SCENES.spring.water || '#b2e0d4') + '" opacity="0.9"/>' +
      '<ellipse cx="' + x + '" cy="' + f(y - h * 0.42) + '" rx="' + f(w * 0.72) + '" ry="' + f(h * 0.06) + '" fill="none" stroke="#f4fffb" stroke-width="0.25" opacity="0.55"/>' +
      '<path class="world-steam" d="M' + f(x - w * 0.45) + ' ' + f(y - h * 0.8) + ' q-1.2 -2 0 -4 q1.2 -2 0 -4 M' + f(x + w * 0.5) + ' ' + f(y - h * 0.7) + ' q1.2 -2 0 -4 q-1.2 -2 0 -4" stroke="#ffffff" stroke-width="0.5" fill="none" stroke-linecap="round" opacity="0.6"/></g>';
  }
  root.EbbGame.registerKind('soak', function (spot, api) {
    var me = api.me();
    soaking = true; api.sit(SIT_IN_WATER); api.fx(waterOver(), 36e5);
    function out() {
      if (!soaking) return; soaking = false;
      api.fx('', 1); api.stand(spot.stand.y); me.x = spot.stand.x;
    }
    sheet('Hot spring', function (body, buttons, close) {
      function draw(line) {
        body.innerHTML = '';
        body.appendChild(p(line || 'Warm water up to her shoulders. Stay as long as you like.'));
        var list = [];
        if ((api.state().farm.basket.egg || 0) > 0) list.push({ id: 'dropEgg', label: 'Lower an egg into the water', fn: function () {
          if (!R().boilEgg(api.state().farm)) return;
          var w = data(api); w.spaEggFound = true; api.save(); api.refresh();
          api.fx(waterOver() + (root.EbbProps ? root.EbbProps.sparkles(SIT_IN_WATER.x + 6, SIT_IN_WATER.y - 2, 8) : ''), 2400);
          setTimeout(function () { if (soaking) api.fx(waterOver(), 36e5); }, 2400);
          draw('A little while later: a spa-boiled egg, soft and golden. A hot spring secret. It is in your basket.');
        } });
        list.push({ id: 'leaveSpring', label: 'Climb out', primary: true, fn: close });
        buttons(list);
      }
      draw();
    }, out);
  });
  root.EbbGame.registerProps('waterfall', function (api, near) {
    var sp = W.SCENES[FISH_SCENE].spots.filter(function (s) { return s.id === 'fishing'; })[0], out = sign(80, 162, 'Hot spring');
    if (!sp) return out;
    /* a little rod resting at the pond edge */
    out += '<g class="world-rod"><path d="M' + (sp.at.x - 2) + ' ' + (sp.at.y + 3) + ' L' + (sp.at.x + 5) + ' ' + (sp.at.y - 5) + '" stroke="#9a7552" stroke-width="0.6" stroke-linecap="round"/>' +
      '<path d="M' + (sp.at.x + 5) + ' ' + (sp.at.y - 5) + ' q1.5 3 1.2 6" stroke="#fff6e8" stroke-width="0.2" fill="none"/>' +
      '<circle cx="' + (sp.at.x + 6.2) + '" cy="' + (sp.at.y + 1) + '" r="0.7" fill="#e8836f"/></g>';
    if (near && near.spot === sp) out += ring(sp.at.x + 2, sp.at.y + 2, 5);
    return out;
  });

  /* ---------- fishing: a calm timing game, nothing lost when one gets away ---------- */
  function floatFx(x, y, bite) { /* a red and white float on the pond itself, in scene percent */
    var r = function (v) { return v.toFixed(2); }, fy = y + (bite ? 0.55 : 0);
    return '<g class="world-float' + (bite ? ' bite' : '') + '">' +
      '<ellipse class="world-ripple" cx="' + r(x) + '" cy="' + r(y + 0.55) + '" rx="' + (bite ? 2.6 : 1.5) + '" ry="' + (bite ? 0.85 : 0.5) + '" fill="none" stroke="#effcf8" stroke-width="0.22" opacity="0.85"/>' +
      '<circle cx="' + r(x) + '" cy="' + r(fy - 0.35) + '" r="0.8" fill="#e8836f"/><rect x="' + r(x - 0.8) + '" y="' + r(fy - 0.35) + '" width="1.6" height="0.65" rx="0.2" fill="#fffaf3"/></g>';
  }
  root.EbbGame.registerKind('fish', function (spot, api) {
    var R0 = R(), timers = [], c = null, t0 = 0, state = 'idle', fx = spot.float ? spot.float.x : spot.at.x + 9, fy = spot.float ? spot.float.y : spot.at.y - 5.5;
    api.work('none', 36e5, 'back');
    function clear() { timers.forEach(clearTimeout); timers = []; }
    sheet('Fishing', function (body, buttons) {
      body.innerHTML = '<p class="world-status" id="fishStatus" role="status"></p>';
      var status = body.querySelector('#fishStatus');
      function say(t) { status.textContent = t; }
      function bite(on) { api.fx(floatFx(fx, fy, on), 36e5); }
      function castLine() {
        clear(); c = R0.cast(Math.random(), Math.random()); t0 = Date.now(); state = 'waiting';
        bite(false); say('The float bobs on the water. Wait for a nibble.');
        buttons([{ id: 'reelIn', label: 'Reel in', primary: true, fn: reelIn }, { label: 'Done', fn: function () { state = 'done'; clear(); if (openSheet) openSheet(); } }]);
        timers.push(setTimeout(function () { if (state === 'waiting') { bite(true); say('A nibble! Reel in now.'); } }, c.waitMs));
        timers.push(setTimeout(function () { if (state === 'waiting') finish({ result: 'away' }); }, c.waitMs + c.windowMs));
      }
      function reelIn() { if (state === 'waiting') finish(R0.reel(c, Date.now() - t0, Math.random())); }
      function finish(res) {
        clear(); state = 'result';
        api.fx(res.result === 'caught' && root.EbbProps ? root.EbbProps.sparkles(fx, fy, 7) : '', 1600);
        if (res.result === 'caught') {
          R0.addToBasket(api.state().farm, res.size, 1);
          var w = data(api); w.fish = (w.fish || 0) + 1; api.save(); api.refresh();
          say('You caught a ' + itemName(res.size) + '. Into the basket.');
        } else say(res.result === 'early' ? 'Too soon. It swam off. The water is calm again.' : 'It got away. The water is calm again.');
        buttons([{ id: 'castAgain', label: 'Cast again', primary: true, fn: castLine }, { label: 'Done', fn: function () { if (openSheet) openSheet(); } }]);
      }
      castLine();
    }, function () { clear(); state = 'done'; api.fx('', 1); api.work('none', 0, 'front'); }, 'world-mini');
  });

})(typeof window !== 'undefined' ? window : globalThis);
