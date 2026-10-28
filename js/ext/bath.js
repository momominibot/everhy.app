/* Ebb bath: the sink is a quiet teeth-brushing and face-washing moment, done with a little mindfulness, not a place to
 * document the body. The toilet is a short private pause. Logging the body, flow and cycle lives with Ovia, the mascot
 * who is always on the app (the floating Ovia button). The mindful timer, its cues and Erin's voice reuse the routines
 * machinery (js/routines/rules.js, js/routines/voice.js); a finished brushing saves a gentle practice observation.
 */
(function (root) {
  'use strict';
  var doc = root.document;
  if (!doc || !root.EbbGame) return; /* the node harness stops here */
  var G = root.EbbGame;
  if (!root.EbbBathVoice) { var bsc = doc.createElement('script'); bsc.src = 'js/bath/voice.js'; bsc.async = false; doc.head.appendChild(bsc); }
  function K() { return root.EbbRoutineRules; }
  /* the brushing cues have their own Erin clips; the routine voice is kept as a fallback */
  function clipFor(text) {
    var b = root.EbbBathVoice && root.EbbBathVoice.clips && root.EbbBathVoice.clips[text];
    if (b) return b;
    return root.EbbRoutineVoice && root.EbbRoutineVoice.clips && root.EbbRoutineVoice.clips[text] || null;
  }
  function el(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function chime() { try { if (root.EbbSound && typeof root.EbbSound.play === 'function') root.EbbSound.play('chime'); } catch (e) { } }
  function nowIso() { return new Date().toISOString(); }

  /* ---------- Erin's voice: one reused audio element, on unless she mutes it ---------- */
  var api = null, vo = null;
  function voiceOn() { return api.state().routineVoice !== false; }
  function hush() { if (vo) { try { vo.pause(); } catch (e) { } } }
  function say(text) { /* how long she speaks in ms, 0 when silent or no clip */
    hush(); var c = clipFor(text);
    if (!voiceOn() || !c) return 0;
    try { vo = vo || new Audio(); vo.src = c.src; var p = vo.play(); if (p && p.catch) p.catch(function () { }); } catch (e) { return 0; }
    return Math.round((c.sec || 0) * 1000);
  }
  function voiceBtn() {
    var b = el('button', 'btn small rt-voice'); b.type = 'button';
    function paint() {
      var on = voiceOn();
      b.innerHTML = root.EbbSpeakerIcon(on);
      b.setAttribute('aria-pressed', on ? 'false' : 'true');
      b.setAttribute('aria-label', on ? 'Mute Erin' : 'Play Erin\u2019s voice');
      b.title = on ? 'Mute Erin' : 'Erin\u2019s voice';
    }
    b.addEventListener('click', function (e) { e.stopPropagation(); api.state().routineVoice = !voiceOn(); api.save(); if (!voiceOn()) hush(); paint(); });
    paint(); return b;
  }

  /* ---------- one sheet at a time (the routines pattern) ---------- */
  var wrap = null, cleanup = null;
  function show(title, nodes, actions) {
    if (cleanup) { cleanup(); cleanup = null; }
    if (!wrap) {
      wrap = el('div', 'sheet-wrap bath-wrap');
      wrap.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Escape') close(); });
      wrap.addEventListener('click', function (e) { e.stopPropagation(); if (e.target === wrap) close(); });
      root.EbbMount(wrap);
    }
    wrap.innerHTML = '';
    var sh = el('section', 'sheet bath-sheet'); sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-label', title);
    sh.appendChild(el('h2', '', title));
    var body = el('div', 'sheet-body bath-body'); nodes.forEach(function (n) { if (n) body.appendChild(n); }); sh.appendChild(body);
    var bar = el('div', 'sheet-actions');
    actions.forEach(function (a) {
      var b = el('button', a.primary ? 'btn primary' : 'btn', a.label); b.type = 'button';
      if (a.id) b.dataset.act = a.id;
      b.addEventListener('click', function () { a.fn(b); }); bar.appendChild(b);
    });
    sh.appendChild(bar); wrap.appendChild(sh);
  }
  function close() {
    hush();
    if (cleanup) { cleanup(); cleanup = null; }
    if (wrap) { wrap.remove(); wrap = null; }
  }

  /* ---------- brushing and washing: one gentle timed run with cues ---------- */
  var BRUSH_SEC = 150; /* two and a half minutes: brush, rinse, wash the face */
  var CUES = [
    [0.00, 'Stand soft at the sink. Let your shoulders drop. Pick up the brush.'],
    [0.05, 'Brush slowly. Notice the cool mint, the sound, the feel of the bristles.'],
    [0.30, 'Move gently, corner to corner. No rush. This time is yours.'],
    [0.50, 'Halfway. Let your jaw be soft. Breathe slowly through your nose.'],
    [0.62, 'Rinse. Now cup a little warm water for your face.'],
    [0.70, 'Splash gently. Feel the warmth, the softness of your skin.'],
    [0.85, 'Pat dry with the towel. Slow, kind hands.'],
    [0.95, 'Take one slow breath. A clean, gentle start.']
  ];
  function openBrushing(spot, a) {
    api = a || api;
    var R = K(); if (!R) { api.toast('The sink is still being readied. One moment.'); return; }
    var t = R.timer(BRUSH_SEC), startIso = nowIso();
    var head = el('div', 'rt-head');
    head.appendChild(el('small', 'muted', 'A little mindfulness at the sink'));
    if (root.EbbBathVoice) head.appendChild(voiceBtn());
    var cap = el('p', 'rt-cue'); cap.setAttribute('aria-live', 'polite');
    var clock = el('p', 'rt-clock');
    show('Brush teeth and wash face', [head, cap, clock], [
      { label: 'Pause', id: 'pause', fn: function (b) { if (t.paused) R.resume(t, Date.now()); else { R.pause(t, Date.now()); hush(); } b.textContent = t.paused ? 'Resume' : 'Pause'; paint(); } },
      { label: 'Stop', id: 'stop', fn: function () { close(); } }
    ]);
    var shown = -1, done = false;
    function paint() {
      var i = R.cueAt(CUES, t);
      if (i !== shown) { shown = i; cap.textContent = CUES[i][1]; if (!t.paused) say(CUES[i][1]); }
      clock.textContent = R.clockText(t);
    }
    function onVis() { R.setHidden(t, doc.hidden, Date.now()); }
    doc.addEventListener('visibilitychange', onVis);
    R.setHidden(t, doc.hidden, Date.now());
    var iv = setInterval(function () {
      R.tick(t, Date.now()); paint();
      if (t.ended && !done) {
        done = true;
        clearInterval(iv); doc.removeEventListener('visibilitychange', onVis);
        var o = { practice: 'bath-brush', anchor: 'routine', scriptVersion: 'bath-1', plannedSec: BRUSH_SEC, activeSec: R.activeSec(t), status: 'finished', start: startIso, end: nowIso(), source: 'bath' };
        try { root.EbbStore.addPractice(o); } catch (e) { }
        chime(); close();
        api.toast('Clean and gentle. On with the day.', 2400);
      }
    }, 250);
    cleanup = function () { clearInterval(iv); doc.removeEventListener('visibilitychange', onVis); };
    paint();
  }

  /* ---------- the toilet: a short private pause, no logging ---------- */
  function openToilet(spot, a) {
    api = a || api;
    var R = K();
    var head = el('div', 'rt-head');
    head.appendChild(el('small', 'muted', 'Nothing here is logged'));
    var cap = el('p', 'rt-cue', 'Take your time. Nothing is saved here.');
    show('A quiet moment', [head, cap], [
      { label: 'Done', primary: true, id: 'done', fn: function () { close(); } }
    ]);
  }

  G.registerKind('brushing', function (spot, a) { openBrushing(spot, a); });
  G.registerKind('toilet', function (spot, a) { openToilet(spot, a); });

  root.EbbBath = { open: function (spot, a) { openBrushing(spot, a); }, close: close };
})(typeof window !== 'undefined' ? window : globalThis);
