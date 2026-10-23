/* Ebb game: one scene at a time, a puppet that walks where you tap, doors between places, and actions on arrival.
 * Movement, planning and rules live in the pure modules; this file wires them to the page. */
(function (root) {
  'use strict';
  var doc = root.document, W = root.EbbWorld, P = root.EbbPuppet, C = root.EbbClay, F = root.EbbFarm, S = root.EbbStore, PR = root.EbbProps;
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
    S.save();
    els.plate.src = s.plate; els.plate.alt = s.name;
    els.place.textContent = s.name;
    if (cam.W) layout(); /* the stage takes the new plate's shape */
    var p0 = at || s.start, q = W.walkable(id, p0) ? p0 : W.nearestWalkable(id, p0) || s.start;
    me.x = q.x; me.y = q.y;
    path = []; pending = null; sitting = false; me.action = 'idle'; cam.snap = true;
    drawProps();
  }

  /* ---------- camera: the stage has the plate's shape, scaled to cover the screen; it follows her and never shows an edge ---------- */
  var cam = { x: 0, y: 0, W: 0, H: 0, S: 0, Sh: 0, snap: true, user: 1, want: 1 }; /* want: the zoom she asked for; user: what is applied once the coverage floor is enforced */
  var still = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function layout() {
    var r = els.scene.getBoundingClientRect();
    var ratio = W.units(st.scene) / 100; /* plate height over width */
    /* the plate always shows its full width; a tall plate on a taller screen leaves room above and below, which the
     * blurred backdrop fills, and a square plate on a phone is taller than the screen so the camera pans */
    var sc = scene(), zoom = sc.zoom || (sc.indoor ? 1.12 : 1.3); /* a little larger than the screen, so the camera has somewhere to go */
    cam.W = r.width; cam.H = r.height;
    cam.user = Math.max(zoomFloor(), Math.min(ZOOM_MAX, cam.want)); /* a new plate or a turned phone may need more zoom to keep the screen covered; the floor never follows her to the next scene */
    cam.S = r.width * zoom * cam.user; cam.Sh = cam.S * ratio; cam.snap = true;
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

  /* ---------- zoom: pinch, wheel or trackpad, and the +/- keys; a multiplier on the scene's own zoom, kept around her ---------- */
  var ZOOM_MIN = 0.75, ZOOM_MAX = 2.4, pinch = null;
  function zoomFloor() { /* never so far out that the plate stops covering the screen; a tall phone may need more than the scene's own zoom */
    var sc = scene(), z = sc.zoom || (sc.indoor ? 1.12 : 1.3), ratio = W.units(st.scene) / 100;
    if (!cam.W || !cam.H) return ZOOM_MIN;
    return Math.max(ZOOM_MIN, 1 / z, cam.H / (cam.W * z * ratio));
  }
  function setZoom(k) { cam.want = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, k)); var u = Math.max(zoomFloor(), cam.want); if (Math.abs(u - cam.user) < 0.001) return cam.user; cam.user = u; layout(); return u; }
  function zoomBy(f) { return setZoom(cam.user * f); }
  function pinchDist(t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); }
  function onTouchStart(ev) { if (ev.touches.length === 2) { pinch = { d: pinchDist(ev.touches), k: cam.user }; busyUntil = Date.now() + 600; } }
  function onTouchMove(ev) { if (pinch && ev.touches.length === 2) { ev.preventDefault(); setZoom(pinch.k * pinchDist(ev.touches) / pinch.d); busyUntil = Date.now() + 600; } }
  function onTouchEnd(ev) { if (pinch && ev.touches.length < 2) { pinch = null; busyUntil = Date.now() + 400; } } /* the fingers lifting is not a tap */
  function onWheel(ev) { ev.preventDefault(); zoomBy(Math.exp(-ev.deltaY * (ev.ctrlKey ? 0.01 : 0.0015))); }

  function frontBase(f) { return f.base !== undefined ? f.base : f.rect[3]; } /* where her feet pass from behind a cut-out to in front of it */
  function frontsBehind() { var s = scene(), n = 0; (s.fronts || []).forEach(function (f) { if (me.y >= frontBase(f)) n++; }); return n; }
  function drawProps() {
    var s = scene(), near = nearest(), out = '', front = '';
    if (s.beds) s.beds.forEach(function (b, i) { if (!st.farm.beds[i]) return; out += b.w ? PR.paintedBed(st.farm.beds[i], b.x, b.y, b.w, today(), near && near.bed === i) : PR.bed(st.farm.beds[i], b.x, b.y, today(), near && near.bed === i); });
    if (s.fall && !(root.EbbLive && root.EbbLive.active())) out += PR.shimmer(s.fall); /* the live plate has real water */
    (propDrawers[st.scene] || []).forEach(function (fn) { try { out += fn(api, near) || ''; } catch (e) { console.error(e); } });
    if (s.fronts) s.fronts.forEach(function (f) { /* pieces of the painting cut out and laid over her: a bridge rail, an arch door. Below its base she is in front of it */
      var html = '<image href="' + f.src + '" x="' + f.rect[0] + '" y="' + f.rect[1] + '" width="' + (f.rect[2] - f.rect[0]) + '" height="' + (f.rect[3] - f.rect[1]) + '" preserveAspectRatio="none"/>';
      if (me.y >= frontBase(f)) out += html; else front += html;
    });
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
    var n = nearest(), label = !path.length && !sitting ? promptFor(n) : null;
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
    if (sitting) return;
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
    sitting = true; me.x = sp.at.x; me.y = sp.at.y + 0.2; me.action = 'sit'; me.pose = null; me.view = 'front'; path = [];
  }
  function stand() { sitting = false; me.action = 'idle'; me.pose = null; if (standBack) { me.x = standBack.x; me.y = standBack.y; } }

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
    var n = nearest();
    var key = st.scene + (n ? JSON.stringify(n.bed !== undefined ? n.bed : n.spot.id) : '') + ':' + frontsBehind() + (sitting ? 's' : '');
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
    if (ev.key === '+' || ev.key === '=') zoomBy(1.15); else if (ev.key === '-' || ev.key === '_') zoomBy(1 / 1.15); else if (ev.key === '0') setZoom(1);
  }

  function boot() {
    ['scene', 'backdrop', 'stage', 'layer', 'plate', 'props', 'me', 'front', 'fx', 'prompt', 'toast', 'place', 'hudSeeds', 'hudBasket', 'hudPond'].forEach(function (id) { els[id] = $(id); });
    els.app = doc.querySelector('.app');
    root.addEventListener('resize', layout);
    st = S.load();
    if (!st.outfit) st.outfit = P.clean(null);
    if (W.SCENES.farm && W.SCENES.farm.beds && F.fitBeds(st.farm, W.SCENES.farm.beds.length)) S.save(); /* an older save had more beds than the painted farm shows */
    els.scene.addEventListener('click', onTap);
    els.scene.addEventListener('touchstart', onTouchStart, { passive: true }); els.scene.addEventListener('touchmove', onTouchMove, { passive: false });
    els.scene.addEventListener('touchend', onTouchEnd); els.scene.addEventListener('touchcancel', onTouchEnd);
    els.scene.addEventListener('wheel', onWheel, { passive: false });
    els.prompt.addEventListener('click', function (e) { e.stopPropagation(); useNear(); });
    doc.addEventListener('keydown', keys);
    if ($('wardrobeBtn')) $('wardrobeBtn').addEventListener('click', function () { root.EbbUi.openWardrobe(st.outfit, function (o) { if (o) { st.outfit = o; S.save(); } }); });
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
    zoom: function (f) { return f === undefined ? cam.user : f === 0 ? setZoom(1) : zoomBy(f); }, /* zoom(): read; zoom(0): reset; zoom(1.2): in by 20 percent */
    work: function (tool, ms, view) { work(tool, ms, view); }, sit: function (at, pose) { sitting = true; me.x = at.x; me.y = at.y; me.action = 'sit'; me.pose = pose || null; me.view = 'front'; path = []; },
    pose: function (name) { if (sitting) me.pose = name || null; }, /* switch the seated action strip: sip, soak, fish, or null for the plain seat */
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
  var HEART = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 21s-7.5-4.7-9.6-9.3C.9 8.3 2.6 4.6 6.2 4.1c2.2-.3 4.1.8 5.8 2.9 1.7-2.1 3.6-3.2 5.8-2.9 3.6.5 5.3 4.2 3.8 7.6C19.5 16.3 12 21 12 21z" fill="#f08aa6" stroke="#d96d8f" stroke-width="1.2" stroke-linejoin="round"/></svg>';
  function registerHud(label, value, icon) { /* a small counter in the top bar: an icon and the number, the word kept for screen readers */
    var span = doc.createElement('span'); span.className = 'chip'; span.title = label; span.setAttribute('aria-label', label);
    span.innerHTML = (icon || HEART) + '<em class="sr"></em> <b>0</b>'; span.querySelector('.sr').textContent = label;
    $('counts').appendChild(span);
    hudItems.push({ el: span.querySelector('b'), value: value }); updateHud();
  }

  root.EbbGame = { boot: boot, api: api, registerKind: registerKind, registerProps: registerProps, registerPanel: registerPanel, registerHud: registerHud, state: function () { return st; }, me: function () { return me; }, walkTo: walkTo, act: act, enter: enter };
  /* extensions register before boot, so places and kinds exist when the saved scene is entered */
  if (doc.readyState === 'complete') boot(); else root.addEventListener('load', boot);
})(window);
