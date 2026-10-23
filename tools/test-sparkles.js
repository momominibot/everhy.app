#!/usr/bin/env node
/* Sparkle rest rule (js/ext/sparkles.js): a logging spot's diamond rests only once today's entry from it is saved and paid. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console, Date }; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'ext', 'sparkles.js'), 'utf8'), ctx);
const R = ctx.EbbSparkles.restsToday;
let pass = 0, fail = 0;
function check(name, ok) { if (ok) pass++; else { fail++; console.log('FAIL ' + name); } }
const today = '2026-10-24';
function o(id, extra) { return Object.assign({ id, type: 'mood', value: 'good', confirmed: true, created: '2026-10-24T09:00:00', start: today }, extra || {}); }
function st(obs, paid) { return { log: { obs }, points: { entries: (paid || []).map(id => ({ id: 'log:' + id, date: today, n: 10 })) } }; }

check('nothing saved: sparkle shows', !R(st([], []), 'mood', today));
check('saved but not yet paid: sparkle shows', !R(st([o('a', { topic: 'mood' })], []), 'mood', today));
check('saved and paid from this spot: rests', R(st([o('a', { topic: 'mood' })], ['a']), 'mood', today));
check('paid past the cap (n 0) still rests', R({ log: { obs: [o('a', { topic: 'mood' })] }, points: { entries: [{ id: 'log:a', n: 0 }] } }, 'mood', today));
check('another spot stays lit', !R(st([o('a', { topic: 'mood' })], ['a']), 'temperature', today));
check('typed in the general chat counts by type', R(st([o('b', { type: 'bleeding', value: 'light' })], ['b']), 'bleeding', today));
check('an all-good check-in from the spot counts for that spot', R(st([o('c', { type: 'checkin', value: 'all-good', topic: 'body' })], ['c']), 'body', today));
check('an all-good check-in from the general chat does not rest a spot', !R(st([o('c', { type: 'checkin', value: 'all-good' })], ['c']), 'body', today));
check('undone entry: sparkle comes back', !R(st([o('a', { topic: 'mood', retracted: '2026-10-24T10:00:00' })], ['a']), 'mood', today));
check('yesterday\'s entry does not rest today', !R(st([o('a', { topic: 'mood', created: '2026-10-23T22:00:00' })], ['a']), 'mood', today));
check('a draft (unconfirmed) does not rest', !R(st([o('a', { topic: 'mood', confirmed: false })], ['a']), 'mood', today));
check('no state or topic is safe', !R(null, 'mood', today) && !R(st([], []), undefined, today));
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
