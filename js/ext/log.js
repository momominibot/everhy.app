/* Ebb Log panel: a chat thread where she says how things are in her own words. A local parser suggests entries, every
 * write waits for her on an editable card, "undo" takes the last card back for 24 hours, and the cycle ring and month
 * calendar read only confirmed entries. Logging never changes game progress. Safety hooks are optional. */
(function (root) {
  'use strict';
  var doc = root.document;
  var me = doc.currentScript, base = me && me.src ? me.src.replace(/js\/ext\/log\.js.*$/, '') : '';
  var LP, C, M, api = null, wrap = null, view = 'chat', month = null, picked = null, pending = null, clarify = null;

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

  /* ---------- labels ---------- */
  var BLEED_NAMES = { none: 'No bleeding', spotting: 'Spotting', light: 'Light flow', medium: 'Medium flow', heavy: 'Heavy flow', period: 'Period (flow not given)', unsure: 'Bleeding (not sure which)', unknown: 'Cleared' };
  function dayName(d) { return d === today() ? 'today' : d === yesterday() ? 'yesterday' : C.fmt(d); }
  function when(it) { return it.end && it.end !== it.start ? C.fmt(it.start) + ' to ' + dayName(it.end) : dayName(it.start); }
  function label(it) {
    var maybe = it.hedged ? ' (maybe)' : '', v = it.value;
    switch (it.type) {
      case 'bleeding': return (BLEED_NAMES[v] || v) + maybe;
      case 'clots': return (it.negated ? 'No clots' : v === 'large' ? 'Large clots' : 'Clots') + maybe;
      case 'pain': return v === 0 ? 'No pain' : 'Pain ' + (v == null ? '(not rated)' : (it.estimated ? 'about ' : '') + v + '/10') + (it.location && it.location.length ? ', ' + it.location.join(' and ') : '') + maybe;
      case 'symptom': return (it.negated ? 'No ' : '') + v.charAt(0).toUpperCase() + v.slice(1) + maybe;
      case 'mood': return (it.negated ? 'Not ' : 'Mood: ') + v + maybe;
      case 'energy': return 'Energy: ' + v + maybe;
      case 'sleep': return 'Slept ' + v + ' h' + maybe;
      case 'sleepQuality': return (v === 'poor' ? 'Poor sleep' : 'Good sleep') + maybe;
      case 'checkin': return v === 'all-good' ? 'All good, nothing new' : 'Not sure today';
      default: return it.type + ': ' + v;
    }
  }

  /* ---------- safety hooks (optional) ---------- */
  function crisis(text) { try { return !!(root.EbbSafety && root.EbbSafety.crisis && root.EbbSafety.crisis(text)); } catch (e) { console.error(e); return false; } }
  function safetyAfter(made) {
    if (!root.EbbSafety || !root.EbbSafety.check) return;
    var all = M.activeObs(st()), profile = st().profile || {};
    (made || []).forEach(function (o) {
      try {
        var alerts = root.EbbSafety.check(o, all, profile) || [];
        (Array.isArray(alerts) ? alerts : [alerts]).forEach(function (a) { if (a && root.EbbSafety.showAlert) root.EbbSafety.showAlert(a); });
      } catch (e) { console.error(e); }
    });
  }

  /* ---------- writing ---------- */
  function save(items, source, text) {
    var made = M.confirm(st(), items, { source: source, text: text });
    api.save();
    M.say(st(), 'ebb', 'Saved ' + made.length + ' entr' + (made.length === 1 ? 'y' : 'ies') + '. Say “undo” within 24 hours to take it back.');
    api.save();
    safetyAfter(made);
    return made;
  }
  function reply(text) { M.say(st(), 'ebb', text); api.save(); }

  /* a period-starting question matters only when no period is logged just before that day */
  function needsClarify(it) {
    if (it.type !== 'bleeding' || it.value !== 'ambiguous') return false;
    var map = C.byDay(M.activeObs(st()));
    for (var i = 1; i <= 2; i++) if (C.PERIOD[map[C.addDays(it.start, -i)]]) return false;
    return true;
  }

  function handle(text, source) {
    var raw = String(text || '').trim(); if (!raw) return;
    if (crisis(raw)) { pending = null; clarify = null; render(); return; } /* Safety owns the response */
    M.say(st(), 'me', raw); api.save();
    var r = LP.parse(raw, today());
    pending = null; clarify = null;
    if (r.intent === 'undo') {
      var u = M.undo(st()); api.save();
      reply(u.ok ? 'Done. I took back the last card (' + u.count + ' entr' + (u.count === 1 ? 'y' : 'ies') + ').' : u.reason === 'expired' ? 'That card is more than 24 hours old. You can still change it on the calendar.' : 'There is nothing to undo.');
    } else if (r.intent === 'question') reply(C.answer(raw, M.activeObs(st()), today()));
    else if (r.intent === 'allgood') pending = { items: [{ type: 'checkin', value: 'all-good', start: today(), end: today(), confidence: 1 }], source: source || 'chat', text: raw, note: 'All good is a real answer. Save it?' };
    else if (r.intent === 'notsure') pending = { items: [{ type: 'checkin', value: 'not-sure', start: today(), end: today(), confidence: 1 }], source: source || 'chat', text: raw, note: 'Not sure is a fine answer too. Save it, or just leave it.' };
    else if (r.intent === 'same') {
      var items = M.sameAsYesterday(st(), today(), yesterday());
      if (items.length) pending = { items: items, source: source || 'chip', text: raw, note: 'Same as yesterday. Check it still fits:' };
      else reply('Nothing was logged yesterday to copy. Tell me in your own words, or tap All good.');
    } else if (r.intent === 'log') {
      var amb = r.items.filter(needsClarify)[0];
      r.items.forEach(function (it) { if (it.value === 'ambiguous' && it !== amb) { it.value = 'period'; delete it.ambiguous; } });
      pending = { items: r.items, source: source || 'chat', text: raw, note: 'Here is what I heard. Save, edit, or remove anything:' };
      if (amb) clarify = amb;
    } else reply('I didn’t pick out anything to log there, and that’s fine. You can mention bleeding, pain, symptoms, mood, energy or sleep, or tap a chip below.');
    render();
  }

  /* ---------- the panel ---------- */
  function open(a) {
    api = a;
    load().then(function () {
      M.ensure(st());
      if (!L().thread.length) M.say(st(), 'ebb', 'Hi. Tell me how today is going, in your own words. For example: “light flow, mild cramps, slept 6 hours”. Nothing is saved until you tap Save.');
      if (wrap) wrap.remove();
      wrap = doc.createElement('div'); wrap.className = 'ebb-log'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-label', 'Log');
      wrap.innerHTML = '<div class="lg-sheet"><header class="lg-top"><h2>Log</h2><div class="lg-tabs" role="tablist"><button type="button" role="tab" data-view="chat">Chat</button><button type="button" role="tab" data-view="calendar">Calendar</button></div><button type="button" class="btn small lg-close" aria-label="Close log">Close</button></header>' +
        '<section class="lg-ring" aria-live="polite"></section><section class="lg-body"></section>' +
        '<footer class="lg-foot"><div class="lg-chips"></div><form class="lg-form"><label class="lg-sr" for="lgInput">Tell Ebb how you are</label><input id="lgInput" autocomplete="off" maxlength="400" placeholder="How are things today?"><button type="submit" class="btn primary">Send</button></form></footer></div>';
      doc.body.appendChild(wrap);
      wrap.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Escape') close(); });
      wrap.addEventListener('click', function (e) { e.stopPropagation(); if (e.target === wrap) close(); });
      wrap.querySelector('.lg-close').addEventListener('click', close);
      wrap.querySelectorAll('.lg-tabs button').forEach(function (b) { b.addEventListener('click', function () { view = b.dataset.view; picked = null; render(); }); });
      wrap.querySelector('.lg-form').addEventListener('submit', function (e) { e.preventDefault(); var i = wrap.querySelector('#lgInput'); var v = i.value; i.value = ''; handle(v, 'chat'); });
      chips();
      render();
      var inp = wrap.querySelector('#lgInput'); if (inp) inp.focus();
    }).catch(function (e) { console.error(e); api.toast('The log could not load'); });
  }
  function close() { if (wrap) { wrap.remove(); wrap = null; } pending = null; clarify = null; }

  var CHIPS = [['Bleeding', 'drop'], ['Symptoms', 'swirl'], ['All good', 'sun'], ['Not sure', 'unsure'], ['Same as yesterday', null]];
  function chips() {
    var box = wrap.querySelector('.lg-chips');
    CHIPS.forEach(function (c) {
      var b = doc.createElement('button'); b.type = 'button'; b.className = 'lg-chip';
      b.innerHTML = (c[1] ? '<img src="' + base + 'art/log/' + c[1] + '.webp" alt="" width="22" height="22">' : '') + '<span>' + c[0] + '</span>';
      b.addEventListener('click', function () { chip(c[0]); });
      box.appendChild(b);
    });
  }
  function chip(name) {
    if (name === 'Bleeding') { view = 'chat'; pending = null; clarify = null; picker('bleeding'); return; }
    if (name === 'Symptoms') { view = 'chat'; pending = null; clarify = null; picker('symptoms'); return; }
    handle({ 'All good': 'all good', 'Not sure': 'not sure', 'Same as yesterday': 'same as yesterday' }[name], 'chip');
  }
  var quick = null;
  function picker(kind) { quick = kind; render(); }

  /* ---------- rendering ---------- */
  function ring() {
    var r = C.summary(M.activeObs(st()), today()), box = wrap.querySelector('.lg-ring');
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
    var body = wrap.querySelector('.lg-body');
    if (view === 'calendar') { calendar(body); return; }
    var html = '<ol class="lg-thread">' + L().thread.slice(-60).map(function (m) { return '<li class="lg-msg ' + (m.who === 'me' ? 'mine' : 'ebb') + '">' + esc(m.text) + '</li>'; }).join('') + '</ol>';
    body.innerHTML = html + '<div class="lg-live"></div>';
    var live = body.querySelector('.lg-live');
    if (quick) live.appendChild(quickCard(quick));
    else if (clarify) live.appendChild(clarifyCard());
    else if (pending) live.appendChild(card());
    body.scrollTop = body.scrollHeight;
  }

  function el(html) { var d = doc.createElement('div'); d.innerHTML = html; return d.firstChild; }

  function quickCard(kind) {
    var c = el('<div class="lg-card"><p class="lg-note"></p><div class="lg-pills"></div><div class="lg-actions"></div></div>');
    var pills = c.querySelector('.lg-pills');
    if (kind === 'bleeding') {
      c.querySelector('.lg-note').textContent = 'Bleeding today:';
      ['none', 'spotting', 'light', 'medium', 'heavy'].forEach(function (v) {
        var b = el('<button type="button" class="pill">' + esc(BLEED_NAMES[v]) + '</button>');
        b.addEventListener('click', function () { quick = null; M.say(st(), 'me', 'Bleeding: ' + BLEED_NAMES[v].toLowerCase()); api.save(); pending = { items: [{ type: 'bleeding', value: v, start: today(), end: today(), confidence: 1 }], source: 'chip', text: 'Bleeding chip: ' + v, note: 'Check and save:' }; render(); });
        pills.appendChild(b);
      });
    } else {
      c.querySelector('.lg-note').textContent = 'Pick any that fit today:';
      var chosen = {};
      ['cramps', 'bloating', 'headache', 'breast tenderness', 'acne', 'nausea', 'cravings', 'low mood', 'tired'].forEach(function (v) {
        var b = el('<button type="button" class="pill" aria-pressed="false">' + esc(v) + '</button>');
        b.addEventListener('click', function () { chosen[v] = !chosen[v]; b.setAttribute('aria-pressed', String(!!chosen[v])); });
        pills.appendChild(b);
      });
      var ok = el('<button type="button" class="btn primary">Next</button>');
      ok.addEventListener('click', function () {
        var items = Object.keys(chosen).filter(function (k) { return chosen[k]; }).map(function (v) {
          return v === 'low mood' ? { type: 'mood', value: 'low' } : v === 'tired' ? { type: 'energy', value: 'low' } : { type: 'symptom', value: v };
        }).map(function (it) { it.start = today(); it.end = today(); it.confidence = 1; return it; });
        quick = null;
        if (items.length) { M.say(st(), 'me', 'Symptoms: ' + Object.keys(chosen).filter(function (k) { return chosen[k]; }).join(', ')); api.save(); }
        if (items.length) pending = { items: items, source: 'chip', text: 'Symptoms chip', note: 'Check and save:' };
        render();
      });
      c.querySelector('.lg-actions').appendChild(ok);
    }
    var cancel = el('<button type="button" class="btn">Not now</button>');
    cancel.addEventListener('click', function () { quick = null; render(); });
    c.querySelector('.lg-actions').appendChild(cancel);
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

  var editing = false;
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

  var CHOICES = { bleeding: ['none', 'spotting', 'light', 'medium', 'heavy', 'period', 'unsure'], energy: ['low', 'normal', 'high'], mood: ['low', 'anxious', 'irritable', 'mood swings', 'good'], sleepQuality: ['poor', 'good'], clots: ['yes', 'large'] };
  function editor(it) {
    var box = doc.createElement('div'); box.className = 'lg-editor';
    var html = '';
    if (CHOICES[it.type]) html += '<select aria-label="Value">' + CHOICES[it.type].map(function (v) { return '<option value="' + esc(v) + '"' + (v === it.value ? ' selected' : '') + '>' + esc(it.type === 'bleeding' ? BLEED_NAMES[v] : v) + '</option>'; }).join('') + '</select>';
    if (it.type === 'pain') html += '<input type="number" min="0" max="10" step="1" aria-label="Pain out of 10" value="' + (it.value == null ? '' : it.value) + '">';
    if (it.type === 'sleep') html += '<input type="number" min="0" max="16" step="0.5" aria-label="Hours slept" value="' + it.value + '">';
    if (it.type === 'symptom' || it.type === 'mood' || it.type === 'clots') html += '<label class="lg-had"><input type="checkbox"' + (it.negated ? '' : ' checked') + '> had it</label>';
    html += '<input type="date" aria-label="Date" value="' + it.start + '" max="' + today() + '">';
    box.innerHTML = html;
    var sel = box.querySelector('select'), num = box.querySelector('input[type=number]'), had = box.querySelector('.lg-had input'), date = box.querySelector('input[type=date]');
    if (sel) sel.addEventListener('change', function () { it.value = sel.value; it.hedged = false; it.estimated = false; it.confidence = 1; });
    if (num) num.addEventListener('change', function () { var v = num.value === '' ? null : Math.max(0, Math.min(it.type === 'pain' ? 10 : 16, +num.value)); it.value = v; it.estimated = false; it.confidence = 1; });
    if (had) had.addEventListener('change', function () { it.negated = !had.checked; it.confidence = 1; });
    date.addEventListener('change', function () { if (date.value && date.value <= today()) { var span = C.diff(it.start, it.end || it.start); it.start = date.value; it.end = C.addDays(date.value, Math.max(0, Math.min(span, C.diff(date.value, today())))); } });
    return box;
  }

  /* ---------- calendar: edits go straight to the record and are echoed in the thread ---------- */
  function calendar(body) {
    var t = today(); if (!month) month = t.slice(0, 7);
    var y = +month.slice(0, 4), mo = +month.slice(5, 7) - 1, first = new Date(y, mo, 1), days = new Date(y, mo + 1, 0).getDate();
    var obs = M.activeObs(st()), map = C.byDay(obs), r = C.summary(obs, t);
    var names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    var html = '<div class="lg-cal"><div class="lg-calhead"><button type="button" class="btn small" data-m="-1" aria-label="Previous month">‹</button><b>' + names[mo] + ' ' + y + '</b><button type="button" class="btn small" data-m="1" aria-label="Next month">›</button></div>' +
      '<div class="lg-grid" role="grid">' + ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(function (d) { return '<span class="lg-dow">' + d + '</span>'; }).join('');
    for (var i = 0; i < (first.getDay() + 6) % 7; i++) html += '<span></span>';
    for (var d = 1; d <= days; d++) {
      var ds = y + '-' + String(mo + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0'), v = map[ds];
      var cls = 'lg-day' + (v && C.PERIOD[v] ? ' flow-' + v : v === 'spotting' || v === 'unsure' ? ' spot' : '') + (ds === t ? ' today' : '') + (r.range && ds >= r.range.from && ds <= r.range.to ? ' predicted' : '') + (ds === picked ? ' picked' : '') + (ds > t ? ' future' : '');
      html += '<button type="button" class="' + cls + '" data-day="' + ds + '"' + (ds > t ? ' disabled' : '') + ' aria-label="' + C.fmt(ds) + (v ? ', ' + esc(BLEED_NAMES[v] || v) : '') + '">' + d + '</button>';
    }
    html += '</div><p class="lg-legend"><span class="k flow"></span> period <span class="k spot"></span> spotting <span class="k pred"></span> estimated next period</p><div class="lg-dayedit"></div></div>';
    body.innerHTML = html;
    body.querySelectorAll('[data-m]').forEach(function (b) { b.addEventListener('click', function () { var nd = new Date(y, mo + +b.dataset.m, 1); month = nd.getFullYear() + '-' + String(nd.getMonth() + 1).padStart(2, '0'); picked = null; render(); }); });
    body.querySelectorAll('[data-day]').forEach(function (b) { b.addEventListener('click', function () { picked = b.dataset.day; render(); }); });
    if (picked) {
      var ed = body.querySelector('.lg-dayedit'), cur = map[picked];
      ed.innerHTML = '<p class="lg-note">' + C.fmt(picked) + (cur ? ': ' + esc(BLEED_NAMES[cur] || cur) : ': nothing logged') + '. Change bleeding to:</p><div class="lg-pills"></div>';
      ['none', 'spotting', 'light', 'medium', 'heavy', 'clear'].forEach(function (v) {
        var b = el('<button type="button" class="pill">' + (v === 'clear' ? 'Clear this day' : esc(BLEED_NAMES[v])) + '</button>');
        b.addEventListener('click', function () {
          var day = picked, made = M.setBleeding(st(), day, v, { source: 'calendar' });
          M.say(st(), 'ebb', 'Calendar: ' + C.fmt(day) + (v === 'clear' ? ' cleared.' : ' set to ' + BLEED_NAMES[v].toLowerCase() + '.') + ' Tap the day again to change it.', { kind: 'sync' });
          api.save(); if (v !== 'clear') safetyAfter(made.filter(Boolean));
          picked = null; render();
        });
        ed.querySelector('.lg-pills').appendChild(b);
      });
    }
  }

  function register() {
    if (!root.EbbGame || !root.EbbGame.registerPanel) return false;
    root.EbbGame.registerPanel({ id: 'log', label: 'Log', open: open });
    return true;
  }
  if (!register()) doc.addEventListener('DOMContentLoaded', register);
  root.EbbLog = { open: function () { open(root.EbbGame.api); }, handle: function (t) { handle(t, 'chat'); }, ready: load };
})(window);
