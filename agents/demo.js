#!/usr/bin/env node
/* Synthetic people for building and showing the admin dashboard. No real person's data: every entry is generated from a
 * fixed seed, and every export is marked synthetic. Five people over eight weeks ending on the given day:
 *   P01 steady cycles, good sleep, practises most days          (research: yes)
 *   P02 longer cycles, short sleep, stressed, practises a little (research: yes)
 *   P03 a period now in its ninth day: the app's own long-period rule fires (research: yes)
 *   P04 joined five days ago, a few entries                      (research: yes)
 *   P05 never agreed to the research study: counted, never opened
 * Run: node agents/demo.js [YYYY-MM-DD] -> admin/data/demo-exports.json */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');

function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
function pad(n) { return String(n).padStart(2, '0'); }
function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function addDays(s, n) { const p = s.split('-'); const d = new Date(+p[0], +p[1] - 1, +p[2]); d.setDate(d.getDate() + n); return iso(d); }

function person(pid, seed, today, o) {
  const r = rng(seed), obs = [], practices = [];
  let n = 0;
  const log = (type, value, day, extra) => obs.push(Object.assign({ id: pid + '-o' + (++n), type, value, unit: null, start: day, end: day, confirmed: true, source: 'chat', created: day + 'T21:00:00' }, extra || {}));
  const start = addDays(today, -(o.days || 56));
  /* periods: a start every cycle length, flow for a few days */
  let ps = addDays(start, o.firstOffset || 3), k = 0;
  while (ps <= today) {
    const len = o.periodDays ? o.periodDays(k) : 5;
    for (let i = 0; i < len; i++) { const d = addDays(ps, i); if (d > today) break; log('bleeding', i === 0 ? 'medium' : i < 3 ? (o.heavy ? 'heavy' : 'medium') : 'light', d, { source: 'calendar' }); if (i < 2 && r() < o.pain) log('pain', 'cramps', d); }
    ps = addDays(ps, o.cycle(k++, r));
  }
  for (let i = 0; i < (o.days || 56); i++) {
    const d = addDays(start, i);
    if (d > today) break;
    if (r() < o.sleepLog) log('sleep', Math.round((o.sleep[0] + r() * (o.sleep[1] - o.sleep[0])) * 2) / 2, d, { unit: 'h' });
    if (r() < o.sleepPoor) log('sleepQuality', 'poor', d);
    if (r() < o.moodLog) log('mood', o.moods[Math.floor(r() * o.moods.length)], d);
    if (r() < o.lowEnergy) log('energy', 'low', d);
    if (r() < o.practice) {
      const secs = [180, 300, 600, 90][Math.floor(r() * 4)], done = r() < 0.8, src = ['course', 'seats', 'routines', 'transit'][Math.floor(r() * 4)];
      const act = done ? secs : Math.round(secs * (0.3 + r() * 0.5));
      practices.push({ id: pid + '-p' + i, type: 'mindfulness', date: d, start: d + 'T07:30:00', end: d + 'T07:40:00', plannedSec: secs, activeSec: act,
        status: done ? 'finished' : 'partial', source: src === 'routines' ? 'routine' : src, routine: src === 'routines' ? 'morning' : undefined, confirmed: true });
    }
  }
  const consent = { events: [{ purpose: 'core', granted: true, at: start + 'T09:00:00Z' }, { purpose: 'research', granted: !!o.research, at: start + 'T09:01:00Z' }] };
  return { app: 'Ebb', format: 'ebb-export-1', synthetic: true, pid, exportedAt: today + 'T22:00:00Z',
    save: { study: { pid }, profile: Object.assign({ lifeStage: 'cycling', goal: 'understand', ageBand: '25-34' }, o.profile || {}), consent,
      log: { obs }, observations: practices } };
}

function demo(today) {
  return [
    person('P01', 11, today, { research: true, cycle: (k, r) => 27 + Math.round(r() * 2), pain: 0.3, sleepLog: 0.9, sleep: [6.5, 8.5], sleepPoor: 0.03, moodLog: 0.6, moods: ['good', 'good', 'normal', 'good', 'stressed'], lowEnergy: 0.05, practice: 0.75 }),
    person('P02', 22, today, { research: true, cycle: (k, r) => 33 + Math.round(r() * 5), pain: 0.6, sleepLog: 0.7, sleep: [4.5, 6.5], sleepPoor: 0.25, moodLog: 0.7, moods: ['stressed', 'stressed', 'low', 'anxious', 'normal', 'irritable'], lowEnergy: 0.3, practice: 0.2, profile: { goal: 'symptoms' } }),
    person('P03', 33, today, { research: true, firstOffset: 20, cycle: () => 28, periodDays: k => (k === 1 ? 9 : 5), heavy: true, pain: 0.5, sleepLog: 0.6, sleep: [6, 7.5], sleepPoor: 0.1, moodLog: 0.4, moods: ['normal', 'low', 'good'], lowEnergy: 0.2, practice: 0.4 }),
    person('P04', 44, today, { research: true, days: 5, firstOffset: 1, cycle: () => 40, pain: 0, sleepLog: 0.5, sleep: [7, 8], sleepPoor: 0, moodLog: 0.5, moods: ['good', 'normal'], lowEnergy: 0, practice: 0.5, profile: { lifeStage: 'cycling', ageBand: '18-24' } }),
    person('P05', 55, today, { research: false, cycle: () => 29, pain: 0.2, sleepLog: 0.8, sleep: [6, 8], sleepPoor: 0.05, moodLog: 0.5, moods: ['good', 'normal'], lowEnergy: 0.1, practice: 0.5 })
  ];
}

if (require.main === module) {
  const today = process.argv[2] || iso(new Date());
  const out = path.join(ROOT, 'admin', 'data', 'demo-exports.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ generatedFor: today, synthetic: true, exports: demo(today) }, null, 1));
  console.log('wrote', path.relative(ROOT, out), 'for', today);
}
module.exports = { demo, person };
