/* Ebb transit: hop on the MRT or the bus to get somewhere on the map. When she travels to a place that is not where
 * she is and not her home, a small sheet asks how she will get there. On board she can walk the aisle, take a seat for
 * a short breathing count or a five-senses pause (saved as a mindfulness observation with where it happened), or just
 * sit; the doors and a persistent Arrive button end the ride at her stop. The trip lives in the save, so a reload
 * mid-ride keeps her on board. Rules are pure in js/transit/rules.js. Scenes register here so the node harness can
 * check every seat and the exit; the page part below only runs in a browser. */
(function (root) {
  'use strict';
  var W = root.EbbWorld;
  if (!W) return;

  /* ---------- the two carriages (Seedream renders, 768x1344: x 0..100 across, y 0..175 down, read on a 5% grid) ---------- */
  var SEAT = 'Take a seat';
  W.register('train', { /* an MRT carriage: bench seats along the back under the windows, three poles, open floor, the doors at the bottom */
    name: 'MRT train', plate: 'art/plates/train.webp', aspect: [4, 7], indoor: true, sound: 'room', surface: 'tile', depth: [86, 0.22, 131, 0.32],
    lamps: [{ x: 50, y: 14, r: 60 }], windows: [{ x: 13, y: 58, rx: 11, ry: 12 }, { x: 44, y: 58, rx: 11, ry: 12 }, { x: 72, y: 58, rx: 9, ry: 12 }, { x: 93, y: 58, rx: 6, ry: 12 }],
    floor: [[2, 89], [98, 89], [98, 118], [83, 124], [83, 131], [17, 131], [17, 124], [2, 118]],
    solids: [[16, 84, 22, 93], [62, 86, 68, 96], [91, 90, 98, 100]], /* the three pole feet */
    doors: [{ id: 'exit', rect: [20, 126, 80, 140], to: 'merlion', label: 'Step off at your stop' }],
    spots: [
      { id: 'seat1', kind: 'seat', at: { x: 9, y: 82 }, stand: { x: 9, y: 94 }, label: SEAT },
      { id: 'seat2', kind: 'seat', at: { x: 28, y: 82 }, stand: { x: 28, y: 94 }, label: SEAT },
      { id: 'seat3', kind: 'seat', at: { x: 45, y: 82 }, stand: { x: 45, y: 94 }, label: SEAT },
      { id: 'seat4', kind: 'seat', at: { x: 56, y: 82 }, stand: { x: 56, y: 94 }, label: SEAT },
      { id: 'seat5', kind: 'seat', at: { x: 75, y: 82 }, stand: { x: 75, y: 94 }, label: SEAT },
      { id: 'seat6', kind: 'seat', at: { x: 88, y: 82 }, stand: { x: 88, y: 94 }, label: SEAT }
    ],
    start: { x: 50, y: 112 }
  });
  W.register('bus', { /* the upper deck of a double-decker: three rows each side, a back bench, the aisle down the middle, the stairs at the bottom beside a handrail */
    name: 'Bus', plate: 'art/plates/bus.webp', aspect: [4, 7], indoor: true, sound: 'room', surface: 'tile', depth: [88, 0.2, 162, 0.34],
    lamps: [{ x: 50, y: 30, r: 50 }], windows: [{ x: 8, y: 68, rx: 7, ry: 16 }, { x: 92, y: 68, rx: 7, ry: 16 }, { x: 50, y: 66, rx: 12, ry: 9 }],
    floor: [[33, 90], [67, 90], [70, 118], [72, 135], [72, 162], [28, 162], [28, 135], [30, 118]],
    solids: [[46, 134, 54, 175]], /* the handrail by the stairs */
    doors: [
      { id: 'stairsLeft', rect: [28, 150, 46, 163], to: 'hawker', label: 'Down the stairs to get off' },
      { id: 'stairsRight', rect: [54, 150, 72, 163], to: 'hawker', label: 'Down the stairs to get off' }
    ],
    spots: [
      { id: 'bench', kind: 'seat', at: { x: 50, y: 87 }, stand: { x: 50, y: 96 }, label: SEAT },
      { id: 'leftFar', kind: 'seat', at: { x: 24, y: 93 }, stand: { x: 36, y: 97 }, label: SEAT },
      { id: 'leftMid', kind: 'seat', at: { x: 19, y: 106 }, stand: { x: 35, y: 108 }, label: SEAT },
      { id: 'leftNear', kind: 'seat', at: { x: 14, y: 121 }, stand: { x: 34, y: 122 }, label: SEAT },
      { id: 'rightFar', kind: 'seat', at: { x: 77, y: 93 }, stand: { x: 64, y: 97 }, label: SEAT },
      { id: 'rightMid', kind: 'seat', at: { x: 82, y: 106 }, stand: { x: 65, y: 108 }, label: SEAT },
      { id: 'rightNear', kind: 'seat', at: { x: 86, y: 121 }, stand: { x: 66, y: 122 }, label: SEAT }
    ],
    start: { x: 40, y: 145 }
  });

  var doc = root.document;
  if (!doc || !root.EbbGame) return; /* the node harness stops here */

  /* rules load as their own file; the load event waits for them, and nothing below needs them until a tap */
  if (!root.EbbTransitRules) { var sc0 = doc.createElement('script'); sc0.src = 'js/transit/rules.js'; sc0.async = false; doc.head.appendChild(sc0); }
  function R() { return root.EbbTransitRules; }

  var api = null, bypass = false, seated = null, lastScene = null, bar = null, arriveBtn = null, upBtn = null, openSheet = null;
  function el(tag, cls, text) { var n = doc.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
  function reduced() { return doc.documentElement.getAttribute('data-motion') === 'reduce' || (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function chime() { try { if (root.EbbSound && typeof root.EbbSound.play === 'function') root.EbbSound.play('chime'); } catch (e) { } }
  function sceneName(id) { var s = W.SCENES[id]; return s ? s.name : id; }
  /* the same fade the doors and the map use; reduced motion moves at once */
  function fade(move) {
    var sc = doc.getElementById('scene');
    if (reduced() || !sc) { move(); return; }
    sc.classList.add('fading');
    setTimeout(function () { move(); sc.classList.remove('fading'); }, 320);
  }

  /* ---------- a small sheet in the engine's look ---------- */
  function sheet(title, build, actions) {
    if (openSheet) openSheet();
    var wrap = el('div', 'sheet-wrap transit-wrap');
    var sh = el('section', 'sheet transit-sheet'); sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-label', title);
    sh.appendChild(el('h2', '', title));
    var body = el('div', 'sheet-body transit-body'), acts = el('div', 'sheet-actions');
    sh.appendChild(body); sh.appendChild(acts); wrap.appendChild(sh);
    function close() { if (!wrap.parentNode) return; wrap.remove(); if (openSheet === close) openSheet = null; if (wrap._cleanup) { wrap._cleanup(); wrap._cleanup = null; } }
    (actions || []).forEach(function (a) {
      var b = el('button', a.primary ? 'btn primary' : 'btn', a.label); b.type = 'button'; if (a.id) b.dataset.act = a.id;
      b.addEventListener('click', function () { a.fn(b, close); }); acts.appendChild(b);
    });
    wrap.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Escape' && !wrap._stay) close(); });
    wrap.addEventListener('click', function (e) { e.stopPropagation(); });
    doc.body.appendChild(wrap); openSheet = close;
    build(body, close, wrap);
    var first = sh.querySelector('button:not([disabled])'); if (first) first.focus();
    return close;
  }
  function card(label, note, fn, id) {
    var b = el('button', 'transit-card'); b.type = 'button'; b.dataset.choice = id;
    var t = el('span', 'cw-text'); t.appendChild(el('b', '', label)); if (note) t.appendChild(el('small', '', note)); b.appendChild(t);
    b.addEventListener('click', fn); return b;
  }

  /* ---------- the map hook: how will she get there? ---------- */
  function retarget() { /* the carriage doors lead where the trip goes */
    var r = R(); if (!r || !api) return;
    Object.keys(r.MODES).forEach(function (m) {
      var s = W.SCENES[r.MODES[m].scene], x = r.exitFor(api.state(), m);
      if (s) s.doors.forEach(function (d) { d.to = x.to; d.arrive = x.arrive; });
    });
  }
  function board(mode, dest) {
    var r = R(), a = api;
    r.begin(a.state(), mode, dest.to, dest.arrive, Date.now()); a.save(); retarget();
    fade(function () { a.enter(r.MODES[mode].scene); lastScene = a.scene(); a.toast(r.MODES[mode].toast + dest.label, 2600); paintBar(); });
  }
  function offer(pin, gameApi, close) {
    var r = R(); if (bypass || !r || !gameApi) return false;
    var dest = r.offerFor(pin, W.SCENES, gameApi.scene()); if (!dest) return false;
    api = api || gameApi;
    if (close) close();
    sheet('How will you get there?', function (body, done) {
      body.appendChild(el('p', 'muted', 'To ' + dest.label + '. The ride is a quiet moment of its own, if you want one.'));
      var cards = el('div', 'transit-cards');
      Object.keys(r.MODES).forEach(function (m) { cards.appendChild(card(r.MODES[m].label, r.MODES[m].note, function () { done(); board(m, dest); }, m)); });
      cards.appendChild(card('Just arrive', 'Straight there, as before', function () {
        done(); bypass = true;
        try { if (root.EbbMap && root.EbbMap.go) root.EbbMap.go(pin); else fade(function () { gameApi.enter(pin.scene, dest.arrive || undefined); gameApi.toast(sceneName(pin.scene), 1400); }); }
        finally { bypass = false; }
      }, 'walk'));
      body.appendChild(cards);
    }, [{ label: 'Not now', id: 'notnow', fn: function (b, done) { done(); } }]);
    return true;
  }

  /* ---------- the ride: Arrive and Get up in the action area ---------- */
  function mountBar() {
    var area = doc.querySelector('.app'); if (!area || bar) return;
    bar = el('div', 'transit-bar'); bar.hidden = true;
    upBtn = el('button', 'btn transit-up', 'Get up'); upBtn.type = 'button'; upBtn.id = 'transitUp'; upBtn.hidden = true;
    upBtn.addEventListener('click', function (e) { e.stopPropagation(); getUp(); });
    arriveBtn = el('button', 'btn primary transit-arrive', 'Arrive'); arriveBtn.type = 'button'; arriveBtn.id = 'transitArrive';
    arriveBtn.addEventListener('click', function (e) { e.stopPropagation(); arrive(); });
    bar.appendChild(upBtn); bar.appendChild(arriveBtn); area.appendChild(bar);
  }
  var glide = null;
  function paintGlide(here, riding) { /* a soft light drifting past the windows, CSS only; still under reduced motion */
    var stage = doc.getElementById('stage'); if (!stage) return;
    if (!glide) { glide = el('div', 'transit-glide'); glide.setAttribute('aria-hidden', 'true'); stage.insertBefore(glide, stage.querySelector('.layer')); }
    glide.hidden = !riding; if (riding) glide.dataset.mode = here;
  }
  function paintBar() {
    var r = R(); if (!bar || !r) return;
    var here = api.scene(), riding = r.isTransitScene(here);
    bar.hidden = !riding; paintGlide(here, riding);
    if (!riding) return;
    var t = r.trip(api.state()), mode = here === 'bus' ? 'bus' : 'train', x = r.exitFor(api.state(), mode);
    arriveBtn.textContent = 'Arrive at ' + sceneName(t ? t.to : x.to);
    upBtn.hidden = !seated;
  }
  function arrive() {
    var r = R(), st = api.state(), here = api.scene();
    if (!r.isTransitScene(here)) return;
    var a = r.arrival(st) || r.exitFor(st, here === 'bus' ? 'bus' : 'train');
    var scene = a.scene || a.to, at = a.at || a.arrive;
    if (openSheet) openSheet();
    if (seated) getUp(true);
    api.save(); retarget();
    fade(function () { api.enter(scene, at); api.toast('You are here. ' + sceneName(scene), 2000); paintBar(); });
  }
  function getUp(quiet) {
    if (!seated) return;
    var s = seated; seated = null;
    if (openSheet) openSheet();
    api.stand(s.spot.stand.y); var me = api.me(); me.x = s.spot.stand.x; me.y = s.spot.stand.y;
    if (!quiet) paintBar();
  }
  /* every quarter second: a scene change ends or forgets the trip; standing up elsewhere drops the seat */
  function watch() {
    var r = R(); if (!r || !api) return;
    var here = api.scene();
    if (here !== lastScene) {
      lastScene = here;
      var what = r.onScene(api.state(), here);
      if (what === 'arrived') api.toast('You are here. ' + sceneName(here), 2000);
      if (what !== 'none' && what !== 'riding') api.save();
      retarget();
      if (seated && seated.scene !== here) seated = null;
    }
    if (seated && api.me().action !== 'sit') seated = null;
    paintBar();
  }

  /* ---------- the seat: breathe for the ride, notice five things, or just sit ---------- */
  function seat(spot, a) {
    var r = R(); if (!r) return;
    api = api || a;
    if (openSheet) openSheet();
    a.sit({ x: spot.at.x, y: spot.at.y + 0.2 });
    seated = { spot: spot, scene: a.scene() };
    paintBar();
    var mode = a.scene() === 'bus' ? 'bus' : 'train';
    function pick() {
      sheet('A seat for the ride', function (body, done) {
        body.appendChild(el('p', 'muted', 'The ride takes as long as you like. Arrive whenever you are ready.'));
        var cards = el('div', 'transit-cards');
        r.SEAT_OPTIONS.forEach(function (o) {
          cards.appendChild(card(o.label, o.note, function () {
            if (o.id === 'sit') { done(); a.toast('Just sitting. The window does the rest.', 2200); return; }
            if (o.secs.length > 1) length(o); else run(o, o.secs[0]);
          }, o.id));
        });
        body.appendChild(cards);
      }, [{ label: 'Not now', id: 'notnow', fn: function (b, done) { done(); getUp(); } }]);
    }
    function length(o) {
      var secs = o.secs[0];
      sheet(o.label, function (body) {
        body.appendChild(el('p', '', 'In for four, out for six. The count shows on the sheet; you can pause or skip at any time.'));
        var row = el('div', 'choice'); row.appendChild(el('span', '', 'Length'));
        var g = el('div', 'pills'); g.setAttribute('role', 'group'); g.setAttribute('aria-label', 'Length');
        o.secs.forEach(function (s) {
          var b = el('button', 'pill', s + ' seconds'); b.type = 'button'; b.dataset.secs = String(s); b.setAttribute('aria-pressed', String(s === secs));
          b.addEventListener('click', function () { secs = s; g.querySelectorAll('.pill').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); });
          g.appendChild(b);
        });
        row.appendChild(g); body.appendChild(row);
      }, [{ label: 'Back', id: 'back', fn: pick }, { label: 'Begin', primary: true, id: 'begin', fn: function () { run(o, secs); } }]);
    }
    function run(o, secs) {
      var t = r.timer(secs), startIso = new Date().toISOString(), over = false;
      sheet(o.label, function (body, done, wrap) {
        wrap._stay = true;
        var cue = el('p', 'transit-cue'); cue.setAttribute('aria-live', 'polite');
        var dots = el('p', 'transit-dots'); dots.setAttribute('aria-hidden', 'true');
        var clock = el('p', 'transit-clock'); clock.id = 'transitClock';
        var back = el('p', 'muted small transit-back');
        body.appendChild(cue); body.appendChild(dots); body.appendChild(clock); body.appendChild(back);
        var backTimer = 0;
        function paint() {
          if (o.id === 'breathe') {
            var b = r.breathAt(t); cue.textContent = b.text;
            var d = ''; for (var i = 1; i <= b.of; i++) d += '<i' + (i <= b.count ? ' class="on"' : '') + '></i>'; dots.innerHTML = d;
          } else { cue.textContent = r.noticeAt(t).text; dots.innerHTML = ''; }
          clock.textContent = r.clock(t) + ' left' + (t.paused ? ', paused' : '');
        }
        function onVis() {
          r.setHidden(t, doc.hidden, Date.now());
          if (!doc.hidden) { back.textContent = 'Welcome back. The count waited while you were away.'; clearTimeout(backTimer); backTimer = setTimeout(function () { back.textContent = ''; }, 5000); }
        }
        doc.addEventListener('visibilitychange', onVis);
        r.setHidden(t, doc.hidden, Date.now());
        var iv = setInterval(function () { r.advance(t, Date.now()); paint(); if (t.ended) finish(done); }, 250);
        wrap._cleanup = function () { clearInterval(iv); clearTimeout(backTimer); doc.removeEventListener('visibilitychange', onVis); };
        paint();
      }, [
        { label: 'Pause', id: 'pause', fn: function (b) { if (t.paused) r.resume(t, Date.now()); else r.pause(t, Date.now()); b.textContent = t.paused ? 'Resume' : 'Pause'; } },
        { label: 'Skip', id: 'skip', fn: function (b, done) { r.end(t, Date.now()); finish(done); } }]);
      function finish(done) {
        if (over) return; over = true;
        done();
        var saved = null;
        if (r.worthSaving(t)) {
          saved = r.observation(o.id, mode, t, startIso, new Date().toISOString(), 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
          var st = a.state(); if (!Array.isArray(st.observations)) st.observations = []; st.observations.push(saved); a.save();
        }
        if (r.finished(t)) chime();
        after(saved);
      }
    }
    function after(saved) {
      sheet('That was the ride', function (body) {
        body.appendChild(el('p', '', saved ? (saved.status === 'finished' ? 'You stayed with it to the end.' : 'You stayed with it for ' + saved.activeSec + ' seconds.') + ' A wandering mind, or no change at all, is part of practice.' : 'A few seconds only, so nothing was saved. That is fine.'));
        if (saved) body.appendChild(el('p', 'muted small', 'Saved to your practice history, with where it happened.'));
      }, [{ label: 'Stay seated', id: 'stay', fn: function (b, done) { done(); } }, { label: 'Get up', primary: true, id: 'up', fn: function (b, done) { done(); getUp(); } }]);
    }
    pick();
  }

  /* ---------- wiring ---------- */
  function start(a) {
    api = a; mountBar();
    var r = R(), st = a.state();
    if (r) { r.ensure(st); var t = r.trip(st); if (t && a.scene() !== r.MODES[t.mode].scene) { r.clear(st); a.save(); } }
    lastScene = a.scene(); retarget(); paintBar();
    setInterval(watch, 250);
  }
  root.EbbGame.registerKind('seat', seat);
  doc.addEventListener('ebb:ready', function (e) { start(e.detail || root.EbbGame.api); });
  if (root.EbbGame._ready) start(root.EbbGame.api);

  root.EbbTransit = { offer: offer, arrive: arrive, getUp: function () { getUp(); }, seated: function () { return !!seated; }, rules: R, open: function () { return !!openSheet; } };
})(typeof window !== 'undefined' ? window : globalThis);
