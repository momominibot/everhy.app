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
    name: 'Hot spring', plate: 'art/plates/hotspring.webp', video: 'art/plates/hotspring-live.mp4', aspect: [4, 7], depth: [100, 0.22, 175, 0.33], water: '#9fd0e0', surface: 'tile',
    floor: [[4, 100], [20, 100], [20, 106], [84, 106], [84, 100], [96, 100], [96, 175], [4, 175]],
    solids: [[20, 66, 84, 106], [4, 80, 33, 118], [84, 86, 100, 110], [78, 106, 92, 126], [10, 120, 28, 136], [84, 122, 92, 136]], /* pool and rim, egg station, pinwheel, notice board, bench, stone */
    doors: [{ id: 'toFalls', rect: [34, 170, 64, 175], to: 'waterfall', arrive: { x: 66, y: 166 }, label: 'Back to Little Guilin' }],
    spots: [{ id: 'soak', kind: 'soak', at: { x: 70, y: 96 }, stand: { x: 70, y: 110 }, label: 'Slip into the warm water' }],
    start: { x: 50, y: 160 }
  });
  W.addDoor('waterfall', { id: 'toSpring', rect: [57, 170, 78, 175], to: 'spring', arrive: { x: 48, y: 160 }, label: 'Path to the hot spring' }); /* the right half of the stone path */
  /* no addSpot hook yet: appended after the pond, so the engine's own spots keep their order */
  var FISH_SCENE = W.SCENES.jetty ? 'jetty' : 'waterfall'; /* Bedok Jetty when the core has it, else the lake deck */
  if (W.SCENES[FISH_SCENE] && !W.SCENES[FISH_SCENE].spots.some(function (s) { return s.id === 'fishing'; })) {
    W.SCENES[FISH_SCENE].spots.push(FISH_SCENE === 'jetty'
      ? { id: 'fishing', kind: 'fish', at: { x: 54, y: 78 }, stand: { x: 54, y: 80 }, float: { x: 40, y: 78 }, label: 'Fish from the jetty' }
      : { id: 'fishing', kind: 'fish', at: { x: 80, y: 103 }, stand: { x: 80, y: 109 }, float: { x: 66, y: 88 }, label: 'Fish from the deck' });
  }
  var SIT_IN_WATER = { x: 70, y: 96 }; /* in the open water of the lower pool, right of the little waterfall; her figure is cut at the waterline */

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

  /* ---------- a small sheet (same look as the engine's) ----------
   * opts: { cls: extra wrap class, dismissOnBackdrop: false } -> a tap on the transparent wrap is absorbed but does
   * not close the sheet (so a stray tap while she soaks or fishes never pops her out). Only the card button or
   * Escape closes it. A plain string is still accepted as the extra class (older call sites). */
  var openSheet = null;
  function sheet(title, build, onClose, opts) {
    if (openSheet) openSheet();
    if (typeof opts === 'string') opts = { cls: opts };
    opts = opts || {};
    var dismissOnBackdrop = opts.dismissOnBackdrop === true;
    var wrap = doc.createElement('div'); wrap.className = 'sheet-wrap world-sheet' + (opts.cls ? ' ' + opts.cls : '');
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
    /* the wrap covers the whole screen to absorb taps (so she can't walk while resting); it only closes when asked */
    wrap.addEventListener('click', function (e) { if (dismissOnBackdrop && e.target === wrap) close(); });
    doc.body.appendChild(wrap); openSheet = close;
    build(body, buttons, close);
    return close;
  }
  function p(text, cls) { var el = doc.createElement('p'); el.textContent = text; if (cls) el.className = cls; return el; }

  /* ---------- hot spring ---------- */
  var soaking = false;
  /* she sits in the water the way games do it: her figure is cut off at the waterline with a soft edge (a mask on #me),
   * and a light ring and a thin veil of water sit on the surface. Nothing is painted over her legs. */
  function waterGeom() {
    var x = SIT_IN_WATER.x, y = SIT_IN_WATER.y, sc = W.scaleAt(y, 'spring'), h = 247 * 104 / 300 * sc, w = 169 * 104 / 300 * sc;
    return { x: x, y: y, h: h, w: w, sc: sc, line: y - h * 0.34, local: -247 * 104 / 300 * 0.34 }; /* local: the waterline in her own units (#me is translated and scaled) */
  }
  var NS = 'http://www.w3.org/2000/svg';
  function cutAtWater(on) {
    var meEl = doc.getElementById('me'); if (!meEl) return;
    if (!on) { meEl.removeAttribute('mask'); return; }
    var svg = meEl.ownerSVGElement, m = doc.getElementById('soakCut');
    if (!m && svg) {
      var defs = svg.querySelector('defs') || svg.insertBefore(doc.createElementNS(NS, 'defs'), svg.firstChild);
      defs.insertAdjacentHTML('beforeend', '<linearGradient id="soakFade" gradientUnits="userSpaceOnUse" x1="0" x2="0"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>' +
        '<mask id="soakCut" maskUnits="userSpaceOnUse" x="-1000" y="-1000" width="3000" height="3000"><rect id="soakCutRect" x="-1000" y="-1000" width="3000" height="3000" fill="url(#soakFade)"/></mask>');
    }
    var g = waterGeom(), fade = doc.getElementById('soakFade');
    if (fade) { var soft = 0.8 / g.sc; fade.setAttribute('y1', (g.local - soft).toFixed(2)); fade.setAttribute('y2', (g.local + soft).toFixed(2)); }
    meEl.setAttribute('mask', 'url(#soakCut)');
  }
  function waterOver() {
    var g = waterGeom(), x = g.x, h = g.h, w = g.w, line = g.line;
    var f = function (v) { return v.toFixed(2); };
    var col = W.SCENES.spring.water || '#b2e0d4';
    return '<g class="world-water">' +
      '<ellipse cx="' + x + '" cy="' + f(line + h * 0.02) + '" rx="' + f(w * 0.8) + '" ry="' + f(h * 0.07) + '" fill="' + col + '" opacity="0.5"/>' +
      '<ellipse cx="' + x + '" cy="' + f(line) + '" rx="' + f(w * 0.62) + '" ry="' + f(h * 0.045) + '" fill="none" stroke="#f4fffb" stroke-width="0.35" opacity="0.7"/>' +
      '<ellipse cx="' + x + '" cy="' + f(line + h * 0.01) + '" rx="' + f(w * 0.9) + '" ry="' + f(h * 0.075) + '" fill="none" stroke="#f4fffb" stroke-width="0.2" opacity="0.35"/>' +
      '<path class="world-steam" d="M' + f(x - w * 0.45) + ' ' + f(g.y - h * 0.8) + ' q-1.2 -2 0 -4 q1.2 -2 0 -4 M' + f(x + w * 0.5) + ' ' + f(g.y - h * 0.7) + ' q1.2 -2 0 -4 q-1.2 -2 0 -4" stroke="#ffffff" stroke-width="0.5" fill="none" stroke-linecap="round" opacity="0.6"/></g>';
  }
  root.EbbGame.registerKind('soak', function (spot, api) {
    var me = api.me();
    soaking = true; api.fx(waterOver(), 36e5);
    /* the waterline cut follows her only while she is really sitting in the spring */
    var watch = setInterval(function () {
      var m = api.me(), inWater = soaking && api.scene() === 'spring' && m.action === 'sit' && Math.abs(m.y - SIT_IN_WATER.y) < 0.5;
      cutAtWater(inWater);
      if (!soaking) { clearInterval(watch); cutAtWater(false); }
    }, 120);
    /* in she goes with a little spin, changing for the water as she turns (her towel tube once that art exists) */
    if (api.spin) { api.sit(SIT_IN_WATER, null); api.spin(function () { if (soaking && api.pose) api.pose('soak'); }); } else api.sit(SIT_IN_WATER, 'soak');
    function out() {
      if (!soaking) return; soaking = false;
      function up() { cutAtWater(false); api.fx('', 1); api.stand(spot.stand.y); me.x = spot.stand.x; }
      if (api.spin) api.spin(up); else up(); /* and out again with a spin, back in her own clothes */
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
    }, out, { dismissOnBackdrop: false });
  });
  /* Little Guilin: only the signpost. No fishing there: NParks lists Bukit Batok Town Park as "Do not fish" */
  root.EbbGame.registerProps('waterfall', function () { return sign(80, 162, 'Hot spring'); });
  root.EbbGame.registerProps(FISH_SCENE, function (api, near) {
    var sp = W.SCENES[FISH_SCENE].spots.filter(function (s) { return s.id === 'fishing'; })[0], out = '';
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
    api.sit({ x: spot.at.x, y: spot.at.y + 0.2 }, 'fish'); /* she sits on the jetty edge with the rod */
    function clear() { timers.forEach(clearTimeout); timers = []; }
    /* the catch marker runs back and forth across the bar; held out here so the sheet's close hook can stop it too */
    var raf = 0, pos = 0, dir = 1, lastTs = 0, speed = 0.92; /* fraction of the bar per second */
    function stopLoop() { if (raf) cancelAnimationFrame(raf); raf = 0; lastTs = 0; }
    sheet('Fishing', function (body, buttons) {
      body.innerHTML = '<p class="world-status" id="fishStatus" role="status"></p>' +
        '<div class="fish-catch" id="fishCatch" hidden><div class="fish-bar" id="fishBar">' +
        '<div class="fish-zone"></div><div class="fish-mid"></div><div class="fish-marker" id="fishMarker"></div>' +
        '</div></div>';
      var status = body.querySelector('#fishStatus');
      var catchBox = body.querySelector('#fishCatch');
      var bar = body.querySelector('#fishBar');
      var marker = body.querySelector('#fishMarker');
      function say(t) { status.textContent = t; }
      function showBar(on) { catchBox.hidden = !on; }
      function quit() { state = 'done'; clear(); stopLoop(); if (openSheet) openSheet(); }
      function bite(on) { api.fx(floatFx(fx, fy, on), 36e5); }

      /* the catch marker runs back and forth across the bar; she stops it in the green middle */
      function frame(ts) {
        if (!lastTs) lastTs = ts;
        var dt = (ts - lastTs) / 1000; lastTs = ts;
        pos += dir * speed * dt;
        if (pos >= 1) { pos = 1; dir = -1; }
        if (pos <= 0) { pos = 0; dir = 1; }
        marker.style.left = (pos * 100).toFixed(2) + '%';
        raf = requestAnimationFrame(frame);
      }

      function castLine() {
        clear(); c = R0.cast(Math.random(), Math.random()); t0 = Date.now(); state = 'waiting';
        stopLoop(); showBar(false); bar.classList.remove('is-stop', 'is-win');
        bite(false); say('The float bobs on the water. Wait for a nibble.');
        buttons([{ id: 'reelIn', label: 'Reel in', primary: true, fn: earlyReel }, { label: 'Done', fn: quit }]);
        timers.push(setTimeout(function () { if (state === 'waiting') { bite(true); startCatch(); } }, c.waitMs));
      }
      function earlyReel() { if (state === 'waiting') finish({ result: 'early' }); }

      /* the catch game opens on the nibble; left too long, the fish spits the hook */
      function startCatch() {
        state = 'catching';
        say('A nibble. Stop the marker in the green middle.');
        pos = 0; dir = 1; lastTs = 0; bar.classList.remove('is-stop', 'is-win');
        showBar(true);
        buttons([{ id: 'stopMarker', label: 'Stop', primary: true, fn: stopMarker }, { label: 'Done', fn: quit }]);
        raf = requestAnimationFrame(frame);
        timers.push(setTimeout(function () { if (state === 'catching') finish({ result: 'away' }); }, 6000));
      }
      function stopMarker() {
        if (state !== 'catching') return;
        stopLoop(); state = 'settled';
        bar.classList.add('is-stop');
        var res = R0.catchAt(pos, Math.random());
        if (res.result === 'caught') bar.classList.add('is-win');
        finish(res);
      }
      function finish(res) {
        clear(); stopLoop(); state = 'result';
        showBar(false);
        api.fx(res.result === 'caught' && root.EbbProps ? root.EbbProps.sparkles(fx, fy, 7) : '', 1600);
        var again = [{ id: 'castAgain', label: 'Cast again', primary: true, fn: castLine }, { label: 'Done', fn: quit }];
        if (res.result === 'caught') { /* she chooses: keep it for the kitchen, or let it go */
          say('You caught a ' + itemName(res.size) + '. Keep it for the kitchen, or let it go?');
          buttons([{ id: 'keepFish', label: 'Keep it', primary: true, fn: function () {
            R0.addToBasket(api.state().farm, res.size, 1);
            var w = data(api); w.fish = (w.fish || 0) + 1; api.save(); api.refresh();
            say('Into the basket. Cook it at home: grilled, or steamed with ginger.'); buttons(again);
          } }, { id: 'releaseFish', label: 'Let it go', fn: function () {
            var w = data(api); w.released = (w.released || 0) + 1; api.save();
            api.fx(root.EbbProps ? root.EbbProps.sparkles(fx, fy, 5) : '', 1400);
            say('You let it slip back into the sea. It flicks its tail and is gone.'); buttons(again);
          } }]);
          return;
        }
        say(res.result === 'early' ? 'Too soon. It swam off. The water is calm again.' : 'It got away. The water is calm again.');
        buttons(again);
      }
      castLine();
    }, function () { clear(); stopLoop(); state = 'done'; api.fx('', 1); api.stand(spot.stand.y); }, { cls: 'world-mini', dismissOnBackdrop: false });
  });

})(typeof window !== 'undefined' ? window : globalThis);
