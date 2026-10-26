/* Ebb world: the places, their walkable floors, doors and spots, and a path planner. Everything is in percent of the
 * square scene (0..100 both ways) and pure, so the node harness checks every stand point and door can be reached. */
(function (root) {
  'use strict';

  var SCENES = {
    /* The three rooms are one isometric cut-away render each (1024 square, 23 Oct): bigger than a phone, so the camera
     * (zoom 2.2) pans around them as she walks. Floors are the wooden diamond minus every painted piece, each piece
     * carrying a margin above it so she is never drawn in front of something she stands behind. y runs 0..100. */
    bedroom: {
      name: 'Bedroom', plate: 'art/plates/bedroom-dream-wide.webp', indoor: true, zoom: 2.2, depth: [44, 0.19, 93, 0.255],
      lamps: [{ x: 38, y: 33 }, { x: 66.5, y: 59 }], windows: [{ x: 37, y: 24, rx: 8, ry: 8 }, { x: 61, y: 20, rx: 8, ry: 10 }],
      floor: [[50, 42], [97, 68], [50, 93], [2, 67]],
      /* wardrobe, plant and cup table and basket, bed, arch door wall, desk and chair, bunny lamp (moved left of the wooden door, 23 Oct), dresser, laundry basket, pouf, little table */
      solids: [[10, 40, 27, 67], [2, 50, 24, 76], [25, 36, 56, 65], [25, 76, 37, 84], [56, 42, 75, 61], [62, 45, 70.5, 64], [79, 48, 97, 67], [76, 66, 86, 78], [50, 62, 62, 70], [43, 72, 49, 80]],
      fronts: [{ src: 'art/occluders/bedroom-arch-door.webp', rect: [25.5, 51.5, 36.5, 83.5] }], /* the free-standing arch door, cut from the plate: she walks behind it, only its foot is solid */
      doors: [
        { id: 'toLiving', rect: [35, 76, 41, 86], to: 'living', arrive: { x: 28, y: 70 }, label: 'To the kitchen' },
        { id: 'toBathroom', rect: [72.4, 61.2, 78.8, 65.8], to: 'bathroom', arrive: { x: 60, y: 68 }, label: 'Into the bathroom' } /* the floor in front of the wooden door now the lamp has moved off it: below the desk solid, left of the dresser */
      ],
      spots: [
        { id: 'bed', kind: 'sleep', topic: 'sleep', at: { x: 40, y: 52 }, stand: { x: 42, y: 70 }, label: 'How did you sleep?' }, /* js/ext/sleep.js: she tucks in, then logs or gets up */
        { id: 'bedside', kind: 'log', topic: 'temperature', at: { x: 38, y: 34 }, stand: { x: 46, y: 68 }, label: 'Waking temperature' },
        { id: 'desk', kind: 'log', topic: 'mood', at: { x: 66, y: 50 }, stand: { x: 68, y: 66 }, label: 'Write in the journal' },
        { id: 'wardrobe', kind: 'wardrobe', at: { x: 18, y: 50 }, stand: { x: 28, y: 68.5 }, label: 'Change clothes' }, /* the flowered wardrobe beside the bed (not the dresser by the bathroom door), 24 Oct: she stands at its door, behind the arch door and above the doorway to the kitchen */
        { id: 'bookshelf', kind: 'panel', panel: 'course', at: { x: 48, y: 30 }, stand: { x: 71.2, y: 65.2 }, label: 'Mindfulness course' }, /* between the bunny lamp and the bathroom door */
        { id: 'cushion', kind: 'cushion', at: { x: 56, y: 64 }, stand: { x: 56, y: 74 }, label: 'Sit for a practice' }
      ],
      start: { x: 50, y: 80 }
    },
    bathroom: {
      name: 'Bathroom', plate: 'art/plates/bathroom-dream-wide.webp', indoor: true, zoom: 2.2, surface: 'wood', /* the painted floor is planks */ depth: [48, 0.19, 91, 0.255],
      lamps: [{ x: 8, y: 37 }, { x: 26, y: 38 }, { x: 46, y: 80 }], windows: [{ x: 36, y: 21, rx: 8, ry: 9 }],
      floor: [[50, 47], [96, 69], [50, 91], [3, 69]],
      /* tub, wall sink and cabinet, towel rail and basket and plant stool, toilet and brush, twin sinks, candle stool, big plant and cabinet and lilac stool */
      solids: [[23, 34, 50, 57], [3, 44, 20, 60], [8, 52, 29, 73], [22, 58, 41, 82], [54, 34, 78, 59], [43, 76, 50, 87], [70, 60, 94, 81]],
      fronts: [{ src: 'art/occluders/bathroom-tub.webp', rect: [23.633, 43.652, 47.949, 60.254], base: 58 }], /* the bath's front (tools/cut_front.py): drawn over her while she soaks in it */
      doors: [{ id: 'toBedroom', rect: [62, 58, 70, 64], to: 'bedroom', arrive: { x: 75.5, y: 67 }, label: 'Back to the bedroom' }], /* clear of the moved lamp */
      spots: [
        { id: 'toilet', kind: 'log', topic: 'cycle', at: { x: 30, y: 70 }, stand: { x: 46, y: 72 }, label: 'Flow and cycle' }, /* one chat for flow and the cycle (24 Oct); the cabinet no longer opens a second one */
        { id: 'sink', kind: 'log', topic: 'body', at: { x: 64, y: 46 }, stand: { x: 60, y: 66 }, label: 'How does your body feel?' },
        { id: 'bath', kind: 'seat', at: { x: 35, y: 47 }, stand: { x: 44, y: 61 }, label: 'Have a warm soak' } /* js/seats/rules.js: she sits in the tub, bubbles up to her shoulders */
      ],
      start: { x: 52, y: 78 }
    },
    living: { /* L-shaped kitchen and living room: the kitchen nook top left behind the arch-door wall, the lounge along the back, a window alcove on the right, the dining table in front of it */
      name: 'Kitchen', plate: 'art/plates/living-dream-wide.webp', indoor: true, zoom: 2.2, depth: [44, 0.19, 94, 0.255],
      lamps: [{ x: 65, y: 25 }, { x: 33, y: 22 }, { x: 73, y: 64 }], windows: [{ x: 28, y: 25, rx: 7, ry: 8 }, { x: 85, y: 52, rx: 9, ry: 8 }],
      floor: [[20, 47], [44, 46], [62, 47], [72, 50], [72, 58], [96, 69], [50, 94], [20, 77]],
      /* island and stools, coffee table, plant pot, record cabinet, dining table and chairs */
      solids: [[25, 44, 43, 61], [43, 38, 57, 47], [64, 42, 72, 50], [59, 44, 71, 58], [61, 56, 85, 81]],
      doors: [
        { id: 'toBedroom', rect: [20, 66, 26, 78], to: 'bedroom', arrive: { x: 44, y: 84 }, label: 'To the bedroom' },
        { id: 'toFarm', rect: [40, 86, 60, 95], to: 'farm', arrive: { x: 8, y: 125 }, label: 'Out to the garden' } /* the open front edge of the cut-away */
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
    farm: { /* the community garden (23 Oct render): an HDB block with laundry across the back, a rain tree and the mosaic dragon playground on the left, the seed shed on the right, four planter beds in a tight block on the sand. Scene id kept for saves */
      name: 'Garden', plate: 'art/plates/garden.webp', video: 'art/plates/garden-live.mp4', aspect: [4, 7], depth: [112, 0.24, 175, 0.33], surface: 'soil', /* the video: the rain tree and the laundry move */
      floor: [[4, 112], [96, 112], [96, 175], [4, 175]],
      /* dragon, little bridge, shed, the four beds (each with a margin above), a stone */
      solids: [[0, 90, 34, 114], [36, 98, 58, 112], [60, 80, 97, 114], [21, 116, 49, 132], [51, 116, 79, 132], [15, 128, 47, 149], [51, 128, 83, 149], [9, 162, 15, 168]],
      soundSources: { birds: [[14, 78, 60], [66, 96, 36]], hush: [[84, 112, 30]] }, /* the rain tree and the hedge sing, the shed corner is quiet */
      arriveFix: { waterfall: { x: 78, y: 162 } },
      doors: [
        { id: 'toHouse', rect: [4, 112, 12, 120], to: 'living', arrive: { x: 56, y: 80 }, label: 'Back inside' },
        { id: 'toHawker', rect: [4, 168, 24, 175], to: 'hawker', arrive: { x: 50, y: 152 }, label: 'Walk to the hawker centre' },
        { id: 'toFalls', rect: [60, 170, 96, 175], to: 'waterfall', arrive: { x: 44, y: 166 }, label: 'Path to Little Guilin' }
      ],
      spots: [{ id: 'shed', kind: 'shed', at: { x: 78, y: 100 }, stand: { x: 84, y: 116 }, label: 'Look in your seed box' }],
      beds: [
        { x: 35, y: 125, w: 26, stand: { x: 28, y: 115 } },
        { x: 65, y: 125, w: 26, stand: { x: 72, y: 115 } },
        { x: 31, y: 139, w: 30, stand: { x: 11, y: 142 } },
        { x: 67, y: 139, w: 30, stand: { x: 88, y: 142 } }
      ],
      start: { x: 50, y: 160 }
    },
    hawker: { /* a small hawker centre (23 Oct render): kopi stall, chicken rice stall and a fruit stall across the back, marble tables on the tiles, the open side at the bottom */
      name: 'Hawker', plate: 'art/plates/hawker.webp', video: 'art/plates/hawker-live.mp4', aspect: [4, 7], indoor: true, zoom: 1.3, /* the video: the ceiling fans turn */ depth: [114, 0.24, 175, 0.33], surface: 'tile', sound: 'room', /* an indoor place on a tall plate: outdoor zoom so it fills the phone */
      lamps: [{ x: 18, y: 86 }, { x: 48, y: 86 }, { x: 78, y: 86 }],
      floor: [[4, 114], [96, 114], [96, 175], [4, 175]],
      /* the tables with their stools, the potted plant */
      solids: [[14, 111, 39, 137], [40, 117, 62, 141], [68, 106, 92, 132], [86, 116, 100, 142], [0, 124, 11, 146]],
      doors: [
        { id: 'toGarden', rect: [4, 170, 50, 175], to: 'farm', arrive: { x: 12, y: 160 }, label: 'Back to the garden' },
        { id: 'toMerlion', rect: [50, 170, 96, 175], to: 'merlion', arrive: { x: 40, y: 136 }, label: 'Walk to Merlion Park' }
      ],
      spots: [
        { id: 'kopi', kind: 'tea', at: { x: 18, y: 100 }, stand: { x: 8, y: 118 }, label: 'Order a kopi' },
        { id: 'chickenrice', kind: 'log', topic: 'food', at: { x: 47, y: 98 }, stand: { x: 46, y: 116 }, label: 'What did you eat or drink?' },
        { id: 'table', kind: 'cushion', at: { x: 80, y: 116 }, stand: { x: 66, y: 124 }, label: 'Sit with your kopi a moment' },
        { id: 'provisions', kind: 'grocer', at: { x: 79, y: 99 }, stand: { x: 65, y: 115 }, label: 'Buy provisions' }, /* the fruit stall also sells eggs, rice, ginger and chilli (js/ext/grocer.js) */
        /* the stools round the other tables (read off a 5 unit grid): seats too, set up by js/seats/rules.js */
        { id: 'stool1', kind: 'seat', at: { x: 18, y: 127 }, stand: { x: 18, y: 140 }, label: 'Sit at this table' },
        { id: 'stool2', kind: 'seat', at: { x: 35, y: 127 }, stand: { x: 34, y: 141 }, label: 'Sit at this table' },
        { id: 'stool3', kind: 'seat', at: { x: 46, y: 132 }, stand: { x: 47, y: 146 }, label: 'Sit at this table' },
        { id: 'stool4', kind: 'seat', at: { x: 61, y: 134 }, stand: { x: 60, y: 146 }, label: 'Sit at this table' }
      ],
      start: { x: 50, y: 152 }
    },
    merlion: { /* Merlion Park (23 Oct render): the Merlion spouting into the bay with Marina Bay Sands behind, a railed promenade, a stone bench, a bridge leaving bottom right */
      name: 'Merlion Park', plate: 'art/plates/merlion.webp', video: 'art/plates/merlion-live.mp4', aspect: [4, 7], depth: [108, 0.22, 175, 0.33], surface: 'tile', /* the video: the spout and the bay moving, the rest still */
      soundSources: { birds: [[8, 92, 30], [92, 92, 30]], hush: [] },
      floor: [[6, 108], [94, 108], [94, 146], [46, 146], [46, 175], [22, 175], [22, 146], [6, 146]],
      /* stone bench, planter and bench on the left, planter and info board and lamp on the right, flower beds, the bridge parapets */
      solids: [[30, 110, 52, 124], [8, 122, 30, 142], [70, 110, 86, 126], [80, 100, 94, 122], [82, 128, 92, 150], [0, 146, 22, 175], [46, 150, 100, 175]],
      doors: [
        { id: 'toHawker', rect: [0, 108, 6, 146], to: 'hawker', arrive: { x: 50, y: 152 }, label: 'Along the bay to the hawker centre' },
        { id: 'toJetty', rect: [48, 138, 70, 146], to: 'jetty', arrive: { x: 44, y: 165 }, label: 'Over the bridge to Bedok Jetty' }
      ],
      spots: [
        { id: 'pond', kind: 'pond', at: { x: 52, y: 80 }, stand: { x: 54, y: 114 }, label: 'Make a quiet wish' },
        { id: 'bench', kind: 'cushion', at: { x: 41, y: 114 }, stand: { x: 41, y: 128 }, label: 'Sit on the stone bench' }
      ],
      start: { x: 40, y: 136 }
    },
    jetty: { /* Bedok Jetty at East Coast Park (23 Oct render): the sea with ships on the horizon, the lamp-lit jetty reaching out on the right, a beach, the park connector path curving down. The world extension adds the fishing spot on the deck */
      name: 'Bedok Jetty', plate: 'art/plates/jetty.webp', video: 'art/plates/jetty-live.mp4', aspect: [4, 7], depth: [96, 0.22, 175, 0.33], surface: 'grass', /* the video: waves and palms */
      soundSources: { birds: [[8, 80, 36], [92, 72, 36]], hush: [] },
      floor: [[10, 100], [60, 100], [60, 108], [72, 108], [72, 98], [62, 88], [66, 82], [90, 89], [90, 100], [84, 100], [84, 108], [97, 108], [97, 175], [3, 175], [3, 108], [10, 108]],
      /* left and right palms, the bicycle, bollards */
      solids: [[2, 96, 14, 120], [86, 96, 98, 150], [66, 120, 92, 144], [24, 118, 28, 123], [38, 116, 42, 121], [54, 116, 58, 121], [6, 133, 10, 138], [38, 148, 42, 153], [58, 158, 62, 163], [70, 168, 74, 173]],
      doors: [{ id: 'toMerlion', rect: [26, 170, 60, 175], to: 'merlion', arrive: { x: 60, y: 136 }, label: 'Along the coast to Merlion Park' }],
      spots: [],
      start: { x: 44, y: 165 }
    },
    waterfall: { /* Little Guilin, Bukit Gombak (23 Oct render): granite cliff mirrored in the jade quarry lake, a wooden viewing deck on the right, a bench on the lawn, a stone path out at the bottom. Scene id kept for saves and extensions */
      name: 'Little Guilin', plate: 'art/plates/guilin.webp', video: 'art/plates/guilin-live.mp4', aspect: [4, 7], depth: [100, 0.22, 175, 0.33], surface: 'grass', /* the video: mist and ripples on the lake, the rain tree sways */
      floor: [[18, 110], [56, 112], [60, 118], [60, 102], [98, 102], [98, 175], [18, 175]], /* the lawn and path, plus the deck */
      solids: [[20, 102, 42, 124], [56, 90, 61, 104], [8, 134, 25, 147], [86, 116, 100, 175], [33, 142, 37, 150], [48, 136, 52, 144], [63, 126, 67, 134], [83, 139, 87, 147], [68, 153, 72, 161]], /* bench, deck's left rail, rock, right bushes, bollards */
      soundSources: { birds: [[82, 30, 50], [10, 40, 42]], hush: [] },
      doors: [{ id: 'toFarm', rect: [30, 170, 55, 175], to: 'farm', arrive: { x: 78, y: 162 }, label: 'Path to the garden' }], /* the world extension adds the hot spring door beside it */
      water: [[[6, 80], [96, 80], [96, 99], [58, 101], [56, 111], [22, 111], [8, 107]]], /* the lake, for tap ripples (js/ext/ripples.js) */
      spots: [
        { id: 'pond', kind: 'pond', at: { x: 46, y: 100 }, stand: { x: 47, y: 113 }, label: 'Make a quiet wish by the lake' },
        { id: 'bench', kind: 'cushion', at: { x: 31, y: 114 }, stand: { x: 31, y: 127 }, label: 'Sit on the bench' }
      ],
      start: { x: 44, y: 165 }
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
  /* avoid: door rects the leg must not cross (a door fires when she steps on it, so a walk to somewhere else in the
   * room must go round every doorway but the one she was sent to) */
  function inAny(pt, rects) { for (var i = 0; rects && i < rects.length; i++) if (inRect(pt, rects[i])) return true; return false; }
  function segClear(scene, a, b, avoid) {
    var steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.5) || 1;
    for (var i = 0; i <= steps; i++) {
      var t = i / steps, q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      if (!walkable(scene, q) || (i > 0 && inAny(q, avoid))) return false;
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
    var sc = typeof scene === 'string' ? SCENES[scene] : scene, avoid = [];
    ((sc && sc.doors) || []).forEach(function (d) { if (!inRect(goal, d.rect) && !inRect(from, d.rect)) avoid.push(d.rect); });
    if (segClear(scene, from, goal, avoid)) return [goal];
    var key = function (x, y) { return x + ',' + y; };
    var sx = Math.round(from.x), sy = Math.round(from.y), gx = Math.round(goal.x), gy = Math.round(goal.y);
    var open = [{ x: sx, y: sy, g: 0, f: 0 }], came = {}, cost = {}, seen = {};
    cost[key(sx, sy)] = 0;
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    while (open.length) {
      open.sort(function (p, q) { return p.f - q.f; });
      var cur = open.shift(), ck = key(cur.x, cur.y);
      if (seen[ck]) continue; seen[ck] = true;
      /* the goal's own grid cell can lie inside a solid when the goal sits on its edge (a tap on furniture lands on the
       * nearest walkable point, right at the edge), so a cell beside the goal with a clear line to it also finishes */
      if ((cur.x === gx && cur.y === gy) || (Math.hypot(cur.x - goal.x, cur.y - goal.y) < 1.5 && segClear(scene, cur, goal, avoid))) {
        var cells = [], k = ck;
        while (k) { var parts = k.split(','); cells.unshift({ x: +parts[0], y: +parts[1] }); k = came[k]; }
        cells.push(goal);
        var path = [], at = from, i = 0;
        while (i < cells.length) { /* farthest cell still in a straight clear line */
          var j = cells.length - 1;
          while (j > i && !segClear(scene, at, cells[j], avoid)) j--;
          path.push(cells[j]); at = cells[j]; i = j + 1;
        }
        return path;
      }
      for (var d = 0; d < dirs.length; d++) {
        var nx = cur.x + dirs[d][0], ny = cur.y + dirs[d][1], nk = key(nx, ny);
        if (seen[nk] || !walkable(scene, { x: nx, y: ny }) || inAny({ x: nx, y: ny }, avoid)) continue;
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
  root.EbbWorld = { SCENES: SCENES, register: register, addDoor: addDoor, bedStand: bedStand, units: units, inFloor: inFloor, walkable: walkable, segClear: segClear, plan: plan, nearestWalkable: nearestWalkable,
    doorAt: doorAt, inRect: inRect, scaleAt: scaleAt };
})(typeof window !== 'undefined' ? window : globalThis);
