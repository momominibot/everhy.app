#!/usr/bin/env python3
"""Headless browser walk through the world extension at 390x844, full screen with the follow camera: farm -> barn (hens, cow) -> farm -> waterfall (fishing)
-> hot spring (soak, spa egg) -> waterfall (offer a barn item at the pond). Serves the repo on a spare port, seeds one
save, fails on any console error. Run: python3 tools/smoke_world.py [shots_dir]"""
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
    save = {"v": 1, "scene": "farm", "pos": None, "outfit": None, "observations": [], "pond": {"offerings": 0, "gift": False},
            "safety": {"onboardSkippedAt": "2026-10-22T08:00:00Z"},  # a returning player: the first-launch welcome is done
            "farm": {"beds": beds, "seedDay": None, "seedsLeft": 0, "basket": {}, "seeds": {}},
            "world": {"barn": {"animals": {"hen1": {"kind": "hen", "name": "Pip", "careDates": [yesterday], "careBase": 0,
                                                    "lastAct": "feed", "fed": [yesterday], "nest": 0, "milkDay": None}}}}}
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

        def tap(x, y, tries=8):
            # the camera shows part of the square stage: tap toward an off-screen target like a player exploring,
            # let her walk and the camera follow, then tap it once it is in view (clear of the top bar and button)
            W, H, top, bottom, side = 390, 844, 120, 76, 16
            start = page.locator('#place').inner_text()
            for _ in range(tries):
                if page.locator('#place').inner_text() != start:
                    return  # a step toward an edge door already walked her through it
                r = page.locator('#stage').bounding_box()
                units = page.evaluate('() => EbbWorld.units(EbbGame.state().scene)')  # tall plates run 0..175 down
                sx, sy = r['x'] + r['width'] * x / 100, r['y'] + r['height'] * y / units
                if side <= sx <= W - side and top <= sy <= H - bottom:
                    page.mouse.click(sx, sy); return
                page.mouse.click(min(max(sx, side + 12), W - side - 12), min(max(sy, top + 12), H - bottom - 12))
                page.wait_for_timeout(1400)
            if SHOTS:
                page.screenshot(path=str(SHOTS / 'stuck.png'))
            raise AssertionError(f'could not bring ({x}, {y}) into view; me=' + json.dumps(page.evaluate('() => EbbGame.me()')) +
                                 ' busy=' + str(page.evaluate('() => !!document.querySelector(".sheet-wrap")')))

        def place(name, t=15000):
            page.wait_for_function('n => document.getElementById("place").textContent === n', arg=name, timeout=t)
            page.wait_for_timeout(450)  # the engine ignores taps during the door fade

        def shot(name):
            if SHOTS:
                SHOTS.mkdir(parents=True, exist_ok=True); page.screenshot(path=str(SHOTS / f'{name}.png'))

        def basket():
            return page.evaluate('() => Object.assign({}, EbbGame.state().farm.basket)')

        place('Farm'); shot('01-farm')
        tap(3, 126); place('Barn'); page.wait_for_timeout(500); shot('02-barn')
        check('farm -> barn', True)

        tap(14, 100); page.wait_for_selector('.world-sheet', timeout=15000)
        check('hen sheet opens', page.locator('.world-sheet h2').inner_text() == 'Pip')
        page.click('#collectEgg'); check('egg from yesterday collected', basket().get('egg') == 1)
        page.click('#care-feed'); check('feeding counts once today', page.evaluate('() => EbbGame.state().world.barn.animals.hen1.careDates.length') == 2)
        shot('03-hen-sheet')
        page.click('.world-sheet .btn:has-text("Done")'); page.wait_for_selector('.world-sheet', state='detached')

        tap(28, 148); page.wait_for_selector('.world-sheet', timeout=15000)
        check('cow sheet opens', page.locator('.world-sheet h2').inner_text() == 'Mochi')
        check('no milk before care', page.locator('#milkCow').count() == 0)
        page.click('#care-brush'); page.click('#milkCow')
        check('milk after brushing', basket().get('milk') == 1)
        check('milk once a day', page.locator('#milkCow').count() == 0)
        page.click('.world-sheet .btn:has-text("Done")'); page.wait_for_timeout(300); shot('04-barn-after')

        tap(87, 89); place('Farm'); check('barn -> farm', True)
        tap(94, 145); place('Waterfall'); check('farm -> waterfall', True)

        tap(88, 80); page.wait_for_selector('.world-sheet', timeout=15000)
        check('fishing sheet opens', page.locator('.world-sheet h2').inner_text() == 'Fishing')
        page.wait_for_function('() => /nibble!/.test(document.getElementById("fishStatus").textContent)', timeout=8000)
        shot('05a-nibble'); page.wait_for_timeout(400); page.click('#reelIn')
        status = page.locator('#fishStatus').inner_text()
        check('a fish is caught in the window: ' + status, 'caught' in status)
        fish = sum(v for k, v in basket().items() if k.startswith('fish'))
        check('fish in the basket', fish == 1)
        shot('05-fishing')
        page.click('#castAgain'); page.wait_for_timeout(200); page.click('#reelIn')
        check('reeling too soon only lets it swim off', 'swam off' in page.locator('#fishStatus').inner_text()
              and sum(v for k, v in basket().items() if k.startswith('fish')) == 1)
        page.click('.world-sheet .btn:has-text("Done")'); page.wait_for_selector('.world-sheet', state='detached')
        page.wait_for_timeout(300); check('she can walk again after fishing', page.evaluate('() => EbbGame.me().action') != 'work')

        tap(97, 118); place('Hot spring'); page.wait_for_timeout(400); shot('06-spring')
        check('waterfall -> hot spring', True)
        tap(56, 72); page.wait_for_selector('.world-sheet', timeout=15000)
        check('soaking: she sits in the water', page.evaluate('() => EbbGame.me().action') == 'sit')
        page.click('#dropEgg')
        b2 = basket(); check('spa-boiled egg made from the egg', b2.get('spaEgg') == 1 and b2.get('egg') == 0)
        page.wait_for_timeout(2600); shot('07-soak')
        page.click('#leaveSpring'); page.wait_for_selector('.world-sheet', state='detached')
        check('climbs out standing', page.evaluate('() => EbbGame.me().action') != 'sit')
        tap(12, 163); place('Waterfall'); check('hot spring -> waterfall', True)

        page.evaluate('() => { const f = EbbGame.state().farm; f.basket = { milk: 2 }; }')
        tap(50, 93); page.wait_for_function('() => /Goddess/.test(document.getElementById("toast").textContent)', timeout=15000)
        toast = page.locator('#toast').inner_text()
        check('the pond names a barn item: ' + toast, 'milk' in toast and 'undefined' not in toast)
        shot('08-pond')
        check('no sideways scroll at 390 px', page.evaluate('() => document.documentElement.scrollWidth') <= 390)
        check('the scene fills the phone screen', page.evaluate('() => { const r = document.getElementById("scene").getBoundingClientRect(); return r.width >= 390 && r.height >= 844; }'))
        page.reload(); page.wait_for_function('window.EbbGame && window.EbbGame._ready')
        check('barn state survives a reload', page.evaluate('() => EbbGame.state().world.barn.animals.cow.milkDay') == today.isoformat())
        b.close()
    srv.shutdown()
    check('no console errors ' + json.dumps(errors[:3]), not errors)
    bad = [n for n, ok in checks if not ok]
    print(f'{len(checks) - len(bad)} passed, {len(bad)} failed')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
