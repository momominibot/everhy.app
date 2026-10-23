/* Node checks for the sleep extension: the asleep overlay rect, the in-bed state machine, the log hand-over, and the
 * bedroom after the bunny lamp moved (its solid, the wider bathroom door, the glow). Run: node tools/test-sleep.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console, Math, JSON, Date, Object, Array, String, Number, parseInt, isNaN };
ctx.globalThis = ctx;
vm.createContext(ctx);
['js/ebb-world.js', 'js/sleep/rules.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f }));
const { EbbWorld: W, EbbSleepRules: R } = ctx;
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

let pass = 0, fail = 0;
function check(name, ok) { if (ok) pass++; else { fail++; console.log('FAIL', name); } }
const B = W.SCENES.bedroom, bed = B.spots.find(s => s.id === 'bed');

/* ---------- the bed spot ---------- */
check('the bed is a sleep spot with the sleep topic', bed && bed.kind === 'sleep' && bed.topic === 'sleep');
check('the prompt by the bed still asks how she slept', bed.label === 'How did you sleep?');
check('she lies on the spot and stands at its stand point', JSON.stringify(R.lieAt(bed)) === JSON.stringify(bed.at) && JSON.stringify(R.standAt(bed)) === JSON.stringify(bed.stand));
check('the stand point is walkable', W.walkable('bedroom', bed.stand));

/* ---------- the overlay ---------- */
const r = R.overlayRect(bed);
check('the painted bed gets the overlay rect', Array.isArray(r) && r.join() === R.OVERLAY.join());
check('the overlay rect lies inside the plate', r[0] >= 0 && r[1] >= 0 && r[2] <= 100 && r[3] <= 100 && r[0] < r[2] && r[1] < r[3]);
check('the overlay covers the bed spot', bed.at.x > r[0] && bed.at.x < r[2] && bed.at.y > r[1] && bed.at.y < r[3]);
check('the overlay covers the painted bed solid', (() => { const s = B.solids[2]; return s[0] >= r[0] - 3.5 && s[1] >= r[1] - 2.5 && s[2] <= r[2] && s[3] <= r[3]; })());
check('the overlay stays clear of the bunny lamp', r[2] < B.solids[5][0]);
check('a bed somewhere else gets no overlay', R.overlayRect({ at: { x: 80, y: 20 } }) === null && R.overlayRect(null) === null);
check('returned rects are copies', (() => { const a = R.overlayRect(bed); a[0] = -1; return R.overlayRect(bed)[0] === R.OVERLAY[0]; })());
check('the overlay file exists', fs.existsSync(path.join(__dirname, '..', 'art/overlays/bedroom-asleep.webp')));

/* ---------- states ---------- */
const S = R.STATES;
check('up and tuck: in bed', R.next(S.up, 'tuck') === S.inBed);
check('up ignores get up, scene and stood', ['getUp', 'scene', 'stood', 'nonsense'].every(e => R.next(S.up, e) === S.up));
check('in bed and get up: up', R.next(S.inBed, 'getUp') === S.up);
check('in bed and a scene change: up', R.next(S.inBed, 'scene') === S.up);
check('in bed and the engine stood her: up', R.next(S.inBed, 'stood') === S.up);
check('in bed ignores a second tuck', R.next(S.inBed, 'tuck') === S.inBed && R.next(S.inBed, 'nonsense') === S.inBed);
check('an unknown state counts as up', R.next(undefined, 'tuck') === S.inBed && R.next('odd', 'getUp') === S.up);

/* ---------- the log hand-over ---------- */
const L = R.logSpot(bed);
check('the log gets the same spot with the log kind', L.kind === 'log' && L.topic === 'sleep' && L.id === 'bed' && L.at === bed.at && L.stand === bed.stand && L.label === bed.label);
check('the bed spot itself is untouched', bed.kind === 'sleep');
check('a spot without a topic logs sleep', R.logSpot({ id: 'x', kind: 'sleep' }).topic === 'sleep');

/* ---------- the bedroom after the lamp moved ---------- */
const lamp = B.lamps[1], solid = B.solids[5], door = B.doors.find(d => d.id === 'toBathroom');
check('the bunny lamp is left of the wooden door', lamp.x < 72 && lamp.x > 60);
check('the lamp solid holds the lamp with a margin above', W.inRect(lamp, solid) && lamp.y - solid[1] >= 8 && solid[3] >= lamp.y);
check('the lamp solid sits on the floor', solid.every(v => v >= 0 && v <= 100) && W.inFloor('bedroom', { x: (solid[0] + solid[2]) / 2, y: solid[3] }));
check('the bathroom door is wider than before', door.rect[2] - door.rect[0] > 4);
check('the door rect is inside the floor diamond', [[door.rect[0], door.rect[1]], [door.rect[2], door.rect[1]], [door.rect[0], door.rect[3]], [door.rect[2], door.rect[3]]].every(([x, y]) => W.inFloor('bedroom', { x, y })));
check('the door rect is outside every solid', B.solids.every(s => door.rect[2] < s[0] || door.rect[0] > s[2] || door.rect[3] < s[1] || door.rect[1] > s[3]));
const mid = { x: (door.rect[0] + door.rect[2]) / 2, y: (door.rect[1] + door.rect[3]) / 2 };
check('the door is walkable and reachable from the start', W.walkable('bedroom', mid) && !!W.plan('bedroom', B.start, mid));
check('the door is reachable from the bed', !!W.plan('bedroom', bed.stand, mid));
const arrive = W.SCENES.bathroom.doors.find(d => d.to === 'bedroom').arrive;
check('arriving from the bathroom lands clear of the lamp', W.walkable('bedroom', arrive) && !W.inRect(arrive, solid) && !!W.plan('bedroom', arrive, bed.stand));
check('the old lamp spot is floor again', W.walkable('bedroom', { x: 76, y: 58 }));
check('the arch door cut-out rect is unchanged', B.fronts[0].rect.join() === '25.5,51.5,36.5,83.5' && fs.existsSync(path.join(__dirname, '..', B.fronts[0].src)));
check('the life glow follows the lamp', read('js/ebb-life.js').includes('glow(' + lamp.x + ', ' + lamp.y + ', 6)') && !read('js/ebb-life.js').includes('glow(76, 56'));
check('index loads the sleep extension after the log', (() => { const h = read('index.html'); return h.includes('css/ext/sleep.css') && h.indexOf('js/ext/sleep.js') > h.indexOf('js/ext/log.js'); })());
check('no em dash in the sleep copy', !/—/.test(read('js/ext/sleep.js') + read('js/sleep/rules.js') + read('css/ext/sleep.css')));

console.log(`test-sleep: ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
