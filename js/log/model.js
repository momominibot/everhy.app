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
  /* every write is one batch with its own undo record: entries it added, entries it changed (with the values before)
   * and entries it removed. "undo" reverses the most recent batch, whatever made it (chat, chip or calendar) */
  function newBatch(L, meta) {
    var b = { id: uid('b'), at: nowIso(meta && meta.now), source: (meta && meta.source) || 'chat', obs: [], edits: [], retracts: [] };
    return b;
  }
  function commit(L, b) {
    if (b.obs.length || b.edits.length || b.retracts.length) L.batches.push(b);
    if (L.batches.length > 200) L.batches = L.batches.slice(-200);
  }
  function make(L, b, it, meta) {
    var o = { id: uid('o'), batch: b.id, created: b.at, tz: tz(), confirmed: true, history: [], source: b.source,
      sourceText: String((meta && meta.text) || it.clause || '').slice(0, 280),
      confidence: typeof it.confidence === 'number' ? it.confidence : 0.9 };
    FIELDS.forEach(function (k) { if (it[k] !== undefined) o[k] = it[k]; });
    if (o.unit === undefined) o.unit = null;
    if (!o.end) o.end = o.start;
    if (o.type === 'note') o.value = String(o.value || '').slice(0, 2000);
    L.obs.push(o); b.obs.push(o.id);
    return o;
  }
  function change(L, b, o, patch) {
    var before = {};
    FIELDS.concat(['confidence', 'updated']).forEach(function (k) { if (k in patch || k === 'updated') before[k] = o[k]; });
    b.edits.push({ id: o.id, before: before });
    o.history.push({ at: b.at, by: b.source, before: before });
    Object.keys(patch).forEach(function (k) { if (FIELDS.indexOf(k) >= 0 || k === 'confidence') o[k] = patch[k]; });
    if (!o.end || o.end < o.start) o.end = o.start;
    o.updated = b.at;
    return o;
  }
  function retract(b, o) { o.retracted = b.at; b.retracts.push(o.id); o.history.push({ at: b.at, by: b.source, before: { retracted: null } }); }

  /* confirm a card: every item becomes an observation tied to one batch, so one "undo" removes the whole card */
  function confirm(st, items, meta) {
    var L = ensure(st), b = newBatch(L, meta);
    var made = (items || []).map(function (it) { return make(L, b, it, meta); });
    commit(L, b);
    return made;
  }

  function edit(st, id, patch, meta) {
    var L = ensure(st), o = L.obs.filter(function (x) { return x.id === id; })[0];
    if (!o) return null;
    var b = newBatch(L, meta); change(L, b, o, patch); commit(L, b);
    return o;
  }

  function undo(st, nowMs) {
    var L = ensure(st), now = nowMs == null ? Date.now() : nowMs, byId = {};
    L.obs.forEach(function (o) { byId[o.id] = o; });
    for (var i = L.batches.length - 1; i >= 0; i--) {
      var b = L.batches[i];
      if (b.undone) continue;
      if (now - Date.parse(b.at) > UNDO_MS) return { ok: false, reason: 'expired', batch: b };
      var n = 0, at = nowIso(now);
      (b.obs || []).forEach(function (id) { var o = byId[id]; if (o && !o.retracted) { o.retracted = at; n++; } });
      (b.edits || []).slice().reverse().forEach(function (e) { var o = byId[e.id]; if (o) { Object.keys(e.before).forEach(function (k) { o[k] = e.before[k]; }); o.history.push({ at: at, by: 'undo', before: {} }); n++; } });
      (b.retracts || []).forEach(function (id) { var o = byId[id]; if (o) { delete o.retracted; n++; } });
      b.undone = at;
      return { ok: true, count: n, batch: b };
    }
    return { ok: false, reason: 'nothing' };
  }

  /* the entry that counts for one day: the most recent confirmed one (ranges cover each day they span) */
  function latestOn(st, day, pred) {
    var best = null;
    activeObs(st).forEach(function (o) {
      if (o.start <= day && (o.end || o.start) >= day && pred(o) && (!best || (o.updated || o.created) >= (best.updated || best.created))) best = o;
    });
    return best;
  }

  /* "same as yesterday": yesterday's effective entries, offered again for today as a card she still has to confirm */
  var SINGLE = { bleeding: 1, pain: 1, energy: 1, mucus: 1, sensation: 1, clots: 1 };
  function sameAsYesterday(st, today, yesterday) {
    var keep = {};
    activeObs(st).forEach(function (o) {
      if (!(o.start <= yesterday && (o.end || o.start) >= yesterday) || /^(checkin|sleep|sleepQuality|temperature|note)$/.test(o.type)) return;
      var k = o.type + '|' + (SINGLE[o.type] ? '' : o.value);
      if (!keep[k] || (o.updated || o.created) >= (keep[k].updated || keep[k].created)) keep[k] = o;
    });
    return Object.keys(keep).map(function (k) { return keep[k]; }).filter(function (o) { return !(o.type === 'bleeding' && o.value === 'unknown'); })
      .map(function (o) {
        return { type: o.type, value: o.value, unit: o.unit, location: o.location, start: today, end: today, negated: !!o.negated,
          hedged: !!o.hedged, estimated: !!o.estimated, confidence: o.confidence, clause: 'same as yesterday' };
      });
  }

  /* the calendar's edit for one day, as one undoable batch: replace that day's own bleeding entry, or add one that
   * overrides a range ("since Tuesday") for that day only */
  function setBleeding(st, day, value, meta) {
    var L = ensure(st), m = { source: 'calendar', now: meta && meta.now, text: meta && meta.text };
    var b = newBatch(L, m), isB = function (o) { return o.type === 'bleeding'; };
    var own = activeObs(st).filter(function (o) { return isB(o) && o.start === day && (o.end || o.start) === day; });
    var covered = activeObs(st).some(function (o) { return isB(o) && o.start <= day && (o.end || o.start) >= day && own.indexOf(o) < 0; });
    var out = [];
    if (value === 'clear') {
      own.forEach(function (o) { retract(b, o); });
      if (covered) out.push(make(L, b, { type: 'bleeding', value: 'unknown', start: day, end: day, confidence: 1 }, { text: 'cleared on calendar' }));
    } else if (own.length) {
      own.slice(1).forEach(function (o) { retract(b, o); });
      out.push(change(L, b, own[0], { value: value, confidence: 1, hedged: false }));
    } else out.push(make(L, b, { type: 'bleeding', value: value, start: day, end: day, confidence: 1 }, { text: 'set on calendar' }));
    commit(L, b);
    return out;
  }

  function say(st, who, text, extra) {
    var L = ensure(st), m = { who: who, text: String(text), at: nowIso() };
    if (extra) Object.keys(extra).forEach(function (k) { m[k] = extra[k]; });
    L.thread.push(m);
    if (L.thread.length > KEEP_THREAD) L.thread = L.thread.slice(-KEEP_THREAD);
    return m;
  }

  root.EbbLogModel = { latestOn: latestOn, ensure: ensure, confirm: confirm, edit: edit, undo: undo, sameAsYesterday: sameAsYesterday, setBleeding: setBleeding, activeObs: activeObs, say: say, UNDO_MS: UNDO_MS };
})(typeof window !== 'undefined' ? window : globalThis);
