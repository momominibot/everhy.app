# Flower Dome notes (js/ext/dome.js, 23 Oct 2026)

The Gardens by the Bay glasshouse: scene `dome`, plate art/plates/flowerdome.webp (from art/raw/sg_flowerdome.png,
768x1344, read on a 5 percent grid; x 0..100, y 0..175). Doors: the glass doors at the bottom lead to Merlion Park
(arrive 40,136); Merlion Park's new door `toDome` sits on the open paving at the right edge of the promenade
([86.5, 122.5, 94, 127.5], between the notice board solid above and the lamp solid below; the suggested
[86, 108, 94, 120] lies inside the park's notice-board solid). Spots: the seed stall (kind `seedshop`) and a bench
(the engine's `cushion`). Map pin `dome` at 52,60.

## Points (js/dome/rules.js, pure)
`state.points = { total, spent, entries: [{ id, date, source, n }] }`. Rebuilt from the saved data on load, after every
save (EbbStore.save is wrapped) and every 3 s while visible, so nothing depends on catching an event. Each confirmed
log entry (`state.log.obs`, `confirmed: true`, keyed `log:<id>`) earns 10; each practice that ran to the end
(`state.observations`, type `mindfulness`, status `finished`, keyed `practice:<id>`) earns 15; at most 60 a day,
counted on the local day the record was saved (`created`, else its own date). An entry past the cap is remembered
with n 0 so it is never retried. Known ids are never paid twice; a retracted or edited record keeps what it earned.
Spending is a negative entry (`seed:<crop>`); totals are recomputed from the entries, so a mangled save repairs itself.
Hearts (`state.daily`) are never read or written.

## The stall
Prices: turnip 20, carrot 30, sunflower 40, any other crop 30. Buying debits the ledger and adds one to
`state.farm.seeds[crop]`, the same map the shed fills, so planting needs no change and the shed still gives three free
seeds a day. A seed she cannot afford shows a disabled "Not yet" with how many more points it needs.

## Checks
`node tools/test-dome.js` (ledger, cap, spend, grant shape, stands and doors, map pin, page wiring);
`python3 tools/smoke_dome.py [shots_dir]` (27 browser checks at 390x844, serves the repo itself).
