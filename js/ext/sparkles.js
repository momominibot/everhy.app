/* Ebb sparkles: a small twinkling yellow diamond over everything she can tap (every spot of every scene), so players know
 * what to tap. Hidden for the spot she is standing at (its own prompt shows) and still under reduced motion. Arriving at
 * a place whose best thing is far off (the jetty's fishing end) gives a one-line hint. */
(function (root) {
  'use strict';
  var doc = root.document, W = root.EbbWorld, G = root.EbbGame;
  if (!doc || !W || !G) return;
  function f(v) { return v.toFixed(2); }
  function star(x, y, s, i) {
    var p = 'M0 -1.6 Q0.28 -0.28 1.6 0 Q0.28 0.28 0 1.6 Q-0.28 0.28 -1.6 0 Q-0.28 -0.28 0 -1.6Z';
    return '<g class="sparkle" transform="translate(' + f(x) + ' ' + f(y) + ') scale(' + f(s) + ')"><path class="sparkle-star" style="animation-delay:-' + (i * 0.37 % 1.8).toFixed(2) + 's" d="' + p + '"/></g>';
  }
  function drawerFor(id) {
    return function (api, near) {
      var sc = W.SCENES[id]; if (!sc || !sc.spots) return '';
      var tall = W.units(sc) > 110, s = tall ? 1 : 0.8, lift = tall ? 4.5 : 3.5, out = '';
      sc.spots.forEach(function (sp, i) {
        if (sp.hidden || (near && near.spot === sp)) return;
        out += star(sp.at.x, sp.at.y - lift, s, i);
      });
      return out;
    };
  }
  var HINTS = { fish: 'Follow the yellow sparkle to the end of the jetty to fish.' };
  var done = {}, last = null;
  function start() {
    Object.keys(W.SCENES).forEach(function (id) { G.registerProps(id, drawerFor(id)); });
    G.api.refresh();
    setInterval(function () {
      var id = G.api.scene(); if (id === last) return; last = id;
      var sc = W.SCENES[id]; if (!sc || !sc.spots || done[id]) return;
      var hint = sc.spots.map(function (sp) { return HINTS[sp.kind]; }).filter(Boolean)[0];
      if (hint) { done[id] = 1; setTimeout(function () { G.api.toast(hint, 3600); }, 1200); }
    }, 500);
  }
  doc.addEventListener('ebb:ready', start);
  if (G._ready) start();
})(typeof window !== 'undefined' ? window : globalThis);
