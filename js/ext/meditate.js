/* Ebb meditation library: a filterable set of practices (by length and by posture), each run as a single timed
 * practice with Erin's voice. A finished practice saves a mindfulness observation (hearts) and can be added to the
 * morning or evening routine. Entry: More > Meditation. Rules live in js/meditate/rules.js (pure), voice in
 * js/meditate/voice.js (made by tools/voice_meditate.py), and the routine step opens this library. */
(function (root) {
  'use strict';
  var doc = root.document;
  if (!doc || !root.EbbGame) return; /* the node harness stops here */
  if (!root.EbbMeditateRules) { var sr = doc.createElement('script'); sr.src = 'js/meditate/rules.js'; sr.async = false; doc.head.appendChild(sr); }
  if (!root.EbbMeditateVoice) { var sv = doc.createElement('script'); sv.src = 'js/meditate/voice.js'; sv.async = false; doc.head.appendChild(sv); }
  function M() { return root.EbbMeditateRules; }
  function R() { return root.EbbRoutineRules; }

  var api = null, wrap = null, cleanup = null;
  var fPosture = null, fLength = null;

  /* ---------- Erin's voice: one reused audio element; on unless she mutes it ---------- */
  var vo = null;
  function voiceOn() { return api.state().meditateVoice !== false; }
  function clipFor(text) { var V = root.EbbMeditateVoice; return V && V.clips && V.clips[text] || null; }
  function hush() { if (vo) { try { vo.pause(); } catch (e) { } } }
  function say(text) {
    hush(); var c = clipFor(text); if (!voiceOn() || !c) return 0;
    try { vo = vo || new Audio(); vo.src = c.src; var p = vo.play(); if (p && p.catch) p.catch(function () { }); } catch (e) { return 0; }
    return Math.round((c.sec || 0) * 1000);
  }
  function voiceBtn() {
    var b = el('button', 'btn small md-voice'); b.type = 'button';
    function paint() {
      var on = voiceOn();
      b.innerHTML = root.EbbSpeakerIcon(on);
      b.setAttribute('aria-pressed', on ? 'false' : 'true');
      b.setAttribute('aria-label', on ? 'Mute Erin' : 'Play Erin\u2019s voice');
      b.title = on ? 'Mute Erin' : 'Erin\u2019s voice';
    }
    b.addEventListener('click', function (e) { e.stopPropagation(); api.state().meditateVoice = !voiceOn(); api.save(); if (!voiceOn()) hush(); paint(); });
    paint(); return b;
  }

  function el(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function para(text, cls) { return el('p', cls || '', text); }
  function chime() { try { if (root.EbbSound && typeof root.EbbSound.play === 'function') root.EbbSound.play('chime'); } catch (e) { } }
  function heart() { try { if (root.EbbLife && root.EbbLife.react) root.EbbLife.react('heart', 1600); } catch (e) { } }

  /* ---------- one sheet at a time ---------- */
  function show(title, nodes, actions, cls) {
    if (cleanup) { cleanup(); cleanup = null; }
    if (!wrap) {
      wrap = el('div', 'sheet-wrap meditate-wrap');
      wrap.addEventListener('keydown', function (e) { e.stopPropagation(); });
      wrap.addEventListener('click', function (e) { e.stopPropagation(); });
      root.EbbMount(wrap);
    }
    wrap.className = 'sheet-wrap meditate-wrap' + (cls ? ' ' + cls : '');
    wrap.innerHTML = '';
    var sh = el('section', 'sheet meditate-sheet'); sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-label', title);
    sh.appendChild(el('h2', '', title));
    var body = el('div', 'sheet-body meditate-body'); nodes.forEach(function (n) { if (n) body.appendChild(n); }); sh.appendChild(body);
    var bar = el('div', 'sheet-actions');
    actions.forEach(function (a) {
      var b = el('button', a.primary ? 'btn primary' : 'btn', a.label); b.type = 'button';
      if (a.id) b.dataset.act = a.id; if (a.disabled) b.disabled = true;
      b.addEventListener('click', function () { a.fn(b); }); bar.appendChild(b);
    });
    sh.appendChild(bar); wrap.appendChild(sh);
    var first = sh.querySelector('.sheet-actions button:not([disabled])'); if (first) { try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); } }
    sh.scrollTop = 0;
    return sh;
  }
  function close() { if (cleanup) { cleanup(); cleanup = null; } if (wrap) { wrap.remove(); wrap = null; } }

  /* ---------- filter chips: one row of options with an "any" choice ---------- */
  function filterRow(label, options, current, onPick) {
    var box = el('div', 'md-filter');
    box.appendChild(el('span', 'md-filter-label', label));
    var row = el('div', 'pills');
    function pill(text, val) {
      var on = current === val, b = el('button', 'pill' + (on ? ' on' : ''), text); b.type = 'button';
      b.setAttribute('aria-pressed', String(on));
      b.addEventListener('click', function () { onPick(val); });
      row.appendChild(b);
    }
    pill('Any', null);
    options.forEach(function (o) { pill(o.text, o.val); });
    box.appendChild(row);
    return box;
  }

  /* ---------- the library: filters and the matching practices ---------- */
  function openLibrary(opts) {
    opts = opts || {};
    var K = M(), nodes = [];
    nodes.push(para('Pick a length and a position, then a practice. It runs right here, wherever you are.', 'muted'));
    nodes.push(filterRow('Length', K.allLengths().map(function (l) { return { text: K.minLabel(l), val: l }; }), fLength, function (v) { fLength = v; openLibrary(opts); }));
    var postureList = Object.keys(K.POSTURES).map(function (k) { return { text: K.POSTURES[k], val: k }; });
    nodes.push(filterRow('Position', postureList, fPosture, function (v) { fPosture = v; openLibrary(opts); }));

    var ids = K.filter(fPosture, fLength);
    if (!ids.length) nodes.push(para('No practice fits both filters. Try Any on one of them.', 'muted'));
    else {
      var list = el('div', 'md-list');
      ids.forEach(function (id) {
        var p = K.PRACTICES[id], card = el('button', 'md-card'); card.type = 'button';
        card.appendChild(el('b', '', p.title));
        card.appendChild(el('small', 'muted', p.blurb));
        var meta = el('span', 'md-meta');
        meta.textContent = p.lengths.map(K.minLabel).join(' · ') + ' · ' + p.postures.map(function (q) { return K.POSTURES[q]; }).join('/');
        card.appendChild(meta);
        card.addEventListener('click', function () { runPractice(id, chooseLength(p), opts); });
        list.appendChild(card);
      });
      nodes.push(list);
    }
    var actions = [{ label: 'Close', id: 'close', fn: function () { if (opts.onCancel) opts.onCancel(); close(); } }];
    show('Meditation', nodes, actions);
  }
  function chooseLength(p) {
    if (fLength && p.lengths.indexOf(fLength) >= 0) return fLength;
    return p.lengths[0];
  }

  /* ---------- running one practice: a visible timer, cues, Erin's voice ---------- */
  function runPractice(id, length, opts) {
    var K = M(), p = K.PRACTICES[id], startIso = new Date().toISOString();
    var t = { planned: length, activeMs: 0, paused: false, hidden: false, ended: false, last: null };
    var shown = -1, done = false;
    var head = el('div', 'md-head');
    head.appendChild(el('b', '', p.title));
    head.appendChild(el('small', 'muted', K.minLabel(length)));
    head.appendChild(voiceBtn());
    var cue = el('p', 'md-cue'); cue.setAttribute('aria-live', 'polite');
    var clock = el('p', 'md-clock');
    show(p.title, [head, cue, clock], [
      { label: 'Pause', id: 'pause', fn: function (b) { if (t.paused) { t.paused = false; t.last = Date.now(); } else { t.paused = true; hush(); } b.textContent = t.paused ? 'Resume' : 'Pause'; } },
      { label: 'End now', id: 'end', primary: true, fn: function () { finishNow(false); } }
    ], 'running');

    function paint() {
      var frac = t.planned ? Math.min(1, t.activeMs / 1000 / t.planned) : 0, i = K.cueAt(p.cues, frac);
      if (i !== shown) {
        shown = i;
        cue.textContent = p.cues[i][1];
        if (!t.paused) say(p.cues[i][1]);
      }
      var left = Math.max(0, t.planned - Math.floor(t.activeMs / 1000));
      clock.textContent = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0') + ' left' + (t.paused ? ', paused' : '');
    }
    function onVis() {
      tick();
      if (doc.hidden) { t.hidden = true; } else { t.hidden = false; t.last = Date.now(); }
    }
    function tick() {
      var now = Date.now();
      if (t.last !== null && !t.paused && !t.hidden) t.activeMs += Math.max(0, Math.min(1500, now - t.last));
      t.last = now;
      if (t.activeMs >= t.planned * 1000) { t.activeMs = t.planned * 1000; t.ended = true; }
    }
    doc.addEventListener('visibilitychange', onVis);
    t.last = Date.now();
    var iv = setInterval(function () {
      tick(); paint();
      if (t.ended && !done) { done = true; finishNow(true); }
    }, 250);
    cleanup = function () { clearInterval(iv); doc.removeEventListener('visibilitychange', onVis); };
    paint();

    function finishNow(completed) {
      if (done && !completed) return;
      hush();
      if (cleanup) { cleanup(); cleanup = null; }
      var endIso = new Date().toISOString(), activeSec = Math.floor(t.activeMs / 1000);
      var o = {
        practice: 'meditate-' + id, anchor: 'breath', scriptVersion: K.VERSION,
        plannedSec: length, activeSec: activeSec, status: t.ended ? 'finished' : 'partial',
        start: startIso, end: endIso, source: 'meditation'
      };
      try { root.EbbStore.addPractice(o); } catch (e) { console.error(e); }
      api.save(); api.refresh();
      chime(); heart();
      if (opts.onDone) { close(); opts.onDone(o); return; }
      finishedScreen(id, length, t.ended);
    }
  }

  /* ---------- after: add the practice to a routine ---------- */
  function finishedScreen(id, length, completed) {
    var K = M(), nodes = [];
    nodes.push(para(completed ? 'Done. Carry a little of that with you.' : 'Thank you for practising.', 'md-finish'));
    nodes.push(para('Practice this often? Add it to a routine, and it will be there each day.', 'muted'));
    show(K.PRACTICES[id].title, nodes, [
      { label: 'Add to morning', id: 'am', fn: function () { addToRoutine('morning'); } },
      { label: 'Add to evening', id: 'pm', fn: function () { addToRoutine('evening'); } },
      { label: 'Close', id: 'close', primary: true, fn: close }
    ], 'finished');
  }
  function addToRoutine(routine) {
    var K = R();
    if (!K) { close(); return; }
    var r = api.state().routines; K.ensure(r);
    var stepId = routine === 'morning' ? 'meditate_am' : 'meditate_pm', list = r.lists[routine];
    if (list.some(function (s) { return s.id === stepId; })) { api.toast('Already in your ' + routine + ' routine.', 1800); return; }
    if (list.length >= K.MAX) { api.toast('That routine is full. Remove a step first.', 2200); return; }
    K.addStep(list, stepId);
    api.save();
    api.toast('Added to your ' + routine + ' routine.', 2000);
    close();
  }

  /* ---------- wiring ---------- */
  function start(a) {
    api = a;
    root.EbbGame.registerPanel({ id: 'meditation', label: 'Meditation', open: function () { openLibrary({}); } });
  }
  doc.addEventListener('ebb:ready', function (e) { start(e.detail || root.EbbGame.api); });
  if (root.EbbGame._ready) start(root.EbbGame.api);

  root.EbbMeditate = { open: function (opts) { openLibrary(opts || {}); } };
})(window);
