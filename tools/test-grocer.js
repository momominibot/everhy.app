#!/usr/bin/env node
/* Provision shop rules (js/grocer/rules.js): goods paid in hearts from the one ledger, into the basket. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console }; ctx.window = ctx; vm.createContext(ctx);
['js/dome/rules.js', 'js/grocer/rules.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx));
const G = ctx.EbbGrocerRules, D = ctx.EbbDomeRules;
let pass = 0, fail = 0; const check = (n, ok) => { if (ok) pass++; else { fail++; console.log('FAIL ' + n); } };
check('four goods, each with a price and a use', G.GOODS.length === 4 && G.GOODS.every(g => g.price > 0 && g.line));
const st = { points: { entries: [{ id: 'log:a', date: '2026-10-24', source: 'log', n: 12 }] }, farm: { basket: {} } };
let r = G.buy(st, 'egg', '2026-10-24', D);
check('buying an egg spends 5 hearts and fills the basket', r.ok && st.farm.basket.egg === 1 && D.balance(st.points) === 7);
r = G.buy(st, 'rice', '2026-10-24', D);
check('a second good', r.ok && st.farm.basket.rice === 1 && D.balance(st.points) === 2);
r = G.buy(st, 'ginger', '2026-10-24', D);
check('short of hearts: refused, nothing changes, says how many more', !r.ok && r.reason === 'short' && r.need === 3 && !st.farm.basket.ginger && D.balance(st.points) === 2);
check('an unknown good is refused', !G.buy(st, 'durian', '2026-10-24', D).ok);
check('spending is its own ledger entry, so a recompute never refunds it', st.points.entries.filter(e => e.n < 0).length === 2 && D.recompute(st, '2026-10-24').balance === 2);
console.log('test-grocer: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
