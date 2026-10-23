/* Ebb settings core: preferences, the nudge rule, the three exports and delete-everything. Pure apart from the
 * deleteEverything helper, which is handed its storage, caches and worker so the node harness can check it.
 * Exports belong to the person: nothing here sends data anywhere, and observations keep their own provenance. */
(function (root) {
  'use strict';

  var DEFAULTS = { nudgesPerDay: 1, quietFrom: '21:00', quietTo: '08:00', motion: 'system', textSize: 'normal' };
  var MOTION = ['system', 'reduce'], TEXT = ['normal', 'large', 'larger'];

  function hhmm(v, fallback) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v)) ? String(v) : fallback; }
  /* stored preferences can be old, partial or hand-edited: keep only known keys with valid values */
  function cleanPrefs(p) {
    p = p && typeof p === 'object' ? p : {};
    var n = Math.round(Number(p.nudgesPerDay));
    return {
      nudgesPerDay: isFinite(n) && n >= 0 ? Math.min(3, n) : DEFAULTS.nudgesPerDay,
      quietFrom: hhmm(p.quietFrom, DEFAULTS.quietFrom), quietTo: hhmm(p.quietTo, DEFAULTS.quietTo),
      motion: MOTION.indexOf(p.motion) >= 0 ? p.motion : DEFAULTS.motion,
      textSize: TEXT.indexOf(p.textSize) >= 0 ? p.textSize : DEFAULTS.textSize,
      nudgeLog: p.nudgeLog && typeof p.nudgeLog === 'object' && typeof p.nudgeLog.date === 'string'
        ? { date: p.nudgeLog.date, count: Math.max(0, Number(p.nudgeLog.count) || 0) } : { date: '', count: 0 }
    };
  }

  function minutes(t) { var a = t.split(':'); return Number(a[0]) * 60 + Number(a[1]); }
  function localDay(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  /* quiet hours may cross midnight (21:00 to 08:00); equal ends mean no quiet hours */
  function inQuiet(prefs, d) {
    var p = cleanPrefs(prefs), from = minutes(p.quietFrom), to = minutes(p.quietTo), now = d.getHours() * 60 + d.getMinutes();
    if (from === to) return false;
    return from < to ? now >= from && now < to : now >= from || now < to;
  }
  /* other workstreams ask before showing a nudge, then record it; the cap counts per local day */
  function mayNudge(prefs, d) {
    var p = cleanPrefs(prefs);
    if (p.nudgesPerDay === 0 || inQuiet(p, d)) return false;
    var used = p.nudgeLog.date === localDay(d) ? p.nudgeLog.count : 0;
    return used < p.nudgesPerDay;
  }
  function noteNudge(prefs, d) {
    var p = cleanPrefs(prefs), day = localDay(d);
    p.nudgeLog = { date: day, count: (p.nudgeLog.date === day ? p.nudgeLog.count : 0) + 1 };
    return p;
  }

  /* ---------- exports ---------- */
  var FIRST = ['id', 'type', 'date', 'start', 'end', 'status', 'practice', 'anchor', 'plannedSec', 'activeSec', 'scriptVersion', 'source', 'confirmed'];
  function csvCell(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') v = JSON.stringify(v);
    var s = String(v);
    /* a typed value starting with = + - @ would run as a formula in a spreadsheet; numbers are left alone */
    if (typeof v === 'string' && /^[=+\-@\t\r\n]/.test(s)) s = "'" + s;
    return /[",\r\n]|^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function observationsCsv(obs) {
    obs = Array.isArray(obs) ? obs : [];
    var cols = FIRST.slice();
    obs.forEach(function (o) { Object.keys(o || {}).forEach(function (k) { if (cols.indexOf(k) < 0) cols.push(k); }); });
    var used = cols.filter(function (c) { return obs.some(function (o) { return o && o[c] !== undefined; }); });
    if (!used.length) used = FIRST.slice();
    var lines = [used.map(csvCell).join(',')];
    obs.forEach(function (o) { lines.push(used.map(function (c) { return csvCell(o ? o[c] : ''); }).join(',')); });
    return lines.join('\r\n') + '\r\n';
  }

  /* a stable uuid-shaped id from the record id, so a second export of the same data gives the same fullUrls */
  function uuidFor(s) {
    var h = [0x811c9dc5, 0x01000193, 0x6b43a9b5, 0x9e3779b9];
    for (var i = 0; i < s.length; i++) for (var k = 0; k < 4; k++) { h[k] ^= s.charCodeAt(i) + k; h[k] = Math.imul(h[k], 16777619 + k * 2) >>> 0; }
    var hex = h.map(function (x) { return ('00000000' + x.toString(16)).slice(-8); }).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-4' + hex.slice(13, 16) + '-' + ((parseInt(hex[16], 16) & 3) | 8).toString(16) + hex.slice(17, 20) + '-' + hex.slice(20, 32);
  }
  /* placeholder namespace for Ebb's own codes (example.org is reserved for examples); swap for the operator's own
   * namespace before any clinical exchange. No LOINC or SNOMED code is claimed for a practice. */
  var EBB = 'http://example.org/ebb/fhir/';
  function sec(v) { return { value: Number(v) || 0, unit: 's', system: 'http://unitsofmeasure.org', code: 's' }; }
  function component(code, value) {
    var c = { code: { coding: [{ system: EBB + 'CodeSystem/observation-part', code: code }], text: code } };
    if (typeof value === 'number') c.valueQuantity = /Sec$/.test(code) ? sec(value) : { value: value };
    else if (typeof value === 'boolean') c.valueBoolean = value;
    else c.valueString = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return c;
  }
  /* FHIR prep: standard LOINC codes where one exists for what Ebb records (each checked on NLM's LOINC lookup,
   * clinicaltables.nlm.nih.gov, 23 Oct 2026). The rest keep Ebb's own code until they are mapped (SNOMED CT) for a real
   * exchange. unit: UCUM for numeric values. lmp is the profile's last period start, exported as its own record. */
  var LOINC = 'http://loinc.org', UCUM = 'http://unitsofmeasure.org';
  var STANDARD = {
    lmp: { code: '8665-2', display: 'Last menstrual period start date' },
    sleep: { code: '93832-4', display: 'Sleep duration', unit: 'h' },
    temperature: { code: '8310-5', display: 'Body temperature', unit: 'Cel' },
    mood: { code: '80296-7', display: 'Patient Mood' },
    stress: { code: '93038-8', display: 'Stress level' },
    painScore: { code: '72514-3', display: 'Pain severity - 0-10 verbal numeric rating [Score] - Reported', unit: '{score}' },
    steps: { code: '41950-7', display: 'Number of steps in 24 hour Measured', unit: '/d' },
    exercise: { code: '55411-3', display: 'Exercise duration', unit: 'min' }
  };
  var SELF_REPORTED = ['bleeding', 'clots', 'pain', 'painScore', 'sensation', 'symptom', 'temperature', 'mucus', 'mood', 'stress', 'energy', 'sleep', 'sleepQuality', 'note', 'lmp', 'steps', 'exercise', 'food'];
  var CORE = ['id', 'type', 'date', 'start', 'end', 'source', 'confirmed', 'activeSec', 'value', 'unit'];
  function observationResource(o) {
    var id = String(o.id || ''), type = String(o.type || 'observation');
    var r = {
      resourceType: 'Observation', id: id.replace(/[^A-Za-z0-9\-.]/g, '-').slice(0, 64) || undefined,
      meta: { source: EBB + 'source/' + encodeURIComponent(String(o.source || 'unknown')) },
      identifier: [{ system: EBB + 'observation-id', value: id }],
      status: o.confirmed === true ? 'final' : o.confirmed === false ? 'preliminary' : 'unknown',
      category: [{ coding: [SELF_REPORTED.indexOf(type) >= 0
        ? { system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'survey', display: 'Survey' }
        : { system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'activity', display: 'Activity' }] }],
      code: { coding: [{ system: EBB + 'CodeSystem/observation-type', code: type }], text: type === 'mindfulness' ? 'Mindfulness practice' : type }
    };
    var std = STANDARD[type];
    if (std) { r.code.coding.push({ system: LOINC, code: std.code, display: std.display }); r.code.text = std.display; }
    /* the value itself: a number with its UCUM unit, a date, or the words she chose */
    if (o.value !== undefined && o.value !== null && type !== 'mindfulness') {
      var unit = (std && std.unit) || (o.unit ? String(o.unit) : null);
      if (typeof o.value === 'number' && isFinite(o.value)) r.valueQuantity = unit ? { value: o.value, unit: unit, system: UCUM, code: unit } : { value: o.value };
      else if (type === 'lmp') r.valueDateTime = String(o.value);
      else r.valueString = String(o.value);
    }
    if (o.start && o.end) r.effectivePeriod = { start: o.start, end: o.end };
    else if (o.start || o.date) r.effectiveDateTime = o.start || o.date;
    if (typeof o.activeSec === 'number' && isFinite(o.activeSec) && !r.valueQuantity) r.valueQuantity = sec(o.activeSec);
    var parts = Object.keys(o).filter(function (k) { return CORE.indexOf(k) < 0 && o[k] !== null && o[k] !== undefined; });
    if (parts.length) r.component = parts.map(function (k) { return component(k, o[k]); });
    return r;
  }
  /* every record she owns, for the FHIR export: finished and partial practices, every log entry she has not taken back,
   * and the profile's last period start */
  function recordsFor(save) {
    save = save || {};
    var out = (Array.isArray(save.observations) ? save.observations : []).slice();
    var logs = save.log && Array.isArray(save.log.obs) ? save.log.obs : [];
    logs.forEach(function (o) { if (o && !o.retracted) out.push(o); });
    var p = save.profile || {};
    if (p.lastPeriodStart) out.push({ id: 'profile-lmp', type: 'lmp', value: p.lastPeriodStart, date: p.lastPeriodStart, source: 'profile', confirmed: true });
    return out;
  }
  function observationsFhir(obs, now) {
    obs = Array.isArray(obs) ? obs.filter(function (o) { return o && typeof o === 'object'; }) : [];
    var stamp = (now || new Date()).toISOString(), entry = [];
    obs.forEach(function (o) {
      var oid = 'urn:uuid:' + uuidFor('obs:' + o.id), pid = 'urn:uuid:' + uuidFor('prov:' + o.id);
      entry.push({ fullUrl: oid, resource: observationResource(o) });
      entry.push({ fullUrl: pid, resource: {
        resourceType: 'Provenance', target: [{ reference: oid }], recorded: o.end || o.start || stamp,
        activity: { text: 'Recorded in Ebb (' + String(o.source || 'unknown') + ')' },
        agent: [
          { type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/provenance-participant-type', code: 'author' }] },
            who: { display: o.confirmed === true ? 'The person, confirmed in the app' : o.confirmed === false ? 'Not confirmed by the person' : 'Confirmation not recorded' } },
          { type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/provenance-participant-type', code: 'assembler' }] },
            who: { display: 'Ebb app, script ' + String(o.scriptVersion || 'n/a') } }]
      } });
    });
    var b = { resourceType: 'Bundle', type: 'collection', timestamp: stamp, meta: { tag: [{ code: 'ebb-export', display: 'Exported by the person from Ebb' }] } };
    if (entry.length) b.entry = entry; /* FHIR JSON allows no empty arrays */
    return b;
  }

  /* everything: the save as stored, plus any other keys this app keeps on the device */
  function exportAll(save, storage, now) {
    var extra = {};
    try {
      for (var i = 0; storage && i < storage.length; i++) {
        var k = storage.key(i);
        if (k && /^ebb/i.test(k) && k !== 'ebb_save_v1') extra[k] = storage.getItem(k);
      }
    } catch (e) { /* storage blocked: the save in memory is still exported */ }
    return { app: 'Ebb', format: 'ebb-export-1', exportedAt: (now || new Date()).toISOString(), save: save, otherKeys: extra };
  }

  /* ---------- delete everything ---------- */
  function deleteEverything(env) {
    var done = [];
    try { env.store.reset(); done.push('save'); } catch (e) { }
    try {
      var keys = [];
      for (var i = 0; env.storage && i < env.storage.length; i++) { var k = env.storage.key(i); if (k && /^ebb/i.test(k)) keys.push(k); }
      keys.forEach(function (k) { env.storage.removeItem(k); });
      done.push('storage');
    } catch (e) { }
    var waits = [];
    if (env.caches) waits.push(env.caches.keys().then(function (ks) {
      return Promise.all(ks.filter(function (k) { return /^ebb/i.test(k); }).map(function (k) { return env.caches.delete(k); }));
    }).then(function () { done.push('caches'); }, function () { }));
    /* only Ebb's own worker: other apps can share this origin (one GitHub Pages host, many paths) */
    if (env.serviceWorker && env.serviceWorker.getRegistrations) waits.push(env.serviceWorker.getRegistrations().then(function (rs) {
      return Promise.all(rs.filter(function (r) { return !env.scope || r.scope === env.scope; }).map(function (r) { return r.unregister(); }));
    }).then(function () { done.push('worker'); }, function () { }));
    /* a delete counts only when it succeeds; an open connection elsewhere blocks it, and that is reported */
    if (env.indexedDB && env.indexedDB.databases) waits.push(env.indexedDB.databases().then(function (dbs) {
      return Promise.all(dbs.filter(function (d) { return d && /^ebb/i.test(d.name || ''); }).map(function (d) {
        return new Promise(function (resolve) {
          var req = env.indexedDB.deleteDatabase(d.name), t = setTimeout(function () { resolve('blocked'); }, env.idbWaitMs || 3000);
          req.onsuccess = function () { clearTimeout(t); resolve('ok'); };
          req.onerror = function () { clearTimeout(t); resolve('error'); };
          req.onblocked = function () { done.push('blocked:' + d.name); };
        });
      }));
    }).then(function (rs) { if (rs.every(function (r) { return r === 'ok'; })) done.push('databases'); else done.push('databases-incomplete'); }, function () { done.push('databases-incomplete'); }));
    return Promise.all(waits).then(function () { return done; });
  }

  root.EbbSettingsCore = { DEFAULTS: DEFAULTS, cleanPrefs: cleanPrefs, inQuiet: inQuiet, mayNudge: mayNudge, noteNudge: noteNudge,
    csvCell: csvCell, observationsCsv: observationsCsv, observationsFhir: observationsFhir, recordsFor: recordsFor, STANDARD: STANDARD, exportAll: exportAll,
    deleteEverything: deleteEverything, uuidFor: uuidFor };
})(typeof window !== 'undefined' ? window : globalThis);
