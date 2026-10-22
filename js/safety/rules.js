/* Ebb safety rules: deterministic red-flag checks over logged observations, from the Ebb spec's safety section.
 * One versioned table; every message and action is pre-written here and never generated. Thresholds are STARTING
 * POINTS for the clinical panel to confirm or change, not validated cut-offs. No rule diagnoses, doses or advises
 * on contraception: each one says what was noticed and where to get care.
 *
 * Observation vocabulary (tolerant; see docs/safety-contract.md):
 *   bleeding: value 'spotting'|'light'|'medium'|'heavy'|'very_heavy'|'soaking' (or 0-4), context 'period'|'between'|
 *             'after_sex', soakEveryH (pad/tampon soaked every N hours), forHours (for how long)
 *   pain:     value 0-10, side 'left'|'right'|'one_side'|'both'|'middle', disrupts true when it stopped daily life
 *   symptom:  value 'fainted'|'faint'|'dizzy'|'lightheaded'|...
 *   mood:     value 0-10 severity (or 'severe'), premenstrual true if she says so
 *   test:     kind 'pregnancy', value 'positive'|'negative'
 * confirmed === false means she said the reading was wrong: it is never used. Urgent and high rules also use
 * readings still waiting for confirmation; medium pattern rules use confirmed (or confident) readings only. */
(function (root) {
  'use strict';
  var TABLE_VERSION = 'ebb-safety-rules-2026-10-22.1';
  var DAY = 86400000;

  /* ---------- small helpers ---------- */
  function dayOf(s) {
    if (!s) return null;
    if (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    var d = new Date(s); if (isNaN(d)) return null;
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function dnum(day) { return day ? Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) / DAY : NaN; }
  function low(v) { return String(v == null ? '' : v).toLowerCase().replace(/[\s-]+/g, '_'); }
  function num(v) { var n = typeof v === 'number' ? v : parseFloat(v); return isFinite(n) ? n : null; }
  function field(o, k) { return o[k] !== undefined ? o[k] : (o.value && typeof o.value === 'object' ? o.value[k] : undefined); }

  function loose(o) { return o && o.confirmed !== false; }
  function strict(o) { return o && (o.confirmed === true || (o.confirmed == null && (o.confidence == null || o.confidence >= 0.7))); }

  var FLOW = { spotting: 0.5, light: 1, medium: 2, moderate: 2, heavy: 3, very_heavy: 4, soaking: 4, flooding: 4 };
  function flow(o) { var v = o.value && typeof o.value === 'object' ? o.value.flow : o.value; var n = num(v); return n != null ? n : (FLOW[low(v)] || 0); }
  function bleedContext(o) { return low(field(o, 'context')); }
  function isBleed(o) { return o.type === 'bleeding' || o.type === 'period'; }
  function isPeriodBleed(o) { var c = bleedContext(o); return isBleed(o) && c !== 'between' && c !== 'after_sex' && flow(o) > 0; }
  function soaking(o) { var e = num(field(o, 'soakEveryH')); return isBleed(o) && ((e != null && e <= 2) || low(o.value) === 'soaking'); }
  function heavyBleed(o) { return isBleed(o) && (flow(o) >= 3 || soaking(o)); }

  var FAINTED = ['fainted', 'fainting', 'passed_out', 'blacked_out', 'collapsed', 'collapse'];
  var FEEL_FAINT = ['faint', 'feeling_faint', 'feel_faint', 'dizzy', 'very_dizzy', 'lightheaded', 'light_headed'];
  function symptom(o, list) { return o.type === 'symptom' && list.indexOf(low(o.value)) >= 0; }
  function painScore(o) { return o.type === 'pain' ? num(o.value && typeof o.value === 'object' ? o.value.score : o.value) : null; }
  function oneSided(o) { var s = low(field(o, 'side')); return field(o, 'oneSided') === true || s === 'left' || s === 'right' || s === 'one_side' || s === 'one_sided'; }
  function disrupts(o) { return field(o, 'disrupts') === true || field(o, 'stoppedActivities') === true; }
  function moodSevere(o) { if (o.type !== 'mood') return false; var n = num(field(o, 'severity')); if (n == null) n = num(o.value); return n != null ? n >= 7 : low(o.value) === 'severe' || low(field(o, 'severity')) === 'severe'; }

  var SUPPRESSING = ['hormonal_iud', 'lng_iud', 'implant', 'injection', 'depo', 'pill_continuous', 'continuous_pill', 'mini_pill', 'pop'];
  var NO_CYCLE_STAGES = ['pregnant', 'postpartum', 'breastfeeding', 'menopause', 'postmenopause'];
  function suppressing(p) { return SUPPRESSING.indexOf(low(p && p.contraception)) >= 0; }
  function stage(p) { return low(p && p.lifeStage); }
  function menopause(p) { var s = stage(p); return s === 'menopause' || s === 'postmenopause'; }
  function adult(p) { var a = num(p && p.age); return a == null || a >= 18; }

  /* periods: bleeding days grouped with gaps of at most 2 days; an episode counts as a period when it has a flow day */
  function episodes(all) {
    var days = {};
    all.forEach(function (o) { if (isPeriodBleed(o)) { var d = dayOf(o.start); if (d) days[d] = true; } });
    var list = Object.keys(days).sort(), out = [], cur = null;
    list.forEach(function (d) {
      var n = dnum(d);
      if (cur && n - cur.last <= 3) { cur.last = n; cur.lastDay = d; }
      else { cur = { first: n, last: n, firstDay: d, lastDay: d }; out.push(cur); }
    });
    return out;
  }
  function periodStarts(all, profile) {
    var starts = episodes(all).map(function (e) { return e.first; });
    var known = dnum(dayOf(profile && profile.lastPeriodStart));
    if (isFinite(known) && !starts.some(function (s) { return Math.abs(s - known) <= 10; })) starts.push(known);
    starts.sort(function (a, b) { return a - b; });
    return starts.filter(function (s, i) { return i === 0 || s - starts[i - 1] >= 10; });
  }
  /* separate episodes: dates at least `gap` days apart, so two bad days in one period count once */
  function spreadCount(days, gap) {
    var n = days.filter(isFinite).sort(function (a, b) { return a - b; }), count = 0, last = -Infinity;
    n.forEach(function (d) { if (d - last >= gap) { count++; last = d; } });
    return count;
  }

  function pregnancy(all, profile, now) {
    if (profile && (profile.pregnant === true || stage(profile) === 'pregnant')) return 'known';
    var starts = periodStarts(all, profile), last = starts.length ? starts[starts.length - 1] : -Infinity;
    var positive = all.some(function (o) {
      return loose(o) && o.type === 'test' && low(field(o, 'kind') || 'pregnancy') === 'pregnancy' && low(o.value) === 'positive' &&
        dnum(dayOf(o.start)) >= last && now - dnum(dayOf(o.start)) <= 280;
    });
    if (positive) return 'known';
    if (menopause(profile) || (profile && profile.pregnant === false)) return 'no';
    var typical = num(profile && profile.cycleLength) || 28;
    if (isFinite(last) && !suppressing(profile) && now - last > Math.max(typical + 7, 35)) return 'late';
    return 'possible';
  }

  /* ---------- the table ---------- */
  var EMERGENCY = 'Call 995 for an ambulance or go to the nearest A&E now.';
  var RULES = [
    {
      id: 'R-PREG-EMERG', version: 1, urgency: 'urgent', types: ['pain', 'symptom', 'bleeding', 'period', 'test'],
      threshold: 'Pain 7/10 or more on one side, or fainting, while pregnancy is known or possible; heavy bleeding (heavy flow or soaking every 2 h or less) while pregnancy is known or the period is late (more than max(cycle + 7, 35) days). A positive test is not required.',
      eval: function (c) {
        var p = c.pregnancy, nw = c.newLoose;
        if (p !== 'no' && nw.some(function (o) { return (painScore(o) >= 7 && oneSided(o)) || symptom(o, FAINTED); })) return {
          key: 'pain-faint', message: 'Severe pain on one side, or fainting, needs checking straight away, especially if there is any chance you could be pregnant.',
          action: EMERGENCY + ' You don’t need a pregnancy test first.' };
        if ((p === 'known' || p === 'late') && nw.some(heavyBleed)) return {
          key: 'heavy', message: p === 'known' ? 'Heavy bleeding while you are pregnant needs checking straight away.' : 'Heavy bleeding when your period is late needs checking straight away, in case you are pregnant.',
          action: EMERGENCY };
        if (p === 'known' && nw.some(function (o) { return symptom(o, FEEL_FAINT); })) return {
          key: 'faint', message: 'Feeling faint or very dizzy while you are pregnant needs checking straight away.', action: EMERGENCY };
        return null;
      }
    },
    {
      id: 'R-BLEED-SAMEDAY', version: 1, urgency: 'high', types: ['bleeding', 'period', 'symptom'],
      threshold: 'Soaking a pad or tampon every 2 h or less for 2 h or more (or two soaking logs at least 2 h apart within 12 h); or feeling faint within 24 h of bleeding; or fainting.',
      eval: function (c) {
        var nw = c.newLoose, all = c.allLoose;
        var soaks = all.filter(soaking).map(function (o) { return { t: Date.parse(o.start), h: num(field(o, 'forHours')) }; }).filter(function (s) { return isFinite(s.t); });
        var sustained = nw.some(function (o) { return soaking(o) && num(field(o, 'forHours')) >= 2; }) ||
          (nw.some(soaking) && soaks.some(function (a) { return soaks.some(function (b) { return b.t - a.t >= 2 * 3600000 && b.t - a.t <= 12 * 3600000; }); }));
        var bledRecently = all.some(function (o) { return isBleed(o) && flow(o) > 0 && Math.abs(c.nowMs - Date.parse(o.start)) <= DAY; });
        var faintNow = nw.some(function (o) { return symptom(o, FEEL_FAINT); }) && bledRecently;
        var fainted = nw.some(function (o) { return symptom(o, FAINTED); });
        if (sustained) return { key: 'soak', message: 'Soaking through a pad or tampon every hour or two for several hours is heavier than it should be.',
          action: 'Please see a doctor today: your GP or a polyclinic, or A&E if they are closed. Go to A&E or call 995 if you feel faint or very unwell.' };
        if (faintNow || fainted) return { key: 'faint', message: fainted ? 'Fainting should be checked by a doctor.' : 'Feeling faint while you are bleeding should be checked.',
          action: 'Please see a doctor today: your GP or a polyclinic, or A&E if they are closed. Call 995 if it gets worse or you can’t stay upright.' };
        return null;
      }
    },
    {
      id: 'R-MENO-BLEED', version: 1, urgency: 'high', types: ['bleeding', 'period'],
      threshold: 'Any bleeding or spotting while life stage is menopause (12+ months without a period).',
      eval: function (c) {
        if (!menopause(c.profile) || !c.newLoose.some(function (o) { return isBleed(o) && flow(o) > 0; })) return null;
        return { key: 'meno', message: 'Any bleeding after menopause should be checked by a doctor, even a little spotting. It is often not serious, but it always needs looking at.',
          action: 'Please book to see a doctor soon, ideally within the next two weeks. If you use HRT, tell them about it too.' };
      }
    },
    {
      id: 'R-UNEXPECTED-BLEED', version: 1, urgency: 'medium', types: ['bleeding', 'period'],
      threshold: 'Bleeding after sex, or between periods, on 2 or more separate days within 90 days (not in menopause mode, which has its own rule).',
      eval: function (c) {
        if (menopause(c.profile)) return null;
        var pick = function (ctx) { return c.allStrict.filter(function (o) { return isBleed(o) && bleedContext(o) === ctx && c.now - dnum(dayOf(o.start)) <= 90; }).map(function (o) { return dnum(dayOf(o.start)); }); };
        var after = spreadCount(pick('after_sex'), 1), between = spreadCount(pick('between'), 1);
        var touched = c.newStrict.some(function (o) { var x = bleedContext(o); return isBleed(o) && (x === 'after_sex' || x === 'between'); });
        if (!touched) return null;
        if (after >= 2) return { key: 'after-sex', message: 'You’ve noted bleeding after sex more than once. That is worth getting checked, even if it is light.', action: 'Please book a visit with your GP or a polyclinic in the next few weeks and mention it. Your cervical screening history helps too.' };
        if (between >= 2) return { key: 'between', message: 'You’ve noted bleeding between periods more than once. That is worth getting checked.', action: 'Please book a visit with your GP or a polyclinic in the next few weeks and show them what you’ve logged.' };
        return null;
      }
    },
    {
      id: 'R-LONG-PERIOD', version: 1, urgency: 'medium', types: ['bleeding', 'period'],
      threshold: 'A period lasting more than 7 days (adults 18+ or age unknown; not pregnant, postpartum, breastfeeding or menopause).',
      eval: function (c) {
        if (!adult(c.profile) || NO_CYCLE_STAGES.indexOf(stage(c.profile)) >= 0) return null;
        var eps = episodes(c.allStrict), touched = c.newStrict.filter(isPeriodBleed).map(function (o) { return dnum(dayOf(o.start)); });
        var hit = eps.filter(function (e) { return e.last - e.first + 1 > 7 && touched.some(function (t) { return t >= e.first && t <= e.last; }); })[0];
        return hit ? { key: 'long-' + hit.firstDay, message: 'This period has lasted more than 7 days. That can happen now and then, but it is worth mentioning to a doctor, especially if it keeps happening.',
          action: 'Please book a visit with your GP or a polyclinic. See a doctor today if it is very heavy or you feel faint.' } : null;
      }
    },
    {
      id: 'R-CYCLE-LENGTH', version: 1, urgency: 'medium', types: ['bleeding', 'period'],
      threshold: '2 or more of the last 6 cycles (period start to period start) shorter than 21 or longer than 35 days (adults; not pregnant, postpartum, breastfeeding, menopause or on period-suppressing contraception).',
      eval: function (c) {
        if (!adult(c.profile) || NO_CYCLE_STAGES.indexOf(stage(c.profile)) >= 0 || suppressing(c.profile)) return null;
        if (!c.newStrict.some(isPeriodBleed)) return null;
        var s = periodStarts(c.allStrict, c.profile), gaps = [];
        for (var i = 1; i < s.length; i++) gaps.push(s[i] - s[i - 1]);
        gaps = gaps.slice(-6);
        var shortN = gaps.filter(function (g) { return g < 21; }).length, longN = gaps.filter(function (g) { return g > 35; }).length;
        if (shortN + longN < 2) return null;
        return { key: 'cycles-' + s.length, message: shortN > longN ? 'Your last few cycles have often been shorter than 21 days.' : longN > shortN ? 'Your last few cycles have often been longer than 35 days.' : 'Your last few cycles have often been shorter than 21 or longer than 35 days.',
          action: 'That’s worth talking through with a GP or polyclinic doctor. Bring your Ebb log so they can see the pattern.' };
      }
    },
    {
      id: 'R-NO-PERIOD-90', version: 1, urgency: 'medium', types: '*',
      threshold: '90 or more days since the last known period start; no positive pregnancy test since; not pregnant, postpartum, breastfeeding, in menopause or on period-suppressing contraception.',
      eval: function (c) {
        if (NO_CYCLE_STAGES.indexOf(stage(c.profile)) >= 0 || suppressing(c.profile) || c.pregnancy === 'known') return null;
        var s = periodStarts(c.allStrict, c.profile); if (!s.length) return null;
        var since = c.now - s[s.length - 1]; if (since < 90) return null;
        return { key: 'gap-' + s[s.length - 1], message: 'It has been ' + since + ' days since your last period started.',
          action: 'If there is any chance you could be pregnant, take a pregnancy test. Either way, please book a visit with your GP or a polyclinic to talk it through.' };
      }
    },
    {
      id: 'R-PAIN-CYCLES', version: 1, urgency: 'medium', types: ['pain'],
      threshold: 'Pain 7/10 or more that stopped daily activities, in 2 or more separate episodes at least 14 days apart (roughly 2+ cycles).',
      eval: function (c) {
        if (!c.newStrict.some(function (o) { return painScore(o) >= 7 && disrupts(o); })) return null;
        var days = c.allStrict.filter(function (o) { return painScore(o) >= 7 && disrupts(o); }).map(function (o) { return dnum(dayOf(o.start)); });
        if (spreadCount(days, 14) < 2) return null;
        return { key: 'pain', message: 'Period pain that stops you doing everyday things, cycle after cycle, isn’t something you just have to put up with. It can have causes, such as endometriosis or adenomyosis, that a doctor can look into.',
          action: 'Please book a visit with your GP or a polyclinic and show them your pain log. It is fine to ask about endometriosis by name.' };
      }
    },
    {
      id: 'R-PMS-MOOD', version: 1, urgency: 'medium', types: ['mood', 'bleeding', 'period'],
      threshold: 'Mood 7/10 or worse (or marked premenstrual) in the 7 days before a period start, in 2 or more cycles.',
      eval: function (c) {
        if (!c.newStrict.some(function (o) { return moodSevere(o) || isPeriodBleed(o); })) return null;
        var s = periodStarts(c.allStrict, c.profile), severe = c.allStrict.filter(moodSevere), hit = {};
        severe.forEach(function (o) {
          var d = dnum(dayOf(o.start));
          s.forEach(function (st) { if (d >= st - 7 && d < st) hit[st] = true; });
          if (field(o, 'premenstrual') === true) hit['flag' + Math.floor(d / 14)] = true;
        });
        if (Object.keys(hit).length < 2) return null;
        return { key: 'mood', message: 'Strong low or anxious moods in the days before your period have come back more than once. That is real, and there are treatments that help.',
          action: 'Please book a visit with your GP or a polyclinic and bring your mood log. If you ever feel unsafe, use the help numbers in Safety and privacy.' };
      }
    }
  ];

  var ORDER = { urgent: 0, high: 1, medium: 2 };

  function check(newObs, allObs, profile, opts) {
    newObs = (Array.isArray(newObs) ? newObs : newObs ? [newObs] : []).filter(Boolean);
    var all = (Array.isArray(allObs) ? allObs.slice() : []).filter(Boolean);
    newObs.forEach(function (o) { if (all.indexOf(o) < 0 && !(o.id && all.some(function (a) { return a.id === o.id; }))) all.push(o); });
    profile = profile || {};
    var nowMs = opts && opts.now ? Date.parse(opts.now) : Date.now();
    var c = {
      profile: profile, nowMs: nowMs, now: dnum(dayOf(opts && opts.now ? String(opts.now) : new Date(nowMs))),
      newLoose: newObs.filter(loose), newStrict: newObs.filter(strict), allLoose: all.filter(loose), allStrict: all.filter(strict)
    };
    /* pregnancy is judged from what was known before this log: a bleed being logged now is not a new period yet */
    c.pregnancy = pregnancy(c.allLoose.filter(function (o) { return newObs.indexOf(o) < 0; }), profile, c.now);
    var out = [];
    RULES.forEach(function (r) {
      if (r.types !== '*' && !newObs.some(function (o) { return r.types.indexOf(o.type) >= 0; })) return;
      var hit = null;
      try { hit = r.eval(c); } catch (e) { if (root.console) root.console.error('safety rule ' + r.id, e); }
      if (hit) out.push({ ruleId: r.id, version: r.version, tableVersion: TABLE_VERSION, urgency: r.urgency, message: hit.message, action: hit.action, key: r.id + ':' + hit.key, threshold: r.threshold });
    });
    out.sort(function (a, b) { return ORDER[a.urgency] - ORDER[b.urgency]; });
    return out;
  }

  root.EbbSafetyRules = { check: check, RULES: RULES, TABLE_VERSION: TABLE_VERSION, _t: { periodStarts: periodStarts, episodes: episodes, pregnancy: pregnancy, dayOf: dayOf, dnum: dnum } };
})(typeof window !== 'undefined' ? window : globalThis);
