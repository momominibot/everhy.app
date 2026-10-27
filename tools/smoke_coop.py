#!/usr/bin/env python3
"""Headless walk through the chicken coop at 390x844: Garden -> Chicken coop (the hens laid overnight, collect the
eggs into the basket) -> Garden -> Little Guilin -> Sembawang hot spring (throw one coop egg in to cook) -> back.
Walks through the real doors and to spots as a tap would. Serves the repo on a spare port, fails on any console
error. Run: python3 tools/smoke_coop.py [shots_dir]"""
import datetime, functools, http.server, json, os, socket, sys, threading
from pathlib import Path
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', os.path.expanduser('~/Library/Application Support/ms-playwright'))
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
            "safety": {"onboardSkippedAt": "2026-10-22T08:00:00"},
            "farm": {"beds": beds, "seedDay": None, "seedsLeft": 0, "basket": {}, "seeds": {}, "coop": {"day": yesterday, "laid": 0, "collected": 0}},
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
        def on_console(m):
            url = (m.location or {}).get('url', '')
            if m.type == 'error' and not ('/ext/' in url and 'coop' not in url and 'world' not in url):
                errors.append(m.text + ' ' + url)
        page.on('console', on_console)
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(f'http://127.0.0.1:{port}/index.html')
        page.wait_for_function('window.EbbGame && window.EbbGame._ready && window.EbbWorldRules')
        page.evaluate("document.querySelectorAll('.sheet-wrap:not(.world-wrap), .routines-card').forEach(w => w.remove())")

        def settle():
            page.wait_for_timeout(350); page.wait_for_function("() => EbbGame.me().action !== 'walk'", timeout=20000); page.wait_for_timeout(150)

        def name(sid):
            return page.evaluate('s => EbbWorld.SCENES[s].name', sid)

        def place(sid, t=15000):
            page.wait_for_function('n => document.getElementById("place").textContent === n', arg=name(sid), timeout=t)
            page.wait_for_timeout(650)

        def through(to):
            q = page.evaluate("t => { const d = EbbWorld.SCENES[EbbGame.api.scene()].doors.find(d => d.to === t); return { x: (d.rect[0] + d.rect[2]) / 2, y: (d.rect[1] + d.rect[3]) / 2 }; }", to)
            page.evaluate('q => EbbGame.walkTo(q)', q); place(to)

        def use(scene_id, spot_id):
            sp = page.evaluate('a => EbbWorld.SCENES[a[0]].spots.find(s => s.id === a[1])', [scene_id, spot_id])
            page.evaluate('sp => EbbGame.walkTo(sp.stand, { spot: sp })', sp); settle()

        def shot(label):
            if SHOTS:
                SHOTS.mkdir(parents=True, exist_ok=True); page.screenshot(path=str(SHOTS / f'{label}.png'))

        def basket():
            return page.evaluate('() => Object.assign({}, EbbGame.state().farm.basket)')

        place('farm'); check('starts in the Garden', True)
        check('the garden has a signpost to the hens', page.locator('.coop-sign').count() == 1)
        shot('01-garden')

        # new day: force all three hens to lay with fixed rolls (each roll under the 0.75 chance)
        laid = page.evaluate("""() => {
          const day = EbbGame.api.today();
          const n = EbbWorldRules.coopAvailable(EbbGame.state().farm, day, [0.1, 0.1, 0.1]);
          return n;
        }""")
        check('on the new day the three hens have laid: ' + str(laid), laid == 3)

        use('farm', 'toCoop'); place('coop'); check('Garden -> Chicken coop', True); shot('02-coop')
        use('coop', 'coop'); page.wait_for_selector('.world-sheet', timeout=15000)
        check('collect sheet opens', page.locator('.world-sheet h2').inner_text() == 'Chicken coop')
        check('it reports the eggs waiting', '3 eggs wait' in page.locator('.world-sheet .sheet-body').inner_text())
        page.click('#collectEggs')
        page.wait_for_selector('.world-sheet .btn:has-text("Leave the coop")')
        body = page.locator('.world-sheet .sheet-body').inner_text()
        check('collected: the eggs are in the basket, grammar right', '3 eggs are in your basket. They will cook soft' in body)
        b1 = basket()
        check('basket holds 3 eggs', b1.get('egg') == 3)
        shot('03-collected')
        page.click('.world-sheet .btn:has-text("Leave the coop")'); page.wait_for_selector('.world-sheet', state='detached')

        # the box is empty now until the next morning
        use('coop', 'coop'); page.wait_for_selector('.world-sheet', timeout=15000)
        check('the nesting box is empty after collecting', 'empty' in page.locator('.world-sheet .sheet-body').inner_text())
        page.click('.world-sheet .btn.primary'); page.wait_for_selector('.world-sheet', state='detached')
        through('farm'); check('Chicken coop -> Garden', True)

        # cook one coop egg at the hot spring
        page.evaluate("() => EbbGame.enter('waterfall')"); place('waterfall')
        through('spring'); check('Little Guilin -> Sembawang hot spring', True)
        use('spring', 'egg')
        page.click('#throwEgg'); page.wait_for_timeout(2200)
        b2 = basket()
        check('a coop egg thrown in cooks spa-soft', b2.get('spaEgg') == 1 and b2.get('egg') == 2)
        shot('04-cooked')
        page.click('.world-sheet .btn:has-text("Done")'); page.wait_for_selector('.world-sheet', state='detached')
        check('no sideways scroll at 390 px', page.evaluate('() => document.documentElement.scrollWidth') <= 390)
        b.close()
    srv.shutdown()
    check('no console errors ' + json.dumps(errors[:3]), not errors)
    bad = [n for n, ok in checks if not ok]
    print(f'{len(checks) - len(bad)} passed, {len(bad)} failed')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
