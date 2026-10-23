/* Ebb live plates: a scene may name a `video`, a seamless loop of its own plate in which only the water and the
 * trees move (made by tools/live_plate.py plus a mask, so the rest of the painting is pixel-identical). It is shown
 * over the still plate image in the same box, muted, looping, inline. Under reduced motion or when the browser
 * refuses autoplay the still plate simply stays. The sky's tint is a sibling above it, so night still
 * falls on the water. */
(function (root) {
  'use strict';
  var doc = root.document;
  if (!doc || !root.EbbGame || !root.EbbWorld) return;
  var W = root.EbbWorld, G = root.EbbGame, plate = doc.getElementById('plate');
  if (!plate) return;
  var mq = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reduced() { return !!(mq && mq.matches) || doc.documentElement.getAttribute('data-motion') === 'reduce'; }
  var video = null, shown = '', playing = false;
  function ensure() {
    if (video) return video;
    video = doc.createElement('video'); video.className = 'live-plate'; video.hidden = true;
    video.muted = true; video.loop = true; video.playsInline = true; video.preload = 'auto'; video.disablePictureInPicture = true;
    video.setAttribute('muted', ''); video.setAttribute('playsinline', ''); video.setAttribute('aria-hidden', 'true');
    /* the props layer (drawn water, shimmer) is redrawn whenever the live plate takes over or lets go */
    video.addEventListener('playing', function () { playing = true; video.hidden = false; if (G.api.refresh) G.api.refresh(); });
    video.addEventListener('pause', function () { playing = false; if (G.api.refresh) G.api.refresh(); });
    plate.insertAdjacentElement('afterend', video);
    return video;
  }
  /* the loop ships as mp4 (H.264, phones) and webm (VP9, browsers without H.264 such as the open Chromium the smokes run) */
  var probe = doc.createElement('video');
  function pickSrc(src) {
    var mp4 = probe.canPlayType && probe.canPlayType('video/mp4; codecs="avc1.42E01E"'), webm = probe.canPlayType && probe.canPlayType('video/webm; codecs="vp9"');
    if (/\.mp4$/.test(src) && !mp4 && webm) return src.replace(/\.mp4$/, '.webm');
    return src;
  }
  /* iPhone Safari cannot blend the sky's multiply tint over a playing video: the whole plate vanished at night (24 Oct,
   * iOS simulator). So the loop plays only while no tint is on (daytime); dusk and night show the still painting. */
  function tinted() {
    var sky = doc.querySelector('.sky'); if (!sky) return false;
    var on = sky.querySelectorAll('.sky-shade, .sky-vignette, .sky-night');
    for (var i = 0; i < on.length; i++) if (!on[i].hidden) return true;
    return false;
  }
  function wanted() {
    var id = G.api.scene(), sc = W.SCENES[id];
    if (!sc || !sc.video || reduced() || tinted()) return '';
    return pickSrc(sc.video);
  }
  function tick() {
    var src = wanted();
    if (src !== shown) {
      shown = src; var v = ensure();
      if (src) {
        v.setAttribute('src', src); v.hidden = true; playing = false;
        var p = v.play(); if (p && p.catch) p.catch(function () { v.hidden = true; playing = false; });
      } else { v.pause(); v.removeAttribute('src'); v.load(); v.hidden = true; playing = false; }
    }
    root.requestAnimationFrame(tick);
  }
  if (G._ready) tick(); else doc.addEventListener('ebb:ready', tick);
  root.EbbLive = { version: '1.0', active: function () { return !!shown && playing; }, wanted: wanted };
})(typeof window !== 'undefined' ? window : globalThis);
