/* Node checks for Ebb's sky rules (js/ext/sky.js): time to phase, minute to look, date to weather, what shows where.
 * Run: node tools/test-sky.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const ctx = { console, Math, JSON, Date, Object, Array, String, Number, RegExp, isFinite, decodeURIComponent };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/ext/sky.js'), 'utf8'), ctx, { filename: 'sky.js' });
const S = ctx.EbbSky;

let pass = 0, fail = 0;
function check(name, ok) { if (ok) pass++; else { fail++; console.log('FAIL', name); } }
const hm = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

/* ---------- time to phase ---------- */
const phases = [];
for (let m = 0; m < 1440; m++) phases.push(S.phaseAt(m));
check('every minute of the day has a phase', phases.every(p => S.PHASES.indexOf(p) >= 0));
check('all five phases happen every day', S.PHASES.every(p => phases.indexOf(p) >= 0));
let changes = [];
for (let m = 0; m < 1440; m++) { const a = phases[(m + 1439) % 1440], b = phases[m]; if (a !== b) changes.push([a, b]); }
check('the phase changes exactly six times a day, midnight included', changes.length === 6);
const NEXT = { sunrise: 'morning', morning: 'noon', noon: 'afternoon', afternoon: 'sunset', sunset: 'night', night: 'sunrise' };
check('phases run in order: sunrise, morning, noon, afternoon, sunset, night', changes.every(([a, b]) => NEXT[a] === b));
check('each phase is one unbroken stretch', S.PHASES.every(p => changes.filter(c => c[1] === p).length === 1));
[['00:00', 'night'], ['05:00', 'night'], ['06:30', 'sunrise'], ['07:00', 'sunrise'], ['09:00', 'morning'], ['13:00', 'noon'], ['16:00', 'afternoon'],
  ['17:45', 'sunset'], ['18:30', 'sunset'], ['19:20', 'sunset'], ['20:00', 'night'], ['22:00', 'night'], ['23:59', 'night']]
  .forEach(([t, p]) => check(`${t} is ${p}`, S.phaseAt(hm(t)) === p));
check('minutes wrap around the day', S.phaseAt(1440 + hm('13:00')) === 'noon' && S.phaseAt(-60) === 'night');
check('minuteOf reads the local clock', S.minuteOf(new Date(2026, 9, 22, 18, 30, 30)) === 18 * 60 + 30.5);
const durations = {};
S.PHASES.forEach(p => { durations[p] = phases.filter(q => q === p).length; });
check('noon is the longest stretch of light, sunrise the shortest', durations.noon >= durations.afternoon && durations.sunrise <= durations.morning && durations.night > 360);

/* ---------- minute to look ---------- */
const inBox = (v, lo, hi) => typeof v === 'number' && isFinite(v) && v >= lo && v <= hi;
const lum = c => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
let sane = true, smoothOk = true, worst = 0, worstFade = 0;
['clear', 'rain'].forEach(weather => [false, true].forEach(indoor => {
  let prev = null;
  for (let m = 0; m <= 1440; m += 0.5) {
    const p = S.paint(m, { indoor, weather });
    const nums = p.shade.concat(p.glow.slice(0, 3));
    if (!nums.every(v => inBox(v, 0, 255)) || !inBox(p.glow[3], 0, 1) || !inBox(p.pool, 0, 1) || !inBox(p.lamp, 0, 1)) sane = false;
    if (prev) {
      const colour = Math.max(...p.shade.map((v, i) => Math.abs(v - prev.shade[i]))) * 2; /* per minute */
      const fade = Math.max(Math.abs(p.glow[3] - prev.glow[3]), Math.abs(p.pool - prev.pool), Math.abs(p.lamp - prev.lamp)) * 2;
      worst = Math.max(worst, colour); worstFade = Math.max(worstFade, fade);
      if (colour > 8 || fade > 0.04) smoothOk = false;
    }
    prev = p;
  }
}));
check('every look is in range at every half minute, indoors and out, dry and wet', sane);
check(`light never jumps: colour at most 8/255 and lamps at most 4% a minute (worst ${worst.toFixed(1)}, ${(worstFade * 100).toFixed(1)}%)`, smoothOk);
check('the look at the end of the day matches the start (midnight is seamless)', JSON.stringify(S.look(0)) === JSON.stringify(S.look(1440)));
check('noon outdoors on a dry day is the painted plate, untouched', S.paint(hm('13:00'), { weather: 'clear' }).shade.every(v => v === 255) && S.paint(hm('13:00'), {}).glow[3] === 0);
const night = S.paint(hm('22:00'), { weather: 'clear' });
check('night outdoors darkens the plate but keeps it readable', lum(night.shade) < 0.6 && lum(night.shade) > 0.4);
check('night outdoors is blue', night.shade[2] > night.shade[0] + 40);
check('her light is on at night and off by day outdoors', night.pool === 1 && S.paint(hm('13:00'), {}).pool === 0);
const gold = S.paint(hm('18:30'), {}), dawn = S.paint(hm('07:00'), {});
check('golden hour is warm (more red than blue)', gold.shade[0] - gold.shade[2] > 50 && gold.glow[3] > 0.1);
check('dawn is rosy and lighter than dusk', dawn.shade[0] === 255 && lum(dawn.shade) > lum(S.paint(hm('19:30'), {}).shade));
check('each screenshot time shows a different look', new Set(['07:00', '13:00', '18:30', '22:00'].map(t => JSON.stringify(S.paint(hm(t), {}).shade))).size === 4);
const rainNoon = S.paint(hm('13:00'), { weather: 'rain' });
check('a rainy day is a little greyer outdoors', lum(rainNoon.shade) < 0.97 && lum(rainNoon.shade) > 0.8);
let indoorOk = true, lampByDay = 0;
for (let m = 0; m < 1440; m++) {
  const p = S.paint(m, { indoor: true, weather: m % 2 ? 'rain' : 'clear' }), ph = S.phaseAt(m);
  if (p.glow[3] !== 0 || p.pool !== 0 || (p.lamp === 0 && !p.shade.every(v => v === 255)) || p.shade.some(v => v < 180)) indoorOk = false; /* untouched by day, only a gentle dim with the lamps at night */
  const settled = S.phaseAt(m - 21) === ph && S.phaseAt(m + 21) === ph; /* outside the fade at either end */
  if ((ph === 'morning' || ph === 'noon' || ph === 'afternoon') && settled && p.lamp > 0) lampByDay++;
}
check('indoors never gets the outdoor tint: untouched by day, a gentle dim at night, rain or shine', indoorOk);
check('a room at night is dimmer than by day', S.paint(hm('23:00'), { indoor: true }).shade.every(v => v < 210) && S.paint(hm('13:00'), { indoor: true }).shade.every(v => v === 255));
check('indoor lamps are off through dawn, day and golden hour', lampByDay === 0);
check('indoor lamps are fully on at night', S.paint(hm('22:00'), { indoor: true }).lamp === 1 && S.paint(hm('03:00'), { indoor: true }).lamp === 1);
check('outdoors has no indoor lamps', S.paint(hm('22:00'), {}).lamp === 0);

/* ---------- date to weather ---------- */
const days = [];
for (let i = 0; i < 730; i++) days.push(new Date(2026, 0, 1 + i));
let stable = true;
days.slice(0, 120).forEach(d => {
  const key = S.dateKey(d), w = S.weatherFor(key);
  for (let m = 0; m < 1440; m += 7) if (S.weatherAt(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, m)) !== w) stable = false;
  if (S.weatherAt(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59)) !== w) stable = false;
});
check('the weather holds for every minute of a day', stable);
const ws = days.map(d => S.weatherAt(d));
check('weather is only rain or clear', ws.every(w => w === 'rain' || w === 'clear'));
const rainy = ws.filter(w => w === 'rain').length / ws.length;
check(`some days rain, most do not (${(rainy * 100).toFixed(0)}% rainy over two years)`, rainy > 0.12 && rainy < 0.3);
let flips = 0, run = 0, longest = 0;
ws.forEach((w, i) => { if (i && w !== ws[i - 1]) flips++; run = w === 'rain' ? run + 1 : 0; longest = Math.max(longest, run); });
check(`the weather changes from day to day (${flips} changes)`, flips > 150);
check(`no long wet spells (longest ${longest} days)`, longest <= 5);
check('rain is not tied to the weekday', [0, 1, 2, 3, 4, 5, 6].every(k => { const s = ws.filter((w, i) => days[i].getDay() === k); return s.indexOf('rain') >= 0 && s.indexOf('clear') >= 0; }));
check('the same date always has the same weather', S.weatherFor('2026-10-22') === S.weatherFor('2026-10-22') && S.weatherAt(new Date(2026, 9, 22, 1)) === S.weatherAt(new Date(2026, 9, 22, 23)));
check('dateKey is the local calendar date', S.dateKey(new Date(2026, 0, 5, 23, 30)) === '2026-01-05');

/* ---------- what shows where ---------- */
const fx = o => S.effects(Object.assign({ phase: 'night', indoor: false, weather: 'clear', fireflies: true, reduced: false }, o));
check('fireflies at night where a place has them', fx({}).flies === true);
check('no fireflies by day, at dusk, indoors, in rain, or where a place has none',
  !fx({ phase: 'noon' }).flies && !fx({ phase: 'sunset' }).flies && !fx({ indoor: true }).flies && !fx({ weather: 'rain' }).flies && !fx({ fireflies: false }).flies);
check('rain falls outdoors on rainy days, day or night', fx({ weather: 'rain' }).rain && fx({ weather: 'rain', phase: 'noon' }).rain && !fx({}).rain);
check('rain stays outside', !fx({ weather: 'rain', indoor: true }).rain);
check('reduced motion: no falling rain or drifting fireflies', !fx({ reduced: true, weather: 'rain' }).rain && !fx({ reduced: true }).flies);

/* ---------- places ---------- */
check('bedroom and bathroom are indoors', S.isIndoor('bedroom', {}) && S.isIndoor('bathroom', {}));
check('unknown places are outdoors', !S.isIndoor('farm', {}) && !S.isIndoor('waterfall', {}) && !S.isIndoor('somewhere-new', {}));
check('a scene that says indoor: true is indoors', S.isIndoor('attic', { indoor: true }));
check('a scene that says indoor: false is outdoors', !S.isIndoor('bedroom', { indoor: false }));
check('no scene object still works', S.isIndoor('bedroom') && !S.isIndoor('farm'));

/* ---------- ?time and ?weather ---------- */
check('?time=07:00', S.parseTime('?time=07:00') === 420);
check('?time=7:05 with other params', S.parseTime('?a=1&time=7:05&b=2') === 425);
check('?time encoded colon', S.parseTime('?time=18%3A30') === 1110);
check('bad ?time is ignored', ['?time=25:00', '?time=12:60', '?time=7:5', '?time=abc', '?time=', '', '?times=07:00', '?time=%E0'].every(q => S.parseTime(q) === null));
check('?weather=rain|clear only', S.parseWeather('?weather=rain') === 'rain' && S.parseWeather('?time=1:00&weather=clear') === 'clear' && S.parseWeather('?weather=snow') === null);

/* ---------- wiring ---------- */
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
check('index.html loads sky.js once, after the engine', (html.match(/js\/ext\/sky\.js/g) || []).length === 1 && html.indexOf('js/ext/sky.js') > html.indexOf('js/ebb-game.js'));
check('index.html loads sky.css once', (html.match(/css\/ext\/sky\.css/g) || []).length === 1);
const css = fs.readFileSync(path.join(ROOT, 'css/ext/sky.css'), 'utf8');
check('the .sky wrapper never forms a stacking context', !/\.sky\s*\{[^}]*(opacity|transform|filter|z-index|isolation|will-change)/.test(css));
check('reduced motion hides rain and fireflies in CSS too', /prefers-reduced-motion[^{]*\{[^}]*\.sky-rain[^}]*\.sky-flies/.test(css) && /data-motion="reduce"\] \.sky-rain/.test(css));
const src = fs.readFileSync(path.join(ROOT, 'js/ext/sky.js'), 'utf8') + css + fs.readFileSync(__filename, 'utf8');
check('no em dashes in the sky files', src.indexOf(String.fromCharCode(0x2014)) < 0);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
