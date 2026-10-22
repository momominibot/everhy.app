/* Ebb app shell: makes Ebb installable and playable offline, and adds the Settings panel (her exports, delete
 * everything, nudge cap and quiet hours, motion and text size, a privacy note). Preferences live in
 * api.state().prefs. Other modules ask EbbSettings.mayNudge() before any nudge and call noteNudge() after one. */
(function (root) {
  'use strict';
  var doc = root.document, G = root.EbbGame, S = root.EbbStore;
  if (!G || !S) return;

  /* ---------- install and offline ---------- */
  function head(tag, attrs) {
    var el = doc.createElement(tag);
    Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    doc.head.appendChild(el);
  }
  head('link', { rel: 'manifest', href: 'manifest.webmanifest' });
  head('meta', { name: 'theme-color', content: '#f6efe6' });
  head('link', { rel: 'apple-touch-icon', href: 'art/icons/apple-touch-icon.png' });
  head('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
  head('meta', { name: 'apple-mobile-web-app-title', content: 'Ebb' });
  if ('serviceWorker' in root.navigator && /^https?:$/.test(root.location.protocol)) {
    root.addEventListener('load', function () { root.navigator.serviceWorker.register('sw.js').catch(function () { /* offline play is a bonus */ }); });
  }

  /* the pure core (exports, rules) is its own file so node can check it */
  var coreReady = new Promise(function (resolve) {
    if (root.EbbSettingsCore) return resolve(root.EbbSettingsCore);
    var s = doc.createElement('script'); s.src = 'js/settings/core.js';
    s.onload = function () { resolve(root.EbbSettingsCore); }; s.onerror = function () { resolve(null); };
    doc.head.appendChild(s);
  });

  var api = null;
  function prefs() {
    var st = api ? api.state() : S.load(), C = root.EbbSettingsCore;
    if (C) st.prefs = C.cleanPrefs(st.prefs);
    return st.prefs || {};
  }
  function setPref(k, v) { var p = prefs(); p[k] = v; api.state().prefs = root.EbbSettingsCore.cleanPrefs(p); api.save(); apply(); }
  function apply() {
    var p = prefs(), html = doc.documentElement;
    html.setAttribute('data-motion', p.motion || 'system');
    html.setAttribute('data-text', p.textSize || 'normal');
  }
  doc.addEventListener('ebb:ready', function (e) { api = e.detail; coreReady.then(apply); });

  /* delete everything in one tab must reach the others before they save their old copy back: drop this tab's copy
     from memory and reload. A save that lands in the instant before the message arrives is the store's to refuse
     (integrator: a generation check in ebb-store.js would close that gap). */
  var channel = null;
  try { channel = new root.BroadcastChannel('ebb-settings'); } catch (e) { channel = null; }
  function deletedElsewhere() { try { S.reset(); } catch (e) { } root.location.reload(); }
  if (channel) channel.onmessage = function (e) { if (e.data && e.data.type === 'deleted') deletedElsewhere(); };
  root.addEventListener('storage', function (e) { if (e.key === S.KEY && e.oldValue && e.newValue === null) deletedElsewhere(); });

  root.EbbSettings = {
    prefs: function () { return prefs(); },
    mayNudge: function (now) { var C = root.EbbSettingsCore; return !!C && C.mayNudge(prefs(), now || new Date()); },
    noteNudge: function (now) { var C = root.EbbSettingsCore; if (!C || !api) return; api.state().prefs = C.noteNudge(prefs(), now || new Date()); api.save(); }
  };

  /* ---------- files she can keep ---------- */
  function download(name, text, type) {
    var url = URL.createObjectURL(new Blob([text], { type: type })), a = doc.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener'; doc.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }
  function storage() { try { return root.localStorage; } catch (e) { return null; } }

  /* ---------- the panel ---------- */
  function el(html) { var d = doc.createElement('div'); d.innerHTML = html; return d.firstElementChild; }
  function pills(name, key, values, labels, current) {
    return '<div class="choice"><span id="lbl-' + key + '">' + name + '</span><div class="pills" role="group" aria-labelledby="lbl-' + key + '" data-pref="' + key + '">' +
      values.map(function (v, i) { return '<button type="button" class="pill" data-v="' + v + '" aria-pressed="' + (String(current) === String(v)) + '">' + labels[i] + '</button>'; }).join('') + '</div></div>';
  }

  function open(a) {
    api = a;
    coreReady.then(function (C) { if (!C) { a.toast('Settings could not load. Check your connection and try again.'); return; } build(C); });
  }

  function build(C) {
    var p = prefs(), obs = api.state().observations || [], back = doc.activeElement;
    var wrap = el('<div class="sheet-wrap settings-wrap"><section class="sheet settings" role="dialog" aria-modal="true" aria-labelledby="settingsTitle"></section></div>');
    var sheet = wrap.firstElementChild;
    sheet.innerHTML =
      '<h2 id="settingsTitle">Settings</h2>' +
      '<section class="set-group" aria-labelledby="setData"><h3 id="setData">Your data</h3>' +
      '<p class="muted">Everything Ebb keeps is on this device. ' + obs.length + (obs.length === 1 ? ' saved record.' : ' saved records.') + '</p>' +
      '<div class="set-row"><button type="button" class="btn" data-x="json">Export everything</button>' +
      '<button type="button" class="btn" data-x="csv">Records as CSV</button>' +
      '<button type="button" class="btn" data-x="fhir">Records as FHIR</button></div></section>' +
      '<section class="set-group" aria-labelledby="setNudge"><h3 id="setNudge">Nudges</h3>' +
      pills('At most', 'nudgesPerDay', [0, 1, 2, 3], ['None', '1 a day', '2 a day', '3 a day'], p.nudgesPerDay) +
      '<div class="choice"><span>Quiet hours</span><div class="set-row quiet">' +
      '<label>From <input type="time" data-time="quietFrom" value="' + p.quietFrom + '"></label>' +
      '<label>To <input type="time" data-time="quietTo" value="' + p.quietTo + '"></label></div></div></section>' +
      '<section class="set-group" aria-labelledby="setComfort"><h3 id="setComfort">Comfort</h3>' +
      pills('Motion', 'motion', ['system', 'reduce'], ['Follow my device', 'Reduce motion'], p.motion) +
      pills('Text size', 'textSize', ['normal', 'large', 'larger'], ['Normal', 'Large', 'Larger'], p.textSize) + '</section>' +
      '<section class="set-group" aria-labelledby="setPrivacy"><h3 id="setPrivacy">Privacy <span class="draft">Draft for legal review</span></h3>' +
      '<p>Ebb keeps your game, your practices and your notes on this device only. Nothing is sent to us or to anyone else, ' +
      'and nothing is used for advertising. You can export a copy at any time, and you can delete everything here. ' +
      'If you clear this browser’s data, your Ebb data goes with it, so export first if you want to keep it.</p></section>' +
      '<section class="set-group" aria-labelledby="setDelete"><h3 id="setDelete">Delete everything</h3>' +
      '<p class="muted">Removes your save, settings and the offline copy from this device.</p>' +
      '<button type="button" class="btn danger" data-x="delete">Delete everything…</button>' +
      '<div class="confirm" hidden role="alertdialog" aria-labelledby="delAsk"><p id="delAsk"><b>Delete everything on this device?</b> This cannot be undone. Export first if you want a copy.</p>' +
      '<div class="set-row"><button type="button" class="btn" data-x="keep">Keep my data</button>' +
      '<button type="button" class="btn danger solid" data-x="really">Yes, delete everything</button></div></div></section>' +
      '<div class="sheet-actions"><button type="button" class="btn primary" data-x="close">Done</button></div>';

    function close() { wrap.remove(); doc.removeEventListener('keydown', esc, true); if (back && back.focus) back.focus(); }
    function esc(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
    /* keys typed here (arrows in a time field) must not walk her around the scene behind */
    wrap.addEventListener('keydown', function (e) { if (e.key !== 'Escape') e.stopPropagation(); });
    doc.addEventListener('keydown', esc, true);
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });

    sheet.querySelectorAll('[data-pref]').forEach(function (g) {
      g.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        g.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        var k = g.dataset.pref; setPref(k, k === 'nudgesPerDay' ? Number(b.dataset.v) : b.dataset.v);
      });
    });
    sheet.querySelectorAll('[data-time]').forEach(function (inp) {
      inp.addEventListener('change', function () { setPref(inp.dataset.time, inp.value); inp.value = prefs()[inp.dataset.time]; });
    });

    var confirmBox = sheet.querySelector('.confirm'), delBtn = sheet.querySelector('[data-x="delete"]');
    sheet.addEventListener('click', function (e) {
      var b = e.target.closest('[data-x]'); if (!b) return;
      var x = b.dataset.x, st = api.state(), day = api.today();
      if (x === 'json') { download('ebb-export-' + day + '.json', JSON.stringify(C.exportAll(st, storage()), null, 2), 'application/json'); api.toast('Saved a copy of everything'); }
      else if (x === 'csv') { download('ebb-records-' + day + '.csv', C.observationsCsv(st.observations), 'text/csv'); api.toast('Saved your records as CSV'); }
      else if (x === 'fhir') { download('ebb-records-fhir-' + day + '.json', JSON.stringify(C.observationsFhir(st.observations), null, 2), 'application/fhir+json'); api.toast('Saved your records as a FHIR bundle'); }
      else if (x === 'delete') { confirmBox.hidden = false; delBtn.hidden = true; confirmBox.querySelector('[data-x="keep"]').focus(); }
      else if (x === 'keep') { confirmBox.hidden = true; delBtn.hidden = false; delBtn.focus(); }
      else if (x === 'really') {
        b.disabled = true; b.textContent = 'Deleting…';
        C.deleteEverything({ store: S, storage: storage(), caches: root.caches, serviceWorker: root.navigator.serviceWorker, indexedDB: root.indexedDB,
          scope: new URL('./', root.location.href).href })
          .then(function (done) {
            if (channel) channel.postMessage({ type: 'deleted' });
            if (done.indexOf('databases-incomplete') >= 0) { try { root.sessionStorage.setItem('ebbDeleteIncomplete', '1'); } catch (e) { } }
            root.location.reload();
          });
      }
      else if (x === 'close') close();
    });

    doc.body.appendChild(wrap);
    sheet.querySelector('button').focus();
  }

  doc.addEventListener('ebb:ready', function (e) {
    var left = false;
    try { left = root.sessionStorage.getItem('ebbDeleteIncomplete') === '1'; root.sessionStorage.removeItem('ebbDeleteIncomplete'); } catch (x) { }
    if (left) e.detail.toast('Some Ebb data is still open in another tab. Close other Ebb tabs, then delete again.', 6000);
  });

  G.registerPanel({ id: 'settings', label: 'Settings', open: open });
})(window);
