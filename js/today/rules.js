/* Ebb daily loop, pure rules: three gentle invitations a day chosen from the date, a check for each that reads game state
 * only (watered beds, saved practice time, offerings, places she walked to, whether a journal line exists),
 * hearts that only ever go up, and a count of days with a heart that pauses on a missed day and never resets.
 * Nothing here reads what she logged about her body. A practice counts as time spent, never by what was noticed.
 * Nothing here is owed: an invitation left alone costs nothing. */
(function (root) {
  'use strict';
  var PER_DAY = 3, CAP = 4, KEEP_DAYS = 60;

  /* label: what the card says; where: the place it happens, shown as a hint; icon: a frame of art/ui/icons.webp */
  var INVITES = {
    water: { label: 'Water the garden', where: 'Farm', icon: 0 },
    sit: { label: 'Sit for a short practice', where: 'Bedroom cushion', icon: 4 },
    pond: { label: 'Visit the pond', where: 'Waterfall', icon: 2 },
    walk: { label: 'Take a slow walk to the waterfall', where: 'Waterfall', icon: 5 },
    journal: { label: 'Write a line in the journal', where: 'Bedroom desk', icon: 3 }
  };
  var ORDER = ['water', 'sit', 'pond', 'walk', 'journal'];

  /* ---------- picking: the same three all day, different on other days ---------- */
  function hash(str) { /* FNV-1a, 32-bit */
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function picks(date) {
    var seed = hash('ebb-today:' + String(date)), pool = ORDER.slice(), out = [];
    while (out.length < PER_DAY && pool.length) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      out.push(pool.splice(seed % pool.length, 1)[0]);
    }
    return out.sort(function (a, b) { return ORDER.indexOf(a) - ORDER.indexOf(b); });
  }

  /* ---------- her record: days keyed by date, a running total, a count of days with a heart ---------- */
  function ensure(d) {
    if (!d || typeof d !== 'object') d = {};
    if (!d.days || typeof d.days !== 'object') d.days = {};
    if (typeof d.total !== 'number' || !(d.total >= 0)) d.total = 0;
    if (!d.run || typeof d.run !== 'object') d.run = { count: 0, last: null };
    if (typeof d.run.count !== 'number' || !(d.run.count >= 0)) d.run.count = 0;
    return d;
  }
  /* the first look of a day: remember the morning's offerings so "visit the pond" means one made today; prune old days */
  function begin(d, st, today) {
    ensure(d);
    if (!d.days[today]) {
      d.days[today] = { pondStart: st && st.pond ? Number(st.pond.offerings) || 0 : 0, visits: {}, done: {}, hearts: 0, bonus: false };
      var keys = Object.keys(d.days).sort();
      while (keys.length > KEEP_DAYS) delete d.days[keys.shift()];
    }
    var day = d.days[today];
    if (!day.visits) day.visits = {};
    if (!day.done) day.done = {};
    if (typeof day.hearts !== 'number') day.hearts = 0;
    return day;
  }
  function visit(d, today, sceneId) { var day = begin(d, null, today); if (sceneId) day.visits[sceneId] = true; }

  /* ---------- checks: each reads existing state only ---------- */
  var CHECKS = {
    water: function (st, today) {
      return !!(st.farm && Array.isArray(st.farm.beds) && st.farm.beds.some(function (b) { return b && Array.isArray(b.watered) && b.watered.indexOf(today) >= 0; }));
    },
    sit: function (st, today) { /* any saved practice dated today, however short; only that it happened */
      return !!(Array.isArray(st.observations) && st.observations.some(function (o) {
        return o && (o.type === 'mindfulness' || o.type === 'practice') && o.date === today && !o.retracted;
      }));
    },
    pond: function (st, today, day) { return !!(st.pond && Number(st.pond.offerings) > (day ? day.pondStart : 0)); },
    walk: function (st, today, day) { return !!(day && day.visits && day.visits.waterfall); },
    journal: function (st, today) { /* a note exists for today; its words are never read */
      var obs = st.log && Array.isArray(st.log.obs) ? st.log.obs : [];
      return obs.some(function (o) { return o && o.type === 'note' && !o.retracted && o.confirmed !== false && (o.start === today || o.end === today); });
    }
  };
  function check(id, st, today, day) { var fn = CHECKS[id]; try { return !!(fn && fn(st || {}, today, day)); } catch (e) { return false; } }

  /* ---------- hearts: one per invitation, one more when all three are done, never more than CAP a day, never fewer ---------- */
  function apply(d, st, today) {
    var day = begin(d, st, today), ids = picks(today), fresh = [], bonus = false, gained = 0;
    ids.forEach(function (id) {
      if (day.done[id]) return;
      if (!check(id, st, today, day)) return;
      day.done[id] = true; fresh.push(id);
      if (day.hearts < CAP) { day.hearts += 1; gained += 1; }
    });
    if (!day.bonus && ids.every(function (id) { return day.done[id]; })) {
      day.bonus = true; bonus = true;
      if (day.hearts < CAP) { day.hearts += 1; gained += 1; }
    }
    d.total += gained;
    if (day.hearts > 0 && d.run.last !== today) { /* a day with a heart; a day without one is simply not counted */
      if (!d.run.last || d.run.last < today) { d.run.count += 1; d.run.last = today; }
    }
    return { fresh: fresh, bonus: bonus, gained: gained, hearts: day.hearts, total: d.total };
  }
  function status(d, st, today) {
    var day = begin(d, st, today);
    return picks(today).map(function (id) { return { id: id, label: INVITES[id].label, where: INVITES[id].where, icon: INVITES[id].icon, done: !!day.done[id] }; });
  }

  /* ---------- words ---------- */
  function line(d, today) {
    var day = ensure(d).days[today], n = day ? Object.keys(day.done).length : 0;
    if (day && day.bonus) return 'All three, and one more for the whole day. Thank you for being here.';
    if (n === 2) return 'Two hearts today. The third can wait, or not happen at all.';
    if (n === 1) return 'One heart today. The rest is yours to leave or take.';
    return 'Three small invitations. Any one is enough, and none of them is owed.';
  }
  var WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function longDate(date) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date)); if (!m) return String(date);
    var dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return WEEKDAYS[dt.getDay()] + ' ' + dt.getDate() + ' ' + MONTHS[dt.getMonth()];
  }
  /* two lines for the first open of a day: the greeting with the date, then the weather when the sky module knows it */
  function greeting(date, hour, weather) {
    var hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    var second = weather === 'rain' ? 'Rain today, so the garden drinks on its own.'
      : weather === 'clear' ? 'A clear day over the farm.'
      : 'Three small invitations are waiting below.';
    return [hello + '. It is ' + longDate(date) + '.', second];
  }
  function runLine(d) {
    var n = ensure(d).run.count;
    return n === 0 ? 'No hearts yet, and that is fine.' : n === 1 ? 'One day with a heart.' : n + ' days with a heart.';
  }

  root.EbbTodayRules = { INVITES: INVITES, ORDER: ORDER, PER_DAY: PER_DAY, CAP: CAP, KEEP_DAYS: KEEP_DAYS,
    picks: picks, ensure: ensure, begin: begin, visit: visit, check: check, apply: apply, status: status,
    line: line, greeting: greeting, runLine: runLine, longDate: longDate, hash: hash };
})(typeof window !== 'undefined' ? window : globalThis);
