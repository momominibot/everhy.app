/* Ebb world: the places, their walkable floors, doors and spots, and a path planner. Everything is in percent of the
 * square scene (0..100 both ways) and pure, so the node harness checks every stand point and door can be reached. */
(function (root) {
  'use strict';

  var SCENES = {
    /* The three rooms are one isometric cut-away render each (1024 square, 23 Oct): bigger than a phone, so the camera
     * (zoom 2.2) pans around them as she walks. Floors are the wooden diamond minus every painted piece, each piece
     * carrying a margin above it so she is never drawn in front of something she stands behind. y runs 0..100.
     * `shell` and friends keep "Decorate this room" alive on the older tall empty rooms (aspect 4:7, y 0..175). */
    bedroom: {
      name: 'Bedroom', plate: 'art/plates/bedroom-dream-wide.webp', indoor: true, zoom: 2.2, depth: [44, 0.125, 93, 0.17],
      shell: 'art/plates/bedroom-tall.webp', shellAspect: [4, 7], shellDepth: [95, 0.25, 175, 0.33], shellStart: { x: 47, y: 145 },
      lamps: [{ x: 38, y: 33 }, { x: 76, y: 56 }], windows: [{ x: 37, y: 24, rx: 8, ry: 8 }, { x: 61, y: 20, rx: 8, ry: 10 }],
      floor: [[50, 42], [97, 68], [50, 93], [2, 67]],
      /* wardrobe, plant and cup table and basket, bed, arch door wall, desk and chair, bunny lamp and plant, dresser, laundry basket, pouf, little table */
      solids: [[10, 40, 27, 67], [2, 50, 24, 76], [25, 36, 56, 65], [25, 76, 37, 84], [56, 42, 75, 61], [72, 42, 78, 60], [79, 48, 97, 67], [76, 66, 86, 78], [50, 62, 62, 70], [43, 72, 49, 80]],
      fronts: [{ src: 'art/occluders/bedroom-arch-door.webp', rect: [25.5, 51.5, 36.5, 83.5] }], /* the free-standing arch door, cut from the plate: she walks behind it, only its foot is solid */
      shellFloor: [[18, 76], [82, 76], [97, 104], [100, 112], [100, 175], [0, 175], [0, 112], [3, 104]],
      shellDoors: [{ id: 'toLiving', rect: [4, 90, 13, 104] }, { id: 'toBathroom', rect: [87, 88, 96, 102] }],
      doors: [
        { id: 'toLiving', rect: [35, 76, 41, 86], to: 'living', arrive: { x: 28, y: 70 }, label: 'To the kitchen' },
        { id: 'toBathroom', rect: [75, 60, 79, 65], to: 'bathroom', arrive: { x: 60, y: 68 }, label: 'Into the bathroom' }
      ],
      spots: [
        { id: 'bed', kind: 'log', topic: 'sleep', at: { x: 40, y: 52 }, stand: { x: 42, y: 70 }, label: 'How did you sleep?' },
        { id: 'bedside', kind: 'log', topic: 'temperature', at: { x: 38, y: 34 }, stand: { x: 46, y: 68 }, label: 'Waking temperature' },
        { id: 'desk', kind: 'log', topic: 'mood', at: { x: 66, y: 50 }, stand: { x: 68, y: 66 }, label: 'Write in the journal' },
        { id: 'drawers', kind: 'wardrobe', at: { x: 88, y: 58 }, stand: { x: 74, y: 66 }, label: 'Change clothes' },
        { id: 'bookshelf', kind: 'panel', panel: 'course', at: { x: 48, y: 30 }, stand: { x: 64, y: 64 }, label: 'Mindfulness course' },
        { id: 'cushion', kind: 'cushion', at: { x: 56, y: 64 }, stand: { x: 56, y: 74 }, label: 'Sit for a practice' }
      ],
      start: { x: 50, y: 80 }
    },
    bathroom: {
      name: 'Bathroom', plate: 'art/plates/bathroom-dream-wide.webp', indoor: true, zoom: 2.2, depth: [48, 0.125, 91, 0.17],
      shell: 'art/plates/bathroom-tall.webp', shellAspect: [4, 7], shellDepth: [88, 0.25, 175, 0.33], shellStart: { x: 45, y: 125 },
      lamps: [{ x: 8, y: 37 }, { x: 26, y: 38 }, { x: 46, y: 80 }], windows: [{ x: 36, y: 21, rx: 8, ry: 9 }],
      floor: [[50, 47], [96, 69], [50, 91], [3, 69]],
      /* tub, wall sink and cabinet, towel rail and basket and plant stool, toilet and brush, twin sinks, candle stool, big plant and cabinet and lilac stool */
      solids: [[23, 34, 50, 57], [3, 44, 20, 60], [8, 52, 29, 73], [22, 58, 41, 82], [54, 34, 78, 59], [43, 76, 50, 87], [70, 60, 94, 81]],
      shellFloor: [[15, 80], [62, 80], [90, 100], [100, 110], [100, 175], [0, 175], [0, 100]],
      shellDoors: [{ id: 'toBedroom', rect: [66, 90, 86, 104] }],
      doors: [{ id: 'toBedroom', rect: [62, 58, 70, 64], to: 'bedroom', arrive: { x: 72, y: 68 }, label: 'Back to the bedroom' }],
      spots: [
        { id: 'toilet', kind: 'log', topic: 'bleeding', at: { x: 30, y: 70 }, stand: { x: 46, y: 72 }, label: 'Log bleeding or mucus' },
        { id: 'sink', kind: 'log', topic: 'body', at: { x: 64, y: 46 }, stand: { x: 60, y: 66 }, label: 'How does your body feel?' },
        { id: 'cabinet', kind: 'log', topic: 'cycle', at: { x: 86, y: 64 }, stand: { x: 66, y: 74 }, label: 'Check your cycle' }
      ],
      start: { x: 52, y: 78 }
    },
    living: { /* L-shaped kitchen and living room: the kitchen nook top left behind the arch-door wall, the lounge along the back, a window alcove on the right, the dining table in front of it */
      name: 'Kitchen', plate: 'art/plates/living-dream-wide.webp', indoor: true, zoom: 2.2, depth: [44, 0.125, 94, 0.17],
      lamps: [{ x: 65, y: 25 }, { x: 33, y: 22 }, { x: 73, y: 64 }], windows: [{ x: 28, y: 25, rx: 7, ry: 8 }, { x: 85, y: 52, rx: 9, ry: 8 }],
      floor: [[20, 47], [44, 46], [62, 47], [72, 50], [72, 58], [96, 69], [50, 94], [20, 77]],
      /* island and stools, coffee table, plant pot, record cabinet, dining table and chairs */
      solids: [[25, 44, 43, 61], [43, 38, 57, 47], [64, 42, 72, 50], [59, 44, 71, 58], [61, 56, 85, 81]],
      doors: [
        { id: 'toBedroom', rect: [20, 66, 26, 78], to: 'bedroom', arrive: { x: 44, y: 84 }, label: 'To the bedroom' },
        { id: 'toFarm', rect: [40, 86, 60, 95], to: 'farm', arrive: { x: 88, y: 84 }, label: 'Out to the farm' } /* the open front edge of the cut-away */
      ],
      spots: [
        { id: 'kettle', kind: 'tea', at: { x: 19, y: 36 }, stand: { x: 22, y: 56 }, label: 'Make a warm cup' },
        { id: 'fridge', kind: 'log', topic: 'food', at: { x: 10, y: 37 }, stand: { x: 22, y: 51 }, label: 'What did you eat or drink?' },
        { id: 'table', kind: 'log', topic: 'mood', at: { x: 72, y: 66 }, stand: { x: 58, y: 72 }, label: 'Sit at the table a moment' },
        { id: 'sofa', kind: 'cushion', at: { x: 54, y: 37 }, stand: { x: 52, y: 52 }, label: 'Curl up on the sofa' },
        { id: 'floorcushion', kind: 'cushion', at: { x: 44, y: 70 }, stand: { x: 44, y: 78 }, label: 'Sit on the rug' }
      ],
      arriveFix: {}, start: { x: 46, y: 76 }
    },
    farm: { /* spacious painted farm (23 Oct render): shed and seed jars top left, fence across the back, four raised beds on wide sandy paths, a stone path down the right edge */
      name: 'Farm', plate: 'art/plates/farm-garden.webp', aspect: [4, 7], depth: [74, 0.22, 175, 0.33],
      floor: [[2, 74], [98, 74], [98, 175], [2, 175]],
      /* the shed, then each bed box with a margin above it so she never stands "behind" painted soil */
      solids: [[5, 55, 33, 76], [24, 80, 57, 101], [55, 91, 91, 116], [6, 97, 41, 124], [36, 110, 78, 143]],
      arriveFix: { waterfall: { x: 88, y: 150 } },
      doors: [
        { id: 'toHouse', rect: [78, 74, 98, 78], to: 'living', arrive: { x: 56, y: 80 }, label: 'Back inside' },
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
      name: 'Waterfall', plate: 'art/plates/waterfall_ac.webp', video: 'art/plates/waterfall-live.mp4', aspect: [4, 7], depth: [100, 0.22, 175, 0.33], /* the video: the same plate with only the falls, pond and cherry trees moving */
      fronts: [{ src: 'art/occluders/waterfall-bridge-rail.webp', rect: [75, 98, 100, 111] }], /* the bridge's near railing and deck face, cut from the plate, so she crosses behind it */
      floor: [[2, 109], [68, 109], [68, 100], [98, 100], [98, 175], [2, 175]], /* the meadow plus the bridge deck */
      solids: [[17, 86, 72, 109], [10, 96, 27, 118], [80, 104, 100, 126]], /* pond, well, the stream under and below the bridge: on the bridge she keeps to the deck, y 100 to 104 */
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
