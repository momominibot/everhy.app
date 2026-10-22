/* Node checks for Ebb's log: parser, cycle engine and undo. Run: node tools/test-log.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console, Math, JSON, Date, Object, Array, String, Number, parseInt, isNaN, Intl, RegExp };
ctx.globalThis = ctx;
vm.createContext(ctx);
['parse.js', 'cycle.js', 'model.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'log', f), 'utf8'), ctx, { filename: f }));
const { EbbLogParse: LP, EbbCycle: C, EbbLogModel: M } = ctx;

let pass = 0, fail = 0;
function check(name, ok, info) { if (ok) pass++; else { fail++; console.log('FAIL', name, info === undefined ? '' : JSON.stringify(info)); } }

const TODAY = '2026-10-22'; /* a Thursday */
const p = t => LP.parse(t, TODAY);
const find = (r, type, value) => r.items.filter(i => i.type === type && (value === undefined || i.value === value))[0];

/* ---------- parser: [text, expectations] ---------- */
const cases = [
  ['my period started today', r => find(r, 'bleeding', 'period') && find(r, 'bleeding').start === TODAY],
  ['got my period', r => find(r, 'bleeding', 'period')],
  ['heavy flow today', r => find(r, 'bleeding', 'heavy')],
  ['light bleeding', r => find(r, 'bleeding', 'light')],
  ['medium flow, cramps', r => find(r, 'bleeding', 'medium') && find(r, 'symptom', 'cramps')],
  ['just some spotting', r => find(r, 'bleeding', 'spotting')],
  ['brown discharge this morning', r => find(r, 'bleeding', 'spotting') && !find(r, 'symptom', 'discharge')],
  ['soaked through a pad in an hour', r => find(r, 'bleeding', 'heavy')],
  ['heavy with big clots', r => find(r, 'bleeding', 'heavy') && find(r, 'clots', 'large')],
  ['some clots', r => find(r, 'clots', 'yes')],
  ['period ended yesterday', r => find(r, 'bleeding', 'none') && find(r, 'bleeding').start === '2026-10-21'],
  ['no bleeding today', r => find(r, 'bleeding', 'none')],
  ['bleeding a bit', r => find(r, 'bleeding', 'ambiguous')],
  ['period pain is bad', r => !find(r, 'bleeding') && find(r, 'pain') && find(r, 'pain').value === 6],
  ['waiting for my period', r => !find(r, 'bleeding')],
  ['cramps 7/10', r => find(r, 'pain') && find(r, 'pain').value === 7 && find(r, 'pain').location[0] === 'lower abdomen'],
  ['pain 4 out of 10 in my lower back', r => find(r, 'pain').value === 4 && find(r, 'pain').location.indexOf('lower back') >= 0],
  ['my back hurts', r => find(r, 'pain') && find(r, 'pain').value === null && find(r, 'pain').location[0] === 'back'],
  ['mild cramps', r => find(r, 'symptom', 'cramps') && find(r, 'pain').value === 3 && find(r, 'pain').estimated],
  ['severe pain in my pelvis', r => find(r, 'pain').value === 8 && find(r, 'pain').location[0] === 'pelvis'],
  ['no pain today', r => find(r, 'pain') && find(r, 'pain').value === 0 && find(r, 'pain').negated],
  ['no cramps', r => find(r, 'symptom', 'cramps') && find(r, 'symptom', 'cramps').negated],
  ['no cramps and no headache', r => find(r, 'symptom', 'cramps').negated && find(r, 'symptom', 'headache').negated],
  ['cramps but no headache', r => !find(r, 'symptom', 'cramps').negated && find(r, 'symptom', 'headache').negated],
  ["didn't get a headache", r => find(r, 'symptom', 'headache').negated],
  ['maybe a bit bloated', r => find(r, 'symptom', 'bloating') && find(r, 'symptom', 'bloating').hedged && find(r, 'symptom', 'bloating').confidence < 0.7],
  ['i think my period started', r => find(r, 'bleeding', 'period').hedged],
  ['kinda tired', r => find(r, 'energy', 'low').hedged],
  ['bloated and headachey', r => find(r, 'symptom', 'bloating') && find(r, 'symptom', 'headache')],
  ['sore boobs', r => find(r, 'symptom', 'breast tenderness')],
  ['breaking out again', r => find(r, 'symptom', 'acne')],
  ['felt nauseous', r => find(r, 'symptom', 'nausea')],
  ['craving chocolate', r => find(r, 'symptom', 'cravings')],
  ['hot flushes at night', r => find(r, 'symptom', 'hot flushes')],
  ['feeling anxious and teary', r => find(r, 'mood', 'anxious') && find(r, 'mood', 'low')],
  ['so irritable', r => find(r, 'mood', 'irritable')],
  ['feeling good today', r => find(r, 'mood', 'good')],
  ['not anxious at all', r => find(r, 'mood', 'anxious').negated],
  ['exhausted', r => find(r, 'energy', 'low')],
  ['full of energy', r => find(r, 'energy', 'high')],
  ['not tired', r => find(r, 'energy', 'normal')],
  ['no energy', r => find(r, 'energy', 'low')],
  ['slept 6 hours', r => find(r, 'sleep').value === 6 && find(r, 'sleep').unit === 'h'],
  ['slept about 5', r => find(r, 'sleep').value === 5],
  ['got 7.5 hrs of sleep last night', r => find(r, 'sleep').value === 7.5 && find(r, 'sleep').start === '2026-10-21' && find(r, 'sleep').end === TODAY],
  ['six and a half hours sleep', r => find(r, 'sleep').value === 6.5],
  ['barely slept', r => find(r, 'sleepQuality', 'poor')],
  ['slept well', r => find(r, 'sleepQuality', 'good')],
  ["didn't sleep well", r => find(r, 'sleepQuality', 'poor')],
  ['spotting yesterday', r => find(r, 'bleeding').start === '2026-10-21'],
  ['cramps 3 days ago', r => find(r, 'symptom', 'cramps').start === '2026-10-19'],
  ['heavy bleeding since tuesday', r => find(r, 'bleeding', 'heavy').start === '2026-10-20' && find(r, 'bleeding').end === TODAY],
  ['headache since monday', r => find(r, 'symptom', 'headache').start === '2026-10-19'],
  ['on monday i had cramps', r => find(r, 'symptom', 'cramps').start === '2026-10-19'],
  ['the day before yesterday heavy flow', r => find(r, 'bleeding', 'heavy').start === '2026-10-20'],
  ['a couple of days ago some spotting', r => find(r, 'bleeding', 'spotting').start === '2026-10-20'],
  ['period started on 18 oct', r => find(r, 'bleeding', 'period').start === '2026-10-18'],
  ['yesterday heavy flow, today light', r => r.items.filter(i => i.type === 'bleeding').length === 2 && find(r, 'bleeding', 'heavy').start === '2026-10-21' && find(r, 'bleeding', 'light').start === TODAY],
  ['cramps, started yesterday', r => find(r, 'symptom', 'cramps').start === '2026-10-21'],
  ['last night was rough, barely slept and anxious', r => find(r, 'sleepQuality', 'poor') && find(r, 'mood', 'anxious')],
  ['undo', r => r.intent === 'undo'],
  ['undo that', r => r.intent === 'undo'],
  ['all good', r => r.intent === 'allgood'],
  ['nothing to report', r => r.intent === 'allgood'],
  ['not sure', r => r.intent === 'notsure'],
  ['same as yesterday', r => r.intent === 'same'],
  ['how long were my last 6 cycles?', r => r.intent === 'question'],
  ['when is my next period', r => r.intent === 'question'],
  ['the weather is nice', r => r.intent === 'unknown' && !r.items.length],
  ['', r => r.intent === 'empty']
];
cases.forEach(([t, fn]) => { let r; try { r = p(t); check('parse: ' + t, fn(r), r.items.map(i => [i.type, i.value, i.start, i.negated, i.hedged])); } catch (e) { check('parse: ' + t + ' threw ' + e.message, false); } });
check('parser has at least 40 phrasings', cases.length >= 40, cases.length);
/* topic-aware phrasings from the room pop-ups */
const pt = (t, topic) => LP.parse(t, TODAY, { topic });
const topicCases = [
  ['egg white mucus', null, r => find(r, 'mucus', 'eggwhite')],
  ['discharge is creamy', null, r => find(r, 'mucus', 'creamy') && !find(r, 'symptom', 'discharge')],
  ['sticky', 'bleeding', r => find(r, 'mucus', 'sticky')],
  ['sticky', null, r => !find(r, 'mucus')],
  ['no mucus today', null, r => find(r, 'mucus', 'dry')],
  ['feels wet', 'bleeding', r => find(r, 'sensation', 'wet')],
  ['feeling dry', null, r => !find(r, 'sensation')],
  ['slippery sensation down there', null, r => find(r, 'sensation', 'slippery')],
  ['waking temp 36.4', null, r => find(r, 'temperature', 36.4) && find(r, 'temperature').unit === 'C'],
  ['36,5', 'temperature', r => find(r, 'temperature', 36.5)],
  ['36.7c this morning', null, r => find(r, 'temperature', 36.7)],
  ['97.9 f', null, r => find(r, 'temperature', 97.9) && find(r, 'temperature').unit === 'F'],
  ['37', 'temperature', r => find(r, 'temperature', 37)],
  ['day 37 of my cycle', null, r => !find(r, 'temperature')],
  ['7', 'sleep', r => find(r, 'sleep', 7)],
  ['7.5', 'sleep', r => find(r, 'sleep', 7.5)],
  ['7', null, r => !find(r, 'sleep')],
  ['so stressed about work', null, r => find(r, 'mood', 'stressed') && !find(r, 'mood', 'anxious')],
  ['dry skin and a breakout', 'body', r => find(r, 'symptom', 'dry skin') && find(r, 'symptom', 'acne')]
];
topicCases.forEach(([t, topic, fn]) => { let r; try { r = pt(t, topic); check('topic parse: ' + t + ' / ' + topic, fn(r), r.items.map(i => [i.type, i.value])); } catch (e) { check('topic parse threw: ' + t, false, e.message); } });
check('cycle engine ignores mucus and temperature', C.episodes([{ type: 'mucus', value: 'eggwhite', start: TODAY, end: TODAY, confirmed: true }, { type: 'temperature', value: 36.8, start: TODAY, end: TODAY, confirmed: true }]).length === 0);
/* every parsed item carries provenance-ready fields */
const all = p('heavy flow, cramps 6/10, maybe bloated, slept 5 hours, anxious');
check('items have start/end/confidence', all.items.every(i => i.start && i.end && typeof i.confidence === 'number' && i.confidence > 0 && i.confidence <= 1), all.items);
check('nothing is invented for plain chat', p('i went to the shops').items.length === 0);

/* ---------- cycle engine ---------- */
let seq = 0;
function bleed(day, value, extra) { seq++; return Object.assign({ id: 'x' + seq, type: 'bleeding', value, start: day, end: day, confirmed: true, created: '2026-01-01T00:00:' + String(seq % 60).padStart(2, '0') + '.' + String(seq).padStart(3, '0') + 'Z' }, extra || {}); }
function period(start, days, value) { const out = []; for (let i = 0; i < days; i++) out.push(bleed(C.addDays(start, i), i === 0 ? (value || 'medium') : 'light')); return out; }

check('no data: not enough data yet', C.summary([], TODAY).label === 'not enough data yet' && !C.summary([], TODAY).range);
const sp = [bleed('2026-10-01', 'spotting'), bleed('2026-10-02', 'spotting')];
check('spotting alone never starts a cycle', C.episodes(sp).length === 0 && C.summary(sp, TODAY).lastStart === null);
const spThenPeriod = [bleed('2026-10-10', 'spotting')].concat(period('2026-10-11', 5));
check('spotting before a period does not move the start', C.episodes(spThenPeriod)[0].start === '2026-10-11' && C.episodes(spThenPeriod)[0].days === 5);
const gap = [bleed('2026-10-01', 'heavy'), bleed('2026-10-03', 'light')];
check('one unlogged day inside a period is bridged', C.episodes(gap).length === 1 && C.episodes(gap)[0].days === 3);
const dry = [bleed('2026-10-01', 'heavy'), bleed('2026-10-02', 'none'), bleed('2026-10-03', 'light')];
check('a day she said was dry splits episodes', C.episodes(dry).length === 2);
const one = period('2026-10-11', 5);
const s1 = C.summary(one, TODAY);
check('one period: day count, no range', s1.cycleDay === 12 && !s1.range && s1.label === 'not enough data yet', s1);
const two = period('2026-09-13', 5).concat(period('2026-10-11', 5));
const s2 = C.summary(two, TODAY);
check('two periods: wide early range', s2.status === 'early' && s2.range && s2.range.lo === 23 && s2.range.hi === 33 && /fewer than 3/.test(s2.label), s2.range);
const starts = ['2026-04-01', '2026-04-29', '2026-05-27', '2026-06-25', '2026-07-23', '2026-08-20', '2026-09-18', '2026-10-16'];
const many = [].concat(...starts.map(s => period(s, 5)));
const s3 = C.summary(many, TODAY);
check('steady cycles: 7 lengths', s3.lengths.length === 7 && s3.lengths.every(l => l === 28 || l === 29), s3.lengths);
check('steady cycles: narrow range around 28', s3.range && s3.range.lo >= 25 && s3.range.hi <= 31 && /steady/.test(s3.label), [s3.range, s3.label]);
check('in period on day 7 of 5-day period? not in period', !s3.inPeriod && s3.cycleDay === 7);
const fewCycles = [].concat(...['2026-07-01', '2026-07-29', '2026-08-28', '2026-09-25'].map(s => period(s, 4)));
const s4 = C.summary(fewCycles, '2026-10-05');
check('3 cycles: rough estimate, widened', s4.status === 'ok' && /rough/.test(s4.label) && s4.range.hi - s4.range.lo >= 6, [s4.label, s4.range]);
const late = C.summary(fewCycles, '2026-11-10');
check('late period is counted, gently', late.late > 0 && /hasn’t been logged yet/.test(C.nextLine(late)) && !/pregnan/i.test(C.nextLine(late)), C.nextLine(late));
check('late phase label', late.phase === 'later than the range');
const longGap = period('2026-01-01', 4).concat(period('2026-06-01', 4), period('2026-06-29', 4));
const s5 = C.summary(longGap, '2026-07-05');
check('a 150-day gap is kept but not used for the range', s5.cycles.length === 2 && !s5.cycles[0].usable && s5.lengths.length === 1, s5.cycles);
check('answer: last 6 cycles lists lengths', /28 days|29 days/.test(C.answer('how long were my last 6 cycles?', many, TODAY)) && /Average/.test(C.answer('how long were my last 6 cycles?', many, TODAY)));
check('answer: last 3 cycles gives 3', (C.answer('how long were my last 3 cycles', many, TODAY).match(/: \d+ days/g) || []).length === 3);
check('answer: next period', /likely between/.test(C.answer('when is my next period?', many, TODAY)));
check('answer: next period with no data', /Not enough data yet/.test(C.answer('when is my next period?', [], TODAY)));
check('answer: period lengths', /5 days/.test(C.answer('how long are my periods?', many, TODAY)));
check('answer: cycle day', /Day 7/.test(C.answer('what day of my cycle is it?', many, TODAY)));
check('answer: never mentions fertile or safe days', !/fertile|safe day|ovulat/i.test(C.nextLine(s3) + C.answer('when is my next period', many, TODAY)));
const range = [bleed('2026-10-20', 'heavy', { end: '2026-10-22' })];
check('a range covers every day', C.episodes(range)[0].days === 3);
const overridden = range.concat([bleed('2026-10-21', 'unknown', { created: '2027-01-01T00:00:00.000Z' })]);
check('a later calendar clear overrides one day of a range', C.byDay(overridden)['2026-10-21'] === 'unknown');
const retracted = [bleed('2026-10-20', 'heavy', { retracted: '2026-10-20T10:00:00Z' })];
check('retracted entries are ignored', C.episodes(retracted).length === 0);

/* ---------- model: confirm, edit history, undo within 24 h ---------- */
const st = {};
const t0 = Date.parse('2026-10-22T09:00:00Z');
const made = M.confirm(st, p('heavy flow, cramps 6/10').items, { source: 'chat', text: 'heavy flow, cramps 6/10', now: t0 });
check('confirm makes observations with provenance', made.length === 3 && made.every(o => o.source === 'chat' && o.sourceText && o.confirmed && o.created && o.tz && o.batch === made[0].batch), made);
const e = M.edit(st, made[0].id, { value: 'medium' }, { source: 'chat', now: t0 + 1000 });
check('edit keeps history', e.value === 'medium' && e.history.length === 1 && e.history[0].before.value === 'heavy');
const made2 = M.confirm(st, p('slept 6 hours').items, { source: 'chat', now: t0 + 2000 });
const u1 = M.undo(st, t0 + 3000);
check('undo retracts only the last card', u1.ok && u1.count === 1 && made2[0].retracted && !made[0].retracted);
const u2 = M.undo(st, t0 + 4000);
check('a second undo reverses the edit', u2.ok && made[0].value === 'heavy' && !made[0].retracted);
const u3 = M.undo(st, t0 + 4500);
check('a third undo takes the first card', u3.ok && made[0].retracted);
check('nothing left to undo', M.undo(st, t0 + 5000).reason === 'nothing');
M.confirm(st, p('bloated').items, { now: t0 });
check('undo after 24 hours is refused', M.undo(st, t0 + 25 * 3600 * 1000).reason === 'expired');
check('active ignores retracted', M.activeObs(st).length === 1);
const st2 = {};
M.confirm(st2, p('cramps, light flow').items.map(i => Object.assign(i, { start: '2026-10-21', end: '2026-10-21' })), { now: t0 });
const same = M.sameAsYesterday(st2, TODAY, '2026-10-21');
check('same as yesterday offers yesterday for today', same.length === 2 && same.every(i => i.start === TODAY));
const cal = M.setBleeding(st2, '2026-10-21', 'heavy', { now: t0 + 1000 });
check('calendar edit updates the day with history', cal[0].value === 'heavy' && cal[0].history.length === 1 && M.activeObs(st2).filter(o => o.type === 'bleeding').length === 1);
M.setBleeding(st2, '2026-10-21', 'clear', { now: t0 + 2000 });
check('calendar clear removes the day', M.activeObs(st2).filter(o => o.type === 'bleeding').length === 0);

/* ---------- regressions from the Codex review, 22 Oct 2026 ---------- */
check("period hasn't started is not a period", find(p("my period hasn't started"), 'bleeding', 'none') && !find(p("my period hasn't started"), 'bleeding', 'period'));
check('not heavy bleeding is not heavy', !find(p('not heavy bleeding'), 'bleeding', 'heavy') && find(p('not heavy bleeding'), 'bleeding'));
check('heavy cramps on day 2 is not bleeding', !find(p('i have heavy cramps on day 2'), 'bleeding'));
check('light cramps is not bleeding', !find(p('light cramps'), 'bleeding'));
check('heavy with clots still heavy', find(p('heavy with clots'), 'bleeding', 'heavy'));
check('flow is heavy', find(p('flow is really heavy today'), 'bleeding', 'heavy'));
const dd = p('maybe light period, heavy period, cramps');
check('dedup keeps unrelated items', find(dd, 'symptom', 'cramps') && dd.items.filter(i => i.type === 'bleeding').length === 1, dd.items.map(i => [i.type, i.value]));
check('explicit years are kept', find(p('my period started 1 january 2025'), 'bleeding').start === '2025-01-01');
check('a future explicit date is not used', find(p('period on 1 january 2027'), 'bleeding').start === TODAY);
/* calendar edits are undoable on their own, and undo never reaches past them to unrelated cards */
const st3 = {};
M.confirm(st3, [{ type: 'bleeding', value: 'light', start: '2026-10-21', end: '2026-10-21' }], { now: t0 });
M.confirm(st3, [{ type: 'sleep', value: 7, unit: 'h', start: '2026-10-21', end: '2026-10-22' }], { now: t0 + 1000 });
M.setBleeding(st3, '2026-10-21', 'heavy', { now: t0 + 2000 });
M.undo(st3, t0 + 3000);
const act3 = M.activeObs(st3);
check('undo after a calendar edit restores the day, keeps sleep', act3.some(o => o.type === 'sleep') && act3.filter(o => o.type === 'bleeding')[0].value === 'light', act3.map(o => [o.type, o.value]));
M.setBleeding(st3, '2026-10-21', 'clear', { now: t0 + 4000 });
check('calendar clear removes the day', !M.activeObs(st3).some(o => o.type === 'bleeding'));
M.undo(st3, t0 + 5000);
check('undo a calendar clear brings it back', M.activeObs(st3).filter(o => o.type === 'bleeding')[0].value === 'light');
/* same as yesterday copies only what counts for yesterday */
const st4 = {};
M.confirm(st4, [{ type: 'bleeding', value: 'light', start: '2026-10-21', end: '2026-10-21' }], { now: t0 });
M.confirm(st4, [{ type: 'bleeding', value: 'heavy', start: '2026-10-20', end: '2026-10-21' }], { now: t0 + 1000 });
M.setBleeding(st4, '2026-10-21', 'none', { now: t0 + 2000 });
const same4 = M.sameAsYesterday(st4, TODAY, '2026-10-21');
check('same as yesterday uses the latest bleeding only', same4.length === 1 && same4[0].value === 'none', same4.map(i => i.value));
/* explicit no bleeding today ends the period on the ring */
const nb = [bleed('2026-10-01', 'light'), bleed('2026-10-02', 'none')];
check('no bleeding today is not in period', !C.summary(nb, '2026-10-02').inPeriod && C.summary(nb, '2026-10-02').phase !== 'period');
check('flow yesterday, nothing yet today, still in period', C.summary([bleed('2026-10-01', 'light')], '2026-10-02').inPeriod);
check('early range says not enough data yet', /Not enough data yet/.test(C.nextLine(s2)) && /fewer than 3/.test(C.nextLine(s2)));
check('steady range is labelled 80%', /80% range/.test(C.nextLine(s3)));

console.log(`log checks: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
