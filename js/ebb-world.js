/* Ebb world: the places, their walkable floors, doors and spots, and a path planner. Everything is in percent of the
 * square scene (0..100 both ways) and pure, so the node harness checks every stand point and door can be reached. */
(function (root) {
  'use strict';

  var SCENES = {
    bedroom: {
      name: 'Bedroom', plate: 'art/plates/bedroom.webp',
      floor: [[3, 75], [46, 75], [47, 71], [97, 71], [97, 98], [3, 98]],
      solids: [],
      doors: [{ id: 'toFarm', rect: [84, 70, 97, 77], to: 'farm', arrive: { x: 8, y: 84 }, label: 'Out to the farm' }],
      spots: [
        { id: 'cushion', kind: 'cushion', at: { x: 56, y: 84 }, stand: { x: 56, y: 85 }, label: 'Sit for a practice' },
        { id: 'wardrobe', kind: 'wardrobe', at: { x: 75, y: 60 }, stand: { x: 75, y: 74 }, label: 'Change clothes' },
        { id: 'bed', kind: 'bed', at: { x: 22, y: 66 }, stand: { x: 22, y: 78 }, label: 'Rest on the bed' }
      ],
      start: { x: 60, y: 88 }
    },
    farm: {
      name: 'Farm', plate: 'art/plates/farm.webp',
      floor: [[2, 67], [98, 67], [98, 98], [2, 98]],
      solids: [],
      doors: [
        { id: 'toHouse', rect: [2, 76, 6, 96], to: 'bedroom', arrive: { x: 86, y: 80 }, label: 'Back inside' },
        { id: 'toFalls', rect: [94, 66, 98, 80], to: 'waterfall', arrive: { x: 8, y: 76 }, label: 'Path to the waterfall' }
      ],
      spots: [{ id: 'shed', kind: 'shed', at: { x: 25, y: 58 }, stand: { x: 25, y: 69 }, label: 'Seeds from the shed' }],
      beds: [{ x: 40, y: 75 }, { x: 55, y: 75 }, { x: 70, y: 75 }, { x: 40, y: 87 }, { x: 55, y: 87 }, { x: 70, y: 87 }],
      start: { x: 10, y: 84 }
    },
    waterfall: {
      name: 'Waterfall', plate: 'art/plates/waterfall.webp',
      floor: [[2, 71], [98, 71], [98, 98], [28, 98], [28, 83], [2, 83]],
      solids: [],
      doors: [{ id: 'toFarm', rect: [2, 71, 6, 83], to: 'farm', arrive: { x: 90, y: 73 }, label: 'Back to the farm' }],
      spots: [{ id: 'pond', kind: 'pond', at: { x: 60, y: 62 }, stand: { x: 60, y: 73 }, label: 'Offer to the pond' }],
      start: { x: 10, y: 77 }
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
  /* figure size by depth: further up the floor is further away */
  function scaleAt(y) { return 0.17 + 0.11 * Math.max(0, Math.min(1, (y - 60) / 38)); }

  /* extension points: other modules add places and doors without editing this file */
  function register(id, scene) {
    if (!id || SCENES[id]) return false;
    scene.solids = scene.solids || []; scene.doors = scene.doors || []; scene.spots = scene.spots || [];
    SCENES[id] = scene; return true;
  }
  function addDoor(sceneId, door) { var s = SCENES[sceneId]; if (!s) return false; s.doors.push(door); return true; }

  root.EbbWorld = { SCENES: SCENES, register: register, addDoor: addDoor, walkable: walkable, segClear: segClear, plan: plan, nearestWalkable: nearestWalkable,
    doorAt: doorAt, inRect: inRect, scaleAt: scaleAt };
})(typeof window !== 'undefined' ? window : globalThis);
