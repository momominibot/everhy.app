#!/usr/bin/env python3
"""Ebb bag browser smoke: headless Chromium at 390x844 against this repo on a spare localhost port.

Run: python3 tools/smoke_bag.py [--shots DIR] [--headed]

A returning player (first-run welcome already skipped) on the farm with seeds, a basket and the moon pearl. Checks that
the Bag button sits clear of the other controls, the sheet opens with every kind and the seeded counts, an item opens its
detail with a line on what it is for, Plant from the bag plants a seed through the engine, an empty bag still shows a
line per kind, and the pond action at the waterfall offers through the engine. Nothing leaves the machine."""
import argparse, functools, http.server, json, socket, sys, threading
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
W, H = 390, 844


class Quiet(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.webmanifest': 'application/manifest+json', '.webp': 'image/webp', '.js': 'text/javascript'}

    def log_message(self, *a):
        pass


def serve():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, port


def overlap(a, b):
    return a['x'] < b['x'] + b['width'] and b['x'] < a['x'] + a['width'] and a['y'] < b['y'] + b['height'] and b['y'] < a['y'] + a['height']


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--shots'); ap.add_argument('--headed', action='store_true')
    args = ap.parse_args()
    shots = Path(args.shots) if args.shots else None
    if shots:
        shots.mkdir(parents=True, exist_ok=True)
    beds = [{"state": "grass", "crop": None, "watered": []} for _ in range(6)]
    save = {"v": 1, "scene": "farm", "pos": None, "outfit": None, "observations": [], "pond": {"offerings": 0, "gift": True},
            "safety": {"onboardSkippedAt": "2026-10-22T08:00:00Z"},
            "farm": {"beds": beds, "seedDay": None, "seedsLeft": 0, "basket": {"turnip": 1, "egg": 1}, "seeds": {"turnip": 2, "carrot": 1}}}
    httpd, port = serve()
    base = f'http://127.0.0.1:{port}/'
    errors, results, blocked = [], [], []

    def check(name, ok, detail=''):
        results.append((name, bool(ok)))
        print(('ok   ' if ok else 'FAIL ') + name + ('' if ok or not detail else f': {detail}'), flush=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not args.headed)
        ctx = browser.new_context(viewport={'width': W, 'height': H}, device_scale_factor=2)
        ctx.add_init_script("if (!sessionStorage.getItem('seeded')) { localStorage.setItem('ebb_save_v1', %s); sessionStorage.setItem('seeded', '1'); }" % json.dumps(json.dumps(save)))

        def gate(route):
            host = urlparse(route.request.url).hostname
            if host in ('127.0.0.1', 'localhost'):
                route.continue_()
            else:
                blocked.append(route.request.url); route.abort()
        ctx.route('**/*', gate)
        page = ctx.new_page()

        def on_console(m):  # other workstreams' entry files or art may be missing on this branch; the bag's own must not be
            url = (m.location or {}).get('url', '')
            if m.type == 'error' and not ('/ext/' in url and 'bag' not in url) and 'data.gov.sg' not in m.text + url:  # the live weather fetch is blocked offline here, by design
                errors.append(m.text + ' ' + url)
        page.on('console', on_console)
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(base + 'index.html', wait_until='load')
        page.wait_for_function('window.EbbGame && EbbGame._ready === true && window.EbbBag && window.EbbItems')
        page.wait_for_function("() => document.getElementById('plate').complete && document.getElementById('plate').naturalWidth > 0")
        js = page.evaluate

        def idle():
            page.wait_for_function("() => { const m = EbbGame.me(); return m.action === 'idle' || m.action === 'sit'; }")
            page.wait_for_timeout(120)

        # ---------- the button ----------
        btn = page.locator('#bagBtn')
        check('Bag button on the scene', btn.is_visible() and btn.get_attribute('aria-haspopup') == 'dialog')
        bb = btn.bounding_box()
        check('button inside the phone screen', bb and bb['x'] >= 0 and bb['y'] >= 0 and bb['x'] + bb['width'] <= W and bb['y'] + bb['height'] <= H, str(bb))
        for other in ('#soundBtn', '#mapBtn', '#prompt', '.hint', '.top'):
            loc = page.locator(other)
            if loc.count() and loc.first.is_visible():
                ob = loc.first.bounding_box()
                check(f'button clear of {other}', not overlap(bb, ob), f'{bb} vs {ob}')
        check('button beside the sound toggle', page.locator('#soundBtn').count() == 0 or abs(page.locator('#soundBtn').bounding_box()['x'] - bb['x']) < 12)
        check('More menu has a Bag entry', page.locator('#panel-bag').count() == 1)
        if shots:
            page.screenshot(path=str(shots / 'bag-button-390.png'))

        # ---------- the sheet ----------
        btn.click()
        page.wait_for_selector('.bag-sheet .bag-grid')
        check('sheet opens with a dialog', js("() => !!document.querySelector('.bag-sheet .sheet[role=dialog]')"))
        check('button says it is expanded', btn.get_attribute('aria-expanded') == 'true')
        check('sheet fits the width', js("() => document.querySelector('.bag-sheet .sheet').getBoundingClientRect().width") <= W and js('() => document.scrollingElement.scrollWidth') <= W)
        heads = js("() => [...document.querySelectorAll('.bag-kind h3')].map(h => h.textContent)")
        check('every kind has a heading, in order', heads == ['Seeds', 'From the farm', 'Finds', 'Gifts', 'Tools'], str(heads))
        cells = js("() => [...document.querySelectorAll('.bag-item')].map(b => [b.dataset.id, b.querySelector('.bag-name').textContent, b.querySelector('.bag-count').textContent])")
        check('seeded items listed with counts', cells == [['seed-turnip', 'Turnip seed', '2'], ['seed-carrot', 'Carrot seed', '1'], ['turnip', 'Turnip', '1'], ['egg', 'Egg', '1'], ['moonPearl', 'Moon pearl', '1']], str(cells))
        check('total in the heading', page.locator('.bag-total').inner_text() == '6 things')
        check('a long bag opens at its title, not scrolled to the end', js("() => document.querySelector('.bag-sheet .sheet').scrollTop") == 0 and js("() => document.getElementById('bagTitle').getBoundingClientRect().top") >= 0)
        check('an empty kind shows its line, not a blank', page.locator('.bag-kind[data-kind=tool] .bag-empty').inner_text().startswith('No tools yet'))
        check('crop and find icons are clay pictures', js("() => ['turnip', 'egg'].every(id => !!document.querySelector('.bag-item[data-id=' + id + '] .bag-ico image'))"))
        imgs = js("""async () => { const out = {}; for (const im of document.querySelectorAll('.bag-sheet .bag-ico image')) {
            const href = im.getAttribute('href'); if (href in out) continue; out[href] = (await fetch(href)).ok; } return out; }""")
        check('every icon picture is served', imgs and all(imgs.values()), str(imgs))
        if shots:
            page.screenshot(path=str(shots / 'bag-390.png'))

        # ---------- detail and Back ----------
        page.click('.bag-item[data-id=seed-turnip]')
        page.wait_for_selector('.bag-detail')
        check('detail names the item and the count', page.locator('.bag-detail h3').inner_text() == 'Turnip seed' and page.locator('.bag-held').inner_text() == 'You have 2.')
        check('detail says what it is for', 'hoed bed' in page.locator('.bag-use').inner_text())
        check('Plant offered on the farm', page.locator('#bagAct-plant').count() == 1)
        if shots:
            page.screenshot(path=str(shots / 'bag-detail-390.png'))
        page.click('#bagBack')
        page.wait_for_selector('.bag-grid')
        check('Back returns to the grid', page.locator('.bag-item').count() == 5)
        page.click('.bag-item[data-id=egg]')
        page.wait_for_selector('.bag-detail')
        check('a find away from the pond has a where-to line and no action', page.locator('.sheet-actions .btn.primary').count() == 0 and 'pond' in page.locator('.bag-note').inner_text())
        page.keyboard.press('Escape')
        check('Escape closes the sheet', page.locator('.bag-sheet').count() == 0 and btn.get_attribute('aria-expanded') == 'false')
        check('she did not move while the sheet was open', js("() => EbbGame.me().action") == 'idle')

        # ---------- Plant from the bag goes through the engine ----------
        js("() => { EbbFarm.act(EbbGame.state().farm, 0, EbbStore.today()); EbbGame.api.save(); EbbGame.api.refresh(); }")  # hoe bed 0
        check('bed 0 waits for a seed', js("() => EbbFarm.nextAction(EbbGame.state().farm, 0, EbbStore.today())") == 'plant')
        page.click('#moreBtn'); page.click('#panel-bag')
        page.wait_for_selector('.bag-grid')
        page.click('.bag-item[data-id=seed-turnip]')
        page.click('#bagAct-plant')
        check('the sheet closes and she walks', page.locator('.bag-sheet').count() == 0)
        page.wait_for_function("() => EbbFarm.nextAction(EbbGame.state().farm, 0, EbbStore.today()) === 'water'", timeout=15000)
        idle()
        st = js('() => ({ seeds: EbbGame.state().farm.seeds, bed: EbbGame.state().farm.beds[0] })')
        check('a seed was planted by the farm rules', st['bed']['state'] == 'planted' and st['seeds']['turnip'] == 1, str(st))
        check('toast tells her', 'Planted' in page.locator('#toast').inner_text())
        btn.click(); page.wait_for_selector('.bag-grid')
        check('the bag shows the new count at once', js("() => document.querySelector('.bag-item[data-id=seed-turnip] .bag-count').textContent") == '1')
        page.click('#bagDone')
        check('Done closes', page.locator('.bag-sheet').count() == 0)

        # ---------- empty bag ----------
        js("() => { const s = EbbGame.state(); s.farm.seeds = {}; s.farm.basket = {}; s.pond.gift = false; s.bag = {}; EbbGame.api.save(); EbbGame.api.refresh(); }")
        btn.click(); page.wait_for_selector('.bag-sheet')
        empties = js("() => [...document.querySelectorAll('.bag-kind')].map(k => !!k.querySelector('.bag-empty'))")
        check('an empty bag shows a line for every kind', empties == [True] * 5 and page.locator('.bag-item').count() == 0 and page.locator('.bag-total').inner_text() == 'Nothing yet', str(empties))
        if shots:
            page.screenshot(path=str(shots / 'bag-empty-390.png'))
        page.click('#bagDone')

        # ---------- the pond action at the waterfall ----------
        js("() => { const s = EbbGame.state(); s.farm.basket = { turnip: 1, egg: 2 }; EbbGame.api.save(); EbbGame.api.enter('waterfall'); EbbGame.api.refresh(); }")
        page.wait_for_function("() => EbbGame.state().scene === 'waterfall'")
        page.wait_for_timeout(700)
        btn.click(); page.wait_for_selector('.bag-grid')
        page.click('.bag-item[data-id=turnip]')
        page.wait_for_selector('.bag-detail')
        check('pond action offered at the waterfall', page.locator('#bagAct-offer').count() == 1)
        check('it says which item the Goddess takes first', 'egg goes first' in page.locator('.bag-note').inner_text())
        page.click('#bagAct-offer')
        page.wait_for_function('() => EbbGame.state().pond.offerings === 1', timeout=15000)
        page.wait_for_function("() => document.getElementById('toast').textContent.startsWith('The Goddess')")
        check('an offering was made through the engine', js('() => EbbGame.state().pond.offerings') == 1 and js('() => EbbGame.state().farm.basket.egg') == 1)
        idle()

        check('no console or page errors', not errors, ' | '.join(errors[:3]))
        browser.close()
    httpd.shutdown()
    if blocked:
        print('note: blocked non-local requests:', len(blocked))
    ok = sum(1 for _, r in results if r)
    print(f'{ok} passed, {len(results) - ok} failed')
    sys.exit(0 if ok == len(results) else 1)


if __name__ == '__main__':
    main()
