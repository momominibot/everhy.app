/* Ebb seats workstream: the painted seats out in the world (the hawker table, the lake bench at Little Guilin, the
 * stone bench at Merlion Park) become places to sit with something small to do. Tap a seat: she walks over, sits on
 * it, and a compact sheet offers the seat's own actions plus Get up. Timed actions show a clock with Pause and Skip,
 * count only running visible time, and save a mindfulness observation once at least 20 seconds ran. Walking taps are
 * ignored while she sits (the engine's sitting state); Get up or any scene change stands her up and clears the sheet.
 * Rules live in js/seats/rules.js. Nothing is scored. */
(function (root) {
  'use strict';
  var doc = root.document;
  if (!doc || !root.EbbGame) return;

  ['js/seats/rules.js'].forEach(function (src) { /* loads before the game boots: scripts added before the load event run first */
    if (doc.querySelector('script[src="' + src + '"]')) return;
    var s = doc.createElement('script'); s.src = src; s.async = false; doc.head.appendChild(s);
    s.addEventListener('load', init);
  });
  if (root.EbbSeatRules) init();
  function R() { return root.EbbSeatRules; }

  /* the three outdoor seats become the seat kind here; see the TODO in js/seats/rules.js for folding this into the scene data */
  var retargeted = false;
  function init() {
    if (retargeted || !R() || !root.EbbWorld) return; retargeted = true;
    R().retarget(root.EbbWorld.SCENES);
  }

  var api = null, cur = null, wrap = null, watch = 0, run = null, upBtn = null;
  function el(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }
  function seated() { return !!cur; }

  /* ---------- one compact sheet, a light scrim so she stays in view ---------- */
  function sheet(title, nodes, actions) {
    close();
    wrap = el('div', 'sheet-wrap seat-wrap');
    wrap.addEventListener('keydown', function (e) { e.stopPropagation(); });
    wrap.addEventListener('click', function (e) { e.stopPropagation(); });
    var sh = el('section', 'sheet seat-sheet'); sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-label', title); sh.tabIndex = -1;
    var head = el('div', 'seat-head'); head.appendChild(el('h2', '', title));
    var bar = el('div', 'sheet-actions seat-bar'); /* the buttons sit beside the title, so the sheet stays short and the seat stays in view */
    actions.forEach(function (a) {
      var b = el('button', (a.primary ? 'btn primary' : 'btn') + ' small', a.label); b.type = 'button'; b.dataset.act = a.id;
      b.addEventListener('click', function () { a.fn(b); }); bar.appendChild(b);
    });
    head.appendChild(bar); sh.appendChild(head);
    var body = el('div', 'sheet-body seat-body'); nodes.forEach(function (n) { if (n) body.appendChild(n); }); sh.appendChild(body);
    wrap.appendChild(sh); doc.body.appendChild(wrap);
    sh.focus();
    return sh;
  }
  function close() { if (wrap) { wrap.remove(); wrap = null; } }
  function sheetOpen() { return !!wrap && doc.body.contains(wrap); }
  function hideUp() { if (upBtn) { upBtn.remove(); upBtn = null; } }
  function showUp() { /* while she just sits: one small button where the walking prompt would be */
    hideUp();
    upBtn = el('button', 'prompt seat-up', 'Get up'); upBtn.type = 'button'; upBtn.dataset.act = 'getup';
    upBtn.addEventListener('click', function (e) { e.stopPropagation(); getUp('getUp'); });
    var bar = doc.querySelector('.actionbar'); (bar || doc.body).appendChild(upBtn);
  }

  /* ---------- the menu: the seat's actions, and Get up ---------- */
  function menu(line) {
    var seat = cur.spot.seat, nodes = [];
    nodes.push(el('p', line ? 'seat-done' : 'muted', line || seat.line));
    var list = el('div', 'seat-actions');
    R().actionsFor(cur.scene, cur.spot.id).forEach(function (a) {
      var b = el('button', 'seat-action'); b.type = 'button'; b.dataset.action = a.id;
      b.appendChild(el('b', '', a.label));
      b.appendChild(el('small', '', a.sec ? (a.sec >= 60 ? Math.round(a.sec / 60) + ' min' : a.sec + ' s') : 'as long as you like'));
      b.addEventListener('click', function () { start(a); });
      list.appendChild(b);
    });
    nodes.push(list);
    sheet(seat.title, nodes, [{ label: 'Get up', id: 'getup', fn: function () { getUp('getUp'); } }]);
  }

  /* ---------- a timed action ---------- */
  function start(action) {
    if (!cur) return;
    if (!action.sec) { /* Just sit: no clock, no record, only a way up */
      close(); showUp(); api.toast(action.prompt, 3200); return;
    }
    var E = R(), t = E.timer(action.sec), startIso = new Date().toISOString();
    if (api.pose) api.pose(action.pose || null); /* a seated action strip when the set has one (sip), else the plain seat */
    var prompt = el('p', 'seat-prompt', action.prompt), clock = el('p', 'seat-clock'), count = el('p', 'seat-count');
    clock.setAttribute('aria-live', 'off'); count.setAttribute('aria-live', 'polite');
    var row = el('div', 'seat-row'); row.appendChild(clock); row.appendChild(count);
    var sh = sheet(action.label, [prompt, row], [
      { label: 'Pause', id: 'pause', fn: function (b) { if (t.paused) E.resume(t, Date.now()); else E.pause(t, Date.now()); b.textContent = t.paused ? 'Resume' : 'Pause'; paint(); } },
      { label: 'Skip', id: 'skip', fn: function () { E.end(t, Date.now()); done(); } }]);
    sh.classList.add('running');
    if (action.fx === 'steam') steam(true);
    var lastBreath = '';
    function paint() {
      clock.textContent = E.clockText(t) + ' left' + (t.paused ? ', paused' : '');
      var br = E.breathAt(action, t);
      if (br) { var txt = 'Breath ' + br.n + ' of ' + br.of + ', ' + br.phase; if (txt !== lastBreath) { lastBreath = txt; count.textContent = txt; } }
    }
    function onVis() { E.setHidden(t, doc.hidden, Date.now()); }
    doc.addEventListener('visibilitychange', onVis);
    E.setHidden(t, doc.hidden, Date.now());
    var iv = setInterval(function () { E.advance(t, Date.now()); paint(); if (t.ended) done(); }, 250);
    run = { stop: function () { clearInterval(iv); doc.removeEventListener('visibilitychange', onVis); if (action.fx === 'steam') steam(false); } };
    paint();
    var over = false;
    function done() {
      if (over) return; over = true;
      if (run) { run.stop(); run = null; }
      if (api.pose) api.pose(cur && cur.spot.seat && cur.spot.seat.pose || null); /* back to the seat's resting pose (in the bath, still soaking) */
      var rec = E.record(action, t, cur.scene, cur.spot.id, startIso, new Date().toISOString()), line;
      if (rec) {
        rec.id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        var st = api.state(); if (!Array.isArray(st.observations)) st.observations = [];
        st.observations.push(rec); api.save();
        line = (E.finished(t) ? action.done : 'You stayed ' + E.activeSec(t) + ' seconds. That counts too.') + ' Saved to your practice.';
        try { if (root.EbbSound && typeof root.EbbSound.play === 'function') root.EbbSound.play('chime'); } catch (e) { }
        if (root.EbbLife && root.EbbLife.react) root.EbbLife.react('sparkle', 1600);
      } else line = 'Skipped. Nothing saved, nothing lost.';
      if (cur) menu(line);
    }
  }
  function stopRun() { if (run) { run.stop(); run = null; } }

  /* a kopi cup on the table with a steam curl over it, through the engine's fx layer, while she sips */
  function steam(on) {
    if (!cur) return;
    if (!on) { api.fx('', 1); return; }
    var s = cur.spot.seat.steam || { x: 0, y: -2 }, at = cur.spot.at, x = at.x + s.x, y = at.y + s.y, f = function (v) { return v.toFixed(2); }, out = '';
    var cup = '<ellipse cx="' + f(x) + '" cy="' + f(y + 0.35) + '" rx="1.5" ry="0.45" fill="rgba(60,40,30,0.16)"/>' +
      '<path d="M' + f(x - 1.1) + ' ' + f(y - 1.8) + ' h2.2 l-0.3 2 a0.8 0.4 0 0 1 -1.6 0 Z" fill="#fff4e4" stroke="#d9c3ad" stroke-width="0.12"/>' +
      '<ellipse cx="' + f(x) + '" cy="' + f(y - 1.8) + '" rx="1.1" ry="0.42" fill="#fff4e4" stroke="#d9c3ad" stroke-width="0.12"/>' +
      '<ellipse cx="' + f(x) + '" cy="' + f(y - 1.8) + '" rx="0.85" ry="0.3" fill="#7a4a2e"/>' +
      '<path d="M' + f(x + 1.1) + ' ' + f(y - 1.3) + ' q1 0.1 0.8 0.9 q-0.2 0.6 -1 0.5" fill="none" stroke="#d9c3ad" stroke-width="0.25"/>';
    for (var i = 0; i < 3; i++) out += '<path class="seat-steam" d="M' + f(x + i * 0.9 - 0.9) + ' ' + f(y - 2.4) + ' q-0.7 -1.4 0 -2.8 q0.7 -1.4 0 -2.8" stroke="#ffffff" stroke-width="0.4" fill="none" stroke-linecap="round" style="animation-delay:-' + (i * 0.7).toFixed(1) + 's"/>';
    api.fx('<g class="seat-steam-g">' + cup + out + '</g>', 36e5);
  }

  /* ---------- the bath: soft bubbles drawn over her up to the shoulders while she sits in the tub (every outfit) ---------- */
  function bubbles(at) { /* the painted tub has its own foam; a few soap bubbles drift up from it while she soaks */
    var sc = root.EbbWorld.scaleAt ? root.EbbWorld.scaleAt(at.y, api.scene()) : 0.2, h = 243 * 104 / 300 * sc, w = 150 * 104 / 300 * sc;
    var f = function (v) { return v.toFixed(2); }, x = at.x, top = at.y - h * 0.45, out = '';
    [[-0.7, 0.05, 0.07], [0.75, -0.05, 0.06], [-0.35, -0.15, 0.05], [0.4, -0.25, 0.045]].forEach(function (d, i) { out += '<circle class="seat-bubble" style="animation-delay:-' + (i * 0.8).toFixed(1) + 's" cx="' + f(x + d[0] * w) + '" cy="' + f(top + d[1] * h) + '" r="' + f(d[2] * w) + '" fill="rgba(255,255,255,0.25)" stroke="#ffffff" stroke-width="0.12"/>'; });
    api.fx('<g class="seat-bubbles">' + out + '</g>', 36e5);
  }

  /* ---------- sitting down and getting up ---------- */
  function seat(spot, a) {
    api = a;
    if (!spot.seat) spot.seat = R().seatFor(api.scene(), spot.id); /* a spot made a seat by the scene data later */
    if (cur && cur.spot === spot) { menu(); return; }
    cur = { spot: spot, scene: api.scene() };
    var bath = spot.seat && spot.seat.cover === 'bubbles';
    api.sit(R().sitAt(spot), bath && api.spin ? null : spot.seat && spot.seat.pose || null); api.refresh(); /* a seat may name its resting pose: legs down with a kopi at the hawker stools */
    if (bath) { bubbles(R().sitAt(spot)); if (api.spin) api.spin(function () { if (cur && cur.spot === spot && api.pose) api.pose(spot.seat.pose || null); }); } /* into the bath with a spin, changing as she turns */
    if (root.EbbLife && root.EbbLife.react) root.EbbLife.react('heart', 1600);
    /* she just sits first; the seat's options only if she asks for a mindful moment */
    if (root.EbbUi && root.EbbUi.seatChoice) root.EbbUi.seatChoice({ mindful: function () { menu(); }, up: function () { getUp('getUp'); } }); else menu();
    clearInterval(watch); watch = setInterval(tick, 250);
  }
  function getUp(why) {
    if (!cur) return;
    stopRun(); close(); hideUp(); api.fx('', 1); if (root.EbbUi && root.EbbUi.closeSeatChoice) root.EbbUi.closeSeatChoice();
    clearInterval(watch); watch = 0;
    var me = api.me(), sp = cur.spot; cur = null;
    if (why !== 'scene' && why !== 'stood') {
      var st = R().standAt(sp), up = function () { api.stand(st.y); me.x = st.x; me.y = st.y; api.refresh(); };
      if (sp.seat && sp.seat.cover === 'bubbles' && api.spin) api.spin(up); else up(); /* out of the bath with a spin, dressed again */
    }
    api.refresh();
  }
  /* she is only seated while the scene is the one she sat in and the engine still has her sitting (a door, Decorate or
   * anything else that stood her up ends it) */
  function tick() {
    if (!cur) { clearInterval(watch); watch = 0; return; }
    if (api.scene() !== cur.scene) { getUp('scene'); return; }
    if (api.me().action !== 'sit') { getUp('stood'); return; }
  }

  /* a faint ring on the seat when she stands near it, like the engine's own spots */
  function ringFor(sceneId) {
    return function (a, near) {
      if (cur || !near || !near.spot || !near.spot.seat) return '';
      var sp = near.spot; if (!R().isSeat(sceneId, sp.id)) return '';
      return '<ellipse class="seat-ring" cx="' + sp.at.x + '" cy="' + (sp.at.y + 1) + '" rx="7" ry="3" fill="none" stroke="#fff6e8" stroke-width="0.45" stroke-dasharray="1.1 0.9"/>';
    };
  }
  Object.keys(R() ? R().SEATS : { 'hawker:table': 1, 'waterfall:bench': 1, 'merlion:bench': 1 }).map(function (k) { return k.split(':')[0]; })
    .filter(function (id, i, all) { return all.indexOf(id) === i; })
    .forEach(function (id) { root.EbbGame.registerProps(id, ringFor(id)); });

  root.EbbGame.registerKind('seat', seat);
  root.EbbSeats = { seated: seated, current: function () { return cur ? { scene: cur.scene, spot: cur.spot.id } : null; }, getUp: function () { getUp('getUp'); }, running: function () { return !!run; }, sheetOpen: sheetOpen };
})(window);
