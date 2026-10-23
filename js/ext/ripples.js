/* Ebb ripples: tap the water and soft rings spread out with a little plop. A scene opts in with `water`, a list of
 * polygons in scene units (x 0..100, y 0..units). The tap still goes on to the engine as usual. Off under reduced
 * motion. */
(function (root) {
  'use strict';
  var doc = root.document, W = root.EbbWorld, NS = 'http://www.w3.org/2000/svg';
  function inside(poly, x, y) { /* even-odd ray cast */
    var c = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var a = poly[i], b = poly[j];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }
  root.EbbRipples = { inside: inside };
  if (!doc || !W || !root.EbbGame) return;
  function still() { return doc.documentElement.getAttribute('data-motion') === 'reduce' || (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function ripple(x, y) {
    var layer = doc.getElementById('layer'); if (!layer) return;
    var g = doc.createElementNS(NS, 'g'); g.setAttribute('class', 'ripple'); g.setAttribute('transform', 'translate(' + x.toFixed(2) + ' ' + y.toFixed(2) + ')');
    for (var i = 0; i < 3; i++) {
      var e = doc.createElementNS(NS, 'ellipse'); e.setAttribute('rx', '1'); e.setAttribute('ry', '0.42'); e.style.animationDelay = (i * 0.22) + 's'; g.appendChild(e);
    }
    var under = doc.getElementById('props'); /* on the water: under the props, her and the cut-outs */
    if (under && under.parentNode === layer) layer.insertBefore(g, under); else layer.appendChild(g);
    setTimeout(function () { g.remove(); }, 2000);
    if (root.EbbSound && root.EbbSound.play) root.EbbSound.play('plop');
  }
  doc.addEventListener('pointerdown', function (e) {
    var api = root.EbbGame.api, sc = api && W.SCENES[api.scene()], stage = doc.getElementById('stage');
    if (!sc || !sc.water || !stage || still() || (e.target.closest && e.target.closest('.sheet-wrap, .top, button, .map-wrap'))) return;
    var r = stage.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 100, y = (e.clientY - r.top) / r.height * W.units(sc);
    if (sc.water.some(function (p) { return inside(p, x, y); })) ripple(x, y);
  }, true);
  root.EbbRipples.ripple = ripple;
})(typeof window !== 'undefined' ? window : globalThis);
