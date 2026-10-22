/* Ebb cycle engine: pure functions from confirmed bleeding observations to period episodes, cycle lengths and a
 * next-period range. Spotting never starts a cycle. With fewer than 3 cycles the range is wide or absent, and a late
 * period is described gently with no assumptions. Estimates only: never for contraception or diagnosis. */
(function (root) {
  'use strict';
  var DAY = 86400000;
  function pad(n) { return String(n).padStart(2, '0'); }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function toDate(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(s, n) { var d = toDate(s); d.setDate(d.getDate() + n); return iso(d); }
  function diff(a, b) { return Math.round((toDate(b) - toDate(a)) / DAY); } /* days from a to b */

  var PERIOD = { light: 1, medium: 1, heavy: 1, period: 1 };
  function active(obs) { return (obs || []).filter(function (o) { return o && o.confirmed && !o.retracted; }); }

  /* the latest confirmed bleeding entry for each day wins; ranges ("since Tuesday") cover each day they span */
  function byDay(obs) {
    var map = {}, when = {};
    active(obs).filter(function (o) { return o.type === 'bleeding'; }).forEach(function (o) {
      var t = o.updated || o.created || '', s = o.start, e = o.end || o.start, n = 0;
      for (var d = s; d <= e && n < 31; d = addDays(d, 1), n++) {
        if (!when[d] || t >= when[d]) { when[d] = t; map[d] = o.value; }
      }
    });
    return map;
  }

  /* period episodes: runs of period days, bridging a single unlogged day (not a day she said was dry) */
  function episodes(obs) {
    var map = byDay(obs), days = Object.keys(map).filter(function (d) { return PERIOD[map[d]]; }).sort(), out = [];
    days.forEach(function (d) {
      var cur = out[out.length - 1];
      if (cur) {
        var gap = diff(cur.end, d);
        if (gap === 1 || (gap === 2 && map[addDays(cur.end, 1)] !== 'none')) { cur.end = d; cur.days = diff(cur.start, d) + 1; return; }
      }
      out.push({ start: d, end: d, days: 1 });
    });
    return out;
  }

  function cycles(eps) {
    var out = [];
    for (var i = 1; i < eps.length; i++) {
      var L = diff(eps[i - 1].start, eps[i].start);
      out.push({ start: eps[i - 1].start, next: eps[i].start, length: L, usable: L >= 15 && L <= 90 });
    }
    return out;
  }
  function pct(sorted, p) {
    var i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
  }

  function summary(obs, today) {
    var eps = episodes(obs), cyc = cycles(eps), usable = cyc.filter(function (c) { return c.usable; }).slice(-12);
    var lens = usable.map(function (c) { return c.length; }), last = eps[eps.length - 1] || null;
    var res = { episodes: eps, cycles: cyc, lengths: lens, lastStart: last ? last.start : null, cycleDay: null,
      inPeriod: false, range: null, label: 'not enough data yet', status: 'none', late: 0, phase: null };
    if (!last) return res;
    res.cycleDay = diff(last.start, today) + 1;
    res.inPeriod = diff(last.end, today) <= 1 && res.cycleDay <= 10;
    var periodLens = eps.slice(-6).map(function (e) { return e.days; }), periodLen = Math.round(periodLens.reduce(function (a, b) { return a + b; }, 0) / periodLens.length);
    res.periodLength = periodLen;
    var lo, hi;
    if (!lens.length) { res.status = 'few'; res.label = 'not enough data yet'; }
    else if (lens.length < 3) {
      lo = Math.min.apply(null, lens) - 5; hi = Math.max.apply(null, lens) + 5;
      res.status = 'early'; res.label = 'early guess, wide range, fewer than 3 cycles';
    } else {
      var s = lens.slice().sort(function (a, b) { return a - b; }), med = pct(s, 0.5);
      lo = Math.floor(pct(s, 0.1)); hi = Math.ceil(pct(s, 0.9));
      if (lens.length < 6) { lo -= 2; hi += 2; }
      lo = Math.min(lo, Math.floor(med) - 2); hi = Math.max(hi, Math.ceil(med) + 2);
      res.status = 'ok';
      res.label = (lens.length < 6 ? 'rough estimate' : hi - lo <= 6 ? 'fairly steady' : 'varies a fair bit') + ', from ' + lens.length + ' cycles';
    }
    if (lo != null) {
      lo = Math.max(lo, 15);
      res.range = { from: addDays(last.start, lo), to: addDays(last.start, hi), lo: lo, hi: hi };
      if (today > res.range.to && !res.inPeriod) res.late = diff(res.range.to, today);
    }
    res.phase = phaseOf(res);
    return res;
  }

  /* a rough phase name for the ring. It is a guess from dates alone, never a fertile window */
  function phaseOf(r) {
    if (!r.lastStart) return null;
    if (r.inPeriod) return 'period';
    if (r.late) return 'later than the range';
    if (!r.range) return r.cycleDay <= (r.periodLength || 5) + 2 ? 'just after your period' : 'no estimate yet';
    var mid = Math.round((r.range.lo + r.range.hi) / 2), ov = mid - 14, d = r.cycleDay;
    if (d <= (r.periodLength || 5)) return 'end of your period';
    if (d < ov - 2) return 'after your period';
    if (d <= ov + 2) return 'mid-cycle (rough guess)';
    return 'before your period';
  }

  function fmt(s) {
    var d = toDate(s); return d.getDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  }
  function lateLine(r) {
    return 'Your period hasn’t been logged yet, and it is ' + r.late + ' day' + (r.late === 1 ? '' : 's') + ' past the range I estimated. Cycles shift for lots of everyday reasons. Log it whenever it comes, and if anything worries you, a clinic can help.';
  }
  function nextLine(r) {
    if (!r.lastStart) return 'Not enough data yet. Once you log a period start, I’ll begin counting.';
    if (r.late) return lateLine(r);
    if (!r.range) return 'Not enough data yet: I need at least two period starts to guess the next one. Your last period started ' + fmt(r.lastStart) + '.';
    return 'Next period: likely between ' + fmt(r.range.from) + ' and ' + fmt(r.range.to) + ' (' + r.label + '). This is an estimate, not for contraception.';
  }

  /* ask-the-chart: plain answers from what she has logged */
  function answer(q, obs, today) {
    var t = String(q || '').toLowerCase(), r = summary(obs, today), m;
    if (/\bcycles?\b/.test(t) && /\b(long|length|lengths|last)\b/.test(t)) {
      var n = (m = t.match(/\blast (\d+|two|three|four|five|six|seven|eight|nine|ten|twelve)\b/)) ? ({ two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 }[m[1]] || +m[1]) : 6;
      var cs = r.cycles.slice(-n);
      if (!cs.length) return 'Not enough data yet: a cycle length needs two logged period starts.';
      var parts = cs.map(function (c) { return fmt(c.start) + ': ' + c.length + ' days' + (c.usable ? '' : ' (long gap, maybe not logged)'); });
      var use = cs.filter(function (c) { return c.usable; }).map(function (c) { return c.length; });
      var avg = use.length ? Math.round(use.reduce(function (a, b) { return a + b; }, 0) / use.length) : null;
      return 'Your last ' + cs.length + ' cycle' + (cs.length === 1 ? '' : 's') + (cs.length < n ? ' (all I have)' : '') + ': ' + parts.join('; ') + '.' + (avg ? ' Average ' + avg + ' days.' : '');
    }
    if (/\bperiods?\b/.test(t) && /\b(how long|length|how many days|last for|lasts?)\b/.test(t)) {
      var eps = r.episodes.slice(-6);
      if (!eps.length) return 'No periods logged yet.';
      return 'Your last ' + eps.length + ' period' + (eps.length === 1 ? '' : 's') + ': ' + eps.map(function (e) { return fmt(e.start) + ' (' + e.days + ' day' + (e.days === 1 ? '' : 's') + ')'; }).join(', ') + '.';
    }
    if (/\b(next|when will|due|coming|expect)\b/.test(t) || /\blate\b/.test(t)) return nextLine(r);
    if (/\b(what day|which day|cycle day|day of my cycle|day am i)\b/.test(t)) return r.lastStart ? 'Day ' + r.cycleDay + ' of this cycle (counting from ' + fmt(r.lastStart) + ').' : 'Not enough data yet. Log a period start and I’ll count from there.';
    if (/\blast period\b|\bwhen did\b/.test(t)) return r.lastStart ? 'Your last period started ' + fmt(r.lastStart) + '.' : 'No periods logged yet.';
    if (/\bhow many\b/.test(t)) return 'You have logged ' + r.episodes.length + ' period' + (r.episodes.length === 1 ? '' : 's') + ' and ' + r.cycles.length + ' full cycle' + (r.cycles.length === 1 ? '' : 's') + '.';
    return 'I can answer things like “how long were my last 6 cycles?”, “when is my next period?”, “how long are my periods?” or “what day of my cycle is it?”.';
  }

  root.EbbCycle = { byDay: byDay, episodes: episodes, cycles: cycles, summary: summary, answer: answer, nextLine: nextLine, fmt: fmt, addDays: addDays, diff: diff, PERIOD: PERIOD };
})(typeof window !== 'undefined' ? window : globalThis);
