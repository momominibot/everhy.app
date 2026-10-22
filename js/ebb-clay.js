/* Ebb clay: the player drawn from Seedream clay sprite strips (art/chars/<set>/<strip>.webp, metadata in
 * ebb-clay-sets.js). pick(pose) is pure and says which strip and frame to show; draw(g, set, pose) keeps one <image>
 * inside a clipping <svg> and only changes its attributes, so frames never flash. Local units match the old puppet:
 * feet at (0, 0), standing height about 104. */
(function (root) {
  'use strict';
  var SETS = root.EbbClaySets || {};
  var UNIT = 104 / 300; /* the strips were cut so a standing figure is about 300 px tall */
  var IDLE = { front: 0, side: 1, back: 2 };

  function has(set) { return !!SETS[set]; }
  function setFor(outfit) { var s = outfit && outfit.set; return has(s) ? s : 'default'; }
  function sets() { return Object.keys(SETS); }

  function pick(pose) {
    var p = pose || {}, view = IDLE[p.view] !== undefined ? p.view : 'front', phase = p.phase || 0, breathe = 0;
    var strip = 'idle', frame = IDLE[view], flip = view === 'side' && !!p.flip;
    if (p.action === 'walk') { strip = 'walk_' + view; frame = Math.floor(phase * 8) % 8; }
    else if (p.action === 'sit') { strip = 'sit'; frame = 0; flip = false; breathe = Math.sin(phase * Math.PI * 2); }
    else if (p.action === 'work' && p.tool && p.tool !== 'none') {
      strip = 'work'; flip = !!p.flip; /* work poses face right */
      frame = p.tool === 'can' ? 0 : p.tool === 'hoe' ? (phase < 0.5 ? 1 : 2) : 3;
    } else breathe = Math.sin(phase * Math.PI * 2);
    return { strip: strip, frame: frame, flip: flip, breathe: breathe };
  }

  function url(set, strip) { return 'art/chars/' + set + '/' + strip + '.webp'; }
  var loaded = {};
  function preload(set) { /* decode every strip once so a new pose never shows blank */
    if (!has(set) || loaded[set] || typeof Image === 'undefined') return;
    loaded[set] = true;
    Object.keys(SETS[set]).forEach(function (strip) { var im = new Image(); im.src = url(set, strip); });
  }

  function draw(g, set, pose) {
    if (!has(set)) return false;
    var s = SETS[set], c = g._clay;
    if (!c || c.set !== set) {
      preload(set);
      g.innerHTML = '<ellipse cx="0" cy="-1" rx="17" ry="4.6" fill="rgba(40,30,30,0.18)"/><g><svg preserveAspectRatio="none"><image/></svg></g>';
      var body = g.lastChild;
      c = g._clay = { set: set, body: body, cel: body.firstChild, img: body.firstChild.firstChild, key: '', tf: '' };
    }
    var k = pick(pose), m = s[k.strip] || s.idle, key = k.strip + ':' + k.frame;
    if (key !== c.key) {
      c.key = key;
      var cw = m.w * UNIT, ch = m.h * UNIT;
      c.cel.setAttribute('x', (-cw / 2).toFixed(2)); c.cel.setAttribute('y', (-ch).toFixed(2));
      c.cel.setAttribute('width', cw.toFixed(2)); c.cel.setAttribute('height', ch.toFixed(2));
      c.cel.setAttribute('viewBox', (k.frame * m.w) + ' 0 ' + m.w + ' ' + m.h);
      c.img.setAttribute('href', url(set, k.strip));
      c.img.setAttribute('width', m.w * m.frames); c.img.setAttribute('height', m.h);
    }
    var tf = 'scale(' + (k.flip ? -1 : 1) + ' ' + (1 + k.breathe * 0.012).toFixed(4) + ')';
    if (tf !== c.tf) { c.tf = tf; c.body.setAttribute('transform', tf); }
    return true;
  }

  root.EbbClay = { pick: pick, draw: draw, has: has, setFor: setFor, sets: sets, preload: preload, url: url, UNIT: UNIT };
})(typeof window !== 'undefined' ? window : globalThis);
