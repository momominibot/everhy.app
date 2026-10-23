/* Ebb props: things drawn over the painted plates, in scene percent. Pure string builders. Clay Seedream strips
 * (art/props/<name>.webp, metadata in EbbPropSprites) are used when shipped; the flat shapes are the fallback. */
(function (root) {
  'use strict';
  var F = root.EbbFarm, SP = root.EbbPropSprites || {};

  /* one frame of a prop strip, centred on cx with its bottom at `bottom`, cell drawn `width` units wide */
  function sprite(name, frame, cx, bottom, width, cls) {
    var m = SP[name]; if (!m) return '';
    var h = width * m.h / m.w;
    return '<svg' + (cls ? ' class="' + cls + '"' : '') + ' x="' + (cx - width / 2).toFixed(2) + '" y="' + (bottom - h).toFixed(2) + '" width="' + width.toFixed(2) +
      '" height="' + h.toFixed(2) + '" viewBox="' + (frame * m.w) + ' 0 ' + m.w + ' ' + m.h + '" preserveAspectRatio="none"><image href="art/' + (m.dir || 'props') + '/' + name +
      '.webp" width="' + (m.w * m.frames) + '" height="' + m.h + '"/></svg>';
  }
  /* the box a piece of furniture is drawn in: [x0, y0, x1, y1] in scene units, from its catalogue size and its frame's own pixel box */
  function furnitureBox(p, cat) {
    var m = SP[cat.sheet]; if (!m) return null;
    var bw = m.boxes && m.boxes[cat.frame] ? m.boxes[cat.frame][0] : m.w, cell = cat.size * m.w / bw, h = cell * m.h / m.w;
    return [p.x - cell / 2, p.y + 1 - h, p.x + cell / 2, p.y + 1];
  }
  function furniture(p, cat, opts) { /* opts: near, ghost, bad */
    var b = furnitureBox(p, cat); if (!b) return '';
    var w = b[2] - b[0], cls = 'furn' + (opts && opts.ghost ? ' ghost' : '') + (opts && opts.bad ? ' bad' : '');
    var inner = sprite(cat.sheet, cat.frame, p.x, b[3], w, cls);
    if (p.flip) inner = '<g transform="translate(' + (2 * p.x).toFixed(2) + ' 0) scale(-1 1)">' + inner + '</g>';
    if (opts && opts.near) inner += '<ellipse cx="' + p.x + '" cy="' + (p.y + 0.6) + '" rx="' + (Math.max(cat.foot[0], 6) / 2 + 1).toFixed(2) + '" ry="2.2" fill="none" stroke="#fff6e8" stroke-width="0.5" stroke-dasharray="1.2 0.9"/>';
    if (opts && opts.ghost) inner += '<rect x="' + (p.x - cat.foot[0] / 2) + '" y="' + (p.y - cat.foot[1]) + '" width="' + cat.foot[0] + '" height="' + Math.max(cat.foot[1], 1.5) + '" rx="1" fill="' + (opts.bad ? 'rgba(220,80,80,0.35)' : 'rgba(120,200,160,0.35)') + '"/>';
    return '<g class="piece" data-uid="' + p.uid + '">' + inner + '</g>';
  }
  var STAGE_FRAME = { 0: 0, 1: 1, 2: 2, 3: 3, ripe: 4 };

  /* a bed painted into the farm plate: only what changes is drawn over it (grass tufts, wet soil, the crops) */
  function paintedBed(b, x, y, w, today, near) {
    var out = '', wet = b.state === 'planted' && F.wateredToday(b, today), h = w * 0.42;
    if (b.state === 'grass') for (var i = 0; i < 6; i++) out += '<path d="M' + (x - w * 0.36 + i * w * 0.145) + ' ' + (y + 1.5) + ' l0.9 -3.2 l0.9 3.2 M' + (x - w * 0.33 + i * w * 0.145) + ' ' + (y + 2) + ' l0.7 -2.4 l0.7 2.4" fill="#8fb46f"/>';
    if (wet) out += '<ellipse cx="' + x + '" cy="' + y + '" rx="' + (w * 0.4) + '" ry="' + (h * 0.38) + '" fill="rgba(70,40,25,0.42)"/>';
    if (b.state === 'planted' && SP[b.crop]) {
      var m = SP[b.crop], ch = w * 0.34;
      /* three plants standing in the soil itself: bases a little above the bed's centre line, the middle one a touch nearer */
      [-0.27, 0, 0.27].forEach(function (k, i) { out += sprite(b.crop, STAGE_FRAME[F.stage(b, today)] || 0, x + k * w, y - h * 0.12 + (i === 1 ? h * 0.18 : 0), ch * m.w / m.h); });
    }
    if (near) out += '<ellipse cx="' + x + '" cy="' + y + '" rx="' + (w / 2 + 1) + '" ry="' + (h / 2 + 1) + '" fill="none" stroke="#fff6e8" stroke-width="0.5" stroke-dasharray="1.2 0.9"/>';
    return '<g class="bed">' + out + '</g>';
  }
  function bed(b, x, y, today, near) {
    var w = 12, h = 6.4, x0 = x - w / 2, y0 = y - h / 2, out = '';
    var wet = b.state === 'planted' && F.wateredToday(b, today);
    if (SP.soil) {
      var sw = 12.5, sh = sw * SP.soil.h / SP.soil.w;
      out += sprite('soil', b.state === 'grass' ? 0 : wet ? 2 : 1, x, y + sh / 2, sw);
      if (b.state === 'planted' && SP[b.crop]) { var m = SP[b.crop], ch = 10.5; out += sprite(b.crop, STAGE_FRAME[F.stage(b, today)] || 0, x, y + 2.2, ch * m.w / m.h); }
      if (near) out += '<ellipse cx="' + x + '" cy="' + y + '" rx="' + (sw / 2 + 0.6) + '" ry="' + (sh / 2) + '" fill="none" stroke="#fff6e8" stroke-width="0.5" stroke-dasharray="1.2 0.9"/>';
      return '<g class="bed">' + out + '</g>';
    }
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
    if (SP.misc) return '<ellipse cx="' + x + '" cy="' + (y + 0.4) + '" rx="5.6" ry="1.5" fill="rgba(60,40,30,0.16)"/>' + sprite('misc', 0, x, y + 1.6, 10.5) +
      (near ? '<ellipse cx="' + x + '" cy="' + y + '" rx="6.6" ry="2.9" fill="none" stroke="#fff6e8" stroke-width="0.45" stroke-dasharray="1.1 0.9"/>' : '');
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
    if (SP.misc) return '<g class="goddess"><circle cx="' + x + '" cy="' + (y - 9) + '" r="13" fill="url(#halo)"/>' + sprite('misc', 1, x, y + 2, 14) + '</g>';
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

  root.EbbProps = { bed: bed, paintedBed: paintedBed, crop: crop, cushion: cushion, shimmer: shimmer, goddess: goddess, sparkles: sparkles, sprite: sprite, furniture: furniture, furnitureBox: furnitureBox };
})(typeof window !== 'undefined' ? window : globalThis);
