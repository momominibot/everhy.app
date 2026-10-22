# Bag (phase 2)

One place that shows everything she carries. Files: `js/ext/bag.js` (entry: button, sheet, actions), `js/bag/items.js`
(item registry, pure), `js/bag/core.js` (bag rules, pure), `css/ext/bag.css`, `art/bag/items.*` (the dig sheet, cut
with `tools/slice_sheet.py art/raw/dig_items.png art/bag/items --count 9 --height 160`), `tools/test-bag.js` (65 node
checks), `tools/smoke_bag.py` (36 headless checks at 390 x 844).

## Where things live
- `state.bag` `{ itemId: count }`: things other phases give her (finds from digging, tools). `EbbBag.add` / `take`
  only ever touch this map, and a count never goes below zero.
- `state.farm.seeds` and `state.farm.basket` are read live through bridges, never copied, so the farm module is
  unchanged and keeps moving seeds and crops the way it always did. `state.pond.gift` shows as the moon pearl.
- Anything in a basket or bag that nobody defined still shows, as a find named from its id, so nothing is hidden.

## Adding items (phases 3 and 4)
```js
EbbItems.define({ id: 'seashell', name: 'Seashell', kind: 'find', icon: { strip: 'bag', frame: 2 }, about: 'Found in the sand.' });
EbbBag.add(api.state(), 'seashell');           // into state.bag; api.save()
EbbBag.registerBridge('dig.finds', st => st.dig && st.dig.finds || {});   // or keep your own store and bridge it
EbbBag.registerAction({ id: 'give', label: 'Give', kinds: ['crop', 'find'], when: c => c.api.scene() === 'plaza', run: c => { c.close(); ... } });
```
Kinds: `seed`, `crop`, `find`, `gift`, `tool`. Icons name a strip in `EbbPropSprites` (engine) or `EbbItems.STRIPS`
(`items` = art/world/items.webp: egg, milk, three fish, spa egg; `bag` = art/bag/items.webp: soil mound, shovel,
seashell, fossil, acorn, daisy, honey jar, woven bag, bell). An item with no picture shows its first letter on a disc.

## The sheet
Grouped by kind, every kind always has a line (its items, or an empty line). Tapping an item shows what it is for and
at most one action: `Plant in a bed` on the farm (walks her to the nearest hoed bed; the farm plants in shed order and
the sheet says so when another seed goes first), `Take the basket to the pond` at the waterfall (walks her to the
Goddess; the farm offers the most plentiful item and the sheet says which). Giving to a friend is phase 4's action.
No HUD counter: the top bar already shows seeds, basket and pond.

## For the integrator
- `index.html` has one link and one script line, after sound.
- The bag button sits bottom-left above the sound toggle and the first-run hint; the centred action button is never
  covered (the smoke checks all four controls for overlap).
- `EbbUi.modalOpen()` does not know this sheet; the scrim blocks taps and keydown is stopped inside it, like the world cards.
- `art/raw/dig_items.png` was rendered by main's guarded queue, not here; this branch only cuts it.
