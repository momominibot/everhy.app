#!/usr/bin/env python3
"""Headless phone check of the map at 390x844: smoke_map.py [base_url] [shot_prefix]. Serve the repo first, for example
python3 -m http.server 8107. Opens the map from the button and from More, checks pins, coming soon, travel, keys and
focus, and writes <prefix>_open.png and <prefix>_after.png when a prefix is given. Exits 1 on any failed check."""
import sys
from playwright.sync_api import sync_playwright

base = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8107/'
shots = sys.argv[2] if len(sys.argv) > 2 else None
fails = []


def check(name, ok):
    print(('ok   ' if ok else 'FAIL ') + name)
    if not ok:
        fails.append(name)


def boxes_overlap(a, b):
    return not (a['x'] + a['width'] <= b['x'] or b['x'] + b['width'] <= a['x'] or a['y'] + a['height'] <= b['y'] or b['y'] + b['height'] <= a['y'])


with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg = ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and '404' not in m.text else None)
    pg.goto(base)
    pg.evaluate('localStorage.clear()')
    pg.reload()
    pg.wait_for_function('window.EbbGame && EbbGame._ready')
    pg.wait_for_timeout(400)

    btn = pg.locator('#mapBtn')
    check('map button shows', btn.is_visible())
    b = btn.bounding_box()
    check('map button sits bottom right', b['x'] + b['width'] > 360 and b['y'] + b['height'] > 780)
    # every action label a spot can show stays clear of the button
    labels = pg.evaluate("Object.values(EbbWorld.SCENES).flatMap(s => s.spots.map(sp => sp.label)).concat(['Seeds are in the shed', 'Hoe the soil', 'Watered today', 'Slip into the warm water', 'Say hello to Clover'])")
    clear = True
    for text in labels:
        box = pg.evaluate("t => { const e = document.getElementById('prompt'); e.hidden = false; e.textContent = t; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }", text)
        if boxes_overlap(box, b):
            clear = False
            print('     overlaps:', text)
    pg.evaluate("document.getElementById('prompt').hidden = true")
    check('action labels stay clear of the map button', clear)

    before = pg.evaluate('({ x: EbbGame.me().x, y: EbbGame.me().y })')
    btn.click()
    pg.wait_for_timeout(250)
    check('map opens from the button', pg.locator('.map-wrap').is_visible())
    check('tapping the button does not walk her', pg.evaluate('EbbGame.me().action') != 'walk' and pg.evaluate('({ x: EbbGame.me().x, y: EbbGame.me().y })') == before)
    check('six pins', pg.locator('.map-pin').count() == 6)
    check('home is here', pg.get_attribute('.map-pin[data-pin=home]', 'class').find('is-here') >= 0)
    check('list marks her place', pg.get_attribute('.map-place[data-pin=home]', 'aria-current') == 'location')
    soon = [pid for pid in ['barn', 'spring', 'pier'] if 'is-soon' in pg.get_attribute(f'.map-pin[data-pin={pid}]', 'class')]
    registered = pg.evaluate("['barn', 'spring'].filter(id => !!EbbWorld.SCENES[id]).concat(EbbWorld.SCENES.waterfall.spots.some(s => s.id === 'fishing') ? ['pier'] : [])")
    check('missing places say coming soon', sorted(soon) == sorted(set(['barn', 'spring', 'pier']) - set(registered)))
    check('focus starts on Close', pg.evaluate("document.activeElement && document.activeElement.classList.contains('map-close')"))
    art = pg.locator('.map-art').bounding_box()
    check('map fits the phone width', art['x'] >= 0 and art['x'] + art['width'] <= 390 and art['width'] >= 300)
    pins_in = pg.evaluate("[...document.querySelectorAll('.map-pin')].every(e => { const r = e.getBoundingClientRect(), a = document.querySelector('.map-art').getBoundingClientRect(); return r.left >= a.left - 2 && r.right <= a.right + 2 && r.top >= a.top - 2 && r.bottom <= a.bottom + 2; })")
    check('pins and labels stay inside the map', pins_in)
    labels_apart = pg.evaluate("(() => { const r = [...document.querySelectorAll('.map-pin')].map(e => e.getBoundingClientRect()); return r.every((a, i) => r.every((b, j) => j <= i || a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top)); })()")
    check('pins do not cover each other', labels_apart)
    if shots:
        pg.screenshot(path=f'{shots}_open.png')

    # keys stay in the sheet: arrows do not walk her
    pg.keyboard.press('ArrowLeft')
    pg.wait_for_timeout(300)
    check('arrow keys do not walk her behind the map', pg.evaluate('({ x: EbbGame.me().x, y: EbbGame.me().y })') == before)
    for pid in soon:
        pg.click(f'.map-pin[data-pin={pid}]')
        pg.wait_for_timeout(150)
    check('coming soon pins do nothing', pg.locator('.map-wrap').count() == 1 and pg.evaluate('EbbGame.api.scene()') == 'bedroom')

    pg.click('.map-pin[data-pin=farm]')
    check('the sheet closes first', pg.locator('.map-wrap').count() == 0)
    pg.wait_for_timeout(700)
    check('travel reaches the farm', pg.evaluate('EbbGame.api.scene()') == 'farm' and pg.inner_text('#place') == 'Farm')
    check('the fade is over', not pg.evaluate("document.getElementById('scene').classList.contains('fading')"))
    check('focus returns to the map button', pg.evaluate("document.activeElement && document.activeElement.id === 'mapBtn'"))
    check('the page behind is usable again', not pg.evaluate("document.querySelector('.app').inert"))
    if shots:
        pg.screenshot(path=f'{shots}_after.png')

    # from the More menu, close with Escape, then travel from the list
    pg.click('#moreBtn')
    pg.click('#panel-map')
    pg.wait_for_timeout(200)
    check('map opens from More', pg.locator('.map-wrap').is_visible())
    check('farm is now here', 'is-here' in pg.get_attribute('.map-pin[data-pin=farm]', 'class'))
    pg.keyboard.press('Escape')
    check('Escape closes', pg.locator('.map-wrap').count() == 0)
    btn.click()
    pg.click('.map-place[data-pin=waterfall]')
    pg.wait_for_timeout(700)
    check('travel from the list', pg.evaluate('EbbGame.api.scene()') == 'waterfall')
    btn.click()
    pg.click('.map-place[data-pin=waterfall]')
    pg.wait_for_timeout(200)
    check('her own place just closes the map', pg.locator('.map-wrap').count() == 0 and pg.evaluate('EbbGame.api.scene()') == 'waterfall')

    # reduced motion: no fade, she moves at once
    pg.evaluate("document.documentElement.setAttribute('data-motion', 'reduce')")
    btn.click()
    pg.click('.map-pin[data-pin=home]')
    check('reduced motion travels at once', pg.evaluate('EbbGame.api.scene()') == 'bedroom')
    pg.evaluate("document.documentElement.removeAttribute('data-motion')")

    check('no page errors', not errs)
    if errs:
        print('     ', errs)
    br.close()

print(f'{len(fails)} failed')
sys.exit(1 if fails else 0)
