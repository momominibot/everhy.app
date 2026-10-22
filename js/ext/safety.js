/* Ebb safety entry: loads the safety modules (rules, crisis check, consent, screens) and exposes window.EbbSafety.
 *   check(newObs, allObs, profile[, { now }]) -> [{ ruleId, version, urgency, message, action, key, ... }]
 *       most urgent first. If a new observation's text reads as a crisis, the list holds ONLY the crisis alert
 *       (crisis: true) and the other alerts wait in alert.deferred until the crisis card is closed.
 *   crisis(text[, { silent }]) -> true for self-harm or suicidal language about her, now (clause-aware); a hit also
 *       opens the help card unless silent, because the log leaves crisis replies to Safety.
 *   showAlert(alert) / showAlerts(list): a calm sheet with the reason and the action; crisis shows the help card only.
 *   consented(purpose) -> bool for 'core' | 'physiology' | 'research' | 'partner' | 'course'.
 *   setConsent(purpose, granted), openPanel(), startOnboarding(), ready (a Promise).
 * The modules are added with async=false, so they run in order and before the window load event that boots the game:
 * any call made from a tap or a log is safe. Pure modules also run in Node (tools/test-safety.js). */
(function (root) {
  'use strict';
  var doc = root.document;
  var FILES = ['js/safety/rules.js', 'js/safety/crisis.js', 'js/safety/consent.js', 'js/safety/ui.js'];
  var base = (doc && doc.currentScript && doc.currentScript.src || '').replace(/js\/ext\/safety\.js(\?.*)?$/, '');

  var ready = new Promise(function (resolve) {
    if (!doc || (root.EbbSafetyRules && root.EbbCrisis && root.EbbConsent)) { resolve(); return; }
    var left = FILES.length;
    FILES.forEach(function (f) {
      var s = doc.createElement('script'); s.src = base + f; s.async = false;
      s.onload = s.onerror = function (e) { if (e && e.type === 'error' && root.console) root.console.error('Ebb safety: could not load ' + f); if (--left === 0) resolve(); };
      doc.head.appendChild(s);
    });
  });

  var CRISIS_ALERT = {
    ruleId: 'C-CRISIS', version: 1, urgency: 'urgent', crisis: true, key: 'C-CRISIS',
    message: 'What you wrote sounds like you may be thinking about hurting yourself or ending your life.',
    action: 'Please reach out now: call SOS on 1767 (24 hours) or mindline on 1771. If you are in danger, call 995.'
  };
  function textOf(o) {
    if (!o) return '';
    return [o.text, o.note, o.notes, o.raw, o.said, o.sourceText, typeof o.value === 'string' && o.value.length > 12 ? o.value : ''].filter(function (t) { return typeof t === 'string'; }).join('. ');
  }
  function detect(text) {
    if (root.EbbCrisis) return root.EbbCrisis.crisis(text);
    /* only reachable before the modules load; keeps the obvious cases safe */
    return /suicid|kill(ing)?\s+my\s*self|end\s+my\s+life|self[\s-]*harm|want\s+to\s+die/i.test(String(text || ''));
  }
  /* The log hands crisis messages to Safety and shows nothing itself, so a hit also opens the help card (once) when
   * the screens are loaded. Pass { silent: true } to only test the text. */
  function crisis(text, opts) {
    var hit = detect(text);
    if (hit && !(opts && opts.silent) && root.EbbSafetyUi && doc && !doc.querySelector('.sf-crisis')) root.EbbSafetyUi.showCrisis();
    return hit;
  }
  function check(newObs, allObs, profile, opts) {
    var list = Array.isArray(newObs) ? newObs : newObs ? [newObs] : [];
    var alerts = root.EbbSafetyRules ? root.EbbSafetyRules.check(list, allObs, profile, opts) : [];
    if (!root.EbbSafetyRules && root.console) root.console.error('Ebb safety rules not loaded yet');
    var hit = list.some(function (o) { return o && o.confirmed !== false && !o.retracted && detect(textOf(o)); });
    if (hit) { var c = Object.assign({}, CRISIS_ALERT, { tableVersion: root.EbbCrisis && root.EbbCrisis.VERSION, deferred: alerts }); return [c]; }
    return alerts;
  }
  function stateOrNull() { var g = root.EbbGame; return g && g.api && g.api.state ? g.api.state() : null; }
  function consented(purpose) { var s = stateOrNull(); return !!(s && root.EbbConsent && root.EbbConsent.consented(s, purpose)); }
  function setConsent(purpose, granted, source) {
    var s = stateOrNull(); if (!s || !root.EbbConsent) return null;
    var ev = root.EbbConsent.record(s, purpose, granted, source || 'api'); root.EbbGame.api.save(); return ev;
  }
  function ui(name) { return function () { var u = root.EbbSafetyUi; return u ? u[name].apply(null, arguments) : false; }; }

  root.EbbSafety = {
    check: check, crisis: crisis, consented: consented, setConsent: setConsent, ready: ready,
    showAlert: ui('showAlert'), showAlerts: ui('showAlerts'), showCrisis: ui('showCrisis'),
    openPanel: ui('openPanel'), startOnboarding: ui('startOnboarding'),
    CRISIS_ALERT: CRISIS_ALERT
  };
})(typeof window !== 'undefined' ? window : globalThis);
