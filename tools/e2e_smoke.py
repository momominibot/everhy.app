#!/usr/bin/env python3
"""Ebb browser smoke test: headless Chromium at 390x844 against this repo served on a spare localhost port.

Run: python3 tools/e2e_smoke.py [--shots DIR] [--only name,name] [--headed]

Each check is one function `check_<name>(page, ctx)` listed in CHECKS. They run in order on one page and share its
state (she walks from the bedroom to the farm to the waterfall and back). Another workstream adds its panel by
writing a function and appending it to CHECKS (or inserting it where its state is needed). A failing check is
reported and the rest still run. Every request outside localhost is aborted, and nothing calls a model."""
import argparse, functools, http.server, json, socket, sys, threading, time, traceback
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
W, H = 390, 844
OPTIONAL = ('/js/ext/', '/css/ext/')  # each workstream's entry file; a missing one is harmless by design


# ---------- helpers other checks can reuse ----------
def tap(page, x, y):
    """Tap the scene at x, y in scene percent."""
    box = page.locator('#scene').bounding_box()
    page.mouse.click(box['x'] + box['width'] * x / 100, box['y'] + box['height'] * y / 100)


def js(page, expr):
    return page.evaluate(expr)


def wait(page, expr, timeout=8000):
    page.wait_for_function(expr, timeout=timeout)


def idle(page):
    """Wait until she is standing still (not walking or working) so the next tap is taken."""
    wait(page, "() => { const m = EbbGame.me(); return m.action === 'idle' || m.action === 'sit'; }")
    page.wait_for_timeout(120)


def arrive(page, scene_id):
    """Wait for a door to finish: taps are ignored for 600 ms after a door, while the scene fades."""
    wait(page, f"() => EbbGame.state().scene === '{scene_id}'")
    page.wait_for_timeout(700)
    idle(page)


def next_bed_action(page, i=0):
    return js(page, f"() => EbbFarm.nextAction(EbbGame.state().farm, {i}, EbbStore.today())")


def open_panel(page, panel_id):
    page.click('#moreBtn')
    page.click(f'#panel-{panel_id}')


def download(page, selector):
    with page.expect_download() as d:
        page.click(selector)
    return Path(d.value.path()).read_bytes().decode('utf-8'), d.value.suggested_filename  # bytes: keep CRLF as written


# ---------- checks ----------
def check_first_load(page, ctx):
    wait(page, '() => window.EbbGame && EbbGame._ready === true')
    wait(page, "() => document.getElementById('plate').complete && document.getElementById('plate').naturalWidth > 0")
    assert js(page, '() => EbbGame.state().scene') == 'bedroom'
    assert js(page, '() => document.scrollingElement.scrollWidth') <= W, 'page scrolls sideways at 390 px'
    assert js(page, "() => !!document.querySelector('link[rel=manifest]')"), 'no manifest link'
    assert not page.locator('#moreMenu').is_visible(), 'the More menu shows before it is opened'


def check_tap_to_walk(page, ctx):
    before = js(page, '() => ({ x: EbbGame.me().x, y: EbbGame.me().y })')
    tap(page, 30, 86)
    wait(page, "() => EbbGame.me().action === 'walk'")
    idle(page)
    me = js(page, '() => ({ x: EbbGame.me().x, y: EbbGame.me().y })')
    assert abs(me['x'] - 30) < 2 and abs(me['y'] - 86) < 2, f'she stopped at {me}, from {before}'


def check_bedroom_door_to_farm(page, ctx):
    tap(page, 90, 73)
    arrive(page, 'farm')
    assert js(page, "() => document.getElementById('place').textContent") == 'Farm'


def check_shed_seed(page, ctx):
    tap(page, 25, 58)
    wait(page, "() => Number(document.getElementById('hudSeeds').textContent) >= 1")
    idle(page)


def check_bed_hoe_plant_water(page, ctx):
    assert next_bed_action(page) == 'hoe', next_bed_action(page)
    for want_after in ('plant', 'water', 'done'):
        tap(page, 40, 75)
        wait(page, f"() => EbbFarm.nextAction(EbbGame.state().farm, 0, EbbStore.today()) === '{want_after}'")
        idle(page)
    assert js(page, '() => EbbGame.state().farm.beds[0].watered.length') == 1


def check_waterfall_offering(page, ctx):
    # a crop only ripens overnight, so the basket is filled directly for this run
    js(page, "() => { EbbGame.state().farm.basket.turnip = 1; EbbGame.api.save(); EbbGame.api.refresh(); }")
    tap(page, 96, 73)
    arrive(page, 'waterfall')
    tap(page, 60, 62)
    wait(page, '() => EbbGame.state().pond.offerings === 1')
    wait(page, "() => document.getElementById('toast').textContent.startsWith('The Goddess')")
    assert js(page, "() => !!document.querySelector('#fx .goddess')"), 'no Goddess shown'
    idle(page)


def check_walk_home(page, ctx):
    tap(page, 4, 77)
    arrive(page, 'farm')
    tap(page, 4, 86)
    arrive(page, 'bedroom')


def check_wardrobe_change(page, ctx):
    before = js(page, '() => EbbGame.state().outfit.top')
    page.click('#wardrobeBtn')
    swatches = page.locator('.sheet .choice').first.locator('.swatch')
    for i in range(swatches.count()):
        if swatches.nth(i).get_attribute('aria-pressed') != 'true':
            swatches.nth(i).click()
            break
    page.get_by_role('button', name='Wear this').click()
    after = js(page, '() => EbbGame.state().outfit.top')
    assert after != before, 'top did not change'
    saved = js(page, "() => JSON.parse(localStorage.getItem(EbbStore.KEY)).outfit.top")
    assert saved == after, 'outfit not saved'


def check_practice_start_and_end(page, ctx):
    tap(page, 56, 84)
    page.get_by_role('button', name='Begin').click()
    wait(page, "() => document.querySelector('.run .clock') && document.querySelector('.run .clock').textContent.length > 0")
    page.wait_for_timeout(2200)
    page.get_by_role('button', name='End').click()
    page.get_by_role('button', name='Save', exact=True).click()
    obs = js(page, '() => EbbGame.state().observations')
    assert len(obs) == 1 and obs[0]['status'] == 'partial' and obs[0]['source'] == 'cushion', obs
    assert obs[0]['activeSec'] >= 1
    idle(page)


def check_settings_panel(page, ctx):
    open_panel(page, 'settings')
    page.wait_for_selector('.settings')
    width = js(page, "() => document.querySelector('.settings').getBoundingClientRect().width")
    assert width <= W, f'panel is {width} px wide'
    assert js(page, '() => document.scrollingElement.scrollWidth') <= W
    assert page.locator('.settings .draft').inner_text().lower().startswith('draft')
    if ctx.get('shots'):
        page.screenshot(path=str(Path(ctx['shots']) / 'settings-390.png'), full_page=False)


def check_settings_exports(page, ctx):
    text, name = download(page, '[data-x="json"]')
    data = json.loads(text)
    assert name.startswith('ebb-export-') and data['app'] == 'Ebb' and len(data['save']['observations']) == 1
    text, name = download(page, '[data-x="csv"]')
    rows = [r for r in text.split('\r\n') if r]
    assert name.endswith('.csv') and rows[0].startswith('id,type,date') and len(rows) == 2, rows
    text, name = download(page, '[data-x="fhir"]')
    b = json.loads(text)
    kinds = sorted(e['resource']['resourceType'] for e in b['entry'])
    assert b['resourceType'] == 'Bundle' and kinds == ['Observation', 'Provenance'], kinds


def check_settings_prefs(page, ctx):
    page.locator('[data-pref="textSize"] [data-v="larger"]').click()
    page.locator('[data-pref="motion"] [data-v="reduce"]').click()
    page.locator('[data-pref="nudgesPerDay"] [data-v="0"]').click()
    page.fill('[data-time="quietFrom"]', '22:30')
    page.locator('[data-time="quietFrom"]').dispatch_event('change')
    assert js(page, '() => document.documentElement.dataset.text') == 'larger'
    assert js(page, '() => document.documentElement.dataset.motion') == 'reduce'
    p = js(page, "() => JSON.parse(localStorage.getItem(EbbStore.KEY)).prefs")
    assert p['textSize'] == 'larger' and p['motion'] == 'reduce' and p['nudgesPerDay'] == 0 and p['quietFrom'] == '22:30', p
    assert js(page, '() => EbbSettings.mayNudge(new Date(2026, 9, 22, 12, 0))') is False
    assert js(page, '() => document.scrollingElement.scrollWidth') <= W, 'larger text scrolls sideways'
    if ctx.get('shots'):
        page.screenshot(path=str(Path(ctx['shots']) / 'settings-larger-390.png'))
    page.get_by_role('button', name='Done').click()
    page.reload()
    wait(page, '() => window.EbbGame && EbbGame._ready === true')
    wait(page, "() => document.documentElement.dataset.text === 'larger'")


def check_offline_play(page, ctx):
    wait(page, '() => navigator.serviceWorker && navigator.serviceWorker.controller !== null', 15000)
    page.context.set_offline(True)
    try:
        page.reload()
        wait(page, '() => window.EbbGame && EbbGame._ready === true')
        wait(page, "() => document.getElementById('plate').complete && document.getElementById('plate').naturalWidth > 0")
        assert js(page, '() => EbbGame.state().observations.length') == 1
        assert js(page, "() => fetch('nothing-here-' + Date.now()).then(() => false, () => true)"), 'the network was still reachable'
    finally:
        page.context.set_offline(False)


def check_delete_everything(page, ctx):
    open_panel(page, 'settings')
    page.click('[data-x="delete"]')
    assert page.locator('.confirm').is_visible()
    page.click('[data-x="keep"]')
    assert not page.locator('.confirm').is_visible()
    assert js(page, '() => EbbGame.state().observations.length') == 1, 'first step must not delete'
    page.click('[data-x="delete"]')
    with page.expect_navigation():
        page.click('[data-x="really"]')
    wait(page, '() => window.EbbGame && EbbGame._ready === true')
    st = js(page, '() => ({ n: EbbGame.state().observations.length, pond: EbbGame.state().pond.offerings, prefs: EbbGame.state().prefs || null })')
    assert st['n'] == 0 and st['pond'] == 0, st
    assert js(page, "() => document.documentElement.dataset.text") == 'normal'
    saved = js(page, '() => localStorage.getItem(EbbStore.KEY)')
    assert saved is None or json.loads(saved)['observations'] == [], 'old save survived'


CHECKS = [check_first_load, check_tap_to_walk, check_bedroom_door_to_farm, check_shed_seed, check_bed_hoe_plant_water,
          check_waterfall_offering, check_walk_home, check_wardrobe_change, check_practice_start_and_end,
          check_settings_panel, check_settings_exports, check_settings_prefs, check_offline_play, check_delete_everything]


# ---------- runner ----------
class Quiet(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.webmanifest': 'application/manifest+json',
                      '.webp': 'image/webp', '.js': 'text/javascript'}

    def log_message(self, *a):
        pass


def serve():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, port


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--shots'); ap.add_argument('--only'); ap.add_argument('--headed', action='store_true')
    args = ap.parse_args()
    checks = [c for c in CHECKS if not args.only or c.__name__.replace('check_', '') in args.only.split(',')]
    httpd, port = serve()
    base = f'http://127.0.0.1:{port}/'
    errors, missing_optional, blocked = [], set(), []
    ctx = {'shots': args.shots, 'base': base}
    if args.shots:
        Path(args.shots).mkdir(parents=True, exist_ok=True)
    ok = 0
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not args.headed)
        context = browser.new_context(viewport={'width': W, 'height': H}, device_scale_factor=2, accept_downloads=True)

        def gate(route):
            host = urlparse(route.request.url).hostname
            if host in ('127.0.0.1', 'localhost'):
                route.continue_()
            else:
                blocked.append(route.request.url); route.abort()
        context.route('**/*', gate)
        page = context.new_page()
        page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
        page.on('console', lambda m: m.type == 'error' and errors.append(f'console: {m.text} @ {m.location.get("url", "")}'))
        page.on('response', lambda r: r.status == 404 and any(o in r.url for o in OPTIONAL) and missing_optional.add(urlparse(r.url).path))
        page.goto(base, wait_until='load')
        for c in checks:
            name = c.__name__.replace('check_', '')
            seen = len(errors)
            t0 = time.time()
            try:
                c(page, ctx)
                # missing optional entry files and the offline probe's own failed request are expected
                bad = [e for e in errors[seen:] if not (e.startswith('console: Failed to load resource')
                       and (any(m in e for m in missing_optional) or 'nothing-here-' in e))]
                if bad:
                    raise AssertionError('console errors: ' + ' | '.join(bad[:3]))
                ok += 1
                print(f'PASS {name} ({time.time() - t0:.1f}s)')
            except Exception as e:
                print(f'FAIL {name}: {e}')
                if not isinstance(e, AssertionError):
                    traceback.print_exc(limit=2)
                if args.shots:
                    page.screenshot(path=str(Path(args.shots) / f'fail-{name}.png'))
        browser.close()
    httpd.shutdown()
    if missing_optional:
        print('note: optional extension files not on this branch:', ', '.join(sorted(missing_optional)))
    if blocked:
        print('note: blocked non-local requests:', len(blocked))
    print(f'{ok} passed, {len(checks) - ok} failed')
    sys.exit(0 if ok == len(checks) else 1)


if __name__ == '__main__':
    main()
