#!/usr/bin/env node
/* Journal look back (js/ext/log.js weekOf): a Monday-to-Sunday week of journal entries, newest day first, with a tally. */
'use strict';
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'ext', 'log.js'), 'utf8');
const types = src.match(/var JOURNAL_TYPES = [^;]+;/)[0];
const start = src.indexOf('function weekOf('), body = src.slice(start, src.indexOf('\n  }\n', start) + 4);
const weekOf = new Function(types + '\n' + body + '\nreturn weekOf;')();
function add(d, n) { const p = d.split('-'); const x = new Date(+p[0], +p[1] - 1, +p[2]); x.setDate(x.getDate() + n); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); }
let pass = 0, fail = 0; const check = (n, ok) => { if (ok) pass++; else { fail++; console.log('FAIL ' + n); } };
const obs = [
  { id: 'a', type: 'mood', value: 'good', start: '2026-10-23', created: '2026-10-23T09:00' },
  { id: 'b', type: 'note', value: 'kopi', start: '2026-10-23', created: '2026-10-23T09:01' },
  { id: 'c', type: 'mood', value: 'stressed', start: '2026-10-22', created: '2026-10-22T21:00' },
  { id: 'd', type: 'bleeding', value: 'light', start: '2026-10-23', created: '2026-10-23T08:00' },
  { id: 'e', type: 'mood', value: 'good', start: '2026-10-18', created: '2026-10-18T21:00' }];
const w = weekOf(obs, '2026-10-23', add);
check('the week runs Monday 19 to Sunday 25', w.from === '2026-10-19' && w.to === '2026-10-25' && w.days.length === 7);
check('newest day first', w.days[0].day === '2026-10-25' && w.days[6].day === '2026-10-19');
check('only journal entries: no bleeding', w.days.every(d => d.items.every(o => o.type !== 'bleeding')));
check('two days written, last Sunday outside the week', w.written === 2);
check('moods tallied', w.moods.good === 1 && w.moods.stressed === 1);
check('entries in the order written', w.days.find(d => d.day === '2026-10-23').items.map(o => o.id).join() === 'a,b');
check('a Sunday belongs to the week before it', weekOf(obs, '2026-10-18', add).from === '2026-10-12');
check('an empty week says nothing was written', weekOf([], '2026-10-23', add).written === 0);
check('the view promises it stays on the phone', /stays on this phone/.test(src) && !/fetch\(/.test(src.slice(src.indexOf('function past('), src.indexOf('/* ---------- calendar'))));
console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
