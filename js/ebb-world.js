/* Ebb world: the places, their walkable floors, doors and spots, and a path planner. Everything is in percent of the
 * square scene (0..100 both ways) and pure, so the node harness checks every stand point and door can be reached. */
(function (root) {
  'use strict';

  var SCENES = {
    bedroom: { /* bird's-eye room: floor is the wooden diamond, furniture footprints are solids */
      name: 'Bedroom', plate: 'art/plates/bedroom-birdseye.webp', depth: [42, 0.19, 95, 0.23],
      floor: [[32, 42], [80, 55], [93, 72], [57, 95], [5, 69]],
      solids: [[16, 38, 52, 57], [28, 57, 46, 63], [5, 56, 21, 70], [61, 44, 79, 56], [72, 56, 82, 67]],
      doors: [{ id: 'toFarm', rect: [83, 66, 92, 74], to: 'farm', arrive: { x: 19, y: 77 }, label: 'Out to the farm' }],
      spots: [
        { id: 'cushion', kind: 'cushion', at: { x: 54, y: 71 }, stand: { x: 54, y: 74 }, label: 'Sit for a practice' },
        { id: 'wardrobe', kind: 'wardrobe', at: { x: 69, y: 46 }, stand: { x: 67, y: 60 }, label: 'Change clothes' },
        { id: 'bed', kind: 'bed', at: { x: 35, y: 50 }, stand: { x: 42, y: 66 }, label: 'Rest on the bed' }
      ],
      start: { x: 55, y: 84 }
    },
    farm: {
      name: 'Farm', plate: 'art/plates/farm-clay.webp', depth: [63, 0.115, 98, 0.17],
      floor: [[15, 75], [15, 71], [24, 70], [29, 66], [31, 64], [72, 64], [73, 70], [93, 70], [98, 71], [98, 90], [88, 92], [86, 98],
        [27, 98], [24, 90], [14, 86], [3, 86], [3, 76]],
      solids: [],
      doors: [
        { id: 'toHouse', rect: [15, 70.5, 23, 73], to: 'bedroom', arrive: { x: 79, y: 76 }, label: 'Back inside' },
        { id: 'toFalls', rect: [94, 71, 98, 82], to: 'waterfall', arrive: { x: 8, y: 78 }, label: 'Path to the waterfall' }
      ],
      spots: [{ id: 'shed', kind: 'shed', at: { x: 26, y: 63 }, stand: { x: 27, y: 70 }, label: 'Seeds from the jars' }],
      beds: [{ x: 32, y: 74 }, { x: 45, y: 74 }, { x: 58, y: 74 }, { x: 32, y: 85 }, { x: 45, y: 85 }, { x: 58, y: 85 }],
      start: { x: 40, y: 70 }
    },
    waterfall: {
      name: 'Waterfall', plate: 'art/plates/waterfall-clay.webp', depth: [60, 0.12, 98, 0.185],
      floor: [[2, 64], [16, 63], [22, 66], [32, 69], [50, 69.5], [68, 68.5], [78, 66], [86, 61], [98, 60], [98, 98], [2, 98]],
      solids: [],
      doors: [{ id: 'toFarm', rect: [2, 69, 6, 88], to: 'farm', arrive: { x: 91, y: 76 }, label: 'Back to the farm' }],
      spots: [{ id: 'pond', kind: 'pond', at: { x: 52, y: 58 }, stand: { x: 52, y: 72 }, label: 'Offer to the pond' }],
      fall: { x: 51, y0: 30, x1: 60, y1: 49 },
      start: { x: 10, y: 78 }
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
    SCENES[id] = scene; return true;
  }
  function addDoor(sceneId, door) { var s = SCENES[sceneId]; if (!s) return false; s.doors.push(door); return true; }

  root.EbbWorld = { SCENES: SCENES, register: register, addDoor: addDoor, units: units, inFloor: inFloor, walkable: walkable, segClear: segClear, plan: plan, nearestWalkable: nearestWalkable,
    doorAt: doorAt, inRect: inRect, scaleAt: scaleAt };
})(typeof window !== 'undefined' ? window : globalThis);
