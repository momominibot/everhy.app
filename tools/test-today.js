/* Node checks for the daily loop rules: stable picks within a day that vary across days, checks that fire from state,
 * hearts that never decrease, the daily cap, and a days-with-a-heart count that pauses rather than resets.
 * Run: node tools/test-today.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console, Math, JSON, Date, Object, Array, String, Number, parseInt, isNaN, RegExp };
ctx.globalThis = ctx;
vm.createContext(ctx);
['js/ebb-farm.js', 'js/today/rules.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f }));
const { EbbTodayRules: R, EbbFarm: F } = ctx;

let pass = 0, fail = 0;
function check(name, ok) { if (ok) pass++; else { fail++; console.log('FAIL', name); } }
function day(n) { const d = new Date(2026, 9, 1 + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function blank() { return { farm: F.fresh(6), pond: { offerings: 0, gift: false }, observations: [] }; }

/* ---------- picks ---------- */
for (let i = 0; i < 40; i++) {
  const d = day(i), a = R.picks(d), b = R.picks(d);
  check(`picks stable ${d}`, a.join() === b.join() && a.length === 3 && new Set(a).size === 3);
  check(`picks known ${d}`, a.every(id => R.INVITES[id]));
  check(`picks in a fixed order ${d}`, a.map(id => R.ORDER.indexOf(id)).every((v, k, arr) => k === 0 || arr[k - 1] < v));
}
const sets = new Set(); for (let i = 0; i < 40; i++) sets.add(R.picks(day(i)).join());
check('picks vary across days (at least 8 different sets in 40 days)', sets.size >= 8);
const seen = {}; for (let i = 0; i < 120; i++) R.picks(day(i)).forEach(id => { seen[id] = (seen[id] || 0) + 1; });
check('every invitation turns up in 120 days', R.ORDER.every(id => seen[id] > 0));
check('few identical consecutive days in a 60 day run', [...Array(60).keys()].filter(i => R.picks(day(i)).join() === R.picks(day(i + 1)).join()).length <= 8);
check('picks of a mangled date still give three', R.picks('not a date').length === 3 && R.picks(undefined).length === 3);

/* ---------- labels never mention the body or the log ---------- */
const words = /bleed|period|symptom|mood|pain|cramp|flow|log|cycle|spott|sleep|temperature/i;
Object.keys(R.INVITES).forEach(id => check(`label of ${id} is only about the world`, !words.test(R.INVITES[id].label + ' ' + R.INVITES[id].where)));
[R.line({ days: {} }, day(0)), ...R.greeting(day(0), 9, 'rain'), ...R.greeting(day(0), 20, null), R.runLine({ run: { count: 3 } })]
  .forEach((s, i) => check(`copy ${i} has no em dash or body words`, !/—/.test(s) && !words.test(s)));

/* ---------- checks read state ---------- */
const T = day(5), Y = day(4);
{
  const st = blank();
  check('water: nothing watered', !R.check('water', st, T));
  st.farm.beds[2].watered.push(Y);
  check('water: yesterday does not count', !R.check('water', st, T));
  st.farm.beds[2].watered.push(T);
  check('water: a bed watered today counts', R.check('water', st, T));
}
{
  const st = blank();
  check('sit: no practice', !R.check('sit', st, T));
  st.observations.push({ id: 'p1', type: 'mindfulness', date: Y, activeSec: 180, status: 'finished' });
  check('sit: yesterday does not count', !R.check('sit', st, T));
  st.observations.push({ id: 'p2', type: 'mindfulness', date: T, activeSec: 40, status: 'partial', practice: 'sitting', anchor: 'breath' });
  check('sit: a short partial practice today counts (time spent, not content)', R.check('sit', st, T));
  const st2 = blank(); st2.observations.push({ id: 'x', type: 'bleeding', date: T, value: 'heavy' });
  check('sit: a body observation is never a practice', !R.check('sit', st2, T));
}
{
  const st = blank(); st.pond.offerings = 4; const d = R.ensure({}); const today = R.begin(d, st, T);
  check('pond: morning count remembered', today.pondStart === 4);
  check('pond: nothing offered yet', !R.check('pond', st, T, today));
  st.pond.offerings = 5;
  check('pond: an offering today counts', R.check('pond', st, T, today));
  check('pond: without a day record a positive count is not assumed', !R.check('pond', { pond: { offerings: 0 } }, T, null));
}
{
  const d = R.ensure({}); const st = blank(); const today = R.begin(d, st, T);
  check('walk: not yet', !R.check('walk', st, T, today));
  R.visit(d, T, 'farm');
  check('walk: the farm is not the waterfall', !R.check('walk', st, T, today));
  R.visit(d, T, 'waterfall');
  check('walk: reaching the waterfall counts', R.check('walk', st, T, d.days[T]));
  check('walk: a visit on another day stays on that day', !R.check('walk', st, day(6), R.begin(d, st, day(6))));
}
{
  const st = blank();
  check('journal: no log module', !R.check('journal', st, T));
  st.log = { obs: [{ id: 'n1', type: 'note', value: 'private words', start: Y, end: Y, confirmed: true }] };
  check('journal: yesterday does not count', !R.check('journal', st, T));
  st.log.obs.push({ id: 'n2', type: 'mood', value: 'low', start: T, end: T, confirmed: true });
  check('journal: a mood entry is not a journal line', !R.check('journal', st, T));
  st.log.obs.push({ id: 'n3', type: 'note', value: 'more words', start: T, end: T, confirmed: true, retracted: true });
  check('journal: an undone note does not count', !R.check('journal', st, T));
  st.log.obs.push({ id: 'n4', type: 'note', value: 'today', start: T, end: T, confirmed: true });
  check('journal: a note today counts', R.check('journal', st, T));
  const src = fs.readFileSync(path.join(__dirname, '..', 'js/today/rules.js'), 'utf8');
  check('rules never read a note\'s value or sourceText', !/\.value\b|sourceText/.test(src));
}
check('check of an unknown id is false', !R.check('nope', blank(), T));
check('check survives broken state', !R.check('water', { farm: { beds: [null, 3, {}] } }, T) && !R.check('pond', { pond: 'x' }, T, null));

/* ---------- hearts ---------- */
function stateDoing(ids, today, d) { /* a save in which exactly these invitations are complete today */
  const st = blank();
  if (ids.includes('water')) st.farm.beds[0].watered.push(today);
  if (ids.includes('sit')) st.observations.push({ id: 'p', type: 'mindfulness', date: today, activeSec: 120, status: 'finished' });
  if (ids.includes('journal')) st.log = { obs: [{ id: 'n', type: 'note', start: today, end: today, confirmed: true }] };
  if (d) { R.begin(d, st, today); if (ids.includes('walk')) R.visit(d, today, 'waterfall'); if (ids.includes('pond')) st.pond.offerings = d.days[today].pondStart + 1; }
  return st;
}
{
  const d = R.ensure({}), ids = R.picks(T);
  let r = R.apply(d, stateDoing([], T, d), T);
  check('nothing done: no hearts', r.gained === 0 && r.hearts === 0 && d.total === 0 && d.run.count === 0);
  r = R.apply(d, stateDoing([ids[0]], T, d), T);
  check('first invitation: one heart', r.fresh.join() === ids[0] && r.gained === 1 && r.hearts === 1 && d.total === 1);
  check('first heart starts the days count', d.run.count === 1 && d.run.last === T);
  r = R.apply(d, stateDoing([ids[0]], T, d), T);
  check('same state again: nothing more', r.gained === 0 && r.fresh.length === 0 && d.total === 1);
  r = R.apply(d, stateDoing([], T, d), T);
  check('a completed invitation that later unchecks keeps its heart', r.hearts === 1 && d.total === 1 && d.days[T].done[ids[0]]);
  r = R.apply(d, stateDoing(ids, T, d), T);
  check('the other two and the bonus: four hearts', r.fresh.length === 2 && r.bonus && r.gained === 3 && r.hearts === 4 && d.total === 4);
  r = R.apply(d, stateDoing(ids, T, d), T);
  check('no fifth heart on the same day', r.gained === 0 && r.hearts === 4 && d.total === 4 && d.run.count === 1);
  check('status lists the three with ticks', R.status(d, stateDoing(ids, T, d), T).every(s => s.done && s.label && s.where));
  check('line for a full day', /whole day/.test(R.line(d, T)));
}
{
  const d = R.ensure({}), ids = R.picks(T), st = stateDoing(ids, T, d);
  const r = R.apply(d, st, T);
  check('all three at once: four hearts, never more than the cap', r.gained === 4 && r.hearts === R.CAP && d.total === 4);
}
/* hearts never decrease, whatever happens to the state afterwards */
{
  const d = R.ensure({}), ids = R.picks(T);
  R.apply(d, stateDoing(ids.slice(0, 2), T, d), T);
  const before = JSON.stringify([d.total, d.days[T].hearts]);
  [{}, null, { farm: null }, stateDoing([], T, d), blank()].forEach(st => R.apply(d, st, T));
  check('hearts never decrease', JSON.stringify([d.total, d.days[T].hearts]) === before && d.total === 2);
  const str = fs.readFileSync(path.join(__dirname, '..', 'js/today/rules.js'), 'utf8');
  check('no subtraction from hearts or total in the rules', !/hearts\s*-=|total\s*-=|hearts\s*=\s*0|total\s*=\s*Math\.m/.test(str.replace(/typeof day\.hearts !== 'number'\) day\.hearts = 0/, '').replace(/d\.total = 0;/, '')));
}

/* ---------- the days count pauses ---------- */
{
  const d = R.ensure({});
  R.apply(d, stateDoing(R.picks(day(0)), day(0), d), day(0));
  R.apply(d, stateDoing(R.picks(day(1)).slice(0, 1), day(1), d), day(1));
  check('two days in a row: count 2', d.run.count === 2 && d.run.last === day(1));
  R.apply(d, stateDoing([], day(2), d), day(2));
  check('a day without a heart does not count and does not reset', d.run.count === 2 && d.run.last === day(1));
  R.apply(d, stateDoing(R.picks(day(6)).slice(0, 1), day(6), d), day(6));
  check('after four missed days the count simply continues', d.run.count === 3 && d.run.last === day(6));
  R.apply(d, stateDoing(R.picks(day(6)), day(6), d), day(6));
  check('a second heart on the same day does not count the day twice', d.run.count === 3);
  R.apply(d, stateDoing(R.picks(day(3)), day(3), d), day(3));
  check('a clock set back earns the hearts but never moves the days count backwards', d.run.count === 3 && d.run.last === day(6) && d.days[day(3)].hearts === 4);
  check('run line reads naturally', R.runLine(d) === '3 days with a heart.' && R.runLine({ run: { count: 1 } }) === 'One day with a heart.' && /fine/.test(R.runLine({})));
}

/* ---------- day records are kept bounded and repaired ---------- */
{
  const d = R.ensure({});
  for (let i = 0; i < 80; i++) R.begin(d, blank(), day(i));
  check('old days are pruned', Object.keys(d.days).length === R.KEEP_DAYS && !d.days[day(0)] && d.days[day(79)]);
  const broken = R.ensure({ total: -4, run: { count: 'x' }, days: { [T]: { hearts: 'nope' } } });
  R.begin(broken, blank(), T);
  check('a broken record is repaired, not trusted', broken.total === 0 && broken.run.count === 0 && broken.days[T].hearts === 0 && broken.days[T].done && broken.days[T].visits);
  const d2 = R.ensure({}); R.visit(d2, T, 'waterfall'); R.apply(d2, blank(), T);
  check('a visit before the first apply still creates the day with a morning pond count', d2.days[T].pondStart === 0);
}

/* ---------- words ---------- */
check('long date', R.longDate('2026-10-22') === 'Thursday 22 October' && R.longDate('2027-01-03') === 'Sunday 3 January');
const g = R.greeting('2026-10-22', 8, 'rain');
check('greeting: two lines, date and rain', g.length === 2 && g[0] === 'Good morning. It is Thursday 22 October.' && /Rain/.test(g[1]));
check('greeting: clear sky', /clear/.test(R.greeting('2026-10-22', 8, 'clear')[1]));
check('greeting: no sky module, still two lines', R.greeting('2026-10-22', 8, undefined).length === 2 && !/rain|clear/i.test(R.greeting('2026-10-22', 8, undefined)[1]));
check('greeting: by the hour', /afternoon/.test(R.greeting('2026-10-22', 14)[0]) && /evening/.test(R.greeting('2026-10-22', 21)[0]));
check('line: none, one, two', /none of them is owed/.test(R.line({ days: {} }, T)) && (() => { const d = R.ensure({}); R.apply(d, stateDoing(R.picks(T).slice(0, 1), T, d), T); return /One heart/.test(R.line(d, T)); })() && (() => { const d = R.ensure({}); R.apply(d, stateDoing(R.picks(T).slice(0, 2), T, d), T); return /Two hearts/.test(R.line(d, T)); })());

console.log(`test-today: ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
