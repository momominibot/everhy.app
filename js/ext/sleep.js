/* Ebb sleep workstream: tapping the bed lets her tuck in. Her sprite hides, the bed with her asleep under the blanket
 * (cut from the sleep render) is drawn in the props layer, the room dims a little, and a small Good night sheet offers
 * to log last night's sleep (the log extension's own pop-up) or to get up. Walking taps are ignored while she is in bed
 * (the engine's sitting state), and any scene change gets her up. Rules live in js/sleep/rules.js. */
(function (root) {
  'use strict';
  var doc = root.document;
  if (!doc || !root.EbbGame) return;

  ['js/sleep/rules.js'].forEach(function (src) { /* loads before the game boots: scripts added before the load event run first */
    if (doc.querySelector('script[src="' + src + '"]')) return;
    var s = doc.createElement('script'); s.src = src; s.async = false; doc.head.appendChild(s);
  });
  function R() { return root.EbbSleepRules; }

  var ART = 'art/overlays/bedroom-asleep.webp';
  var state = 'up', bed = null, api = null, wrap = null, dim = null, watch = 0;

  function el(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }
  function inBed() { return state === R().STATES.inBed; }

  /* ---------- the room while she sleeps: a multiply veil inside #stage, over the plate and the layer, so it moves with the camera ---------- */
  function dimmer() {
    if (dim) return dim;
    var stage = doc.getElementById('stage'); if (!stage) return null;
    dim = el('div', 'sleep-dim'); stage.appendChild(dim);
    return dim;
  }
  function setDim(on) {
    var d = dimmer(); if (d) d.classList.toggle('on', !!on);
    var sc = doc.getElementById('scene'); if (sc) sc.classList.toggle('ebb-asleep', !!on);
  }

  /* ---------- the Good night sheet ---------- */
  function show() {
    close();
    wrap = el('div', 'sheet-wrap sleep-wrap');
    wrap.addEventListener('keydown', function (e) { e.stopPropagation(); });
    wrap.addEventListener('click', function (e) { e.stopPropagation(); });
    var sh = el('section', 'sheet sleep-sheet'); sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-label', 'Good night');
    sh.appendChild(el('h2', '', 'Good night'));
    var body = el('div', 'sheet-body sleep-body');
    body.appendChild(el('p', '', 'Tucked in. Rest here as long as you like.'));
    sh.appendChild(body);
    var bar = el('div', 'sheet-actions');
    var up = el('button', 'btn', 'Get up'); up.type = 'button'; up.dataset.act = 'getup';
    up.addEventListener('click', function () { getUp('getUp'); });
    var log = el('button', 'btn primary', 'Log last night’s sleep'); log.type = 'button'; log.dataset.act = 'log';
    log.addEventListener('click', openLog);
    bar.appendChild(up); bar.appendChild(log); sh.appendChild(bar);
    wrap.appendChild(sh); root.EbbMount(wrap);
    log.focus();
  }
  function close() { if (wrap) { wrap.remove(); wrap = null; } }
  function sheetOpen() { return !!wrap && doc.body.contains(wrap); } /* the sheet counts as open only while it is in the page */

  /* the log extension's own sleep pop-up, through the engine with the same spot (only its kind differs); when it
   * closes and she is still in bed, the Good night sheet comes back so she can get up */
  function openLog() {
    close();
    if (!root.EbbLog) { api.toast('The log is not here yet'); show(); return; }
    root.EbbGame.act({ spot: R().logSpot(bed) });
  }
  function logOpen() { return !!doc.querySelector('.ebb-log'); }

  /* ---------- in and out of bed ---------- */
  function tuck(spot, a) {
    api = a;
    if (inBed()) { show(); return; }
    if (!R().overlayRect(spot)) { api.toast('A soft place to rest.'); return; } /* a rearranged room has no painted bed to lie in */
    bed = spot; state = R().next(state, 'tuck');
    api.sit(R().lieAt(spot)); /* parks her: taps on the floor do nothing while she sleeps */
    setDim(true); api.refresh();
    show();
    clearInterval(watch); watch = setInterval(tick, 250);
  }
  function getUp(why) {
    if (!inBed()) return;
    state = R().next(state, why || 'getUp');
    clearInterval(watch); watch = 0;
    close(); setDim(false);
    if (why === 'getUp' && root.EbbRoutines && root.EbbRoutines.prompt) setTimeout(function () { root.EbbRoutines.prompt(); }, 900); /* up in the morning: the routine card and Erin's hello */
    var me = api.me(), sp = bed; bed = null;
    if (why !== 'scene' && why !== 'stood' && sp) { api.stand(sp.stand.y); me.x = sp.stand.x; me.y = sp.stand.y; } /* beside the bed, where the walk ended */
    api.refresh();
  }
  /* she is only in bed while the bedroom is the scene and the engine still has her sitting (a door, Decorate or
   * anything else that stood her up ends it); and the sheet returns once the log closes */
  function tick() {
    if (!inBed()) { clearInterval(watch); watch = 0; return; }
    if (api.scene() !== 'bedroom') { getUp('scene'); return; }
    if (api.me().action !== 'sit') { getUp('stood'); return; }
    if (!sheetOpen() && !doc.querySelector('.sheet-wrap, .ebb-log') && !(root.EbbUi && root.EbbUi.modalOpen())) show(); /* never over another sheet */
  }

  /* the bed with her under the blanket, drawn where the painting's bed is, behind the arch door cut-out */
  root.EbbGame.registerProps('bedroom', function () {
    if (!inBed() || !bed) return '';
    var r = R().overlayRect(bed); if (!r) return '';
    return '<image class="sleep-overlay" href="' + ART + '" x="' + r[0] + '" y="' + r[1] + '" width="' + (r[2] - r[0]) + '" height="' + (r[3] - r[1]) + '" preserveAspectRatio="none"/>';
  });
  root.EbbGame.registerKind('sleep', tuck);
  root.EbbSleep = { inBed: inBed, getUp: function () { getUp('getUp'); }, state: function () { return state; } };
})(window);
