#!/usr/bin/env python3
"""Headless phone smoke (390x844) for transit. Serves the repo on a spare port. Drives the map to Merlion Park by MRT,
sits and breathes for a few seconds, reloads mid-ride (still on board, Arrive still works), arrives, takes the bus
to the hawker centre and gets off down the stairs, checks Teleport and that leaving by another route forgets the
trip, and walks every seat and exit of both carriages. Zero console errors. Nothing leaves the machine.
Run: python3 tools/smoke_transit.py [--shots DIR]"""
import functools, http.server, socket, sys, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SHOTS = Path(sys.argv[sys.argv.index('--shots') + 1]) if '--shots' in sys.argv else None
passed, failed = 0, 0


def check(name, ok):
    global passed, failed
    if ok: passed += 1
    else:
        failed += 1; print('FAIL', name)


def serve():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, port


def shot(pg, name):
    if SHOTS:
        SHOTS.mkdir(parents=True, exist_ok=True); pg.screenshot(path=str(SHOTS / f'{name}.png'))


def ready(pg):
    pg.wait_for_function('window.EbbGame && EbbGame._ready && window.EbbTransitRules')
    pg.evaluate("document.querySelectorAll('.sheet-wrap').forEach(w => w.remove())")


def settle(pg):  # the walk starts on the next frame; wait until she stops
    pg.wait_for_timeout(350); pg.wait_for_function("() => EbbGame.me().action !== 'walk'", timeout=20000); pg.wait_for_timeout(150)


def click(pg, sel):
    pg.wait_for_selector(sel, state='visible', timeout=5000); pg.eval_on_selector(sel, 'e => e.click()')


def go_map(pg, pin):
    pg.evaluate("EbbMap.open()"); pg.wait_for_selector('.map-wrap', timeout=5000)
    click(pg, f'.map-place[data-pin="{pin}"]')


def ride_mindful(pg):  # she just sits first (the ride has its own Get up); the seat options come with A mindful moment
    pg.wait_for_selector('.seat-choice [data-act="mindful"]', timeout=5000)
    check('on the ride she just sits first: Just sit and A mindful moment', pg.locator('.seat-choice .btn').all_inner_texts() == ['Just sit', 'A mindful moment'])
    click(pg, '.seat-choice [data-act="mindful"]')


def scene(pg): return pg.evaluate("EbbGame.api.scene()")


def trip(pg): return pg.evaluate("() => (EbbGame.state().transit || {}).trip || null")


def wait_scene(pg, sid): pg.wait_for_function("s => EbbGame.api.scene() === s && !document.getElementById('scene').classList.contains('fading')", arg=sid, timeout=8000)


srv, port = serve()
with sync_playwright() as p:
    br = p.chromium.launch()
    pg = br.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and '404' not in m.text else None)
    pg.goto(f'http://127.0.0.1:{port}/?time=14:00'); pg.evaluate("localStorage.clear()")
    ready(pg)
    # a returning player: the saved game carries the safety module's own onboarding record, so no sheet covers the room
    pg.evaluate("""() => { const s = EbbGame.state(); s.safety = Object.assign({}, s.safety, { onboardedAt: '2026-10-22T08:00:00Z',
      onboardVersion: (window.EbbSafetyUi && EbbSafetyUi.ONBOARD_VERSION) || 'onboard-2026-10-22.1' }); EbbGame.api.save(); }""")
    pg.reload(); ready(pg)
    pg.evaluate("document.querySelectorAll('.sheet-wrap, .routines-card').forEach(w => w.remove())")
    pg.evaluate("EbbGame.enter('farm')"); pg.wait_for_timeout(300)

    # the map asks how she gets to Merlion Park; the map sheet is gone and nothing has moved yet
    go_map(pg, 'merlion')
    try: pg.wait_for_selector('.transit-wrap', timeout=5000)
    except Exception:
        print('DEBUG', pg.evaluate("() => ({ scene: EbbGame.api.scene(), transit: !!window.EbbTransit, rules: !!window.EbbTransitRules, map: !!document.querySelector('.map-wrap'), sheets: [...document.querySelectorAll('.sheet-wrap')].map(e => e.className), trip: (EbbGame.state().transit || {}).trip || null, offer: window.EbbTransitRules && EbbTransitRules.offerFor(EbbMap.pin('merlion'), EbbWorld.SCENES, EbbGame.api.scene()) })"), 'errors', errs); raise
    check('the choice sheet asks the question', pg.evaluate("document.querySelector('.transit-sheet h2').textContent") == 'How will you get there?')
    check('three ways to go', pg.evaluate("document.querySelectorAll('.transit-card').length") == 3)
    pg.wait_for_function("[...document.querySelectorAll('.transit-pic')].every(i => i.complete)", timeout=5000)
    check('the MRT and the bus are picture tiles side by side', pg.evaluate("[...document.querySelectorAll('.transit-rides .transit-card.pic')].map(b => b.dataset.choice + ':' + (b.querySelector('img').naturalWidth > 0)).join()") == 'train:true,bus:true'
          and pg.evaluate("(() => { const [a, b] = [...document.querySelectorAll('.transit-rides .transit-card')].map(e => e.getBoundingClientRect()); return Math.abs(a.top - b.top) < 1 && a.right <= b.left; })()"))
    check('the last way is Teleport', pg.evaluate("document.querySelector('.transit-card[data-choice=\"teleport\"] b').textContent") == 'Teleport')
    check('the map closed first', pg.evaluate("!document.querySelector('.map-wrap')"))
    check('still on the farm until she chooses', scene(pg) == 'farm' and trip(pg) is None)
    shot(pg, 'transit_choice')
    # Not now keeps her where she is
    click(pg, '.transit-wrap [data-act="notnow"]'); pg.wait_for_timeout(200)
    check('Not now stays put', scene(pg) == 'farm' and not pg.evaluate("!!document.querySelector('.transit-wrap')"))
    # home never asks: straight to the bedroom
    go_map(pg, 'home'); wait_scene(pg, 'bedroom')
    check('home travels with no question', scene(pg) == 'bedroom' and not pg.evaluate("!!document.querySelector('.transit-wrap')"))
    pg.evaluate("EbbGame.enter('farm')"); pg.wait_for_timeout(300)

    # take the MRT
    go_map(pg, 'merlion'); click(pg, '.transit-card[data-choice="train"]'); wait_scene(pg, 'train')
    t = trip(pg)
    check('on the train with the trip remembered', scene(pg) == 'train' and t and t['to'] == 'merlion' and t['mode'] == 'train' and t['arrive'] is None and t['startedAt'] > 0)
    check('the place reads MRT train', pg.evaluate("document.getElementById('place').textContent") == 'MRT train')
    check('one sparkle in the carriage, not one per seat', pg.evaluate("document.querySelectorAll('.sparkle').length") == 1)
    pg.wait_for_selector('#transitArrive', state='visible', timeout=3000)
    check('Arrive names her stop', pg.evaluate("document.getElementById('transitArrive').textContent") == 'Arrive at Merlion Park')
    check('Get up waits until she sits', pg.evaluate("document.getElementById('transitUp').hidden"))
    check('the exit door now leads to Merlion Park', pg.evaluate("EbbWorld.SCENES.train.doors[0].to") == 'merlion')
    # walk the aisle, then take a seat
    pg.evaluate("EbbGame.walkTo({ x: 30, y: 112 })"); settle(pg)
    me = pg.evaluate("() => ({ x: EbbGame.me().x, y: EbbGame.me().y })")
    check('she walks the aisle', abs(me['x'] - 30) < 1.5 and abs(me['y'] - 112) < 1.5)
    seat = pg.evaluate("() => EbbWorld.SCENES.train.spots[2]")
    pg.evaluate("sp => EbbGame.walkTo(sp.stand, { spot: sp })", seat); settle(pg); ride_mindful(pg)
    pg.wait_for_selector('.transit-wrap', timeout=5000)
    check('seated with the seat sheet open', pg.evaluate("EbbGame.me().action === 'sit' && EbbTransit.seated()"))
    check('three seat choices', pg.evaluate("[...document.querySelectorAll('.transit-card')].map(b => b.dataset.choice).join()") == 'breathe,notice,sit')
    click(pg, '.transit-card[data-choice="breathe"]')
    pg.wait_for_selector('.pill[data-secs="90"]', timeout=3000)
    check('60 is chosen by default', pg.evaluate("document.querySelector('.pill[data-secs=\"60\"]').getAttribute('aria-pressed')") == 'true')
    click(pg, '.transit-wrap [data-act="begin"]')
    pg.wait_for_selector('#transitClock', timeout=3000)
    check('a visible timer counts down', pg.evaluate("document.getElementById('transitClock').textContent").startswith('1:00') or pg.evaluate("document.getElementById('transitClock').textContent").startswith('0:59'))
    check('the breath cue starts with in', pg.evaluate("document.querySelector('.transit-cue').textContent") == 'Breathe in')
    pg.wait_for_timeout(2600)
    clock = pg.evaluate("document.getElementById('transitClock').textContent")
    check('seconds pass', clock.startswith('0:5'))
    click(pg, '.transit-wrap [data-act="pause"]'); pg.wait_for_timeout(1300)
    paused = pg.evaluate("document.getElementById('transitClock').textContent")
    check('pause holds the clock', 'paused' in paused and pg.evaluate("document.querySelector('.transit-wrap [data-act=\"pause\"]').textContent") == 'Resume')
    pg.wait_for_timeout(1200)
    check('paused time does not count', pg.evaluate("document.getElementById('transitClock').textContent") == paused)
    click(pg, '.transit-wrap [data-act="pause"]'); pg.wait_for_timeout(1500)
    check('resumed and counting', 'paused' not in pg.evaluate("document.getElementById('transitClock').textContent"))
    n_before = pg.evaluate("EbbGame.state().observations.filter(o => o.type === 'mindfulness').length")
    pg.wait_for_timeout(1800)
    click(pg, '.transit-wrap [data-act="skip"]')
    pg.wait_for_selector('.transit-wrap [data-act="stay"]', timeout=3000)
    obs = pg.evaluate("() => EbbGame.state().observations.filter(o => o.type === 'mindfulness').slice(-1)[0]")
    check('skip after a few seconds saves a partial observation on the train', pg.evaluate("EbbGame.state().observations.filter(o => o.type === 'mindfulness').length") == n_before + 1
          and obs['where'] == 'train' and obs['status'] == 'partial' and obs['practice'] == 'transit-breathe' and 5 <= obs['activeSec'] <= 9 and obs['plannedSec'] == 60 and obs['source'] == 'transit')
    click(pg, '.transit-wrap [data-act="stay"]'); pg.wait_for_timeout(400)
    check('she stays seated, Get up offered', pg.evaluate("EbbGame.me().action === 'sit' && !document.getElementById('transitUp').hidden && !document.querySelector('.transit-wrap')"))
    shot(pg, 'transit_train_seated')

    # reload mid-ride: still on the train, the trip kept, Arrive still works
    pg.reload(); ready(pg); pg.wait_for_timeout(400)
    t = trip(pg)
    check('after a reload she is still on the train', scene(pg) == 'train' and t and t['to'] == 'merlion')
    check('the saved practice survived too', pg.evaluate("EbbGame.state().observations.filter(o => o.where === 'train').length") == 1)
    pg.wait_for_selector('#transitArrive', state='visible', timeout=3000)
    check('Arrive is back after the reload', pg.evaluate("document.getElementById('transitArrive').textContent") == 'Arrive at Merlion Park')
    # notice five things, run to the end quickly by ending through the rules timer
    seat2 = pg.evaluate("() => EbbWorld.SCENES.train.spots[4]")
    pg.evaluate("sp => EbbGame.walkTo(sp.stand, { spot: sp })", seat2); settle(pg); ride_mindful(pg)
    pg.wait_for_selector('.transit-card[data-choice="notice"]', timeout=5000); click(pg, '.transit-card[data-choice="notice"]')
    pg.wait_for_selector('#transitClock', timeout=3000)
    check('notice runs straight away with 45 seconds', pg.evaluate("document.getElementById('transitClock').textContent").startswith('0:4') and 'see' in pg.evaluate("document.querySelector('.transit-cue').textContent"))
    pg.wait_for_timeout(5200); click(pg, '.transit-wrap [data-act="skip"]')
    pg.wait_for_selector('.transit-wrap [data-act="up"]', timeout=3000)
    obs = pg.evaluate("() => EbbGame.state().observations.filter(o => o.type === 'mindfulness').slice(-1)[0]")
    check('the five-things pause is saved on the train, on the senses', obs['practice'] == 'transit-notice' and obs['anchor'] == 'senses' and obs['where'] == 'train' and obs['activeSec'] >= 5)
    click(pg, '.transit-wrap [data-act="up"]'); pg.wait_for_timeout(300)
    me = pg.evaluate("() => ({ x: EbbGame.me().x, y: EbbGame.me().y, a: EbbGame.me().action })")
    check('Get up puts her at the stand point', me['a'] != 'sit' and abs(me['x'] - seat2['stand']['x']) < 0.5 and abs(me['y'] - seat2['stand']['y']) < 0.5)
    # just sit, then Arrive from the seat
    pg.evaluate("sp => EbbGame.walkTo(sp.stand, { spot: sp })", seat); settle(pg); ride_mindful(pg)
    pg.wait_for_selector('.transit-card[data-choice="sit"]', timeout=5000); click(pg, '.transit-card[data-choice="sit"]'); pg.wait_for_timeout(300)
    n_obs = pg.evaluate("EbbGame.state().observations.length")
    check('Just sit saves nothing and keeps her seated', pg.evaluate("EbbGame.me().action") == 'sit' and not pg.evaluate("!!document.querySelector('.transit-wrap')"))
    click(pg, '#transitArrive'); wait_scene(pg, 'merlion')
    check('Arrive brings her to Merlion Park on the floor', scene(pg) == 'merlion' and trip(pg) is None and pg.evaluate("EbbWorld.walkable('merlion', EbbGame.me())") and pg.evaluate("EbbGame.me().action") != 'sit')
    check('nothing saved by just sitting', pg.evaluate("EbbGame.state().observations.length") == n_obs)
    pg.wait_for_timeout(300)
    check('Arrive hides off the train', pg.evaluate("document.querySelector('.transit-bar').hidden"))

    # the bus to the hawker centre, off down the stairs
    go_map(pg, 'hawker'); click(pg, '.transit-card[data-choice="bus"]'); wait_scene(pg, 'bus')
    t = trip(pg)
    check('on the bus, trip to the hawker centre', scene(pg) == 'bus' and t and t['mode'] == 'bus' and t['to'] == 'hawker')
    check('the place reads Bus', pg.evaluate("document.getElementById('place').textContent") == 'Bus')
    check('one sparkle on the upper deck too', pg.evaluate("document.querySelectorAll('.sparkle').length") == 1)
    pg.wait_for_timeout(700); shot(pg, 'transit_bus')
    stairs = pg.evaluate("() => { const d = EbbWorld.SCENES.bus.doors[1]; return { x: (d.rect[0] + d.rect[2]) / 2, y: (d.rect[1] + d.rect[3]) / 2 }; }")
    pg.evaluate("q => EbbGame.walkTo(q)", stairs); wait_scene(pg, 'hawker'); pg.wait_for_function("() => !(EbbGame.state().transit || {}).trip", timeout=3000)
    check('down the stairs she arrives at the hawker centre', scene(pg) == 'hawker' and trip(pg) is None and pg.evaluate("EbbWorld.walkable('hawker', EbbGame.me())"))

    # Teleport is the old straight-there path; leaving by another route forgets the trip
    go_map(pg, 'waterfall'); click(pg, '.transit-card[data-choice="teleport"]'); wait_scene(pg, 'waterfall')
    check('Teleport goes straight there', scene(pg) == 'waterfall' and trip(pg) is None)
    go_map(pg, 'pier'); click(pg, '.transit-card[data-choice="train"]'); wait_scene(pg, 'train')
    t = trip(pg); fishing = pg.evaluate("() => EbbWorld.SCENES.jetty.spots.find(s => s.id === 'fishing').stand")
    check('a spot pin remembers its stand point', t and t['to'] == 'jetty' and t['arrive'] == fishing)
    pg.wait_for_timeout(400)
    check('Arrive names Bedok Jetty', pg.evaluate("document.getElementById('transitArrive').textContent") == 'Arrive at Bedok Jetty')
    pg.evaluate("EbbGame.enter('farm')"); pg.wait_for_timeout(600)
    check('leaving another way forgets the trip', scene(pg) == 'farm' and trip(pg) is None and pg.evaluate("document.querySelector('.transit-bar').hidden"))
    check('the exit door falls back to its default stop', pg.evaluate("EbbWorld.SCENES.train.doors[0].to") == 'merlion')
    # a trip saved while she was somewhere else is forgotten at boot
    pg.evaluate("() => { const s = EbbGame.state(); s.transit = { trip: { to: 'merlion', arrive: null, mode: 'bus', startedAt: 1 } }; EbbGame.api.save(); }")
    pg.reload(); ready(pg); pg.wait_for_timeout(300)
    check('a stale trip off the bus is dropped at boot', scene(pg) == 'farm' and trip(pg) is None)

    # every seat and exit of both carriages, like smoke_doors
    for sid in ('train', 'bus'):
        plan = pg.evaluate("id => { const s = EbbWorld.SCENES[id], out = []; s.spots.forEach(sp => out.push({ kind: 'spot', id: sp.id, label: sp.label, x: sp.stand.x, y: sp.stand.y }));"
                           " s.doors.forEach(d => out.push({ kind: 'door', id: d.id, to: d.to, x: (d.rect[0] + d.rect[2]) / 2, y: (d.rect[1] + d.rect[3]) / 2 })); return out; }", sid)
        for step in plan:
            pg.evaluate(f"EbbGame.enter('{sid}')"); pg.wait_for_timeout(200)
            pg.evaluate("q => EbbGame.walkTo(q)", {'x': step['x'], 'y': step['y']})
            try:
                if step['kind'] == 'door':
                    wait_scene(pg, step['to']); check(f'{sid}/{step["id"]} lands on the floor', pg.evaluate("EbbWorld.walkable(EbbGame.api.scene(), EbbGame.me())"))
                else:
                    settle(pg)
                    me = pg.evaluate("() => ({ x: EbbGame.me().x, y: EbbGame.me().y, scene: EbbGame.api.scene(), prompt: (document.querySelector('.actionbar .prompt') || {}).textContent || '' })")
                    check(f'{sid}/{step["id"]} reached with its prompt', me['scene'] == sid and abs(me['x'] - step['x']) < 1.5 and abs(me['y'] - step['y']) < 1.5 and step['label'] in me['prompt'])
            except Exception as e:
                check(f'{sid}/{step["id"]} walk', False); print('  ', str(e).split('\n')[0])
    check('no page errors', not errs)
    if errs: print('errors:', errs)
    br.close()
srv.shutdown()
print(f'smoke_transit: {passed} passed, {failed} failed')
sys.exit(1 if failed else 0)
