/* Ebb item registry, pure. Every thing she can carry is defined once here or by the workstream that makes it:
 *   EbbItems.define({ id, name, kind, icon: { strip, frame }, stack: true, about })
 * kinds: seed (plant in a bed), crop (from the farm), find (eggs, milk, fish, dug-up things), gift (given to her),
 * tool (kept, never used up). Icons name a sprite strip (EbbPropSprites or EbbItems.STRIPS) and a frame in it.
 * The farm's seeds and crops register here from EbbFarm.CROPS; the barn and fishing items from js/world/rules.js are
 * listed by name so the bag can show them before that file loads. Digging (phase 3) and friends (phase 4) call
 * define() from their own entry files. Nothing here reads or writes state. */
(function (root) {
  'use strict';

  var KINDS = [
    { id: 'seed', label: 'Seeds', about: 'Plant one in a hoed bed on the farm.', empty: 'No seeds yet. The shed on the farm gives three a day.' },
    { id: 'crop', label: 'From the farm', about: 'Offer at the pond, or give to a friend when you meet one.', empty: 'Nothing picked yet. Crops ripen overnight when watered.' },
    { id: 'find', label: 'Finds', about: 'Things found along the way. The pond takes any of them.', empty: 'Nothing found yet. Try the barn, the pier, or digging.' },
    { id: 'gift', label: 'Gifts', about: 'Given to you. Yours to keep.', empty: 'No gifts yet.' },
    { id: 'tool', label: 'Tools', about: 'Kept in the bag and never used up.', empty: 'No tools yet.' }
  ];
  var KIND_INDEX = {};
  KINDS.forEach(function (k, i) { KIND_INDEX[k.id] = i; });

  /* strips the engine does not list in EbbPropSprites (those are drawn from art/<dir>/<strip>.webp) */
  var STRIPS = {
    items: { src: 'art/world/items.webp', frames: 6, w: 195, h: 189 },  /* egg, milk, small, medium, large fish, spa egg */
    bag: { src: 'art/bag/items.webp', frames: 9, w: 189, h: 172, ready: true } /* dig sheet (art/bag/items.json): soil mound, shovel, seashell, fossil, acorn, daisy, honey jar, woven bag, bell */
  };

  var ITEMS = {}, ORDER = [];

  function clean(d) {
    if (!d || typeof d !== 'object') return null;
    var id = typeof d.id === 'string' ? d.id.trim() : '';
    var name = typeof d.name === 'string' ? d.name.trim() : '';
    if (!id || !name || !KIND_INDEX.hasOwnProperty(d.kind)) return null;
    var icon = d.icon && typeof d.icon === 'object' && typeof d.icon.strip === 'string' ? { strip: d.icon.strip, frame: Math.max(0, Math.floor(Number(d.icon.frame) || 0)) } : null;
    return { id: id, name: name, kind: d.kind, icon: icon, stack: d.stack !== false, about: typeof d.about === 'string' ? d.about : '', source: typeof d.source === 'string' ? d.source : 'bag' };
  }
  /* returns the item, or null when the definition is incomplete or the id is already taken */
  function define(d) {
    var it = clean(d);
    if (!it || ITEMS.hasOwnProperty(it.id)) return null;
    ITEMS[it.id] = it; ORDER.push(it.id);
    return it;
  }
  function get(id) { return ITEMS.hasOwnProperty(id) ? ITEMS[id] : null; }
  function all() { return ORDER.map(function (id) { return ITEMS[id]; }); }
  function byKind(kind) { return all().filter(function (it) { return it.kind === kind; }); }
  function kind(id) { return KINDS[KIND_INDEX[id]] || null; }
  /* a stand-in for something in a basket or bag that nobody defined, so it is still shown and never lost */
  function stub(id) {
    var words = String(id).replace(/[-_]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
    return { id: String(id), name: words.charAt(0).toUpperCase() + words.slice(1), kind: 'find', icon: null, stack: true, about: '', source: 'unknown', stub: true };
  }
  function seedId(crop) { return 'seed-' + crop; }

  /* ---------- the farm's crops: a seed and a picked crop for each ---------- */
  var F = root.EbbFarm;
  if (F && F.CROPS) {
    Object.keys(F.CROPS).forEach(function (c) {
      var crop = F.CROPS[c], low = crop.name.toLowerCase();
      define({ id: seedId(c), name: crop.name + ' seed', kind: 'seed', icon: { strip: 'icons', frame: 0 }, source: 'farm.seeds',
        about: 'Grows into a ' + low + ' in ' + crop.days + ' watered days. Plant it in a hoed bed.' });
      define({ id: c, name: crop.name, kind: 'crop', icon: { strip: c, frame: 4 }, source: 'farm.basket',
        about: 'Picked from the farm. The Goddess at the pond is glad of a ' + low + '.' });
    });
  }
  /* ---------- barn and fishing (names match js/world/rules.js ITEMS; frames match art/world/items.webp) ---------- */
  [['egg', 'Egg', 0, 'From a hen you fed the day before. An egg lowered into the hot spring comes out spa-boiled.'],
   ['milk', 'Milk', 1, 'Fresh from Mochi on a day she was cared for.'],
   ['fishSmall', 'Small fish', 2, 'Caught off the pier. Small, quick and shiny.'],
   ['fishMedium', 'Medium fish', 3, 'Caught off the pier with good timing.'],
   ['fishLarge', 'Large fish', 4, 'Caught off the pier right in the middle of the dip.'],
   ['spaEgg', 'Spa-boiled egg', 5, 'An egg warmed through in the hot spring. The small secret.']
  ].forEach(function (r) { define({ id: r[0], name: r[1], kind: 'find', icon: { strip: 'items', frame: r[2] }, about: r[3], source: 'farm.basket' }); });
  /* ---------- the Goddess's gift ---------- */
  define({ id: 'moonPearl', name: 'Moon pearl', kind: 'gift', icon: { strip: 'icons', frame: 2 }, source: 'pond.gift',
    about: 'The Goddess gave you this after five offerings. It glows a little at night.' });

  root.EbbItems = { KINDS: KINDS, STRIPS: STRIPS, define: define, get: get, all: all, byKind: byKind, kind: kind, stub: stub, seedId: seedId };
})(typeof window !== 'undefined' ? window : globalThis);
