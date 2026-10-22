/* Node checks for the Ebb course: progression by week reached (never streaks), the runner's active-time counting with
 * pause and hidden time, saved records, the monthly summary and the content rules. Run: node tools/test-course.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console, Math, JSON, Date, Object, Array, String, Number, parseInt, isNaN };
ctx.globalThis = ctx;
const mem = {};
ctx.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
vm.createContext(ctx);
['js/ebb-farm.js', 'js/ebb-store.js', 'js/course/content.js', 'js/course/core.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f }));
const { EbbStore: S, EbbCourse: E, EbbCourseContent: T } = ctx;

let pass = 0, fail = 0;
function check(name, ok) { if (ok) pass++; else { fail++; console.log('FAIL', name); } }

/* ---------- progression: calendar and choice, never streaks ---------- */
(() => {
  const d0 = '2026-10-01';
  let c = E.clean(null);
  check('nothing open before starting', !E.isOpen(c, 1) && E.weekState(c, 1, d0) === 'later' && E.cushionMode(c) === 'classic');
  E.start(c, d0);
  check('start opens week 1 only', E.isOpen(c, 1) && !E.isOpen(c, 2) && c.weekReached === 1);
  check('cushion uses the course once started', E.cushionMode(c) === 'course');
  check('week 2 opens seven days after week 1 began', E.nextOpensOn(c) === '2026-10-08');
  check('day 6 is too early', !E.canBeginNext(c, '2026-10-07') && E.weekState(c, 2, '2026-10-07') === 'soon');
  /* practising every day does not open a week early */
  for (let i = 0; i < 6; i++) S.addPractice({ practice: 'breath', status: 'finished', activeSec: 180, start: E.addDays(d0, i) + 'T09:00:00Z' });
  check('daily practice does not unlock early', !E.canBeginNext(c, '2026-10-07'));
  check('ready on day 7 without any practice count', E.canBeginNext(c, '2026-10-08') && E.weekState(c, 2, '2026-10-08') === 'ready');
  check('opening is her choice: not opened by time alone', c.weekReached === 1);
  check('begin next', E.beginNext(c, '2026-10-08') && c.weekReached === 2 && E.isOpen(c, 2));
  check('cannot skip ahead', !E.beginNext(c, '2026-10-09') && c.weekReached === 2);
  /* a long gap with no practice closes nothing and resets nothing */
  check('a month away keeps every reached week', E.isOpen(c, 1) && E.isOpen(c, 2) && E.canBeginNext(c, '2026-11-20'));
  check('week 3 timed from when week 2 began', E.nextOpensOn(c) === '2026-10-15');
  check('earlier weeks stay open', E.weekState(c, 1, '2026-10-20') === 'open' && E.weekState(c, 2, '2026-10-20') === 'current');
  check('open practices: current week first', E.openPractices(c)[0] === T.WEEKS[1].practices[0] && E.openPractices(c).indexOf('arrive') > 0);
  check('open practices have no repeats', new Set(E.openPractices(c)).size === E.openPractices(c).length);
  E.stop(c, '2026-10-21');
  check('stopped course: cushion back to classic, nothing opens', E.cushionMode(c) === 'classic' && !E.canBeginNext(c, '2026-12-01'));
  E.start(c, '2026-12-01');
  check('carrying on keeps the week reached', c.weekReached === 2 && c.started === d0 && !c.stopped);
  let day = '2026-12-01';
  while (E.beginNext(c, day) || c.weekReached < 8) day = E.addDays(day, 7);
  check('never past week 8', c.weekReached === 8 && E.nextOpensOn(c) === null && !E.beginNext(c, '2027-06-01'));
  check('clean caps a corrupt week', E.clean({ weekReached: 99 }).weekReached === 8 && E.clean({ weekReached: 'x' }).weekReached === 0);
  check('clean keeps summary opt-in off unless true', E.clean({ summaryOptIn: 'yes' }).summaryOptIn === false);
  const src = fs.readFileSync(path.join(__dirname, '..', 'js/course/core.js'), 'utf8');
  check('no streak logic in the rules', !/streak/i.test(src.replace(/never by streaks|no streak/gi, '')));
})();

/* ---------- runner: only running, visible time counts ---------- */
(() => {
  let t = E.timer(180), now = 1000;
  E.advance(t, now);
  for (let i = 0; i < 40; i++) { now += 250; E.advance(t, now); }
  check('counts visible running time', E.activeSec(t) === 10);
  E.pause(t, now); now += 60000; E.advance(t, now);
  check('pause counts nothing', E.activeSec(t) === 10 && t.paused);
  E.resume(t, now); now += 1000; E.advance(t, now);
  check('resume counts again', E.activeSec(t) === 11);
  E.setHidden(t, true, now); for (let i = 0; i < 20; i++) { now += 1000; E.advance(t, now); }
  check('hidden counts nothing', E.activeSec(t) === 11);
  E.setHidden(t, false, now + 300000); now += 300000;
  now += 1000; E.advance(t, now);
  check('coming back does not count the time away', E.activeSec(t) === 12);
  now += 90000; E.advance(t, now);
  check('a stalled timer counts at most a short step', E.activeSec(t) === 13);
  check('ended early is partial', !E.finished(t) && E.leftSec(t) === 167);
  E.end(t, now); now += 5000; E.advance(t, now);
  check('nothing counts after ending', E.activeSec(t) === 13 && t.ended);
  const u = E.timer(60); let n = 0; E.advance(u, n);
  while (!u.ended && n < 1e6) { n += 500; E.advance(u, n); }
  check('runs to the end on its own', u.ended && E.finished(u) && E.activeSec(u) === 60 && n === 60000);
  const cues = E.cuesFor('breath');
  check('first cue at the start', E.cueAt(cues, E.timer(180)) === 0);
  check('last cue near the end', E.cueAt(cues, u) === E.cuesFor('breath', null).length - 1);
  check('seated movement has its own cues', E.cuesFor('movement', 'seated') !== E.cuesFor('movement') && E.cuesFor('breath', 'seated') === cues);
})();

/* ---------- saved records ---------- */
(() => {
  S.reset();
  const t = E.timer(300); E.advance(t, 0); for (let i = 1; i <= 100; i++) E.advance(t, i * 1000);
  const r = S.addPractice(E.record('movement', { anchor: 'body', variant: 'seated' }, t, '2026-10-22T09:00:00Z', '2026-10-22T09:02:00Z'));
  check('record: practice id', r.practice === 'movement');
  check('record: script version marks the seated script', r.scriptVersion === 'draft-1/seated');
  check('record: anchor', r.anchor === 'body');
  check('record: active seconds', r.activeSec === 100 && r.plannedSec === 300);
  check('record: partial', r.status === 'partial');
  check('record: source course', r.source === 'course' && r.type === 'mindfulness');
  const f = E.timer(180); E.advance(f, 0); for (let i = 1; i <= 400; i++) E.advance(f, i * 500);
  const r2 = S.addPractice(E.record('carry', { anchor: 'sound' }, f, '2026-10-23T09:00:00Z', null));
  check('record: finished with chosen anchor', r2.status === 'finished' && r2.anchor === 'sound' && r2.scriptVersion === 'draft-1');
  check('record: default anchor from the practice', E.record('tea', {}, f).anchor === 'senses');
  check('records persisted', JSON.parse(mem[S.KEY]).observations.length === 2);
})();

/* ---------- history and the monthly summary ---------- */
(() => {
  const obs = [
    { type: 'mindfulness', date: '2026-10-02', start: '2026-10-02T08:00:00Z', activeSec: 180, status: 'finished' },
    { type: 'mindfulness', date: '2026-10-02', start: '2026-10-02T20:00:00Z', activeSec: 70, status: 'partial' },
    { type: 'mindfulness', date: '2026-10-09', start: '2026-10-09T08:00:00Z', activeSec: 300, status: 'finished' },
    { type: 'mindfulness', date: '2026-09-30', start: '2026-09-30T08:00:00Z', activeSec: 300, status: 'finished' },
    { type: 'sleep', date: '2026-10-03', activeSec: 9999 }];
  const s = E.monthSummary(obs, '2026-10');
  check('summary days', s.days === 2);
  check('summary minutes', s.minutes === 9);
  check('summary finished and partial', s.finished === 2 && s.partial === 1);
  const text = E.summaryText(s);
  check('summary in plain words', /2 days/.test(text) && /9 minutes/.test(text) && /1 ended early/.test(text));
  check('summary never scores or counts streaks', !/score|streak|%|out of|best|goal|well done|great/i.test(text));
  check('a few seconds read as under a minute', /under a minute/.test(E.summaryText(E.monthSummary([{ type: 'mindfulness', date: '2026-10-05', activeSec: 4, status: 'partial' }], '2026-10'))) && E.minutesText(4) === 'under a minute' && E.minutesText(300) === 'about 5 min');
  check('empty month is fine', /No practices saved in November/.test(E.summaryText(E.monthSummary(obs, '2026-11'))));
  check('history newest first, practices only', E.practices(obs)[0].date === '2026-10-09' && E.practices(obs).length === 4);
})();

/* ---------- content rules ---------- */
(() => {
  const P = T.PRACTICES, all = JSON.stringify(T);
  check('eight weeks', T.WEEKS.length === 8 && T.WEEKS.every((w, i) => w.n === i + 1));
  T.WEEKS.forEach(w => {
    check(`week ${w.n} has intro and invitation`, w.intro.length > 20 && w.invitation.length > 10);
    check(`week ${w.n} has 2 or 3 known practices`, w.practices.length >= 2 && w.practices.length <= 3 && w.practices.every(id => P[id]));
    check(`week ${w.n} icon in range`, w.icon >= 0 && w.icon < T.ICON_COUNT);
  });
  check('teacher check-in is marked a placeholder for staff', T.CHECKIN.status === 'placeholder' && /placeholder/i.test(T.CHECKIN.staffNote));
  check('user check-in copy does not say placeholder', !/placeholder|staff/i.test(T.CHECKIN.title + T.CHECKIN.body + T.CHECKIN.action));
  ['bodyscan', 'breath', 'sound', 'touch', 'movement', 'tea', 'stress', 'kindness'].forEach(id => check(`library has ${id}`, !!P[id]));
  check('movement has a seated alternative', P.movement.seated && P.movement.seated.length === P.movement.cues.length);
  Object.keys(P).forEach(id => {
    const p = P[id];
    check(`${id} default 3 to 5 min`, p.minutes >= 3 && p.minutes <= 5);
    [p.cues, p.seated].filter(Boolean).forEach(cs => {
      check(`${id} cues start at 0 and rise`, cs[0][0] === 0 && cs.every((c, i) => i === 0 || c[0] > cs[i - 1][0]) && cs[cs.length - 1][0] < 1);
      check(`${id} every cue has a caption`, cs.every(c => typeof c[1] === 'string' && c[1].length > 10));
    });
  });
  check('scripts marked as drafts for MBSR teacher review', /^draft/.test(T.VERSION) && /qualified MBSR teacher/.test(T.COPY.draft));
  check('called MBSR-informed, never MBSR or certified', /MBSR-informed/.test(T.COPY.kind) && !/certif/i.test(all) &&
    (all.match(/MBSR/g) || []).length === (all.match(/MBSR-informed|qualified MBSR teacher/g) || []).length);
  check('nothing offered for hot flushes', !/hot flush|hot flash|flush|menopaus|symptom/i.test(all));
  check('no health claims', !/\b(cure|cures|treat|treats|treatment|heal|heals|reduces?|relieves?|relief|improves?|lowers|therapy|anxiety|depression)\b/i.test(all));
  check('no scoring or streak words', !/score|streak|points|level up|perfect|fail/i.test(all));
  check('a wandering mind is never failure', /When you notice it has, that noticing is the practice/.test(all) && !/wrong|bad at/i.test(all));
  check('no em dashes in copy', !/—/.test(all));
  const ui = fs.readFileSync(path.join(__dirname, '..', 'js/ext/course.js'), 'utf8');
  check('ui writes user notes as text, never html', !/innerHTML\s*=\s*[^'"\s]/.test(ui) && !/—/.test(ui));
  check('ui saves only from the save step', (ui.match(/addPractice\(/g) || []).length === 1);
})();

process.on('beforeExit', () => { console.log(`${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0; });
