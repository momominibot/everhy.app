/* Ebb Flower Dome rules, pure: a points ledger fed from what she already saved, and the seed stall that spends it.
 * Every confirmed log entry earns 10 and every practice that ran to the end earns 15, at most 60 a day, counted on
 * the day it was saved. The ledger is recomputed from the data whenever asked and never counts an entry twice: each
 * entry is remembered by the id of the record it came from, so a retracted or edited record keeps the points it earned
 * and a repeat recompute changes nothing. Spending is its own entry. Hearts (the Today loop) are never touched.
 * Seeds bought here land in state.farm.seeds exactly as the shed's free seeds do, so the farm needs no change. */
(function (root) {
  'use strict';

  var EARN = { log: 10, practice: 15 }, CAP_PER_DAY = 60;
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

  /* words */
  function shortLine(need) { return need === 1 ? 'One more point and this is yours.' : need + ' more points and this is yours.'; }
  var EARN_LINE = 'Logging earns points: 10 for each entry you confirm, 15 for a practice that runs to the end, up to 60 a day.';

  root.EbbDomeRules = { EARN: EARN, CAP_PER_DAY: CAP_PER_DAY, PRICES: PRICES, DEFAULT_PRICE: DEFAULT_PRICE, EARN_LINE: EARN_LINE,
    ensure: ensure, balance: balance, earnable: earnable, recompute: recompute, spend: spend, price: price, catalog: catalog, buy: buy,
    localDate: localDate, shortLine: shortLine };
})(typeof window !== 'undefined' ? window : globalThis);
