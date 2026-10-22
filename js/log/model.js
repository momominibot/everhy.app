/* Ebb log records: confirmed observations with provenance under state.log. Edits keep a history, "undo" retracts the
 * last confirmed write for 24 hours, and nothing here touches game progress (no rewards for logging). */
(function (root) {
  'use strict';
  var KEEP_THREAD = 300, UNDO_MS = 24 * 3600 * 1000;
  var FIELDS = ['type', 'value', 'unit', 'location', 'start', 'end', 'negated', 'hedged', 'estimated'];

  function ensure(st) {
    if (!st.log || typeof st.log !== 'object') st.log = {};
    var L = st.log;
    if (!Array.isArray(L.obs)) L.obs = [];
    if (!Array.isArray(L.thread)) L.thread = [];
    if (!Array.isArray(L.batches)) L.batches = [];
    L.v = 1;
    return L;
  }
  function uid(p) { return (p || 'o') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function tz() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local'; } catch (e) { return 'local'; } }
  function nowIso(ms) { return new Date(ms == null ? Date.now() : ms).toISOString(); }

  function activeObs(st) { return ensure(st).obs.filter(function (o) { return o.confirmed && !o.retracted; }); }

  /* confirm a card: every item becomes an observation tied to one batch, so one "undo" removes the whole card */
  function confirm(st, items, meta) {
    var L = ensure(st), at = nowIso(meta && meta.now), batch = { id: uid('b'), at: at, obs: [], source: (meta && meta.source) || 'chat' };
    var made = (items || []).map(function (it) {
      var o = { id: uid('o'), batch: batch.id, created: at, tz: tz(), confirmed: true, history: [],
        source: batch.source, sourceText: String((meta && meta.text) || it.clause || '').slice(0, 280),
        confidence: typeof it.confidence === 'number' ? it.confidence : 0.9 };
      FIELDS.forEach(function (k) { if (it[k] !== undefined) o[k] = it[k]; });
      if (o.unit === undefined) o.unit = null;
      if (!o.end) o.end = o.start;
      return o;
    });
    made.forEach(function (o) { L.obs.push(o); batch.obs.push(o.id); });
    if (made.length) L.batches.push(batch);
    if (L.batches.length > 200) L.batches = L.batches.slice(-200);
    return made;
  }

  function edit(st, id, patch, meta) {
    var L = ensure(st), o = L.obs.filter(function (x) { return x.id === id; })[0];
    if (!o) return null;
    var before = {};
    FIELDS.concat(['confidence']).forEach(function (k) { if (k in patch) before[k] = o[k]; });
    o.history.push({ at: nowIso(meta && meta.now), by: (meta && meta.source) || 'chat', before: before });
    Object.keys(patch).forEach(function (k) { if (FIELDS.indexOf(k) >= 0 || k === 'confidence') o[k] = patch[k]; });
    if (!o.end || o.end < o.start) o.end = o.start;
    o.updated = nowIso(meta && meta.now);
    return o;
  }

  function undo(st, nowMs) {
    var L = ensure(st), now = nowMs == null ? Date.now() : nowMs;
    for (var i = L.batches.length - 1; i >= 0; i--) {
      var b = L.batches[i];
      if (b.undone) continue;
      if (now - Date.parse(b.at) > UNDO_MS) return { ok: false, reason: 'expired', batch: b };
      var n = 0;
      L.obs.forEach(function (o) { if (b.obs.indexOf(o.id) >= 0 && !o.retracted) { o.retracted = nowIso(now); n++; } });
      b.undone = nowIso(now);
      return { ok: true, count: n, batch: b };
    }
    return { ok: false, reason: 'nothing' };
  }

  /* "same as yesterday": yesterday's active entries, offered again for today as a card she still has to confirm */
  function sameAsYesterday(st, today, yesterday) {
    return activeObs(st).filter(function (o) { return o.start <= yesterday && (o.end || o.start) >= yesterday && o.type !== 'checkin' && o.type !== 'sleep' && o.type !== 'sleepQuality'; })
      .map(function (o) {
        return { type: o.type, value: o.value, unit: o.unit, location: o.location, start: today, end: today, negated: !!o.negated,
          hedged: !!o.hedged, estimated: !!o.estimated, confidence: o.confidence, clause: 'same as yesterday' };
      });
  }

  /* the calendar's edit for one day: replace that day's own bleeding entry, or add one that overrides a range */
  function setBleeding(st, day, value, meta) {
    var L = ensure(st), own = activeObs(st).filter(function (o) { return o.type === 'bleeding' && o.start === day && (o.end || o.start) === day; });
    var covered = activeObs(st).some(function (o) { return o.type === 'bleeding' && o.start <= day && (o.end || o.start) >= day && own.indexOf(o) < 0; });
    if (value === 'clear') {
      own.forEach(function (o) { o.retracted = nowIso(meta && meta.now); o.history.push({ at: o.retracted, by: 'calendar', before: { value: o.value } }); });
      if (covered) return confirm(st, [{ type: 'bleeding', value: 'unknown', start: day, end: day, confidence: 1 }], { source: 'calendar', text: 'cleared on calendar', now: meta && meta.now });
      return own;
    }
    if (own.length) { own.slice(1).forEach(function (o) { o.retracted = nowIso(meta && meta.now); }); return [edit(st, own[0].id, { value: value, confidence: 1 }, { source: 'calendar', now: meta && meta.now })]; }
    return confirm(st, [{ type: 'bleeding', value: value, start: day, end: day, confidence: 1 }], { source: 'calendar', text: 'set on calendar', now: meta && meta.now });
  }

  function say(st, who, text, extra) {
    var L = ensure(st), m = { who: who, text: String(text), at: nowIso() };
    if (extra) Object.keys(extra).forEach(function (k) { m[k] = extra[k]; });
    L.thread.push(m);
    if (L.thread.length > KEEP_THREAD) L.thread = L.thread.slice(-KEEP_THREAD);
    return m;
  }

  root.EbbLogModel = { ensure: ensure, confirm: confirm, edit: edit, undo: undo, sameAsYesterday: sameAsYesterday, setBleeding: setBleeding, activeObs: activeObs, say: say, UNDO_MS: UNDO_MS };
})(typeof window !== 'undefined' ? window : globalThis);
