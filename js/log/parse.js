/* Ebb log parser: turns what she types, in her own words, into candidate observations. Deterministic and local:
 * no model and no network. English first. Everything it finds is only a suggestion until she confirms the card.
 * Each clause keeps its own negation ("no cramps") and hedging ("maybe a bit bloated"), stored as confidence. */
(function (root) {
  'use strict';

  function pad(n) { return String(n).padStart(2, '0'); }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addDays(s, n) { var p = s.split('-'); return iso(new Date(+p[0], +p[1] - 1, +p[2] + n)); }
  function weekday(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]).getDay(); }

  var NUM = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, a: 1, an: 1 };
  var DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  function num(w) { if (w == null) return null; w = String(w).toLowerCase(); if (/^\d+(\.\d+)?$/.test(w)) return +w; return w in NUM ? NUM[w] : null; }

  function clean(text) {
    return String(text || '').toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
  }

  /* ---------- dates: one phrase per clause, a single phrase applies to the whole message ---------- */
  var WD = '(sun|mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat)(?:day|nesday|sday|rsday|urday)?';
  function dayIndex(w) { return DAYS.indexOf(w.slice(0, 3)); }
  function lastWeekday(today, idx, strict) {
    var back = (weekday(today) - idx + 7) % 7;
    if (back === 0 && strict) back = 7;
    return addDays(today, -back);
  }
  function findDate(t, today) {
    var m;
    if ((m = t.match(new RegExp('\\bsince (?:last )?' + WD + '\\b')))) return { start: lastWeekday(today, dayIndex(m[1]), true), end: today, phrase: m[0] };
    if ((m = t.match(/\bsince yesterday\b/))) return { start: addDays(today, -1), end: today, phrase: m[0] };
    if ((m = t.match(/\bsince (?:the )?(\d{1,2})(?:st|nd|rd|th)?\b/))) {
      var dd = +m[1], p = today.split('-'), cand = p[0] + '-' + p[1] + '-' + pad(dd);
      if (dd >= 1 && dd <= 31) { if (cand > today) { var prev = new Date(+p[0], +p[1] - 2, dd); cand = iso(prev); } return { start: cand, end: today, phrase: m[0] }; }
    }
    if ((m = t.match(/\b(\d{1,2})(?:st|nd|rd|th)? (?:of )?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]* (\d{1,2})(?:st|nd|rd|th)?\b/))) {
      var day = +(m[1] || m[4]), mon = MONTHS.indexOf((m[2] || m[3]).slice(0, 3)), y = +today.slice(0, 4);
      var s = y + '-' + pad(mon + 1) + '-' + pad(day);
      if (s > today) s = (y - 1) + '-' + pad(mon + 1) + '-' + pad(day);
      if (day >= 1 && day <= 31) return { start: s, end: s, phrase: m[0] };
    }
    if ((m = t.match(new RegExp('\\b(last |on |this past )?' + WD + '\\b')))) {
      var d1 = lastWeekday(today, dayIndex(m[2]), /last|past/.test(m[1] || ''));
      return { start: d1, end: d1, phrase: m[0] };
    }
    if ((m = t.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|a couple of|a couple|a few|few) days? ago\b/))) {
      var n = /couple/.test(m[1]) ? 2 : /few/.test(m[1]) ? 3 : num(m[1]);
      if (n != null && n <= 60) { var d2 = addDays(today, -n); return { start: d2, end: d2, phrase: m[0] }; }
    }
    if ((m = t.match(/\b(a|one|last) week ago\b|\blast week\b/))) { var d3 = addDays(today, -7); return { start: d3, end: d3, phrase: m[0], rough: true }; }
    if ((m = t.match(/\b(the )?day before yesterday\b/))) { var d4 = addDays(today, -2); return { start: d4, end: d4, phrase: m[0] }; }
    if ((m = t.match(/\byesterday\b/))) { var d5 = addDays(today, -1); return { start: d5, end: d5, phrase: m[0] }; }
    if ((m = t.match(/\blast night\b/))) { var d6 = addDays(today, -1); return { start: d6, end: d6, phrase: m[0], night: true }; }
    if ((m = t.match(/\b(today|this morning|this afternoon|this evening|tonight|right now|just now)\b/))) return { start: today, end: today, phrase: m[0] };
    return null;
  }

  /* ---------- clauses, negation and hedging ---------- */
  function clauses(t) {
    return t.split(/(?<!\d)\.(?!\d)|[;!?\n]+|,\s*|\s+but\s+|\s+(?:and|also|plus)\s+(?!a half)(?=(?:no|not|i|i'm|im|my|some|a|bit|slept|got|had|feeling|feel|felt|period|cramps?|pain|headache\w*|bloat\w*|tired|mood|energy|still|heavy|light|spotting|maybe|kind|sort)\b)|\s+then\s+/)
      .map(function (c) { return c.trim(); }).filter(Boolean);
  }
  var HEDGE = /\b(maybe|might|perhaps|possibly|probably|i think|i guess|i suppose|kind of|kinda|sort of|sorta|not sure|unsure|could be|seems|seem to|a bit\?|ish)\b|-ish\b/;
  var NEG = /\b(no|not|never|without|zero|none|nor|didn't|didnt|don't|dont|doesn't|doesnt|haven't|havent|hasn't|hasnt|isn't|isnt|wasn't|wasnt|aren't|arent|weren't|werent|hardly any|free of)\b/g;
  var SOFT_NEG = /\bnot (too|that|so|very|as) (bad|much|strong|painful|sore)\b|\bnot sure\b|\bnot much\b/g;

  function negatedAt(clause, index) {
    var stripped = clause.replace(SOFT_NEG, function (s) { return s.replace(/./g, '_'); });
    NEG.lastIndex = 0; var m;
    while ((m = NEG.exec(stripped))) { if (m.index + m[0].length <= index) return true; }
    return false;
  }

  /* ---------- vocabulary ---------- */
  var SYMPTOMS = [
    ['cramps', /\bcramp(s|y|ing)?\b/],
    ['bloating', /\bbloat(ed|ing|y)?\b|\bswollen (tummy|belly|stomach)\b/],
    ['migraine', /\bmigraines?\b/],
    ['headache', /\bhead ?aches?\b|\bheadach(y|ey)\b|\bhead (hurts|is pounding|pounding)\b/],
    ['breast tenderness', /\b(sore|tender|painful|achy|swollen) (breasts?|boobs?|chest|nipples?)\b|\bbreast (tenderness|pain)\b|\b(breasts?|boobs?) (are |feel |felt |were )?(so |really |a bit )?(sore|tender|hurt\w*|achy)\b/],
    ['acne', /\b(acne|pimples?|breakouts?|broke out|breaking out|zits?)\b/],
    ['vomiting', /\b(threw up|throwing up|vomit\w*|been sick)\b/],
    ['nausea', /\b(nausea|nauseous|nauseated|queasy|feel(ing)? sick|felt sick)\b/],
    ['diarrhoea', /\b(diarrh?o?ea|diarrhea|loose stools?|runny tummy|the runs)\b/],
    ['constipation', /\bconstipat\w*\b/],
    ['cravings', /\bcrav(ings?|ing|ed)\b/],
    ['dizziness', /\b(dizzy|dizziness|light ?-?headed|woozy)\b/],
    ['hot flushes', /\bhot (flush|flash)(es)?\b/],
    ['night sweats', /\bnight sweats?\b/],
    ['discharge', /\bdischarge\b/]
  ];
  var MOODS = [
    ['low', /\b(sad|teary|tearful|crying|cried|miserable|weepy|feeling low|feel low|felt low|low mood|mood (is |was )?low|(feeling|feel|felt|so|bit|pretty|quite|really) down|blue)\b/],
    ['anxious', /\b(anxious|anxiety|worried|worrying|nervous|on edge|stressed( out)?|stress|overwhelmed|panicky|jittery)\b/],
    ['irritable', /\b(irritable|irritated|grumpy|snappy|cranky|angry|annoyed|short[- ]tempered|frustrated)\b/],
    ['mood swings', /\b(mood swings?|moody|emotional|up and down)\b/],
    ['good', /\b(happy|cheerful|content|good mood|great mood|in a good mood|upbeat|calm|relaxed|(feel|feeling|felt) (good|great|fine|ok|okay|alright|better))\b/]
  ];
  var ENERGY = [
    ['low', /\b(tired|exhausted|drained|wiped( out)?|no energy|low energy|zero energy|sluggish|fatigued?|knackered|sleepy|lethargic|worn out|shattered)\b/],
    ['high', /\b(energetic|full of energy|lots of energy|loads of energy|high energy|buzzing|energi[sz]ed|good energy|lively)\b/],
    ['normal', /\b(normal energy|ok energy|okay energy|energy (is |was |feels )?(ok|okay|fine|normal|alright))\b/]
  ];
  var PAIN_WORD = /\b(pain|painful|pains|hurts?|hurting|hurt|ache|aches|aching|achy|sore|cramp\w*)\b/;
  var PAIN_LEVELS = [
    [9, /\b(unbearable|worst (ever|pain)|excruciating|agony|can't move|cannot move)\b/],
    [8, /\b(severe|terrible|awful|horrible|killing me|so bad|really really bad)\b/],
    [7, /\b(really bad|very bad|really painful|very painful|really sore|intense)\b/],
    [6, /\b(bad|strong|quite bad|pretty bad|painful)\b/],
    [5, /\b(moderate|medium)\b/],
    [3, /\b(mild|light|manageable|not too bad|not that bad|not so bad|not very bad|not much)\b/],
    [2, /\b(slight|slightly|a bit|a little|little bit|tiny bit|twinge\w*|niggl\w*)\b/]
  ];
  var LOCATIONS = [
    ['lower back', /\blower back\b/], ['back', /\bback\b/], ['pelvis', /\bpelvi(s|c)\b/],
    ['lower abdomen', /\blower (tummy|belly|abdomen|stomach)\b|\bwomb\b|\buterus\b/],
    ['abdomen', /\b(stomach|tummy|belly|abdomen|abdominal)\b/], ['legs', /\b(legs?|thighs?)\b/],
    ['side', /\b(left side|right side|ovar(y|ies)|side)\b/], ['joints', /\bjoints?\b/], ['head', /\bhead\b/]
  ];

  var BLEED_CTX = /\b(flow|period|bleed\w*|bled|blood|day|pads?|tampons?|cup|clots?|clotting)\b/;
  var NOT_BLEEDING = /\bperiod (pain|pains|cramps?|symptoms?|app|tracker|tracking|pants)\b|\b(before|waiting for|expecting|due for) (my |the )?period\b|\bperiod (is |was )?(late|due)\b|\bno sign of (my |the )?period\b|\bpre-?period\b/g;

  function bleeding(c, carried) {
    var t = c.replace(NOT_BLEEDING, function (s) { return s.replace(/./g, '_'); });
    if (/\b(no|not|without|zero) (bleeding|blood|period|spotting|bleed)\b|\bperiod'?s? (has |is )?(stopped|ended|finished|over|gone|done)\b|\b(stopped|finished|done) bleeding\b|\bbleeding (has |is )?(stopped|ended|over)\b|\bno more (bleeding|blood|period)\b|\b(didn't|haven't|hasn't|did not|have not) (bleed|bled)\b/.test(t)) return { value: 'none' };
    if (/\bspott(ing|ed|y)\b|\bspots? of blood\b|\bbrown (discharge|blood)\b|\bpink (discharge|when i wiped|on the tissue)\b|\bonly when (i )?wip(e|ed|ing)\b/.test(t)) return { value: 'spotting' };
    var ctx = BLEED_CTX.test(t) || (carried && /^(and |then |but )?(\w+ )?(very |super |really )?(light|lighter|heavy|heavier|medium|moderate)\w*( again| now| today| yesterday)?$/.test(t.replace(/\b(today|yesterday|this morning|now)\b/, '').trim()));
    if (/\b(soak(ed|ing)( through)?|flood(ing|ed)?|changing (my )?(pads?|tampons?) every)\b/.test(t) || (ctx && /\b(very |super |really )?heavy\b/.test(t))) return { value: 'heavy' };
    if (ctx && /\b(medium|moderate|normal|regular|average)\b/.test(t)) return { value: 'medium' };
    if (ctx && /\b(light|lighter|lightish)\b/.test(t)) return { value: 'light' };
    if (/\b(on my period|got my period|period (came|started|arrived|is here|began|has started|has come|showed up|turned up)|first day of (my )?period|day \d+ of (my )?period|still bleeding|still on my period|my period|period|periods|menstruat\w*|time of the month|aunt flo)\b/.test(t)) return { value: 'period' };
    if (/\b(bleed(ing|s)?|bled|blood)\b/.test(t)) return { value: 'ambiguous' };
    return null;
  }

  function painIn(c, negated, hedged) {
    var m, value = null, estimated = false, has = PAIN_WORD.test(c);
    if ((m = c.match(/\b(10|[0-9])\s*(?:\/|out of)\s*10\b/))) value = +m[1];
    else if (has && (m = c.match(/\b(?:pain|cramps?|level|score|at|is|was|a|an|about|around)\s+(?:level\s+|score\s+|of\s+|is\s+|was\s+|at\s+|a\s+|about\s+)?(10|[0-9])\b(?!\s*(h|hrs?|hours?|days?|am|pm|:))/))) value = +m[1];
    else if (has && (m = c.match(/\b(10|[0-9])\s+(pain|cramps)\b/))) value = +m[1];
    if (/\b(no pain|pain[- ]free|painless|no cramps|doesn't hurt|didn't hurt|not hurting|no aches?)\b/.test(c) && value == null) return { value: 0, location: [], estimated: false, negated: true };
    if (!has && value == null) return null;
    if (value == null) for (var i = 0; i < PAIN_LEVELS.length; i++) if (PAIN_LEVELS[i][1].test(c)) { value = PAIN_LEVELS[i][0]; estimated = true; break; }
    var loc = [];
    LOCATIONS.forEach(function (L) { if (L[1].test(c) && !(L[0] === 'back' && loc.indexOf('lower back') >= 0) && !(L[0] === 'abdomen' && loc.indexOf('lower abdomen') >= 0)) loc.push(L[0]); });
    if (/\bhead ?ache|migraine/.test(c)) loc = loc.filter(function (l) { return l !== 'head'; });
    var cramps = /\bcramp/.test(c);
    if (!loc.length && cramps) loc = ['lower abdomen'];
    /* cramps on their own are a symptom; a pain entry needs a rating or a place */
    if (value == null && (!loc.length || (cramps && !/\b(pain|hurts?|ache|aching|sore)\b/.test(c)))) return null;
    if (negated && value == null) value = 0;
    return { value: value, location: loc, estimated: estimated };
  }

  function sleepIn(c, date) {
    var out = [], m, hours = null;
    var H = '(\\d{1,2}(?:\\.\\d)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)';
    if ((m = c.match(new RegExp('\\b' + H + '\\s*(?:and a half\\s*)?(?:h|hr|hrs|hours?)\\b(?:\\s*(?:of\\s*)?sleep)?'))) && /\b(sleep|slept|slep|got|had|in bed|night|kip)\b|hours? sleep|h sleep|hrs sleep/.test(c)) {
      hours = num(m[1]); if (/and a half/.test(m[0])) hours += 0.5;
    } else if ((m = c.match(new RegExp('\\bslept (?:for )?(?:about |around |like |maybe |roughly |only |just |barely )?' + H + '\\b(?!\\s*(am|pm|:|o\'?clock))')))) hours = num(m[1]);
    if (hours != null && hours >= 0 && hours <= 16) out.push({ type: 'sleep', value: hours, unit: 'h' });
    var neg = /\b(didn't|didnt|did not|not|couldn't|couldnt|can't|cant|never)\b/.test(c);
    if (/\b(slept|sleep|sleeping)\b/.test(c) || /\binsomnia\b|\bwoke up|\bawake\b/.test(c)) {
      var q = null;
      if (/\b(insomnia|barely slept|hardly slept|couldn't sleep|couldnt sleep|could not sleep|can't sleep|cant sleep|no sleep|restless|tossed|broken sleep|woke up (a lot|loads|several times|lots)|kept waking|up all night|slept (badly|poorly|terribly|awful|awfully|bad))\b/.test(c)) q = 'poor';
      else if (/\b(slept|sleep) (well|great|good|fine|ok|okay|soundly|like a log|deeply)\b|\bgood (night'?s )?sleep\b|\bgreat sleep\b/.test(c)) q = neg ? 'poor' : 'good';
      if (q) out.push({ type: 'sleepQuality', value: q });
    }
    return out;
  }

  /* ---------- whole-message intents ---------- */
  function intentOf(t) {
    if (/^(please )?(undo|undo (that|it|this|last|the last one|my last entry)|take (that|it) back|delete (that|the last one)|remove (that|the last one)|scratch that)[.! ]*$/.test(t)) return 'undo';
    if (/\bsame as yesterday\b/.test(t)) return 'same';
    if (/^(not sure|unsure|i'?m not sure|i don'?t know|idk|dunno|no idea|hard to say)[.! ]*$/.test(t)) return 'notsure';
    if (/^(all good|all fine|all ok(ay)?|nothing (new|to report|today|much)|everything'?s? (is )?(fine|ok(ay)?|good|normal)|no symptoms?( today)?|nothing|fine|good|ok|okay|normal day)[.! ]*$/.test(t)) return 'allgood';
    if (/^(how|when|what|what's|whats|which|am i|is my|was my|were my|show me|tell me|did i|do i|will my|average|how's|hows)\b/.test(t) && /\b(cycle|cycles|period|periods|bleed\w*|day|days|log\w*|next|last|late|long|ring)\b/.test(t)) return 'question';
    return 'log';
  }

  function conf(hedged, negated, estimated) { var c = hedged ? 0.55 : negated ? 0.85 : 0.9; if (estimated) c = Math.min(c, 0.6); return c; }

  function parse(text, today) {
    today = today || iso(new Date());
    var t = clean(text), res = { text: String(text || ''), intent: t ? intentOf(t) : 'empty', items: [], clarify: null };
    if (res.intent !== 'log') return res;
    var parts = clauses(t), dates = parts.map(function (c) { return findDate(c, today); });
    var prevBleed = false, found = dates.filter(Boolean), carry = found.length ? found[0] : null, single = found.length === 1 ? found[0] : null;
    parts.forEach(function (c, i) {
      var d = single || dates[i] || carry || { start: today, end: today };
      if (dates[i]) carry = dates[i];
      var hedged = HEDGE.test(c), items = [];
      function add(type, value, extra, at) {
        var negated = at != null && negatedAt(c, at);
        var it = { type: type, value: value, unit: null, start: d.start, end: d.end, negated: negated, hedged: hedged, clause: c };
        if (extra) Object.keys(extra).forEach(function (k) { it[k] = extra[k]; });
        it.confidence = conf(hedged, it.negated, it.estimated);
        items.push(it);
      }
      var b = bleeding(c, prevBleed);
      if (b) prevBleed = true;
      if (b) add('bleeding', b.value, b.value === 'ambiguous' ? { ambiguous: true } : null, null);
      var cm = c.match(/\b(clots?|clotting|clumps)\b/);
      if (cm && !/\b(no|not|without)\b[^,]*\b(clots?|clotting)\b/.test(c)) add('clots', /\b(big|large|huge|golf|coin|bigger than|massive)\b/.test(c) ? 'large' : 'yes', null, null);
      else if (cm) add('clots', 'yes', { negated: true }, null);
      SYMPTOMS.forEach(function (S) {
        var m = c.match(S[1]); if (!m) return;
        if (S[0] === 'discharge' && b && b.value === 'spotting') return;
        if (S[0] === 'nausea' && /\b(threw up|vomit)/.test(c)) return;
        add('symptom', S[0], null, m.index);
      });
      MOODS.forEach(function (M) { var m = c.match(M[1]); if (m) add('mood', M[0], null, m.index); });
      var em = null;
      ENERGY.forEach(function (E) { var m = !em && c.match(E[1]); if (m) { em = m; var neg = negatedAt(c, m.index); add('energy', neg ? (E[0] === 'low' ? 'normal' : 'low') : E[0], { negated: false, estimated: neg }, null); } });
      var pm = c.match(PAIN_WORD), p = painIn(c, pm ? negatedAt(c, pm.index) : false, hedged);
      if (p) add('pain', p.value, { unit: '/10', location: p.location, estimated: p.estimated, negated: !!p.negated || (pm ? negatedAt(c, pm.index) : false) }, null);
      var sd = d.night ? { start: d.start, end: addDays(d.start, 1) } : d;
      sleepIn(c, sd).forEach(function (s) { add(s.type, s.value, { unit: s.unit || null, start: sd.start, end: sd.end }, null); });
      Array.prototype.push.apply(res.items, items);
    });
    /* one entry per type, value and day: the most confident wins */
    var seen = {};
    res.items = res.items.filter(function (it) {
      var k = it.type + '|' + (it.type === 'bleeding' || it.type === 'pain' || it.type === 'sleep' || it.type === 'energy' || it.type === 'sleepQuality' ? '' : it.value) + '|' + it.start;
      if (seen[k] && seen[k].confidence >= it.confidence) return false;
      if (seen[k]) res.items.splice(res.items.indexOf(seen[k]), 1);
      seen[k] = it; return true;
    });
    if (!res.items.length) res.intent = 'unknown';
    return res;
  }

  root.EbbLogParse = { parse: parse, findDate: findDate, clauses: clauses, iso: iso, addDays: addDays };
})(typeof window !== 'undefined' ? window : globalThis);
