/* Ebb game: one scene at a time, a puppet that walks where you tap, doors between places, and actions on arrival.
 * Movement, planning and rules live in the pure modules; this file wires them to the page. */
(function (root) {
  'use strict';
  var doc = root.document, W = root.EbbWorld, Fu = root.EbbFurniture, P = root.EbbPuppet, C = root.EbbClay, F = root.EbbFarm, S = root.EbbStore, PR = root.EbbProps;
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
    st.scene = id;
    var s = scene();
    /* a room is one painted render until she rearranges it; then it is the empty shell plus her own pieces */
    if (!s.fixed) s.fixed = { floor: s.floor, solids: s.solids.slice(), spots: s.spots.slice(), doors: s.doors, aspect: s.aspect, depth: s.depth, zoom: s.zoom, start: s.start };
    var custom = Fu && s.shell && st.furniture && st.furniture[id];
    if (custom) {
      st.furniture[id] = Fu.clean(st.furniture[id], id);
      s.floor = s.shellFloor || s.fixed.floor; s.doors = W.shellDoors(Object.assign({}, s, { doors: s.fixed.doors })); s.baseSolids = []; s.baseSpots = []; Fu.apply(s, st.furniture[id]);
      s.aspect = s.shellAspect || s.fixed.aspect; s.depth = s.shellDepth || s.fixed.depth; s.zoom = s.shellAspect ? undefined : s.fixed.zoom; s.start = s.shellStart || s.fixed.start; /* the empty shell may have another shape */
    } else { s.floor = s.fixed.floor; s.doors = s.fixed.doors; s.solids = s.fixed.solids.slice(); s.spots = s.fixed.spots.slice(); s.layout = null; s.baseSolids = null; s.aspect = s.fixed.aspect; s.depth = s.fixed.depth; s.zoom = s.fixed.zoom; s.start = s.fixed.start; }
    S.save();
    els.plate.src = custom ? s.shell : s.plate; els.plate.alt = s.name;
    els.place.textContent = s.name;
    if (cam.W) layout(); /* the stage takes the new plate's shape */
    var p0 = at || s.start, q = W.walkable(id, p0) ? p0 : W.nearestWalkable(id, p0) || s.start; /* her own furniture may stand where a door lets out */
    me.x = q.x; me.y = q.y;
    path = []; pending = null; sitting = false; me.action = 'idle'; cam.snap = true;
    drawProps();
  }

  /* ---------- camera: the stage has the plate's shape, scaled to cover the screen; it follows her and never shows an edge ---------- */
  var cam = { x: 0, y: 0, W: 0, H: 0, S: 0, Sh: 0, snap: true };
  var still = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function layout() {
    var r = els.scene.getBoundingClientRect();
    var ratio = W.units(st.scene) / 100; /* plate height over width */
    /* the plate always shows its full width; a tall plate on a taller screen leaves room above and below, which the
     * blurred backdrop fills, and a square plate on a phone is taller than the screen so the camera pans */
    var sc = scene(), zoom = sc.zoom || (sc.indoor ? 1.12 : 1.3); /* a little larger than the screen, so the camera has somewhere to go */
    cam.W = r.width; cam.H = r.height; cam.S = r.width * zoom; cam.Sh = cam.S * ratio; cam.snap = true;
    els.stage.style.width = cam.S + 'px'; els.stage.style.height = cam.Sh + 'px';
    if (els.backdrop) els.backdrop.style.backgroundImage = 'url("' + els.plate.getAttribute('src') + '")';
    els.layer.setAttribute('viewBox', '0 0 100 ' + (100 * ratio).toFixed(3));
  }
  function follow(dt) {
    if (!cam.S) layout();
    var tx = cam.W / 2 - me.x / 100 * cam.S, ty = cam.H * 0.56 - me.y / 100 * cam.S;
    tx = Math.min(0, Math.max(cam.W - cam.S, tx));
    ty = cam.Sh <= cam.H ? (cam.H - cam.Sh) / 2 : Math.min(0, Math.max(cam.H - cam.Sh, ty)); /* a short plate sits centred */
    if (cam.snap || still) { cam.x = tx; cam.y = ty; cam.snap = false; }
    else { var k = 1 - Math.exp(-dt / 0.2); cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k; }
    els.stage.style.transform = 'translate3d(' + cam.x.toFixed(1) + 'px,' + cam.y.toFixed(1) + 'px,0)';
  }

  function drawProps() {
    var s = scene(), near = nearest(), out = '', front = '';
    if (s.beds) s.beds.forEach(function (b, i) { if (!st.farm.beds[i]) return; out += b.w ? PR.paintedBed(st.farm.beds[i], b.x, b.y, b.w, today(), near && near.bed === i) : PR.bed(st.farm.beds[i], b.x, b.y, today(), near && near.bed === i); });
    if (st.scene === 'waterfall') out += PR.shimmer(s.fall);
    if (s.layout) { /* furniture: pieces whose front edge is above her feet go behind her, the rest in front */
      s.layout.slice().sort(function (a, b) { return (Fu.CATALOG[a.item].flat ? -1 : 0) - (Fu.CATALOG[b.item].flat ? -1 : 0) || a.y - b.y; }).forEach(function (p) {
        var cat = Fu.CATALOG[p.item], d = deco.drag && deco.drag.uid === p.uid ? deco.drag : null, q = d ? { uid: p.uid, item: p.item, x: d.x, y: d.y, flip: p.flip } : p;
        var html = PR.furniture(q, cat, { near: near && near.spot && near.spot.furniture === p.uid, ghost: !!d, bad: d && !d.ok });
        if (cat.flat || q.y <= me.y + 0.5 || sitting) out += html; else front += html;
      });
    }
    (propDrawers[st.scene] || []).forEach(function (fn) { try { out += fn(api, near) || ''; } catch (e) { console.error(e); } });
    els.props.innerHTML = out; els.front.innerHTML = front;
  }

  /* ---------- what she is next to ---------- */
  function nearest() {
    var s = scene(), best = null, d;
    s.spots.forEach(function (sp) { d = Math.hypot(sp.stand.x - me.x, (sp.stand.y - me.y) * 1.6); if (d < NEAR && (!best || d < best.d)) best = { spot: sp, d: d }; });
    (s.beds || []).forEach(function (b, i) { var sb = W.bedStand(b); d = Math.hypot(sb.x - me.x, (sb.y - me.y) * 1.6); if (d < NEAR + (b.w ? b.w / 4 : 0) && (!best || d < best.d)) best = { bed: i, d: d }; });
    return best;
  }
  function promptFor(n) {
    if (!n) return null;
    if (n.spot) return n.spot.label;
    var a = F.nextAction(st.farm, n.bed, today());
    return { hoe: 'Hoe the soil', plant: 'Plant a seed', needSeeds: 'Seeds are in the shed', water: 'Water', harvest: 'Harvest', done: 'Watered today' }[a];
  }
  function refreshPrompt() {
    var n = nearest(), label = !path.length && !sitting && !deco.on ? promptFor(n) : null;
    els.prompt.hidden = !label; if (label) els.prompt.textContent = label;
    els.prompt.dataset.near = n ? (n.spot ? 'spot:' + n.spot.id : 'bed:' + n.bed) : '';
  }

  /* ---------- input ---------- */
  function scenePoint(ev) {
    var r = els.stage.getBoundingClientRect(); /* the moved square, so taps land in scene percent wherever the camera is */
    return { x: (ev.clientX - r.left) / r.width * 100, y: (ev.clientY - r.top) / r.width * 100 }; /* y in the same unit as x */
  }
  function onTap(ev) {
    if (Date.now() < busyUntil || root.EbbUi && root.EbbUi.modalOpen()) return;
    if (sitting || deco.on) return;
    var pt = scenePoint(ev), s = scene(), target = null;
    s.spots.forEach(function (sp) { if (Math.hypot(sp.at.x - pt.x, sp.at.y - pt.y) < 8) target = { pt: sp.stand, then: { spot: sp } }; });
    (s.beds || []).forEach(function (b, i) { var hw = b.w ? b.w / 2 : 7, hh = b.w ? b.w * 0.21 : 4.5; if (Math.abs(b.x - pt.x) < hw && Math.abs(b.y - pt.y) < hh) target = { pt: W.bedStand(b), then: { bed: i } }; });
    s.doors.forEach(function (dr) { if (W.inRect(pt, [dr.rect[0] - 2, dr.rect[1] - 6, dr.rect[2] + 2, dr.rect[3] + 2])) target = { pt: { x: (dr.rect[0] + dr.rect[2]) / 2, y: (dr.rect[1] + dr.rect[3]) / 2 }, then: null }; });
    walkTo(target ? target.pt : pt, target ? target.then : null);
    if (els.app) els.app.classList.add('moved');
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
      work({ hoe: 'hoe', plant: 'seed', water: 'can', harvest: 'pick' }[res.action] || 'none', 700, 'side');
      me.flip = scene().beds[t.bed].x < me.x - 1; /* face the bed */
      var crop = res.crop && F.CROPS[res.crop] ? F.CROPS[res.crop].name.toLowerCase() : '';
      toast({ hoe: 'Soil turned', plant: 'Planted a ' + crop + ' seed', water: 'Watered. It grows overnight.', harvest: 'Picked a ' + crop + ' for the basket' }[res.action] || '');
      updateHud(); drawProps(); return;
    }
    var sp = t.spot;
    if (kinds[sp.kind]) { try { kinds[sp.kind](sp, api); } catch (e) { console.error(e); } return; }
    if (sp.kind === 'panel') { var pn = panels.filter(function (p) { return p.id === sp.panel; })[0]; if (pn) pn.open(api); else toast('Nothing here yet'); return; }
    if (sp.kind === 'tea') { /* a warm cup: a small pause, nothing to log */
      me.view = 'back'; work('none', 1600, 'back');
      setTimeout(function () { toast('The kettle sings. A warm cup, held with both hands, and one slow breath.', 3600); if (root.EbbLife) root.EbbLife.react('heart', 1800); }, 900);
      return;
    }
    if (sp.kind === 'shed') {
      var got = F.takeSeeds(st.farm, today()); S.save(); updateHud();
      toast(got ? 'A ' + F.CROPS[got].name.toLowerCase() + ' seed. ' + st.farm.seedsLeft + ' more today.' : 'That’s today’s seeds. More tomorrow.');
    } else if (sp.kind === 'pond') offer();
    else if (sp.kind === 'cushion') { sit(sp); root.EbbUi.openPractice(function () { stand(); }); }
    else if (sp.kind === 'wardrobe') root.EbbUi.openWardrobe(st.outfit, function (o) { if (o) { st.outfit = o; S.save(); } });
    else if (sp.kind === 'bed') toast('A soft place to rest.');
  }
  var standBack = null;
  function sit(sp) {
    standBack = { x: sp.stand.x, y: sp.stand.y };
    sitting = true; me.x = sp.at.x; me.y = sp.at.y + 0.2; me.action = 'sit'; me.view = 'front'; path = [];
  }
  function stand() { sitting = false; me.action = 'idle'; if (standBack) { me.x = standBack.x; me.y = standBack.y; } }

  /* ---------- decorating: every piece of furniture can be picked up and put somewhere else ---------- */
  var deco = { on: false, drag: null, bar: null, picked: null };
  function pieceAt(pt) {
    var s = scene(); if (!s.layout) return null;
    return Fu.hit(s.layout, pt, function (p) { return PR.furnitureBox(p, Fu.CATALOG[p.item]); });
  }
  function decorate(on) {
    deco.on = on; deco.drag = null; deco.picked = null; path = []; pending = null;
    els.scene.classList.toggle('decorating', on); els.prompt.hidden = true;
    if (deco.bar) { deco.bar.remove(); deco.bar = null; }
    if (on) {
      deco.bar = doc.createElement('div'); deco.bar.className = 'decobar';
      deco.bar.innerHTML = '<button type="button" class="btn" id="decoReset">Original room</button><button type="button" class="btn" id="decoFlip">Flip</button><button type="button" class="btn primary" id="decoDone">Done</button>';
      deco.bar.querySelector('#decoReset').addEventListener('click', function () { delete st.furniture[st.scene]; decorate(false); enter(st.scene, { x: me.x, y: me.y }); toast('Back to how it was'); });
      els.scene.parentNode.appendChild(deco.bar);
      deco.bar.querySelector('#decoDone').addEventListener('click', function () { decorate(false); toast('Looks lovely'); });
      deco.bar.querySelector('#decoFlip').addEventListener('click', function () {
        var p = deco.picked; if (!p) { toast('Tap a piece first'); return; }
        p.flip = !p.flip; commitLayout();
      });
      toast('Drag anything to move it. Tap a piece, then Flip to turn it.', 3600);
    }
    drawProps();
  }
  function commitLayout() { var s = scene(); Fu.apply(s, s.layout); st.furniture[st.scene] = s.layout; S.save(); drawProps(); }
  function onPointerDown(ev) {
    if (!deco.on || root.EbbUi && root.EbbUi.modalOpen()) return;
    var pt = scenePoint(ev), p = pieceAt(pt); if (!p) return;
    ev.preventDefault(); els.scene.setPointerCapture && els.scene.setPointerCapture(ev.pointerId);
    deco.picked = p; deco.drag = { uid: p.uid, dx: p.x - pt.x, dy: p.y - pt.y, x: p.x, y: p.y, ok: true, moved: false };
    drawProps();
  }
  function onPointerMove(ev) {
    var d = deco.drag; if (!d) return;
    var pt = scenePoint(ev), s = scene();
    d.x = Math.max(0, Math.min(100, pt.x + d.dx)); d.y = Math.max(0, Math.min(W.units(st.scene), pt.y + d.dy)); d.moved = true;
    var cat = Fu.CATALOG[deco.picked.item], r = [d.x - cat.foot[0] / 2, d.y - cat.foot[1], d.x + cat.foot[0] / 2, d.y];
    d.ok = Fu.canPlace(W, st.scene, s.layout, d.uid, d.x, d.y) && (cat.flat || !W.inRect(me, [r[0] - 2, r[1] - 2, r[2] + 2, r[3] + 1]));
    drawProps();
  }
  function onPointerUp() {
    var d = deco.drag; if (!d) return;
    deco.drag = null;
    if (d.moved && d.ok) { deco.picked.x = Math.round(d.x * 2) / 2; deco.picked.y = Math.round(d.y * 2) / 2; commitLayout(); }
    else { if (d.moved) toast('It does not fit there'); drawProps(); }
  }

  function offer() {
    var item = F.takeFromBasket(st.farm);
    if (!item) { toast('The pond is quiet. Bring something from the farm.'); return; }
    st.pond.offerings += 1; S.save(); updateHud();
    me.view = 'back'; work('none', 900, 'back');
    var pond = scene().spots.filter(function (sp) { return sp.kind === 'pond'; })[0], px = pond ? pond.at.x : 60, py = pond ? pond.at.y : 60;
    fxHtml = PR.sparkles(px, py + 3, 12) + PR.goddess(px, py - 4); fxUntil = Date.now() + 4200;
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
      var v = SPEED * (0.6 + W.scaleAt(me.y, st.scene) * 2) * dt;
      if (Math.abs(dx) > Math.abs(dy) * 1.2) { me.view = 'side'; me.flip = dx < 0; } else { me.view = dy > 0 ? 'front' : 'back'; me.flip = false; }
      me.action = 'walk'; me.tool = 'none';
      if (dist <= v) { me.x = tgt.x; me.y = tgt.y; path.shift(); } else { me.x += dx / dist * v; me.y += dy / dist * v; }
      me.phase = (me.phase + dt * 0.7) % 1;
      var door = W.doorAt(st.scene, me);
      if (door) { fadeTo(door); return root.requestAnimationFrame(step); }
      if (!path.length) { me.action = 'idle'; me.view = 'front'; var p = pending; pending = null; if (p) act(p); }
    } else if (Date.now() >= busyUntil && me.action === 'work') { me.action = 'idle'; me.tool = 'none'; me.view = 'front'; }
    else if (me.action === 'work') me.phase = (me.phase + dt * 1.6) % 1;
    else me.phase = (me.phase + dt * 0.35) % 1;
    follow(dt); render();
    root.requestAnimationFrame(step);
  }
  function fadeTo(door) {
    path = []; busyUntil = Date.now() + 600;
    els.scene.classList.add('fading');
    setTimeout(function () { enter(door.to, door.arrive); toast(scene().name, 1400); els.scene.classList.remove('fading'); }, 320);
  }
  var lastProps = '';
  function render() {
    var s = W.scaleAt(me.y, st.scene);
    els.me.setAttribute('transform', 'translate(' + me.x.toFixed(2) + ' ' + me.y.toFixed(2) + ') scale(' + s.toFixed(3) + ')');
    if (!(C && C.draw(els.me, C.setFor(st.outfit), me))) { /* the flat puppet only when no clay set is shipped */
      els.me._clay = null;
      els.me.innerHTML = '<ellipse cx="0" cy="0" rx="15" ry="4" fill="rgba(40,30,30,0.16)"/>' + P.svg(st.outfit, me);
    }
    els.fx.innerHTML = Date.now() < fxUntil ? fxHtml : '';
    var n = nearest(), lay = scene().layout, behind = 0;
    if (lay) for (var i = 0; i < lay.length; i++) if (lay[i].y <= me.y + 0.5) behind++;
    var key = st.scene + (n ? JSON.stringify(n.bed !== undefined ? n.bed : n.spot.id) : '') + ':' + behind + (sitting ? 's' : '');
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
    if (sitting || deco.on || root.EbbUi.modalOpen()) return;
    var d = { ArrowLeft: [-6, 0], ArrowRight: [6, 0], ArrowUp: [0, -4], ArrowDown: [0, 4] }[ev.key];
    if (d) { ev.preventDefault(); walkTo({ x: me.x + d[0], y: me.y + d[1] }, null); }
    if (ev.key === 'Enter' || ev.key === ' ') { if (!els.prompt.hidden) { ev.preventDefault(); useNear(); } }
  }

  function boot() {
    ['scene', 'backdrop', 'stage', 'layer', 'plate', 'props', 'me', 'front', 'fx', 'prompt', 'toast', 'place', 'hudSeeds', 'hudBasket', 'hudPond'].forEach(function (id) { els[id] = $(id); });
    els.app = doc.querySelector('.app');
    root.addEventListener('resize', layout);
    st = S.load();
    if (!st.outfit) st.outfit = P.clean(null);
    els.scene.addEventListener('click', onTap);
    els.scene.addEventListener('pointerdown', onPointerDown); els.scene.addEventListener('pointermove', onPointerMove);
    els.scene.addEventListener('pointerup', onPointerUp); els.scene.addEventListener('pointercancel', onPointerUp);
    els.prompt.addEventListener('click', function (e) { e.stopPropagation(); useNear(); });
    doc.addEventListener('keydown', keys);
    if ($('wardrobeBtn')) $('wardrobeBtn').addEventListener('click', function () { root.EbbUi.openWardrobe(st.outfit, function (o) { if (o) { st.outfit = o; S.save(); } }); });
    $('moreBtn').addEventListener('click', function () { var m = $('moreMenu'); m.hidden = !m.hidden; });
    enter(st.scene && W.SCENES[st.scene] ? st.scene : 'bedroom', st.pos);
    updateHud();
    if (Fu) registerPanel({ id: 'decorate', label: 'Decorate this room', open: function () {
      var s = scene(); if (!s.shell || !Fu.DEFAULTS[st.scene]) { toast('Only rooms can be rearranged'); return; }
      if (sitting) stand();
      if (!s.layout) { st.furniture = st.furniture || {}; st.furniture[st.scene] = Fu.fresh(st.scene); enter(st.scene, s.start); }
      decorate(true);
    } });
    root.requestAnimationFrame(step);
    root.EbbGame._ready = true;
    doc.dispatchEvent(new CustomEvent('ebb:ready', { detail: api }));
  }

  /* the api handed to extension modules */
  var api = {
    state: function () { return st; }, save: function () { S.save(); }, today: today, toast: toast, me: function () { return me; },
    scene: function () { return st.scene; }, enter: function (id, at) { enter(id, at); }, refresh: function () { updateHud(); drawProps(); },
    decorate: function (on) { decorate(on !== false); }, furniture: function () { return scene().layout || null; },
    work: function (tool, ms, view) { work(tool, ms, view); }, sit: function (at) { sitting = true; me.x = at.x; me.y = at.y; me.action = 'sit'; me.view = 'front'; path = []; },
    stand: function (y) { stand(); if (y && !standBack) me.y = y; }, fx: function (html, ms) { fxHtml = html; fxUntil = Date.now() + (ms || 3000); }
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
