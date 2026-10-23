#!/usr/bin/env python3
"""Headless walk through the Singapore world at 390x844: Merlion Park -> Bedok Jetty (fish seated on the edge, early
reel lets it swim off) -> Little Guilin -> Sembawang hot spring (soak inside the pool, spa egg, climb out) -> Little
Guilin (offer at the lake). Walks through the real doors and to spots as a tap would. Serves the repo on a spare
port, seeds one returning save, fails on any console error. Run: python3 tools/smoke_world.py [shots_dir]"""
import datetime, functools, http.server, json, socket, sys, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SHOTS = Path(sys.argv[1]) if len(sys.argv) > 1 else None


def serve():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    handler = functools.partial(Quiet, directory=str(ROOT))
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', port), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, port


def main():
    today = datetime.date.today()
    yesterday = (today - datetime.timedelta(days=1)).isoformat()
    beds = [{"state": "grass", "crop": None, "watered": []} for _ in range(6)]
    save = {"v": 1, "scene": "merlion", "pos": None, "outfit": None, "observations": [], "pond": {"offerings": 0, "gift": False},
            "safety": {"onboardSkippedAt": "2026-10-22T08:00:00Z"},  # a returning player: the first-launch welcome is done
            "farm": {"beds": beds, "seedDay": None, "seedsLeft": 0, "basket": {}, "seeds": {}},
            "world": {}}
    srv, port = serve()
    errors, checks = [], []

    def check(name, ok):
        checks.append((name, bool(ok)))
        print(('ok   ' if ok else 'FAIL ') + name, flush=True)

    with sync_playwright() as pw:
        b = pw.chromium.launch()
        ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
        ctx.add_init_script("if (!sessionStorage.getItem('seeded')) { localStorage.setItem('ebb_save_v1', %s); sessionStorage.setItem('seeded', '1'); }" % json.dumps(json.dumps(save)))
        page = ctx.new_page()
        def on_console(m):  # other workstreams' entry files may not exist on this branch: a 404 there is harmless
            url = (m.location or {}).get('url', '')
            if m.type == 'error' and not ('/ext/' in url and 'world' not in url):
                errors.append(m.text + ' ' + url)
        page.on('console', on_console)
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(f'http://127.0.0.1:{port}/index.html')
        page.wait_for_function('window.EbbGame && window.EbbGame._ready && window.EbbWorldRules')
        page.evaluate("document.querySelectorAll('.sheet-wrap:not(.world-wrap), .routines-card').forEach(w => w.remove())")

        def settle():  # the walk starts on the next frame; wait until she stops
            page.wait_for_timeout(350); page.wait_for_function("() => EbbGame.me().action !== 'walk'", timeout=20000); page.wait_for_timeout(150)

        def name(sid):
            return page.evaluate('s => EbbWorld.SCENES[s].name', sid)

        def place(sid, t=15000):
            page.wait_for_function('n => document.getElementById("place").textContent === n', arg=name(sid), timeout=t)
            page.wait_for_timeout(650)  # the engine ignores taps during the door fade

        def through(to):  # walk into the door that leads to `to`, as a tap there would
            q = page.evaluate("t => { const d = EbbWorld.SCENES[EbbGame.api.scene()].doors.find(d => d.to === t); return { x: (d.rect[0] + d.rect[2]) / 2, y: (d.rect[1] + d.rect[3]) / 2 }; }", to)
            page.evaluate('q => EbbGame.walkTo(q)', q); place(to)

        def use(scene_id, spot_id):  # walk to a spot; the engine acts when she arrives
            sp = page.evaluate('a => EbbWorld.SCENES[a[0]].spots.find(s => s.id === a[1])', [scene_id, spot_id])
            page.evaluate('sp => EbbGame.walkTo(sp.stand, { spot: sp })', sp); settle()

        def shot(label):
            if SHOTS:
                SHOTS.mkdir(parents=True, exist_ok=True); page.screenshot(path=str(SHOTS / f'{label}.png'))

        def basket():
            return page.evaluate('() => Object.assign({}, EbbGame.state().farm.basket)')

        def fish_count():
            return sum(v for k, v in basket().items() if k.startswith('fish'))

        place('merlion'); shot('01-merlion')
        through('jetty'); check('Merlion Park -> Bedok Jetty', True); shot('02-jetty')

        use('jetty', 'fishing'); page.wait_for_selector('.world-sheet', timeout=15000)
        check('fishing sheet opens on the jetty', page.locator('.world-sheet h2').inner_text() == 'Fishing')
        check('she sits on the jetty edge to fish', page.evaluate('() => EbbGame.me().action') == 'sit' and page.evaluate('() => EbbGame.me().pose') == 'fish')
        page.wait_for_function('() => /nibble!/.test(document.getElementById("fishStatus").textContent)', timeout=8000)
        page.wait_for_timeout(400); page.click('#reelIn')
        status = page.locator('#fishStatus').inner_text()
        check('a fish is caught in the window: ' + status, 'caught' in status)
        check('the fish is in the basket', fish_count() == 1)
        shot('03-fishing')
        page.click('#castAgain'); page.wait_for_timeout(200); page.click('#reelIn')
        check('reeling too soon only lets it swim off', 'swam off' in page.locator('#fishStatus').inner_text() and fish_count() == 1)
        page.click('.world-sheet .btn:has-text("Done")'); page.wait_for_selector('.world-sheet', state='detached')
        page.wait_for_timeout(300); check('she stands and can walk again after fishing', page.evaluate('() => EbbGame.me().action') not in ('sit', 'work'))

        page.evaluate("() => EbbGame.enter('waterfall')"); place('waterfall')
        through('spring'); check('Little Guilin -> Sembawang hot spring', True); shot('04-spring')
        page.evaluate('() => { const f = EbbGame.state().farm; f.basket.egg = 1; EbbGame.api.save(); }')
        use('spring', 'soak'); page.wait_for_selector('.world-sheet', timeout=15000)
        check('soaking: she sits in the water, in the soak pose', page.evaluate('() => EbbGame.me().action') == 'sit' and page.evaluate('() => EbbGame.me().pose') == 'soak')
        check('she is inside the pool, not on its edge', page.evaluate('() => !EbbWorld.walkable("spring", EbbGame.me())'))
        page.click('#dropEgg')
        b2 = basket(); check('a spa egg made from the egg', b2.get('spaEgg') == 1 and b2.get('egg') == 0)
        page.wait_for_timeout(2600); shot('05-soak')
        page.click('#leaveSpring'); page.wait_for_selector('.world-sheet', state='detached')
        check('climbs out standing on the floor', page.evaluate('() => EbbGame.me().action') != 'sit' and page.evaluate('() => EbbWorld.walkable("spring", EbbGame.me())'))
        through('waterfall'); check('hot spring -> Little Guilin', True)

        use('waterfall', 'pond')
        page.wait_for_function('() => /Thank you for the/.test(document.getElementById("toast").textContent)', timeout=15000)
        toast = page.locator('#toast').inner_text()
        check('the lake thanks her by name: ' + toast, 'undefined' not in toast)
        shot('06-pond')
        check('no sideways scroll at 390 px', page.evaluate('() => document.documentElement.scrollWidth') <= 390)
        check('the scene fills the phone screen', page.evaluate('() => { const r = document.getElementById("scene").getBoundingClientRect(); return r.width >= 390 && r.height >= 844; }'))
        page.reload(); page.wait_for_function('window.EbbGame && window.EbbGame._ready')
        check('the basket survives a reload', page.evaluate('() => EbbGame.state().farm.basket.spaEgg') == 1)
        b.close()
    srv.shutdown()
    check('no console errors ' + json.dumps(errors[:3]), not errors)
    bad = [n for n, ok in checks if not ok]
    print(f'{len(checks) - len(bad)} passed, {len(bad)} failed')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
