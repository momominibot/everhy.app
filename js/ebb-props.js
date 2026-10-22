/* Ebb props: flat shapes drawn over the painted plates, in scene percent. Pure string builders. */
(function (root) {
  'use strict';
  var F = root.EbbFarm;

  function bed(b, x, y, today, near) {
    var w = 12, h = 6.4, x0 = x - w / 2, y0 = y - h / 2, out = '';
    var wet = b.state === 'planted' && F.wateredToday(b, today);
    var soil = b.state === 'grass' ? '#9fb87f' : wet ? '#8a5a3c' : '#b98258';
    out += '<rect x="' + x0 + '" y="' + y0 + '" width="' + w + '" height="' + h + '" rx="1.6" fill="' + soil + '"/>';
    if (b.state === 'grass') {
      for (var i = 0; i < 5; i++) out += '<path d="M' + (x0 + 1.5 + i * 2.2) + ' ' + (y0 + 4.6) + ' l0.6 -2 l0.6 2" fill="#7f9f63"/>';
    } else {
      for (var r = 0; r < 3; r++) out += '<rect x="' + (x0 + 1) + '" y="' + (y0 + 1.2 + r * 1.8) + '" width="' + (w - 2) + '" height="0.5" rx="0.25" fill="' + (wet ? '#6f4630' : '#a06f4a') + '"/>';
    }
    if (b.state === 'planted') out += crop(b.crop, F.stage(b, today), x, y0 + 3.4);
    if (near) out += '<rect x="' + (x0 - 0.8) + '" y="' + (y0 - 0.8) + '" width="' + (w + 1.6) + '" height="' + (h + 1.6) + '" rx="2.2" fill="none" stroke="#fff6e8" stroke-width="0.5" stroke-dasharray="1.2 0.9"/>';
    return '<g class="bed">' + out + '</g>';
  }

  function crop(kind, stage, x, y) {
    var c = F.CROPS[kind], out = '';
    var xs = [x - 3.4, x, x + 3.4];
    xs.forEach(function (px) {
      if (stage === 0) out += '<circle cx="' + px + '" cy="' + y + '" r="0.5" fill="#6f4630"/>';
      else if (stage === 1) out += '<path d="M' + px + ' ' + y + ' q-1 -1.6 -1.8 -1.2 q0.8 1 1.8 1.2 q1 -1.6 1.8 -1.2 q-0.8 1 -1.8 1.2" fill="' + c.leaf + '"/>';
      else if (stage === 2) out += '<path d="M' + px + ' ' + y + ' q-1.6 -2.6 -2.6 -1.8 q1 1.6 2.6 1.8 q1.6 -2.6 2.6 -1.8 q-1 1.6 -2.6 1.8 M' + px + ' ' + y + ' l0 -2.4" stroke="' + c.leaf + '" stroke-width="0.4" fill="' + c.leaf + '"/>';
      else if (stage === 3) out += '<path d="M' + px + ' ' + y + ' q-2 -3.6 -3.2 -2.4 q1.2 2 3.2 2.4 q2 -3.6 3.2 -2.4 q-1.2 2 -3.2 2.4" fill="' + c.leaf + '"/><rect x="' + (px - 0.3) + '" y="' + (y - 3.6) + '" width="0.6" height="3.6" fill="' + c.leaf + '"/>';
      else if (stage === 'ripe') {
        if (kind === 'sunflower') out += '<rect x="' + (px - 0.3) + '" y="' + (y - 5) + '" width="0.6" height="5" fill="' + c.leaf + '"/><circle cx="' + px + '" cy="' + (y - 5.4) + '" r="1.7" fill="' + c.colour + '"/><circle cx="' + px + '" cy="' + (y - 5.4) + '" r="0.7" fill="#7a5532"/>';
        else out += '<path d="M' + px + ' ' + (y - 1) + ' q-1.8 -3 -2.8 -2 q1 1.6 2.8 2 q1.8 -3 2.8 -2 q-1 1.6 -2.8 2" fill="' + c.leaf + '"/><ellipse cx="' + px + '" cy="' + (y + 0.2) + '" rx="1.3" ry="1.1" fill="' + c.colour + '"/>';
      }
    });
    return out;
  }

  function cushion(x, y, near) {
    return '<ellipse cx="' + x + '" cy="' + (y + 0.6) + '" rx="5.4" ry="1.6" fill="rgba(60,40,30,0.14)"/>' +
      '<ellipse cx="' + x + '" cy="' + y + '" rx="5" ry="1.9" fill="#e9806f"/><ellipse cx="' + x + '" cy="' + (y - 0.5) + '" rx="4" ry="1.1" fill="#f29c8c"/>' +
      (near ? '<ellipse cx="' + x + '" cy="' + y + '" rx="6.4" ry="2.8" fill="none" stroke="#fff6e8" stroke-width="0.45" stroke-dasharray="1.1 0.9"/>' : '');
  }

  function shimmer(f) { /* falling light over the painted waterfall; f = { x, y0, x1, y1 } */
    f = f || { x: 50.5, y0: 40, x1: 60, y1: 57 };
    var out = '';
    for (var i = 0; i < 7; i++) {
      var x = f.x + i * (f.x1 - f.x) / 6;
      out += '<line class="fall" x1="' + x + '" y1="' + f.y0 + '" x2="' + x + '" y2="' + f.y1 + '" stroke="#ffffff" stroke-width="0.35" stroke-dasharray="2 5" style="animation-delay:-' + (i * 0.37).toFixed(2) + 's"/>';
    }
    return '<g opacity="0.55">' + out + '</g>';
  }

  function goddess(x, y) { /* a soft figure of light above the pond */
    return '<g class="goddess"><circle cx="' + x + '" cy="' + (y - 6) + '" r="11" fill="url(#halo)"/>' +
      '<path d="M' + (x - 5) + ' ' + y + ' Q' + x + ' ' + (y - 16) + ' ' + (x + 5) + ' ' + y + ' Z" fill="#f6f1e4" opacity="0.92"/>' +
      '<circle cx="' + x + '" cy="' + (y - 13) + '" r="2.4" fill="#f6f1e4"/>' +
      '<path d="M' + (x - 3) + ' ' + (y - 14) + ' Q' + x + ' ' + (y - 19) + ' ' + (x + 3) + ' ' + (y - 14) + ' L' + (x + 4) + ' ' + (y - 6) + ' L' + (x - 4) + ' ' + (y - 6) + ' Z" fill="#7fb7b0" opacity="0.85"/></g>';
  }

  function sparkles(x, y, n) {
    var out = '';
    for (var i = 0; i < n; i++) {
      var dx = (i % 5 - 2) * 2.4 + (i * 7 % 3) * 0.6;
      out += '<circle class="spark" cx="' + (x + dx) + '" cy="' + y + '" r="' + (0.4 + (i % 3) * 0.2) + '" fill="#fff4cf" style="animation-delay:' + (i * 0.12).toFixed(2) + 's"/>';
    }
    return out;
  }

  root.EbbProps = { bed: bed, crop: crop, cushion: cushion, shimmer: shimmer, goddess: goddess, sparkles: sparkles };
})(typeof window !== 'undefined' ? window : globalThis);
