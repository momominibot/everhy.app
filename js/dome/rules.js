/* Ebb Flower Dome rules, pure: a points ledger fed from what she already saved, and the seed stall that spends it.
 * Every confirmed log entry earns 10 and every practice that ran to the end earns 15, at most 60 a day, counted on
 * the day it was saved. The ledger is recomputed from the data whenever asked and never counts an entry twice: each
 * entry is remembered by the id of the record it came from, so a retracted or edited record keeps the points it earned
 * and a repeat recompute changes nothing. Spending is its own entry. Hearts (the Today loop) are never touched.
 * Seeds bought here land in state.farm.seeds exactly as the shed's free seeds do, so the farm needs no change.
 * Plants for the home live in state.homePlants, each standing in one of a few fixed places in the rooms, or put away. */
(function (root) {
  'use strict';

  var EARN = { log: 10, practice: 15, today: 10 }, CAP_PER_DAY = 60;
  var PRICES = { turnip: 20, carrot: 30, sunflower: 40 }, DEFAULT_PRICE = 30;

  function pad(n) { return String(n).padStart(2, '0'); }
  function dayOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  /* the local calendar day of a saved timestamp; a plain date string is kept as it is */
  function localDate(v) {
    if (typeof v !== 'string' || !v) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    var t = Date.parse(v); if (isNaN(t)) return null;
    return dayOf(new Date(t));
  }

  function ensure(p) {
    if (!p || typeof p !== 'object') p = {};
    if (!Array.isArray(p.entries)) p.entries = [];
    p.entries = p.entries.filter(function (e) { return e && typeof e === 'object' && typeof e.id === 'string' && typeof e.n === 'number' && isFinite(e.n); });
    sum(p);
    return p;
  }
  function sum(p) { /* totals always follow the entries, so a mangled total repairs itself */
    var total = 0, spent = 0;
    p.entries.forEach(function (e) { if (e.n > 0) total += e.n; else spent -= e.n; });
    p.total = total; p.spent = spent;
    return p;
  }
  function balance(p) { p = ensure(p); return p.total - p.spent; }

  /* what the saved data would pay, oldest first, so a day's cap falls on the same entries every time */
  function earnable(st, today) {
    var out = [];
    var obs = st && st.log && Array.isArray(st.log.obs) ? st.log.obs : [];
    obs.forEach(function (o) {
      if (!o || typeof o !== 'object' || o.confirmed !== true || typeof o.id !== 'string' || !o.id) return;
      out.push({ id: 'log:' + o.id, date: localDate(o.created) || localDate(o.start) || today, source: 'log', n: EARN.log, at: typeof o.created === 'string' ? o.created : '' });
    });
    var pr = st && Array.isArray(st.observations) ? st.observations : [];
    pr.forEach(function (o) {
      if (!o || typeof o !== 'object' || o.type !== 'mindfulness' || o.status !== 'finished' || typeof o.id !== 'string' || !o.id) return;
      out.push({ id: 'practice:' + o.id, date: localDate(o.date) || localDate(o.end) || today, source: 'practice', n: EARN.practice, at: typeof o.end === 'string' ? o.end : '' });
    });
    /* Today's invitations (js/today/rules.js keeps which were done each day): each one and the all-three bonus pay too,
     * so there is one currency, hearts, for everything she does */
    var days = st && st.daily && st.daily.days && typeof st.daily.days === 'object' ? st.daily.days : {};
    Object.keys(days).forEach(function (date) {
      var day = days[date]; if (!day || typeof day !== 'object' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      Object.keys(day.done || {}).sort().forEach(function (id) { if (day.done[id]) out.push({ id: 'today:' + date + ':' + id, date: date, source: 'today', n: EARN.today, at: '' }); });
      if (day.bonus) out.push({ id: 'today:' + date + ':bonus', date: date, source: 'today', n: EARN.today, at: '~' });
    });
    return out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
  }

  /* bring the ledger up to date with the data: new records are added (capped by their day), known ones are left alone */
  function recompute(st, today) {
    if (!st || typeof st !== 'object') return { added: [], gained: 0, total: 0, spent: 0, balance: 0 };
    var p = st.points = ensure(st.points), seen = {}, perDay = {}, added = [], gained = 0;
    p.entries.forEach(function (e) { seen[e.id] = true; if (e.n > 0) perDay[e.date] = (perDay[e.date] || 0) + e.n; });
    earnable(st, today || dayOf(new Date())).forEach(function (c) {
      if (seen[c.id]) return;
      var room = Math.max(0, CAP_PER_DAY - (perDay[c.date] || 0)), n = Math.min(c.n, room);
      var e = { id: c.id, date: c.date, source: c.source, n: n }; /* n is 0 past the cap: remembered, earns nothing, never retried */
      p.entries.push(e); seen[c.id] = true; perDay[c.date] = (perDay[c.date] || 0) + n;
      added.push(e); gained += n;
    });
    sum(p);
    return { added: added, gained: gained, total: p.total, spent: p.spent, balance: p.total - p.spent };
  }

  function spend(p, n, source, date) {
    p = ensure(p);
    if (typeof n !== 'number' || !(n > 0) || Math.round(n) !== n) return false;
    if (p.total - p.spent < n) return false;
    var k = 1; p.entries.forEach(function (e) { if (e.n < 0) k++; });
    p.entries.push({ id: 'spend:' + k + ':' + date + ':' + source, date: date, source: source, n: -n });
    sum(p);
    return true;
  }

  function price(crop) { return Object.prototype.hasOwnProperty.call(PRICES, crop) ? PRICES[crop] : DEFAULT_PRICE; }
  /* the stall's shelf: one row per crop the farm can grow (its own, enumerable crops, never world items) */
  function catalog(CROPS) {
    return Object.keys(CROPS || {}).map(function (k) { return { crop: k, name: CROPS[k].name || k, price: price(k) }; });
  }
  /* buy one seed: the ledger is debited and the seed goes where the shed puts its seeds */
  function buy(st, crop, today, CROPS) {
    if (!st || !CROPS || !Object.prototype.hasOwnProperty.call(CROPS, crop)) return { ok: false, reason: 'unknown' };
    if (!st.farm || typeof st.farm !== 'object') return { ok: false, reason: 'nofarm' };
    if (!st.farm.seeds || typeof st.farm.seeds !== 'object') st.farm.seeds = {};
    var p = st.points = ensure(st.points), cost = price(crop), have = p.total - p.spent;
    if (have < cost) return { ok: false, reason: 'short', need: cost - have, price: cost, balance: have };
    spend(p, cost, 'seed:' + crop, today);
    st.farm.seeds[crop] = (st.farm.seeds[crop] || 0) + 1;
    return { ok: true, price: cost, balance: p.total - p.spent, seeds: st.farm.seeds[crop] };
  }

  /* ---------- plants for the home ---------- */
  /* the stall's second shelf: frame is the plant's place in art/dome/plants.webp (reading order of the render) */
  var PLANTS = {
    orchid: { name: 'Orchid', price: 60, frame: 0, line: 'A pink moth orchid in a cream pot. It likes a bright corner and a drink once a week.' },
    monstera: { name: 'Monstera', price: 70, frame: 1, line: 'A monstera in a terracotta pot, leaves like open hands.' },
    bonsai: { name: 'Bonsai', price: 80, frame: 2, line: 'A little bonsai on a blue dish. Slow, patient, and very old for its size.' },
    tulips: { name: 'Tulips', price: 40, frame: 3, line: 'Yellow tulips in a glass jar, fresh from the Flower Field.' },
    pothos: { name: 'Pothos', price: 50, frame: 4, line: 'A hanging pothos. It trails a little further every week.' },
    cactus: { name: 'Cactus', price: 40, frame: 5, line: 'A round cactus with one pink flower, in a striped pot. It asks for almost nothing.' }
  };
  /* fixed places in the rooms where a plant can stand, in plate percent of the square rooms (y 0..100) */
  var HOME_SPOTS = {
    'bedroom.window': { scene: 'bedroom', x: 61, y: 43, label: 'Bedroom, window seat corner' },
    'living.cabinet': { scene: 'living', x: 66, y: 46, label: 'Kitchen, record cabinet by the sofa' },
    'living.sill': { scene: 'living', x: 86, y: 61, label: 'Kitchen, window sill' },
    'bathroom.shelf': { scene: 'bathroom', x: 21, y: 56, label: 'Bathroom, shelf by the basket' }
  };
  function ensureHome(h) {
    if (!h || typeof h !== 'object') h = {};
    h.v = 1;
    if (!Array.isArray(h.plants)) h.plants = [];
    var taken = {};
    h.plants = h.plants.filter(function (p) { return p && typeof p === 'object' && typeof p.id === 'string' && PLANTS[p.plant]; });
    h.plants.forEach(function (p) { /* one plant per place; a second one there is simply put away */
      if (p.spot && (!HOME_SPOTS[p.spot] || taken[p.spot])) p.spot = null;
      if (p.spot) taken[p.spot] = p.id; else p.spot = null;
    });
    return h;
  }
  function occupant(h, spot) { h = ensureHome(h); for (var i = 0; i < h.plants.length; i++) if (h.plants[i].spot === spot) return h.plants[i]; return null; }
  /* put a plant somewhere (or away with spot null); whatever stood there before is put away */
  function place(h, id, spot) {
    h = ensureHome(h);
    var me = null; h.plants.forEach(function (p) { if (p.id === id) me = p; });
    if (!me) return false;
    if (spot !== null && spot !== undefined && !HOME_SPOTS[spot]) return false;
    spot = spot || null;
    if (spot) h.plants.forEach(function (p) { if (p !== me && p.spot === spot) p.spot = null; });
    me.spot = spot;
    return true;
  }
  function plantPrice(plant) { return PLANTS[plant] ? PLANTS[plant].price : null; }
  function plantCatalog() { return Object.keys(PLANTS).map(function (k) { return { plant: k, name: PLANTS[k].name, price: PLANTS[k].price, frame: PLANTS[k].frame, line: PLANTS[k].line }; }); }
  /* buy a plant and stand it in a place (or keep it for later with spot null) */
  function buyPlant(st, plant, today, spot) {
    if (!st || !PLANTS[plant]) return { ok: false, reason: 'unknown' };
    if (spot && !HOME_SPOTS[spot]) return { ok: false, reason: 'nospot' };
    var p = st.points = ensure(st.points), h = st.homePlants = ensureHome(st.homePlants), cost = PLANTS[plant].price, have = p.total - p.spent;
    if (have < cost) return { ok: false, reason: 'short', need: cost - have, price: cost, balance: have };
    spend(p, cost, 'plant:' + plant, today);
    var id = 'h' + (h.plants.length + 1) + '-' + today;
    while (h.plants.some(function (q) { return q.id === id; })) id += 'x';
    h.plants.push({ id: id, plant: plant, spot: null, bought: today });
    place(h, id, spot || null);
    return { ok: true, id: id, price: cost, balance: p.total - p.spent, spot: spot || null };
  }
  function plantsIn(h, scene) { /* what to draw in a room: each placed plant with its place */
    h = ensureHome(h);
    return h.plants.filter(function (p) { return p.spot && HOME_SPOTS[p.spot].scene === scene; })
      .map(function (p) { return { id: p.id, plant: p.plant, frame: PLANTS[p.plant].frame, spot: p.spot, x: HOME_SPOTS[p.spot].x, y: HOME_SPOTS[p.spot].y }; });
  }
  function spotList(h) { /* the picker: every place with what stands there now */
    h = ensureHome(h);
    return Object.keys(HOME_SPOTS).map(function (k) { var o = occupant(h, k); return { spot: k, scene: HOME_SPOTS[k].scene, label: HOME_SPOTS[k].label, occupant: o ? o.id : null, occupantName: o ? PLANTS[o.plant].name : null }; });
  }
  var KEEPER_LINES = [
    'Hello, dear. Seeds for the garden, or a plant for your home?',
    'Fresh from the Flower Field this morning.',
    'Take your time. Nothing here wilts while you look.',
    'A plant on the window sill makes a room smile.'
  ];
  function keeperLine(date) { var n = 0; String(date || '').split('').forEach(function (c) { n += c.charCodeAt(0); }); return KEEPER_LINES[n % KEEPER_LINES.length]; }

  /* words */
  function shortLine(need) { return need === 1 ? 'One more heart and this is yours.' : need + ' more hearts and this is yours.'; }
  var EARN_LINE = 'Hearts: 10 for each entry you confirm, 15 for a practice that runs to the end, 10 for each of Today’s invitations, up to 60 a day.';

  root.EbbDomeRules = { EARN: EARN, CAP_PER_DAY: CAP_PER_DAY, PRICES: PRICES, DEFAULT_PRICE: DEFAULT_PRICE, EARN_LINE: EARN_LINE,
    ensure: ensure, balance: balance, earnable: earnable, recompute: recompute, spend: spend, price: price, catalog: catalog, buy: buy,
    localDate: localDate, shortLine: shortLine,
    PLANTS: PLANTS, HOME_SPOTS: HOME_SPOTS, KEEPER_LINES: KEEPER_LINES, ensureHome: ensureHome, occupant: occupant, place: place, plantPrice: plantPrice,
    plantCatalog: plantCatalog, buyPlant: buyPlant, plantsIn: plantsIn, spotList: spotList, keeperLine: keeperLine };
})(typeof window !== 'undefined' ? window : globalThis);
