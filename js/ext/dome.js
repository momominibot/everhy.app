/* Ebb Flower Dome: the Gardens by the Bay glasshouse, a seed stall that takes points, and the points themselves.
 * Points come from logging (js/dome/rules.js, pure): the ledger is rebuilt from the saved data on load, after every
 * save and on a slow poll, so it never depends on catching an event. A Points counter sits in the top bar beside
 * Hearts. The stall sells the farm's own crops; a bought seed lands in state.farm.seeds like the shed's free ones, and
 * the shed keeps handing out its three a day. Hearts are never read or written here. The stall's keeper, a clay auntie
 * gardener, stands beside the counter as a still prop (never wandering) with a line when she comes near. Her second
 * shelf sells plants for the home: each stands in one of a few fixed places in the rooms (drawn as props there), chosen
 * in a small picker when buying and movable or put away from the same picker later. The place was read off the
 * plate (art/raw/sg_flowerdome.png, 768x1344) on a 5 percent grid: x 0..100 across, y 0..175 down. */
(function (root) {
  'use strict';
  var W = root.EbbWorld;
  if (!W) return;

  /* ---------- the place ---------- */
  W.register('dome', { /* the glass roof across the top, tiered beds and clay baobabs along the back, a round bed with a tree in the middle, a bench on the left, the seed stall and its cart on the right, paving below, the glass doors at the bottom */
    name: 'Flower Dome', plate: 'art/plates/flowerdome.webp', aspect: [4, 7], indoor: true, depth: [80, 0.2, 134, 0.3], surface: 'tile', sound: 'room',
    lamps: [{ x: 50, y: 20 }], windows: [{ x: 50, y: 30, rx: 40, ry: 16 }],
    soundSources: { birds: [[14, 44, 40], [84, 44, 40]], hush: [[50, 128, 24]] }, /* birds in the baobabs; the doors are hushed */
    floor: [[8, 78], [96, 78], [96, 134], [4, 134]],
    /* left shrubs, bench, the round bed (its upper half and the narrower lower rim), the stall, its steps, the seed cart, the rope and lavender on the left, the pink topiary and hedge each side */
    solids: [[0, 76, 14, 90], [14, 76, 29, 89], [23, 76, 68, 94], [27, 94, 64, 101], [64, 76, 100, 114], [63, 114, 83, 118], [52, 97, 68, 116], [0, 99, 25, 120], [0, 110, 20, 134], [75, 114, 100, 134]],
    doors: [{ id: 'toMerlion', rect: [34, 128, 66, 134], to: 'merlion', arrive: { x: 40, y: 136 }, label: 'Out to Merlion Park' }],
    spots: [
      { id: 'stall', kind: 'seedshop', at: { x: 82, y: 100 }, stand: { x: 71, y: 122 }, label: 'Seeds for your garden' },
      { id: 'bench', kind: 'cushion', at: { x: 22, y: 84 }, stand: { x: 18, y: 93 }, label: 'Sit among the flowers' }
    ],
    start: { x: 50, y: 118 }
  });
  /* the open paving at the right edge of the promenade, past the railing and in front of the notice board; the lamp stands below it */
  W.addDoor('merlion', { id: 'toDome', rect: [86.5, 122.5, 94, 127.5], to: 'dome', arrive: { x: 50, y: 118 }, label: 'To the Flower Dome' });

  var doc = root.document;
  if (!doc || !root.EbbGame) return; /* the node harness stops here */

  /* rules load as their own file; the load event waits for them, so they are here before the game boots */
  if (!root.EbbDomeRules) { var sc = doc.createElement('script'); sc.src = 'js/dome/rules.js'; sc.async = false; doc.head.appendChild(sc); }
  function R() { return root.EbbDomeRules; }
  var S = root.EbbStore, F = root.EbbFarm, api = null, syncing = false, pollTimer = 0, noteTimer = 0, pendingNote = 0;

  /* ---------- the ledger follows the data ---------- */
  function sync(quiet) {
    if (!api || !R() || syncing) return null;
    syncing = true;
    var r = null;
    try {
      r = R().recompute(api.state(), api.today());
      syncFloorSolids();
      if (r.added.length) { S.save(); api.refresh(); }
      if (r.gained > 0 && !quiet) note(r.gained);
    } catch (e) { console.error(e); }
    syncing = false;
    return r;
  }
  function note(n) { /* one quiet line after the engine's own toast has had its moment */
    pendingNote += n;
    if (noteTimer) return;
    noteTimer = setTimeout(function () {
      noteTimer = 0; var k = pendingNote; pendingNote = 0;
      api.toast('+' + k + ' hearts. Spend them on seeds and plants at the Flower Dome.', 2600);
      try { if (root.EbbSound && typeof root.EbbSound.play === 'function') root.EbbSound.play('chime'); } catch (e) { }
    }, 2200);
  }
  /* every save (the engine's, any extension's) is followed by a recompute; the recompute's own save does not loop */
  if (S && typeof S.save === 'function' && !S._domeWrapped) {
    var origSave = S.save;
    S.save = function () { var ok = origSave.apply(S, arguments); if (!syncing) sync(); return ok; };
    S._domeWrapped = true;
  }

  /* ---------- sprites (Seedream clay, keyed by tools/slice_sheet.py; sizes from the slicer's json when it loads) ---------- */
  var SPR = {
    keeper: { src: 'art/dome/keeper.webp', frames: 1, w: 167, h: 304 },
    plants: { src: 'art/dome/plants.webp', frames: 6, w: 191, h: 276 }
  };
  Object.keys(SPR).forEach(function (k) {
    if (!root.fetch) return;
    root.fetch(SPR[k].src.replace('.webp', '.json')).then(function (r) { return r.json(); }).then(function (j) {
      SPR[k].frames = j.frames; SPR[k].w = j.w; SPR[k].h = j.h; if (root.EbbGame._ready) root.EbbGame.api.refresh();
    }).catch(function () { });
  });
  /* one frame of a strip, feet at (x, y), height h scene units */
  function sprite(name, frame, x, y, h, cls, attrs) {
    var sp = SPR[name], w = h * sp.w / sp.h, x0 = x - w / 2, y0 = y - h;
    return '<g class="' + cls + '"' + (attrs || '') + '><svg x="' + x0.toFixed(2) + '" y="' + y0.toFixed(2) + '" width="' + w.toFixed(2) + '" height="' + h.toFixed(2) + '" viewBox="' + (frame * sp.w) + ' 0 ' + sp.w + ' ' + sp.h + '" preserveAspectRatio="none">' +
      '<image href="' + sp.src + '" width="' + (sp.w * sp.frames) + '" height="' + sp.h + '"/></svg></g>';
  }
  function shadow(x, y, rx) { return '<ellipse cx="' + x + '" cy="' + y + '" rx="' + rx + '" ry="' + (rx * 0.28).toFixed(2) + '" fill="rgba(60,40,20,0.16)"/>'; }
  var KEEPER_AT = { x: 90, y: 116 }; /* on the paving at the right end of the counter, in front of the little pots */
  function bubble(x, y, text) { /* a small speech bubble that stays inside the plate's right edge */
    var w = Math.min(44, text.length * 1.05 + 4), x0 = Math.min(100 - w - 1, x - w / 2), cx = x0 + w / 2;
    return '<g class="dome-bubble"><rect x="' + x0.toFixed(1) + '" y="' + (y - 5.2).toFixed(1) + '" width="' + w.toFixed(1) + '" height="4.6" rx="1.4" fill="#fffaf3" stroke="#e6d8c8" stroke-width="0.25"/>' +
      '<path d="M' + (x - 1).toFixed(1) + ' ' + (y - 0.7).toFixed(1) + ' l1 1.3 l1 -1.3z" fill="#fffaf3"/>' +
      '<text x="' + cx.toFixed(1) + '" y="' + (y - 2.1).toFixed(1) + '" font-size="2.1" font-weight="600" text-anchor="middle" fill="#2f2a2d">' + text + '</text></g>';
  }
  root.EbbGame.registerProps('dome', function (a, near) {
    var h = 100 * W.scaleAt(KEEPER_AT.y, 'dome'), out = shadow(KEEPER_AT.x, KEEPER_AT.y, h * 0.2) + sprite('keeper', 0, KEEPER_AT.x, KEEPER_AT.y, h, 'dome-keeper');
    if (near && near.spot && near.spot.kind === 'seedshop' && R()) out += bubble(KEEPER_AT.x, KEEPER_AT.y - h - 0.6, R().keeperLine(a.today()));
    return out;
  });
  /* her plants, standing where she put them */
  function roomPlants(a) {
    if (!R()) return '';
    var st = a.state(), out = '';
    R().plantsIn(st.homePlants, a.scene()).forEach(function (p) {
      var h = 52 * W.scaleAt(p.y, a.scene());
      out += shadow(p.x, p.y, h * 0.3) + sprite('plants', p.frame, p.x, p.y, h, 'dome-plant', ' data-plant="' + p.plant + '" data-spot="' + p.spot + '"');
    });
    return out;
  }
  ['bedroom', 'living', 'bathroom'].forEach(function (id) { root.EbbGame.registerProps(id, roomPlants); });

  /* A floor-standing plant occupies a patch of the floor, so she walks round it. Each floor place carries one small
   * solid rect, present only while a plant stands there; surface places need none. Tagged with a marker so they are
   * easy to remove and never touch the scene's own furniture solids. */
  var FLOOR_TAG = 'domeFloorPlant';
  function floorSolidRect(sp) { return [sp.x - 2, sp.y - 1, sp.x + 2, sp.y + 1]; }
  function syncFloorSolids() {
    if (!R()) return;
    var st = root.EbbGame.state ? root.EbbGame.state() : null;
    if (!st) return;
    ['bedroom', 'living', 'bathroom'].forEach(function (sceneId) {
      var scene = W.SCENES[sceneId];
      if (!scene) return;
      scene.solids = scene.solids.filter(function (r) { return !r[FLOOR_TAG]; });
      Object.keys(R().HOME_SPOTS).forEach(function (key) {
        var sp = R().HOME_SPOTS[key];
        if (sp.scene !== sceneId || !sp.floor || !R().occupant(st.homePlants, key)) return;
        var rect = floorSolidRect(sp); rect[FLOOR_TAG] = true; scene.solids.push(rect);
      });
    });
  }

  /* ---------- a small sheet (same look as the engine's) ---------- */
  var openSheet = null;
  function sheet(title, build, onClose) {
    if (openSheet) openSheet();
    var wrap = doc.createElement('div'); wrap.className = 'sheet-wrap dome-wrap';
    wrap.innerHTML = '<section class="sheet dome" role="dialog" aria-modal="true" aria-label="' + title + '"><h2>' + title + '</h2><div class="sheet-body"></div><div class="sheet-actions"></div></section>';
    var body = wrap.querySelector('.sheet-body'), acts = wrap.querySelector('.sheet-actions');
    function close() { if (!wrap.parentNode) return; wrap.remove(); if (openSheet === close) openSheet = null; if (onClose) onClose(); }
    var b = doc.createElement('button'); b.type = 'button'; b.className = 'btn primary'; b.id = 'domeClose'; b.textContent = 'Close';
    b.addEventListener('click', close); acts.appendChild(b);
    wrap.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Escape') close(); });
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    root.EbbMount(wrap); openSheet = close;
    build(body);
    b.focus();
    return close;
  }
  function el(tag, cls, text) { var n = doc.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }

  /* ---------- the stall: two shelves, seeds and plants ---------- */
  var SEED_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 20c-4.2 0-7-2.8-7-7 0-4.6 3.4-8.6 7-10 3.6 1.4 7 5.4 7 10 0 4.2-2.8 7-7 7Z" fill="var(--seed, #d9b37a)" stroke="rgba(60,40,20,0.28)" stroke-width="0.9"/><path d="M12 20V9" stroke="#fffaf3" stroke-width="1.6" stroke-linecap="round"/></svg>';
  function plantIcon(frame) {
    var sp = SPR.plants;
    return '<svg viewBox="' + (frame * sp.w) + ' 0 ' + sp.w + ' ' + sp.h + '" aria-hidden="true" focusable="false"><image href="' + sp.src + '" width="' + (sp.w * sp.frames) + '" height="' + sp.h + '"/></svg>';
  }
  function chime() { try { if (root.EbbSound && typeof root.EbbSound.play === 'function') root.EbbSound.play('chime'); } catch (e) { } }
  function balanceLine(body) {
    var bal = el('p', 'dome-balance'); bal.innerHTML = 'Your hearts <b id="domePoints"></b>'; bal.querySelector('b').textContent = String(R().balance(api.state().points));
    body.appendChild(bal);
  }
  var tab = 'seeds', focusCrop = null;
  function openStall() {
    sync(true);
    sheet('Seed stall', function (body) {
      function tabs() {
        var row = el('div', 'dome-tabs'); row.setAttribute('role', 'tablist');
        [['seeds', 'Seeds'], ['plants', 'Plants']].forEach(function (t) {
          var b = el('button', 'dome-tab', t[1]); b.type = 'button'; b.id = 'tab-' + t[0]; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(tab === t[0]));
          b.addEventListener('click', function () { tab = t[0]; draw(); b.focus(); });
          row.appendChild(b);
        });
        return row;
      }
      function draw(line) {
        body.innerHTML = '';
        body.appendChild(tabs());
        if (tab === 'plants') drawPlants(line); else drawSeeds(line);
      }
      function drawSeeds(line) {
        var st = api.state(), have = R().balance(st.points);
        balanceLine(body);
        if (line) body.appendChild(el('p', 'dome-said', line));
        var list = el('ul', 'dome-list');
        R().catalog(F.CROPS).forEach(function (row) {
          var li = el('li', 'dome-item'); li.dataset.crop = row.crop;
          var icon = el('span', 'dome-icon'); icon.innerHTML = SEED_ICON; icon.style.setProperty('--seed', F.CROPS[row.crop].colour || '#d9b37a'); li.appendChild(icon);
          var text = el('span', 'dome-text'); text.appendChild(el('b', '', row.name + ' seed'));
          var owned = st.farm && st.farm.seeds && st.farm.seeds[row.crop] || 0;
          text.appendChild(el('small', '', row.price + ' hearts' + (owned ? ', you have ' + owned : ''))); li.appendChild(text);
          var short = have < row.price, b = el('button', 'btn dome-buy', short ? 'Not yet' : 'Buy'); b.type = 'button'; b.id = 'buy-' + row.crop;
          b.setAttribute('aria-label', (short ? 'Not enough hearts for a ' : 'Buy a ') + row.name.toLowerCase() + ' seed, ' + row.price + ' hearts');
          if (short) { b.disabled = true; li.classList.add('short'); li.appendChild(el('small', 'dome-short', R().shortLine(row.price - have))); }
          b.addEventListener('click', function () {
            focusCrop = row.crop;
            var res = R().buy(api.state(), row.crop, api.today(), F.CROPS);
            if (!res.ok) { draw(res.reason === 'short' ? R().shortLine(res.need) : 'That one is not on the shelf.'); return; }
            S.save(); api.refresh(); chime();
            draw('A ' + row.name.toLowerCase() + ' seed, wrapped in paper. It is in your seeds for the garden.');
          });
          li.appendChild(b);
          list.appendChild(li);
        });
        body.appendChild(list);
        body.appendChild(el('p', 'muted dome-earn', R().EARN_LINE));
        body.appendChild(el('p', 'muted dome-shed', 'The garden shed still gives three free seeds a day.'));
        /* a redraw replaces the button she tapped: keep the keyboard inside the sheet so Escape and Tab still work */
        var keep = focusCrop && body.querySelector('#buy-' + focusCrop), fallback = doc.getElementById('domeClose');
        if (keep && !keep.disabled) keep.focus(); else if (fallback && focusCrop) fallback.focus();
        focusCrop = null;
      }
      /* a full-size look at one plant, so its leaves and pot are clear; tap the image to open it */
      function viewPlant(row) {
        var v = el('div', 'dome-viewer');
        v.innerHTML = '<div class="dome-viewer-card" role="dialog" aria-modal="true" aria-label="' + row.name + '">' +
          '<button class="dome-viewer-x" type="button" aria-label="Close">&times;</button>' +
          '<span class="dome-viewer-img"></span><h3></h3><p></p></div>';
        var card = v.querySelector('.dome-viewer-card');
        v.querySelector('.dome-viewer-img').innerHTML = plantIcon(row.frame);
        v.querySelector('h3').textContent = row.name;
        v.querySelector('p').textContent = row.line;
        function shut() { v.remove(); doc.removeEventListener('keydown', onKey); }
        function onKey(e) { if (e.key === 'Escape') shut(); }
        v.querySelector('.dome-viewer-x').addEventListener('click', shut);
        v.addEventListener('click', function (e) { if (e.target === v) shut(); });
        doc.addEventListener('keydown', onKey);
        root.EbbMount(v);
        card.querySelector('.dome-viewer-x').focus();
      }
      function drawPlants(line) {
        var st = api.state(), have = R().balance(st.points), h = R().ensureHome(st.homePlants);
        balanceLine(body);
        if (line) body.appendChild(el('p', 'dome-said', line));
        body.appendChild(el('p', 'muted dome-tap', 'Tap a plant for a closer look.'));
        var list = el('ul', 'dome-plants');
        R().plantCatalog().forEach(function (row) {
          var li = el('li', 'dome-plant-card');
          var big = el('button', 'dome-plant-big'); big.type = 'button';
          big.setAttribute('aria-label', 'Look closely at the ' + row.name.toLowerCase());
          big.innerHTML = plantIcon(row.frame);
          big.addEventListener('click', function () { viewPlant(row); });
          var col = el('div', 'dome-plant-info');
          var head = el('div', 'dome-plant-head');
          head.appendChild(el('b', '', row.name));
          head.appendChild(el('span', 'dome-plant-price', row.price + ' hearts'));
          col.appendChild(head);
          col.appendChild(el('p', 'dome-plant-line', row.line));
          var short = have < row.price;
          var b = el('button', 'btn primary dome-plant-buy', short ? 'Not yet' : 'Buy'); b.type = 'button'; b.id = 'buy-' + row.plant;
          b.setAttribute('aria-label', (short ? 'Not enough hearts for the ' : 'Buy the ') + row.name.toLowerCase() + ', ' + row.price + ' hearts');
          if (short) { b.disabled = true; col.appendChild(el('small', 'dome-short', R().shortLine(row.price - have))); }
          b.addEventListener('click', function () { picker({ buy: row.plant, title: 'Where should the ' + row.name.toLowerCase() + ' go?' }); });
          col.appendChild(b);
          li.appendChild(big); li.appendChild(col);
          list.appendChild(li);
        });
        body.appendChild(list);
        if (h.plants.length) {
          body.appendChild(el('h3', 'dome-sub', 'Your plants'));
          var mine = el('ul', 'dome-list dome-mine');
          h.plants.forEach(function (p) {
            var li = el('li', 'dome-item'); li.dataset.id = p.id;
            var icon = el('span', 'dome-icon dome-plant-icon'); icon.innerHTML = plantIcon(R().PLANTS[p.plant].frame); li.appendChild(icon);
            var text = el('span', 'dome-text'); text.appendChild(el('b', '', R().PLANTS[p.plant].name));
            text.appendChild(el('small', '', p.spot ? R().HOME_SPOTS[p.spot].label : 'Put away for now')); li.appendChild(text);
            var mv = el('button', 'btn dome-move', p.spot ? 'Move' : 'Place'); mv.type = 'button'; mv.id = 'move-' + p.id;
            mv.addEventListener('click', function () { picker({ move: p.id, title: 'Where should the ' + R().PLANTS[p.plant].name.toLowerCase() + ' go?' }); });
            li.appendChild(mv);
            mine.appendChild(li);
          });
          body.appendChild(mine);
        }
        body.appendChild(el('p', 'muted dome-earn', 'Plants stand in a few places at home: the bedroom window seat, the kitchen cabinet and sill, the bathroom shelf. Each place holds one.'));
      }
      /* the picker: a place for a plant she is buying or moving; whatever stood there goes away for now */
      function picker(opt) {
        body.innerHTML = '';
        body.appendChild(el('h3', 'dome-sub', opt.title));
        var list = el('ul', 'dome-pick');
        var h = R().ensureHome(api.state().homePlants);
        R().spotList(h).forEach(function (sp) {
          var li = el('li'); var b = el('button', 'btn dome-spot'); b.type = 'button'; b.id = 'spot-' + sp.spot.replace('.', '-');
          var mineHere = opt.move && sp.occupant === opt.move;
          b.innerHTML = '<b></b><small></small>'; b.querySelector('b').textContent = sp.label;
          b.querySelector('small').textContent = mineHere ? 'It is here now' : sp.occupant ? 'Has the ' + sp.occupantName.toLowerCase() + ', which goes away for now' : 'Free';
          if (mineHere) b.disabled = true;
          b.addEventListener('click', function () { choose(opt, sp.spot); });
          li.appendChild(b); list.appendChild(li);
        });
        var li = el('li'); var away = el('button', 'btn dome-spot', ''); away.type = 'button'; away.id = 'spot-away';
        away.innerHTML = '<b></b><small></small>'; away.querySelector('b').textContent = opt.buy ? 'Keep it for later' : 'Put it away for now';
        away.querySelector('small').textContent = 'It waits in the Plants shelf under Your plants';
        away.addEventListener('click', function () { choose(opt, null); });
        li.appendChild(away); list.appendChild(li);
        body.appendChild(list);
        var back = el('button', 'btn dome-back', 'Back'); back.type = 'button'; back.id = 'pickBack'; back.addEventListener('click', function () { draw(); });
        body.appendChild(back);
        var first = list.querySelector('button:not(:disabled)'); if (first) first.focus();
      }
      function choose(opt, spot) {
        var st = api.state(), name;
        if (opt.buy) {
          var res = R().buyPlant(st, opt.buy, api.today(), spot);
          if (!res.ok) { draw(res.reason === 'short' ? R().shortLine(res.need) : 'That one is not on the shelf.'); return; }
          name = R().PLANTS[opt.buy].name;
          S.save(); syncFloorSolids(); api.refresh(); chime();
          draw(spot ? 'The ' + name.toLowerCase() + ' is yours. It stands at the ' + R().HOME_SPOTS[spot].label.toLowerCase() + '.' : 'The ' + name.toLowerCase() + ' is yours, kept for later.');
        } else {
          R().ensureHome(st.homePlants); R().place(st.homePlants, opt.move, spot);
          S.save(); syncFloorSolids(); api.refresh();
          draw(spot ? 'Moved to the ' + R().HOME_SPOTS[spot].label.toLowerCase() + '.' : 'Put away for now.');
        }
        var fallback = doc.getElementById('domeClose'); if (fallback) fallback.focus();
      }
      draw();
    });
  }
  root.EbbGame.registerKind('seedshop', function (spot, a) { api = api || a; openStall(); });

  /* ---------- wiring ----------
   * dev/test only: ?hearts=N grants N hearts once (idempotent) so the seed and plant stalls can be tried without
   * earning them. It only does anything when the query param is present, never in the normal game. */
  function grantDevHearts(a) {
    try {
      var m = root.location && root.location.search ? /[?&]hearts=(\d+)/.exec(root.location.search) : null;
      if (!m) return;
      var n = parseInt(m[1], 10); if (!(n > 0)) return;
      var st = a.state(), p = R().ensure(st.points);
      st.points = p; /* attach the ledger: ensure makes a new object when the state has none */
      var id = 'dev:hearts:' + n;
      if (p.entries.some(function (e) { return e.id === id; })) return;
      p.entries.push({ id: id, date: a.today(), source: 'dev', n: n });
    } catch (e) { console.error(e); }
  }
  function start(a) {
    api = a;
    /* its own little icon: a five-petal flower, so the Points chip never borrows the Hearts chip's heart */
    var FLOWER = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g fill="#f6c453" stroke="#d99a2b" stroke-width="1.1">' +
      [0, 72, 144, 216, 288].map(function (d) { return '<ellipse cx="12" cy="6.6" rx="3.6" ry="4.6" transform="rotate(' + d + ' 12 12)"/>'; }).join('') +
      '</g><circle cx="12" cy="12" r="3" fill="#fff4d6" stroke="#d99a2b" stroke-width="1.1"/></svg>';
    root.EbbGame.registerHud('Hearts', function () { return R() ? R().balance(a.state().points) : 0; }); /* the one currency: logging, practices and Today's invitations earn hearts, the Flower Dome spends them */
    grantDevHearts(a);
    sync(true); /* what she already saved counts from the first open, with no fanfare */
    syncFloorSolids(); /* floor-standing plants keep their blocking solid from the first open */
    pollTimer = setInterval(function () { if (!doc.hidden) sync(); }, 3000);
    doc.addEventListener('visibilitychange', function () { if (!doc.hidden) sync(); });
  }
  doc.addEventListener('ebb:ready', function (e) { start(e.detail || root.EbbGame.api); });
  if (root.EbbGame._ready) start(root.EbbGame.api);

  root.EbbDome = { open: openStall, sync: function () { return sync(true); }, rules: R, keeperAt: KEEPER_AT };
})(typeof window !== 'undefined' ? window : globalThis);
