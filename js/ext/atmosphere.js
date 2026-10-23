/* Ebb atmosphere extension: clean, targeted water animation. Only the waterfall area animates (flowing streams +
 * pond ripples). No floating particles, no mist, no sparkles. The rest of every scene is completely static.
 * (A full-scene video plate was tried and dropped: it moved everything.) */
(function (root) {
  'use strict';
  var doc = root.document;
  if (!doc || !root.EbbGame) return;

  var W = root.EbbWorld, G = root.EbbGame;

  function rnd(seed) { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }

  /* ---------- waterfall: only flowing water streams + pond ripples ---------- */
  function waterfallAtmosphere() {
    var s = W.SCENES.waterfall;
    if (!s || !s.fall) return '';
    var f = s.fall;
    var out = '';
    var seed = 11;
    var midX = (f.x + f.x1) / 2;
    var fallW = f.x1 - f.x;

    /* clean white water streams falling down the cliff */
    for (var i = 0; i < 18; i++) {
      var x = f.x + rnd(seed++) * fallW;
      var w = 0.25 + rnd(seed++) * 0.5;
      var op = 0.3 + rnd(seed++) * 0.5;
      var dur = (0.7 + rnd(seed++) * 0.8).toFixed(2);
      var delay = (rnd(seed++) * -1.5).toFixed(2);
      out += '<line class="atmo-stream" x1="' + x.toFixed(1) + '" y1="' + f.y0 + '" x2="' + x.toFixed(1) + '" y2="' + f.y1 +
        '" stroke="#ffffff" stroke-width="' + w.toFixed(2) + '" opacity="' + op.toFixed(2) +
        '" style="animation-duration:' + dur + 's;animation-delay:' + delay + 's"/>';
    }

    /* soft white glow where water falls */
    out += '<ellipse cx="' + midX + '" cy="' + ((f.y0 + f.y1) / 2) + '" rx="' + (fallW * 0.5) + '" ry="' + ((f.y1 - f.y0) * 0.4) +
      '" fill="#ffffff" opacity="0.1"/>';

    /* pond ripples expanding outward */
    for (var k = 0; k < 4; k++) {
      var rx = 3 + k * 2.5;
      out += '<ellipse class="atmo-ripple" cx="' + midX + '" cy="100" rx="' + rx + '" ry="' + (rx * 0.28) +
        '" fill="none" stroke="#e8f8f5" stroke-width="0.4" style="animation-duration:' + (2.0 + k * 0.4).toFixed(2) + 's;animation-delay:' + (k * -0.6).toFixed(2) + 's"/>';
    }

    return '<g class="atmo-waterfall">' + out + '</g>';
  }

  G.registerProps('waterfall', function () { return root.EbbLive && root.EbbLive.active() ? '' : waterfallAtmosphere(); }); /* drawn water only while the live plate is not playing */

  root.EbbAtmosphere = { version: '2.1' };
})(typeof window !== 'undefined' ? window : globalThis);
