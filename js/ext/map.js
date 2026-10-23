/* Ebb map: a full-screen clay map of her world. Pins travel with api.enter(scene) after the sheet closes. A pin whose
 * place is not registered yet (another workstream adds it) shows greyed as "Coming soon" and does nothing. The pin
 * table and the travel rule are pure, so tools/test-map.js checks them in node; the page part only runs in a browser.
 * Pin positions are in percent of the square map art, read off the image on a percent grid. */
(function (root) {
  'use strict';
  var W = root.EbbWorld;
  if (!W) return;

  var ART = 'art/map/world.webp'; /* Seedream clay island (art/raw/map_world.png); the drawn island shows if it fails to load */

  /* scene: where travel goes; spot: arrive at that spot's stand point instead of the scene start;
   * here: scenes that count as being at this place (home holds the bedroom and the bathroom) */
  var PINS = [
    { id: 'home', label: 'Home', note: 'Bedroom and bathroom', scene: 'bedroom', here: ['bedroom', 'bathroom'], icon: 'home', x: 32, y: 27 },
    { id: 'farm', label: 'Garden', note: 'Planter beds and the seed shed', scene: 'farm', icon: 'farm', x: 53, y: 52 },
    { id: 'waterfall', label: 'Little Guilin', note: 'The quarry lake at Bukit Gombak', scene: 'waterfall', icon: 'falls', x: 80, y: 27 },
    { id: 'spring', label: 'Hot spring', note: 'Sembawang foot bath', scene: 'spring', icon: 'spring', x: 84, y: 51 },
    { id: 'pier', label: 'Fishing deck', note: 'Cast a quiet line over the lake', scene: 'waterfall', spot: 'fishing', icon: 'fish', x: 72, y: 82 }
  ];

  function spotIn(scene, id) {
    for (var i = 0; i < scene.spots.length; i++) if (scene.spots[i].id === id) return scene.spots[i];
    return null;
  }
  /* 'soon' when the place is not in the world yet, 'here' when she is already there, else 'open' */
  function status(pin, scenes, current) {
    var s = scenes[pin.scene];
    if (!s || (pin.spot && !spotIn(s, pin.spot))) return 'soon';
    if (!pin.spot && (pin.here || [pin.scene]).indexOf(current) >= 0) return 'here';
    return 'open';
  }
  /* where she appears: a spot's stand point, or undefined so the engine uses the scene's own start */
  function arrival(pin, scenes) {
    var s = scenes[pin.scene], sp = s && pin.spot ? spotIn(s, pin.spot) : null;
    return sp ? { x: sp.stand.x, y: sp.stand.y } : undefined;
  }
  /* close the sheet first, then move her (later() may wait out a fade); returns what happened */
  function travel(pin, api, close, later) {
    var st = status(pin, W.SCENES, api.scene());
    if (st === 'soon') return 'soon';
    if (close) close();
    if (st === 'here') return 'here';
    var at = arrival(pin, W.SCENES), go = function () { api.enter(pin.scene, at); };
    if (later) later(go); else go();
    return 'went';
  }
  function byId(id) { for (var i = 0; i < PINS.length; i++) if (PINS[i].id === id) return PINS[i]; return null; }

  var EbbMap = root.EbbMap = { PINS: PINS, status: status, arrival: arrival, travel: travel, pin: byId, art: function () { return ART; } };

  var doc = root.document;
  if (!doc || !root.EbbGame) return; /* the node harness stops here */

  /* ---------- drawn bits: small line icons and the placeholder island ---------- */
  var ICONS = {
    home: '<path d="M4 11.5 12 5l8 6.5"/><path d="M6.5 10v9.5h11V10"/><path d="M10.5 19.5v-5h3v5"/>',
    farm: '<path d="M12 20v-8"/><path d="M12 13c-4 0-6-2.5-6-6 3.5 0 6 2 6 6Z"/><path d="M12 11c0-3.5 2.5-5.5 6-5.5 0 3.5-2 5.5-6 5.5Z"/><path d="M6 20h12"/>',
    falls: '<path d="M12 3.5c3.2 4.6 5.2 7.5 5.2 10.2a5.2 5.2 0 0 1-10.4 0c0-2.7 2-5.6 5.2-10.2Z"/><path d="M9.6 14.2a2.5 2.5 0 0 0 2.4 2.3"/>',
    spring: '<path d="M8.5 9c-1.5-1.5 1.5-3 0-5M12 9c-1.5-1.5 1.5-3 0-5M15.5 9c-1.5-1.5 1.5-3 0-5"/><path d="M4 13h16c0 4-3.5 6.5-8 6.5S4 17 4 13Z"/>',
    fish: '<path d="M3.5 12c3-4.5 9-5.5 13 0-4 5.5-10 4.5-13 0Z"/><path d="m16.5 12 4-3.5v7Z"/><circle cx="8" cy="11" r="0.6" fill="currentColor"/>',
    map: '<path d="M3.5 6.5 9 4.5l6 2 5.5-2v13l-5.5 2-6-2-5.5 2Z"/><path d="M9 4.5v13M15 6.5v13"/>'
  };
  function icon(name) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + ICONS[name] + '</svg>';
  }
  /* soft sea, a rounded island and a sandy rim, so the map reads as a place even before the picture ships */
  var PLACEHOLDER = '<svg class="map-placeholder" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">' +
    '<defs><radialGradient id="mapSea" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#cfe9e4"/><stop offset="1" stop-color="#9fcfd0"/></radialGradient>' +
    '<radialGradient id="mapLand" cx="45%" cy="40%" r="60%"><stop offset="0" stop-color="#cfe0b2"/><stop offset="1" stop-color="#a9c48f"/></radialGradient></defs>' +
    '<rect width="100" height="100" fill="url(#mapSea)"/>' +
    '<path d="M18 22C30 8 62 8 78 14s18 24 14 40-6 30-22 34-38 6-50-6S4 36 18 22Z" fill="#f1dfbf"/>' +
    '<path d="M21 24C32 12 61 12 76 18s15 22 12 36-6 27-20 30-35 5-46-5S9 37 21 24Z" fill="url(#mapLand)"/>' +
    '<path d="M30 38C40 42 44 44 50 46S62 36 70 28M50 46c-8 6-16 10-26 18M50 46c10 2 22 0 34 0M58 58c2 6 3 10 4 16" fill="none" stroke="#f6ead2" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="0.1 3.6"/>' +
    '<g fill="#8fb27a"><circle cx="38" cy="22" r="3"/><circle cx="42" cy="20" r="2.4"/><circle cx="84" cy="62" r="2.8"/><circle cx="16" cy="48" r="2.6"/><circle cx="40" cy="80" r="3"/><circle cx="44" cy="82" r="2.2"/></g>' +
    '</svg>';

  /* ---------- the sheet ---------- */
  var wrap = null, opener = null, appInert = false, btn = null;
  function api() { return root.EbbGame.api; }
  function reduced() {
    if (doc.documentElement.getAttribute('data-motion') === 'reduce') return true;
    return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function hereLine(current) {
    for (var i = 0; i < PINS.length; i++) if (status(PINS[i], W.SCENES, current) === 'here') return 'You are here: ' + PINS[i].label + '.';
    var s = W.SCENES[current];
    return s ? 'You are here: ' + s.name + '.' : '';
  }
  function draw() {
    var current = api().scene(), pins = '', list = '';
    PINS.forEach(function (p) {
      var st = status(p, W.SCENES, current), sub = st === 'soon' ? 'Coming soon' : st === 'here' ? 'You are here' : p.note;
      /* the pictures on the map are for touch; the list below is the same set of places as real buttons */
      pins += '<span class="map-pin is-' + st + '" data-pin="' + p.id + '" style="left:' + p.x + '%;top:' + p.y + '%" aria-hidden="true">' +
        '<span class="map-pin-head">' + icon(p.icon) + '</span><span class="map-pin-label">' + p.label + (st === 'soon' ? '<small>Coming soon</small>' : '') + '</span></span>';
      list += '<li><button type="button" class="map-place is-' + st + '" data-pin="' + p.id + '"' + (st === 'soon' ? ' aria-disabled="true"' : '') + (st === 'here' ? ' aria-current="location"' : '') + '>' +
        '<span class="map-place-icon">' + icon(p.icon) + '</span><span class="map-place-text"><b>' + p.label + '</b><small>' + sub + '</small></span></button></li>';
    });
    wrap.querySelector('.map-pins').innerHTML = pins;
    wrap.querySelector('.map-list').innerHTML = list;
    wrap.querySelector('.map-where').textContent = hereLine(current) + ' Tap a place to go there.';
  }
  function open() {
    if (wrap) return;
    if (root.EbbUi && root.EbbUi.modalOpen()) return;
    opener = doc.activeElement;
    wrap = doc.createElement('div');
    wrap.className = 'map-wrap';
    wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-labelledby', 'mapTitle');
    wrap.innerHTML = '<div class="map-sheet"><header class="map-head"><h2 id="mapTitle">Map</h2><button type="button" class="btn small map-close">Close</button></header>' +
      '<div class="map-board"><div class="map-art">' + PLACEHOLDER + (ART ? '<img class="map-img" alt="" draggable="false" decoding="async" src="' + ART + '">' : '') +
      '<div class="map-pins"></div></div></div><p class="map-where" aria-live="polite"></p><ul class="map-list" aria-label="Places"></ul></div>';
    var img = wrap.querySelector('.map-img');
    if (img) img.addEventListener('error', function () { img.remove(); });
    wrap.addEventListener('click', function (e) {
      if (e.target.closest('.map-close')) { close(); return; }
      var el = e.target.closest('[data-pin]');
      if (el) go(byId(el.getAttribute('data-pin')));
    });
    /* keys stay in the sheet: the engine walks on arrows and acts on Enter at the document level */
    wrap.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'Tab') {
        var f = wrap.querySelectorAll('button'), first = f[0], last = f[f.length - 1];
        if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    draw();
    doc.body.appendChild(wrap);
    var app = doc.querySelector('.app');
    if (app) { appInert = app.inert; app.inert = true; }
    if (btn) btn.setAttribute('aria-expanded', 'true');
    wrap.querySelector('.map-close').focus();
  }
  function close() {
    if (!wrap) return;
    wrap.remove(); wrap = null;
    var app = doc.querySelector('.app');
    if (app) app.inert = appInert;
    if (btn) btn.setAttribute('aria-expanded', 'false');
    var back = opener && doc.contains(opener) && opener !== doc.body ? opener : btn;
    if (back && back.focus) back.focus();
    opener = null;
  }
  function go(pin) {
    if (!pin) return;
    var a = api();
    travel(pin, a, close, function (move) {
      var sc = doc.getElementById('scene'), name = function () { var s = W.SCENES[a.scene()]; if (s) a.toast(s.name, 1400); };
      if (reduced() || !sc) { move(); name(); return; }
      sc.classList.add('fading'); /* the same fade the doors use */
      setTimeout(function () { move(); name(); sc.classList.remove('fading'); }, 320);
    });
  }

  /* ---------- the round button on the scene and the More menu entry ---------- */
  function mount() {
    var app = doc.querySelector('.app');
    if (!app || doc.getElementById('mapBtn')) return;
    btn = doc.createElement('button');
    btn.type = 'button'; btn.id = 'mapBtn'; btn.className = 'map-btn';
    btn.setAttribute('aria-haspopup', 'dialog'); btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = icon('map') + '<span>Map</span>';
    btn.addEventListener('click', function (e) { e.stopPropagation(); open(); });
    app.appendChild(btn);
  }
  mount();
  root.EbbGame.registerPanel({ id: 'map', label: 'Map', open: function () { open(); } });
  EbbMap.open = open; EbbMap.close = close; EbbMap.isOpen = function () { return !!wrap; }; EbbMap.go = go;
})(typeof window !== 'undefined' ? window : globalThis);
