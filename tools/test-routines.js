/* Node checks for the routine rules: the catalogue maps to real spots, default lists are within bounds, reorder,
 * remove and add respect 3 to 6 steps and no repeats, a run resumes per date and finishes after its last step,
 * the prompt windows and "not now", the timer counts only running visible time, and the observation shape.
 * Run: node tools/test-routines.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console, Math, JSON, Date, Object, Array, String, Number, parseInt, isNaN, RegExp };
ctx.globalThis = ctx;
vm.createContext(ctx);
['js/ebb-world.js', 'js/routines/rules.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f }));
const { EbbRoutineRules: R, EbbWorld: W } = ctx;

let pass = 0, fail = 0;
function check(name, ok) { if (ok) pass++; else { fail++; console.log('FAIL', name); } }
const D = '2026-10-23', D2 = '2026-10-24';

/* ---------- catalogue and defaults ---------- */
const ids = Object.keys(R.CATALOG);
check('twelve catalogue steps, six each', ids.length === 12 && R.catalog('morning').length === 6 && R.catalog('evening').length === 6);
ids.forEach(id => {
  const c = R.CATALOG[id];
  check(`${id} has a label, a place and a kind`, c.label && c.where && ['timed', 'text', 'log', 'bed'].includes(c.kind) && (c.routine === 'morning' || c.routine === 'evening'));
  if (c.scene) {
    const s = W.SCENES[c.scene], sp = s && s.spots.find(x => x.id === c.spot);
    check(`${id} maps to a real spot ${c.scene}/${c.spot}`, !!sp && !!sp.stand);
    check(`${id} stand point is walkable`, !!sp && W.walkable(c.scene, sp.stand));
  } else check(`${id} without a scene has no spot`, c.spot === null);
  if (c.kind === 'timed') {
    check(`${id} timed step has cues in order from 0`, Array.isArray(c.cues) && c.cues[0][0] === 0 && c.cues.every((q, i) => i === 0 || q[0] > c.cues[i - 1][0]) && c.cues.every(q => q[1].length > 8));
    check(`${id} default length is one of its options`, c.options.includes(c.secs) && c.secs >= R.SECS_MIN && c.secs <= R.SECS_MAX);
  } else check(`${id} untimed has no seconds`, c.secs === 0);
  if (c.kind === 'log') check(`${id} names a log topic`, c.topic === 'sleep' || c.topic === 'mood');
  if (c.kind === 'text') check(`${id} has a placeholder`, typeof c.placeholder === 'string');
});
['morning', 'evening'].forEach(k => {
  const d = R.defaults(k);
  check(`${k} defaults within bounds`, d.length >= R.MIN && d.length <= R.MAX && new Set(d.map(s => s.id)).size === d.length);
  check(`${k} defaults all belong to it`, d.every(s => R.CATALOG[s.id].routine === k));
  check(`${k} defaults carry the catalogue seconds`, d.every(s => s.secs === R.CATALOG[s.id].secs));
});
check('evening defaults end in bed', R.defaults('evening').slice(-1)[0].id === 'bed');
check('morning defaults begin with waking', R.defaults('morning')[0].id === 'wake');

/* ---------- copy: warm, no em dash, no claims ---------- */
const claims = /cure|treat|reduce stress|improve|boost|detox|guarantee|proven|scientif/i;
const texts = [];
ids.forEach(id => { const c = R.CATALOG[id]; texts.push(c.label, c.where, c.blurb, c.placeholder || ''); (c.cues || []).forEach(q => texts.push(q[1])); });
['morning', 'evening'].forEach(k => { texts.push(R.ROUTINES[k].label, R.ROUTINES[k].intro, R.ROUTINES[k].done, R.promptLine(k, false), R.promptLine(k, true), R.panelLabel(k, R.defaults(k))); });
texts.push(R.statusLine(null), R.minutesText(30), R.minutesText(300));
texts.forEach((s, i) => check(`copy ${i} has no em dash or health claim: ${s.slice(0, 30)}`, !/—/.test(s) && !claims.test(s)));
check('panel label carries the step count', R.panelLabel('morning', R.defaults('morning')) === 'Morning routine (5 steps)');

/* ---------- ensure and clean ---------- */
{
  const r = R.ensure(null);
  check('fresh record has both lists and empty runs', r.lists.morning.length === 5 && r.lists.evening.length === 5 && Object.keys(r.runs).length === 0 && Object.keys(r.notNow).length === 0);
  const bad = R.ensure({ lists: { morning: ['wake', 'wake', 'phone', { id: 'water', secs: 7 }, 'nope', 'stretch', 'sounds', 'intention', 'sleeplog'], evening: 'x' }, runs: 3 });
  check('clean drops repeats, other routine steps and unknown ids, keeps order', bad.lists.morning.map(s => s.id).join() === 'wake,water,stretch,sounds,intention,sleeplog');
  check('clean keeps a legal custom length', bad.lists.morning[1].secs === 7);
  check('clean caps at six', R.ensure({ lists: { morning: ['wake', 'stretch', 'water', 'sounds', 'intention', 'sleeplog', 'wake'] } }).lists.morning.length === 6);
  check('a list below three falls back to the defaults', R.ensure({ lists: { morning: ['wake', 'water'] } }).lists.morning.length === 5);
  check('a mangled evening list falls back', bad.lists.evening.length === 5 && bad.runs && typeof bad.runs === 'object' && !Array.isArray(bad.runs));
  const keep = { lists: { morning: ['wake', 'stretch', 'water'] } }, arr = keep.lists.morning;
  check('ensure cleans a list in place, keeping the array an open editor holds', R.ensure(keep).lists.morning === arr && arr.length === 3 && arr[0].id === 'wake' && R.ensure(keep).lists.morning === arr);
  check('out-of-range seconds fall back to the catalogue', R.clampSecs('wake', 2) === 30 && R.clampSecs('wake', 9999) === 30 && R.clampSecs('wake', 45) === 45 && R.clampSecs('intention', 30) === 0);
}

/* ---------- editing bounds ---------- */
{
  const list = R.defaults('morning');
  check('cannot add a repeat', !R.canAdd(list, 'wake') && !R.addStep(list, 'wake') && list.length === 5);
  check('cannot add an unknown step', !R.addStep(list, 'tea'));
  check('can add the sixth', R.addStep(list, 'sleeplog') && list.length === 6 && list[5].id === 'sleeplog');
  check('cannot add a seventh', !R.canAdd(list, 'wake') && R.addable('morning', list).length === 0);
  check('remove the last added', R.removeStep(list, 5) && list.length === 5);
  check('remove out of range refused', !R.removeStep(list, 9) && !R.removeStep(list, -1));
  check('move first down', R.moveStep(list, 0, 1) && list[0].id === 'stretch' && list[1].id === 'wake');
  check('move back up', R.moveStep(list, 1, -1) && list[0].id === 'wake');
  check('move past the ends refused', !R.moveStep(list, 0, -1) && !R.moveStep(list, 4, 1) && list[0].id === 'wake' && list[4].id === 'intention');
  check('set seconds clamps to the range', R.setSecs(list, 0, 45) && list[0].secs === 45 && R.setSecs(list, 0, 1) && list[0].secs === 30);
  check('set seconds on an untimed step refused', !R.setSecs(list, 4, 30));
  check('addable lists what is missing', R.addable('morning', list).join() === 'sleeplog');
  R.removeStep(list, 4); R.removeStep(list, 3);
  check('down to three', list.length === 3 && !R.removeStep(list, 0) && list.length === 3);
  check('total seconds', R.totalSecs(R.defaults('morning')) === 30 + 60 + 20 + 45 && R.totalSecs(R.defaults('evening')) === 15 + 20 + 120);
}

/* ---------- runs per date ---------- */
{
  const r = R.ensure(null);
  check('no run before starting', R.run(r, 'morning', D) === null && R.statusLine(null) === 'Ready when you are.');
  const a = R.startRun(r, 'morning', D, 't0');
  check('a run snapshots the list', a.steps.length === 5 && a.index === 0 && a.started === 't0' && a.finished === null && r.runs[D].morning === a);
  R.setSecs(r.lists.morning, 0, 60);
  check('editing the list later does not change a started run', a.steps[0].secs === 30);
  check('current is the first step', R.current(a).id === 'wake' && R.statusLine(a) === 'Ready when you are.');
  check('starting again the same day resumes the same run', R.startRun(r, 'morning', D, 't1') === a && a.started === 't0');
  check('advance marks done', R.advance(a, 'done', 't2') && a.done.wake && a.index === 1 && !a.finished);
  check('status says paused at step 2', R.statusLine(a) === 'Paused at step 2 of 5. Carry on whenever you like.');
  check('advance skipped', R.advance(a, 'skipped') && a.skipped.stretch && !a.done.stretch && a.index === 2);
  check('notes are trimmed and capped', R.setNote(a, 'intention', '  be   kind ' + 'x'.repeat(300)).length === R.NOTE_MAX && a.notes.intention.startsWith('be kind'));
  R.advance(a, 'done'); R.advance(a, 'done');
  check('not finished before the last step', !a.finished && R.current(a).id === 'intention');
  check('finishes after the last step', R.advance(a, 'done', 't9') && a.finished === 't9' && R.current(a) === null && R.isDone(r, 'morning', D));
  check('no advance after the end', !R.advance(a, 'done') && a.index === 5);
  check('done status counts the steps', R.statusLine(a) === 'Done today. 4 of 5 steps, and that is plenty.');
  check('a finished run stays when started again', R.startRun(r, 'morning', D) === a);
  const b = R.restart(r, 'morning', D, 't10');
  check('restart makes a fresh run for the date', b !== a && b.index === 0 && b.steps[0].secs === 60 && R.run(r, 'morning', D) === b);
  const e = R.startRun(r, 'evening', D);
  check('evening and morning runs live side by side', R.run(r, 'morning', D) === b && R.run(r, 'evening', D) === e && e.steps.length === 5);
  check('another day starts clean', R.startRun(r, 'morning', D2).index === 0 && R.run(r, 'morning', D) === b);
  for (let i = 0; i < 70; i++) R.startRun(r, 'morning', '2025-01-' + String((i % 28) + 1).padStart(2, '0') + (i >= 28 ? 'x' + i : ''));
  check('old days are pruned', Object.keys(r.runs).length <= R.KEEP_DAYS);
}

/* ---------- prompt windows ---------- */
{
  const r = R.ensure(null);
  const at = h => { const p = R.promptFor(r, D, h); return p ? p.routine : null; };
  check('morning window 05:00 to 10:59', at(5) === 'morning' && at(8) === 'morning' && at(10) === 'morning' && at(11) === null && at(4) === null);
  check('evening window 19:00 to 00:59', at(19) === 'evening' && at(23) === 'evening' && at(0) === 'evening' && at(1) === null && at(18) === null);
  check('afternoon prompts nothing', at(12) === null && at(15) === null);
  check('inWindow agrees', R.inWindow('morning', 7) && !R.inWindow('morning', 12) && R.inWindow('evening', 0) && !R.inWindow('evening', 2));
  const run = R.startRun(r, 'morning', D); R.advance(run, 'done');
  check('a started run prompts a carry on', R.promptFor(r, D, 8).resume === true);
  while (R.advance(run, 'done'));
  check('a finished routine does not prompt', at(8) === null);
  check('not now is remembered for the day', (R.notNow(r, D, 'evening'), at(20) === null) && R.promptFor(r, D2, 20).routine === 'evening');
  check('not now for one routine leaves the other', R.promptFor(R.notNow(R.ensure(null), D, 'morning'), D, 8) === null && R.promptFor(R.ensure(null), D, 8).routine === 'morning');
  check('prompt lines', R.promptLine('morning', false).startsWith('Good morning') && R.promptLine('evening', true).indexOf('waiting') > 0);
}

/* ---------- the timer counts only running, visible time ---------- */
{
  const t = R.timer(30);
  R.tick(t, 1000); R.tick(t, 2000);
  check('one second counted', R.activeSec(t) === 1 && R.leftSec(t) === 29 && R.clockText(t) === '0:29 left');
  R.tick(t, 60000);
  check('a long gap counts at most the max step', t.activeMs === 1000 + R.MAX_STEP_MS);
  R.pause(t, 61000); R.tick(t, 70000);
  check('paused time does not count', t.activeMs === 2500 + 1000 && t.paused && R.clockText(t).endsWith(', paused'));
  R.resume(t, 70000); R.tick(t, 71000);
  check('resumed counts again', t.activeMs === 4500);
  R.setHidden(t, true, 71000); R.tick(t, 72000);
  check('hidden time does not count', t.activeMs === 4500 && !R.counting(t));
  R.setHidden(t, false, 80000); R.tick(t, 81000);
  check('visible again counts', t.activeMs === 5500);
  for (let n = 82000; n < 120000; n += 500) R.tick(t, n);
  check('ends at the planned length', t.ended && t.activeMs === 30000 && R.finished(t) && R.leftSec(t) === 0);
  const t2 = R.timer(20); R.tick(t2, 0); R.tick(t2, 1000); R.end(t2, 1500);
  check('ending early is partial', t2.ended && !R.finished(t2) && R.activeSec(t2) === 1);
  const cues = R.CATALOG.wake.cues;
  check('cue index follows the fraction', R.cueAt(cues, R.timer(30)) === 0 && R.cueAt(cues, Object.assign(R.timer(30), { activeMs: 15000 })) === 1 && R.cueAt(cues, Object.assign(R.timer(30), { activeMs: 29000 })) === 2);
}

/* ---------- the observation ---------- */
{
  const t = R.timer(60); R.tick(t, 0); R.tick(t, 1000); R.tick(t, 61500);
  const o = R.observation('morning', { id: 'stretch', secs: 60 }, t, 'S', 'E');
  check('observation shape', o.practice === 'routine-stretch' && o.routine === 'morning' && o.step === 'stretch' && o.plannedSec === 60 && o.activeSec === 2 && o.status === 'partial' && o.start === 'S' && o.end === 'E' && o.source === 'routine' && o.scriptVersion === 'routines-1');
  for (let n = 62000; n < 130000; n += 500) R.tick(t, n);
  check('finished status', R.observation('morning', { id: 'stretch', secs: 60 }, t, 'S', 'E').status === 'finished');
  const u = R.observation('evening', { id: 'journal', secs: 0 }, null, 'S', 'E');
  check('an untimed step is a finished zero-second observation', u.plannedSec === 0 && u.activeSec === 0 && u.status === 'finished' && u.routine === 'evening');
  check('the breathing step rests on the breath', R.observation('evening', { id: 'winddown', secs: 120 }, R.timer(120), 'S', 'E').anchor === 'breath' && u.anchor === 'routine');
}

console.log(`test-routines: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
