/* Node checks for Ebb's safety layer: every rule fires and stays quiet, crisis phrasings, consent events.
 * Run: node tools/test-safety.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console, Math, JSON, Date, Object, Array, String, Number, parseInt, parseFloat, isNaN, isFinite, Promise, Error };
ctx.globalThis = ctx;
vm.createContext(ctx);
const js = f => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f });
['js/safety/rules.js', 'js/safety/crisis.js', 'js/safety/consent.js', 'js/ext/safety.js'].forEach(js);
const { EbbSafetyRules: R, EbbCrisis: CR, EbbConsent: C, EbbSafety: S } = ctx;

let pass = 0, fail = 0;
function check(name, ok) { if (ok) pass++; else { fail++; console.log('FAIL', name); } }

const NOW = '2026-10-22T12:00:00';
function day(n, h) { const d = new Date(Date.UTC(2026, 9, 22 + n)); return d.toISOString().slice(0, 10) + 'T' + String(h == null ? 9 : h).padStart(2, '0') + ':00:00'; }
let seq = 0;
function ob(type, value, n, extra) { return Object.assign({ id: 'o' + (++seq), type, value, start: day(n || 0, extra && extra.h), confirmed: true }, extra || {}); }
function bleedDays(from, count, value, ctxName) { const out = []; for (let i = 0; i < count; i++) out.push(ob('bleeding', value || 'medium', from + i, { context: ctxName || 'period' })); return out; }
function run(newObs, older, profile) { return S.check(newObs, (older || []).concat(newObs), profile || {}, { now: NOW }); }
function ids(alerts) { return alerts.map(a => a.ruleId); }
function has(alerts, id) { return ids(alerts).indexOf(id) >= 0; }

/* ---------- the table itself ---------- */
check('rule ids unique', new Set(R.RULES.map(r => r.id)).size === R.RULES.length);
R.RULES.forEach(r => {
  check(`${r.id} versioned`, Number.isInteger(r.version) && r.version >= 1);
  check(`${r.id} urgency known`, ['urgent', 'high', 'medium'].indexOf(r.urgency) >= 0);
  check(`${r.id} threshold written down`, typeof r.threshold === 'string' && r.threshold.length > 20);
});
check('table version stamped', /^ebb-safety-rules-\d{4}-\d{2}-\d{2}\.\d+$/.test(R.TABLE_VERSION));

/* ---------- R-PREG-EMERG ---------- */
(() => {
  const a = run([ob('pain', 8, 0, { side: 'left' })]);
  check('preg: severe one-sided pain fires urgent with no test logged', has(a, 'R-PREG-EMERG') && a[0].urgency === 'urgent' && /995/.test(a[0].action) && /test/.test(a[0].action));
  check('preg: fainting fires urgent', has(run([ob('symptom', 'fainted')]), 'R-PREG-EMERG'));
  const test = ob('test', 'positive', -20, { kind: 'pregnancy' });
  check('preg: heavy bleeding after a positive test fires', has(run([ob('bleeding', 'heavy')], [test]), 'R-PREG-EMERG'));
  check('preg: heavy bleeding with a late period fires without a test', has(run([ob('bleeding', 'heavy')], [], { lastPeriodStart: day(-50).slice(0, 10), cycleLength: 28 }), 'R-PREG-EMERG'));
  check('preg: feeling dizzy when known pregnant fires', has(run([ob('symptom', 'dizzy')], [], { pregnant: true }), 'R-PREG-EMERG'));
  check('preg: quiet in menopause mode', !has(run([ob('pain', 9, 0, { side: 'right' })], [], { lifeStage: 'menopause' }), 'R-PREG-EMERG'));
  check('preg: quiet for pain on both sides', !has(run([ob('pain', 9, 0, { side: 'both' })]), 'R-PREG-EMERG'));
  check('preg: quiet for moderate one-sided pain', !has(run([ob('pain', 5, 0, { side: 'left' })]), 'R-PREG-EMERG'));
  check('preg: heavy bleeding alone, period not late, is not an emergency', !has(run([ob('bleeding', 'heavy')], [], { lastPeriodStart: day(-2).slice(0, 10) }), 'R-PREG-EMERG'));
  check('preg: a reading she rejected is never used', !has(run([ob('pain', 9, 0, { side: 'left', confirmed: false })]), 'R-PREG-EMERG'));
  check('preg: an unconfirmed reading still counts for urgent rules', has(run([ob('symptom', 'fainted', 0, { confirmed: null, confidence: 0.4 })]), 'R-PREG-EMERG'));
})();

/* ---------- R-BLEED-SAMEDAY ---------- */
(() => {
  check('sameday: soaking every 1.5 h for 3 h fires high', (() => { const a = run([ob('bleeding', 'heavy', 0, { soakEveryH: 1.5, forHours: 3 })], [], { lastPeriodStart: day(-1).slice(0, 10) }); return has(a, 'R-BLEED-SAMEDAY') && a.find(x => x.ruleId === 'R-BLEED-SAMEDAY').urgency === 'high'; })());
  check('sameday: two soaking logs 3 h apart fire', has(run([ob('bleeding', 'soaking', 0, { h: 12 })], [ob('bleeding', 'soaking', 0, { h: 9 })], { lastPeriodStart: day(-1).slice(0, 10) }), 'R-BLEED-SAMEDAY'));
  check('sameday: feeling faint while bleeding fires', has(run([ob('symptom', 'feeling faint', 0, { h: 11 })], [ob('bleeding', 'medium', 0, { h: 8 })], { lastPeriodStart: day(0).slice(0, 10) }), 'R-BLEED-SAMEDAY'));
  check('sameday: quiet when soaking every 4 h', !has(run([ob('bleeding', 'medium', 0, { soakEveryH: 4, forHours: 8 })]), 'R-BLEED-SAMEDAY'));
  check('sameday: quiet for one soaking hour', !has(run([ob('bleeding', 'heavy', 0, { soakEveryH: 1.5, forHours: 1 })], [], { lastPeriodStart: day(0).slice(0, 10) }), 'R-BLEED-SAMEDAY'));
  check('sameday: quiet for dizziness with no bleeding', !has(run([ob('symptom', 'dizzy')]), 'R-BLEED-SAMEDAY'));
})();

/* ---------- R-MENO-BLEED ---------- */
(() => {
  const a = run([ob('bleeding', 'spotting')], [], { lifeStage: 'menopause' });
  check('meno: any spotting in menopause mode fires', has(a, 'R-MENO-BLEED') && /soon/.test(a.find(x => x.ruleId === 'R-MENO-BLEED').action));
  check('meno: quiet when cycling', !has(run([ob('bleeding', 'spotting')], [], { lifeStage: 'cycling' }), 'R-MENO-BLEED'));
  check('meno: quiet when the new log is not bleeding', !has(run([ob('mood', 3)], [], { lifeStage: 'menopause' }), 'R-MENO-BLEED'));
})();

/* ---------- R-UNEXPECTED-BLEED ---------- */
(() => {
  const old = ob('bleeding', 'spotting', -20, { context: 'after_sex' });
  check('unexpected: second bleed after sex fires', has(run([ob('bleeding', 'spotting', 0, { context: 'after_sex' })], [old]), 'R-UNEXPECTED-BLEED'));
  check('unexpected: one bleed after sex is quiet', !has(run([ob('bleeding', 'spotting', 0, { context: 'after_sex' })]), 'R-UNEXPECTED-BLEED'));
  check('unexpected: second bleed 200 days later is quiet', !has(run([ob('bleeding', 'spotting', 0, { context: 'after_sex' })], [ob('bleeding', 'spotting', -200, { context: 'after_sex' })]), 'R-UNEXPECTED-BLEED'));
  check('unexpected: repeated bleeding between periods fires', has(run([ob('bleeding', 'light', 0, { context: 'between' })], [ob('bleeding', 'light', -14, { context: 'between' })]), 'R-UNEXPECTED-BLEED'));
  check('unexpected: menopause mode leaves it to the menopause rule', !has(run([ob('bleeding', 'light', 0, { context: 'between' })], [ob('bleeding', 'light', -14, { context: 'between' })], { lifeStage: 'menopause' }), 'R-UNEXPECTED-BLEED'));
})();

/* ---------- R-LONG-PERIOD ---------- */
(() => {
  const eight = bleedDays(-7, 8, 'light');
  check('long: an 8-day period fires', has(run([eight[7]], eight.slice(0, 7)), 'R-LONG-PERIOD'));
  const seven = bleedDays(-6, 7, 'light');
  check('long: a 7-day period is quiet', !has(run([seven[6]], seven.slice(0, 6)), 'R-LONG-PERIOD'));
  check('long: under 18 is quiet', !has(run([eight[7]], eight.slice(0, 7), { age: 16 }), 'R-LONG-PERIOD'));
  check('long: postpartum is quiet', !has(run([eight[7]], eight.slice(0, 7), { lifeStage: 'postpartum' }), 'R-LONG-PERIOD'));
})();

/* ---------- R-CYCLE-LENGTH ---------- */
(() => {
  const starts = gaps => { let d = 0; const out = [ob('bleeding', 'medium', 0)]; gaps.slice().reverse().forEach(g => { d -= g; out.unshift(ob('bleeding', 'medium', d)); }); return out; };
  const shortC = starts([28, 19, 18]);
  check('cycles: two cycles under 21 days fire', has(run([shortC[shortC.length - 1]], shortC.slice(0, -1)), 'R-CYCLE-LENGTH'));
  const longC = starts([40, 28, 45]);
  check('cycles: two cycles over 35 days fire', has(run([longC[longC.length - 1]], longC.slice(0, -1)), 'R-CYCLE-LENGTH'));
  const okC = starts([28, 30, 27]);
  check('cycles: regular cycles are quiet', !has(run([okC[okC.length - 1]], okC.slice(0, -1)), 'R-CYCLE-LENGTH'));
  const oneC = starts([28, 19, 29]);
  check('cycles: one short cycle is quiet', !has(run([oneC[oneC.length - 1]], oneC.slice(0, -1)), 'R-CYCLE-LENGTH'));
  check('cycles: quiet on an implant', !has(run([shortC[shortC.length - 1]], shortC.slice(0, -1), { contraception: 'implant' }), 'R-CYCLE-LENGTH'));
  check('cycles: quiet for teens', !has(run([shortC[shortC.length - 1]], shortC.slice(0, -1), { age: 15 }), 'R-CYCLE-LENGTH'));
})();

/* ---------- R-NO-PERIOD-90 ---------- */
(() => {
  const p = { lastPeriodStart: day(-100).slice(0, 10) };
  const a = run([ob('mood', 4)], [], p);
  check('90d: 100 days without a period fires on any log', has(a, 'R-NO-PERIOD-90') && /100 days/.test(a.find(x => x.ruleId === 'R-NO-PERIOD-90').message));
  check('90d: 80 days is quiet', !has(run([ob('mood', 4)], [], { lastPeriodStart: day(-80).slice(0, 10) }), 'R-NO-PERIOD-90'));
  check('90d: quiet on a hormonal IUD', !has(run([ob('mood', 4)], [], Object.assign({ contraception: 'hormonal_iud' }, p)), 'R-NO-PERIOD-90'));
  check('90d: quiet after a positive test', !has(run([ob('mood', 4)], [ob('test', 'positive', -40, { kind: 'pregnancy' })], p), 'R-NO-PERIOD-90'));
  check('90d: quiet when pregnant', !has(run([ob('mood', 4)], [], Object.assign({ lifeStage: 'pregnant' }, p)), 'R-NO-PERIOD-90'));
  check('90d: quiet when the last period is unknown', !has(run([ob('mood', 4)], [], { lastPeriodNote: 'not_sure' }), 'R-NO-PERIOD-90'));
  check('90d: a logged period resets the count', !has(run([ob('mood', 4)], [ob('bleeding', 'medium', -30)], p), 'R-NO-PERIOD-90'));
})();

/* ---------- R-PAIN-CYCLES ---------- */
(() => {
  const old = ob('pain', 8, -28, { disrupts: true });
  const a = run([ob('pain', 7, 0, { disrupts: true })], [old]);
  check('pain: 7/10 disrupting pain in two cycles fires', has(a, 'R-PAIN-CYCLES') && /endometriosis/.test(a.find(x => x.ruleId === 'R-PAIN-CYCLES').message));
  check('pain: two bad days in one period are quiet', !has(run([ob('pain', 8, 0, { disrupts: true })], [ob('pain', 8, -2, { disrupts: true })]), 'R-PAIN-CYCLES'));
  check('pain: severe pain that did not stop her day is quiet', !has(run([ob('pain', 8, 0)], [ob('pain', 8, -28)]), 'R-PAIN-CYCLES'));
  check('pain: 6/10 is quiet', !has(run([ob('pain', 6, 0, { disrupts: true })], [ob('pain', 6, -28, { disrupts: true })]), 'R-PAIN-CYCLES'));
  check('pain: pending readings with low confidence are not used for patterns', !has(run([ob('pain', 8, 0, { disrupts: true, confirmed: null, confidence: 0.4 })], [old]), 'R-PAIN-CYCLES'));
})();

/* ---------- R-PMS-MOOD ---------- */
(() => {
  const hist = [ob('bleeding', 'medium', -56), ob('mood', 8, -59), ob('bleeding', 'medium', -28), ob('mood', 9, -31)];
  check('mood: severe low mood before two periods fires', has(run([ob('bleeding', 'medium', 0)], hist), 'R-PMS-MOOD'));
  const one = [ob('bleeding', 'medium', -56), ob('bleeding', 'medium', -28), ob('mood', 9, -31)];
  check('mood: one cycle is quiet', !has(run([ob('bleeding', 'medium', 0)], one), 'R-PMS-MOOD'));
  const mild = [ob('bleeding', 'medium', -56), ob('mood', 4, -59), ob('bleeding', 'medium', -28), ob('mood', 5, -31)];
  check('mood: mild moods are quiet', !has(run([ob('bleeding', 'medium', 0)], mild), 'R-PMS-MOOD'));
  check('mood: flagged premenstrual twice fires', has(run([ob('mood', 'severe', 0, { premenstrual: true })], [ob('mood', 'severe', -29, { premenstrual: true })]), 'R-PMS-MOOD'));
})();

/* ---------- cross-cutting ---------- */
(() => {
  const hist = [ob('bleeding', 'spotting', -20, { context: 'after_sex' }), ob('bleeding', 'spotting', -10, { context: 'after_sex' })];
  check('relevance: a mood log does not re-raise a bleeding pattern', !has(run([ob('mood', 3)], hist), 'R-UNEXPECTED-BLEED'));
  const mixed = run([ob('pain', 9, 0, { side: 'right', disrupts: true })], [ob('pain', 8, -28, { disrupts: true })]);
  check('ordering: urgent comes before medium', mixed[0].urgency === 'urgent' && mixed[mixed.length - 1].urgency === 'medium');
  const all = [].concat(...[run([ob('pain', 8, 0, { side: 'left' })]), mixed, run([ob('mood', 4)], [], { lastPeriodStart: day(-100).slice(0, 10) })]);
  all.forEach((a, i) => check('shape ' + i, typeof a.ruleId === 'string' && typeof a.version === 'number' && ['urgent', 'high', 'medium'].indexOf(a.urgency) >= 0 && a.message.length > 10 && a.action.length > 10 && typeof a.key === 'string'));
  const every = R.RULES.map(r => r.eval.toString()).join('\n');
  check('copy: no rule tells her she has a condition', !/you have (endometriosis|pcos|cancer|an ectopic|adenomyosis|pmdd)/i.test(every));
  check('copy: no dosing or contraception advice', !/\b(mg|dose|ibuprofen|paracetamol|ponstan|safe days|fertile window)\b/i.test(every));
  check('copy: no em dashes', !/—/.test(every));
  check('empty input is safe', Array.isArray(S.check([], [], null)) && S.check(null, null, null).length === 0);
})();

/* ---------- crisis language ---------- */
const CRISIS = [
  'I want to die', 'sian already, really want to die', 'dun want to live liao', 'feel like jumping down from my block',
  'everyone better off without me lah', 'wanna end it all sia', 'cannot tahan anymore, want to kms',
  'I am not okay. I keep thinking about killing myself', "I'm not suicidal but I think about dying a lot",
  "I can't stop thinking about suicide", 'I have been cutting myself again', 'I feel suicidal tonight',
  'my mum would be better off without me', 'not gonna lie I want to die', "I don't know why I want to die",
  "life isn't worth living", 'I took too many pills on purpose', 'no point living already', '我真的不想活了',
  "I don't think I can go on", 'thinking of overdosing on my meds', 'I wish I was never born', 'I want to end my life',
  'I want to jump in front of the MRT', 'i dont want to wake up tomorrow', 'i might hurt myself tonight',
  'I self harm when it gets bad', 'my bf told me to kill myself and maybe I should', 'I’m so tired of everything. I just want to disappear and never wake up. I wish I could die',
  'period pain is bad and honestly I want to die', 'I plan to end my life this weekend', 'want to jump off the HDB roof'
];
const NOT_CRISIS = [
  "I'm not suicidal, just tired", 'never thought of hurting myself', "dun worry I won't hurt myself", 'I cut myself while cutting onions',
  'want to die my hair pink', 'die die must try the laksa', 'my cramps are killing me sia', 'jialat, die liao lor',
  "I'm dying to try that cafe", 'my friend say she want to die, I worried for her', 'watched a drama about suicide, so sad',
  "I used to self-harm years ago but I'm ok now", 'ran 5 kms today', "I don't want to die", 'no thoughts of self harm',
  'I have no plans to end my life', "my sister is suicidal and I don't know how to help", 'kill time at the mall',
  'I need to take my pills', '想死你了', 'careful not to overdose on caffeine', 'I would never kill myself', 'she wants to die',
  'I am not having any thoughts of suicide', 'I watched a show where the character killed herself', 'suicide prevention talk at work today',
  "I'm not going to hurt myself, promise", 'dead tired after work, want to sleep', 'paiseh until I want to hide under the table',
  'this traffic jam is killing me', 'bored to death in the meeting'
];
check('crisis: at least 30 phrasings each way', CRISIS.length >= 30 && NOT_CRISIS.length >= 30);
CRISIS.forEach(t => check('crisis fires: ' + t, S.crisis(t) === true));
NOT_CRISIS.forEach(t => check('crisis quiet: ' + t, S.crisis(t) === false));
check('crisis: empty and odd input is quiet', S.crisis('') === false && S.crisis(null) === false && S.crisis(42) === false);
(() => {
  const a = run([ob('mood', 9, 0, { text: 'cramps so bad and honestly I want to die' }), ob('pain', 9, 0, { side: 'left' })]);
  check('check: crisis text returns only the crisis alert', a.length === 1 && a[0].crisis === true && a[0].urgency === 'urgent');
  check('check: other alerts wait behind the crisis card', a[0].deferred.some(x => x.ruleId === 'R-PREG-EMERG'));
  check('check: crisis action names verified numbers', /1767/.test(a[0].action) && /1771/.test(a[0].action) && /995/.test(a[0].action));
  check('check: a rejected note does not raise the crisis card', !run([ob('mood', 9, 0, { text: 'I want to die', confirmed: false })]).some(x => x.crisis));
})();

/* ---------- help numbers in the crisis card ---------- */
(() => {
  const ui = fs.readFileSync(path.join(__dirname, '..', 'js/safety/ui.js'), 'utf8');
  ['tel:1767', 'wa.me/6591511767', 'tel:1771', 'tel:995'].forEach(n => check('help number present: ' + n, ui.indexOf(n) >= 0));
  check('retired IMH helpline left out', ui.indexOf("href: 'tel:63892222'") < 0 && !/tel:6389/.test(ui));
  check('help numbers cite their sources', /sos\.org\.sg/.test(ui) && /scdf\.gov\.sg/.test(ui) && /moh\.gov\.sg/.test(ui) && /22 Oct 2026/.test(ui));
})();

/* ---------- consent ---------- */
(() => {
  const st = {};
  check('consent: nothing is on by default', C.IDS.every(id => !C.consented(st, id)));
  check('consent: five purposes, each with plain copy', C.IDS.join() === 'core,physiology,research,partner,course' && C.PURPOSES.every(p => p.title && p.body.length > 40 && p.yes && p.no));
  const e1 = C.record(st, 'research', true, 'onboarding', '2026-10-22T10:00:00.000Z');
  check('consent: agreeing records a dated event', e1.granted === true && e1.at === '2026-10-22T10:00:00.000Z' && e1.copyVersion === C.COPY_VERSION && e1.source === 'onboarding');
  check('consent: agreeing to one purpose leaves the others off', C.consented(st, 'research') && !C.consented(st, 'partner') && !C.consented(st, 'core'));
  C.record(st, 'research', false, 'panel', '2026-10-23T10:00:00.000Z');
  check('consent: withdrawing turns it off', !C.consented(st, 'research'));
  check('consent: history keeps every event', C.history(st, 'research').length === 2 && st.consent.events.length === 2);
  C.record(st, 'research', true, 'panel', '2026-10-24T10:00:00.000Z');
  check('consent: agreeing again turns it back on', C.consented(st, 'research'));
  check('consent: only true counts as agreement', (() => { const s2 = {}; C.record(s2, 'core', 'yes'); return !C.consented(s2, 'core'); })());
  check('consent: unknown purposes are refused', (() => { try { C.record({}, 'marketing', true); return false; } catch (e) { return true; } })());
  check('consent: copy says nothing leaves the phone in this build', /nothing is sent/i.test(C.PURPOSES.find(p => p.id === 'research').body));
  check('consent: physiology copy disclaims contraception', /isn’t a form of contraception/.test(C.PURPOSES.find(p => p.id === 'physiology').body));
  check('facade: consented is false with no game running', S.consented('core') === false);
})();

process.on('beforeExit', () => { console.log(`${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0; });
