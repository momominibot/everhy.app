/* Ebb sparkles: a small twinkling yellow diamond over everything she can tap (every spot of every scene), so players know
 * what to tap, resting on a logging spot once today's entry from it is saved and paid. Hidden for the spot she is standing at (its own prompt shows) and still under reduced motion. Arriving at
 * a place whose best thing is far off (the jetty's fishing end) gives a one-line hint. */
(function (root) {
  'use strict';
  /* A logging spot's diamond rests for the day once that day's entry from it is saved (confirmed, not undone) and the
   * points ledger has paid it (an entry 'log:<id>' in state.points, the dome's own record; past the day's cap it is
   * still there with 0). Entries saved from the spot carry its topic; ones typed in the general chat count by type. */
  var TYPES = { sleep: ['sleep', 'sleepQuality'], temperature: ['temperature'], mood: ['mood', 'note'], bleeding: ['bleeding', 'mucus', 'clots'], cycle: ['bleeding', 'mucus', 'clots'],
    body: ['symptom', 'pain'], food: ['food'] };
  function pad(n) { return String(n).padStart(2, '0'); }
  function localDay(v) {
    if (typeof v !== 'string' || !v) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    var t = Date.parse(v); if (isNaN(t)) return null;
    var d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function restsToday(st, topic, today) {
    if (!st || !topic || !today) return false;
    var obs = st.log && Array.isArray(st.log.obs) ? st.log.obs : [];
    var paid = {};
    (st.points && Array.isArray(st.points.entries) ? st.points.entries : []).forEach(function (e) { if (e && typeof e.id === 'string') paid[e.id] = true; });
    var types = TYPES[topic] || [];
    return obs.some(function (o) {
      if (!o || o.confirmed !== true || o.retracted || typeof o.id !== 'string') return false;
      if (localDay(o.created) !== today) return false;
      if (o.topic !== topic && types.indexOf(o.type) < 0) return false;
      return !!paid['log:' + o.id];
    });
  }
  root.EbbSparkles = { restsToday: restsToday, TYPES: TYPES };
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
        if (sp.hidden || sp.quiet || (near && near.spot === sp)) return; /* quiet: a spot that works but shows no diamond (the carriages keep one per row of seats) */
        if (sp.topic && restsToday(api.state(), sp.topic, api.today())) return; /* today's entry from here is in and paid */
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
