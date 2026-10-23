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
  /* the original girl (Aung's character redrawn smooth in clay) and her outfits; the big-headed 'ac' sets stay on disk, unused */
  var BASE = SETS.genz ? 'genz' : 'default', FAMILY = ['genz', 'default', 'lilac', 'tudung'];
  function setFor(outfit) { var s = outfit && outfit.set; return has(s) && FAMILY.indexOf(s) >= 0 ? s : BASE; }
  function sets() { return FAMILY.filter(has); }

  function pick(pose) {
    var p = pose || {}, view = IDLE[p.view] !== undefined ? p.view : 'front', phase = p.phase || 0, breathe = 0, bob = 0;
    var strip = 'idle', frame = IDLE[view], flip = view === 'side' && !!p.flip;
    if (p.action === 'walk') { strip = 'walk_' + view; frame = Math.floor(phase * 8) % 8; bob = Math.abs(Math.sin(phase * Math.PI * 2)) * 1.1; }
    else if (p.action === 'sit') { /* a named pose strip (sip, soak, fish, stretch: two frames that alternate slowly) when the set has one, else the plain seat */
      strip = p.pose ? p.pose : 'sit'; frame = p.pose ? Math.floor(phase * 2) % 2 : 0; flip = false; breathe = Math.sin(phase * Math.PI * 2);
    }
    else if (p.action === 'work' && p.tool && p.tool !== 'none') {
      strip = 'work'; flip = !!p.flip; /* work poses face right */
      frame = p.tool === 'can' ? 0 : p.tool === 'hoe' ? (phase < 0.5 ? 1 : 2) : 3;
    } else breathe = Math.sin(phase * Math.PI * 2);
    return { strip: strip, frame: frame, flip: flip, breathe: breathe, bob: bob };
    /* callers may also pass pose.pose, the name of a seated action strip */
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
      g.innerHTML = '<ellipse cx="0" cy="-1" rx="17" ry="4.6" fill="rgba(40,30,30,0.18)"/><g><svg preserveAspectRatio="none"></svg></g>';
      var body = g.lastChild, cel = body.firstChild, imgs = {}, NS = 'http://www.w3.org/2000/svg', d = g.ownerDocument;
      /* one <image> per strip, made once and never resized or re-pointed: a frame change only moves the viewBox and
       * swaps which strip is opaque, so the old bitmap is never shown stretched to a new strip's width */
      Object.keys(s).forEach(function (strip) {
        var im = d.createElementNS(NS, 'image'), ms = s[strip];
        im.setAttribute('href', url(set, strip)); im.setAttribute('x', 0); im.setAttribute('y', 0);
        im.setAttribute('width', ms.w * ms.frames); im.setAttribute('height', ms.h); im.setAttribute('opacity', '0');
        cel.appendChild(im); imgs[strip] = im;
      });
      c = g._clay = { set: set, body: body, cel: cel, imgs: imgs, strip: '', key: '', tf: '' };
    }
    var k = pick(pose);
    if (k.strip === 'soak' && s.soak_tube) k.strip = 'soak_tube'; /* soaking (hot spring, bath): her towel tube, once the set has that strip (tools/jobs_soak_tube.json) */
    var stripId = s[k.strip] ? k.strip : (pose && pose.action === 'sit' && s.sit) ? 'sit' : 'idle', m = s[stripId], key = stripId + ':' + k.frame;
    if (stripId !== k.strip) k.frame = 0; /* a pose the set does not have yet falls back to the plain seat */
    if (key !== c.key) {
      c.key = key;
      var cw = m.w * UNIT, ch = m.h * UNIT;
      c.cel.setAttribute('x', (-cw / 2).toFixed(2)); c.cel.setAttribute('y', (-ch).toFixed(2));
      c.cel.setAttribute('width', cw.toFixed(2)); c.cel.setAttribute('height', ch.toFixed(2));
      c.cel.setAttribute('viewBox', (k.frame * m.w) + ' 0 ' + m.w + ' ' + m.h);
      if (stripId !== c.strip) { if (c.imgs[c.strip]) c.imgs[c.strip].setAttribute('opacity', '0'); c.imgs[stripId].setAttribute('opacity', '1'); c.strip = stripId; }
    }
    var tf = 'translate(0,' + (-k.bob).toFixed(2) + ') scale(' + (k.flip ? -1 : 1) + ' ' + (1 + k.breathe * 0.012).toFixed(4) + ')';
    if (tf !== c.tf) { c.tf = tf; c.body.setAttribute('transform', tf); }
    return true;
  }

  root.EbbClay = { pick: pick, draw: draw, has: has, setFor: setFor, sets: sets, preload: preload, url: url, UNIT: UNIT };
})(typeof window !== 'undefined' ? window : globalThis);
