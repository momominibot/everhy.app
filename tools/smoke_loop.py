#!/usr/bin/env python3
"""The whole food loop in a headless browser at 390 px, on a free local port; no outside network:
hearts in the ledger -> buy rice and an egg at the provision stall in the hawker centre -> cook egg fried rice on the hob
at home (20 s real time) -> the dish waits in the bag as Ready to eat -> sit at the kitchen table, Eat slowly, stay
20 s, stop -> the dish is eaten and a finished-or-partial practice is saved. Also: a quiet wish takes nothing.
Zero console errors."""
import http.server, socketserver, threading, functools, os
from pathlib import Path
_pw = os.path.expanduser('~/Library/Application Support/ms-playwright')
if os.path.isdir(_pw): os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', _pw)
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
fails, passes = [], 0
def check(name, ok, extra=''):
    global passes
    if ok: passes += 1; print('ok  ', name)
    else: fails.append(name); print('FAIL', name, extra)

with sync_playwright() as p:
    br = p.chromium.launch(); pg = br.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and '404' not in m.text and 'ERR_FAILED' not in m.text else None)  # ERR_FAILED: the outside requests this test blocks (live weather)
    pg.route('**/*', lambda r: r.continue_() if r.request.url.startswith(f'http://127.0.0.1:{port}') else r.abort())
    pg.goto(f'http://127.0.0.1:{port}/index.html?time=14:00'); pg.wait_for_function('window.EbbGame && EbbGame._ready')
    pg.evaluate("localStorage.clear()")
    pg.evaluate("""() => { const s = EbbGame.state(); s.safety = Object.assign({}, s.safety, { onboardedAt: '2026-10-22T08:00:00Z', onboardVersion: (window.EbbSafetyUi && EbbSafetyUi.ONBOARD_VERSION) || 'onboard-2026-10-22.1' });
      s.points = { entries: [{ id: 'log:seed', date: '2026-10-20', source: 'log', n: 40 }] }; s.farm.basket = {}; EbbGame.api.save(); }""")
    pg.reload(); pg.wait_for_function('window.EbbGame && EbbGame._ready && window.EbbGrocerRules && window.EbbKitchen'); pg.wait_for_timeout(600)
    clean = "() => document.querySelectorAll('.routine-wrap,.sheet-wrap:not(.grocer-wrap):not(.seat-wrap)').forEach(e => e.remove())"
    pg.evaluate(clean)
    hearts = lambda: pg.evaluate("() => EbbDomeRules.balance(EbbGame.state().points)")
    check('she starts with 40 hearts', hearts() == 40, str(hearts()))

    # the provision stall
    pg.evaluate("EbbGame.enter('hawker')"); pg.wait_for_timeout(900); pg.evaluate(clean)
    pg.evaluate("() => EbbGame.act({ spot: EbbWorld.SCENES.hawker.spots.find(s => s.id === 'provisions') })")
    pg.wait_for_selector('.grocer-sheet')
    names = pg.evaluate("() => [...document.querySelectorAll('.grocer-item')].map(li => li.dataset.good)")
    check('the stall sells eggs, rice, ginger and chilli', names == ['egg', 'rice', 'ginger', 'chilli'], str(names))
    pg.click('#buy-rice'); pg.click('#buy-egg')
    b = pg.evaluate("() => Object.assign({}, EbbGame.state().farm.basket)")
    check('rice and an egg in the basket, 10 hearts spent', b.get('rice') == 1 and b.get('egg') == 1 and hearts() == 30, f'{b} {hearts()}')
    check('the sheet shows the new balance', pg.locator('#grocerHearts').inner_text() == '30')
    pg.keyboard.press('Escape'); pg.wait_for_selector('.grocer-sheet', state='detached')

    # cook at home
    pg.evaluate("EbbGame.enter('kitchen')"); pg.wait_for_timeout(900); pg.evaluate(clean)
    pg.evaluate("() => EbbGame.act({ spot: EbbWorld.SCENES.kitchen.spots.find(s => s.id === 'hob') })")
    pg.wait_for_selector('.kitchen-dish[data-recipe="eggFriedRice"]')
    check('egg fried rice can be made', pg.evaluate("() => !document.querySelector('.kitchen-dish[data-recipe=\"eggFriedRice\"]').disabled"))
    pg.click('.kitchen-dish[data-recipe="eggFriedRice"]')
    pg.wait_for_function("() => document.querySelector('#kitchenDone') || document.querySelector('#kitchenClose')", timeout=40000); pg.wait_for_timeout(300)
    check('rice and egg used, the dish waits in the bag', pg.evaluate("() => !EbbGame.state().farm.basket.rice && !EbbGame.state().farm.basket.egg && EbbBag.count(EbbGame.state(), 'dish-eggFriedRice') === 1"))
    check('the card says where it waits', 'ready to eat' in pg.locator('.kitchen-wrap').inner_text())
    pg.evaluate("() => { const b = document.querySelector('#kitchenDone') || document.querySelector('#kitchenClose'); if (b) b.click(); }"); pg.wait_for_timeout(300)

    # eat slowly at the table
    pg.evaluate("() => EbbGame.act({ spot: EbbWorld.SCENES.kitchen.spots.find(s => s.id === 'dining') })")
    pg.wait_for_function("() => EbbGame.me().action === 'sit'", timeout=8000); pg.wait_for_timeout(500)
    pg.locator('button:has-text("A mindful moment")').first.click(); pg.wait_for_selector('[data-action=eat]')
    pg.click('[data-action=eat]'); pg.wait_for_timeout(500)
    check('the practice names her dish', 'egg fried rice' in pg.locator('.seat-prompt').inner_text().lower())
    pg.wait_for_timeout(21500)
    pg.click('.seat-sheet [data-act="skip"]'); pg.wait_for_timeout(600)
    st = pg.evaluate("() => ({ ready: EbbBag.count(EbbGame.state(), 'dish-eggFriedRice'), eaten: EbbGame.state().kitchen.meals.filter(m => m.eaten).length, prac: (EbbGame.state().observations || []).filter(o => o.type === 'mindfulness' && o.practice === 'eat' || o.action === 'eat').length, obs: (EbbGame.state().observations || []).length })")
    check('the dish is eaten and the practice saved', st['ready'] == 0 and st['eaten'] == 1 and st['obs'] >= 1, str(st))

    # with nothing cooked, the table says so
    pg.locator('[data-action=eat]').click(); pg.wait_for_timeout(300)
    check('with nothing cooked, eating asks her to cook first', 'Cook something' in pg.locator('.seat-sheet').inner_text())
    check('no console or page errors', not errs, ' | '.join(errs[:3]))
    br.close()
srv.shutdown()
print(f'smoke_loop: {passes} passed, {len(fails)} failed')
raise SystemExit(1 if fails else 0)
