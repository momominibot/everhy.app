/* Ebb course rules, pure and testable in node: how weeks open, how the practice timer counts, what a saved record
 * holds, and the plain monthly summary. Weeks open by the calendar and her choice, never by streaks or counts:
 * the next week becomes available seven days after she began the current one, and only opens when she chooses it.
 * Missing days never closes or resets anything. */
(function (root) {
  'use strict';
  var C = root.EbbCourseContent;
  var WEEKS = 8, GAP_DAYS = 7, MAX_STEP_MS = 1500;

  /* ---------- dates as YYYY-MM-DD strings, local calendar ---------- */
  function addDays(day, n) {
    var p = day.split('-').map(Number), d = new Date(p[0], p[1] - 1, p[2] + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /* ---------- course progression ---------- */
  function fresh() { return { v: 1, started: null, weekReached: 0, weekBegan: {}, stopped: null, summaryOptIn: false, notes: {}, voice: 'erin' }; }
  function clean(c) {
    var f = fresh();
    if (!c || typeof c !== 'object') return f;
    var out = Object.assign(f, c);
    out.weekReached = Math.max(0, Math.min(WEEKS, Math.floor(Number(out.weekReached) || 0)));
    if (!out.weekBegan || typeof out.weekBegan !== 'object') out.weekBegan = {};
    if (!out.notes || typeof out.notes !== 'object') out.notes = {};
    out.summaryOptIn = out.summaryOptIn === true;
    out.voice = out.voice === 'off' ? 'off' : 'erin';
    return out;
  }
  function start(c, today) {
    if (c.started) { c.stopped = null; return c; } /* starting again keeps the week she reached */
    c.started = today; c.weekReached = 1; c.weekBegan = { 1: today }; c.stopped = null;
    return c;
  }
  function active(c) { return !!c.started && !c.stopped; }
  function isOpen(c, week) { return !!c.started && week >= 1 && week <= c.weekReached; }
  function nextOpensOn(c) {
    if (!c.started || c.weekReached >= WEEKS) return null;
    return addDays(c.weekBegan[c.weekReached] || c.started, GAP_DAYS);
  }
  function canBeginNext(c, today) { var d = nextOpensOn(c); return active(c) && d !== null && today >= d; }
  function beginNext(c, today) {
    if (!canBeginNext(c, today)) return false;
    c.weekReached += 1; c.weekBegan[c.weekReached] = today;
    return true;
  }
  function stop(c, today) { if (c.started) c.stopped = today; return c; }
  function weekState(c, week, today) {
    if (isOpen(c, week)) return week === c.weekReached ? 'current' : 'open';
    if (week === c.weekReached + 1 && c.started) return canBeginNext(c, today) ? 'ready' : 'soon';
    return 'later';
  }
  /* practices she can choose now: those of every week reached, current week first, no repeats */
  function openPractices(c) {
    var out = [];
    for (var w = c.weekReached; w >= 1; w--) C.WEEKS[w - 1].practices.forEach(function (id) { if (out.indexOf(id) < 0) out.push(id); });
    return out;
  }
  /* the bedroom cushion opens the course runner only while the course is running */
  function cushionMode(c) { return active(c) ? 'course' : 'classic'; }

  /* ---------- practice timer: counts only running, visible time ---------- */
  function timer(plannedSec) { return { planned: plannedSec, activeMs: 0, paused: false, hidden: false, ended: false, last: null }; }
  function counting(t) { return !t.paused && !t.hidden && !t.ended; }
  function advance(t, now) {
    if (counting(t) && t.last !== null) t.activeMs += Math.max(0, Math.min(MAX_STEP_MS, now - t.last));
    t.last = now;
    if (t.activeMs >= t.planned * 1000) { t.activeMs = t.planned * 1000; t.ended = true; }
    return t;
  }
  function pause(t, now) { advance(t, now); t.paused = true; return t; }
  function resume(t, now) { t.paused = false; t.last = now; return t; }
  function setHidden(t, hidden, now) { advance(t, now); t.hidden = !!hidden; t.last = now; return t; }
  function end(t, now) { advance(t, now); t.ended = true; return t; }
  function activeSec(t) { return Math.floor(t.activeMs / 1000); }
  function finished(t) { return t.activeMs >= t.planned * 1000 - 999; }
  function leftSec(t) { return Math.max(0, t.planned - activeSec(t)); }

  /* which caption shows: the last cue whose start fraction has been reached */
  function cuesFor(id, variant) { var p = C.PRACTICES[id]; return variant === 'seated' && p.seated ? p.seated : p.cues; }
  function cueAt(cues, t) {
    var f = t.planned ? t.activeMs / 1000 / t.planned : 0, i = 0;
    cues.forEach(function (c, k) { if (c[0] <= f) i = k; });
    return i;
  }

  /* Erin's voice is optional: a clip plays only for its exact caption, so a re-written cue never gets stale audio */
  function clipFor(voice, text) { var c = voice && voice.clips && Object.prototype.hasOwnProperty.call(voice.clips, text) ? voice.clips[text] : null; return c && c.src ? c.src : null; }

  /* ---------- the saved observation ---------- */
  function record(id, opts, t, startIso, endIso) {
    var p = C.PRACTICES[id];
    return {
      practice: id, anchor: opts.anchor || p.anchor, scriptVersion: C.VERSION + (opts.variant === 'seated' ? '/seated' : ''),
      plannedSec: t.planned, activeSec: activeSec(t), status: finished(t) ? 'finished' : 'partial',
      start: startIso, end: endIso, source: 'course'
    };
  }

  /* ---------- history and the opt-in monthly summary: counts in plain words, no score, no streak ---------- */
  function minutesText(sec) { return sec < 60 ? 'under a minute' : 'about ' + Math.round(sec / 60) + ' min'; }
  function practices(observations) {
    return (observations || []).filter(function (o) { return o && o.type === 'mindfulness'; })
      .slice().sort(function (a, b) { return String(b.start || b.date).localeCompare(String(a.start || a.date)); });
  }
  function monthSummary(observations, month) {
    var days = {}, sec = 0, fin = 0, part = 0;
    practices(observations).forEach(function (o) {
      if (String(o.date).slice(0, 7) !== month) return;
      days[o.date] = true; sec += Math.max(0, Number(o.activeSec) || 0);
      if (o.status === 'finished') fin++; else part++;
    });
    return { month: month, days: Object.keys(days).length, minutes: Math.round(sec / 60), finished: fin, partial: part };
  }
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function summaryText(s) {
    var name = MONTHS[Number(s.month.slice(5, 7)) - 1] || s.month;
    if (!s.days) return 'No practices saved in ' + name + ' yet. That is fine.';
    var plural = function (n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); };
    return 'In ' + name + ' you practised on ' + plural(s.days, 'day') + ', ' + (s.minutes ? 'about ' + plural(s.minutes, 'minute') : 'under a minute') + ' in all. ' +
      (s.finished ? plural(s.finished, 'practice') : 'None') + ' ran to the end and ' + s.partial + ' ended early. Ending early is part of practice too.';
  }

  root.EbbCourse = {
    WEEKS: WEEKS, GAP_DAYS: GAP_DAYS, MAX_STEP_MS: MAX_STEP_MS, addDays: addDays,
    fresh: fresh, clean: clean, start: start, active: active, isOpen: isOpen, nextOpensOn: nextOpensOn, canBeginNext: canBeginNext,
    beginNext: beginNext, stop: stop, weekState: weekState, openPractices: openPractices, cushionMode: cushionMode,
    timer: timer, counting: counting, advance: advance, pause: pause, resume: resume, setHidden: setHidden, end: end, activeSec: activeSec,
    finished: finished, leftSec: leftSec, cuesFor: cuesFor, cueAt: cueAt, clipFor: clipFor, record: record,
    minutesText: minutesText, practices: practices, monthSummary: monthSummary, summaryText: summaryText
  };
})(typeof window !== 'undefined' ? window : globalThis);
