/* Ebb bag extension (phase 2): one place that shows everything she carries. A round Bag button sits bottom-left above
 * the sound toggle, and More > Bag opens the same sheet: a grid of items with icon, name and count, grouped by kind,
 * each with a line on what it is for and, where it makes sense here, one action (plant a seed in the garden, eat a
 * cooked dish at the kitchen table). Rules live in js/bag/core.js and the item registry in js/bag/items.js; both load
 * from here so index.html needs no change beyond the one script line. Nothing in the bag is ever taken away as a
 * punishment, and nothing here asks about health. */
(function (root) {
  'use strict';
  var doc = root.document;
  if (!doc || !root.EbbGame) return;

  /* pure modules, in order; scripts added before the load event still run before the game boots */
  ['js/bag/items.js', 'js/bag/core.js'].forEach(function (src) {
    if (doc.querySelector('script[src="' + src + '"]')) return;
    var s = doc.createElement('script'); s.src = src; s.async = false; doc.head.appendChild(s);
  });
  function I() { return root.EbbItems; }
  function B() { return root.EbbBag; }
  function api() { return root.EbbGame.api; }

  /* ---------- icons: one cell of a clay strip, drawn in CSS pixels ---------- */
  function stripMeta(name) {
    var sp = root.EbbPropSprites && root.EbbPropSprites[name];
    if (sp) return { src: 'art/' + (sp.dir || 'props') + '/' + name + '.webp', frames: sp.frames, w: sp.w, h: sp.h };
    var extra = I() && I().STRIPS[name];
    return extra ? { src: extra.src, frames: extra.frames, w: extra.w, h: extra.h } : null;
  }
  function iconHtml(item, px) {
    var letter = '<span class="bag-letter" aria-hidden="true">' + (item.name || '?').charAt(0) + '</span>', m = item.icon && stripMeta(item.icon.strip);
    if (!m) return letter;
    var f = Math.min(Math.max(0, item.icon.frame), m.frames - 1), h = px * m.h / m.w;
    return letter + '<svg class="bag-ico" width="' + px + '" height="' + px + '" viewBox="' + (f * m.w) + ' 0 ' + m.w + ' ' + m.h + '" preserveAspectRatio="xMidYMax meet" aria-hidden="true">' +
      '<image href="' + m.src + '" width="' + (m.w * m.frames) + '" height="' + m.h + '"/></svg>';
  }
  function drawnBag() { /* a woven bag, used until the clay one is cut from the dig sheet */
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9.5h14l-1.2 10.2a1.6 1.6 0 0 1-1.6 1.3H7.8a1.6 1.6 0 0 1-1.6-1.3z" fill="currentColor" opacity="0.92"/>' +
      '<path d="M8.4 9.5V7.6a3.6 3.6 0 0 1 7.2 0v1.9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>' +
      '<path d="M7.5 13h9M7.9 16h8.2" stroke="#fffaf3" stroke-width="1.1" stroke-linecap="round" opacity="0.8"/></svg>';
  }

  /* ---------- the sheet ---------- */
  var openSheet = null;
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function el(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

  function open() {
    if (openSheet) { openSheet.close(); }
    if (!B() || !I()) { api().toast('The bag is still being packed. One moment.'); return null; }
    var a = api(), wrap = el('div', 'sheet-wrap bag-sheet'), view = { kind: 'grid', id: null };
    wrap.innerHTML = '<section class="sheet" role="dialog" aria-modal="true" aria-labelledby="bagTitle"><div class="bag-head"><h2 id="bagTitle">Bag</h2><p class="muted bag-total"></p></div><div class="sheet-body"></div><div class="sheet-actions"></div></section>';
    var body = wrap.querySelector('.sheet-body'), acts = wrap.querySelector('.sheet-actions'), totalEl = wrap.querySelector('.bag-total');
    function close() { if (!wrap.parentNode) return; wrap.remove(); openSheet = null; if (btn) btn.setAttribute('aria-expanded', 'false'); }
    function buttons(list) {
      acts.innerHTML = '';
      list.forEach(function (x) {
        var b = el('button', x.primary ? 'btn primary' : 'btn', x.label); b.type = 'button'; if (x.id) b.id = x.id;
        b.addEventListener('click', x.fn); acts.appendChild(b);
      });
      /* focus stays inside the sheet after every redraw, so Escape and Enter keep working and never reach the game */
      var first = acts.querySelector('button'); if (first) first.focus({ preventScroll: true });
    }
    function grid() {
      view = { kind: 'grid', id: null };
      var st = a.state(), groups = B().grouped(st), n = B().total(st);
      totalEl.textContent = n ? n + (n === 1 ? ' thing' : ' things') : '';
      body.innerHTML = '';
      /* short on purpose (Jamie, 25 Oct: too wordy): only the kinds that hold something, no explainer under each heading;
       * an item's own line shows when it is tapped. An empty bag is one line. */
      if (!n) body.appendChild(el('p', 'muted bag-empty', 'Your bag is empty.'));
      groups.forEach(function (g) {
        if (!g.items.length) return;
        var sec = el('section', 'bag-kind'); sec.dataset.kind = g.kind.id;
        var h = el('h3', null, g.kind.label); sec.appendChild(h);
        var list = el('div', 'bag-grid'); list.setAttribute('role', 'list');
        g.items.forEach(function (e) {
          var b = el('button', 'bag-item'); b.type = 'button'; b.setAttribute('role', 'listitem'); b.dataset.id = e.id;
          b.innerHTML = '<span class="bag-pic">' + iconHtml(e.item, 56) + '</span><span class="bag-name"></span><b class="bag-count" aria-label="' + e.count + ' held">' + e.count + '</b>';
          b.querySelector('.bag-name').textContent = e.item.name;
          b.addEventListener('click', function () { detail(e.id); });
          list.appendChild(b);
        });
        sec.appendChild(list); body.appendChild(sec);
      });
      buttons([{ label: 'Done', id: 'bagDone', primary: true, fn: close }]);
      wrap.querySelector('.sheet').scrollTop = 0; /* the sheet scrolls, so a long bag opens at its title */
    }
    function detail(id) {
      view = { kind: 'detail', id: id };
      var st = a.state(), e = B().list(st).filter(function (x) { return x.id === id; })[0];
      if (!e) { grid(); return; }
      var k = I().kind(e.item.kind), card = el('div', 'bag-detail');
      card.innerHTML = '<div class="bag-pic big">' + iconHtml(e.item, 96) + '</div><div class="bag-words"><h3></h3><p class="bag-held"></p><p class="bag-use"></p><p class="muted bag-note"></p></div>';
      card.querySelector('h3').textContent = e.item.name;
      card.querySelector('.bag-held').textContent = e.count === 1 ? 'You have one.' : 'You have ' + e.count + '.';
      card.querySelector('.bag-use').textContent = e.item.about || (k ? k.about : '');
      var note = card.querySelector('.bag-note'), notes = [];
      if (!e.item.about && k && e.item.stub) notes.push('Something nobody has described yet. It is safe in the bag.');
      var list = B().actionsFor(e, { api: a, state: st, close: close, notes: notes });
      if (!list.length && k && k.id !== 'gift' && k.id !== 'tool') notes.push(WHERE[k.id] || '');
      note.textContent = notes.filter(Boolean).join(' ');
      note.hidden = !note.textContent;
      body.innerHTML = ''; body.appendChild(card); wrap.querySelector('.sheet').scrollTop = 0;
      var bs = [{ label: 'Back', id: 'bagBack', fn: grid }];
      list.slice(0, 1).forEach(function (x) { bs.push({ label: x.label, id: 'bagAct-' + x.id, primary: true, fn: function () { x.run({ entry: e, api: a, state: a.state(), close: close }); } }); });
      buttons(bs);
    }
    wrap.addEventListener('keydown', function (ev) { ev.stopPropagation(); if (ev.key === 'Escape') close(); }); /* Enter on a button never reaches the game's key handler */
    wrap.addEventListener('click', function (ev) { if (ev.target === wrap) close(); });
    doc.body.appendChild(wrap);
    grid();
    if (btn) btn.setAttribute('aria-expanded', 'true');
    openSheet = { close: close, repaint: function () { if (view.kind === 'detail') detail(view.id); else grid(); }, view: function () { return view; } };
    return openSheet;
  }
  var WHERE = { seed: 'Plant it from a hoed bed on the farm.', crop: 'Take it to the pond at the waterfall.', find: 'Take it to the pond at the waterfall.' };

  /* ---------- actions this phase can do: both call the engine, which keeps its own rules ---------- */
  function wireActions() {
    var b = B(), F = root.EbbFarm, W = root.EbbWorld, G = root.EbbGame; if (!b || !F || !W) return;
    b.registerAction({ id: 'plant', label: 'Plant in a bed', kinds: ['seed'],
      when: function (c) {
        if (c.api.scene() !== 'farm') return false;
        var seeds = c.state.farm.seeds, first = Object.keys(F.CROPS).filter(function (k) { return seeds[k] > 0; })[0], mine = c.entry.id.replace(/^seed-/, '');
        if (first && first !== mine && c.notes) c.notes.push('Beds take seeds in shed order, so the ' + F.CROPS[first].name.toLowerCase() + ' seed goes in first.');
        return true;
      },
      run: function (c) {
        var s = W.SCENES.farm, me = G.me(), best = null;
        (s.beds || []).forEach(function (bd, i) {
          if (F.nextAction(c.state.farm, i, c.api.today()) !== 'plant') return;
          var d = Math.hypot(bd.x - me.x, bd.y - me.y); if (!best || d < best.d) best = { i: i, d: d, bd: bd };
        });
        c.close();
        if (!best) { c.api.toast('Hoe a bed first, then plant.'); return; }
        G.walkTo(W.bedStand(best.bd), { bed: best.i });
      } });
    /* a dish she cooked: eat it slowly at the kitchen table (walks her there when she is in the kitchen) */
    b.registerAction({ id: 'eat', label: 'Eat it at the table', kinds: ['dish'],
      when: function (c) { return c.api.scene() === 'kitchen'; },
      run: function (c) {
        var spot = (W.SCENES.kitchen.spots || []).filter(function (sp) { return sp.id === 'dining'; })[0];
        c.close(); if (spot) G.walkTo(spot.stand, { spot: spot });
      } });
  }

  /* ---------- the bag rests at home: a woven bag on the bedroom floor by the arch door ---------- */
  var W = root.EbbWorld, G = root.EbbGame;
  var HOME_BAG = { id: 'homebag', kind: 'homebag', at: { x: 35, y: 70 }, stand: { x: 34, y: 71 }, label: 'Open your bag' };
  if (W && W.SCENES && W.SCENES.bedroom && !W.SCENES.bedroom.spots.some(function (s) { return s.id === 'homebag'; })) {
    W.SCENES.bedroom.spots.push(HOME_BAG);
    G.registerProps('bedroom', function () {
      var sp = stripMeta('bag');
      if (!sp) return '';
      var at = HOME_BAG.at, scale = W.scaleAt(at.y, 'bedroom'), h = 42 * scale;
      var w = h * sp.w / sp.h, frame = 7; /* the woven tote cell of the bag strip */
      return '<g class="bag-home">' +
        '<ellipse cx="' + at.x + '" cy="' + (at.y + 0.25) + '" rx="' + (w * 0.42).toFixed(2) + '" ry="' + (w * 0.12).toFixed(2) + '" fill="rgba(60,40,20,0.16)"/>' +
        '<svg x="' + (at.x - w / 2).toFixed(2) + '" y="' + (at.y - h).toFixed(2) + '" width="' + w.toFixed(2) + '" height="' + h.toFixed(2) + '" viewBox="' + (frame * sp.w) + ' 0 ' + sp.w + ' ' + sp.h + '" preserveAspectRatio="none">' +
        '<image href="' + sp.src + '" width="' + (sp.w * sp.frames) + '" height="' + sp.h + '"/></svg></g>';
    });
  }
  G.registerKind('homebag', function () { open(); });

  /* ---------- the round button on the scene and the More menu entry ---------- */
  var btn = null;
  function paintButton() {
    if (!btn) return;
    var st = I() && I().STRIPS.bag; /* the clay woven bag once the dig sheet is cut; a drawn one until then */
    btn.innerHTML = (st && st.ready ? '<span class="bag-pic">' + iconHtml({ name: 'Bag', icon: { strip: 'bag', frame: 7 } }, 30) + '</span>' : drawnBag()) + '<span>Bag</span>';
  }
  function mount() {
    var app = doc.querySelector('.app');
    if (!app || doc.getElementById('bagBtn')) return;
    btn = doc.createElement('button');
    btn.type = 'button'; btn.id = 'bagBtn'; btn.className = 'bag-btn';
    btn.setAttribute('aria-haspopup', 'dialog'); btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-label', 'Bag: everything you carry');
    paintButton();
    btn.addEventListener('click', function (e) { e.stopPropagation(); open(); });
    btn.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); });
    app.appendChild(btn);
  }
  mount();
  root.addEventListener('load', paintButton);
  /* Bag stays on its always-visible round button; it is not duplicated in the More menu */
  function ready() { wireActions(); }
  if (root.EbbGame._ready) ready(); else doc.addEventListener('ebb:ready', ready, { once: true });

  root.EbbBagUi = { open: open, close: function () { if (openSheet) openSheet.close(); }, isOpen: function () { return !!openSheet; }, view: function () { return openSheet ? openSheet.view() : null; } };
})(typeof window !== 'undefined' ? window : globalThis);
