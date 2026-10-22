/* Ebb world: the places, their walkable floors, doors and spots, and a path planner. Everything is in percent of the
 * square scene (0..100 both ways) and pure, so the node harness checks every stand point and door can be reached. */
(function (root) {
  'use strict';

  var SCENES = {
    bedroom: { /* one dreamy render (plate 4:7, so y runs 0..175) with the furniture painted in; `shell` is the empty room she can furnish herself */
      name: 'Bedroom', plate: 'art/plates/bedroom-dream.webp', shell: 'art/plates/bedroom-tall.webp', aspect: [4, 7], indoor: true, depth: [95, 0.25, 175, 0.33],
      floor: [[16, 97], [84, 97], [86, 175], [14, 175]],
      solids: [[28, 50, 64, 97], [14, 80, 28, 119], [66, 80, 90, 123], [0, 138, 21, 175], [77, 160, 100, 175]],
      shellFloor: [[18, 76], [82, 76], [97, 104], [100, 112], [100, 175], [0, 175], [0, 112], [3, 104]],
      shellDoors: [{ id: 'toLiving', rect: [4, 90, 13, 104] }, { id: 'toBathroom', rect: [87, 88, 96, 102] }],
      doors: [
        { id: 'toLiving', rect: [14, 118, 19, 150], to: 'living', arrive: { x: 9, y: 110 }, label: 'To the kitchen' },
        { id: 'toBathroom', rect: [81, 128, 86, 160], to: 'bathroom', arrive: { x: 72, y: 128 }, label: 'Into the bathroom' }
      ],
      spots: [
        { id: 'bed', kind: 'log', topic: 'sleep', at: { x: 45, y: 72 }, stand: { x: 45, y: 101 }, label: 'How did you sleep?' },
        { id: 'bedside', kind: 'log', topic: 'temperature', at: { x: 70, y: 62 }, stand: { x: 62, y: 101 }, label: 'Waking temperature' },
        { id: 'desk', kind: 'log', topic: 'mood', at: { x: 80, y: 98 }, stand: { x: 62, y: 108 }, label: 'Write in the journal' },
        { id: 'drawers', kind: 'wardrobe', at: { x: 76, y: 112 }, stand: { x: 62, y: 120 }, label: 'Change clothes' },
        { id: 'bookshelf', kind: 'panel', panel: 'course', at: { x: 10, y: 55 }, stand: { x: 32, y: 101 }, label: 'Mindfulness course' },
        { id: 'cushion', kind: 'cushion', at: { x: 47, y: 118 }, stand: { x: 47, y: 130 }, label: 'Sit for a practice' }
      ],
      start: { x: 47, y: 145 }
    },
    bathroom: {
      name: 'Bathroom', plate: 'art/plates/bathroom-dream.webp', shell: 'art/plates/bathroom-tall.webp', aspect: [4, 7], indoor: true, depth: [88, 0.25, 175, 0.33],
      floor: [[22, 88], [78, 88], [88, 120], [90, 175], [8, 175], [6, 120]],
      solids: [[10, 55, 40, 94], [8, 70, 27, 119], [62, 78, 85, 101], [71, 100, 96, 126], [39, 133, 69, 151], [11, 125, 37, 151], [69, 140, 91, 161]],
      shellFloor: [[15, 80], [62, 80], [90, 100], [100, 110], [100, 175], [0, 175], [0, 100]],
      shellDoors: [{ id: 'toBedroom', rect: [66, 90, 86, 104] }],
      doors: [{ id: 'toBedroom', rect: [84, 122, 90, 142], to: 'bedroom', arrive: { x: 78, y: 140 }, label: 'Back to the bedroom' }],
      spots: [
        { id: 'toilet', kind: 'log', topic: 'bleeding', at: { x: 25, y: 78 }, stand: { x: 32, y: 98 }, label: 'Log bleeding or mucus' },
        { id: 'sink', kind: 'log', topic: 'body', at: { x: 65, y: 60 }, stand: { x: 58, y: 96 }, label: 'How does your body feel?' },
        { id: 'cabinet', kind: 'log', topic: 'cycle', at: { x: 84, y: 108 }, stand: { x: 68, y: 128 }, label: 'Check your cycle' }
      ],
      start: { x: 45, y: 125 }
    },
    living: { /* kitchen and living room in one dreamy render; left door to the bedroom, right door out to the farm */
      name: 'Kitchen', plate: 'art/plates/living-dream.webp', aspect: [4, 7], indoor: true, depth: [64, 0.25, 175, 0.33],
      floor: [[8, 64], [92, 64], [100, 76], [100, 175], [0, 175], [0, 76]],
      solids: [[40, 50, 62, 72], [66, 56, 86, 70], [8, 58, 46, 87], [12, 80, 24, 101], [16, 84, 32, 102], [10, 102, 30, 122], [10, 120, 20, 129],
        [64, 68, 92, 100], [66, 92, 82, 118], [83, 90, 94, 112], [82, 108, 100, 126]],
      doors: [
        { id: 'toBedroom', rect: [0, 78, 6, 104], to: 'bedroom', arrive: { x: 22, y: 128 }, label: 'To the bedroom' },
        { id: 'toFarm', rect: [95, 76, 100, 104], to: 'farm', arrive: { x: 88, y: 84 }, label: 'Out to the farm' }
      ],
      spots: [
        { id: 'kettle', kind: 'tea', at: { x: 51, y: 60 }, stand: { x: 51, y: 75 }, label: 'Make a warm cup' },
        { id: 'fridge', kind: 'log', topic: 'food', at: { x: 32, y: 54 }, stand: { x: 44, y: 89 }, label: 'What did you eat or drink?' },
        { id: 'table', kind: 'log', topic: 'mood', at: { x: 78, y: 84 }, stand: { x: 56, y: 100 }, label: 'Sit at the table a moment' },
        { id: 'sofa', kind: 'cushion', at: { x: 27, y: 74 }, stand: { x: 36, y: 90 }, label: 'Curl up on the sofa' },
        { id: 'floorcushion', kind: 'cushion', at: { x: 91, y: 114 }, stand: { x: 78, y: 128 }, label: 'Sit on the cushion' }
      ],
      arriveFix: {}, start: { x: 50, y: 125 }
    },
    farm: { /* spacious painted farm (23 Oct render): shed and seed jars top left, fence across the back, four raised beds on wide sandy paths, a stone path down the right edge */
      name: 'Farm', plate: 'art/plates/farm-garden.webp', aspect: [4, 7], depth: [74, 0.22, 175, 0.33],
      floor: [[2, 74], [98, 74], [98, 175], [2, 175]],
      /* the shed, then each bed box with a margin above it so she never stands "behind" painted soil */
      solids: [[5, 55, 33, 76], [24, 80, 57, 101], [55, 91, 91, 116], [6, 97, 41, 124], [36, 110, 78, 143]],
      doorFix: { toBarn: { rect: [0, 163, 6, 175], arrive: { x: 10, y: 170 } } }, arriveFix: { barn: { x: 10, y: 170 }, waterfall: { x: 88, y: 150 } }, /* the world extension's barn door, moved onto this plate's free left edge */
      doors: [
        { id: 'toHouse', rect: [78, 74, 98, 78], to: 'living', arrive: { x: 80, y: 121 }, label: 'Back inside' },
        { id: 'toFalls', rect: [92, 140, 100, 160], to: 'waterfall', arrive: { x: 46, y: 166 }, label: 'Path to the waterfall' }
      ],
      spots: [{ id: 'shed', kind: 'shed', at: { x: 18, y: 66 }, stand: { x: 18, y: 86 }, label: 'Seeds from the jars' }],
      /* bed centres and widths on the painted soil; crops and water show on top of the painting. Stand points sit beside
       * each bed on open sand (the beds zig-zag, so the pocket below the first bed is sealed off) */
      beds: [
        { x: 40, y: 93, w: 32, stand: { x: 17, y: 94 } },
        { x: 73, y: 106, w: 34, stand: { x: 84, y: 121 } },
        { x: 23, y: 113, w: 35, stand: { x: 22, y: 131 } },
        { x: 57, y: 129, w: 42, stand: { x: 57, y: 150 } }
      ],
      start: { x: 50, y: 160 }
    },
    waterfall: { /* 23 Oct render: cherry trees on the cliff, the falls into a round pond, a wishing well on the left, a little bridge over the stream on the right, the path out at the bottom */
      name: 'Waterfall', plate: 'art/plates/waterfall_ac.webp', aspect: [4, 7], depth: [100, 0.22, 175, 0.33],
      floor: [[2, 109], [68, 109], [68, 100], [98, 100], [98, 175], [2, 175]], /* the meadow plus the bridge deck */
      solids: [[17, 86, 72, 109], [10, 96, 27, 118], [78, 113, 100, 126]], /* pond, well, the stream below the bridge */
      doors: [{ id: 'toFarm', rect: [34, 171, 58, 175], to: 'farm', arrive: { x: 88, y: 150 }, label: 'Back to the farm' }],
      spots: [{ id: 'pond', kind: 'pond', at: { x: 50, y: 96 }, stand: { x: 50, y: 114 }, label: 'Offer to the pond' }],
      fall: { x: 42, y0: 56, x1: 58, y1: 90 },
      start: { x: 46, y: 165 }
    }
  };

  function inPoly(pt, poly) {
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var a = poly[i], b = poly[j];
      if ((a[1] > pt.y) !== (b[1] > pt.y) && pt.x < (b[0] - a[0]) * (pt.y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }
  function inRect(pt, r) { return pt.x >= r[0] && pt.x <= r[2] && pt.y >= r[1] && pt.y <= r[3]; }
  /* a scene's plate may be taller than wide: x runs 0..100 across the plate and y runs 0..units(scene) down it, in the
   * same unit, so walking speed and figure size mean the same thing in every direction */
  function units(scene) { var s = typeof scene === 'string' ? SCENES[scene] : scene, a = s && s.aspect; return a ? 100 * a[1] / a[0] : 100; }
  /* where she stands to work a bed: just below it (painted beds carry their width, flat tiles are 12 wide) */
  function bedStand(b) { return b.stand || { x: b.x, y: b.y + (b.w ? b.w * 0.21 + 3 : 4.5) }; }
  function inFloor(scene, pt) { var s = typeof scene === 'string' ? SCENES[scene] : scene; return !!s && inPoly(pt, s.floor); }
  function walkable(scene, pt) {
    var s = typeof scene === 'string' ? SCENES[scene] : scene;
    if (!s || !inPoly(pt, s.floor)) return false;
    for (var i = 0; i < s.solids.length; i++) if (inRect(pt, s.solids[i])) return false;
    return true;
  }
  function segClear(scene, a, b) {
    var steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.5) || 1;
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      if (!walkable(scene, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) return false;
    }
    return true;
  }
  /* nearest walkable point to a tap, searched outward on a fine ring */
  function nearestWalkable(scene, pt) {
    if (walkable(scene, pt)) return { x: pt.x, y: pt.y };
    for (var r = 0.5; r <= 30; r += 0.5) {
      for (var k = 0; k < 24; k++) {
        var a = k / 24 * Math.PI * 2, q = { x: pt.x + Math.cos(a) * r, y: pt.y + Math.sin(a) * r };
        if (walkable(scene, q)) return q;
      }
    }
    return null;
  }
  /* A* on a 1-unit grid, then a string-pulled path of straight legs that each pass segClear */
  function plan(scene, from, to) {
    var goal = nearestWalkable(scene, to); if (!goal) return null;
    if (segClear(scene, from, goal)) return [goal];
    var key = function (x, y) { return x + ',' + y; };
    var sx = Math.round(from.x), sy = Math.round(from.y), gx = Math.round(goal.x), gy = Math.round(goal.y);
    var open = [{ x: sx, y: sy, g: 0, f: 0 }], came = {}, cost = {}, seen = {};
    cost[key(sx, sy)] = 0;
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    while (open.length) {
      open.sort(function (p, q) { return p.f - q.f; });
      var cur = open.shift(), ck = key(cur.x, cur.y);
      if (seen[ck]) continue; seen[ck] = true;
      if (cur.x === gx && cur.y === gy) {
        var cells = [], k = ck;
        while (k) { var parts = k.split(','); cells.unshift({ x: +parts[0], y: +parts[1] }); k = came[k]; }
        cells.push(goal);
        var path = [], at = from, i = 0;
        while (i < cells.length) { /* farthest cell still in a straight clear line */
          var j = cells.length - 1;
          while (j > i && !segClear(scene, at, cells[j])) j--;
          path.push(cells[j]); at = cells[j]; i = j + 1;
        }
        return path;
      }
      for (var d = 0; d < dirs.length; d++) {
        var nx = cur.x + dirs[d][0], ny = cur.y + dirs[d][1], nk = key(nx, ny);
        if (seen[nk] || !walkable(scene, { x: nx, y: ny })) continue;
        var g = cur.g + (dirs[d][0] && dirs[d][1] ? 1.414 : 1);
        if (cost[nk] !== undefined && cost[nk] <= g) continue;
        cost[nk] = g; came[nk] = ck;
        open.push({ x: nx, y: ny, g: g, f: g + Math.hypot(gx - nx, gy - ny) });
      }
    }
    return null;
  }
  function doorAt(scene, pt) {
    var s = SCENES[scene];
    for (var i = 0; i < s.doors.length; i++) if (inRect(pt, s.doors[i].rect)) return s.doors[i];
    return null;
  }
  /* figure size by depth: further up the floor is further away; a scene's depth is [yFar, scaleFar, yNear, scaleNear] */
  var DEPTH = [60, 0.17, 98, 0.28];
  function scaleAt(y, sceneId) {
    var s = sceneId && SCENES[sceneId], d = s && s.depth || DEPTH;
    return d[1] + (d[3] - d[1]) * Math.max(0, Math.min(1, (y - d[0]) / (d[2] - d[0])));
  }

  /* extension points: other modules add places and doors without editing this file */
  function register(id, scene) {
    if (!id || SCENES[id]) return false;
    scene.solids = scene.solids || []; scene.doors = scene.doors || []; scene.spots = scene.spots || [];
    scene.doors.forEach(function (d) { var t = SCENES[d.to]; if (t && t.arriveFix && t.arriveFix[id]) d.arrive = t.arriveFix[id]; }); /* a repainted target moves where its visitors land */
    SCENES[id] = scene; return true;
  }
  function addDoor(sceneId, door) {
    var s = SCENES[sceneId]; if (!s) return false;
    var fix = s.doorFix && s.doorFix[door.id]; if (fix) door = Object.assign({}, door, fix); /* a repainted plate can move an extension's door */
    s.doors.push(door); return true;
  }
  /* the shell (empty room) has its doors on the walls where the painted room has them by its furniture; same targets */
  function shellDoors(s) {
    if (!s.shellDoors) return s.doors;
    return s.doors.map(function (d) { var sd = s.shellDoors.filter(function (x) { return x.id === d.id; })[0]; return sd ? Object.assign({}, d, { rect: sd.rect }) : d; });
  }

  root.EbbWorld = { SCENES: SCENES, register: register, addDoor: addDoor, shellDoors: shellDoors, bedStand: bedStand, units: units, inFloor: inFloor, walkable: walkable, segClear: segClear, plan: plan, nearestWalkable: nearestWalkable,
    doorAt: doorAt, inRect: inRect, scaleAt: scaleAt };
})(typeof window !== 'undefined' ? window : globalThis);
