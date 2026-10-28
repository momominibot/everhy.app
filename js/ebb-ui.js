/* Ebb sheets: the wardrobe (live preview, save or cancel) and a short guided practice (choose length and anchor, pause,
 * end, then save as finished or partial, or don't save). Practice copy is an original draft awaiting review by a
 * qualified mindfulness teacher; nothing here scores calm or claims a health effect. */
(function (root) {
  'use strict';
  var doc = root.document, P = root.EbbPuppet, S = root.EbbStore;
  var open = false;
  /* mount a full-screen overlay inside the phone frame so it is clipped to the 390x844 app on a desktop; falls back
   * to the body before the app exists */
  root.EbbMount = function (el) { var app = doc.querySelector('.app'); (app || doc.body).appendChild(el); return el; };
  /* a small speaker icon for the Erin voice toggles: waves when her voice is on, a cross when it is off */
  root.EbbSpeakerIcon = function (isOn) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 9.5h3.2L11.5 6v12l-4.3-3.5H4z" fill="currentColor"/>' +
      (isOn ? '<path d="M14.8 9.3a3.8 3.8 0 0 1 0 5.4M17.4 6.9a7.2 7.2 0 0 1 0 10.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'
        : '<path d="M15.2 9.6l4.8 4.8m0-4.8l-4.8 4.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>') + '</svg>';
  };

  var SWATCH = {
    top: ['#f2a39b', '#f4d6a0', '#9cc7c0', '#c9b6e6', '#fbf7ef', '#e8836f'],
    bottom: ['#8fae8b', '#5f8f8b', '#d9c3a0', '#d7a1a8', '#7d93b5', '#5b5466'],
    hair: ['#3a2923', '#1f1b1d', '#7a4a32', '#a8743f'],
    headwearColour: ['#5f8f8b', '#c9b6e6', '#f2a39b', '#efe6d6']
  };

  function sheet(title, body, actions) {
    var wrap = doc.createElement('div'); wrap.className = 'sheet-wrap';
    wrap.innerHTML = '<section class="sheet" role="dialog" aria-modal="true" aria-label="' + title + '"><h2>' + title + '</h2><div class="sheet-body"></div><div class="sheet-actions"></div></section>';
    wrap.querySelector('.sheet-body').appendChild(body);
    actions.forEach(function (a) {
      var b = doc.createElement('button'); b.type = 'button'; b.textContent = a.label; b.className = a.primary ? 'btn primary' : 'btn';
      b.addEventListener('click', a.fn); wrap.querySelector('.sheet-actions').appendChild(b);
    });
    root.EbbMount(wrap); open = true;
    var first = wrap.querySelector('button'); if (first) first.focus();
    return function close() { wrap.remove(); open = false; };
  }

  /* clay outfits: each shipped sprite set is one complete outfit, shown as a card with its standing front view */
  var OUTFIT_NAMES = { genz: 'Hoodie and jeans', default: 'Classic tee', ac: 'Everyday', lilac: 'Lilac sundress', ac_lilac: 'Lilac sundress', tudung: 'Tudung and baju kurung', ac_tudung: 'Tudung and baju kurung' };
  function openClayWardrobe(current, done) {
    var C = root.EbbClay, CS = root.EbbClaySets, chosen = C.setFor(current), body = doc.createElement('div');
    body.className = 'outfits';
    C.sets().forEach(function (name) {
      var m = CS[name].idle, b = doc.createElement('button');
      b.type = 'button'; b.className = 'outfit'; b.setAttribute('aria-pressed', String(name === chosen));
      b.innerHTML = '<svg viewBox="0 0 ' + m.w + ' ' + m.h + '" aria-hidden="true"><image href="' + C.url(name, 'idle') + '" width="' + (m.w * m.frames) + '" height="' + m.h + '"/></svg><span></span>';
      b.querySelector('span').textContent = OUTFIT_NAMES[name] || name;
      b.addEventListener('click', function () { chosen = name; body.querySelectorAll('.outfit').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); });
      body.appendChild(b);
    });
    var close = sheet('What to wear', body, [
      { label: 'Cancel', fn: function () { close(); done(null); } },
      { label: 'Wear this', primary: true, fn: function () { var o = P.clean(current); o.set = chosen; close(); done(o); } }]);
  }

  function openWardrobe(current, done) {
    if (root.EbbClay && root.EbbClay.sets().length) return openClayWardrobe(current, done);
    var o = P.clean(current), body = doc.createElement('div');
    body.className = 'wardrobe';
    body.innerHTML = '<svg class="preview" viewBox="-40 -118 80 126" aria-hidden="true"></svg><div class="choices"></div>';
    var prev = body.querySelector('.preview'), choices = body.querySelector('.choices');
    function paint() { prev.innerHTML = '<ellipse cx="0" cy="0" rx="17" ry="4.5" fill="rgba(40,30,30,0.15)"/>' + P.svg(o, { view: 'front', action: 'idle' }); }
    function row(label, key, values) {
      var r = doc.createElement('div'); r.className = 'choice'; r.innerHTML = '<span>' + label + '</span><div class="swatches"></div>';
      values.forEach(function (v) {
        var b = doc.createElement('button'); b.type = 'button'; b.className = 'swatch'; b.style.background = v; b.setAttribute('aria-label', label + ' ' + v);
        b.setAttribute('aria-pressed', String(o[key] === v));
        b.addEventListener('click', function () { o[key] = v; r.querySelectorAll('.swatch').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); }); b.setAttribute('aria-pressed', 'true'); paint(); });
        r.querySelector('.swatches').appendChild(b);
      });
      choices.appendChild(r);
    }
    function pick(label, key, values, names) {
      var r = doc.createElement('div'); r.className = 'choice'; r.innerHTML = '<span>' + label + '</span><div class="pills"></div>';
      values.forEach(function (v, i) {
        var b = doc.createElement('button'); b.type = 'button'; b.className = 'pill'; b.textContent = names[i]; b.setAttribute('aria-pressed', String(o[key] === v));
        b.addEventListener('click', function () { o[key] = v; r.querySelectorAll('.pill').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); }); b.setAttribute('aria-pressed', 'true'); paint(); });
        r.querySelector('.pills').appendChild(b);
      });
      choices.appendChild(r);
    }
    row('Top', 'top', SWATCH.top); row('Bottoms', 'bottom', SWATCH.bottom);
    pick('Hair', 'hairStyle', ['long', 'bob', 'bun'], ['Long', 'Bob', 'Bun']); row('Hair colour', 'hair', SWATCH.hair);
    pick('Head', 'headwear', ['none', 'tudung'], ['Hair showing', 'Tudung']); row('Tudung colour', 'headwearColour', SWATCH.headwearColour);
    paint();
    var close = sheet('Wardrobe', body, [
      { label: 'Cancel', fn: function () { close(); done(null); } },
      { label: 'Wear this', primary: true, fn: function () { close(); done(P.clean(o)); } }]);
  }

  /* ---------- a short sitting practice ---------- */
  var CUES = {
    breath: ['Let your body settle where it is.', 'Notice the breath moving on its own. No need to change it.',
      'When the mind wanders, that is fine. Gently come back to the breath.', 'Notice the next breath, and the next.', 'Let the practice end. Notice how you are right now.'],
    sound: ['Let your body settle where it is.', 'Rest your attention on the sounds around you, near and far.',
      'No need to name them. Just notice them come and go.', 'If your mind wanders, return to sounds.', 'Let the practice end. Notice how you are right now.'],
    touch: ['Let your body settle where it is.', 'Notice where your body touches the cushion and the floor.',
      'Notice the weight, the warmth, or nothing in particular.', 'When the mind wanders, come back to that contact.', 'Let the practice end. Notice how you are right now.']
  };

  function openPractice(onDone) {
    var body = doc.createElement('div'), mins = 3, anchor = 'breath';
    body.className = 'practice';
    body.innerHTML = '<p class="muted">A short sitting practice. Eyes open or closed, whatever feels comfortable. You can pause or stop at any time.</p>' +
      '<div class="choice"><span>Length</span><div class="pills" data-k="mins"><button type="button" class="pill" aria-pressed="true" data-v="3">3 min</button><button type="button" class="pill" aria-pressed="false" data-v="5">5 min</button></div></div>' +
      '<div class="choice"><span>Rest attention on</span><div class="pills" data-k="anchor"><button type="button" class="pill" aria-pressed="true" data-v="breath">Breath</button><button type="button" class="pill" aria-pressed="false" data-v="sound">Sounds</button><button type="button" class="pill" aria-pressed="false" data-v="touch">Touch</button></div></div>';
    body.querySelectorAll('.pills').forEach(function (g) {
      g.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        g.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); }); b.setAttribute('aria-pressed', 'true');
        if (g.dataset.k === 'mins') mins = Number(b.dataset.v); else anchor = b.dataset.v;
      });
    });
    var close = sheet('Practice', body, [
      { label: 'Not now', fn: function () { close(); onDone(); } },
      { label: 'Begin', primary: true, fn: function () { close(); run(mins, anchor, onDone); } }]);
  }

  function run(mins, anchor, onDone) {
    var planned = mins * 60, active = 0, paused = false, start = new Date().toISOString(), timer;
    var box = doc.createElement('div'); box.className = 'run';
    box.innerHTML = '<p class="cue" aria-live="polite"></p><p class="clock"></p>';
    var cue = box.querySelector('.cue'), clock = box.querySelector('.clock');
    function show() {
      var cues = CUES[anchor], i = Math.min(cues.length - 1, Math.floor(active / planned * (cues.length - 1)));
      if (active >= planned) i = cues.length - 1;
      cue.textContent = cues[i];
      var left = Math.max(0, planned - active);
      clock.textContent = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0') + (paused ? ' · paused' : '');
    }
    function tick() { if (!paused && !doc.hidden && active < planned) active += 1; show(); if (active >= planned) { clearInterval(timer); finish(); } }
    timer = setInterval(tick, 1000);
    show();
    var pauseBtn;
    var close = sheet('Practice', box, [
      { label: 'Pause', fn: function (e) { paused = !paused; e.target.textContent = paused ? 'Resume' : 'Pause'; show(); } },
      { label: 'End', primary: true, fn: function () { clearInterval(timer); finish(); } }]);
    function finish() {
      close();
      var done = active >= planned, body = doc.createElement('div');
      body.innerHTML = '<p>' + (done ? 'Practice complete.' : 'You practised for ' + Math.max(1, Math.round(active / 60)) + ' min.') +
        ' A wandering mind or no change at all is part of practice.</p><p class="muted">What did you notice? You can keep it to yourself.</p>';
      var c2 = sheet('Save this practice?', body, [
        { label: 'Don’t save', fn: function () { c2(); onDone(); } },
        { label: 'That felt hard', fn: function () { c2(); hard(onDone, save); } },
        { label: 'Save', primary: true, fn: function () { save(); c2(); onDone(); } }]);
      function save() { S.addPractice({ practice: 'sitting', anchor: anchor, plannedSec: planned, activeSec: active, status: done ? 'finished' : 'partial', start: start, end: new Date().toISOString(), source: 'cushion', scriptVersion: 'draft-1' }); }
    }
  }

  function hard(onDone, save) {
    var body = doc.createElement('div');
    body.innerHTML = '<p>Thank you for saying so. Practices can sometimes stir things up, and stopping is always fine.</p>' +
      '<p class="muted">Next time you could try a shorter practice, keep your eyes open, or rest attention on sounds instead of the breath. If difficult feelings stay with you, please talk to someone you trust or your doctor.</p>';
    var c = sheet('That felt hard', body, [
      { label: 'Don’t save', fn: function () { c(); onDone(); } },
      { label: 'Save', primary: true, fn: function () { save(); c(); onDone(); } }]);
  }

  /* after she sits anywhere: three small chips where the walking prompt sits, never a sheet over the room. Just sit
   * leaves only Get up (or nothing, when the place has its own Get up); A mindful moment hands over to the seat's own
   * options. The chips go by themselves once she is no longer sitting. o: { mindful(), up(), justSit() } */
  var choiceClose = null;
  function seatChoice(o) {
    if (choiceClose) choiceClose();
    var bar = doc.querySelector('.actionbar') || doc.body, box = doc.createElement('div'), watch = 0;
    box.className = 'seat-choice'; box.addEventListener('click', function (e) { e.stopPropagation(); });
    function close() { clearInterval(watch); if (box.parentNode) box.remove(); if (choiceClose === close) choiceClose = null; }
    function btn(label, act, fn, primary) {
      var b = doc.createElement('button'); b.type = 'button'; b.className = 'btn small' + (primary ? ' primary' : ''); b.dataset.act = act; b.textContent = label;
      b.addEventListener('click', function (e) { e.stopPropagation(); fn(); }); box.appendChild(b);
    }
    function upOnly() { box.innerHTML = ''; if (o.up) btn('Get up', 'getup', function () { close(); o.up(); }); else close(); }
    btn('Just sit', 'justsit', function () { upOnly(); if (o.justSit) o.justSit(); });
    btn('A mindful moment', 'mindful', function () { close(); o.mindful(); }, true);
    if (o.up) btn('Get up', 'getup', function () { close(); o.up(); });
    bar.appendChild(box); choiceClose = close;
    watch = setInterval(function () { var G = root.EbbGame; if (!G || !G.me || G.me().action !== 'sit') close(); }, 300);
    return close;
  }

  root.EbbUi = { openWardrobe: openWardrobe, openPractice: openPractice, seatChoice: seatChoice, closeSeatChoice: function () { if (choiceClose) choiceClose(); }, modalOpen: function () { return open; } };
})(window);
