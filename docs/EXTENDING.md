# Extending Ebb (for parallel workstreams)

Each workstream owns ONE entry file `js/ext/<name>.js` (+ optional `css/ext/<name>.css`) and any new files under
`js/<name>/`, `art/<name>/`, `tools/`, `docs/<name>-*.md`. Never edit `js/ebb-*.js`, `index.html` or `css/ebb.css`;
ask the integrator instead. Entry files load after the engine and before boot.

## Hooks
- `EbbWorld.register(id, scene)`: add a place. Scene: `{ name, plate, floor: [[x,y]...], solids: [[x0,y0,x1,y1]], doors: [...],
  spots: [{ id, kind, at:{x,y}, stand:{x,y}, label }], start:{x,y} }`, all in percent of a square scene.
- `EbbWorld.addDoor(sceneId, { id, rect:[x0,y0,x1,y1], to, arrive:{x,y}, label })`: connect places.
- `EbbGame.registerKind(kind, fn(spot, api))`: what happens when she reaches a spot of that kind.
- `EbbGame.registerProps(sceneId, fn(api, near) -> svg string)`: draw things over a scene (percent units).
- `EbbGame.registerPanel({ id, label, open(api) })`: an entry in the More menu.
- `EbbGame.registerHud(label, fn(api) -> text)`: a counter in the top bar.
- `api`: state(), save(), today(), toast(text, ms), me(), scene(), enter(id, at), refresh(), work(tool, ms, view),
  sit(at), stand(y), fx(svgHtml, ms).
- Store your own data under `api.state().<yourKey>` and call `api.save()`.

## Art
All images come from Seedream 5.0 pro through `python3 tools/run_batch.py <jobs.json>` (guarded: one run, lock, no
retry, stops and writes art/BLOCKED.json on the first failure; never delete that file yourself). Jobs:
`[{ "id", "size": "1024x1024", "prompt" (< 650 chars), "ref"? }]`. Style line to end every prompt with:
"Cosy Animal Crossing New Horizons inspired soft 3D clay, rounded chunky shapes, smooth matte clay materials, gentle
warm lighting, pastel pink, cream, sage and honey wood." Objects and characters go on "Solid flat pure bright green
#00FF00 background" (magenta #FF00FF for green subjects such as plants) and are keyed with tools/slice_sheet.py.
