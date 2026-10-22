/* Ebb crisis language check: does this note say SHE may be thinking of suicide or self-harm, now?
 * Deterministic and clause-aware. A note is split into small clauses (punctuation, and/but/so/also/though); a match
 * only counts when, inside its own clause:
 *   - no denial comes before it ("I'm not suicidal", "I would never hurt myself", "dun want to die"),
 *   - the speaker is her, not someone else ("my friend wants to die", "she said she was suicidal"),
 *   - it is not a story, film or news item, and not clearly in the past ("I used to self-harm years ago"),
 *   - it is not an everyday phrase or accident ("cut myself chopping onions", "want to die my hair").
 * Phrases that carry their own negation ("don't want to live") are patterns in their own right, so the negation
 * inside a match never cancels it. When unsure, it errs towards showing help: a calm card costs less than a miss. */
(function (root) {
  'use strict';
  var VERSION = 'ebb-crisis-2026-10-22.1';

  /* self: the phrase itself says it is about her (myself, my life, without me), so no subject check is needed */
  var P = [
    { self: true, re: /\b(kill|killing|killed|hang|hanging|hanged|drown|drowning|poison|poisoning|hurt|hurting|harm|harming|cut|cutting|burn|burning|unalive|unaliving|starve|starving)\s+my\s*self\b/ },
    { self: true, re: /\bk\.?m\.?s\b/ },
    { re: /\bself[\s-]*harm(ing|ed|s)?\b|\bself[\s-]*injur(y|e|ing)\b/ },
    { re: /\bsuicid(e|al)\b/ },
    { self: true, re: /\b(end|ending|take|taking)\s+my\s+(own\s+)?life\b/ },
    { re: /\bend\s+(it\s+all|everything)\b/ },
    { re: /\b(want|wanna|wan|wanted|wish|wishing|going|gonna|ready|planning|plan|thinking|think|thought)\s+(to\s+|of\s+|about\s+)?(die|dying|be\s+dead|not\s+exist)\b/ },
    { self: true, re: /\bwish\s+i\s+(was|were|am)\s+(dead|never\s+born|not\s+here|not\s+alive|gone)\b|\bwish\s+i\s+(could\s+)?(die|disappear\s+forever|never\s+wake\s+up)\b/ },
    { self: true, re: /\bbetter\s+off\s+without\s+me\b/ },
    { re: /\bbetter\s+off\s+dead\b/ },
    { re: /\b(don'?t|do\s+not|dun|no\s+longer|never)\s+want\s+to\s+(live|be\s+alive|wake\s+up|exist|be\s+here\s+anymore)\b/ },
    { re: /\bno\s+(reason|point)\s+(to\s+|in\s+)?(live|living|going\s+on|be\s+alive)\b|\bnothing\s+to\s+live\s+for\b|\b(not|isn'?t)\s+worth\s+living\b/ },
    { re: /\b(can'?t|cannot|can\s+not)\s+(go\s+on|do\s+this\s+anymore|take\s+it\s+anymore|keep\s+living)\b/ },
    { self: true, re: /\b(don'?t|dont|dun)\s+think\s+i\s+can\s+(go\s+on|keep\s+going)\b/ },
    { self: true, re: /\b(not\s+sure|don'?t\s+know)\s+(if|whether)\s+i\s+want\s+to\s+(live|be\s+alive|go\s+on)\b/ },
    { re: /\b(want|wanna|wan|feel\s+like|thinking\s+of|think\s+of)\s+(to\s+)?jump(ing)?\s+(down|off)\b/ },
    { re: /\bjump(ing)?\s+(down|off)\s+(from\s+)?(the\s+|my\s+|our\s+|a\s+)?(block|building|roof|hdb|flat|bridge|window|ledge|balcony)\b/ },
    { re: /\bjump(ing)?\s+(in\s+front\s+of\s+(a|the)\s+)?(mrt|train|track|tracks|bus|lorry)\b/ },
    { re: /\boverdos(e|ed|ing)\b|\btoo\s+many\s+pills\s+on\s+purpose\b/ },
    { self: true, re: /\b(take|took|swallow|swallowed)\s+all\s+(of\s+)?my\s+(pills|meds|medicine|medication)\b/ },
    { re: /不想活|自杀|自殺|轻生|想死(?!你|您|他|她|我了|了你)/ }
  ];

  var DENY = /\b(not|never|nvr|no|dun|dont|cant|wont|didnt|doesnt|isnt|arent|wasnt|wouldnt|shouldnt|couldnt|havent|hasnt|stopped|denies|deny)\b|\b\w+n't\b|\bno\s+longer\b|\bfree\s+of\b/;
  var NOT_DENY = /\b(can'?t|cannot|cant)\s+(stop|help|sleep|cope|eat|breathe|anymore)\b|\b(don'?t|dont|dun)\s+know\b|\bdunno\b|\bidk\b|\bnot\s+(gonna|going\s+to)\s+lie\b|\bngl\b|\b(not|no)\s+(kidding|joking|joke)\b|\bnot\s+(ok|okay|fine|alright|well|coping|happy|good)\b|\bnot\s+doing\s+(well|ok|okay|good)\b|\bno\s+(one|body|energy|hope|more|point|reason)\b|\bnobody\b|\bnothing\b|\bnot\s+sure\b/g;
  var FIRST = /\b(i|i'?m|im|i'?ve|ive|i'?d|i'?ll|me|myself|my)\b/g;
  var THIRD = /\b(he|she|they|he'?s|she'?s|they'?re|him|her|them|someone|somebody|friend|friends|sister|brother|mum|mom|mother|dad|father|aunt|aunty|auntie|uncle|cousin|colleague|classmate|boyfriend|girlfriend|bf|gf|husband|wife|neighbou?r|patient|kid|son|daughter|grandma|grandpa|ah\s+ma|ah\s+gong)\b/g;
  var STORY = /\b(in|watched|watching|reading|read|saw|seeing|about)\s+(a|the|this|that|my)?\s*(movie|film|drama|k-?drama|show|series|episode|book|novel|news|article|documentary|video|podcast)\b|\b(the|a|main)\s+character\b|\bsuicide\s+(prevention|awareness|hotline\s+poster)\b|\b(song|lyrics)\b/;
  var PAST = /\b(used\s+to|years\s+ago|long\s+time\s+ago|when\s+i\s+was\s+(young|younger|little|a\s+teen|a\s+teenager|a\s+kid|in\s+(school|uni|poly|jc|secondary))|in\s+the\s+past|back\s+then|as\s+a\s+teen(ager)?|history\s+of|recovered|in\s+recovery)\b/;
  var BENIGN_BEFORE = /\b(accidentally|by\s+accident|while\s+(cooking|shaving|chopping|cutting|opening|gardening)|when\s+(cooking|shaving|chopping|opening))\b|\d\s*$/;
  var BENIGN_AFTER = /^\s*(my\s+|the\s+|her\s+)?hair\b|^\s*die\b|^\s*(a\s+)?(slice|piece|bit)\b|^\s*(while|when)\s+(cooking|shaving|chopping|cutting|opening|gardening)\b|^\s*(on|with)\s+(a|the|some)\s+(knife|paper|glass|can|tin)\b|^\s*(accidentally|by\s+accident)\b|^\s*on\s+(bubble\s+tea|coffee|caffeine|sugar|chocolate|carbs|kdrama|drama|netflix)\b/;

  function norm(t) {
    return String(t == null ? '' : t).toLowerCase().replace(/[‘’ʼ`]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ');
  }
  function clauses(t) {
    return t.split(/[.!?;,:\n。，！？"()]+|\s(?:and|but|so|also|though|although|however|cos|because|bcos|bc|then)\s/);
  }
  function lastIndex(re, s) {
    var m, at = -1; re.lastIndex = 0;
    while ((m = re.exec(s))) { at = m.index; if (m[0] === '') re.lastIndex++; }
    return at;
  }
  /* a denial only counts in the five words just before the phrase */
  function denied(before) {
    var words = before.replace(NOT_DENY, ' _ ').trim().split(/\s+/).slice(-5).join(' ');
    return DENY.test(words);
  }

  function matchClause(c) {
    for (var i = 0; i < P.length; i++) {
      var m = P[i].re.exec(c);
      if (!m) continue;
      var before = c.slice(0, m.index), after = c.slice(m.index + m[0].length);
      if (BENIGN_AFTER.test(after) || BENIGN_BEFORE.test(before)) continue;
      if (STORY.test(c) || PAST.test(c)) continue;
      if (!P[i].self && lastIndex(THIRD, before) > lastIndex(FIRST, before)) continue; /* someone else is the subject */
      if (denied(before)) continue;
      return { pattern: i, text: m[0] };
    }
    return null;
  }

  /* true when the note contains self-harm or suicidal language about her, now */
  function crisis(text) { return !!explain(text); }
  function explain(text) {
    var t = norm(text); if (!t.trim()) return null;
    var cs = clauses(t);
    for (var i = 0; i < cs.length; i++) { var m = matchClause(cs[i]); if (m) { m.clause = cs[i].trim(); return m; } }
    return null;
  }

  root.EbbCrisis = { crisis: crisis, explain: explain, VERSION: VERSION };
})(typeof window !== 'undefined' ? window : globalThis);
