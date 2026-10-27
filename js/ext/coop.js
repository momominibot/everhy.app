/* Ebb chicken coop extension: a small hen yard beside the community garden. Three hens lay eggs each morning;
 * the eggs wait in the nesting box until she collects them, then they go into the basket to cook at the hot spring.
 * The coop is its own place, reached from the garden path; the egg rules live in js/world/rules.js. Nothing here is a chore. */
(function (root) {
  'use strict';
  var W = root.EbbWorld;
  if (!W) return;

  /* ---------- the chicken yard ---------- */
  W.register('coop', {
    name: 'Chicken coop', plate: 'art/plates/coop.webp', aspect: [4, 7], depth: [100, 0.22, 175, 0.33], surface: 'grass',
    floor: [[4, 114], [96, 114], [96, 175], [4, 175]],
    /* coop and hens, the two fence runs, the fruit tree, the water dish, the bushes and the corner plant */
    solids: [
      [32, 62, 86, 113], [2, 88, 40, 100], [75, 88, 98, 100], [2, 72, 16, 95],
      [13, 130, 29, 139], [0, 115, 16, 138], [68, 124, 100, 150], [0, 150, 16, 164]
    ],
    doors: [{ id: 'toFarm', rect: [30, 170, 60, 175], to: 'farm', arrive: { x: 43, y: 162 }, label: 'Back to the garden' }],
    spots: [
      { id: 'coop', kind: 'coop', at: { x: 50, y: 88 }, stand: { x: 50, y: 117 }, label: 'Collect eggs' }
    ],
    start: { x: 50, y: 160 }
  });
  /* a signpost on the garden path; tapping it walks there and opens the coop */
  W.SCENES.farm.spots.push({ id: 'toCoop', kind: 'toCoop', at: { x: 60, y: 150 }, stand: { x: 60, y: 158 }, label: 'Walk to the chicken coop' });

  var doc = root.document;
  if (!doc || !root.EbbGame) return; /* the node harness stops here */
  var G = root.EbbGame, R = root.EbbWorldRules;
  if (!R) { var sc = doc.createElement('script'); sc.src = 'js/world/rules.js'; sc.async = false; doc.head.appendChild(sc); }

  /* a signpost on the garden path (the spot does the work) */
  G.registerProps('farm', function () {
    var x = 60, y = 150, w = 15;
    return '<g class="coop-sign">' +
      '<rect x="' + (x - 0.4) + '" y="' + (y - 1) + '" width="0.8" height="7" fill="#9a7552"/>' +
      '<rect x="' + (x - w / 2) + '" y="' + (y - 3.6) + '" width="' + w + '" height="3.6" rx="0.9" fill="#d9b37a" stroke="#9a7552" stroke-width="0.3"/>' +
      '<text x="' + x + '" y="' + (y - 1.15) + '" font-size="2.1" font-weight="700" text-anchor="middle" fill="#5a3f2a">Hens &#8250;</text></g>';
  });

  /* ---------- a small sheet (the global sheet styles) ---------- */
  var openWrap = null;
  function p(text) { var el = doc.createElement('p'); el.textContent = text; return el; }
  function sheet(title, build) {
    if (openWrap) openWrap.remove();
    var wrap = doc.createElement('div'); wrap.className = 'sheet-wrap world-sheet';
    wrap.innerHTML = '<section class="sheet" role="dialog" aria-modal="true" aria-label="' + title + '">' +
      '<h2>' + title + '</h2><div class="sheet-body"></div><div class="sheet-actions"></div></section>';
    var body = wrap.querySelector('.sheet-body'), acts = wrap.querySelector('.sheet-actions');
    function close() { if (!wrap.parentNode) return; wrap.remove(); openWrap = null; }
    function buttons(list) {
      acts.innerHTML = '';
      list.forEach(function (a) {
        var b = doc.createElement('button'); b.type = 'button'; b.textContent = a.label;
        b.className = a.primary ? 'btn primary' : 'btn';
        if (a.id) b.id = a.id;
        b.addEventListener('click', a.fn); acts.appendChild(b);
      });
      var first = acts.querySelector('.btn.primary') || acts.querySelector('button'); if (first) first.focus();
    }
    wrap.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Escape') close(); });
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    doc.body.appendChild(wrap); openWrap = wrap;
    build(body, buttons, close);
  }
  function rolls() { return [Math.random(), Math.random(), Math.random()]; }

  /* ---------- walk the garden sign into the coop ---------- */
  G.registerKind('toCoop', function (spot, api) {
    api.enter('coop', { x: 50, y: 160 });
  });

  /* ---------- collect the eggs ---------- */
  G.registerKind('coop', function (spot, api) {
    function R0() { return root.EbbWorldRules; }
    function draw() {
      var day = api.today(), waiting = R0().coopAvailable(api.state().farm, day, rolls());
      sheet('Chicken coop', function (body, buttons, close) {
        if (waiting > 0) {
          body.appendChild(p(waiting + ' ' + (waiting === 1 ? 'egg waits' : 'eggs wait') + ' in the straw, warm and new.'));
          buttons([{ id: 'collectEggs', label: 'Collect ' + waiting + ' ' + (waiting === 1 ? 'egg' : 'eggs'), primary: true,
                     fn: function () { collect(waiting); } },
                   { label: 'Leave the coop', fn: close }]);
        } else {
          body.appendChild(p('The nesting box is empty. The hens will lay again in the morning.'));
          buttons([{ label: 'Leave the coop', primary: true, fn: close }]);
        }
      });
    }
    function collect(n) {
      R0().collectEggs(api.state().farm, api.today(), rolls());
      api.save(); api.refresh();
      sheet('Chicken coop', function (body, buttons, close) {
        body.appendChild(p(n + ' ' + (n === 1 ? 'egg is' : 'eggs are') + ' in your basket. ' + (n === 1 ? 'It' : 'They') + ' will cook soft in the hot spring.'));
        buttons([{ label: 'Leave the coop', primary: true, fn: close }]);
      });
    }
    draw();
  });
})(typeof window !== 'undefined' ? window : globalThis);
