/* Ebb Flower Dome: the Gardens by the Bay glasshouse, a seed stall that takes points, and the points themselves.
 * Points come from logging (js/dome/rules.js, pure): the ledger is rebuilt from the saved data on load, after every
 * save and on a slow poll, so it never depends on catching an event. A Points counter sits in the top bar beside
 * Hearts. The stall sells the farm's own crops; a bought seed lands in state.farm.seeds like the shed's free ones, and
 * the shed keeps handing out its three a day. Hearts are never read or written here. The place was read off the
 * plate (art/raw/sg_flowerdome.png, 768x1344) on a 5 percent grid: x 0..100 across, y 0..175 down. */
(function (root) {
  'use strict';
  var W = root.EbbWorld;
  if (!W) return;

  /* ---------- the place ---------- */
  W.register('dome', { /* the glass roof across the top, tiered beds and clay baobabs along the back, a round bed with a tree in the middle, a bench on the left, the seed stall and its cart on the right, paving below, the glass doors at the bottom */
    name: 'Flower Dome', plate: 'art/plates/flowerdome.webp', aspect: [4, 7], indoor: true, depth: [80, 0.2, 134, 0.3], surface: 'tile', sound: 'room',
    lamps: [{ x: 50, y: 20 }], windows: [{ x: 50, y: 30, rx: 40, ry: 16 }],
    soundSources: { birds: [[14, 44, 40], [84, 44, 40]], hush: [[50, 128, 24]] }, /* birds in the baobabs; the doors are hushed */
    floor: [[8, 78], [96, 78], [96, 134], [4, 134]],
    /* left shrubs, bench, the round bed (its upper half and the narrower lower rim), the stall, its steps, the seed cart, the rope and lavender on the left, the pink topiary and hedge each side */
    solids: [[0, 76, 14, 90], [14, 76, 29, 89], [23, 76, 68, 94], [27, 94, 64, 101], [64, 76, 100, 114], [63, 114, 83, 118], [52, 97, 68, 116], [0, 99, 25, 120], [0, 110, 20, 134], [75, 114, 100, 134]],
    doors: [{ id: 'toMerlion', rect: [34, 128, 66, 134], to: 'merlion', arrive: { x: 40, y: 136 }, label: 'Out to Merlion Park' }],
    spots: [
      { id: 'stall', kind: 'seedshop', at: { x: 82, y: 100 }, stand: { x: 71, y: 122 }, label: 'Seeds for your garden' },
      { id: 'bench', kind: 'cushion', at: { x: 22, y: 84 }, stand: { x: 18, y: 93 }, label: 'Sit among the flowers' }
    ],
    start: { x: 50, y: 118 }
  });
  /* the open paving at the right edge of the promenade, past the railing and in front of the notice board; the lamp stands below it */
  W.addDoor('merlion', { id: 'toDome', rect: [86.5, 122.5, 94, 127.5], to: 'dome', arrive: { x: 50, y: 118 }, label: 'To the Flower Dome' });

  var doc = root.document;
  if (!doc || !root.EbbGame) return; /* the node harness stops here */

  /* rules load as their own file; the load event waits for them, so they are here before the game boots */
  if (!root.EbbDomeRules) { var sc = doc.createElement('script'); sc.src = 'js/dome/rules.js'; sc.async = false; doc.head.appendChild(sc); }
  function R() { return root.EbbDomeRules; }
  var S = root.EbbStore, F = root.EbbFarm, api = null, syncing = false, pollTimer = 0, noteTimer = 0, pendingNote = 0;

  /* ---------- the ledger follows the data ---------- */
  function sync(quiet) {
    if (!api || !R() || syncing) return null;
    syncing = true;
    var r = null;
    try {
      r = R().recompute(api.state(), api.today());
      if (r.added.length) { S.save(); api.refresh(); }
      if (r.gained > 0 && !quiet) note(r.gained);
    } catch (e) { console.error(e); }
    syncing = false;
    return r;
  }
  function note(n) { /* one quiet line after the engine's own toast has had its moment */
    pendingNote += n;
    if (noteTimer) return;
    noteTimer = setTimeout(function () {
      noteTimer = 0; var k = pendingNote; pendingNote = 0;
      api.toast(k + ' points for logging. Seeds are at the Flower Dome.', 2600);
      try { if (root.EbbSound && typeof root.EbbSound.play === 'function') root.EbbSound.play('chime'); } catch (e) { }
    }, 2200);
  }
  /* every save (the engine's, any extension's) is followed by a recompute; the recompute's own save does not loop */
  if (S && typeof S.save === 'function' && !S._domeWrapped) {
    var origSave = S.save;
    S.save = function () { var ok = origSave.apply(S, arguments); if (!syncing) sync(); return ok; };
    S._domeWrapped = true;
  }

  /* ---------- a small sheet (same look as the engine's) ---------- */
  var openSheet = null;
  function sheet(title, build, onClose) {
    if (openSheet) openSheet();
    var wrap = doc.createElement('div'); wrap.className = 'sheet-wrap dome-wrap';
    wrap.innerHTML = '<section class="sheet dome" role="dialog" aria-modal="true" aria-label="' + title + '"><h2>' + title + '</h2><div class="sheet-body"></div><div class="sheet-actions"></div></section>';
    var body = wrap.querySelector('.sheet-body'), acts = wrap.querySelector('.sheet-actions');
    function close() { if (!wrap.parentNode) return; wrap.remove(); if (openSheet === close) openSheet = null; if (onClose) onClose(); }
    var b = doc.createElement('button'); b.type = 'button'; b.className = 'btn primary'; b.id = 'domeClose'; b.textContent = 'Close';
    b.addEventListener('click', close); acts.appendChild(b);
    wrap.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Escape') close(); });
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    doc.body.appendChild(wrap); openSheet = close;
    build(body);
    b.focus();
    return close;
  }
  function el(tag, cls, text) { var n = doc.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }

  /* ---------- the seed stall ---------- */
  var SEED_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 20c-4.2 0-7-2.8-7-7 0-4.6 3.4-8.6 7-10 3.6 1.4 7 5.4 7 10 0 4.2-2.8 7-7 7Z" fill="var(--seed, #d9b37a)" stroke="rgba(60,40,20,0.28)" stroke-width="0.9"/><path d="M12 20V9" stroke="#fffaf3" stroke-width="1.6" stroke-linecap="round"/></svg>';
  function openStall() {
    sync(true);
    sheet('Seed stall', function (body) {
      function draw(line) {
        body.innerHTML = '';
        var st = api.state(), have = R().balance(st.points);
        var bal = el('p', 'dome-balance'); bal.innerHTML = 'Your points <b id="domePoints"></b>'; bal.querySelector('b').textContent = String(have);
        body.appendChild(bal);
        if (line) body.appendChild(el('p', 'dome-said', line));
        var list = el('ul', 'dome-list');
        R().catalog(F.CROPS).forEach(function (row) {
          var li = el('li', 'dome-item'); li.dataset.crop = row.crop;
          var icon = el('span', 'dome-icon'); icon.innerHTML = SEED_ICON; icon.style.setProperty('--seed', F.CROPS[row.crop].colour || '#d9b37a'); li.appendChild(icon);
          var text = el('span', 'dome-text'); text.appendChild(el('b', '', row.name + ' seed'));
          var owned = st.farm && st.farm.seeds && st.farm.seeds[row.crop] || 0;
          text.appendChild(el('small', '', row.price + ' points' + (owned ? ', you have ' + owned : ''))); li.appendChild(text);
          var short = have < row.price, b = el('button', 'btn dome-buy', short ? 'Not yet' : 'Buy'); b.type = 'button'; b.id = 'buy-' + row.crop;
          b.setAttribute('aria-label', (short ? 'Not enough points for a ' : 'Buy a ') + row.name.toLowerCase() + ' seed, ' + row.price + ' points');
          if (short) { b.disabled = true; li.classList.add('short'); li.appendChild(el('small', 'dome-short', R().shortLine(row.price - have))); }
          b.addEventListener('click', function () {
            focusCrop = row.crop;
            var res = R().buy(api.state(), row.crop, api.today(), F.CROPS);
            if (!res.ok) { draw(res.reason === 'short' ? R().shortLine(res.need) : 'That one is not on the shelf.'); return; }
            S.save(); api.refresh();
            try { if (root.EbbSound && typeof root.EbbSound.play === 'function') root.EbbSound.play('chime'); } catch (e) { }
            draw('A ' + row.name.toLowerCase() + ' seed, wrapped in paper. It is in your seeds for the garden.');
          });
          li.appendChild(b);
          list.appendChild(li);
        });
        body.appendChild(list);
        body.appendChild(el('p', 'muted dome-earn', R().EARN_LINE));
        body.appendChild(el('p', 'muted dome-shed', 'The garden shed still gives three free seeds a day.'));
        /* a redraw replaces the button she tapped: keep the keyboard inside the sheet so Escape and Tab still work */
        var keep = focusCrop && body.querySelector('#buy-' + focusCrop), fallback = doc.getElementById('domeClose');
        if (keep && !keep.disabled) keep.focus(); else if (fallback && focusCrop) fallback.focus();
        focusCrop = null;
      }
      var focusCrop = null;
      draw();
    });
  }
  root.EbbGame.registerKind('seedshop', function (spot, a) { api = api || a; openStall(); });

  /* ---------- wiring ---------- */
  function start(a) {
    api = a;
    root.EbbGame.registerHud('Points', function () { return R() ? R().balance(a.state().points) : 0; });
    sync(true); /* what she already saved counts from the first open, with no fanfare */
    pollTimer = setInterval(function () { if (!doc.hidden) sync(); }, 3000);
    doc.addEventListener('visibilitychange', function () { if (!doc.hidden) sync(); });
  }
  doc.addEventListener('ebb:ready', function (e) { start(e.detail || root.EbbGame.api); });
  if (root.EbbGame._ready) start(root.EbbGame.api);

  root.EbbDome = { open: openStall, sync: function () { return sync(true); }, rules: R };
})(typeof window !== 'undefined' ? window : globalThis);
