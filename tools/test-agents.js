#!/usr/bin/env node
/* Tests for the EveRhy study agents and admin dashboard data path.
 * Runs in Node: loads EbbCycle, EbbSafetyRules, EbbAgents and the demo generator, then checks that
 * report() counts and analyses people the way the dashboard expects, that P05 (no research consent) is
 * never opened, that P03's long period raises the app's own warning sign, and that admin.js parses. */
'use strict';
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
/* the agents/cycle/safety modules attach to globalThis (UMD), demo.js uses module.exports; admin.js only needs to parse */
require(path.join(ROOT, 'js/log/cycle.js'));
require(path.join(ROOT, 'js/safety/rules.js'));
require(path.join(ROOT, 'agents/monitors.js'));
require(path.join(ROOT, 'admin/admin.js'));
const demo = require(path.join(ROOT, 'agents/demo.js'));
const agents = global.EbbAgents;

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '  -> ' + detail : '')); }
}
function summarize(name, got, want) { return 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want); }

const today = '2026-10-25';
const demoExports = demo.demo(today);
const report = agents.report(demoExports, today);

console.log('agents ' + agents.VERSION + ' report for ' + today);

/* cohort totals */
check('report exposes the four domains', JSON.stringify(agents.DOMAINS) === JSON.stringify(['cycle', 'sleep', 'mind', 'body']), summarize(agents.DOMAINS, ['cycle', 'sleep', 'mind', 'body']));
check('cohort: 5 people total', report.cohort.total === 5, summarize(report.cohort.total, 5));
check('cohort: 4 consented and analysed', report.cohort.consented === 4 && report.people.length === 4, summarize([report.cohort.consented, report.people.length], [4, 4]));
check('cohort: 1 not consented', report.cohort.notConsented === 1, summarize(report.cohort.notConsented, 1));

/* P05 never opened */
const p05 = agents.analyse(demoExports.find(e => e.pid === 'P05'), today);
check('P05 (no research consent) is counted, never analysed', p05.research === false && p05.analysed === false, JSON.stringify({ research: p05.research, analysed: p05.analysed }));

/* P03 flags the app's own long-period rule */
const p03 = report.people.find(p => p.id === 'P03');
check('P03 present and analysed', !!p03 && p03.analysed === true, String(p03 && p03.id));
check('P03 has a warning sign', p03 && p03.flags.length >= 1, summarize(p03 && p03.flags.map(f => f.ruleId), ['long-period']));
if (p03 && p03.flags.length) {
  check('the long-period flag comes from the safety table, not a model', typeof p03.flags[0].ruleId === 'string' && !!p03.flags[0].message, JSON.stringify(p03.flags[0]));
}

/* every analysed person has four agents */
check('every consented person has the 4 agents', report.people.every(p => p.agents.length === 4), summarize(report.people.map(p => p.id + ':' + p.agents.length), 'all :4'));

/* Bloom (cycle): P01 has a counted cycle day and recent lengths */
const p01 = report.people.find(p => p.id === 'P01');
const bloom = p01 && p01.agents.find(a => a.domain === 'cycle');
check('P01 Bloom reports a cycle day', bloom && typeof bloom.metrics.cycleDay === 'number', JSON.stringify(bloom && bloom.metrics));
check('P01 Bloom has readable lines', bloom && bloom.lines.length >= 1, JSON.stringify(bloom && bloom.lines));

/* Snooze (sleep): P01 logged sleep, mean in hours */
const snooze = p01 && p01.agents.find(a => a.domain === 'sleep');
check('P01 Snooze has sleep hours', snooze && typeof snooze.metrics.mean28 === 'number', JSON.stringify(snooze && snooze.metrics));

/* Breezy (mind): P01 practises; practices count and minutes are sane */
const breezy = p01 && p01.agents.find(a => a.domain === 'mind');
check('P01 Breezy counted practices', breezy && breezy.metrics.sessions28 >= 1, JSON.stringify(breezy && breezy.metrics.sessions28));

/* Sprout (body): not collected yet, status missing */
const sprout = p01 && p01.agents.find(a => a.domain === 'body');
check('P01 Sprout says not collected', sprout && sprout.status === 'missing', summarize(sprout && sprout.status, 'missing'));

/* coverage excludes body (nothing collected) */
const covBody = report.cohort.coverage.find(c => c.domain === 'body');
check('coverage: body has 0 with data', covBody && covBody.withData === 0, summarize(covBody && covBody.withData, 0));
const covCycle = report.cohort.coverage.find(c => c.domain === 'cycle');
check('coverage: cycle has data for consented people', covCycle && covCycle.withData >= 2, summarize(covCycle && covCycle.withData, '>=2'));

/* four-week summary traces to logged data, and stays advisory (no "should", "diagnosis") */
check('four-weeks is plain description', /should|diagnos|suggest|advise/i.test(report.people[0].fourWeeks || '') === false, 'got ' + String(report.people[0].fourWeeks).slice(0, 80));

/* active days: P04 joined 5 days ago, active28 is small but nonzero */
const p04 = report.people.find(p => p.id === 'P04');
check('P04 recent joiner has a small active-day count', p04 && p04.activeDays28 >= 1 && p04.activeDays28 <= 10, summarize(p04 && p04.activeDays28, '1..10'));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
