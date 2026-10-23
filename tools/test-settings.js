/* Node checks for Ebb's settings core (prefs, nudge rule, CSV and FHIR exports, delete everything) and the offline
 * worker's install, upgrade and offline fallback. Run: node tools/test-settings.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0, pending = 0;
function check(name, ok) { if (ok) pass++; else { fail++; console.log('FAIL', name); } }
function later(name, promise) { pending++; promise.then(ok => { check(name, ok); }, e => { check(name + ' (' + e.message + ')', false); }).finally(() => { pending--; }); }

function storageOf(mem) {
  return { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; },
    key: i => Object.keys(mem)[i] || null, get length() { return Object.keys(mem).length; } };
}
const mem = {};
const ctx = { console, Math, JSON, Date, Object, Array, String, Number, parseInt, isNaN, isFinite, encodeURIComponent, Promise, setTimeout, clearTimeout, localStorage: storageOf(mem) };
ctx.globalThis = ctx;
vm.createContext(ctx);
['ebb-farm.js', 'ebb-store.js', 'settings/core.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'), ctx, { filename: f }));
const { EbbSettingsCore: C, EbbStore: S } = ctx;
const plain = v => JSON.parse(JSON.stringify(v)); /* objects from the vm realm, compared as plain data */

/* ---------- preferences ---------- */
(() => {
  const d = C.cleanPrefs(null);
  check('defaults: one nudge a day', d.nudgesPerDay === 1 && d.quietFrom === '21:00' && d.quietTo === '08:00' && d.motion === 'system' && d.textSize === 'normal');
  const bad = C.cleanPrefs({ nudgesPerDay: 99, quietFrom: '25:00', quietTo: '7am', motion: 'wild', textSize: '<b>', extra: 1 });
  check('bad prefs are cleaned', bad.nudgesPerDay === 3 && bad.quietFrom === '21:00' && bad.quietTo === '08:00' && bad.motion === 'system' && bad.textSize === 'normal' && !('extra' in bad));
  check('negative cap falls back', C.cleanPrefs({ nudgesPerDay: -1 }).nudgesPerDay === 1);
  check('zero cap is kept', C.cleanPrefs({ nudgesPerDay: 0 }).nudgesPerDay === 0);
})();

/* ---------- nudges: cap per local day and quiet hours across midnight ---------- */
(() => {
  const at = (h, m, day) => new Date(2026, 9, day || 22, h, m);
  const p = C.cleanPrefs({});
  check('quiet at 23:00', C.inQuiet(p, at(23, 0)));
  check('quiet at 07:59', C.inQuiet(p, at(7, 59)));
  check('not quiet at 08:00', !C.inQuiet(p, at(8, 0)));
  check('not quiet at 20:59', !C.inQuiet(p, at(20, 59)));
  check('daytime window', C.inQuiet(C.cleanPrefs({ quietFrom: '13:00', quietTo: '14:00' }), at(13, 30)) && !C.inQuiet(C.cleanPrefs({ quietFrom: '13:00', quietTo: '14:00' }), at(14, 0)));
  check('equal ends mean no quiet hours', !C.inQuiet(C.cleanPrefs({ quietFrom: '09:00', quietTo: '09:00' }), at(9, 0)));
  check('may nudge at noon', C.mayNudge(p, at(12, 0)));
  const used = C.noteNudge(p, at(12, 0));
  check('cap of one reached', !C.mayNudge(used, at(15, 0)));
  check('cap resets next day', C.mayNudge(used, at(12, 0, 23)));
  check('never in quiet hours', !C.mayNudge(p, at(22, 0)));
  check('none means none', !C.mayNudge(C.cleanPrefs({ nudgesPerDay: 0 }), at(12, 0)));
  const two = C.noteNudge(C.cleanPrefs({ nudgesPerDay: 2 }), at(10, 0));
  check('second of two allowed', C.mayNudge(two, at(11, 0)) && !C.mayNudge(C.noteNudge(two, at(11, 0)), at(12, 0)));
})();

/* ---------- CSV ---------- */
(() => {
  check('plain cell', C.csvCell('breath') === 'breath');
  check('comma quoted', C.csvCell('a,b') === '"a,b"');
  check('quote doubled', C.csvCell('she said "hi"') === '"she said ""hi"""');
  check('newline quoted', C.csvCell('line1\nline2') === '"line1\nline2"');
  check('formula neutralised', C.csvCell('=HYPERLINK("x")') === '"\'=HYPERLINK(""x"")"' && C.csvCell('+1') === "'+1" && C.csvCell('@sum') === "'@sum");
  check('negative number left alone', C.csvCell(-5) === '-5');
  check('formula after a newline neutralised', C.csvCell('\n=1+2') === '"\'\n=1+2"');
  check('header names escaped', C.observationsCsv([{ id: 'a', 'sleep,hours': 7 }]).split('\r\n')[0] === 'id,"sleep,hours"');
  check('empty for null', C.csvCell(null) === '' && C.csvCell(undefined) === '');
  check('object as json', C.csvCell({ a: 1 }) === '"{""a"":1}"');
  check('booleans', C.csvCell(true) === 'true');
  const obs = [
    { id: 'p1', type: 'mindfulness', date: '2026-10-22', practice: 'sitting', anchor: 'breath', scriptVersion: 'draft-1', plannedSec: 180, activeSec: 180, status: 'finished', start: '2026-10-22T10:00:00.000Z', end: '2026-10-22T10:03:00.000Z', source: 'cushion', confirmed: true },
    { id: 'n2', type: 'note', date: '2026-10-22', text: 'tired, "heavy"\nday', source: 'chat', confirmed: false }
  ];
  const csv = C.observationsCsv(obs), lines = csv.split('\r\n');
  check('csv header has core columns first', lines[0].startsWith('id,type,date,start,end,status,practice,anchor,plannedSec,activeSec,scriptVersion,source,confirmed'));
  check('csv adds unknown fields as columns', lines[0].endsWith(',text'));
  check('csv keeps provenance', lines[1].includes(',cushion,true') && csv.includes(',chat,false,'));
  check('csv escapes note text', csv.includes('"tired, ""heavy""\nday"'));
  check('csv ends with CRLF', csv.endsWith('\r\n'));
  check('csv of nothing still has a header', C.observationsCsv([]).startsWith('id,type,date'));
  check('csv tolerates junk', typeof C.observationsCsv(null) === 'string');
})();

/* ---------- FHIR-style bundle ---------- */
(() => {
  const obs = [
    { id: 'p1', type: 'mindfulness', date: '2026-10-22', practice: 'sitting', anchor: 'breath', scriptVersion: 'draft-1', plannedSec: 180, activeSec: 95, status: 'partial', start: '2026-10-22T10:00:00.000Z', end: '2026-10-22T10:01:35.000Z', source: 'cushion', confirmed: true },
    { id: 'n 2/x', type: 'note', date: '2026-10-21', text: 'hello', source: 'chat', confirmed: false }
  ];
  const b = plain(C.observationsFhir(obs, new Date('2026-10-22T12:00:00Z')));
  check('bundle shape', b.resourceType === 'Bundle' && b.type === 'collection' && b.timestamp === '2026-10-22T12:00:00.000Z');
  check('one observation and one provenance each', b.entry.length === 4 && b.entry.filter(e => e.resource.resourceType === 'Provenance').length === 2);
  const o = b.entry[0].resource, pv = b.entry[1].resource;
  check('observation final when confirmed', o.status === 'final' && o.resourceType === 'Observation');
  check('activity category', o.category[0].coding[0].code === 'activity');
  check('no claimed LOINC code', !JSON.stringify(b).includes('loinc'));
  check('period kept', o.effectivePeriod.start === obs[0].start && o.effectivePeriod.end === obs[0].end);
  check('active seconds in UCUM', o.valueQuantity.value === 95 && o.valueQuantity.code === 's' && o.valueQuantity.system === 'http://unitsofmeasure.org');
  check('original id kept', o.identifier[0].value === 'p1');
  check('source kept', o.meta.source.endsWith('/source/cushion'));
  const comp = Object.fromEntries(o.component.map(c => [c.code.text, c]));
  check('partial status not upgraded', comp.status.valueString === 'partial');
  check('planned seconds kept', comp.plannedSec.valueQuantity.value === 180);
  check('script version kept', comp.scriptVersion.valueString === 'draft-1' && comp.anchor.valueString === 'breath');
  check('provenance targets its observation', pv.target[0].reference === b.entry[0].fullUrl);
  check('provenance recorded at end', pv.recorded === obs[0].end);
  check('provenance says confirmed', pv.agent[0].who.display.includes('confirmed') && pv.agent[1].who.display.includes('draft-1'));
  const n = b.entry[2].resource;
  check('unconfirmed is preliminary', n.status === 'preliminary' && b.entry[3].resource.agent[0].who.display.startsWith('Not confirmed'));
  check('fhir id made safe, original kept', /^[A-Za-z0-9\-.]{1,64}$/.test(n.id) && n.identifier[0].value === 'n 2/x');
  check('note text kept', n.component.some(c => c.code.text === 'text' && c.valueString === 'hello'));
  check('date-only record uses effectiveDateTime', n.effectiveDateTime === '2026-10-21');
  check('fullUrls are uuids', b.entry.every(e => /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(e.fullUrl)));
  check('fullUrls are unique', new Set(b.entry.map(e => e.fullUrl)).size === 4);
  check('fullUrls stable across exports', plain(C.observationsFhir(obs)).entry[0].fullUrl === b.entry[0].fullUrl);
  check('empty bundle has no empty array', !('entry' in plain(C.observationsFhir([]))));
  const sparse = plain(C.observationsFhir([{ id: 's1', type: 'note', date: '2026-10-20', activeSec: null }])).entry;
  check('missing confirmation is not invented', sparse[0].resource.status === 'unknown' && sparse[1].resource.agent[0].who.display === 'Confirmation not recorded');
  check('missing duration is not zero', !('valueQuantity' in sparse[0].resource) && !(sparse[0].resource.component || []).some(c => c.code.text === 'activeSec'));
})();

/* ---------- export everything ---------- */
(() => {
  for (const k of Object.keys(mem)) delete mem[k];
  S.reset();
  S.addPractice({ practice: 'sitting', anchor: 'breath', plannedSec: 180, activeSec: 180, status: 'finished', source: 'cushion' });
  mem.ebb_course = '{"lesson":2}'; mem.unrelated = 'x';
  const all = plain(C.exportAll(S.load(), ctx.localStorage, new Date('2026-10-22T00:00:00Z')));
  check('export has the save', all.app === 'Ebb' && all.save.observations.length === 1 && all.save.observations[0].source === 'cushion');
  check('export has other Ebb keys only', all.otherKeys.ebb_course === '{"lesson":2}' && !('unrelated' in all.otherKeys) && !('ebb_save_v1' in all.otherKeys));
  check('export survives blocked storage', plain(C.exportAll({ a: 1 }, { get length() { throw new Error('blocked'); } })).save.a === 1);
})();

/* ---------- delete everything ---------- */
(() => {
  for (const k of Object.keys(mem)) delete mem[k];
  S.reset();
  S.update(s => { s.prefs = { nudgesPerDay: 2 }; s.pond.offerings = 4; });
  S.addPractice({ practice: 'sitting', status: 'finished', source: 'cushion' });
  mem.ebb_log = '[1]'; mem.other_app = 'keep me';
  const cacheNames = ['ebb-shell-old', 'ebb-shell-new', 'someone-else'], deleted = [], unregistered = [], dbs = [];
  const env = {
    store: S, storage: ctx.localStorage,
    caches: { keys: () => Promise.resolve(cacheNames.slice()), delete: k => { deleted.push(k); return Promise.resolve(true); } },
    scope: 'http://localhost/ebb/',
    serviceWorker: { getRegistrations: () => Promise.resolve([
      { scope: 'http://localhost/ebb/', unregister: () => { unregistered.push('ebb'); return Promise.resolve(true); } },
      { scope: 'http://localhost/other-app/', unregister: () => { unregistered.push('other'); return Promise.resolve(true); } }]) },
    indexedDB: { databases: () => Promise.resolve([{ name: 'ebb-media' }, { name: 'other' }]),
      deleteDatabase: n => { dbs.push(n); const req = {}; setTimeout(() => req.onsuccess && req.onsuccess(), 5); return req; } }
  };
  later('delete everything clears save, keys, caches, worker and databases', C.deleteEverything(env).then(done => {
    const s = S.load();
    return !('ebb_save_v1' in mem) && !('ebb_log' in mem) && mem.other_app === 'keep me' &&
      s.observations.length === 0 && !s.prefs && s.pond.offerings === 0 &&
      deleted.join() === 'ebb-shell-old,ebb-shell-new' && unregistered.join() === 'ebb' && dbs.join() === 'ebb-media' &&
      ['save', 'storage', 'caches', 'worker', 'databases'].every(x => done.includes(x));
  }));
  const stuck = { store: S, storage: ctx.localStorage, idbWaitMs: 30,
    indexedDB: { databases: () => Promise.resolve([{ name: 'ebb-media' }]), deleteDatabase: () => { const req = {}; setTimeout(() => req.onblocked && req.onblocked(), 5); return req; } } };
  later('a blocked database is reported, not claimed deleted', C.deleteEverything(stuck).then(done => done.includes('databases-incomplete') && !done.includes('databases') && done.includes('blocked:ebb-media')));
  later('delete everything works with no caches or worker', C.deleteEverything({ store: S, storage: ctx.localStorage }).then(done => done.includes('save')));
})();

/* ---------- offline worker: install, upgrade, offline fallback ---------- */
(() => {
  const src = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const version = /var VERSION = '([^']+)'/.exec(src)[1];
  function makeWorker(store, online, missing) {
    const handlers = {}, ev = {};
    const res = (url, ok) => ({ ok: ok !== false, type: 'basic', url, clone() { return this; } });
    const caches = {
      open: name => { store[name] = store[name] || {}; const c = store[name];
        return Promise.resolve({
          addAll: urls => Promise.all(urls.map(u => { if (missing.includes(u)) throw new Error('404 ' + u); c[u] = res(u); })),
          add: u => missing.includes(u) ? Promise.reject(new Error('404')) : (c[u] = res(u), Promise.resolve()),
          put: (req, r) => { c[req.url || req] = r; return Promise.resolve(); } }); },
      keys: () => Promise.resolve(Object.keys(store)),
      delete: k => { delete store[k]; return Promise.resolve(true); },
      match: req => { const u = typeof req === 'string' ? req : req.url.replace('http://localhost/', ''); for (const n of Object.keys(store)) if (store[n][u]) return Promise.resolve(store[n][u]); return Promise.resolve(undefined); }
    };
    const self = { addEventListener: (t, fn) => { handlers[t] = fn; }, skipWaiting: () => Promise.resolve(), clients: { claim: () => Promise.resolve() }, location: { origin: 'http://localhost' } };
    const wctx = { self, caches, URL, Promise, setTimeout, clearTimeout,
      fetch: req => online === 'hang' ? new Promise(() => { }) : online ? Promise.resolve(res(req.url)) : Promise.reject(new TypeError('offline')) };
    vm.createContext(wctx); vm.runInContext(src, wctx, { filename: 'sw.js' });
    ev.run = (type, extra) => { let p = Promise.resolve(); const e = Object.assign({ waitUntil: x => { p = x; }, respondWith: x => { p = x; } }, extra); handlers[type](e); return p; };
    return ev;
  }
  const store = { 'ebb-shell-2020-01-01': { 'index.html': {} }, 'someone-else': {} };
  const w = makeWorker(store, false, ['js/ext/log.js', 'css/ext/world.css']);
  later('worker installs with missing optional files and upgrades cleanly', w.run('install').then(() => w.run('activate')).then(() =>
    Object.keys(store).sort().join() === [version, 'someone-else'].sort().join() && !!store[version]['index.html'] && !!store[version]['js/ext/settings.js'] && !store[version]['js/ext/log.js']));
  later('worker serves cached code when offline', w.run('install').then(() =>
    w.run('fetch', { request: { method: 'GET', url: 'http://localhost/js/ebb-game.js', mode: 'no-cors' } })).then(r => !!r && r.url === 'js/ebb-game.js'));
  later('worker falls back to the page for an offline navigation', w.run('install').then(() =>
    w.run('fetch', { request: { method: 'GET', url: 'http://localhost/somewhere', mode: 'navigate' } })).then(r => !!r && r.url === 'index.html'));
  const w3 = makeWorker({}, 'hang', []);
  later('a hanging network still gets the cached page after the timeout', w3.run('install').then(() =>
    w3.run('fetch', { request: { method: 'GET', url: 'http://localhost/not-cached', mode: 'navigate' } })).then(r => !!r && r.url === 'index.html'));
  const w2 = makeWorker({}, true, []);
  later('worker leaves other origins alone', (() => { let called = false; w2.run('fetch', { request: { method: 'GET', url: 'https://example.com/x' }, respondWith: () => { called = true; } }); return Promise.resolve(!called); })());
  check('worker version names a build', /^ebb-shell-\d{4}-\d{2}-\d{2}[a-z]?$/.test(version));
  const shell = /var SHELL = \[([\s\S]*?)\];/.exec(src)[1].match(/'([^']+)'/g).map(s => s.slice(1, -1)).filter(u => u !== './');
  check('every shell file exists', shell.every(u => fs.existsSync(path.join(ROOT, u))) || (console.log('missing', shell.filter(u => !fs.existsSync(path.join(ROOT, u)))), false));
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  check('manifest names Ebb, portrait, standalone', manifest.name === 'Ebb' && manifest.orientation === 'portrait' && manifest.display === 'standalone');
  check('manifest icons exist with a maskable one', manifest.icons.every(i => fs.existsSync(path.join(ROOT, i.src))) && manifest.icons.some(i => i.purpose === 'maskable' && i.sizes === '512x512') && manifest.icons.some(i => i.sizes === '192x192'));
  check('manifest colours match css', fs.readFileSync(path.join(ROOT, 'css/ebb.css'), 'utf8').includes('--bg: ' + manifest.background_color));
})();

/* FHIR prep: every record she owns, standard LOINC codes where they exist, UCUM units, self reports as survey */
(() => {
  const save = { observations: [{ id: 'p1', type: 'mindfulness', date: '2026-10-22', start: '2026-10-22T08:00:00Z', end: '2026-10-22T08:03:00Z', activeSec: 180, status: 'finished', confirmed: true, source: 'course' }],
    log: { obs: [
      { id: 'o1', type: 'sleep', value: 7.5, unit: 'h', start: '2026-10-22', end: '2026-10-22', confirmed: true, source: 'chat' },
      { id: 'o2', type: 'mood', value: 'stressed', start: '2026-10-22', confirmed: true, source: 'chat' },
      { id: 'o3', type: 'bleeding', value: 'heavy', start: '2026-10-21', confirmed: true, source: 'calendar' },
      { id: 'o4', type: 'temperature', value: 36.6, unit: 'C', start: '2026-10-22', confirmed: true, source: 'chat' },
      { id: 'o5', type: 'mood', value: 'low', start: '2026-10-20', confirmed: true, retracted: true, source: 'chat' }] },
    profile: { lastPeriodStart: '2026-10-01' } };
  const recs = plain(C.recordsFor(save));
  check('the export holds practices, logs and the last period, never a retracted entry', recs.length === 6 && !recs.some(r => r.id === 'o5') && recs.some(r => r.type === 'lmp'));
  const res = plain(C.observationsFhir(C.recordsFor(save), new Date('2026-10-23T00:00:00Z'))).entry.filter(e => e.resource.resourceType === 'Observation').map(e => e.resource);
  const by = id => res.find(r => r.identifier[0].value === id), loinc = r => (r.code.coding.find(c => c.system === 'http://loinc.org') || {}).code;
  check('sleep carries LOINC 93832-4 with hours in UCUM', loinc(by('o1')) === '93832-4' && by('o1').valueQuantity.value === 7.5 && by('o1').valueQuantity.code === 'h' && by('o1').valueQuantity.system === 'http://unitsofmeasure.org');
  check('temperature carries LOINC 8310-5 in Cel', loinc(by('o4')) === '8310-5' && by('o4').valueQuantity.code === 'Cel');
  check('mood carries LOINC 80296-7 and her word', loinc(by('o2')) === '80296-7' && by('o2').valueString === 'stressed');
  check('the last period start carries LOINC 8665-2 as a date', loinc(by('profile-lmp')) === '8665-2' && by('profile-lmp').valueDateTime === '2026-10-01');
  check('flow keeps Ebb code only (no LOINC claimed) with its value', !loinc(by('o3')) && by('o3').valueString === 'heavy');
  check('her own reports are survey, practices stay activity', by('o1').category[0].coding[0].code === 'survey' && by('p1').category[0].coding[0].code === 'activity');
  check('a practice keeps its active seconds', by('p1').valueQuantity.code === 's' && by('p1').valueQuantity.value === 180);
  check('every LOINC code in the table is the checked one', JSON.stringify(Object.values(plain(C.STANDARD)).map(x => x.code)) === JSON.stringify(['8665-2', '93832-4', '8310-5', '80296-7', '93038-8', '72514-3', '41950-7', '55411-3']));
})();

const timer = setInterval(() => { if (!pending) { clearInterval(timer); console.log(`${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0; } }, 20);
setTimeout(() => { if (pending) { console.log('FAIL', pending, 'async checks never settled'); process.exit(1); } }, 12000);
