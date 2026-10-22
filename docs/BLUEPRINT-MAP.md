# The cozy-town blueprint, mapped onto Ebb

Jamie's `cozy-town-blueprint.txt` (22 Oct 2026) is a four-phase Phaser template for an Animal Crossing style
life-sim with programmatic shapes and a coin economy. Ebb keeps the mechanics and drops what does not fit a
mindfulness and ovarian wellness app. Decisions:

| Blueprint | Ebb |
|---|---|
| Phaser, canvas shapes, emoji sprites | Vanilla JS, SVG over Seedream clay renders. The art is the point. |
| 40x40 tile grid, tile-locked stepping | Free walking on painted floors with A* and string pulling, like Animal Crossing itself. Everything is solid. |
| `window.gameState` detached from rendering | `EbbStore` (`state` saved to localStorage, synced later) detached from `ebb-game.js` rendering. |
| Tailwind DOM overlay for UI | Bottom sheets from `ebb-ui.js`, floating top bar, round scene buttons. Pop-ups come from room objects. |
| Phase 1 engine, state, movement | Done: `ebb-game.js`, `ebb-world.js`, `ebb-store.js`, `ebb-clay.js`. |
| Phase 2 ITEM_DATABASE, inventory modal, stack limits | `ebb-bag` session: `EbbItems` registry, `state.bag`, Bag sheet. Stack limits are not needed; nothing is scarce. |
| Phase 3 resource nodes, action key, 60 s tick, regrowth | `ebb-trees` session: fruit trees and daily dig nodes. Growth is by real days (overnight), never by a minute tick, so the game rewards coming back, not staying. |
| Phase 4 villager FSM, dialogue, sell items for coins | `ebb-npc` session: Mochi the cat wanders, greets, talks. No coins and no selling: kind moments raise a friendship that only goes up. |
| Wallet / coins | None. Offerings to the pond Goddess and hearts for finished practices. Progress never depends on what she logs. |
| Day-night by tick | By the phone clock (`ebb-sky`), with rain some days and fireflies at night. |

What the concept adds that the blueprint has no room for: the bedroom and bathroom objects open the logging pop-ups
(bed: sleep; bedside: waking temperature; journal: mood; toilet: bleeding and mucus; mirror: body; calendar: cycle);
the cushion and benches run mindfulness practices; the course lives on the bookshelf; safety rules watch every note.
