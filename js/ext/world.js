/* Ebb world extension: the barn (two hens and a cow), a hidden hot spring past the waterfall, and fishing at the pond
 * edge. Places register with EbbWorld (pure, so the node harness checks every door and stand point); the page part
 * below only runs in a browser. Rules live in js/world/rules.js. Floors and spots were read from each plate on a 10%
 * grid. Nothing here gets sick, wilts or dies, and nothing asks about health. */
(function (root) {
  'use strict';
  var W = root.EbbWorld;
  if (!W) return;

  /* ---------- places ---------- */
  W.register('barn', { /* bird's-eye room like the bedroom: floor is the plank diamond, furniture footprints are solids */
    name: 'Barn', plate: 'art/world/barn-birdseye.webp', depth: [45, 0.19, 95, 0.23],
    floor: [[10, 53], [17, 46], [27, 44], [78, 45], [92, 65], [90, 84], [60, 96], [8, 77]],
    solids: [[33, 50, 70, 70], [8, 60, 18, 71], [64, 78, 75, 89], [82, 54, 91, 66], [66, 43, 78, 50], [78, 45, 90, 56], [22, 79, 41, 86]],
    doors: [{ id: 'toFarm', rect: [16, 45, 24, 50], to: 'farm', arrive: { x: 12, y: 85 }, label: 'Out to the farm' }],
    spots: [
      { id: 'hen1', kind: 'hen', at: { x: 39, y: 47 }, stand: { x: 29, y: 51 }, label: 'Say hello to Pip', flip: true },
      { id: 'hen2', kind: 'hen', at: { x: 55, y: 78 }, stand: { x: 57, y: 86 }, label: 'Say hello to Clover' },
      { id: 'cow', kind: 'cow', at: { x: 32, y: 84 }, stand: { x: 46, y: 85 }, label: 'Say hello to Mochi', flip: true }
    ],
    start: { x: 22, y: 58 }
  });
  W.register('spring', {
    name: 'Hot spring', plate: 'art/world/spring.webp', depth: [56, 0.125, 98, 0.19],
    floor: [[2, 56], [12, 58], [16, 76], [98, 76], [98, 98], [2, 98]],
    doors: [{ id: 'toFalls', rect: [2, 56, 9, 66], to: 'waterfall', arrive: { x: 90, y: 77 }, label: 'Back to the waterfall' }],
    spots: [{ id: 'soak', kind: 'soak', at: { x: 52, y: 62 }, stand: { x: 52, y: 80 }, label: 'Slip into the warm water' }],
    start: { x: 12, y: 82 }
  });
  W.addDoor('farm', { id: 'toBarn', rect: [3, 76.5, 6, 85.5], to: 'barn', arrive: { x: 22, y: 58 }, label: 'Path to the barn' });
  W.addDoor('waterfall', { id: 'toSpring', rect: [94, 70, 98, 84], to: 'spring', arrive: { x: 12, y: 82 }, label: 'Steam past the trees' });
  /* no addSpot hook yet: appended after the pond, so the engine's own spots keep their order */
  if (W.SCENES.waterfall && !W.SCENES.waterfall.spots.some(function (s) { return s.id === 'fishing'; })) {
    W.SCENES.waterfall.spots.push({ id: 'fishing', kind: 'fish', at: { x: 36, y: 65 }, stand: { x: 36, y: 74 }, label: 'Fish at the pond edge' });
  }
  var SIT_IN_WATER = { x: 52, y: 66 };

  var doc = root.document;
  if (!doc || !root.EbbGame) return; /* the node harness stops here */

  /* rules load as their own file; the load event waits for them, and nothing below needs them until a tap */
  if (!root.EbbWorldRules) { var sc = doc.createElement('script'); sc.src = 'js/world/rules.js'; sc.async = false; doc.head.appendChild(sc); }
  function R() { return root.EbbWorldRules; }
  function data(api) {
    var st = api.state();
    st.world = st.world && typeof st.world === 'object' ? st.world : {};
    st.world.barn = R().ensureBarn(st.world.barn);
    return st.world;
  }
  function itemName(key) {
    var r = R(), F = root.EbbFarm;
    return (r && r.ITEMS[key] ? r.ITEMS[key].name : F && F.CROPS[key] ? F.CROPS[key].name : key).toLowerCase();
  }
  /* the engine's pond names an offering from EbbFarm.CROPS. Barn and fishing items are added as non-enumerable entries,
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
    hen: { src: 'art/world/hen.webp', frames: 4, w: 203, h: 210 },
    cow: { src: 'art/world/cow.webp', frames: 3, w: 399, h: 320 },
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

  /* ---------- barn ---------- */
  var ACT_WORDS = {
    hen: { feed: ['Scatter some grain', 'pecks happily at the grain.'], talk: ['Have a chat', 'tilts her head and listens.'], brush: ['Smooth her feathers', 'fluffs up, pleased.'] },
    cow: { feed: ['Offer some hay', 'munches the hay slowly.'], talk: ['Have a chat', 'blinks her long lashes at you.'], brush: ['Brush her coat', 'leans into the brush.'] }
  };
  var flashUntil = {};
  function careSheet(spot, api) {
    var w = data(api), R0 = R(), a = w.barn.animals[spot.id], day = api.today();
    R0.settle(w.barn, day); api.save();
    var words = ACT_WORDS[a.kind];
    api.work('none', 400, 'back');
    sheet(a.name, function (body, buttons, close) {
      function draw(line) {
        body.innerHTML = '';
        var hearts = R0.hearts(a);
        body.appendChild(p(line || (R0.caredOn(a, day) ? a.name + ' has had some kindness today.' : 'What would you like to do?')));
        body.appendChild(p('Hearts ' + hearts + ' of ' + R0.HEART_MAX + '. A heart grows every ' + R0.HEART_EVERY + ' days you visit. Days away take nothing away.', 'muted'));
        var list = [];
        if (a.kind === 'hen' && a.nest > 0) list.push({ id: 'collectEgg', label: 'Collect ' + (a.nest > 1 ? a.nest + ' eggs' : 'the egg'), primary: true, fn: function () {
          var n = R0.collectEggs(w.barn, spot.id, day); R0.addToBasket(api.state().farm, 'egg', n); api.save(); api.refresh();
          draw('You found ' + (n > 1 ? n + ' warm eggs' : 'a warm egg') + ' in the straw. Into the basket.');
        } });
        if (a.kind === 'cow' && R0.canMilk(w.barn, spot.id, day)) list.push({ id: 'milkCow', label: 'Milk', primary: true, fn: function () {
          if (R0.milk(w.barn, spot.id, day)) { R0.addToBasket(api.state().farm, 'milk', 1); api.save(); api.refresh(); draw('A bottle of fresh milk for the basket.'); }
        } });
        R0.ACTS.forEach(function (act) {
          list.push({ id: 'care-' + act, label: words[act][0], fn: function () {
            var res = R0.care(w.barn, spot.id, act, day); api.save(); flashUntil[spot.id] = Date.now() + 1600; api.refresh(); setTimeout(api.refresh, 1700);
            var line = a.name + ' ' + words[act][1];
            if (res.heart) line += ' A new heart.';
            if (res.fed) line += ' There may be an egg tomorrow.';
            if (a.kind === 'cow' && R0.canMilk(w.barn, spot.id, day)) line += ' She is ready to be milked.';
            draw(line);
          } });
        });
        list.push({ label: 'Done', fn: close });
        buttons(list);
      }
      draw();
    });
  }
  root.EbbGame.registerKind('hen', careSheet);
  root.EbbGame.registerKind('cow', careSheet);
  root.EbbGame.registerProps('barn', function (api, near) {
    if (!R()) return '';
    var w = data(api), day = api.today(), out = '', s = W.SCENES.barn;
    R().settle(w.barn, day);
    s.spots.forEach(function (sp) {
      var a = w.barn.animals[sp.id], x = sp.at.x, y = sp.at.y, isNear = near && near.spot === sp, flash = Date.now() < (flashUntil[sp.id] || 0);
      if (a.kind === 'hen') {
        var hf = flash ? 3 : a.nest > 0 ? 2 : R().fedOn(a, day) ? 1 : 0, hh = her(y, 'barn') * 0.38;
        out += shadow(x, y + 0.3, hh * 0.38) + sprite('hen', hf, x, y + 0.6, hh, !!sp.flip, 'world-animal');
        if (a.nest > 0) out += sprite('items', ITEM_FRAME.egg, x + hh * 0.55, y + 0.8, hh * 0.3);
        if (isNear) out += ring(x, y + 0.4, hh * 0.6) + heartsRow(x, y - hh - 2, R().hearts(a));
      } else {
        var cared = R().caredOn(a, day), cf = a.milkDay === day ? 2 : cared && a.lastAct === 'feed' ? 1 : 0, ch = her(y, 'barn') * 0.75;
        out += shadow(x, y + 0.4, ch * 0.55) + sprite('cow', cf, x, y + 0.8, ch, !!sp.flip, 'world-animal');
        if (R().canMilk(w.barn, sp.id, day)) out += sprite('items', ITEM_FRAME.milk, x - ch * 0.7, y + 0.6, ch * 0.2);
        if (isNear) out += ring(x, y + 0.6, ch * 0.65) + heartsRow(x, y - ch - 2, R().hearts(a));
      }
    });
    return out;
  });
  root.EbbGame.registerProps('farm', function () { return sign(10, 92, 'Barn', true); });

  /* ---------- hot spring ---------- */
  var soaking = false;
  function waterOver() { /* the pool surface drawn over her lower half so she sits in the water */
    var x = SIT_IN_WATER.x, y = SIT_IN_WATER.y, sc = W.scaleAt(y, 'spring'), h = 247 * 104 / 300 * sc, w = 169 * 104 / 300 * sc;
    var f = function (v) { return v.toFixed(2); };
    return '<g class="world-water"><ellipse cx="' + x + '" cy="' + f(y - h * 0.16) + '" rx="' + f(w * 0.8) + '" ry="' + f(h * 0.3) + '" fill="#b2e0d4" opacity="0.88"/>' +
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
    var sp = W.SCENES.waterfall.spots.filter(function (s) { return s.id === 'fishing'; })[0], out = sign(92, 66, 'Hot spring');
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
    var R0 = R(), timers = [], c = null, t0 = 0, state = 'idle', fx = spot.at.x + 9, fy = spot.at.y - 5.5;
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
