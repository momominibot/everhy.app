/* Ebb puppet: the player drawn as a flat cut-out puppet in SVG. Every outfit is a set of colours and parts on the same
 * body, so a new top or hairstyle works in every view and pose at once. Pure: svg(outfit, pose) returns a string, so the
 * node harness can check it without a browser. Local units: feet at (0, 0), the head's top near y = -104. */
(function (root) {
  'use strict';

  var OUTFIT_DEFAULT = { skin: '#c68e6a', hair: '#3a2923', hairStyle: 'long', top: '#f2a39b', bottom: '#8fae8b',
    shoes: '#f3e9d6', headwear: 'none', headwearColour: '#5f8f8b' };

  var HAIR_STYLES = ['long', 'bob', 'bun'];
  var VIEWS = ['front', 'back', 'side'];

  function shade(hex, f) { /* darken (f < 1) or lighten (f > 1) a #rrggbb colour */
    var n = parseInt(String(hex).slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    function c(v) { return Math.max(0, Math.min(255, Math.round(f < 1 ? v * f : v + (255 - v) * (f - 1)))); }
    return '#' + ((1 << 24) + (c(r) << 16) + (c(g) << 8) + c(b)).toString(16).slice(1);
  }

  function safeColour(v, fallback) { return /^#[0-9a-fA-F]{6}$/.test(String(v)) ? v : fallback; }

  function clean(outfit) { /* never trust stored colours inside markup */
    var o = {}, k;
    for (k in OUTFIT_DEFAULT) o[k] = OUTFIT_DEFAULT[k];
    if (!outfit) return o;
    ['skin', 'hair', 'top', 'bottom', 'shoes', 'headwearColour'].forEach(function (key) { o[key] = safeColour(outfit[key], o[key]); });
    if (HAIR_STYLES.indexOf(outfit.hairStyle) >= 0) o.hairStyle = outfit.hairStyle;
    if (outfit.headwear === 'tudung' || outfit.headwear === 'none') o.headwear = outfit.headwear;
    return o;
  }

  function rect(x, y, w, h, r, fill, extra) {
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + r + '" fill="' + fill + '"' + (extra || '') + '/>';
  }
  function ell(cx, cy, rx, ry, fill, extra) {
    return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="' + fill + '"' + (extra || '') + '/>';
  }
  function g(transform, inner) { return '<g transform="' + transform + '">' + inner + '</g>'; }

  /* a limb swinging from its top joint */
  function limb(x, y, w, h, angle, fill) { return g('rotate(' + angle.toFixed(1) + ' ' + (x + w / 2) + ' ' + y + ')', rect(x, y, w, h, w / 2, fill)); }

  function covered(o) { return o.headwear === 'tudung'; }

  function hairBack(o, view) {
    if (covered(o)) return '';
    var h = o.hair;
    if (view === 'side') {
      if (o.hairStyle === 'long') return '<path d="M-14 -102 Q-30 -86 -24 -50 Q-14 -46 -4 -56 L2 -96 Z" fill="' + h + '"/>';
      if (o.hairStyle === 'bob') return '<path d="M-14 -102 Q-26 -88 -20 -70 Q-10 -66 -2 -74 L2 -96 Z" fill="' + h + '"/>';
      return ell(-16, -100, 8, 8, h);
    }
    if (o.hairStyle === 'long') return '<path d="M-22 -96 Q-30 -64 -24 -48 L24 -48 Q30 -64 22 -96 Z" fill="' + h + '"/>';
    if (o.hairStyle === 'bob') return '<path d="M-21 -96 Q-26 -78 -22 -68 L22 -68 Q26 -78 21 -96 Z" fill="' + h + '"/>';
    return view === 'back' ? ell(0, -106, 9, 8, h) : '';
  }

  function hairFront(o, view) {
    var h = o.hair;
    if (covered(o)) return '';
    if (view === 'back') {
      var hb = ell(0, -86, 18, 18, h);
      if (o.hairStyle === 'long') hb += '<path d="M-18 -86 Q-20 -60 -16 -50 L16 -50 Q20 -60 18 -86 Z" fill="' + h + '"/>';
      if (o.hairStyle === 'bob') hb += '<path d="M-18 -86 Q-20 -74 -17 -68 L17 -68 Q20 -74 18 -86 Z" fill="' + h + '"/>';
      if (o.hairStyle === 'bun') hb += ell(0, -106, 9, 8, h);
      return hb;
    }
    if (view === 'side') return '<path d="M-15 -94 Q-4 -110 12 -98 Q8 -92 0 -92 Q-8 -88 -15 -84 Z" fill="' + h + '"/>' +
      (o.hairStyle === 'bun' ? ell(-14, -104, 8, 7, h) : '');
    var fringe = '<path d="M-18 -88 Q-16 -106 0 -105 Q16 -106 18 -88 Q10 -96 0 -94 Q-10 -96 -18 -88 Z" fill="' + h + '"/>';
    var sides = o.hairStyle === 'long' ? rect(-21, -92, 6, 40, 3, h) + rect(15, -92, 6, 40, 3, h)
      : o.hairStyle === 'bob' ? rect(-20, -92, 5, 20, 2.5, h) + rect(15, -92, 5, 20, 2.5, h)
      : ell(0, -108, 9, 7, h);
    return sides + fringe;
  }

  function headwear(o, view) {
    if (!covered(o)) return '';
    var c = o.headwearColour, d = shade(c, 0.86);
    if (view === 'back') return '<path d="M-21 -88 Q-21 -108 0 -108 Q21 -108 21 -88 L24 -58 Q0 -50 -24 -58 Z" fill="' + c + '"/>';
    if (view === 'side') return '<path d="M-16 -88 Q-14 -108 2 -107 Q16 -104 15 -92 L13 -78 Q6 -70 4 -64 L-20 -58 Q-24 -74 -16 -88 Z" fill="' + c + '"/>' +
      '<path d="M4 -64 Q8 -60 16 -60 L-18 -56 Z" fill="' + d + '"/>';
    /* front: the cloth frames the face and falls over the shoulders; the face shows through an oval */
    return '<path d="M-22 -86 Q-22 -110 0 -110 Q22 -110 22 -86 L26 -56 Q0 -48 -26 -56 Z" fill="' + c + '"/>' +
      ell(0, -84, 13.5, 15, o.skin) + '<path d="M-13 -92 Q0 -100 13 -92 Q0 -96 -13 -92 Z" fill="' + d + '"/>';
  }

  function face(o, view) {
    var eye = '#2b2230', blush = '#f19a8f';
    if (view === 'back') return '';
    if (view === 'side') return ell(9, -84, 1.8, 2.4, eye) + ell(6, -77, 3, 1.8, blush, ' opacity="0.55"') +
      '<path d="M8 -73 Q11 -72 12 -74" stroke="' + eye + '" stroke-width="1.2" fill="none" stroke-linecap="round"/>';
    return ell(-6, -83, 2, 2.6, eye) + ell(6, -83, 2, 2.6, eye) +
      ell(-10, -77, 3.2, 2, blush, ' opacity="0.55"') + ell(10, -77, 3.2, 2, blush, ' opacity="0.55"') +
      '<path d="M-3.5 -74 Q0 -71 3.5 -74" stroke="' + eye + '" stroke-width="1.3" fill="none" stroke-linecap="round"/>';
  }

  function head(o, view) {
    return (view === 'side' ? ell(1, -86, 16, 18, o.skin) : ell(0, -86, 18, 18, o.skin)) + face(o, view);
  }

  /* pose: { view: front|back|side, flip: bool, action: idle|walk|sit|work, phase: 0..1, tool: none|hoe|can|seed } */
  function svg(outfit, pose) {
    var o = clean(outfit), p = pose || {};
    var view = VIEWS.indexOf(p.view) >= 0 ? p.view : 'front';
    var action = p.action || 'idle', phase = p.phase || 0;
    var swing = action === 'walk' ? Math.sin(phase * Math.PI * 2) : 0;
    var bob = action === 'walk' ? -Math.abs(swing) * 2 : action === 'idle' ? Math.sin(phase * Math.PI * 2) * 0.6 : 0;
    var trouser = o.bottom, trouserBack = shade(o.bottom, 0.82), top = o.top, sleeve = shade(o.top, 0.92);
    var out = '';

    if (action === 'sit') return sitting(o, view);

    var legs, arms, torso;
    if (view === 'side') {
      legs = limb(-5, -40, 10, 36, -swing * 26, trouserBack) + ell(4 + swing * -14, -3, 7, 3.6, shade(o.shoes, 0.9)) +
        limb(-5, -40, 10, 36, swing * 26, trouser) + ell(4 + swing * 14, -3, 7.5, 3.8, o.shoes);
      torso = rect(-10, -68, 20, 32, 9, top);
      var armAngle = action === 'work' ? -70 - Math.sin(phase * Math.PI) * 30 : -swing * 24;
      arms = limb(-4, -64, 9, 26, armAngle, o.skin) + limb(-4.5, -65, 10, 12, armAngle, sleeve);
      out = hairBack(o, view) + legs + torso + arms + rect(-4, -72, 8, 6, 3, o.skin) + head(o, view) + hairFront(o, view) + headwear(o, view);
      if (action === 'work') out += tool(p.tool, armAngle);
    } else {
      var lift = action === 'walk' ? swing * 3 : 0;
      legs = rect(-12, -40, 10.5, 36 - Math.max(0, lift), 5.25, trouser) + rect(1.5, -40, 10.5, 36 - Math.max(0, -lift), 5.25, trouser) +
        ell(-6.5, -3 - Math.max(0, lift), 7, 4, o.shoes) + ell(6.5, -3 - Math.max(0, -lift), 7, 4, o.shoes);
      torso = rect(-15, -68, 30, 32, 11, top);
      arms = limb(-23, -64, 8, 26, 6 + swing * 10, o.skin) + limb(-23.5, -65, 9.5, 11, 6 + swing * 10, sleeve) +
        limb(15, -64, 8, 26, -6 + swing * 10, o.skin) + limb(14.5, -65, 9.5, 11, -6 + swing * 10, sleeve);
      out = hairBack(o, view) + legs + torso + arms + rect(-4, -72, 8, 6, 3, o.skin);
      out += view === 'back' ? ell(0, -86, 18, 18, o.skin) + hairFront(o, view) + headwear(o, view)
        : head(o, view) + hairFront(o, view) + headwear(o, view);
    }
    var t = 'translate(0 ' + bob.toFixed(2) + ')' + (p.flip ? ' scale(-1 1)' : '');
    return g(t, out);
  }

  function sitting(o, view) { /* cross-legged on a cushion, always shown from the front for calm practice */
    var trouser = o.bottom;
    return hairBack(o, 'front').replace(/-48/g, '-30') +
      ell(-10, -8, 15, 7, trouser) + ell(10, -8, 15, 7, trouser) + ell(-17, -6, 5, 3.4, o.shoes) + ell(17, -6, 5, 3.4, o.shoes) +
      g('translate(0 26)', rect(-15, -68, 30, 32, 11, o.top) +
        limb(-22, -64, 8, 24, 28, o.skin) + limb(-22.5, -65, 9.5, 11, 28, shade(o.top, 0.92)) +
        limb(14, -64, 8, 24, -28, o.skin) + limb(13.5, -65, 9.5, 11, -28, shade(o.top, 0.92)) +
        rect(-4, -72, 8, 6, 3, o.skin) + ell(0, -86, 18, 18, o.skin) +
        ell(-6, -83, 2.6, 0.9, '#2b2230') + ell(6, -83, 2.6, 0.9, '#2b2230') + /* eyes softly closed */
        ell(-10, -77, 3.2, 2, '#f19a8f', ' opacity="0.55"') + ell(10, -77, 3.2, 2, '#f19a8f', ' opacity="0.55"') +
        '<path d="M-3 -74 Q0 -72 3 -74" stroke="#2b2230" stroke-width="1.2" fill="none" stroke-linecap="round"/>' +
        hairFront(o, 'front') + headwear(o, 'front'));
  }

  function tool(kind, armAngle) {
    var tip = g('rotate(' + armAngle.toFixed(1) + ' 0 -64)', '');
    if (kind === 'hoe') return g('rotate(' + (armAngle + 90).toFixed(1) + ' 0 -64)', rect(-1.2, -64, 2.4, 40, 1.2, '#9a7552') + rect(-1, -28, 10, 4, 1.5, '#7d8a90'));
    if (kind === 'can') return g('rotate(' + (armAngle + 90).toFixed(1) + ' 0 -64)', rect(-6, -44, 14, 11, 3, '#5f8f8b') + rect(7, -42, 8, 2.4, 1.2, '#5f8f8b'));
    if (kind === 'seed') return g('rotate(' + (armAngle + 90).toFixed(1) + ' 0 -64)', ell(0, -40, 4, 3, '#d9b37a'));
    return tip;
  }

  root.EbbPuppet = { svg: svg, clean: clean, shade: shade, OUTFIT_DEFAULT: OUTFIT_DEFAULT, HAIR_STYLES: HAIR_STYLES };
})(typeof window !== 'undefined' ? window : globalThis);
