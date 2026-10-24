/* EveRhy provision shop rules, pure: what the fruit-and-provisions stall at the hawker centre sells and what buying
 * does. Goods are paid in hearts from the one heart ledger (js/dome/rules.js spend) and land in the basket, where the
 * kitchen's recipes find them. Nothing spoils and nothing is owed. */
(function (root) {
  'use strict';
  var GOODS = [
    { id: 'egg', name: 'Egg', price: 5, line: 'For a fried egg, egg fried rice or carrot cake. Or the hot spring.' },
    { id: 'rice', name: 'Rice', price: 5, line: 'For egg fried rice.' },
    { id: 'ginger', name: 'Ginger', price: 5, line: 'For steamed fish with ginger.' },
    { id: 'chilli', name: 'Chilli', price: 5, line: 'For a gentle sambal turnip.' }
  ];
  function good(id) { for (var i = 0; i < GOODS.length; i++) if (GOODS[i].id === id) return GOODS[i]; return null; }
  /* pays from the heart ledger and puts one in the basket; refuses (nothing changes) when hearts are short */
  function buy(st, id, today, D) {
    var g = good(id); if (!g || !st || !D) return { ok: false, reason: 'unknown' };
    st.points = D.ensure(st.points);
    var have = D.balance(st.points);
    if (have < g.price) return { ok: false, reason: 'short', need: g.price - have, price: g.price, balance: have };
    if (!D.spend(st.points, g.price, 'grocer:' + id, today)) return { ok: false, reason: 'short', price: g.price, balance: have };
    if (!st.farm) st.farm = {}; if (!st.farm.basket) st.farm.basket = {};
    st.farm.basket[id] = (st.farm.basket[id] || 0) + 1;
    return { ok: true, price: g.price, balance: D.balance(st.points), count: st.farm.basket[id] };
  }
  root.EbbGrocerRules = { GOODS: GOODS, good: good, buy: buy };
})(typeof window !== 'undefined' ? window : globalThis);
