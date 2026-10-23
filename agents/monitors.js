/* Ebb agents: Ovia the orchestrator and four agents that read a person's Ebb export and describe it for the study team.
 *   Bloom   cycle: periods, flow, pain and symptoms
 *   Snooze  sleep: hours and quality
 *   Breezy  mind: mood, stress and mindfulness practice together (practice is what she does about stress)
 *   Sprout  body: food and movement (neither is collected by the app yet, so Sprout says so) They run the same way in Node (agents/run.js, on a schedule)
 * and in the admin page (admin/, on dropped exports).
 *
 * Rules that hold everywhere:
 * - Only people who said yes to "Help the research study" (consent purpose `research`) are analysed. Everyone else is
 *   counted and never opened.
 * - Every line is a description of what was logged, never advice, a diagnosis or a prediction. Wellness, not medicine.
 * - Warning signs come only from the app's own fixed safety rules (js/safety/rules.js), word for word, so the dashboard
 *   and the phone never disagree. No model decides what is urgent.
 * - Areas the app does not collect yet say so ("not collected yet"); nothing is guessed.
 * Needs EbbCycle (js/log/cycle.js) and EbbSafetyRules (js/safety/rules.js) loaded first. */
(function (root) {
  'use strict';
  var VERSION = 'agents-1';
  var DOMAINS = ['cycle', 'sleep', 'mind', 'body'];
  var NAMES = { cycle: 'Cycle', sleep: 'Sleep', mind: 'Mind', body: 'Body' };
  var AGENT = { cycle: { name: 'Bloom', covers: 'periods, flow, pain and symptoms' }, sleep: { name: 'Snooze', covers: 'sleep hours and quality' },
    mind: { name: 'Breezy', covers: 'mood, stress and mindfulness' }, body: { name: 'Sprout', covers: 'food and movement' } };
  var ORCHESTRATOR = 'Ovia';

  /* ---------- dates, as 'YYYY-MM-DD' strings in local time ---------- */
  function pad(n) { return String(n).padStart(2, '0'); }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function toDate(s) { var p = String(s).slice(0, 10).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(s, n) { var d = toDate(s); d.setDate(d.getDate() + n); return iso(d); }
  function dayOf(o) { return String(o.start || o.date || o.created || '').slice(0, 10); }
  function lastDays(today, n) { var out = []; for (var i = n - 1; i >= 0; i--) out.push(addDays(today, -i)); return out; }
  function round(v, d) { var k = Math.pow(10, d || 0); return Math.round(v * k) / k; }
  function mean(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }

  /* ---------- one person, from an Ebb export ("everything" in Settings: { app, format, save }) or a bare save ---------- */
  function consentedTo(save, purpose) {
    var last = null; /* the latest decision by time, as js/safety/consent.js reads it */
    (save && save.consent && Array.isArray(save.consent.events) ? save.consent.events : []).forEach(function (e) {
      if (e && e.purpose === purpose && (!last || String(e.at) >= String(last.at))) last = e;
    });
    return !!(last && last.granted === true);
  }
  function participant(exported, fallbackId) {
    var save = exported && exported.save ? exported.save : exported || {};
    var logs = save.log && Array.isArray(save.log.obs) ? save.log.obs.filter(function (o) { return o && o.confirmed !== false && !o.retracted; }) : [];
    var practices = Array.isArray(save.observations) ? save.observations.filter(function (o) { return o && o.type === 'mindfulness'; }) : [];
    var id = String((save.study && save.study.pid) || (exported && exported.pid) || fallbackId || 'participant');
    return { id: id, research: consentedTo(save, 'research'), profile: save.profile || {}, logs: logs, practices: practices,
      exportedAt: exported && exported.exportedAt || null, synthetic: !!(exported && exported.synthetic) };
  }

  /* how many of the days in a window have at least one entry of these types */
  function coverage(items, days) { var set = {}; items.forEach(function (o) { set[dayOf(o)] = 1; }); return days.filter(function (d) { return set[d]; }).length; }
  function series(items, days, pick) { /* one value per day: pick(list of that day's items) or null */
    var by = {}; items.forEach(function (o) { var d = dayOf(o); (by[d] = by[d] || []).push(o); });
    return days.map(function (d) { return { day: d, value: by[d] ? pick(by[d]) : null }; });
  }
  function result(domain, status, metrics, lines, extra) {
    return Object.assign({ domain: domain, name: NAMES[domain], agent: AGENT[domain].name, covers: AGENT[domain].covers, status: status, metrics: metrics, lines: lines, flags: [], series: [] }, extra || {});
  }

  /* ---------- the agents ---------- */
  var FLOW = { spotting: 0.5, light: 1, medium: 2, heavy: 3, 'very heavy': 4 };
  function cycleAgent(p, today) {
    var C = root.EbbCycle, w28 = lastDays(today, 28);
    var bleeding = p.logs.filter(function (o) { return o.type === 'bleeding'; });
    var pain = p.logs.filter(function (o) { return o.type === 'pain' || o.type === 'symptom'; });
    var lines = [], m = { cycleDay: null, lengths: [], periodLength: null, range: null, painDays28: coverage(pain, w28), flowDays28: coverage(bleeding, w28) };
    var s = C && C.summary ? C.summary(p.logs, today) : null;
    if (s && s.lastStart) {
      m.cycleDay = s.cycleDay; m.lengths = s.lengths.slice(-6); m.periodLength = s.periodLength || null; m.range = s.range ? { lo: s.range.lo, hi: s.range.hi } : null;
      lines.push('Day ' + s.cycleDay + ' of her cycle, counted from the period that started on ' + s.lastStart + '.');
      if (s.lengths.length) lines.push('Recent cycle lengths: ' + s.lengths.slice(-6).join(', ') + ' days (' + s.label + ').');
      else lines.push('Not enough logged periods yet to show cycle lengths.');
    } else if (p.profile.lastPeriodStart) lines.push('No periods logged in the app yet; she gave ' + p.profile.lastPeriodStart + ' as her last period start.');
    else lines.push('No periods logged yet.');
    if (m.painDays28) lines.push('Pain or other symptoms logged on ' + m.painDays28 + ' of the last 28 days.');
    var status = bleeding.length ? 'ok' : p.profile.lastPeriodStart ? 'sparse' : 'none';
    return result('cycle', status, m, lines, { series: series(bleeding, w28, function (l) { return Math.max.apply(null, l.map(function (o) { return FLOW[o.value] || 0; })); }), unit: 'flow (0 none to 4 very heavy)' });
  }
  function sleepAgent(p, today) {
    var w28 = lastDays(today, 28), w7 = lastDays(today, 7), prev7 = lastDays(addDays(today, -7), 7);
    var hrs = p.logs.filter(function (o) { return o.type === 'sleep' && typeof o.value === 'number'; });
    var q = p.logs.filter(function (o) { return o.type === 'sleepQuality'; });
    function avg(days) { var v = hrs.filter(function (o) { return days.indexOf(dayOf(o)) >= 0; }).map(function (o) { return o.value; }); return v.length ? round(mean(v), 1) : null; }
    var m = { nights28: coverage(hrs, w28), mean7: avg(w7), meanPrev7: avg(prev7), mean28: avg(w28),
      short7: hrs.filter(function (o) { return w7.indexOf(dayOf(o)) >= 0 && o.value < 6; }).length,
      poor28: q.filter(function (o) { return w28.indexOf(dayOf(o)) >= 0 && o.value === 'poor'; }).length };
    var lines = [];
    if (!m.nights28) lines.push('No sleep logged in the last 28 days.');
    else {
      lines.push('Sleep logged on ' + m.nights28 + ' of the last 28 nights, ' + m.mean28 + ' hours on average.');
      if (m.mean7 !== null && m.meanPrev7 !== null) lines.push('This week ' + m.mean7 + ' h a night against ' + m.meanPrev7 + ' h the week before.');
      if (m.short7) lines.push(m.short7 + ' night' + (m.short7 > 1 ? 's' : '') + ' under 6 hours this week.');
      if (m.poor28) lines.push('Poor sleep mentioned ' + m.poor28 + ' time' + (m.poor28 > 1 ? 's' : '') + ' in 28 days.');
    }
    return result('sleep', m.nights28 >= 7 ? 'ok' : m.nights28 ? 'sparse' : 'none', m, lines,
      { series: series(hrs, w28, function (l) { return l[l.length - 1].value; }), unit: 'hours' });
  }
  var MOOD_SCORE = { good: 2, normal: 1, 'mood swings': 0, low: -1, irritable: -1, anxious: -1, stressed: -1 };
  function mindAgent(p, today) { /* Breezy: mood, stress and mindfulness practice, read together */
    var w28 = lastDays(today, 28), w7 = lastDays(today, 7);
    var moods = p.logs.filter(function (o) { return o.type === 'mood'; }), energy = p.logs.filter(function (o) { return o.type === 'energy'; });
    function count(list, days, v) { return list.filter(function (o) { return days.indexOf(dayOf(o)) >= 0 && o.value === v; }).length; }
    var in28 = p.practices.filter(function (o) { return w28.indexOf(dayOf(o)) >= 0; }), in7 = in28.filter(function (o) { return w7.indexOf(dayOf(o)) >= 0; });
    var mins = function (l) { return round(l.reduce(function (a, o) { return a + (Number(o.activeSec) || 0); }, 0) / 60, 0); };
    var where = {}; in28.forEach(function (o) { var k = o.routine ? 'routines' : o.source || 'other'; where[k] = (where[k] || 0) + 1; });
    var stressDays = {}; moods.forEach(function (o) { if (o.value === 'stressed' || o.value === 'anxious') stressDays[dayOf(o)] = 1; });
    var practiceDays = {}; in28.forEach(function (o) { practiceDays[dayOf(o)] = 1; });
    var m = { moodDays28: coverage(moods.concat(energy), w28), stressed7: count(moods, w7, 'stressed'), stressed28: count(moods, w28, 'stressed'),
      low28: count(moods, w28, 'low'), good28: count(moods, w28, 'good'), anxious28: count(moods, w28, 'anxious'), irritable28: count(moods, w28, 'irritable'),
      lowEnergy28: count(energy, w28, 'low'), sessions28: in28.length, minutes28: mins(in28), minutes7: mins(in7), practiceDays28: coverage(in28, w28),
      finished28: in28.filter(function (o) { return o.status === 'finished'; }).length, where: where,
      practisedOnStressDays: Object.keys(stressDays).filter(function (d) { return w28.indexOf(d) >= 0 && practiceDays[d]; }).length,
      stressDays28: Object.keys(stressDays).filter(function (d) { return w28.indexOf(d) >= 0; }).length };
    var lines = [];
    if (!m.moodDays28) lines.push('No mood or energy logged in the last 28 days.');
    else {
      var bits = [];
      [['good28', 'good'], ['low28', 'low'], ['stressed28', 'stressed'], ['anxious28', 'anxious'], ['irritable28', 'irritable']].forEach(function (k) { if (m[k[0]]) bits.push(m[k[0]] + ' ' + k[1]); });
      lines.push('Mood or energy logged on ' + m.moodDays28 + ' of the last 28 days' + (bits.length ? ': ' + bits.join(', ') : '') + '.');
      if (m.stressed7) lines.push('Stress mentioned ' + m.stressed7 + ' time' + (m.stressed7 > 1 ? 's' : '') + ' this week.');
      if (m.lowEnergy28) lines.push('Low energy mentioned ' + m.lowEnergy28 + ' time' + (m.lowEnergy28 > 1 ? 's' : '') + ' in 28 days.');
    }
    if (!m.sessions28) lines.push('No mindfulness practice in the last 28 days.');
    else {
      lines.push(m.sessions28 + ' practices on ' + m.practiceDays28 + ' days, ' + m.minutes28 + ' minutes in all (' + m.minutes7 + ' this week); ' + m.finished28 + ' finished, and stopping early still counts.');
      var places = Object.keys(where).sort(function (a, b) { return where[b] - where[a]; });
      lines.push('Where: ' + places.map(function (k) { return k + ' ' + where[k]; }).join(', ') + '.');
      if (m.stressDays28) lines.push('On ' + m.practisedOnStressDays + ' of the ' + m.stressDays28 + ' days she named stress or worry, she also practised.');
    }
    var busy = m.moodDays28 + m.practiceDays28;
    return result('mind', busy >= 7 ? 'ok' : busy ? 'sparse' : 'none', m, lines, {
      series: series(in28, w28, function (l) { return round(l.reduce(function (a, o) { return a + (Number(o.activeSec) || 0); }, 0) / 60, 1); }), unit: 'minutes of practice',
      moodSeries: series(moods, w28, function (l) { return mean(l.map(function (o) { return MOOD_SCORE[o.value] !== undefined ? MOOD_SCORE[o.value] : 0; })); }) });
  }
  function notCollected(domain, what) {
    return result(domain, 'missing', {}, ['Not collected yet: the app has no ' + what + ' logging, so nothing is shown or guessed.']);
  }
  function bodyAgent(p) { /* Sprout: food and movement; the app does not log either yet */
    var a = p.logs.filter(function (o) { return o.type === 'steps' || o.type === 'exercise'; }), f = p.logs.filter(function (o) { return o.type === 'food'; });
    if (!a.length && !f.length) return result('body', 'missing', {}, ['Not collected yet: the app has no meal, steps or exercise logging, so nothing is shown or guessed.']);
    var lines = []; if (f.length) lines.push(f.length + ' food entries logged.'); if (a.length) lines.push(a.length + ' movement entries logged.');
    return result('body', 'sparse', { food: f.length, movement: a.length }, lines);
  }

  /* ---------- warning signs: the app's own safety rules, applied to the last 7 days ---------- */
  function flagsFor(p, today) {
    var R = root.EbbSafetyRules; if (!R || !R.check) return [];
    var w7 = lastDays(today, 7), recent = p.logs.filter(function (o) { return w7.indexOf(dayOf(o)) >= 0; });
    try {
      return R.check(recent, p.logs, p.profile, { now: today + 'T12:00:00' }).map(function (a) {
        return { ruleId: a.ruleId, urgency: a.urgency, message: a.message, action: a.action, threshold: a.threshold, tableVersion: a.tableVersion };
      });
    } catch (e) { return []; }
  }

  /* ---------- summaries: written from the agents' own lines, so every sentence traces to logged data ---------- */
  function daily(p, today) {
    var mine = p.logs.filter(function (o) { return dayOf(o) === today; }), prac = p.practices.filter(function (o) { return dayOf(o) === today; });
    if (!mine.length && !prac.length) return 'Nothing logged on ' + today + '.';
    var kinds = {}; mine.forEach(function (o) { kinds[o.type] = (kinds[o.type] || 0) + 1; });
    var bits = Object.keys(kinds).map(function (k) { return k + (kinds[k] > 1 ? ' x' + kinds[k] : ''); });
    if (prac.length) bits.push(prac.length + ' practice' + (prac.length > 1 ? 's' : ''));
    return 'On ' + today + ' she logged: ' + bits.join(', ') + '.';
  }
  function fourWeeks(agents) {
    return agents.filter(function (a) { return a.status !== 'missing'; }).map(function (a) { return a.agent + ' (' + a.name.toLowerCase() + '): ' + a.lines.join(' '); }).join('\n');
  }

  /* ---------- Ovia, the orchestrator: one person, every agent ---------- */
  function analyse(exported, today, fallbackId) {
    var p = participant(exported, fallbackId);
    if (!p.research) return { id: p.id, research: false, analysed: false };
    var agents = [cycleAgent(p, today), sleepAgent(p, today), mindAgent(p, today), bodyAgent(p)];
    var flags = flagsFor(p, today);
    var all = p.logs.concat(p.practices).map(dayOf).filter(Boolean).sort();
    return { id: p.id, research: true, analysed: true, synthetic: p.synthetic, today: today, version: VERSION, orchestrator: ORCHESTRATOR,
      lastActive: all.length ? all[all.length - 1] : null, activeDays28: coverage(p.logs.concat(p.practices), lastDays(today, 28)),
      profile: { lifeStage: p.profile.lifeStage || null, goal: p.profile.goal || null, ageBand: p.profile.ageBand || null },
      agents: agents, flags: flags, daily: daily(p, today), fourWeeks: fourWeeks(agents) };
  }
  /* everyone: the report the dashboard draws */
  function report(exportsList, today) {
    var people = (exportsList || []).map(function (e, i) { return analyse(e, today, 'P' + pad(i + 1)); });
    var done = people.filter(function (x) { return x.analysed; });
    var cohort = { total: people.length, consented: done.length, notConsented: people.length - done.length,
      active7: done.filter(function (x) { return x.lastActive && x.lastActive >= addDays(today, -6); }).length,
      flagged: done.filter(function (x) { return x.flags.length; }).length,
      coverage: DOMAINS.map(function (d) { return { domain: d, name: NAMES[d], withData: done.filter(function (x) { return x.agents.some(function (a) { return a.domain === d && (a.status === 'ok' || a.status === 'sparse'); }); }).length }; }) };
    return { version: VERSION, generatedFor: today, cohort: cohort, people: done };
  }

  root.EbbAgents = { VERSION: VERSION, DOMAINS: DOMAINS, NAMES: NAMES, AGENT: AGENT, ORCHESTRATOR: ORCHESTRATOR, participant: participant, consentedTo: consentedTo, analyse: analyse, report: report,
    agents: { cycle: cycleAgent, sleep: sleepAgent, mind: mindAgent, body: bodyAgent },
    _t: { addDays: addDays, lastDays: lastDays, dayOf: dayOf } };
})(typeof window !== 'undefined' ? window : globalThis);
