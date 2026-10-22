/* Ebb game: one scene at a time, a puppet that walks where you tap, doors between places, and actions on arrival.
 * Movement, planning and rules live in the pure modules; this file wires them to the page. */
(function (root) {
  'use strict';
  var doc = root.document, W = root.EbbWorld, P = root.EbbPuppet, F = root.EbbFarm, S = root.EbbStore, PR = root.EbbProps;
  var NEAR = 7, SPEED = 20;
  var els = {}, st, me = { x: 50, y: 85, view: 'front', flip: false, action: 'idle', phase: 0, tool: 'none' };
  var path = [], pending = null, busyUntil = 0, last = 0, fxHtml = '', fxUntil = 0, toastTimer = 0, sitting = false;

  var kinds = {}, propDrawers = {}, panels = [], hudItems = [];
  function $(id) { return doc.getElementById(id); }
  function today() { return S.today(); }
  function scene() { return W.SCENES[st.scene]; }

  function toast(text, ms) {
    els.toast.textContent = text; els.toast.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { els.toast.hidden = true; }, ms || 2600);
  }

  /* ---------- scene ---------- */
  function enter(id, at) {
    st.scene = id; S.save();
    var s = scene();
    els.plate.src = s.plate; els.plate.alt = s.name;
    els.place.textContent = s.name;
    me.x = at ? at.x : s.start.x; me.y = at ? at.y : s.start.y;
    path = []; pending = null; sitting = false; me.action = 'idle';
    drawProps();
  }

  function drawProps() {
    var s = scene(), near = nearest(), out = '';
    if (st.scene === 'farm') s.beds.forEach(function (b, i) { out += PR.bed(st.farm.beds[i], b.x, b.y, today(), near && near.bed === i); });
    if (st.scene === 'bedroom') { var c = s.spots[0]; out += PR.cushion(c.at.x, c.at.y, near && near.spot === c); }
    if (st.scene === 'waterfall') out += PR.shimmer();
    (propDrawers[st.scene] || []).forEach(function (fn) { try { out += fn(api, near) || ''; } catch (e) { console.error(e); } });
    els.props.innerHTML = out;
  }

  /* ---------- what she is next to ---------- */
  function nearest() {
    var s = scene(), best = null, d;
    s.spots.forEach(function (sp) { d = Math.hypot(sp.stand.x - me.x, (sp.stand.y - me.y) * 1.6); if (d < NEAR && (!best || d < best.d)) best = { spot: sp, d: d }; });
    (s.beds || []).forEach(function (b, i) { d = Math.hypot(b.x - me.x, (b.y + 4.5 - me.y) * 1.6); if (d < NEAR && (!best || d < best.d)) best = { bed: i, d: d }; });
    return best;
  }
  function promptFor(n) {
    if (!n) return null;
    if (n.spot) return n.spot.label;
    var a = F.nextAction(st.farm, n.bed, today());
    return { hoe: 'Hoe the soil', plant: 'Plant a seed', needSeeds: 'Seeds are in the shed', water: 'Water', harvest: 'Harvest', done: 'Watered today' }[a];
  }
  function refreshPrompt() {
    var n = nearest(), label = !path.length && !sitting ? promptFor(n) : null;
    els.prompt.hidden = !label; if (label) els.prompt.textContent = label;
    els.prompt.dataset.near = n ? (n.spot ? 'spot:' + n.spot.id : 'bed:' + n.bed) : '';
  }

  /* ---------- input ---------- */
  function scenePoint(ev) {
    var r = els.scene.getBoundingClientRect();
    return { x: (ev.clientX - r.left) / r.width * 100, y: (ev.clientY - r.top) / r.height * 100 };
  }
  function onTap(ev) {
    if (Date.now() < busyUntil || root.EbbUi && root.EbbUi.modalOpen()) return;
    if (sitting) return;
    var pt = scenePoint(ev), s = scene(), target = null;
    s.spots.forEach(function (sp) { if (Math.hypot(sp.at.x - pt.x, sp.at.y - pt.y) < 8) target = { pt: sp.stand, then: { spot: sp } }; });
    (s.beds || []).forEach(function (b, i) { if (Math.abs(b.x - pt.x) < 7 && Math.abs(b.y - pt.y) < 4.5) target = { pt: { x: b.x, y: b.y + 4.5 }, then: { bed: i } }; });
    s.doors.forEach(function (dr) { if (W.inRect(pt, [dr.rect[0] - 2, dr.rect[1] - 6, dr.rect[2] + 2, dr.rect[3] + 2])) target = { pt: { x: (dr.rect[0] + dr.rect[2]) / 2, y: (dr.rect[1] + dr.rect[3]) / 2 }, then: null }; });
    walkTo(target ? target.pt : pt, target ? target.then : null);
  }
  function walkTo(pt, then) {
    var p = W.plan(st.scene, { x: me.x, y: me.y }, pt);
    if (!p) { toast('She can’t get there'); return; }
    path = p; pending = then;
  }
  function useNear() {
    var n = nearest(); if (!n) return;
    act(n.spot ? { spot: n.spot } : { bed: n.bed });
  }

  /* ---------- actions ---------- */
  function work(tool, ms, view) { me.action = 'work'; me.tool = tool; me.phase = 0; me.view = view || 'side'; busyUntil = Date.now() + ms; }
  function act(t) {
    if (!t) return;
    if (t.bed !== undefined) {
      var before = F.nextAction(st.farm, t.bed, today());
      if (before === 'needSeeds') { toast('Pick up seeds from the shed first'); return; }
      if (before === 'done') { toast('Already watered today. It grows overnight.'); return; }
      var res = F.act(st.farm, t.bed, today()); S.save();
      work({ hoe: 'hoe', plant: 'seed', water: 'can', harvest: 'none' }[res.action] || 'none', 700, 'side');
      me.flip = false;
      var crop = res.crop && F.CROPS[res.crop] ? F.CROPS[res.crop].name.toLowerCase() : '';
      toast({ hoe: 'Soil turned', plant: 'Planted a ' + crop + ' seed', water: 'Watered. It grows overnight.', harvest: 'Picked a ' + crop + ' for the basket' }[res.action] || '');
      updateHud(); drawProps(); return;
    }
    var sp = t.spot;
    if (kinds[sp.kind]) { try { kinds[sp.kind](sp, api); } catch (e) { console.error(e); } return; }
    if (sp.kind === 'shed') {
      var got = F.takeSeeds(st.farm, today()); S.save(); updateHud();
      toast(got ? 'A ' + F.CROPS[got].name.toLowerCase() + ' seed. ' + st.farm.seedsLeft + ' more today.' : 'That’s today’s seeds. More tomorrow.');
    } else if (sp.kind === 'pond') offer();
    else if (sp.kind === 'cushion') { sit(); root.EbbUi.openPractice(function () { stand(); }); }
    else if (sp.kind === 'wardrobe') root.EbbUi.openWardrobe(st.outfit, function (o) { if (o) { st.outfit = o; S.save(); } });
    else if (sp.kind === 'bed') toast('A soft place to rest. Sleep tracking comes later.');
  }
  function sit() {
    var c = scene().spots[0];
    sitting = true; me.x = c.at.x; me.y = c.at.y + 0.2; me.action = 'sit'; me.view = 'front'; path = [];
  }
  function stand() { sitting = false; me.action = 'idle'; me.y = scene().spots[0].stand.y; }

  function offer() {
    var item = F.takeFromBasket(st.farm);
    if (!item) { toast('The pond is quiet. Bring something from the farm.'); return; }
    st.pond.offerings += 1; S.save(); updateHud();
    me.view = 'back'; work('none', 900, 'back');
    fxHtml = PR.sparkles(60, 63, 12) + PR.goddess(60, 54); fxUntil = Date.now() + 4200;
    var n = st.pond.offerings, line = 'Thank you for the ' + F.CROPS[item].name.toLowerCase() + '.';
    if (n >= 5 && !st.pond.gift) { st.pond.gift = true; S.save(); line += ' Please keep this moon pearl.'; }
    else if (n < 5) line += ' ' + (5 - n) + ' more and I will have something for you.';
    setTimeout(function () { toast('The Goddess: ' + line, 4200); }, 600);
  }

  /* ---------- loop ---------- */
  function step(t) {
    var dt = last ? Math.min(0.05, (t - last) / 1000) : 0; last = t;
    if (path.length && Date.now() >= busyUntil) {
      var tgt = path[0], dx = tgt.x - me.x, dy = (tgt.y - me.y), dist = Math.hypot(dx, dy);
      var v = SPEED * (0.6 + W.scaleAt(me.y) * 2) * dt;
      if (Math.abs(dx) > Math.abs(dy) * 1.2) { me.view = 'side'; me.flip = dx < 0; } else { me.view = dy > 0 ? 'front' : 'back'; me.flip = false; }
      me.action = 'walk'; me.tool = 'none';
      if (dist <= v) { me.x = tgt.x; me.y = tgt.y; path.shift(); } else { me.x += dx / dist * v; me.y += dy / dist * v; }
      me.phase = (me.phase + dt * 2.2) % 1;
      var door = W.doorAt(st.scene, me);
      if (door) { fadeTo(door); return root.requestAnimationFrame(step); }
      if (!path.length) { me.action = 'idle'; me.view = 'front'; var p = pending; pending = null; if (p) act(p); }
    } else if (Date.now() >= busyUntil && me.action === 'work') { me.action = 'idle'; me.tool = 'none'; me.view = 'front'; }
    else if (me.action === 'work') me.phase = (me.phase + dt * 1.6) % 1;
    else me.phase = (me.phase + dt * 0.35) % 1;
    render();
    root.requestAnimationFrame(step);
  }
  function fadeTo(door) {
    path = []; busyUntil = Date.now() + 600;
    els.scene.classList.add('fading');
    setTimeout(function () { enter(door.to, door.arrive); toast(scene().name, 1400); els.scene.classList.remove('fading'); }, 320);
  }
  var lastProps = '';
  function render() {
    var s = W.scaleAt(me.y);
    els.me.setAttribute('transform', 'translate(' + me.x.toFixed(2) + ' ' + me.y.toFixed(2) + ') scale(' + s.toFixed(3) + ')');
    els.me.innerHTML = '<ellipse cx="0" cy="0" rx="15" ry="4" fill="rgba(40,30,30,0.16)"/>' + P.svg(st.outfit, me);
    els.fx.innerHTML = Date.now() < fxUntil ? fxHtml : '';
    var key = st.scene + (nearest() ? JSON.stringify(nearest().bed !== undefined ? nearest().bed : nearest().spot.id) : '');
    if (key !== lastProps) { lastProps = key; drawProps(); }
    refreshPrompt();
  }

  function updateHud() {
    var basket = Object.keys(st.farm.basket).reduce(function (n, k) { return n + st.farm.basket[k]; }, 0);
    var seeds = Object.keys(st.farm.seeds).reduce(function (n, k) { return n + st.farm.seeds[k]; }, 0);
    els.hudSeeds.textContent = seeds; els.hudBasket.textContent = basket; els.hudPond.textContent = st.pond.offerings;
    hudItems.forEach(function (h) { try { h.el.textContent = h.value(api); } catch (e) { } });
  }

  function keys(ev) {
    if (sitting || root.EbbUi.modalOpen()) return;
    var d = { ArrowLeft: [-6, 0], ArrowRight: [6, 0], ArrowUp: [0, -4], ArrowDown: [0, 4] }[ev.key];
    if (d) { ev.preventDefault(); walkTo({ x: me.x + d[0], y: me.y + d[1] }, null); }
    if (ev.key === 'Enter' || ev.key === ' ') { if (!els.prompt.hidden) { ev.preventDefault(); useNear(); } }
  }

  function boot() {
    ['scene', 'plate', 'props', 'me', 'fx', 'prompt', 'toast', 'place', 'hudSeeds', 'hudBasket', 'hudPond'].forEach(function (id) { els[id] = $(id); });
    st = S.load();
    if (!st.outfit) st.outfit = P.clean(null);
    els.scene.addEventListener('click', onTap);
    els.prompt.addEventListener('click', function (e) { e.stopPropagation(); useNear(); });
    doc.addEventListener('keydown', keys);
    $('wardrobeBtn').addEventListener('click', function () { root.EbbUi.openWardrobe(st.outfit, function (o) { if (o) { st.outfit = o; S.save(); } }); });
    $('moreBtn').addEventListener('click', function () { var m = $('moreMenu'); m.hidden = !m.hidden; });
    enter(st.scene && W.SCENES[st.scene] ? st.scene : 'bedroom', st.pos);
    updateHud();
    root.requestAnimationFrame(step);
    root.EbbGame._ready = true;
    doc.dispatchEvent(new CustomEvent('ebb:ready', { detail: api }));
  }

  /* the api handed to extension modules */
  var api = {
    state: function () { return st; }, save: function () { S.save(); }, today: today, toast: toast, me: function () { return me; },
    scene: function () { return st.scene; }, enter: function (id, at) { enter(id, at); }, refresh: function () { updateHud(); drawProps(); },
    work: function (tool, ms, view) { work(tool, ms, view); }, sit: function (at) { sitting = true; me.x = at.x; me.y = at.y; me.action = 'sit'; me.view = 'front'; path = []; },
    stand: function (y) { sitting = false; me.action = 'idle'; if (y) me.y = y; }, fx: function (html, ms) { fxHtml = html; fxUntil = Date.now() + (ms || 3000); }
  };
  function registerKind(kind, fn) { kinds[kind] = fn; }
  function registerProps(sceneId, fn) { (propDrawers[sceneId] = propDrawers[sceneId] || []).push(fn); }
  function registerPanel(p) { /* { id, label, open(api) } shown in the More menu */
    panels.push(p);
    var menu = $('moreMenu'); if (!menu) return;
    var b = doc.createElement('button'); b.type = 'button'; b.className = 'menu-item'; b.textContent = p.label; b.id = 'panel-' + p.id;
    b.addEventListener('click', function () { menu.hidden = true; p.open(api); });
    menu.appendChild(b);
  }
  function registerHud(label, value) { /* a small counter in the top bar */
    var span = doc.createElement('span'); span.innerHTML = label + ' <b></b>'; $('counts').appendChild(span);
    hudItems.push({ el: span.querySelector('b'), value: value }); updateHud();
  }

  root.EbbGame = { boot: boot, api: api, registerKind: registerKind, registerProps: registerProps, registerPanel: registerPanel, registerHud: registerHud, state: function () { return st; }, me: function () { return me; }, walkTo: walkTo, act: act, enter: enter };
  /* extensions register before boot, so places and kinds exist when the saved scene is entered */
  if (doc.readyState === 'complete') boot(); else root.addEventListener('load', boot);
})(window);
