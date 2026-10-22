/* Ebb furniture: every piece in a room is its own clay sprite that she can move. Pure: a layout is a list of
 * { uid, item, x, y, flip } in scene percent, where (x, y) is the middle of the piece's front edge on the floor.
 * apply(scene, layout) turns a layout into the scene's solids (footprints the planner walks around) and spots (the
 * things she can use, which travel with their furniture). canPlace() says whether a piece fits where it is dropped. */
(function (root) {
  'use strict';

  /* sheet + frame name the sprite strip in art/furn/; w is the drawn cell width in scene units; foot is the footprint
   * [width, depth] in scene units behind the front edge (0 depth = flat, walk over it); spot is what she can do there,
   * with the stand point relative to (x, y). */
  var CATALOG = {
    bed: { sheet: 'furn_bedroom', frame: 0, name: 'Bed', w: 30, foot: [24, 13], spot: { kind: 'log', topic: 'sleep', label: 'How did you sleep?', dx: 0, dy: 3 } },
    bedside: { sheet: 'furn_bedroom', frame: 1, name: 'Bedside table', w: 30, foot: [9, 6], spot: { kind: 'log', topic: 'temperature', label: 'Waking temperature', dx: 0, dy: 3 } },
    desk: { sheet: 'furn_bedroom', frame: 2, name: 'Writing desk', w: 30, foot: [17, 8], spot: { kind: 'log', topic: 'mood', label: 'Write in the journal', dx: 0, dy: 3 } },
    drawers: { sheet: 'furn_bedroom', frame: 3, name: 'Chest of drawers', w: 30, foot: [15, 7], spot: { kind: 'wardrobe', label: 'Change clothes', dx: 0, dy: 3 } },
    bookshelf: { sheet: 'furn_bedroom', frame: 4, name: 'Bookshelf', w: 30, foot: [12, 6], spot: { kind: 'panel', panel: 'course', label: 'Mindfulness course', dx: 0, dy: 3 } },
    plant: { sheet: 'furn_bedroom', frame: 5, name: 'Plant', w: 30, foot: [7, 5] },
    rug: { sheet: 'furn_bedroom', frame: 6, name: 'Round rug', w: 30, foot: [0, 0], flat: true },
    armchair: { sheet: 'furn_bedroom', frame: 7, name: 'Armchair', w: 30, foot: [11, 7] },
    lamp: { sheet: 'furn_bedroom', frame: 8, name: 'Floor lamp', w: 30, foot: [5, 4] },
    cushion: { sheet: 'misc', strip: 'props', frame: 0, name: 'Meditation cushion', w: 10.5, foot: [0, 0], flat: true, spot: { kind: 'cushion', label: 'Sit for a practice', dx: 0, dy: 0.6, sit: true } },
    bathtub: { sheet: 'furn_bathroom', frame: 0, name: 'Bathtub', w: 30, foot: [24, 11] },
    toilet: { sheet: 'furn_bathroom', frame: 1, name: 'Toilet', w: 30, foot: [9, 8], spot: { kind: 'log', topic: 'bleeding', label: 'Log bleeding or mucus', dx: 0, dy: 3 } },
    sink: { sheet: 'furn_bathroom', frame: 2, name: 'Sink and mirror', w: 30, foot: [10, 6], spot: { kind: 'log', topic: 'body', label: 'How does your body feel?', dx: 0, dy: 3 } },
    towels: { sheet: 'furn_bathroom', frame: 3, name: 'Towel rail', w: 30, foot: [10, 4] },
    cabinet: { sheet: 'furn_bathroom', frame: 4, name: 'Cabinet and calendar', w: 30, foot: [10, 6], spot: { kind: 'log', topic: 'cycle', label: 'Check your cycle', dx: 0, dy: 3 } },
    bathmat: { sheet: 'furn_bathroom', frame: 5, name: 'Bath mat', w: 30, foot: [0, 0], flat: true },
    bathplant: { sheet: 'furn_bathroom', frame: 6, name: 'Plant', w: 30, foot: [7, 5] },
    basket: { sheet: 'furn_bathroom', frame: 7, name: 'Laundry basket', w: 30, foot: [8, 5] },
    stool: { sheet: 'furn_bathroom', frame: 8, name: 'Stool', w: 30, foot: [6, 4] }
  };

  /* starting rooms; she can move everything */
  var DEFAULTS = {
    bedroom: [['rug', 52, 74], ['bed', 30, 60], ['bedside', 45, 51], ['desk', 62, 55], ['drawers', 74, 62], ['bookshelf', 16, 66],
      ['plant', 84, 70], ['cushion', 52, 76], ['armchair', 38, 84], ['lamp', 24, 78]],
    bathroom: [['bathmat', 50, 78], ['bathtub', 30, 60], ['toilet', 66, 56], ['sink', 52, 52], ['cabinet', 78, 62], ['towels', 18, 70],
      ['bathplant', 84, 76], ['basket', 34, 86], ['stool', 62, 82]]
  };

  function fresh(sceneId) {
    return (DEFAULTS[sceneId] || []).map(function (d, i) { return { uid: sceneId + '-' + d[0] + '-' + i, item: d[0], x: d[1], y: d[2], flip: false }; });
  }
  function clean(layout, sceneId) { /* never trust stored layouts: known items, finite numbers, unique ids */
    if (!Array.isArray(layout)) return fresh(sceneId);
    var seen = {}, out = [];
    layout.forEach(function (p) {
      if (!p || !CATALOG[p.item] || !isFinite(p.x) || !isFinite(p.y) || seen[p.uid]) return;
      seen[p.uid] = true;
      out.push({ uid: String(p.uid).slice(0, 60), item: p.item, x: Math.max(0, Math.min(100, +p.x)), y: Math.max(0, Math.min(100, +p.y)), flip: !!p.flip });
    });
    return out;
  }

  function footRect(p) {
    var c = CATALOG[p.item], fw = c.foot[0], fd = c.foot[1];
    return [p.x - fw / 2, p.y - fd, p.x + fw / 2, p.y];
  }
  function overlaps(a, b) { return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]; }

  function solidsFor(layout) {
    return layout.filter(function (p) { return !CATALOG[p.item].flat; }).map(footRect);
  }
  function spotsFor(layout) {
    return layout.filter(function (p) { return CATALOG[p.item].spot; }).map(function (p) {
      var c = CATALOG[p.item], s = c.spot, sp = { id: p.uid, kind: s.kind, label: s.label, at: { x: p.x, y: p.y - Math.max(2, c.foot[1] / 2) },
        stand: { x: p.x + (p.flip ? -s.dx : s.dx), y: p.y + s.dy }, furniture: p.uid };
      if (s.topic) sp.topic = s.topic;
      if (s.panel) sp.panel = s.panel;
      if (s.sit) { sp.at = { x: p.x, y: p.y }; sp.sit = true; }
      return sp;
    });
  }

  /* fold a layout into a scene: keeps the scene's own solids and spots in base* the first time */
  function apply(scene, layout) {
    if (!scene.baseSolids) { scene.baseSolids = scene.solids.slice(); scene.baseSpots = scene.spots.slice(); }
    scene.solids = scene.baseSolids.concat(solidsFor(layout));
    scene.spots = scene.baseSpots.concat(spotsFor(layout));
    scene.layout = layout;
    return scene;
  }

  /* a piece fits when its front corners and footprint lie on the floor and its footprint is clear of other pieces, the
   * scene's own solids and every door; flat pieces only need their middle on the floor */
  function canPlace(W, sceneId, layout, uid, x, y) {
    var s = W.SCENES[sceneId], p = null;
    layout.forEach(function (q) { if (q.uid === uid) p = q; });
    if (!p) return false;
    var c = CATALOG[p.item], probe = { item: p.item, x: x, y: y }, r = footRect(probe);
    var onFloor = function (pt) { return W.inFloor(s, pt); };
    if (!onFloor({ x: x, y: y - 0.5 })) return false;
    if (c.flat) return true;
    if (![[r[0], r[3] - 0.3], [r[2], r[3] - 0.3], [r[0], r[1]], [r[2], r[1]]].every(function (q) { return onFloor({ x: q[0], y: q[1] }); })) return false;
    var others = layout.filter(function (q) { return q.uid !== uid && !CATALOG[q.item].flat; }).map(footRect).concat(s.baseSolids || s.solids);
    if (others.some(function (o) { return overlaps(r, o); })) return false;
    return !s.doors.some(function (d) { return overlaps(r, [d.rect[0] - 2, d.rect[1] - 2, d.rect[2] + 2, d.rect[3] + 3]); });
  }

  /* which piece is under a tap, front-most first; box is the drawn sprite in scene units (from the strip's cell) */
  function hit(layout, pt, boxOf) {
    var hits = layout.filter(function (p) { var b = boxOf(p); return b && pt.x >= b[0] && pt.x <= b[2] && pt.y >= b[1] && pt.y <= b[3]; });
    hits.sort(function (a, b) { return (CATALOG[a.item].flat ? -1 : 0) - (CATALOG[b.item].flat ? -1 : 0) || b.y - a.y; });
    return hits[0] || null;
  }

  root.EbbFurniture = { CATALOG: CATALOG, DEFAULTS: DEFAULTS, fresh: fresh, clean: clean, footRect: footRect, solidsFor: solidsFor,
    spotsFor: spotsFor, apply: apply, canPlace: canPlace, hit: hit };
})(typeof window !== 'undefined' ? window : globalThis);
