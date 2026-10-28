/* Ebb safety screens: the crisis card, calm alert sheets, the first-run chat and the Safety and privacy panel.
 * All copy is pre-written here. Nothing is generated, nothing is sent anywhere, and every question can be skipped:
 * the game never depends on answering. */
(function (root) {
  'use strict';
  var doc = root.document, R = root.EbbSafetyRules, C = root.EbbConsent;
  var ONBOARD_VERSION = 'onboard-2026-10-22.1';
  var MEDIUM_QUIET_DAYS = 30;

  /* Singapore help numbers, each checked on the organisation's own page on 22 Oct 2026:
   *  - SOS 24-hour hotline 1767 and 24-hour CareText (WhatsApp) 9151 1767: https://www.sos.org.sg/
   *  - Emergency ambulance 995 ("Call 995 only for Emergency"): https://www.scdf.gov.sg/home/about-scdf/emergency-medical-services
   *  - National mindline 1771, WhatsApp +65 6669 1771, webchat at mindline.sg, round the clock since 18 Jun 2025:
   *    https://www.moh.gov.sg/newsroom/national-mindline-1771-to-provide--round-the-clock-support-for-mental-health/
   * Left out on purpose: the IMH Mental Health Helpline 6389 2222, which IMH retired when mindline 1771 launched. */
  var HELP = [
    { label: 'Call SOS 1767', note: 'Samaritans of Singapore, 24 hours', href: 'tel:1767', primary: true },
    { label: 'WhatsApp SOS CareText 9151 1767', note: 'If talking is hard, 24 hours', href: 'https://wa.me/6591511767' },
    { label: 'Call mindline 1771', note: 'National mindline, 24 hours. WhatsApp 6669 1771 or chat at mindline.sg', href: 'tel:1771' },
    { label: 'Emergency: call 995', note: 'If you might act on these thoughts or are in danger now', href: 'tel:995', urgent: true }
  ];

  function api() { return root.EbbGame && root.EbbGame.api; }
  function state() { var a = api(), s = a && a.state && a.state(); return s || null; }
  function save() { var a = api(); if (a && a.save) a.save(); }
  function today() { var a = api(); return a && a.today ? a.today() : new Date().toISOString().slice(0, 10); }
  function bucket(s) {
    if (!s.safety || typeof s.safety !== 'object') s.safety = {};
    if (!s.safety.seen) s.safety.seen = {};
    if (!Array.isArray(s.safety.shown)) s.safety.shown = [];
    if (!s.profile || typeof s.profile !== 'object') s.profile = {};
    return s.safety;
  }

  function el(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function button(label, cls, fn) { var b = el('button', cls || 'btn', label); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; }

  /* ---------- one sheet at a time, queued ---------- */
  var queue = [], current = null;
  function openSheet(build) { queue.push(build); if (!current) next(); }
  function next() {
    var build = queue.shift(); if (!build) { current = null; return; }
    var wrap = el('div', 'sheet-wrap sf-wrap'), sheetEl = el('section', 'sheet sf-sheet');
    sheetEl.setAttribute('role', 'dialog'); sheetEl.setAttribute('aria-modal', 'true');
    wrap.appendChild(sheetEl);
    wrap.addEventListener('keydown', function (e) { e.stopPropagation(); }); /* the game must not walk behind a sheet */
    wrap.addEventListener('click', function (e) { e.stopPropagation(); });
    root.EbbMount ? root.EbbMount(wrap) : doc.body.appendChild(wrap);
    current = { wrap: wrap };
    var close = function () { if (!wrap.parentNode) return; wrap.remove(); current = null; setTimeout(next, 0); };
    build(sheetEl, close, wrap);
    var first = sheetEl.querySelector('[data-focus]') || sheetEl.querySelector('button, a, input'); if (first) first.focus();
  }
  function isOpen() { return !!current; }

  /* ---------- crisis card: help numbers and nothing else ---------- */
  function showCrisis(after) {
    queue.length = 0;
    if (current) current.wrap.remove(), current = null;
    openSheet(function (box, close, wrap) {
      wrap.classList.add('sf-crisis-wrap'); box.classList.add('sf-crisis');
      box.setAttribute('role', 'alertdialog'); box.setAttribute('aria-labelledby', 'sfCrisisTitle');
      var h = el('h2', null, 'You don’t have to face this alone'); h.id = 'sfCrisisTitle'; box.appendChild(h);
      box.appendChild(el('p', null, 'It sounds like things are really hard right now. Talking to someone can help, any time of day or night.'));
      var list = el('div', 'sf-help');
      HELP.forEach(function (x) {
        var a = el('a', 'sf-help-link' + (x.primary ? ' primary' : '') + (x.urgent ? ' urgent' : '')); a.href = x.href;
        if (/^https:/.test(x.href)) { a.target = '_blank'; a.rel = 'noopener'; }
        if (x.primary) a.setAttribute('data-focus', '');
        a.appendChild(el('b', null, x.label)); a.appendChild(el('span', null, x.note)); list.appendChild(a);
      });
      box.appendChild(list);
      box.appendChild(el('p', 'muted small', 'If you can, tell someone you trust how you are feeling. Ovia will be here when you come back.'));
      var acts = el('div', 'sheet-actions'); acts.appendChild(button('I’m safe for now', 'btn', function () { close(); if (after) after(); })); box.appendChild(acts);
    });
  }

  /* ---------- alert sheets ---------- */
  var TITLES = { urgent: 'Please get help now', high: 'Please see a doctor', medium: 'Something worth checking' };
  function showAlert(alert) {
    if (!alert) return false;
    if (alert.crisis) { showCrisis(function () { (alert.deferred || []).forEach(showAlert); }); logShown(alert); return true; }
    var s = state();
    if (s && alert.urgency === 'medium') {
      var seen = bucket(s).seen[alert.key];
      if (seen && R && (R._t.dnum(today()) - R._t.dnum(seen)) < MEDIUM_QUIET_DAYS) return false;
    }
    logShown(alert);
    openSheet(function (box, close) {
      box.classList.add('sf-alert', 'sf-' + alert.urgency);
      box.setAttribute('role', alert.urgency === 'urgent' ? 'alertdialog' : 'dialog');
      box.appendChild(el('h2', null, TITLES[alert.urgency] || 'Something worth checking'));
      box.appendChild(el('p', 'sf-reason', alert.message));
      box.appendChild(el('p', 'sf-action', alert.action));
      var why = el('details', 'sf-why'); why.appendChild(el('summary', null, 'Why am I seeing this?'));
      why.appendChild(el('p', 'muted small', 'EveRhy checks what you log against a short list of warning signs agreed for this study. It can’t examine you and this isn’t a diagnosis. If you are worried, trust that and get checked.'));
      why.appendChild(el('p', 'muted small', 'Rule ' + alert.ruleId + ' v' + alert.version + (alert.threshold ? ': ' + alert.threshold : '')));
      box.appendChild(why);
      var acts = el('div', 'sheet-actions');
      if (alert.urgency === 'urgent') { var call = el('a', 'btn primary sf-call', 'Call 995'); call.href = 'tel:995'; acts.appendChild(call); }
      acts.appendChild(button(alert.urgency === 'medium' ? 'OK, noted' : 'I understand', alert.urgency === 'urgent' ? 'btn' : 'btn primary', close));
      box.appendChild(acts);
      box.querySelector('.btn').setAttribute('data-focus', '');
    });
    return true;
  }
  function showAlerts(list) {
    list = (list || []).slice();
    var crisis = list.filter(function (a) { return a && a.crisis; })[0];
    if (crisis) return showAlert(crisis);
    var shown = 0; list.forEach(function (a) { if (showAlert(a)) shown++; }); return shown > 0;
  }
  function logShown(alert) {
    var s = state(); if (!s) return;
    var b = bucket(s); b.seen[alert.key] = today();
    b.shown.push({ ruleId: alert.ruleId, version: alert.version, key: alert.key, urgency: alert.urgency, at: new Date().toISOString() });
    if (b.shown.length > 200) b.shown.splice(0, b.shown.length - 200);
    save();
  }

  /* ---------- first-run chat ---------- */
  var CYCLE = [['Usually 21 to 25 days', 23], ['26 to 30 days', 28], ['31 to 35 days', 33], ['It varies a lot', 'varies'], ['Not sure', 'not_sure']];
  var GOALS = [['Understand my cycle', 'understand'], ['Trying to get pregnant', 'conceive'], ['Avoiding pregnancy', 'avoid'], ['Ease my symptoms', 'symptoms'], ['Mostly here to relax', 'relax']];
  var STAGES = [['Regular periods', 'cycling'], ['Teen, still settling', 'teen'], ['Pregnant', 'pregnant'], ['Had a baby recently or breastfeeding', 'postpartum'], ['Perimenopause', 'perimenopause'], ['Menopause (12+ months without a period)', 'menopause'], ['Not sure', 'unknown']];
  var AGES = [['Under 16', 0, 'under16'], ['16 or 17', 16, 'under18'], ['18 to 34', 18, '18-34'], ['35 to 44', 35, '35-44'], ['45 to 54', 45, '45-54'], ['55 or over', 55, '55+']];
  var CONTRA = [['None', 'none'], ['Condoms', 'condom'], ['Pill with breaks', 'combined_pill'], ['Pill without breaks', 'pill_continuous'], ['Mini pill', 'mini_pill'], ['Hormonal IUD', 'hormonal_iud'], ['Copper IUD', 'copper_iud'], ['Implant', 'implant'], ['Injection', 'injection'], ['Something else', 'other']];
  var FLAGS = [['PCOS (also called PMOS)', 'pcos'], ['Endometriosis', 'endometriosis'], ['Fibroids', 'fibroids'], ['Thyroid condition', 'thyroid'], ['Using HRT', 'hrt']];
  var TONES = [['Gentle', 'gentle'], ['Cheerful', 'cheerful'], ['Straight to the point', 'direct']];
  var NUDGES = [['Once a day', 'daily'], ['A few times a week', 'few'], ['Once a week', 'weekly'], ['Only when I open EveRhy', 'never']];

  function startOnboarding(opts) {
    opts = opts || {};
    var s = state(); if (!s) return false;
    var b = bucket(s), p = s.profile, draft = {};
    var steps = [];
    openSheet(function (box, close) {
      box.classList.add('sf-onboard'); box.setAttribute('aria-label', 'Getting started with EveRhy');
      var head = el('div', 'sf-head'), title = el('div', 'sf-title');
      var ovia = el('img', 'sf-ovia'); ovia.src = 'art/ovia/ovia.svg'; ovia.alt = ''; title.appendChild(ovia); /* Ovia herself; her name is in the first line */
      title.appendChild(el('h2', null, opts.redo ? 'Your answers' : 'Welcome to EveRhy')); head.appendChild(title);
      head.appendChild(button('Skip all', 'btn small', function () { finish(true); })); box.appendChild(head);
      var log = el('div', 'sf-chat'); log.setAttribute('aria-live', 'polite'); box.appendChild(log);
      var reply = el('div', 'sf-reply'); box.appendChild(reply);

      function say(text, img) {
        var m = el('div', 'sf-msg ebb');
        if (img) { var i = el('img', 'sf-hero'); i.src = 'art/safety/welcome.webp'; i.alt = 'A cosy window seat with a cup of tea and a sleeping cat'; m.appendChild(i); }
        m.appendChild(el('p', null, text)); log.appendChild(m); m.scrollIntoView && m.scrollIntoView({ block: 'end' });
      }
      function me(text) { log.appendChild(el('div', 'sf-msg me', text)); }
      function chips(list, fn, extra) {
        reply.innerHTML = '';
        var row = el('div', 'pills sf-chips');
        list.forEach(function (c) { row.appendChild(button(c[0], 'pill', function () { me(c[0]); fn(c[1], c); })); });
        (extra || []).forEach(function (c) { row.appendChild(button(c[0], 'pill quiet', function () { me(c[0]); fn(c[1], c); })); });
        reply.appendChild(row); var f = row.querySelector('button'); if (f) f.focus();
      }
      var SKIP = [['Skip', '__skip']];
      function go(i) {
        if (i >= steps.length) return finish(false);
        steps[i](function () { go(i + 1); });
      }

      steps.push(function (nx) {
        say(opts.redo ? 'Let’s go through your answers again. Skip anything you like; skipped answers stay as they were.' :
          'Hi, I’m Ovia. I’ll ask a few quick things so the app fits you. It takes about a minute, and you can skip any question.', !opts.redo);
        chips([['Let’s start', 1]], function (v) { if (v === '__later') finish(true); else nx(); }, [['Not now', '__later']]);
      });
      /* hard minimum age gate: asked first, before anything is saved; under 16 stops the flow */
      steps.push(function (nx) {
        say('First, how old are you?');
        chips(AGES.map(function (a) { return [a[0], a]; }), function (v) {
          if (v[2] === 'under16') { draft.ageBlocked = true; return under16(); }
          draft.ageRow = v; nx();
        }, SKIP);
      });
      function under16() {
        say('EveRhy is made for ages 16 and up, so this is as far as we can go together. If something is on your mind, please talk to a trusted grown-up.');
        reply.innerHTML = '';
        var row = el('div', 'pills sf-chips');
        row.appendChild(button('Close', 'btn primary', function () {
          p.age = 0; p.ageBand = 'under16'; b.ageBlockedAt = new Date().toISOString(); save();
          close(); /* no onboarded event: the gate is the end of the flow for an under-16 user */
        }));
        reply.appendChild(row); row.querySelector('button').focus();
      }
      steps.push(function (nx) { consentStep('core', 'onboarding', nx); });
      function consentStep(id, source, nx) {
        var pur = C.PURPOSES.filter(function (x) { return x.id === id; })[0];
        say(pur.title + '. ' + pur.body);
        chips([[pur.yes, true], [pur.no, false]], function (v) { C.record(s, id, v, source); save(); nx(); });
      }
      function health() { return C.consented(s, 'core'); }
      function ask(text, list, key, nx, after, extra) {
        if (!health()) return nx();
        say(text);
        chips(list, function (v, c) {
          if (v !== '__skip') draft[key] = v;
          if (after) after(v, c);
          nx();
        }, (extra || []).concat(SKIP));
      }
      steps.push(function (nx) {
        if (!health()) { say('That’s fine. I won’t keep any health notes, and you can change this any time in More, then Safety and privacy.'); return nx(); }
        say('When did your last period start?');
        reply.innerHTML = '';
        var row = el('div', 'sf-date'), input = el('input'); input.type = 'date'; input.max = today(); input.setAttribute('aria-label', 'Last period start date');
        if (p.lastPeriodStart) input.value = p.lastPeriodStart;
        row.appendChild(input);
        row.appendChild(button('Save date', 'btn primary small', function () {
          if (!input.value || input.value > today()) { input.focus(); return; }
          me(input.value); draft.lastPeriodStart = input.value; draft.lastPeriodNote = null; nx();
        }));
        reply.appendChild(row);
        var more = el('div', 'pills sf-chips');
        [['Not sure', 'not_sure'], ['No periods right now', 'none'], ['Skip', '__skip']].forEach(function (c) {
          more.appendChild(button(c[0], 'pill quiet', function () { me(c[0]); if (c[1] !== '__skip') { draft.lastPeriodStart = null; draft.lastPeriodNote = c[1]; } nx(); }));
        });
        reply.appendChild(more); input.focus();
      });
      steps.push(function (nx) { ask('How long is your cycle usually, from one period to the next?', CYCLE, 'cycleLength', nx); });
      steps.push(function (nx) {
        ask('What would you most like from EveRhy?', GOALS, 'goal', nx, function (v) {
          if (v === 'avoid') say('Noted. Just so you know, EveRhy can’t tell you safe days and isn’t a form of contraception.');
          if (v === 'conceive') say('Noted. EveRhy can help you keep track, but it can’t tell you your fertile days for certain.');
        });
      });
      steps.push(function (nx) { ask('Which of these fits you best right now?', STAGES, 'lifeStage', nx); });
      steps.push(function (nx) { ask('Are you using any contraception? This only helps EveRhy avoid alerts that don’t apply to you.', CONTRA, 'contraception', nx); });
      steps.push(function (nx) {
        if (!health()) return nx();
        say('Have you been told you have any of these? Pick any that apply.');
        reply.innerHTML = '';
        var picked = {}, row = el('div', 'pills sf-chips');
        FLAGS.forEach(function (f) {
          var b2 = button(f[0], 'pill', function () { picked[f[1]] = !picked[f[1]]; b2.setAttribute('aria-pressed', String(!!picked[f[1]])); });
          b2.setAttribute('aria-pressed', 'false'); row.appendChild(b2);
        });
        reply.appendChild(row);
        var acts = el('div', 'pills sf-chips');
        acts.appendChild(button('Done', 'btn primary small', function () {
          var list = Object.keys(picked).filter(function (k) { return picked[k]; });
          me(list.length ? FLAGS.filter(function (f) { return picked[f[1]]; }).map(function (f) { return f[0]; }).join(', ') : 'None of these');
          draft.flags = list; nx();
        }));
        acts.appendChild(button('Skip', 'pill quiet', function () { me('Skip'); nx(); }));
        reply.appendChild(acts);
      });
      steps.push(function (nx) {
        say('How would you like me to talk to you?');
        chips(TONES, function (v) { if (v !== '__skip') draft.tone = v; nx(); }, SKIP);
      });
      steps.push(function (nx) {
        say('How often should I check in?');
        chips(NUDGES, function (v) { if (v !== '__skip') draft.nudges = v; nx(); }, SKIP);
      });
      steps.push(function (nx) {
        if (draft.nudges === 'never') return nx();
        say('When should I stay quiet? I won’t nudge you between these times.');
        reply.innerHTML = '';
        var q = p.quietHours || { from: '22:00', to: '08:00' };
        var row = el('div', 'sf-date'), a = el('input'), z = el('input');
        a.type = z.type = 'time'; a.value = q.from; z.value = q.to; a.setAttribute('aria-label', 'Quiet from'); z.setAttribute('aria-label', 'Quiet until');
        row.appendChild(el('span', null, 'From')); row.appendChild(a); row.appendChild(el('span', null, 'to')); row.appendChild(z);
        row.appendChild(button('Save', 'btn primary small', function () { draft.quietHours = { from: a.value || '22:00', to: z.value || '08:00' }; me(draft.quietHours.from + ' to ' + draft.quietHours.to); nx(); }));
        reply.appendChild(row); a.focus();
      });
      steps.push(function (nx) { say('Last bit: a few choices about your information. Each one is separate, and you can change your mind any time.'); nx(); });
      ['physiology', 'research', 'partner', 'course'].forEach(function (id) { steps.push(function (nx) { consentStep(id, 'onboarding', nx); }); });

      function finish(skipped) {
        if (draft.ageRow) { draft.age = draft.ageRow[1]; draft.ageBand = draft.ageRow[2]; delete draft.ageRow; }
        Object.keys(draft).forEach(function (k) { p[k] = draft[k]; });
        if (!C.consented(s, 'core')) ['lastPeriodStart', 'lastPeriodNote', 'cycleLength', 'goal', 'lifeStage', 'age', 'ageBand', 'contraception', 'flags'].forEach(function (k) { if (k in draft) delete p[k]; });
        if (typeof p.cycleLength === 'string') { p.cycleLengthNote = p.cycleLength; p.cycleLength = null; }
        if (skipped && !b.onboardedAt) b.onboardSkippedAt = new Date().toISOString();
        else { b.onboardedAt = new Date().toISOString(); b.onboardVersion = ONBOARD_VERSION; }
        save();
        if (skipped) { close(); return done(); }
        say('All set. You can change any of this in More, then Safety and privacy.');
        reply.innerHTML = ''; reply.appendChild(button('Start playing', 'btn primary', function () { close(); done(); }));
        reply.querySelector('button').focus();
      }
      function done() {
        doc.dispatchEvent(new CustomEvent('ebb:onboarded', { detail: { profile: p, skipped: !b.onboardedAt } }));
        if (opts.onDone) opts.onDone(p);
      }
      go(0);
    });
    return true;
  }

  /* ---------- Safety and privacy panel ---------- */
  function fmt(iso) { try { return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return String(iso).slice(0, 10); } }
  function openPanel() {
    var s = state(); if (!s) return;
    bucket(s);
    openSheet(function (box, close) {
      box.classList.add('sf-panel'); box.setAttribute('aria-label', 'Safety and privacy');
      box.appendChild(el('h2', null, 'Safety and privacy'));

      var help = el('section', 'sf-card');
      help.appendChild(el('h3', null, 'Need to talk to someone?'));
      help.appendChild(el('p', 'muted small', 'Free, confidential help in Singapore, any time of day.'));
      help.appendChild(button('Show help numbers', 'btn primary', function () { close(); showCrisis(); }));
      box.appendChild(help);

      var cs = el('section', 'sf-card'); cs.appendChild(el('h3', null, 'Your choices'));
      cs.appendChild(el('p', 'muted small', 'Each one is separate. Turning one off takes effect straight away. Notes already saved stay on this phone.'));
      C.PURPOSES.forEach(function (pur) {
        var row = el('div', 'sf-consent'), on = C.consented(s, pur.id), last = C.latest(s, pur.id);
        var txt = el('div'); txt.appendChild(el('b', null, pur.title)); txt.appendChild(el('span', 'muted small', on ? 'On since ' + fmt(last.at) : last ? 'Off since ' + fmt(last.at) : 'Not chosen yet (off)'));
        row.appendChild(txt);
        var t = button(on ? 'Turn off' : 'Turn on', 'pill', function () {
          var nowOn = !C.consented(s, pur.id); C.record(s, pur.id, nowOn, 'panel'); save();
          close(); openPanel();
        });
        t.setAttribute('aria-label', (on ? 'Turn off: ' : 'Turn on: ') + pur.title);
        row.appendChild(t);
        var more = el('details', 'sf-why'); more.appendChild(el('summary', null, 'What this means')); more.appendChild(el('p', 'small', pur.body));
        var hist = C.history(s, pur.id);
        if (hist.length) more.appendChild(el('p', 'muted small', 'History: ' + hist.map(function (e) { return (e.granted ? 'on ' : 'off ') + fmt(e.at); }).join(', ')));
        row.appendChild(more);
        cs.appendChild(row);
      });
      box.appendChild(cs);

      var ob = el('section', 'sf-card'); ob.appendChild(el('h3', null, 'Your answers'));
      var p = s.profile || {};
      var bits = [];
      if (p.lastPeriodStart) bits.push('Last period ' + p.lastPeriodStart); else if (p.lastPeriodNote) bits.push('Last period: ' + p.lastPeriodNote.replace('_', ' '));
      if (p.lifeStage) bits.push('Life stage: ' + p.lifeStage);
      if (p.tone) bits.push('Tone: ' + p.tone);
      if (p.quietHours) bits.push('Quiet ' + p.quietHours.from + ' to ' + p.quietHours.to);
      ob.appendChild(el('p', 'muted small', bits.length ? bits.join(' · ') : 'Nothing saved yet.'));
      ob.appendChild(button('Go through the questions again', 'btn', function () { close(); startOnboarding({ redo: true }); }));
      box.appendChild(ob);

      var rl = el('section', 'sf-card'); rl.appendChild(el('h3', null, 'What EveRhy watches for'));
      rl.appendChild(el('p', 'muted small', 'A short list of warning signs, checked on this phone. These are starting points for the study’s doctors to confirm. EveRhy doesn’t diagnose anything.'));
      var ul = el('ul', 'sf-rules small');
      (R ? R.RULES : []).forEach(function (r) { var li = el('li'); li.appendChild(el('b', null, r.id + ' v' + r.version + ' ')); li.appendChild(doc.createTextNode(r.threshold)); ul.appendChild(li); });
      rl.appendChild(ul); box.appendChild(rl);

      var acts = el('div', 'sheet-actions'); acts.appendChild(button('Close', 'btn primary', close)); box.appendChild(acts);
    });
  }

  function onReady() {
    var s = state(); if (!s) return;
    var b = bucket(s);
    if (root.EbbGame.registerPanel && !doc.getElementById('panel-safety')) root.EbbGame.registerPanel({ id: 'safety', label: 'Safety and privacy', open: openPanel });
    if (!b.onboardedAt && !b.onboardSkippedAt) startOnboarding();
  }
  if (root.EbbGame && root.EbbGame._ready) onReady(); else doc.addEventListener('ebb:ready', onReady, { once: true });

  root.EbbSafetyUi = { showAlert: showAlert, showAlerts: showAlerts, showCrisis: showCrisis, startOnboarding: startOnboarding, openPanel: openPanel, isOpen: isOpen, HELP: HELP, ONBOARD_VERSION: ONBOARD_VERSION };
})(window);
