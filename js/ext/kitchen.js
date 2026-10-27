/* Ebb kitchen: a full kitchen of her own, one isometric cut-away render (art/plates/kitchen.webp) that the camera pans
 * around at zoom 2.4, reached from the living room. The hob cooks, the oven bakes and the Thermomix blends, all from
 * what the garden, the hens and the jetty put in the basket; the basin is a twenty second mindful hand-washing pause
 * saved like a practice; the fridge is the food log and the teapot the warm cup. Rules live in js/kitchen/rules.js
 * (pure). The room registers here so the node harness checks every stand and door; the page part runs only in a
 * browser. No calories, no scores, nothing spoils, nothing is owed. */
(function (root) {
  'use strict';
  var W = root.EbbWorld;
  if (!W) return;

  /* ---------- the room (read from the render on 5 and 2.5 percent grids; y runs 0..100) ---------- */
  W.register('kitchen', {
    name: 'Kitchen', plate: 'art/plates/kitchen.webp', indoor: true, zoom: 2.4, depth: [46, 0.125, 93, 0.17],
    lamps: [{ x: 32, y: 37 }, { x: 69, y: 42 }], windows: [{ x: 42, y: 27, rx: 5, ry: 8 }], /* the hood's light and the fridge panel; the window over the sink */
    floor: [[50, 48], [96, 66.5], [50, 92.5], [3, 70.5]],
    /* the long counter in eight steps along the back-left wall (Thermomix end down to the sink end, each with its margin
     * above), the plant stool, the double-door fridge, the big plant, the dining table, its front chair and its right chair */
    solids: [[18, 44, 23, 69], [23, 43, 28, 66], [28, 42, 33, 64], [33, 41, 38, 62], [38, 39, 43, 60], [43, 37, 48, 57.5], [48, 35, 53, 55.5], [53, 34, 58, 53],
      [57, 40, 66, 57], [66, 25, 89, 65], [82, 50, 95, 70.5], [61, 63, 80, 79], [53, 72, 66, 87], [76, 58, 86, 77]],
    doors: [{ id: 'toLiving', rect: [9, 65, 17, 73], to: 'living', arrive: { x: 28, y: 70 }, label: 'Back to the living room' }], /* the floor at the foot of the arched doorway in the left wall */
    spots: [
      { id: 'fridge', kind: 'log', topic: 'food', at: { x: 77, y: 45 }, stand: { x: 63, y: 61.5 }, label: 'What did you eat or drink?' },
      { id: 'hob', kind: 'cook', at: { x: 35, y: 47 }, stand: { x: 36, y: 65 }, label: 'Cook something', steam: { x: 35, y: 43 } },
      { id: 'oven', kind: 'bake', at: { x: 39, y: 55 }, stand: { x: 41, y: 63 }, label: 'Bake something', steam: { x: 40, y: 50 } },
      { id: 'thermomix', kind: 'blend', at: { x: 24, y: 50 }, stand: { x: 26, y: 69 }, label: 'Blend a smoothie', steam: { x: 24, y: 45 } },
      { id: 'basin', kind: 'wash', at: { x: 46, y: 41 }, stand: { x: 49, y: 58 }, label: 'Wash your hands, slowly', steam: { x: 44, y: 37 } },
      { id: 'kettle', kind: 'tea', at: { x: 56, y: 32 }, stand: { x: 56, y: 60 }, label: 'Make a warm cup' }, /* the pink teapot on the shelf */
      { id: 'dining', kind: 'seat', at: { x: 66, y: 72 }, stand: { x: 56, y: 88.5 }, label: 'Sit at the table' } /* the front chair: eat what she cooked, slowly (js/seats/rules.js) */
    ],
    start: { x: 28, y: 76 }
  });

  /* the way in from the living room. Asked for: a door on the back wall at [62, 47, 72, 52]. That rect sits on the record
   * cabinet and the plant pot, so when it is not clear the door goes to the nearest clear floor on the back edge, just
   * right of the island counter (x 44..50, y 48..53), between the island and the coffee table. */
  var ASKED = { id: 'toKitchen', rect: [62, 47, 72, 52], to: 'kitchen', arrive: { x: 21, y: 74 }, label: 'Into the kitchen' };
  var FALLBACK = { id: 'toKitchen', rect: [44, 48, 50, 53], to: 'kitchen', arrive: { x: 21, y: 74 }, label: 'Into the kitchen' };
  function clearRect(sceneId, r) { /* every corner and the centre on the floor, outside every solid, and no solid overlapping */
    var s = W.SCENES[sceneId]; if (!s) return false;
    var pts = [[r[0], r[1]], [r[2], r[1]], [r[0], r[3]], [r[2], r[3]], [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2]];
    if (!pts.every(function (p) { return W.walkable(sceneId, { x: p[0], y: p[1] }); })) return false;
    return s.solids.every(function (b) { return r[2] < b[0] || r[0] > b[2] || r[3] < b[1] || r[1] > b[3]; });
  }
  var livingDoor = clearRect('living', ASKED.rect) ? ASKED : FALLBACK;
  if (W.SCENES.living && !W.SCENES.living.doors.some(function (d) { return d.id === 'toKitchen'; })) W.addDoor('living', livingDoor);
  root.EbbKitchenScene = { asked: ASKED, fallback: FALLBACK, livingDoor: livingDoor, askedClear: livingDoor === ASKED };

  var doc = root.document;
  if (!doc || !root.EbbGame) return; /* the node harness stops here */

  /* rules load as their own file; the load event waits for them, and nothing below needs them until a tap */
  if (!root.EbbKitchenRules) { var sc = doc.createElement('script'); sc.src = 'js/kitchen/rules.js'; sc.async = false; doc.head.appendChild(sc); }
  function R() { return root.EbbKitchenRules; }
  function data(api) { var st = api.state(); st.kitchen = R().ensure(st.kitchen); return st.kitchen; }
  function ids() { /* crop ids from the farm (its enumerable crops only), fish ids from the world's items */
    var F = root.EbbFarm, WR = root.EbbWorldRules;
    return { crops: F ? Object.keys(F.CROPS) : [], fish: WR ? Object.keys(WR.ITEMS).filter(function (k) { return /^fish/.test(k); }) : [] };
  }
  function nameOf(k) {
    var F = root.EbbFarm, WR = root.EbbWorldRules;
    if (F && Object.prototype.hasOwnProperty.call(F.CROPS, k)) return F.CROPS[k].name;
    if (WR && WR.ITEMS[k]) return WR.ITEMS[k].name;
    return k;
  }
  function el(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function p(text, cls) { return el('p', cls || '', text); }
  function stillMotion() { return (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches) || doc.documentElement.dataset.motion === 'reduce'; }

  /* ---------- a small floating card (the world's look: no dimming, the room stays in view) ---------- */
  var current = null;
  function sheet(title, onClose) {
    if (current) current.close();
    var wrap = el('div', 'sheet-wrap kitchen-wrap'), ui;
    wrap.innerHTML = '<section class="sheet kitchen-sheet" role="dialog" aria-modal="true"><h2></h2><div class="sheet-body"></div><div class="sheet-actions"></div></section>';
    wrap.querySelector('h2').textContent = title; wrap.querySelector('.sheet').setAttribute('aria-label', title);
    var body = wrap.querySelector('.sheet-body'), acts = wrap.querySelector('.sheet-actions');
    function close() { if (!wrap.parentNode) return; wrap.remove(); if (current === ui) current = null; if (onClose) onClose(); }
    function buttons(list) {
      acts.innerHTML = '';
      list.forEach(function (a) {
        var b = el('button', a.primary ? 'btn primary' : 'btn', a.label); b.type = 'button'; if (a.id) b.id = a.id;
        b.addEventListener('click', function () { a.fn(b); }); acts.appendChild(b);
      });
      var first = acts.querySelector('.btn.primary') || acts.querySelector('button'); if (first) first.focus();
    }
    /* keys stay inside the card so Enter on a button never reaches the game's own key handler */
    wrap.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Escape') close(); });
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    root.EbbMount(wrap);
    ui = { body: body, buttons: buttons, close: close, wrap: wrap }; current = ui;
    return ui;
  }

  /* ---------- drawn over the room: a glow under whatever is on, steam, the near spot's soft ring ---------- */
  var cooking = null; /* { spot, kind } while a station or the basin runs */
  var defs = doc.querySelector('#layer defs');
  if (defs) defs.insertAdjacentHTML('beforeend', '<radialGradient id="kitchenGlow"><stop offset="0" stop-color="#ffb36b" stop-opacity="0.8"/><stop offset="1" stop-color="#ffb36b" stop-opacity="0"/></radialGradient>');
  function glow(x, y) { return '<ellipse class="kitchen-glow" cx="' + x + '" cy="' + y + '" rx="6.5" ry="3" fill="url(#kitchenGlow)"/>'; }
  function ring(x, y, rx) { return '<ellipse class="kitchen-ring" cx="' + x + '" cy="' + y + '" rx="' + rx + '" ry="' + (rx * 0.4).toFixed(2) + '" fill="none" stroke="#fff6e8" stroke-width="0.45" stroke-dasharray="1.1 0.9" opacity="0.9"/>'; }
  /* four puffs on their own clock: the fx layer is redrawn every frame, so the puffs move by the elapsed time, not by CSS */
  function steamFx(x, y, ms) {
    var out = '<g class="kitchen-steam">', still = stillMotion();
    for (var i = 0; i < 4; i++) {
      var f = still ? 0.25 + i * 0.18 : ((ms / 1000 + i * 0.9) % 3.6) / 3.6;
      var o = f < 0.2 ? f / 0.2 * 0.55 : 0.55 * (1 - (f - 0.2) / 0.8);
      out += '<ellipse cx="' + (x + (i - 1.5) * 2.2 + Math.sin(f * 6.28 + i) * 1.2).toFixed(2) + '" cy="' + (y - f * 14).toFixed(2) + '" rx="' + (2.2 + f * 2).toFixed(2) + '" ry="' + (1.4 + f * 1.3).toFixed(2) + '" fill="#ffffff" opacity="' + o.toFixed(2) + '"/>';
    }
    return out + '</g>';
  }
  var MINE = { cook: true, bake: true, blend: true, wash: true };
  root.EbbGame.registerProps('kitchen', function (api, near) {
    var out = '';
    if (cooking && cooking.kind !== 'wash') out += glow(cooking.spot.at.x, cooking.spot.at.y + 1.5);
    if (near && near.spot && MINE[near.spot.kind] && !(cooking && cooking.spot === near.spot)) out += ring(near.spot.at.x, near.spot.at.y + 4, 5.5);
    return out;
  });

  /* ---------- the running timer, shared by the stations and the basin ---------- */
  var tick = 0, onVis = null;
  function clearRun() { clearInterval(tick); tick = 0; if (onVis) { doc.removeEventListener('visibilitychange', onVis); onVis = null; } }
  function stopAll(api) { clearRun(); cooking = null; api.fx('', 1); api.work('none', 0, 'front'); api.refresh(); }
  function start(api, spot, kind, secs) {
    var t = R().timer(secs);
    cooking = { spot: spot, kind: kind }; api.work('none', 36e5, 'back'); api.refresh();
    return t;
  }
  function runClock(api, spot, t, paint, onEnd, back) {
    var r = R(), t0 = Date.now();
    onVis = function () { r.setHidden(t, doc.hidden, Date.now()); if (!doc.hidden && back) back.textContent = 'Welcome back. It waited while you were away.'; };
    doc.addEventListener('visibilitychange', onVis); r.setHidden(t, doc.hidden, Date.now());
    tick = setInterval(function () {
      r.advance(t, Date.now()); paint();
      api.fx(r.counting(t) ? steamFx(spot.steam.x, spot.steam.y, Date.now() - t0) : '', 500);
      if (t.ended) onEnd();
    }, 100);
    paint();
  }
  function pauseButton(r, t, paint) {
    return { id: 'kitchenPause', label: 'Pause', fn: function (b) { if (t.paused) r.resume(t, Date.now()); else r.pause(t, Date.now()); b.textContent = t.paused ? 'Carry on' : 'Pause'; paint(); } };
  }

  /* ---------- the hob, the oven and the Thermomix ---------- */
  var DOT = { fish: '#9fd0e0', egg: '#f6e6c8' };
  function dotColour(m) {
    var F = root.EbbFarm, k = m.uses ? Object.keys(m.uses)[0] : m.recipe.needs ? Object.keys(m.recipe.needs)[0] : (m.recipe.anyFish ? 'fish' : 'crop');
    if (F && F.CROPS[k] && F.CROPS[k].colour) return F.CROPS[k].colour;
    return /^fish/.test(k) ? DOT.fish : DOT[k] || '#f3dfcf';
  }
  function emptyLine(kind, basket) {
    var any = Object.keys(basket).some(function (k) { return basket[k] > 0; });
    var wants = { cook: 'The hob wants two turnips, two carrots, one sunflower, an egg, or any fish.', bake: 'A carrot cake wants two carrots and an egg; sunflower seed bread wants one sunflower.', blend: 'Any one crop from the garden makes a smoothie.' }[kind];
    if (!any) return 'The basket is empty just now. The garden grows turnips, carrots and sunflowers, and the jetty has fish; it is out through the living room. ' + wants;
    return 'Nothing in the basket fits this right now, and that is fine. ' + wants + ' The garden is out through the living room.';
  }
  function station(spot, api, kind) {
    var r = R(), S = r.STATIONS[kind], basket = api.state().farm.basket, list = r.menu(kind, basket, ids(), nameOf);
    api.me().flip = false; api.work('none', 36e5, 'back');
    var ui = sheet(S.name, function () { stopAll(api); });
    if (!list.some(function (m) { return m.can; })) {
      ui.body.appendChild(p(emptyLine(kind, basket)));
      ui.buttons([{ id: 'kitchenClose', label: 'Maybe later', primary: true, fn: ui.close }]);
      return;
    }
    ui.body.appendChild(p(S.ask));
    var box = el('div', 'kitchen-list');
    list.forEach(function (m) {
      var b = el('button', 'kitchen-dish'); b.type = 'button'; b.dataset.recipe = m.id; b.disabled = !m.can;
      var dot = el('span', 'kitchen-dot'); dot.style.background = dotColour(m); dot.setAttribute('aria-hidden', 'true');
      var tx = el('span', 'kitchen-text'); tx.appendChild(el('b', '', m.name));
      tx.appendChild(el('small', '', (m.can ? 'Uses ' + m.used : 'Needs ' + m.need) + '. ' + S.secs + ' seconds.'));
      b.appendChild(dot); b.appendChild(tx);
      b.addEventListener('click', function () { run(spot, api, kind, m, ui); });
      box.appendChild(b);
    });
    ui.body.appendChild(box);
    ui.buttons([{ id: 'kitchenClose', label: 'Not now', fn: ui.close }]);
  }
  function run(spot, api, kind, m, ui) {
    var r = R(), S = r.STATIONS[kind], t = start(api, spot, kind, S.secs);
    var cue = p(S.verb.charAt(0).toUpperCase() + S.verb.slice(1) + ' ' + m.name.toLowerCase() + '.', 'kitchen-cue'), clock = p('', 'kitchen-clock'), back = p('', 'muted small kitchen-back');
    ui.body.innerHTML = ''; ui.body.appendChild(cue); ui.body.appendChild(clock); ui.body.appendChild(back);
    function paint() { clock.textContent = r.clockText(t); }
    ui.buttons([pauseButton(r, t, paint), { id: 'kitchenStop', label: 'Stop', fn: function () { r.end(t, Date.now()); stopped(); } }]);
    function stopped() {
      clearRun(); cooking = null; api.fx('', 1); api.refresh();
      ui.body.innerHTML = ''; ui.body.appendChild(p('Stopped. Nothing used; the basket is as it was.'));
      ui.buttons([{ id: 'kitchenClose', label: 'Close', primary: true, fn: ui.close }]);
    }
    function done() {
      clearRun(); cooking = null; api.refresh();
      var meal = r.make(data(api), api.state().farm.basket, m.recipe, api.today(), ids(), nameOf, new Date().toISOString());
      api.save(); api.refresh();
      ui.body.innerHTML = '';
      if (!meal) { api.fx('', 1); ui.body.appendChild(p('The basket came up short in the meantime. Nothing used.')); ui.buttons([{ id: 'kitchenClose', label: 'Close', primary: true, fn: ui.close }]); return; }
      api.fx(root.EbbProps ? root.EbbProps.sparkles(spot.steam.x, spot.steam.y - 2, 8) : '', 1800);
      try { if (root.EbbLife) root.EbbLife.react('heart', 1600); } catch (e) { }
      ui.body.appendChild(p(S.done + ': ' + meal.name.toLowerCase() + '. ' + m.recipe.line, 'kitchen-cue'));
      ui.body.appendChild(p('Used ' + r.usedText(meal.used, nameOf) + '. It waits in your bag, ready to eat slowly at the kitchen table. You can log it as food too.', 'muted small'));
      ui.buttons([{ id: 'kitchenLog', label: 'Log it as food', fn: function () { logFood(api, spot, meal); } }, { id: 'kitchenDone', label: 'Done', primary: true, fn: ui.close }]);
      api.toast(S.done + ' ' + meal.name.toLowerCase() + '.', 2600);
    }
    runClock(api, spot, t, paint, done, back);
  }
  /* the existing food log (the fridge's kind), the meal already typed so one tap sends it */
  function logFood(api, spot, meal) {
    if (!root.EbbLog) { api.toast('The log is not here yet'); return; }
    if (current) current.close();
    root.EbbGame.act({ spot: { id: 'meal', kind: 'log', topic: 'food', at: spot.at, stand: spot.stand, label: 'What did you eat or drink?' } });
    var line = 'Had ' + meal.name.toLowerCase() + ' from the kitchen', tries = 0;
    var iv = setInterval(function () {
      var input = doc.querySelector('.ebb-log #lgInput');
      if (input) { clearInterval(iv); if (!input.value) input.value = line; try { input.focus({ preventScroll: true }); } catch (e) { } }
      else if (++tries > 40) clearInterval(iv);
    }, 100);
  }

  /* ---------- the basin: warm water, three slow breaths, saved like a practice ---------- */
  function wash(spot, api) {
    var r = R(), t = start(api, spot, 'wash', r.WASH_SECS), startIso = new Date().toISOString();
    api.me().flip = false;
    var ui = sheet('Basin', function () { stopAll(api); });
    var cue = p('', 'kitchen-cue'), clock = p('', 'kitchen-clock'), back = p('', 'muted small kitchen-back');
    ui.body.appendChild(p('Twenty seconds of warm water and three slow breaths.', 'muted small')); ui.body.appendChild(cue); ui.body.appendChild(clock); ui.body.appendChild(back);
    var shown = -1;
    function paint() {
      var i = r.cueAt(r.WASH_CUES, t); if (i !== shown) { shown = i; cue.textContent = r.WASH_CUES[i][1]; }
      clock.textContent = r.clockText(t);
    }
    ui.buttons([pauseButton(r, t, paint), { id: 'kitchenStop', label: 'Stop', fn: function () { r.end(t, Date.now()); finish(); } }]);
    var over = false;
    function finish() {
      if (over) return; over = true;
      clearRun(); cooking = null; api.fx('', 1); api.refresh();
      var rec = null;
      if (r.worthSaving(t)) {
        rec = root.EbbStore.addPractice(r.washRecord(t, api.today(), startIso, new Date().toISOString()));
        rec.where = 'kitchen'; api.save(); /* the store builds the record; where it happened goes on afterwards */
        try { if (root.EbbLife) root.EbbLife.react('heart', 1600); } catch (e) { }
      }
      ui.body.innerHTML = '';
      ui.body.appendChild(p(rec ? (rec.status === 'finished' ? 'Hands washed, three breaths taken. Saved as a mindful moment.' : 'You stopped early, and that is fine. Saved as a mindful moment.') : 'Hands dried. Nothing saved; the water is warm whenever you come back.'));
      ui.buttons([{ id: 'kitchenDone', label: 'Done', primary: true, fn: ui.close }]);
    }
    runClock(api, spot, t, paint, finish, back);
  }

  ['cook', 'bake', 'blend'].forEach(function (kind) { root.EbbGame.registerKind(kind, function (spot, api) { station(spot, api, kind); }); });
  root.EbbGame.registerKind('wash', wash);
  /* what she cooked waits in the bag as Ready to eat until she eats it slowly at the table */
  function bagUp() {
    var B = root.EbbBag, I = root.EbbItems; if (!B || !I || !R()) return;
    R().RECIPES.forEach(function (r) { I.define({ id: 'dish-' + r.id, name: r.name, kind: 'dish', icon: null, source: 'kitchen.ready', about: r.line + ' Eat it slowly at the kitchen table.' }); });
    B.registerBridge('kitchen.ready', function (st) {
      var out = {}; if (!st || !st.kitchen || !Array.isArray(st.kitchen.meals)) return out;
      st.kitchen.meals.forEach(function (m) { if (m && !m.eaten && m.dish) out['dish-' + m.dish] = (out['dish-' + m.dish] || 0) + 1; });
      return out;
    });
  }
  if (root.EbbGame._ready) bagUp(); else doc.addEventListener('ebb:ready', bagUp);
  root.EbbKitchen = { cooking: function () { return cooking; }, open: function () { return !!current; }, close: function () { if (current) current.close(); }, rules: R, steamFx: steamFx,
    /* what she cooked and has not eaten yet, oldest first; eat() marks the oldest eaten (js/ext/seats.js, the table) */
    ready: function (api) { return R().ready(data(api)); }, eat: function (api, at) { var m = R().eat(data(api), at); if (m) api.save(); return m; } };
})(typeof window !== 'undefined' ? window : globalThis);
