/* Ebb bag rules, pure. The bag is everything she carries, in one place:
 *   state.bag            { itemId: count }  things other workstreams give her (finds from digging, tools, gifts);
 *   state.farm.seeds     { crop: count }    shown as seed items, read live from the farm module, never copied;
 *   state.farm.basket    { item: count }    crops, eggs, milk and fish, read live;
 *   state.pond.gift      true              shown as the moon pearl.
 * add() and take() only touch state.bag; the farm's own rules keep moving seeds and crops as they always did.
 * A count can never go below zero and nothing is ever taken away as a punishment. Actions (plant, offer, give) are
 * registered here so each phase adds its own without editing this file. */
(function (root) {
  'use strict';
  var I = root.EbbItems;

  function whole(n) { n = Number(n === undefined ? 1 : n); return isFinite(n) && n >= 1 ? Math.floor(n) : 0; }
  function ensure(state) {
    if (!state || typeof state !== 'object') return {};
    if (!state.bag || typeof state.bag !== 'object' || Array.isArray(state.bag)) state.bag = {};
    Object.keys(state.bag).forEach(function (k) { var v = Number(state.bag[k]); if (!isFinite(v) || v < 1) delete state.bag[k]; else state.bag[k] = Math.floor(v); });
    return state.bag;
  }
  function own(state, id) { var b = ensure(state); return b.hasOwnProperty(id) ? b[id] : 0; }
  /* returns the new count, or null when nothing was added */
  function add(state, id, n) {
    n = whole(n); if (!n || typeof id !== 'string' || !id) return null;
    var b = ensure(state);
    b[id] = (b[id] || 0) + n;
    return b[id];
  }
  /* takes from state.bag only; false when she does not hold that many (nothing changes). Items that live in the
   * farm's seeds or basket are moved by the farm's own rules, so take() refuses them too. */
  function take(state, id, n) {
    n = whole(n); if (!n) return false;
    var b = ensure(state);
    if (!b.hasOwnProperty(id) || b[id] < n) return false;
    b[id] -= n; if (b[id] <= 0) delete b[id];
    return true;
  }

  /* ---------- bridges: other stores read live ---------- */
  var bridges = [
    { source: 'farm.seeds', read: function (st) {
      var out = {}, s = st && st.farm && st.farm.seeds; if (!s || typeof s !== 'object') return out;
      Object.keys(s).forEach(function (c) { var n = whole(s[c]); if (n) out[I.seedId(c)] = n; });
      return out;
    } },
    { source: 'farm.basket', read: function (st) {
      var out = {}, b = st && st.farm && st.farm.basket; if (!b || typeof b !== 'object') return out;
      Object.keys(b).forEach(function (k) { var n = whole(b[k]); if (n) out[k] = n; });
      return out;
    } },
    { source: 'pond.gift', read: function (st) { return st && st.pond && st.pond.gift ? { moonPearl: 1 } : {}; } }
  ];
  function registerBridge(source, read) { if (typeof read === 'function') bridges.push({ source: String(source), read: read }); }
  function bridged(state) { /* { id: { count, source } } across every bridge */
    var out = {};
    bridges.forEach(function (br) {
      var m; try { m = br.read(state) || {}; } catch (e) { m = {}; }
      Object.keys(m).forEach(function (id) { var n = whole(m[id]); if (!n) return; if (!out[id]) out[id] = { count: 0, source: br.source }; out[id].count += n; });
    });
    return out;
  }
  function count(state, id) { var b = bridged(state); return own(state, id) + (b[id] ? b[id].count : 0); }

  /* everything with a count, as { id, count, item, source }, kinds in registry order, then the order items were defined,
   * then by name for things nobody defined (shown as finds so nothing is ever hidden) */
  function list(state) {
    var b = bridged(state), o = ensure(state), ids = {}, out = [];
    Object.keys(o).forEach(function (id) { ids[id] = true; });
    Object.keys(b).forEach(function (id) { ids[id] = true; });
    var order = {}; I.all().forEach(function (it, i) { order[it.id] = i; });
    Object.keys(ids).forEach(function (id) {
      var n = (o[id] || 0) + (b[id] ? b[id].count : 0); if (!n) return;
      var item = I.get(id) || I.stub(id);
      out.push({ id: id, count: n, item: item, source: b[id] ? b[id].source : 'bag', bridged: !!b[id] });
    });
    out.sort(function (x, y) {
      var kx = I.KINDS.findIndex(function (k) { return k.id === x.item.kind; }), ky = I.KINDS.findIndex(function (k) { return k.id === y.item.kind; });
      if (kx !== ky) return kx - ky;
      var ox = order.hasOwnProperty(x.id) ? order[x.id] : 1e9, oy = order.hasOwnProperty(y.id) ? order[y.id] : 1e9;
      if (ox !== oy) return ox - oy;
      return x.item.name < y.item.name ? -1 : x.item.name > y.item.name ? 1 : 0;
    });
    return out;
  }
  function grouped(state) { /* every kind, even when empty, so the sheet always has a line to show */
    var items = list(state);
    return I.KINDS.map(function (k) { return { kind: k, items: items.filter(function (e) { return e.item.kind === k.id; }) }; });
  }
  function total(state) { return list(state).reduce(function (n, e) { return n + e.count; }, 0); }

  /* ---------- actions: what she can do with an item from the bag ----------
   * registerAction({ id, label, kinds: ['crop'] | null for any, when(ctx) -> bool, run(ctx) }) where ctx is
   * { entry, api, close }. The bag shows the first action whose when() says yes, so each phase adds its own. */
  var actions = [];
  function registerAction(a) {
    if (!a || typeof a.id !== 'string' || typeof a.label !== 'string' || typeof a.run !== 'function') return false;
    if (actions.some(function (x) { return x.id === a.id; })) return false;
    actions.push({ id: a.id, label: a.label, kinds: Array.isArray(a.kinds) ? a.kinds.slice() : null, when: typeof a.when === 'function' ? a.when : function () { return true; }, run: a.run });
    return true;
  }
  function actionsFor(entry, ctx) {
    return actions.filter(function (a) {
      if (a.kinds && a.kinds.indexOf(entry.item.kind) < 0) return false;
      try { return !!a.when(Object.assign({ entry: entry }, ctx || {})); } catch (e) { return false; }
    });
  }

  root.EbbBag = { ensure: ensure, own: own, add: add, take: take, count: count, list: list, grouped: grouped, total: total,
    bridged: bridged, registerBridge: registerBridge, registerAction: registerAction, actionsFor: actionsFor, actions: function () { return actions.slice(); } };
})(typeof window !== 'undefined' ? window : globalThis);
