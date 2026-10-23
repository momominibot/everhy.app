/* Ebb daily loop: a Today sheet (More menu and a small sun button under the top bar) with three gentle invitations
 * picked from the date, a soft tick when one is done, today's hearts, the total, and one kind line. A Hearts counter in
 * the top bar. While she plays, a completed invitation brings a toast and a heart above her head. The first open of a
 * day greets her with the date and, when the sky module knows it, the weather.
 * Rules live in js/today/rules.js (pure). Nothing here reads what she logged about her body. Nothing is owed. */
(function (root) {
  'use strict';
  var doc = root.document;
  if (!doc || !root.EbbGame) return; /* the node harness stops here */

  /* rules load as their own file; the load event waits for them, and the loop only starts once the game is ready */
  if (!root.EbbTodayRules) { var sc = doc.createElement('script'); sc.src = 'js/today/rules.js'; sc.async = false; doc.head.appendChild(sc); }
  function R() { return root.EbbTodayRules; }

  var DONE_WORDS = {
    water: 'The garden is watered. A heart for you.',
    sit: 'You sat for a while. A heart for you.',
    pond: 'You visited the pond. A heart for you.',
    walk: 'A slow walk to the waterfall. A heart for you.',
    journal: 'A line in the journal. A heart for you.'
  };
  var BONUS_WORDS = 'All three today. One more heart, with thanks.';
  var SUN = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4.6" fill="#f2c14e"/>' +
    '<g stroke="#f2c14e" stroke-width="2" stroke-linecap="round"><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></g></svg>';
  var TICK = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12.5l4.2 4.2L19 7.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var api = null, lastDay = null, queue = [], queueTimer = 0, openSheet = null, ticking = false;

  function data() { var st = api.state(); st.daily = R().ensure(st.daily); return st.daily; }
  function weatherNow(today) {
    var sky = root.EbbSky; if (!sky) return undefined;
    try {
      var w = typeof sky.state === 'function' ? (sky.state() || {}).weather : typeof sky.weatherFor === 'function' ? sky.weatherFor(today) : undefined;
      return w === 'rain' || w === 'clear' ? w : undefined;
    } catch (e) { return undefined; }
  }

  /* ---------- the loop: once a second while the page is visible, read state, hand out any new hearts ---------- */
  function tick() {
    if (ticking || !api || !R()) return;
    ticking = true;
    try {
      var st = api.state(), today = api.today(), d = data(), changed = false;
      if (today !== lastDay) { R().begin(d, st, today); lastDay = today; changed = true; }
      var day = d.days[today], sceneId = api.scene();
      if (sceneId && !day.visits[sceneId]) { R().visit(d, today, sceneId); changed = true; }
      var r = R().apply(d, st, today);
      if (r.fresh.length || r.bonus) {
        changed = true;
        r.fresh.forEach(function (id) { queue.push(DONE_WORDS[id] || 'A heart for you.'); });
        if (r.bonus) queue.push(BONUS_WORDS);
        schedule();
        api.refresh();
        if (openSheet) openToday(true);
      }
      if (changed) api.save();
    } catch (e) { console.error(e); }
    ticking = false;
  }
  /* the engine's own toast (watered, offered) shows first; each heart line follows and brings a heart above her head */
  function schedule() {
    if (queueTimer) return;
    queueTimer = setTimeout(function () {
      queueTimer = 0;
      var text = queue.shift(); if (!text) return;
      api.toast(text, 2600);
      try { if (root.EbbLife && root.EbbLife.react) root.EbbLife.react('heart', 1600); } catch (e) { }
      try { if (root.EbbSound && typeof root.EbbSound.play === 'function') root.EbbSound.play('chime'); } catch (e) { }
      if (queue.length) { queueTimer = setTimeout(function () { queueTimer = 0; schedule(); }, 2800); }
    }, 1600);
  }

  /* ---------- a small sheet (same look as the engine's) ---------- */
  function sheet(title, build) {
    if (openSheet) openSheet();
    var wrap = doc.createElement('div'); wrap.className = 'sheet-wrap today-wrap';
    wrap.innerHTML = '<section class="sheet today" role="dialog" aria-modal="true" aria-label="' + title + '"><h2>' + title + '</h2><div class="sheet-body"></div><div class="sheet-actions"></div></section>';
    var body = wrap.querySelector('.sheet-body'), acts = wrap.querySelector('.sheet-actions');
    function close() { if (!wrap.parentNode) return; wrap.remove(); if (openSheet === close) openSheet = null; }
    var b = doc.createElement('button'); b.type = 'button'; b.className = 'btn primary'; b.id = 'todayClose'; b.textContent = 'Close';
    b.addEventListener('click', close); acts.appendChild(b);
    wrap.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Escape') close(); });
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    doc.body.appendChild(wrap); openSheet = close;
    build(body);
    b.focus();
    return close;
  }
  function el(tag, cls, text) { var n = doc.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }

  function openToday(redraw) {
    if (!R()) return;
    if (!redraw) tick(); /* so the list is current the moment it opens */
    var st = api.state(), today = api.today(), d = data(), day = R().begin(d, st, today);
    var greet = null;
    if (d.greeted !== today) { d.greeted = today; api.save(); greet = R().greeting(today, new Date().getHours(), weatherNow(today)); }
    else if (redraw && openSheet && doc.querySelector('.today-greet')) greet = [doc.querySelector('.today-greet p').textContent, doc.querySelector('.today-greet p + p').textContent];
    sheet('Today', function (body) {
      if (greet) { var g = el('div', 'today-greet'); g.appendChild(el('p', '', greet[0])); g.appendChild(el('p', 'muted', greet[1])); body.appendChild(g); }
      var list = el('ul', 'today-list');
      R().status(d, st, today).forEach(function (s) {
        var li = el('li', 'today-item' + (s.done ? ' done' : '')); li.dataset.id = s.id;
        var icon = el('span', 'today-icon'); icon.style.setProperty('--f', String(s.icon)); icon.setAttribute('aria-hidden', 'true'); li.appendChild(icon);
        var text = el('span', 'today-text'); text.appendChild(el('b', '', s.label)); text.appendChild(el('small', '', s.where)); li.appendChild(text);
        var tick = el('span', 'today-tick'); tick.innerHTML = TICK; li.appendChild(tick);
        li.appendChild(el('span', 'today-sr', s.done ? 'Done' : 'Not yet, and that is fine'));
        list.appendChild(li);
      });
      body.appendChild(list);
      var hearts = el('p', 'today-hearts'); hearts.innerHTML = 'Hearts today <b id="todayHearts"></b><span class="muted"> and <b id="todayTotal"></b> altogether</span>';
      hearts.querySelector('#todayHearts').textContent = String(day.hearts); hearts.querySelector('#todayTotal').textContent = String(d.total);
      body.appendChild(hearts);
      body.appendChild(el('p', 'today-line', R().line(d, today)));
      body.appendChild(el('p', 'muted today-run', R().runLine(d)));
    });
  }

  /* ---------- wiring ---------- */
  function start(a) {
    api = a;
    root.EbbGame.registerPanel({ id: 'today', label: 'Today', open: function () { openToday(); } });
    root.EbbGame.registerHud('Hearts', function () { return R() ? data().total : 0; });
    var app = doc.querySelector('.app');
    if (app && !doc.getElementById('todayBtn')) {
      var b = doc.createElement('button'); b.type = 'button'; b.className = 'btn today-sun'; b.id = 'todayBtn';
      b.setAttribute('aria-label', 'Today'); b.title = 'Today'; b.innerHTML = SUN;
      b.addEventListener('click', function (e) { e.stopPropagation(); openToday(); });
      app.appendChild(b);
    }
    tick();
    setInterval(function () { if (!doc.hidden) tick(); }, 1000);
    doc.addEventListener('visibilitychange', function () { if (!doc.hidden) tick(); });
  }
  doc.addEventListener('ebb:ready', function (e) { start(e.detail || root.EbbGame.api); });
  if (root.EbbGame._ready) start(root.EbbGame.api);

  root.EbbToday = { open: function () { openToday(); }, tick: tick, rules: R };
})(window);
