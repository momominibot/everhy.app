/* Ebb Log: a bottom-sheet chat with Ovia, the mascot (the 'ebb' speaker key in saved threads is kept as is) where she says how things are in her own words. It opens from things in her rooms
 * (spot kind 'log' with a topic: toilet, mirror, cabinet, bedside table, bed, desk) or from the More menu. A local
 * parser suggests entries, every write waits for her on an editable card (calendar changes too), "undo" reverses the
 * last write for 24 hours, and the ring and calendar read confirmed entries only. Nothing is ever required, and
 * logging never changes game progress. Safety hooks are optional. */
(function (root) {
  'use strict';
  var doc = root.document;
  var me = doc.currentScript, base = me && me.src ? me.src.replace(/js\/ext\/log\.js.*$/, '') : '';
  var LP, C, M, api = null, wrap = null, topic = 'general', since = 0;
  var view = 'chat', month = null, picked = null, stage = null, pending = null, clarify = null, quick = null, editing = false;

  /* the pure modules live in js/log/; load them in order, once */
  var loading = null;
  function load() {
    if (loading) return loading;
    loading = ['parse', 'cycle', 'model'].reduce(function (p, name) {
      return p.then(function () {
        return new Promise(function (ok, bad) {
          var s = doc.createElement('script'); s.src = base + 'js/log/' + name + '.js'; s.async = false;
          s.onload = ok; s.onerror = function () { bad(new Error('could not load ' + name)); }; doc.head.appendChild(s);
        });
      });
    }, Promise.resolve()).then(function () { LP = root.EbbLogParse; C = root.EbbCycle; M = root.EbbLogModel; });
    return loading;
  }
  load().catch(function (e) { console.error(e); });

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function st() { return api.state(); }
  function today() { return api.today(); }
  function yesterday() { return C.addDays(today(), -1); }
  function L() { return M.ensure(st()); }

  /* ---------- topics: one opening line and a few quick picks each; free text always works ---------- */
  function item(type, value, extra) { return function () { var it = { type: type, value: value, start: today(), end: today(), confidence: 1 }; if (extra) Object.keys(extra).forEach(function (k) { it[k] = extra[k]; }); return it; }; }
  var TOPICS = {
    general: { title: 'Log', ring: true, tabs: true, chips: [
      { label: 'Bleeding', icon: 'drop', pick: 'bleeding' }, { label: 'Symptoms', icon: 'swirl', pick: 'symptoms' },
      { label: 'All good', icon: 'sun', say: 'all good' }, { label: 'Not sure', icon: 'unsure', say: 'not sure' }, { label: 'Same as yesterday', say: 'same as yesterday' }] },
    bleeding: { title: 'Flow and discharge', ring: true, line: 'Anything to note about bleeding or discharge today? Tap what fits, or say it your way. Nothing here is required.', chips: [
      { label: 'No bleeding', item: item('bleeding', 'none') }, { label: 'Spotting', icon: 'drop', item: item('bleeding', 'spotting') },
      { label: 'Light', item: item('bleeding', 'light') }, { label: 'Medium', item: item('bleeding', 'medium') }, { label: 'Heavy', item: item('bleeding', 'heavy') },
      { label: 'Mucus', pick: 'mucus' }, { label: 'How it feels', pick: 'sensation' }, { label: 'Not sure', icon: 'unsure', say: 'not sure' }] },
    body: { title: 'Body', line: 'How is your body today? Skin, aches, anything you noticed. Tap or type, or close this if there is nothing.', chips: [
      { label: 'Cramps', item: item('symptom', 'cramps') }, { label: 'Bloating', item: item('symptom', 'bloating') }, { label: 'Headache', item: item('symptom', 'headache') },
      { label: 'Sore breasts', item: item('symptom', 'breast tenderness') }, { label: 'Breakout', item: item('symptom', 'acne') }, { label: 'Dry skin', item: item('symptom', 'dry skin') },
      { label: 'Back ache', item: item('pain', null, { unit: '/10', location: ['back'] }) }, { label: 'Pain level', pick: 'pain' },
      { label: 'All good', icon: 'sun', say: 'all good' }, { label: 'Not sure', icon: 'unsure', say: 'not sure' }] },
    cycle: { title: 'Cycle', ring: true, tabs: true, line: 'Here is your cycle so far. Did a period start, or would you like to look back?', chips: [
      { label: 'Period started today', icon: 'drop', item: item('bleeding', 'period') }, { label: 'Started yesterday', item: function () { var it = item('bleeding', 'period')(); it.start = it.end = yesterday(); return it; } },
      { label: 'Calendar', view: 'calendar' }, { label: 'My cycle lengths', say: 'how long were my last 6 cycles?' }, { label: 'Next period', say: 'when is my next period?' },
      { label: 'Not sure', icon: 'unsure', say: 'not sure' }] },
    temperature: { title: 'Waking temperature', line: 'If you take your temperature when you wake, you can note it here. Skip any day you like.', chips: [
      { label: 'Enter it', pick: 'temp' }, { label: 'Didn’t take it', skip: 'No problem. Nothing saved.' }] },
    sleep: { title: 'Sleep', line: 'How did you sleep? A tap is enough, or tell me more.', chips: [
      { label: 'Slept well', icon: 'sun', item: item('sleepQuality', 'good') }, { label: 'Slept badly', item: item('sleepQuality', 'poor') },
      { label: 'Hours', pick: 'hours' }, { label: 'Woke up tired', item: item('energy', 'low') }, { label: 'Not sure', icon: 'unsure', say: 'not sure' }] },
    mood: { title: 'Journal', journal: true, line: 'How are you feeling? Write as much or as little as you like. Nothing is saved until you tap Save.', chips: [
      { label: 'Good', icon: 'sun', item: item('mood', 'good') }, { label: 'Low', item: item('mood', 'low') }, { label: 'Anxious', item: item('mood', 'anxious') },
      { label: 'Stressed', item: item('mood', 'stressed') }, { label: 'Irritable', item: item('mood', 'irritable') },
      { label: 'Tired', item: item('energy', 'low') }, { label: 'Lots of energy', item: item('energy', 'high') }, { label: 'Not sure', icon: 'unsure', say: 'not sure' }] }
  };

  /* ---------- labels ---------- */
  var BLEED_NAMES = { none: 'No bleeding', spotting: 'Spotting', light: 'Light flow', medium: 'Medium flow', heavy: 'Heavy flow', period: 'Period (flow not given)', unsure: 'Bleeding (not sure which)', unknown: 'Cleared' };
  var MUCUS_NAMES = { dry: 'dry or none', sticky: 'sticky', creamy: 'creamy', watery: 'watery', eggwhite: 'clear and stretchy (egg-white-like)' };
  function dayName(d) { return d === today() ? 'today' : d === yesterday() ? 'yesterday' : C.fmt(d); }
  function when(it) { return it.end && it.end !== it.start && it.type !== 'sleep' ? C.fmt(it.start) + ' to ' + dayName(it.end) : it.type === 'sleep' && it.end !== it.start ? 'night to ' + dayName(it.end) : dayName(it.start); }
  function label(it) {
    var maybe = it.hedged ? ' (maybe)' : '', v = it.value;
    switch (it.type) {
      case 'bleeding': return (BLEED_NAMES[v] || v) + maybe;
      case 'clots': return (it.negated ? 'No clots' : v === 'large' ? 'Large clots' : 'Clots') + maybe;
      case 'pain': return v === 0 ? 'No pain' : 'Pain ' + (v == null ? '(not rated)' : (it.estimated ? 'about ' : '') + v + '/10') + (it.location && it.location.length ? ', ' + it.location.join(' and ') : '') + maybe;
      case 'symptom': return (it.negated ? 'No ' + v : v.charAt(0).toUpperCase() + v.slice(1)) + maybe;
      case 'mood': return (it.negated ? 'Not ' : 'Mood: ') + v + maybe;
      case 'energy': return 'Energy: ' + v + maybe;
      case 'sleep': return 'Slept ' + v + ' h' + maybe;
      case 'sleepQuality': return (v === 'poor' ? 'Poor sleep' : 'Good sleep') + maybe;
      case 'mucus': return 'Mucus: ' + (MUCUS_NAMES[v] || v) + maybe;
      case 'sensation': return 'Feels ' + v + maybe;
      case 'temperature': return 'Waking temperature ' + v + ' °' + (it.unit || 'C') + maybe;
      case 'note': var t = String(v || ''); return 'Journal note: “' + (t.length > 80 ? t.slice(0, 78) + '…' : t) + '”';
      case 'checkin': return v === 'all-good' ? 'All good, nothing new' : 'Not sure today';
      default: return it.type + ': ' + v;
    }
  }

  /* ---------- safety hooks (optional) ---------- */
  function crisis(text) { try { return !!(root.EbbSafety && root.EbbSafety.crisis && root.EbbSafety.crisis(text)); } catch (e) { console.error(e); return false; } }
  function safetyAfter(made) {
    if (!root.EbbSafety || !root.EbbSafety.check) return;
    var all = M.activeObs(st()), profile = st().profile || {};
    (made || []).filter(Boolean).forEach(function (o) {
      try {
        var alerts = root.EbbSafety.check(o, all, profile) || [];
        (Array.isArray(alerts) ? alerts : [alerts]).forEach(function (a) { if (a && root.EbbSafety.showAlert) root.EbbSafety.showAlert(a); });
      } catch (e) { console.error(e); }
    });
  }

  /* ---------- writing ---------- */
  function save(items, source, text) {
    var made = M.confirm(st(), items, { source: source, text: text });
    M.say(st(), 'ebb', 'Saved ' + made.length + ' entr' + (made.length === 1 ? 'y' : 'ies') + '. Say “undo” within 24 hours to take it back.');
    api.save();
    safetyAfter(made);
    return made;
  }
  function reply(text) { M.say(st(), 'ebb', text); api.save(); }
  function reset() { pending = null; clarify = null; quick = null; stage = null; editing = false; }

  /* a "spotting or period?" question matters only when no period is logged just before that day */
  function needsClarify(it) {
    if (it.type !== 'bleeding' || it.value !== 'ambiguous') return false;
    var map = C.byDay(M.activeObs(st()));
    for (var i = 1; i <= 2; i++) if (C.PERIOD[map[C.addDays(it.start, -i)]]) return false;
    return true;
  }

  function handle(text, source) {
    var raw = String(text || '').trim(); if (!raw) return;
    if (crisis(raw)) { reset(); render(); return; } /* Safety owns the response: nothing from logging */
    M.say(st(), 'me', raw); api.save();
    var r = LP.parse(raw, today(), { topic: topic });
    var journal = TOPICS[topic] && TOPICS[topic].journal;
    reset();
    if (r.intent === 'undo') {
      var u = M.undo(st()); api.save();
      reply(u.ok ? 'Done. I reversed your last change (' + u.count + ' entr' + (u.count === 1 ? 'y' : 'ies') + ').' : u.reason === 'expired' ? 'That change is more than 24 hours old. You can still fix the day on the calendar.' : 'There is nothing to undo.');
    } else if (r.intent === 'question') reply(C.answer(raw, M.activeObs(st()), today()));
    else if (r.intent === 'allgood') pending = { items: [{ type: 'checkin', value: 'all-good', start: today(), end: today(), confidence: 1 }], source: source || 'chat', text: raw, note: 'All good is a real answer. Save it?' };
    else if (r.intent === 'notsure') pending = { items: [{ type: 'checkin', value: 'not-sure', start: today(), end: today(), confidence: 1 }], source: source || 'chat', text: raw, note: 'Not sure is a fine answer too. Save it, or just leave it.' };
    else if (r.intent === 'same') {
      var items = M.sameAsYesterday(st(), today(), yesterday());
      if (items.length) pending = { items: items, source: source || 'chip', text: raw, note: 'Same as yesterday. Check it still fits:' };
      else reply('Nothing was logged yesterday to copy. Tell me in your own words, or tap All good.');
    } else if (r.intent === 'log' || journal) {
      /* at most one question: the first unclear bleeding asks, any others stay "not sure which" on the card */
      var amb = null;
      r.items.forEach(function (it) {
        if (it.value !== 'ambiguous') return;
        if (needsClarify(it) && !amb) amb = it;
        else if (needsClarify(it)) { it.value = 'unsure'; it.confidence = 0.4; }
        else it.value = 'period';
        if (it !== amb) delete it.ambiguous;
      });
      if (journal) r.items.push({ type: 'note', value: raw, start: today(), end: today(), confidence: 1, clause: raw });
      pending = { items: r.items, source: source || 'chat', text: raw, note: r.items.length > 1 || !journal ? 'Here is what I heard. Save, edit, or remove anything:' : 'Save this as a journal note?' };
      if (amb) clarify = amb;
    } else reply('I didn’t pick out anything to log there, and that’s fine. You can mention bleeding, pain, symptoms, mood, energy or sleep, or tap a chip below.');
    render();
  }

  /* ---------- the sheet ---------- */
  function open(a, t) {
    api = a || api || (root.EbbGame && root.EbbGame.api);
    var want = TOPICS[t] ? t : 'general';
    return load().then(function () {
      M.ensure(st());
      if (wrap) wrap.remove();
      topic = want; reset(); view = 'chat'; picked = null; month = null;
      var T = TOPICS[topic];
      if (topic === 'general' && !L().thread.length) M.say(st(), 'ebb', 'Hi, it’s Ovia. Tell me how today is going, in your own words. For example: “light flow, mild cramps, slept 6 hours”. Nothing is saved until you tap Save.');
      since = topic === 'general' ? Math.max(0, L().thread.length - 60) : L().thread.length;
      wrap = doc.createElement('div'); wrap.className = 'ebb-log'; wrap.dataset.topic = topic;
      wrap.innerHTML = '<div class="lg-sheet" role="dialog" aria-modal="true" aria-labelledby="lgTitle"><div class="lg-grab" aria-hidden="true"></div><header class="lg-top"><h2 id="lgTitle">' + esc(T.title) + '</h2>' +
        (T.tabs ? '<div class="lg-tabs" role="tablist"><button type="button" role="tab" data-view="chat">Chat</button><button type="button" role="tab" data-view="calendar">Calendar</button></div>' : '') +
        '<button type="button" class="btn small lg-close" aria-label="Close">Close</button></header>' +
        (T.ring ? '<section class="lg-ring" aria-live="polite"></section>' : '') + '<section class="lg-body"></section>' +
        '<footer class="lg-foot"><div class="lg-chips"></div><form class="lg-form"><label class="lg-sr" for="lgInput">Tell Ovia in your own words</label><input id="lgInput" autocomplete="off" maxlength="' + (T.journal ? 2000 : 400) + '" placeholder="' + (T.journal ? 'Write anything…' : 'Or type it your way…') + '"><button type="submit" class="btn primary">Send</button></form></footer></div>';
      doc.body.appendChild(wrap);
      wrap.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Escape') close(); });
      wrap.addEventListener('click', function (e) { e.stopPropagation(); if (e.target === wrap) close(); });
      wrap.querySelector('.lg-close').addEventListener('click', close);
      wrap.querySelectorAll('.lg-tabs button').forEach(function (b) { b.addEventListener('click', function () { view = b.dataset.view; picked = null; stage = null; render(); }); });
      wrap.querySelector('.lg-form').addEventListener('submit', function (e) { e.preventDefault(); var i = wrap.querySelector('#lgInput'); var v = i.value; i.value = ''; handle(v, 'chat'); });
      chips(T);
      render();
      var first = topic === 'general' ? wrap.querySelector('#lgInput') : wrap.querySelector('.lg-chip');
      if (first) first.focus({ preventScroll: true });
    }).catch(function (e) { console.error(e); if (api) api.toast('The log could not load'); });
  }
  function close() { if (wrap) { wrap.remove(); wrap = null; } reset(); }

  function chips(T) {
    var box = wrap.querySelector('.lg-chips');
    T.chips.forEach(function (c) {
      var b = doc.createElement('button'); b.type = 'button'; b.className = 'lg-chip';
      b.innerHTML = (c.icon ? '<img src="' + base + 'art/log/' + c.icon + '.webp" alt="" width="22" height="22">' : '') + '<span>' + esc(c.label) + '</span>';
      b.addEventListener('click', function () { chip(c); });
      box.appendChild(b);
    });
  }
  function chip(c) {
    reset(); view = c.view || 'chat';
    if (c.view) { render(); return; }
    if (c.pick) { quick = c.pick; render(); return; }
    if (c.say) { handle(c.say, 'chip'); return; }
    if (c.skip) { reply(c.skip); render(); return; }
    if (c.item) { M.say(st(), 'me', c.label); api.save(); pending = { items: [c.item()], source: 'chip', text: c.label, note: 'Check and save:' }; render(); }
  }

  /* ---------- rendering ---------- */
  function ring() {
    var box = wrap.querySelector('.lg-ring'); if (!box) return;
    var r = C.summary(M.activeObs(st()), today());
    var len = r.range ? Math.round((r.range.lo + r.range.hi) / 2) : 28, day = r.cycleDay || 0, frac = r.lastStart ? Math.min(1, day / len) : 0;
    var R = 34, circ = 2 * Math.PI * R, arc = (frac * circ).toFixed(1);
    box.innerHTML = '<svg viewBox="0 0 84 84" class="lg-dial" aria-hidden="true"><circle cx="42" cy="42" r="' + R + '" class="lg-track"/>' +
      (r.range ? '<circle cx="42" cy="42" r="' + R + '" class="lg-range" stroke-dasharray="' + ((r.range.hi - r.range.lo) / len * circ).toFixed(1) + ' ' + circ.toFixed(1) + '" stroke-dashoffset="' + (-(r.range.lo / len) * circ).toFixed(1) + '" transform="rotate(-90 42 42)"/>' : '') +
      '<circle cx="42" cy="42" r="' + R + '" class="lg-arc" stroke-dasharray="' + arc + ' ' + circ.toFixed(1) + '" transform="rotate(-90 42 42)"/>' +
      '<text x="42" y="40" class="lg-day">' + (r.lastStart ? 'Day ' + day : '–') + '</text><text x="42" y="53" class="lg-sub">' + (r.lastStart ? 'of cycle' : 'no start yet') + '</text></svg>' +
      '<div class="lg-ringtext"><p class="lg-phase">' + esc(r.phase ? 'Phase estimate: ' + r.phase : 'Log a period start to begin the ring') + '</p><p>' + esc(C.nextLine(r)) + '</p></div>';
  }

  function render() {
    if (!wrap) return;
    wrap.querySelectorAll('.lg-tabs button').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.view === view)); });
    ring();
    var body = wrap.querySelector('.lg-body'), T = TOPICS[topic];
    if (view === 'calendar') { calendar(body); return; }
    var msgs = L().thread.slice(since);
    var html = '<ol class="lg-thread">' + (T.line ? '<li class="lg-msg ebb">' + esc(T.line) + '</li>' : '') +
      msgs.map(function (m) { return '<li class="lg-msg ' + (m.who === 'me' ? 'mine' : 'ebb') + '">' + esc(m.text) + '</li>'; }).join('') + '</ol>';
    body.innerHTML = html + '<div class="lg-live"></div>';
    var live = body.querySelector('.lg-live');
    if (quick) live.appendChild(quickCard(quick));
    else if (clarify) live.appendChild(clarifyCard());
    else if (pending) live.appendChild(card());
    body.scrollTop = body.scrollHeight;
  }

  function el(html) { var d = doc.createElement('div'); d.innerHTML = html; return d.firstChild; }
  function toCard(items, text, note) { quick = null; M.say(st(), 'me', text); api.save(); pending = { items: items, source: 'chip', text: text, note: note || 'Check and save:' }; render(); }

  var PICKS = {
    bleeding: { note: 'Bleeding today:', options: ['none', 'spotting', 'light', 'medium', 'heavy'], name: function (v) { return BLEED_NAMES[v]; }, make: function (v) { return [item('bleeding', v)()]; }, text: function (v) { return 'Bleeding: ' + BLEED_NAMES[v].toLowerCase(); } },
    mucus: { note: 'What did you notice? Note it the way you see it.', options: ['dry', 'sticky', 'creamy', 'watery', 'eggwhite'], name: function (v) { return MUCUS_NAMES[v]; }, make: function (v) { return [item('mucus', v)()]; }, text: function (v) { return 'Mucus: ' + MUCUS_NAMES[v]; } },
    sensation: { note: 'How does it feel?', options: ['dry', 'damp', 'wet', 'slippery'], name: function (v) { return v; }, make: function (v) { return [item('sensation', v)()]; }, text: function (v) { return 'Feels ' + v; } },
    pain: { note: 'Pain right now, 0 is none and 10 is the worst you can imagine:', options: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], name: String, make: function (v) { return [item('pain', v, { unit: '/10', location: [] })()]; }, text: function (v) { return 'Pain ' + v + '/10'; } },
    hours: { note: 'About how many hours did you sleep?', options: [4, 5, 6, 7, 8, 9, 10], name: function (v) { return v + ' h'; }, make: function (v) { var it = item('sleep', v, { unit: 'h' })(); it.start = yesterday(); return [it]; }, text: function (v) { return 'Slept ' + v + ' hours'; } }
  };
  function quickCard(kind) {
    var c = el('<div class="lg-card"><p class="lg-note"></p><div class="lg-pills"></div><div class="lg-actions"></div></div>');
    var pills = c.querySelector('.lg-pills'), acts = c.querySelector('.lg-actions'), P = PICKS[kind];
    if (P) {
      c.querySelector('.lg-note').textContent = P.note;
      P.options.forEach(function (v) {
        var b = el('<button type="button" class="pill">' + esc(P.name(v)) + '</button>');
        b.addEventListener('click', function () { toCard(P.make(v), P.text(v)); });
        pills.appendChild(b);
      });
    } else if (kind === 'temp') {
      c.querySelector('.lg-note').textContent = 'Waking temperature:';
      pills.innerHTML = '<input type="number" inputmode="decimal" step="0.01" min="34" max="108" placeholder="36.5" aria-label="Temperature" class="lg-num"><select aria-label="Unit" class="lg-unit"><option value="C">°C</option><option value="F">°F</option></select>';
      var warn = el('<p class="lg-warn muted" hidden>That looks outside a thermometer’s usual range. Check the number?</p>');
      c.insertBefore(warn, acts);
      var ok = el('<button type="button" class="btn primary">Next</button>');
      ok.addEventListener('click', function () {
        var v = parseFloat(String(pills.querySelector('.lg-num').value).replace(',', '.')), u = pills.querySelector('.lg-unit').value;
        if (!(u === 'C' ? v >= 34 && v <= 42.5 : v >= 93 && v <= 108.5)) { warn.hidden = false; return; }
        toCard([item('temperature', Math.round(v * 100) / 100, { unit: u })()], 'Waking temperature ' + v + ' °' + u);
      });
      acts.appendChild(ok);
    } else {
      c.querySelector('.lg-note').textContent = 'Pick any that fit today:';
      var chosen = {};
      ['cramps', 'bloating', 'headache', 'breast tenderness', 'acne', 'nausea', 'cravings', 'low mood', 'tired'].forEach(function (v) {
        var b = el('<button type="button" class="pill" aria-pressed="false">' + esc(v) + '</button>');
        b.addEventListener('click', function () { chosen[v] = !chosen[v]; b.setAttribute('aria-pressed', String(!!chosen[v])); });
        pills.appendChild(b);
      });
      var next = el('<button type="button" class="btn primary">Next</button>');
      next.addEventListener('click', function () {
        var names = Object.keys(chosen).filter(function (k) { return chosen[k]; });
        if (!names.length) { quick = null; render(); return; }
        toCard(names.map(function (v) { return v === 'low mood' ? item('mood', 'low')() : v === 'tired' ? item('energy', 'low')() : item('symptom', v)(); }), 'Symptoms: ' + names.join(', '));
      });
      acts.appendChild(next);
    }
    var cancel = el('<button type="button" class="btn">Not now</button>');
    cancel.addEventListener('click', function () { quick = null; render(); });
    acts.appendChild(cancel);
    return c;
  }

  function clarifyCard() {
    var c = el('<div class="lg-card"><p class="lg-note">One question, because it changes the chart: is this spotting, or is your period starting?</p><div class="lg-actions"></div></div>');
    [['Spotting', 'spotting'], ['Period starting', 'period'], ['Not sure', 'unsure']].forEach(function (o) {
      var b = el('<button type="button" class="btn' + (o[1] === 'period' ? ' primary' : '') + '">' + o[0] + '</button>');
      b.addEventListener('click', function () { clarify.value = o[1]; delete clarify.ambiguous; if (o[1] === 'unsure') clarify.confidence = 0.4; clarify = null; render(); });
      c.querySelector('.lg-actions').appendChild(b);
    });
    return c;
  }

  function card() {
    var c = el('<div class="lg-card"><p class="lg-note"></p><ul class="lg-items"></ul><div class="lg-actions"></div></div>');
    c.querySelector('.lg-note').textContent = pending.note;
    var ul = c.querySelector('.lg-items');
    pending.items.forEach(function (it, i) {
      var li = doc.createElement('li');
      li.innerHTML = '<span class="lg-what">' + esc(label(it)) + '</span><span class="lg-when">' + esc(when(it)) + '</span>';
      if (editing && it.type !== 'checkin') li.appendChild(editor(it));
      var rm = el('<button type="button" class="lg-x" aria-label="Remove ' + esc(label(it)) + '">×</button>');
      rm.addEventListener('click', function () { pending.items.splice(i, 1); if (!pending.items.length) { pending = null; reply('Nothing saved.'); } render(); });
      li.appendChild(rm); ul.appendChild(li);
    });
    var acts = c.querySelector('.lg-actions');
    var saveB = el('<button type="button" class="btn primary lg-save">Save</button>');
    saveB.addEventListener('click', function () { var p = pending; pending = null; editing = false; save(p.items, p.source, p.text); render(); });
    var editB = el('<button type="button" class="btn lg-edit">' + (editing ? 'Done editing' : 'Edit') + '</button>');
    editB.addEventListener('click', function () { editing = !editing; render(); });
    var noB = el('<button type="button" class="btn">Don’t save</button>');
    noB.addEventListener('click', function () { pending = null; editing = false; reply('Okay, nothing saved.'); render(); });
    acts.appendChild(saveB); if (pending.items.some(function (x) { return x.type !== 'checkin'; })) acts.appendChild(editB); acts.appendChild(noB);
    return c;
  }

  var CHOICES = { bleeding: ['none', 'spotting', 'light', 'medium', 'heavy', 'period', 'unsure'], energy: ['low', 'normal', 'high'], mood: ['low', 'anxious', 'stressed', 'irritable', 'mood swings', 'good'], sleepQuality: ['poor', 'good'], clots: ['yes', 'large'], mucus: ['dry', 'sticky', 'creamy', 'watery', 'eggwhite'], sensation: ['dry', 'damp', 'wet', 'slippery'] };
  function editor(it) {
    var box = doc.createElement('div'); box.className = 'lg-editor';
    var html = '';
    if (CHOICES[it.type]) html += '<select aria-label="Value">' + CHOICES[it.type].map(function (v) { return '<option value="' + esc(v) + '"' + (v === it.value ? ' selected' : '') + '>' + esc(it.type === 'bleeding' ? BLEED_NAMES[v] : it.type === 'mucus' ? MUCUS_NAMES[v] : v) + '</option>'; }).join('') + '</select>';
    if (it.type === 'pain') html += '<input type="number" min="0" max="10" step="1" aria-label="Pain out of 10" value="' + (it.value == null ? '' : it.value) + '">';
    if (it.type === 'sleep') html += '<input type="number" min="0" max="16" step="0.5" aria-label="Hours slept" value="' + it.value + '">';
    if (it.type === 'temperature') html += '<input type="number" step="0.01" aria-label="Temperature" value="' + it.value + '">';
    if (it.type === 'note') html += '<textarea aria-label="Journal note" rows="3" maxlength="2000">' + esc(it.value) + '</textarea>';
    if (it.type === 'symptom' || it.type === 'mood' || it.type === 'clots') html += '<label class="lg-had"><input type="checkbox"' + (it.negated ? '' : ' checked') + '> had it</label>';
    html += '<input type="date" aria-label="Date" value="' + it.start + '" max="' + today() + '">';
    box.innerHTML = html;
    var sel = box.querySelector('select'), num = box.querySelector('input[type=number]'), had = box.querySelector('.lg-had input'), date = box.querySelector('input[type=date]'), ta = box.querySelector('textarea');
    if (sel) sel.addEventListener('change', function () { it.value = sel.value; it.hedged = false; it.estimated = false; it.confidence = 1; });
    if (num) num.addEventListener('change', function () {
      if (num.value === '') { if (it.type === 'pain') it.value = null; return; }
      var v = +num.value;
      if (it.type === 'pain') v = Math.max(0, Math.min(10, Math.round(v))); else if (it.type === 'sleep') v = Math.max(0, Math.min(16, v));
      it.value = v; it.estimated = false; it.confidence = 1;
    });
    if (ta) ta.addEventListener('input', function () { it.value = ta.value; });
    if (had) had.addEventListener('change', function () { it.negated = !had.checked; it.confidence = 1; });
    date.addEventListener('change', function () { if (date.value && date.value <= today()) { var span = C.diff(it.start, it.end || it.start); it.start = date.value; it.end = C.addDays(date.value, Math.max(0, Math.min(span, C.diff(date.value, today())))); } });
    return box;
  }

  /* ---------- calendar: a day change waits on a confirm row, then is one undoable write echoed in the thread ---------- */
  function calendar(body) {
    var t = today(); if (!month) month = t.slice(0, 7);
    var y = +month.slice(0, 4), mo = +month.slice(5, 7) - 1, first = new Date(y, mo, 1), days = new Date(y, mo + 1, 0).getDate();
    var obs = M.activeObs(st()), map = C.byDay(obs), r = C.summary(obs, t);
    var names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    var html = '<div class="lg-cal"><div class="lg-calhead"><button type="button" class="btn small" data-m="-1" aria-label="Previous month">‹</button><b>' + names[mo] + ' ' + y + '</b><button type="button" class="btn small" data-m="1" aria-label="Next month">›</button></div>' +
      '<div class="lg-grid">' + ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(function (d) { return '<span class="lg-dow" aria-hidden="true">' + d + '</span>'; }).join('');
    for (var i = 0; i < (first.getDay() + 6) % 7; i++) html += '<span></span>';
    for (var d = 1; d <= days; d++) {
      var ds = y + '-' + String(mo + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0'), v = map[ds];
      var cls = 'lg-day' + (v && C.PERIOD[v] ? ' flow-' + v : v === 'spotting' || v === 'unsure' ? ' spot' : '') + (ds === t ? ' today' : '') + (r.range && ds >= r.range.from && ds <= r.range.to ? ' predicted' : '') + (ds === picked ? ' picked' : '') + (ds > t ? ' future' : '');
      html += '<button type="button" class="' + cls + '" data-day="' + ds + '"' + (ds > t ? ' disabled' : '') + ' aria-label="' + C.fmt(ds) + (v && v !== 'unknown' ? ', ' + esc(BLEED_NAMES[v] || v) : '') + '">' + d + '</button>';
    }
    html += '</div><p class="lg-legend"><span class="k flow"></span> period <span class="k spot"></span> spotting <span class="k pred"></span> estimated next period</p><div class="lg-dayedit"></div></div>';
    body.innerHTML = html;
    body.querySelectorAll('[data-m]').forEach(function (b) { b.addEventListener('click', function () { var nd = new Date(y, mo + +b.dataset.m, 1); month = nd.getFullYear() + '-' + String(nd.getMonth() + 1).padStart(2, '0'); picked = null; stage = null; render(); }); });
    body.querySelectorAll('[data-day]').forEach(function (b) { b.addEventListener('click', function () { picked = b.dataset.day; stage = null; render(); }); });
    if (!picked) return;
    var ed = body.querySelector('.lg-dayedit'), cur = map[picked], curName = cur && cur !== 'unknown' ? BLEED_NAMES[cur] : 'nothing logged';
    if (stage) {
      var to = stage === 'clear' ? 'nothing logged' : BLEED_NAMES[stage].toLowerCase();
      ed.innerHTML = '<div class="lg-card"><p class="lg-note">Change ' + C.fmt(picked) + ' from ' + esc(curName.toLowerCase()) + ' to ' + esc(to) + '?</p><div class="lg-actions"><button type="button" class="btn primary lg-calsave">Save</button><button type="button" class="btn lg-calcancel">Cancel</button></div></div>';
      ed.querySelector('.lg-calsave').addEventListener('click', function () {
        var day = picked, v = stage, made = M.setBleeding(st(), day, v, {});
        M.say(st(), 'ebb', 'Calendar: ' + C.fmt(day) + (v === 'clear' ? ' cleared.' : ' set to ' + BLEED_NAMES[v].toLowerCase() + '.') + ' Say “undo” within 24 hours to take it back.', { kind: 'sync' });
        api.save(); safetyAfter(made);
        picked = null; stage = null; render();
      });
      ed.querySelector('.lg-calcancel').addEventListener('click', function () { stage = null; render(); });
      return;
    }
    ed.innerHTML = '<p class="lg-note">' + C.fmt(picked) + ': ' + esc(curName) + '. Change bleeding to:</p><div class="lg-pills"></div>';
    ['none', 'spotting', 'light', 'medium', 'heavy', 'clear'].forEach(function (v) {
      if (v === cur || (v === 'clear' && (!cur || cur === 'unknown'))) return;
      var b = el('<button type="button" class="pill">' + (v === 'clear' ? 'Clear this day' : esc(BLEED_NAMES[v])) + '</button>');
      b.addEventListener('click', function () { stage = v; render(); });
      ed.querySelector('.lg-pills').appendChild(b);
    });
  }

  /* ---------- hooks into the game ---------- */
  function register() {
    var G = root.EbbGame; if (!G || !G.registerPanel) return false;
    G.registerPanel({ id: 'log', label: 'Log', open: function (a) { open(a, 'general'); } });
    if (G.registerKind) G.registerKind('log', function (spot, a) { open(a, spot && spot.topic); });
    return true;
  }
  if (!register()) doc.addEventListener('DOMContentLoaded', register);
  root.EbbLog = { open: function (t) { return open(root.EbbGame && root.EbbGame.api, t); }, close: close, topics: Object.keys(TOPICS), handle: function (t) { handle(t, 'chat'); }, ready: load };
})(window);
