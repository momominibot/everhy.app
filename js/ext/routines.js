/* Ebb routines: a personal morning (wake up) and evening (wind down) routine, each a short ordered list of steps she
 * picks from a catalogue and can reorder, remove and add. Every step maps to a place in her home, so she walks there
 * (another room when needed) and the step runs on arrival: a timed pause with a visible clock, pause and skip; one
 * private line; the pop-up log; or simply walking to bed. Each completed step saves a mindfulness observation with a
 * routine field, so hearts and summaries pick it up. A run is remembered per date and resumes where it stopped.
 * Entry points: More > Morning routine / Evening routine, and a gentle card when the app opens in the morning or
 * evening. Rules live in js/routines/rules.js (pure). Erin's voice reads the prompt and each cue (js/routines/voice.js, made by tools/voice_routines.py), and can be muted. */
(function (root) {
  'use strict';
  var doc = root.document;
  if (!doc || !root.EbbGame) return; /* the node harness stops here */
  if (!root.EbbRoutineRules) { var sc = doc.createElement('script'); sc.src = 'js/routines/rules.js'; sc.async = false; doc.head.appendChild(sc); }
  if (!root.EbbRoutineVoice) { var sv = doc.createElement('script'); sv.src = 'js/routines/voice.js'; sv.async = false; doc.head.appendChild(sv); }
  function R() { return root.EbbRoutineRules; }
  function W() { return root.EbbWorld; }

  var api = null, wrap = null, cleanup = null, active = null, card = null, promptTimer = 0;
  function data() { var st = api.state(); st.routines = R().ensure(st.routines); return st.routines; }

  /* ---------- Erin's voice: one reused audio element; on unless she mutes it (kept in the save) ---------- */
  var vo = null;
  function voiceOn() { return api.state().routineVoice !== false; }
  function clipFor(text) { var V = root.EbbRoutineVoice; return V && V.clips && V.clips[text] || null; }
  function hush() { if (vo) { try { vo.pause(); } catch (e) { } } }
  function say(text) { /* returns how long she speaks, in ms (0 when silent) */
    hush(); var c = clipFor(text); if (!voiceOn() || !c) return 0;
    try { vo = vo || new Audio(); vo.src = c.src; var p = vo.play(); if (p && p.catch) p.catch(function () { }); } catch (e) { return 0; }
    return Math.round((c.sec || 0) * 1000);
  }
  function voiceBtn() {
    var b = el('button', 'btn small rt-voice'); b.type = 'button'; b.dataset.act = 'voice';
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
  function nowIso() { return new Date().toISOString(); }
  function el(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function para(text, cls) { return el('p', cls || '', text); }
  function chime() { try { if (root.EbbSound && typeof root.EbbSound.play === 'function') root.EbbSound.play('chime'); } catch (e) { } }
  function heart() { try { if (root.EbbLife && root.EbbLife.react) root.EbbLife.react('heart', 1600); } catch (e) { } }

  /* ---------- one sheet at a time (the course's pattern): keys and taps stay out of the scene ---------- */
  function show(title, nodes, actions, cls) {
    if (cleanup) { cleanup(); cleanup = null; }
    if (!wrap) {
      wrap = el('div', 'sheet-wrap routine-wrap');
      wrap.addEventListener('keydown', function (e) { e.stopPropagation(); });
      wrap.addEventListener('click', function (e) { e.stopPropagation(); });
      root.EbbMount(wrap);
    }
    wrap.className = 'sheet-wrap routine-wrap' + (cls ? ' ' + cls : '');
    wrap.innerHTML = '';
    var sh = el('section', 'sheet routine-sheet'); sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-label', title);
    sh.appendChild(el('h2', '', title));
    var body = el('div', 'sheet-body routine-body'); nodes.forEach(function (n) { if (n) body.appendChild(n); }); sh.appendChild(body);
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
  function anyModal() { return !!doc.querySelector('.sheet-wrap, .ebb-log, .sf-onboard'); }

  /* ---------- the routine sheet: steps, today's marks, start or carry on ---------- */
  function openRoutine(routine) {
    var r = data(), K = R(), today = api.today(), rn = K.run(r, routine, today), list = r.lists[routine], nodes = [];
    nodes.push(para(K.ROUTINES[routine].intro, 'muted'));
    var ol = el('ol', 'routine-steps');
    list.forEach(function (s, i) {
      var c = K.CATALOG[s.id], li = el('li', 'rt-step'); li.dataset.id = s.id;
      var state = rn ? (rn.done[s.id] ? 'done' : rn.skipped[s.id] ? 'skipped' : !rn.finished && rn.index === i ? 'next' : '') : '';
      if (state) li.classList.add(state);
      var mark = el('span', 'rt-mark', state === 'done' ? '✓' : String(i + 1)); mark.setAttribute('aria-hidden', 'true'); li.appendChild(mark);
      var t = el('span', 'rt-text'); t.appendChild(el('b', '', c.label));
      t.appendChild(el('small', '', c.where + (c.kind === 'timed' ? ', ' + (s.secs >= 60 ? Math.round(s.secs / 60) + ' min' : s.secs + ' s') : '')));
      li.appendChild(t);
      li.appendChild(el('span', 'rt-sr', state === 'done' ? 'Done' : state === 'skipped' ? 'Skipped' : state === 'next' ? 'Next' : ''));
      ol.appendChild(li);
    });
    nodes.push(ol);
    nodes.push(para(K.statusLine(rn), 'rt-status'));
    nodes.push(para(K.minutesText(K.totalSecs(list)) + ' in all, at your own pace.', 'muted small'));
    var acts = [{ label: 'Close', id: 'close', fn: close }, { label: 'Edit', id: 'edit', fn: function () { openEditor(routine); } }];
    if (rn && rn.finished) acts.push({ label: 'Do it again', id: 'again', fn: function () { K.restart(r, routine, today, nowIso()); api.save(); begin(routine); } });
    else acts.push({ label: rn && rn.index > 0 ? 'Carry on' : 'Start', primary: true, id: 'start', fn: function () { begin(routine); } });
    show(K.ROUTINES[routine].label, nodes, acts);
  }

  /* ---------- the editor: up, down, remove, durations, add from the catalogue; every change is saved at once ---------- */
  function openEditor(routine) {
    var r = data(), K = R(), list = r.lists[routine], nodes = [];
    function saved() { api.save(); label(routine); openEditor(routine); }
    nodes.push(para('Three to six steps, in the order you like. Changes are kept straight away.', 'muted'));
    var ol = el('ol', 'routine-steps editing');
    list.forEach(function (s, i) {
      var c = K.CATALOG[s.id], li = el('li', 'rt-step'); li.dataset.id = s.id;
      var row = el('div', 'rt-row');
      var t = el('span', 'rt-text'); t.appendChild(el('b', '', c.label)); t.appendChild(el('small', '', c.where)); row.appendChild(t);
      var ctl = el('span', 'rt-controls');
      [['up', 'Up', '↑', i === 0], ['down', 'Down', '↓', i === list.length - 1], ['remove', 'Remove', '×', list.length <= K.MIN]].forEach(function (d) {
        var b = el('button', 'btn small rt-ctl', d[2]); b.type = 'button'; b.dataset.ctl = d[0]; b.setAttribute('aria-label', d[1] + ': ' + c.label); b.disabled = d[3];
        b.addEventListener('click', function () {
          if (d[0] === 'remove') K.removeStep(list, i); else K.moveStep(list, i, d[0] === 'up' ? -1 : 1);
          saved();
        });
        ctl.appendChild(b);
      });
      row.appendChild(ctl); li.appendChild(row);
      if (c.kind === 'timed' && c.options) {
        var pills = el('div', 'pills rt-secs'); pills.setAttribute('role', 'group'); pills.setAttribute('aria-label', 'Length of ' + c.label);
        c.options.forEach(function (o) {
          var p = el('button', 'pill', o >= 60 ? Math.round(o / 60) + ' min' : o + ' s'); p.type = 'button'; p.dataset.secs = String(o); p.setAttribute('aria-pressed', String(o === s.secs));
          p.addEventListener('click', function () { K.setSecs(list, i, o); api.save(); pills.querySelectorAll('.pill').forEach(function (x) { x.setAttribute('aria-pressed', String(x === p)); }); });
          pills.appendChild(p);
        });
        li.appendChild(pills);
      }
      ol.appendChild(li);
    });
    nodes.push(ol);
    var more = K.addable(routine, list);
    if (list.length >= K.MAX) nodes.push(para('Six is plenty. Remove one to make room for another.', 'muted small'));
    else if (more.length) {
      var add = el('div', 'rt-add'); add.appendChild(el('b', '', 'Add a step'));
      more.forEach(function (id) {
        var c = K.CATALOG[id], b = el('button', 'rt-addbtn'); b.type = 'button'; b.dataset.add = id;
        b.appendChild(el('b', '', c.label)); b.appendChild(el('small', '', c.blurb));
        b.addEventListener('click', function () { K.addStep(list, id); saved(); });
        add.appendChild(b);
      });
      nodes.push(add);
    }
    show('Edit ' + K.ROUTINES[routine].short.toLowerCase() + ' routine', nodes, [
      { label: 'The usual', id: 'reset', fn: function () { r.lists[routine] = K.defaults(routine); saved(); } },
      { label: 'Done', primary: true, id: 'done', fn: function () { openRoutine(routine); } }]);
  }
  function label(routine) { var b = doc.getElementById('panel-routine-' + routine); if (b && R()) b.textContent = R().panelLabel(routine, data().lists[routine]); }

  /* ---------- running: walk to each step's place in turn ---------- */
  function begin(routine) {
    var K = R(), r = data(), rn = K.startRun(r, routine, api.today(), nowIso()); api.save();
    hideCard(); close();
    active = { routine: routine, run: rn, token: {} , walker: 0 };
    goStep();
  }
  function stop() { /* keeps the run where it is for later */
    var a = active; active = null;
    if (a && a.walker) clearInterval(a.walker);
    if (cleanup) { cleanup(); cleanup = null; }
    close();
  }
  function spotFor(c) { var s = c.scene && W().SCENES[c.scene]; return s ? s.spots.filter(function (sp) { return sp.id === c.spot; })[0] || null : null; }
  function goStep() {
    var a = active; if (!a) return;
    var K = R(), step = K.current(a.run);
    if (!step) { finishRoutine(a); return; }
    var c = K.CATALOG[step.id], spot = spotFor(c);
    if (!spot) { runStep(step, null); return; } /* any room: right where she is */
    if (api.scene() !== c.scene) { travel(c.scene, function () { walk(step, spot); }); return; }
    walk(step, spot);
  }
  /* a different room: fade, arrive by the door that leads there when this room has one */
  function travel(sceneId, then) {
    var cur = W().SCENES[api.scene()], door = cur && cur.doors.filter(function (d) { return d.to === sceneId; })[0];
    var scene = doc.getElementById('scene'); if (scene) scene.classList.add('fading');
    api.toast('Off to the ' + W().SCENES[sceneId].name.toLowerCase(), 1400);
    setTimeout(function () {
      if (!active) { if (scene) scene.classList.remove('fading'); return; }
      api.enter(sceneId, door ? door.arrive : undefined);
      if (scene) scene.classList.remove('fading');
      then();
    }, 320);
  }
  function walk(step, spot) {
    var a = active, me = api.me(), G = root.EbbGame, stand = spot.stand;
    if (me.action === 'sit') api.stand();
    if (!W().plan(api.scene(), { x: me.x, y: me.y }, stand)) { runStep(step, spot); return; } /* nowhere to walk: do it here */
    G.walkTo(stand, null);
    api.toast(R().CATALOG[step.id].label + ': ' + R().CATALOG[step.id].where.toLowerCase(), 1600);
    var idleSince = 0, retries = 0;
    if (a.walker) clearInterval(a.walker);
    a.walker = setInterval(function () {
      if (active !== a) { clearInterval(a.walker); return; }
      var m = api.me(), near = Math.hypot(m.x - stand.x, m.y - stand.y) < 2;
      if (near && m.action !== 'walk') { clearInterval(a.walker); a.walker = 0; runStep(step, spot); return; }
      if (m.action === 'walk') { idleSince = 0; return; } /* on her way (perhaps somewhere else, after a tap) */
      idleSince += 150;
      if (idleSince > 1500) { idleSince = 0; retries += 1; if (retries > 3) { clearInterval(a.walker); a.walker = 0; runStep(step, spot); } else G.walkTo(stand, null); }
    }, 150);
  }

  function runStep(step, spot) {
    var a = active; if (!a) return;
    var c = R().CATALOG[step.id];
    if (c.kind === 'timed') timed(step, c, spot);
    else if (c.kind === 'text') text(step, c);
    else if (c.kind === 'log') log(step, c, spot);
    else if (c.kind === 'meditate') meditate(step, c);
    else if (c.kind === 'bed') { api.toast('Lights down. Goodnight.', 3200); complete(step, null, null, nowIso()); }
  }
  /* a routine step that hands over to the meditation library; the step is done when a practice finishes */
  function meditate(step, c) {
    var E = root.EbbMeditate;
    if (!E || !E.open) { complete(step, null, null, nowIso()); return; }
    E.open({ onDone: function () { complete(step, null, null, nowIso()); }, onCancel: function () { skip(step); } });
  }
  function head(c, rn) { var h = el('div', 'rt-head'); h.appendChild(el('b', '', c.label)); h.appendChild(el('small', 'muted', 'Step ' + (rn.index + 1) + ' of ' + rn.steps.length)); if (clipFor((c.cues || [[0, '']])[0][1])) h.appendChild(voiceBtn()); return h; }

  function timed(step, c, spot) {
    var a = active, K = R(), t = K.timer(step.secs), startIso = nowIso(), sat = false;
    if (c.sit && spot) { api.sit({ x: spot.at.x, y: spot.at.y + 0.2 }, c.pose || null); sat = true; }
    else if (c.pose && spot) { var pa = c.poseAt || spot.stand; api.sit({ x: pa.x, y: pa.y }, c.pose); sat = true; } /* a standing pose held on open floor: the stretch, beside the cushion rather than on it */
    var cap = el('p', 'rt-cue'); cap.setAttribute('aria-live', 'polite');
    var clock = el('p', 'rt-clock'), back = el('p', 'muted small rt-back');
    show(K.ROUTINES[a.routine].label, [head(c, a.run), cap, clock, back], [
      { label: 'Pause', id: 'pause', fn: function (b) { if (t.paused) K.resume(t, Date.now()); else { K.pause(t, Date.now()); hush(); } b.textContent = t.paused ? 'Resume' : 'Pause'; paint(); } },
      { label: 'Skip', id: 'skip', fn: function () { over(); if (sat) api.stand(spot.stand.y); skip(step); } },
      { label: 'Stop for now', id: 'stop', fn: function () { over(); if (sat) api.stand(spot.stand.y); stop(); api.toast('Kept for later. Carry on from More whenever you like.', 2800); } }
    ], 'running');
    var shown = -1, backTimer = 0, done = false;
    function paint() {
      var i = K.cueAt(c.cues, t); if (i !== shown) { shown = i; cap.textContent = c.cues[i][1]; var talk = t.paused ? 0 : say(c.cues[i][1]), fx = c.cues[i][2]; if (fx && root.EbbSound && root.EbbSound.play) setTimeout(function () { if (active) root.EbbSound.play(fx); }, talk ? talk + 250 : 0); } /* a cue can carry a small sound (the gulp), played once Erin has finished speaking */
      clock.textContent = K.clockText(t);
    }
    function onVis() {
      K.setHidden(t, doc.hidden, Date.now());
      if (!doc.hidden) { back.textContent = 'Welcome back. The clock waited while you were away.'; clearTimeout(backTimer); backTimer = setTimeout(function () { back.textContent = ''; }, 5000); }
    }
    doc.addEventListener('visibilitychange', onVis);
    K.setHidden(t, doc.hidden, Date.now());
    var iv = setInterval(function () { K.tick(t, Date.now()); paint(); if (t.ended && !done) { done = true; over(); if (sat) api.stand(spot.stand.y); complete(step, t, startIso, nowIso()); } }, 250);
    cleanup = function () { clearInterval(iv); clearTimeout(backTimer); doc.removeEventListener('visibilitychange', onVis); };
    function over() { hush(); if (cleanup) { cleanup(); cleanup = null; } }
    paint();
  }

  function text(step, c) {
    var a = active, K = R(), startIso = nowIso();
    var box = el('input', 'rt-input'); box.type = 'text'; box.maxLength = K.NOTE_MAX; box.placeholder = c.placeholder || ''; box.setAttribute('aria-label', c.label);
    box.autocomplete = 'off';
    var prior = a.run.notes[step.id]; if (prior) box.value = prior;
    show(K.ROUTINES[a.routine].label, [head(c, a.run), para(c.blurb, 'muted'), box], [
      { label: 'Skip', id: 'skip', fn: function () { skip(step); } },
      { label: 'Stop for now', id: 'stop', fn: function () { stop(); api.toast('Kept for later.', 2200); } },
      { label: 'Keep it', primary: true, id: 'save', fn: function () { K.setNote(a.run, step.id, box.value); api.save(); complete(step, null, startIso, nowIso()); } }
    ]);
    box.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); K.setNote(a.run, step.id, box.value); api.save(); complete(step, null, startIso, nowIso()); } });
    setTimeout(function () { box.focus(); }, 50);
  }

  /* the pop-up log does its own work; the step is done when it closes */
  function log(step, c, spot) {
    var a = active, startIso = nowIso();
    close();
    var opened = false;
    if (root.EbbLog && typeof root.EbbLog.open === 'function') { try { root.EbbLog.open(c.topic); opened = true; } catch (e) { console.error(e); } }
    else if (spot) { try { root.EbbGame.act({ spot: spot }); opened = true; } catch (e) { console.error(e); } }
    if (!opened) { api.toast('The log is not here today. On we go.', 2200); complete(step, null, startIso, nowIso()); return; }
    var seen = false, waited = 0;
    a.walker = setInterval(function () {
      if (active !== a) { clearInterval(a.walker); return; }
      var up = !!doc.querySelector('.ebb-log'); waited += 200;
      if (up) seen = true;
      else if (seen || waited > 4000) { clearInterval(a.walker); a.walker = 0; complete(step, null, startIso, nowIso()); }
    }, 200);
  }

  function skip(step) { var a = active; if (!a) return; R().advance(a.run, 'skipped', nowIso()); api.save(); close(); next(a); }
  /* a completed step: a mindfulness observation (the course's shape, with the routine named), a chime, then on to the next */
  function complete(step, t, startIso, endIso) {
    var a = active; if (!a) return;
    var K = R(), o = K.observation(a.routine, step, t, startIso || endIso, endIso);
    try { var rec = root.EbbStore.addPractice(o); rec.routine = o.routine; rec.step = o.step; } catch (e) { console.error(e); }
    K.advance(a.run, 'done', endIso); api.save(); api.refresh();
    close(); chime(); heart();
    next(a);
  }
  function next(a) {
    var K = R(), s = K.current(a.run);
    if (!s) { finishRoutine(a); return; }
    api.toast('Next: ' + K.CATALOG[s.id].label.toLowerCase(), 1800);
    setTimeout(function () { if (active === a) goStep(); }, 900);
  }
  function finishRoutine(a) {
    var K = R();
    if (!a.run.finished) a.run.finished = nowIso();
    api.save(); active = null; if (a.walker) clearInterval(a.walker);
    var n = Object.keys(a.run.done).length;
    show(K.ROUTINES[a.routine].short + ' done', [para(K.ROUTINES[a.routine].done), para(n === a.run.steps.length ? 'Every step, in your own time.' : n + ' of ' + a.run.steps.length + ' steps. The rest can wait for another day.', 'muted')],
      [{ label: 'Close', primary: true, id: 'close', fn: close }], 'finished');
    say(K.ROUTINES[a.routine].done);
    if (a.routine === 'morning' && n > 0) cheer(); else chime();
  }

  /* the morning is done: a happy little double hop, a sparkle burst over her, and a jingle to start the day */
  function cheer() {
    if (root.EbbSound && root.EbbSound.play) root.EbbSound.play('cheer');
    var me = doc.getElementById('me'), m = api.me();
    if (root.EbbProps && root.EbbProps.sparkles) api.fx(root.EbbProps.sparkles(m.x, m.y - 14, 9), 1800);
    if (!me || doc.documentElement.getAttribute('data-motion') === 'reduce' || (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    me.classList.remove('hop'); void me.getBoundingClientRect(); me.classList.add('hop');
    setTimeout(function () { me.classList.remove('hop'); }, 1900);
  }

  /* ---------- the gentle card when the app opens in the morning or evening ---------- */
  function showCard(routine, resume) {
    hideCard();
    var K = R();
    card = el('div', 'routine-card'); card.setAttribute('role', 'region'); card.setAttribute('aria-label', K.ROUTINES[routine].label); card.dataset.routine = routine;
    card.appendChild(para(K.promptLine(routine, resume)));
    var row = el('div', 'rt-cardrow');
    var no = el('button', 'btn small', 'Not now'); no.type = 'button'; no.dataset.act = 'notnow';
    no.addEventListener('click', function (e) { e.stopPropagation(); K.notNow(data(), api.today(), routine); api.save(); hideCard(); });
    var yes = el('button', 'btn small primary', resume ? 'Carry on' : 'Start'); yes.type = 'button'; yes.dataset.act = 'start';
    yes.addEventListener('click', function (e) { e.stopPropagation(); begin(routine); });
    row.appendChild(no); row.appendChild(yes); if (clipFor(K.promptLine(routine, resume))) row.insertBefore(voiceBtn(), no); card.appendChild(row);
    say(K.promptLine(routine, resume)); /* Erin asks; a browser that blocks sound before the first tap simply stays quiet */
    card.addEventListener('click', function (e) { e.stopPropagation(); });
    var app = doc.querySelector('.app'); (app || doc.body).appendChild(card);
  }
  function hideCard() { if (card) { card.remove(); card = null; hush(); } }
  function maybePrompt(hour) {
    clearTimeout(promptTimer);
    if (!R() || active || card) return;
    var p = R().promptFor(data(), api.today(), hour === undefined ? new Date().getHours() : hour);
    if (!p) return;
    if (anyModal()) { promptTimer = setTimeout(function () { maybePrompt(hour); }, 3000); return; }
    showCard(p.routine, p.resume);
  }

  /* ---------- wiring ---------- */
  function start(a) {
    api = a;
    ['morning', 'evening'].forEach(function (k) {
      root.EbbGame.registerPanel({ id: 'routine-' + k, label: R() ? R().panelLabel(k, data().lists[k]) : (k === 'morning' ? 'Morning routine' : 'Evening routine'), open: function () { openRoutine(k); } });
    });
    promptTimer = setTimeout(function () { maybePrompt(); }, 1500);
    doc.addEventListener('visibilitychange', function () { if (!doc.hidden && !card && !active) { clearTimeout(promptTimer); promptTimer = setTimeout(function () { maybePrompt(); }, 800); } });
  }
  doc.addEventListener('ebb:ready', function (e) { start(e.detail || root.EbbGame.api); });
  if (root.EbbGame._ready) start(root.EbbGame.api);

  root.EbbRoutines = { open: openRoutine, edit: openEditor, start: begin, stop: stop, prompt: function (hour) { maybePrompt(hour); }, card: function (routine, resume) { showCard(routine, !!resume); },
    active: function () { return active ? { routine: active.routine, index: active.run.index } : null; }, rules: R };
})(window);
