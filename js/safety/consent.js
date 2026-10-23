/* Ebb consent: one plain-language screen per purpose, each agreed or declined on its own and withdrawable at any time.
 * Choices are kept as dated events (never edited or deleted) under state.consent.events; the latest event for a
 * purpose decides. No purpose is ever on by default, and the game never depends on any of them.
 * This build has no server: saying yes to research, partner sharing or course contact records the choice only.
 * Copy is a draft for the study team and ethics board to review. */
(function (root) {
  'use strict';
  var COPY_VERSION = 'consent-copy-2026-10-23.1';

  var PURPOSES = [
    { id: 'core', title: 'Keep my notes on this phone',
      body: 'EveRhy saves what you log (periods, symptoms, moods, practices) on this phone so it can remember them. Nothing leaves the phone. You can still play without this, but EveRhy won’t keep your health notes.',
      yes: 'Yes, keep my notes here', no: 'Not now' },
    { id: 'physiology', title: 'Let EveRhy use your cycle to shape the app',
      body: 'EveRhy can use your cycle and symptom logs to time gentle check-ins and show patterns back to you. This stays on this phone. EveRhy doesn’t diagnose anything and isn’t a form of contraception.',
      yes: 'Yes, use my logs for this', no: 'No thanks' },
    { id: 'research', title: 'Help the research study',
      body: 'If you are in the study, your logs could help doctors learn about cycles. In this version nothing is sent anywhere: saying yes only records your choice, and the study team will explain everything and ask again before any data leaves your phone.',
      yes: 'I’m interested', no: 'No thanks' },
    { id: 'partner', title: 'Share with a partner',
      body: 'Later you may be able to share a summary you choose with a partner. Nothing is shared now, and you will always pick what is shared and with whom.',
      yes: 'Maybe later, ask me', no: 'No thanks' },
    { id: 'course', title: 'Mindfulness course updates',
      body: 'The study team may run a short mindfulness course. Saying yes means you’re happy to be told about it. No contact details are collected in this version.',
      yes: 'Yes, tell me', no: 'No thanks' }
  ];
  var IDS = PURPOSES.map(function (p) { return p.id; });

  function ensure(state) {
    if (!state.consent || typeof state.consent !== 'object') state.consent = {};
    if (!Array.isArray(state.consent.events)) state.consent.events = [];
    return state.consent;
  }
  function record(state, purpose, granted, source, at) {
    if (IDS.indexOf(purpose) < 0) throw new Error('unknown consent purpose: ' + purpose);
    var ev = { purpose: purpose, granted: granted === true, at: at || new Date().toISOString(), copyVersion: COPY_VERSION, source: String(source || 'panel') };
    ensure(state).events.push(ev);
    return ev;
  }
  function latest(state, purpose) {
    var evs = state && state.consent && Array.isArray(state.consent.events) ? state.consent.events : [], hit = null;
    evs.forEach(function (e) { if (e && e.purpose === purpose && (!hit || String(e.at) >= String(hit.at))) hit = e; });
    return hit;
  }
  function consented(state, purpose) { var e = latest(state, purpose); return !!(e && e.granted === true); }
  function history(state, purpose) {
    var evs = state && state.consent && Array.isArray(state.consent.events) ? state.consent.events : [];
    return evs.filter(function (e) { return !purpose || e.purpose === purpose; });
  }

  root.EbbConsent = { PURPOSES: PURPOSES, IDS: IDS, COPY_VERSION: COPY_VERSION, record: record, latest: latest, consented: consented, history: history, ensure: ensure };
})(typeof window !== 'undefined' ? window : globalThis);
