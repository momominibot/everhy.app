/* Ebb course workstream: an MBSR-informed eight-week course (More > Course), a practice runner richer than the cushion's,
 * practice history with an opt-in monthly summary, and the bedroom cushion opening the runner once the course has
 * started. Rules live in js/course/core.js and copy in js/course/content.js; both load from here so index.html needs no
 * change. Captions carry every cue; Erin's voice (js/course/voice.js) is optional and never required. Nothing is scored and nothing counts while the page is hidden. */
(function (root) {
  'use strict';
  var doc = root.document;
  if (!doc || !root.EbbGame) return;

  /* load the pure modules in order; scripts added before the load event still run before the game boots */
  ['js/course/content.js', 'js/course/voice.js', 'js/course/core.js'].forEach(function (src) {
    if (doc.querySelector('script[src="' + src + '"]')) return;
    var s = doc.createElement('script'); s.src = src; s.async = false; doc.head.appendChild(s);
  });
  function K() { return root.EbbCourse; }
  function T() { return root.EbbCourseContent; }

  /* icons come as three strips of three (icons_1..3, reading order of ICON in content.js); each shows once it loads */
  var ART = { s1: 'art/course/icons_1.webp', s2: 'art/course/icons_2.webp', s3: 'art/course/icons_3.webp', cover: 'art/course/cover.webp' }, has = {};
  function probe(key) {
    if (has[key] !== undefined) return;
    has[key] = false;
    var im = new Image(); im.onload = function () { has[key] = true; doc.querySelectorAll('.course-wrap').forEach(paintArt); }; im.src = ART[key];
  }
  function paintArt(scope) {
    ['s1', 's2', 's3'].forEach(function (s) { if (has[s]) scope.querySelectorAll('.cicon.' + s).forEach(function (e) { e.classList.add('art'); }); });
    if (has.cover) scope.querySelectorAll('.course-cover').forEach(function (e) { e.classList.add('art'); });
  }

  function course(api) { var st = api.state(); st.course = K().clean(st.course); return st.course; }
  function el(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function icon(i, label) {
    var e = el('span', 'cicon s' + (Math.floor(i / 3) + 1), label === undefined ? '' : String(label));
    e.style.setProperty('--f', String(i % 3)); e.setAttribute('aria-hidden', 'true');
    return e;
  }
  function fmtDate(day) {
    var p = day.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

  /* ---------- one sheet at a time, its own keys kept away from the walking controls ---------- */
  var wrap = null, cleanup = null;
  function show(title, nodes, actions) {
    if (cleanup) { cleanup(); cleanup = null; }
    if (!wrap) {
      wrap = el('div', 'sheet-wrap course-wrap');
      wrap.addEventListener('keydown', function (e) { e.stopPropagation(); });
      wrap.addEventListener('click', function (e) { e.stopPropagation(); });
      doc.body.appendChild(wrap);
    }
    wrap.innerHTML = '';
    var sh = el('section', 'sheet course-sheet'); sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-label', title);
    sh.appendChild(el('h2', '', title));
    var body = el('div', 'sheet-body course-body'); nodes.forEach(function (n) { if (n) body.appendChild(n); }); sh.appendChild(body);
    var bar = el('div', 'sheet-actions');
    actions.forEach(function (a) {
      var b = el('button', a.primary ? 'btn primary' : 'btn', a.label); b.type = 'button';
      if (a.id) b.dataset.act = a.id; if (a.disabled) b.disabled = true;
      b.addEventListener('click', function () { a.fn(b); }); bar.appendChild(b);
    });
    sh.appendChild(bar); wrap.appendChild(sh); paintArt(wrap);
    var first = sh.querySelector('button:not([disabled])'); if (first) first.focus();
    return sh;
  }
  function close() { if (cleanup) { cleanup(); cleanup = null; } if (wrap) { wrap.remove(); wrap = null; } }
  function para(text, cls) { return el('p', cls || '', text); }
  function pills(label, opts, value, onPick) {
    var row = el('div', 'choice'); row.appendChild(el('span', '', label));
    var g = el('div', 'pills'); g.setAttribute('role', 'group'); g.setAttribute('aria-label', label);
    opts.forEach(function (o) {
      var b = el('button', 'pill', o.label); b.type = 'button'; b.dataset.v = String(o.v); b.setAttribute('aria-pressed', String(o.v === value));
      b.addEventListener('click', function () { g.querySelectorAll('.pill').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); }); b.setAttribute('aria-pressed', 'true'); onPick(o.v); });
      g.appendChild(b);
    });
    row.appendChild(g); return row;
  }

  /* ---------- the course home ---------- */
  function home(api) {
    probe('s1'); probe('s2'); probe('s3'); probe('cover');
    var c = course(api), today = api.today(), copy = T().COPY, nodes = [];
    var cover = el('div', 'course-cover'); cover.appendChild(el('strong', '', copy.name)); cover.appendChild(el('span', '', copy.kind)); nodes.push(cover);
    if (!c.started) {
      nodes.push(para('Eight weekly themes. Each week has a short introduction, two or three practices of 3 to 5 minutes, and a small everyday invitation.'));
      nodes.push(para('A new week becomes available seven days after you begin the one before, and opens only when you choose. Missing days never resets anything.', 'muted'));
      nodes.push(para(copy.draft, 'muted small'));
      return show('Course', nodes, [{ label: 'Close', fn: close }, { label: 'Start the course', primary: true, id: 'start', fn: function () { K().start(c, today); api.save(); home(api); } }]);
    }
    if (c.stopped) {
      nodes.push(para('You paused the course on ' + fmtDate(c.stopped) + '. Come back whenever you like. Your weeks are kept.'));
      return show('Course', nodes, [{ label: 'Close', fn: close }, { label: 'Carry on', primary: true, id: 'resume', fn: function () { K().start(c, today); api.save(); home(api); } }]);
    }
    var list = el('ol', 'course-weeks');
    T().WEEKS.forEach(function (w) {
      var state = K().weekState(c, w.n, today), li = el('li'), b = el('button', 'course-week ' + state); b.type = 'button'; b.dataset.week = String(w.n);
      b.appendChild(icon(w.icon, w.n));
      var txt = el('span', 'cw-text'); txt.appendChild(el('b', '', 'Week ' + w.n + ': ' + w.title));
      txt.appendChild(el('small', '', { current: 'This week', open: 'Open any time', ready: 'Ready when you are', soon: 'Opens ' + fmtDate(K().nextOpensOn(c) || today), later: 'Later' }[state]));
      b.appendChild(txt);
      if (state === 'later' || state === 'soon') b.disabled = true;
      b.addEventListener('click', function () {
        if (state === 'ready') { K().beginNext(c, today); api.save(); }
        week(api, w.n);
      });
      li.appendChild(b); list.appendChild(li);
    });
    nodes.push(list);
    var stopLink = el('button', 'linkish', 'Pause the course'); stopLink.type = 'button'; stopLink.dataset.act = 'stop';
    stopLink.addEventListener('click', function () { K().stop(c, today); api.save(); home(api); });
    nodes.push(stopLink);
    return show('Course', nodes, [{ label: 'Close', fn: close }, { label: 'Your practice', id: 'history', fn: function () { history(api, function () { home(api); }); } }]);
  }

  function week(api, n) {
    var w = T().WEEKS[n - 1], P = T().PRACTICES, nodes = [], ci = T().CHECKIN;
    var head = el('div', 'course-head'); head.appendChild(icon(w.icon, n)); head.appendChild(el('b', '', w.title)); nodes.push(head);
    nodes.push(para(w.intro));
    var cards = el('div', 'course-cards');
    w.practices.forEach(function (id) {
      var p = P[id], b = el('button', 'course-card'); b.type = 'button'; b.dataset.practice = id;
      b.appendChild(icon(p.icon, p.title.charAt(0)));
      var t = el('span', 'cw-text'); t.appendChild(el('b', '', p.title)); t.appendChild(el('small', '', p.minutes + ' min. ' + p.blurb)); b.appendChild(t);
      b.addEventListener('click', function () { setup(api, id, function () { week(api, n); }, function () { week(api, n); }); });
      cards.appendChild(b);
    });
    nodes.push(cards);
    var inv = el('div', 'course-box'); inv.appendChild(el('b', '', 'Everyday invitation')); inv.appendChild(para(w.invitation)); nodes.push(inv);
    /* teacher check-in: a placeholder until real human contact is set up (see CHECKIN.staffNote) */
    var chk = el('div', 'course-box checkin'); chk.dataset.status = ci.status; chk.appendChild(el('b', '', ci.title)); chk.appendChild(para(ci.body));
    var cb = el('button', 'btn small', ci.action); cb.type = 'button'; cb.disabled = true; chk.appendChild(cb); nodes.push(chk);
    nodes.push(para(T().COPY.draft, 'muted small'));
    show('Week ' + n, nodes, [{ label: 'Back', id: 'back', fn: function () { home(api); } }]);
  }

  /* ---------- choosing length, anchor or the seated version ---------- */
  function setup(api, id, back, after) {
    var c = course(api), voice = root.EbbCourseVoice;
    var p = T().PRACTICES[id], opts = { minutes: p.minutes, anchor: p.anchors ? p.anchors[0] : p.anchor, variant: 'standard', voice: voice ? c.voice : 'off' }, nodes = [];
    var head = el('div', 'course-head'); head.appendChild(icon(p.icon, p.title.charAt(0))); head.appendChild(el('b', '', p.title)); nodes.push(head);
    nodes.push(para(p.blurb));
    if (p.note) nodes.push(para(p.note, 'muted'));
    nodes.push(pills('Length', [{ v: 3, label: '3 min' }, { v: 5, label: '5 min' }, { v: 10, label: '10 min (longer)' }], opts.minutes, function (v) { opts.minutes = v; }));
    if (p.anchors) nodes.push(pills('Rest attention on', p.anchors.map(function (a) { return { v: a, label: { breath: 'Breath', sound: 'Sounds', touch: 'Touch' }[a] }; }), opts.anchor, function (v) { opts.anchor = v; }));
    if (p.seated) nodes.push(pills('Position', [{ v: 'standard', label: 'Standing' }, { v: 'seated', label: 'Seated' }], 'standard', function (v) { opts.variant = v; }));
    if (voice) nodes.push(pills('Voice', [{ v: 'erin', label: 'Erin’s voice' }, { v: 'off', label: 'Captions only' }], opts.voice, function (v) { opts.voice = v; c.voice = v; api.save(); }));
    nodes.push(para('You can pause or end at any time. Captions show every cue, with or without the voice.', 'muted small'));
    show(p.title, nodes, [{ label: 'Back', id: 'back', fn: back }, { label: 'Begin', primary: true, id: 'begin', fn: function () { run(api, id, opts, after); } }]);
  }

  /* ---------- the runner ---------- */
  function run(api, id, opts, after) {
    var E = K(), p = T().PRACTICES[id], cues = E.cuesFor(id, opts.variant), t = E.timer(opts.minutes * 60), startIso = new Date().toISOString();
    var cap = el('p', 'course-cue'); cap.setAttribute('aria-live', 'polite');
    var clock = el('p', 'course-clock'), back = el('p', 'muted small course-back');
    var audio = el('audio', 'course-voice'); audio.preload = 'auto'; audio.hidden = true; /* one element for every cue, first played inside the Begin tap */
    var head = el('div', 'course-head'); head.appendChild(icon(p.icon, p.title.charAt(0))); head.appendChild(el('b', '', p.title + (opts.variant === 'seated' ? ' (seated)' : '')));
    var sh = show('Practice', [head, cap, clock, back, audio], [
      { label: 'Pause', id: 'pause', fn: function (b) { if (t.paused) E.resume(t, Date.now()); else E.pause(t, Date.now()); b.textContent = t.paused ? 'Resume' : 'Pause'; listen(); paint(); } },
      { label: 'End', primary: true, id: 'end', fn: function () { E.end(t, Date.now()); done(); } }]);
    sh.classList.add('running');
    var shown = -1, backTimer = 0;
    function paint() {
      var i = E.cueAt(cues, t); if (i !== shown) { shown = i; cap.textContent = cues[i][1]; say(cues[i][1]); }
      var left = E.leftSec(t);
      clock.textContent = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0') + ' left' + (t.paused ? ', paused' : '');
    }
    function say(text) {
      var src = opts.voice === 'erin' ? E.clipFor(root.EbbCourseVoice, text) : null;
      audio.pause();
      if (!src) { audio.removeAttribute('src'); return; }
      audio.src = src; listen();
    }
    function listen() { /* the voice follows the timer: silent while paused, hidden or ended */
      if (!audio.getAttribute('src') || audio.ended) return;
      if (E.counting(t)) { var pr = audio.play(); if (pr && pr.catch) pr.catch(function () { }); } else audio.pause();
    }
    function onVis() {
      E.setHidden(t, doc.hidden, Date.now()); listen();
      if (!doc.hidden) { back.textContent = 'Welcome back. The timer waited while you were away.'; clearTimeout(backTimer); backTimer = setTimeout(function () { back.textContent = ''; }, 5000); }
    }
    doc.addEventListener('visibilitychange', onVis);
    E.setHidden(t, doc.hidden, Date.now());
    var iv = setInterval(function () { E.advance(t, Date.now()); paint(); if (t.ended) done(); }, 250);
    cleanup = function () { clearInterval(iv); clearTimeout(backTimer); doc.removeEventListener('visibilitychange', onVis); audio.pause(); audio.removeAttribute('src'); };
    paint();
    var over = false;
    function done() {
      if (over) return; over = true;
      if (cleanup) { cleanup(); cleanup = null; }
      notice(api, id, opts, t, startIso, new Date().toISOString(), after);
    }
  }

  function notice(api, id, opts, t, startIso, endIso, after) {
    var box = el('textarea', 'course-note'); box.rows = 3; box.maxLength = 500; box.setAttribute('aria-label', 'What did you notice? Optional');
    box.placeholder = 'Anything at all, or nothing.';
    show('What did you notice?', [para('Optional. You can keep it to yourself.', 'muted'), box], [
      { label: 'Skip', id: 'skip', fn: function () { saveStep(api, id, opts, t, startIso, endIso, '', after); } },
      { label: 'Continue', primary: true, id: 'continue', fn: function () { saveStep(api, id, opts, t, startIso, endIso, box.value.trim(), after); } }]);
  }

  /* saving is its own step: ending never saves by itself */
  function saveStep(api, id, opts, t, startIso, endIso, note, after) {
    var E = K(), fin = E.finished(t);
    var line = (fin ? 'You stayed with it to the end.' : 'You practised for ' + E.minutesText(E.activeSec(t)) + '.') + ' A wandering mind, or no change at all, is part of practice.';
    function save() {
      var rec = root.EbbStore.addPractice(E.record(id, opts, t, startIso, endIso));
      if (note) { var c = course(api); c.notes[rec.id] = { date: rec.date, text: note.slice(0, 500) }; api.save(); }
      return rec;
    }
    show('Save this practice?', [para(line)], [
      { label: 'Don’t save', id: 'nosave', fn: function () { finish(api, after); } },
      { label: 'That felt hard', id: 'hard', fn: function () { hard(api, save, after); } },
      { label: 'Save', primary: true, id: 'save', fn: function () { save(); api.toast('Saved to your practice history'); finish(api, after); } }]);
  }

  function hard(api, save, after) {
    var c = course(api), nodes = T().COPY.hard.map(function (s, i) { return para(s, i ? 'muted' : ''); });
    var stopped = el('p', 'muted small'); nodes.push(stopped);
    show('That felt hard', nodes, [
      { label: 'Pause the course', id: 'stopcourse', disabled: !K().active(c), fn: function (b) {
        K().stop(c, api.today()); api.save(); b.disabled = true; b.textContent = 'Course paused';
        stopped.textContent = 'The course is paused. The cushion goes back to the simple sitting practice, and you can carry on from More, Course whenever you like.'; } },
      { label: 'Don’t save', id: 'nosave', fn: function () { finish(api, after); } },
      { label: 'Save', primary: true, id: 'save', fn: function () { save(); api.toast('Saved to your practice history'); finish(api, after); } }]);
  }
  function finish(api, after) { if (after) after(); else close(); }

  /* ---------- history and the opt-in monthly summary ---------- */
  var NAMES = { sitting: 'Sitting (cushion)' };
  function history(api, back) {
    var E = K(), c = course(api), list = E.practices(api.state().observations), nodes = [];
    var opt = el('label', 'course-optin'), cb = el('input'); cb.type = 'checkbox'; cb.checked = c.summaryOptIn;
    opt.appendChild(cb); opt.appendChild(el('span', '', 'Show a monthly summary'));
    var sum = el('p', 'course-summary');
    function paintSum() {
      sum.hidden = !c.summaryOptIn;
      sum.textContent = c.summaryOptIn ? E.summaryText(E.monthSummary(api.state().observations, api.today().slice(0, 7))) : '';
    }
    cb.addEventListener('change', function () { c.summaryOptIn = cb.checked; api.save(); paintSum(); });
    nodes.push(opt, sum); paintSum();
    if (!list.length) nodes.push(para('No saved practices yet.', 'muted'));
    var ul = el('ul', 'course-history');
    list.slice(0, 40).forEach(function (o) {
      var p = T().PRACTICES[o.practice], li = el('li');
      li.appendChild(el('b', '', p ? p.title : NAMES[o.practice] || o.practice));
      li.appendChild(el('span', '', fmtDate(o.date) + ', ' + E.minutesText(o.activeSec) + ', ' + (o.status === 'finished' ? 'ran to the end' : 'ended early')));
      ul.appendChild(li);
    });
    nodes.push(ul);
    nodes.push(para('No scores and no streaks. This is just a record for you.', 'muted small'));
    show('Your practice', nodes, [{ label: 'Back', id: 'back', fn: back }]);
  }

  /* ---------- the bedroom cushion ---------- */
  function cushion(spot, api) {
    var sitAt = { x: spot.at.x, y: spot.at.y + 0.2 }, up = function () { api.stand(spot.stand.y); };
    if (!K() || K().cushionMode(course(api)) !== 'course') { /* the course has not started: the simple practice, as before */
      api.sit(sitAt); root.EbbUi.openPractice(up); return;
    }
    api.sit(sitAt);
    var c = course(api), P = T().PRACTICES, nodes = [para('Week ' + c.weekReached + ' of the course. Choose a practice.')];
    var cards = el('div', 'course-cards');
    K().openPractices(c).forEach(function (id) {
      var p = P[id], b = el('button', 'course-card'); b.type = 'button'; b.dataset.practice = id;
      b.appendChild(icon(p.icon, p.title.charAt(0)));
      var tx = el('span', 'cw-text'); tx.appendChild(el('b', '', p.title)); tx.appendChild(el('small', '', p.minutes + ' min. ' + p.blurb)); b.appendChild(tx);
      b.addEventListener('click', function () { setup(api, id, pick, done); });
      cards.appendChild(b);
    });
    nodes.push(cards);
    function done() { close(); up(); }
    function pick() {
      show('On the cushion', nodes, [
        { label: 'Not now', id: 'notnow', fn: done },
        { label: 'Simple sitting', id: 'simple', fn: function () { close(); root.EbbUi.openPractice(up); } }]);
    }
    pick();
  }

  root.EbbGame.registerPanel({ id: 'course', label: 'Course', open: function (api) { home(api); } });
  root.EbbGame.registerKind('cushion', cushion);
  root.EbbCourseUi = { open: function () { return !!wrap; }, close: close };
})(window);
