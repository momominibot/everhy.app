/* Ebb world: the places, their walkable floors, doors and spots, and a path planner. Everything is in percent of the
 * square scene (0..100 both ways) and pure, so the node harness checks every stand point and door can be reached. */
(function (root) {
  'use strict';

  var SCENES = {
    bedroom: { /* tall bird's-eye room (plate 4:7, so y runs 0..175): the floor is the lit boards; furniture adds its own solids and spots */
      name: 'Bedroom', plate: 'art/plates/bedroom-tall.webp', aspect: [4, 7], indoor: true, depth: [75, 0.27, 175, 0.34],
      floor: [[18, 76], [82, 76], [97, 104], [100, 112], [100, 175], [0, 175], [0, 112], [3, 104]],
      solids: [],
      doors: [
        { id: 'toFarm', rect: [4, 90, 13, 104], to: 'farm', arrive: { x: 21, y: 114 }, label: 'Out to the farm' },
        { id: 'toBathroom', rect: [87, 88, 96, 102], to: 'bathroom', arrive: { x: 72, y: 110 }, label: 'Into the bathroom' }
      ],
      spots: [],
      start: { x: 50, y: 128 }
    },
    bathroom: {
      name: 'Bathroom', plate: 'art/plates/bathroom-tall.webp', aspect: [4, 7], indoor: true, depth: [79, 0.27, 175, 0.34],
      floor: [[15, 80], [62, 80], [90, 100], [100, 110], [100, 175], [0, 175], [0, 100]],
      solids: [],
      doors: [{ id: 'toBedroom', rect: [66, 90, 86, 104], to: 'bedroom', arrive: { x: 80, y: 110 }, label: 'Back to the bedroom' }],
      spots: [],
      start: { x: 50, y: 135 }
    },
    farm: { /* tall plate (4:7): shed and jars top left, fence across, the yard below, a stone path leaving bottom right */
      name: 'Farm', plate: 'art/plates/farm-tall.webp', aspect: [4, 7], depth: [104, 0.22, 175, 0.33],
      floor: [[2, 109], [34, 104], [100, 104], [100, 175], [2, 175]],
      solids: [[60, 150, 100, 175]],
      doors: [
        { id: 'toHouse', rect: [15, 104, 28, 111], to: 'bedroom', arrive: { x: 12, y: 110 }, label: 'Back inside' },
        { id: 'toFalls', rect: [88, 140, 100, 150], to: 'waterfall', arrive: { x: 12, y: 168 }, label: 'Path to the waterfall' }
      ],
      spots: [{ id: 'shed', kind: 'shed', at: { x: 46, y: 104 }, stand: { x: 46, y: 112 }, label: 'Seeds from the jars' }],
      beds: [{ x: 22, y: 128 }, { x: 44, y: 128 }, { x: 66, y: 128 }, { x: 22, y: 150 }, { x: 44, y: 150 }, { x: 14, y: 170 }],
      start: { x: 40, y: 120 }
    },
    waterfall: { /* tall plate: the falls and pond across the top, the meadow below, a sandy path from the bottom left */
      name: 'Waterfall', plate: 'art/plates/waterfall-tall.webp', aspect: [4, 7], depth: [106, 0.22, 175, 0.33],
      floor: [[2, 108], [98, 108], [98, 175], [2, 175]],
      solids: [[38, 140, 56, 150]],
      doors: [{ id: 'toFarm', rect: [0, 155, 8, 175], to: 'farm', arrive: { x: 94, y: 136 }, label: 'Back to the farm' }],
      spots: [{ id: 'pond', kind: 'pond', at: { x: 50, y: 94 }, stand: { x: 50, y: 110 }, label: 'Offer to the pond' }],
      fall: { x: 44, y0: 42, x1: 54, y1: 86 },
      start: { x: 14, y: 165 }
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
